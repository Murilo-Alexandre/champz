import { authed } from "@/server/http";
import { finishRoundRobinTournament } from "@/server/services/stages";

export const POST = authed<{ id: string }>(async ({ db, userId, params }) => finishRoundRobinTournament(db, userId, params.id));
