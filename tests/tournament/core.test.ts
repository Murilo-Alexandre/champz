import { describe, expect, it } from "vitest";
import { roundRobin, drawGroups } from "@/lib/tournament/roundRobin";
import { computeStandings, bestGoalDiffBonus, type StandingMatch } from "@/lib/tournament/standings";
import { parseSettings } from "@/lib/tournament/settings";
import {
  selectQualifiers, planBracket, validateManualPairs, resolveKnockoutWinner, TournamentRuleError,
} from "@/lib/tournament/knockout";
import { drawClubs } from "@/lib/tournament/clubs";
import { computeStats } from "@/lib/tournament/stats";
import { hasPermission, DEFAULT_PARTICIPANT_FLAGS } from "@/lib/permissions";

const S = parseSettings({});
let n = 0;
const m = (home: string, away: string, hs: number | null, as: number | null, extra: Partial<StandingMatch> = {}): StandingMatch => ({
  id: `m${++n}`, homeEntryId: home, awayEntryId: away, status: hs == null ? "SCHEDULED" : "COMPLETED", homeScore: hs, awayScore: as, ...extra,
});

describe("round-robin", () => {
  for (const size of [2, 3, 4, 5, 12]) {
    it(`N=${size}: todos se enfrentam uma vez, sem autojogo nem duplicação`, () => {
      const ids = Array.from({ length: size }, (_, i) => `e${i}`);
      const rounds = roundRobin(ids);
      const pairs = rounds.flatMap((r) => r.pairings);
      expect(pairs.length).toBe((size * (size - 1)) / 2);
      const keys = pairs.map((p) => [p.home, p.away].sort().join("|"));
      expect(new Set(keys).size).toBe(keys.length);
      expect(pairs.every((p) => p.home !== p.away)).toBe(true);
      expect(rounds.length).toBe(size % 2 ? size : size - 1);
      for (const r of rounds) {
        const inRound = r.pairings.flatMap((p) => [p.home, p.away]).concat(r.bye);
        expect(new Set(inRound).size).toBe(size);
        expect(r.bye.length).toBe(size % 2);
      }
    });
  }
  it("ida e volta inverte mando", () => {
    const rounds = roundRobin(["a", "b", "c", "d"], 2);
    expect(rounds.length).toBe(6);
    expect(rounds[3].pairings[0]).toEqual({ home: rounds[0].pairings[0].away, away: rounds[0].pairings[0].home });
  });
  it("sorteio de grupos é reprodutível pela seed e balanceado", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const a = drawGroups(ids, 3, "seed-x");
    expect(drawGroups(ids, 3, "seed-x")).toEqual(a);
    expect(a.map((g) => g.length)).toEqual([4, 4, 4]);
    expect(new Set(a.flat()).size).toBe(12);
  });
});

