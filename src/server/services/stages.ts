import type { z } from "zod";
import type { Db, DbOrTx, Tx } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { drawGroups, groupLabel, roundRobin } from "@/lib/tournament/roundRobin";
import { newSeed, shuffle } from "@/lib/tournament/rng";
import { computeStandings, bestGoalDiffBonus, type StandingRow } from "@/lib/tournament/standings";
import {
  planBracket, selectQualifiers, validateManualPairs, type BracketPlan, type GroupStanding,
} from "@/lib/tournament/knockout";
import type { TournamentSettings } from "@/lib/tournament/settings";
import { audit } from "./audit";
import { requirePermission, requireRead } from "./access";
import { settingsOf } from "./tournaments";
import { badRequest, conflict, notFound } from "../errors";
import type { advanceStageSchema, generateStageSchema, groupTiebreakSchema, stageClubsSchema } from "../validators";

type ClubsInput = z.infer<typeof generateStageSchema>["clubs"];
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;
const FINISHED_STATUSES = ["COMPLETED", "WALKOVER", "CANCELLED", "BYE"] as const;

function knockoutRoundName(entrants: number, round: number) {
  return ({ 2: "Final", 4: "Semifinal", 8: "Quartas de final", 16: "Oitavas de final", 32: "16 avos de final" } as Record<number, string>)[entrants] ?? `Rodada ${round}`;
}

async function setStageClubs(tx: Tx, stageId: string, clubs: ClubsInput) {
  if (!clubs?.allowedClubIds?.length) return;
  const found = await tx.club.count({ where: { id: { in: clubs.allowedClubIds }, active: true } });
  if (found !== new Set(clubs.allowedClubIds).size) throw badRequest("INVALID_CLUB", "Clube inexistente ou inativo na lista permitida");
  await tx.stageClub.createMany({ data: [...new Set(clubs.allowedClubIds)].map((clubId) => ({ stageId, clubId })) });
}

async function createRoundRobinStage(
  tx: Tx,
  p: { tournamentId: string; order: number; type: "LEAGUE" | "GROUP"; name: string; groups: string[][]; legs: 1 | 2; clubs: ClubsInput; settings: TournamentSettings; drawId: string },
) {
  const stage = await tx.stage.create({
    data: {
      tournamentId: p.tournamentId, order: p.order, type: p.type, name: p.name, legs: p.legs,
      clubAssignmentMode: p.clubs?.mode ?? "MANUAL", allowClubRepeat: p.clubs?.allowRepeat ?? true,
      rulesSnapshot: asJson(p.settings), drawId: p.drawId,
    },
  });
  await setStageClubs(tx, stage.id, p.clubs);

  const schedules = p.groups.map((g) => roundRobin(g, p.legs));
  const roundCount = Math.max(...schedules.map((s) => s.length));
  const rounds: { id: string }[] = [];
  for (let r = 1; r <= roundCount; r++) {
    rounds.push(await tx.round.create({ data: { stageId: stage.id, number: r, name: `Rodada ${r}` } }));
  }
  let matchCount = 0;
  for (let gi = 0; gi < p.groups.length; gi++) {
    const group = await tx.group.create({
      data: {
        stageId: stage.id,
        label: p.type === "LEAGUE" ? "Liga" : groupLabel(gi),
        order: gi,
        entries: { create: p.groups[gi].map((entryId, position) => ({ entryId, position })) },
      },
    });
    const data = schedules[gi].flatMap((round) =>
      round.pairings.map((pair) => ({
        tournamentId: p.tournamentId, stageId: stage.id, roundId: rounds[round.number - 1].id, groupId: group.id,
        homeEntryId: pair.home, awayEntryId: pair.away, status: "READY" as const,
      })),
    );
    matchCount += data.length;
    await tx.match.createMany({ data });
  }
  return { stage, matchCount, roundCount };
}

