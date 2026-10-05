import { bareEmail } from './beautySentMetadata';
import { normaliseMessageId } from './threadReferences';
import { enquiryAlertRecipients } from './enquiryAlerts';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FROM = 'enquiries@windsorbeauty.is';
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
export function isBeautyNativeContactAlertCandidate(data: Record<string, unknown>): boolean {
  if (typeof data.from !== 'string' || bareEmail(data.from) !== FROM) return false;
  const staff = new Set(enquiryAlertRecipients());
  if (typeof data.subject === 'string' && data.subject.startsWith(PREFIX)) return true;
  if (!Array.isArray(data.to) || data.to.length !== 1 || typeof data.to[0] !== 'string' || !EMAIL.test(bareEmail(data.to[0]))) return true;
  return staff.has(bareEmail(data.to[0])) || ['info', 'sales', 'accounts', 'orders', 'beautiful'].some(local => bareEmail(data.to[0] as string) === `${local}@windsorbeauty.is`);
}
/** Exact authenticated native notification only; never create enquiry/customer metadata. */
export async function verifyBeautyNativeContactAlert(data: Record<string, unknown>): Promise<boolean> {
  if (process.env.BEAUTY_ENQUIRY_SMTP_METADATA_GET_ENABLED !== 'true') return false;
  const key = process.env.RESEND_INBOUND_API_KEY_BEAUTY_IS?.trim();
  if (!key || typeof data.email_id !== 'string' || !UUID.test(data.email_id)) return false;
  const response = await fetch(`https://api.resend.com/emails/${encodeURIComponent(data.email_id)}`, {headers: {Authorization: `Bearer ${key}`}, cache: 'no-store', signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Native contact envelope unavailable.');
  const value = await response.json();
  if (value.id !== data.email_id || typeof value.from !== 'string' || bareEmail(value.from) !== FROM || typeof data.from !== 'string' || bareEmail(data.from) !== FROM || !nativeSubject(value.subject)) throw new Error('Native contact identity mismatch.');
  const smtp = normaliseMessageId(value.message_id);
  if (!smtp || (data.message_id !== undefined && normaliseMessageId(data.message_id) !== smtp)) throw new Error('Native contact SMTP mismatch.');
  const actual = addresses(value.to), expected = enquiryAlertRecipients(), signed = addresses(data.to);
  if (JSON.stringify([...actual].sort()) !== JSON.stringify([...expected].sort())) throw new Error('Native contact configuration changed.');
  if (!(signed.length === 1 && actual.includes(signed[0])) && JSON.stringify([...signed].sort()) !== JSON.stringify([...actual].sort())) throw new Error('Native contact primary recipients disagree.');
  for (const kind of ['cc', 'bcc']) {
    if (value[kind] !== undefined && (!Array.isArray(value[kind]) || value[kind].length !== 0)) throw new Error('Native contact has an unowned copy.');
    if (data[kind] !== undefined && (!Array.isArray(data[kind]) || data[kind].length !== 0)) throw new Error('Signed native contact copy disagrees.');
  }
  const replies = addresses(value.reply_to);
  if (replies.length !== 1) throw new Error('Native contact Reply-To ambiguous.');
  if (data.reply_to !== undefined && JSON.stringify(addresses(data.reply_to)) !== JSON.stringify(replies)) throw new Error('Native contact Reply-To mismatch.');
  if (data.subject !== undefined && data.subject !== value.subject) throw new Error('Native contact subject mismatch.');
  return true;
}
