import { optionalAuth } from "@/server/http";
import { getStageView } from "@/server/services/stages";

export const GET = optionalAuth<{ stageId: string }>(async ({ db, userId, params }) => getStageView(db, userId, params.stageId));
