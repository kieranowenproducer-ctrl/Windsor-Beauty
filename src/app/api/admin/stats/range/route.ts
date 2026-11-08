import { NextResponse } from 'next/server';
import { isDbConfigured } from '@/lib/db/client';
import { readAdminDashboardRange } from '@/lib/db/adminDashboardStats';
import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { accountingExportRange } from '@/lib/accountingExport';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(request: Request) {
  if(!hasAdminReadAccess(request))return NextResponse.json({error:'Unauthorized'},{status:401,headers});
  let range;
  try {
    range=accountingExportRange(new URL(request.url).searchParams);
    if(!range.from||!range.to)throw new Error();
  }catch{return NextResponse.json({error:'Choose valid From and To dates.'},{status:400,headers});}
  if(!isDbConfigured())return NextResponse.json({error:'The sales database is unavailable.'},{status:503,headers});
  try{return NextResponse.json(await readAdminDashboardRange(range.from,range.to),{headers});}
  catch{return NextResponse.json({error:'Could not load the figures. Please try again.'},{status:503,headers});}
}
