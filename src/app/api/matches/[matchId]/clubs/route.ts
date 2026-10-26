import { authed, body } from "@/server/http";
import { setMatchClubSchema } from "@/server/validators";
import { setMatchClub } from "@/server/services/matches";

export const PUT = authed<{ matchId: string }>(async ({ req, db, userId, params }) => setMatchClub(db, userId, params.matchId, await body(req, setMatchClubSchema)));
