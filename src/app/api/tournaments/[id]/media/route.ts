import { authed, body, query } from "@/server/http";
import { uploadRequestSchema } from "@/server/validators";
import { listMedia, requestUpload } from "@/server/services/media";

type P = { id: string };
export const GET = authed<P>(async ({ req, db, userId, params }) => {
  const q = query(req);
  return listMedia(db, userId, params.id, {
    stageId: q.get("stageId") ?? undefined,
    roundId: q.get("roundId") ?? undefined,
    matchId: q.get("matchId") ?? undefined,
    ownerUserId: q.get("ownerUserId") ?? undefined,
    includeHidden: q.get("includeHidden") === "1",
    cursor: q.get("cursor") ?? undefined,
    limit: q.get("limit") ? Number(q.get("limit")) : undefined,
  });
});
/** Pede URL assinada para upload direto ao bucket privado. */
export const POST = authed<P>(async ({ req, db, userId, params }) => requestUpload(db, userId, params.id, await body(req, uploadRequestSchema)), 201);
