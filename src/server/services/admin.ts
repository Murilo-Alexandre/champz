import { randomBytes, randomUUID } from "node:crypto";
import type { Db, DbOrTx } from "@/lib/db/prisma";
import type { GlobalRole } from "@/generated/prisma/client";
import { audit } from "./audit";
import { badRequest, conflict, forbidden, notFound } from "../errors";

export const SUPERADMIN_SETTING = "superadminUserId";

const publicUser = {
  id: true, name: true, email: true, username: true, displayUsername: true, image: true, role: true,
  banned: true, banReason: true, bannedAt: true, mustChangePassword: true, createdAt: true, updatedAt: true,
} as const;

/** Hash compatível com o Better Auth (mesmo algoritmo/configuração do login). */
async function hashPassword(password: string) {
  const { auth } = await import("../auth/auth");
  return (await auth.$context).password.hash(password);
}

export function generateTemporaryPassword() {
  return randomBytes(12).toString("base64url");
}

export async function getSuperadminId(db: DbOrTx): Promise<string | null> {
  return (await db.systemSetting.findUnique({ where: { key: SUPERADMIN_SETTING } }))?.value ?? null;
}

type Actor = { id: string; role: GlobalRole; isSuperadmin: boolean };

/** Ator com papel global mínimo; Superadmin reconhecido pelo ID persistido, não pelo e-mail. */
export async function requireSystemRole(db: DbOrTx, userId: string, min: "ADMIN" | "SUPERADMIN"): Promise<Actor> {
  const [user, superId] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, banned: true } }),
    getSuperadminId(db),
  ]);
  if (!user || user.banned) throw forbidden();
  const isSuperadmin = !!superId && superId === user.id && user.role === "SUPERADMIN";
  if (min === "SUPERADMIN" && !isSuperadmin) throw forbidden("Somente o Superadmin pode fazer isso");
  if (min === "ADMIN" && !isSuperadmin && user.role !== "ADMIN") throw forbidden("Área restrita a administradores");
  return { id: user.id, role: user.role, isSuperadmin };
}

/**
 * Hierarquia: ninguém gerencia o Superadmin por estas APIs (nem ele mesmo — usa os fluxos de perfil);
 * ADMIN só gerencia USER; ninguém age sobre si mesmo aqui.
 */
async function loadManageableTarget(db: DbOrTx, actor: Actor, targetId: string) {
  const target = await db.user.findUnique({ where: { id: targetId } });
  if (!target) throw notFound("Usuário");
  const superId = await getSuperadminId(db);
  if (target.id === superId || target.role === "SUPERADMIN") throw forbidden("A conta Superadmin é protegida");
  if (target.id === actor.id) throw forbidden("Use o seu perfil para alterar a própria conta");
  if (!actor.isSuperadmin && target.role !== "USER") throw forbidden("Administradores só gerenciam usuários comuns");
  return target;
}

async function revokeAllSessions(db: DbOrTx, userId: string) {
  const { count } = await db.session.deleteMany({ where: { userId } });
  return count;
}

function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

/** Cria conta com senha (usada pelo bootstrap e pela administração). Não passa pelo cadastro público. */
async function insertCredentialUser(
  db: DbOrTx,
  input: { name: string; email: string; username: string; role: GlobalRole; passwordHash: string; mustChangePassword: boolean; createdById: string | null },
) {
  const username = normalizeUsername(input.username);
  const email = input.email.trim().toLowerCase();
  const clash = await db.user.findFirst({ where: { OR: [{ email }, { username }] }, select: { email: true } });
  if (clash) throw conflict(clash.email === email ? "EMAIL_TAKEN" : "USERNAME_TAKEN", clash.email === email ? "E-mail já cadastrado" : "Nome de usuário em uso");
  const id = randomUUID();
  return db.user.create({
    data: {
      id, name: input.name.trim(), email, emailVerified: false, username, displayUsername: input.username.trim(),
      role: input.role, mustChangePassword: input.mustChangePassword, createdById: input.createdById,
      accounts: { create: { id: randomUUID(), accountId: id, providerId: "credential", password: input.passwordHash } },
    },
    select: publicUser,
  });
}

