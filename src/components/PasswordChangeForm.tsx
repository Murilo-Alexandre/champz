"use client";
import { useState } from "react";
import { authClient } from "@/lib/client/auth-client";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/password-policy";
import { Spinner } from "./ui";

type Field = "current" | "next" | "confirm" | "form";
type Err = { field: Field; message: string };

/** Traduz o erro real do Better Auth para o campo correspondente, sem expor detalhes internos. */
export function passwordChangeError(error: { code?: string; status?: number; message?: string } | null | undefined): Err {
  const code = error?.code ?? "";
  if (error?.status === 429 || code === "TOO_MANY_REQUESTS") return { field: "form", message: "Muitas tentativas. Tente novamente em alguns instantes." };
  if (code === "INVALID_PASSWORD") return { field: "current", message: "A senha atual informada está incorreta." };
  if (code === "PASSWORD_TOO_SHORT") return { field: "next", message: `A nova senha deve conter pelo menos ${PASSWORD_MIN} caracteres.` };
  if (code === "PASSWORD_TOO_LONG") return { field: "next", message: `A nova senha deve ter no máximo ${PASSWORD_MAX} caracteres.` };
  if (code === "PASSWORD_REUSED") return { field: "next", message: "A nova senha precisa ser diferente da senha atual." };
  if (code === "CREDENTIAL_ACCOUNT_NOT_FOUND") return { field: "form", message: "Sua conta não tem senha cadastrada. Peça a um administrador para gerar uma." };
  if (error?.status === 401) return { field: "form", message: "Sua sessão expirou. Entre novamente para trocar a senha." };
  return { field: "form", message: "Não foi possível alterar a senha. Tente novamente." };
}

/** Validação local com a mesma política do servidor (o servidor continua validando). */
export function validatePasswordChange(cur: string, next: string, confirm: string): Err | null {
  if (!cur) return { field: "current", message: "Informe a senha atual." };
  if (next.length < PASSWORD_MIN) return { field: "next", message: `A nova senha deve conter pelo menos ${PASSWORD_MIN} caracteres.` };
  if (next.length > PASSWORD_MAX) return { field: "next", message: `A nova senha deve ter no máximo ${PASSWORD_MAX} caracteres.` };
  if (next === cur) return { field: "next", message: "A nova senha precisa ser diferente da senha atual." };
  if (next !== confirm) return { field: "confirm", message: "As novas senhas não coincidem." };
  return null;
}

export function PasswordChangeForm({ onDone, currentLabel = "Senha atual", submitLabel = "Salvar" }: { onDone: () => void | Promise<void>; currentLabel?: string; submitLabel?: string }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<Err | null>(null);
  const msg = (f: Field) => (err?.field === f ? <p id={`pw-${f}-err`} className="mt-1.5 text-sm text-danger" role="alert">{err.message}</p> : null);
  const cls = (f: Field) => `input ${err?.field === f ? "!border-danger" : ""}`;
  const edit = (f: Field, set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    if (err?.field === f || err?.field === "form") setErr(null);
  };
  return (
    <form className="flex flex-col gap-3" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const local = validatePasswordChange(cur, next, confirm);
      if (local) return setErr(local);
      setBusy(true); setErr(null);
      try {
        const r = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
        if (r.error) setErr(passwordChangeError(r.error));
        else await onDone();
      } catch {
        setErr({ field: "form", message: "Não foi possível alterar a senha. Verifique sua conexão e tente novamente." });
      } finally { setBusy(false); }
    }}>
      <div>
        <label className="label" htmlFor="pw-current">{currentLabel}</label>
        <input id="pw-current" type="password" className={cls("current")} autoComplete="current-password" value={cur} onChange={edit("current", setCur)} aria-invalid={err?.field === "current"} />
        {msg("current")}
      </div>
      <div>
        <label className="label" htmlFor="pw-next">Nova senha</label>
        <input id="pw-next" type="password" className={cls("next")} autoComplete="new-password" value={next} onChange={edit("next", setNext)} aria-invalid={err?.field === "next"} aria-describedby="pw-next-hint" />
        <p id="pw-next-hint" className="mt-1.5 text-xs text-muted">Mínimo de {PASSWORD_MIN} caracteres, com letras, números ou símbolos, como preferir.</p>
        {msg("next")}
      </div>
      <div>
        <label className="label" htmlFor="pw-confirm">Confirmar nova senha</label>
        <input id="pw-confirm" type="password" className={cls("confirm")} autoComplete="new-password" value={confirm} onChange={edit("confirm", setConfirm)} aria-invalid={err?.field === "confirm"} />
        {msg("confirm")}
      </div>
      <p className="text-xs text-muted">As outras sessões abertas serão encerradas.</p>
      {msg("form")}
      <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : submitLabel}</button>
    </form>
  );
}
