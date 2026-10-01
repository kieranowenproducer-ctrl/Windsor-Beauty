/**
 * Is this an address that only ever exists in a test?
 *
 * Written after the live admin panel spent weeks showing "11 open cases where the team was never
 * emailed" in red, every one of which was a test row written into the PRODUCTION support database
 * during build sessions on 11 July and 2 August. Not one was a customer.
 *
 * That is the worst state an alarm can be in. It was permanently on, so the day a real case fails
 * it would look exactly like the noise everyone had already learned to scroll past.
 *
 * The domains below are the ones reserved by RFC 2606 and RFC 6761 precisely so they can never
 * belong to a real person, plus the demo domains this codebase's own fixtures use. Anything that
 * matches is a fixture, not a customer, and must never raise an alarm or land in a queue a human
 * is expected to work.
 */

const RESERVED_SUFFIXES = [
  '.invalid',
  '.test',
  '.example',
  '.localhost',
  '@example.com',
  '@example.net',
  '@example.org',
  '@example.edu',
];

/** Local-part patterns the project's own fixtures use, e.g. stage4test@vat.com. */
const FIXTURE_LOCAL_PARTS = /^(test|stage\d*test|qa|fixture|dummy|sample)[-._]?/i;

export function isReservedTestAddress(email: string | null | undefined): boolean {
  if (!email) return false;
  const value = email.trim().toLowerCase();
  if (!value.includes('@')) return false;

  if (RESERVED_SUFFIXES.some(suffix => value.endsWith(suffix))) return true;

  const [localPart] = value.split('@');
  if (FIXTURE_LOCAL_PARTS.test(localPart)) return true;

  return false;
}

/**
 * SQL fragment listing the same addresses, for the queries that have to filter historic rows
 * already sitting in the database. Kept beside the function deliberately: two definitions of
 * "this is a test" that drift apart would put the noise straight back.
 */
export const TEST_ADDRESS_SQL_PATTERNS = [
  '%.invalid',
  '%.test',
  '%.example',
  '%.localhost',
  '%@example.com',
  '%@example.net',
  '%@example.org',
  '%@example.edu',
  'test@%',
  'test-%@%',
  'test.%@%',
  'test_%@%',
  'stage%test@%',
  'qa@%',
  'fixture%@%',
  'dummy%@%',
  'sample%@%',
];
