import { authed, body } from "@/server/http";
import { adminRoleSchema } from "@/server/validators";
import { setRole } from "@/server/services/admin";

type P = { userId: string };
/** Promover/rebaixar administrador: somente o Superadmin. */
export const PUT = authed<P>(async ({ req, db, userId, params }) => setRole(db, userId, params.userId, (await body(req, adminRoleSchema)).role));
