import type { StandingRow } from "./standings";

export class TournamentRuleError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "TournamentRuleError";
  }
}

// ───────────── Classificados ─────────────

export type GroupStanding = { groupId: string; label: string; rows: StandingRow[] };
export type Qualifier = { entryId: string; groupId: string | null; groupPosition: number; seed: number };

function crossCompare(a: StandingRow, b: StandingRow): number {
  return b.points - a.points || b.goalDiff - a.goalDiff || b.goalsFor - a.goalsFor || b.wins - a.wins;
}
function crossEqual(a: StandingRow, b: StandingRow): boolean {
  return crossCompare(a, b) === 0;
}

/**
 * Top N de cada grupo + K melhores colocados seguintes. Seeds: 1º colocados primeiro, ordenados entre si
 * por pontos/saldo/gols pró/vitórias, depois 2º colocados etc. Empate não resolvido na linha de corte => erro.
 */
export function selectQualifiers(groups: readonly GroupStanding[], topN: number, bestOfRest: number): Qualifier[] {
  const tiers: { row: StandingRow; groupId: string; pos: number }[][] = [];
  const restCandidates: { row: StandingRow; groupId: string; pos: number }[] = [];

  for (const g of groups) {
    if (g.rows.length < topN) throw new TournamentRuleError(`Grupo ${g.label} tem menos de ${topN} participantes`, "GROUP_TOO_SMALL");
    const cut = g.rows[topN - 1];
    const next = g.rows[topN];
    if (cut && next && cut.tied && cut.tiedWith.includes(next.entryId)) {
      throw new TournamentRuleError(
        `Empate não resolvido na zona de classificação do grupo ${g.label}. Defina a ordem manual de desempate.`,
        "UNRESOLVED_TIE",
        { groupId: g.groupId, entryIds: [cut.entryId, ...cut.tiedWith] },
      );
    }
    g.rows.forEach((row, i) => {
      if (i < topN) (tiers[i] ??= []).push({ row, groupId: g.groupId, pos: i + 1 });
      else if (i === topN) restCandidates.push({ row, groupId: g.groupId, pos: i + 1 });
    });
  }

  const ordered: { row: StandingRow; groupId: string; pos: number }[] = [];
  for (const tier of tiers) ordered.push(...[...tier].sort((a, b) => crossCompare(a.row, b.row)));

  if (bestOfRest > 0) {
    if (restCandidates.length < bestOfRest) {
      throw new TournamentRuleError("Não há colocados suficientes para as vagas extras", "NOT_ENOUGH_REST");
    }
    const sortedRest = [...restCandidates].sort((a, b) => crossCompare(a.row, b.row));
    const last = sortedRest[bestOfRest - 1];
    const firstOut = sortedRest[bestOfRest];
    if (firstOut && crossEqual(last.row, firstOut.row)) {
      throw new TournamentRuleError(
        "Empate entre melhores colocados na última vaga extra. Defina critério/decisão manual.",
        "UNRESOLVED_TIE",
        { entryIds: sortedRest.filter((c) => crossEqual(c.row, last.row)).map((c) => c.row.entryId) },
      );
    }
    ordered.push(...sortedRest.slice(0, bestOfRest));
  }

  const ids = ordered.map((o) => o.row.entryId);
  if (new Set(ids).size !== ids.length) throw new TournamentRuleError("Classificado duplicado", "DUPLICATE_QUALIFIER");
  return ordered.map((o, i) => ({ entryId: o.row.entryId, groupId: o.groupId, groupPosition: o.pos, seed: i + 1 }));
}

// ───────────── Chaveamento ─────────────

export function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Ordem padrão de posições de seeds no chaveamento (1 e 2 só se encontram na final). */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const sum = order.length * 2 + 1;
    order = order.flatMap((s) => [s, sum - s]);
  }
  return order;
}

export type FirstRoundPair = { home: string | null; away: string | null };
export type BracketPlan = { size: number; rounds: number; firstRound: FirstRoundPair[]; warnings: string[] };

/**
 * Monta a primeira rodada a partir dos seeds (melhor primeiro). Ausentes viram BYE para os melhores seeds;
 * nunca BYE x BYE. Opcionalmente evita reencontro do mesmo grupo trocando adversários.
 */
