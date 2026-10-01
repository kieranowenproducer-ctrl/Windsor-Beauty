import { cookies } from 'next/headers';
import { CUSTOMER_SESSION_COOKIE } from '@/lib/auth';
import { findCustomerByValidSessionToken, isDbConfigured } from '@/lib/db';

/**
 * Who may see the calculator and the dosage guide (task 98b6dcc6).
 *
 * WHY THESE TWO PAGES. The calculator gives step-by-step reconstitution and draw instructions, and
 * the dosage guide has a four-step how-to half underneath its careful half. On 12 August 2026 Eli
 * Lilly sued four research-use-only peptide sellers over retatrutide, and the evidence they pointed
 * at that the research-use label was a sham was exactly this: dosing charts and injection
 * instructions sitting on a consumer-facing shop. The MHRA has separately raided three UK sites
 * over unlicensed retatrutide and named "peptides for research purposes only" as an evasion tactic
 * rather than a defence.
 *
 * NOTHING IS DELETED. A signed-in member gets both pages exactly as they were. This decides who
 * arrives at them, not what they say.
 *
 * WHY THE REAL SESSION AND NOT THE HINT. `wb_ui_session` is a non-httpOnly cookie the middleware
 * sets so the storefront can show member prices, and shopServerData is explicit that it "opens no
 * door on its own". Anyone can type it into their own browser. A door needs the httpOnly
 * `wb_customer_session` checked against the database, which is what this does, so the gate is
 * worth something.
 *
 * WHAT THIS IS NOT. A shopping account is not a researcher credential. Members are still
 * consumers, and this does not change the MHRA question, which needs proper advice. It removes the
 * instructions from the open web. That is all it claims to do.
 */

/**
 * Are these pages members-only?
 *
 * Defaults to YES. If the setting is missing, mistyped or deleted, the pages stay closed: the safe
 * direction, because the failure that matters is instructions being public, not a member being
 * asked to sign in. Set `MEMBER_ONLY_TOOLS=off` to put them back on the open web.
 */
export function memberOnlyToolsGated(): boolean {
  return (process.env.MEMBER_ONLY_TOOLS ?? 'on').trim().toLowerCase() !== 'off';
}

/** Accounts that may see them while they are gated, for checking the pages still work. */
function isTester(email: string | null | undefined): boolean {
  if (!email) return false;
  const list = (process.env.MEMBER_ONLY_TOOLS_TESTERS ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/** The signed-in member, proved against the database rather than taken from a readable cookie. */
export async function currentMember(): Promise<{ email: string; firstName: string | null } | null> {
  if (!isDbConfigured()) return null;
  try {
    const jar = await cookies();
    const token = jar.get(CUSTOMER_SESSION_COOKIE)?.value;
    if (!token) return null;
    const customer = await findCustomerByValidSessionToken(token);
    if (!customer) return null;
    return { email: customer.email, firstName: customer.first_name ?? null };
  } catch {
    // A database that cannot be reached must not become a way in.
    return null;
  }
}

/** True when this visitor may see the calculator and the dosage guide. */
export async function maySeeMemberOnlyTools(): Promise<boolean> {
  if (!memberOnlyToolsGated()) return true;

  const jar = await cookies();
  // Staff keep their own way in, so the pages can be checked without a customer account.
  // The cookie must EQUAL the real admin token, the same test proxy.ts guards /admin with.
  // Until 26 Sept 2026 this only asked whether the cookie existed, so anybody who typed a
  // `wb_admin_session` cookie of any value into their own browser got the full calculator.
  const staffToken = (process.env.ADMIN_SESSION_TOKEN ?? '').trim();
  if (staffToken && jar.get('wb_admin_session')?.value === staffToken) return true;

  const member = await currentMember();
  if (!member) return false;
  return true;
}

/** The addresses guarded by maySeeMemberOnlyTools. None at present: the calculator and dosage guide were removed from this shop. */
const MEMBER_ONLY_PATHS = new Set<string>([]);

/** Added to a guarded address in the visit log when the "For members" notice was shown instead. */
export const MEMBER_NOTICE_SUFFIX = '/members-notice';

/**
 * The address to record for one page view, saying what the visitor was actually shown.
 *
 * Samuel, 26 Sept 2026: Visitor Demand listed "Dose calculator" against a "Visitor", which reads
 * as a non-member using the calculator. What really happened is that a signed-out visitor opened
 * /calculator and got the members notice at that same address; the beacon only knows the address.
 * So a guarded page opened without a valid member session is logged as `/calculator/members-notice`
 * and named as the notice. This makes the same check the page makes (a live session in the
 * database). Staff are never logged, so the staff way in does not need repeating here.
 */
export async function visitPathAsSeen(path: string, customerToken: string | null): Promise<string> {
  const clean = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  if (!MEMBER_ONLY_PATHS.has(clean) || !memberOnlyToolsGated()) return path;
  if (customerToken && isDbConfigured()) {
    try {
      if (await findCustomerByValidSessionToken(customerToken)) return path;
    } catch {
      // The page fails closed on a database error, so it showed the notice. Record that.
    }
  }
  return `${clean}${MEMBER_NOTICE_SUFFIX}`;
}

/** True for an account on the tester list, used only to keep checking a gated page. */
export async function isMemberOnlyTester(): Promise<boolean> {
  const member = await currentMember();
  return isTester(member?.email);
}

/**
 * The page details for a gated page, so both pages say the same thing and neither is indexed.
 *
 * NOINDEX MATTERS AS MUCH AS THE GATE. A sign-in wall that search engines keep in their index is
 * the worst of both: the page still appears in results for "peptide dose calculator", and Google
 * may ask to be let in, which is a request we would have to answer.
 */
export const MEMBER_ONLY_ROBOTS = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
} as const;
