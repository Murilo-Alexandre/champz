import { optionalAuth } from "@/server/http";
import { getTournamentStats } from "@/server/services/insights";

export const GET = optionalAuth<{ id: string }>(async ({ db, userId, params }) => getTournamentStats(db, userId, params.id));
