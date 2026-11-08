// Additive migration only. Run with the project's normal database configuration
// after explicit release approval; never invokes broad historical setup/backfills.
import { requireDb } from '../src/lib/db/client.ts';
import { customerMergeStatements } from '../src/lib/db/customerMergeSchema.mjs';
if (!process.argv.includes('--run')) {
  console.log('Prepared Beauty customer merge migration. Pass --run only for the approved target.');
} else {
  const db = requireDb();
  await db.transaction(customerMergeStatements.map(statement => db.query(statement)));
  console.log(JSON.stringify({ installed: true, statements: customerMergeStatements.length, dataBackfill: false }));
}
