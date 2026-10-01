const DEFAULT_ARCHIVE_ADDRESS = 'info@windsorglow.com';

/**
 * Where the hidden copy of an outgoing email goes (task b8fc05c1).
 *
 * Kieran, 9 September 2026: "Ensure all email including ones that Pearl sends
 * are BCC to info@windsorglow.com. Ensure that automatically done from now
 * onwards." Resend cannot write into the IONOS mailbox's Sent Items, so a
 * blind copy is how the team gets a readable record of everything that left.
 *
 * Returns null, meaning send no copy, in two cases:
 *   - the archive is deliberately switched off
 *   - the email is already going to the archive address, so a copy would just
 *     duplicate it in the same inbox
 *
 * Two switches, both accepting "off":
 *   EMAIL_ARCHIVE_TO          every email on the site
 *   ENQUIRY_REPLY_ARCHIVE_TO  enquiry replies only, and it wins for them
 *
 * The enquiry-only variable existed first and is still honoured exactly as it
 * was, so the one place that already had this keeps behaving identically.
 */
export function getArchiveAddress(
  recipient?: string | string[] | null,
  override?: string,
): string | null {
  const configured = (override ?? process.env.EMAIL_ARCHIVE_TO)?.trim();
  if (configured?.toLowerCase() === 'off') return null;

  const archiveAddress = configured || DEFAULT_ARCHIVE_ADDRESS;

  // A single recipient that IS the archive needs no copy. A list is left alone:
  // the other people on it still need the copy to exist.
  const only = Array.isArray(recipient)
    ? (recipient.length === 1 ? recipient[0] : null)
    : recipient;
  if (only?.trim().toLowerCase() === archiveAddress.toLowerCase()) return null;

  return archiveAddress;
}

/** Adds the archive to whatever bcc a caller already set, without losing it. */
export function withArchiveBcc(
  recipient: string | string[] | null | undefined,
  existingBcc: string | string[] | undefined,
  override?: string,
): string[] | undefined {
  const archive = getArchiveAddress(recipient, override);
  const current = existingBcc == null ? [] : (Array.isArray(existingBcc) ? existingBcc : [existingBcc]);
  const merged = [...current];
  if (archive && !merged.some(a => a.trim().toLowerCase() === archive.toLowerCase())) {
    merged.push(archive);
  }
  return merged.length ? merged : undefined;
}
