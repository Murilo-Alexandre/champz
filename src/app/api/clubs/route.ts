import { authed, optionalAuth, body, query } from "@/server/http";
import { clubSchema } from "@/server/validators";
import { createClub, listClubs } from "@/server/services/insights";

export const GET = optionalAuth(async ({ req, db }) => listClubs(db, query(req).get("all") === "1"));
export const POST = authed(async ({ req, db, userId }) => createClub(db, userId, await body(req, clubSchema)), 201);