describe("homologação FIFA 2026 (docs/TESTES.md)", () => {
  const A = ["Everson", "Murilo", "Bruno", "Jailton"];
  const B = ["Gabriel", "Felipe", "Miguel", "Alan"];
  const C = ["Danilo", "Guilherme", "Igor", "Pedro"];
  it("3 grupos x 4 => 18 jogos em 3 rodadas de 6 e confrontos da rodada 1 conferem", () => {
    const sched = [A, B, C].map((g) => roundRobin(g));
    const total = sched.flat().reduce((s, r) => s + r.pairings.length, 0);
    expect(total).toBe(18);
    for (let r = 0; r < 3; r++) expect(sched.reduce((s, g) => s + g[r].pairings.length, 0)).toBe(6);
    const key = (p: { home: string; away: string }) => [p.home, p.away].sort().join("x");
    const r1 = sched.flatMap((g) => g[0].pairings.map(key));
    expect(r1.sort()).toEqual(
      [["Everson", "Jailton"], ["Gabriel", "Alan"], ["Danilo", "Pedro"], ["Murilo", "Bruno"], ["Miguel", "Felipe"], ["Igor", "Guilherme"]]
        .map((p) => p.sort().join("x")).sort(),
    );
  });
  const pick = (rows: ReturnType<typeof computeStandings>) => rows.map((r) => [r.entryId, r.played, r.goalDiff, r.points]);
  it("Grupo A", () => {
    const rows = computeStandings(A, [m("Everson", "Jailton", 2, 0), m("Murilo", "Bruno", 5, 0), m("Everson", "Bruno", 6, 0), m("Murilo", "Jailton", 2, 1), m("Everson", "Murilo", null, null)], S);
    expect(pick(rows)).toEqual([["Everson", 2, 8, 6], ["Murilo", 2, 6, 6], ["Jailton", 2, -3, 0], ["Bruno", 2, -11, 0]]);
  });
  it("Grupo C (empate em pontos resolvido por saldo)", () => {
    const rows = computeStandings(C, [m("Danilo", "Pedro", 7, 0), m("Igor", "Guilherme", 8, 2), m("Danilo", "Igor", 3, 3), m("Guilherme", "Pedro", 2, 3)], S);
    expect(pick(rows)).toEqual([["Danilo", 2, 7, 4], ["Igor", 2, 6, 4], ["Pedro", 2, -6, 3], ["Guilherme", 2, -7, 0]]);
  });
  it("Grupo B com fixture HIPOTÉTICA Felipe 1x0 Alan (placar real não confirmado)", () => {
    const rows = computeStandings(B, [m("Gabriel", "Alan", 6, 1), m("Miguel", "Felipe", 7, 0), m("Gabriel", "Miguel", 3, 5), m("Felipe", "Alan", 1, 0)], S);
    expect(pick(rows)).toEqual([["Miguel", 2, 9, 6], ["Gabriel", 2, 3, 3], ["Felipe", 2, -6, 3], ["Alan", 2, -6, 0]]);
  });
});

describe("classificação e regras", () => {
  it("pontos customizados V2/E1/D0", () => {
    const s = parseSettings({ points: { win: 2, draw: 1, loss: 0 } });
    const rows = computeStandings(["a", "b"], [m("a", "b", 1, 0), m("b", "a", 2, 2)], s);
    expect(rows.map((r) => r.points)).toEqual([3, 1]);
  });
  it("confronto direto desempata quando critérios anteriores empatam", () => {
    const s = parseSettings({ tiebreakers: ["POINTS", "HEAD_TO_HEAD", "GOAL_DIFF"] });
    // a e b com 3 pts; b venceu a; a tem saldo melhor.
    const rows = computeStandings(["a", "b", "c", "d"], [m("b", "a", 1, 0), m("a", "c", 5, 0), m("b", "d", 0, 1), m("c", "d", 0, 0)], s);
    const pos = (id: string) => rows.find((r) => r.entryId === id)!.position;
    expect(pos("b")).toBeLessThan(pos("a"));
  });
  it("empate total é sinalizado (nunca aleatório) e ordem manual resolve", () => {
    const rows = computeStandings(["a", "b"], [m("a", "b", 1, 1)], S);
    expect(rows.every((r) => r.tied && r.position === 1)).toBe(true);
    const manual = computeStandings(["a", "b"], [m("a", "b", 1, 1)], S, [], ["b", "a"]);
    expect(manual.map((r) => [r.entryId, r.position, r.tied])).toEqual([["b", 1, false], ["a", 2, false]]);
  });
  it("bônus +1 melhor saldo, com política de empate", () => {
    const on = (tiePolicy: "ALL" | "NONE" | "TIEBREAK") => parseSettings({ bonus: { bestGoalDiff: { enabled: true, points: 1, tiePolicy } } });
    const ms = [m("a", "c", 3, 0), m("b", "c", 4, 1)];
    const rows = computeStandings(["a", "b", "c"], ms, S);
    expect(bestGoalDiffBonus(rows, on("NONE"))).toEqual([]);
    expect(bestGoalDiffBonus(rows, on("ALL")).map((x) => x.entryId).sort()).toEqual(["a", "b"]);
    const bonus = bestGoalDiffBonus(rows, on("TIEBREAK"));
    expect(bonus.map((x) => x.entryId)).toEqual(["b"]);
    const b = computeStandings(["a", "b", "c"], ms, S, bonus).find((r) => r.entryId === "b")!;
    expect([b.basePoints, b.bonusPoints, b.points]).toEqual([3, 1, 4]);
  });
  it("W.O.: pontos configurados, placar simbólico, sem double count", () => {
    const s = parseSettings({ walkover: { presentPoints: 3, absentPoints: -1, symbolicScore: { present: 3, absent: 0 }, countStats: true } });
    const [a, b] = computeStandings(["a", "b"], [m("a", "b", null, null, { status: "WALKOVER", walkoverAbsent: "AWAY" })], s);
    expect([a.entryId, a.points, a.played, a.goalsFor, a.wins]).toEqual(["a", 3, 1, 3, 1]);
    expect([b.points, b.played, b.goalsAgainst, b.walkovers]).toEqual([-1, 1, 3, 1]);
    const noStats = computeStandings(["a", "b"], [m("a", "b", null, null, { status: "WALKOVER", walkoverAbsent: "HOME" })], parseSettings({ walkover: { countStats: false } }));
    expect(noStats.find((r) => r.entryId === "b")!.played).toBe(0);
    expect(noStats.find((r) => r.entryId === "b")!.points).toBe(3);
  });
  it("partidas canceladas e agendadas não contam", () => {
    const rows = computeStandings(["a", "b"], [m("a", "b", 2, 0, { status: "CANCELLED" })], S);
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });
});

