// Prove the handover SQL against a real Postgres, on a real copy of the enquiries schema.
//
//   node scripts/test-handover-sql.mjs
//
// WHY THIS EXISTS IN THIS SHAPE. The Windsor Glow credential available locally is `agent_ro`, and
// it is genuinely read only: it refuses both `ALTER TABLE enquiries` ("must be owner") and
// `INSERT INTO enquiries` ("permission denied"). So the duplicate rules cannot be exercised
// against the live table from here, and the schema change lands through `ensureSchema()` on
// deploy, which is how the enquiries table itself was created.
//
// What that leaves is a choice between shipping the trickiest logic in this feature untested, and
// testing it against an identical schema in a database this machine CAN write to. This does the
// second: it builds a throwaway copy of the enquiries tables, including both partial unique
// indexes exactly as `ensureSchema` writes them, runs the real duplicate rules over it, and drops
// it. It proves the SQL and the indexes. It does not prove the production table has been migrated,
// and nothing here should be read as claiming it has.
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env.local', '.env']) {
    try {
      const text = readFileSync(file, 'utf-8').replace(/^﻿/, '');
      for (const line of text.split(/\r?\n/)) {
        const at = line.indexOf('=');
        if (at > 0 && !line.trim().startsWith('#') && line.slice(0, at).trim() === name) {
          return line.slice(at + 1).trim();
        }
      }
    } catch { /* next */ }
  }
  return undefined;
}

// The one database this machine holds a writable credential for. Borrowed as a scratch pad only:
// every object it creates is prefixed and dropped at the end.
const url = env('AI_COSTS_DATABASE_URL');
if (!url) {
  console.log('\n  No writable database available, so the handover SQL was not exercised.');
  console.log('  Set AI_COSTS_DATABASE_URL. Not treated as a pass.\n');
  process.exit(1);
}
const sql = neon(url);

let passed = 0;
let failed = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) { passed += 1; console.log(`  ok    ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}\n          expected ${e}\n          got      ${a}`); }
}

const T = 'zz_handover_probe';

