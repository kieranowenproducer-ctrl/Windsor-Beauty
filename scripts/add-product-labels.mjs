import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_DIR = path.join(__dirname, "..", "public", "products-original");
const OUT_DIR = path.join(__dirname, "..", "public", "products");

const FONT_STACK = "Garamond, Georgia, 'Times New Roman', serif";

// Soft, blurred rect used as a grounding shadow under the label, offset toward
// the lower-right to match the upper-left light source in the product shots.
async function shadowPng(w, h, radius) {
  const pad = 10;
  const svg = Buffer.from(`<svg width="${w + pad * 2}" height="${h + pad * 2}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${pad}" y="${pad}" width="${w}" height="${h}" rx="${radius}" fill="#1A1410" fill-opacity="0.32"/>
  </svg>`);
  return { buffer: await sharp(svg).blur(4).png().toBuffer(), pad };
}

// A near-white label with a gentle top-left to bottom-right gradient (so it
// reads as catching the same light as the bottle) and slight transparency so
// a hint of the glass/highlight beneath shows through.
function labelSvg({ w, h, contentH = h, type = "full" }) {
  const radius = 2;
  const gradient = `<linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFEFC" stop-opacity="0.99"/>
      <stop offset="100%" stop-color="#ECE2CE" stop-opacity="0.97"/>
    </linearGradient>
    <linearGradient id="v" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.16"/>
      <stop offset="14%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="86%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.16"/>
    </linearGradient>`;

  if (type === "compact") {
    return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <defs>${gradient}</defs>
      <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" fill="url(#g)"/>
      <text x="${w / 2}" y="${h * 0.67}" font-family="${FONT_STACK}" font-size="${Math.round(h * 0.48)}" font-weight="600" letter-spacing="1.5" fill="#2B2723" text-anchor="middle">WB</text>
      <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" fill="url(#v)"/>
    </svg>`);
  }

  const titleSize = Math.round(contentH * 0.15);
  const titleSpacing = (contentH * 0.009).toFixed(1);
  const tagSize = Math.round(contentH * 0.09);
  const tagSpacing = (contentH * 0.04).toFixed(1);

  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <defs>${gradient}</defs>
    <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" fill="url(#g)"/>
    <text x="${w / 2}" y="${contentH * 0.45}" font-family="${FONT_STACK}" font-size="${titleSize}" font-weight="600" letter-spacing="${titleSpacing}" fill="#2B2723" text-anchor="middle">WINDSOR BEAUTY</text>
    <line x1="${w * 0.32}" y1="${contentH * 0.59}" x2="${w * 0.68}" y2="${contentH * 0.59}" stroke="#C7A769" stroke-width="1"/>
    <text x="${w / 2}" y="${contentH * 0.83}" font-family="Arial, Helvetica, sans-serif" font-size="${tagSize}" letter-spacing="${tagSpacing}" fill="#AD8E54" text-anchor="middle">SKINCARE &#183; LONDON</text>
    <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" fill="url(#v)"/>
  </svg>`);
}

// Top-left position + size of the label for each product, sized to sit within
// the visible front face of the bottle/jar rather than overlapping the background.
const CONFIG = {
  "hydra-veil-serum": { x: 446, y: 565, w: 128, h: 76 },
  "glow-drops-vitamin-c-serum": { x: 433, y: 525, w: 148, h: 82 },
  "pore-refine-niacinamide-serum": { x: 436, y: 565, w: 148, h: 82 },
  "renew-night-serum": { x: 441, y: 585, w: 148, h: 82 },
  "daily-veil-moisturiser": { x: 446, y: 565, w: 148, h: 82 },
  "pure-cream-cleanser": { x: 436, y: 585, w: 148, h: 82 },
  "bright-eye-cream": { x: 446, y: 478, w: 168, h: 92 },
  "daily-shield-spf30": { x: 438, y: 400, w: 148, h: 82 },
  "active-hydration-serum-men": { x: 438, y: 585, w: 148, h: 82 },
  "calm-repair-cream": { x: 428, y: 478, w: 168, h: 92 },
  "soothing-toning-mist": { x: 443, y: 605, w: 148, h: 82 },
  "velvet-lip-balm": { x: 492, y: 472, w: 56, h: 40, type: "compact" },
  "restore-hand-cream": { x: 446, y: 420, w: 148, h: 82 },
  "cooling-aftershave-balm": { x: 418, y: 585, w: 168, h: 128, contentH: 92 },
};

async function run() {
  const only = process.argv[2];
  const entries = only ? Object.entries(CONFIG).filter(([slug]) => slug === only) : Object.entries(CONFIG);

  for (const [slug, cfg] of entries) {
    const srcFile = path.join(SOURCE_DIR, `${slug}.jpg`);
    const outFile = path.join(OUT_DIR, `${slug}.jpg`);
    const type = cfg.type ?? "full";

    const label = await sharp(labelSvg({ ...cfg, type })).png().toBuffer();
    const { buffer: shadow, pad } = await shadowPng(cfg.w, cfg.h, type === "compact" ? 2 : 2);

    await sharp(srcFile)
      .modulate({ saturation: 1.05, brightness: 1.01 })
      .composite([
        { input: shadow, left: cfg.x - pad + 3, top: cfg.y - pad + 5 },
        { input: label, left: cfg.x, top: cfg.y },
      ])
      .jpeg({ quality: 92 })
      .toFile(outFile);

    console.log(`Labeled ${slug}`);
  }
}

run();
