import { NextResponse } from 'next/server';
import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { isDbConfigured } from '@/lib/db/client';
import { readAdminRevenue } from '@/lib/db/adminRevenue';
import { decodeReportCursor } from '@/lib/adminReportPaging';
import { accountingExportRange } from '@/lib/accountingExport';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({error:'Unauthorized'},{status:401,headers});
  let range, cursor;
  try {
    const params = new URL(request.url).searchParams;
    range=accountingExportRange(params); cursor=decodeReportCursor(params.get('cursor'));
  } catch { return NextResponse.json({error:'Choose valid dates or refresh the report.'},{status:400,headers}); }
  if (!isDbConfigured()) return NextResponse.json({error:'The sales database is unavailable.'},{status:503,headers});
  try { return NextResponse.json(await readAdminRevenue(range,cursor),{headers}); }
  catch { return NextResponse.json({error:'Could not load revenue. Please try again.'},{status:503,headers}); }
}
