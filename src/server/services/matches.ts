import type { z } from "zod";
import type { Db, Tx } from "@/lib/db/prisma";
import type { Match, Stage, Tournament } from "@/generated/prisma/client";
import { hasPermission } from "@/lib/permissions";
import { resolveKnockoutWinner, selectQualifiers } from "@/lib/tournament/knockout";
import { drawClubs } from "@/lib/tournament/clubs";
import { newSeed } from "@/lib/tournament/rng";
import { audit } from "./audit";
import { requirePermission, requireRead, type Access } from "./access";
import { settingsOf } from "./tournaments";
import { loadGroupStandings, placeInNextMatch } from "./stages";
import { badRequest, conflict, forbidden, notFound } from "../errors";
import type { cancelMatchSchema, drawClubsSchema, recordResultSchema, setMatchClubSchema, walkoverSchema } from "../validators";

type Loaded = { match: Match; stage: Stage; tournament: Tournament; access: Access };

async function loadForWrite(tx: Tx, matchId: string, actorId: string, permission: "RESULT_EDIT" | "RULE_EDIT"): Promise<Loaded> {
  const match = await tx.match.findUnique({ where: { id: matchId }, include: { stage: true } });
  if (!match) throw notFound("Partida");
  const access = await requirePermission(tx, match.tournamentId, actorId, permission);
  if (access.tournament.status === "CANCELLED") throw conflict("TOURNAMENT_CLOSED", "Campeonato cancelado");
  if (access.tournament.status !== "ACTIVE" && !(access.tournament.status === "FINISHED" && match.stage.type === "KNOCKOUT")) {
    throw conflict("NOT_ACTIVE", "Campeonato não está em andamento");
  }
  if (match.stage.status === "CLOSED") throw conflict("STAGE_CLOSED", "Fase encerrada: resultados não podem mais ser alterados");
  if (match.status === "BYE") throw conflict("BYE_MATCH", "Partida de folga (BYE) não recebe placar");
  if (match.status === "CANCELLED") throw conflict("MATCH_CANCELLED", "Partida cancelada");
  if (!match.homeEntryId || !match.awayEntryId) throw conflict("MATCH_NOT_READY", "Confronto ainda não definido");
  const { stage, ...rest } = match;
  return { match: rest as Match, stage, tournament: access.tournament, access };
}

const snapshot = (m: Match) => ({
  status: m.status, homeScore: m.homeScore, awayScore: m.awayScore, homePenalties: m.homePenalties, awayPenalties: m.awayPenalties,
  walkoverAbsent: m.walkoverAbsent, walkoverBoth: m.walkoverBoth, winnerEntryId: m.winnerEntryId, adminDecision: m.adminDecision,
});

type Outcome = {
  status: "COMPLETED" | "WALKOVER";
  homeScore: number | null;
  awayScore: number | null;
  homePenalties: number | null;
  awayPenalties: number | null;
  walkoverAbsent: "HOME" | "AWAY" | null;
  walkoverBoth: boolean;
  adminDecision: string | null;
  manualWinnerEntryId: string | null;
};

