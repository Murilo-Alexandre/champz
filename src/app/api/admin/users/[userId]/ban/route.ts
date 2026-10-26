import { authed, body } from "@/server/http";
import { adminBanSchema } from "@/server/validators";
import { setBanned } from "@/server/services/admin";

type P = { userId: string };
export const POST = authed<P>(async ({ req, db, userId, params }) => setBanned(db, userId, params.userId, true, (await body(req, adminBanSchema)).reason));
