import { NextResponse } from 'next/server';
import { createAdminNavLink, isDbConfigured, listAdminNavLinks } from '@/lib/db';

export const dynamic = 'force-dynamic';

function isValidHref(href: string): boolean {
  return href.startsWith('/') || /^https?:\/\/.+/.test(href);
}

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ links: [] });
  }
  try {
    const links = await listAdminNavLinks();
    return NextResponse.json({ links });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load nav links.' },
      { status: 500 }
    );
  }
}

// Body: { label: string, href: string }
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const label = typeof body?.label === 'string' ? body.label.trim() : '';
  const href = typeof body?.href === 'string' ? body.href.trim() : '';
  if (!label || !href || label.length > 60) {
    return NextResponse.json({ error: 'Provide a label (max 60 chars) and a link.' }, { status: 400 });
  }
  if (!isValidHref(href)) {
    return NextResponse.json({ error: 'Link must start with / (an internal page) or http(s):// (an external site).' }, { status: 400 });
  }

  try {
    const link = await createAdminNavLink(label, href);
    return NextResponse.json({ success: true, link });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create nav link.' },
      { status: 500 }
    );
  }
}
