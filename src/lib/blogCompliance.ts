// Compliance guard for blog content (task 66e4a15d).
//
// Windsor Glow must not publish content that discusses checking a Certificate of
// Analysis (COA). Any post whose title or body mentions a COA is flagged in the
// admin dashboard (red) and can NEVER be set to published or scheduled — the API
// forces it back to draft. This is a hard, permanent rule, not a per-post toggle.

// Matches "certificate of analysis", the "COA" acronym (word-boundary so it does
// not catch words like "coach"/"coast"), and dotted "C.O.A." variants.
const COA_PATTERN = /certificate of analysis|\bCOA\b|\bC\.O\.A\.?/i;

export function mentionsCOA(...parts: Array<string | null | undefined>): boolean {
  return COA_PATTERN.test(parts.filter(Boolean).join('\n'));
}

export const COA_BLOCK_MESSAGE =
  'This post mentions a Certificate of Analysis (COA) and cannot be published. ' +
  'Remove the COA reference to publish it, or leave it as a draft.';
