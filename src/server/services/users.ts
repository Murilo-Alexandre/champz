import type { DbOrTx } from "@/lib/db/prisma";
import { normalizeName } from "@/lib/text";
import { isInternalEmail } from "@/lib/user-email";

export type UserHit = { id: string; name: string; username: string | null; image: string | null; avatarMediaId: string | null };

/**
 * Busca de contas para inscrição: nome, usuário ou e-mail, parcial, sem diferenciar maiúsculas nem acentos.
 * O app é interno (dezenas/centenas de contas): filtra em memória para ignorar acentos sem extensão no banco.
 * Nunca devolve e-mail; contas bloqueadas ficam de fora.
 */
export async function searchUsers(db: DbOrTx, q: string, limit = 12): Promise<UserHit[]> {
  const term = normalizeName(q);
  if (term.length < 2) return [];
  const users = await db.user.findMany({
    where: { banned: false },
    select: { id: true, name: true, username: true, email: true, image: true, avatarMediaId: true },
    orderBy: { name: "asc" },
    take: 5000,
  });
  const scored: { u: UserHit; score: number }[] = [];
  for (const u of users) {
    const name = normalizeName(u.name);
    const username = normalizeName(u.username ?? "");
    const email = u.email && !isInternalEmail(u.email) ? u.email.toLowerCase() : "";
    let score = -1;
    if (username === term || name === term) score = 0;
    else if (username.startsWith(term) || name.startsWith(term)) score = 1;
    else if (name.split(" ").some((w) => w.startsWith(term))) score = 2;
    else if (username.includes(term) || name.includes(term)) score = 3;
    else if (email && email.includes(term)) score = 4;
    if (score >= 0) scored.push({ u: { id: u.id, name: u.name, username: u.username, image: u.image, avatarMediaId: u.avatarMediaId }, score });
  }
  return scored.sort((a, b) => a.score - b.score || a.u.name.localeCompare(b.u.name, "pt-BR")).slice(0, limit).map((s) => s.u);
}
