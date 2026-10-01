'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import BackToHome from '@/components/BackToHome';

type OrderStatus =
  | 'pending' | 'awaiting_payment' | 'paid' | 'awaiting_dispatch'
  | 'processing' | 'exported' | 'dispatched' | 'delivered'
  | 'payment_failed' | 'payment_cancelled' | 'cancelled';

interface OrderItem { name: string; variant: string; price: number; quantity: number; }

interface AccountOrder {
  orderNumber: string;
  items: OrderItem[];
  subtotal: number;
  discountCode: string | null;
  discountAmount: number;
  ruleDiscountAmount?: number;
  shippingLabel: string;
  shippingCost: number;
  total: number;
  status: OrderStatus;
  shippingAddress: string;
  trackingNumber: string | null;
  createdAt: string;
}

interface AccountData {
  affiliateAvailable?: boolean;
  rafDiscount?: { code: string; expiresAt: string; welcomeCode?: string | null } | null;
  glowCardDemoDesign?: 'passport' | 'orbit' | 'folio' | null;
  exampleOrderHistory?: boolean;
  customer: {
    id: number;
    email: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    marketingConsent: boolean;
    instagramProfile: string | null;
    facebookProfile: string | null;
    instagramMarketingConsent: boolean;
    facebookMarketingConsent: boolean;
    phoneMarketingConsent: boolean;
    referredBy: string | null;
    createdAt: string;
    emailVerified: boolean;
  };
  stats: { orderCount: number; totalSpent: number };
  orders: AccountOrder[];
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending:           'bg-yellow-50 text-yellow-600',
  awaiting_payment:  'bg-orange-50 text-orange-600',
  paid:              'bg-blue-50 text-blue-600',
  awaiting_dispatch: 'bg-sky-50 text-sky-600',
  processing:        'bg-sky-50 text-sky-600',
  exported:          'bg-sky-50 text-sky-600',
  dispatched:        'bg-gold-50 text-gold-700',
  delivered:         'bg-green-50 text-green-600',
  payment_failed:    'bg-red-50 text-red-400',
  payment_cancelled: 'bg-red-50 text-red-400',
  cancelled:         'bg-red-50 text-red-500',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending:           'Pending',
  awaiting_payment:  'Awaiting Payment',
  paid:              'Payment Received',
  awaiting_dispatch: 'Being Prepared',
  processing:        'Being Prepared',
  exported:          'Being Prepared',
  dispatched:        'Dispatched',
  delivered:         'Delivered',
  payment_failed:    'Payment Failed',
  payment_cancelled: 'Payment Cancelled',
  cancelled:         'Cancelled',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AccountDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [instagramProfile, setInstagramProfile] = useState('');
  const [facebookProfile, setFacebookProfile] = useState('');
  const [instagramMarketingConsent, setInstagramMarketingConsent] = useState(false);
  const [facebookMarketingConsent, setFacebookMarketingConsent] = useState(false);
  const [phoneMarketingConsent, setPhoneMarketingConsent] = useState(false);
  const [editingMarketing, setEditingMarketing] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationResendResult, setVerificationResendResult] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/me')
      .then(res => {
        if (res.status === 401) {
          router.push('/account/login');
          return null;
        }
        return res.json();
      })
      .then(json => {
        if (cancelled || !json) return;
        setData(json);
        setPhone(json.customer.phone || '');
        setMarketingConsent(json.customer.marketingConsent);
        setInstagramProfile(json.customer.instagramProfile || '');
        setFacebookProfile(json.customer.facebookProfile || '');
        setInstagramMarketingConsent(json.customer.instagramMarketingConsent);
        setFacebookMarketingConsent(json.customer.facebookMarketingConsent);
        setPhoneMarketingConsent(json.customer.phoneMarketingConsent);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [router]);

  async function resendVerification() {
    setResendingVerification(true);
    setVerificationResendResult('');
    try {
      const res = await fetch('/api/account/resend-verification', { method: 'POST' });
      const json = await res.json().catch(() => null);
      setVerificationResendResult(
        res.ok
          ? 'Verification email sent. Please check your inbox (and spam folder).'
          : json?.error || 'Could not send the verification email. Please try again.'
      );
    } catch {
      setVerificationResendResult('Something went wrong. Please try again.');
    } finally {
      setResendingVerification(false);
    }
  }

  async function handleLogout() {
    await fetch('/api/account/logout', { method: 'POST' });
    router.push('/account/login');
    router.refresh();
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMessage('');
    try {
      const res = await fetch('/api/account/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, marketingConsent, instagramProfile, facebookProfile,
          instagramMarketingConsent, facebookMarketingConsent, phoneMarketingConsent }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setProfileMessage('Your details have been updated.');
        if (json?.customer) {
          setData(previous => previous ? { ...previous, customer: { ...previous.customer, ...json.customer } } : previous);
          setMarketingConsent(json.customer.marketingConsent);
          setInstagramMarketingConsent(json.customer.instagramMarketingConsent);
          setFacebookMarketingConsent(json.customer.facebookMarketingConsent);
          setPhoneMarketingConsent(json.customer.phoneMarketingConsent);
        }
        setEditingMarketing(false);
      } else {
        setProfileMessage(json?.error || 'Could not save your details. Please try again.');
      }
    } catch {
      setProfileMessage('Something went wrong. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  }

  if (loading) {
    return (
      <>
        <BackToHome />
        <div className="max-w-4xl mx-auto px-4 pt-8 pb-24 text-center">
          <p className="text-xs text-stone-500 tracking-[0.2em] uppercase">Loading your account…</p>
        </div>
      </>
    );
  }

  if (!data) return null;

  const { customer, stats, orders } = data;
  const demoDesign = data.glowCardDemoDesign;
  const inputClass = 'w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors';

  return (
    <>
      <BackToHome />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-16">
      <div className="flex items-start justify-between gap-4 mb-10">
        <div>
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-1">My Account</p>
          <h1 className="font-serif text-4xl text-stone-800 tracking-wide">
            Welcome back, {customer.firstName || customer.email.split('@')[0]}
          </h1>
        </div>
        {/* Quiet on purpose: the exit should never be the loudest thing on the page. */}
        <button
          onClick={handleLogout}
          className="shrink-0 border border-stone-200 text-stone-500 text-[9px] tracking-[0.18em] uppercase hover:border-stone-400 hover:text-stone-700 transition-colors px-4 py-2.5"
        >
          Sign Out
        </button>
      </div>

      {!customer.emailVerified && (
        <div className="border border-amber-300 bg-amber-50 px-5 py-4 mb-10">
          <p className="text-xs text-amber-800 leading-relaxed mb-2">
            Please verify your email address to unlock your 10% first-order discount code. Check your
            inbox for the verification link we sent when you signed up.
          </p>
          <button
            onClick={resendVerification}
            disabled={resendingVerification}
            className="text-[9px] tracking-[0.18em] uppercase text-amber-800 hover:text-amber-900 underline underline-offset-2 disabled:opacity-50"
          >
            {resendingVerification ? 'Sending…' : 'Resend Verification Email'}
          </button>
          {verificationResendResult && (
            <p className="text-[10px] text-amber-700 leading-relaxed mt-2">{verificationResendResult}</p>
          )}
        </div>
      )}

      {/* Stats */}
      {(demoDesign || process.env.NEXT_PUBLIC_WB_MEMBER_REFERRALS_ENABLED === 'true' && customer.emailVerified) && (
        <div className="border border-gold-200 bg-white px-5 py-5 mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-serif text-xl text-stone-800">Your Glow Card</h2>
            <p className="text-xs text-stone-600 mt-1">{demoDesign ? `Demo design: ${demoDesign}. Test stamps and rewards stay in this account.` : 'Share your member link and collect stamps from genuine first orders.'}</p>
          </div>
          <Link href="/account/glow-card" className="shrink-0 bg-gold-700 text-white px-5 py-3 text-xs text-center hover:bg-gold-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-700">
            Open my card
          </Link>
        </div>
      )}
      {data.affiliateAvailable && (
        <div className="mb-8 flex flex-col gap-4 border border-stone-900 bg-stone-900 px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[9px] uppercase tracking-[0.25em] text-gold-300">Affiliate statement</p>
            <h2 className="mt-1 font-serif text-xl">Your referrals and earnings</h2>
            <p className="mt-1 text-xs text-stone-300">See every personal code, qualifying order and payment request.</p>
          </div>
          <Link href="/account/affiliate" className="shrink-0 bg-gold-600 px-5 py-3 text-center text-xs font-semibold text-white hover:bg-gold-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300">Open affiliate page</Link>
        </div>
      )}
      {data.rafDiscount && <RafMemberCodes raf={data.rafDiscount} />}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-12">
        <div className="border border-gold-100 p-5">
          <div className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-2">Paid Orders</div>
          <div className="text-2xl font-semibold text-stone-800">{stats.orderCount}</div>
        </div>
        <div className="border border-gold-100 p-5">
          <div className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-2">Total Spent</div>
          <div className="text-2xl font-semibold text-gold-700">&pound;{stats.totalSpent.toFixed(2)}</div>
        </div>
        <div className="border border-gold-100 p-5 col-span-2 sm:col-span-1">
          <div className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-2">Member Since</div>
          <div className="text-2xl font-semibold text-stone-800">{formatDate(customer.createdAt)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Order history */}
        <div className="lg:col-span-2">
          <h2 className="text-[10px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-5">
            Orders and Payment Attempts
          </h2>
          {data.exampleOrderHistory && <p className="border border-gold-200 bg-gold-50 px-4 py-3 text-xs text-stone-700 mb-4">Example order shown for this design demo. It is not a real purchase, payment or delivery. The account totals above count real paid orders only.</p>}

          {orders.length === 0 ? (
            <div className="border border-gold-100 p-8 text-center">
              <p className="text-sm text-stone-500 mb-1">You haven&apos;t placed any orders yet.</p>
              <p className="text-xs text-stone-500">Your orders will appear here once you make a purchase.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map(order => {
                const isOpen = expanded === order.orderNumber;
                return (
                  <div key={order.orderNumber} className="border border-gold-100">
                    <button
                      onClick={() => setExpanded(isOpen ? null : order.orderNumber)}
                      className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-gold-50/30 transition-colors"
                    >
                      <div>
                        <p className="text-xs font-mono font-semibold text-stone-700">{order.orderNumber}</p>
                        <p className="text-[9px] text-stone-500 mt-0.5">{formatDate(order.createdAt)} &bull; {order.items.length} item{order.items.length === 1 ? '' : 's'}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-gold-700">&pound;{order.total.toFixed(2)}</span>
                        <span className={`text-[8px] tracking-wider uppercase px-2 py-0.5 ${STATUS_STYLES[order.status] ?? 'bg-stone-100 text-stone-500'}`}>
                          {STATUS_LABELS[order.status] ?? order.status}
                        </span>
                        <svg className={`w-3.5 h-3.5 text-stone-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-gold-100 px-5 py-4 space-y-4">
                        <div>
                          <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-2">Items</p>
                          <div className="space-y-1.5">
                            {order.items.map((item, idx) => (
                              <div key={idx} className="flex justify-between text-xs">
                                <span className="text-stone-500">{item.name} ({item.variant}) x{item.quantity}</span>
                                <span className="text-stone-700 font-medium">&pound;{(item.price * item.quantity).toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Delivery Address</p>
                            <p className="text-xs text-stone-600 leading-relaxed">{order.shippingAddress}</p>
                          </div>
                          <div>
                            <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Tracking</p>
                            {order.trackingNumber ? (
                              <a
                                href={`https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(order.trackingNumber)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-mono text-gold-700 hover:text-gold-700 hover:underline transition-colors"
                              >
                                {order.trackingNumber} &rarr;
                              </a>
                            ) : (
                              <p className="text-xs text-stone-500">Not yet dispatched — tracking will appear here once your order ships.</p>
                            )}
                          </div>
                        </div>

                        <div className="border-t border-gold-100 pt-3 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-stone-500">Subtotal</span>
                            <span className="text-stone-600">&pound;{order.subtotal.toFixed(2)}</span>
                          </div>
                          {Number(order.ruleDiscountAmount) > 0 && (
                            <div className="flex justify-between text-xs text-gold-700">
                              <span>Promotional discount</span>
                              <span>&minus;&pound;{Number(order.ruleDiscountAmount).toFixed(2)}</span>
                            </div>
                          )}
                          {order.discountAmount > 0 && (
                            <div className="flex justify-between text-xs text-gold-700">
                              <span>Discount{order.discountCode ? ` (${order.discountCode})` : ''}</span>
                              <span>&minus;&pound;{order.discountAmount.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-xs">
                            <span className="text-stone-500">Shipping ({order.shippingLabel})</span>
                            <span className="text-stone-600">{order.shippingCost === 0 ? 'Free' : `£${order.shippingCost.toFixed(2)}`}</span>
                          </div>
                          <div className="flex justify-between text-sm font-semibold text-gold-700 pt-1.5 border-t border-stone-100 mt-1.5">
                            <span>Total</span>
                            <span>&pound;{order.total.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Profile */}
        <div>
          <h2 className="text-[10px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-5">
            Your Details
          </h2>
          <div className="border border-gold-100 p-6">
            <div className="space-y-3 mb-5 text-xs">
              <div>
                <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Name</p>
                <p className="text-stone-700">{customer.firstName || customer.lastName ? `${customer.firstName ?? ''} ${customer.lastName ?? ''}`.trim() : customer.email}</p>
              </div>
              <div>
                <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Email</p>
                <p className="text-stone-700">{customer.email}</p>
              </div>
              {customer.referredBy && (
                <div>
                  <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Referred By</p>
                  <p className="text-stone-700">{customer.referredBy}</p>
                </div>
              )}
            </div>

            <form onSubmit={saveProfile} className="space-y-4 border-t border-gold-100 pt-4">
              <div>
                <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">Phone</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className={inputClass} placeholder="Add a phone number" />
              </div>

              <div className="space-y-3 border-t border-gold-100 pt-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-[9px] tracking-[0.2em] uppercase text-stone-500">Marketing choices</h3>
                  <button type="button" onClick={() => setEditingMarketing(value => !value)}
                    className="text-[10px] text-gold-700 underline underline-offset-4">
                    {editingMarketing ? 'Close' : 'Edit'}
                  </button>
                </div>
                {!editingMarketing ? (
                  <p className="text-xs text-stone-500 leading-relaxed">
                    Email {marketingConsent ? 'on' : 'off'} · Instagram {instagramMarketingConsent ? 'on' : 'off'} · Facebook {facebookMarketingConsent ? 'on' : 'off'} · Phone {phoneMarketingConsent ? 'on' : 'off'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5" htmlFor="account-instagram">Instagram username</label>
                      <input id="account-instagram" type="text" maxLength={100} value={instagramProfile}
                        onChange={e => setInstagramProfile(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                      <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5" htmlFor="account-facebook">Facebook profile name</label>
                      <input id="account-facebook" type="text" maxLength={100} value={facebookProfile}
                        onChange={e => setFacebookProfile(e.target.value)} className={inputClass} />
                    </div>
                    {[
                      { label: 'Email offers', checked: marketingConsent, change: setMarketingConsent, disabled: false },
                      { label: 'Instagram messages', checked: instagramMarketingConsent, change: setInstagramMarketingConsent, disabled: !instagramProfile.trim() },
                      { label: 'Facebook messages', checked: facebookMarketingConsent, change: setFacebookMarketingConsent, disabled: !facebookProfile.trim() },
                      { label: 'Telephone offers', checked: phoneMarketingConsent, change: setPhoneMarketingConsent, disabled: !phone.trim() },
                    ].map(choice => (
                      <label key={choice.label} className="flex items-center gap-2.5 text-xs text-stone-600">
                        <input type="checkbox" checked={choice.checked} disabled={choice.disabled}
                          onChange={e => choice.change(e.target.checked)} className="w-4 h-4 accent-gold-500" />
                        {choice.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {profileMessage && <p className="text-[10px] text-gold-700">{profileMessage}</p>}

              <button
                type="submit"
                disabled={savingProfile}
                className="w-full border border-gold-300 text-gold-700 text-[10px] tracking-[0.2em] uppercase py-3 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40"
              >
                {savingProfile ? 'Saving…' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

/* A member Raf invited gets their own panel: who invited them and both of their codes, each with a
   copy button, so nobody has to dig the codes out of an email. The 10% code leaves once used. */
function RafMemberCodes({ raf }: { raf: { code: string; expiresAt: string; welcomeCode?: string | null } }) {
  const [copied, setCopied] = useState('');
  function copy(code: string) {
    navigator.clipboard.writeText(code).then(() => setCopied(code)).catch(() => setCopied(''));
  }
  const tile = (label: string, code: string, detail: string) => (
    <div className="border border-gold-300/40 bg-white/[0.04] p-4">
      <p className="text-[9px] uppercase tracking-[0.22em] text-gold-300">{label}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="font-mono text-xl font-semibold tracking-wider text-white">{code}</p>
        <button type="button" onClick={() => copy(code)} className="min-h-10 border border-gold-300 px-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold-200 hover:bg-gold-300/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold-300">
          {copied === code ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-stone-300">{detail}</p>
    </div>
  );
  return (
    <section aria-labelledby="raf-codes-heading" className="mb-8 border border-stone-900 bg-stone-900 px-5 py-6 text-white sm:px-6">
      <p className="text-[9px] uppercase tracking-[0.3em] text-gold-300">Invited by Raf</p>
      <h2 id="raf-codes-heading" className="mt-1 font-serif text-2xl">Your member codes</h2>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {raf.welcomeCode && tile('10% off your first order', raf.welcomeCode, 'Use it on your first order.')}
        {tile('Your personal Raf code: 5% off', raf.code, `For every later order with £30 or more of products, until ${formatDate(raf.expiresAt)}. Yours alone.`)}
      </div>
      <p className="mt-4 text-[11px] leading-relaxed text-stone-400">Enter one code at checkout. The two codes cannot be used together, and the Raf code cannot be added to other offers.</p>
    </section>
  );
}
