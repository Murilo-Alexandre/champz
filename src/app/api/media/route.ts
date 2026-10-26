import { authed, body } from "@/server/http";
import { uploadRequestSchema } from "@/server/validators";
import { requestUpload } from "@/server/services/media";

/** Upload de avatar/escudo (fora de campeonato). */
export const POST = authed(async ({ req, db, userId }) => requestUpload(db, userId, null, await body(req, uploadRequestSchema)), 201);
