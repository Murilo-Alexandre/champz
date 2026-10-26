import { authed } from "@/server/http";

/** Participações e títulos do usuário (por entrada; em duplas o título é da dupla). */
export const GET = authed(async ({ db, userId }) => {
  const players = await db.entryPlayer.findMany({
    where: { userId },
    include: { entry: { include: { tournament: { select: { id: true, name: true, edition: true, status: true, championEntryId: true, format: true, finishedAt: true } } } } },
  });
  const items = players.map((p) => ({
    tournament: p.entry.tournament,
    entryId: p.entryId,
    entryName: p.entry.name,
    entryType: p.entry.type,
    champion: p.entry.tournament.championEntryId === p.entryId,
  }));
  return { items, titles: items.filter((i) => i.champion).length };
});
