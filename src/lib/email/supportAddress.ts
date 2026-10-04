import { beautyOperationalAddress } from '@/lib/operationalAddress';
// Where a customer's reply to a transactional email lands.
//
// One constant, because on 31 July 2026 this was set to sales@ in seven files at once by a
// find-and-replace, and the address was never verified. Kieran corrected it: the inbox the
// team actually works from is Beautiful@windsorbeauty.co.uk, which is what the marketing sender
// module has said all along.
//
// This is deliberately NOT the address in the website footer or on the contact page. Those
// say sales@, they are published, and customers have them; changing published contact
// details is a business decision, not a deliverability fix. This constant only decides where
// a REPLY to an automated email goes, which is a thing that had no answer at all until today.
//
// Bulk marketing does not use this. It routes replies to its own no-reply address on purpose,
// so a campaign cannot flood the support inbox. See email/marketingSender.ts.
export const SUPPORT_REPLY_TO = beautyOperationalAddress(process.env.SUPPORT_REPLY_TO) || 'info@windsorbeauty.is';

/**
 * Where the concierge sends a customer it cannot help, so a person picks it up.
 *
 * CHOSEN BY KIERAN, 3 AUGUST 2026: "I am happy with the sales@windsorbeauty.co.uk fallback." He was
 * asked because it had never been chosen. It was the last link of
 * `CONCIERGE_CASE_EMAIL || SUPPORT_REPLY_TO || 'sales@windsorbeauty.co.uk'`, which is to say it was
 * whatever fell out of two variables that are about something else.
 *
 * THE CHAIN IS THE BUG, not the address, and it is a live one rather than a tidy-up. Setting
 * SUPPORT_REPLY_TO is an ordinary thing to want to do: it decides where a customer's reply to an
 * order confirmation or a password reset lands, and its own default is Beautiful@, an address
 * customers write to. The day anyone sets it, every concierge handover silently moves to it as
 * well, and nothing would connect the two. A handover nobody reads is a customer nobody answers.
 *
 * So this is now its own address with its own name, and only CONCIERGE_CASE_EMAIL overrides it.
 * Neither variable is set in Windsor Beauty production, checked on 3 August, so this is genuinely
 * the address in use today and not a default nobody has looked at.
 */
export const CONCIERGE_HANDOVER_TO = beautyOperationalAddress(process.env.CONCIERGE_CASE_EMAIL) || 'sales@windsorbeauty.is';
