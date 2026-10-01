import { NextResponse } from 'next/server';
import { addReviewProductLink, isDbConfigured, listReviewProductLinks, removeReviewProductLink } from '@/lib/db';

export const dynamic = 'force-dynamic';

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function GET(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = parseId(params.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid review id.' }, { status: 400 });
  }

  try {
    const links = await listReviewProductLinks(id);
    return NextResponse.json({ links });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load product links.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = parseId(params.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid review id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!slug) {
    return NextResponse.json({ error: 'Provide a product slug.' }, { status: 400 });
  }

  try {
    const links = await addReviewProductLink(id, slug);
    return NextResponse.json({ links });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to add product link.' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const id = parseId(params.id);
  if (!id) {
    return NextResponse.json({ error: 'Invalid review id.' }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!slug) {
    return NextResponse.json({ error: 'Provide a product slug.' }, { status: 400 });
  }

  try {
    const links = await removeReviewProductLink(id, slug);
    return NextResponse.json({ links });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to remove product link.' },
      { status: 500 }
    );
  }
}
