import { NextResponse } from 'next/server';
import { getSiteContent, isDbConfigured } from '@/lib/db';
import { DEFAULT_STORAGE_INSTRUCTIONS_HTML } from '@/data/products';

export const dynamic = 'force-dynamic';

export interface StorageDefaults {
  enabled: boolean;
  content: string;
  /** 'html' = render content as-is. 'markdown' = lite-markdown source text, render via markdownLiteToHtml() first. */
  format: 'html' | 'markdown';
}

// Public endpoint — the storefront calls this to load the site-wide default
// "Storage Instructions" content (admin-edited via /admin/content). Falls
// back to the built-in default text when no override has been saved yet, or
// when no database is configured (e.g. local dev).
export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json<StorageDefaults>({ enabled: true, content: DEFAULT_STORAGE_INSTRUCTIONS_HTML, format: 'html' });
  }

  try {
    const row = await getSiteContent('storage-instructions-default');
    if (!row?.body) {
      return NextResponse.json<StorageDefaults>({ enabled: true, content: DEFAULT_STORAGE_INSTRUCTIONS_HTML, format: 'html' });
    }
    const parsed = JSON.parse(row.body);
    const enabled = parsed?.enabled !== false;
    const hasSavedContent = typeof parsed?.content === 'string' && parsed.content;
    const content = hasSavedContent ? parsed.content : DEFAULT_STORAGE_INSTRUCTIONS_HTML;
    // Force 'html' when falling back to the built-in default — it's always
    // real HTML, regardless of what format the (missing/empty) saved content claimed.
    const format: StorageDefaults['format'] = hasSavedContent && parsed?.format === 'markdown' ? 'markdown' : 'html';
    return NextResponse.json<StorageDefaults>({ enabled, content, format });
  } catch {
    return NextResponse.json<StorageDefaults>({ enabled: true, content: DEFAULT_STORAGE_INSTRUCTIONS_HTML, format: 'html' });
  }
}
