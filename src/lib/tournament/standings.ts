import type { TournamentSettings, Tiebreaker } from "./settings";

export type MatchStatusLite = "SCHEDULED" | "READY" | "COMPLETED" | "WALKOVER" | "CANCELLED" | "BYE";

export type StandingMatch = {
  id: string;
  homeEntryId: string | null;
  awayEntryId: string | null;
  status: MatchStatusLite;
  homeScore: number | null;
  awayScore: number | null;
  /** Lado ausente no W.O.; com walkoverBoth ambos ausentes. */
  walkoverAbsent?: "HOME" | "AWAY" | null;
  walkoverBoth?: boolean;
};

export type Adjustment = { entryId: string; pointsDelta: number; rule: string };

export type StandingRow = {
  entryId: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  basePoints: number;
  bonusPoints: number;
  points: number;
  walkovers: number;
  /** % de aproveitamento sobre pontos possíveis (pontos básicos). */
  efficiency: number;
  /** Verdadeiro quando nenhum critério configurado separou esta linha de outra. */
  tied: boolean;
  tiedWith: string[];
};

type Acc = Omit<StandingRow, "position" | "tied" | "tiedWith" | "efficiency" | "goalDiff" | "points">;

function emptyAcc(entryId: string): Acc {
  return { entryId, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, basePoints: 0, bonusPoints: 0, walkovers: 0 };
}

/** Partida conta para a tabela? Somente COMPLETED (com placar) e WALKOVER. */
export function countsForStandings(m: StandingMatch): boolean {
  if (!m.homeEntryId || !m.awayEntryId) return false;
  if (m.status === "COMPLETED") return m.homeScore !== null && m.awayScore !== null;
  return m.status === "WALKOVER";
}

function accumulate(
  table: Map<string, Acc>,
  matches: readonly StandingMatch[],
  settings: TournamentSettings,
) {
  const { points, walkover } = settings;
  for (const m of matches) {
    if (!countsForStandings(m)) continue;
    const home = table.get(m.homeEntryId!);
    const away = table.get(m.awayEntryId!);
    if (!home || !away) continue;

    if (m.status === "WALKOVER") {
      if (m.walkoverBoth) {
        home.basePoints += walkover.absentPoints;
        away.basePoints += walkover.absentPoints;
        home.walkovers++;
        away.walkovers++;
        if (walkover.countStats) {
          home.played++;
          away.played++;
          home.losses++;
          away.losses++;
        }
        continue;
      }
      const absentIsHome = m.walkoverAbsent === "HOME";
      const present = absentIsHome ? away : home;
      const absent = absentIsHome ? home : away;
      present.basePoints += walkover.presentPoints;
      absent.basePoints += walkover.absentPoints;
      absent.walkovers++;
      if (walkover.countStats) {
        present.played++;
        absent.played++;
        present.wins++;
        absent.losses++;
        if (walkover.symbolicScore) {
          present.goalsFor += walkover.symbolicScore.present;
          present.goalsAgainst += walkover.symbolicScore.absent;
          absent.goalsFor += walkover.symbolicScore.absent;
          absent.goalsAgainst += walkover.symbolicScore.present;
        }
      }
      continue;
    }

    const hs = m.homeScore!;
    const as = m.awayScore!;
    home.played++;
    away.played++;
    home.goalsFor += hs;
    home.goalsAgainst += as;
    away.goalsFor += as;
    away.goalsAgainst += hs;
    if (hs > as) {
      home.wins++;
      away.losses++;
      home.basePoints += points.win;
      away.basePoints += points.loss;
    } else if (hs < as) {
      away.wins++;
      home.losses++;
      away.basePoints += points.win;
      home.basePoints += points.loss;
    } else {
      home.draws++;
      away.draws++;
      home.basePoints += points.draw;
      away.basePoints += points.draw;
    }
  }
}

function keyFor(c: Tiebreaker, r: StandingRow): number {
  switch (c) {
    case "POINTS":
      return r.points;
    case "WINS":
      return r.wins;
    case "GOAL_DIFF":
      return r.goalDiff;
    case "GOALS_FOR":
      return r.goalsFor;
    case "FEWEST_GOALS_AGAINST":
      return -r.goalsAgainst;
    default:
      return 0;
  }
}

function finalize(acc: Acc, settings: TournamentSettings): StandingRow {
  const points = acc.basePoints + acc.bonusPoints;
  const maxPoints = acc.played * settings.points.win;
  return {
    ...acc,
    position: 0,
    goalDiff: acc.goalsFor - acc.goalsAgainst,
    points,
    efficiency: maxPoints > 0 ? Math.round((acc.basePoints / maxPoints) * 1000) / 10 : 0,
    tied: false,
    tiedWith: [],
  };
}

