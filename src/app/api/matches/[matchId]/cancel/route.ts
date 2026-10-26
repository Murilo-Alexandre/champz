import { authed, body } from "@/server/http";
import { cancelMatchSchema } from "@/server/validators";
import { cancelMatch } from "@/server/services/matches";

export const POST = authed<{ matchId: string }>(async ({ req, db, userId, params }) => cancelMatch(db, userId, params.matchId, await body(req, cancelMatchSchema)));
