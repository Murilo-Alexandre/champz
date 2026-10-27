"use client";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import type { Club, ClubRules, Membership, PublicUser, TournamentView } from "@/lib/client/types";
import { plannedPhases } from "@/lib/tournament/clubRules";
import { ClubRulesEditor, DEFAULT_RULE, clubRulesErrors } from "@/components/ClubRules";
import { ParticipantSearch } from "@/components/ParticipantSearch";
import { ROLE_LABEL, TIEBREAKER_LABEL } from "@/lib/client/labels";
import { hasPermission } from "@/lib/permissions";
import { Icon, Segmented, Sheet, Spinner, Toggle, useToast } from "@/components/ui";
import { ParticipantAvatar, UserAvatar } from "@/components/ParticipantAvatar";

type Member = Membership & { user: PublicUser };
const FLAGS: { key: keyof Membership; label: string; hint: string }[] = [
  { key: "canEditResult", label: "Lançar placares", hint: "Inserir e corrigir resultados" },
  { key: "canUploadMedia", label: "Enviar fotos", hint: "Galeria e comprovantes" },
  { key: "canEditClubs", label: "Definir clubes", hint: "Escolher e sortear clubes" },
  { key: "canDraw", label: "Sorteios e fases", hint: "Gerar grupos e mata-mata" },
  { key: "canEditRules", label: "Editar regras", hint: "Pontuação e desempates" },
  { key: "canManageMembers", label: "Gerenciar membros", hint: "Permissões e convites" },
];

