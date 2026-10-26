import { authed, body } from "@/server/http";
import { recordResultSchema } from "@/server/validators";
import { recordResult } from "@/server/services/matches";

export const PUT = authed<{ matchId: string }>(async ({ req, db, userId, params }) => recordResult(db, userId, params.matchId, await body(req, recordResultSchema)));
