import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "@/generated/prisma/client";
import { env } from "@/lib/env";

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;
export type DbOrTx = Db | Tx;

export function createPrisma(connectionString = env("DATABASE_URL")): Db {
  // Sem DATABASE_URL o erro aparece na primeira consulta, não no import (permite build sem segredos).
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: connectionString ?? "" }) });
}

const globalForPrisma = globalThis as unknown as { champzPrisma?: Db };

/** Cliente único por processo (evita múltiplos pools no hot reload do Next). Conexão pooled do Neon no runtime. */
export function getPrisma(): Db {
  globalForPrisma.champzPrisma ??= createPrisma();
  return globalForPrisma.champzPrisma;
}
