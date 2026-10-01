'use client';

import { useRef, useState } from 'react';
import { markdownLiteToHtml } from '@/lib/markdownLite';
import { RICH_TEXT_GOLD } from '@/lib/richText';

interface Props {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  height?: string;
}

// Replaces the old Tiptap contentEditable editor for long-form Site Content
// fields (Terms, Privacy, Shipping Policy, etc) — see the 2026-06-21 audit.
// A native <textarea> has the browser's own battle-tested cursor/selection/
// scroll handling on every platform, including iPhone Safari, so none of the
// previous editor's focus-stealing or scroll-jump symptoms are possible here
// by construction: there's no contentEditable document model to desync from
// React state, just a plain string. Formatting is a small markdown-lite
// syntax (src/lib/markdownLite.ts) the toolbar inserts as plain text into
// the textarea — clicking a button never touches focus or selection state
// beyond restoring exactly where the admin was typing.
export default function MarkdownLiteEditor({ value, onChange, placeholder, height = '300px' }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');

  function restoreSelection(start: number, end: number) {
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, end);
    });
  }

  // Wraps the current selection with a token on each side (bold, italic,
  // underline, highlight, gold all use this — gold passes different
  // before/after tokens since {{ }} aren't symmetrical) — typed selection
  // becomes **selection**, cursor lands just after the closing token if
  // nothing was selected.
  function wrapSelection(before: string, after: string = before) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart, selectionEnd, value: text } = ta;
    const selected = text.slice(selectionStart, selectionEnd);
    const next = text.slice(0, selectionStart) + before + selected + after + text.slice(selectionEnd);
    onChange(next);
    restoreSelection(selectionStart + before.length, selectionStart + before.length + selected.length);
  }

  // Replaces any existing heading/bullet/number marker on the line the
  // cursor is in with a new one (or none) — keeps repeated clicks from
  // stacking markers like "## - text".
  function setLinePrefix(prefix: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const { selectionStart, value: text } = ta;
    const lineStart = text.lastIndexOf('\n', selectionStart - 1) + 1;
    let lineEnd = text.indexOf('\n', selectionStart);
    if (lineEnd === -1) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd);
    const stripped = line.replace(/^(#{1,3}\s+|-\s+|\d+\.\s+)/, '');
    const newLine = prefix + stripped;
    const next = text.slice(0, lineStart) + newLine + text.slice(lineEnd);
    onChange(next);
    const cursor = lineStart + newLine.length;
    restoreSelection(cursor, cursor);
  }

  const btnClass = 'min-w-[28px] h-7 px-1.5 text-[11px] flex items-center justify-center font-semibold border border-transparent text-stone-500 hover:border-stone-200 hover:bg-stone-50 transition-colors shrink-0';

  return (
    <div className="border border-stone-200 focus-within:border-gold-400 transition-colors bg-white flex flex-col" style={{ height }}>
      <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 shrink-0">
        {/* Scrolls horizontally instead of wrapping — in a narrow container
            (e.g. the About page's 3-column Values cards) a wrapping toolbar
            grows to 2-3 rows and overflows past this editor's fixed height,
            visually bleeding into whatever renders next on the page. A
            single non-wrapping row keeps this editor's total height exactly
            what `height` says, in any container width. */}
        <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 min-w-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button type="button" title="Bold" className={btnClass} onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('**')}>
            <strong>B</strong>
          </button>
          <button type="button" title="Italic" className={btnClass} onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('_')}>
            <em>I</em>
          </button>
          <button type="button" title="Underline" className={btnClass} onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('++')}>
            <span className="underline">U</span>
          </button>
          <span className="w-px h-5 bg-stone-200 mx-0.5 shrink-0" />
          {/* Heading buttons set the line's marker; gold/highlight on the same
              line afterwards (or any line, including headings) works the
              same way as in a paragraph — both wrap a token selection, and
              heading text runs through the identical inline-formatting pass
              as paragraph text, so a gold heading is just "click H2, select
              the text, click Gold". */}
          <button type="button" title="Heading 2" className={btnClass} onMouseDown={(e) => e.preventDefault()} onClick={() => setLinePrefix('## ')}>H2</button>
          <button type="button" title="Heading 3" className={btnClass} onMouseDown={(e) => e.preventDefault()} onClick={() => setLinePrefix('### ')}>H3</button>
          <span className="w-px h-5 bg-stone-200 mx-0.5 shrink-0" />
          <button type="button" title="Bullet list" className={btnClass} onMouseDown={(e) => e.preventDefault()} onClick={() => setLinePrefix('- ')}>&bull;&nbsp;List</button>
          <button type="button" title="Numbered list" className={btnClass} onMouseDown={(e) => e.preventDefault()} onClick={() => setLinePrefix('1. ')}>1.&nbsp;List</button>
          <span className="w-px h-5 bg-stone-200 mx-0.5 shrink-0" />
          <button type="button" title="Gold text (works in headings too)" className={btnClass} onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('{{', '}}')}>
            <span className="flex items-center gap-1 px-0.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full border border-gold-600" style={{ backgroundColor: RICH_TEXT_GOLD }} />
              Gold
            </span>
          </button>
          <button type="button" title="Highlight" className={btnClass} onMouseDown={(e) => e.preventDefault()} onClick={() => wrapSelection('==')}>
            <span className="flex items-center gap-1 px-0.5">
              <span className="inline-block w-2.5 h-2.5 rounded-sm border border-amber-400 bg-amber-100" />
              Mark
            </span>
          </button>
          <span className="w-px h-5 bg-stone-200 mx-0.5 shrink-0" />
          <button type="button" title="Plain text (remove heading/list marker)" className={btnClass} onMouseDown={(e) => e.preventDefault()} onClick={() => setLinePrefix('')}>Plain</button>
        </div>
        <div className="flex items-center gap-1 px-2 shrink-0">
          <button
            type="button"
            onClick={() => setTab('write')}
            className={`text-[9px] tracking-[0.15em] uppercase px-2.5 py-1.5 transition-colors ${tab === 'write' ? 'text-gold-700 font-semibold' : 'text-stone-500 hover:text-stone-600'}`}
          >
            Write
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`text-[9px] tracking-[0.15em] uppercase px-2.5 py-1.5 transition-colors ${tab === 'preview' ? 'text-gold-700 font-semibold' : 'text-stone-500 hover:text-stone-600'}`}
          >
            Preview
          </button>
        </div>
      </div>

      {tab === 'write' ? (
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? 'Start typing…'}
          className="flex-1 min-h-0 w-full resize-none px-3 py-2.5 text-sm text-stone-600 leading-relaxed focus:outline-none font-mono"
        />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5">
          {value.trim() ? (
            <div className="rich-text-content text-sm text-stone-600 leading-relaxed" dangerouslySetInnerHTML={{ __html: markdownLiteToHtml(value) }} />
          ) : (
            <p className="text-xs text-stone-300 italic">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