/** Separa um bloco de empatados aplicando os critérios a partir de `idx`. Retorna sub-blocos ordenados. */
function partition(
  block: StandingRow[],
  idx: number,
  criteria: readonly Tiebreaker[],
  matches: readonly StandingMatch[],
  settings: TournamentSettings,
): StandingRow[][] {
  if (block.length <= 1 || idx >= criteria.length) return [block];
  const c = criteria[idx];

  let keys: Map<string, number[]>;
  if (c === "HEAD_TO_HEAD") {
    // Mini-tabela só com jogos entre os empatados: pontos, saldo, gols pró.
    const ids = new Set(block.map((r) => r.entryId));
    const mini = new Map(block.map((r) => [r.entryId, emptyAcc(r.entryId)]));
    accumulate(
      mini,
      matches.filter((m) => ids.has(m.homeEntryId ?? "") && ids.has(m.awayEntryId ?? "")),
      settings,
    );
    keys = new Map(
      [...mini.values()].map((a) => [a.entryId, [a.basePoints, a.goalsFor - a.goalsAgainst, a.goalsFor]]),
    );
  } else {
    keys = new Map(block.map((r) => [r.entryId, [keyFor(c, r)]]));
  }

  const cmp = (a: number[], b: number[]) => {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
    return 0;
  };
  const sorted = [...block].sort((a, b) => cmp(keys.get(a.entryId)!, keys.get(b.entryId)!));
  const out: StandingRow[][] = [];
  let current: StandingRow[] = [];
  for (const row of sorted) {
    if (current.length && cmp(keys.get(current[0].entryId)!, keys.get(row.entryId)!) !== 0) {
      out.push(current);
      current = [];
    }
    current.push(row);
  }
  if (current.length) out.push(current);
  return out.flatMap((sub) => partition(sub, idx + 1, criteria, matches, settings));
}

/**
 * Calcula a classificação a partir dos resultados válidos.
 * `manualOrder` (entryIds) desempata blocos que nenhum critério resolveu; sem ela o empate é sinalizado, nunca aleatório.
 */
export function computeStandings(
  entryIds: readonly string[],
  matches: readonly StandingMatch[],
  settings: TournamentSettings,
  adjustments: readonly Adjustment[] = [],
  manualOrder: readonly string[] | null = null,
): StandingRow[] {
  const table = new Map(entryIds.map((id) => [id, emptyAcc(id)]));
  accumulate(table, matches, settings);
  for (const adj of adjustments) {
    const row = table.get(adj.entryId);
    if (row) row.bonusPoints += adj.pointsDelta;
  }

  const rows = [...table.values()].map((a) => finalize(a, settings));
  // Pontos sempre primeiro, mesmo que a configuração omita.
  const criteria: Tiebreaker[] = settings.tiebreakers.includes("POINTS")
    ? settings.tiebreakers
    : ["POINTS", ...settings.tiebreakers];
  const blocks = partition(rows, 0, criteria, matches, settings);

  const result: StandingRow[] = [];
  for (const block of blocks) {
    let ordered = block;
    if (block.length > 1 && manualOrder) {
      const rank = new Map(manualOrder.map((id, i) => [id, i]));
      if (block.every((r) => rank.has(r.entryId))) {
        ordered = [...block].sort((a, b) => rank.get(a.entryId)! - rank.get(b.entryId)!);
        ordered.forEach((r) => result.push({ ...r, position: result.length + 1 }));
        continue;
      }
    }
    const startPos = result.length + 1;
    for (const r of ordered) {
      result.push({
        ...r,
        position: block.length > 1 ? startPos : result.length + 1,
        tied: block.length > 1,
        tiedWith: block.length > 1 ? block.filter((o) => o.entryId !== r.entryId).map((o) => o.entryId) : [],
      });
    }
  }
  // Ordem estável de exibição dentro de empates não resolvidos: nome não está disponível aqui, usar entryId.
  return result;
}

/** Bônus de melhor saldo do grupo ao encerrar, conforme política de empate. */
export function bestGoalDiffBonus(rows: readonly StandingRow[], settings: TournamentSettings): Adjustment[] {
  const cfg = settings.bonus.bestGoalDiff;
  if (!cfg.enabled || rows.length === 0) return [];
  const best = Math.max(...rows.map((r) => r.goalDiff));
  let leaders = rows.filter((r) => r.goalDiff === best);
  if (leaders.length > 1) {
    if (cfg.tiePolicy === "NONE") return [];
    if (cfg.tiePolicy === "TIEBREAK") {
      const gf = Math.max(...leaders.map((r) => r.goalsFor));
      leaders = leaders.filter((r) => r.goalsFor === gf);
      if (leaders.length > 1) return [];
    }
  }
  return leaders.map((r) => ({ entryId: r.entryId, pointsDelta: cfg.points, rule: "BEST_GOAL_DIFF" }));
}