/** Uso exclusivo de scripts locais (seed/testes): cria USER com senha definida, sem passar por API. */
export async function provisionUserWithPassword(db: Db, input: { name: string; email: string; username: string; password: string; mustChangePassword?: boolean }) {
  const passwordHash = await hashPassword(input.password);
  return insertCredentialUser(db, { ...input, role: "USER", passwordHash, mustChangePassword: input.mustChangePassword ?? false, createdById: null });
}

// ───────────── Bootstrap do Superadmin ─────────────

export type BootstrapResult = { status: "created" | "already_exists"; userId: string };

/**
 * Idempotente: se o Superadmin já existe, não altera nada (nem senha). O índice parcial no banco e a
 * configuração imutável impedem um segundo Superadmin mesmo com execuções concorrentes.
 */
export async function bootstrapSuperadmin(
  db: Db,
  input: { email: string; password: string; name: string; username: string },
): Promise<BootstrapResult> {
  const existing = await getSuperadminId(db);
  if (existing) return { status: "already_exists", userId: existing };
  if (!input.email || !input.email.includes("@")) throw badRequest("INVALID_EMAIL", "SUPERADMIN_EMAIL inválido");
  if (!input.password || input.password.length < 12) throw badRequest("WEAK_PASSWORD", "A senha inicial do Superadmin precisa de ao menos 12 caracteres");
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.$transaction(async (tx) => {
      if (await getSuperadminId(tx)) throw conflict("ALREADY_EXISTS", "Superadmin já existe");
      if (await tx.user.findFirst({ where: { role: "SUPERADMIN" } })) throw conflict("ALREADY_EXISTS", "Já existe um usuário SUPERADMIN");
      const user = await insertCredentialUser(tx, { ...input, role: "SUPERADMIN", passwordHash, mustChangePassword: false, createdById: null });
      await tx.systemSetting.create({ data: { key: SUPERADMIN_SETTING, value: user.id } });
      await audit(tx, { tournamentId: null, actorUserId: user.id, targetType: "USER", targetId: user.id, action: "SUPERADMIN_BOOTSTRAP" });
      return { status: "created" as const, userId: user.id };
    });
  } catch (err) {
    const again = await getSuperadminId(db);
    if (again) return { status: "already_exists", userId: again };
    throw err;
  }
}

// ───────────── Administração de usuários ─────────────

