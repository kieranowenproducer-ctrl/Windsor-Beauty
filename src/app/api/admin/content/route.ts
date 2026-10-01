import { NextResponse } from 'next/server';
import { getAllSiteContent, isDbConfigured, upsertSiteContent, deleteSiteContent } from '@/lib/db';
import { sanitizeRichTextHtml } from '@/lib/richText';

export const dynamic = 'force-dynamic';

const VALID_KEYS = [
  'announcement-bar', 'terms', 'privacy', 'shipping-policy', 'returns-policy', 'refund-policy', 'about', 'contact',
  'cookies', 'disclaimer', 'research-disclaimer', 'age-restriction', 'payment-policy', 'contact-policy',
  'storage-instructions-default', 'homepage-trust-badges', 'footer-content',
  // ISO datetime the coming-soon page counts down to (task 4c8541df); empty = no countdown shown.
  'launch-countdown',
  // Editable subscriber announcement email draft (task 04a236c9): JSON { subject, headline, body }.
  'subscriber-announcement',
];

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ content: [] });
  }

  try {
    const content = await getAllSiteContent();
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load site content.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key : '';
  const title = typeof body?.title === 'string' ? body.title.trim() || null : null;
  let content = typeof body?.body === 'string' ? body.body : '';
  const imageUrl = typeof body?.imageUrl === 'string' ? body.imageUrl.trim() || null : null;
  const format = body?.format === 'html' ? 'html' : body?.format === 'markdown' ? 'markdown' : 'text';

  if (!VALID_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Unknown content key.' }, { status: 400 });
  }

  // Global product-information defaults (e.g. Storage Instructions) store a
  // small JSON blob — { enabled, content, format } — rather than a single
  // HTML body, so the admin can toggle the section on/off independently of
  // its text. Stored with row-level format 'text' (like 'about'/'contact'),
  // since nothing renders this key's body directly as a page — the format
  // that actually matters lives inside the blob itself (`parsed.format`).
  // 'markdown' content is lite-markdown source text, not HTML — sanitized at
  // render time (markdownLiteToHtml escapes first), not here. Legacy/absent
  // format is real HTML, sanitized on save as before.
  if (key === 'storage-instructions-default' && content) {
    try {
      const parsed = JSON.parse(content);
      const enabled = parsed?.enabled !== false;
      const isMarkdown = parsed?.format === 'markdown';
      const rawContent = typeof parsed?.content === 'string' ? parsed.content : '';
      const sectionContent = isMarkdown ? rawContent : sanitizeRichTextHtml(rawContent);
      content = JSON.stringify({ enabled, content: sectionContent, format: isMarkdown ? 'markdown' : 'html' });
    } catch {
      return NextResponse.json({ error: 'Invalid storage instructions payload.' }, { status: 400 });
    }
  }

  // Homepage trust badges store a JSON array of { title, subtitle } — plain
  // text only (no rich text needed for these short labels). Always normalize
  // to exactly 4 entries so the homepage grid layout never breaks.
  if (key === 'homepage-trust-badges' && content) {
    try {
      const parsed = JSON.parse(content);
      if (!Array.isArray(parsed)) throw new Error('Expected an array.');
      const badges = parsed.slice(0, 4).map((entry: unknown) => {
        const badge = (entry ?? {}) as Record<string, unknown>;
        return {
          title: typeof badge.title === 'string' ? badge.title.trim().slice(0, 60) : '',
          subtitle: typeof badge.subtitle === 'string' ? badge.subtitle.trim().slice(0, 100) : '',
        };
      });
      content = JSON.stringify(badges);
    } catch {
      return NextResponse.json({ error: 'Invalid trust badges payload.' }, { status: 400 });
    }
  }

  // Footer content (description, contact emails, nav links, legal links,
  // research disclaimer, copyright/bottom-right text). Same fixed-length,
  // positionally-mapped array pattern as homepage trust badges above, so an
  // admin can edit every link's label/URL without ever ending up with a
  // missing or duplicated footer column.
  if (key === 'footer-content' && content) {
    try {
      const parsed = JSON.parse(content);
      const sanitizeLinks = (value: unknown, length: number) =>
        (Array.isArray(value) ? value.slice(0, length) : []).map((entry: unknown) => {
          const link = (entry ?? {}) as Record<string, unknown>;
          return {
            label: typeof link.label === 'string' ? link.label.trim().slice(0, 60) : '',
            href: typeof link.href === 'string' ? link.href.trim().slice(0, 200) : '',
          };
        });
      const sanitizeEmails = (value: unknown) =>
        (Array.isArray(value) ? value.slice(0, 3) : []).map((entry: unknown) => {
          const email = (entry ?? {}) as Record<string, unknown>;
          return {
            address: typeof email.address === 'string' ? email.address.trim().slice(0, 100) : '',
            label: typeof email.label === 'string' ? email.label.trim().slice(0, 60) : '',
          };
        });
      content = JSON.stringify({
        description: typeof parsed?.description === 'string' ? parsed.description.trim().slice(0, 400) : '',
        emails: sanitizeEmails(parsed?.emails),
        navLinks: sanitizeLinks(parsed?.navLinks, 7),
        legalLinks: sanitizeLinks(parsed?.legalLinks, 11),
        disclaimer: typeof parsed?.disclaimer === 'string' ? parsed.disclaimer.trim().slice(0, 600) : '',
        copyrightSuffix: typeof parsed?.copyrightSuffix === 'string' ? parsed.copyrightSuffix.trim().slice(0, 150) : '',
        bottomRightText: typeof parsed?.bottomRightText === 'string' ? parsed.bottomRightText.trim().slice(0, 150) : '',
      });
    } catch {
      return NextResponse.json({ error: 'Invalid footer content payload.' }, { status: 400 });
    }
  }

  // The About page stores a JSON blob with several rich-text fields
  // (paragraphs, value descriptions, group body) rather than a single HTML
  // string. When `parsed.format === 'markdown'` these are plain lite-markdown
  // source text (sanitized at render time via markdownLiteToHtml's escape
  // step, not here); otherwise they're real HTML, sanitized here as before
  // (defence-in-depth alongside the client-side sanitization that used to
  // run in the legacy Tiptap RichTextEditor).
  if (key === 'about' && content) {
    try {
      const parsed = JSON.parse(content);
      const isMarkdown = parsed.format === 'markdown';
      const sanitizeField = (v: unknown) => (typeof v === 'string' && !isMarkdown ? sanitizeRichTextHtml(v) : v);
      if (Array.isArray(parsed.paragraphs)) {
        parsed.paragraphs = parsed.paragraphs.map(sanitizeField);
      }
      if (Array.isArray(parsed.values)) {
        parsed.values = parsed.values.map((v: unknown) => {
          if (!v || typeof v !== 'object') return v;
          const entry = v as { desc?: unknown };
          if (typeof entry.desc !== 'string') return v;
          return { ...entry, desc: sanitizeField(entry.desc) };
        });
      }
      if (typeof parsed.groupBody === 'string') {
        parsed.groupBody = sanitizeField(parsed.groupBody);
      }
      content = JSON.stringify(parsed);
    } catch {
      // Invalid JSON — store as-is; parseAboutContent falls back to defaults.
    }
  }

  try {
    const row = await upsertSiteContent(key, title, content, imageUrl, format);
    return NextResponse.json({ success: true, content: row });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save site content.' },
      { status: 500 }
    );
  }
}

// Removes a saved override so the page reverts to its built-in default text.
export async function DELETE(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const key = typeof body?.key === 'string' ? body.key : '';

  if (!VALID_KEYS.includes(key)) {
    return NextResponse.json({ error: 'Unknown content key.' }, { status: 400 });
  }

  try {
    await deleteSiteContent(key);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to reset site content.' },
      { status: 500 }
    );
  }
}
