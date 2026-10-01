import { createHmac, timingSafeEqual } from 'crypto';

// ─── Email reply capture (task b2084076) ────────────────────────────────────
// The switch and the pure pieces of the inbound-email path. The site can only
// see a customer's email reply if the reply is addressed somewhere Resend
// receives — a capture address on a subdomain whose MX record points at
// Resend. Until REPLY_CAPTURE_ADDRESS is set (which waits on that DNS record
// and Kieran's go-ahead), outbound mail keeps today's reply-to addresses and
// nothing changes for customers.

export function getReplyCaptureAddress(): string | null {
  const value = process.env.REPLY_CAPTURE_ADDRESS?.trim();
  return value ? value : null;
}

// A WG order reference in a subject or body, e.g. "WG-GCZBKK" or
// "WG-4293UR-85A64" — context for whoever reads the stored reply.
export function findOrderRef(text: string): string | null {
  const match = text.match(/\bWG-[A-Z0-9]{4,}(?:-[A-Z0-9]+)*\b/i);
  return match ? match[0].toUpperCase() : null;
}

/**
 * Verifies a Resend webhook (svix scheme): HMAC-SHA256 of "id.timestamp.body"
 * with the base64 part of the whsec_ secret, compared against each offered
 * "v1,<base64>" signature. Pure so the scratch-DB test can prove it without a
 * server. Timestamps more than 5 minutes out are refused (replay guard).
 */
export function verifyWebhookSignature(params: {
  secret: string;
  id: string;
  timestamp: string;
  signatureHeader: string;
  payload: string;
  nowMs?: number;
}): boolean {
  const { secret, id, timestamp, signatureHeader, payload } = params;
  if (!secret || !id || !timestamp || !signatureHeader) return false;

  const tsMs = Number(timestamp) * 1000;
  if (!Number.isFinite(tsMs)) return false;
  const now = params.nowMs ?? Date.now();
  if (Math.abs(now - tsMs) > 5 * 60 * 1000) return false;

  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest();

  for (const part of signatureHeader.split(' ')) {
    const [version, sig] = part.split(',');
    if (version !== 'v1' || !sig) continue;
    let offered: Buffer;
    try {
      offered = Buffer.from(sig, 'base64');
    } catch {
      continue;
    }
    if (offered.length === expected.length && timingSafeEqual(offered, expected)) return true;
  }
  return false;
}
