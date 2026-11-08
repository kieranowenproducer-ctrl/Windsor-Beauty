import { createHmac, timingSafeEqual } from 'node:crypto';
import { requireDb } from './client';
import type { CustomerMergePreview } from '../customerMerge';

type StoredPreview = Omit<CustomerMergePreview, 'token'> & { fingerprint: string };
type Ticket = { keepId: number; removeId: number; fingerprint: string; expiresAt: number };
const id = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0 && Number(v) <= 2147483647;
function key() {
  const value = process.env.ADMIN_SESSION_TOKEN;
  if (!value) throw new Error('merge_unavailable');
  return value;
}
function sign(payload: string) {
  return createHmac('sha256', key()).update('beauty-customer-merge-v1:').update(payload).digest('base64url');
}
function open(token: string, keepId: number, removeId: number): Ticket {
  if (typeof token !== 'string' || token.length > 1024) throw new Error('merge_invalid');
  const [payload, mac, extra] = token.split('.');
  if (!payload || !mac || extra || !/^[\w-]+$/.test(payload) || !/^[\w-]+$/.test(mac)) throw new Error('merge_invalid');
  const expected = Buffer.from(sign(payload)); const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error('merge_invalid');
  const t: Ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!t || !id(t.keepId) || !id(t.removeId) || t.keepId !== keepId || t.removeId !== removeId
    || !/^[a-f0-9]{32}$/.test(t.fingerprint) || !Number.isSafeInteger(t.expiresAt)) throw new Error('merge_invalid');
  if (t.expiresAt < Date.now()) throw new Error('merge_stale');
  return t;
}

export async function previewBeautyCustomerMerge(keepId: number, other: string): Promise<CustomerMergePreview> {
  if (!id(keepId) || typeof other !== 'string' || !other.trim() || other.length > 254) throw new Error('merge_invalid');
  if (/^\d+$/.test(other.trim()) && !id(Number(other.trim()))) throw new Error('merge_invalid');
  const db = requireDb();
  const rows = /^\d+$/.test(other.trim())
    ? await db`SELECT id FROM customers WHERE id=${Number(other.trim())} LIMIT 2`
    : await db`SELECT id FROM customers WHERE lower(email)=lower(${other.trim()}) LIMIT 2`;
  if (rows.length !== 1 || !id(rows[0].id)) throw new Error('merge_not_found');
  const removeId = rows[0].id as number;
  if (removeId === keepId) throw new Error('merge_invalid');
  const result = await db`SELECT public.wb_customer_merge_preview(${keepId}::integer,${removeId}::integer) AS preview`;
  const stored = result[0].preview as StoredPreview;
  const payload = Buffer.from(JSON.stringify({ keepId, removeId, fingerprint: stored.fingerprint, expiresAt: Date.now() + 5 * 60_000 })).toString('base64url');
  const { fingerprint: _privateFingerprint, ...preview } = stored;
  return { ...preview, token: `${payload}.${sign(payload)}` };
}

export async function executeBeautyCustomerMerge(keepId: number, removeId: number, token: string, requestId: string) {
  if (!id(keepId) || !id(removeId) || keepId === removeId || typeof requestId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error('merge_invalid');
  const ticket = open(token, keepId, removeId);
  const db = requireDb();
  const rows = await db`SELECT public.wb_customer_merge_execute(${requestId}::uuid,${keepId}::integer,${removeId}::integer,${ticket.fingerprint}::text) AS result`;
  return rows[0].result as { keptId: number; removedId: number; replayed: boolean };
}
