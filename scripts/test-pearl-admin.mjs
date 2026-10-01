import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { validatePearlSourceUrl } from '../src/lib/concierge/research/source-safety.mjs';
import { fetchPearlSourcePreview, PearlSourcePreviewError } from '../src/lib/concierge/research/source-preview-fetch.mjs';

const controlCentreSource = await readFile(new URL('../src/components/admin/pearl/PearlControlCentre.tsx', import.meta.url), 'utf8');
const proposalRouteSource = await readFile(new URL('../src/app/api/admin/pearl/proposals/route.ts', import.meta.url), 'utf8');
const rejectionRouteSource = await readFile(new URL('../src/app/api/admin/pearl/rejections/route.ts', import.meta.url), 'utf8');
const dashboardRouteSource = await readFile(new URL('../src/app/api/admin/pearl/dashboard/route.ts', import.meta.url), 'utf8');
const packageSource = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

test('Test and Improve suggestions are working controls, not display-only labels', () => {
  assert.match(controlCentreSource, /onClick=\{\(\) => void acceptSuggestedTerm\(suggestion\)\}/);
  assert.match(controlCentreSource, /`Use \$\{suggestion\.label \|\| suggestion\.slug\}`/);
  assert.match(controlCentreSource, />None of these<\/button>/);
  assert.match(controlCentreSource, /min-h-11/);
  assert.match(controlCentreSource, /originalQuestion\.replace/);
});

test('accepted single corrections create one reviewed learning proposal', () => {
  assert.match(controlCentreSource, /needsLearningProposal/);
  assert.match(controlCentreSource, /confirmationCount: 1/);
  assert.match(controlCentreSource, /expectedOutcome: `This question must resolve to \$\{label\} and preserve its requested answer type\.`/);
  assert.match(proposalRouteSource, /payload->>'dedupeKey'/);
  assert.match(proposalRouteSource, /confirmationCount/);
  assert.match(proposalRouteSource, /repeated: true/);
});

