import sharp from "sharp";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS_DIR = path.join(__dirname, "..", "public", "products");

const FONT_STACK = "Garamond, Georgia, 'Times New Roman', serif";

function fullLabel(w, h, contentH = h) {
  const titleSize = Math.round(contentH * 0.165);
  const titleSpacing = (contentH * 0.022).toFixed(1);
  const tagSize = Math.round(contentH * 0.095);
  const tagSpacing = (contentH * 0.045).toFixed(1);
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="3" fill="#FBF7F1" stroke="#E2D6C3" stroke-width="1.5"/>
    <text x="${w / 2}" y="${contentH * 0.44}" font-family="${FONT_STACK}" font-size="${titleSize}" font-weight="600" letter-spacing="${titleSpacing}" fill="#2B2723" text-anchor="middle">WINDSOR BEAUTY</text>
    <line x1="${w * 0.3}" y1="${contentH * 0.58}" x2="${w * 0.7}" y2="${contentH * 0.58}" stroke="#C7A769" stroke-width="1"/>
    <text x="${w / 2}" y="${contentH * 0.82}" font-family="Arial, Helvetica, sans-serif" font-size="${tagSize}" letter-spacing="${tagSpacing}" fill="#AD8E54" text-anchor="middle">SKINCARE &#183; LONDON</text>
  </svg>`);
}

function monogramLabel(w, h) {
  return Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="3" fill="#FBF7F1" stroke="#E2D6C3" stroke-width="1.5"/>
    <text x="${w / 2}" y="${h * 0.65}" font-family="${FONT_STACK}" font-size="${Math.round(h * 0.5)}" font-weight="600" letter-spacing="2" fill="#2B2723" text-anchor="middle">WB</text>
  </svg>`);
}

// Top-left position + size of the label for each product, hand-placed against
// the bottle/jar body in each generated photo.
const CONFIG = {
  "hydra-veil-serum": { x: 435, y: 560, w: 150, h: 82, type: "full" },
  "glow-drops-vitamin-c-serum": { x: 432, y: 520, w: 150, h: 82, type: "full" },
  "pore-refine-niacinamide-serum": { x: 435, y: 560, w: 150, h: 82, type: "full" },
  "renew-night-serum": { x: 440, y: 580, w: 150, h: 82, type: "full" },
  "daily-veil-moisturiser": { x: 445, y: 560, w: 150, h: 82, type: "full" },
  "pure-cream-cleanser": { x: 435, y: 580, w: 150, h: 82, type: "full" },
  "bright-eye-cream": { x: 443, y: 480, w: 175, h: 92, type: "full" },
  "daily-shield-spf30": { x: 437, y: 400, w: 150, h: 82, type: "full" },
  "active-hydration-serum-men": { x: 437, y: 580, w: 150, h: 82, type: "full" },
  "calm-repair-cream": { x: 425, y: 480, w: 175, h: 92, type: "full" },
  "soothing-toning-mist": { x: 442, y: 600, w: 150, h: 82, type: "full" },
  "velvet-lip-balm": { x: 490, y: 470, w: 60, h: 42, type: "compact" },
  "restore-hand-cream": { x: 445, y: 420, w: 150, h: 82, type: "full" },
  "cooling-aftershave-balm": { x: 415, y: 580, w: 175, h: 128, contentH: 92, type: "full" },
};

async function run() {
  const only = process.argv[2];
  const entries = only ? Object.entries(CONFIG).filter(([slug]) => slug === only) : Object.entries(CONFIG);
  for (const [slug, cfg] of entries) {
    const file = path.join(PRODUCTS_DIR, `${slug}.jpg`);
    const tmpFile = `${file}.tmp`;
    const labelSvg = cfg.type === "compact" ? monogramLabel(cfg.w, cfg.h) : fullLabel(cfg.w, cfg.h, cfg.contentH);
    const labelPng = await sharp(labelSvg).png().toBuffer();

    await sharp(file)
      .modulate({ saturation: 1.06, brightness: 1.02 })
      .composite([{ input: labelPng, left: cfg.x, top: cfg.y }])
      .jpeg({ quality: 92 })
      .toFile(tmpFile);

    fs.renameSync(tmpFile, file);
    console.log(`Labeled ${slug}`);
  }
}

run();
