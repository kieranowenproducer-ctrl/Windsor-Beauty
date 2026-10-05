import { NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/lib/replyCapture';
import { updateCustomerEmailDelivery } from '@/lib/db/customerEmails';
import { markInvitationEmailFailedByProvider } from '@/lib/affiliates';
import { beautySentSource, recordVerifiedBeautySmtpMetadata } from '@/lib/db/beautyEmailThreads';
import { getEnquiryReplyArchiveAddress } from '@/lib/email/enquiryReplyDelivery';
import { bareEmail, retrieveBeautySentMetadata } from '@/lib/email/beautySentMetadata';
import { normaliseMessageId } from '@/lib/email/threadReferences';
import type { ParsedResendOutboundWebhook } from '@/lib/email/resendMetadataContract';

export const dynamic = 'force-dynamic';

const TRACKED = new Set([
  'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced',
  'email.failed', 'email.complained', 'email.suppressed', 'email.opened', 'email.clicked',
]);

export async function POST(request: Request) {
  const payload = await request.text();
  const secrets = [
    {secret:process.env.RESEND_OUTBOUND_WEBHOOK_SECRET_BEAUTY_IS, dedicated:true},
    {secret:process.env.RESEND_OUTBOUND_WEBHOOK_SECRET,dedicated:false},
    {secret:process.env.RESEND_OUTBOUND_WEBHOOK_SECRET_PAYPAL,dedicated:false},
  ].filter(value=>Boolean(value.secret));
  if(secrets[0]?.dedicated && secrets.slice(1).some(value=>value.secret===secrets[0].secret))return NextResponse.json({error:'Dedicated Beauty callback signing identity is not isolated.'},{status:503});
  if (!secrets.length) {
    return NextResponse.json({ error: 'Outbound email tracking is not configured.' }, { status: 503 });
  }

  const signature = {
    id: request.headers.get('svix-id') ?? '',
    timestamp: request.headers.get('svix-timestamp') ?? '',
    signatureHeader: request.headers.get('svix-signature') ?? '',
    payload,
  };
  const verified=secrets.find(value=>verifyWebhookSignature({secret:value.secret!,...signature}));
  if (!verified) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  let event: ParsedResendOutboundWebhook;
  try { event = JSON.parse(payload); }
  catch { return NextResponse.json({ error: 'Not JSON.' }, { status: 400 }); }

  if (!event.type || !TRACKED.has(event.type) || !event.data?.email_id) {
    return NextResponse.json({ ignored: true });
  }
  const from=typeof event.data.from==='string'?bareEmail(event.data.from):'';
  if(from && !from.endsWith('@windsorbeauty.is')&&!from.endsWith('@windsorbeauty.co.uk'))return NextResponse.json({ignored:true,reason:'other_business'});
  const signedTo=Array.isArray(event.data.to)&&event.data.to.length===1&&typeof event.data.to[0]==='string'?bareEmail(event.data.to[0]):null;
  const configuredArchive=getEnquiryReplyArchiveAddress();
  const isArchive=signedTo!==null&&(/^(?:info|sales|accounts|orders|beautiful)@windsorbeauty\.(?:is|co\.uk)$/.test(signedTo)||(configuredArchive!==null&&signedTo===bareEmail(configuredArchive)));
  // Legacy signed archive events cannot substitute for customer delivery.
  if(isArchive&&!verified.dedicated)return NextResponse.json({error:'Dedicated archive ownership proof is required.'},{status:503});
  if(verified.dedicated){
    if(!from.endsWith('@windsorbeauty.is'))return NextResponse.json({error:'Beauty .is sender metadata missing.'},{status:503});
    if(isArchive)try{
      const source=await beautySentSource(event.data.email_id);
      const fetched=await retrieveBeautySentMetadata(event.data.email_id);
      const archive=source?getEnquiryReplyArchiveAddress(source.customer):null;
      if(!source||!fetched||!archive||bareEmail(archive)!==signedTo||!fetched.bcc.includes(signedTo!)||fetched.customerTo!==source.customer||fetched.from!==source.from||
        (event.data.message_id!==undefined&&normaliseMessageId(event.data.message_id)!==normaliseMessageId(fetched.messageId))||
        (event.data.from!==undefined&&(typeof event.data.from!=='string'||bareEmail(event.data.from)!==fetched.from))||
        (event.data.reply_to!==undefined&&(!Array.isArray(event.data.reply_to)||event.data.reply_to.length!==1||typeof event.data.reply_to[0]!=='string'||bareEmail(event.data.reply_to[0])!==fetched.replyTo)))throw new Error('Beauty archive ownership is not proved.');
      await recordVerifiedBeautySmtpMetadata({providerId:event.data.email_id,...fetched});
      return NextResponse.json({ok:true,ignoredArchiveCopy:true});
    }catch{return NextResponse.json({error:'Exact Beauty archive metadata needs reconciliation.'},{status:503});}
    if(['info','sales','accounts'].some(local=>from===`${local}@windsorbeauty.is`))try{
      if(event.data.reply_to && event.data.reply_to.length>1)throw new Error('Ambiguous Beauty Reply-To.');
      const to=event.data.to;
      const metadata=event.data.message_id && Array.isArray(to)&&to.length===1 && Array.isArray(event.data.reply_to)&&event.data.reply_to.length===1
        ? {messageId:event.data.message_id,from,customerTo:bareEmail(to[0]),replyTo:bareEmail(event.data.reply_to![0])}
        : await retrieveBeautySentMetadata(event.data.email_id);
      if(!metadata)return NextResponse.json({error:'Exact Beauty SMTP metadata is pending.'},{status:503});
      if(event.data.message_id && normaliseMessageId(event.data.message_id)!==normaliseMessageId(metadata.messageId))throw new Error('Provider SMTP identity mismatch.');
      if(metadata.from!==from)throw new Error('Provider sender mismatch.');
      if(!['info','sales','accounts','orders','beautiful'].some(local=>metadata.replyTo===`${local}@windsorbeauty.is`))throw new Error('Provider Reply-To is not an approved Beauty public mailbox.');
      if(Array.isArray(to) && (to.length!==1 || bareEmail(to[0])!==metadata.customerTo))throw new Error('Provider recipient mismatch.');
      if(event.data.reply_to?.length===1 && bareEmail(event.data.reply_to[0])!==metadata.replyTo)throw new Error('Provider Reply-To mismatch.');
      await recordVerifiedBeautySmtpMetadata({providerId:event.data.email_id,...metadata});
    }catch{return NextResponse.json({error:'Beauty thread metadata could not be verified or saved. Retry required.'},{status:503});}
  }
  const status = event.type.replace('email.', '');
  const matched = await updateCustomerEmailDelivery(event.data.email_id, status, event.created_at ?? null).catch(() => false);
  // A Raf invitation that bounces shows as "email did not arrive" on his dashboard, so he knows to
  // send the link from his phone instead.
  if (['bounced', 'failed', 'complained', 'suppressed'].includes(status)) {
    await markInvitationEmailFailedByProvider(event.data.email_id).catch(() => false);
  }
  return NextResponse.json({ ok: true, matched });
}
