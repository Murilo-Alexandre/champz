"use client";
import { api } from "./api";

type UploadTarget = { tournamentId?: string; kind: "PHOTO" | "PROOF" | "AVATAR" | "CREST"; matchId?: string; stageId?: string; caption?: string };
type UploadReq = { media: { id: string }; uploadUrl: string; thumbUploadUrl: string | null; headers: Record<string, string> };

async function encode(file: File, maxSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Falha ao processar a foto"))), "image/webp", quality));
  return { blob, width, height };
}

/** Envio direto ao bucket privado com URL assinada: comprime no aparelho, sobe foto + miniatura, confirma no servidor. */
export async function uploadPhoto(file: File, target: UploadTarget, onProgress?: (p: number) => void) {
  if (!file.type.startsWith("image/")) throw new Error("Escolha uma imagem");
  onProgress?.(0.05);
  const main = await encode(file, target.kind === "AVATAR" ? 768 : 2048, 0.85);
  const thumb = await encode(file, 480, 0.75);
  onProgress?.(0.2);
  const path = target.tournamentId ? `/api/tournaments/${target.tournamentId}/media` : "/api/media";
  const req = await api<UploadReq>(path, {
    body: {
      kind: target.kind, mimeType: "image/webp", byteSize: main.blob.size, width: main.width, height: main.height,
      matchId: target.matchId, stageId: target.stageId, caption: target.caption,
      takenAt: file.lastModified ? new Date(file.lastModified).toISOString() : undefined, withThumbnail: true,
    },
  });
  const put = async (url: string, blob: Blob) => {
    const r = await fetch(url, { method: "PUT", body: blob, headers: req.headers });
    if (!r.ok) throw new Error("Falha no envio da foto ao armazenamento");
  };
  await put(req.uploadUrl, main.blob);
  onProgress?.(0.75);
  if (req.thumbUploadUrl) await put(req.thumbUploadUrl, thumb.blob.size <= main.blob.size ? thumb.blob : main.blob);
  onProgress?.(0.9);
  const media = await api<{ id: string }>(`/api/media/${req.media.id}/confirm`, { body: {} });
  onProgress?.(1);
  return media;
}
