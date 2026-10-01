/**
 * The research-use line that ends every email a customer receives.
 *
 * Kieran, 10 September 2026: "Ensure every single email has a research disclaimer at the bottom.
 * I believe it's already on there, but doublecheck."
 *
 * It was on the picture and not on the words. The HTML half of every email has carried it since
 * task 8a498491, because they all render through emailDocument and its footer says it. The plain
 * text half carried it in two emails out of fifteen, and that half is not decorative: it is what a
 * screen reader reads out, what a text-only client shows, and what arrives when a mail server
 * strips the HTML. An email whose picture carries a disclaimer and whose words do not is an email
 * with no disclaimer for the person reading the words.
 *
 * So it is appended by the sender, once, the same way the hidden archive copy is. A new email
 * written next year carries it without anybody remembering to add it.
 */
export const RESEARCH_NOTICE_TEXT =
  'All products are supplied strictly for research purposes only. Not for human use.';

/** True when this wording is already somewhere in the body, in any of the forms in use. */
export function hasResearchNotice(body: string): boolean {
  return /research (?:purposes|use) only|not for human (?:use|consumption)/i.test(body);
}

/**
 * The body with the line at the end of it, or unchanged when it already says it.
 *
 * Never doubled: pearlEmailRender and the contact-form confirmation write their own, and two
 * disclaimers in one email reads as a mistake and trains people to skip both.
 */
export function withResearchNotice(body: string): string {
  const text = body ?? '';
  if (!text.trim() || hasResearchNotice(text)) return text;
  return `${text.replace(/\s+$/, '')}\n\n${RESEARCH_NOTICE_TEXT}\n`;
}
