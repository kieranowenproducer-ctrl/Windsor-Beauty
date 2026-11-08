// Compile the real shared CSS and measure representative existing controls in a
// local browser. No app server, customer data, network or provider is involved.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from 'playwright-core';
import ts from 'typescript';
import config from '../tailwind.config.js';

const baseline = process.argv.includes('--baseline');
const root = process.cwd();
const sidebarSource = readFileSync('src/components/admin/AdminSidebar.tsx', 'utf8');
const sidebarAst = ts.createSourceFile('AdminSidebar.tsx', sidebarSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let sidebarInputClass = null;
function visitSidebar(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(sidebarAst) === 'input') {
    const attributes = node.attributes.properties;
    const placeholder = attributes.find(a => ts.isJsxAttribute(a) && a.name.getText(sidebarAst) === 'placeholder');
    const className = attributes.find(a => ts.isJsxAttribute(a) && a.name.getText(sidebarAst) === 'className');
    if (placeholder?.initializer && ts.isStringLiteral(placeholder.initializer) && placeholder.initializer.text === 'Find an admin page'
      && className?.initializer && ts.isStringLiteral(className.initializer)) sidebarInputClass = className.initializer.text;
  }
  ts.forEachChild(node, visitSidebar);
}
visitSidebar(sidebarAst);
assert.ok(sidebarInputClass, 'Use the actual sidebar search classes, not a simplified fixture.');
const source = baseline
  ? execFileSync('git', ['show', 'HEAD:src/app/globals.css'], { encoding: 'utf8' })
  : readFileSync('src/app/globals.css', 'utf8');
const html = `<!doctype html><meta charset="utf-8"><body>
  <section class="beauty-admin p-6 space-y-3">
    <div id="admin-card" class="border border-stone-200 bg-white p-4">Admin panel</div>
    <input id="bare-field" class="border border-stone-200 text-sm outline-none" aria-label="Product name" placeholder="Product name">
    <input id="sidebar-search" class="${sidebarInputClass}" aria-label="Find an admin page" placeholder="Find an admin page">
    <textarea id="pale-textarea" class="bg-stone-100 border border-stone-200" aria-label="Pale notes"></textarea>
    <select id="pale-select" class="bg-gold-50 border border-gold-200" aria-label="Pale category"><option>Category</option></select>
    <input id="readonly-pale" readonly class="bg-stone-50 border border-stone-200" aria-label="Invitation address">
    <select id="disabled-pale" disabled class="bg-stone-50 border border-stone-200" aria-label="Final status"><option>Delivered</option></select>
    <input id="dark-field" class="bg-stone-900 text-white" aria-label="Intentional dark field">
    <textarea id="bare-textarea" class="border border-gold-200 text-sm" aria-label="Notes"></textarea>
    <select id="bare-select" class="border border-stone-300 text-sm" aria-label="Category"><option>Category</option></select>
    <input id="disabled-field" disabled class="border border-stone-200" aria-label="Unavailable field">
    <input id="valid-field" class="bg-white bg-green-50 border border-green-300" aria-label="Valid tracking number">
    <input id="invalid-field" aria-invalid="true" class="bg-rose-100 border border-red-400" aria-label="Invalid field">
    <input id="artwork-field" class="bg-transparent border-0" aria-label="Transparent artwork text">
    <input id="checkbox" type="checkbox" aria-label="Select order">
    <button id="admin-outline" class="border border-stone-200 px-4 py-2 hover:bg-gold-50">Cancel</button>
    <button id="admin-primary" class="bg-stone-800 text-white px-4 py-2 hover:bg-stone-900">Save</button>
  </section>
  <section class="beauty-storefront p-6 space-y-3">
    <div id="customer-card" class="border border-gold-100 bg-gold-50/30 p-4">Customer panel</div>
    <a id="customer-link" href="#details" class="inline-block border border-gold-300 text-gold-700 px-4 py-2 hover:bg-gold-50">See details</a>
    <button id="variant" class="border border-stone-200 text-stone-600 px-4 py-2 hover:border-gold-400 hover:bg-gold-50/50">Choose size</button>
    <div id="quantity" class="inline-flex border border-stone-200"><button aria-label="Less">-</button><span>1</span><button aria-label="More">+</button></div>
    <button id="selected" aria-pressed="true" class="border border-gold-200 bg-gold-700 text-white px-4 py-2">Selected</button>
    <button id="paypal" aria-pressed="true" class="beauty-choice beauty-paypal-choice"><span>PayPal</span></button>
    <button id="disabled-button" disabled class="bg-gold-700 text-white disabled:bg-stone-100 disabled:text-stone-300 px-4 py-2">Unavailable</button>
    <p id="payment-note" class="text-xs text-stone-500">Your order will not enter dispatch until payment is confirmed.</p>
    <div id="dark-panel" class="bg-stone-900 text-gold-300 p-3">Intentional light text on dark</div>
  </section>
</body>`;
const css = (await postcss([tailwind({ ...config, content: [{ raw: html, extension: 'html' }] })])
  .process(source.replace(/^@import[^\r\n]+/m, ''), { from: path.join(root, 'src/app/globals.css') })).css;
