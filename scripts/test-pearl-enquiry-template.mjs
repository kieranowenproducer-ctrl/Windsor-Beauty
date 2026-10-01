import assert from 'node:assert/strict';
import {
  buildPearlReplyTemplate,
  parsePearlReply,
  pearlReplyPlainText,
  pearlReplyValidationError,
} from '../src/lib/email/pearlReplyTemplate.ts';

const draft = buildPearlReplyTemplate('Yvonne');
assert.match(draft, /^Hi Yvonne,/);
assert.match(draft, /exclusive member feature/);
assert.match(draft, /not a personal recommendation, prescription or medical advice/);
assert.doesNotMatch(draft, /Instagram/);
assert.match(draft, /Thank you for getting in touch with Windsor Glow/);
assert.match(pearlReplyValidationError(draft) || '', /Replace both PEARL template instructions/);

const ready = buildPearlReplyTemplate(
  'Yvonne',
  'HGH 191AA research ranges',
  'PEARL’s approved sources list a daily schedule.',
);
assert.equal(pearlReplyValidationError(ready), null);

const parsed = parsePearlReply(ready);
assert.ok(parsed);
assert.match(parsed.pearl, /^HGH 191AA research ranges/);
assert.doesNotMatch(pearlReplyPlainText(parsed), /PEARL RESPONSE START|PEARL RESPONSE END/);
assert.match(pearlReplyPlainText(parsed), /Peptide Experimental Analysis Research Library/);

assert.match(pearlReplyValidationError('ordinary reply') || '', /Keep the PEARL RESPONSE/);
console.log('PEARL enquiry email template checks passed.');
