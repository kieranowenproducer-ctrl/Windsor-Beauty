import sanitizeHtml from 'sanitize-html';

// The Windsor Beauty brand gold (Tailwind `gold-500`, tailwind.config.js) — the
// only colour the rich text editor is allowed to apply to text, per the
// "no colour picker, no random colours" requirement.
export const RICH_TEXT_GOLD = '#B8902A';

const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'h2', 'h3', 'ul', 'ol', 'li', 'span', 'mark'];

// Matches the gold colour in either form Tiptap/browsers might serialise it as.
const GOLD_STYLE_PATTERN = [/^#b8902a$/i, /^rgb\(\s*184\s*,\s*144\s*,\s*42\s*\)$/i];

// Strict allowlist sanitizer for admin-authored rich text. Only the formatting
// exposed by RichTextEditor is permitted to survive: bold/italic/underline,
// h2/h3, bullet/numbered lists, paragraphs/line breaks, and a `span` whose only
// allowed style is the exact Windsor Beauty gold text colour. Everything else
// (scripts, event handlers, arbitrary styles/classes, other tags) is stripped.
export function sanitizeRichTextHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      span: ['style'],
      // `start` lets a numbered list continue from where a previous one stopped instead of
      // silently restarting at 1. Needed by markdownLiteToHtml; without it that attribute was
      // stripped here and the numbering fix upstream would have had no visible effect.
      // Inert by construction: per the HTML spec `start` is an integer, browsers ignore any
      // non-numeric value, and it carries no scheme or script surface.
      ol: ['start'],
    },
    allowedStyles: {
      span: {
        color: GOLD_STYLE_PATTERN,
      },
    },
    allowedSchemes: [],
    disallowedTagsMode: 'discard',
  }).trim();
}

// Checks whether rich text HTML has no visible content (e.g. an empty Tiptap
// document is `<p></p>`, not an empty string) — used for "required field"
// validation in admin forms.
export function isRichTextEmpty(html: string): boolean {
  return !html.replace(/<[^>]*>/g, '').trim();
}

// Converts legacy plain-text content (paragraphs separated by a blank line,
// single newlines as soft line breaks) into the equivalent HTML so it can be
// opened in the rich text editor without changing how it currently renders.
export function plainTextToHtml(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return trimmed
    .split(/\n\s*\n/)
    .map(paragraph => `<p>${escape(paragraph.trim()).split('\n').join('<br>')}</p>`)
    .join('');
}
