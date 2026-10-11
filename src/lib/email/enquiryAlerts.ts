/** Kieran chose one staff alert to info, alongside the dashboard pop-up.
 * Legacy ENQUIRY_ALERT_TO lists must not add sales or other inbox copies. */
export function enquiryAlertRecipients(): string[] {
  return ['info@windsorbeauty.is'];
}

/** A packing or money problem needs prompt human attention, not an automatic answer. */
export function isUrgentCustomerEmail(text: string): boolean {
  return /wrong (?:item|product|order)|sent (?:me |the )?wrong|instead of|missing item|damaged item|refund|chargeback/i.test(text);
}
