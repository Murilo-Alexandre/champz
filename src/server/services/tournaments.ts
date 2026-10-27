import { randomBytes } from "node:crypto";
import type { z } from "zod";
import type { Db, DbOrTx } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { parseSettings, type TournamentSettings } from "@/lib/tournament/settings";
import { DEFAULT_PARTICIPANT_FLAGS } from "@/lib/permissions";
import { audit } from "./audit";
import { assertClubRulesValid, assertNoRetroactiveClubChange } from "./clubRules";
import { normalizeName } from "@/lib/text";
import { requirePermission, requireRead } from "./access";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import type {
  addEntrySchema, addMemberSchema, createInviteSchema, createTournamentSchema, memberUpdateSchema,
  updateSettingsSchema, updateTournamentSchema,
} from "../validators";

const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export function settingsOf(t: { settings: unknown }): TournamentSettings {
  return parseSettings(t.settings);
}

// ───────────── Campeonato ─────────────

export async function createTournament(db: Db, userId: string, input: z.infer<typeof createTournamentSchema>) {
  const settings = parseSettings(input.settings ?? {});
  return db.$transaction(async (tx) => {
    await assertClubRulesValid(tx, settings);
    const t = await tx.tournament.create({
      data: {
        ownerId: userId,
        name: input.name,
        sportCode: input.sportCode,
        edition: input.edition,
        description: input.description,
        format: input.format,
        entryType: input.entryType,
        visibility: input.visibility,
        startsAt: input.startsAt,
        settings: asJson(settings),
        members: { create: { userId, role: "OWNER", canEditResult: true, canEditClubs: true, canDraw: true, canEditRules: true, canUploadMedia: true, canManageMembers: true } },
        settingsRevisions: { create: { version: 1, settings: asJson(settings), actorUserId: userId, reason: "Criação" } },
      },
    });
    await audit(tx, { tournamentId: t.id, actorUserId: userId, targetType: "TOURNAMENT", targetId: t.id, action: "CREATE", after: t });
    return t;
  });
}

export async function getTournament(db: DbOrTx, tournamentId: string, userId: string | null) {
  const { tournament, member } = await requireRead(db, tournamentId, userId);
  const [entries, stages, champion] = await Promise.all([
    db.entry.findMany({
      where: { tournamentId },
      orderBy: { createdAt: "asc" },
      include: { players: { include: { user: { select: { id: true, name: true, username: true, image: true, avatarMediaId: true } } } } },
    }),
    db.stage.findMany({ where: { tournamentId }, orderBy: { order: "asc" }, select: { id: true, order: true, type: true, name: true, status: true } }),
    tournament.championEntryId ? db.entry.findUnique({ where: { id: tournament.championEntryId } }) : null,
  ]);
  return { tournament: { ...tournament, settings: settingsOf(tournament) }, myMembership: member, entries, stages, champion };
}