test('rejected suggestions become review evidence and appear in recognition health', () => {
  assert.match(controlCentreSource, /fetch\('\/api\/admin\/pearl\/rejections'/);
  assert.match(rejectionRouteSource, /changeType: 'suggestion_rejected'/);
  assert.match(dashboardRouteSource, /rejectedSuggestions:/);
  assert.match(controlCentreSource, /Name recognition health/);
  assert.match(controlCentreSource, /Suggestions rejected/);
});

test('the focused recognition release gate covers catalogue, short names, admin controls and baseline', () => {
  const gate = packageSource.scripts['check:pearl-recognition'];
  assert.match(gate, /test:pearl-catalogue/);
  assert.match(gate, /test:pearl-short-names/);
  assert.match(gate, /test:pearl-admin/);
  assert.match(gate, /pearl:check/);
});

test('accepts a public secure research link and removes its fragment', () => {
  assert.deepEqual(
    validatePearlSourceUrl('https://pubmed.ncbi.nlm.nih.gov/12345/#details'),
    { ok: true, url: 'https://pubmed.ncbi.nlm.nih.gov/12345/' },
  );
});

test('rejects an insecure link', () => {
  assert.equal(validatePearlSourceUrl('http://example.com').ok, false);
});

/* Kieran, 18 Aug 2026: having to type https:// in front of every source was
   the complaint. A bare address is accepted and assumed secure; a typed
   http:// is still refused rather than quietly upgraded. */
test('accepts a website address typed without https in front', () => {
  for (const [typed, expected] of [
    ['www.peptidedosages.com/', 'https://www.peptidedosages.com/'],
    ['peptidejournal.org', 'https://peptidejournal.org/'],
    ['www.peptidedeck.com/semax', 'https://www.peptidedeck.com/semax'],
    ['peptideauthority.co.uk:8443/a', 'https://peptideauthority.co.uk:8443/a'],
  ]) {
    const result = validatePearlSourceUrl(typed);
    assert.equal(result.ok, true, typed);
    assert.equal(result.url, expected, typed);
  }
});

test('assuming https never rescues a link that should still be refused', () => {
  for (const typed of [
    'http://example.com',
    'localhost/source',
    '127.0.0.1/source',
    '192.168.1.5/source',
    'research.internal/source',
    'notadomain',
    'user:secret@example.com/paper',
  ]) {
    assert.equal(validatePearlSourceUrl(typed).ok, false, typed);
  }
});

test('the source form does not use a native url input, which blocks a bare address', () => {
  // Guard the other half of the same bug: type="url" makes the browser refuse
  // "www.example.com" before validatePearlSourceUrl is ever reached.
  assert.equal(controlCentreSource.includes('type="url"'), false);
});

test('rejects links containing credentials', () => {
  assert.equal(validatePearlSourceUrl('https://user:secret@example.com/paper').ok, false);
});

test('rejects local and private network destinations', () => {
  for (const url of [
    'https://localhost/source',
    'https://127.0.0.1/source',
    'https://10.1.2.3/source',
    'https://172.16.0.10/source',
    'https://192.168.1.5/source',
    'https://[::1]/source',
    'https://[::ffff:127.0.0.1]/source',
    'https://research.internal/source',
  ]) {
    assert.equal(validatePearlSourceUrl(url).ok, false, url);
  }
});

const publicLookup = async () => [{ address: '93.184.216.34', family: 4 }];

test('the source preview follows a public redirect manually and returns text', async () => {
  const calls = [];
  const result = await fetchPearlSourcePreview('https://example.com/start', {
    lookupImpl: publicLookup,
    fetchImpl: async (url, options) => {
      calls.push({ url, redirect: options.redirect });
      if (url.endsWith('/start')) return new Response(null, { status: 302, headers: { location: '/paper' } });
      return new Response('<html><title>Paper</title></html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
    },
  });
  assert.equal(result.url, 'https://example.com/paper');
  assert.match(result.markup, /Paper/);
  assert.deepEqual(calls.map((call) => call.redirect), ['manual', 'manual']);
});

test('the source preview refuses a redirect to a private address before fetching it', async () => {
  let calls = 0;
  await assert.rejects(
    fetchPearlSourcePreview('https://example.com/start', {
      lookupImpl: publicLookup,
      fetchImpl: async () => {
        calls += 1;
        return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } });
      },
    }),
    (error) => error instanceof PearlSourcePreviewError && /private or local/i.test(error.message),
  );
  assert.equal(calls, 1, 'the private redirect destination must never be fetched');
});

test('the source preview refuses a public-looking hostname that DNS sends to a private network', async () => {
  await assert.rejects(
    fetchPearlSourcePreview('https://example.com/paper', {
      lookupImpl: async () => [{ address: '192.168.1.10', family: 4 }],
      fetchImpl: async () => assert.fail('a private DNS result must never be fetched'),
    }),
    /resolves to a private or local network/i,
  );
});

test('the source preview refuses unsuitable file types and bodies over 2 MB', async () => {
  await assert.rejects(
    fetchPearlSourcePreview('https://example.com/paper.pdf', {
      lookupImpl: publicLookup,
      fetchImpl: async () => new Response('pdf', { headers: { 'content-type': 'application/pdf' } }),
    }),
    /web pages, Markdown and plain text only/i,
  );

  const oversized = new Uint8Array(2_000_001);
  await assert.rejects(
    fetchPearlSourcePreview('https://example.com/large', {
      lookupImpl: publicLookup,
      fetchImpl: async () => new Response(oversized, { headers: { 'content-type': 'text/plain' } }),
    }),
    /larger than the 2 MB preview limit/i,
  );
});

