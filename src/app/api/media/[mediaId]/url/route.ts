import { authed, query } from "@/server/http";
import { getMediaUrl } from "@/server/services/media";

export const GET = authed<{ mediaId: string }>(async ({ req, db, userId, params }) => {
  const q = query(req);
  return getMediaUrl(db, userId, params.mediaId, { thumb: q.get("thumb") === "1", download: q.get("download") === "1" });
});