export async function listUsers(db: Db, actorId: string, q: { search?: string; role?: GlobalRole; banned?: boolean; page?: number; pageSize?: number }) {
  await requireSystemRole(db, actorId, "ADMIN");
  const pageSize = Math.min(q.pageSize ?? 25, 100);
  const page = Math.max(q.page ?? 1, 1);
  const search = q.search?.trim();
  const where = {
    role: q.role,
    banned: q.banned,
    ...(search
      ? { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { email: { contains: search, mode: "insensitive" as const } }, { username: { contains: search.toLowerCase() } }] }
      : {}),
  };
  const [items, total] = await Promise.all([
    db.user.findMany({ where, select: { ...publicUser, accounts: { select: { providerId: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.user.count({ where }),
  ]);
  const superId = await getSuperadminId(db);
  return {
    items: items.map(({ accounts, ...u }) => ({ ...u, providers: accounts.map((a) => a.providerId), isSuperadmin: u.id === superId })),
    total, page, pageSize,
  };
}

export async function getUser(db: Db, actorId: string, userId: string) {
  await requireSystemRole(db, actorId, "ADMIN");
  const user = await db.user.findUnique({ where: { id: userId }, select: { ...publicUser, accounts: { select: { providerId: true, createdAt: true } }, _count: { select: { sessions: true } } } });
  if (!user) throw notFound("Usuário");
  return { ...user, isSuperadmin: user.id === (await getSuperadminId(db)) };
}

/** Cria conta com senha temporária (devolvida uma única vez) e troca obrigatória no primeiro acesso. */
export async function createUser(db: Db, actorId: string, input: { name: string; email: string; username: string; role: "ADMIN" | "USER" }) {
  const actor = await requireSystemRole(db, actorId, "ADMIN");
  if (input.role === "ADMIN" && !actor.isSuperadmin) throw forbidden("Somente o Superadmin cria administradores");
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const user = await db.$transaction(async (tx) => {
    const created = await insertCredentialUser(tx, { ...input, passwordHash, mustChangePassword: true, createdById: actorId });
    await audit(tx, { tournamentId: null, actorUserId: actorId, targetType: "USER", targetId: created.id, action: "ADMIN_CREATE_USER", after: { name: created.name, email: created.email, username: created.username, role: created.role } });
    return created;
  });
  return { user, temporaryPassword };
}

export async function updateUser(db: Db, actorId: string, targetId: string, input: { name?: string; email?: string; username?: string }) {
  const actor = await requireSystemRole(db, actorId, "ADMIN");
  return db.$transaction(async (tx) => {
    const target = await loadManageableTarget(tx, actor, targetId);
    const data: { name?: string; email?: string; emailVerified?: boolean; username?: string; displayUsername?: string } = {};
    if (input.name) data.name = input.name.trim();
    if (input.email && input.email.trim().toLowerCase() !== target.email) {
      data.email = input.email.trim().toLowerCase();
      data.emailVerified = false;
      if (await tx.user.findFirst({ where: { email: data.email, NOT: { id: targetId } } })) throw conflict("EMAIL_TAKEN", "E-mail já cadastrado");
    }
    if (input.username && normalizeUsername(input.username) !== target.username) {
      data.username = normalizeUsername(input.username);
      data.displayUsername = input.username.trim();
      if (await tx.user.findFirst({ where: { username: data.username, NOT: { id: targetId } } })) throw conflict("USERNAME_TAKEN", "Nome de usuário em uso");
    }
    const updated = await tx.user.update({ where: { id: targetId }, data, select: publicUser });
    if (data.email) await revokeAllSessions(tx, targetId);
    await audit(tx, {
      tournamentId: null, actorUserId: actorId, targetType: "USER", targetId, action: "ADMIN_UPDATE_USER",
      before: { name: target.name, email: target.email, username: target.username }, after: { name: updated.name, email: updated.email, username: updated.username },
    });
    return updated;
  });
}

/** Política: reset gera senha temporária, exige troca no próximo acesso e revoga TODAS as sessões. */
export async function resetPassword(db: Db, actorId: string, targetId: string) {
  const actor = await requireSystemRole(db, actorId, "ADMIN");
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const revoked = await db.$transaction(async (tx) => {
    await loadManageableTarget(tx, actor, targetId);
    const credential = await tx.account.findFirst({ where: { userId: targetId, providerId: "credential" } });
    if (credential) await tx.account.update({ where: { id: credential.id }, data: { password: passwordHash } });
    else await tx.account.create({ data: { id: randomUUID(), accountId: targetId, providerId: "credential", userId: targetId, password: passwordHash } });
    await tx.user.update({ where: { id: targetId }, data: { mustChangePassword: true } });
    const count = await revokeAllSessions(tx, targetId);
    await audit(tx, { tournamentId: null, actorUserId: actorId, targetType: "USER", targetId, action: "ADMIN_RESET_PASSWORD", after: { sessionsRevoked: count } });
    return count;
  });
  return { temporaryPassword, sessionsRevoked: revoked };
}

/** Remove vínculo Google; exige que o usuário mantenha login por senha. */
export async function unlinkGoogle(db: Db, actorId: string, targetId: string) {
  const actor = await requireSystemRole(db, actorId, "ADMIN");
  return db.$transaction(async (tx) => {
    await loadManageableTarget(tx, actor, targetId);
    const hasPassword = await tx.account.findFirst({ where: { userId: targetId, providerId: "credential", password: { not: null } } });
    if (!hasPassword) throw conflict("LAST_LOGIN_METHOD", "Usuário ficaria sem forma de acesso. Resete a senha antes de desvincular o Google.");
    const { count } = await tx.account.deleteMany({ where: { userId: targetId, providerId: "google" } });
    if (count === 0) throw conflict("NOT_LINKED", "Usuário não tem Google vinculado");
    const revoked = await revokeAllSessions(tx, targetId);
    await audit(tx, { tournamentId: null, actorUserId: actorId, targetType: "USER", targetId, action: "ADMIN_UNLINK_GOOGLE", after: { sessionsRevoked: revoked } });
    return { unlinked: count, sessionsRevoked: revoked };
  });
}

export async function setBanned(db: Db, actorId: string, targetId: string, banned: boolean, reason?: string) {
  const actor = await requireSystemRole(db, actorId, "ADMIN");
  return db.$transaction(async (tx) => {
    const target = await loadManageableTarget(tx, actor, targetId);
    if (banned && !reason) throw badRequest("REASON_REQUIRED", "Informe o motivo do bloqueio");
    const updated = await tx.user.update({
      where: { id: targetId },
      data: banned ? { banned: true, banReason: reason, bannedAt: new Date() } : { banned: false, banReason: null, bannedAt: null },
      select: publicUser,
    });
    const revoked = banned ? await revokeAllSessions(tx, targetId) : 0;
    await audit(tx, { tournamentId: null, actorUserId: actorId, targetType: "USER", targetId, action: banned ? "ADMIN_BAN" : "ADMIN_UNBAN", before: { banned: target.banned }, after: { banned, sessionsRevoked: revoked }, reason });
    return updated;
  });
}

export async function revokeSessions(db: Db, actorId: string, targetId: string) {
  const actor = await requireSystemRole(db, actorId, "ADMIN");
  return db.$transaction(async (tx) => {
    await loadManageableTarget(tx, actor, targetId);
    const revoked = await revokeAllSessions(tx, targetId);
    await audit(tx, { tournamentId: null, actorUserId: actorId, targetType: "USER", targetId, action: "ADMIN_REVOKE_SESSIONS", after: { sessionsRevoked: revoked } });
    return { sessionsRevoked: revoked };
  });
}

/** Promover/rebaixar administradores: exclusivo do Superadmin. SUPERADMIN nunca é atribuível. */
export async function setRole(db: Db, actorId: string, targetId: string, role: "ADMIN" | "USER") {
  const actor = await requireSystemRole(db, actorId, "SUPERADMIN");
  return db.$transaction(async (tx) => {
    const target = await loadManageableTarget(tx, actor, targetId);
    if (target.role === role) return tx.user.findUniqueOrThrow({ where: { id: targetId }, select: publicUser });
    const updated = await tx.user.update({ where: { id: targetId }, data: { role }, select: publicUser });
    const revoked = await revokeAllSessions(tx, targetId);
    await audit(tx, { tournamentId: null, actorUserId: actorId, targetType: "USER", targetId, action: role === "ADMIN" ? "ADMIN_PROMOTE" : "ADMIN_DEMOTE", before: { role: target.role }, after: { role, sessionsRevoked: revoked } });
    return updated;
  });
}

/** Log administrativo do sistema (somente leitura; imutável no banco). */
export async function listSystemAudit(db: Db, actorId: string, q: { targetId?: string; cursor?: string; limit?: number }) {
  await requireSystemRole(db, actorId, "ADMIN");
  const limit = Math.min(q.limit ?? 50, 200);
  const rows = await db.auditEvent.findMany({
    where: { tournamentId: null, targetType: "USER", targetId: q.targetId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    include: { actor: { select: { id: true, name: true, username: true } } },
  });
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}
