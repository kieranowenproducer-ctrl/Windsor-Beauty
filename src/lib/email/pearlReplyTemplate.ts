import { emailGreetingName } from './greeting';
// The staff-written PEARL email used from Website Enquiries. It stays plain
// text in the editor so every word remains easy to change, and the two marker
// lines tell the email renderer which copy belongs in the gold box.
//
// THE WORDING IS NOW EDITABLE WITHOUT A DEVELOPER (task 3a5298f5). The letter
// below is only the built-in default. Kieran edits the live one at
// /admin/pearl-email, it is stored in site_content under 'pearl-email', and
// buildPearlReplyTemplate uses it when one has been saved. Nothing changes for
// a customer until he saves an edit.
//
// {{NAME}} is where the customer's first name goes. The PEARL RESPONSE START and
// END lines are where their answer goes. Everything else is his to write.

export const PEARL_REPLY_START = 'PEARL RESPONSE START';
export const PEARL_REPLY_END = 'PEARL RESPONSE END';
export const PEARL_TITLE_PLACEHOLDER = '[Add the compound or question title]';
export const PEARL_ANSWER_PLACEHOLDER = '[Paste PEARL’s source-listed answer here]';

/** Where the customer's name is dropped into a saved letter. */
export const PEARL_NAME_TOKEN = '{{NAME}}';

export interface ParsedPearlReply {
  before: string;
  pearl: string;
  after: string;
}

export function buildPearlReplyTemplate(
  customerName: string,
  pearlTitle = PEARL_TITLE_PLACEHOLDER,
  pearlAnswer = PEARL_ANSWER_PLACEHOLDER,
  /** The saved letter from /admin/pearl-email. Omitted or empty = the default below. */
  savedLetter?: string | null,
): string {
  // {{NAME}} has always been documented as the first name, and used to be the whole one.
  const name = emailGreetingName(customerName) || 'there';
  const title = pearlTitle.trim() || PEARL_TITLE_PLACEHOLDER;
  const answer = pearlAnswer.trim() || PEARL_ANSWER_PLACEHOLDER;

  const letter = savedLetter?.trim();
  if (letter) {
    // A saved letter is used as written, with only the name and the answer
    // dropped in. If somebody has deleted the markers, the answer is appended
    // rather than lost, and the send is refused by pearlReplyValidationError.
    const withName = letter.split(PEARL_NAME_TOKEN).join(name);
    const start = withName.indexOf(PEARL_REPLY_START);
    const end = withName.indexOf(PEARL_REPLY_END);
    if (start < 0 || end < 0 || end <= start) {
      return `${withName}

${PEARL_REPLY_START}
${title}

${answer}
${PEARL_REPLY_END}`;
    }
    return (
      withName.slice(0, start + PEARL_REPLY_START.length) +
      `
${title}

${answer}
` +
      withName.slice(end)
    );
  }

  return DEFAULT_PEARL_LETTER(name, title, answer);
}

/** Today's wording, kept as the fallback and as the "reset" on the edit screen. */
export function defaultPearlLetter(): string {
  return DEFAULT_PEARL_LETTER(PEARL_NAME_TOKEN, PEARL_TITLE_PLACEHOLDER, PEARL_ANSWER_PLACEHOLDER);
}

function DEFAULT_PEARL_LETTER(name: string, pearlTitle: string, pearlAnswer: string): string {
  return `Hi ${name},

Welcome to Windsor Glow ✨

Thank you for getting in touch with Windsor Glow. It’s lovely to hear from you.

Feel free to explore our range and discover what Windsor Glow is all about, along with exclusive offers, special discounts and updates available to our community.

${PEARL_REPLY_START}
${pearlTitle}

${pearlAnswer}

These figures come from PEARL’s approved research sources. They are not a personal recommendation, prescription or medical advice.
${PEARL_REPLY_END}

PEARL will soon be available on the Windsor Glow website as an exclusive member feature, giving you direct access to explore source-listed information and support your peptide research.

I hope that helps. If you have any other questions, please don’t hesitate to get in touch. We’re always happy to help.

Thank you again for discovering Windsor Glow, and we hope you enjoy being part of our growing community.

Warm regards,
Team WG`;
}

export function parsePearlReply(message: string): ParsedPearlReply | null {
  const start = message.indexOf(PEARL_REPLY_START);
  const end = message.indexOf(PEARL_REPLY_END);
  if (start < 0 || end < 0 || end <= start) return null;
  if (message.indexOf(PEARL_REPLY_START, start + PEARL_REPLY_START.length) >= 0) return null;
  if (message.indexOf(PEARL_REPLY_END, end + PEARL_REPLY_END.length) >= 0) return null;

  return {
    before: message.slice(0, start).trim(),
    pearl: message.slice(start + PEARL_REPLY_START.length, end).trim(),
    after: message.slice(end + PEARL_REPLY_END.length).trim(),
  };
}

export function pearlReplyValidationError(message: string): string | null {
  const parsed = parsePearlReply(message);
  if (!parsed) return 'Keep the PEARL RESPONSE START and PEARL RESPONSE END lines in the template.';
  if (!parsed.before || !parsed.pearl || !parsed.after) return 'Complete every part of the PEARL email before sending.';
  if (parsed.pearl.includes(PEARL_TITLE_PLACEHOLDER) || parsed.pearl.includes(PEARL_ANSWER_PLACEHOLDER)) {
    return 'Replace both PEARL template instructions with the checked title and answer before sending.';
  }
  return null;
}

export function pearlReplyPlainText(parsed: ParsedPearlReply): string {
  return `${parsed.before}\n\nPEARL\nPeptide Experimental Analysis Research Library\n\n${parsed.pearl}\n\n${parsed.after}`;
}
