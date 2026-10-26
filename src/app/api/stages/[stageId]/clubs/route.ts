import { authed, body } from "@/server/http";
import { stageClubsSchema } from "@/server/validators";
import { updateStageClubs } from "@/server/services/stages";

export const PATCH = authed<{ stageId: string }>(async ({ req, db, userId, params }) => updateStageClubs(db, userId, params.stageId, await body(req, stageClubsSchema)));
