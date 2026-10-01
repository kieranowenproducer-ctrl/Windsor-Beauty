// Take a copy of the whole Windsor Glow database, into one file you can keep anywhere.
//
//   npm run backup                      -> writes into ./backups/
//   npm run backup -- --out D:/somewhere
//
// WHAT THIS IS FOR, AND WHAT IT IS NOT
//
// Neon already protects you against mistakes: it keeps a rolling history and can put the
// database back to a moment before you broke something. That is the FIRST thing to reach
// for and docs/RECOVERY.md explains it.
//
// This script protects against something Neon cannot: losing the Neon account itself, or
// its history window quietly being shorter than you assumed. It writes a copy that lives
// completely outside Neon, on a disk you control.
//
// It uses the same database driver the site already uses, so there is nothing to install.
// The earlier version of RECOVERY.md told you to run `pg_dump`, which is not on this
// machine — that advice was wrong and this replaces it.
//
// It only ever READS. It is safe to run against production, and safe to run with the
// read-only credential in .env.local.

import { neon } from '@neondatabase/serverless';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of ['.env.local', '.env']) {
    try {
      const text = readFileSync(file, 'utf-8').replace(/^\uFEFF/, '');
      for (const line of text.split(/\r?\n/)) {
        const at = line.indexOf('=');
        if (at > 0 && !line.trim().startsWith('#') && line.slice(0, at).trim() === name) {
          return line.slice(at + 1).trim().replace(/^"|"$/g, '');
        }
      }
    } catch { /* next */ }
  }
  return undefined;
}

const url = env('DATABASE_URL');
if (!url) {
  console.log('\n  No DATABASE_URL, so there is nothing to copy.');
  console.log('  Set it, or run this from the website folder where .env.local lives.\n');
  process.exit(1);
}

const args = process.argv.slice(2);
const outArg = args.find((a) => a.startsWith('--out='));
const outDir = outArg ? outArg.slice('--out='.length) : 'backups';

const sql = neon(url, { fetchOptions: { cache: 'no-store' } });

// Table names come from the database's own catalogue, but they are still interpolated
// into a query, so they are checked against a strict pattern first and quoted. A name
// that is not a plain identifier is skipped loudly rather than run.
const SAFE_NAME = /^[a-z_][a-z0-9_]*$/;

// Neon's HTTP driver caps one response at 64 MB and answers HTTP 507 "response is too
// large" beyond it. Pearl's table of full page text crossed that in August 2026. So every
// table is counted first: one with more than PAGE_ROWS rows is read in pages ordered by
// its primary key, and a smaller one whose single read still comes back too large is
// re-read the same way with the page halved until it fits. The rows land in the file
// exactly as before; only the order inside a paged table (by key) differs.
const PAGE_ROWS = 2000;

function tooLarge(err) {
  return /too large|\b507\b/i.test(err?.message ?? '');
}

// Written as one timestamp so every file in a run agrees, and so the name sorts.
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const startedAt = Date.now();

// Reads a table a page at a time, in primary-key order, shrinking the page whenever a
// slice is still too big for one response. Still SELECT only.
async function readInPages(name, keyColumns) {
  const order = keyColumns.map((c) => `"${c}"`).join(', ');
  const rows = [];
  let size = PAGE_ROWS;
  let pages = 0;
  for (;;) {
    let page;
    try {
      page = await sql.query(`SELECT * FROM "${name}" ORDER BY ${order} LIMIT $1 OFFSET $2`, [size, rows.length]);
    } catch (err) {
      if (tooLarge(err) && size > 1) { size = Math.floor(size / 2); continue; }
      throw err;
    }
    rows.push(...page);
    pages += 1;
    if (page.length < size) return { rows, pages };
  }
}

try {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;

  const columns = await sql`
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position
  `;

  // Primary keys, from the catalogue, so a big table can be paged in a stable order.
  const keys = await sql`
    SELECT c.relname AS table_name, a.attname AS column_name
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ANY(i.indkey::int2[])
    WHERE i.indisprimary AND c.relnamespace = 'public'::regnamespace
    ORDER BY c.relname, array_position(i.indkey::int2[], a.attnum)
  `;
  const keyColumns = {};
  for (const k of keys) (keyColumns[k.table_name] ??= []).push(k.column_name);

  // Row counts, all in one round trip. If this fails the counts stay unknown and every
  // table gets the plain read first, falling back to pages only when that is too large.
  const counts = {};
  const countable = tables.map((t) => t.table_name).filter((n) => SAFE_NAME.test(n));
  if (countable.length) {
    try {
      const counted = await sql.query(
        countable.map((n) => `SELECT '${n}' AS name, count(*)::int AS n FROM "${n}"`).join(' UNION ALL ')
      );
      for (const c of counted) counts[c.name] = c.n;
    } catch { /* counts unknown */ }
  }

  mkdirSync(outDir, { recursive: true });

  const shape = {};
  for (const c of columns) {
    (shape[c.table_name] ??= []).push({
      column: c.column_name,
      type: c.data_type,
      nullable: c.is_nullable === 'YES',
      default: c.column_default,
    });
  }

  const data = {};
  let totalRows = 0;
  let skipped = [];
  let unreadable = [];

  for (const { table_name: name } of tables) {
    if (!SAFE_NAME.test(name)) { skipped.push(name); continue; }
    const key = keyColumns[name] ?? [];
    const canPage = key.length > 0 && key.every((c) => SAFE_NAME.test(c));
    try {
      let rows;
      let pages = 1;
      if (canPage && (counts[name] ?? 0) > PAGE_ROWS) {
        ({ rows, pages } = await readInPages(name, key));
      } else {
        try {
          rows = await sql.query(`SELECT * FROM "${name}"`);
        } catch (err) {
          if (!canPage || !tooLarge(err)) throw err;
          ({ rows, pages } = await readInPages(name, key));
        }
      }
      data[name] = rows;
      totalRows += rows.length;
      process.stdout.write(`  ${name} … ${rows.length}${pages > 1 ? ` (in ${pages} pages)` : ''}\n`);
    } catch (err) {
      // One unreadable table must not cost you the other forty-eight.
      unreadable.push({ name, reason: err.message.split('\n')[0] });
      process.stdout.write(`  ${name} … COULD NOT READ (${err.message.split('\n')[0]})\n`);
    }
  }

  const file = join(outDir, `windsor-glow-${stamp}.json`);
  writeFileSync(
    file,
    JSON.stringify(
      {
        takenAt: new Date().toISOString(),
        note: 'Windsor Glow database copy. Structure and contents. Read-only export.',
        tableCount: Object.keys(data).length,
        rowCount: totalRows,
        unreadable,
        shape,
        data,
      },
      null,
      1
    ),
    'utf-8'
  );

  console.log(`\n  Copied ${Object.keys(data).length} tables, ${totalRows} rows in ${Math.round((Date.now() - startedAt) / 1000)} s.`);
  if (skipped.length) console.log(`  Skipped odd table names: ${skipped.join(', ')}`);
  if (unreadable.length) {
    console.log(`  ${unreadable.length} table(s) could not be read — listed inside the file.`);
  }
  console.log(`  Written to ${file}`);
  console.log('\n  Keep it somewhere that is not this laptop and not Neon.');
  console.log('  This is a copy of real customer data: treat it like the database itself.\n');
} catch (err) {
  console.log(`\n  The copy did not finish: ${err.message}\n`);
  process.exit(1);
}
