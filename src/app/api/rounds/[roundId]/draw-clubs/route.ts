import { authed, body } from "@/server/http";
import { drawClubsSchema } from "@/server/validators";
import { drawRoundClubs } from "@/server/services/matches";

export const POST = authed<{ roundId: string }>(async ({ req, db, userId, params }) => drawRoundClubs(db, userId, params.roundId, await body(req, drawClubsSchema)));
