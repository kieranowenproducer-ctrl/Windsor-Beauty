/** Public Beauty contact chosen by Kieran on 8 November 2026.
 * Display and future correspondence only; never rewrite payment identities,
 * saved messages, customer addresses or inbound mailbox evidence. */
export const BEAUTY_CONTACT_EMAIL = 'suite@windsorbeauty.is';
export const BEAUTY_CONTACT_FROM = `Windsor Beauty <${BEAUTY_CONTACT_EMAIL}>`;
export const BEAUTY_CONTACT_LABEL = 'Customer support and orders';

/** Known old public contact defaults may still be saved in editable page copy.
 * Keep unrelated explicit addresses intact and do not mutate stored content. */
export function beautyPublicContactAddress(value: string): string {
  return /^(?:info|sales|beautiful|support)@windsorbeauty\.(?:is|co\.uk)$/i.test(value.trim())
    ? BEAUTY_CONTACT_EMAIL : value.trim();
}
