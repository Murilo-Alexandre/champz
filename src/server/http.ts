import type { ZodType } from "zod";
import { unstable_rethrow } from "next/navigation";
import { auth } from "./auth/auth";
import { AppError, toErrorBody, unauthorized, badRequest } from "./errors";
import { getPrisma, type Db } from "@/lib/db/prisma";

type Ctx<P> = { req: Request; params: P; userId: string | null; db: Db };
type RequiredCtx<P> = Omit<Ctx<P>, "userId"> & { userId: string };

type SessionUser = { id: string; banned?: boolean | null; mustChangePassword?: boolean | null };

async function sessionUser(req: Request): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  const user = session?.user as SessionUser | undefined;
  if (!user || user.banned) return null;
  return user;
}

export async function sessionUserId(req: Request): Promise<string | null> {
  return (await sessionUser(req))?.id ?? null;
}

function respond(result: unknown, status = 200) {
  return Response.json(result ?? { ok: true }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/**
 * Rota autenticada: sessão obrigatória; conta bloqueada não passa; com troca de senha pendente só rotas
 * marcadas com `allowPendingPassword` respondem. Erros de domínio viram JSON com status adequado.
 */
export function authed<P = Record<string, string>>(
  fn: (ctx: RequiredCtx<P>) => Promise<unknown>,
  status = 200,
  opts: { allowPendingPassword?: boolean } = {},
) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      const user = await sessionUser(req);
      if (!user) throw unauthorized();
      if (user.mustChangePassword && !opts.allowPendingPassword) {
        throw new AppError(403, "PASSWORD_CHANGE_REQUIRED", "Troque a senha temporária antes de continuar");
      }
      return respond(await fn({ req, params: await context.params, userId: user.id, db: getPrisma() }), status);
    } catch (err) {
      unstable_rethrow(err); // sinais internos do Next (prerender/dinâmico) não são erros da API
      const { status: s, body } = toErrorBody(err);
      return Response.json(body, { status: s });
    }
  };
}

/** Rota com sessão opcional (ex.: campeonato público). Autorização continua nos serviços. */
export function optionalAuth<P = Record<string, string>>(fn: (ctx: Ctx<P>) => Promise<unknown>) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      const user = await sessionUser(req);
      // Com senha temporária pendente, a sessão vale apenas como anônima nas rotas de leitura.
      const userId = user && !user.mustChangePassword ? user.id : null;
      return respond(await fn({ req, params: await context.params, userId, db: getPrisma() }));
    } catch (err) {
      unstable_rethrow(err); // sinais internos do Next (prerender/dinâmico) não são erros da API
      const { status: s, body } = toErrorBody(err);
      return Response.json(body, { status: s });
    }
  };
}

export async function body<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("INVALID_JSON", "Corpo da requisição inválido");
  }
  return schema.parse(raw);
}

export function query(req: Request) {
  return new URL(req.url).searchParams;
}