export async function listTournaments(db: DbOrTx, userId: string | null, scope: "mine" | "public") {
  if (scope === "mine") {
    if (!userId) return [];
    return db.tournament.findMany({
      where: { members: { some: { userId } } },
      orderBy: { updatedAt: "desc" },
      include: { members: { where: { userId }, select: { role: true } }, _count: { select: { entries: true } } },
    });
  }
  return db.tournament.findMany({
    where: { visibility: "PUBLIC", status: { not: "CANCELLED" } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: { _count: { select: { entries: true } } },
  });
}

export async function updateTournament(db: Db, userId: string, tournamentId: string, input: z.infer<typeof updateTournamentSchema>) {
  return db.$transaction(async (tx) => {
    const { tournament } = await requirePermission(tx, tournamentId, userId, "RULE_EDIT");
    if (input.status && ["ACTIVE", "FINISHED"].includes(tournament.status) && input.status !== "CANCELLED") {
      throw conflict("STATUS_LOCKED", "Campeonato em andamento só pode ser cancelado");
    }
    const updated = await tx.tournament.update({ where: { id: tournamentId }, data: input });
    await audit(tx, { tournamentId, actorUserId: userId, targetType: "TOURNAMENT", targetId: tournamentId, action: "UPDATE", before: tournament, after: updated });
    return updated;
  });
}

/** Regulamento versionado: cada mudança cria revisão + auditoria. Pontos/desempates passam a valer no recálculo. */
export async function updateSettings(db: Db, userId: string, tournamentId: string, input: z.infer<typeof updateSettingsSchema>) {
  return db.$transaction(async (tx) => {
    const { tournament } = await requirePermission(tx, tournamentId, userId, "RULE_EDIT");
    if (input.expectedVersion !== undefined && input.expectedVersion !== tournament.settingsVersion) {
      throw conflict("VERSION_CONFLICT", "O regulamento foi alterado por outra pessoa. Recarregue.");
    }
    const before = settingsOf(tournament);
    const next = parseSettings({ ...before, ...input.settings });
    await assertClubRulesValid(tx, next);
    await assertNoRetroactiveClubChange(tx, tournamentId, before, next);
    const version = tournament.settingsVersion + 1;
    const updated = await tx.tournament.update({
      where: { id: tournamentId, settingsVersion: tournament.settingsVersion },
      data: { settings: asJson(next), settingsVersion: version },
    });
    await tx.tournamentSettingsRevision.create({ data: { tournamentId, version, settings: asJson(next), actorUserId: userId, reason: input.reason } });
    await audit(tx, { tournamentId, actorUserId: userId, targetType: "SETTINGS", targetId: tournamentId, action: "UPDATE", before, after: next, reason: input.reason });
    return { ...updated, settings: next };
  });
}

// ───────────── Membros e permissões ─────────────

export async function listMembers(db: DbOrTx, tournamentId: string, userId: string | null) {
  await requireRead(db, tournamentId, userId);
  return db.tournamentMember.findMany({
    where: { tournamentId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true, username: true, image: true, avatarMediaId: true } } },
  });
}

export async function ensureParticipantMember(tx: DbOrTx, tournamentId: string, userId: string) {
  const existing = await tx.tournamentMember.findUnique({ where: { tournamentId_userId: { tournamentId, userId } } });
  if (existing) {
    if (existing.role === "VIEWER") {
      return tx.tournamentMember.update({ where: { id: existing.id }, data: { role: "PARTICIPANT", ...DEFAULT_PARTICIPANT_FLAGS } });
    }
    return existing;
  }
  return tx.tournamentMember.create({ data: { tournamentId, userId, role: "PARTICIPANT", ...DEFAULT_PARTICIPANT_FLAGS } });
}

export async function addMember(db: Db, actorId: string, tournamentId: string, input: z.infer<typeof addMemberSchema>) {
  return db.$transaction(async (tx) => {
    const { member: actor } = await requirePermission(tx, tournamentId, actorId, "MANAGE_MEMBERS");
    if (input.role === "ADMIN" && actor.role !== "OWNER") throw forbidden("Somente o dono pode nomear administradores");
    const user = await tx.user.findUnique({ where: { username: input.username.toLowerCase() } });
    if (!user) throw notFound("Usuário");
    const exists = await tx.tournamentMember.findUnique({ where: { tournamentId_userId: { tournamentId, userId: user.id } } });
    if (exists) throw conflict("ALREADY_MEMBER", "Usuário já é membro");
    const flags = input.role === "VIEWER" ? { canEditResult: false, canUploadMedia: false } : DEFAULT_PARTICIPANT_FLAGS;
    const created = await tx.tournamentMember.create({ data: { tournamentId, userId: user.id, role: input.role, ...flags } });
    await audit(tx, { tournamentId, actorUserId: actorId, targetType: "MEMBER", targetId: created.id, action: "ADD", after: created });
    return created;
  });
}

