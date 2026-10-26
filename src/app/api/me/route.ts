import { authed, body } from "@/server/http";
import { usernameSchema } from "@/server/validators";
import { conflict } from "@/server/errors";
import { isGoogleConfigured } from "@/server/auth/auth";
import { getSuperadminId } from "@/server/services/admin";
import { publicEmail } from "@/lib/user-email";

/** Perfil próprio. Responde mesmo com troca de senha pendente, para o app conduzir a troca. */
export const GET = authed(
  async ({ db, userId }) => {
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true, name: true, email: true, username: true, displayUsername: true, image: true, avatarMediaId: true, role: true,
        mustChangePassword: true, createdAt: true, accounts: { select: { providerId: true } },
      },
    });
    const { accounts, ...rest } = user;
    return {
      user: { ...rest, email: publicEmail(rest.email) },
      isSuperadmin: (await getSuperadminId(db)) === userId,
      providers: accounts.map((a) => a.providerId),
      mustChangePassword: user.mustChangePassword,
      needsUsername: !user.username,
      googleEnabled: isGoogleConfigured(),
    };
  },
  200,
  { allowPendingPassword: true },
);

/** Escolha/troca do próprio nome de usuário. */
export const PATCH = authed(async ({ req, db, userId }) => {
  const { username } = await body(req, usernameSchema);
  const normalized = username.toLowerCase();
  const taken = await db.user.findFirst({ where: { username: normalized, NOT: { id: userId } } });
  if (taken) throw conflict("USERNAME_TAKEN", "Nome de usuário em uso");
  return db.user.update({ where: { id: userId }, data: { username: normalized, displayUsername: username }, select: { id: true, username: true, displayUsername: true } });
});
