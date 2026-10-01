// Windsor Beauty's own local database, for building and testing on this computer.
//
//   npm run db:local        keeps running; Ctrl+C stops it
//
// This is a real PostgreSQL that lives entirely inside this project (.local-db/, never
// committed). It shares nothing with any other shop or any live system: no orders, customers
// or emails from anywhere else can reach it, and nothing in it can reach them.
//
// The matching line for .env.local is printed when it starts.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, '.local-db');
const PORT = 5434; // 5432 is a normal Postgres, 5433 is another local project on this machine
const DB_NAME = 'windsor_beauty';

const pg = new EmbeddedPostgres({
  databaseDir: DATA,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
});

if (!existsSync(DATA)) {
  console.log('First run: creating the local database...');
  await pg.initialise();
}
await pg.start();

// Created explicitly as UTF-8. On Windows the cluster inherits WIN1252, which cannot store
// every character a product description or customer name might contain.
const client = pg.getPgClient();
await client.connect();
try {
  const found = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (found.rowCount === 0) {
    await client.query(
      `CREATE DATABASE ${DB_NAME} WITH ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`
    );
    console.log(`Created the "${DB_NAME}" database.`);
  }
} finally {
  await client.end();
}

console.log(`Windsor Beauty local database is running on port ${PORT}.`);
console.log(`DATABASE_URL=postgres://postgres:postgres@localhost:${PORT}/${DB_NAME}`);
console.log('Leave this window open while you work. Ctrl+C stops it.');

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
