"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { useApi } from "@/lib/client/hooks";
import { uploadPhoto } from "@/lib/client/upload";
import { useGSAP, revealChildren } from "@/lib/client/motion";
import { useMe } from "@/components/AppShell";
import { UserAvatar } from "@/components/ParticipantAvatar";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { Icon, Sheet, Spinner, useToast } from "@/components/ui";

type History = { items: { tournament: { id: string; name: string; edition: string | null; status: string }; entryName: string; champion: boolean }[]; titles: number };

export default function ProfilePage() {
  const { me, reload } = useMe();
  const router = useRouter();
  const toast = useToast();
  const history = useApi<History>("/api/me/history");
  const ref = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pw, setPw] = useState(false);
  const [uname, setUname] = useState(false);
  useGSAP(() => revealChildren(ref.current), { scope: ref, dependencies: [history.data] });

  const hasGoogle = me.providers.includes("google");
  const played = history.data?.items.length ?? 0;

  async function avatar(f: File | undefined) {
    if (!f) return;
    setBusy("avatar");
    try { await uploadPhoto(f, { kind: "AVATAR" }); toast("Foto atualizada"); await reload(); } catch (e) { toast(errorMessage(e), "err"); } finally { setBusy(null); }
  }
  async function linkGoogle() {
    setBusy("google");
    const r = await authClient.linkSocial({ provider: "google", callbackURL: "/app/perfil" });
    if (r.error) { toast(r.error.message ?? "Falha ao vincular", "err"); setBusy(null); }
  }
  async function logout() {
    setBusy("out");
    await authClient.signOut();
    router.replace("/entrar");
  }

  return (
    <div ref={ref} className="flex flex-col gap-4">
      <section data-reveal className="card relative flex flex-col items-center gap-3 overflow-hidden px-5 pb-6 pt-8 text-center">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-lime/15 to-transparent" />
        <button className="relative" onClick={() => file.current?.click()} aria-label="Trocar foto de perfil">
          <UserAvatar name={me.user.name} mediaId={me.user.avatarMediaId} size={96} />
          <span className="absolute bottom-0 right-0 grid h-9 w-9 place-items-center rounded-full bg-lime text-lime-ink">{busy === "avatar" ? <Spinner size={16} /> : <Icon name="camera" size={18} />}</span>
        </button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { avatar(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="relative">
          <h1 className="font-display text-3xl font-extrabold">{me.user.name}</h1>
          <button className="text-sm text-muted underline-offset-4 hover:underline" onClick={() => setUname(true)}>@{me.user.displayUsername ?? me.user.username}</button>
        </div>
        {me.user.role !== "USER" && <span className="chip relative border-lime/40 text-lime"><Icon name="shield" size={14} />{me.isSuperadmin ? "Superadmin" : "Admin"}</span>}
        <div className="relative mt-2 grid w-full grid-cols-2 gap-2">
          <div className="rounded-2xl bg-bg-2 p-3"><p className="font-display text-3xl font-extrabold text-gold">{history.data?.titles ?? "–"}</p><p className="text-xs text-muted">títulos</p></div>
          <div className="rounded-2xl bg-bg-2 p-3"><p className="font-display text-3xl font-extrabold">{history.data ? played : "–"}</p><p className="text-xs text-muted">campeonatos</p></div>
        </div>
      </section>

      {history.data && history.data.items.length > 0 && (
        <section data-reveal className="card p-4">
          <h2 className="mb-2 font-display text-xl font-bold">Histórico</h2>
          {history.data.items.map((h) => (
            <Link key={h.tournament.id + h.entryName} href={`/app/t/${h.tournament.id}`} className="flex min-h-12 items-center gap-3 border-t border-line/60 py-2 first:border-t-0">
              <Icon name={h.champion ? "trophy" : "ball"} className={h.champion ? "text-gold" : "text-muted"} />
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{h.tournament.name}</span><span className="text-xs text-muted">{h.entryName}{h.tournament.edition ? ` · ${h.tournament.edition}` : ""}</span></span>
              {h.champion && <span className="text-xs font-bold text-gold">Campeão</span>}
            </Link>
          ))}
        </section>
      )}

      <section data-reveal className="card divide-y divide-line">
        <div className="flex min-h-14 items-center gap-3 px-4">
          <Icon name="google" />
          <div className="flex-1"><p className="font-semibold">Google</p><p className="text-xs text-muted">{hasGoogle ? "Vinculado: você pode entrar com o Google" : "Opcional: entrar com um toque"}</p></div>
          {hasGoogle ? <Icon name="check" className="text-lime" /> : me.googleEnabled ? <button className="btn btn-ghost btn-sm" onClick={linkGoogle} disabled={!!busy}>{busy === "google" ? <Spinner size={16} /> : "Vincular"}</button> : <span className="text-xs text-muted">indisponível</span>}
        </div>
        <button className="flex min-h-14 w-full items-center gap-3 px-4 text-left" onClick={() => setPw(true)}><Icon name="shield" /><span className="flex-1 font-semibold">Trocar senha</span><Icon name="next" size={18} className="text-muted" /></button>
        <button className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-danger" onClick={logout} disabled={busy === "out"}><Icon name="logout" /><span className="flex-1 font-semibold">Sair</span>{busy === "out" && <Spinner size={16} />}</button>
      </section>

      <InstallAppBanner />

      <Sheet open={pw} onClose={() => setPw(false)} title="Trocar senha"><PasswordForm onDone={() => { setPw(false); toast("Senha alterada"); }} /></Sheet>
      <Sheet open={uname} onClose={() => setUname(false)} title="Nome de usuário"><UsernameForm current={me.user.displayUsername ?? me.user.username ?? ""} onDone={async () => { setUname(false); toast("Nome de usuário salvo"); await reload(); }} /></Sheet>
    </div>
  );
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault();
      if (next.length < 8) return setErr("Mínimo de 8 caracteres");
      setBusy(true); setErr(null);
      const r = await authClient.changePassword({ currentPassword: cur, newPassword: next, revokeOtherSessions: true });
      setBusy(false);
      if (r.error) setErr(r.error.message ?? "Não foi possível trocar"); else onDone();
    }}>
      <div><label className="label" htmlFor="pc">Senha atual</label><input id="pc" type="password" className="input" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} required /></div>
      <div><label className="label" htmlFor="pn">Nova senha</label><input id="pn" type="password" className="input" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required /></div>
      <p className="text-xs text-muted">As outras sessões abertas serão encerradas.</p>
      {err && <p className="text-sm text-danger" role="alert">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : "Salvar"}</button>
    </form>
  );
}

function UsernameForm({ current, onDone }: { current: string; onDone: () => void }) {
  const [v, setV] = useState(current);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try { await api("/api/me", { method: "PATCH", body: { username: v.trim() } }); onDone(); } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
    }}>
      <input className="input" value={v} onChange={(e) => setV(e.target.value)} pattern="[a-zA-Z0-9_.]{3,24}" autoCapitalize="none" required />
      <p className="text-xs text-muted">3 a 24 caracteres: letras, números, ponto e sublinhado.</p>
      {err && <p className="text-sm text-danger" role="alert">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : "Salvar"}</button>
    </form>
  );
}
