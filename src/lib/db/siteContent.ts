import { requireDb } from './client';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── Site content (admin-editable copy) ─────────────────────────────────────

export interface SiteContentRow {
  key: string;
  title: string | null;
  body: string;
  image_url: string | null;
  // 'text' = legacy plain text (paragraphs split on render); 'html' = sanitized
  // rich text HTML saved via the old Tiptap RichTextEditor, rendered as-is;
  // 'markdown' = lite-markdown saved via MarkdownLiteEditor, converted to
  // HTML at render time via markdownLiteToHtml (src/lib/markdownLite.ts).
  format: 'text' | 'html' | 'markdown';
  updated_at: string;
}

export async function getSiteContent(key: string): Promise<SiteContentRow | null> {
  const db = requireDb();
  const rows = await db`SELECT * FROM site_content WHERE key = ${key} LIMIT 1`;
  return (rows[0] as SiteContentRow) ?? null;
}

export async function getAllSiteContent(): Promise<SiteContentRow[]> {
  const db = requireDb();
  const rows = await db`SELECT * FROM site_content ORDER BY key ASC`;
  return rows as SiteContentRow[];
}

export async function upsertSiteContent(key: string, title: string | null, body: string, imageUrl: string | null = null, format: 'text' | 'html' | 'markdown' = 'text'): Promise<SiteContentRow | null> {
  const db = requireDb();
  const rows = await db`
    INSERT INTO site_content (key, title, body, image_url, format, updated_at)
    VALUES (${key}, ${title}, ${body}, ${imageUrl}, ${format}, now())
    ON CONFLICT (key) DO UPDATE SET title = ${title}, body = ${body}, image_url = ${imageUrl}, format = ${format}, updated_at = now()
    RETURNING *
  `;
  return (rows[0] as SiteContentRow) ?? null;
}

export async function deleteSiteContent(key: string): Promise<boolean> {
  const db = requireDb();
  const rows = await db`DELETE FROM site_content WHERE key = ${key} RETURNING key`;
  return rows.length > 0;
}
