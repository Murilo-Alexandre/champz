import { z } from "zod";
import { authed, body } from "@/server/http";
import { clubSchema } from "@/server/validators";
import { updateClub } from "@/server/services/insights";

const schema = clubSchema.partial().extend({ active: z.boolean().optional() });
export const PATCH = authed<{ clubId: string }>(async ({ req, db, userId, params }) => updateClub(db, userId, params.clubId, await body(req, schema)));
