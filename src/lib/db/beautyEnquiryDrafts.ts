import { requireDb } from './client';

export type BeautyReplyDraft = {
  message: string;
  format: 'standard' | 'order';
  orderNumber: string | null;
  orderSnapshot: unknown;
};

export function parseBeautyReplyDraft(value: unknown): BeautyReplyDraft | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (typeof p.message !== 'string' || p.message.length > 10000 || !['standard', 'order'].includes(String(p.format))) return null;
  if (p.format === 'order' && (typeof p.orderNumber !== 'string' || !/^WB-[A-Z0-9-]+$/.test(p.orderNumber) || !p.orderSnapshot || typeof p.orderSnapshot !== 'object')) return null;
  if (JSON.stringify(p.orderSnapshot ?? null).length > 4000) return null;
  return { message: p.message, format: p.format as 'standard' | 'order', orderNumber: p.format === 'order' ? String(p.orderNumber) : null, orderSnapshot: p.format === 'order' ? p.orderSnapshot : null };
}

export async function readBeautyReplyDraft(id: number) {
  const rows = await requireDb()`SELECT e.id,
    COALESCE(d.revision, 0) AS revision, d.payload,
    COALESCE((SELECT max(r.id) FROM enquiry_replies r WHERE r.enquiry_id=e.id),0) AS latest_reply_id,
    d.base_reply_id, d.updated_at
    FROM enquiries e LEFT JOIN beauty_enquiry_reply_drafts d ON d.enquiry_id=e.id WHERE e.id=${id}`;
  return rows[0] ?? null;
}

// A retained empty row is a tombstone: a slow old save cannot recreate a sent draft.
// Same enquiry lock as reply recording; all supplied values remain bound parameters.
export async function saveBeautyReplyDraft(id: number, revision: number, baseReplyId: number, payload: BeautyReplyDraft | null) {
  const rows = await requireDb()`SELECT wb_save_enquiry_reply_draft(${id},${revision},${baseReplyId},${payload === null ? null : JSON.stringify(payload)}::jsonb) AS saved`;
  return rows[0]?.saved ?? null;
}

// Only clear the revision sent. A newer colleague's saved work must survive.
export async function clearSentBeautyReplyDraft(id: number, revision: number) {
  const rows = await requireDb()`UPDATE beauty_enquiry_reply_drafts SET payload=NULL,revision=revision+1,updated_at=now()
    WHERE enquiry_id=${id} AND revision=${revision} RETURNING revision`;
  return rows[0]?.revision as number | undefined;
}

export async function recordBeautyDraftReply(id: number, body: string, from: string, providerId: string, baseReplyId: number) {
  const rows=await requireDb()`SELECT wb_record_beauty_draft_reply(${id},${body},${from},${providerId},${baseReplyId}) AS reply`;
  return rows[0]?.reply ?? null;
}
