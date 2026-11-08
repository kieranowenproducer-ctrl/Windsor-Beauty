import { createHash } from 'node:crypto';
import { requireDb } from '@/lib/db/client';
export const tokenHash = (value:string) => createHash('sha256').update(value).digest('hex');
export async function passkeyRateLimit(key:string,limit=15) {
  const rows=await requireDb()`INSERT INTO admin_passkey_rate_buckets(bucket_key,attempts,reset_at)
    VALUES(${tokenHash(key)},1,now()+interval '5 minutes') ON CONFLICT(bucket_key) DO UPDATE
    SET attempts=CASE WHEN admin_passkey_rate_buckets.reset_at<=now() THEN 1 ELSE admin_passkey_rate_buckets.attempts+1 END,
        reset_at=CASE WHEN admin_passkey_rate_buckets.reset_at<=now() THEN now()+interval '5 minutes' ELSE admin_passkey_rate_buckets.reset_at END
    RETURNING attempts`;
  return Number(rows[0]?.attempts)<=limit;
}
