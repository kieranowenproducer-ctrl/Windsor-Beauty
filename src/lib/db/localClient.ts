// Stand-in for Neon's driver, used ONLY when the database address is on this
// computer (the test database from `npm run db:local`). It gives the rest of the
// app the three things it uses from Neon's `sql`: the tagged template, `.query`
// and `.transaction`. Rows and value types come back the same way, because both
// drivers use the same Postgres type parsing.
import type { NeonQueryFunction } from '@neondatabase/serverless';
import type { Pool, PoolClient } from 'pg';

export function isLocalDatabaseUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
  } catch {
    return false;
  }
}

interface LocalQuery extends PromiseLike<unknown[]> {
  text: string;
  values: unknown[];
  catch: Promise<unknown[]>['catch'];
  finally: Promise<unknown[]>['finally'];
}

// One pool per address for the life of the process. Dev hot-reload re-runs this
// module, so the pool is kept on globalThis or every save would open more
// connections until Postgres refuses them.
const POOLS = ((globalThis as Record<string, unknown>).__wbLocalPools ??= new Map()) as Map<string, Promise<Pool>>;

function getPool(connectionString: string): Promise<Pool> {
  let pool = POOLS.get(connectionString);
  if (!pool) {
    pool = import('pg').then((pg) => {
      const PoolCtor = pg.Pool ?? pg.default.Pool;
      return new PoolCtor({ connectionString, max: 8 });
    });
    POOLS.set(connectionString, pool);
  }
  return pool;
}

export function localSql(connectionString: string): NeonQueryFunction<false, false> {
  const make = (text: string, values: unknown[]): LocalQuery => {
    let running: Promise<unknown[]> | null = null;
    const run = () =>
      (running ??= getPool(connectionString)
        .then((pool) => pool.query(text, values))
        .then((result) => result.rows));
    return {
      text,
      values,
      then: (onOk, onErr) => run().then(onOk, onErr),
      catch: (onErr) => run().catch(onErr),
      finally: (fn) => run().finally(fn),
    };
  };

  const tag = (strings: TemplateStringsArray, ...values: unknown[]) =>
    make(
      strings.reduce((acc, part, i) => acc + part + (i < values.length ? `$${i + 1}` : ''), ''),
      values
    );

  tag.query = (text: string, values: unknown[] = []) => make(text, values);

  tag.transaction = async (queries: LocalQuery[]) => {
    const pool = await getPool(connectionString);
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      const results: unknown[][] = [];
      for (const q of queries) results.push((await client.query(q.text, q.values)).rows);
      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };

  return tag as unknown as NeonQueryFunction<false, false>;
}
