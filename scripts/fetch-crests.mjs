/**
 * Baixa os escudos do catálogo (prisma/club-catalog.json) a partir da imagem principal do artigo na Wikipédia
 * em português (arquivos do Wikimedia Commons ou locais da pt.wikipedia), converte para WebP 128×128 com fundo
 * transparente em public/crests/<slug>.webp e registra a origem/licença em prisma/crest-sources.json.
 * Reexecutável; só baixa o que falta (use --force para refazer). Escudos são marcas de seus clubes/federações.
 * Uso: node scripts/fetch-crests.mjs [--force]
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import sharp from "sharp";

const catalog = JSON.parse(await readFile("prisma/club-catalog.json", "utf8"));
const out = "public/crests";
const force = process.argv.includes("--force");
await mkdir(out, { recursive: true });
const UA = { "User-Agent": "Champz/1.0 (app interno de campeonatos; contato pelo repositório Murilo-Alexandre/champz)" };
let sources = {};
try { sources = JSON.parse(await readFile("prisma/crest-sources.json", "utf8")); } catch {}

const exists = (p) => access(p).then(() => true, () => false);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageImages(titles, lang = "pt") {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&prop=pageimages&piprop=original&redirects=1&titles=${encodeURIComponent(titles.join("|"))}`;
  const r = await fetch(url, { headers: UA });
  const j = await r.json();
  const map = new Map();
  const back = new Map([...(j.query.normalized ?? []), ...(j.query.redirects ?? [])].map((n) => [n.to, n.from]));
  for (const p of Object.values(j.query.pages)) {
    let t = p.title;
    while (back.has(t)) t = back.get(t);
    if (p.original?.source) map.set(t, p.original.source.split("?")[0]);
  }
  return map;
}

const todo = [];
for (const c of catalog) if (force || !(await exists(`${out}/${c.slug}.webp`))) todo.push(c);
let ok = 0;
const failed = [];
for (let i = 0; i < todo.length; i += 20) {
  const chunk = todo.slice(i, i + 20);
  const imgs = await pageImages(chunk.map((c) => c.wiki));
  // Artigo em português sem imagem: tenta o artigo equivalente em inglês (campo "en" do catálogo).
  const en = chunk.filter((c) => !imgs.has(c.wiki) && c.en);
  const enImgs = en.length ? await pageImages(en.map((c) => c.en), "en") : new Map();
  for (const c of chunk) {
    const src = imgs.get(c.wiki) ?? enImgs.get(c.en);
    if (!src) { failed.push(`${c.name} (sem imagem no artigo)`); continue; }
    try {
      let r = await fetch(src, { headers: UA });
      for (let t = 1; r.status === 429 && t <= 4; t++) { await sleep(5000 * t); r = await fetch(src, { headers: UA }); }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      await sharp(buf, { density: 300, limitInputPixels: false })
        .resize(128, 128, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp({ quality: 88, alphaQuality: 100 })
        .toFile(`${out}/${c.slug}.webp`);
      sources[c.slug] = { name: c.name, source: src, origin: src.includes("/wikipedia/commons/") ? "Wikimedia Commons" : "Wikipédia (arquivo local, uso restrito)", article: `https://pt.wikipedia.org/wiki/${encodeURIComponent(c.wiki.replaceAll(" ", "_"))}` };
      ok++;
      await sleep(4000);
    } catch (e) {
      failed.push(`${c.name} (${e.message})`);
    }
  }
}
await writeFile("prisma/crest-sources.json", JSON.stringify(sources, null, 2) + "\n");
console.log(`Escudos novos: ${ok}/${todo.length}. Total no catálogo: ${catalog.length}.`);
if (failed.length) console.log(`Sem escudo (usarão o escudo com sigla):\n- ${failed.join("\n- ")}`);
