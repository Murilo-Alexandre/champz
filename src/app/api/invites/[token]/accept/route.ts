import { authed } from "@/server/http";
import { acceptInvite } from "@/server/services/tournaments";

export const POST = authed<{ token: string }>(async ({ db, userId, params }) => acceptInvite(db, userId, params.token));