export function planBracket(
  seededEntryIds: readonly string[],
  opts: { groupOf?: ReadonlyMap<string, string | null>; avoidSameGroup?: boolean } = {},
): BracketPlan {
  const n = seededEntryIds.length;
  if (n < 2) throw new TournamentRuleError("Mata-mata exige ao menos 2 participantes", "TOO_FEW");
  if (new Set(seededEntryIds).size !== n) throw new TournamentRuleError("Participante duplicado no chaveamento", "DUPLICATE_QUALIFIER");

  const size = nextPowerOfTwo(n);
  const order = seedOrder(size);
  const bySeed = (s: number) => (s <= n ? seededEntryIds[s - 1] : null);
  const firstRound: FirstRoundPair[] = [];
  for (let i = 0; i < size; i += 2) firstRound.push({ home: bySeed(order[i]), away: bySeed(order[i + 1]) });

  const warnings: string[] = [];
  const groupOf = opts.groupOf;
  if (opts.avoidSameGroup && groupOf) {
    const clash = (p: FirstRoundPair) =>
      !!p.home && !!p.away && !!groupOf.get(p.home) && groupOf.get(p.home) === groupOf.get(p.away);
    for (let i = 0; i < firstRound.length; i++) {
      if (!clash(firstRound[i])) continue;
      let fixed = false;
      for (let j = firstRound.length - 1; j >= 0 && !fixed; j--) {
        if (j === i || !firstRound[j].away) continue;
        const a = { ...firstRound[i], away: firstRound[j].away };
        const b = { ...firstRound[j], away: firstRound[i].away };
        if (!clash(a) && !clash(b)) {
          firstRound[i] = a;
          firstRound[j] = b;
          fixed = true;
        }
      }
      if (!fixed) warnings.push(`Não foi possível evitar confronto do mesmo grupo: ${firstRound[i].home} x ${firstRound[i].away}`);
    }
  }
  return { size, rounds: Math.log2(size), firstRound, warnings };
}

/** Valida confrontos manuais (ex.: fórmulas de quartas definidas pelo grupo) antes de publicar. */
export function validateManualPairs(pairs: readonly FirstRoundPair[], qualifierIds: readonly string[]): BracketPlan {
  const size = pairs.length * 2;
  if (size < 2 || nextPowerOfTwo(size) !== size) {
    throw new TournamentRuleError("Quantidade de confrontos deve formar potência de 2 (use BYE como null)", "INVALID_BRACKET_SIZE");
  }
  const used = pairs.flatMap((p) => [p.home, p.away]).filter((x): x is string => !!x);
  const dup = used.filter((id, i) => used.indexOf(id) !== i);
  if (dup.length) throw new TournamentRuleError("Confrontos manuais repetem participantes", "DUPLICATE_QUALIFIER", { duplicated: [...new Set(dup)] });
  const expected = new Set(qualifierIds);
  const missing = qualifierIds.filter((id) => !used.includes(id));
  const extra = used.filter((id) => !expected.has(id));
  if (missing.length || extra.length) {
    throw new TournamentRuleError("Confrontos manuais não batem com os classificados", "QUALIFIER_MISMATCH", { missing, extra });
  }
  if (pairs.some((p) => !p.home && !p.away)) throw new TournamentRuleError("Confronto BYE x BYE inválido", "DOUBLE_BYE");
  return { size, rounds: Math.log2(size), firstRound: [...pairs], warnings: [] };
}

// ───────────── Vencedor de partida eliminatória ─────────────

export type KnockoutResult = {
  homeEntryId: string | null;
  awayEntryId: string | null;
  status: "COMPLETED" | "WALKOVER" | "BYE";
  homeScore?: number | null;
  awayScore?: number | null;
  homePenalties?: number | null;
  awayPenalties?: number | null;
  walkoverAbsent?: "HOME" | "AWAY" | null;
  walkoverBoth?: boolean;
  manualWinnerEntryId?: string | null;
};

/** Determina quem avança. Empate exige pênaltis ou decisão manual explícita; nunca escolhe arbitrariamente. */
export function resolveKnockoutWinner(r: KnockoutResult): string {
  if (r.status === "BYE") {
    const w = r.homeEntryId ?? r.awayEntryId;
    if (!w || (r.homeEntryId && r.awayEntryId)) throw new TournamentRuleError("BYE inválido", "INVALID_BYE");
    return w;
  }
  if (!r.homeEntryId || !r.awayEntryId) throw new TournamentRuleError("Confronto incompleto", "MATCH_NOT_READY");
  if (r.status === "WALKOVER") {
    if (r.walkoverBoth) {
      if (r.manualWinnerEntryId && [r.homeEntryId, r.awayEntryId].includes(r.manualWinnerEntryId)) return r.manualWinnerEntryId;
      throw new TournamentRuleError("W.O. duplo em mata-mata exige decisão administrativa de quem avança", "NEEDS_DECISION");
    }
    if (!r.walkoverAbsent) throw new TournamentRuleError("Informe o lado ausente do W.O.", "WALKOVER_SIDE");
    return r.walkoverAbsent === "HOME" ? r.awayEntryId : r.homeEntryId;
  }
  const hs = r.homeScore;
  const as = r.awayScore;
  if (hs == null || as == null) throw new TournamentRuleError("Placar incompleto", "SCORE_REQUIRED");
  if (hs !== as) return hs > as ? r.homeEntryId : r.awayEntryId;
  if (r.homePenalties != null && r.awayPenalties != null) {
    if (r.homePenalties === r.awayPenalties) throw new TournamentRuleError("Pênaltis não podem terminar empatados", "PENALTIES_TIED");
    return r.homePenalties > r.awayPenalties ? r.homeEntryId : r.awayEntryId;
  }
  if (r.manualWinnerEntryId) {
    if (![r.homeEntryId, r.awayEntryId].includes(r.manualWinnerEntryId)) {
      throw new TournamentRuleError("Vencedor manual deve ser um dos participantes", "INVALID_WINNER");
    }
    return r.manualWinnerEntryId;
  }
  throw new TournamentRuleError("Empate em mata-mata: informe pênaltis ou decisão administrativa", "NEEDS_DECISION");
}
