import { z } from "zod";
import { tournamentSettingsSchema } from "@/lib/tournament/settings";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/password-policy";

const id = z.string().min(1).max(64);
const reason = z.string().trim().max(500).optional();

export const createTournamentSchema = z.object({
  name: z.string().trim().min(3).max(80),
  sportCode: z.literal("FIFA").default("FIFA"),
  edition: z.string().trim().max(40).optional(),
  description: z.string().trim().max(1000).optional(),
  format: z.enum(["LEAGUE", "GROUPS_ONLY", "KNOCKOUT", "GROUPS_KNOCKOUT"]),
  entryType: z.enum(["SOLO", "DUO"]).default("SOLO"),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PRIVATE"),
  startsAt: z.coerce.date().optional(),
  settings: tournamentSettingsSchema.partial().optional(),
});

export const updateTournamentSchema = z.object({
  name: z.string().trim().min(3).max(80).optional(),
  edition: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).optional(),
  status: z.enum(["DRAFT", "OPEN", "CANCELLED"]).optional(),
  startsAt: z.coerce.date().nullable().optional(),
  coverMediaId: id.nullable().optional(),
});

export const updateSettingsSchema = z.object({
  settings: tournamentSettingsSchema.partial(),
  expectedVersion: z.number().int().optional(),
  reason,
});

const playerSchema = z.union([
  z.object({ userId: id }),
  z.object({ username: z.string().trim().min(1).max(40) }),
  z.object({ guestName: z.string().trim().min(1).max(60) }),
]);

export const addEntrySchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  players: z.array(playerSchema).min(1).max(2),
});

export const withdrawEntrySchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const generateStageSchema = z.object({
  mode: z.enum(["RANDOM", "MANUAL"]).default("RANDOM"),
  seed: z.string().max(100).optional(),
  /** MANUAL em grupos: lista de grupos (entryIds). MANUAL em mata-mata: entryIds na ordem de seed. */
  groups: z.array(z.array(id).min(2)).optional(),
  seeding: z.array(id).optional(),
  clubs: z
    .object({
      mode: z.enum(["RANDOM", "PLAYER_CHOICE", "MANUAL", "OPPONENT_CHOICE"]).default("MANUAL"),
      allowRepeat: z.boolean().default(true),
      allowedClubIds: z.array(id).default([]),
    })
    .optional(),
});

export const advanceStageSchema = z.object({
  /** Confrontos manuais da 1ª rodada; null = BYE. Se ausente, usa seeding configurado. */
  pairs: z.array(z.object({ home: id.nullable(), away: id.nullable() })).optional(),
  clubs: generateStageSchema.shape.clubs,
});

export const recordResultSchema = z.object({
  homeScore: z.number().int().min(0).max(99),
  awayScore: z.number().int().min(0).max(99),
  homePenalties: z.number().int().min(0).max(99).nullable().optional(),
  awayPenalties: z.number().int().min(0).max(99).nullable().optional(),
  manualWinnerEntryId: id.nullable().optional(),
  expectedVersion: z.number().int().optional(),
  reason,
  proofMediaIds: z.array(id).max(10).optional(),
});

export const walkoverSchema = z.object({
  absent: z.enum(["HOME", "AWAY", "BOTH"]),
  /** Para W.O. duplo em mata-mata: quem avança por decisão administrativa. */
  manualWinnerEntryId: id.nullable().optional(),
  reason: z.string().trim().min(3).max(500),
  expectedVersion: z.number().int().optional(),
});

export const cancelMatchSchema = z.object({ reason: z.string().trim().min(3).max(500) });

export const setMatchClubSchema = z.object({
  side: z.enum(["HOME", "AWAY"]),
  clubId: id,
  reason,
});

export const stageClubsSchema = z.object({
  mode: z.enum(["RANDOM", "PLAYER_CHOICE", "MANUAL", "OPPONENT_CHOICE"]).optional(),
  allowRepeat: z.boolean().optional(),
  allowedClubIds: z.array(id).optional(),
});

export const drawClubsSchema = z.object({ seed: z.string().max(100).optional(), overwrite: z.boolean().default(false) });

export const memberUpdateSchema = z.object({
  role: z.enum(["ADMIN", "PARTICIPANT", "VIEWER"]).optional(),
  canEditResult: z.boolean().optional(),
  canEditClubs: z.boolean().optional(),
  canDraw: z.boolean().optional(),
  canEditRules: z.boolean().optional(),
  canUploadMedia: z.boolean().optional(),
  canManageMembers: z.boolean().optional(),
});

export const addMemberSchema = z.object({
  username: z.string().trim().min(1).max(40),
  role: z.enum(["ADMIN", "PARTICIPANT", "VIEWER"]).default("PARTICIPANT"),
});

export const createInviteSchema = z.object({
  role: z.enum(["PARTICIPANT", "VIEWER"]).default("PARTICIPANT"),
  expiresInHours: z.number().int().min(1).max(24 * 30).optional(),
  maxUses: z.number().int().min(1).max(500).optional(),
});

export const groupTiebreakSchema = z.object({ order: z.array(id).min(2), reason: z.string().trim().min(3).max(500) });

export const clubSchema = z.object({
  name: z.string().trim().min(2).max(60),
  shortName: z.string().trim().max(10).optional(),
  country: z.string().trim().max(40).optional(),
  stars: z.number().min(0).max(5).optional(),
  crestMediaId: id.optional(),
});

export const uploadRequestSchema = z.object({
  kind: z.enum(["PHOTO", "PROOF", "AVATAR", "CREST"]).default("PHOTO"),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "image/avif"]),
  byteSize: z.number().int().min(1),
  width: z.number().int().min(1).max(10000).optional(),
  height: z.number().int().min(1).max(10000).optional(),
  stageId: id.optional(),
  roundId: id.optional(),
  matchId: id.optional(),
  caption: z.string().trim().max(300).optional(),
  takenAt: z.coerce.date().optional(),
  withThumbnail: z.boolean().default(true),
  /** Tamanho exato da miniatura (o PUT assinado confere o content-length). Sem ele, não há miniatura. */
  thumbByteSize: z.number().int().min(1).max(500_000).optional(),
});

export const usernameSchema = z.object({ username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_.]+$/) });

// ───────────── Administração do sistema ─────────────
const usernameField = z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_.]+$/);
const optionalEmail = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.email().max(200).optional());
export const adminCreateUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  /** Opcional: contas sem e-mail entram com usuário e senha. */
  email: optionalEmail,
  username: usernameField,
  /** Opcional: senha definida pelo admin; sem ela o sistema gera uma temporária. */
  password: z.string().min(PASSWORD_MIN).max(PASSWORD_MAX).optional(),
  /** Exigir troca de senha no primeiro acesso (padrão: sim). */
  mustChangePassword: z.boolean().default(true),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
});
export const adminUpdateUserSchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    /** null ou "" remove o e-mail cadastrado. */
    email: z.union([z.literal(""), z.null(), z.email().max(200)]).optional(),
    username: usernameField.optional(),
  })
  .refine((v) => v.name || v.email !== undefined || v.username, "Nada para alterar");
export const adminBanSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const adminRoleSchema = z.object({ role: z.enum(["ADMIN", "USER"]) });
