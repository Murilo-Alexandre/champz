import { authed, body } from "@/server/http";
import { usernameSchema } from "@/server/validators";
import { conflict } from "@/server/errors";
import { isGoogleConfigured } from "@/server/auth/auth";

export const GET = authed(async ({ db, userId }) => {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { id: true, name: true, email: true, username: true, displayUsername: true, image: true, avatarMediaId: true, createdAt: true, accounts: { select: { providerId: true } } },
  });
  const { accounts, ...rest } = user;
  return { user: rest, providers: accounts.map((a) => a.providerId), needsUsername: !user.username, googleEnabled: isGoogleConfigured() };
});

/** Quem entrou pelo Google escolhe o nome de usuário aqui. */
export const PATCH = authed(async ({ req, db, userId }) => {
  const { username } = await body(req, usernameSchema);
  const normalized = username.toLowerCase();
  const taken = await db.user.findFirst({ where: { username: normalized, NOT: { id: userId } } });
  if (taken) throw conflict("USERNAME_TAKEN", "Nome de usuário em uso");
  return db.user.update({ where: { id: userId }, data: { username: normalized, displayUsername: username }, select: { id: true, username: true, displayUsername: true } });
});