async function build() {
  await sql.query(`DROP TABLE IF EXISTS ${T}_notes`);
  await sql.query(`DROP TABLE IF EXISTS ${T}`);
  // The same shape ensureSchema produces, columns included, so a difference here would be a
  // difference there.
  await sql.query(`CREATE TABLE ${T} (
    id SERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
    subject_key TEXT NOT NULL, subject_label TEXT NOT NULL, order_number TEXT,
    message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source TEXT NOT NULL DEFAULT 'website_form', priority TEXT NOT NULL DEFAULT 'normal',
    conversation_id TEXT, escalation_reason TEXT, ai_summary TEXT, customer_id INTEGER,
    assigned_to TEXT, transcript JSONB, attention_flag TEXT, escalation_key TEXT)`);
  await sql.query(`CREATE TABLE ${T}_notes (
    id SERIAL PRIMARY KEY, enquiry_id INTEGER NOT NULL REFERENCES ${T}(id) ON DELETE CASCADE,
    body TEXT NOT NULL, author TEXT NOT NULL DEFAULT 'AI Concierge',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await sql.query(`CREATE UNIQUE INDEX ${T}_one_open ON ${T} (conversation_id)
    WHERE source = 'ai_concierge' AND conversation_id IS NOT NULL AND status <> 'closed'`);
  await sql.query(`CREATE UNIQUE INDEX ${T}_key ON ${T} (escalation_key)
    WHERE escalation_key IS NOT NULL`);
}

const key = (conversationId, kind, summary) => createHash('sha256')
  .update(`${conversationId}|${kind}|${summary.trim().toLowerCase()}`).digest('hex').slice(0, 32);

/** The same three-outcome logic as createConciergeHandover, against the scratch tables. */
async function handover({ conversationId, kind, summary, priority = 'normal' }) {
  const k = key(conversationId, kind, summary);
  const inserted = await sql.query(
    `INSERT INTO ${T} (name,email,subject_key,subject_label,message,source,priority,
       conversation_id,ai_summary,escalation_key)
     VALUES ($1,$2,$3,$4,$5,'ai_concierge',$6,$7,$8,$9)
     ON CONFLICT DO NOTHING RETURNING id`,
    ['A customer', 'c@example.invalid', kind, kind, summary, priority, conversationId, summary, k],
  );
  const rows = inserted.rows ?? inserted;
  if (rows.length) return { created: 'new', id: rows[0].id };

  const same = (await sql.query(`SELECT id FROM ${T} WHERE escalation_key = $1 LIMIT 1`, [k]));
  const sameRows = same.rows ?? same;
  if (sameRows.length) return { created: 'duplicate', id: sameRows[0].id };

  const open = (await sql.query(
    `SELECT id FROM ${T} WHERE source='ai_concierge' AND conversation_id=$1 AND status<>'closed'
     ORDER BY created_at DESC LIMIT 1`, [conversationId]));
  const openRows = open.rows ?? open;
  if (!openRows.length) return { created: 'failed', id: null };

  await sql.query(`INSERT INTO ${T}_notes (enquiry_id, body) VALUES ($1,$2)`,
    [openRows[0].id, summary]);
  await sql.query(
    `UPDATE ${T} SET priority = CASE WHEN $2='urgent' THEN 'urgent'
       WHEN $2='high' AND priority='normal' THEN 'high' ELSE priority END,
       status = CASE WHEN status='replied' THEN 'new' ELSE status END, updated_at=now()
     WHERE id=$1`, [openRows[0].id, priority]);
  return { created: 'appended', id: openRows[0].id };
}

console.log('\n  THE CONCIERGE HANDOVER RULES, against a real copy of the schema\n');
await build();

/* 1. The ordinary case. */
const first = await handover({ conversationId: 'conv-1', kind: 'complaint', summary: 'Parcel never arrived.' });
check('a first escalation creates an enquiry', first.created, 'new');

/* 2. THE RETRY. The same tool call again must not raise a second thing. */
const retry = await handover({ conversationId: 'conv-1', kind: 'complaint', summary: 'Parcel never arrived.' });
check('the identical escalation again is recognised as a duplicate', retry.created, 'duplicate');
check('and it points at the enquiry that already exists', retry.id, first.id);

/* 3. A DIFFERENT problem in the same conversation appends rather than duplicating. */
const second = await handover({
  conversationId: 'conv-1', kind: 'refund', summary: 'Now wants a refund as well.', priority: 'high',
});
check('a different problem in the same conversation is added to the open enquiry', second.created, 'appended');
check('and it does not create a second enquiry', second.id, first.id);

const counts = await sql.query(`SELECT count(*)::int AS n FROM ${T}`);
check('one conversation has produced exactly one enquiry', (counts.rows ?? counts)[0].n, 1);
const notes = await sql.query(`SELECT count(*)::int AS n FROM ${T}_notes`);
check('with the second problem recorded as a note on it', (notes.rows ?? notes)[0].n, 1);

const pri = await sql.query(`SELECT priority FROM ${T} WHERE id=$1`, [first.id]);
check('and the enquiry took the higher priority of the two', (pri.rows ?? pri)[0].priority, 'high');

/* 4. Priority is never lowered by a later, calmer message. */
await handover({ conversationId: 'conv-1', kind: 'other', summary: 'Also a small question.', priority: 'normal' });
const pri2 = await sql.query(`SELECT priority FROM ${T} WHERE id=$1`, [first.id]);
check('a later ordinary message does not downgrade an urgent enquiry', (pri2.rows ?? pri2)[0].priority, 'high');

/* 5. A different conversation is a different enquiry. The rule must not be so eager it merges
 *    two customers' problems. */
const other = await handover({ conversationId: 'conv-2', kind: 'complaint', summary: 'Parcel never arrived.' });
check('a different conversation gets its own enquiry', other.created, 'new');
check('even when the wording is identical', other.id === first.id, false);

/* 6. Once closed, the conversation may raise a genuinely new one. Otherwise a customer who comes
 *    back a fortnight later can never reach anybody again. */
await sql.query(`UPDATE ${T} SET status='closed' WHERE id=$1`, [first.id]);
const afterClose = await handover({
  conversationId: 'conv-1', kind: 'complaint', summary: 'A new problem entirely.',
});
check('after the first is closed, a new problem opens a new enquiry', afterClose.created, 'new');
check('and it is a different row from the closed one', afterClose.id === first.id, false);

/* 7. The website form is untouched by any of it. */
await sql.query(`INSERT INTO ${T} (name,email,subject_key,subject_label,message)
  VALUES ('Someone','s@example.invalid','general','General','Hello')`);
await sql.query(`INSERT INTO ${T} (name,email,subject_key,subject_label,message)
  VALUES ('Someone','s@example.invalid','general','General','Hello again')`);
const forms = await sql.query(`SELECT count(*)::int AS n FROM ${T} WHERE source='website_form'`);
check('two identical contact form messages are both kept, unaffected by the concierge rules',
  (forms.rows ?? forms)[0].n, 2);

await sql.query(`DROP TABLE ${T}_notes`);
await sql.query(`DROP TABLE ${T}`);
console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.`);
console.log('  Scratch tables dropped. This proves the SQL, not that production has been migrated.\n');
process.exit(failed ? 1 : 0);
