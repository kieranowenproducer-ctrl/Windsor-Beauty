'use client';

import { normalisePhoneNumber, PHONE_ERROR } from '@/lib/phoneNumber';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/contexts/CartContext';
import AccountIncentiveBanner from '@/components/AccountIncentiveBanner';
import MemberSavingsNote from '@/components/MemberSavingsNote';
import PromotionsAppliedBlock from '@/components/PromotionsAppliedBlock';
import CountrySelect from '@/components/CountrySelect';
import { usePromotionPreview } from '@/hooks/usePromotionPreview';
import { useIsLoggedIn } from '@/hooks/useIsLoggedIn';
import { CHECKOUT_CONFIRMATIONS, CHECKOUT_CONFIRMATIONS_ERROR } from '@/lib/complianceConfirmations';
import { PRODUCTS, Product, ProductVariant, mergeProducts, activeVariants } from '@/data/products';
import { percentOf, sumMoney } from '@/lib/money';
import { trackShopAction } from '@/lib/analytics/shopTracking';
import {
  discountAmountLabel,
  discountScopeLabel,
  isRafPersonalDiscountCode,
  resolveDiscountAmount,
  type DiscountCodeInfo,
  type DiscountScopeItem,
} from '@/lib/discountCodes';

type Step = 'details' | 'shipping' | 'payment';
type DiscountStatus = 'idle' | 'checking' | 'applied' | 'invalid';
type PaymentOption = 'fena' | 'paypal';

interface AppliedDiscount extends DiscountCodeInfo {
  code: string;
  deliveryDiscountPercent: number;
}

interface CheckoutCustomer {
  firstName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressCity: string | null;
  addressPostcode: string | null;
  addressCountry: string | null;
}

// Prices are placeholder defaults shown while /api/shipping-rates loads —
// the server also derives the authoritative rate from the same settings when
// the order is placed (see resolveServiceFromLabel in place-order/route.ts),
// so these only need to match closely enough not to surprise the customer.
const SHIPPING_OPTION_META = [
  { id: 'uk', label: 'UK Delivery', sub: 'Royal Mail Tracked · 2-4 working days', price: 10 },
  { id: 'international', label: 'International Delivery', sub: 'Royal Mail International Tracked · 7-14 working days', price: 40 },
];


