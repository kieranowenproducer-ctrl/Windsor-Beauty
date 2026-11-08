import { beautyOperationalAddress } from '@/lib/operationalAddress';
import { BEAUTY_CONTACT_EMAIL } from './contactAddress';

// Suite is the public, monitored reply path. An explicit approved override wins.
export const SUPPORT_REPLY_TO = beautyOperationalAddress(process.env.SUPPORT_REPLY_TO) || BEAUTY_CONTACT_EMAIL;

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
