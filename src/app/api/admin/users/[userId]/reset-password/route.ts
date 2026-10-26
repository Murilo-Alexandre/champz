import { authed } from "@/server/http";
import { resetPassword } from "@/server/services/admin";

type P = { userId: string };
export const POST = authed<P>(async ({ db, userId, params }) => resetPassword(db, userId, params.userId));
