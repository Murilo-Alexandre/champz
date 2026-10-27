import { authed, query } from "@/server/http";
import { searchUsers } from "@/server/services/users";

/** Busca contas por nome, usuário ou e-mail (sem devolver e-mail). Exige sessão. */
export const GET = authed(async ({ req, db }) => searchUsers(db, (query(req).get("q") ?? "").slice(0, 80)));
