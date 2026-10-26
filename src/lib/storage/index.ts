import { randomBytes } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

export type ObjectHead = { byteSize: number; mimeType: string | null } | null;

/** Contrato trocável de armazenamento (Neon Object Storage hoje; R2/outro S3 se necessário). */
export interface StorageProvider {
  presignPut(key: string, mimeType: string, byteSize: number, expiresSec?: number): Promise<string>;
  presignGet(key: string, expiresSec?: number, downloadName?: string): Promise<string>;
  head(key: string): Promise<ObjectHead>;
}

export function isStorageConfigured() {
  return !!(env("S3_ENDPOINT") && env("S3_BUCKET") && env("S3_ACCESS_KEY_ID") && env("S3_SECRET_ACCESS_KEY"));
}

export class S3Storage implements StorageProvider {
  private client: S3Client;
  constructor(private bucket = env("S3_BUCKET")!) {
    this.client = new S3Client({
      endpoint: env("S3_ENDPOINT"),
      region: env("S3_REGION") || "auto",
      forcePathStyle: true,
      credentials: { accessKeyId: env("S3_ACCESS_KEY_ID")!, secretAccessKey: env("S3_SECRET_ACCESS_KEY")! },
    });
  }
  presignPut(key: string, mimeType: string, byteSize: number, expiresSec = 300) {
    return getSignedUrl(this.client, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: mimeType, ContentLength: byteSize }), { expiresIn: expiresSec });
  }
  presignGet(key: string, expiresSec = 300, downloadName?: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket, Key: key,
        ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName.replace(/"/g, "")}"` : undefined,
      }),
      { expiresIn: expiresSec },
    );
  }
  async head(key: string): Promise<ObjectHead> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { byteSize: r.ContentLength ?? 0, mimeType: r.ContentType ?? null };
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404 || status === 403) return null;
      throw e;
    }
  }
}

/** Implementação em memória para testes (simula o upload direto via URL assinada). */
export class MemoryStorage implements StorageProvider {
  objects = new Map<string, { byteSize: number; mimeType: string }>();
  async presignPut(key: string) {
    return `memory://put/${key}`;
  }
  async presignGet(key: string, expiresSec = 300) {
    return `memory://get/${key}?exp=${expiresSec}`;
  }
  async head(key: string) {
    return this.objects.get(key) ?? null;
  }
}

let current: StorageProvider | null = null;
export function getStorage(): StorageProvider | null {
  if (current) return current;
  if (!isStorageConfigured()) return null;
  current = new S3Storage();
  return current;
}
export function setStorageForTests(s: StorageProvider | null) {
  current = s;
}

export function randomObjectKey(prefix: string, mimeType: string) {
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" }[mimeType] ?? "bin";
  return `${prefix}/${new Date().toISOString().slice(0, 7)}/${randomBytes(16).toString("hex")}.${ext}`;
}
