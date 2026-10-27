"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import type { Club, ClubRules, Format, Settings } from "@/lib/client/types";
import { FORMAT_LABEL, TIEBREAKER_LABEL } from "@/lib/client/labels";
import { gsap, reducedMotion } from "@/lib/client/motion";
import { plannedPhases } from "@/lib/tournament/clubRules";
import { normalizeName } from "@/lib/text";
import { Icon, NumberField, Segmented, Toggle, useToast } from "@/components/ui";
import { SortableList } from "@/components/SortableList";
import { ClubRulesEditor, DEFAULT_RULE, clubRulesErrors, ruleSummary } from "@/components/ClubRules";
import { ParticipantSearch, type UserHit } from "@/components/ParticipantSearch";
import { UserAvatar } from "@/components/ParticipantAvatar";

/** Conta do Champz (vínculo real pelo id) ou convidado sem conta. */
type PlayerInput =
  | { kind: "user"; userId: string; name: string; username: string | null; avatarMediaId: string | null }
  | { kind: "guest"; name: string };
type EntryInput = { name: string; players: PlayerInput[] };
type Draft = {
  name: string; edition: string; description: string; visibility: "PRIVATE" | "PUBLIC"; entryType: "SOLO" | "DUO";
  entries: EntryInput[]; format: Format; settings: Settings & { clubRules: ClubRules };
};

const DEFAULT_SETTINGS: Settings = {
  points: { win: 3, draw: 1, loss: 0 },
  tiebreakers: ["POINTS", "WINS", "GOAL_DIFF", "GOALS_FOR", "HEAD_TO_HEAD"],
  bonus: { bestGoalDiff: { enabled: false, points: 1, tiePolicy: "NONE" } },
  walkover: { presentPoints: 3, absentPoints: 0, symbolicScore: { present: 3, absent: 0 }, countStats: true },
  groupStage: { groupCount: 2, legs: 1, qualifiersPerGroup: 2, bestOfRest: 0 },
  knockout: { legs: 1, drawResolution: "PENALTIES", seeding: "RANKED", avoidSameGroup: true },
  media: { maxUploadBytes: 5_000_000, quotaBytes: 500_000_000 },
  clubRules: { default: DEFAULT_RULE, phases: {} },
};
const EMPTY: Draft = { name: "", edition: String(new Date().getFullYear()), description: "", visibility: "PRIVATE", entryType: "SOLO", entries: [], format: "GROUPS_KNOCKOUT", settings: DEFAULT_SETTINGS as Draft["settings"] };
const KEY = "champz:draft:v2";
const STEPS = ["Dados", "Participantes", "Formato", "Regras", "Clubes", "Revisão"];

const toPlayer = (p: PlayerInput) => (p.kind === "user" ? { userId: p.userId } : { guestName: p.name });

/** Nome de convidado limpo: espaços simples; tudo minúsculo vira "Iniciais Maiúsculas". */
function tidyGuest(v: string) {
  const s = v.trim().replace(/\s+/g, " ");
  return s === s.toLowerCase() ? s.replace(/(^|\s)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase()) : s;
}

function groupSizes(n: number, groups: number) {
  if (groups < 1 || n < 1) return [];
  return Array.from({ length: groups }, (_, i) => Math.floor(n / groups) + (i < n % groups ? 1 : 0));
}

function matchCount(d: Draft) {
  const n = d.entries.length;
  const rr = (k: number) => (k * (k - 1)) / 2;
  const legs = d.settings.groupStage.legs;
  if (d.format === "LEAGUE") return rr(n) * legs;
  if (d.format === "KNOCKOUT") return Math.max(0, n - 1);
  const g = groupSizes(n, d.settings.groupStage.groupCount).reduce((s, k) => s + rr(k), 0) * legs;
  if (d.format === "GROUPS_ONLY") return g;
  const q = d.settings.groupStage.qualifiersPerGroup * d.settings.groupStage.groupCount + d.settings.groupStage.bestOfRest;
  return g + Math.max(0, q - 1);
}

