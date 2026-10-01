// Which Windsor Beauty address a one-to-one message from the dashboard goes out from.
//
// Task bc9b6309: Kieran wanted to click a customer's email address anywhere in the dashboard,
// type a message and choose the sender ("whether it's sales at, whether it's no reply at").
//
// This is deliberately NOT email/marketingSender.ts. That module answers a different question
// (which address a CAMPAIGN goes out from) and only offers two choices, neither of them sales@.
// It also carries a `notice` line telling the reader not to reply, which is exactly wrong on a
// message a person typed to one customer about their order.
//
// Every address here is on windsorbeauty.co.uk, which is verified with Resend. The site already
// sends live mail from no-reply@, Beautiful@, alerts@ and tasks@, so nothing new needs setting
// up to add another name on the same domain. Adding a fifth option is one entry below.

export type AdminSenderKey = 'sales' | 'info' | 'support' | 'no-reply';

export const DEFAULT_ADMIN_SENDER: AdminSenderKey = 'sales';

export interface AdminSender {
  key: AdminSenderKey;
  /** Full value for Resend's `from` field, e.g. "Windsor Beauty <sales@windsorbeauty.co.uk>". */
  from: string;
  /** Bare address, so the dashboard can show exactly what the customer will see. */
  address: string;
  /** Where a reply lands. */
  replyTo: string;
  /** Short label for the dropdown. */
  label: string;
  /** One line under the choice, in plain English. */
  hint: string;
}

// Env overrides exist so a display name or an address can be corrected in hosting without a
// deploy, which is how MARKETING_FROM_ADDRESS already works. Each option gets its own variable:
// sharing one would mean changing the sales address silently moved the no-reply address too.
const SALES_FROM = process.env.ADMIN_SALES_FROM_ADDRESS || 'Windsor Beauty <sales@windsorbeauty.co.uk>';
const INFO_FROM = process.env.ADMIN_INFO_FROM_ADDRESS || 'Windsor Beauty <info@windsorbeauty.co.uk>';
const SUPPORT_FROM = process.env.ADMIN_SUPPORT_FROM_ADDRESS || 'Windsor Beauty <Beautiful@windsorbeauty.co.uk>';
const NO_REPLY_FROM = process.env.ADMIN_NOREPLY_FROM_ADDRESS || 'Windsor Beauty <no-reply@windsorbeauty.co.uk>';

/** Pulls the bare address out of a "Display Name <address>" string. */
function bareAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim();
}

export const ADMIN_SENDERS: Record<AdminSenderKey, AdminSender> = {
  sales: {
    key: 'sales',
    from: SALES_FROM,
    address: bareAddress(SALES_FROM),
    replyTo: bareAddress(SALES_FROM),
    label: 'Sales',
    hint: 'The address published on the website. Their reply comes back to sales.',
  },
  info: {
    key: 'info',
    from: INFO_FROM,
    address: bareAddress(INFO_FROM),
    replyTo: bareAddress(INFO_FROM),
    label: 'Info',
    hint: 'A general Windsor Beauty message. Their reply comes back to info.',
  },
  support: {
    key: 'support',
    from: SUPPORT_FROM,
    address: bareAddress(SUPPORT_FROM),
    replyTo: bareAddress(SUPPORT_FROM),
    label: 'Customer care',
    hint: 'The inbox the team works from day to day. Their reply lands there.',
  },
  'no-reply': {
    key: 'no-reply',
    from: NO_REPLY_FROM,
    address: bareAddress(NO_REPLY_FROM),
    // Points at itself on purpose. No email header can hide a client's Reply button; what a
    // sender controls is where the reply goes, and it must not be an inbox nobody watches by
    // accident.
    replyTo: bareAddress(NO_REPLY_FROM),
    label: 'No reply',
    hint: 'Use when no answer is wanted. Anything they send back goes nowhere.',
  },
};

/** Everything the dashboard needs to draw the dropdown, in the order it should appear. */
export const ADMIN_SENDER_OPTIONS: AdminSender[] = [
  ADMIN_SENDERS.sales,
  ADMIN_SENDERS.info,
  ADMIN_SENDERS.support,
  ADMIN_SENDERS['no-reply'],
];

/**
 * Turns whatever arrived in the request body into a real sender.
 *
 * Unknown or missing falls back to the default rather than failing, because a message that does
 * not send is worse than a message that goes out from the ordinary address.
 */
export function resolveAdminSender(value: unknown): AdminSender {
  if (typeof value === 'string' && value in ADMIN_SENDERS) {
    return ADMIN_SENDERS[value as AdminSenderKey];
  }
  return ADMIN_SENDERS[DEFAULT_ADMIN_SENDER];
}
