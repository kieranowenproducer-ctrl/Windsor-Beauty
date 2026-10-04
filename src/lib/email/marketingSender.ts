import { beautyOperationalAddress } from '@/lib/operationalAddress';
// Single source of truth for WHICH address a marketing email goes out from
// (task 286b1863). Every dashboard-initiated marketing send — the Email
// Marketing campaign composer, the Announcement Emails manager, and the
// Pre-Launch "Send Launch Email" button — resolves its sender through here.
//
// Why: marketing was going out from Beautiful@windsorbeauty.co.uk, the real
// customer-support inbox, so a customer replying to a broadcast landed in the
// inbox the team actually works from. Bulk sends now default to an unmonitored
// no-reply address, and the email says so in its footer. The brand address is
// still selectable per send for the times a reply IS wanted.
//
// The two options deliberately read from SEPARATE env vars. MARKETING_FROM_ADDRESS
// already existed and pointed at the brand address, so the no-reply option gets
// its own variable: if MARKETING_FROM_ADDRESS is set anywhere (including a
// hosting env this repo cannot read), it can only ever affect the optional
// brand choice, never the new default.

export type MarketingSenderKey = 'no-reply' | 'brand';

export const DEFAULT_MARKETING_SENDER: MarketingSenderKey = 'no-reply';

const NO_REPLY_FROM = beautyOperationalAddress(process.env.MARKETING_NOREPLY_FROM_ADDRESS) || 'Windsor Beauty <no-reply@windsorbeauty.is>';
const BRAND_FROM = beautyOperationalAddress(process.env.MARKETING_FROM_ADDRESS) || 'Windsor Beauty <Beautiful@windsorbeauty.is>';

// Pulls the bare address out of a "Display Name <address>" string so the UI and
// the Reply-To header can use it on its own.
function bareAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim();
}

export interface MarketingSender {
  key: MarketingSenderKey;
  /** Full value for Resend's `from` field, e.g. "Windsor Beauty <no-reply@windsorbeauty.is>". */
  from: string;
  /** Bare address, for showing the admin exactly what a recipient will see. */
  address: string;
  /**
   * Where replies go. For the no-reply option this is the no-reply address
   * itself, so a reply cannot reach the monitored support inbox. (No email
   * header can remove a client's Reply button; what a sender controls is the
   * destination, plus telling the reader not to bother.)
   */
  replyTo: string;
  /** Short label for the dashboard radio/select. */
  label: string;
  /** One-line explanation shown under the choice in the dashboard. */
  hint: string;
  /**
   * Footer line rendered inside the email itself. Null for the brand address,
   * where replies are genuinely welcome.
   */
  notice: string | null;
}

export const MARKETING_SENDERS: Record<MarketingSenderKey, MarketingSender> = {
  'no-reply': {
    key: 'no-reply',
    from: NO_REPLY_FROM,
    address: bareAddress(NO_REPLY_FROM),
    replyTo: bareAddress(NO_REPLY_FROM),
    label: 'No-reply address',
    hint: 'Recommended for marketing. Replies do not reach the support inbox, and the email tells the reader not to reply.',
    notice: 'This message was sent from an address that is not monitored, so please do not reply to it. To get in touch, visit windsorbeauty.is/contact.',
  },
  brand: {
    key: 'brand',
    from: BRAND_FROM,
    address: bareAddress(BRAND_FROM),
    replyTo: bareAddress(BRAND_FROM),
    label: 'Marketing address',
    hint: 'Replies come back to the real Windsor Beauty inbox. Use it only when you want people to answer.',
    notice: null,
  },
};

// Anything that is not exactly 'brand' resolves to the no-reply sender, so a
// missing, malformed or unrecognised value from a request body can never
// silently send a broadcast from the monitored inbox.
export function parseMarketingSenderKey(value: unknown): MarketingSenderKey {
  return value === 'brand' ? 'brand' : DEFAULT_MARKETING_SENDER;
}

export function resolveMarketingSender(value?: unknown): MarketingSender {
  return MARKETING_SENDERS[parseMarketingSenderKey(value)];
}

/** Shape handed to the dashboard so the two options are described in one place. */
export const MARKETING_SENDER_OPTIONS: { key: MarketingSenderKey; label: string; address: string; hint: string }[] =
  (['no-reply', 'brand'] as MarketingSenderKey[]).map((key) => {
    const sender = MARKETING_SENDERS[key];
    return { key, label: sender.label, address: sender.address, hint: sender.hint };
  });
