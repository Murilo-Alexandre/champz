import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

/** Sobe um Postgres em memória (PGlite) numa porta própria e aplica as migrações versionadas. */
export async function startTestDatabase(port: number) {
  const db = await PGlite.create();
  const dir = path.resolve("prisma/migrations");
  for (const m of readdirSync(dir).filter((d) => !d.endsWith(".toml")).sort()) {
    await db.exec(readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;
  process.env.DATABASE_URL = url;
  process.env.BETTER_AUTH_SECRET = "test-secret-0123456789abcdef0123456789";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  return {
    url,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}

/** Extrai o cookie de sessão de uma resposta do Better Auth. */
export function cookieFrom(headers: Headers): string {
  return headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

export function jsonRequest(url: string, method: string, cookie: string | null, payload?: unknown) {
  return new Request(`http://localhost:3000${url}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

export const params = <P>(p: P) => ({ params: Promise.resolve(p) });
