import { normaliseMessageId } from './threadReferences';
export function bareEmail(value: string): string { return (value.match(/<([^>]+)>/)?.[1] || value).trim().toLowerCase(); }
/** Read only with an explicitly approved full receiving credential, never the send-only key. */
export async function retrieveBeautySentEnvelope(providerId:string):Promise<{messageId:string;from:string;customerTo:string;replyTo:string|null;bcc:string[]}|null>{
  if(process.env.BEAUTY_ENQUIRY_SMTP_METADATA_GET_ENABLED!=='true')return null;
  const key=process.env.RESEND_INBOUND_API_KEY_BEAUTY_IS?.trim();
  if(!key)return null;
  const response=await fetch(`https://api.resend.com/emails/${encodeURIComponent(providerId)}`,{headers:{Authorization:`Bearer ${key}`},cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Beauty SMTP metadata is not available yet.');
  const value=await response.json();
  return parseBeautySentEnvelope(value,providerId);
}
/** Reuse one authenticated GET without weakening the single-primary envelope contract. */
export function parseBeautySentEnvelope(input:unknown,providerId:string):{messageId:string;from:string;customerTo:string;replyTo:string|null;bcc:string[]}{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Incomplete Beauty SMTP metadata.');
  const value=input as Record<string,unknown>;
  const messageId=normaliseMessageId(value.message_id);
  if(value.id!==providerId || !messageId || typeof value.from!=='string' || !Array.isArray(value.to) || value.to.length!==1 || typeof value.to[0]!=='string')throw new Error('Incomplete Beauty SMTP metadata.');
  const from=bareEmail(value.from);
  const customerTo=bareEmail(value.to[0]);
  if(!/^\S+@[^\s@]+\.[^\s@]+$/.test(from)||!/^\S+@[^\s@]+\.[^\s@]+$/.test(customerTo))throw new Error('Invalid Beauty sent envelope.');
  // An absent Reply-To is usable only for the narrowly identified Ops notification.
  const replies=value.reply_to===undefined?[]:value.reply_to;
  if(!Array.isArray(replies)||replies.length>1||replies.some((reply:unknown)=>typeof reply!=='string'||!/^\S+@[^\s@]+\.[^\s@]+$/.test(bareEmail(reply))))throw new Error('Ambiguous Beauty Reply-To metadata.');
  const replyTo=replies.length?bareEmail(replies[0]):null;
  const values=value.bcc===undefined||value.bcc===null?[]:value.bcc;
  if(!Array.isArray(values)||values.some((address:unknown)=>typeof address!=='string'||!/^\S+@[^\s@]+\.[^\s@]+$/.test(bareEmail(address))))throw new Error('Invalid Beauty BCC metadata.');
  const bcc=values.map((address:string)=>bareEmail(address));
  if(new Set(bcc).size!==bcc.length)throw new Error('Ambiguous Beauty BCC metadata.');
  return {messageId,from,customerTo,replyTo,bcc};
}
/** Enquiry threading still requires the exact public Reply-To header. */
export async function retrieveBeautySentMetadata(providerId:string):Promise<{messageId:string;from:string;customerTo:string;replyTo:string;bcc:string[]}|null>{
  const value=await retrieveBeautySentEnvelope(providerId);
  if(!value)return null;
  if(!value.replyTo)throw new Error('Missing Beauty enquiry Reply-To metadata.');
  return {...value,replyTo:value.replyTo};
}
