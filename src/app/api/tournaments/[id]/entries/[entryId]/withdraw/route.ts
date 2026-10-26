import { authed, body } from "@/server/http";
import { withdrawEntrySchema } from "@/server/validators";
import { withdrawEntry } from "@/server/services/tournaments";

export const POST = authed<{ id: string; entryId: string }>(async ({ req, db, userId, params }) =>
  withdrawEntry(db, userId, params.id, params.entryId, (await body(req, withdrawEntrySchema)).reason),
);
