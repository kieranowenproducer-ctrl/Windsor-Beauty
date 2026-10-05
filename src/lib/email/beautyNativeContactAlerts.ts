import { bareEmail, parseBeautySentEnvelope } from './beautySentMetadata';
import { normaliseMessageId } from './threadReferences';
import { enquiryAlertRecipients } from './enquiryAlerts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = 'enquiries@windsorbeauty.is';
const OPS_FROM = 'alerts@windsorbeauty.is';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIX = 'Website enquiry: ';
const LABELS = ['General Enquiry', 'Order Enquiry', 'Product Information', 'Verification Issue', 'Returns and Refunds', 'Other'];
function addresses(value: unknown): string[] {
  if (!Array.isArray(value) || !value.length || value.some(v => typeof v !== 'string' || !EMAIL.test(bareEmail(v)))) throw new Error('Invalid native contact recipients.');
  const result = value.map(v => bareEmail(v as string));
  if (new Set(result).size !== result.length) throw new Error('Duplicate native contact recipients.');
  return result;
}
function nativeSubject(value: unknown): value is string {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return false;
  const label = LABELS.find(v => value.startsWith(`${PREFIX}${v}, `));
  if (!label) return false;
  const remainder = value.slice(`${PREFIX}${label}, `.length).replace(/^WB-[A-Z0-9]{4,}, /, '');
  return Boolean(remainder.trim()) && remainder.length <= 200 && !/[\r\n]/.test(value);
}
/** Leave ordinary single-customer acknowledgements on their existing delivery path. */
export function isBeautyNativeNotificationCandidate(data: Record<string, unknown>): boolean {
  if (typeof data.from !== 'string' || ![FROM,OPS_FROM].includes(bareEmail(data.from))) return false;
  const staff = new Set(enquiryAlertRecipients());
  if (typeof data.subject === 'string' && (data.subject.startsWith(PREFIX) || opsSubject(data.subject))) return true;
  if (!Array.isArray(data.to) || data.to.length !== 1 || typeof data.to[0] !== 'string' || !EMAIL.test(bareEmail(data.to[0]))) return true;
  const address=bareEmail(data.to[0]);
  return staff.has(address) || ['info', 'sales', 'accounts', 'orders', 'beautiful'].some(local => address === `${local}@windsorbeauty.is`);
}
function opsSubject(value:unknown):'incoming'|'manual'|null {
  if(typeof value!=='string'||/[\r\n]/.test(value))return null;
  const plain=value.replace(/^Urgent: /,'');
  if(plain==='New customer case in Website Enquiries')return 'manual';
  const prefix='Customer email needs attention - ';
  return plain.startsWith(prefix)&&plain.slice(prefix.length).trim()?'incoming':null;
}
function replyAddress(value:unknown):string|null {
  if(value===undefined||value===null||(Array.isArray(value)&&value.length===0))return null;
  const values=addresses(value);if(values.length!==1)throw new Error('Native notification Reply-To ambiguous.');
  return values[0];
}
type ExistingEnvelope=ReturnType<typeof parseBeautySentEnvelope>;
/** Only the three actual native producers; other single-primary Ops keeps its existing strict path. */
export async function retrieveBeautyNativeNotification(data: Record<string, unknown>): Promise<{kind:'contact'|'ops'}|{kind:'existing';envelope:ExistingEnvelope}|null> {
  if (process.env.BEAUTY_ENQUIRY_SMTP_METADATA_GET_ENABLED !== 'true') return null;
  const key = process.env.RESEND_INBOUND_API_KEY_BEAUTY_IS?.trim();
  if (!key || typeof data.email_id !== 'string' || !UUID.test(data.email_id)) return null;
  const signed=addresses(data.to),expected=enquiryAlertRecipients();
  if(signed.length>1&&signed.some(address=>!expected.includes(address)))throw new Error('Signed native staff recipients are not configured.');
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(data.email_id)}`, {headers: {Authorization: `Bearer ${key}`}, cache: 'no-store', signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Native contact envelope unavailable.');
  const value = await response.json();
  const from=typeof data.from==='string'?bareEmail(data.from):'';
  if (value.id !== data.email_id || typeof value.from !== 'string' || ![FROM,OPS_FROM].includes(from) || bareEmail(value.from)!==from) throw new Error('Native notification identity mismatch.');
  const ops=from===OPS_FROM?opsSubject(value.subject):null;
  if(from===OPS_FROM&&!ops){
    // No broadcaster exemption: only the already supported strict single-primary Ops envelope.
    if(data.subject!==undefined&&data.subject!==value.subject)throw new Error('Ops subject mismatch.');
    return {kind:'existing',envelope:parseBeautySentEnvelope(value,data.email_id)};
  }
  if(from===FROM&&!nativeSubject(value.subject))throw new Error('Native contact subject mismatch.');
  if(signed.some(address=>!expected.includes(address)))throw new Error('Signed native staff recipients are not configured.');
  const smtp = normaliseMessageId(value.message_id);
  if (!smtp || (data.message_id !== undefined && normaliseMessageId(data.message_id) !== smtp)) throw new Error('Native contact SMTP mismatch.');
  const actual = addresses(value.to);
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) throw new Error('Native contact configuration changed.');
  if (!(signed.length === 1 && actual.includes(signed[0])) && JSON.stringify([...signed].sort()) !== JSON.stringify([...actual].sort())) throw new Error('Native contact primary recipients disagree.');
  for (const kind of ['cc', 'bcc']) {
    if (value[kind] !== undefined && value[kind] !== null && (!Array.isArray(value[kind]) || value[kind].length !== 0)) throw new Error('Native contact has an unowned copy.');
    if (data[kind] !== undefined && data[kind] !== null && (!Array.isArray(data[kind]) || data[kind].length !== 0)) throw new Error('Signed native contact copy disagrees.');
  }
  const replyTo = replyAddress(value.reply_to);
  if((from===FROM||ops==='incoming')&&!replyTo)throw new Error('Native contact or incoming Reply-To missing.');
  if(ops==='manual'&&replyTo!==null)throw new Error('Manual native alert has an unexpected Reply-To.');
  if (data.reply_to !== undefined && replyAddress(data.reply_to)!==replyTo) throw new Error('Native notification Reply-To mismatch.');
  if (data.subject !== undefined && data.subject !== value.subject) throw new Error('Native contact subject mismatch.');
  return {kind:from===FROM?'contact':'ops'};
}
