import { z } from "zod";
import { clubRulesSchema } from "./clubRules";

/** Critérios de desempate permitidos, aplicados na ordem configurada. */
export const TIEBREAKERS = [
  "POINTS",
  "WINS",
  "GOAL_DIFF",
  "GOALS_FOR",
  "FEWEST_GOALS_AGAINST",
  "HEAD_TO_HEAD",
] as const;
export type Tiebreaker = (typeof TIEBREAKERS)[number];

export const tournamentSettingsSchema = z.object({
  points: z
    .object({
      win: z.number().int().min(0).max(10).default(3),
      draw: z.number().int().min(0).max(10).default(1),
      loss: z.number().int().min(-5).max(10).default(0),
    })
    .default({ win: 3, draw: 1, loss: 0 }),
  tiebreakers: z
    .array(z.enum(TIEBREAKERS))
    .min(1)
    .refine((list) => new Set(list).size === list.length, "Critério de desempate repetido")
    .default(["POINTS", "WINS", "GOAL_DIFF", "GOALS_FOR", "HEAD_TO_HEAD"]),
  bonus: z
    .object({
      /** +N pontos ao melhor saldo do grupo quando o grupo é encerrado. */
      bestGoalDiff: z
        .object({
          enabled: z.boolean().default(false),
          points: z.number().int().min(1).max(5).default(1),
          /** Empate no melhor saldo: ALL = todos recebem, TIEBREAK = usa GOALS_FOR, NONE = ninguém. */
          tiePolicy: z.enum(["ALL", "TIEBREAK", "NONE"]).default("NONE"),
        })
        .default({ enabled: false, points: 1, tiePolicy: "NONE" }),
    })
    .default({ bestGoalDiff: { enabled: false, points: 1, tiePolicy: "NONE" } }),
  walkover: z
    .object({
      presentPoints: z.number().int().min(0).max(10).default(3),
      absentPoints: z.number().int().min(-5).max(10).default(0),
      /** Placar simbólico (presente x ausente); null = sem placar. */
      symbolicScore: z
        .object({ present: z.number().int().min(0), absent: z.number().int().min(0) })
        .nullable()
        .default({ present: 3, absent: 0 }),
      /** Se o W.O. conta como jogo/vitória/derrota e gols simbólicos nas estatísticas. */
      countStats: z.boolean().default(true),
    })
    .default({ presentPoints: 3, absentPoints: 0, symbolicScore: { present: 3, absent: 0 }, countStats: true }),
  groupStage: z
    .object({
      groupCount: z.number().int().min(1).max(32).default(1),
      legs: z.union([z.literal(1), z.literal(2)]).default(1),
      qualifiersPerGroup: z.number().int().min(0).default(2),
      /** Quantidade de vagas extras para os melhores colocados seguintes (ex.: 2 melhores terceiros). */
      bestOfRest: z.number().int().min(0).default(0),
    })
    .default({ groupCount: 1, legs: 1, qualifiersPerGroup: 2, bestOfRest: 0 }),
  knockout: z
    .object({
      legs: z.literal(1).default(1),
      /** Empate em mata-mata: pênaltis registrados ou decisão administrativa. Nunca saldo arbitrário. */
      drawResolution: z.enum(["PENALTIES", "MANUAL"]).default("PENALTIES"),
      seeding: z.enum(["RANKED", "MANUAL"]).default("RANKED"),
      avoidSameGroup: z.boolean().default(true),
    })
    .default({ legs: 1, drawResolution: "PENALTIES", seeding: "RANKED", avoidSameGroup: true }),
  media: z
    .object({
      maxUploadBytes: z.number().int().min(100_000).max(10_000_000).default(5_000_000),
      quotaBytes: z.number().int().min(1_000_000).default(500_000_000),
    })
    .default({ maxUploadBytes: 5_000_000, quotaBytes: 500_000_000 }),
  /** Regras de clube por fase. Ausente em campeonatos antigos: valem as configurações gravadas em cada fase. */
  clubRules: clubRulesSchema.optional(),
});

export type TournamentSettings = z.infer<typeof tournamentSettingsSchema>;

export function parseSettings(input: unknown): TournamentSettings {
  return tournamentSettingsSchema.parse(input ?? {});
}