export default function NewTournamentPage() {
  const router = useRouter();
  const toast = useToast();
  const [d, setD] = useState<Draft>(EMPTY);
  const { data: clubs } = useApi<Club[]>("/api/clubs");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dir = useRef(1);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restaura rascunho local
      if (raw) { const saved = JSON.parse(raw); setD({ ...EMPTY, ...saved, settings: { ...DEFAULT_SETTINGS, ...saved.settings } }); }
      localStorage.removeItem("champz:draft:v1");
    } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }, [d]);

  useEffect(() => {
    if (reducedMotion() || !panel.current) return;
    gsap.fromTo(panel.current, { x: 40 * dir.current, opacity: 0 }, { x: 0, opacity: 1, duration: 0.45, ease: "power3.out" });
    gsap.fromTo(panel.current.querySelectorAll("[data-reveal]"), { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.04, delay: 0.1 });
    window.scrollTo({ top: 0 });
  }, [step]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const setS = (fn: (s: Draft["settings"]) => Draft["settings"]) => setD((x) => ({ ...x, settings: fn(x.settings) }));

  const n = d.entries.length;
  const phases = plannedPhases(d.format, n, d.settings.groupStage);
  const clubErrors = Object.values(clubRulesErrors(d.settings.clubRules, phases, clubs ?? []));
  const errors: (string | null)[] = [
    d.name.trim().length < 3 ? "Dê um nome com pelo menos 3 letras" : null,
    n < 2 ? "Adicione pelo menos 2 participantes" : d.entries.some((e) => e.players.length !== (d.entryType === "DUO" ? 2 : 1)) ? "Complete as duplas" : null,
    (d.format === "GROUPS_KNOCKOUT" || d.format === "GROUPS_ONLY") && n < d.settings.groupStage.groupCount * 2 ? "Cada grupo precisa de pelo menos 2 participantes" : d.format === "GROUPS_KNOCKOUT" && d.settings.groupStage.qualifiersPerGroup * d.settings.groupStage.groupCount + d.settings.groupStage.bestOfRest < 2 ? "Classifique pelo menos 2 para o mata-mata" : null,
    null,
    clubErrors[0] ?? null,
    null,
  ];

  const go = (to: number) => { dir.current = to > step ? 1 : -1; setStep(to); };
  const next = () => { if (errors[step]) return toast(errors[step]!, "err"); go(step + 1); };

  async function publish(draw: boolean) {
    const firstErr = errors.findIndex(Boolean);
    if (firstErr >= 0) { go(firstErr); return toast(errors[firstErr]!, "err"); }
    setBusy("Criando campeonato…");
    let tid: string | null = null;
    try {
      const t = await api<{ id: string }>("/api/tournaments", {
        body: { name: d.name.trim(), edition: d.edition.trim() || undefined, description: d.description.trim() || undefined, format: d.format, entryType: d.entryType, visibility: d.visibility, settings: d.settings },
      });
      tid = t.id;
      for (let i = 0; i < d.entries.length; i++) {
        setBusy(`Inscrevendo ${i + 1} de ${d.entries.length}…`);
        const e = d.entries[i];
        await api(`/api/tournaments/${tid}/entries`, { body: { name: e.name.trim() || undefined, players: e.players.map(toPlayer) } });
      }
      if (draw) {
        setBusy(d.format === "KNOCKOUT" ? "Sorteando o chaveamento…" : "Sorteando os grupos…");
        await api(`/api/tournaments/${tid}/stages`, { body: { mode: "RANDOM" } });
      }
      localStorage.removeItem(KEY);
      toast(draw ? "Campeonato criado e sorteado!" : "Campeonato criado");
      router.replace(`/app/t/${tid}${draw ? "?sorteio=1" : ""}`);
    } catch (e) {
      toast(errorMessage(e), "err");
      if (tid) router.replace(`/app/t/${tid}`);
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-center gap-3">
        <button onClick={() => (step ? go(step - 1) : router.back())} className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2" aria-label="Voltar"><Icon name="back" /></button>
        <div className="flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Passo {step + 1} de {STEPS.length}</p>
          <h1 className="font-display text-3xl font-extrabold">{STEPS[step]}</h1>
        </div>
      </header>
      <div className="flex gap-1.5" aria-hidden>
        {STEPS.map((s, i) => <button key={s} onClick={() => i < step && go(i)} className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i <= step ? "bg-lime" : "bg-line"}`} />)}
      </div>

      <div ref={panel} className="flex flex-col gap-4">
        {step === 0 && <StepData d={d} set={set} />}
        {step === 1 && <StepEntries d={d} set={set} />}
        {step === 2 && <StepFormat d={d} set={set} setS={setS} />}
        {step === 3 && <StepRules d={d} setS={setS} />}
        {step === 4 && <ClubRulesEditor rules={d.settings.clubRules} onChange={(r) => setS((x) => ({ ...x, clubRules: r }))} phases={phases} clubs={clubs ?? []} />}
        {step === 5 && <StepReview d={d} phases={phases} />}
      </div>

      <div className="sticky z-10 flex gap-2 rounded-2xl bg-bg/90 py-3 backdrop-blur" style={{ bottom: "calc(var(--nav-h) + var(--safe-bottom))" }}>
        {step < STEPS.length - 1 ? (
          <button className="btn btn-primary flex-1" onClick={next}>Continuar <Icon name="next" size={18} /></button>
        ) : (
          <>
            <button className="btn btn-ghost" onClick={() => publish(false)} disabled={!!busy}>Só criar</button>
            <button className="btn btn-primary flex-1" onClick={() => publish(true)} disabled={!!busy}><Icon name="dice" size={20} /> Criar e sortear</button>
          </>
        )}
      </div>

      {busy && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-bg/90 backdrop-blur" role="status">
          <div className="flex flex-col items-center gap-4"><div className="animate-bounce text-6xl" aria-hidden>⚽</div><p className="font-display text-2xl font-bold">{busy}</p></div>
        </div>
      )}
    </div>
  );
}

type SetFn = <K extends keyof Draft>(k: K, v: Draft[K]) => void;

function StepData({ d, set }: { d: Draft; set: SetFn }) {
  return (
    <>
      <div data-reveal><label className="label" htmlFor="name">Nome do campeonato</label><input id="name" className="input" value={d.name} onChange={(e) => set("name", e.target.value)} placeholder="Copa da Firma" maxLength={80} /></div>
      <div data-reveal><label className="label" htmlFor="ed">Edição</label><input id="ed" className="input" value={d.edition} onChange={(e) => set("edition", e.target.value)} maxLength={40} /></div>
      <div data-reveal><label className="label" htmlFor="desc">Descrição (opcional)</label><textarea id="desc" className="input" value={d.description} onChange={(e) => set("description", e.target.value)} maxLength={1000} /></div>
      <div data-reveal><span className="label">Modalidade</span><Segmented options={[{ id: "SOLO", label: "1 contra 1" }, { id: "DUO", label: "Duplas 2v2" }]} value={d.entryType} onChange={(v) => set("entryType", v)} /></div>
      <div data-reveal><span className="label">Visibilidade</span><Segmented options={[{ id: "PRIVATE", label: "Privado" }, { id: "PUBLIC", label: "Público" }]} value={d.visibility} onChange={(v) => set("visibility", v)} /></div>
    </>
  );
}

function StepEntries({ d, set }: { d: Draft; set: SetFn }) {
  const duo = d.entryType === "DUO";
  const [pending, setPending] = useState<PlayerInput | null>(null);
  const [guest, setGuest] = useState("");
  const [guestOpen, setGuestOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const players = [...d.entries.flatMap((e) => e.players), ...(pending ? [pending] : [])];
  const takenUserIds = new Set(players.flatMap((p) => (p.kind === "user" ? [p.userId] : [])));
  const takenNames = new Set(players.flatMap((p) => (p.kind === "user" ? [p.name, p.username ?? ""] : [p.name])).filter(Boolean).map(normalizeName));

  const add = (p: PlayerInput) => {
    setMsg(null);
    if (duo && !pending) { setPending(p); return; }
    set("entries", [...d.entries, { name: "", players: duo ? [pending!, p] : [p] }]);
    setPending(null);
  };
  const pickUser = (u: UserHit) => {
    if (takenUserIds.has(u.id)) return setMsg(`${u.name} já está no campeonato.`);
    add({ kind: "user", userId: u.id, name: u.name, username: u.username, avatarMediaId: u.avatarMediaId });
  };
  const addGuest = (raw: string) => {
    const name = tidyGuest(raw);
    if (name.length < 2) return setMsg("Digite o nome do convidado.");
    if (takenNames.has(normalizeName(name))) return setMsg(`Já existe um participante chamado “${name}”.`);
    add({ kind: "guest", name });
    setGuest("");
  };
  const remove = (i: number) => set("entries", d.entries.filter((_, j) => j !== i));
  const rename = (i: number, name: string) => set("entries", d.entries.map((e, j) => (j === i ? { ...e, name } : e)));
  const who = (p: PlayerInput) => (
    <span className="flex min-w-0 items-center gap-2">
      <UserAvatar name={p.name} mediaId={p.kind === "user" ? p.avatarMediaId : null} size={duo ? 30 : 38} />
      <span className="min-w-0">
        <span className="block truncate font-semibold leading-tight">{p.name}</span>
        <span className="block truncate text-xs text-muted">{p.kind === "user" ? (p.username ? `@${p.username}` : "conta Champz") : "Convidado sem conta"}</span>
      </span>
    </span>
  );
  return (
    <>
      <div data-reveal className="card flex flex-col gap-3 p-4">
        <div>
          <p className="font-display text-xl font-bold">{duo ? (pending ? "Escolha o parceiro" : "Monte as duplas") : "Adicionar participantes"}</p>
          <p className="text-sm text-muted">Busque contas do Champz e toque para adicionar.{duo && " Cada dois jogadores formam uma dupla."}</p>
        </div>
        <ParticipantSearch takenUserIds={takenUserIds} onPick={pickUser} onNoMatch={(q) => { setGuestOpen(true); setGuest(q); }} />
        {pending && (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-lime/60 bg-lime/5 p-2.5">
            <span className="min-w-0 flex-1">{who(pending)}</span>
            <span className="text-xs font-bold text-lime">+ parceiro…</span>
            <button className="grid h-10 w-10 place-items-center rounded-xl text-muted" onClick={() => setPending(null)} aria-label="Cancelar dupla"><Icon name="close" size={18} /></button>
          </div>
        )}
        {msg && <p className="text-sm text-danger" role="alert">{msg}</p>}
        <div className="border-t border-line/60 pt-3">
          {!guestOpen ? (
            <button className="flex min-h-11 w-full items-center gap-2 text-sm font-bold text-muted" onClick={() => setGuestOpen(true)}>
              <Icon name="user" size={18} /> Adicionar convidado sem conta
            </button>
          ) : (
            <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault(); addGuest(guest); }}>
              <label className="label mb-0" htmlFor="guest">Convidado sem conta</label>
              <p className="-mt-1 text-xs text-muted">Para quem não tem login. Não fica vinculado a nenhuma conta.</p>
              <div className="flex gap-2">
                <input id="guest" className="input" value={guest} onChange={(e) => { setGuest(e.target.value); setMsg(null); }} placeholder="Nome do convidado" maxLength={60} autoComplete="off" />
                <button className="btn btn-ghost shrink-0" aria-label="Adicionar convidado"><Icon name="plus" size={20} /></button>
              </div>
            </form>
          )}
        </div>
      </div>
      <p data-reveal className="text-sm text-muted">{d.entries.length} {duo ? (d.entries.length === 1 ? "dupla" : "duplas") : d.entries.length === 1 ? "participante" : "participantes"}</p>
      <ul className="flex flex-col gap-2">
        {d.entries.map((e, i) => (
          <li key={e.players.map((p) => (p.kind === "user" ? p.userId : `g:${p.name}`)).join("+")} data-reveal className="card flex items-center gap-2 p-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-bold text-muted">{i + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {duo && <input className="input min-h-10 text-sm" placeholder={`Nome da dupla (opcional): ${e.players.map((p) => p.name.split(" ")[0]).join(" & ")}`} value={e.name} onChange={(ev) => rename(i, ev.target.value)} maxLength={60} />}
              <div className={`grid gap-2 ${duo ? "grid-cols-2" : ""}`}>{e.players.map((p, k) => <span key={k} className="min-w-0">{who(p)}</span>)}</div>
            </div>
            <button className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-danger" onClick={() => remove(i)} aria-label={`Remover ${e.players.map((p) => p.name).join(" e ")}`}><Icon name="trash" size={20} /></button>
          </li>
        ))}
      </ul>
    </>
  );
}

function StepFormat({ d, set, setS }: { d: Draft; set: SetFn; setS: (fn: (s: Draft["settings"]) => Draft["settings"]) => void }) {
  const gs = d.settings.groupStage;
  const groups = d.format === "GROUPS_KNOCKOUT" || d.format === "GROUPS_ONLY";
  const sizes = groupSizes(d.entries.length, gs.groupCount);
  const qualified = gs.qualifiersPerGroup * gs.groupCount + gs.bestOfRest;
  const upd = (patch: Partial<Settings["groupStage"]>) => setS((s) => ({ ...s, groupStage: { ...s.groupStage, ...patch } }));
  return (
    <>
      <div data-reveal className="grid grid-cols-2 gap-2">
        {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
          <button key={f} onClick={() => set("format", f)} className={`card min-h-20 p-3 text-left transition-colors ${d.format === f ? "border-lime bg-lime/10" : ""}`}>
            <Icon name={f === "KNOCKOUT" ? "bracket" : f === "LEAGUE" ? "chart" : "grid"} className={d.format === f ? "text-lime" : "text-muted"} />
            <p className="mt-1 font-bold">{FORMAT_LABEL[f]}</p>
          </button>
        ))}
      </div>
      {(groups || d.format === "LEAGUE") && (
        <div data-reveal className="card flex flex-col divide-y divide-line px-4">
          {groups && <NumberField label="Grupos" value={gs.groupCount} min={1} max={Math.max(1, Math.floor(d.entries.length / 2))} onChange={(v) => upd({ groupCount: v })} />}
          <div className="py-3"><span className="label">Turnos</span><Segmented options={[{ id: "1", label: "Só ida" }, { id: "2", label: "Ida e volta" }]} value={String(gs.legs)} onChange={(v) => upd({ legs: Number(v) as 1 | 2 })} /></div>
          {d.format === "GROUPS_KNOCKOUT" && (
            <>
              <NumberField label="Classificam por grupo" value={gs.qualifiersPerGroup} min={0} max={8} onChange={(v) => upd({ qualifiersPerGroup: v })} />
              <NumberField label="Melhores entre os demais" value={gs.bestOfRest} min={0} max={16} onChange={(v) => upd({ bestOfRest: v })} />
            </>
          )}
        </div>
      )}
      <div data-reveal className="card p-4">
        <p className="text-xs font-bold uppercase tracking-widest text-muted">Prévia</p>
        {groups && sizes.length > 0 && <p className="mt-2 text-sm">{sizes.map((s, i) => `Grupo ${String.fromCharCode(65 + i)}: ${s}`).join(" · ")}</p>}
        {d.format === "GROUPS_KNOCKOUT" && <p className="mt-1 text-sm">{qualified} classificados para o mata-mata{qualified & (qualified - 1) ? " (com folgas na 1ª fase)" : ""}</p>}
        <p className="mt-2 font-display text-3xl font-extrabold text-lime">≈ {matchCount(d)} jogos</p>
        <p className="text-xs text-muted">Estimativa; o servidor gera os jogos e calcula tudo.</p>
      </div>
    </>
  );
}

function StepRules({ d, setS }: { d: Draft; setS: (fn: (s: Draft["settings"]) => Draft["settings"]) => void }) {
  const s = d.settings;
  const hasKO = d.format === "KNOCKOUT" || d.format === "GROUPS_KNOCKOUT";
  return (
    <>
      <div data-reveal className="card divide-y divide-line px-4">
        <p className="py-3 text-xs font-bold uppercase tracking-widest text-muted">Pontuação</p>
        <NumberField label="Vitória" value={s.points.win} max={10} onChange={(v) => setS((x) => ({ ...x, points: { ...x.points, win: v } }))} />
        <NumberField label="Empate" value={s.points.draw} max={10} onChange={(v) => setS((x) => ({ ...x, points: { ...x.points, draw: v } }))} />
        <NumberField label="Derrota" value={s.points.loss} min={-5} max={10} onChange={(v) => setS((x) => ({ ...x, points: { ...x.points, loss: v } }))} />
      </div>
      <div data-reveal className="card px-4 py-3">
        <p className="mb-1 text-xs font-bold uppercase tracking-widest text-muted">Ordem de desempate</p>
        <p className="mb-3 text-xs text-muted">Segure <Icon name="grip" size={14} className="inline align-[-2px]" /> e arraste para reordenar.</p>
        <SortableList items={s.tiebreakers} keyOf={(t) => t} label={(t) => TIEBREAKER_LABEL[t] ?? t} onChange={(next) => setS((x) => ({ ...x, tiebreakers: next }))} />
        <p className="mt-2 text-xs text-muted">Empate que nenhum critério resolve fica marcado para decisão manual.</p>
      </div>
      <div data-reveal className="card px-4 py-2">
        <Toggle label="Bônus de melhor saldo" hint="+1 ponto ao melhor saldo quando o grupo encerra" checked={s.bonus.bestGoalDiff.enabled} onChange={(v) => setS((x) => ({ ...x, bonus: { bestGoalDiff: { ...x.bonus.bestGoalDiff, enabled: v } } }))} />
        {s.bonus.bestGoalDiff.enabled && (
          <div className="pb-3"><span className="label">Se houver empate no melhor saldo</span>
            <Segmented options={[{ id: "ALL", label: "Todos" }, { id: "TIEBREAK", label: "Gols pró" }, { id: "NONE", label: "Ninguém" }]} value={s.bonus.bestGoalDiff.tiePolicy} onChange={(v) => setS((x) => ({ ...x, bonus: { bestGoalDiff: { ...x.bonus.bestGoalDiff, tiePolicy: v } } }))} />
          </div>
        )}
      </div>
      <div data-reveal className="card divide-y divide-line px-4">
        <p className="py-3 text-xs font-bold uppercase tracking-widest text-muted">W.O. (ausência)</p>
        <NumberField label="Pontos de quem compareceu" value={s.walkover.presentPoints} max={10} onChange={(v) => setS((x) => ({ ...x, walkover: { ...x.walkover, presentPoints: v } }))} />
        <NumberField label="Pontos do ausente" value={s.walkover.absentPoints} min={-5} max={10} onChange={(v) => setS((x) => ({ ...x, walkover: { ...x.walkover, absentPoints: v } }))} />
        <Toggle label="Placar simbólico 3 x 0" checked={!!s.walkover.symbolicScore} onChange={(v) => setS((x) => ({ ...x, walkover: { ...x.walkover, symbolicScore: v ? { present: 3, absent: 0 } : null } }))} />
        <Toggle label="W.O. conta nas estatísticas" checked={s.walkover.countStats} onChange={(v) => setS((x) => ({ ...x, walkover: { ...x.walkover, countStats: v } }))} />
      </div>
      {hasKO && (
        <div data-reveal className="card px-4 py-3">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Mata-mata</p>
          <span className="label">Empate no mata-mata</span>
          <Segmented options={[{ id: "PENALTIES", label: "Pênaltis" }, { id: "MANUAL", label: "Decisão do admin" }]} value={s.knockout.drawResolution} onChange={(v) => setS((x) => ({ ...x, knockout: { ...x.knockout, drawResolution: v } }))} />
          {d.format === "GROUPS_KNOCKOUT" && <Toggle label="Evitar reencontro do mesmo grupo" hint="Quando for possível na primeira fase" checked={s.knockout.avoidSameGroup} onChange={(v) => setS((x) => ({ ...x, knockout: { ...x.knockout, avoidSameGroup: v } }))} />}
        </div>
      )}
    </>
  );
}

function StepReview({ d, phases }: { d: Draft; phases: { key: string; label: string }[] }) {
  const s = d.settings;
  const rows: [string, string][] = [
    ["Nome", `${d.name}${d.edition ? ` · ${d.edition}` : ""}`],
    ["Modalidade", d.entryType === "DUO" ? "Duplas 2v2" : "1 contra 1"],
    ["Participantes", String(d.entries.length)],
    ["Formato", FORMAT_LABEL[d.format]],
    ...(d.format === "GROUPS_KNOCKOUT" || d.format === "GROUPS_ONLY" ? [["Grupos", `${s.groupStage.groupCount} · ${s.groupStage.legs === 2 ? "ida e volta" : "só ida"}`] as [string, string]] : []),
    ...(d.format === "GROUPS_KNOCKOUT" ? [["Classificação", `${s.groupStage.qualifiersPerGroup} por grupo + ${s.groupStage.bestOfRest} melhores`] as [string, string]] : []),
    ["Pontos", `V ${s.points.win} · E ${s.points.draw} · D ${s.points.loss}`],
    ["Desempate", s.tiebreakers.map((t) => TIEBREAKER_LABEL[t]).join(" › ")],
    ["W.O.", `${s.walkover.presentPoints} x ${s.walkover.absentPoints} pts${s.walkover.symbolicScore ? " · 3 x 0" : ""}`],
    ["Clubes", ruleSummary(s.clubRules.default)],
    ...phases.filter((p) => s.clubRules.phases[p.key]).map((p) => [`  ${p.label}`, ruleSummary(s.clubRules.phases[p.key])] as [string, string]),
    ["Jogos estimados", String(matchCount(d))],
  ];
  return (
    <div data-reveal className="card divide-y divide-line">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-4 px-4 py-3 text-sm"><span className="w-28 shrink-0 text-muted">{k}</span><span className="font-semibold">{v}</span></div>
      ))}
    </div>
  );
}
