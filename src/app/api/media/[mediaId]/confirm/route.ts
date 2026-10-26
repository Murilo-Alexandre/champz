import { authed } from "@/server/http";
import { confirmUpload } from "@/server/services/media";

export const POST = authed<{ mediaId: string }>(async ({ db, userId, params }) => confirmUpload(db, userId, params.mediaId));
