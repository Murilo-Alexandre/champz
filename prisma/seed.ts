/**
 * Seed: catálogo inicial de clubes. Com SEED_DEMO_PASSWORD definido, cria também o usuário `demo`
 * e o campeonato "[TESTE] FIFA 2026 — homologação" com os grupos de docs/TESTES.md (rotulado como teste).
 * Uso: npm run db:seed
 */
import { existsSync, readFileSync } from "node:fs";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

type CatalogClub = { name: string; slug: string; category: "NATIONAL" | "INTERNATIONAL" | "NATIONAL_TEAM"; shortName: string; country: string };
const CLUBS: CatalogClub[] = JSON.parse(readFileSync("prisma/club-catalog.json", "utf8"));

async function main() {
  const { getPrisma } = await import("../src/lib/db/prisma");
  const db = getPrisma();
  let created = 0;
  // Idempotente: casa pelo nome (IDs de clubes já usados em campeonatos são preservados) e só completa metadados.
  for (const c of CLUBS) {
    const crestPath = existsSync(`public/crests/${c.slug}.webp`) ? `/crests/${c.slug}.webp` : null;
    const data = { slug: c.slug, category: c.category, shortName: c.shortName, country: c.country, crestPath };
    const r = await db.club.upsert({ where: { name: c.name }, create: { name: c.name, ...data }, update: data });
    if (r.createdAt.getTime() > Date.now() - 10_000) created++;
  }
  console.log(`Clubes: ${CLUBS.length} no catálogo (${created} novos)`);

  const password = process.env.SEED_DEMO_PASSWORD;
  if (!password) {
    console.log("SEED_DEMO_PASSWORD não definido: campeonato de teste não criado.");
    return;
  }
  const { provisionUserWithPassword } = await import("../src/server/services/admin");
  const t = await import("../src/server/services/tournaments");
  const s = await import("../src/server/services/stages");

  let demo = await db.user.findUnique({ where: { username: "demo" } });
  if (!demo) {
    // Cadastro público está desativado: conta local de teste criada diretamente (nunca usar em produção).
    const created = await provisionUserWithPassword(db, { email: "demo@champz.local", password, name: "Demo", username: "demo" });
    demo = await db.user.findUniqueOrThrow({ where: { id: created.id } });
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