export async function updateMember(db: Db, actorId: string, tournamentId: string, memberId: string, input: z.infer<typeof memberUpdateSchema>) {
  return db.$transaction(async (tx) => {
    const { member: actor } = await requirePermission(tx, tournamentId, actorId, "MANAGE_MEMBERS");
    const target = await tx.tournamentMember.findFirst({ where: { id: memberId, tournamentId } });
    if (!target) throw notFound("Membro");
    if (target.role === "OWNER") throw forbidden("Permissões do dono não podem ser alteradas");
    const touchesAdmin = target.role === "ADMIN" || input.role === "ADMIN";
    if (touchesAdmin && actor.role !== "OWNER") throw forbidden("Somente o dono altera administradores");
    if (input.canManageMembers && actor.role !== "OWNER") throw forbidden("Somente o dono delega gestão de membros");
    const updated = await tx.tournamentMember.update({ where: { id: memberId }, data: input });
    await audit(tx, { tournamentId, actorUserId: actorId, targetType: "MEMBER", targetId: memberId, action: "UPDATE_PERMISSIONS", before: target, after: updated });
    return updated;
  });
}

export async function createInvite(db: Db, actorId: string, tournamentId: string, input: z.infer<typeof createInviteSchema>) {
  return db.$transaction(async (tx) => {
    await requirePermission(tx, tournamentId, actorId, "MANAGE_MEMBERS");
    const invite = await tx.tournamentInvite.create({
      data: {
        tournamentId,
        token: randomBytes(24).toString("base64url"),
        role: input.role,
        maxUses: input.maxUses,
        expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 3600_000) : null,
        createdById: actorId,
      },
    });
    await audit(tx, { tournamentId, actorUserId: actorId, targetType: "INVITE", targetId: invite.id, action: "CREATE", after: { ...invite, token: "***" } });
    return invite;
  });
}

export async function acceptInvite(db: Db, userId: string, token: string) {
  return db.$transaction(async (tx) => {
    const invite = await tx.tournamentInvite.findUnique({ where: { token } });
    if (!invite || invite.revokedAt) throw notFound("Convite");
    if (invite.expiresAt && invite.expiresAt < new Date()) throw conflict("INVITE_EXPIRED", "Convite expirado");
    if (invite.maxUses != null && invite.uses >= invite.maxUses) throw conflict("INVITE_EXHAUSTED", "Convite esgotado");
    const existing = await tx.tournamentMember.findUnique({ where: { tournamentId_userId: { tournamentId: invite.tournamentId, userId } } });
    if (existing) return existing;
    const flags = invite.role === "VIEWER" ? { canEditResult: false, canUploadMedia: false } : DEFAULT_PARTICIPANT_FLAGS;
    const member = await tx.tournamentMember.create({ data: { tournamentId: invite.tournamentId, userId, role: invite.role, ...flags } });
    await tx.tournamentInvite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
    await audit(tx, { tournamentId: invite.tournamentId, actorUserId: userId, targetType: "MEMBER", targetId: member.id, action: "JOIN_BY_INVITE", after: member });
    return member;
  });
}

// ───────────── Entradas (1v1 / 2v2) ─────────────

