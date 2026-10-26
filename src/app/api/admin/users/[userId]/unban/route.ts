import { authed } from "@/server/http";
import { setBanned } from "@/server/services/admin";

type P = { userId: string };
export const POST = authed<P>(async ({ db, userId, params }) => setBanned(db, userId, params.userId, false));