describe("classificados e chaveamento", () => {
  const groupRows = (label: string, ids: string[], pts: number[]) => ({
    groupId: label, label,
    rows: ids.map((id, i) => ({ entryId: id, position: i + 1, played: 3, wins: 0, draws: 0, losses: 0, goalsFor: pts[i], goalsAgainst: 0, goalDiff: pts[i], basePoints: pts[i], bonusPoints: 0, points: pts[i], walkovers: 0, efficiency: 0, tied: false, tiedWith: [] as string[] })),
  });
  const groups = [
    groupRows("A", ["a1", "a2", "a3", "a4"], [9, 6, 3, 0]),
    groupRows("B", ["b1", "b2", "b3", "b4"], [7, 6, 4, 1]),
    groupRows("C", ["c1", "c2", "c3", "c4"], [9, 4, 2, 1]),
  ];
  it("3 grupos: 2 de cada + 2 melhores terceiros => 8 distintos", () => {
    const q = selectQualifiers(groups, 2, 2);
    expect(q.length).toBe(8);
    expect(new Set(q.map((x) => x.entryId)).size).toBe(8);
    expect(q.slice(6).map((x) => x.entryId)).toEqual(["b3", "a3"]);
  });
  it("chave de 8 evita reencontro do mesmo grupo e não duplica", () => {
    const q = selectQualifiers(groups, 2, 2);
    const plan = planBracket(q.map((x) => x.entryId), { groupOf: new Map(q.map((x) => [x.entryId, x.groupId])), avoidSameGroup: true });
    const ids = plan.firstRound.flatMap((p) => [p.home, p.away]);
    expect(new Set(ids).size).toBe(8);
    expect(plan.firstRound.every((p) => p.home!.charAt(0) !== p.away!.charAt(0))).toBe(true);
  });
  it("fórmulas manuais conflitantes são rejeitadas", () => {
    const q = selectQualifiers(groups, 2, 2).map((x) => x.entryId);
    expect(() => validateManualPairs([{ home: "a1", away: "b2" }, { home: "b1", away: "a2" }, { home: "c1", away: "b2" }, { home: "c2", away: "a3" }], q)).toThrow(TournamentRuleError);
  });
  for (const size of [3, 5, 6]) {
    it(`mata-mata com ${size}: BYEs válidos, sem BYE x BYE`, () => {
      const ids = Array.from({ length: size }, (_, i) => `s${i + 1}`);
      const plan = planBracket(ids);
      const used = plan.firstRound.flatMap((p) => [p.home, p.away]).filter(Boolean);
      expect(new Set(used).size).toBe(size);
      expect(plan.firstRound.some((p) => !p.home && !p.away)).toBe(false);
      expect(plan.firstRound.filter((p) => !p.home || !p.away).length).toBe(plan.size - size);
    });
  }
  it("3 participantes: seed 1 recebe BYE e vai à final", () => {
    const plan = planBracket(["s1", "s2", "s3"]);
    expect(plan.size).toBe(4);
    expect(plan.firstRound).toContainEqual({ home: "s1", away: null });
  });
  it("empate no mata-mata exige pênaltis ou decisão", () => {
    const base = { homeEntryId: "a", awayEntryId: "b", status: "COMPLETED" as const, homeScore: 1, awayScore: 1 };
    expect(() => resolveKnockoutWinner(base)).toThrow(/pênaltis/);
    expect(resolveKnockoutWinner({ ...base, homePenalties: 4, awayPenalties: 5 })).toBe("b");
    expect(resolveKnockoutWinner({ ...base, manualWinnerEntryId: "a" })).toBe("a");
    expect(resolveKnockoutWinner({ ...base, status: "WALKOVER", walkoverAbsent: "HOME" })).toBe("b");
  });
  it("empate na linha de corte gera erro em vez de escolha silenciosa", () => {
    const tied = groupRows("A", ["x1", "x2", "x3"], [6, 3, 3]);
    tied.rows[1].tied = true; tied.rows[1].tiedWith = ["x3"]; tied.rows[2].tied = true; tied.rows[2].tiedWith = ["x2"];
    expect(() => selectQualifiers([tied], 2, 0)).toThrow(/Empate/);
  });
});

