import { getArchiveAddress } from './archive';

/**
 * Every enquiry reply gets a hidden copy in the IONOS mailbox unless the
 * archive is deliberately switched off. Resend remains the delivery service;
 * this copy is the human-readable mailbox record that Resend cannot create in
 * IONOS Sent Items.
 */
export function getEnquiryReplyArchiveAddress(customerAddress?: string): string | null {
  // Enquiry replies keep their own switch, which was here first and is set in
  // production. It wins for them; everything else follows EMAIL_ARCHIVE_TO.
  // The address itself now has one definition, in ./archive (task b8fc05c1).
  return getArchiveAddress(customerAddress, process.env.ENQUIRY_REPLY_ARCHIVE_TO?.trim() || undefined);
}
