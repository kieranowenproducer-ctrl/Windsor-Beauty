// A deliberately narrow, hand-rolled "lite markdown" used for the long-form
// Site Content policy pages (Terms, Privacy, Shipping Policy, etc). Replaces
// the previous Tiptap contentEditable editor for these fields, which had
// persistent focus/scroll/cursor reliability issues on long documents —
// see RichTextEditor.tsx's history and the 2026-06-21 audit. A plain
// <textarea> has none of contentEditable's quirks, so the admin editor for
// these fields now edits this syntax directly instead of a WYSIWYG view.
//
// Supported syntax (intentionally small — legal/policy copy needs structure,
// not rich styling):
//   blank line              → paragraph break
//   ## Heading / ### Heading → <h2> / <h3> (must be the only line in its block)
//   - item (one per line)   → bullet list
//   1. item (one per line)  → numbered list
//   **bold**                → <strong>
//   _italic_                → <em>
//   ++underline++           → <u>
//   ==highlight==           → <mark>
//   {{gold text}}           → <span style="color: gold">
//
// All five inline tokens run through the same inlineFormat() that heading
// text already passes through, so {{...}} (and any other token) works
// inside a heading exactly the same as inside a paragraph or list item —
// "gold headings" need no special-casing.
//
// Any other text is treated as plain prose.

import { RICH_TEXT_GOLD } from './richText';

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Applied only after escaping, so these patterns can only ever match the
// plain ASCII punctuation they're looking for — never re-introduce a raw
// tag from user-typed text.
function inlineFormat(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\+\+(.+?)\+\+/g, '<u>$1</u>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/\{\{(.+?)\}\}/g, `<span style="color: ${RICH_TEXT_GOLD}">$1</span>`)
    .replace(/_(.+?)_/g, '<em>$1</em>');
}

function blockToHtml(block: string): string {
  const trimmed = block.trim();

  const heading = trimmed.match(/^(#{2,3})\s+(.*)$/);
  if (heading && !trimmed.includes('\n')) {
    const tag = heading[1].length === 2 ? 'h2' : 'h3';
    return `<${tag}>${inlineFormat(heading[2].trim())}</${tag}>`;
  }

  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0 && lines.every(l => /^-\s+/.test(l))) {
    const items = lines.map(l => `<li>${inlineFormat(l.replace(/^-\s+/, ''))}</li>`).join('');
    return `<ul>${items}</ul>`;
  }

  // Numbered lines need more care than bullets, and the asymmetry is deliberate.
  //
  // "- Something" is unambiguous: nobody writes a sentence that opens with a hyphen and a
  // space, so treating it as a bullet is always right. "4. Needle Usage Disclaimer" is
  // genuinely ambiguous. It is valid ordered-list syntax AND it is how every numbered
  // section heading in a legal document is written, which is most of what this editor is
  // used for.
  //
  // The old code resolved that ambiguity the wrong way and produced a real bug on the live
  // Terms and Conditions. It matched any block of numbered lines, THREW THE AUTHOR'S NUMBER
  // AWAY (`replace(/^\d+\.\s+/, '')`) and let the browser renumber from the <ol>. Because
  // markdownLiteToHtml splits on blank lines and converts each block independently, every
  // section heading was its own one-item <ol>, and an <ol> always restarts at 1. So a
  // correctly written 1..14 rendered as fourteen 1s.
  //
  // A block of ONE numbered line is therefore treated as prose and falls through to the
  // paragraph branch below, where the number the author typed survives as literal text.
  // That also fixes loose lists (items separated by blank lines), which likewise keep their
  // own numbers instead of each restarting.
  if (lines.length > 1 && lines.every(l => /^\d+\.\s+/.test(l))) {
    const items = lines.map(l => `<li>${inlineFormat(l.replace(/^\d+\.\s+/, ''))}</li>`).join('');
    // A real multi-line list that starts at something other than 1 must say so, or it gets
    // silently renumbered the same way. NOTE: `start` only survives because it is allowlisted
    // in sanitizeRichTextHtml — RichTextContent re-sanitizes this output, and before that
    // allowlist entry existed the attribute was stripped and this fix would have done nothing.
    const first = Number(lines[0].match(/^(\d+)\./)![1]);
    return first > 1 && first < 10000
      ? `<ol start="${first}">${items}</ol>`
      : `<ol>${items}</ol>`;
  }

  return `<p>${inlineFormat(lines.join('<br>'))}</p>`;
}

// Converts lite-markdown to the same allowlisted tag set sanitizeRichTextHtml
// (src/lib/richText.ts) already permits — RichTextContent re-sanitizes
// whatever this produces as defence in depth, and it passes through
// unchanged since the tags match exactly.
export function markdownLiteToHtml(markdown: string): string {
  const escaped = escapeHtml(markdown.replace(/\r\n/g, '\n'));
  const blocks = escaped.trim().split(/\n\s*\n+/).filter(b => b.trim());
  return blocks.map(blockToHtml).join('');
}

export function isMarkdownLiteEmpty(text: string): boolean {
  return !text.trim();
}

// One-time migration helper: converts HTML previously saved by the old
// Tiptap editor (format: 'html') into editable lite-markdown text the first
// time an admin opens that field in the new editor. Browser-only (uses
// DOMParser) — this only ever runs client-side, when populating the admin
// textarea's initial draft value. The public site keeps rendering the
// original saved HTML untouched until the admin saves again through the new
// editor, so this being a one-shot best effort is safe — it never touches
// what's actually stored or publicly rendered. Round-trips bold/italic/
// underline/highlight/gold faithfully; any other colour (there shouldn't be
// one — the old editor only ever wrote the one gold value) just keeps its
// text and drops the colour, since lite-markdown can only express gold.
export function htmlToMarkdownLite(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return html.replace(/<[^>]+>/g, '').trim();
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const goldRgb = `rgb(${parseInt(RICH_TEXT_GOLD.slice(1, 3), 16)}, ${parseInt(RICH_TEXT_GOLD.slice(3, 5), 16)}, ${parseInt(RICH_TEXT_GOLD.slice(5, 7), 16)})`;

  function inline(node: Node): string {
    let out = '';
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? '';
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        const inner = inline(el);
        if (tag === 'strong' || tag === 'b') out += `**${inner}**`;
        else if (tag === 'em' || tag === 'i') out += `_${inner}_`;
        else if (tag === 'u') out += `++${inner}++`;
        else if (tag === 'mark') out += `==${inner}==`;
        else if (tag === 'span') {
          const color = el.style.color?.toLowerCase().replace(/\s+/g, ' ').trim();
          out += color === RICH_TEXT_GOLD.toLowerCase() || color === goldRgb ? `{{${inner}}}` : inner;
        }
        else if (tag === 'br') out += '\n';
        else out += inner;
      }
    });
    return out;
  }

  const blocks: string[] = [];
  doc.body.childNodes.forEach(node => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === 'h2') {
      const text = inline(el).trim();
      if (text) blocks.push(`## ${text}`);
    } else if (tag === 'h3') {
      const text = inline(el).trim();
      if (text) blocks.push(`### ${text}`);
    } else if (tag === 'ul') {
      const items = Array.from(el.querySelectorAll('li')).map(li => `- ${inline(li).trim()}`);
      if (items.length) blocks.push(items.join('\n'));
    } else if (tag === 'ol') {
      const items = Array.from(el.querySelectorAll('li')).map(li => `1. ${inline(li).trim()}`);
      if (items.length) blocks.push(items.join('\n'));
    } else if (tag === 'p') {
      const text = inline(el).trim();
      if (text) blocks.push(text);
    }
  });

  return blocks.join('\n\n');
}
