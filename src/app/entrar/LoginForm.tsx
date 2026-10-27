"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { authClient } from "@/lib/client/auth-client";
import { gsap, useGSAP, reducedMotion } from "@/lib/client/motion";
import { Icon, Spinner } from "@/components/ui";
import { BrandLogo } from "@/components/BrandLogo";
import { forgetSession } from "@/lib/client/session";

const GOOGLE_ERRORS: Record<string, string> = {
  google: "Essa conta Google não está vinculada a nenhum usuário do Champz. Entre com usuário e senha e vincule o Google no seu perfil.",
};

export function LoginForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next")?.startsWith("/") ? params.get("next")! : "/app";
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"pw" | "google" | null>(null);
  const [err, setErr] = useState<string | null>(params.get("erro") ? GOOGLE_ERRORS[params.get("erro")!] ?? "Não foi possível entrar." : null);
  const scope = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);

  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.timeline()
      .fromTo("[data-logo]", { scale: 0.4, rotate: -20, opacity: 0 }, { scale: 1, rotate: 0, opacity: 1, duration: 0.8, ease: "back.out(2)" })
      .fromTo("[data-in]", { y: 22, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, stagger: 0.07, ease: "power3.out" }, "-=0.4");
  }, { scope });

  const shake = () => !reducedMotion() && gsap.fromTo(form.current, { x: -10 }, { x: 0, duration: 0.5, ease: "elastic.out(1.2, 0.3)" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("pw"); setErr(null);
    const id = login.trim();
    const r = id.includes("@")
      ? await authClient.signIn.email({ email: id, password })
      : await authClient.signIn.username({ username: id, password });
    setBusy(null);
    if (r.error) {
      setPassword("");
      setErr(r.error.status === 429 ? "Muitas tentativas. Aguarde um minuto e tente de novo." : "Usuário ou senha incorretos.");
      shake();
      return;
    }
    forgetSession();
    router.replace(next);
  }

  async function google() {
    setBusy("google"); setErr(null);
    const r = await authClient.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/entrar?erro=google" });
    if (r.error) { setBusy(null); setErr(r.error.message ?? "Falha ao iniciar login com Google"); }
  }

  return (
    <div ref={scope} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Link href="/" data-logo aria-label="Champz — início" className="drop-shadow-[0_18px_40px_rgba(255,201,74,.35)]"><BrandLogo height={150} priority /></Link>
        <h1 data-in className="font-display text-4xl font-extrabold">Bora pro jogo</h1>
        <p data-in className="text-sm text-muted">Entre para lançar placares e acompanhar o campeonato.</p>
      </div>

      <form ref={form} onSubmit={submit} className="card flex flex-col gap-4 p-5" data-in>
        <div>
          <label className="label" htmlFor="login">Usuário ou e-mail</label>
          <input id="login" className="input" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required />
        </div>
        <div>
          <label className="label" htmlFor="password">Senha</label>
          <input id="password" className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
        </div>
        {err && <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">{err}</p>}
        <button className="btn btn-primary w-full" disabled={!!busy}>{busy === "pw" ? <Spinner /> : "Entrar"}</button>
        {googleEnabled && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted"><span className="h-px flex-1 bg-line" />ou<span className="h-px flex-1 bg-line" /></div>
            <button type="button" className="btn btn-ghost w-full" onClick={google} disabled={!!busy}>
              {busy === "google" ? <Spinner /> : <><Icon name="google" size={20} /> Entrar com Google</>}
            </button>
            <p className="text-center text-xs text-muted">O Google funciona só para contas já vinculadas no perfil.</p>
          </>
        )}
      </form>

      <p data-in className="text-center text-sm text-muted">Ainda sem acesso? Peça ao administrador do Champz para criar sua conta.</p>
    </div>
  );
}
