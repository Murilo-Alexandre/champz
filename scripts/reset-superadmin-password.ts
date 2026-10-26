/**
 * Redefine a senha do Superadmin existente (mesmo ID/papel), revoga todas as sessões e audita.
 * Lê SUPERADMIN_PASSWORD (mín. 12) do ambiente da sessão; nunca imprime a senha.
 * Uso: npm run superadmin:reset-password
 */
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const direct = process.env.DIRECT_URL || process.env.DATABASE_URL_UNPOOLED;
  if (direct) process.env.DATABASE_URL = direct;
  const password = process.env.SUPERADMIN_PASSWORD ?? "";
  delete process.env.SUPERADMIN_PASSWORD;
  if (password.length < 12) throw new Error("A senha do Superadmin precisa de ao menos 12 caracteres");

  const { getPrisma } = await import("../src/lib/db/prisma");
  const { auth } = await import("../src/server/auth/auth");
  const { audit } = await import("../src/server/services/audit");
  const db = getPrisma();
  try {
    const setting = await db.systemSetting.findUnique({ where: { key: "superadminUserId" } });
    if (!setting) throw new Error("Superadmin não existe; rode superadmin:bootstrap");
    const userId = setting.value;
    const passwordHash = await (await auth.$context).password.hash(password);
    await db.$transaction(async (tx) => {
      const credential = await tx.account.findFirst({ where: { userId, providerId: "credential" } });
      if (credential) await tx.account.update({ where: { id: credential.id }, data: { password: passwordHash } });
      else await tx.account.create({ data: { id: randomUUID(), accountId: userId, providerId: "credential", userId, password: passwordHash } });
      await tx.user.update({ where: { id: userId }, data: { mustChangePassword: false } });
      const { count } = await tx.session.deleteMany({ where: { userId } });
      await audit(tx, { tournamentId: null, actorUserId: userId, targetType: "USER", targetId: userId, action: "SUPERADMIN_PASSWORD_RESET", after: { sessionsRevoked: count, via: "cli" } });
    });
    console.log(`Senha do Superadmin redefinida (id ${userId}). Sessões revogadas.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error("Falha:", err instanceof Error ? err.message : "erro desconhecido");
  process.exit(1);
});
