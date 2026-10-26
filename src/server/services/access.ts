import type { DbOrTx } from "@/lib/db/prisma";
import { hasPermission, type Permission } from "@/lib/permissions";
import { forbidden, notFound } from "../errors";

export async function loadAccess(db: DbOrTx, tournamentId: string, userId: string | null) {
  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament) throw notFound("Campeonato");
  const member = userId
    ? await db.tournamentMember.findUnique({ where: { tournamentId_userId: { tournamentId, userId } } })
    : null;
  return { tournament, member };
}
export type Access = Awaited<ReturnType<typeof loadAccess>>;

/** Leitura: campeonato público ou membro. Privado nega até a existência (404) para não vazar. */
export async function requireRead(db: DbOrTx, tournamentId: string, userId: string | null): Promise<Access> {
  const access = await loadAccess(db, tournamentId, userId);
  if (access.tournament.visibility === "PUBLIC" || access.member) return access;
  throw notFound("Campeonato");
}

export async function requirePermission(
  db: DbOrTx,
  tournamentId: string,
  userId: string,
  permission: Permission,
): Promise<Access & { member: NonNullable<Access["member"]> }> {
  const access = await requireRead(db, tournamentId, userId);
  if (!access.member || !hasPermission(access.member, permission)) {
    throw forbidden();
  }
  return access as Access & { member: NonNullable<Access["member"]> };
}

export function canPerm(access: Access, permission: Permission) {
  return hasPermission(access.member, permission);
}