/** Grava resultado + auditoria + efeitos (chave/qualificação) numa transação, com checagem de impacto. */
async function applyOutcome(tx: Tx, l: Loaded, actorId: string, o: Outcome, meta: { action: string; reason?: string | null; expectedVersion?: number; proofMediaIds?: string[] }) {
  const { match, stage, tournament } = l;
  if (meta.expectedVersion !== undefined && meta.expectedVersion !== match.version) {
    throw conflict("VERSION_CONFLICT", "A partida foi alterada por outra pessoa. Recarregue antes de salvar.");
  }
  const settings = settingsOf(tournament);
  let winnerEntryId: string | null = null;

  if (stage.type === "KNOCKOUT") {
    winnerEntryId = resolveKnockoutWinner({
      homeEntryId: match.homeEntryId, awayEntryId: match.awayEntryId, status: o.status,
      homeScore: o.homeScore, awayScore: o.awayScore, homePenalties: o.homePenalties, awayPenalties: o.awayPenalties,
      walkoverAbsent: o.walkoverAbsent, walkoverBoth: o.walkoverBoth, manualWinnerEntryId: o.manualWinnerEntryId,
    });
    if (match.winnerEntryId && match.winnerEntryId !== winnerEntryId && match.nextMatchId) {
      const next = await tx.match.findUniqueOrThrow({ where: { id: match.nextMatchId } });
      if (["COMPLETED", "WALKOVER"].includes(next.status)) {
        throw conflict("DOWNSTREAM_PLAYED", "Alterar o vencedor afeta uma partida seguinte já disputada. Corrija primeiro a partida seguinte.", { affectedMatchIds: [next.id] });
      }
    }
  } else {
    if (o.homePenalties != null || o.awayPenalties != null || o.manualWinnerEntryId) {
      throw badRequest("NOT_KNOCKOUT", "Pênaltis/decisão manual só existem no mata-mata");
    }
    if (o.status === "COMPLETED" && o.homeScore !== o.awayScore) {
      winnerEntryId = o.homeScore! > o.awayScore! ? match.homeEntryId : match.awayEntryId;
    } else if (o.status === "WALKOVER" && !o.walkoverBoth) {
      winnerEntryId = o.walkoverAbsent === "HOME" ? match.awayEntryId : match.homeEntryId;
    }
  }

  const successor = stage.type === "GROUP" ? await tx.stage.findUnique({ where: { sourceStageId: stage.id } }) : null;
  let qualifiersBefore: string[] | null = null;
  if (successor) {
    const before = await loadGroupStandings(tx, stage.id, settings);
    qualifiersBefore = selectQualifiers(before, settings.groupStage.qualifiersPerGroup, settings.groupStage.bestOfRest).map((q) => q.entryId);
  }

  // Atualização otimista: falha se outra escrita mudou a versão no meio.
  const updated = await tx.match.update({
    where: { id: match.id, version: match.version },
    data: {
      status: o.status, homeScore: o.homeScore, awayScore: o.awayScore, homePenalties: o.homePenalties, awayPenalties: o.awayPenalties,
      walkoverAbsent: o.walkoverAbsent, walkoverBoth: o.walkoverBoth, adminDecision: o.adminDecision,
      winnerEntryId, completedAt: new Date(), updatedById: actorId, version: { increment: 1 },
    },
  });

  if (successor && qualifiersBefore) {
    const after = await loadGroupStandings(tx, stage.id, settings);
    const qualifiersAfter = selectQualifiers(after, settings.groupStage.qualifiersPerGroup, settings.groupStage.bestOfRest).map((q) => q.entryId);
    if (qualifiersAfter.join() !== qualifiersBefore.join()) {
      throw conflict("QUALIFIERS_CHANGED", "Essa correção altera os classificados de um mata-mata já gerado. Revise o chaveamento antes.", { before: qualifiersBefore, after: qualifiersAfter });
    }
  }

  if (meta.proofMediaIds?.length) {
    const ok = await tx.media.count({ where: { id: { in: meta.proofMediaIds }, tournamentId: tournament.id, status: "READY" } });
    if (ok !== meta.proofMediaIds.length) throw badRequest("INVALID_MEDIA", "Comprovante inválido");
    await tx.media.updateMany({ where: { id: { in: meta.proofMediaIds } }, data: { matchId: match.id, stageId: stage.id, roundId: match.roundId } });
  }

  if (stage.type === "KNOCKOUT") {
    if (match.nextMatchId) {
      if (match.winnerEntryId !== winnerEntryId) await placeInNextMatch(tx, match.nextMatchId, match.nextMatchSide, winnerEntryId);
    } else {
      // Final: define campeão.
      const before = tournament.championEntryId;
      await tx.tournament.update({ where: { id: tournament.id }, data: { status: "FINISHED", championEntryId: winnerEntryId, finishedAt: tournament.finishedAt ?? new Date() } });
      if (before !== winnerEntryId) {
        await audit(tx, { tournamentId: tournament.id, actorUserId: actorId, targetType: "TOURNAMENT", targetId: tournament.id, action: before ? "CHAMPION_CHANGED" : "FINISH", before: { championEntryId: before }, after: { championEntryId: winnerEntryId } });
      }
    }
  }

  const action = match.status === "COMPLETED" || match.status === "WALKOVER" ? `${meta.action}_UPDATE` : meta.action;
  await audit(tx, {
    tournamentId: tournament.id, actorUserId: actorId, targetType: "MATCH", targetId: match.id, action,
    before: snapshot(match), after: snapshot(updated), reason: meta.reason, mediaIds: meta.proofMediaIds,
  });
  return updated;
}

