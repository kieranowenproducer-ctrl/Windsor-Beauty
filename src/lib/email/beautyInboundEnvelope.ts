export const BEAUTY_CAPTURE = 'windsor-beauty@ilkaik.resend.app';
const GLOW_CAPTURE = 'windsor-glow@ilkaik.resend.app';

export const BEAUTY_INBOUND_MAILBOXES = new Set([
  ...['info', 'sales', 'accounts'].flatMap(local =>
    [`${local}@windsorbeauty.is`, `${local}@windsorbeauty.co.uk`]),
  'orders@windsorbeauty.is', 'beautiful@windsorbeauty.is',
]);
// Current extra aliases are proved in the preserved Zoho alias receipts; no legacy equivalents are inferred.
const glowMailboxes = new Set([
  ...['info', 'sales', 'accounts'].flatMap(local =>
    [`${local}@windsorglow.is`, `${local}@windsorglow.com`, `${local}@windsorglow.co.uk`]),
  ...['beautiful', 'enquiries', 'social', 'wholesale', 'windsorglow.wholesalewholesale'].map(local => `${local}@windsorglow.is`),
]);

export interface BeautyInboundEnvelope {
  capture: typeof BEAUTY_CAPTURE | typeof GLOW_CAPTURE;
  originalMailbox: string | null;
}

/** Transport and original public recipient are distinct provider fields.
 * Only the observed one-capture/optional-one-known-mailbox shapes are supported. */
export function beautyInboundEnvelope(values: unknown): BeautyInboundEnvelope | null {
  if (!Array.isArray(values) || values.length < 1 || values.length > 2) return null;
  const addresses: string[] = [];
  for (const value of values) {
    if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value) || /[\s<>,;]/.test(value.trim())) return null;
    addresses.push(value.trim().toLowerCase());
  }
  if (new Set(addresses).size !== addresses.length) return null;
  const captures = addresses.filter(value => value === BEAUTY_CAPTURE || value === GLOW_CAPTURE);
  if (captures.length !== 1) return null;
  const capture = captures[0] as BeautyInboundEnvelope['capture'];
  const originalMailbox = addresses.find(value => value !== capture) ?? null;
  if (originalMailbox && !BEAUTY_INBOUND_MAILBOXES.has(originalMailbox)
    && (capture !== GLOW_CAPTURE || !glowMailboxes.has(originalMailbox))) return null;
  return { capture, originalMailbox };
}
