import { authed, query } from "@/server/http";
import { listSystemAudit } from "@/server/services/admin";

/** Log administrativo (somente leitura; não existe PATCH/DELETE e o banco bloqueia alterações). */
export const GET = authed(async ({ req, db, userId }) => {
  const q = query(req);
  return listSystemAudit(db, userId, {
    targetId: q.get("targetId") ?? undefined,
    cursor: q.get("cursor") ?? undefined,
    limit: q.get("limit") ? Number(q.get("limit")) : undefined,
  });
});
