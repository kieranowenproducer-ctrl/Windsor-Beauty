import { NextResponse } from 'next/server';
import { countVerificationCodes, importVerificationCodes, isDbConfigured, listVerificationCodes, searchVerificationCode } from '@/lib/db';

export async function GET(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() ?? '';
  try {
    const [codes, counts] = await Promise.all([
      search ? searchVerificationCode(search) : listVerificationCodes(500),
      countVerificationCodes(),
    ]);
    return NextResponse.json({ codes, counts });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load codes.' },
      { status: 500 }
    );
  }
}

interface ImportEntry {
  code: string;
  productName?: string;
  batchRef?: string;
  purity?: string;
}

// { csv: "CODE,PRODUCT,BATCH,PURITY\n..." } — one code per line, comma separated
export async function POST(request: Request) {
  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured.' }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body.csv !== 'string') {
    return NextResponse.json({ error: 'Provide "csv" text.' }, { status: 400 });
  }

  const entries: ImportEntry[] = body.csv
    .split(/\r?\n/)
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0)
    .map((line: string) => {
      const [code, productName, batchRef, purity] = line.split(',').map((part) => part.trim());
      return { code, productName: productName || undefined, batchRef: batchRef || undefined, purity: purity || undefined };
    })
    .filter((e: ImportEntry) => e.code);

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No valid codes found in submission.' }, { status: 400 });
  }

  try {
    const result = await importVerificationCodes(entries);
    return NextResponse.json({ ok: true, ...result, submitted: entries.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import codes.' },
      { status: 500 }
    );
  }
}
