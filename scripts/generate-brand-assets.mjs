/**
 * Gera favicons, ícones PWA, apple-touch-icon, imagem Open Graph e versões web da logo oficial
 * a partir de branding/champz-logo-original.png (1254×1254, fundo transparente).
 * Uso: node scripts/generate-brand-assets.mjs
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const SRC = "branding/champz-logo-original.png";
// Recorte do símbolo (taça + mãos + coroa, sem a base com o nome), para tamanhos pequenos.
const SYMBOL = { left: 103, top: 24, width: 1048, height: 752 };
// Logo completa sem as margens transparentes.
const FULL = { left: 103, top: 24, width: 1048, height: 1198 };

await mkdir("public/brand", { recursive: true });
await mkdir("public/icons", { recursive: true });

const full = () => sharp(SRC).extract(FULL);
const symbol = () => sharp(SRC).extract(SYMBOL);

/** Fundo escuro com brilho dourado sutil, para ícones instaláveis. */
function darkBackground(size, rounded) {
  const r = rounded ? Math.round(size * 0.22) : 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <defs>
      <radialGradient id="g" cx="50%" cy="42%" r="62%">
        <stop offset="0%" stop-color="#2a1f05"/><stop offset="55%" stop-color="#0d1018"/><stop offset="100%" stop-color="#07090f"/>
      </radialGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${r}" fill="url(#g)"/>
  </svg>`;
  return Buffer.from(svg);
}

async function onDark(size, artFactory, scale, { rounded = false, offsetY = 0 } = {}) {
  const box = Math.round(size * scale);
  const art = await artFactory().resize(box, box, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const top = Math.round((size - box) / 2 + size * offsetY);
  return sharp(darkBackground(size, rounded)).composite([{ input: art, left: Math.round((size - box) / 2), top }]).png({ compressionLevel: 9, palette: size >= 192, quality: 92, effort: 10 });
}

async function transparent(size, artFactory) {
  return artFactory().resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 });
}

// ── Ícones instaláveis (PWA / iOS) ──
await (await onDark(192, full, 0.86)).toFile("public/icons/icon-192.png");
await (await onDark(512, full, 0.86)).toFile("public/icons/icon-512.png");
// Maskable: conteúdo dentro do círculo seguro (≈80% central) — usamos 64%.
await (await onDark(512, full, 0.64)).toFile("public/icons/icon-maskable-512.png");
await (await onDark(192, full, 0.64)).toFile("public/icons/icon-maskable-192.png");
// Apple touch: iOS aplica o próprio arredondamento; fundo opaco obrigatório.
await (await onDark(180, symbol, 0.78, { offsetY: 0.01 })).toFile("public/icons/apple-touch-icon.png");
// Atalho do manifest.
await (await onDark(96, symbol, 0.8)).toFile("public/icons/shortcut-new-96.png");

// ── Favicons: símbolo (o nome fica ilegível abaixo de 64px) ──
const fav = {};
for (const s of [16, 32, 48]) fav[s] = await (await transparent(s, symbol)).toBuffer();
await writeFile("public/icons/favicon-32.png", fav[32]);
await writeFile("src/app/favicon.ico", buildIco([16, 32, 48].map((s) => ({ size: s, png: fav[s] }))));

// ── Logo para a interface (WebP leve) ──
await full().resize(480).webp({ quality: 86, alphaQuality: 90 }).toFile("public/brand/champz-logo-480.webp");
await full().resize(240).webp({ quality: 86, alphaQuality: 90 }).toFile("public/brand/champz-logo-240.webp");
await symbol().resize(160).webp({ quality: 88, alphaQuality: 90 }).toFile("public/brand/champz-symbol-160.webp");

// ── Open Graph 1200×630 ──
{
  const W = 1200, H = 630;
  const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="g" cx="30%" cy="45%" r="75%"><stop offset="0%" stop-color="#2a1f05"/><stop offset="50%" stop-color="#0d1018"/><stop offset="100%" stop-color="#07090f"/></radialGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <text x="640" y="270" font-family="Arial Black, Arial, sans-serif" font-size="92" font-weight="900" fill="#ffc94a" letter-spacing="2">CHAMPZ</text>
    <text x="644" y="340" font-family="Arial, sans-serif" font-size="34" fill="#eef2fb">Campeonatos de FIFA entre amigos</text>
    <text x="644" y="392" font-family="Arial, sans-serif" font-size="26" fill="#8d98b3">Grupos · mata-mata · placares · retrospectiva</text>
  </svg>`);
  const logo = await full().resize({ height: 540 }).png().toBuffer();
  const meta = await sharp(logo).metadata();
  await sharp(bg).composite([{ input: logo, left: Math.round(330 - meta.width / 2), top: 45 }]).jpeg({ quality: 84, mozjpeg: true }).toFile("src/app/opengraph-image.jpg");
}

console.log("Assets da marca gerados.");

/** ICO com entradas PNG (suportado por todos os navegadores atuais). */
function buildIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const o = 6 + i * 16;
    header.writeUInt8(img.size >= 256 ? 0 : img.size, o); header.writeUInt8(img.size >= 256 ? 0 : img.size, o + 1);
    header.writeUInt16LE(1, o + 4); header.writeUInt16LE(32, o + 6);
    header.writeUInt32LE(img.png.length, o + 8); header.writeUInt32LE(offset, o + 12);
    offset += img.png.length;
  });
  return Buffer.concat([header, ...images.map((i) => i.png)]);
}
