/**
 * The guards that keep Pearl's search passages clean.
 *
 * Shop-talk and page furniture must never become a search passage: discount
 * codes, cart buttons, cookie banners, navigation crumbs, and markup
 * fragments that leaked out of a page's attributes. Deliberately
 * conservative — a chunk is dropped only when it clearly reads as promotion
 * or navigation rather than research prose. The full page text is stored
 * either way; this filters what is SEARCHABLE, never what is kept.
 *
 * Plain JavaScript so `npm run test:pearl-ai` can prove these rules in the
 * build. If this file weakens, the build fails.
 */

export function looksLikeJunkPassage(text) {
  const sample = String(text || '').slice(0, 800);
  if (/\b(?:use\s+)?(?:code|coupon)\s+[A-Z0-9]{4,}\b/.test(sample)) return true;
  if (/\b(?:save|get)\s+\d{1,3}\s?%|\b\d{1,3}\s?%\s+off\b/i.test(sample)) return true;
  if (/add to cart|buy now|free shipping|shop now|subscribe|newsletter|cookie (?:policy|settings|preferences)|all rights reserved/i.test(sample)) return true;
  if (/^\s*(?:back to|skip to|menu\b|table of contents)/i.test(sample)) return true;
  if (/href=|class=|svg\]|\[&/.test(sample)) return true;
  const prices = sample.match(/[$£€]\s?\d+(?:\.\d{2})?/g) || [];
  return prices.length >= 2;
}

export const JUNK_HEADINGS =
  /^(?:menu|navigation|footer|share(?: this)?|subscribe|newsletter|related (?:products|articles|posts)|you may also like)$/i;
