// Shared by the affiliate's dashboard and the staff affiliate page, so both describe an invitation the same way.
// Safe to import from the browser: no database, no secrets.

export const INVITATION_STATE_LABEL: Record<string, string> = {
  joined: 'Joined',
  delivered: 'Email arrived',
  sent: 'Email sent',
  sending: 'Sending',
  email_failed: 'Email did not arrive',
  link_only: 'Link only, no email',
  replaced: 'Replaced by a newer link',
  expired: 'Link expired',
};

export const INVITATION_STATE_TONE: Record<string, string> = {
  joined: 'bg-green-50 text-green-800',
  delivered: 'bg-gold-50 text-gold-800',
  sent: 'bg-gold-50 text-gold-800',
  sending: 'bg-stone-100 text-stone-700',
  email_failed: 'bg-amber-50 text-amber-900',
  link_only: 'bg-stone-100 text-stone-700',
  replaced: 'bg-stone-100 text-stone-500',
  expired: 'bg-stone-100 text-stone-500',
};

/** States where sending a fresh link makes sense: not joined, and the current link may not have reached them. */
export const INVITATION_CAN_RESEND = new Set(['email_failed', 'expired', 'sent', 'delivered', 'link_only', 'sending']);

/**
 * WhatsApp's own share link. It opens WhatsApp on the phone with the message typed in and lets the affiliate
 * pick the person, so it is sent from their own number.
 */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

/** Opens the phone's text-message app with the message typed in. The `?&body=` form works on iPhone and Android. */
export function smsShareUrl(message: string): string {
  return `sms:?&body=${encodeURIComponent(message)}`;
}