const cache = path.join(process.env.LOCALAPPDATA ?? '', 'ms-playwright');
const candidates = existsSync(cache) ? readdirSync(cache).filter(n => n.startsWith('chromium-')).sort().reverse()
  .flatMap(n => ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe'].map(file => path.join(cache, n, file))) : [];
const executablePath = [process.env.SURFACE_BROWSER_PATH, ...candidates,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => p && existsSync(p));
assert.ok(executablePath, 'A locally installed Chromium browser is required; nothing is downloaded.');
const checks = [];
const failures = [];
const measurements = [];
const measure = rgb => {
  const channels = rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255);
  return channels.reduce((sum, n, i) => sum + (n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4) * [.2126, .7152, .0722][i], 0);
};
const contrast = (a, b) => { const values = [measure(a), measure(b)].sort((x, y) => y - x); return (values[0] + .05) / (values[1] + .05); };
const check = (name, actual, expected) => {
  try { assert.deepEqual(actual, expected); checks.push({ name, passed: true }); }
  catch { checks.push({ name, passed: false, actual, expected }); failures.push(name); }
};
let browser;
let networkRequests = 0;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 1000, height: 1600 } });
  await context.route('**/*', route => { networkRequests++; return route.abort(); });
  const page = await context.newPage();
  await page.setContent(html);
  await page.addStyleTag({ content: css });
  const style = async id => {
    const value = await page.locator(`#${id}`).evaluate(el => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, border: s.borderTopColor, color: s.color, outline: s.outlineStyle, outlineWidth: s.outlineWidth, fontSize: s.fontSize };
    });
    measurements.push({ id, ...value });
    return value;
  };
  check('pale blue page remains', await page.locator('body').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(243, 247, 250)');
  for (const id of ['admin-card', 'bare-field', 'sidebar-search', 'pale-textarea', 'pale-select', 'bare-textarea', 'bare-select', 'admin-outline', 'customer-card', 'customer-link', 'variant', 'quantity']) {
    check(`${id}: white functional surface`, (await style(id)).background, 'rgb(255, 255, 255)');
  }
  for (const id of ['bare-field', 'bare-textarea', 'bare-select', 'admin-outline', 'customer-link', 'variant', 'quantity']) {
    const s = await style(id);
    check(`${id}: border contrast on white >=3`, contrast(s.border, 'rgb(255, 255, 255)') >= 3, true);
    check(`${id}: border contrast on page >=3`, contrast(s.border, 'rgb(243, 247, 250)') >= 3, true);
  }
  for (const id of ['admin-outline', 'customer-link', 'variant']) {
    await page.locator(`#${id}`).hover();
    // Existing transitions are allowed to complete before measuring their end state.
    await page.waitForTimeout(180);
    check(`${id}: hover border stays visible`, contrast((await style(id)).border, 'rgb(255, 255, 255)') >= 3, true);
  }
  await page.locator('#bare-field').focus();
  const focused = await style('bare-field');
  check('field focus outline visible', [focused.outline, focused.outlineWidth], ['solid', '2px']);
  const placeholder = await page.locator('#bare-field').evaluate(el => getComputedStyle(el, '::placeholder').color);
  check('placeholder normal text contrast >=4.5', contrast(placeholder, 'rgb(255, 255, 255)') >= 4.5, true);
  check('disabled field stays distinct', (await style('disabled-field')).background, 'rgb(232, 238, 242)');
  check('disabled pale select stays distinct', (await style('disabled-pale')).background, 'rgb(232, 238, 242)');
  check('read-only invitation field stays pale', (await style('readonly-pale')).background, 'rgb(243, 247, 250)');
  check('intentional dark field retained', (await style('dark-field')).background, 'rgb(39, 54, 68)');
  check('successful tracking background retained', (await style('valid-field')).background, 'rgb(240, 253, 244)');
  check('successful tracking border retained', (await style('valid-field')).border, 'rgb(134, 239, 172)');
  check('invalid field background retained', (await style('invalid-field')).background, 'rgb(255, 228, 230)');
  check('invalid field border retained', (await style('invalid-field')).border, 'rgb(248, 113, 113)');
  check('artwork editor remains transparent', (await style('artwork-field')).background, 'rgba(0, 0, 0, 0)');
  check('checkbox is not filled like a text field', (await style('checkbox')).background, 'rgba(0, 0, 0, 0)');
  check('dark primary button retained', (await style('admin-primary')).background, 'rgb(39, 54, 68)');
  check('selected graphite button retained', (await style('selected')).background, 'rgb(61, 75, 89)');
  check('selected PayPal colour retained', (await style('paypal')).background, 'rgb(0, 94, 166)');
  check('selected PayPal text retained', (await style('paypal')).color, 'rgb(255, 255, 255)');
  check('disabled button readable', contrast((await style('disabled-button')).color, (await style('disabled-button')).background) >= 4.5, true);
  check('payment note normal text contrast >=4.5', contrast((await style('payment-note')).color, 'rgb(243, 247, 250)') >= 4.5, true);
  check('dark panel light text unchanged', (await style('dark-panel')).color, 'rgb(154, 174, 191)');
  await page.setViewportSize({ width: 390, height: 844 });
  check('mobile text field stays 16px', (await style('bare-field')).fontSize, '16px');
  check('no external requests', networkRequests, 0);
} catch (error) {
  failures.push('Browser execution did not complete');
  checks.push({ name: 'Browser execution did not complete', passed: false, error: String(error.message).split('\n')[0] });
} finally {
  await browser?.close();
  const dir = path.join(root, '.codex-audit', 'surface-contrast', `${new Date().toISOString().replace(/[:.]/g, '-')}-${baseline ? 'baseline' : 'current'}`);
  mkdirSync(dir, { recursive: true });
  const files = ['src/app/globals.css', 'src/components/SiteChrome.tsx', 'src/components/admin/AdminSidebar.tsx', 'src/app/checkout/page.tsx', 'tailwind.config.js', 'scripts/check-surface-contrast.mjs'];
  const receipt = {
    at: new Date().toISOString(), baseline, passed: failures.length === 0 && checks.length > 0, checks, measurements, networkRequests,
    limitations: 'Representative compiled CSS fixture, not a served-page or physical iPhone audit.',
    cssSourceSha256: createHash('sha256').update(source).digest('hex'),
    sourceHashes: Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(file)).digest('hex')])),
  };
  writeFileSync(path.join(dir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(JSON.stringify({ passed: receipt.passed, checks: checks.length, failures, receipt: path.relative(root, path.join(dir, 'receipt.json')) }));
}
if (failures.length) process.exitCode = 1;
