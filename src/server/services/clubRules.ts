import type { DbOrTx } from "@/lib/db/prisma";
import {
  feasibilityError, phaseKeyFor, phaseLabel, plannedPhases, poolClubIds, resolveClubRule,
  type ClubCategory, type ClubMode, type ClubPool, type ClubRule,
} from "@/lib/tournament/clubRules";
import { parseSettings, type TournamentSettings } from "@/lib/tournament/settings";
import { badRequest, conflict } from "../errors";

export type RoundClubRule = {
  key: string; label: string; mode: ClubMode; allowRepeat: boolean; pool: ClubPool; clubIds: string[];
  /** Clubes efetivamente permitidos nesta rodada. */
  poolClubIds: string[];
  /** true = campeonato antigo, regra gravada na própria fase. */
  legacy: boolean;
};
type CatalogRow = { id: string; category: ClubCategory; active: boolean };
type StageLike = { type: "GROUP" | "LEAGUE" | "KNOCKOUT"; clubAssignmentMode: ClubMode; allowClubRepeat: boolean; allowedClubs?: { clubId: string }[] };

export function catalogRows(db: DbOrTx): Promise<CatalogRow[]> {
  return db.club.findMany({ select: { id: true, category: true, active: true } });
}

/** Regra efetiva de uma rodada: regras por fase do regulamento ou, em campeonatos antigos, a configuração da fase. */
export function ruleForRound(settings: TournamentSettings, stage: StageLike, matchesInRound: number, catalog: CatalogRow[]): RoundClubRule {
  const key = phaseKeyFor(stage.type, matchesInRound);
  const label = stage.type === "KNOCKOUT" ? phaseLabel(key) : stage.type === "LEAGUE" ? "Pontos corridos" : "Fase de grupos";
  const rule = resolveClubRule(settings.clubRules, key);
  if (rule) return { key, label, ...rule, poolClubIds: poolClubIds(rule, catalog), legacy: false };
  const ids = stage.allowedClubs?.map((c) => c.clubId) ?? [];
  const legacyRule: ClubRule = { mode: stage.clubAssignmentMode, allowRepeat: stage.allowClubRepeat, pool: ids.length ? "CUSTOM" : "ALL", clubIds: ids };
  return { key, label, ...legacyRule, poolClubIds: poolClubIds(legacyRule, catalog), legacy: true };
}

export async function loadRoundRule(db: DbOrTx, roundId: string): Promise<RoundClubRule> {
  const round = await db.round.findUniqueOrThrow({
    where: { id: roundId },
    include: { stage: { include: { allowedClubs: { select: { clubId: true } }, tournament: { select: { settings: true } } } }, _count: { select: { matches: true } } },
  });
  return ruleForRound(parseSettings(round.stage.tournament.settings), round.stage, round._count.matches, await catalogRows(db));
}

/** Lista personalizada só com clubes existentes e ativos; cada regra precisa de ao menos 2 clubes. */
export async function assertClubRulesValid(db: DbOrTx, settings: TournamentSettings) {
  const rules = settings.clubRules;
  if (!rules) return;
  const catalog = await catalogRows(db);
  const active = new Set(catalog.filter((c) => c.active).map((c) => c.id));
  for (const [key, rule] of [["default", rules.default] as const, ...Object.entries(rules.phases)]) {
    const label = key === "default" ? "Regra padrão" : phaseLabel(key);
    if (rule.pool === "CUSTOM" && rule.clubIds.some((id) => !active.has(id))) {
      throw badRequest("INVALID_CLUB", `${label}: há clube inexistente ou inativo na lista personalizada.`);
    }
    if (poolClubIds(rule, catalog).length < 2) throw badRequest("CLUB_RULE_IMPOSSIBLE", `${label}: escolha ao menos 2 clubes.`);
  }
}

/** Com os participantes conhecidos: repetição proibida precisa caber em cada rodada de cada fase. */
export async function assertClubRulesFeasible(db: DbOrTx, settings: TournamentSettings, format: "LEAGUE" | "GROUPS_ONLY" | "KNOCKOUT" | "GROUPS_KNOCKOUT", entryCount: number) {
  const rules = settings.clubRules;
  if (!rules) return;
  const catalog = await catalogRows(db);
  for (const phase of plannedPhases(format, entryCount, settings.groupStage)) {
    const rule = resolveClubRule(rules, phase.key)!;
    const err = feasibilityError(rule, poolClubIds(rule, catalog).length, phase.slotsPerRound, phase.label);
    if (err) throw badRequest("CLUB_RULE_IMPOSSIBLE", err);
  }
}

/** Mudança de regra de clubes não pode atingir rodadas que já têm partidas disputadas. */
export async function assertNoRetroactiveClubChange(db: DbOrTx, tournamentId: string, before: TournamentSettings, after: TournamentSettings) {
  if (JSON.stringify(before.clubRules ?? null) === JSON.stringify(after.clubRules ?? null)) return;
  const rounds = await db.round.findMany({
    where: { stage: { tournamentId } },
    select: { stage: { select: { type: true, clubAssignmentMode: true, allowClubRepeat: true, allowedClubs: { select: { clubId: true } } } }, matches: { select: { status: true } } },
  });
  const catalog = await catalogRows(db);
  for (const r of rounds) {
    if (!r.matches.some((m) => m.status === "COMPLETED" || m.status === "WALKOVER")) continue;
    const a = ruleForRound(before, r.stage, r.matches.length, catalog);
    const b = ruleForRound(after, r.stage, r.matches.length, catalog);
    const same = a.mode === b.mode && a.allowRepeat === b.allowRepeat && a.poolClubIds.slice().sort().join() === b.poolClubIds.slice().sort().join();
    if (!same) throw conflict("PHASE_PLAYED", `${b.label}: já há partidas disputadas, então a regra de clubes desta fase não pode mudar.`);
  }
}
