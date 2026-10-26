import type { StandingMatch } from "./standings";

export type StatsMatch = StandingMatch & { roundNumber: number; completedAt?: Date | string | null };

export type TournamentStats = {
  sample: { matchesCounted: number; criteria: string };
  bestAttack: { entryId: string; goalsFor: number }[];
  bestDefense: { entryId: string; goalsAgainst: number; played: number }[];
  biggestWins: { matchId: string; winnerEntryId: string; loserEntryId: string; score: string; margin: number }[];
  highestScoring: { matchId: string; totalGoals: number; score: string }[];
  longestWinStreak: { entryId: string; streak: number }[];
  longestUnbeaten: { entryId: string; streak: number }[];
  totalGoals: number;
  averageGoals: number;
};

/** Estatísticas derivadas somente de partidas COMPLETED com placar (W.O. fica fora de recordes de gols). */
export function computeStats(entryIds: readonly string[], matches: readonly StatsMatch[]): TournamentStats {
  const played = matches
    .filter((m) => m.status === "COMPLETED" && m.homeEntryId && m.awayEntryId && m.homeScore != null && m.awayScore != null)
    .sort((a, b) => a.roundNumber - b.roundNumber || String(a.completedAt ?? "").localeCompare(String(b.completedAt ?? "")));

  const per = new Map(entryIds.map((id) => [id, { gf: 0, ga: 0, played: 0, results: [] as ("W" | "D" | "L")[] }]));
  let totalGoals = 0;
  for (const m of played) {
    const h = per.get(m.homeEntryId!);
    const a = per.get(m.awayEntryId!);
    const hs = m.homeScore!;
    const as = m.awayScore!;
    totalGoals += hs + as;
    if (h) {
      h.gf += hs; h.ga += as; h.played++;
      h.results.push(hs > as ? "W" : hs < as ? "L" : "D");
    }
    if (a) {
      a.gf += as; a.ga += hs; a.played++;
      a.results.push(as > hs ? "W" : as < hs ? "L" : "D");
    }
  }

  const streak = (res: string[], ok: (r: string) => boolean) => {
    let best = 0, cur = 0;
    for (const r of res) { cur = ok(r) ? cur + 1 : 0; best = Math.max(best, cur); }
    return best;
  };
  const top = <T>(items: T[], score: (t: T) => number, higher = true) => {
    if (!items.length) return [];
    const vals = items.map(score);
    const best = higher ? Math.max(...vals) : Math.min(...vals);
    return items.filter((_, i) => vals[i] === best);
  };

  const rows = [...per.entries()].map(([entryId, s]) => ({ entryId, ...s }));
  const withGames = rows.filter((r) => r.played > 0);

  const margins = played.map((m) => {
    const diff = m.homeScore! - m.awayScore!;
    return {
      matchId: m.id,
      winnerEntryId: diff >= 0 ? m.homeEntryId! : m.awayEntryId!,
      loserEntryId: diff >= 0 ? m.awayEntryId! : m.homeEntryId!,
      score: `${m.homeScore} x ${m.awayScore}`,
      margin: Math.abs(diff),
      total: m.homeScore! + m.awayScore!,
    };
  });

  return {
    sample: { matchesCounted: played.length, criteria: "Partidas concluídas com placar; W.O. excluído dos recordes" },
    bestAttack: top(withGames, (r) => r.gf).map((r) => ({ entryId: r.entryId, goalsFor: r.gf })),
    bestDefense: top(withGames, (r) => r.ga, false).map((r) => ({ entryId: r.entryId, goalsAgainst: r.ga, played: r.played })),
    biggestWins: top(margins.filter((m) => m.margin > 0), (m) => m.margin).map((m) => ({ matchId: m.matchId, winnerEntryId: m.winnerEntryId, loserEntryId: m.loserEntryId, score: m.score, margin: m.margin })),
    highestScoring: top(margins, (m) => m.total).map((m) => ({ matchId: m.matchId, totalGoals: m.total, score: m.score })),
    longestWinStreak: top(withGames, (r) => streak(r.results, (x) => x === "W"))
      .map((r) => ({ entryId: r.entryId, streak: streak(r.results, (x) => x === "W") }))
      .filter((r) => r.streak > 0),
    longestUnbeaten: top(withGames, (r) => streak(r.results, (x) => x !== "L"))
      .map((r) => ({ entryId: r.entryId, streak: streak(r.results, (x) => x !== "L") }))
      .filter((r) => r.streak > 0),
    totalGoals,
    averageGoals: played.length ? Math.round((totalGoals / played.length) * 100) / 100 : 0,
  };
}
