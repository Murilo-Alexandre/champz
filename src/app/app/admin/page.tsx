"use client";
import { useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import { fmtDate } from "@/lib/client/labels";
import { useGSAP, revealChildren } from "@/lib/client/motion";
import { useMe } from "@/components/AppShell";
import { UserAvatar } from "@/components/ParticipantAvatar";
import { EmptyState, ErrorState, Icon, Segmented, Sheet, Skeleton, Spinner, useToast } from "@/components/ui";

type AdminUser = { id: string; name: string; email: string; username: string | null; role: "SUPERADMIN" | "ADMIN" | "USER"; banned: boolean; banReason: string | null; mustChangePassword: boolean; createdAt: string; providers: string[]; isSuperadmin: boolean };
type Page = { items: AdminUser[]; total: number; page: number; pageSize: number };

const ROLE: Record<AdminUser["role"], string> = { SUPERADMIN: "Superadmin", ADMIN: "Admin", USER: "Usuário" };

export default function AdminPage() {
  const { me } = useMe();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const list = useApi<Page>(me.user.role === "USER" ? null : `/api/admin/users?pageSize=50${q ? `&search=${encodeURIComponent(q)}` : ""}`);
  const [sel, setSel] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => revealChildren(ref.current), { scope: ref, dependencies: [list.data] });

  if (me.user.role === "USER") return <EmptyState icon="shield" title="Área restrita">Somente administradores do Champz.</EmptyState>;

  return (
    <div ref={ref} className="flex flex-col gap-4">
      <header data-reveal className="flex items-center justify-between">
        <div><p className="text-sm text-muted">Administração</p><h1 className="font-display text-4xl font-extrabold">Usuários</h1></div>
        <button className="grid h-12 w-12 place-items-center rounded-2xl bg-lime text-lime-ink" onClick={() => setCreating(true)} aria-label="Criar usuário"><Icon name="plus" size={26} /></button>
      </header>
      <form data-reveal onSubmit={(e) => { e.preventDefault(); setQ(search.trim()); }}>
        <input className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, e-mail ou usuário" />
      </form>

      {list.loading && !list.data ? <><Skeleton className="h-16" /><Skeleton className="h-16" /></> : list.error ? <ErrorState message={list.error.message} onRetry={list.reload} /> : (
        <div className="card divide-y divide-line" data-reveal>
          {list.data?.items.map((u) => (
            <button key={u.id} onClick={() => setSel(u)} className="flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left">
              <UserAvatar name={u.name} size={40} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{u.name} {u.banned && <span className="text-xs text-danger">· bloqueado</span>}</p>
                <p className="truncate text-xs text-muted">@{u.username} · {u.email}</p>
              </div>
              <span className={`chip ${u.role !== "USER" ? "border-lime/40 text-lime" : ""}`}>{ROLE[u.role]}</span>
            </button>
          ))}
          <p className="px-4 py-3 text-xs text-muted">{list.data?.total ?? 0} usuário(s)</p>
        </div>
      )}

      <Sheet open={creating} onClose={() => setCreating(false)} title="Novo usuário">
        <CreateUser canAdmin={me.isSuperadmin} onCreated={(who, password) => { setCreating(false); setSecret({ who, password }); list.reload(); }} />
      </Sheet>

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.name}>
        {sel && <UserActions key={sel.id} user={sel} meId={me.user.id} superadmin={me.isSuperadmin} onSecret={(p) => setSecret({ who: sel.name, password: p })} onChanged={() => { setSel(null); list.reload(); }} toast={toast} />}
      </Sheet>

      <Sheet open={!!secret} onClose={() => setSecret(null)} title="Senha temporária">
        {secret && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">Envie para <b className="text-text">{secret.who}</b> por um canal privado. Ela aparece só agora e precisa ser trocada no primeiro acesso.</p>
            <button className="rounded-2xl bg-surface-2 p-4 text-center font-mono text-xl tracking-wider" onClick={() => { navigator.clipboard?.writeText(secret.password); toast("Copiada"); }}>{secret.password}</button>
            <button className="btn btn-primary" onClick={() => setSecret(null)}>Pronto</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function CreateUser({ canAdmin, onCreated }: { canAdmin: boolean; onCreated: (who: string, password: string) => void }) {
  const [f, setF] = useState({ name: "", email: "", username: "", role: "USER" as "USER" | "ADMIN" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <form className="flex flex-col gap-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      try {
        const r = await api<{ user: { name: string }; temporaryPassword: string }>("/api/admin/users", { body: f });
        onCreated(r.user.name, r.temporaryPassword);
      } catch (e2) { setErr(errorMessage(e2)); } finally { setBusy(false); }
    }}>
      <div><label className="label" htmlFor="cn">Nome</label><input id="cn" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
      <div><label className="label" htmlFor="ce">E-mail</label><input id="ce" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
      <div><label className="label" htmlFor="cu">Usuário</label><input id="cu" className="input" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} pattern="[a-zA-Z0-9_.]{3,24}" autoCapitalize="none" required /></div>
      {canAdmin && <Segmented options={[{ id: "USER", label: "Usuário" }, { id: "ADMIN", label: "Admin" }]} value={f.role} onChange={(role) => setF({ ...f, role })} />}
      {err && <p className="text-sm text-danger" role="alert">{err}</p>}
      <button className="btn btn-primary" disabled={busy}>{busy ? <Spinner /> : "Criar com senha temporária"}</button>
    </form>
  );
}

