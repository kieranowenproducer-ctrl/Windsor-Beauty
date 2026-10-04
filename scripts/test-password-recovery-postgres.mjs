// Isolated PostgreSQL regression proof. Install @electric-sql/pglite into a
// temporary directory, then pass its dist/index.js path as the sole argument.
// No application environment, network database or email provider is loaded.
// PGlite has one exclusive connection: parallel calls below prove queued
// single-use behavior, not a multi-connection production contention test.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

if (!process.argv[2]) throw new Error('Pass the temporary PGlite dist/index.js path. No live database is supported.');
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
after(() => db.close());
await db.exec(`
  CREATE TABLE customers (
    id integer PRIMARY KEY, password_hash text NOT NULL CHECK (password_hash <> 'reject-hash'), banned_at timestamptz
  );
  CREATE TABLE password_reset_tokens (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id integer NOT NULL REFERENCES customers(id), token text UNIQUE NOT NULL,
    expires_at timestamptz NOT NULL, used_at timestamptz
  );
  INSERT INTO customers VALUES (1, 'owner-original', NULL), (2, 'other-original', NULL), (3, 'banned-original', now());
  INSERT INTO password_reset_tokens (customer_id, token, expires_at, used_at) VALUES
    (1, 'valid', now() + interval '1 hour', NULL),
    (1, 'expired', now() - interval '1 second', NULL),
    (1, 'used', now() + interval '1 hour', now()),
    (3, 'banned', now() + interval '1 hour', NULL),
    (2, 'parallel', now() + interval '1 hour', NULL),
    (1, 'rollback', now() + interval '1 hour', NULL);
`);

// Use the application's actual statement; only replace tagged parameters with
// PostgreSQL placeholders. Changing its SQL automatically changes this proof.
const source = readFileSync(new URL('../src/lib/db.ts', import.meta.url), 'utf8');
const fn = source.slice(source.indexOf('export async function resetCustomerPasswordByToken'));
const statement = fn.match(/requireDb\(\)`([\s\S]*?)`;/)?.[1];
assert.ok(statement, 'Recovery statement must be extracted from the real source');
assert.equal((statement.match(/\$\{token\}/g) || []).length, 1);
assert.equal((statement.match(/\$\{passwordHash\}/g) || []).length, 1);
const sql = statement.replace('${token}', '$1').replace('${passwordHash}', '$2');
const reset = async (token, hash) => (await db.query(sql, [token, hash])).rows;
const snapshots = async () => (await db.query('SELECT * FROM customers ORDER BY id')).rows;
const token = async value => (await db.query('SELECT used_at FROM password_reset_tokens WHERE token = $1', [value])).rows[0];

test('actual recovery SQL updates only the token owner and consumes the token once', async () => {
  const rows = await reset('valid', 'owner-new');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].id, 1);
  assert.equal(rows[0].password_hash, 'owner-new');
  assert.ok((await token('valid')).used_at);
  assert.equal((await snapshots())[1].password_hash, 'other-original');
  assert.deepEqual(await reset('valid', 'attacker-reuse'), []);
  assert.equal((await snapshots())[0].password_hash, 'owner-new');
});

for (const invalid of ['expired', 'used', 'unknown', 'banned']) {
  test(`${invalid} recovery evidence cannot change any customer`, async () => {
    const before = await snapshots();
    const priorToken = await token(invalid);
    assert.deepEqual(await reset(invalid, 'must-not-save'), []);
    assert.deepEqual(await snapshots(), before);
    assert.deepEqual(await token(invalid), priorToken);
  });
}

test('parallel queued reuse has one winner and one unchanged rejection', async () => {
  const results = await Promise.all([reset('parallel', 'winner-a'), reset('parallel', 'winner-b')]);
  assert.equal(results.filter(rows => rows.length === 1).length, 1);
  assert.equal(results.filter(rows => rows.length === 0).length, 1);
  const winner = results.find(rows => rows.length === 1)[0];
  assert.equal(winner.id, 2);
  assert.equal((await snapshots())[1].password_hash, winner.password_hash);
  assert.ok((await token('parallel')).used_at);
});

test('a rejected password update rolls back token consumption in the same statement', async () => {
  const before = await snapshots();
  await assert.rejects(reset('rollback', 'reject-hash'), /check constraint/);
  assert.deepEqual(await snapshots(), before);
  assert.equal((await token('rollback')).used_at, null);
  assert.equal((await reset('rollback', 'owner-after-rollback')).length, 1);
});

test('actual profile SQL persists a phone edit without changing stored social consent, another member or old orders', async () => {
  await db.exec(`ALTER TABLE customers
    ADD COLUMN phone text, ADD COLUMN marketing_consent boolean DEFAULT true,
    ADD COLUMN instagram_profile text, ADD COLUMN facebook_profile text,
    ADD COLUMN instagram_marketing_consent boolean DEFAULT true,
    ADD COLUMN facebook_marketing_consent boolean DEFAULT true,
    ADD COLUMN phone_marketing_consent boolean DEFAULT false;
    UPDATE customers SET phone = 'historic phone', instagram_profile = 'original.handle', facebook_profile = 'original.name';
    CREATE TABLE historical_orders (id integer PRIMARY KEY, customer_id integer, phone_copy text);
    INSERT INTO historical_orders VALUES (1, 1, 'historic phone');`);
  const beforeOther = (await snapshots())[1];
  const beforeHistory = (await db.query('SELECT * FROM historical_orders')).rows;
  const current = { ...(await snapshots())[0], address_country: 'TR' };
  const { customerProfileEdit } = await import('../src/lib/customerProfileEdit.ts');
  const { params } = customerProfileEdit({ phone: '5321234567' }, current);
  const profile = source.slice(source.indexOf('export async function updateCustomerProfile'));
  const template = profile.match(/const save = \(\) => db`([\s\S]*?)`;/)?.[1];
  assert.ok(template);
  assert.match(template, /SET phone =/, 'The real profile update must be extracted, not a later query');
  const values = [];
  const query = template.replace(/\$\{(params\.\w+|id)\}/g, (_whole, field) => {
    values.push(field === 'id' ? 1 : params[field.slice(7)]);
    return `$${values.length}`;
  });
  assert.doesNotMatch(query, /\$\{/, 'Every real profile SQL parameter must be accounted for');
  const saved = (await db.query(query, values)).rows[0];
  assert.equal(saved.phone, '+905321234567');
  assert.equal(saved.marketing_consent, true);
  assert.equal(saved.instagram_marketing_consent, true);
  assert.equal(saved.facebook_marketing_consent, true);
  assert.equal(saved.phone_marketing_consent, false);
  assert.equal(saved.instagram_profile, 'original.handle');
  assert.equal(saved.facebook_profile, 'original.name');
  assert.deepEqual((await snapshots())[1], beforeOther);
  assert.deepEqual((await db.query('SELECT * FROM historical_orders')).rows, beforeHistory);
});
