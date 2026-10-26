import { authed } from "@/server/http";
import { revokeSessions } from "@/server/services/admin";

type P = { userId: string };
export const POST = authed<P>(async ({ db, userId, params }) => revokeSessions(db, userId, params.userId));