export async function recordResult(db: Db, actorId: string, matchId: string, input: z.infer<typeof recordResultSchema>) {
  return db.$transaction(async (tx) => {
    const l = await loadForWrite(tx, matchId, actorId, "RESULT_EDIT");
    const tie = input.homeScore === input.awayScore;
    if (input.manualWinnerEntryId && !hasPermission(l.access.member, "RULE_EDIT")) {
      throw forbidden("Decisão administrativa exige permissão de regras");
    }
    if (input.manualWinnerEntryId && !input.reason) throw badRequest("REASON_REQUIRED", "Informe o motivo da decisão administrativa");
    return applyOutcome(tx, l, actorId, {
      status: "COMPLETED",
      homeScore: input.homeScore, awayScore: input.awayScore,
      homePenalties: tie ? input.homePenalties ?? null : null,
      awayPenalties: tie ? input.awayPenalties ?? null : null,
      walkoverAbsent: null, walkoverBoth: false,
      adminDecision: tie && input.manualWinnerEntryId ? input.reason ?? null : null,
      manualWinnerEntryId: tie ? input.manualWinnerEntryId ?? null : null,
    }, { action: "RESULT", reason: input.reason, expectedVersion: input.expectedVersion, proofMediaIds: input.proofMediaIds });
  });
}

/** W.O. é decisão administrativa: exige RULE_EDIT e motivo. Placar simbólico vem do regulamento. */
export async function recordWalkover(db: Db, actorId: string, matchId: string, input: z.infer<typeof walkoverSchema>) {
  return db.$transaction(async (tx) => {
    const l = await loadForWrite(tx, matchId, actorId, "RULE_EDIT");
    const wo = settingsOf(l.tournament).walkover;
    const both = input.absent === "BOTH";
    const absent: "HOME" | "AWAY" | null = input.absent === "BOTH" ? null : input.absent;
    const sym = !both && wo.symbolicScore ? wo.symbolicScore : null;
    return applyOutcome(tx, l, actorId, {
      status: "WALKOVER",
      homeScore: sym ? (absent === "HOME" ? sym.absent : sym.present) : null,
      awayScore: sym ? (absent === "AWAY" ? sym.absent : sym.present) : null,
      homePenalties: null, awayPenalties: null,
      walkoverAbsent: absent, walkoverBoth: both, adminDecision: input.reason,
      manualWinnerEntryId: input.manualWinnerEntryId ?? null,
    }, { action: "WALKOVER", reason: input.reason, expectedVersion: input.expectedVersion });
  });
}

export async function cancelMatch(db: Db, actorId: string, matchId: string, input: z.infer<typeof cancelMatchSchema>) {
  return db.$transaction(async (tx) => {
    const l = await loadForWrite(tx, matchId, actorId, "RULE_EDIT");
    if (l.stage.type === "KNOCKOUT") throw badRequest("KNOCKOUT_CANCEL", "Partida de mata-mata não pode ser cancelada; registre W.O. ou decisão");
    const updated = await tx.match.update({ where: { id: matchId }, data: { status: "CANCELLED", winnerEntryId: null, updatedById: actorId, version: { increment: 1 } } });
    await audit(tx, { tournamentId: l.tournament.id, actorUserId: actorId, targetType: "MATCH", targetId: matchId, action: "CANCEL", before: snapshot(l.match), after: snapshot(updated), reason: input.reason });
    return updated;
  });
}

// ───────────── Clubes por partida ─────────────

async function allowedClubIds(tx: Tx, stageId: string) {
  const list = await tx.stageClub.findMany({ where: { stageId }, select: { clubId: true } });
  if (list.length) return list.map((c) => c.clubId);
  return (await tx.club.findMany({ where: { active: true }, select: { id: true } })).map((c) => c.id);
}

