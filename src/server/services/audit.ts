import type { DbOrTx } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";

export type AuditInput = {
  tournamentId: string | null;
  actorUserId: string;
  targetType: string;
  targetId: string;
  action: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  mediaIds?: string[];
};

const json = (v: unknown) =>
  v === undefined || v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/** Único ponto de escrita do log. Não existe update/delete (bloqueado também por trigger no banco). */
export async function audit(db: DbOrTx, input: AuditInput) {
  return db.auditEvent.create({
    data: {
      tournamentId: input.tournamentId,
      actorUserId: input.actorUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      before: json(input.before),
      after: json(input.after),
      reason: input.reason ?? null,
      mediaIds: input.mediaIds ?? [],
    },
  });
}

export async function listAudit(
  db: DbOrTx,
  tournamentId: string,
  filter: { targetType?: string; targetId?: string; cursor?: string; limit?: number } = {},
) {
  const limit = Math.min(filter.limit ?? 50, 200);
  const rows = await db.auditEvent.findMany({
    where: { tournamentId, targetType: filter.targetType, targetId: filter.targetId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: { actor: { select: { id: true, name: true, username: true, image: true } } },
  });
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}
