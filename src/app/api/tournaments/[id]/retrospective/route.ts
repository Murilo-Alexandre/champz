import { authed } from "@/server/http";
import { getRetrospective } from "@/server/services/insights";

export const GET = authed<{ id: string }>(async ({ db, userId, params }) => getRetrospective(db, userId, params.id));
