"use client";
import { useMemo, useState } from "react";
import type { Club, ClubMode, ClubPool, ClubRule, ClubRules } from "@/lib/client/types";
import { feasibilityError, poolClubIds, type PhaseKey } from "@/lib/tournament/clubRules";
import { normalizeName } from "@/lib/text";
import { ClubBadge } from "./ClubBadge";
import { Icon, Toggle } from "./ui";

export const CLUB_MODE_LABEL: Record<ClubMode, string> = {
  RANDOM: "Sorteio",
  PLAYER_CHOICE: "Jogador escolhe",
  MANUAL: "Organizador define",
  OPPONENT_CHOICE: "Adversário escolhe",
};
const MODE_HINT: Record<ClubMode, string> = {
  RANDOM: "O sistema sorteia os clubes de cada rodada, com registro auditável.",
  PLAYER_CHOICE: "Cada jogador escolhe o próprio clube na hora da partida.",
  MANUAL: "Quem organiza define o clube de cada lado antes do jogo.",
  OPPONENT_CHOICE: "Cada lado escolhe o clube que o adversário vai usar.",
};
export const CLUB_POOL_LABEL: Record<ClubPool, string> = {
  ALL: "Catálogo inteiro",
  NATIONAL: "Só nacionais",
  INTERNATIONAL: "Só internacionais",
  NATIONAL_TEAM: "Só seleções",
  CUSTOM: "Lista personalizada",
};
const CATS = [
  { id: "NATIONAL", label: "Nacionais" },
  { id: "INTERNATIONAL", label: "Internacionais" },
  { id: "NATIONAL_TEAM", label: "Seleções" },
] as const;

export const DEFAULT_RULE: ClubRule = { mode: "RANDOM", allowRepeat: false, pool: "ALL", clubIds: [] };

type CatalogClub = Club & { category: NonNullable<Club["category"]> };
const catalogOf = (clubs: Club[]) => clubs.filter((c) => c.active).map((c) => ({ ...c, category: c.category ?? "INTERNATIONAL" })) as CatalogClub[];

export function ruleSummary(rule: ClubRule) {
  const pool = rule.pool === "CUSTOM" ? `${rule.clubIds.length} clube${rule.clubIds.length === 1 ? "" : "s"}` : CLUB_POOL_LABEL[rule.pool].toLowerCase();
  return `${CLUB_MODE_LABEL[rule.mode]} · ${pool}${rule.allowRepeat ? " · com repetição" : ""}`;
}