describe("clubes", () => {
  const slots = [{ matchId: "m1", side: "HOME" as const }, { matchId: "m1", side: "AWAY" as const }, { matchId: "m2", side: "HOME" as const }, { matchId: "m2", side: "AWAY" as const }];
  it("sem repetição usa clubes distintos da lista restrita", () => {
    const res = drawClubs(slots, ["rm", "ars", "bar", "psg", "liv"], false, "s");
    expect(new Set(res.map((r) => r.clubId)).size).toBe(4);
  });
  it("sem repetição com clubes insuficientes falha", () => {
    expect(() => drawClubs(slots, ["rm", "ars"], false, "s")).toThrow(/insuficientes/);
  });
  it("com repetição nunca coloca o mesmo clube dos dois lados", () => {
    for (let i = 0; i < 20; i++) {
      const res = drawClubs(slots, ["rm", "ars"], true, `s${i}`);
      expect(res[0].clubId).not.toBe(res[1].clubId);
      expect(res[2].clubId).not.toBe(res[3].clubId);
    }
  });
});

describe("estatísticas e permissões", () => {
  it("recordes calculados de jogos reais", () => {
    const stats = computeStats(["a", "b", "c"], [
      { ...m("a", "b", 7, 0), roundNumber: 1 }, { ...m("b", "c", 3, 3), roundNumber: 2 }, { ...m("a", "c", 1, 0), roundNumber: 3 },
    ]);
    expect(stats.biggestWins[0]).toMatchObject({ winnerEntryId: "a", margin: 7 });
    expect(stats.highestScoring[0].totalGoals).toBe(7);
    expect(stats.bestAttack[0]).toEqual({ entryId: "a", goalsFor: 8 });
    expect(stats.longestWinStreak[0]).toEqual({ entryId: "a", streak: 2 });
  });
  it("participante edita placar por padrão; toggle desligado bloqueia; viewer nunca", () => {
    const p = { role: "PARTICIPANT" as const, ...DEFAULT_PARTICIPANT_FLAGS };
    expect(hasPermission(p, "RESULT_EDIT")).toBe(true);
    expect(hasPermission(p, "RULE_EDIT")).toBe(false);
    expect(hasPermission({ ...p, canEditResult: false }, "RESULT_EDIT")).toBe(false);
    expect(hasPermission({ ...p, role: "VIEWER" }, "RESULT_EDIT")).toBe(false);
    expect(hasPermission({ ...p, role: "OWNER", canEditRules: false }, "RULE_EDIT")).toBe(true);
    expect(hasPermission(null, "RESULT_EDIT")).toBe(false);
  });
});
