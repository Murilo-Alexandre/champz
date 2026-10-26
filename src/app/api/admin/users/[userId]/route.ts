import { authed, body } from "@/server/http";
import { adminUpdateUserSchema } from "@/server/validators";
import { getUser, updateUser } from "@/server/services/admin";

type P = { userId: string };
export const GET = authed<P>(async ({ db, userId, params }) => getUser(db, userId, params.userId));
export const PATCH = authed<P>(async ({ req, db, userId, params }) => updateUser(db, userId, params.userId, await body(req, adminUpdateUserSchema)));
