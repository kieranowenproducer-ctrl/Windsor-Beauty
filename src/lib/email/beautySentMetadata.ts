import { normaliseMessageId } from './threadReferences';
export function bareEmail(value: string): string { return (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase(); }
/** Read only with an explicitly approved full receiving credential, never the send-only key. */
export async function retrieveBeautySentMetadata(providerId:string):Promise<{messageId:string;from:string;customerTo:string;replyTo:string;bcc:string[]}|null>{
  if(process.env.BEAUTY_ENQUIRY_SMTP_METADATA_GET_ENABLED!=='true')return null;
  const key=process.env.RESEND_INBOUND_API_KEY_BEAUTY_IS?.trim();
  if(!key)return null;
  const response=await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerId)}`,{headers:{Authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Beauty SMTP metadata is not available yet.');
  const value=await response.json();
  const messageId=normaliseMessageId(value.message_id);
  if(value.id!==providerId || !messageId || typeof value.from!=='string' || !Array.isArray(value.to) || value.to.length!==1 || typeof value.to[0]!=='string')throw new Error('Incomplete Beauty SMTP metadata.');
  const from=bareEmail(value.from);
  // Missing webhook/API fields cannot prove the absence of an SMTP header.
  if(!Array.isArray(value.reply_to)||value.reply_to.length!==1||typeof value.reply_to[0]!=='string')throw new Error('Missing or ambiguous Beauty Reply-To metadata.');
  const replyTo=bareEmail(value.reply_to[0]);
  const values=value.bcc===undefined?[]:value.bcc;
  if(!Array.isArray(values)||values.some((address:unknown)=>typeof address!=='string'||!/^\S+@[^\s@]+\.[^\s@]+$/.test(bareEmail(address))))throw new Error('Invalid Beauty BCC metadata.');
  const bcc=values.map((address:string)=>bareEmail(address));
  if(new Set(bcc).size!==bcc.length)throw new Error('Ambiguous Beauty BCC metadata.');
  return {messageId,from,customerTo:bareEmail(value.to[0]),replyTo,bcc};
}
