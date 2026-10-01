/**
 * Automated supplier mail belongs in the mailbox, not the customer enquiry queue.
 * Keep this check on the sender domain so every Royal Mail address is covered,
 * including future subdomains and addresses we have not seen before.
 */
export function isIgnoredInboundSender(address: string): boolean {
  const domain = address.trim().toLowerCase().split('@').pop() ?? '';
  return domain === 'royalmail.com' || domain.endsWith('.royalmail.com') ||
    domain === 'royalmailgroup.com' || domain.endsWith('.royalmailgroup.com');
}

/** A forwarded first email must never be attached to an unrelated open case. */
export function isCapturedThreadReply(params: {
  captureAddress: string | undefined;
  receivedFor: string | null;
  originalRecipients: string[];
  headers?: Record<string, string>;
}): boolean {
  const capture = params.captureAddress?.trim().toLowerCase();
  if (!capture || params.receivedFor !== capture ||
      !params.originalRecipients.map(item => item.toLowerCase()).includes(capture)) return false;
  return Object.entries(params.headers ?? {}).some(([name, value]) =>
    (name.toLowerCase() === 'in-reply-to' || name.toLowerCase() === 'references') && Boolean(value.trim()));
}

/**
 * The part of an incoming reply the customer actually wrote this time.
 *
 * Mail apps append the whole earlier conversation below a line such as
 * "On 18 Sep 2026 ... wrote:". Keeping that block in the database is useful
 * as an audit trail, but showing it as the new reply makes one email look as
 * though it was sent twice. This keeps the customer's new words at the top
 * and removes common mobile signatures.
 */
export function visibleInboundEmailText(value: string): string {
  const original = String(value ?? '').replace(/\r\n?/g, '\n').trim();
  if (!original) return '';

  const lines = original.split('\n');
  const quoteStart = lines.findIndex((line, index) => {
    if (index === 0) return false;
    const trimmed = line.trim();
    if (/^>+\s*/.test(trimmed)) return true;
    if (/^On .+ wrote:$/i.test(trimmed)) return true;
    if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(trimmed)) return true;
    if (/^_{5,}$/.test(trimmed)) return true;
    return false;
  });

  const fresh = (quoteStart >= 0 ? lines.slice(0, quoteStart) : lines)
    .filter(line => !/^\s*>+\s*$/.test(line));

  while (fresh.length && !fresh[fresh.length - 1].trim()) fresh.pop();
  while (fresh.length && /^(Sent from my (?:iPhone|iPad|Android)|Get Outlook for (?:iOS|Android))\.?$/i.test(fresh[fresh.length - 1].trim())) {
    fresh.pop();
    while (fresh.length && !fresh[fresh.length - 1].trim()) fresh.pop();
  }

  return fresh.join('\n').trim() || original;
}

/**
 * A short courtesy acknowledgement needs recording, but it does not need a
 * staff member to answer it. Deliberately exact and conservative: "Thanks,
 * one more question" is not matched and still returns to the work queue.
 */
export function isSimpleAcknowledgement(value: string): boolean {
  const text = visibleInboundEmailText(value)
    .toLowerCase()
    .replace(/[.!]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text || text.includes('?')) return false;
  return /^(?:thank you|thanks|many thanks|thank you very much|thanks very much|great,? thank you|perfect,? thank you|brilliant,? thank you|ok(?:ay)?,? thank you|all good,? thank you|got it,? thank you|received,? thank you)$/.test(text);
}
