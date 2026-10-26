import { authed, body } from "@/server/http";
import { addEntrySchema } from "@/server/validators";
import { addEntry } from "@/server/services/tournaments";

export const POST = authed<{ id: string }>(async ({ req, db, userId, params }) => addEntry(db, userId, params.id, await body(req, addEntrySchema)), 201);
