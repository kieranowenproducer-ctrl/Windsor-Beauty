import { NextResponse } from 'next/server';
import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { isDbConfigured } from '@/lib/db/client';
import { readAdminActivity } from '@/lib/db/adminActivity';
import { decodeReportCursor } from '@/lib/adminReportPaging';
import { buildTrackingUrl } from '@/lib/royalMail';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
export async function GET(request: Request) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({error:'Unauthorized'},{status:401,headers});
  let cursor;
  try { cursor=decodeReportCursor(new URL(request.url).searchParams.get('cursor')); }
  catch { return NextResponse.json({error:'Refresh the activity list.'},{status:400,headers}); }
  if (!isDbConfigured()) return NextResponse.json({error:'The activity database is unavailable.'},{status:503,headers});
  try {
    const result=await readAdminActivity(cursor);
    return NextResponse.json({...result,events:result.events.map(event=>event.type==='order' ? {
      ...event, trackingUrl: event.trackingNumber ? (event.trackingUrl || buildTrackingUrl(event.trackingNumber)) : null,
    } : event)},{headers});
  } catch { return NextResponse.json({error:'Could not load activity. Please try again.'},{status:503,headers}); }
}
