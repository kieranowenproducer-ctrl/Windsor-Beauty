import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

test('a failed save stays queued and retries with the same receipt', async () => {
  const sent = [];
  let fail = true;
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    return { ok: !fail };
  };
  const tracking = await import('../src/lib/analytics/trackingQueue.ts');
  tracking.queueTrackingEvent({ path: '/shop', visit_id: 'visit-test', landing: true });
  await tracking.flushTrackingQueue();
  assert.equal(tracking.queuedTrackingEvents(), 1);

  fail = false;
  await tracking.flushTrackingQueue();
  assert.equal(tracking.queuedTrackingEvents(), 0);
  assert.equal(sent.length, 2);
  assert.equal(sent[0].event_id, sent[1].event_id);
});

test('a new event cannot be lost while an earlier save is in flight', async () => {
  store.clear();
  const tracking = await import('../src/lib/analytics/trackingQueue.ts');
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const sent = [];
  globalThis.fetch = async (_url, options) => {
    sent.push(JSON.parse(options.body));
    if (sent.length === 1) await firstGate;
    return { ok: true };
  };
  tracking.queueTrackingEvent({ path: '/', visit_id: 'visit-race', landing: true });
  tracking.queueTrackingEvent({ path: '/shop', visit_id: 'visit-race' });
  releaseFirst();
  await tracking.flushTrackingQueue();
  assert.deepEqual(sent.map((event) => event.path), ['/', '/shop']);
  assert.equal(tracking.queuedTrackingEvents(), 0);
});

test('the live route waits for a confirmed database save', () => {
  const route = readFileSync(new URL('../src/app/api/visit/route.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(route, /\bafter\s*\(/);
  assert.match(route, /await recordSiteVisit\s*\(/);
  assert.match(route, /await recordSiteInteraction\s*\(/);
  assert.match(route, /status:\s*503/);
});

test('retry receipts are unique in both tracking tables', () => {
  const schema = readFileSync(new URL('../src/lib/db/schema-parts/operations-and-logs.ts', import.meta.url), 'utf8');
  assert.match(schema, /site_visits_event_id_unique/);
  assert.match(schema, /site_interactions_event_id_unique/);
});

test('anonymous visits give the database an explicit token type', () => {
  const visits = readFileSync(new URL('../src/lib/db/siteVisits.ts', import.meta.url), 'utf8');
  assert.match(visits, /customerToken, 200\)\}::text IS NULL/);
});

test('health checks judge registrations from the repaired system onward', () => {
  const visits = readFileSync(new URL('../src/lib/db/siteVisits.ts', import.meta.url), 'utf8');
  assert.match(visits, /TRACKING_RELIABILITY_STARTED_AT/);
  assert.match(visits, /a\.created_at >= \$\{TRACKING_RELIABILITY_STARTED_AT\}::timestamptz/);
});

test('staff activity is excluded from the customer journey health comparison', () => {
  const activity = readFileSync(new URL('../src/lib/db/ipActivity.ts', import.meta.url), 'utf8');
  assert.match(activity, /wg_admin_session=/);
  assert.match(activity, /if \(\/\(\?:\^\|;\\s\*\)wg_admin_session=\/\.test\(cookies\)\) return/);
});
