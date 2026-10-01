/**
 * Load the generated source library into the LIVE database
 * (Pearl plan Stage C step 5).
 *
 * The local DATABASE_URL is deliberately read-only, so this script does not
 * touch the database itself. It signs in to the live admin panel and sends
 * the stored pages through the admin API in small batches, exactly as a
 * person pressing buttons would.
 *
 * Run:  WG_ADMIN_PASSWORD=... node scripts/load-source-library.mjs
 * Env:  WG_ADMIN_PASSWORD  (required, never stored anywhere)
 *       WG_BASE_URL        (default https://windsorglow.com)
 *
 * Reads docs/source-library.generated.json, produced by
 * scripts/build-research-evidence.mjs.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = path.join(ROOT, 'docs/source-library.generated.json');
const BASE = (process.env.WG_BASE_URL || 'https://windsorglow.com').replace(/\/$/, '');
const PASSWORD = process.env.WG_ADMIN_PASSWORD;

const MAX_BATCH_BYTES = 2_000_000;
const MAX_BATCH_PAGES = 10;

if (!PASSWORD) {
  console.error('Set WG_ADMIN_PASSWORD in the environment (it is never written to disk).');
  process.exit(1);
}

async function login() {
  const response = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: PASSWORD, rememberMe: true }),
  });
  if (!response.ok) throw new Error(`Admin login failed: ${response.status} ${response.statusText}`);
  const cookies = response.headers.getSetCookie?.() || [];
  const session = cookies.map((cookie) => cookie.split(';')[0]).find((pair) => pair.startsWith('wg_admin_session='));
  if (!session) throw new Error('Admin login succeeded but no session cookie was returned.');
  return session;
}

async function post(pathname, cookie, body, attempt = 1) {
  const response = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) {
    if (attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 1_500 * attempt));
      return post(pathname, cookie, body, attempt + 1);
    }
    const text = await response.text().catch(() => '');
    throw new Error(`${pathname} failed after ${attempt} attempts: ${response.status} ${text.slice(0, 300)}`);
  }
  return response.json().catch(() => ({}));
}

async function main() {
  const library = JSON.parse(await readFile(LIBRARY, 'utf8'));
  const pages = library.pages || [];
  const failures = library.failures || [];
  console.log(`Loading ${pages.length} stored pages (+${failures.length} unreachable) to ${BASE} ...`);

  const cookie = await login();
  await post('/api/admin/db/setup', cookie, {});
  console.log('Signed in; schema is in place.');

  /* WG_REBUILD_PASSAGES=1 refreshes sections and search passages even for
     pages whose content did not change — run it after the extraction or the
     junk filter improves, so the whole library benefits without new versions. */
  const rebuildPassages = process.env.WG_REBUILD_PASSAGES === '1';
  const totals = { 'new-page': 0, 'new-version': 0, unchanged: 0, refreshed: 0, failures: 0 };
  let batch = [];
  let batchBytes = 0;
  let sent = 0;

  async function flush() {
    if (!batch.length) return;
    const { counts } = await post('/api/admin/pearl/source-library/load', cookie, { pages: batch, rebuildPassages });
    for (const key of Object.keys(totals)) totals[key] += counts?.[key] || 0;
    sent += batch.length;
    process.stdout.write(`  ${sent}/${pages.length} pages sent (${totals['new-page']} new, ${totals['new-version']} changed, ${totals.refreshed} refreshed, ${totals.unchanged} unchanged)\n`);
    batch = [];
    batchBytes = 0;
  }

  for (const page of pages) {
    const size = JSON.stringify(page).length;
    if (batch.length && (batchBytes + size > MAX_BATCH_BYTES || batch.length >= MAX_BATCH_PAGES)) await flush();
    batch.push(page);
    batchBytes += size;
  }
  await flush();

  const finish = await post('/api/admin/pearl/source-library/load', cookie, {
    finish: true,
    failures,
    evidenceUrls: library.evidenceUrls || [],
  });
  totals.failures += finish.counts?.failures || 0;

  console.log(`Done. ${totals['new-page']} new pages, ${totals['new-version']} new versions, ${totals.refreshed} refreshed, ${totals.unchanged} unchanged, ${totals.failures} unreachable recorded.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
