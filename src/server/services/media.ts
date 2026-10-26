import type { z } from "zod";
import type { Db, DbOrTx } from "@/lib/db/prisma";
import { getStorage, randomObjectKey, type StorageProvider } from "@/lib/storage";
import { hasPermission } from "@/lib/permissions";
import { audit } from "./audit";
import { requirePermission, requireRead } from "./access";
import { settingsOf } from "./tournaments";
import { AppError, badRequest, conflict, forbidden, notFound } from "../errors";
import type { uploadRequestSchema } from "../validators";

const MAX_PENDING_PER_HOUR = 60;
const PROFILE_MAX_BYTES = 2_000_000;

function storageOrFail(): StorageProvider {
  const s = getStorage();
  if (!s) throw new AppError(503, "STORAGE_NOT_CONFIGURED", "Armazenamento de fotos ainda não configurado (S3_* no ambiente)");
  return s;
}

type UploadInput = z.infer<typeof uploadRequestSchema>;

/**
 * Passo 1: valida permissão/tipo/tamanho/cota e devolve URL assinada curta para upload direto ao bucket privado.
 * O registro nasce PENDING e só aparece na galeria após `confirmUpload`.
 */
export async function requestUpload(db: Db, userId: string, tournamentId: string | null, input: UploadInput) {
  const storage = storageOrFail();
  return db.$transaction(async (tx) => {
    let maxBytes = PROFILE_MAX_BYTES;
    if (tournamentId) {
      if (!["PHOTO", "PROOF"].includes(input.kind)) throw badRequest("INVALID_KIND", "Tipo inválido para campeonato");
      const { tournament } = await requirePermission(tx, tournamentId, userId, "MEDIA_UPLOAD");
      const media = settingsOf(tournament).media;
      maxBytes = media.maxUploadBytes;
      const used = await tx.media.aggregate({ where: { tournamentId, status: { not: "PENDING" } }, _sum: { byteSize: true } });
      if ((used._sum.byteSize ?? 0) + input.byteSize > media.quotaBytes) throw conflict("QUOTA_EXCEEDED", "Cota de fotos do campeonato atingida");
      if (input.matchId) {
        const m = await tx.match.findFirst({ where: { id: input.matchId, tournamentId } });
        if (!m) throw badRequest("INVALID_MATCH", "Partida não pertence ao campeonato");
        input.stageId = m.stageId;
        input.roundId = m.roundId;
      } else if (input.stageId && !(await tx.stage.findFirst({ where: { id: input.stageId, tournamentId } }))) {
        throw badRequest("INVALID_STAGE", "Fase não pertence ao campeonato");
      }
    } else if (!["AVATAR", "CREST"].includes(input.kind)) {
      throw badRequest("INVALID_KIND", "Foto avulsa só pode ser avatar ou escudo");
    }
    if (input.byteSize > maxBytes) throw badRequest("FILE_TOO_LARGE", `Arquivo acima do limite de ${Math.round(maxBytes / 1_000_000)}MB. Comprima antes de enviar.`);
    const recent = await tx.media.count({ where: { ownerUserId: userId, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
    if (recent >= MAX_PENDING_PER_HOUR) throw new AppError(429, "RATE_LIMITED", "Muitos envios na última hora. Tente mais tarde.");

    const prefix = tournamentId ? `t/${tournamentId}` : `u/${userId}`;
    const objectKey = randomObjectKey(prefix, input.mimeType);
    const thumbKey = input.withThumbnail ? objectKey.replace(/(\.\w+)$/, ".thumb$1") : null;
    const media = await tx.media.create({
      data: {
        ownerUserId: userId, tournamentId, stageId: input.stageId, roundId: input.roundId, matchId: input.matchId,
        kind: input.kind, objectKey, thumbKey, mimeType: input.mimeType, byteSize: input.byteSize,
        width: input.width, height: input.height, caption: input.caption, takenAt: input.takenAt,
      },
    });
    const uploadUrl = await storage.presignPut(objectKey, input.mimeType, input.byteSize);
    const thumbUploadUrl = thumbKey ? await storage.presignPut(thumbKey, input.mimeType, Math.min(input.byteSize, 500_000)) : null;
    return { media, uploadUrl, thumbUploadUrl, headers: { "Content-Type": input.mimeType } };
  });
}

/** Passo 2: confere o objeto no bucket (existe, tamanho e tipo batem) antes de aceitar. Upload parcial nunca vira válido. */
export async function confirmUpload(db: Db, userId: string, mediaId: string) {
  const storage = storageOrFail();
  const media = await db.media.findUnique({ where: { id: mediaId } });
  if (!media || media.ownerUserId !== userId) throw notFound("Foto");
  if (media.status !== "PENDING") return media;
  const head = await storage.head(media.objectKey);
  if (!head) throw conflict("UPLOAD_MISSING", "Arquivo não encontrado no armazenamento. Envie novamente.");
  if (head.byteSize !== media.byteSize || (head.mimeType && head.mimeType !== media.mimeType)) {
    throw conflict("UPLOAD_MISMATCH", "Arquivo enviado não confere com o declarado");
  }
  const thumbOk = media.thumbKey ? !!(await storage.head(media.thumbKey)) : false;
  return db.$transaction(async (tx) => {
    const ready = await tx.media.update({
      where: { id: mediaId },
      data: { status: "READY", confirmedAt: new Date(), thumbKey: thumbOk ? media.thumbKey : null },
    });
    if (media.kind === "AVATAR") await tx.user.update({ where: { id: userId }, data: { avatarMediaId: mediaId } });
    await audit(tx, { tournamentId: media.tournamentId, actorUserId: userId, targetType: "MEDIA", targetId: mediaId, action: "UPLOAD", after: { kind: media.kind, matchId: media.matchId, byteSize: media.byteSize } });
    return ready;
  });
}

export async function listMedia(
  db: DbOrTx,
  userId: string,
  tournamentId: string,
  filter: { stageId?: string; roundId?: string; matchId?: string; ownerUserId?: string; includeHidden?: boolean; cursor?: string; limit?: number },
) {
  const access = await requireRead(db, tournamentId, userId);
  if (!access.member) throw forbidden("Galeria disponível apenas para membros do campeonato");
  const canModerate = access.member.role === "OWNER" || access.member.role === "ADMIN";
  const limit = Math.min(filter.limit ?? 60, 200);
  const rows = await db.media.findMany({
    where: {
      tournamentId, stageId: filter.stageId, roundId: filter.roundId, matchId: filter.matchId, ownerUserId: filter.ownerUserId,
      status: filter.includeHidden && canModerate ? { in: ["READY", "HIDDEN"] } : "READY",
    },
    orderBy: [{ takenAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    include: { owner: { select: { id: true, name: true, username: true } } },
  });
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}

/** URL temporária somente após checar vínculo. Avatares/escudos: qualquer usuário autenticado. */
export async function getMediaUrl(db: DbOrTx, userId: string, mediaId: string, opts: { thumb?: boolean; download?: boolean } = {}) {
  const storage = storageOrFail();
  const media = await db.media.findUnique({ where: { id: mediaId } });
  if (!media || media.status === "PENDING") throw notFound("Foto");
  if (media.tournamentId) {
    const access = await requireRead(db, media.tournamentId, userId);
    if (!access.member) throw notFound("Foto");
    if (media.status === "HIDDEN" && !["OWNER", "ADMIN"].includes(access.member.role)) throw notFound("Foto");
  }
  const key = opts.thumb && media.thumbKey ? media.thumbKey : media.objectKey;
  const ext = media.objectKey.split(".").pop();
  const url = await storage.presignGet(key, 300, opts.download ? `champz-${media.id}.${ext}` : undefined);
  return { url, expiresInSec: 300 };
}

export async function setMediaHidden(db: Db, userId: string, mediaId: string, hidden: boolean, reason: string) {
  return db.$transaction(async (tx) => {
    const media = await tx.media.findUnique({ where: { id: mediaId } });
    if (!media || !media.tournamentId || media.status === "PENDING") throw notFound("Foto");
    const access = await requireRead(tx, media.tournamentId, userId);
    const isModerator = access.member && ["OWNER", "ADMIN"].includes(access.member.role);
    const isOwnPhoto = media.ownerUserId === userId && hasPermission(access.member, "MEDIA_UPLOAD");
    if (!isModerator && !(isOwnPhoto && hidden)) throw forbidden();
    const updated = await tx.media.update({ where: { id: mediaId }, data: { status: hidden ? "HIDDEN" : "READY", hiddenReason: hidden ? reason : null } });
    await audit(tx, { tournamentId: media.tournamentId, actorUserId: userId, targetType: "MEDIA", targetId: mediaId, action: hidden ? "HIDE" : "UNHIDE", reason });
    return updated;
  });
}
