'use client';

import { useState } from 'react';
import { LINK_TAGS, useAds } from './AdsData';

// Making a new ad, in three plain steps. Ads are made in Meta Ads Manager,
// never here: this site can read the account, not edit it or spend from it.
// The one thing to paste is the line of tags, so that when somebody clicks
// the ad our site knows which ad sent them. Folded to one line until it is
// wanted (audit item 15), because it is the biggest thing on the page.

export default function NewAdBox() {
  const { accountId, accountIds } = useAds();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const trackedAccounts = accountIds.length ? accountIds : (accountId ? [accountId] : []);

  function copyTags() {
    navigator.clipboard?.writeText(LINK_TAGS).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {});
  }

  return (
    <section data-testid="new-ad-box" data-open={open} className="bg-gold-50 border border-gold-200 rounded-2xl mb-8">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="new-ad-toggle"
        className="w-full flex items-center justify-between gap-3 text-left px-5 sm:px-6 py-4"
      >
        <h2 className="text-sm font-semibold text-gold-800">Making a new ad? The three steps</h2>
        <span className="text-[10px] tracking-[0.18em] uppercase text-gold-700 shrink-0">{open ? 'Close' : 'Open'}</span>
      </button>

      {open && (
        <div className="px-5 sm:px-6 pb-5 sm:pb-6 flex flex-wrap items-start justify-between gap-4" data-testid="new-ad-body">
          <div className="min-w-[240px] flex-1">
            <ol className="text-xs text-stone-700 space-y-1.5 list-decimal pl-4" data-testid="new-ad-steps">
              <li>Press the button and make the ad in Meta Ads Manager, the same as always.</li>
              <li>
                When you reach the box called <span className="font-semibold">URL parameters</span>, press Copy here and paste it there. Once per ad.
              </li>
              <li>Done. The ad appears in the list below on its own, usually within a day.</li>
            </ol>
            <p className="text-[11px] text-stone-500 mt-2">
              The pasted line is a label on the ad&apos;s link, so our site knows which ad sent each visitor. Forget it and the ad still
              shows here with Meta&apos;s figures; only the After the click page stays empty for that ad. Meta lets this site read your
              account, not edit it, so the pasting is the one thing only you can do.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-2 min-w-[220px]">
            {trackedAccounts.map((id) => (
              <a
                key={id}
                href={`https://adsmanager.facebook.com/adsmanager/creation?act=${id.replace(/^act_/, '')}`}
                target="_blank" rel="noopener noreferrer"
                data-testid="new-ad-button"
                className="text-[10px] tracking-[0.18em] uppercase px-4 py-3 rounded-lg bg-gold-700 text-white border border-gold-500 hover:bg-gold-800 transition-colors text-center"
              >
                Make an ad in account {id.slice(-5)} &#8599;
              </a>
            ))}
            <button
              onClick={copyTags}
              data-testid="new-ad-copy"
              className="text-[10px] tracking-[0.18em] uppercase px-4 py-3 rounded-lg border border-gold-500 text-gold-700 hover:bg-gold-700 hover:text-white transition-colors"
            >
              {copied ? 'Copied, now paste it in Ads Manager' : 'Copy the line to paste'}
            </button>
            <code className="text-[10px] text-stone-600 bg-white border border-stone-200 rounded-md px-2 py-1.5 break-all">{LINK_TAGS}</code>
          </div>
        </div>
      )}
    </section>
  );
}
