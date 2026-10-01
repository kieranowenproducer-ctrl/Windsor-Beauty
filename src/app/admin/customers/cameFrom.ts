import { referralChannel } from '@/lib/referralSources';

/**
 * Where a customer came from, read at a glance (Kieran, 6 September, extended 9 September).
 *
 * This used to live as a private function inside CustomersTable.tsx, so only the table below
 * could say it. The block ABOVE the table, the people who signed up and never clicked their
 * verification link, said nothing at all about where any of them came from, which is what task
 * c61b59f4 is about. Those are the newest sign-ups on the whole screen and the ones most worth
 * knowing the source of, so they are exactly the wrong people to leave blank.
 *
 * It is in its own file for the same reason the referral list is in its own file: two screens
 * showing the same fact about the same customer must not each carry their own idea of what that
 * fact is. Two copies of this rule is two answers waiting to disagree.
 *
 * The original reasoning, which still holds: the column used to show the QR campaign and nothing
 * else, falling back to the word "Direct". On the live shop that meant 4 of 70 customers showed a
 * real value and the other 66 all read "Direct", including the 62 who had actually told us on the
 * sign-up form. "Direct" was not merely unhelpful, it was wrong: it claims we know they came
 * direct, when what we had was their answer sitting one field away.
 *
 * Both facts are shown when both exist, because they are different things: the campaign is how
 * they arrived and is recorded by the machine, the referral is what they said. Where they
 * disagree, that is worth seeing rather than hiding.
 */

/** Only the fields this needs, so both a table row and a verification card satisfy it. */
export interface CameFromSource {
  referredBy?: string | null;
  qrCampaignName?: string | null;
  qrCampaignType?: string | null;
}

export interface CameFrom {
  main: string;
  detail: string | null;
  /** False when we genuinely do not know, so the caller can grey it rather than assert it. */
  known: boolean;
}

export function cameFrom(customer: CameFromSource): CameFrom {
  const channel = referralChannel(customer.referredBy);
  const said = (customer.referredBy ?? '').trim();
  // The follow-up answer, where they gave one: "A gym, clinic or partner: Energie Fitness".
  const extra = said.includes(':') ? said.split(':').slice(1).join(':').trim() : null;

  if (customer.qrCampaignName) {
    return {
      main: customer.qrCampaignName,
      detail: sameThing(customer.qrCampaignName, channel ?? customer.qrCampaignType),
      known: true,
    };
  }
  if (channel) return { main: channel, detail: sameThing(channel, extra), known: true };
  return { main: 'Not given', detail: null, known: false };
}

/**
 * Drop a second line that only repeats the first.
 *
 * An affiliate link is deliberately named the same as the sign-up answer it pairs with, so that
 * the two records match (see the notes on "Ross McCarthy" and "Airline crew friends and family"
 * in referralSources.ts). Matching is the point of it. But it meant somebody who arrived on the
 * link AND picked the matching answer read as "Ross McCarthy (Ross McCarthy)", which looks like a
 * mistake rather than the agreement it actually is. The pair only earns two lines when the two
 * facts differ.
 */
function sameThing(main: string, detail: string | null | undefined): string | null {
  const d = (detail ?? '').trim();
  if (!d) return null;
  return d.toLowerCase() === main.trim().toLowerCase() ? null : d;
}