export async function setMatchClub(db: Db, actorId: string, matchId: string, input: z.infer<typeof setMatchClubSchema>) {
  return db.$transaction(async (tx) => {
    const match = await tx.match.findUnique({ where: { id: matchId }, include: { stage: true, clubs: true } });
    if (!match) throw notFound("Partida");
    const access = await requireRead(tx, match.tournamentId, actorId);
    const sideEntryId = input.side === "HOME" ? match.homeEntryId : match.awayEntryId;
    if (!sideEntryId) throw conflict("MATCH_NOT_READY", "Lado ainda não definido");

    let source: "MANUAL" | "PLAYER_CHOICE" = "MANUAL";
    if (!hasPermission(access.member, "TEAM_EDIT")) {
      const isPlayer = await tx.entryPlayer.findFirst({ where: { entryId: sideEntryId, userId: actorId } });
      if (match.stage.clubAssignmentMode !== "PLAYER_CHOICE" || !isPlayer || !access.member) throw forbidden();
      source = "PLAYER_CHOICE";
    }
    const club = await tx.club.findUnique({ where: { id: input.clubId } });
    if (!club || !club.active) throw badRequest("INVALID_CLUB", "Clube inválido ou inativo");
    const allowed = await allowedClubIds(tx, match.stageId);
    if (!allowed.includes(club.id)) throw badRequest("CLUB_NOT_ALLOWED", "Clube fora da lista permitida nesta fase");
    if (!match.stage.allowClubRepeat) {
      const usedInRound = await tx.matchClub.findFirst({
        where: { clubId: club.id, match: { roundId: match.roundId }, NOT: { matchId, side: input.side } },
      });
      if (usedInRound) throw conflict("CLUB_TAKEN", "Clube já usado nesta rodada (repetição desativada)");
    }
    const before = match.clubs.find((c) => c.side === input.side) ?? null;
    const saved = await tx.matchClub.upsert({
      where: { matchId_side: { matchId, side: input.side } },
      create: { matchId, side: input.side, clubId: club.id, source, setById: actorId },
      update: { clubId: club.id, source, setById: actorId },
    });
    await audit(tx, { tournamentId: match.tournamentId, actorUserId: actorId, targetType: "MATCH_CLUB", targetId: matchId, action: before ? "CLUB_CHANGE" : "CLUB_SET", before, after: saved, reason: input.reason });
    return saved;
  });
}

/** Sorteia clubes para todos os lados ainda sem clube (ou todos, com overwrite) de uma rodada. */
export async function drawRoundClubs(db: Db, actorId: string, roundId: string, input: z.infer<typeof drawClubsSchema>) {
  return db.$transaction(async (tx) => {
    const round = await tx.round.findUnique({ where: { id: roundId }, include: { stage: true, matches: { include: { clubs: true } } } });
    if (!round) throw notFound("Rodada");
    const access = await requireRead(tx, round.stage.tournamentId, actorId);
    if (!hasPermission(access.member, "TEAM_EDIT") && !hasPermission(access.member, "DRAW_EDIT")) throw forbidden();

    const playable = round.matches.filter((m) => m.homeEntryId && m.awayEntryId && !["BYE", "CANCELLED"].includes(m.status));
    const slots = playable.flatMap((m) =>
      (["HOME", "AWAY"] as const).filter((side) => input.overwrite || !m.clubs.some((c) => c.side === side)).map((side) => ({ matchId: m.id, side })),
    );
    if (!slots.length) return { assignments: [], drawId: null };
    let pool = await allowedClubIds(tx, round.stageId);
    if (!round.stage.allowClubRepeat && !input.overwrite) {
      const used = new Set(playable.flatMap((m) => m.clubs.map((c) => c.clubId)));
      pool = pool.filter((id) => !used.has(id));
    }
    const seed = input.seed ?? newSeed();
    const assignments = drawClubs(slots, pool, round.stage.allowClubRepeat, seed);
    const draw = await tx.draw.create({
      data: { tournamentId: round.stage.tournamentId, kind: "CLUBS", seed, input: { roundId, pool, allowRepeat: round.stage.allowClubRepeat }, result: assignments, createdById: actorId },
    });
    for (const a of assignments) {
      await tx.matchClub.upsert({
        where: { matchId_side: { matchId: a.matchId, side: a.side } },
        create: { matchId: a.matchId, side: a.side, clubId: a.clubId, source: "RANDOM", setById: actorId },
        update: { clubId: a.clubId, source: "RANDOM", setById: actorId },
      });
    }
    await audit(tx, { tournamentId: round.stage.tournamentId, actorUserId: actorId, targetType: "ROUND", targetId: roundId, action: "CLUB_DRAW", after: { drawId: draw.id, seed, assignments } });
    return { assignments, drawId: draw.id };
  });
}
