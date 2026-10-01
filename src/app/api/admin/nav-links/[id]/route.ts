import { NextResponse } from 'next/server';
import { deleteAdminNavLink, isDbConfigured, updateAdminNavLink } from '@/lib/db';

export const dynamic = 'force-dynamic';

function isValidHref(href: string): boolean {
  return href.startsWith('/') || /^https?:\/\/.+/.test(href);
}

// Body: { label: string, href: string }
export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid link id.' }, { status: 400 });
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
    await updateAdminNavLink(id, label, href);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update nav link.' },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'Invalid link id.' }, { status: 400 });
  }

  try {
    await deleteAdminNavLink(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete nav link.' },
      { status: 500 }
    );
  }
}
