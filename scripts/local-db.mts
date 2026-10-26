/**
 * Postgres local para desenvolvimento/testes sem Docker nem Neon, via PGlite.
 * Uso: npm run db:local  (porta 5433, dados em .pglite/). Não usar em produção.
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const port = Number(process.env.LOCAL_DB_PORT ?? 5433);
const dataDir = process.env.LOCAL_DB_DIR ?? ".pglite";

const db = await PGlite.create(dataDir === "memory" ? undefined : dataDir);
const server = new PGLiteSocketServer({ db, port, host: "127.0.0.1", maxConnections: 20 });
await server.start();
console.log(`PGlite pronto em postgresql://postgres:postgres@127.0.0.1:${port}/postgres (${dataDir})`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
