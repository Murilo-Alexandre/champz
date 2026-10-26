import { authed } from "@/server/http";
import { unlinkGoogle } from "@/server/services/admin";

type P = { userId: string };
export const POST = authed<P>(async ({ db, userId, params }) => unlinkGoogle(db, userId, params.userId));
