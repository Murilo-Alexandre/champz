import type { z } from "zod";
import type { Db, DbOrTx } from "@/lib/db/prisma";
import { computeStats } from "@/lib/tournament/stats";
import { computeStandings } from "@/lib/tournament/standings";
import { audit } from "./audit";
import { requireRead } from "./access";
import { settingsOf } from "./tournaments";
import { loadGroupStandings } from "./stages";
import { conflict, forbidden, notFound } from "../errors";
import type { clubSchema } from "../validators";

// ───────────── Clubes (catálogo) ─────────────

export function listClubs(db: DbOrTx, includeInactive = false) {
  return db.club.findMany({ where: includeInactive ? {} : { active: true }, orderBy: { name: "asc" } });
}

export async function createClub(db: Db, userId: string, input: z.infer<typeof clubSchema>) {
  const exists = await db.club.findUnique({ where: { name: input.name } });
  if (exists) throw conflict("CLUB_EXISTS", "Já existe um clube com esse nome");
  return db.$transaction(async (tx) => {
    const club = await tx.club.create({ data: { ...input, createdById: userId } });
    await audit(tx, { tournamentId: null, actorUserId: userId, targetType: "CLUB", targetId: club.id, action: "CREATE", after: club });
    return club;
  });
}

export async function updateClub(db: Db, userId: string, clubId: string, input: Partial<z.infer<typeof clubSchema>> & { active?: boolean }) {
  return db.$transaction(async (tx) => {
    const club = await tx.club.findUnique({ where: { id: clubId } });
    if (!club) throw notFound("Clube");
    if (club.createdById !== userId) throw forbidden("Somente quem cadastrou o clube pode editá-lo");
    const updated = await tx.club.update({ where: { id: clubId }, data: input });
    await audit(tx, { tournamentId: null, actorUserId: userId, targetType: "CLUB", targetId: clubId, action: "UPDATE", before: club, after: updated });
    return updated;
  });
}

// ───────────── Estatísticas ─────────────

export async function getTournamentStats(db: DbOrTx, userId: string | null, tournamentId: string) {
  const { tournament } = await requireRead(db, tournamentId, userId);
  const settings = settingsOf(tournament);
  const [entries, matches, stages] = await Promise.all([
    db.entry.findMany({ where: { tournamentId }, select: { id: true, name: true } }),
    db.match.findMany({ where: { tournamentId }, include: { round: { select: { number: true } }, stage: { select: { order: true, type: true } } } }),
    db.stage.findMany({ where: { tournamentId }, orderBy: { order: "asc" } }),
  ]);
  // Ordem global de rodada: fase * 100 + rodada.
  const statsMatches = matches.map((m) => ({ ...m, roundNumber: m.stage.order * 100 + m.round.number }));
  const stats = computeStats(entries.map((e) => e.id), statsMatches);

  // Evolução por rodada (pontos corridos): posição e pontos acumulados.
  const league = stages.find((s) => s.type === "LEAGUE");
  let evolution: { round: number; rows: { entryId: string; position: number; points: number }[] }[] = [];
  if (league) {
    const leagueMatches = matches.filter((m) => m.stageId === league.id);
    const lastRound = Math.max(0, ...leagueMatches.filter((m) => ["COMPLETED", "WALKOVER"].includes(m.status)).map((m) => m.round.number));
    evolution = Array.from({ length: lastRound }, (_, i) => {
      const upTo = leagueMatches.filter((m) => m.round.number <= i + 1);
      const rows = computeStandings(entries.map((e) => e.id), upTo, settings);
      return { round: i + 1, rows: rows.map((r) => ({ entryId: r.entryId, position: r.position, points: r.points })) };
    });
  }
  return { entries, stats, evolution };
}

// ───────────── Retrospectiva ─────────────

export async function getRetrospective(db: DbOrTx, userId: string, tournamentId: string) {
  const access = await requireRead(db, tournamentId, userId);
  if (access.tournament.status !== "FINISHED") throw conflict("NOT_FINISHED", "Retrospectiva liberada quando o campeonato terminar");
  const t = access.tournament;
  const settings = settingsOf(t);
  const [entries, stages, statsBundle, photos, matchCount] = await Promise.all([
    db.entry.findMany({ where: { tournamentId }, include: { players: { include: { user: { select: { id: true, name: true, username: true, avatarMediaId: true } } } } } }),
    db.stage.findMany({ where: { tournamentId }, orderBy: { order: "asc" } }),
    getTournamentStats(db, userId, tournamentId),
    access.member
      ? db.media.findMany({ where: { tournamentId, status: "READY", kind: { in: ["PHOTO", "PROOF"] } }, orderBy: [{ takenAt: "asc" }, { createdAt: "asc" }], select: { id: true, caption: true, takenAt: true, createdAt: true, matchId: true, width: true, height: true, ownerUserId: true } })
      : Promise.resolve([]),
    db.match.count({ where: { tournamentId, status: { in: ["COMPLETED", "WALKOVER"] } } }),
  ]);

  let runnerUpEntryId: string | null = null;
  const knockout = stages.find((s) => s.type === "KNOCKOUT");
  if (knockout) {
    const final = await db.match.findFirst({ where: { stageId: knockout.id, nextMatchId: null } });
    if (final?.winnerEntryId) runnerUpEntryId = final.homeEntryId === final.winnerEntryId ? final.awayEntryId : final.homeEntryId;
  }
  const roundRobin = stages.find((s) => s.type !== "KNOCKOUT");
  const standings = roundRobin ? await loadGroupStandings(db, roundRobin.id, settings) : [];
  if (!runnerUpEntryId && standings.length === 1) runnerUpEntryId = standings[0].rows[1]?.entryId ?? null;

  return {
    tournament: { id: t.id, name: t.name, edition: t.edition, format: t.format, startsAt: t.startsAt, finishedAt: t.finishedAt },
    championEntryId: t.championEntryId,
    runnerUpEntryId,
    entries,
    standings,
    stats: statsBundle.stats,
    evolution: statsBundle.evolution,
    matchCount,
    photos,
  };
}
