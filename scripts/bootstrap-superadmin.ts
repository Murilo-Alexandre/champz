/**
 * Provisiona a conta Superadmin (idempotente). Lê tudo do ambiente da sessão do terminal:
 *   SUPERADMIN_EMAIL     (obrigatório)
 *   SUPERADMIN_PASSWORD  (obrigatório na 1ª execução; mín. 12 caracteres; nunca é exibida nem gravada)
 *   SUPERADMIN_NAME      (padrão: "Murilo Alexandre")
 *   SUPERADMIN_USERNAME  (padrão: "murilo")
 * Banco: DATABASE_URL (ou DIRECT_URL/DATABASE_URL_UNPOOLED, preferidas para operação administrativa).
 * Uso: npm run superadmin:bootstrap
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const direct = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED;
  if (direct) process.env.DATABASE_URL = direct;
  const email = process.env.SUPERADMIN_EMAIL?.trim() ?? "";
  const password = process.env.SUPERADMIN_PASSWORD ?? "";
  delete process.env.SUPERADMIN_PASSWORD;

  const { getPrisma } = await import("../src/lib/db/prisma");
  const { bootstrapSuperadmin } = await import("../src/server/services/admin");
  const db = getPrisma();
  try {
    const result = await bootstrapSuperadmin(db, {
      email,
      password,
      name: process.env.SUPERADMIN_NAME?.trim() || "Murilo Alexandre",
      username: process.env.SUPERADMIN_USERNAME?.trim() || "murilo",
    });
    console.log(
      result.status === "created"
        ? `Superadmin criado (id ${result.userId}). Remova SUPERADMIN_PASSWORD do terminal.`
        : `Superadmin já existe (id ${result.userId}). Nada foi alterado.`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  // Nunca imprime a senha; só a mensagem do erro.
  console.error("Falha no bootstrap:", err instanceof Error ? err.message : "erro desconhecido");
  process.exit(1);
});
