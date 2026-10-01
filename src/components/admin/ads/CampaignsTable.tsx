'use client';

import { useAds } from './AdsData';
import { count, metaAccountLabel, moneyFromMinor } from './shared';

// The other tagged links that brought people in (QR posters, emails, bios),
// and the line about which ad account this is. Both on the All ads page. The
// campaigns table that used to sit here was dropped on 4 Sept 2026 (audit
// item 11): each boosted post is its own campaign, so it repeated the cards.

const CARD = 'bg-white border border-stone-200 rounded-2xl shadow-[0_1px_2px_rgba(28,25,23,0.04),0_10px_30px_-18px_rgba(28,25,23,0.25)]';

export function AccountStrip() {
  const { data, currency } = useAds();
  if (!data?.account) return null;
  const accounts = data.accounts?.length ? data.accounts : [data.account];
  const multiple = accounts.length > 1;
  return (
    <div className={`${CARD} p-5 sm:p-6 mb-8`} data-testid="account-strip">
      <h2 className="text-sm font-semibold text-stone-800 mb-2">{multiple ? 'These ad accounts' : 'This ad account'}</h2>
      <div className="space-y-2">
        {accounts.map((account) => (
          <div key={account.id} className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="tracked-account">
            <span className="text-xs font-semibold text-gold-700">{metaAccountLabel(account.id, accounts.map((item) => item.id))}</span>
            <span className="text-xs font-semibold text-stone-700">{account.name}</span>
            <span className={`text-[11px] tracking-wider uppercase px-2 py-0.5 rounded-full ${
              account.active ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {account.active ? 'Account active' : 'Account not active'}
            </span>
            <span className="text-[11px] text-stone-500 font-mono">{account.id}</span>
            <span className="text-[11px] text-stone-500">
              Spent since this account opened: {moneyFromMinor(account.lifetimeSpendMinor, currency)}
            </span>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-stone-500 mt-2">
        {multiple
          ? 'Ads from both Windsor Glow accounts appear together throughout this panel.'
          : 'Only ads run from this ad account appear here. An ad boosted from the Instagram or Facebook app can sit in a different account and will not appear here.'}
        {(data.otherCampaigns?.length ?? 0) > 0
          ? ' One account is shared, so the totals inside Meta Ads Manager may be higher than the Windsor Glow figures here.'
          : ''}
        {multiple ? ' Reach may count the same person once in each account.' : ''}
      </p>
    </div>
  );
}

export function OtherTaggedLinks() {
  const { loading, currency, otherTill } = useAds();
  if (loading || otherTill.length === 0) return null;
  return (
    <div className={`${CARD} overflow-x-auto mb-8`} data-testid="other-tagged">
      <h2 className="px-4 pt-4 text-sm font-semibold text-stone-800">Other tagged links that brought people in</h2>
      <p className="px-4 pt-1 text-[11px] text-stone-500">Links with a tag that is not one of the ads here: a QR poster, an email, a profile bio.</p>
      <table className="w-full">
        <thead>
          <tr className="border-b border-stone-100">
            {['Link tag', 'Visits', 'People', 'Orders', 'Sales'].map((h) => (
              <th key={h} className="text-left text-[11px] tracking-[0.18em] uppercase text-stone-500 px-4 py-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {otherTill.slice(0, 10).map((t) => (
            <tr key={t.utm_campaign} className="border-b border-stone-50">
              <td className="px-4 py-3 text-xs text-stone-700">{t.utm_campaign}</td>
              <td className="px-4 py-3 text-xs text-stone-600">{count(t.visits)}</td>
              <td className="px-4 py-3 text-xs text-stone-600">{count(t.people)}</td>
              <td className="px-4 py-3 text-xs text-stone-600">{count(t.orders)}</td>
              <td className="px-4 py-3 text-xs font-semibold text-gold-700">{moneyFromMinor(t.revenue_minor, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
