import { authed, body } from "@/server/http";
import { groupTiebreakSchema } from "@/server/validators";
import { setGroupTiebreak } from "@/server/services/stages";

export const PUT = authed<{ groupId: string }>(async ({ req, db, userId, params }) => setGroupTiebreak(db, userId, params.groupId, await body(req, groupTiebreakSchema)));
