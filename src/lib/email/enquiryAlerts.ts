const SALES_INBOX = 'sales@windsorglow.com';
const INFO_INBOX = 'info@windsorglow.com';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One email submission alerts both team inboxes and any named colleagues. */
export function enquiryAlertRecipients(extra = process.env.ENQUIRY_ALERT_TO): string[] {
  const addresses = [SALES_INBOX, INFO_INBOX, ...(extra ?? '').split(/[;,]/)]
    .map(item => item.trim().toLowerCase())
    .filter(item => EMAIL.test(item));
  return Array.from(new Set(addresses));
}

/** A packing or money problem needs prompt human attention, not an automatic answer. */
export function isUrgentCustomerEmail(text: string): boolean {
  return /wrong (?:item|product|order)|sent (?:me |the )?wrong|instead of|missing item|damaged item|refund|chargeback/i.test(text);
}
