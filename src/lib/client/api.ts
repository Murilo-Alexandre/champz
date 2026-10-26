"use client";

/** Cliente HTTP das APIs do Champz. O backend é a fonte da verdade para permissões e cálculos. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
    signal: init.signal,
    cache: "no-store",
  });
  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = (json as { error?: { code?: string; message?: string; details?: unknown }; message?: string; code?: string } | null) ?? null;
    const code = err?.error?.code ?? err?.code ?? `HTTP_${res.status}`;
    const message = code === "STORAGE_NOT_CONFIGURED"
      ? "Envio de fotos temporariamente indisponível. O restante do Champz funciona normalmente."
      : err?.error?.message ?? err?.message ?? friendlyStatus(res.status);
    throw new ApiError(res.status, code, message, err?.error?.details);
  }
  return json as T;
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch { return null; }
}

function friendlyStatus(status: number) {
  if (status === 401) return "Faça login para continuar";
  if (status === 403) return "Você não tem permissão para isso";
  if (status === 404) return "Não encontrado";
  if (status === 429) return "Muitas tentativas. Aguarde um minuto.";
  if (status === 503) return "Serviço indisponível no momento";
  return "Algo deu errado. Tente novamente.";
}

export function errorMessage(e: unknown) {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Algo deu errado";
}
