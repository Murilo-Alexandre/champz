import { ZodError } from "zod";
import { TournamentRuleError } from "@/lib/tournament/knockout";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = () => new AppError(401, "UNAUTHENTICATED", "Faça login para continuar");
export const forbidden = (msg = "Você não tem permissão para esta ação") => new AppError(403, "FORBIDDEN", msg);
export const notFound = (what = "Registro") => new AppError(404, "NOT_FOUND", `${what} não encontrado`);
export const conflict = (code: string, msg: string, details?: unknown) => new AppError(409, code, msg, details);
export const badRequest = (code: string, msg: string, details?: unknown) => new AppError(400, code, msg, details);

export function toErrorBody(err: unknown): { status: number; body: { error: { code: string; message: string; details?: unknown } } } {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message, details: err.details } } };
  }
  if (err instanceof TournamentRuleError) {
    return { status: 422, body: { error: { code: err.code, message: err.message, details: err.details } } };
  }
  if (err instanceof ZodError) {
    return { status: 400, body: { error: { code: "VALIDATION", message: "Dados inválidos", details: err.issues } } };
  }
  console.error(err);
  return { status: 500, body: { error: { code: "INTERNAL", message: "Erro interno" } } };
}
