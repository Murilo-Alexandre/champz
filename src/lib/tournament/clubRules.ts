import { z } from "zod";

/**
 * Regras de clube por fase. Dois conceitos independentes:
 * - mode: quem define o clube de cada lado (sorteio, o próprio jogador, o admin ou o adversário);
 * - pool: quais clubes valem naquela fase (catálogo, categoria ou lista personalizada).
 * `phases` personaliza fases específicas; fase sem personalização herda `default`.
 */
export const CLUB_MODES = ["RANDOM", "PLAYER_CHOICE", "MANUAL", "OPPONENT_CHOICE"] as const;
export type ClubMode = (typeof CLUB_MODES)[number];
export const CLUB_POOLS = ["ALL", "NATIONAL", "INTERNATIONAL", "NATIONAL_TEAM", "CUSTOM"] as const;
export type ClubPool = (typeof CLUB_POOLS)[number];
export type ClubCategory = "NATIONAL" | "INTERNATIONAL" | "NATIONAL_TEAM";

/** GROUPS = fase de grupos ou pontos corridos; KO_n = rodada de mata-mata com n participantes (KO_2 = final). */
export const PHASE_KEY = /^(GROUPS|KO_(2|4|8|16|32|64|128))$/;
export type PhaseKey = "GROUPS" | `KO_${number}`;

export const clubRuleSchema = z.object({
  mode: z.enum(CLUB_MODES).default("RANDOM"),
  allowRepeat: z.boolean().default(false),
  pool: z.enum(CLUB_POOLS).default("ALL"),
  clubIds: z.array(z.string().min(1).max(64)).max(300).default([]),
}).refine((r) => r.pool !== "CUSTOM" || r.clubIds.length > 0, "Escolha ao menos um clube na lista personalizada");
export type ClubRule = z.infer<typeof clubRuleSchema>;

export const clubRulesSchema = z.object({
  default: clubRuleSchema,
  phases: z.record(z.string().regex(PHASE_KEY), clubRuleSchema).default({}),
});
export type ClubRules = z.infer<typeof clubRulesSchema>;

export const DEFAULT_CLUB_RULE: ClubRule = { mode: "RANDOM", allowRepeat: false, pool: "ALL", clubIds: [] };

export function phaseLabel(key: string) {
  if (key === "GROUPS") return "Fase de grupos";
  const n = Number(key.slice(3));
  return ({ 2: "Final", 4: "Semifinal", 8: "Quartas de final", 16: "Oitavas de final", 32: "16 avos de final", 64: "32 avos de final" } as Record<number, string>)[n] ?? `Mata-mata (${n})`;
}

export const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/** Chave da fase de uma rodada: grupos/liga ou rodada de mata-mata pelo nº de participantes (2 × jogos da rodada). */
export function phaseKeyFor(stageType: "GROUP" | "LEAGUE" | "KNOCKOUT", matchesInRound: number): PhaseKey {
  return stageType === "KNOCKOUT" ? `KO_${Math.max(2, matchesInRound * 2)}` : "GROUPS";
}

export function resolveClubRule(rules: ClubRules | undefined | null, key: string): ClubRule | null {
  if (!rules) return null;
  return rules.phases[key] ?? rules.default;
}

/** Clubes permitidos pela regra (catálogo ativo filtrado por categoria ou lista). */
export function poolClubIds(rule: Pick<ClubRule, "pool" | "clubIds">, clubs: readonly { id: string; category: ClubCategory; active: boolean }[]) {
  const active = clubs.filter((c) => c.active);
  if (rule.pool === "ALL") return active.map((c) => c.id);
  if (rule.pool === "CUSTOM") {
    const ok = new Set(active.map((c) => c.id));
    return [...new Set(rule.clubIds)].filter((id) => ok.has(id));
  }
  return active.filter((c) => c.category === rule.pool).map((c) => c.id);
}

type FormatLike = "LEAGUE" | "GROUPS_ONLY" | "KNOCKOUT" | "GROUPS_KNOCKOUT";
type GroupStageLike = { groupCount: number; qualifiersPerGroup: number; bestOfRest: number };

function groupSizes(n: number, groups: number) {
  if (groups < 1 || n < 1) return [];
  return Array.from({ length: groups }, (_, i) => Math.floor(n / groups) + (i < n % groups ? 1 : 0));
}

/**
 * Fases do campeonato e o máximo de lados (vagas de clube) numa mesma rodada de cada uma.
 * Serve para planejar regras antes dos confrontos existirem e validar repetição impossível.
 */
export function plannedPhases(format: FormatLike, entryCount: number, gs: GroupStageLike): { key: PhaseKey; label: string; slotsPerRound: number }[] {
  const out: { key: PhaseKey; label: string; slotsPerRound: number }[] = [];
  if (format !== "KNOCKOUT") {
    const groups = format === "LEAGUE" ? [entryCount] : groupSizes(entryCount, gs.groupCount);
    out.push({ key: "GROUPS", label: format === "LEAGUE" ? "Pontos corridos" : "Fase de grupos", slotsPerRound: groups.reduce((s, k) => s + Math.floor(k / 2) * 2, 0) });
  }
  const koEntrants = format === "KNOCKOUT" ? entryCount : format === "GROUPS_KNOCKOUT" ? gs.qualifiersPerGroup * gs.groupCount + gs.bestOfRest : 0;
  if (koEntrants >= 2) {
    const size = nextPow2(koEntrants);
    for (let n = size; n >= 2; n /= 2) {
      // 1ª rodada com BYEs: só jogam os confrontos reais.
      const playing = n === size ? (koEntrants - (size - koEntrants)) : n;
      out.push({ key: `KO_${n}`, label: phaseLabel(`KO_${n}`), slotsPerRound: Math.max(2, playing) });
    }
  }
  return out;
}

/** Mensagem clara quando a regra sem repetição não cabe no número de clubes permitidos. */
export function feasibilityError(rule: ClubRule, poolSize: number, slotsPerRound: number, label: string): string | null {
  if (poolSize === 0) return `${label}: nenhum clube disponível na seleção atual.`;
  if (poolSize < 2) return `${label}: escolha ao menos 2 clubes.`;
  if (!rule.allowRepeat && poolSize < slotsPerRound) {
    return `${label}: ${poolSize} clube(s) para ${slotsPerRound} vagas na mesma rodada sem repetição. Libere mais clubes ou permita repetição.`;
  }
  return null;
}
