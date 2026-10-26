import { z } from "zod";
import { authed, body } from "@/server/http";
import { setMediaHidden } from "@/server/services/media";

const schema = z.object({ hidden: z.boolean(), reason: z.string().trim().min(3).max(300) });
export const PATCH = authed<{ mediaId: string }>(async ({ req, db, userId, params }) => {
  const input = await body(req, schema);
  return setMediaHidden(db, userId, params.mediaId, input.hidden, input.reason);
});
