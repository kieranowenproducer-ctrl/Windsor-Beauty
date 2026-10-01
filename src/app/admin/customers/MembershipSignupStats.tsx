'use client';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  signupsIssued: number;
  signupsRedeemed: number;
  signupsUnredeemed: number;
  redemptionRate: number;
  topReferralSources: { label: string; count: number }[];
  setSearch: (value: string) => void;
}

export default function MembershipSignupStats({
  signupsIssued, signupsRedeemed, signupsUnredeemed, redemptionRate,
  topReferralSources, setSearch,
}: Props) {
  return (
    <>
          {/* Membership signup stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-white border border-stone-200 p-4">
              <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Codes Issued</p>
              <p className="text-lg font-semibold text-stone-700">{signupsIssued}</p>
            </div>
            <div className="bg-white border border-stone-200 p-4">
              <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Redeemed</p>
              <p className="text-lg font-semibold text-green-600">{signupsRedeemed}</p>
            </div>
            <div className="bg-white border border-stone-200 p-4">
              <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Unredeemed</p>
              <p className="text-lg font-semibold text-stone-500">{signupsUnredeemed}</p>
            </div>
            <div className="bg-white border border-stone-200 p-4">
              <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-1">Redemption Rate</p>
              <p className="text-lg font-semibold text-gold-700">{redemptionRate}%</p>
            </div>
          </div>

          {topReferralSources.length > 0 && (
            <div className="bg-white border border-stone-200 p-4 mb-5">
              <p className="text-[9px] tracking-[0.15em] uppercase text-stone-400 mb-3">Top Referral Sources</p>
              <div className="flex flex-wrap gap-2">
                {topReferralSources.map(({ label, count }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSearch(label)}
                    title={`Show customers referred by ${label}`}
                    className="text-[10px] text-stone-600 bg-stone-50 border border-stone-100 px-2.5 py-1.5 cursor-pointer hover:bg-gold-50 hover:border-gold-300 hover:text-gold-700 transition-colors"
                  >
                    {label} <span className="text-gold-700 font-semibold ml-1">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
    </>
  );
}
