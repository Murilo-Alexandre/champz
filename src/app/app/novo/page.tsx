"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import type { Club, Format, Settings } from "@/lib/client/types";
import { FORMAT_LABEL, TIEBREAKER_LABEL } from "@/lib/client/labels";
import { gsap, reducedMotion } from "@/lib/client/motion";
import { Icon, NumberField, Segmented, Toggle, useToast } from "@/components/ui";
import { ClubBadge } from "@/components/ClubBadge";

type PlayerInput = { value: string };
type EntryInput = { name: string; players: PlayerInput[] };
type ClubMode = "RANDOM" | "PLAYER_CHOICE" | "MANUAL";
type Draft = {
  name: string; edition: string; description: string; visibility: "PRIVATE" | "PUBLIC"; entryType: "SOLO" | "DUO";
  entries: EntryInput[]; format: Format; settings: Settings; clubMode: ClubMode; allowRepeat: boolean; allowedClubIds: string[];
};

const DEFAULT_SETTINGS: Settings = {
  points: { win: 3, draw: 1, loss: 0 },
  tiebreakers: ["POINTS", "WINS", "GOAL_DIFF", "GOALS_FOR", "HEAD_TO_HEAD"],
  bonus: { bestGoalDiff: { enabled: false, points: 1, tiePolicy: "NONE" } },
  walkover: { presentPoints: 3, absentPoints: 0, symbolicScore: { present: 3, absent: 0 }, countStats: true },
  groupStage: { groupCount: 2, legs: 1, qualifiersPerGroup: 2, bestOfRest: 0 },
  knockout: { legs: 1, drawResolution: "PENALTIES", seeding: "RANKED", avoidSameGroup: true },
  media: { maxUploadBytes: 5_000_000, quotaBytes: 500_000_000 },
};
const EMPTY: Draft = { name: "", edition: String(new Date().getFullYear()), description: "", visibility: "PRIVATE", entryType: "SOLO", entries: [], format: "GROUPS_KNOCKOUT", settings: DEFAULT_SETTINGS, clubMode: "RANDOM", allowRepeat: false, allowedClubIds: [] };
const KEY = "champz:draft:v1";
const STEPS = ["Dados", "Participantes", "Formato", "Regras", "Clubes", "Revisão"];