test('uses the same source-link safety check in the local preview form', async () => {
  const controlCentre = await readFile(
    new URL('../src/components/admin/pearl/PearlControlCentre.tsx', import.meta.url),
    'utf8',
  );
  assert.match(controlCentre, /validatePearlSourceUrl\(form\.url\)/);
  assert.match(controlCentre, /const safeForm = \{ \.\.\.form, url: String\(checkedUrl\.url\) \}/);
  assert.match(controlCentre, /source = \{ id, \.\.\.safeForm,/);
});

/* ---- Pearl repairs Stage C (18 Aug 2026): confirmation and undo ---- */

const readSource = (relative) => readFile(new URL(relative, import.meta.url), 'utf8');

test('approve, reject and remove all use the on-page confirmation before acting', async () => {
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  // Native browser pop-ups do not appear reliably on phones. The shared
  // ConfirmProvider renders the same decision inside the page instead.
  assert.match(controlCentre, /import \{ useConfirm \} from '@\/components\/admin\/ConfirmProvider'/);
  const confirms = controlCentre.match(/await confirm\(/g) || [];
  assert.ok(confirms.length >= 3, `expected at least 3 confirmations, found ${confirms.length}`);
  assert.doesNotMatch(controlCentre, /window\.confirm\(/);
  assert.match(controlCentre, /Approve “\$\{row\.title\}”\?/);
  assert.match(controlCentre, /Reject “\$\{row\.term\}”\?/);
  assert.match(controlCentre, /Remove this layout from where it is used\?/);
});

test('error notices persist and a stale timer can never wipe a newer notice', async () => {
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  assert.match(controlCentre, /window\.clearTimeout\(noticeTimer\.current\)/, 'showNotice must clear the previous timer');
  assert.match(controlCentre, /next\.tone !== 'error'/, 'only non-error notices may auto-dismiss');
  assert.match(controlCentre, /aria-label="Dismiss this message"/, 'the notice bar needs its dismiss button');
});

test('the switches route only flips enabled and never deletes', async () => {
  const route = await readSource('../src/app/api/admin/pearl/switches/route.ts');
  assert.match(route, /UPDATE pearl_citation_overrides SET enabled = \$\{enabled\}/);
  assert.match(route, /WHERE id = \$\{id\} AND archived_at IS NULL/, 'an archived citation row must stay untouchable');
  assert.match(route, /UPDATE pearl_passage_boosts SET enabled = \$\{enabled\}/);
  assert.doesNotMatch(route, /DELETE FROM/, 'switching off must never delete');
});

test('filing again only works on rejected proposals and copies the payload into a fresh row', async () => {
  const route = await readSource('../src/app/api/admin/pearl/proposals/refile/route.ts');
  assert.match(route, /original\.status !== 'rejected'/, 'only a rejected proposal can be filed again');
  assert.match(route, /INSERT INTO pearl_proposals/, 'refiling inserts a new row');
  assert.match(route, /original\.payload/, 'the copy carries the original payload');
  assert.doesNotMatch(route, /UPDATE pearl_proposals/, 'refiling must never un-reject the original');
});

/* ---- Pearl repairs Stage D (18 Aug 2026): all-or-nothing approval ---- */

test('deciding a proposal claims it first, in one statement, so a race has exactly one winner', async () => {
  const route = await readSource('../src/app/api/admin/pearl/proposals/decide/route.ts');
  assert.match(route, /WHERE id = \$\{id\} AND status = 'proposed'\s*\n\s*RETURNING \*/, 'the decision must be written by the same statement that checks the proposal is still waiting');
  assert.match(route, /This proposal has already been decided\./, 'the loser of the race gets an honest message');
  assert.match(route, /SET status = 'proposed', decided_by = NULL, decided_at = NULL/, 'a failed approval must hand the claim back');
  // Exactly one statement may set the decision, and it must be the guarded claim.
  const decisionWrites = route.match(/status = \$\{decision\}/g) || [];
  assert.equal(decisionWrites.length, 1, 'only the guarded claim may write the decision');
});

test('every row an approval creates is stamped and duplicate-proof', async () => {
  const conflictRule = /ON CONFLICT \(proposal_id\) WHERE proposal_id IS NOT NULL DO NOTHING/;
  for (const file of ['../src/lib/db/pearlAdmin.ts', '../src/lib/db/pearlTerminology.ts']) {
    const source = await readSource(file);
    assert.match(source, conflictRule, `${file} must refuse a duplicate proposal stamp`);
  }
  const admin = await readSource('../src/lib/db/pearlAdmin.ts');
  const conflicts = admin.match(new RegExp(conflictRule.source, 'g')) || [];
  assert.ok(conflicts.length >= 2, 'both the test-case and citation inserts must carry the conflict rule');
});

/* ---- Pearl repairs Stage E (18 Aug 2026): the AI daily ceiling ---- */

test('every AI route asks the budget gate before calling the model, and records a thrown call', async () => {
  for (const route of ['extract', 'expand', 'summarise', 'expand-search']) {
    const source = await readSource(`../src/app/api/admin/pearl/ai/${route}/route.ts`);
    const gateAt = source.indexOf('await pearlAiBudgetStop()');
    const callAt = source.indexOf('await pearlAiJson');
    assert.ok(gateAt > -1, `${route} must ask the budget gate`);
    assert.ok(callAt > -1 && gateAt < callAt, `${route} must ask the gate BEFORE calling the model`);
    assert.match(source, /usage: \{ input_tokens: 0, output_tokens: 0 \}, who: actor, status: 'failed'/, `${route} must write a thrown call to the ledger with zero usage`);
  }
});

test('the cap defaults to 200 pence and the gate stops at it without blocking on a missing ledger', async () => {
  const record = await readSource('../src/lib/costs/record.ts');
  assert.match(record, /Number\.isFinite\(raw\) && raw >= 0 \? Math\.floor\(raw\) : 200/, 'the default cap must be 200 pence');
  const gate = await readSource('../src/lib/pearl/ai-spend.ts');
  // Where no ledger is configured, costs are not written down in this copy by
  // design, so an admin's work is never blocked on missing bookkeeping. (A
  // ledger that IS configured but will not answer is a different case with a
  // different answer - see the test below.)
  assert.match(gate, /if \(!costLedgerConfigured\(\)\) return null;/, 'a missing ledger must let the call through');
  assert.match(gate, /if \(spent >= cap\)/, 'at or over the cap must stop');
  assert.match(gate, /status: 429/, 'the stop must be a 429');
  assert.match(gate, /resets at midnight/, 'the refusal must say when it resets');
});

test('the schema carries the proposal-id stamps and their uniqueness rules', async () => {
  const schema = await readSource('../src/lib/db/schema-parts/operations-and-logs.ts');
  assert.match(schema, /ALTER TABLE pearl_test_cases ADD COLUMN IF NOT EXISTS proposal_id/);
  assert.match(schema, /ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS proposal_id/);
  /* Built-in records became editable on 19 Aug 2026. An edit is stored as an
     override row naming the built-in it replaces, so the column must exist or
     every such edit silently becomes an ordinary addition instead. */
  assert.match(schema, /ALTER TABLE pearl_terminology_overrides ADD COLUMN IF NOT EXISTS supersedes_builtin/);
  for (const index of ['pearl_test_cases_proposal_idx', 'pearl_terminology_proposal_idx', 'pearl_citation_overrides_proposal_idx']) {
    const line = schema.split('\n').find((candidate) => candidate.includes(`CREATE UNIQUE INDEX IF NOT EXISTS ${index}`));
    assert.ok(line, `${index} must exist`);
    assert.ok(line.includes('(proposal_id) WHERE proposal_id IS NOT NULL'), `${index} must be unique on the stamp only where it is set`);
  }
});

/* ---- Pearl repairs Stage H (18 Aug 2026): usability and accessibility ---- */

test('dashboard sections are shareable and section movement updates the address', async () => {
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  assert.match(controlCentre, /searchParams\?\.get\('section'\)/);
  assert.match(controlCentre, /params\.set\('section', next\)/);
  assert.match(controlCentre, /router\.replace\(/);
});

test('the compound picker closes with Escape and the stored-page list has a loading state', async () => {
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  assert.match(controlCentre, /event\.key === 'Escape'/);
  assert.match(controlCentre, /loading && pages\.length === 0 && <LoadingState/);
});

test('the What Pearl Reads choices use honest toggle semantics', async () => {
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  assert.match(controlCentre, /aria-pressed=\{tab === item\.id\}/);
  assert.doesNotMatch(controlCentre, /role="tab"/);
});

test('the repaired dashboard fields have labels and status chips are at least 11px', async () => {
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  for (const id of ['pearl-improvement-note', 'layout-block-heading-', 'layout-block-text-', 'layout-target-kind-', 'layout-target-value-']) {
    assert.match(controlCentre, new RegExp(`htmlFor=.*${id}`), `${id} needs a label`);
  }
  assert.match(controlCentre, /function StatusChip[\s\S]+text-\[11px\]/);
});

test('the closed mobile sidebar is invisible and outside keyboard navigation', async () => {
  const sidebar = await readSource('../src/components/admin/AdminSidebar.tsx');
  assert.match(sidebar, /mobileOpen \? 'visible translate-x-0' : 'invisible -translate-x-full'/);
  assert.match(sidebar, /lg:visible lg:translate-x-0/);
});

test('a retried approval cannot create a second Pearl task', async () => {
  // Every write an approval makes is stamped with the proposal id, so a retry
  // finds its earlier work instead of repeating it. A Pearl task lives in the
  // separate task database and cannot be stamped that way, so its only
  // protection is position: nothing may fail after it is created. If task
  // creation ever moves back above another write, the "pressing Approve again
  // is safe" message on screen stops being true.
  const decide = await readSource('../src/app/api/admin/pearl/proposals/decide/route.ts');
  const lastStampedWrite = decide.lastIndexOf('createPearlTestCase(');
  const firstTask = decide.indexOf('createPearlTask(');
  assert.ok(lastStampedWrite > 0, 'the saved-test write should still be there');
  assert.ok(firstTask > 0, 'the Pearl task write should still be there');
  assert.ok(
    firstTask > lastStampedWrite,
    'Pearl task creation must come after every stamped write, or a retried approval duplicates it',
  );
});

test('a failed hand-back never claims the proposal is back in the waiting list', async () => {
  const decide = await readSource('../src/app/api/admin/pearl/proposals/decide/route.ts');
  assert.match(decide, /could not hand the proposal back/);
  assert.match(decide, /It could not be returned to the waiting list either/);
});

test('the AI daily limit stops when it cannot read the ledger, but not when there is no ledger', async () => {
  // A spending limit that cannot see the spending is not a limit. The two
  // "unknown" cases are opposite: no ledger configured means costs are not
  // tracked in this copy by design and work continues; a configured ledger
  // that will not answer means the ceiling is broken, so the call stops.
  const gate = await readSource('../src/lib/pearl/ai-spend.ts');
  assert.match(gate, /could not check what its AI has spent today/, 'it must say plainly that the spend could not be read');
  assert.match(gate, /status: 503/, 'a broken ceiling is a 503, not a silent pass');
});

test('the file-extension shortcut can never skip the admin gate', async () => {
  // A URL segment may contain a dot, so a dynamic admin route matches the
  // static-file pattern happily: /api/admin/pearl-terminology/1.json used to
  // walk straight past the session check while /1 was refused. Real static
  // assets come from /_next/static and /public and never begin with /admin.
  const proxy = await readSource('../src/proxy.ts');
  assert.match(
    proxy,
    /const isAdminPath = pathname\.startsWith\('\/admin'\) \|\| pathname\.startsWith\('\/api\/admin'\);/,
    'the proxy must work out whether this is an admin address',
  );
  assert.match(
    proxy,
    /if \(!isAdminPath && STATIC_FILE_PATTERN\.test\(pathname\)\)/,
    'the static-file shortcut must never apply to an admin address',
  );
  const guard = proxy.indexOf('const isAdminPath');
  const shortcut = proxy.indexOf('STATIC_FILE_PATTERN.test(pathname)');
  assert.ok(guard > 0 && guard < shortcut, 'the admin check must be worked out before the shortcut runs');
});

test('the dashboard uses no grey too faint to read', async () => {
  // stone-400 (#a8a29e) on white measures 2.52:1 where the standard asks for
  // 4.5:1, and the dashboard used it 62 times for real sentences: the helper
  // line under every menu item, empty states, timestamps. A browser scan of
  // all nine screens found 132 failing pieces of text; stone-600 clears it.
  // Neither existing check covers this - check:contrast only judges the gold,
  // and check:a11y only walks the shop, never the admin panel.
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  const faint = controlCentre.match(/(?<!placeholder:)text-stone-400/g) || [];
  assert.equal(faint.length, 0, `stone-400 is too faint for body text; found ${faint.length} uses`);
  // stone-500 clears 4.5:1 on white but not on the tinted page background, so
  // it may not carry a link either.
  assert.doesNotMatch(controlCentre, /text-xs font-semibold text-stone-500 underline/);
});

/* ---- Clearing finished work off the two busiest screens ---- */

test('clearing a proposal only ever touches one already decided, and deletes nothing', async () => {
  const route = await readSource('../src/app/api/admin/pearl/proposals/clear/route.ts');
  // 'archived' is a status the proposals table has always allowed. Clearing
  // must never reach something still waiting for a person.
  assert.match(route, /WHERE id = \$\{id\} AND status IN \('approved', 'rejected'\)/, 'a single clear must only match a decided proposal');
  assert.match(route, /WHERE status IN \('approved', 'rejected'\)/, 'clear-all must only match decided proposals');
  assert.match(route, /Decide this one first/, 'trying to clear something still waiting must say so plainly');
  assert.doesNotMatch(route, /DELETE FROM/, 'clearing must never delete');
  assert.match(route, /recordPearlChange/, 'clearing must leave a history entry');
});

test('retiring a saved test keeps the question and deletes nothing', async () => {
  const route = await readSource('../src/app/api/admin/pearl/test-cases/retire/route.ts');
  assert.match(route, /SET status = 'retired'/, "'retired' is the status the table already allows");
  assert.match(route, /WHERE id = \$\{id\} AND status <> 'retired'/, 'retiring twice must not pretend to work');
  assert.doesNotMatch(route, /DELETE FROM/, 'retiring must never delete');
  assert.match(route, /recordPearlChange/, 'retiring must leave a history entry');
});

test('cleared proposals and retired tests leave their screens', async () => {
  const proposals = await readSource('../src/app/api/admin/pearl/proposals/route.ts');
  assert.match(proposals, /WHERE status <> 'archived'/, 'a cleared proposal must not come back on the next load');
  const admin = await readSource('../src/lib/db/pearlAdmin.ts');
  assert.match(admin, /FROM pearl_test_cases\s*\n\s*WHERE status <> 'retired'/, 'a retired test must not come back on the next load');
});

test('a long proposal is not printed in full until it is asked for', async () => {
  // One AI draft carried enough facts to fill the screen and bury everything
  // else, including whatever was still waiting for a decision.
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  assert.match(controlCentre, /opened\.has\(row\.id\) \? viewEntries\(row\.after_view\) : viewEntries\(row\.after_view\)\.slice\(0, 4\)/);
  assert.match(controlCentre, /Show all \$\{viewEntries\(row\.after_view\)\.length\}/, 'the button must say how many are hidden');
  assert.match(controlCentre, /aria-expanded=\{opened\.has\(row\.id\)\}/, 'the toggle must announce its state');
});

/* Kieran, 18 Aug 2026: a Pearl task could not carry a photo, video or screen
   recording, so a problem easiest to SHOW had to be re-filed on the ordinary
   task board just to attach the clip. These pin the fix and the trap inside it. */
test('a Pearl task can carry photos and videos', async () => {
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  const panel = controlCentre.slice(controlCentre.indexOf('function Tasks('));
  assert.match(panel, /type="file"/);
  assert.match(panel, /accept="image\/\*,video\/mp4,video\/quicktime,video\/webm,video\/\*"/);
  assert.match(panel, /multiple/);
});

test('Pearl task files use the shared uploader and the shared task endpoint', async () => {
  // Not a bespoke upload path: same size limits, same storage, same retention
  // and the same delete rules as the ordinary task board.
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  assert.match(controlCentre, /import \{ uploadTaskMedia \} from '@\/components\/admin\/tasks\/uploadMedia'/);
  const panel = controlCentre.slice(controlCentre.indexOf('function Tasks('));
  assert.match(panel, /uploadTaskMedia\(file/);
  assert.match(panel, /action: 'add_attachment'/);
  assert.match(panel, /\/api\/admin\/tasks\/task\/\$\{taskId\}/);
});

test('the chosen files are copied before the file input is cleared', async () => {
  // The trap: the input is cleared straight after onChange so the same file can
  // be picked twice. A FileList read later, inside a React updater, is already
  // empty by then, which silently loses every file the person chose.
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  const from = controlCentre.indexOf('function chooseFiles');
  const body = controlCentre.slice(from, controlCentre.indexOf('function dropFile'));
  assert.match(body, /const chosen = Array\.from\(list\)/);
  assert.doesNotMatch(body, /setFiles\(\(current\) => \[\.\.\.current, \.\.\.Array\.from\(list\)\]\)/);
});

test('a file that fails to upload never reports the task itself as failed', async () => {
  const controlCentre = await readSource('../src/components/admin/pearl/PearlControlCentre.tsx');
  const attachAll = controlCentre.slice(controlCentre.indexOf('async function attachAll'));
  const body = attachAll.slice(0, attachAll.indexOf('async function submit'));
  // Per-file isolation, matching the ordinary task drawer.
  assert.match(body, /failures\.push/);
  assert.match(body, /for \(const file of files\)/);
  // And the task is saved before any file is touched, so an upload problem can
  // never lose the words the person typed. Measured inside the Tasks panel only,
  // because other panels on this screen have a submit of their own.
  const panel = controlCentre.slice(controlCentre.indexOf('function Tasks('));
  const created = panel.indexOf("Could not create the task.");
  const uploads = panel.indexOf('await attachAll(');
  assert.ok(created > -1 && uploads > -1 && created < uploads);
});

test('the source library clearly separates stored, cited and unreachable pages', () => {
  assert.match(controlCentreSource, /Stored, not cited yet/);
  assert.match(controlCentreSource, /Cited now/);
  assert.match(controlCentreSource, /Unreachable/);
  assert.match(controlCentreSource, /Dosage figures show their own source beside the figure/);
});

test('the richer dosage review is admin-only and renders each figure with its source', () => {
  assert.match(controlCentreSource, /function AdminDoseRows/);
  assert.match(controlCentreSource, /adminPreview: true/);
  assert.match(controlCentreSource, /Source:/);
});

test('the new dosage source view is admin-only and actually renders each figure', () => {
  assert.match(controlCentreSource, /adminPreview: true/);
  assert.match(controlCentreSource, /function AdminDoseRows/);
  assert.match(controlCentreSource, /Source:/);
});
