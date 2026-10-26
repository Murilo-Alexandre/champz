import { authed, optionalAuth, body, query } from "@/server/http";
import { createTournamentSchema } from "@/server/validators";
import { createTournament, listTournaments } from "@/server/services/tournaments";

export const GET = optionalAuth(async ({ req, db, userId }) =>
  listTournaments(db, userId, query(req).get("scope") === "public" ? "public" : "mine"),
);
export const POST = authed(async ({ req, db, userId }) => createTournament(db, userId, await body(req, createTournamentSchema)), 201);
