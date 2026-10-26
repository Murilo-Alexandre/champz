import { authed, optionalAuth, body } from "@/server/http";
import { addMemberSchema } from "@/server/validators";
import { addMember, listMembers } from "@/server/services/tournaments";

type P = { id: string };
export const GET = optionalAuth<P>(async ({ db, userId, params }) => listMembers(db, params.id, userId));
export const POST = authed<P>(async ({ req, db, userId, params }) => addMember(db, userId, params.id, await body(req, addMemberSchema)), 201);