export function ManagePanel({ view, onChanged, lockedPhases = [] }: { view: TournamentView; onChanged: () => Promise<void>; lockedPhases?: string[] }) {
  const { tournament: t, myMembership: me, entries } = view;
  const toast = useToast();
  const members = useApi<Member[]>(`/api/tournaments/${t.id}/members`);
  const canMembers = hasPermission(me, "MANAGE_MEMBERS");
  const canDraw = hasPermission(me, "DRAW_EDIT");
  const [edit, setEdit] = useState<Member | null>(null);
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const [withdraw, setWithdraw] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [guest, setGuest] = useState("");
  const clubs = useApi<Club[]>("/api/clubs");
  const canRules = hasPermission(me, "RULE_EDIT");
  const [rules, setRules] = useState<ClubRules>(() => t.settings.clubRules ?? { default: DEFAULT_RULE, phases: {} });
  const activeCount = entries.filter((e) => e.active).length;
  const phases = plannedPhases(t.format, activeCount, t.settings.groupStage);
  const rulesDirty = JSON.stringify(rules) !== JSON.stringify(t.settings.clubRules ?? { default: DEFAULT_RULE, phases: {} });
  const rulesErr = Object.values(clubRulesErrors(rules, phases, clubs.data ?? []))[0];
  const takenUserIds = new Set(entries.flatMap((e) => e.players.flatMap((p) => (p.userId ? [p.userId] : []))));
  const addEntry = (player: { userId: string } | { guestName: string }) => run("entry", () => api(`/api/tournaments/${t.id}/entries`, { body: { players: [player] } }), "Participante inscrito");

  async function run(key: string, fn: () => Promise<unknown>, ok: string) {
    setBusy(key);
    try { await fn(); toast(ok); await members.reload(); await onChanged(); return true; } catch (e) { toast(errorMessage(e), "err"); return false; } finally { setBusy(null); }
  }

  const s = t.settings;
  return (
    <div className="flex flex-col gap-4">
      <section data-reveal className="card p-4">
        <h3 className="mb-3 font-display text-xl font-bold">{t.entryType === "DUO" ? "Duplas" : "Participantes"} ({entries.length})</h3>
        <ul className="flex flex-col">
          {entries.map((e) => (
            <li key={e.id} className={`flex min-h-12 items-center gap-3 border-t border-line/60 py-2 first:border-t-0 ${e.active ? "" : "opacity-50"}`}>
              <ParticipantAvatar entry={e} size={34} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{e.name}</p>
                <p className="truncate text-xs text-muted">{e.active ? e.players.map((p) => (p.user ? `@${p.user.username}` : "convidado")).join(" · ") : `Desistiu: ${e.withdrawNote ?? ""}`}</p>
              </div>
              {canDraw && e.active && t.status === "ACTIVE" && <button className="btn btn-danger btn-sm" onClick={() => { setReason(""); setWithdraw({ id: e.id, name: e.name }); }}>Desistência</button>}
            </li>
          ))}
        </ul>
        {canMembers && ["DRAFT", "OPEN"].includes(t.status) && t.entryType === "SOLO" && (
          <div className="mt-3 flex flex-col gap-2">
            <ParticipantSearch takenUserIds={takenUserIds} onPick={(u) => addEntry({ userId: u.id })} onNoMatch={(q) => setGuest(q)} />
            <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); const v = guest.trim().replace(/\s+/g, " "); if (v.length < 2) return; addEntry({ guestName: v }).then((ok) => ok && setGuest("")); }}>
              <input className="input" value={guest} onChange={(e) => setGuest(e.target.value)} placeholder="Convidado sem conta" maxLength={60} aria-label="Nome do convidado sem conta" />
              <button className="btn btn-ghost shrink-0" disabled={busy === "entry"} aria-label="Adicionar convidado">{busy === "entry" ? <Spinner /> : <Icon name="plus" />}</button>
            </form>
          </div>
        )}
      </section>

      <section data-reveal className="card p-4">
        <div className="mb-3 flex items-center justify-between"><h3 className="font-display text-xl font-bold">Membros</h3>{members.loading && <Spinner size={16} />}</div>
        {(members.data ?? []).map((m) => (
          <button key={m.id} disabled={!canMembers || m.role === "OWNER" || m.userId === me?.userId} onClick={() => setEdit(m)} className="flex min-h-12 w-full items-center gap-3 border-t border-line/60 py-2 text-left first:border-t-0">
            <UserAvatar name={m.user.name} mediaId={m.user.avatarMediaId} size={34} />
            <div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.user.name}</p><p className="text-xs text-muted">@{m.user.username} · {ROLE_LABEL[m.role]}</p></div>
            {canMembers && m.role !== "OWNER" && m.userId !== me?.userId && <Icon name="edit" size={18} className="text-muted" />}
          </button>
        ))}
        {canMembers && (
          <div className="mt-3 flex flex-col gap-2">
            <form className="flex gap-2" onSubmit={(ev) => { ev.preventDefault(); if (!username.trim()) return; run("member", () => api(`/api/tournaments/${t.id}/members`, { body: { username: username.trim().replace(/^@/, ""), role: "PARTICIPANT" } }), "Membro adicionado").then((ok) => ok && setUsername("")); }}>
              <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="@usuario" autoCapitalize="none" />
              <button className="btn btn-primary shrink-0" disabled={busy === "member"}>{busy === "member" ? <Spinner /> : "Adicionar"}</button>
            </form>
            <button className="btn btn-ghost" disabled={busy === "invite"} onClick={async () => {
              setBusy("invite");
              try {
                const inv = await api<{ token: string }>(`/api/tournaments/${t.id}/invites`, { body: { role: "PARTICIPANT", expiresInHours: 72 } });
                const link = `${window.location.origin}/convite/${inv.token}`;
                setInvite(link);
                if (navigator.share) navigator.share({ title: t.name, text: `Entre no ${t.name} no Champz`, url: link }).catch(() => {});
              } catch (e) { toast(errorMessage(e), "err"); } finally { setBusy(null); }
            }}>{busy === "invite" ? <Spinner /> : <><Icon name="link" size={18} /> Gerar link de convite (72h)</>}</button>
            {invite && (
              <button className="break-all rounded-xl bg-surface-2 p-3 text-left text-xs" onClick={() => { navigator.clipboard?.writeText(invite); toast("Link copiado"); }}>{invite}<span className="mt-1 block font-bold text-lime">Toque para copiar</span></button>
            )}
          </div>
        )}
      </section>

      <section data-reveal className="card p-4">
        <h3 className="mb-2 font-display text-xl font-bold">Regulamento</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Pontos</dt><dd>V {s.points.win} · E {s.points.draw} · D {s.points.loss}</dd>
          <dt className="text-muted">Desempate</dt><dd>{s.tiebreakers.map((x) => TIEBREAKER_LABEL[x] ?? x).join(" › ")}</dd>
          <dt className="text-muted">W.O.</dt><dd>{s.walkover.presentPoints} x {s.walkover.absentPoints} pts{s.walkover.symbolicScore ? ` · placar ${s.walkover.symbolicScore.present} x ${s.walkover.symbolicScore.absent}` : ""}</dd>
          {s.bonus.bestGoalDiff.enabled && <><dt className="text-muted">Bônus</dt><dd>+{s.bonus.bestGoalDiff.points} ao melhor saldo do grupo</dd></>}
          {(t.format === "GROUPS_KNOCKOUT" || t.format === "KNOCKOUT") && <><dt className="text-muted">Empate no mata-mata</dt><dd>{s.knockout.drawResolution === "PENALTIES" ? "Pênaltis" : "Decisão administrativa"}</dd></>}
        </dl>
        <p className="mt-3 text-xs text-muted">Versão {t.settingsVersion} das regras. Alterações ficam no histórico.</p>
      </section>

      {canRules && t.status !== "FINISHED" && t.status !== "CANCELLED" && (
        <section data-reveal className="flex flex-col gap-3">
          <div className="px-1">
            <h3 className="font-display text-xl font-bold">Clubes por fase</h3>
            <p className="text-xs text-muted">Fases já disputadas mantêm a regra. Alterações ficam no histórico.</p>
          </div>
          <ClubRulesEditor rules={rules} onChange={setRules} phases={phases} clubs={clubs.data ?? []} locked={lockedPhases} />
          {rulesDirty && (
            <div className="flex gap-2">
              <button className="btn btn-ghost" onClick={() => setRules(t.settings.clubRules ?? { default: DEFAULT_RULE, phases: {} })}>Descartar</button>
              <button className="btn btn-primary flex-1" disabled={busy === "rules" || !!rulesErr} onClick={() => run("rules", () => api(`/api/tournaments/${t.id}/settings`, { method: "PATCH", body: { settings: { clubRules: rules }, expectedVersion: t.settingsVersion, reason: "Regras de clubes por fase" } }), "Regras de clubes salvas")}>
                {busy === "rules" ? <Spinner /> : "Salvar regras de clubes"}
              </button>
            </div>
          )}
        </section>
      )}

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit?.user.name}>
        {edit && <MemberEditor key={edit.id} member={edit} onSave={async (patch) => { const ok = await run("perm", () => api(`/api/tournaments/${t.id}/members/${edit.id}`, { method: "PATCH", body: patch }), "Permissões salvas"); if (ok) setEdit(null); }} busy={busy === "perm"} />}
      </Sheet>

      <Sheet open={!!withdraw} onClose={() => setWithdraw(null)} title="Registrar desistência">
        {withdraw && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted"><b className="text-text">{withdraw.name}</b> não será apagado: os jogos já disputados permanecem e os pendentes seguem a regra de W.O.</p>
            <label className="label" htmlFor="wr">Motivo</label>
            <input id="wr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            <button className="btn btn-danger" disabled={busy === "wd" || reason.trim().length < 3} onClick={async () => { const ok = await run("wd", () => api(`/api/tournaments/${t.id}/entries/${withdraw.id}/withdraw`, { body: { reason: reason.trim() } }), "Desistência registrada"); if (ok) setWithdraw(null); }}>{busy === "wd" ? <Spinner /> : "Confirmar desistência"}</button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function MemberEditor({ member, onSave, busy }: { member: Member; onSave: (patch: Partial<Membership>) => void; busy: boolean }) {
  const [m, setM] = useState<Member>(member);
  return (
    <div className="flex flex-col gap-3">
      <Segmented options={[{ id: "PARTICIPANT", label: "Participante" }, { id: "ADMIN", label: "Admin" }, { id: "VIEWER", label: "Espectador" }]} value={m.role === "OWNER" ? "ADMIN" : m.role} onChange={(role) => setM({ ...m, role })} />
      {m.role === "PARTICIPANT" ? (
        <div className="divide-y divide-line">
          {FLAGS.map((f) => <Toggle key={f.key} label={f.label} hint={f.hint} checked={!!m[f.key]} onChange={(v) => setM({ ...m, [f.key]: v })} />)}
        </div>
      ) : (
        <p className="text-sm text-muted">{m.role === "ADMIN" ? "Admins têm todas as permissões do campeonato." : "Espectadores só visualizam."}</p>
      )}
      <button className="btn btn-primary" disabled={busy} onClick={() => onSave({ role: m.role, ...Object.fromEntries(FLAGS.map((f) => [f.key, m[f.key]])) })}>{busy ? <Spinner /> : "Salvar"}</button>
    </div>
  );
}
