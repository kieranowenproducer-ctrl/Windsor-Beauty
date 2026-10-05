import { createHash } from 'crypto';
import { requireDb } from './client';
import { type EnquiryRow } from './enquiries';
import { exactBeautyThread, normaliseMessageId } from '@/lib/email/threadReferences';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PUBLIC = new Set(['info', 'sales', 'accounts'].map(local => `${local}@windsorbeauty.is`));
const REPLY_MAILBOXES = new Set([...Array.from(PUBLIC),'orders@windsorbeauty.is','beautiful@windsorbeauty.is']);
let ready = false;
async function ensure(): Promise<void> {
  if (ready) return;
  const db = requireDb();
  // New tables require an explicit reviewed migration. Runtime checks shape
  // without installing, backfilling or rewriting schema/history on callbacks.
  await db`SELECT provider_id,smtp_message_id,from_address,customer_address,public_mailbox FROM beauty_enquiry_smtp_metadata WHERE false`;
  await db`SELECT provider_id,payload_hash,sender,public_mailbox,capture_address,smtp_message_id,target_enquiry_id,recorded_enquiry_id FROM beauty_inbound_email_routes WHERE false`;
  ready = true;
}

/** The exact producer join proves the primary customer's identity. */
export async function beautySentSource(providerId: string): Promise<{from: string; customer: string} | null> {
  const rows = await requireDb()`SELECT r.from_address,e.email FROM enquiry_replies r JOIN enquiries e ON e.id=r.enquiry_id WHERE r.provider_message_id=${providerId} AND r.direction='out'`;
  if (rows.length !== 1) return null;
  const from = (rows[0].from_address.match(/<([^>]+)>/)?.[1] ?? rows[0].from_address).trim().toLowerCase();
  return PUBLIC.has(from) ? {from, customer: rows[0].email.trim().toLowerCase()} : null;
}

/** A native notification must never bypass an existing enquiry reply producer. */
export async function beautyHasEnquiryReplyProducer(providerId: string): Promise<boolean> {
  const rows = await requireDb()`SELECT EXISTS (SELECT 1 FROM enquiry_replies WHERE provider_message_id=${providerId}) AS present`;
  return rows[0]?.present !== false;
}

/** Caller supplies only signed or authenticated provider metadata. Immutable on retry. */
export async function recordVerifiedBeautySmtpMetadata(input: { providerId: string; messageId: unknown; from: string; customerTo: string; replyTo: string }): Promise<void> {
  const smtp = normaliseMessageId(input.messageId);
  if (!UUID.test(input.providerId) || !smtp || !PUBLIC.has(input.from) || !REPLY_MAILBOXES.has(input.replyTo) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.customerTo)) throw new Error('Invalid Beauty provider thread metadata.');
  const source = await beautySentSource(input.providerId);
  if (source && (source.from !== input.from || source.customer !== input.customerTo)) throw new Error('Beauty outgoing source ownership mismatch.');
  await ensure();
  const rows = await requireDb()`INSERT INTO beauty_enquiry_smtp_metadata (provider_id,smtp_message_id,from_address,customer_address,public_mailbox)
    VALUES (${input.providerId},${smtp},${input.from},${input.customerTo},${input.replyTo})
    ON CONFLICT (provider_id) DO UPDATE SET provider_id=EXCLUDED.provider_id
      WHERE beauty_enquiry_smtp_metadata.smtp_message_id=EXCLUDED.smtp_message_id
        AND beauty_enquiry_smtp_metadata.from_address=EXCLUDED.from_address
        AND beauty_enquiry_smtp_metadata.customer_address=EXCLUDED.customer_address
        AND beauty_enquiry_smtp_metadata.public_mailbox=EXCLUDED.public_mailbox
    RETURNING provider_id`;
  if (!rows.length) throw new Error('Conflicting Beauty provider metadata.');
}

/** Exact joined SMTP/provider/case owner; never use latest case by sender. */
export async function findExactBeautyEmailThread(sender: string, mailbox: string, refs: string[], directParents: string[]=refs): Promise<EnquiryRow | null> {
  if (!refs.length) return null;
  await ensure();
  const rows = await requireDb()`SELECT e.*,m.smtp_message_id,m.public_mailbox
    FROM beauty_enquiry_smtp_metadata m JOIN enquiry_replies r ON r.provider_message_id=m.provider_id
    JOIN enquiries e ON e.id=r.enquiry_id
    WHERE r.direction='out'
      AND (lower(trim(r.from_address)) = m.from_address OR lower(trim(split_part(split_part(r.from_address,'<',2),'>',1))) = m.from_address)
      AND lower(e.email)=m.customer_address
      AND m.smtp_message_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(refs)}::jsonb))
    UNION ALL
    SELECT e.*,incoming.smtp_message_id,incoming.public_mailbox
    FROM beauty_inbound_email_routes incoming JOIN enquiries e ON e.id=incoming.recorded_enquiry_id
    WHERE lower(e.email)=incoming.sender
      AND incoming.smtp_message_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(refs)}::jsonb))`;
  return exactBeautyThread(sender, mailbox, refs, rows as Array<EnquiryRow & {smtp_message_id:string;public_mailbox:string}>,directParents);
}

export function inboundRouteHash(input: unknown): string { return createHash('sha256').update(JSON.stringify(input)).digest('hex'); }

/** Pin immutable receiving provenance before customer/case writes. A crash retries safely. */
export async function claimBeautyInboundRoute(input: {providerId:string;smtpId:string;hash:string;sender:string;mailbox:string;capture:string;target:number|null}): Promise<number|null> {
  if(normaliseMessageId(input.smtpId)!==input.smtpId)throw new Error('Invalid incoming SMTP identity.');
  await ensure();
  const rows=await requireDb()`INSERT INTO beauty_inbound_email_routes (provider_id,smtp_message_id,payload_hash,sender,public_mailbox,capture_address,target_enquiry_id)
    VALUES (${input.providerId},${input.smtpId},${input.hash},${input.sender},${input.mailbox},${input.capture},${input.target})
    ON CONFLICT (provider_id) DO UPDATE SET provider_id=EXCLUDED.provider_id
      WHERE beauty_inbound_email_routes.payload_hash=EXCLUDED.payload_hash
        AND beauty_inbound_email_routes.smtp_message_id=EXCLUDED.smtp_message_id
        AND beauty_inbound_email_routes.sender=EXCLUDED.sender
        AND beauty_inbound_email_routes.public_mailbox=EXCLUDED.public_mailbox
        AND beauty_inbound_email_routes.capture_address=EXCLUDED.capture_address
        AND beauty_inbound_email_routes.target_enquiry_id IS NOT DISTINCT FROM EXCLUDED.target_enquiry_id
    RETURNING recorded_enquiry_id`;
  if(!rows.length) throw new Error('Conflicting incoming Beauty routing identity.');
  return (rows[0].recorded_enquiry_id as number|null) ?? null;
}

export async function completeBeautyInboundRoute(providerId:string,enquiryId:number):Promise<void>{
  const rows=await requireDb()`UPDATE beauty_inbound_email_routes SET recorded_enquiry_id=${enquiryId}
    WHERE provider_id=${providerId} AND (recorded_enquiry_id IS NULL OR recorded_enquiry_id=${enquiryId})
      AND (target_enquiry_id IS NULL OR target_enquiry_id=${enquiryId})
      AND EXISTS (SELECT 1 FROM enquiries e WHERE e.id=${enquiryId} AND lower(e.email)=sender)
    RETURNING provider_id`;
  if(!rows.length)throw new Error('Conflicting incoming Beauty case.');
}