/** "@usuario" vincula conta existente; qualquer outro texto vira convidado sem conta. */
function toPlayer(v: string) {
  const s = v.trim();
  return s.startsWith("@") ? { username: s.slice(1) } : { guestName: s };
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
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const dir = useRef(1);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restaura rascunho local
      if (raw) setD({ ...EMPTY, ...JSON.parse(raw) });
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
  const setS = (fn: (s: Settings) => Settings) => setD((x) => ({ ...x, settings: fn(x.settings) }));

  const n = d.entries.length;
  const errors: (string | null)[] = [
    d.name.trim().length < 3 ? "Dê um nome com pelo menos 3 letras" : null,
    n < 2 ? "Adicione pelo menos 2 participantes" : d.entries.some((e) => e.players.some((p) => !p.value.trim())) ? "Preencha todos os jogadores" : null,
    (d.format === "GROUPS_KNOCKOUT" || d.format === "GROUPS_ONLY") && n < d.settings.groupStage.groupCount * 2 ? "Cada grupo precisa de pelo menos 2 participantes" : d.format === "GROUPS_KNOCKOUT" && d.settings.groupStage.qualifiersPerGroup * d.settings.groupStage.groupCount + d.settings.groupStage.bestOfRest < 2 ? "Classifique pelo menos 2 para o mata-mata" : null,
    null,
    d.clubMode !== "MANUAL" && d.allowedClubIds.length > 0 && !d.allowRepeat && d.allowedClubIds.length < Math.min(n, 2) ? "Escolha mais clubes ou permita repetição" : null,
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
        await api(`/api/tournaments/${tid}/entries`, { body: { name: e.name.trim() || undefined, players: e.players.map((p) => toPlayer(p.value)) } });
      }
      if (draw) {
        setBusy(d.format === "KNOCKOUT" ? "Sorteando o chaveamento…" : "Sorteando os grupos…");
        await api(`/api/tournaments/${tid}/stages`, { body: { mode: "RANDOM", clubs: { mode: d.clubMode, allowRepeat: d.allowRepeat, allowedClubIds: d.allowedClubIds } } });
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
        {step === 4 && <StepClubs d={d} set={set} />}
        {step === 5 && <StepReview d={d} />}
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
  const [text, setText] = useState("");
  const duo = d.entryType === "DUO";
  const add = () => {
    const names = text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const fresh: EntryInput[] = duo
      ? Array.from({ length: Math.ceil(names.length / 2) }, (_, i) => ({ name: "", players: [{ value: names[i * 2] }, { value: names[i * 2 + 1] ?? "" }] }))
      : names.map((v) => ({ name: "", players: [{ value: v }] }));
    set("entries", [...d.entries, ...fresh]);
    setText("");
  };
  const update = (i: number, fn: (e: EntryInput) => EntryInput) => set("entries", d.entries.map((e, j) => (j === i ? fn(e) : e)));
  return (
    <>
      <div data-reveal className="card p-4">
        <label className="label" htmlFor="names">{duo ? "Jogadores (em pares, na ordem)" : "Participantes"}</label>
        <textarea id="names" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={"Um por linha ou separados por vírgula.\nUse @usuario para vincular uma conta do Champz."} />
        <button className="btn btn-ghost mt-3 w-full" onClick={add}><Icon name="plus" size={18} /> Adicionar</button>
      </div>
      <p data-reveal className="text-sm text-muted">{d.entries.length} {duo ? "duplas" : "participantes"} · nomes sem @ entram como convidados (sem conta).</p>
      <ul className="flex flex-col gap-2">
        {d.entries.map((e, i) => (
          <li key={i} data-reveal className="card flex items-center gap-2 p-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs font-bold text-muted">{i + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {duo && <input className="input min-h-10 text-sm" placeholder="Nome da dupla (opcional)" value={e.name} onChange={(ev) => update(i, (x) => ({ ...x, name: ev.target.value }))} />}
              <div className={`grid gap-1.5 ${duo ? "grid-cols-2" : ""}`}>
                {e.players.map((p, k) => (
                  <input key={k} className="input min-h-10 text-sm" value={p.value} placeholder={`Jogador ${k + 1}`} onChange={(ev) => update(i, (x) => ({ ...x, players: x.players.map((pp, kk) => (kk === k ? { value: ev.target.value } : pp)) }))} />
                ))}
              </div>
            </div>
            <button className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-danger" onClick={() => set("entries", d.entries.filter((_, j) => j !== i))} aria-label="Remover"><Icon name="trash" size={20} /></button>
          </li>
        ))}
      </ul>
    </>
  );
}

function StepFormat({ d, set, setS }: { d: Draft; set: SetFn; setS: (fn: (s: Settings) => Settings) => void }) {
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

function StepRules({ d, setS }: { d: Draft; setS: (fn: (s: Settings) => Settings) => void }) {
  const s = d.settings;
  const move = (i: number, by: number) => setS((x) => {
    const t = [...x.tiebreakers];
    const j = i + by;
    if (j < 0 || j >= t.length) return x;
    [t[i], t[j]] = [t[j], t[i]];
    return { ...x, tiebreakers: t };
  });
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
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted">Ordem de desempate</p>
        {s.tiebreakers.map((t, i) => (
          <div key={t} className="flex min-h-12 items-center gap-2">
            <span className="w-6 text-sm font-bold text-muted">{i + 1}º</span>
            <span className="flex-1 font-semibold">{TIEBREAKER_LABEL[t] ?? t}</span>
            <button className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir">↑</button>
            <button className="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 disabled:opacity-30" disabled={i === s.tiebreakers.length - 1} onClick={() => move(i, 1)} aria-label="Descer">↓</button>
          </div>
        ))}
        <p className="mt-1 text-xs text-muted">Empate que nenhum critério resolve fica marcado para decisão manual.</p>
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

function StepClubs({ d, set }: { d: Draft; set: SetFn }) {
  const { data: clubs } = useApi<Club[]>("/api/clubs");
  const all = (clubs ?? []).filter((c) => c.active);
  const sel = new Set(d.allowedClubIds);
  const toggle = (id: string) => set("allowedClubIds", sel.has(id) ? d.allowedClubIds.filter((x) => x !== id) : [...d.allowedClubIds, id]);
  return (
    <>
      <div data-reveal><span className="label">Como cada jogador recebe o clube</span>
        <Segmented options={[{ id: "RANDOM", label: "Sorteio" }, { id: "PLAYER_CHOICE", label: "Escolha" }, { id: "MANUAL", label: "Admin" }]} value={d.clubMode} onChange={(v) => set("clubMode", v)} />
        <p className="mt-2 text-xs text-muted">{d.clubMode === "RANDOM" ? "Os clubes são sorteados a cada rodada, com registro auditável." : d.clubMode === "PLAYER_CHOICE" ? "Cada jogador escolhe o clube antes da partida." : "Quem tem permissão define os clubes de cada jogo."}</p>
      </div>
      <div data-reveal className="card px-4"><Toggle label="Permitir clube repetido na rodada" checked={d.allowRepeat} onChange={(v) => set("allowRepeat", v)} /></div>
      <div data-reveal>
        <div className="mb-2 flex items-center justify-between"><span className="label mb-0">Clubes permitidos</span><button className="text-sm font-bold text-lime" onClick={() => set("allowedClubIds", sel.size ? [] : all.map((c) => c.id))}>{sel.size ? "Limpar" : "Todos"}</button></div>
        <p className="mb-2 text-xs text-muted">{sel.size ? `${sel.size} selecionados` : "Nenhum selecionado = catálogo inteiro."}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {all.map((c) => (
            <button key={c.id} onClick={() => toggle(c.id)} className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition-colors ${sel.has(c.id) ? "border-lime bg-lime/10" : "border-line bg-bg-2"}`}>
              <ClubBadge club={c} size={22} /><span className="truncate">{c.name}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function StepReview({ d }: { d: Draft }) {
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
    ["Clubes", `${d.clubMode === "RANDOM" ? "Sorteio" : d.clubMode === "PLAYER_CHOICE" ? "Escolha do jogador" : "Definidos pelo admin"}${d.allowedClubIds.length ? ` · ${d.allowedClubIds.length} clubes` : ""}`],
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
