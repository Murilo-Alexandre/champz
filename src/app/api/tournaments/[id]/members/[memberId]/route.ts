import { authed, body } from "@/server/http";
import { memberUpdateSchema } from "@/server/validators";
import { updateMember } from "@/server/services/tournaments";

export const PATCH = authed<{ id: string; memberId: string }>(async ({ req, db, userId, params }) =>
  updateMember(db, userId, params.id, params.memberId, await body(req, memberUpdateSchema)),
);
