import { optionalAuth, query } from "@/server/http";
import { requireRead } from "@/server/services/access";
import { listAudit } from "@/server/services/audit";

/** Histórico somente leitura (sem DELETE/PATCH). Filtre por targetType/targetId para o ícone de histórico. */
export const GET = optionalAuth<{ id: string }>(async ({ req, db, userId, params }) => {
  await requireRead(db, params.id, userId);
  const q = query(req);
  return listAudit(db, params.id, {
    targetType: q.get("targetType") ?? undefined,
    targetId: q.get("targetId") ?? undefined,
    cursor: q.get("cursor") ?? undefined,
    limit: q.get("limit") ? Number(q.get("limit")) : undefined,
  });
});
