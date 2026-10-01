import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createAdminEnquiryPolling } from '../src/lib/adminEnquiryPolling.ts';

const settle = () => new Promise(resolve => setImmediate(resolve));
const counts = (newCount = 2) => ({ newCount, oldestDays: 3, latestUpdatedAt: '2026-09-23', recent: [] });
function harness(fetcher = async () => counts()) {
  let visible = true;
  let calls = 0;
  const timers = new Set();
  const visibility = new Set();
  const polling = createAdminEnquiryPolling({
    fetchCount: () => { calls++; return fetcher(); },
    visible: () => visible,
    everyMinute: callback => { timers.add(callback); return () => timers.delete(callback); },
    onVisibility: callback => { visibility.add(callback); return () => visibility.delete(callback); },
  });
  return { polling, timers, visibility, calls: () => calls,
    tick: () => timers.forEach(callback => callback()),
    show: value => { visible = value; visibility.forEach(callback => callback()); },
  };
}

test('sidebar and dashboard share the initial read and every minute, with identical results', async () => {
  const h = harness();
  const sidebar = [], dashboard = [];
  const stopSidebar = h.polling.subscribe(result => sidebar.push(result));
  const stopDashboard = h.polling.subscribe(result => dashboard.push(result));
  await settle();
  assert.equal(h.calls(), 1);
  assert.equal(h.timers.size, 1);
  assert.equal(h.visibility.size, 1);
  assert.deepEqual(sidebar, dashboard);
  h.tick(); await settle();
  assert.equal(h.calls(), 2);
  assert.equal(dashboard.length, 2);
  stopDashboard(); h.tick(); await settle();
  assert.equal(h.calls(), 3);
  assert.equal(dashboard.length, 2);
  stopSidebar();
  assert.equal(h.timers.size, 0);
  assert.equal(h.visibility.size, 0);
});

test('hidden tabs do not poll and returning refreshes immediately', async () => {
  const h = harness(); h.show(false);
  const results = [];
  const stop = h.polling.subscribe(result => results.push(result));
  h.tick(); await settle(); assert.equal(h.calls(), 0);
  h.show(true); await settle(); assert.equal(h.calls(), 1);
  h.show(false); h.tick(); await settle(); assert.equal(h.calls(), 1);
  h.show(true); await settle(); assert.equal(h.calls(), 2);
  stop();
});

test('late subscriber receives current data without another query', async () => {
  const h = harness(); const stopFirst = h.polling.subscribe(() => {});
  await settle();
  const results = []; const stopSecond = h.polling.subscribe(result => results.push(result));
  assert.equal(h.calls(), 1); assert.equal(results[0].data.oldestDays, 3);
  stopFirst(); stopSecond();
});

test('failed or malformed reads show an error and recover next minute', async () => {
  let mode = 'throw';
  const h = harness(async () => {
    if (mode === 'throw') throw new Error('offline');
    return mode === 'bad' ? { newCount: '2' } : counts();
  });
  const results = []; const stop = h.polling.subscribe(result => results.push(result));
  await settle(); assert.equal(results.at(-1).error, true);
  mode = 'bad'; h.tick(); await settle(); assert.equal(results.at(-1).error, true);
  mode = 'good'; h.tick(); await settle(); assert.equal(results.at(-1).error, false);
  stop();
});

test('overlapping timer and visibility requests are deduplicated', async () => {
  let resolve;
  const h = harness(() => new Promise(done => { resolve = done; }));
  const stop = h.polling.subscribe(() => {});
  h.tick(); h.show(true); assert.equal(h.calls(), 1);
  resolve(counts()); await settle(); stop();
});

test('mutation during a read queues one fresh read, not a stale notification', async () => {
  const pending = [];
  const h = harness(() => new Promise(resolve => pending.push(resolve)));
  const results = []; const stop = h.polling.subscribe(result => results.push(result));
  h.polling.refreshAfterChange(); h.polling.refreshAfterChange();
  pending.shift()(counts(2)); await settle();
  assert.equal(h.calls(), 2); assert.equal(results.length, 0);
  pending.shift()(counts(0)); await settle(); assert.equal(results[0].data.newCount, 0);
  stop();
});

test('mutation refreshes immediately when idle and defers safely while hidden', async () => {
  const h = harness(); const stop = h.polling.subscribe(() => {}); await settle();
  h.polling.refreshAfterChange(); await settle(); assert.equal(h.calls(), 2);
  h.show(false); h.polling.refreshAfterChange(); await settle(); assert.equal(h.calls(), 2);
  h.show(true); await settle(); assert.equal(h.calls(), 3); stop();
});

test('unmount clears cached customer data and discards replies from the previous session', async () => {
  const pending = [];
  const h = harness(() => new Promise(resolve => pending.push(resolve)));
  const old = [], current = [];
  const stopOld = h.polling.subscribe(result => old.push(result)); stopOld();
  const stopCurrent = h.polling.subscribe(result => current.push(result));
  pending.shift()(counts(99)); await settle();
  assert.equal(old.length, 0); assert.equal(current.length, 0);
  h.tick(); assert.equal(h.calls(), 2); // old request did not release the new one's lock
  pending.shift()(counts(1)); await settle(); assert.equal(current[0].data.newCount, 1);
  stopCurrent();
});

test('component wiring keeps preview off, errors, popup acknowledgement, age and mutation updates', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
  const sidebar = read('../src/components/admin/AdminSidebar.tsx');
  const dashboard = read('../src/app/admin/dashboard/page.tsx');
  const enquiries = read('../src/app/admin/enquiries/page.tsx');
  assert.match(sidebar, /if \(previewMode\) return;\s+return subscribeAdminEnquiryCount/);
  assert.match(sidebar, /setEnquiryPopup\(null\)/);
  assert.match(sidebar, /seenEnquiryInMemory/);
  for (const source of [sidebar, dashboard]) {
    assert.match(source, /subscribeAdminEnquiryCount/);
    assert.match(source, /setEnquiryCountError\(true\)/);
    assert.doesNotMatch(source, /fetch\('\/api\/admin\/enquiries\/new-count'/);
  }
  assert.match(dashboard, /setOldestEnquiryDays\(data.oldestDays\)/);
  assert.equal((enquiries.match(/refreshAdminEnquiryCount\(\)/g) ?? []).length, 5);
  const service = read('../src/lib/adminEnquiryPolling.ts');
  assert.match(service, /setInterval\(callback, 60_000\)/);
  assert.match(service, /cache: 'no-store'/);
  assert.match(service, /AbortSignal.timeout\(30_000\)/);
});
