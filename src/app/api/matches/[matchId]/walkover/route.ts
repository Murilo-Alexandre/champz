import { authed, body } from "@/server/http";
import { walkoverSchema } from "@/server/validators";
import { recordWalkover } from "@/server/services/matches";

export const PUT = authed<{ matchId: string }>(async ({ req, db, userId, params }) => recordWalkover(db, userId, params.matchId, await body(req, walkoverSchema)));
