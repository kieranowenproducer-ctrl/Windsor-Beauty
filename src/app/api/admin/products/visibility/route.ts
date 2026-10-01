import { NextResponse } from 'next/server';
import { getHiddenProductSlugs, setProductHidden, isDbConfigured } from '@/lib/db';

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  try {
    const hidden = await getHiddenProductSlugs();
    return NextResponse.json({ hidden });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load product visibility.' },
      { status: 500 }
    );
  }
}

// Body: { slug: string, hidden: boolean }
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.slug !== 'string' || typeof body.hidden !== 'boolean') {
    return NextResponse.json({ error: 'Provide { slug, hidden }.' }, { status: 400 });
  }

  try {
    await setProductHidden(body.slug, body.hidden);
    return NextResponse.json({ ok: true, slug: body.slug, hidden: body.hidden });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update product visibility.' },
      { status: 500 }
    );
  }
}
