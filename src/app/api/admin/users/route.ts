import { authed, body, query } from "@/server/http";
import { adminCreateUserSchema } from "@/server/validators";
import { createUser, listUsers } from "@/server/services/admin";

export const GET = authed(async ({ req, db, userId }) => {
  const q = query(req);
  const role = q.get("role");
  return listUsers(db, userId, {
    search: q.get("search") ?? undefined,
    role: role === "ADMIN" || role === "USER" || role === "SUPERADMIN" ? role : undefined,
    banned: q.get("banned") === "1" ? true : q.get("banned") === "0" ? false : undefined,
    page: q.get("page") ? Number(q.get("page")) : undefined,
    pageSize: q.get("pageSize") ? Number(q.get("pageSize")) : undefined,
  });
});

/** Cria conta com senha temporária (exibida uma única vez na resposta). */
export const POST = authed(async ({ req, db, userId }) => createUser(db, userId, await body(req, adminCreateUserSchema)), 201);
