import { authed, optionalAuth, body } from "@/server/http";
import { updateTournamentSchema } from "@/server/validators";
import { getTournament, updateTournament } from "@/server/services/tournaments";

type P = { id: string };
export const GET = optionalAuth<P>(async ({ db, userId, params }) => getTournament(db, params.id, userId));
export const PATCH = authed<P>(async ({ req, db, userId, params }) => updateTournament(db, userId, params.id, await body(req, updateTournamentSchema)));
