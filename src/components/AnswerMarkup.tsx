// The one place assistant answers become clickable (task fce2bed9).
//
// Both chat surfaces — the account concierge and the public floating widget —
// draw their answers through these helpers, so a link is ALWAYS gold, underlined
// and one click away, whatever shape the model wrote it in:
//
//   [label](https://...)   a properly written link, kept as written
//   [label](/delivery)     a site-relative link, same treatment
//   https://... bare       linkified automatically; our own pages get a readable
//                          name derived from the address instead of the raw URL
//
// Rendering stays REACT ELEMENTS only — no dangerouslySetInnerHTML — so no
// answer, however produced or influenced, can inject markup into the page.
// Our own pages open in the same tab; anywhere else opens a new tab with the
// safe rel attributes.

export type Inline = string | { text: string; href?: string; bold?: boolean; code?: boolean };

/** Trailing punctuation a sentence hangs on a bare URL but a browser should not follow. */
const TRAILING = /[.,;:!?'")\]]+$/;

function isInternal(href: string): boolean {
  if (href.startsWith('/')) return true;
  try {
    return new URL(href).hostname.replace(/^www\./, '') === 'windsorglow.com';
  } catch {
    return false;
  }
}

// A bare address is never shown as-is: our own pages get a name from the last
// part of the address ("/dosage-research-guide" reads "Dosage research guide"),
// other sites get their plain site name. The full address stays in the href.
function labelForBareUrl(href: string): string {
  try {
    const u = new URL(href, 'https://www.windsorglow.com');
    const host = u.hostname.replace(/^www\./, '');
    if (host !== 'windsorglow.com') return host;
    const segment = u.pathname.split('/').filter(Boolean).pop();
    if (!segment) return 'our homepage';
    const words = decodeURIComponent(segment).replace(/[-_]+/g, ' ').trim();
    return words.charAt(0).toUpperCase() + words.slice(1);
  } catch {
    return href;
  }
}

// Handles [label](url) (absolute or site-relative), **bold**, `code` and bare
// http(s) addresses. Anything else is literal text. The markdown-link branch
// comes first in the pattern so an address inside one is never linkified twice.
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern =
    /\[([^\]]+)\]\(((?:https?:\/\/|\/)[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|(https?:\/\/[^\s<>()]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      out.push({ text: m[1], href: m[2] });
    } else if (m[3]) {
      out.push({ text: m[3], bold: true });
    } else if (m[4]) {
      out.push({ text: m[4], code: true });
    } else if (m[5]) {
      const trimmed = m[5].replace(TRAILING, '');
      out.push({ text: labelForBareUrl(trimmed), href: trimmed });
      // Punctuation shaved off the address goes back into the sentence.
      if (trimmed.length < m[5].length) out.push(m[5].slice(trimmed.length));
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (typeof p === 'string') return <span key={i}>{p}</span>;
        if (p.href) {
          const external = !isInternal(p.href);
          return (
            <a
              key={i}
              href={p.href}
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              className="font-medium text-gold-700 underline underline-offset-2 decoration-gold-400 hover:decoration-gold-700"
            >
              {p.text}
            </a>
          );
        }
        if (p.bold) return <strong key={i} className="font-semibold text-stone-800">{p.text}</strong>;
        if (p.code) return <code key={i} className="font-mono text-[0.9em] bg-stone-100 px-1 py-0.5">{p.text}</code>;
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

/**
 * Paragraphs-and-bullets block renderer for the public widget's bubbles.
 * (The account concierge keeps its own block renderer with the page's type
 * scale and calls the same parseInline/Inlines above, so the LINK behaviour
 * can never differ between the two surfaces.)
 */
export function AnswerMarkup({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: Array<{ type: 'p' | 'ul'; lines: string[] }> = [];
  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === 'ul') prev.lines.push(bullet[1]);
      else blocks.push({ type: 'ul', lines: [bullet[1]] });
      continue;
    }
    if (!line.trim()) continue;
    blocks.push({ type: 'p', lines: [line.trim()] });
  }
  return (
    <div className="space-y-2">
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i} className="space-y-1 pl-4">
            {b.lines.map((l, j) => (
              <li key={j} className="list-disc marker:text-gold-700">
                <Inlines parts={parseInline(l)} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>
            <Inlines parts={parseInline(b.lines[0])} />
          </p>
        ),
      )}
    </div>
  );
}
