/**
 * Verifica e prepara o Neon Object Storage com as variáveis S3_* do ambiente (nunca imprime segredos):
 * credencial, bucket privado, CORS para o app e ciclo real upload → leitura assinada → acesso anônimo negado → remoção.
 * Uso: node --env-file=.env.neon.local --import tsx scripts/storage-check.mts   (ou carregue as variáveis antes)
 */
import {
  S3Client, ListBucketsCommand, HeadBucketCommand, CreateBucketCommand, PutBucketCorsCommand, DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { S3Storage } from "../src/lib/storage";
import { env } from "../src/lib/env";

const bucket = env("S3_BUCKET") ?? "champz-media";
const origins = ["https://champz-six.vercel.app", "http://localhost:3000"];
const client = new S3Client({
  endpoint: env("S3_ENDPOINT"), region: env("S3_REGION") || "us-east-1", forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
  credentials: { accessKeyId: env("S3_ACCESS_KEY_ID")!, secretAccessKey: env("S3_SECRET_ACCESS_KEY")! },
});
const err = (e: unknown) => `${(e as { name?: string }).name ?? "Erro"} (HTTP ${(e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode ?? "?"})`;

async function step<T>(label: string, fn: () => Promise<T>) {
  try { const r = await fn(); console.log(`OK    ${label}`); return r; } catch (e) { console.log(`FALHA ${label}: ${err(e)}`); throw e; }
}

const host = new URL(env("S3_ENDPOINT")!).hostname;
console.log(`Endpoint ${host} · região ${env("S3_REGION")} · bucket ${bucket} · chave ${env("S3_ACCESS_KEY_ID")?.slice(0, 9)}…`);
try {
  const buckets = await step("credencial (ListBuckets)", () => client.send(new ListBucketsCommand({})));
  if (!buckets.Buckets?.some((b) => b.Name === bucket)) {
    await step(`criar bucket privado ${bucket}`, () => client.send(new CreateBucketCommand({ Bucket: bucket })));
  } else await step(`bucket ${bucket} existe`, () => client.send(new HeadBucketCommand({ Bucket: bucket })));
  await step("CORS (PUT/GET/HEAD para o app)", () => client.send(new PutBucketCorsCommand({
    Bucket: bucket,
    CORSConfiguration: { CORSRules: [{ AllowedOrigins: origins, AllowedMethods: ["PUT", "GET", "HEAD"], AllowedHeaders: ["*"], ExposeHeaders: ["ETag"], MaxAgeSeconds: 3600 }] },
  })));

  const storage = new S3Storage(bucket);
  const key = `_healthcheck/${Date.now()}.webp`;
  const body = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
  const put = await storage.presignPut(key, "image/webp", body.length);
  await step("upload via URL assinada (como o navegador)", async () => {
    const r = await fetch(put, { method: "PUT", body, headers: { "Content-Type": "image/webp", Origin: origins[0] } });
    if (!r.ok) throw Object.assign(new Error(await r.text()), { name: `PUT ${r.status}`, $metadata: { httpStatusCode: r.status } });
  });
  await step("HEAD confere tamanho e tipo", async () => {
    const h = await storage.head(key);
    if (!h || h.byteSize !== body.length || h.mimeType !== "image/webp") throw new Error(`head=${JSON.stringify(h)}`);
  });
  await step("leitura via URL assinada", async () => {
    const r = await fetch(await storage.presignGet(key, 60, "teste.webp"));
    if (!r.ok || (await r.arrayBuffer()).byteLength !== body.length) throw Object.assign(new Error("GET"), { name: `GET ${r.status}` });
  });
  await step("acesso anônimo negado (bucket privado)", async () => {
    const r = await fetch(`${env("S3_ENDPOINT")}/${bucket}/${key}`);
    if (r.ok) throw new Error("Objeto acessível sem assinatura!");
  });
  await step("remover arquivo de teste", () => client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })));
  console.log("\nObject Storage pronto.");
} catch {
  process.exitCode = 1;
}
