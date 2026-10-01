'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Card {
  loyalty?: boolean;
  cycle?: number;
  points?: number;
  nextMilestone?: number | null;
  nextRewardAmount?: number | null;
  pointsAway?: number;
  loyaltyRewards?: { milestone: number; amount: number; status: string; code: string | null }[];
  carriedRewards?: { cycle: number; milestone: number; amount: number; status: string; code: string | null }[];
  demo?: boolean;
  design?: 'passport' | 'orbit' | 'folio';
  code: string;
  availableStamps: number;
  rewards: { stamps: number; amount: number; deliveryDiscountPercent: number }[];
  referrals: { id: number; status: string; reason: string | null; date: string }[];
  vouchers: { code: string; amount: number; stamps?: number; deliveryDiscountPercent?: number; date: string; used: boolean; active: boolean; expiresAt: string | null }[];
}

const statusText: Record<string, string> = {
  waiting_order: 'Waiting for a first order',
  waiting_verification: 'Waiting for email verification',
  holding: 'Order complete, stamp pending',
  review: 'Being checked by our team',
  approved: 'Approved, stamp pending',
  ready: 'Stamp earned',
  rejected: 'Not eligible',
};

function GlowCardExplainer({ onClose }: { onClose: () => void }) {
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Glow Card explainer" onMouseDown={event => { if (event.currentTarget === event.target) onClose(); }}>
    <div className="relative max-h-[94vh] max-w-2xl overflow-y-auto bg-[#fffdf8] p-3 shadow-2xl">
      <button type="button" onClick={onClose} className="absolute right-5 top-5 z-10 flex h-10 w-10 items-center justify-center border border-gold-700 bg-white text-xl text-gold-900" aria-label="Close Glow Card explainer">×</button>
      <Image src="/images/glow-card-explainer-poster-v1.png" alt="Glow Card: points, referrals, rewards and half-price standard UK delivery" width={1122} height={1404} sizes="(max-width: 672px) 100vw, 672px" className="h-auto w-full" />
    </div>
  </div>;
}