/** Cria a árvore inteira de mata-mata, liga cada jogo ao seguinte e resolve BYEs (avanço automático). */
export async function createKnockoutStage(
  tx: Tx,
  p: { tournamentId: string; order: number; name: string; plan: BracketPlan; clubs: ClubsInput; settings: TournamentSettings; drawId: string; sourceStageId?: string },
) {
  const stage = await tx.stage.create({
    data: {
      tournamentId: p.tournamentId, order: p.order, type: "KNOCKOUT", name: p.name, legs: 1,
      clubAssignmentMode: p.clubs?.mode ?? "MANUAL", allowClubRepeat: p.clubs?.allowRepeat ?? true,
      rulesSnapshot: asJson(p.settings), drawId: p.drawId, sourceStageId: p.sourceStageId,
    },
  });
  await setStageClubs(tx, stage.id, p.clubs);

  const R = p.plan.rounds;
  const rounds: { id: string }[] = [];
  for (let r = 1; r <= R; r++) {
    rounds.push(await tx.round.create({ data: { stageId: stage.id, number: r, name: knockoutRoundName(p.plan.size / 2 ** (r - 1), r) } }));
  }
  // Do fim para o início para conhecer o nextMatchId.
  const byRound: { id: string }[][] = [];
  for (let r = R; r >= 1; r--) {
    const count = p.plan.size / 2 ** r;
    const created: { id: string }[] = [];
    for (let pos = 0; pos < count; pos++) {
      const next = r < R ? byRound[r][Math.floor(pos / 2)] : null;
      const pair = r === 1 ? p.plan.firstRound[pos] : null;
      created.push(
        await tx.match.create({
          data: {
            tournamentId: p.tournamentId, stageId: stage.id, roundId: rounds[r - 1].id,
            homeEntryId: pair?.home ?? null, awayEntryId: pair?.away ?? null,
            status: pair?.home && pair?.away ? "READY" : "SCHEDULED",
            bracketPosition: pos, bracketHalf: pos < count / 2 ? "A" : "B",
            nextMatchId: next?.id ?? null, nextMatchSide: next ? (pos % 2 === 0 ? "HOME" : "AWAY") : null,
          },
          select: { id: true },
        }),
      );
    }
    byRound[r - 1] = created;
  }
  for (let pos = 0; pos < p.plan.firstRound.length; pos++) {
    const pair = p.plan.firstRound[pos];
    if (pair.home && pair.away) continue;
    const winner = pair.home ?? pair.away!;
    const m = await tx.match.update({
      where: { id: byRound[0][pos].id },
      data: { status: "BYE", winnerEntryId: winner, completedAt: new Date() },
    });
    await placeInNextMatch(tx, m.nextMatchId, m.nextMatchSide, winner);
  }
  return { stage, matchCount: byRound.flat().length };
}

/** Coloca o vencedor no próximo jogo; quando ambos os lados existem, o jogo fica READY. */
export async function placeInNextMatch(tx: Tx, nextMatchId: string | null, side: "HOME" | "AWAY" | null, entryId: string | null) {
  if (!nextMatchId || !side) return;
  const next = await tx.match.findUniqueOrThrow({ where: { id: nextMatchId } });
  const homeEntryId = side === "HOME" ? entryId : next.homeEntryId;
  const awayEntryId = side === "AWAY" ? entryId : next.awayEntryId;
  await tx.match.update({
    where: { id: nextMatchId },
    data: { homeEntryId, awayEntryId, status: homeEntryId && awayEntryId ? "READY" : "SCHEDULED", version: { increment: 1 } },
  });
  // Clube escolhido para o lado anterior não vale para outro participante.
  if (side && (side === "HOME" ? next.homeEntryId : next.awayEntryId) !== entryId) {
    await tx.matchClub.deleteMany({ where: { matchId: nextMatchId, side } });
  }
}

// ───────────── Geração inicial ─────────────

