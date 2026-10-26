import { authed, body } from "@/server/http";
import { advanceStageSchema } from "@/server/validators";
import { advanceToKnockout } from "@/server/services/stages";

export const POST = authed<{ stageId: string }>(async ({ req, db, userId, params }) => advanceToKnockout(db, userId, params.stageId, await body(req, advanceStageSchema)), 201);
