// Renders the REAL invoice email with a trial product on it, so there is a
// photograph of what the customer receives (task ae168547).
//
// Kieran asked for "photograph evidence that trial products will not be showed
// on the actual email that goes out". So this does not mock the email up: it
// compiles the real sendInvoiceEmail, stands in for the network, and writes out
// the exact HTML that would have gone to Resend.
//
// Run: node scripts/render-invoice-email.mjs <output-directory>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] || path.join(ROOT, 'invoice-email-preview');
fs.mkdirSync(OUT, { recursive: true });

const BUILD = fs.mkdtempSync(path.join(ROOT, '.invoice-render-'));
const cfg = path.join(BUILD, 'tsconfig.json');
// Extends the project's config so the "@/" alias resolves exactly as it does
// in the app; without it the email module cannot find anything it imports.
fs.writeFileSync(cfg, JSON.stringify({
  extends: path.relative(BUILD, path.join(ROOT, 'tsconfig.json')).replace(/\\/g, '/'),
  compilerOptions: {
    noEmit: false, outDir: '.', module: 'esnext', target: 'es2022',
    moduleResolution: 'bundler', skipLibCheck: true, jsx: 'preserve', allowJs: true,
  },
  include: [path.relative(BUILD, path.join(ROOT, 'src/lib/invoiceEmail.ts')).replace(/\\/g, '/')],
}, null, 2));

execFileSync(process.execPath,
  [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', cfg],
  { cwd: ROOT, stdio: 'pipe' });

// tsc keeps the src/lib tree under the out dir; find the compiled entry.
function find(dir, name) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const hit = find(p, name); if (hit) return hit; }
    else if (e.name === name) return p;
  }
  return null;
}
const entry = find(BUILD, 'invoiceEmail.js');
if (!entry) throw new Error('could not find the compiled invoice email');

// .js -> .mjs all the way down, so Node treats them as modules.
(function renameAll(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) renameAll(p);
    else if (e.name.endsWith('.js')) {
      const to = p.replace(/\.js$/, '.mjs');
      // tsc leaves the project's "@/" alias in the emitted JS, and Node cannot
      // resolve it. The build tree mirrors src/, so it becomes a relative path.
      const toRoot = path.relative(path.dirname(p), BUILD).split(path.sep).join('/') || '.';
      let src = fs.readFileSync(p, 'utf8')
        .replace(/from ['"]@\/([^'"]+)['"]/g, (_m, rest) => `from '${toRoot}/${rest}.mjs'`)
        .replace(/from ['"](\.[^'"]+)['"]/g, (m, rel) =>
          m.replace(rel, rel.endsWith('.mjs') ? rel : `${rel}.mjs`));
      fs.writeFileSync(to, src);
      fs.unlinkSync(p);
    }
  }
})(BUILD);

const { sendInvoiceEmail } = await import(pathToFileURL(entry.replace(/\.js$/, '.mjs')).href);

// Stand in for Resend and keep whatever would have been sent.
const realFetch = globalThis.fetch;
let captured = null;
globalThis.fetch = async (url, init) => {
  captured = JSON.parse(init?.body ?? '{}');
  return new Response(JSON.stringify({ id: 'render-only' }), { status: 200, headers: { 'content-type': 'application/json' } });
};
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || 're_render_only_not_a_real_key';

await sendInvoiceEmail({
  to: 'customer@example.com',
  customerName: 'Test Customer',
  invoiceNumber: 'INV-TRIAL1',
  orderNumber: 'WB-TRIAL1',
  // Kieran's own example, plus a normal catalogue line to show the difference.
  lineItems: [
    { type: 'trial', slug: 'trial:8', name: '501', description: '501ml', quantity: 1, unitPrice: 45, discount: 3, lineTotal: 42 },
    { type: 'trial', slug: 'trial:13', name: 'ANADR 50ML 60S', description: '50ML', quantity: 1, unitPrice: 35, discount: 0, lineTotal: 35 },
    { type: 'product', slug: 'hydra-veil-serum', name: 'Hydra Veil Serum', description: '30ml', quantity: 1, unitPrice: 100, discount: 0, lineTotal: 100 },
  ],
  shippingLabel: 'UK Delivery',
  shippingAmount: 5,
  discountAmount: 3,
  subtotal: 177,
  total: 182,
  fenaPaymentUrl: 'https://payment.fena.co/pay/?p=example',
  payUrl: 'https://www.windsorbeauty.co.uk/pay/example',
}, {}).catch(e => { console.error('send threw:', e.message); });

globalThis.fetch = realFetch;

if (!captured) throw new Error('nothing was captured');
const html = captured.html ?? '';
const text = captured.text ?? '';
fs.writeFileSync(path.join(OUT, 'invoice-email.html'), html);
fs.writeFileSync(path.join(OUT, 'invoice-email.txt'), text);

const leaks = ['501', 'ANADR', '50ML', '501ml', 'trial:'].filter(w => html.includes(w) || text.includes(w));
console.log(`HTML: ${html.length} bytes`);
console.log(`Shows "Product 1":        ${html.includes('Product 1') ? 'YES' : 'NO'}`);
console.log(`Shows "Product 2":        ${html.includes('Product 2') ? 'YES' : 'NO'}`);
console.log(`Keeps the real product:   ${html.includes('Hydra Veil Serum') ? 'YES' : 'NO'}`);
console.log(`Trial names that leaked:  ${leaks.length ? leaks.join(', ') : 'none'}`);
console.log(`Totals present (£182):    ${html.includes('182') ? 'YES' : 'NO'}`);

fs.rmSync(BUILD, { recursive: true, force: true });
if (leaks.length) process.exit(1);
