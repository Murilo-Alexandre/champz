import type { ZodType } from "zod";
import { unstable_rethrow } from "next/navigation";
import { auth } from "./auth/auth";
import { toErrorBody, unauthorized, badRequest } from "./errors";
import { getPrisma, type Db } from "@/lib/db/prisma";

type Ctx<P> = { req: Request; params: P; userId: string | null; db: Db };
type RequiredCtx<P> = Omit<Ctx<P>, "userId"> & { userId: string };

export async function sessionUserId(req: Request): Promise<string | null> {
  const session = await auth.api.getSession({ headers: req.headers });
  return session?.user.id ?? null;
}

function respond(result: unknown, status = 200) {
  return Response.json(result ?? { ok: true }, { status, headers: { "Cache-Control": "private, no-store" } });
}

/** Rota autenticada: sessão obrigatória; erros de domínio viram JSON com status adequado. */
export function authed<P = Record<string, string>>(fn: (ctx: RequiredCtx<P>) => Promise<unknown>, status = 200) {
  return async (req: Request, context: { params: Promise<P> }) => {
    try {
      const userId = await sessionUserId(req);
      if (!userId) throw unauthorized();
      return respond(await fn({ req, params: await context.params, userId, db: getPrisma() }), status);
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
      const userId = await sessionUserId(req);
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
