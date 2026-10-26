/**
 * Seed: catálogo inicial de clubes. Com SEED_DEMO_PASSWORD definido, cria também o usuário `demo`
 * e o campeonato "[TESTE] FIFA 2026 — homologação" com os grupos de docs/TESTES.md (rotulado como teste).
 * Uso: npm run db:seed
 */
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const CLUBS = [
  "Real Madrid", "Barcelona", "Atlético de Madrid", "Manchester City", "Manchester United", "Liverpool", "Arsenal", "Chelsea",
  "Tottenham", "Bayern de Munique", "Borussia Dortmund", "Bayer Leverkusen", "PSG", "Inter de Milão", "Milan", "Juventus",
  "Napoli", "Benfica", "Porto", "Ajax", "Flamengo", "Palmeiras", "Corinthians", "São Paulo",
];

async function main() {
  const { getPrisma } = await import("../src/lib/db/prisma");
  const db = getPrisma();
  let created = 0;
  for (const name of CLUBS) {
    const r = await db.club.upsert({ where: { name }, create: { name }, update: {} });
    if (r.createdAt.getTime() > Date.now() - 10_000) created++;
  }
  console.log(`Clubes: ${CLUBS.length} no catálogo (${created} novos)`);

  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) {
    console.log("SEED_DEMO_PASSWORD não definido: campeonato de teste não criado.");
    return;
  }
  const { auth } = await import("../src/server/auth/auth");
  const t = await import("../src/server/services/tournaments");
  const s = await import("../src/server/services/stages");

  let demo = await db.user.findUnique({ where: { username: "demo" } });
  if (!demo) {
    await auth.api.signUpEmail({ body: { email: "demo@champz.local", password, name: "Demo", username: "demo" } });
    demo = await db.user.findUniqueOrThrow({ where: { username: "demo" } });
  }
  const name = "[TESTE] FIFA 2026 — homologação";
  if (await db.tournament.findFirst({ where: { name, ownerId: demo.id } })) {
    console.log("Campeonato de teste já existe.");
    return;
  }
  const tournament = await t.createTournament(db, demo.id, {
    name, sportCode: "FIFA", edition: "2026", format: "GROUPS_KNOCKOUT", entryType: "SOLO", visibility: "PRIVATE",
    description: "Dados de teste (seed). Placar Felipe x Alan não confirmado.",
    settings: { groupStage: { groupCount: 3, legs: 1, qualifiersPerGroup: 2, bestOfRest: 2 } },
  });
  const groups = [
    ["Everson", "Murilo", "Bruno", "Jailton"],
    ["Gabriel", "Felipe", "Miguel", "Alan"],
    ["Danilo", "Guilherme", "Igor", "Pedro"],
  ];
  const ids: string[][] = [];
  for (const g of groups) {
    const row: string[] = [];
    for (const guestName of g) row.push((await t.addEntry(db, demo.id, tournament.id, { players: [{ guestName }] })).id);
    ids.push(row);
  }
  const res = await s.generateInitialStage(db, demo.id, tournament.id, { mode: "MANUAL", groups: ids });
  console.log(`Campeonato de teste criado: ${tournament.id} (${res.matchCount} jogos)`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
