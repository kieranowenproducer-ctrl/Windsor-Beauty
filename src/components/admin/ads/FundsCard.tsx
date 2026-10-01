'use client';

import type { AdFunds, AdRow, DailyRow } from '@/lib/ads/meta';
import { count, formatTime, londonToday, metaAccountLabel, moneyFromMinor, shiftDays } from './shared';

// The biggest card on the Ad Results page: how much money is left with Meta.
// The number is spend_cap minus amount_spent, cross-checked against Meta's own
// wording (see fetchAdFunds). Amber when the money would last under about
// seven days at the recent daily rate, red under two. The rate comes from the
// last seven days of real spend, and when there has been none the card says it
// cannot estimate rather than dividing by zero.

interface Props {
  funds: AdFunds | null | undefined;
  daily: DailyRow[];
  ads: AdRow[];
  currency: string;
  loading: boolean;
}

type Tone = 'fine' | 'amber' | 'red' | 'unknown';

const TONE_CLASSES: Record<Tone, string> = {
  fine: 'bg-green-50 text-green-700',
  amber: 'bg-yellow-50 text-yellow-700',
  red: 'bg-red-50 text-red-600',
  unknown: 'bg-stone-100 text-stone-700',
};

export function daysOfFunds(availableMinor: number, daily: DailyRow[]): { rate: number; days: number | null } {
  const today = londonToday();
  const from = shiftDays(today, -6);
  const spend7 = daily.filter((r) => r.date >= from && r.date <= today).reduce((t, r) => t + r.spendMinor, 0);
  const rate = spend7 / 7;
  return { rate, days: rate > 0 ? availableMinor / rate : null };
}

export default function FundsCard({ funds, daily, ads, currency: pageCurrency, loading }: Props) {
  const currency = funds?.currency || pageCurrency;
  const shown = funds ? (funds.availableMinor ?? funds.displayMinor) : null;
  const fundedAccounts = new Set(funds?.fundedAccountIds ?? []);
  const runningAccounts = new Set(ads.filter((ad) => ad.running).map((ad) => ad.accountId));
  const runningOnlyOnCard = runningAccounts.size > 0
    && Array.from(runningAccounts).every((accountId) => !fundedAccounts.has(accountId));

  let tone: Tone = 'unknown';
  let status = '';
  if (loading) {
    status = 'Reading the balance from Meta…';
  } else if (!funds || shown === null) {
    status = funds?.missing ?? 'The balance could not be read.';
  } else if (shown === 0) {
    tone = 'red';
    status = 'Nothing left. The ads stop until the account is topped up in Meta Ads Manager.';
  } else if (funds?.accounts && funds.accounts.length > 1
    && (funds.fundedAccountIds?.length ?? 0) < funds.accounts.length) {
    tone = 'fine';
    status = runningOnlyOnCard
      ? `The running ads are on the card-billed account. Their spend is tracked below but will not reduce this ${moneyFromMinor(shown, currency)} prepaid balance.`
      : 'This is the prepaid balance. The other account is billed to a card and is tracked separately.';
  } else {
    const { rate, days } = daysOfFunds(shown, daily);
    if (days === null) {
      tone = 'fine';
      status = 'Not enough spend in the last 7 days to estimate how long this lasts.';
    } else {
      tone = days < 2 ? 'red' : days < 7 ? 'amber' : 'fine';
      const rounded = days < 1 ? 'less than a day' : days < 2 ? 'about a day' : `about ${count(Math.round(days))} days`;
      status = `Lasts ${rounded} at the recent rate of ${moneyFromMinor(Math.round(rate), currency)} a day.`;
    }
  }

  return (
    <section
      aria-label="Available prepaid ad funds"
      data-testid="funds-card"
      data-tone={tone}
      className="bg-gold-50 border border-gold-200 border-t-4 border-t-gold-500 rounded-2xl shadow-[0_1px_2px_rgba(139,105,20,0.06),0_16px_40px_-20px_rgba(139,105,20,0.35)] p-7 sm:p-8 mb-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
        <div className="min-w-[220px]">
          <h2 className="text-sm font-semibold text-gold-800 mb-2">Available prepaid funds</h2>
          <div className="text-4xl sm:text-5xl font-semibold text-stone-800 leading-none" data-testid="funds-value" aria-live="polite">
            {loading ? '-' : shown === null ? 'Not available' : moneyFromMinor(shown, currency)}
          </div>
          <div className="text-[11px] text-stone-500 mt-2">
            {funds?.accounts && funds.accounts.length > 1
              ? 'Live prepaid balance returned by Meta. A payment card number is never counted as extra funds.'
              : 'Money already paid to Meta and still to be spent on ads.'}
          </div>
        </div>

        {!loading && funds && (funds.spentMinor !== null || funds.capMinor !== null) && (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
            <dt className="text-stone-500">Spent so far</dt>
            <dd className="font-semibold text-stone-700 text-right" data-testid="funds-spent">
              {funds.spentMinor === null ? 'not returned' : moneyFromMinor(funds.spentMinor, currency)}
            </dd>
            <dt className="text-stone-500">Spending cap</dt>
            <dd className="font-semibold text-stone-700 text-right" data-testid="funds-cap">
              {funds.capMinor === null || funds.capMinor === 0 ? 'none set' : moneyFromMinor(funds.capMinor, currency)}
            </dd>
            <dd className="col-span-2 text-[11px] text-stone-500 mt-1 max-w-xs">
              The cap is a hard stop. Ads stop by themselves when spending reaches it, whatever the balance says.
            </dd>
          </dl>
        )}
      </div>

      {!loading && funds?.accounts && funds.accounts.length > 1 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-5" data-testid="funds-by-account">
          {funds.accounts.map((account) => {
            const accountShown = account.availableMinor ?? account.displayMinor;
            return (
              <div key={account.accountId} className="bg-white/70 border border-gold-200 rounded-lg px-3 py-2">
                <div className="text-[11px] font-semibold text-stone-700">
                  {metaAccountLabel(account.accountId, funds.accounts?.map((item) => item.accountId))}
                </div>
                <div className="text-[10px] text-stone-500">{account.accountName}</div>
                <div className="text-sm font-semibold text-gold-800 mt-1" data-testid="account-funding">
                  {accountShown === null
                    ? 'Billed to a payment card'
                    : `${moneyFromMinor(accountShown, account.currency || currency)} prepaid balance`}
                </div>
                {account.spentMinor !== null && (
                  <div className="text-[10px] text-stone-500 mt-0.5">
                    Meta reports {moneyFromMinor(account.spentMinor, account.currency || currency)} spent through this account.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-5">
        <span className={`text-[11px] tracking-wide px-2.5 py-1 rounded-md ${TONE_CLASSES[tone]}`} data-testid="funds-status">
          {status}
        </span>
        {!loading && funds && (
          <span className="text-[11px] text-stone-500">
            Last updated {formatTime(funds.fetchedAt)}. Meta&apos;s own figures lag about 15 minutes.
          </span>
        )}
      </div>

      {!loading && funds?.disagreement && (
        <p className="text-[11px] text-red-600 mt-3" data-testid="funds-disagreement">
          Two sources disagree. The number above is the cap minus what has been spent, but Meta&apos;s own
          wording says &quot;{funds.displayString}&quot;. Trust Ads Manager until they agree again.
        </p>
      )}
      {!loading && funds?.missing && shown !== null && (
        <p className="text-[11px] text-stone-500 mt-3">{funds.missing}</p>
      )}
    </section>
  );
}