export async function generateInitialStage(db: Db, actorId: string, tournamentId: string, input: z.infer<typeof generateStageSchema>) {
  return db.$transaction(async (tx) => {
    const { tournament } = await requirePermission(tx, tournamentId, actorId, "DRAW_EDIT");
    if (["FINISHED", "CANCELLED"].includes(tournament.status)) throw conflict("TOURNAMENT_CLOSED", "Campeonato encerrado");
    const settings = settingsOf(tournament);

    const existing = await tx.stage.findMany({ where: { tournamentId }, select: { id: true } });
    if (existing.length) {
      const played = await tx.match.count({ where: { tournamentId, status: { in: ["COMPLETED", "WALKOVER"] } } });
      if (played > 0) throw conflict("RESULTS_EXIST", "Já existem resultados lançados; o sorteio não pode ser refeito");
      const media = await tx.media.count({ where: { tournamentId, matchId: { not: null } } });
      if (media > 0) throw conflict("MEDIA_LINKED", "Há fotos vinculadas a partidas; o sorteio não pode ser refeito");
      await tx.stage.deleteMany({ where: { tournamentId } });
    }

    const entries = await tx.entry.findMany({ where: { tournamentId, active: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
    const ids = entries.map((e) => e.id);
    if (ids.length < 2) throw badRequest("TOO_FEW_ENTRIES", "Cadastre ao menos 2 participantes");
    const seed = input.seed ?? newSeed();

    let groups: string[][];
    let resultSummary: unknown;
    let created: { stage: { id: string }; matchCount: number };

    const drawInput = { mode: input.mode, format: tournament.format, entryIds: ids, groups: input.groups, seeding: input.seeding, groupCount: settings.groupStage.groupCount };
    const draw = await tx.draw.create({ data: { tournamentId, kind: "INITIAL_STAGE", seed, input: asJson(drawInput), result: {}, createdById: actorId } });

    if (tournament.format === "KNOCKOUT") {
      let order: string[];
      if (input.mode === "MANUAL") {
        order = input.seeding ?? [];
        assertPermutation(order, ids);
      } else order = shuffle(ids, seed);
      const plan = planBracket(order);
      created = await createKnockoutStage(tx, { tournamentId, order: 1, name: "Mata-mata", plan, clubs: input.clubs, settings, drawId: draw.id });
      resultSummary = { seeding: order, firstRound: plan.firstRound };
    } else {
      if (tournament.format === "LEAGUE") {
        const order = input.mode === "MANUAL" && input.seeding ? (assertPermutation(input.seeding, ids), input.seeding) : shuffle(ids, seed);
        groups = [order];
      } else if (input.mode === "MANUAL") {
        groups = input.groups ?? [];
        assertPermutation(groups.flat(), ids);
      } else {
        groups = drawGroups(ids, settings.groupStage.groupCount, seed);
      }
      created = await createRoundRobinStage(tx, {
        tournamentId, order: 1, type: tournament.format === "LEAGUE" ? "LEAGUE" : "GROUP",
        name: tournament.format === "LEAGUE" ? "Pontos corridos" : "Fase de grupos",
        groups, legs: settings.groupStage.legs, clubs: input.clubs, settings, drawId: draw.id,
      });
      resultSummary = { groups };
    }

    await tx.draw.update({ where: { id: draw.id }, data: { result: asJson(resultSummary) } });
    await tx.tournament.update({ where: { id: tournamentId }, data: { status: "ACTIVE" } });
    await audit(tx, {
      tournamentId, actorUserId: actorId, targetType: "STAGE", targetId: created.stage.id,
      action: existing.length ? "REDRAW" : "GENERATE", after: { drawId: draw.id, seed, mode: input.mode, result: resultSummary, matchCount: created.matchCount },
    });
    return { stageId: created.stage.id, drawId: draw.id, seed, matchCount: created.matchCount, result: resultSummary };
  });
}

function assertPermutation(given: readonly string[], expected: readonly string[]) {
  const a = [...given].sort();
  const b = [...expected].sort();
  if (a.length !== b.length || a.some((x, i) => x !== b[i])) {
    throw badRequest("ENTRY_MISMATCH", "A distribuição manual deve conter cada participante ativo exatamente uma vez");
  }
}

// ───────────── Classificação a partir do banco ─────────────

export async function loadGroupStandings(db: DbOrTx, stageId: string, settings: TournamentSettings) {
  const [groups, matches, adjustments] = await Promise.all([
    db.group.findMany({ where: { stageId }, orderBy: { order: "asc" }, include: { entries: { orderBy: { position: "asc" } } } }),
    db.match.findMany({ where: { stageId } }),
    db.standingAdjustment.findMany({ where: { stageId } }),
  ]);
  return groups.map((g) => {
    const rows = computeStandings(
      g.entries.map((e) => e.entryId),
      matches.filter((m) => m.groupId === g.id),
      settings,
      adjustments.filter((a) => a.groupId === g.id),
      Array.isArray(g.manualOrder) ? (g.manualOrder as string[]) : null,
    );
    return { groupId: g.id, label: g.label, closedAt: g.closedAt, rows } satisfies GroupStanding & { closedAt: Date | null };
  });
}

/** Encerra fase de grupos/liga: exige jogos finalizados e aplica bônus uma única vez (unique no banco). */
export async function closeRoundRobinStage(tx: Tx, actorId: string, stageId: string, settings: TournamentSettings) {
  const stage = await tx.stage.findUniqueOrThrow({ where: { id: stageId } });
  if (stage.type === "KNOCKOUT") throw badRequest("INVALID_STAGE", "Fase de mata-mata não usa encerramento de grupos");
  const pending = await tx.match.count({ where: { stageId, status: { notIn: [...FINISHED_STATUSES] } } });
  if (pending > 0) throw conflict("MATCHES_PENDING", `Ainda há ${pending} partida(s) sem resultado nesta fase`);
  if (stage.status === "CLOSED") return stage;

  const standings = await loadGroupStandings(tx, stageId, settings);
  for (const g of standings) {
    for (const adj of bestGoalDiffBonus(g.rows, settings)) {
      await tx.standingAdjustment.create({
        data: { stageId, groupId: g.groupId, entryId: adj.entryId, rule: adj.rule, pointsDelta: adj.pointsDelta, reason: "Bônus de melhor saldo do grupo", createdById: actorId },
      });
      await audit(tx, { tournamentId: stage.tournamentId, actorUserId: actorId, targetType: "STANDING_ADJUSTMENT", targetId: g.groupId, action: "BONUS", after: adj });
    }
    await tx.group.update({ where: { id: g.groupId }, data: { closedAt: new Date() } });
  }
  const closed = await tx.stage.update({ where: { id: stageId }, data: { status: "CLOSED", closedAt: new Date() } });
  await audit(tx, { tournamentId: stage.tournamentId, actorUserId: actorId, targetType: "STAGE", targetId: stageId, action: "CLOSE" });
  return closed;
}

/** Grupos -> mata-mata, uma única vez (sourceStageId é unique). */
export async function advanceToKnockout(db: Db, actorId: string, stageId: string, input: z.infer<typeof advanceStageSchema>) {
  return db.$transaction(async (tx) => {
    const stage = await tx.stage.findUnique({ where: { id: stageId } });
    if (!stage) throw notFound("Fase");
    const { tournament } = await requirePermission(tx, stage.tournamentId, actorId, "DRAW_EDIT");
    if (tournament.format !== "GROUPS_KNOCKOUT" || stage.type !== "GROUP") throw badRequest("INVALID_STAGE", "Avanço disponível apenas da fase de grupos para o mata-mata");
    const already = await tx.stage.findUnique({ where: { sourceStageId: stageId } });
    if (already) throw conflict("ALREADY_ADVANCED", "O mata-mata desta fase já foi gerado", { stageId: already.id });

    const settings = settingsOf(tournament);
    await closeRoundRobinStage(tx, actorId, stageId, settings);
    const standings = await loadGroupStandings(tx, stageId, settings);
    const qualifiers = selectQualifiers(standings, settings.groupStage.qualifiersPerGroup, settings.groupStage.bestOfRest);
    const active = new Set((await tx.entry.findMany({ where: { tournamentId: tournament.id, active: true }, select: { id: true } })).map((e) => e.id));
    const inactive = qualifiers.filter((q) => !active.has(q.entryId));
    if (inactive.length) throw conflict("QUALIFIER_WITHDRAWN", "Classificado desistente: defina substituição/decisão antes de gerar o mata-mata", { entryIds: inactive.map((q) => q.entryId) });

    const plan = input.pairs
      ? validateManualPairs(input.pairs, qualifiers.map((q) => q.entryId))
      : planBracket(qualifiers.map((q) => q.entryId), { groupOf: new Map(qualifiers.map((q) => [q.entryId, q.groupId])), avoidSameGroup: settings.knockout.avoidSameGroup });

    const draw = await tx.draw.create({
      data: { tournamentId: tournament.id, kind: "BRACKET", seed: "deterministic", input: asJson({ qualifiers, manual: !!input.pairs }), result: asJson(plan), createdById: actorId },
    });
    const order = (await tx.stage.count({ where: { tournamentId: tournament.id } })) + 1;
    const created = await createKnockoutStage(tx, { tournamentId: tournament.id, order, name: "Mata-mata", plan, clubs: input.clubs, settings, drawId: draw.id, sourceStageId: stageId });
    await audit(tx, { tournamentId: tournament.id, actorUserId: actorId, targetType: "STAGE", targetId: created.stage.id, action: "ADVANCE", after: { qualifiers, plan } });
    return { stageId: created.stage.id, qualifiers, plan };
  });
}

/** Encerra LEAGUE / GROUPS_ONLY e define campeão (líder sem empate não resolvido). */
export async function finishRoundRobinTournament(db: Db, actorId: string, tournamentId: string) {
  return db.$transaction(async (tx) => {
    const { tournament } = await requirePermission(tx, tournamentId, actorId, "RULE_EDIT");
    if (!["LEAGUE", "GROUPS_ONLY"].includes(tournament.format)) throw badRequest("INVALID_FORMAT", "Campeonatos com mata-mata terminam na final");
    if (tournament.status !== "ACTIVE") throw conflict("NOT_ACTIVE", "Campeonato não está em andamento");
    const stage = await tx.stage.findFirst({ where: { tournamentId }, orderBy: { order: "asc" } });
    if (!stage) throw conflict("NO_STAGE", "Nenhuma fase gerada");
    const settings = settingsOf(tournament);
    await closeRoundRobinStage(tx, actorId, stage.id, settings);
    const standings = await loadGroupStandings(tx, stage.id, settings);
    let championEntryId: string | null = null;
    if (standings.length === 1) {
      const [first, second] = standings[0].rows;
      if (second && first.tied && first.tiedWith.includes(second.entryId)) {
        throw conflict("UNRESOLVED_TIE", "Empate na liderança sem critério resolutivo. Defina a ordem manual de desempate.", { entryIds: [first.entryId, ...first.tiedWith] });
      }
      championEntryId = first.entryId;
    }
    const updated = await tx.tournament.update({ where: { id: tournamentId }, data: { status: "FINISHED", finishedAt: new Date(), championEntryId } });
    await audit(tx, { tournamentId, actorUserId: actorId, targetType: "TOURNAMENT", targetId: tournamentId, action: "FINISH", after: { championEntryId } });
    return updated;
  });
}

export async function setGroupTiebreak(db: Db, actorId: string, groupId: string, input: z.infer<typeof groupTiebreakSchema>) {
  return db.$transaction(async (tx) => {
    const group = await tx.group.findUnique({ where: { id: groupId }, include: { stage: true, entries: true } });
    if (!group) throw notFound("Grupo");
    await requirePermission(tx, group.stage.tournamentId, actorId, "RULE_EDIT");
    const inGroup = new Set(group.entries.map((e) => e.entryId));
    if (input.order.some((id) => !inGroup.has(id))) throw badRequest("ENTRY_MISMATCH", "Ordem contém participante de fora do grupo");
    if (await tx.stage.findUnique({ where: { sourceStageId: group.stageId } })) throw conflict("ALREADY_ADVANCED", "Mata-mata já gerado a partir deste grupo");
    const updated = await tx.group.update({ where: { id: groupId }, data: { manualOrder: input.order } });
    await audit(tx, { tournamentId: group.stage.tournamentId, actorUserId: actorId, targetType: "GROUP", targetId: groupId, action: "MANUAL_TIEBREAK", before: group.manualOrder, after: input.order, reason: input.reason });
    return updated;
  });
}

export async function updateStageClubs(db: Db, actorId: string, stageId: string, input: z.infer<typeof stageClubsSchema>) {
  return db.$transaction(async (tx) => {
    const stage = await tx.stage.findUnique({ where: { id: stageId }, include: { allowedClubs: true } });
    if (!stage) throw notFound("Fase");
    await requirePermission(tx, stage.tournamentId, actorId, "TEAM_EDIT");
    const updated = await tx.stage.update({
      where: { id: stageId },
      data: { clubAssignmentMode: input.mode, allowClubRepeat: input.allowRepeat },
    });
    if (input.allowedClubIds) {
      await tx.stageClub.deleteMany({ where: { stageId } });
      await setStageClubs(tx, stageId, { mode: updated.clubAssignmentMode, allowRepeat: updated.allowClubRepeat, allowedClubIds: input.allowedClubIds });
    }
    await audit(tx, {
      tournamentId: stage.tournamentId, actorUserId: actorId, targetType: "STAGE_CLUBS", targetId: stageId, action: "UPDATE",
      before: { mode: stage.clubAssignmentMode, allowRepeat: stage.allowClubRepeat, allowedClubIds: stage.allowedClubs.map((c) => c.clubId) },
      after: input,
    });
    return updated;
  });
}

// ───────────── Leitura ─────────────

const entryInclude = {
  players: { include: { user: { select: { id: true, name: true, username: true, image: true, avatarMediaId: true } } } },
} satisfies Prisma.EntryInclude;

export async function getStageView(db: DbOrTx, userId: string | null, stageId: string) {
  const stage = await db.stage.findUnique({ where: { id: stageId }, include: { allowedClubs: { include: { club: true } } } });
  if (!stage) throw notFound("Fase");
  const { tournament } = await requireRead(db, stage.tournamentId, userId);
  const settings = settingsOf(tournament);
  const [rounds, standings] = await Promise.all([
    db.round.findMany({
      where: { stageId },
      orderBy: { number: "asc" },
      include: {
        matches: {
          orderBy: [{ bracketPosition: "asc" }, { createdAt: "asc" }],
          include: { homeEntry: { include: entryInclude }, awayEntry: { include: entryInclude }, clubs: { include: { club: true } } },
        },
      },
    }),
    stage.type === "KNOCKOUT" ? Promise.resolve([] as Awaited<ReturnType<typeof loadGroupStandings>>) : loadGroupStandings(db, stageId, settings),
  ]);
  return { stage, rounds, standings };
}

export type { StandingRow };
