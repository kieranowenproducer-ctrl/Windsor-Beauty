// A local safety net for deciding which Concierge questions belong in PEARL.
//
// The hosted Concierge normally marks research turns itself. This second check
// lives with PEARL's real catalogue, so a missed abbreviation, spelling or new
// research record cannot strand somebody in the shop-and-orders assistant.

import { COMPOUNDS } from './research/chat-engine.mjs';
import { resolvePearlTerminology } from './research/terminology.mjs';

export const PEARL_HANDOFF_TARGET = Object.freeze({
  url: '/concierge?mode=research',
  label: 'Open PEARL',
});

const SHOP_INTENT = /\b(?:buy|basket|cart|checkout|cost|deliver(?:y|ed|ing)?|dispatch|in stock|order|price|refund|return|sell|ship(?:ping)?|stock|track)\b/i;
const RESEARCH_INTENT = /\b(?:benefit|compare|comparison|dose|dosage|evidence|effective|effectiveness|half[ -]?life|help with|how (?:does|do|long|much)|mechanism|protocol|research|risk|side effect|source|stud(?:y|ies)|what (?:does|do|is|are|helps)|who (?:does|do|is|are)|work for|works for|used for)\b/i;
const PEARL_TOPIC = /\b(?:appetite|body fat|energy|fat loss|focus|healing|hormone|inflammation|injury|longevity|metabolism|muscle|recovery|sleep|strength|tendon|weight loss)\b/i;
const CALCULATOR_INTENT = /\b(?:dosage|dose|peptide|reconstitution|syringe|u[ -]?100|v3 pen|pen clicks?|bacteriostatic water|bac water)\b.{0,40}\bcalculator\b|\bcalculator\b.{0,40}\b(?:dosage|dose|peptide|reconstitution|syringe|u[ -]?100|v3 pen|pen clicks?|bacteriostatic water|bac water)\b/i;

/**
 * True when a message should leave the practical Concierge and open PEARL.
 * Clear shop and order wording stays with Concierge. A recognised research
 * record plus a research-shaped question wins first, because CART is also the
 * real name of a compound record.
 */
export function shouldHandoffToPearl(rawMessage) {
  const message = String(rawMessage || '').trim();
  if (!message) return false;

  // Calculator help belongs to PEARL even when a customer says "how much".
  // It is an explanation of Windsor Glow's tool, not a shop, delivery or order
  // request. Ordinary price, stock and order questions still stay here.
  const resolution = resolvePearlTerminology(message, COMPOUNDS);
  const recognised = resolution.status !== 'unknown';

  if (CALCULATOR_INTENT.test(message)) return true;
  if (/\bCART\b/.test(message) && recognised && RESEARCH_INTENT.test(message)) return true;
  if (SHOP_INTENT.test(message)) return false;

  if (recognised) return true;
  return RESEARCH_INTENT.test(message) && PEARL_TOPIC.test(message);
}

/** Keep a valid service-supplied destination, otherwise use this site's PEARL. */
export function pearlHandoffTarget(rawMessage, serviceTarget) {
  if (serviceTarget?.url) return serviceTarget;
  return shouldHandoffToPearl(rawMessage) ? PEARL_HANDOFF_TARGET : null;
}