export async function addEntry(db: Db, actorId: string, tournamentId: string, input: z.infer<typeof addEntrySchema>) {
  return db.$transaction(async (tx) => {
    const { tournament } = await requirePermission(tx, tournamentId, actorId, "MANAGE_MEMBERS");
    if (!["DRAFT", "OPEN"].includes(tournament.status)) {
      throw conflict("ENTRIES_LOCKED", "Inscrições fechadas: o campeonato já começou");
    }
    const expected = tournament.entryType === "DUO" ? 2 : 1;
    if (input.players.length !== expected) {
      throw badRequest("PLAYER_COUNT", tournament.entryType === "DUO" ? "Dupla precisa de exatamente 2 jogadores" : "Entrada individual tem 1 jogador");
    }

    const resolved: { userId: string | null; guestName: string | null; label: string }[] = [];
    for (const p of input.players) {
      if ("guestName" in p) {
        resolved.push({ userId: null, guestName: p.guestName, label: p.guestName });
        continue;
      }
      const user = "userId" in p
        ? await tx.user.findUnique({ where: { id: p.userId } })
        : await tx.user.findFirst({ where: { username: { equals: p.username.trim().replace(/^@/, ""), mode: "insensitive" } } });
      if (!user || user.banned) throw notFound("Usuário");
      resolved.push({ userId: user.id, guestName: null, label: user.name });
    }
    const userIds = resolved.map((r) => r.userId).filter((x): x is string => !!x);
    if (new Set(userIds).size !== userIds.length) throw badRequest("DUPLICATE_PLAYER", "O mesmo usuário não pode formar dupla consigo");
    const guests = resolved.map((r) => (r.guestName ? normalizeName(r.guestName) : "")).filter(Boolean);
    if (new Set(guests).size !== guests.length) throw badRequest("DUPLICATE_PLAYER", "Jogadores repetidos na dupla");
    if (userIds.length) {
      const taken = await tx.entryPlayer.findFirst({ where: { tournamentId, userId: { in: userIds } }, include: { user: { select: { name: true } } } });
      if (taken) throw conflict("PLAYER_ALREADY_ENTERED", `${taken.user?.name ?? "Este usuário"} já está inscrito neste campeonato`);
    }
    if (guests.length) {
      // Convidado repetido (ignorando maiúsculas, acentos e espaços) ou igual a uma conta já inscrita.
      const current = await tx.entryPlayer.findMany({ where: { tournamentId }, select: { guestName: true, user: { select: { name: true, username: true } } } });
      const taken = new Set(current.flatMap((p) => [p.guestName, p.user?.name, p.user?.username].filter((x): x is string => !!x).map(normalizeName)));
      const dup = resolved.find((r) => r.guestName && taken.has(normalizeName(r.guestName)));
      if (dup) throw conflict("PLAYER_ALREADY_ENTERED", `Já existe um participante chamado "${dup.guestName}" neste campeonato`);
      const accounts = await tx.user.findMany({ where: { username: { in: guests.map((g) => g.replace(/\s+/g, "")) , mode: "insensitive" } }, select: { username: true } });
      if (accounts.length) throw conflict("GUEST_IS_ACCOUNT", `@${accounts[0].username} já tem conta no Champz. Adicione pela busca de usuários.`);
    }

    const entry = await tx.entry.create({
      data: {
        tournamentId,
        type: tournament.entryType,
        name: input.name ?? resolved.map((r) => r.label).join(" & "),
        players: { create: resolved.map((r) => ({ tournamentId, userId: r.userId, guestName: r.guestName })) },
      },
      include: { players: true },
    });
    for (const uid of userIds) await ensureParticipantMember(tx, tournamentId, uid);
    await audit(tx, { tournamentId, actorUserId: actorId, targetType: "ENTRY", targetId: entry.id, action: "CREATE", after: entry });
    return entry;
  });
}

/** Desistência: desativa a entrada para fases futuras; nunca apaga resultados. Jogos pendentes devem receber W.O. */
export async function withdrawEntry(db: Db, actorId: string, tournamentId: string, entryId: string, reason: string) {
  return db.$transaction(async (tx) => {
    await requirePermission(tx, tournamentId, actorId, "MANAGE_MEMBERS");
    const entry = await tx.entry.findFirst({ where: { id: entryId, tournamentId } });
    if (!entry) throw notFound("Entrada");
    if (!entry.active) throw conflict("ALREADY_WITHDRAWN", "Entrada já desativada");
    const updated = await tx.entry.update({ where: { id: entryId }, data: { active: false, withdrawnAt: new Date(), withdrawNote: reason } });
    const pending = await tx.match.findMany({
      where: { tournamentId, status: { in: ["SCHEDULED", "READY"] }, OR: [{ homeEntryId: entryId }, { awayEntryId: entryId }] },
      select: { id: true },
    });
    await audit(tx, { tournamentId, actorUserId: actorId, targetType: "ENTRY", targetId: entryId, action: "WITHDRAW", before: entry, after: updated, reason });
    return { entry: updated, pendingMatchIds: pending.map((p) => p.id) };
  });
}

/** Nome visível dos jogadores de uma entrada (usuário ou convidado). */
export function playerLabel(p: { guestName: string | null; user?: { name: string; username: string | null } | null }) {
  return p.user?.name ?? p.guestName ?? "?";
}