/** Catálogo em abas (Nacionais | Internacionais | Seleções), busca e seleção múltipla compacta. */
export function ClubPicker({ clubs, selected, onChange, disabled = false }: { clubs: Club[]; selected: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const all = useMemo(() => catalogOf(clubs), [clubs]);
  const [cat, setCat] = useState<(typeof CATS)[number]["id"]>("NATIONAL");
  const [q, setQ] = useState("");
  const sel = new Set(selected);
  const term = normalizeName(q);
  const list = all.filter((c) => (term ? normalizeName(c.name).includes(term) || normalizeName(c.country ?? "").includes(term) : c.category === cat));
  const inTab = list.map((c) => c.id);
  const allInTab = inTab.length > 0 && inTab.every((id) => sel.has(id));
  const toggle = (id: string) => onChange(sel.has(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <div className={`flex flex-col gap-2 transition-opacity ${disabled ? "pointer-events-none select-none opacity-40 grayscale" : ""}`} aria-disabled={disabled}>
      <div className="relative">
        <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input min-h-11 pl-10 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar clube ou seleção" disabled={disabled} aria-label="Buscar clube" />
      </div>
      {!term && (
        <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-bg-2 p-1" role="tablist">
          {CATS.map((c) => {
            const n = all.filter((x) => x.category === c.id && sel.has(x.id)).length;
            return (
              <button key={c.id} type="button" role="tab" aria-selected={cat === c.id} onClick={() => setCat(c.id)} disabled={disabled}
                className={`min-h-10 rounded-xl px-1 text-[13px] font-bold transition-colors ${cat === c.id ? "bg-lime text-lime-ink" : "text-muted"}`}>
                {c.label}{n > 0 && <span className="ml-1 opacity-70">({n})</span>}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{selected.length ? `${selected.length} selecionado${selected.length === 1 ? "" : "s"}` : "Nenhum selecionado"}</span>
        <span className="flex gap-3">
          {inTab.length > 0 && <button type="button" className="font-bold text-lime" disabled={disabled} onClick={() => onChange(allInTab ? selected.filter((id) => !inTab.includes(id)) : [...new Set([...selected, ...inTab])])}>{allInTab ? "Desmarcar estes" : "Marcar estes"}</button>}
          {selected.length > 0 && <button type="button" className="font-bold text-muted" disabled={disabled} onClick={() => onChange([])}>Limpar</button>}
        </span>
      </div>
      <div className="no-scrollbar grid max-h-[300px] grid-cols-2 gap-1.5 overflow-y-auto overscroll-contain pr-0.5 sm:grid-cols-3">
        {list.map((c) => {
          const on = sel.has(c.id);
          return (
            <button key={c.id} type="button" onClick={() => toggle(c.id)} disabled={disabled} aria-pressed={on}
              className={`relative flex min-h-11 items-center gap-2 rounded-xl border px-2.5 text-left text-[13px] font-semibold transition-colors ${on ? "border-lime bg-lime/10 text-text" : "border-line bg-bg-2 text-muted"}`}>
              <ClubBadge club={c} size={24} />
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              {on && <Icon name="check" size={16} className="shrink-0 text-lime" />}
            </button>
          );
        })}
        {!list.length && <p className="col-span-full py-4 text-center text-sm text-muted">Nenhum clube encontrado.</p>}
      </div>
    </div>
  );
}

/** Editor de uma regra: quem define o clube + restrição opcional de clubes permitidos. */
export function ClubRuleEditor({ rule, onChange, clubs, error }: { rule: ClubRule; onChange: (r: ClubRule) => void; clubs: Club[]; error?: string | null }) {
  const restricted = rule.pool !== "ALL";
  const set = (patch: Partial<ClubRule>) => onChange({ ...rule, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <div>
        <span className="label">Quem define o clube</span>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(CLUB_MODE_LABEL) as ClubMode[]).map((m) => (
            <button key={m} type="button" onClick={() => set({ mode: m })} aria-pressed={rule.mode === m}
              className={`min-h-11 rounded-xl border px-2 text-sm font-bold transition-colors ${rule.mode === m ? "border-lime bg-lime text-lime-ink" : "border-line bg-bg-2 text-muted"}`}>
              {CLUB_MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{MODE_HINT[rule.mode]}{rule.mode !== "RANDOM" && " Nada precisa ser definido agora."}</p>
      </div>
      <Toggle label="Permitir clube repetido na rodada" hint="Desligado: cada clube aparece uma vez por rodada" checked={rule.allowRepeat} onChange={(v) => set({ allowRepeat: v })} />
      <Toggle label="Limitar clubes permitidos" hint={restricted ? CLUB_POOL_LABEL[rule.pool] : "Desligado: vale o catálogo inteiro"} checked={restricted}
        onChange={(v) => set(v ? { pool: "INTERNATIONAL" } : { pool: "ALL", clubIds: [] })} />
      {restricted && (
        <div className="grid grid-cols-2 gap-1.5">
          {(["NATIONAL", "INTERNATIONAL", "NATIONAL_TEAM", "CUSTOM"] as ClubPool[]).map((p) => (
            <button key={p} type="button" onClick={() => set({ pool: p })} aria-pressed={rule.pool === p}
              className={`min-h-10 rounded-xl border px-2 text-[13px] font-bold transition-colors ${rule.pool === p ? "border-lime bg-lime/15 text-lime" : "border-line bg-bg-2 text-muted"}`}>
              {CLUB_POOL_LABEL[p]}
            </button>
          ))}
        </div>
      )}
      <ClubPicker clubs={clubs} selected={rule.pool === "CUSTOM" ? rule.clubIds : []} disabled={rule.pool !== "CUSTOM"} onChange={(ids) => set({ clubIds: ids })} />
      {rule.pool !== "CUSTOM" && <p className="-mt-1 text-xs text-muted">{restricted ? "Para escolher clubes um a um, use “Lista personalizada”." : "Ative “Limitar clubes permitidos” para restringir o catálogo."}</p>}
      {error && <p className="flex items-start gap-2 rounded-xl bg-danger/10 p-3 text-sm text-danger" role="alert"><Icon name="warn" size={18} className="mt-px shrink-0" />{error}</p>}
    </div>
  );
}

export type PhasePlan = { key: PhaseKey; label: string; slotsPerRound: number };

/** Mesma checagem do servidor: lista vazia/curta ou repetição impossível em alguma fase. */
export function clubRulesErrors(rules: ClubRules, phases: PhasePlan[], clubs: Club[]): Record<string, string> {
  const catalog = catalogOf(clubs);
  if (!catalog.length) return {};
  const out: Record<string, string> = {};
  const check = (key: string, rule: ClubRule, label: string, slots: number) => {
    if (rule.pool === "CUSTOM" && !rule.clubIds.length) { out[key] = `${label}: escolha os clubes da lista personalizada.`; return; }
    const err = feasibilityError(rule, poolClubIds(rule, catalog).length, slots, label);
    if (err) out[key] = err;
  };
  for (const p of phases) {
    const custom = rules.phases[p.key];
    check(custom ? p.key : "default", custom ?? rules.default, custom ? p.label : `Regra padrão (${p.label})`, p.slotsPerRound);
  }
  if (!phases.length) check("default", rules.default, "Regra padrão", 2);
  return out;
}

/** Regra padrão + personalização por fase (fase sem personalização herda a padrão). */
export function ClubRulesEditor({ rules, onChange, phases, clubs, locked = [] }: {
  rules: ClubRules; onChange: (r: ClubRules) => void; phases: PhasePlan[]; clubs: Club[]; locked?: string[];
}) {
  const [open, setOpen] = useState<string | null>(null);
  const errors = clubRulesErrors(rules, phases, clubs);
  const setPhase = (key: string, rule: ClubRule | null) => {
    const next = { ...rules.phases };
    if (rule) next[key] = rule; else delete next[key];
    onChange({ ...rules, phases: next });
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="card p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-muted">Regra padrão do campeonato</p>
        <ClubRuleEditor rule={rules.default} onChange={(r) => onChange({ ...rules, default: r })} clubs={clubs} error={errors.default} />
      </div>
      {phases.length > 0 && (
        <div className="card p-2">
          <p className="px-2 pb-1 pt-2 text-xs font-bold uppercase tracking-widest text-muted">Por fase</p>
          {phases.map((p) => {
            const custom = rules.phases[p.key];
            const isLocked = locked.includes(p.key);
            const expanded = open === p.key;
            return (
              <div key={p.key} className="border-t border-line/60 first-of-type:border-t-0">
                <button type="button" className="flex min-h-14 w-full items-center gap-3 px-2 text-left" onClick={() => setOpen(expanded ? null : p.key)} aria-expanded={expanded} disabled={isLocked}>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{p.label}</span>
                    <span className={`block truncate text-xs ${errors[p.key] ? "text-danger" : "text-muted"}`}>
                      {isLocked ? "Já disputada: regra mantida" : custom ? ruleSummary(custom) : `Padrão · ${ruleSummary(rules.default)}`}
                    </span>
                  </span>
                  {custom && !isLocked && <span className="chip shrink-0 text-lime">Personalizada</span>}
                  {!isLocked && <Icon name="next" size={18} className={`shrink-0 text-muted transition-transform ${expanded ? "rotate-90" : ""}`} />}
                </button>
                {expanded && !isLocked && (
                  <div className="flex flex-col gap-3 px-2 pb-4">
                    <Toggle label="Personalizar esta fase" hint={custom ? "Esta fase usa regras próprias" : "Desligado: herda a regra padrão"} checked={!!custom}
                      onChange={(v) => setPhase(p.key, v ? { ...rules.default, clubIds: [...rules.default.clubIds] } : null)} />
                    {custom && <ClubRuleEditor rule={custom} onChange={(r) => setPhase(p.key, r)} clubs={clubs} error={errors[p.key]} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
