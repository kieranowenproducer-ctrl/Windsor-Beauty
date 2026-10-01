import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireDb, isDbConfigured } from '@/lib/db/client';
import { accountingExportRange, buildAccountingCsv } from '@/lib/accountingExport';

export const dynamic = 'force-dynamic';
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' };
const paidStates = ['paid', 'awaiting_dispatch', 'processing', 'exported', 'dispatched', 'delivered'];

// The proxy protects /api/admin; keep the same gate here too. This route
// reads only order references, amounts, states and confirmation times.
export async function GET(request: Request) {
  const expected = process.env.ADMIN_SESSION_TOKEN;
  if (!expected || (await cookies()).get('wb_admin_session')?.value !== expected) {
    return NextResponse.json({ error: 'Sign in to download Accounting data.' }, { status: 401, headers: privateHeaders });
  }
  let range;
  try { range = accountingExportRange(new URL(request.url).searchParams); }
  catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Choose valid dates.' }, { status: 400, headers: privateHeaders });
  }
  if (!isDbConfigured()) return NextResponse.json({ error: 'The sales database is unavailable. Try again later.' }, { status: 503, headers: privateHeaders });
  try {
    const db = requireDb();
    const rows = await db`
      SELECT order_number, total, status, payment_confirmed_at
      FROM orders
      WHERE payment_confirmed_at IS NOT NULL
        AND (${range.from || null}::date IS NULL OR (payment_confirmed_at AT TIME ZONE 'Europe/London')::date >= ${range.from || null}::date)
        AND (${range.to || null}::date IS NULL OR (payment_confirmed_at AT TIME ZONE 'Europe/London')::date <= ${range.to || null}::date)
      ORDER BY order_number LIMIT 5001
    `;
    if (rows.length > 5000) return NextResponse.json({ error: 'Choose a shorter date range to export up to 5,000 orders.' }, { status: 400, headers: privateHeaders });
    const csv = buildAccountingCsv(rows.map(row => ({ orderNumber: row.order_number, total: Number(row.total),
      status: row.status, paymentConfirmedAt: String(row.payment_confirmed_at) })), paidStates);
    return new Response(csv, { headers: { ...privateHeaders, 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${range.filename}"` } });
  } catch {
    return NextResponse.json({ error: 'The Accounting file could not be downloaded. Please try again.' }, { status: 503, headers: privateHeaders });
  }
}
