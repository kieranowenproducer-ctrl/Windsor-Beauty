import { NextResponse } from 'next/server';
import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { parseBeautyReplyDraft, readBeautyReplyDraft, saveBeautyReplyDraft } from '@/lib/db/beautyEnquiryDrafts';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store' };
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({error:'Unauthorized'}, {status:401, headers});
  const id=Number((await context.params).id);
  if (!Number.isSafeInteger(id) || id<1) return NextResponse.json({error:'Invalid enquiry.'},{status:400,headers});
  try {
    const draft=await readBeautyReplyDraft(id);
    return draft ? NextResponse.json({draft},{headers}) : NextResponse.json({error:'Enquiry not found.'},{status:404,headers});
  } catch { return NextResponse.json({error:'Saved drafts are unavailable. Keep this page open until your reply is saved.'},{status:503,headers}); }
}
export async function PUT(request: Request, context: Context) {
  if (!hasAdminReadAccess(request)) return NextResponse.json({error:'Unauthorized'}, {status:401,headers});
  if (request.headers.get('origin') !== new URL(request.url).origin) return NextResponse.json({error:'Reload this page before saving.'},{status:403,headers});
  const id=Number((await context.params).id);
  const body=await request.json().catch(()=>null);
  const payload=body?.payload===null ? null : parseBeautyReplyDraft(body?.payload);
  if (!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(body?.revision)||body.revision<0||!Number.isSafeInteger(body?.baseReplyId)||body.baseReplyId<0||(payload===null&&body?.payload!==null)) return NextResponse.json({error:'Invalid saved reply.'},{status:400,headers});
  try {
    const draft=await saveBeautyReplyDraft(id,body.revision,body.baseReplyId,payload);
    return draft ? NextResponse.json({draft},{headers}) : NextResponse.json({error:'The conversation or saved draft changed. Keep your text, reload the saved draft and check the latest messages.'},{status:409,headers});
  } catch { return NextResponse.json({error:'Your draft could not be saved. Your text is still on this page.'},{status:503,headers}); }
}