export default function GlowCardPage() {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedRewardCode, setCopiedRewardCode] = useState('');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [checkingStage, setCheckingStage] = useState<number | null>(null);

  async function load() {
    const response = await fetch('/api/account/referrals', { cache: 'no-store' });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setError(data?.error || 'Your Glow Card could not be loaded.');
      return;
    }
    setCard(data);
    setError('');
  }

  useEffect(() => { void load(); }, []);

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setError('Copy did not work. You can select and copy the link below.');
    }
  }

  async function copyRewardCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedRewardCode(code);
    } catch {
      setError('Copy did not work. You can select and copy the reward code instead.');
    }
  }

  async function claim(stamps: number) {
    setBusy(true);
    setCheckingStage(stamps);
    setError('');
    try {
      const response = await fetch('/api/account/referrals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stamps }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) setError(result?.error || 'We could not claim that reward.');
      else await load();
    } catch {
      setError('We could not claim that reward. Please try again.');
    } finally {
      setBusy(false);
      setCheckingStage(null);
    }
  }

  async function claimLoyalty(milestone: 5 | 10 | 15, cycle?: number) {
    setBusy(true); setCheckingStage(milestone); setError('');
    try {
      const response = await fetch('/api/account/referrals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ milestone, ...(cycle ? { cycle } : {}) }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) setError(result?.error || 'We could not claim that reward.');
      else await load();
    } catch { setError('We could not claim that reward. Please try again.'); }
    finally { setBusy(false); setCheckingStage(null); }
  }

  async function demoAction(action: 'add-stamp' | 'reset' | 'redeem', code?: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/account/referrals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, code }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) setError(result?.error || 'The demo could not be updated.');
      else await load();
    } catch { setError('The demo could not be updated. Please try again.'); }
    finally { setBusy(false); }
  }

  const link = card && typeof window !== 'undefined'
    ? card.demo ? `${window.location.origin}/glow-card-demo-invite?design=${card.design}` : `${window.location.origin}/refer/${card.code}` : '';
  const visibleStamps = Math.min(card?.availableStamps ?? 0, 15);

  if (card?.loyalty) {
    const points = card.points ?? 0;
    const rewards = ([
      { milestone: 5, amount: 10 }, { milestone: 10, amount: 20 }, { milestone: 15, amount: 30 },
    ] as const).map(stage => ({ ...stage, current: card.loyaltyRewards?.find(reward => reward.milestone === stage.milestone) }));
    const carriedRewards = card.carriedRewards ?? [];
    const link = typeof window !== 'undefined' ? `${window.location.origin}/refer/${card.code}` : '';
    return <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-16">
      <Link href="/account" className="inline-flex min-h-10 items-center border border-gold-500 bg-white px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-gold-800">Back to my account</Link>
      <header className="mt-8 max-w-2xl"><p className="text-[10px] uppercase tracking-[0.26em] text-gold-700">Member rewards</p><h1 className="mt-2 font-serif text-5xl text-stone-900">Your Glow Card</h1><p className="mt-5 text-sm leading-relaxed text-stone-600">Earn one Glow Point on every paid member order with £30 or more of products. Invite a friend and, once they complete their first paid signed-in £30+ product order, you both receive a separate bonus point.</p></header>
      <button type="button" onClick={() => setShowHowItWorks(true)} className="mt-6 inline-flex min-h-12 items-center gap-3 border border-gold-800 bg-gold-800 px-5 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-white shadow-sm hover:bg-gold-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700"><span>What is the Glow Card?</span><span className="text-base leading-none" aria-hidden="true">↓</span></button>
      {error && <p role="alert" className="mt-6 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</p>}
      <section className="mt-8 grid gap-4 md:grid-cols-3">{rewards.map((stage, index) => { const ready = points >= stage.milestone && !stage.current; const code = stage.current?.status === 'claimed' ? stage.current.code : null; return <article key={stage.milestone} className={`relative overflow-hidden border p-5 shadow-[0_8px_22px_rgba(111,88,35,0.07)] sm:p-6 ${index === 2 ? 'border-[#cfb45f] bg-[linear-gradient(145deg,#f8edcb,#ead393)]' : index === 1 ? 'border-[#d8c483] bg-[linear-gradient(145deg,#fffaf0,#f2e5bf)]' : 'border-[#dfd3ad] bg-[linear-gradient(145deg,#ffffff,#f8f2e4)]'}`}><Image src="/images/windsor-beauty-mark.png" alt="" width={258} height={239} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-auto w-[78%] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.065] mix-blend-multiply" /><div className="relative"><p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-800">Stage {index + 1} · {stage.milestone} points</p><p className="mt-4 font-serif text-4xl leading-tight text-stone-900">£{stage.amount} off</p><p className="mt-1 text-xs font-semibold text-gold-900">Plus half-price standard UK delivery</p><div className="mt-5 grid grid-cols-5 gap-2">{Array.from({ length: 5 }, (_, offset) => { const point = index * 5 + offset; return <span key={point} className={`flex aspect-square items-center justify-center rounded-full border text-xs font-semibold ${point < points ? 'border-gold-700 bg-[linear-gradient(145deg,#b58b27,#87630f)] text-white shadow-sm' : 'border-gold-400/75 bg-white/70 text-gold-900'}`}>{point + 1}</span>; })}</div><p className="mt-4 text-xs leading-relaxed text-stone-600">{stage.milestone === 15 ? 'Claiming this top reward starts your next card at zero.' : 'Claiming this reward keeps your current card and progress.'}</p>{code ? <div className="mt-5"><code className="block break-all border border-gold-200 bg-white/80 p-3 text-xs text-stone-800">{code}</code><button type="button" onClick={() => copyRewardCode(code)} className="mt-3 text-xs font-semibold text-gold-800 underline">{copiedRewardCode === code ? 'Code copied' : 'Copy code'}</button></div> : <button type="button" disabled={busy || !ready} onClick={() => claimLoyalty(stage.milestone)} className="mt-5 min-h-11 w-full border border-gold-800 bg-gold-800 px-3 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-white disabled:cursor-not-allowed disabled:opacity-40">{checkingStage === stage.milestone ? 'Claiming...' : ready ? 'Claim reward' : `${Math.max(stage.milestone - points, 0)} to go`}</button>}</div></article>; })}</section>
      {carriedRewards.length > 0 && <section className="mt-7 border border-gold-300 bg-gold-50 p-5"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-700">Rewards saved from earlier cards</p><h2 className="mt-2 font-serif text-3xl text-stone-900">Your rewards stay yours</h2><p className="mt-2 text-sm leading-relaxed text-stone-600">Starting a new card after claiming £30 never removes an earlier £10 or £20 reward. Claim or copy it here whenever you are ready.</p><div className="mt-5 grid gap-3 sm:grid-cols-2">{carriedRewards.map(reward => { const code = reward.status === 'claimed' ? reward.code : null; return <article key={`${reward.cycle}-${reward.milestone}`} className="border border-gold-200 bg-white p-4"><p className="text-[10px] uppercase tracking-[0.16em] text-gold-700">Card {reward.cycle} · {reward.milestone} points</p><p className="mt-1 font-serif text-3xl text-stone-900">£{reward.amount} off</p>{code ? <><code className="mt-3 block break-all border border-gold-200 bg-gold-50 p-3 text-xs text-stone-800">{code}</code><button type="button" onClick={() => copyRewardCode(code)} className="mt-3 text-xs font-semibold text-gold-800 underline">{copiedRewardCode === code ? 'Code copied' : 'Copy code'}</button></> : <button type="button" disabled={busy} onClick={() => claimLoyalty(reward.milestone as 5 | 10 | 15, reward.cycle)} className="mt-4 min-h-10 border border-gold-800 bg-gold-800 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-white disabled:opacity-40">{checkingStage === reward.milestone ? 'Claiming...' : 'Claim reward'}</button>}</article>; })}</div></section>}
      <section className="mt-8 border border-gold-200 bg-white p-5"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-700">Referral bonus</p><h2 className="mt-2 font-serif text-3xl text-stone-900">Invite a friend</h2><p className="mt-2 text-sm leading-relaxed text-stone-600">This is separate from spending. Your friend must join through your link, sign in and complete their first paid order with £30 or more in products. Then you both receive one referral bonus Glow Point.</p><input readOnly value={link} onFocus={event => event.target.select()} className="mt-4 w-full border border-stone-300 px-3 py-2.5 text-sm" /><button type="button" onClick={() => copyLink(link)} className="mt-3 border border-gold-700 px-4 py-2 text-xs text-gold-800">{copied ? 'Link copied' : 'Copy invitation link'}</button></section>
      {showHowItWorks && <GlowCardExplainer onClose={() => setShowHowItWorks(false)} />}
      <section className="mt-8 border-t border-gold-200 pt-5 text-sm text-stone-600"><p className="text-[10px] uppercase tracking-[0.2em] text-gold-700">Your card history</p><p className="mt-2">You are on card {card.cycle ?? 1}. Completed cards are recorded here as you claim a £30 reward.</p></section>
      <Link href="/glow-card-terms" className="mt-6 inline-block text-xs text-gold-800 underline underline-offset-4">Read the Glow Card terms</Link>
    </main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-16">
      <Link href="/account" className="inline-flex min-h-10 items-center gap-2 border border-gold-500 bg-white px-4 py-2.5 text-[10px] font-medium uppercase tracking-[0.18em] text-gold-800 shadow-sm transition-colors hover:border-gold-700 hover:bg-gold-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to my account
      </Link>
      <div className="mt-8 mb-8">
        <p className="text-[10px] tracking-[0.26em] uppercase text-gold-700">Member rewards</p>
        <h1 className="font-serif text-5xl sm:text-6xl text-stone-900 mt-2 leading-none">Your Glow Card</h1>
        <p className="text-sm sm:text-base text-stone-600 leading-relaxed mt-5 max-w-2xl">
          Share your personal link. When a new member makes a first paid product order of £30 or more,
          you both earn one stamp after dispatch and checks. Delivery does not count towards the £30, and repeat orders do not earn extra stamps.
        </p>
        <button type="button" onClick={() => setShowHowItWorks(true)} className="mt-5 inline-flex min-h-11 items-center gap-3 border border-gold-700 bg-gold-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.13em] text-gold-900 transition-colors hover:bg-gold-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">
          <span>What is the Glow Card?</span><span className="text-base leading-none" aria-hidden="true">↓</span>
        </button>
      </div>

      {showHowItWorks && <GlowCardExplainer onClose={() => setShowHowItWorks(false)} />}

      {card?.demo && <div className="border border-gold-300 bg-gold-50 p-4 sm:p-5 mb-8 flex flex-wrap items-center justify-between gap-4">
        <div><p className="text-xs font-semibold text-gold-900">Private design demo: {card.design}</p><p className="text-xs text-stone-700 mt-1">These stamps and reward codes are examples. They cannot pay for a live order.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy || card.availableStamps >= 15} onClick={() => demoAction('add-stamp')} className="border border-gold-700 px-3 py-2 text-xs text-gold-900 disabled:opacity-50">Add a test stamp</button><button type="button" disabled={busy} onClick={() => demoAction('reset')} className="border border-stone-400 px-3 py-2 text-xs text-stone-800 disabled:opacity-50">Reset demo</button></div>
      </div>}

      {error && <p role="alert" className="border border-amber-300 bg-amber-50 text-amber-900 px-4 py-3 text-sm mb-6">{error}</p>}
      {!card && !error && <p className="text-sm text-stone-500">Loading your card...</p>}
      {card && <>
        <section className="border border-gold-200 bg-white p-5 sm:p-8 mb-7 shadow-[0_10px_35px_rgba(102,82,39,0.06)]" aria-label="Your referral link">
          <p className="text-[10px] tracking-[0.27em] uppercase text-gold-700">Personal invitation</p>
          <h2 className="font-serif text-3xl text-stone-900 mt-2">Invite a friend</h2>
          <p className="text-sm text-stone-600 mt-2">Your member code is <strong className="text-gold-800 font-mono">{card.code}</strong>.{card.demo && ' This link previews the invitation page.'}</p>
          <label htmlFor="glow-link" className="block text-xs text-stone-600 mt-5 mb-2">Your personal link</label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input id="glow-link" readOnly value={link} onFocus={event => event.target.select()}
              className="flex-1 min-w-0 border border-stone-300 px-3 py-2.5 text-sm text-stone-700 focus-visible:outline-2 focus-visible:outline-gold-700" />
            <button onClick={() => copyLink(link)} className="bg-gold-700 hover:bg-gold-800 text-white px-5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">
              {copied ? 'Link copied' : 'Copy link'}
            </button>
          </div>
        </section>

        {card.design === 'orbit' ? <section className="border border-gold-200 bg-white p-6 sm:p-10 mb-9 grid md:grid-cols-2 gap-8 items-center" aria-label="Your stamps">
          <div className="relative w-64 h-64 sm:w-80 sm:h-80 mx-auto" role="img" aria-label={`${card.availableStamps} of 15 stamps available`}>
            <svg viewBox="0 0 320 320" className="w-full h-full -rotate-90" aria-hidden="true"><circle cx="160" cy="160" r="137" fill="none" stroke="#e9dfca" strokeWidth="10"/><circle cx="160" cy="160" r="137" fill="none" stroke="#947018" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${card.availableStamps / 15 * 861} 861`}/></svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="font-serif text-8xl text-gold-800 leading-none">{card.availableStamps}</span><span className="text-[10px] uppercase tracking-[0.2em] text-stone-700 mt-3">Available stamps</span></div>
          </div>
          <div><p className="text-[10px] uppercase tracking-[0.2em] text-gold-700">Golden Orbit</p><h2 className="font-serif text-4xl text-stone-900 mt-3">Your progress at a glance</h2><p className="text-sm text-stone-700 mt-5">Each qualifying invitation adds one stamp after the first order passes its checks. The dial shows the stamps you can still use.</p><p className="text-sm text-gold-900 mt-5">{15 - card.availableStamps} spaces remain on this card.</p></div>
        </section> : card.design === 'folio' ? <section className="border border-gold-300 bg-[#faf7ee] p-3 sm:p-5 mb-9 shadow-[12px_15px_24px_rgba(87,69,30,0.12)]" aria-label="Your stamps">
          <div className="border-l-[10px] border-gold-700 bg-[#fffdf7] min-h-72 p-6 sm:p-10 flex flex-col justify-between">
            <div><Image src="/images/logo-transparent.png" alt="Windsor Beauty" width={130} height={86} className="w-28 h-auto"/><p className="text-[10px] uppercase tracking-[0.3em] text-gold-700 mt-5">Collector's Folio</p><h2 className="font-serif text-4xl text-stone-900 mt-2">A record of your stamps</h2></div>
            <div className="mt-8 flex flex-wrap items-end gap-6"><p className="font-serif text-8xl text-gold-800 leading-none">{card.availableStamps}</p><div className="flex-1 min-w-40"><p className="text-xs uppercase tracking-[0.15em] text-stone-700">Available stamps</p><div className="h-2 bg-stone-200 mt-3" role="img" aria-label={`${card.availableStamps} of 15 stamps available`}><div className="h-full bg-gold-700" style={{width: `${card.availableStamps / 15 * 100}%`}}/></div><p className="text-xs text-stone-600 mt-2">Up to 15 on this page</p></div></div>
          </div>
        </section> : <section className="relative mb-9 overflow-hidden border border-[#dbc88e] bg-[linear-gradient(145deg,#fffefb,#f7f0df)] p-4 shadow-[0_20px_55px_rgba(111,88,35,0.13)] sm:p-7 lg:p-9" aria-label="Your Glow Card reward stages">
          <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-[#ead79c]/35 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-white/80 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <div className="flex flex-col gap-5 border-b border-[#d9c58c] pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.34em] text-gold-800">Windsor Beauty member rewards</p>
                <h2 className="mt-2 font-serif text-4xl text-stone-900 sm:text-5xl">Your reward journey</h2>
                <p className="mt-3 max-w-xl text-sm leading-relaxed text-stone-600">Every five verified invitations unlocks its own reward. Completed stages stay complete.</p>
              </div>
              <div className="flex items-center gap-3 border border-[#d2b968] bg-white/75 px-4 py-3 shadow-sm sm:text-right">
                <strong className="font-serif text-5xl leading-none text-gold-800">{card.availableStamps}</strong>
                <p className="text-[10px] uppercase leading-relaxed tracking-[0.16em] text-stone-600">verified<br/>stamps</p>
              </div>
            </div>

            <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-[#e5dcc3]" role="img" aria-label={`${card.availableStamps} of 15 stamps collected`}>
              <div className="h-full rounded-full bg-[linear-gradient(90deg,#9b741c,#f0d986,#ad8426)] transition-[width]" style={{ width: `${Math.min(card.availableStamps / 15 * 100, 100)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[9px] uppercase tracking-[0.16em] text-stone-500"><span>Start</span><span>5 stamps</span><span>10 stamps</span><span>15 stamps</span></div>

            <div className="mt-7 grid gap-4 lg:grid-cols-3">
              {card.rewards.map((reward, stage) => {
                const unlocked = card.availableStamps >= reward.stamps;
                const remaining = Math.max(reward.stamps - card.availableStamps, 0);
                const stageVoucher = [...card.vouchers].reverse().find(voucher => {
                  const expired = Boolean(voucher.expiresAt && new Date(voucher.expiresAt).getTime() <= Date.now());
                  const matchesStage = voucher.stamps === reward.stamps || (voucher.stamps == null && voucher.amount === reward.amount);
                  return matchesStage && !expired;
                });
                const readyCode = stageVoucher && stageVoucher.active && !stageVoucher.used ? stageVoucher : null;
                const stageClaimed = Boolean(stageVoucher);
                return <article key={reward.stamps} className={`relative overflow-hidden border p-5 text-stone-900 shadow-[0_8px_22px_rgba(111,88,35,0.07)] sm:p-6 ${stage === 2 ? 'border-[#cfb45f] bg-[linear-gradient(145deg,#f8edcb,#ead393)]' : stage === 1 ? 'border-[#d8c483] bg-[linear-gradient(145deg,#fffaf0,#f2e5bf)]' : 'border-[#dfd3ad] bg-[linear-gradient(145deg,#ffffff,#f8f2e4)]'}`}>
                  <Image src="/images/windsor-beauty-mark.png" alt="" width={258} height={239} aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-auto w-[78%] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.065] mix-blend-multiply" />
                  <div className="relative">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-gold-800">Stage {stage + 1}</p>
                      <span className={`px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${stageClaimed || unlocked ? 'bg-gold-700 text-white' : 'border border-gold-500 bg-white/45 text-gold-900'}`}>{readyCode ? 'Code ready' : stageClaimed ? 'Claimed' : unlocked ? 'Ready for checks' : `${remaining} to go`}</span>
                    </div>
                    <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-stone-600">Stamps {stage * 5 + 1} to {stage * 5 + 5}</p>
                    <p className="mt-1 font-serif text-4xl leading-tight sm:text-[2.65rem]">£{reward.amount.toFixed(2)} off</p>
                    <p className="mt-1 text-xs font-semibold text-gold-900">Plus half-price standard UK delivery</p>
                    <div className="mt-5 grid grid-cols-5 gap-2" aria-label={`Stamps ${stage * 5 + 1} to ${stage * 5 + 5}`}>
                      {Array.from({ length: 5 }, (_, offset) => { const index = stage * 5 + offset; return <span key={index} aria-hidden="true" className={`flex aspect-square items-center justify-center rounded-full border text-xs font-semibold ${index < visibleStamps ? 'border-gold-700 bg-[linear-gradient(145deg,#b58b27,#87630f)] text-white shadow-sm' : 'border-gold-400/75 bg-white/70 text-gold-900'}`}>{index + 1}</span>; })}
                    </div>
                    {readyCode ? <div className="mt-5 border border-gold-700 bg-white/85 p-3 shadow-sm">
                      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-gold-800">Your unique reward code</p>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                        <code className="min-w-0 flex-1 select-all break-all border border-gold-200 bg-[#fffdf8] px-3 py-2.5 text-sm font-semibold tracking-[0.08em] text-stone-900">{readyCode.code}</code>
                        <button type="button" onClick={() => copyRewardCode(readyCode.code)} className="min-h-10 shrink-0 border border-gold-800 bg-gold-800 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-white hover:bg-gold-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-800">
                          {copiedRewardCode === readyCode.code ? 'Code copied' : 'Copy code'}
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed text-stone-600">Paste this code into the discount code box at checkout.</p>
                    </div> : stageClaimed ? <p className="mt-5 border border-gold-300 bg-white/60 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.12em] text-gold-900">Reward already claimed</p> : <button disabled={busy || !unlocked} onClick={() => claim(reward.stamps)} className={`mt-5 min-h-11 w-full border px-3 py-3 text-xs font-semibold uppercase tracking-[0.13em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${unlocked ? 'border-gold-800 bg-gold-800 text-white hover:bg-gold-900' : 'border-stone-400/60 bg-white/25 text-stone-500'}`}>
                      {checkingStage === reward.stamps ? 'Running final checks...' : unlocked ? 'Check and claim reward' : `${remaining} more ${remaining === 1 ? 'stamp' : 'stamps'} needed`}
                    </button>}
                  </div>
                </article>;
              })}
            </div>
            <p className="mt-5 text-xs leading-relaxed text-stone-600">{card.demo ? 'These are demonstration rewards and cannot be used at checkout. The live system will check every supporting invitation again before creating a code.' : 'Rewards are for your account on product orders of £30 or more, excluding delivery. They expire after 12 months and cannot be combined with another manual code.'}</p>
            <Link href={card.demo ? '/account/glow-card/terms' : '/glow-card-terms'} className="mt-3 inline-block text-xs text-gold-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">Read the Glow Card terms</Link>
          </div>
        </section>}

        {card.design !== 'passport' && <section className="mb-9">
          <h2 className="font-serif text-4xl text-stone-900 mb-2">Choose a reward</h2>
          <p className="text-sm text-stone-600 mb-4">Claim now or save your stamps for a larger reward. Claimed stamps leave your card.</p>
          <div className="grid sm:grid-cols-3 gap-4">
            {card.rewards.map(reward => (
              <div key={reward.stamps} className="border border-gold-200 bg-white p-5 sm:p-6">
                <p className="text-[11px] tracking-[0.2em] uppercase text-gold-700">{reward.stamps} stamps</p>
                <p className="font-serif text-4xl text-gold-800 mt-3">£{reward.amount.toFixed(2)} off</p>
                <button disabled={busy || card.availableStamps < reward.stamps} onClick={() => claim(reward.stamps)}
                  className="mt-5 w-full border border-gold-700 px-3 py-3 text-sm text-gold-800 hover:bg-gold-50 disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-gold-700">
                  Claim this reward
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-stone-600 mt-4">{card.demo ? 'Demo reward codes are examples for testing this design and cannot be used at checkout.' : 'Reward codes are for your own account, on product orders of £30 or more, excluding delivery. They expire after 12 months and cannot be combined with another code.'}</p>
          <Link href={card.demo ? '/account/glow-card/terms' : '/glow-card-terms'} className="inline-block text-xs text-gold-700 underline underline-offset-4 mt-3">Read the Glow Card terms</Link>
        </section>}

        {card.vouchers.length > 0 && <section className="mb-8">
          <h2 className="font-serif text-2xl text-stone-800 mb-1">Recent activity</h2>
          <p className="mb-4 text-sm text-stone-600">Your claimed codes stay here so you can find them again.</p>
          <div className="space-y-3">
            {card.vouchers.map(voucher => {
              const expired = Boolean(voucher.expiresAt && new Date(voucher.expiresAt).getTime() <= Date.now());
              return <div key={voucher.code} className="border border-gold-200 bg-white p-4 flex flex-wrap justify-between gap-3">
                <div><p className="font-mono text-sm text-stone-800">{voucher.code}</p><p className="text-xs text-stone-600 mt-1">£{voucher.amount.toFixed(2)} off plus half-price standard UK delivery · {voucher.used ? 'Used in demo' : card.demo ? 'Demo example' : expired ? 'Expired' : voucher.active ? 'Ready to use' : 'No longer available'}</p></div>
                {!voucher.used && voucher.active && !expired && <div className="flex flex-wrap items-center gap-4 self-center">
                  <button type="button" onClick={() => copyRewardCode(voucher.code)} className="text-xs font-semibold text-gold-800 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">{copiedRewardCode === voucher.code ? 'Code copied' : 'Copy code'}</button>
                  {card.demo ? <button type="button" disabled={busy} onClick={() => demoAction('redeem', voucher.code)} className="text-xs text-gold-700 underline underline-offset-4 disabled:opacity-50">Mark used in demo</button> : <Link href="/checkout" className="text-xs text-gold-700 underline underline-offset-4">Use at checkout</Link>}
                </div>}
              </div>;
            })}
          </div>
        </section>}

        <section>
          <h2 className="font-serif text-2xl text-stone-800 mb-4">Your invitations</h2>
          {card.referrals.length === 0 ? <p className="text-sm text-stone-600 border border-gold-200 p-5">No one has joined with your link yet. Share it when you are ready.</p> :
            <div className="space-y-2">{card.referrals.map(referral => <div key={referral.id} className="border border-gold-200 bg-white p-4 flex flex-wrap justify-between gap-2">
              <p className="text-sm text-stone-800">Member joined {new Date(referral.date).toLocaleDateString('en-GB')}</p>
              <p className="text-xs text-stone-600">{statusText[referral.status] || referral.status}</p>
            </div>)}</div>}
        </section>
      </>}
    </main>
  );
}
