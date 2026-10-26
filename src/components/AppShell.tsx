"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import type { Me } from "@/lib/client/types";
import { gsap, reducedMotion } from "@/lib/client/motion";
import { Icon, Spinner, ToastProvider } from "./ui";

const MeCtx = createContext<{ me: Me; reload: () => Promise<void> } | null>(null);
export function useMe() {
  const v = useContext(MeCtx);
  if (!v) throw new Error("useMe fora do AppShell");
  return v;
}

function Splash() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-4">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-lime font-display text-4xl font-black italic text-lime-ink">Z</div>
        <Spinner />
      </div>
    </div>
  );
}

/** Área autenticada: carrega o perfil, conduz troca de senha/username pendentes e mostra a navegação inferior. */
export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const load = async () => {
    try {
      setMe(await api<Me>("/api/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) router.replace(`/entrar?next=${encodeURIComponent(window.location.pathname)}`);
    }
  };
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessão do cliente
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!me) return <Splash />;
  return (
    <ToastProvider>
      <MeCtx.Provider value={{ me, reload: load }}>
        {me.mustChangePassword ? <ForcePasswordChange onDone={load} /> : me.needsUsername ? <ChooseUsername onDone={load} /> : (
          <>
            <main className="pb-nav mx-auto w-full max-w-3xl px-4" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>{children}</main>
            <BottomNav admin={me.user.role !== "USER"} />
          </>
        )}
      </MeCtx.Provider>
    </ToastProvider>
  );
}

function BottomNav({ admin }: { admin: boolean }) {
  const path = usePathname();
  const items = [
    { href: "/app", label: "Início", icon: "home", match: (p: string) => p === "/app" || p.startsWith("/app/t/") },
    { href: "/app/novo", label: "Criar", icon: "plus", match: (p: string) => p.startsWith("/app/novo") },
    { href: "/app/perfil", label: "Perfil", icon: "user", match: (p: string) => p.startsWith("/app/perfil") },
    ...(admin ? [{ href: "/app/admin", label: "Admin", icon: "shield", match: (p: string) => p.startsWith("/app/admin") }] : []),
  ];
  const bar = useRef<HTMLDivElement>(null);
  const active = items.findIndex((i) => i.match(path));
  useEffect(() => {
    const el = bar.current?.parentElement?.querySelector<HTMLElement>(`[data-nav="${active}"]`);
    if (!el || !bar.current) return;
    gsap.to(bar.current, { x: el.offsetLeft + el.offsetWidth / 2 - 18, opacity: active < 0 ? 0 : 1, duration: reducedMotion() ? 0 : 0.45, ease: "power3.out" });
  }, [active]);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 backdrop-blur-xl" style={{ paddingBottom: "var(--safe-bottom)" }} aria-label="Navegação principal">
      <div className="relative mx-auto flex max-w-3xl">
        <div ref={bar} className="absolute top-0 h-0.5 w-9 rounded-full bg-lime opacity-0" />
        {items.map((i, idx) => {
          const on = idx === active;
          return (
            <Link key={i.href} href={i.href} data-nav={idx} className={`flex h-[var(--nav-h)] flex-1 flex-col items-center justify-center gap-1 text-[11px] font-bold transition-colors ${on ? "text-lime" : "text-muted"}`} aria-current={on ? "page" : undefined}>
              {i.href === "/app/novo" ? (
                <span className="grid h-9 w-12 place-items-center rounded-xl bg-lime text-lime-ink"><Icon name="plus" size={22} /></span>
              ) : (
                <Icon name={i.icon} size={24} />
              )}
              {i.href !== "/app/novo" && i.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ForcePasswordChange({ onDone }: { onDone: () => Promise<void> }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) return setErr("A nova senha precisa de pelo menos 8 caracteres");
    setBusy(true); setErr(null);
    const r = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setBusy(false);
    if (r.error) return setErr(r.error.message ?? "Não foi possível trocar a senha");
    await onDone();
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <form onSubmit={submit} className="card flex flex-col gap-4 p-6">
        <h1 className="font-display text-3xl font-bold">Crie sua senha</h1>
        <p className="text-sm text-muted">Você entrou com uma senha temporária. Defina uma senha pessoal para continuar.</p>
        <div><label className="label" htmlFor="cur">Senha temporária</label><input id="cur" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required /></div>
        <div><label className="label" htmlFor="new">Nova senha</label><input id="new" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required /></div>
        {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : "Salvar e continuar"}</button>
      </form>
    </main>
  );
}

function ChooseUsername({ onDone }: { onDone: () => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try { await api("/api/me", { method: "PATCH", body: { username } }); await onDone(); } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
  };
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <form onSubmit={submit} className="card flex flex-col gap-4 p-6">
        <h1 className="font-display text-3xl font-bold">Escolha seu nome de usuário</h1>
        <p className="text-sm text-muted">É assim que os amigos vão te encontrar para inscrever nos campeonatos.</p>
        <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="ex.: murilo.alexandre" pattern="[a-zA-Z0-9_.]{3,24}" autoCapitalize="none" required />
        {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : "Continuar"}</button>
      </form>
    </main>
  );
}
