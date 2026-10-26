import { authed, body } from "@/server/http";
import { createInviteSchema } from "@/server/validators";
import { createInvite } from "@/server/services/tournaments";

export const POST = authed<{ id: string }>(async ({ req, db, userId, params }) => createInvite(db, userId, params.id, await body(req, createInviteSchema)), 201);
