import { authed, body } from "@/server/http";
import { updateSettingsSchema } from "@/server/validators";
import { updateSettings } from "@/server/services/tournaments";

export const PATCH = authed<{ id: string }>(async ({ req, db, userId, params }) => updateSettings(db, userId, params.id, await body(req, updateSettingsSchema)));