function UserActions({ user, meId, superadmin, onSecret, onChanged, toast }: { user: AdminUser; meId: string; superadmin: boolean; onSecret: (p: string) => void; onChanged: () => void; toast: (t: string, tone?: "ok" | "err") => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const protectedUser = user.isSuperadmin || user.id === meId;
  const run = async (key: string, path: string, body: unknown, ok: string, method = "POST") => {
    setBusy(key);
    try {
      const r = await api<{ temporaryPassword?: string }>(`/api/admin/users/${user.id}/${path}`, { method, body });
      toast(ok);
      if (r?.temporaryPassword) onSecret(r.temporaryPassword);
      onChanged();
    } catch (e) { toast(errorMessage(e), "err"); } finally { setBusy(null); }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-muted">
        <p>@{user.username} · {user.email}</p>
        <p>Desde {fmtDate(user.createdAt)} · login: {user.providers.map((p) => (p === "credential" ? "senha" : p)).join(", ")}</p>
        {user.banned && <p className="text-danger">Bloqueado: {user.banReason}</p>}
      </div>
      {protectedUser ? (
        <p className="rounded-xl bg-surface-2 p-3 text-sm text-muted">{user.isSuperadmin ? "O Superadmin é protegido e não pode ser alterado por aqui." : "Use o seu perfil para alterar a própria conta."}</p>
      ) : (
        <>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => run("reset", "reset-password", {}, "Senha redefinida")}>{busy === "reset" ? <Spinner /> : "Gerar senha temporária"}</button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={() => run("rev", "revoke-sessions", {}, "Sessões encerradas")}>{busy === "rev" ? <Spinner /> : "Encerrar sessões"}</button>
          {user.providers.includes("google") && <button className="btn btn-ghost" disabled={!!busy} onClick={() => run("ug", "unlink-google", {}, "Google desvinculado")}>Desvincular Google</button>}
          {superadmin && (
            <button className="btn btn-ghost" disabled={!!busy} onClick={() => run("role", "role", { role: user.role === "ADMIN" ? "USER" : "ADMIN" }, "Papel alterado", "PUT")}>{user.role === "ADMIN" ? "Remover admin" : "Tornar admin"}</button>
          )}
          {user.banned ? (
            <button className="btn btn-primary" disabled={!!busy} onClick={() => run("unban", "unban", {}, "Desbloqueado")}>Desbloquear</button>
          ) : (
            <div className="flex flex-col gap-2 rounded-2xl border border-danger/30 p-3">
              <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo do bloqueio" />
              <button className="btn btn-danger" disabled={!!busy || reason.trim().length < 3} onClick={() => run("ban", "ban", { reason: reason.trim() }, "Usuário bloqueado")}>Bloquear acesso</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
