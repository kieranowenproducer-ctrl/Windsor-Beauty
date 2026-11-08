import type { requireDb } from '../client';
import { customerMergeStatements } from '../customerMergeSchema.mjs';

export async function ensureCustomerMerge(db: ReturnType<typeof requireDb>) {
  for (const statement of customerMergeStatements) await db.query(statement);
}
