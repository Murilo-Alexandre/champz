"use client";
import type { Me } from "./types";
import { clearApiCache } from "./hooks";

/** Perfil já validado nesta aba (só memória): a área logada remonta sem splash e revalida em seguida. */
export const sessionMemo: { me: Me | null } = { me: null };

/** Ao entrar ou sair: descarta perfil e dados em memória (aparelho compartilhado não vê dados da conta anterior). */
export function forgetSession() {
  sessionMemo.me = null;
  clearApiCache();
}