export default function CheckoutPage() {
  const { items, totalPrice, clearCart, addItem, priceForItem, memberSaving } = useCart();
  const [step, setStep] = useState<Step>('details');
  const trackedSteps = useRef<Set<Step>>(new Set());
  const stepContentRef = useRef<HTMLDivElement>(null);
  const isFirstStepRender = useRef(true);

  // Each step swaps its content in place without changing scroll position —
  // on a tall step (e.g. a long delivery address form) the customer is
  // scrolled near the bottom, so the next step's content renders below the
  // fold and looks like it scrolled too far. Scroll the form back into view
  // whenever the step changes (but not on first mount).
  useEffect(() => {
    if (isFirstStepRender.current) {
      isFirstStepRender.current = false;
      return;
    }
    stepContentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [step]);

  useEffect(() => {
    if (trackedSteps.current.has(step)) return;
    trackedSteps.current.add(step);
    if (step === 'shipping') trackShopAction('checkout_shipping_seen');
    if (step === 'payment') trackShopAction('checkout_payment_seen');
  }, [step]);
  const [shipping, setShipping] = useState(SHIPPING_OPTION_META[0].id);
  const [shippingRates, setShippingRates] = useState({
    uk: SHIPPING_OPTION_META[0].price,
    international: SHIPPING_OPTION_META[1].price,
  });
  const [placingOrder, setPlacingOrder] = useState(false);
  /* What somebody confirms before paying: that they have read and accept the Terms and the
     Privacy Policy. It gates the Pay button, and the server checks it again. The wording lives in
     src/lib/complianceConfirmations.ts. */
  const [confirmations, setConfirmations] = useState<Record<'terms', boolean>>({
    terms: false,
  });
  const allConfirmed = CHECKOUT_CONFIRMATIONS.every(c => confirmations[c.id]);
  const [orderError, setOrderError] = useState('');
  const [paymentOption, setPaymentOption] = useState<PaymentOption>('fena');
  const [paymentRecovery, setPaymentRecovery] = useState<{ orderNumber: string; url: string; message: string } | null>(null);

  const [overrides, setOverrides] = useState<Record<string, Product>>({});
  const [hiddenSlugs, setHiddenSlugs] = useState<Set<string>>(new Set());
  const [stockMap, setStockMap] = useState<Record<string, number>>({});
  useEffect(() => {
    fetch('/api/products/catalogue')
      .then(res => res.json())
      .then(data => {
        if (data.overrides && typeof data.overrides === 'object') setOverrides(data.overrides);
      })
      .catch(() => {});

    fetch('/api/products/visibility')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data.hidden)) setHiddenSlugs(new Set<string>(data.hidden));
      })
      .catch(() => {});

    fetch('/api/products/stock')
      .then(res => res.json())
      .then(data => {
        if (data.stock && typeof data.stock === 'object') setStockMap(data.stock);
      })
      .catch(() => {});

    fetch('/api/shipping-rates')
      .then(res => res.json())
      .then(data => {
        if (typeof data.ukStandardRate === 'number' && typeof data.internationalRate === 'number') {
          setShippingRates({ uk: data.ukStandardRate, international: data.internationalRate });
        }
      })
      .catch(() => {});
  }, []);

  const [details, setDetails] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    line1: '', line2: '', city: '', postcode: '', country: 'GB',
  });
  const [savedCustomer, setSavedCustomer] = useState<CheckoutCustomer | null>(null);
  const [profileState, setProfileState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [profileRetry, setProfileRetry] = useState(0);
  const [enterManually, setEnterManually] = useState(false);
  const [differentAddress, setDifferentAddress] = useState(false);
  const [shippingRecipient, setShippingRecipient] = useState('');

  // Shipping method is determined by delivery country, not a free choice,
  // so the shippingLabel sent to the server always matches the recipient's
  // country (avoids Royal Mail rejecting/misrouting a UK-labelled parcel
  // addressed abroad).
  const SHIPPING_OPTIONS = useMemo(
    () => SHIPPING_OPTION_META
      .filter(opt => (details.country === 'GB' ? opt.id === 'uk' : opt.id === 'international'))
      .map(opt => ({
        ...opt,
        price: opt.id === 'international' ? shippingRates.international : shippingRates.uk,
      })),
    [shippingRates, details.country]
  );

  useEffect(() => {
    if (SHIPPING_OPTIONS[0] && !SHIPPING_OPTIONS.some(opt => opt.id === shipping)) {
      setShipping(SHIPPING_OPTIONS[0].id);
    }
  }, [SHIPPING_OPTIONS, shipping]);

  const catalogue = useMemo(() => mergeProducts(PRODUCTS, overrides), [overrides]);

  const [discountInput, setDiscountInput] = useState('');
  const [discountStatus, setDiscountStatus] = useState<DiscountStatus>('idle');
  const [discountMessage, setDiscountMessage] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<AppliedDiscount | null>(null);
  // The member's own unused welcome code, so the basket can offer it instead of waiting to be asked.
  const [memberWelcomeCode, setMemberWelcomeCode] = useState<string | null>(null);

  const isLoggedIn = useIsLoggedIn();

  useEffect(() => {
    if (isLoggedIn !== true) return;
    let cancelled = false;
    fetch('/api/account/me', { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) throw new Error('Account details unavailable');
        const data = await res.json();
        if (!data?.customer?.email) throw new Error('Account details unavailable');
        return data.customer as CheckoutCustomer & { marketingConsent: boolean };
      })
      .then(customer => {
        if (cancelled) return;
        setSavedCustomer(customer);
        setDetails({
          firstName: customer.firstName ?? '', lastName: customer.lastName ?? '',
          email: customer.email, phone: customer.phone ?? '',
          line1: customer.addressLine1 ?? '', line2: customer.addressLine2 ?? '',
          city: customer.addressCity ?? '', postcode: customer.addressPostcode ?? '',
          country: customer.addressCountry ?? 'GB',
        });
        setProfileState('ready');
      })
      .catch(() => { if (!cancelled) setProfileState('error'); });
    return () => { cancelled = true; };
  }, [isLoggedIn, profileRetry]);

  function chooseDifferentAddress() {
    setDifferentAddress(true);
    setShippingRecipient('');
    setDetails(prev => ({ ...prev, line1: '', line2: '', city: '', postcode: '', country: 'GB' }));
  }

  function useSavedAddress() {
    if (!savedCustomer) return;
    setDifferentAddress(false);
    setShippingRecipient('');
    setDetails(prev => ({
      ...prev,
      line1: savedCustomer.addressLine1 ?? '', line2: savedCustomer.addressLine2 ?? '',
      city: savedCustomer.addressCity ?? '', postcode: savedCustomer.addressPostcode ?? '',
      country: savedCustomer.addressCountry ?? 'GB',
    }));
  }

  const savedProfileLocked = isLoggedIn === true && profileState === 'ready' && !enterManually;
  const hasSavedAddress = Boolean(savedCustomer?.addressLine1 && savedCustomer.addressCity && savedCustomer.addressPostcode);
  const savedAddressLocked = savedProfileLocked && hasSavedAddress && !differentAddress;

  const [marketingConsent, setMarketingConsent] = useState(false);

  const promoPreview = usePromotionPreview(items);
  const rafCodeApplied = isRafPersonalDiscountCode(appliedDiscount?.code);
  const subtotalAfterRules = promoPreview && !rafCodeApplied ? promoPreview.subtotalAfterRules : totalPrice;
  const ruleDiscountAmount = rafCodeApplied ? 0 : promoPreview?.ruleDiscountAmount ?? 0;

  const selectedShipping = SHIPPING_OPTIONS.find(s => s.id === shipping) ?? SHIPPING_OPTIONS[0];
  const baseShippingCost = selectedShipping.price;
  const shippingDiscountAmount = appliedDiscount && selectedShipping.id === 'uk' && baseShippingCost > 0
    ? Math.round(baseShippingCost * appliedDiscount.deliveryDiscountPercent) / 100
    : 0;
  const shippingCost = Math.max(0, baseShippingCost - shippingDiscountAmount);

  const scopeItems: DiscountScopeItem[] = useMemo(
    () => items.map(item => ({
      slug: item.slug ?? null,
      price: priceForItem(item),
      quantity: item.quantity,
      categories: catalogue.find(p => p.slug === item.slug)?.categories ?? [],
    })),
    [items, catalogue, priceForItem]
  );
  const discountAmount = appliedDiscount ? resolveDiscountAmount(appliedDiscount, subtotalAfterRules, scopeItems) : 0;
  const preFeeTotal = sumMoney([subtotalAfterRules, -discountAmount, shippingCost]);
  const paypalFee = paymentOption === 'paypal' ? percentOf(preFeeTotal, 3.5) : 0;
  const orderTotal = sumMoney([preFeeTotal, paypalFee]);

  function updateDetails(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDetails(prev => ({ ...prev, [field]: e.target.value }));
  }

  async function applyDiscountCode(explicitCode?: string) {
    const code = (explicitCode ?? discountInput).trim();
    if (!code || discountStatus === 'checking') return;
    if (explicitCode) setDiscountInput(explicitCode);

    setDiscountStatus('checking');
    setDiscountMessage('');

    try {
      const res = await fetch('/api/discount-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          subtotal: isRafPersonalDiscountCode(code) ? totalPrice : subtotalAfterRules,
          originalSubtotal: totalPrice,
          items: items.map(i => ({ slug: i.slug, price: i.price, quantity: i.quantity })),
        }),
      });
      const data = await res.json().catch(() => null);

      if (data?.valid) {
        setAppliedDiscount({
          code: data.code,
          discountType: data.discountType,
          percentage: data.percentage,
          fixedAmount: data.fixedAmount,
          scopeType: data.scopeType,
          scopeCategories: data.scopeCategories ?? [],
          scopeProductSlugs: data.scopeProductSlugs ?? [],
          deliveryDiscountPercent: Number(data.deliveryDiscountPercent) || 0,
        });
        setDiscountStatus('applied');
        setDiscountMessage(data.message || 'Discount applied.');
      } else {
        setAppliedDiscount(null);
        setDiscountStatus('invalid');
        setDiscountMessage(data?.message || 'That code could not be applied.');
      }
    } catch {
      setAppliedDiscount(null);
      setDiscountStatus('invalid');
      setDiscountMessage('Something went wrong while checking your code. Please try again.');
    }
  }

  function removeDiscountCode() {
    setAppliedDiscount(null);
    setDiscountInput('');
    setDiscountStatus('idle');
    setDiscountMessage('');
  }

  // Ask whether this member has a welcome code sitting unused. Only for a signed-in member with no
  // discount already on the basket, and a failure is simply no panel: this must never be in the way.
  useEffect(() => {
    if (isLoggedIn !== true) { setMemberWelcomeCode(null); return; }
    let cancelled = false;
    fetch('/api/account/welcome-code')
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (!cancelled) setMemberWelcomeCode(typeof data?.code === 'string' ? data.code : null); })
      .catch(() => { if (!cancelled) setMemberWelcomeCode(null); });
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  // If auth resolves to "not logged in", strip any discount that may have been
  // applied during a previous logged-in session in the same tab.
  useEffect(() => {
    if (isLoggedIn === false && appliedDiscount) removeDiscountCode();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- this must react to the sign-in state settling, and nothing else. Adding appliedDiscount or removeDiscountCode would re-run it as the basket changes and strip a discount the customer is entitled to.
  }, [isLoggedIn]);

  function handleContinueToPayment() {
    setStep('payment');
  }

  async function handlePay() {
    if (!normalisePhoneNumber(details.phone, details.country)) { setOrderError(PHONE_ERROR); return; }
    trackShopAction('checkout_pay_pressed');
    setPlacingOrder(true);
    setOrderError('');

    const shippingAddress = [details.line1, details.line2, details.city, details.postcode, details.country]
      .filter(Boolean)
      .join(', ');

    // Step 1: Create the order record in the database.
    let orderNumber: string;
    let paymentToken: string | null = null;
    let resumeUrl: string | null = null;
    try {
      const res = await fetch('/api/checkout/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(i => ({ name: i.name, variant: i.variant, price: i.price, quantity: i.quantity, slug: i.slug })),
          email: details.email,
          customerName: `${details.firstName} ${details.lastName}`.trim(),
          shippingAddress,
          address: {
            line1: details.line1,
            line2: details.line2,
            city: details.city,
            postcode: details.postcode,
            country: details.country,
          },
          phone: details.phone,
          marketingConsent: isLoggedIn === false ? marketingConsent : false,
          shippingRecipient: differentAddress ? shippingRecipient.trim() || null : null,
          // What they ticked. The server checks this too and refuses the order without it,
          // because a greyed-out button is a courtesy and not a control.
          confirmations,
          shippingLabel: selectedShipping.label,
          shippingCost,
          subtotal: totalPrice,
          discountCode: appliedDiscount?.code ?? null,
          discountAmount,
          total: orderTotal,
          paymentMethod: paymentOption,
        }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok || !data?.orderNumber) {
        setOrderError(data?.error || 'We could not place your order. Please try again.');
        setPlacingOrder(false);
        return;
      }

      orderNumber = data.orderNumber;
      paymentToken = typeof data.paymentToken === 'string' ? data.paymentToken : null;
      resumeUrl = typeof data.resumeUrl === 'string' ? data.resumeUrl : null;
    } catch {
      setOrderError('Something went wrong while placing your order. Please try again.');
      setPlacingOrder(false);
      return;
    }

    // The discount code is burned server-side by /api/checkout/place-order, in
    // the same request that commits the order. It used to be redeemed from
    // here, unawaited, a few lines before window.location.href sends the
    // customer to their bank — the navigation cancelled the request, so codes
    // stayed reusable and the admin panel never showed a redemption.

    // PayPal opens directly. The confirmation page keeps the recovery link.
    if (paymentOption === 'paypal') {
      try {
        const ppRes = await fetch('/api/payment/paypal/instructions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderNumber, paymentToken }),
        });
        const ppData = await ppRes.json().catch(() => null);

        const directPaymentUrl = typeof ppData?.paymentUrl === 'string' ? ppData.paymentUrl : null;
        const recovery = typeof ppData?.resumeUrl === 'string' ? ppData.resumeUrl : resumeUrl;

        if (ppRes.ok && ppData?.success && (directPaymentUrl || recovery)) {
          if (recovery) {
            try { localStorage.setItem('wb_payment_recovery', recovery); } catch { /* ignore */ }
          }
          clearCart();
          window.location.href = directPaymentUrl || recovery!;
          return;
        }
        if (recovery) {
          try { localStorage.setItem('wb_payment_recovery', recovery); } catch { /* ignore */ }
          clearCart();
          setPaymentRecovery({ orderNumber, url: recovery, message: ppData?.error || 'The payment page could not be opened.' });
          return;
        }
        setOrderError(ppData?.error || 'Could not send your payment link. Please contact us at orders@windsorbeauty.is.');
      } catch {
        setOrderError('Could not send your payment link. Please check your connection and try again.');
      } finally {
        setPlacingOrder(false);
      }
      return;
    }

    // Step 2b: Fena — persist order ref, create payment, redirect to bank.
    try {
      localStorage.setItem('wb_pending_order', orderNumber);
      if (resumeUrl) localStorage.setItem('wb_payment_recovery', resumeUrl);
    } catch {
      // localStorage may be unavailable in some contexts — safe to ignore.
    }

    try {
      const fenaRes = await fetch('/api/payment/fena/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber }),
      });
      const fenaData = await fenaRes.json().catch(() => null);

      if (fenaRes.ok && fenaData?.paymentUrl) {
        clearCart();
        window.location.href = fenaData.paymentUrl;
        return;
      }

      setOrderError(
        fenaData?.error ||
        'Could not connect to the payment provider. Please try again or contact us at orders@windsorbeauty.is.'
      );
      if (resumeUrl) setPaymentRecovery({ orderNumber, url: resumeUrl, message: 'Your order is reserved, but the bank payment page could not be opened.' });
    } catch {
      setOrderError('Could not reach the payment provider. Please check your connection and try again.');
    } finally {
      setPlacingOrder(false);
    }
  }

  if (paymentRecovery) {
    return (
      <div className="max-w-lg mx-auto px-4 sm:px-6 py-24 text-center">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-3">Order Reserved</p>
        <h1 className="font-serif text-4xl text-stone-800 tracking-wide mb-4">Finish Your Payment</h1>
        <p className="text-sm text-stone-500 mb-3">{paymentRecovery.message}</p>
        <p className="text-xs font-mono text-stone-600 mb-7">Order {paymentRecovery.orderNumber}</p>
        <Link href={paymentRecovery.url} className="inline-block bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase px-8 py-3.5 hover:bg-gold-800 transition-colors">
          Open secure payment
        </Link>
        <p className="mt-6 text-xs text-stone-400">Your order will not enter dispatch until payment is confirmed.</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-24 text-center">
        <h1 className="font-serif text-3xl text-stone-800 mb-4">Your basket is empty</h1>
        <Link href="/shop" className="text-[10px] tracking-[0.2em] uppercase text-gold-700 hover:text-gold-800">
          Return to Shop
        </Link>
      </div>
    );
  }

  const inputClass = 'w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16">
      <div className="mb-10">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-1">Windsor Beauty</p>
        <h1 className="font-serif text-4xl text-stone-800 tracking-wide">Checkout</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-10">
        {(['details', 'shipping', 'payment'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex items-center gap-2 text-[9px] tracking-[0.15em] uppercase ${step === s ? 'text-gold-700 font-semibold' : step > s ? 'text-stone-500' : 'text-stone-500'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[8px] ${step === s ? 'bg-gold-700 text-white' : 'bg-stone-100 text-stone-500'}`}>
                {i + 1}
              </span>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
            {i < 2 && <div className="w-8 h-px bg-stone-200" />}
          </div>
        ))}
      </div>

      {/* On a phone the order summary sits below the whole form, so a member never
          saw their saving before pressing on (Samuel's video, 26 Sept 2026). Show it
          first here; on a wide screen it sits in the summary beside the total. */}
      <MemberSavingsNote context="order" className="mb-8 lg:hidden" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">

        {/* Main form area */}
        <div ref={stepContentRef} className="lg:col-span-2 scroll-mt-28">

          {/* Step 1: Customer Details */}
          {step === 'details' && (
            <div className="border border-gold-100 p-7">
              <h2 className="text-[10px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-6">
                Customer Details
              </h2>
              {(isLoggedIn === null || (isLoggedIn && profileState === 'loading')) ? (
                <p role="status" className="text-sm text-stone-600">Loading your account details...</p>
              ) : isLoggedIn && profileState === 'error' && !enterManually ? (
                <div role="alert" className="space-y-3 text-sm text-stone-700">
                  <p>We could not load your saved details. You can try again or enter them yourself.</p>
                  <button type="button" onClick={() => { setProfileState('loading'); setProfileRetry(value => value + 1); }} className="border border-gold-700 px-4 py-2 text-gold-800">Try again</button>
                  <button type="button" onClick={() => setEnterManually(true)} className="ml-3 border border-stone-300 px-4 py-2">Enter manually</button>
                </div>
              ) : (
              <div className="space-y-4">
                {savedProfileLocked && <p className="text-xs text-stone-600">Your saved account details are filled in. You can choose another delivery address for this order.</p>}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="checkout-firstName" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">First Name</label>
                    <input id="checkout-firstName" type="text" value={details.firstName} onChange={updateDetails('firstName')} readOnly={savedProfileLocked && Boolean(savedCustomer?.firstName)} required className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="checkout-lastName" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">Last Name</label>
                    <input id="checkout-lastName" type="text" value={details.lastName} onChange={updateDetails('lastName')} readOnly={savedProfileLocked && Boolean(savedCustomer?.lastName)} required className={inputClass} />
                  </div>
                </div>
                <div>
                  <label htmlFor="checkout-email" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">Email Address</label>
                  <input id="checkout-email" type="email" value={details.email} onChange={updateDetails('email')} readOnly={savedProfileLocked} required className={inputClass} />
                </div>
                <div>
                  <label htmlFor="checkout-phone" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">Phone Number</label>
                  <input id="checkout-phone" type="tel" value={details.phone} onChange={updateDetails('phone')} required className={inputClass} />
                </div>

                <div className="border-t border-gold-100 pt-4">
                  <h3 className="text-[9px] tracking-[0.2em] uppercase text-stone-500 font-semibold mb-3">Delivery Address</h3>
                  {savedProfileLocked && hasSavedAddress && (
                    <button type="button" onClick={differentAddress ? useSavedAddress : chooseDifferentAddress} className="mb-4 border border-gold-700 px-4 py-2 text-xs text-gold-800">
                      {differentAddress ? 'Use my saved address' : 'Send to another address'}
                    </button>
                  )}
                  <div className="space-y-3">
                    {differentAddress && savedProfileLocked && (
                      <div>
                        <label htmlFor="checkout-recipient" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">Recipient name (if different)</label>
                        <input id="checkout-recipient" type="text" value={shippingRecipient} onChange={e => setShippingRecipient(e.target.value)} className={inputClass} />
                      </div>
                    )}
                    <div>
                      <label htmlFor="checkout-line1" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">Address Line 1</label>
                      <input id="checkout-line1" type="text" value={details.line1} onChange={updateDetails('line1')} readOnly={savedAddressLocked && Boolean(savedCustomer?.addressLine1)} required className={inputClass} />
                    </div>
                    <div>
                      <label htmlFor="checkout-line2" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">Address Line 2 (optional)</label>
                      <input id="checkout-line2" type="text" value={details.line2} onChange={updateDetails('line2')} readOnly={savedAddressLocked && Boolean(savedCustomer?.addressLine1)} className={inputClass} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="checkout-city" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">City</label>
                        <input id="checkout-city" type="text" value={details.city} onChange={updateDetails('city')} readOnly={savedAddressLocked && Boolean(savedCustomer?.addressCity)} required className={inputClass} />
                      </div>
                      <div>
                        <label htmlFor="checkout-postcode" className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">Postcode</label>
                        <input id="checkout-postcode" type="text" value={details.postcode} onChange={updateDetails('postcode')} readOnly={savedAddressLocked && Boolean(savedCustomer?.addressPostcode)} required className={inputClass} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5" htmlFor="checkout-country">Country</label>
                      <CountrySelect id="checkout-country" value={details.country} onChange={updateDetails('country')} disabled={savedAddressLocked && Boolean(savedCustomer?.addressCountry)} className={inputClass} />
                    </div>
                  </div>
                </div>

                {isLoggedIn === false && <label className="flex items-start gap-2.5 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={marketingConsent}
                    onChange={e => setMarketingConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-gold-500 shrink-0"
                  />
                  <span className="text-[11px] text-stone-500 leading-relaxed">
                    Keep me updated with special offers, new products and promotions from Windsor Beauty.
                    This is entirely optional.
                  </span>
                </label>}

                <button
                  onClick={() => setStep('shipping')}
                  disabled={!details.firstName || !details.email || !details.phone || !details.line1 || !details.city || !details.postcode}
                  className="w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed mt-2"
                >
                  Continue to Shipping
                </button>
              </div>
              )}
            </div>
          )}

          {/* Step 2: Shipping */}
          {step === 'shipping' && (
            <div className="border border-gold-100 p-7">
              <h2 className="text-[10px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-1.5">
                Shipping Method
              </h2>
              <p className="text-[10px] text-stone-500 mb-6">
                {details.country === 'GB'
                  ? 'Based on your delivery address (United Kingdom). Shipping to Europe or internationally? Go back to step 1 and update your country to see international rates.'
                  : 'Based on your delivery address (International). Estimated 7-14 working days via Royal Mail International Tracked.'}
              </p>
              <div className="space-y-3 mb-6">
                {SHIPPING_OPTIONS.map(opt => (
                  <label
                    key={opt.id}
                    className={`flex items-center justify-between p-4 border cursor-pointer transition-colors ${
                      shipping === opt.id
                        ? 'border-gold-400 bg-gold-50/50'
                        : 'border-stone-200 hover:border-gold-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${shipping === opt.id ? 'border-gold-500' : 'border-stone-300'}`}>
                        {shipping === opt.id && <div className="w-2 h-2 rounded-full bg-gold-700" />}
                      </div>
                      <div>
                        <input type="radio" name="shipping" value={opt.id} checked={shipping === opt.id} onChange={() => setShipping(opt.id)} className="sr-only" />
                        <p className="text-xs font-semibold text-stone-700">{opt.label}</p>
                        <p className="text-[9px] text-stone-500">{opt.sub}</p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-stone-700">
                      £{opt.price.toFixed(2)}
                    </span>
                  </label>
                ))}
              </div>

              <div className="border border-gold-100 bg-gold-50/30 p-4 mb-6 text-xs text-stone-500 leading-relaxed">
                All orders are dispatched via Royal Mail with tracking. You will receive a tracking number by email once your order has been dispatched.
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('details')}
                  className="flex-1 border border-stone-200 text-stone-500 text-[10px] tracking-[0.18em] uppercase py-3.5 hover:border-gold-300 hover:text-gold-800 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleContinueToPayment}
                  className="flex-1 bg-gold-700 text-white text-[9px] sm:text-[10px] tracking-[0.1em] sm:tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors"
                >
                  Continue to Payment
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Payment */}
          {step === 'payment' && (
            <div className="border border-gold-100 p-7">
              <h2 className="text-[10px] tracking-[0.22em] uppercase text-stone-500 font-semibold mb-6">
                Payment
              </h2>

              {/* Payment method selector */}
              <div className="mb-6">
                <p className="text-[9px] tracking-[0.2em] uppercase text-stone-500 font-semibold mb-3">Payment Method</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setPaymentOption('fena')}
                    className={`relative p-4 border text-left transition-colors ${paymentOption === 'fena' ? 'border-gold-400 bg-gold-50/50' : 'border-stone-200 hover:border-gold-200'}`}
                  >
                    <span className="absolute -top-2.5 right-3 bg-gold-700 text-white text-[8px] font-semibold tracking-[0.18em] uppercase px-2 py-1">
                      Recommended
                    </span>
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentOption === 'fena' ? 'border-gold-500' : 'border-stone-300'}`}>
                        {paymentOption === 'fena' && <div className="w-1.5 h-1.5 rounded-full bg-gold-700" />}
                      </div>
                      <span className="text-xs font-semibold text-stone-800">Pay by Bank</span>
                    </div>
                    <p className="text-[10px] text-stone-500 leading-relaxed pl-5">Instant transfer, no card needed</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentOption('paypal')}
                    className={`p-4 border text-left transition-colors ${paymentOption === 'paypal' ? 'border-[#0070ba]/40 bg-blue-50/30' : 'border-stone-200 hover:border-[#0070ba]/30'}`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${paymentOption === 'paypal' ? 'border-[#0070ba]' : 'border-stone-300'}`}>
                        {paymentOption === 'paypal' && <div className="w-1.5 h-1.5 rounded-full bg-[#0070ba]" />}
                      </div>
                      <span className="text-xs font-semibold text-stone-800">Pay with PayPal</span>
                    </div>
                    <p className="text-[10px] text-stone-500 leading-relaxed pl-5">Via PayPal &middot; 3.5% processing fee applies</p>
                  </button>
                </div>
              </div>

              {/* Payment method info panel */}
              {paymentOption === 'fena' ? (
                <div className="border border-stone-200 p-5 mb-6">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 bg-stone-900 rounded flex items-center justify-center shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                        <polyline points="9,22 9,12 15,12 15,22" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-stone-800 tracking-wide">Pay by Bank</p>
                      <p className="text-[10px] text-stone-500 mt-0.5">Secure open banking payment - no card details required</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-500 leading-relaxed">
                    You will be securely redirected to your bank to authorise the payment. The amount is transferred directly - no card data is stored or shared.
                  </p>
                </div>
              ) : (
                <div className="border border-[#0070ba]/30 bg-blue-50/20 p-5 mb-6">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-8 h-8 bg-[#0070ba] rounded flex items-center justify-center shrink-0 mt-0.5">
                      <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                        <path d="M7.076 21.337H2.47a.641.641 0 01-.633-.74L4.944 2.79a.765.765 0 01.757-.65h7.567c2.559 0 4.363.52 5.359 1.545 1.008 1.04 1.278 2.605.804 4.656a7.73 7.73 0 01-.04.175c-1.052 5.411-4.638 7.277-9.225 7.277H7.877l-.801 5.544z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-stone-800 tracking-wide">Pay with PayPal</p>
                      <p className="text-[10px] text-stone-500 mt-0.5">Pay securely on PayPal in the next step</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-500 leading-relaxed mb-2">
                    Press the payment button below and you will go straight to PayPal. You can return to payment from your order confirmation page.
                  </p>
                  <p className="text-[10px] text-stone-500 leading-relaxed font-semibold">
                    PayPal payments include a 3.5% processing fee. Your updated total is &pound;{orderTotal.toFixed(2)}. To avoid this fee, we recommend paying by Pay by Bank, our free instant bank transfer option.
                  </p>
                </div>
              )}

              {/* Discount code — only available to logged-in account holders */}
              <div className="border border-gold-100 p-4 mb-6">
                <p className="text-[9px] tracking-[0.2em] uppercase text-stone-500 font-semibold mb-3">Discount Code</p>

                {isLoggedIn === null && (
                  // Auth check in flight — show a minimal skeleton to prevent layout shift
                  <div className="h-11 bg-stone-50 border border-stone-100 animate-pulse" />
                )}

                {isLoggedIn === true && (
                  // Logged-in: render the full discount code input
                  <>
                    {appliedDiscount ? (
                      <div className="flex items-center justify-between gap-3 border border-gold-200 bg-gold-50 px-4 py-3">
                        <span className="text-xs text-stone-600">
                          <span className="font-semibold tracking-widest text-gold-700">{appliedDiscount.code}</span>
                          {' '}applied: {discountAmountLabel(appliedDiscount)}
                          {appliedDiscount.scopeType !== 'all' && ` ${discountScopeLabel(appliedDiscount)}`}
                        </span>
                        <button
                          type="button"
                          onClick={removeDiscountCode}
                          className="shrink-0 text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-800 border-b border-transparent hover:border-gold-400 transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {memberWelcomeCode && (
                          // Their own code, offered rather than remembered. One press applies it.
                          <div className="flex items-center justify-between gap-3 border border-gold-200 bg-gold-50/60 px-4 py-3">
                            <span className="text-xs text-stone-600">
                              You have <span className="font-semibold text-gold-700">10% off</span> as a member:
                              {' '}<span className="font-semibold tracking-widest text-gold-700">{memberWelcomeCode}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => applyDiscountCode(memberWelcomeCode)}
                              disabled={discountStatus === 'checking'}
                              className="shrink-0 border border-gold-300 text-gold-700 text-[9px] tracking-[0.18em] uppercase px-4 py-2 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40"
                            >
                              Use it
                            </button>
                          </div>
                        )}
                      <div className="flex flex-col sm:flex-row gap-2.5">
                        <input
                          type="text"
                          value={discountInput}
                          onChange={e => { setDiscountInput(e.target.value); setDiscountStatus('idle'); setDiscountMessage(''); }}
                          placeholder="Enter your code"
                          className="flex-1 border border-stone-200 focus:border-gold-400 outline-none px-4 py-2.5 text-sm tracking-widest text-stone-700 placeholder-stone-500 uppercase bg-white"
                        />
                        <button
                          type="button"
                          onClick={() => applyDiscountCode()}
                          disabled={!discountInput.trim() || discountStatus === 'checking'}
                          className="shrink-0 border border-gold-300 text-gold-700 text-[10px] tracking-[0.2em] uppercase px-6 py-2.5 hover:border-gold-500 hover:bg-gold-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {discountStatus === 'checking' ? 'Checking…' : 'Apply'}
                        </button>
                      </div>
                      </div>
                    )}
                    {discountMessage && (
                      <p className={`text-[10px] mt-2.5 leading-relaxed ${discountStatus === 'invalid' ? 'text-red-500' : 'text-gold-700'}`}>
                        {discountMessage}
                      </p>
                    )}
                  </>
                )}

                {isLoggedIn === false && (
                  // Guest: replace input with an account incentive
                  <div className="space-y-3">
                    <p className="text-xs text-stone-500 leading-relaxed">
                      Log in or create an account to unlock discount codes.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Link
                        href="/account/login"
                        className="flex-1 text-center border border-gold-300 text-gold-700 text-[9px] tracking-[0.2em] uppercase py-2.5 hover:bg-gold-50 hover:border-gold-400 transition-colors"
                      >
                        Log In
                      </Link>
                      <Link
                        href="/account/register"
                        className="flex-1 text-center border border-stone-200 text-stone-500 text-[9px] tracking-[0.2em] uppercase py-2.5 hover:border-gold-300 hover:text-gold-800 transition-colors"
                      >
                        Create Account
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <AccountIncentiveBanner subtotal={totalPrice} saving={memberSaving} className="mb-6" />

              {rafCodeApplied && <p className="mb-4 text-xs text-stone-600">Your personal RAF code is used on its own. Other shop offers are not added to this order.</p>}

              {!rafCodeApplied && <PromotionsAppliedBlock preview={promoPreview} />}

              <div className="bg-stone-50 border border-stone-100 p-4 mb-6 space-y-1">
                <p className="text-[9px] tracking-[0.15em] uppercase text-stone-500 font-semibold mb-2">Order Summary</p>
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">Subtotal</span>
                  <span>&pound;{totalPrice.toFixed(2)}</span>
                </div>
                {ruleDiscountAmount > 0 && (
                  <div className="flex justify-between text-xs text-gold-700">
                    <span>Promotions</span>
                    <span>&minus;&pound;{ruleDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                {appliedDiscount && (
                  <div className="flex justify-between text-xs text-gold-700">
                    <span>Discount ({appliedDiscount.code})</span>
                    <span>&minus;&pound;{discountAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">Shipping ({selectedShipping.label})</span>
                  <span>{baseShippingCost === 0 ? 'Free' : `£${baseShippingCost.toFixed(2)}`}</span>
                </div>
                {shippingDiscountAmount > 0 && (
                  <div className="flex justify-between text-xs text-gold-700">
                    <span>Beauty Card delivery reward</span>
                    <span>&minus;&pound;{shippingDiscountAmount.toFixed(2)}</span>
                  </div>
                )}
                {paymentOption === 'paypal' && (
                  <div className="flex justify-between text-xs">
                    <span className="text-stone-500">PayPal processing fee (3.5%)</span>
                    <span>&pound;{paypalFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-semibold text-gold-700 pt-2 border-t border-stone-200 mt-2">
                  <span>Total</span>
                  <span>&pound;{orderTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* The one thing somebody ticks before they pay. The wording lives in
                  src/lib/complianceConfirmations.ts so the server stores exactly what was shown. */}
              <div className="border border-gold-200 bg-gold-50/40 px-4 py-4 mb-4 space-y-2">
                <p className="text-[9px] tracking-[0.2em] uppercase text-stone-500 font-semibold">
                  Before you pay
                </p>
                {CHECKOUT_CONFIRMATIONS.map(({ id, label, links }) => (
                  <div key={id} className="py-1.5">
                    {/* min-h-11 is 44px, the touch-target floor this site holds itself to
                        everywhere else: this is the one control between somebody and paying. */}
                    <label
                      htmlFor={`checkout-confirm-${id}`}
                      className="flex min-h-11 items-start gap-2.5 py-1 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        id={`checkout-confirm-${id}`}
                        checked={confirmations[id]}
                        onChange={e => setConfirmations(prev => ({ ...prev, [id]: e.target.checked }))}
                        disabled={placingOrder}
                        className="mt-0.5 w-4 h-4 accent-gold-500 shrink-0"
                      />
                      <span className="text-xs text-stone-600 leading-relaxed">{label}</span>
                    </label>
                    {/* THE LINKS SIT OUTSIDE THE TICKABLE SENTENCE, ON THEIR OWN LINE. Inline they
                        were a trap: the whole sentence toggles the box, so a customer aiming at the
                        link got a new tab and NO tick. Reading and agreeing are two different
                        actions and have two different targets. */}
                    <p className="ml-[26px] mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {links.map(link => (
                        <a
                          key={link.href}
                          href={link.href}
                          target="_blank"
                          rel="noopener"
                          className="inline-block text-[11px] underline text-gold-700 hover:text-gold-800"
                        >
                          Read the {link.text}
                        </a>
                      ))}
                    </p>
                  </div>
                ))}
              </div>

              {orderError && (
                <p className="text-xs text-red-500 mb-3">{orderError}</p>
              )}

              {/* Why the Pay button is grey. Without this the button is simply dead and there is
                  nothing on the screen saying what would bring it back. */}
              {!allConfirmed && (
                <p className="text-[10px] text-stone-500 leading-relaxed mb-3">
                  {CHECKOUT_CONFIRMATIONS_ERROR}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('shipping')}
                  disabled={placingOrder}
                  className="flex-1 border border-stone-200 text-stone-500 text-[10px] tracking-[0.18em] uppercase py-3.5 hover:border-gold-300 hover:text-gold-800 transition-colors disabled:opacity-40"
                >
                  Back
                </button>
                <button
                  onClick={handlePay}
                  disabled={placingOrder || !allConfirmed}
                  className={`flex-1 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 transition-colors disabled:bg-stone-200 disabled:text-stone-400 ${paymentOption === 'paypal' ? 'bg-[#0070ba] hover:bg-[#005ea6]' : 'bg-gold-700 hover:bg-gold-800'}`}
                >
                  {placingOrder
                    ? (paymentOption === 'paypal' ? 'Opening PayPal…' : 'Redirecting to Bank…')
                    : (paymentOption === 'paypal' ? `Pay now with PayPal: £${orderTotal.toFixed(2)}` : `Pay £${orderTotal.toFixed(2)}`)}
                </button>
              </div>

              <p className="text-[9px] text-stone-500 text-center mt-4">
                {paymentOption === 'paypal'
                  ? 'You will go straight to PayPal. No payment link email is sent.'
                  : 'You will be redirected to your bank to complete payment securely.'}
              </p>
            </div>
          )}
        </div>

        {/* Sidebar summary */}
        <div>
          <div className="border border-gold-100 p-5 lg:sticky lg:top-24">
            <h3 className="text-[9px] tracking-[0.2em] uppercase text-stone-500 font-semibold mb-4">
              Your Order
            </h3>
            <div className="space-y-3 mb-4">
              {items.map(item => (
                <div key={`${item.productId}-${item.variant}`} className="flex justify-between text-xs gap-3">
                  <span className="text-stone-500 leading-tight">
                    {item.name} ({item.variant}) x{item.quantity}
                  </span>
                  <span className="text-stone-700 font-medium shrink-0">
                    &pound;{(priceForItem(item) * item.quantity).toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
            {!rafCodeApplied && <PromotionsAppliedBlock preview={promoPreview} />}
            <div className="border-t border-gold-100 pt-3 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Subtotal</span>
                <span className="text-stone-700">&pound;{totalPrice.toFixed(2)}</span>
              </div>
              {ruleDiscountAmount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gold-700">Promotions</span>
                  <span className="text-gold-700">&minus;&pound;{ruleDiscountAmount.toFixed(2)}</span>
                </div>
              )}
              {appliedDiscount && (
                <div className="flex justify-between text-xs">
                  <span className="text-gold-700">Discount ({appliedDiscount.code})</span>
                  <span className="text-gold-700">&minus;&pound;{discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                {/* Was "TBC" on the first step, straight after a basket that had just said
                    £10. The price follows the delivery country, so it is known from the start. */}
                <span className="text-stone-500">{selectedShipping.id === 'uk' ? 'UK delivery' : 'International delivery'}</span>
                <span className="text-stone-800 font-semibold">
                  {baseShippingCost === 0 ? 'Free' : `£${baseShippingCost.toFixed(2)}`}
                </span>
              </div>
              {shippingDiscountAmount > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-gold-700">Beauty Card delivery reward</span>
                  <span className="text-gold-700">&minus;&pound;{shippingDiscountAmount.toFixed(2)}</span>
                </div>
              )}
              {step === 'payment' && paymentOption === 'paypal' && (
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">PayPal fee (3.5%)</span>
                  <span className="text-stone-700">&pound;{paypalFee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-semibold text-gold-700 pt-1">
                <span>Total</span>
                <span>&pound;{(step === 'details' ? preFeeTotal : orderTotal).toFixed(2)}</span>
              </div>
              <MemberSavingsNote context="order" showGuest compact className="!mt-3" />
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
