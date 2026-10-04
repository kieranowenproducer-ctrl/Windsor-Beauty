'use client';

import { Suspense, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface PublicOrder {
  orderNumber: string;
  status: string;
  createdAt: string;
  customerName: string;
  shippingAddress: string;
  shippingLabel: string;
  items: { name: string; variant: string; quantity: number; price: number }[];
  subtotal: string;
  discountAmount: string;
  shippingCost: string;
  total: string;
  trackingNumber: string | null;
  trackingUrl: string | null;
}

const STATUS_LABELS: Record<string, { label: string; note: string; color: string }> = {
  pending:            { label: 'Order Received',          note: 'Your order has been received.',                                     color: 'text-stone-500' },
  awaiting_payment:  { label: 'Awaiting Payment',         note: 'Your payment is being processed.',                                  color: 'text-gold-700' },
  payment_failed:    { label: 'Payment Failed',           note: 'Your payment was not completed. Please contact us for assistance.',  color: 'text-red-500' },
  payment_cancelled: { label: 'Payment Cancelled',        note: 'Your payment was cancelled.',                                        color: 'text-stone-500' },
  paid:              { label: 'Payment Confirmed',        note: 'Your payment has been confirmed and your order is being prepared.',  color: 'text-green-600' },
  awaiting_dispatch: { label: 'Preparing Your Order',    note: 'Your order is being packaged and prepared for dispatch.',            color: 'text-gold-700' },
  processing:        { label: 'Processing',              note: 'Your order is being prepared for dispatch.',                         color: 'text-gold-700' },
  exported:          { label: 'Ready for Collection',    note: 'Your order has been handed to Royal Mail for collection.',           color: 'text-gold-700' },
  dispatched:        { label: 'On Its Way',              note: 'Your order has been dispatched via Royal Mail.',                     color: 'text-green-600' },
  delivered:         { label: 'Delivered',               note: 'Your order has been delivered.',                                     color: 'text-green-700' },
  refunded:          { label: 'Refunded',                note: 'This order has been refunded.',                                      color: 'text-stone-500' },
  cancelled:         { label: 'Cancelled',               note: 'This order was cancelled.',                                          color: 'text-stone-500' },
};

function OrderStatusContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderNumber = params.orderNumber as string;

  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [emailInput, setEmailInput] = useState(searchParams.get('email') ?? '');
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    if (email) {
      fetchOrder(email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- looks the order up once, on arrival, using the email already in the URL. Re-running would re-verify the same order on every render.
  }, []);

  async function fetchOrder(emailToVerify: string) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/orders/${encodeURIComponent(orderNumber)}?email=${encodeURIComponent(emailToVerify.trim().toLowerCase())}`
      );
      const data = await res.json().catch(() => null);
      if (res.ok && data?.order) {
        setOrder(data.order);
        setVerified(true);
      } else {
        setError(data?.error || 'Order not found. Please check your email address and order number.');
        setVerified(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setEmail(emailInput);
    fetchOrder(emailInput);
  }

  const statusInfo = order ? (STATUS_LABELS[order.status] ?? { label: order.status, note: '', color: 'text-stone-500' }) : null;

  if (!verified || !order) {
    return (
      <div className="max-w-md mx-auto px-4 sm:px-6 py-20">
        <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-3 text-center">Order Status</p>
        <h1 className="font-serif text-3xl text-stone-800 tracking-wide mb-2 text-center">{orderNumber}</h1>
        <p className="text-xs text-stone-500 text-center mb-8">
          Enter the email address you placed this order with to view your order details.
        </p>
        <form onSubmit={handleVerify} className="space-y-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[9px] tracking-[0.2em] uppercase text-stone-500">Email Address</span>
            <input
              type="email"
              required
              value={emailInput}
              onChange={e => setEmailInput(e.target.value)}
              placeholder="your@email.com"
              className="border border-stone-200 px-3 py-3 text-sm focus:outline-none focus:border-gold-400 transition-colors"
            />
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
          >
            {loading ? 'Checking…' : 'View Order'}
          </button>
        </form>
        <div className="mt-6 text-center">
          <Link href="/account" className="text-[9px] tracking-[0.18em] uppercase text-stone-500 hover:text-gold-800 transition-colors">
            Sign in to view all orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-20">
      <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700 mb-3">Order {order.orderNumber}</p>
      <h1 className="font-serif text-3xl text-stone-800 tracking-wide mb-1">Order Status</h1>
      <p className="text-xs text-stone-500 mb-8">
        Placed {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
      </p>

      {/* Status card */}
      <div className="bg-white border border-stone-200 p-6 mb-6">
        <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-2">Current Status</p>
        <p className={`text-lg font-semibold mb-1 ${statusInfo?.color}`}>{statusInfo?.label}</p>
        <p className="text-xs text-stone-500 leading-relaxed">{statusInfo?.note}</p>

        {order.trackingNumber && (
          <div className="mt-4 border-t border-stone-100 pt-4">
            <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">Tracking</p>
            <p className="text-xs font-mono text-stone-700 mb-1">{order.trackingNumber}</p>
            {order.trackingUrl && (
              <a
                href={order.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[9px] tracking-[0.18em] uppercase text-gold-700 hover:text-gold-800 transition-colors"
              >
                Track on Royal Mail
              </a>
            )}
          </div>
        )}
      </div>

      {/* Items */}
      <div className="bg-white border border-stone-200 p-6 mb-6">
        <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-4">Items Ordered</p>
        <ul className="space-y-3">
          {order.items.map((item, i) => (
            <li key={i} className="flex items-start justify-between gap-4 text-xs">
              <div>
                <p className="font-medium text-stone-700">{item.name}</p>
                {item.variant && <p className="text-stone-500">{item.variant}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-stone-600">x{item.quantity}</p>
                <p className="text-stone-500">&pound;{(item.price * item.quantity).toFixed(2)}</p>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-t border-stone-100 mt-4 pt-4 space-y-1.5">
          <div className="flex justify-between text-xs text-stone-500">
            <span>Subtotal</span>
            <span>&pound;{Number(order.subtotal).toFixed(2)}</span>
          </div>
          {Number(order.discountAmount) > 0 && (
            <div className="flex justify-between text-xs text-green-600">
              <span>Discount</span>
              <span>- &pound;{Number(order.discountAmount).toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs text-stone-500">
            <span>Shipping</span>
            <span>{Number(order.shippingCost) === 0 ? 'Free' : `£${Number(order.shippingCost).toFixed(2)}`}</span>
          </div>
          <div className="flex justify-between text-sm font-semibold text-stone-800 pt-1 border-t border-stone-100">
            <span>Total</span>
            <span>&pound;{Number(order.total).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Delivery address */}
      <div className="bg-white border border-stone-200 p-6 mb-8">
        <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-2">Delivery Address</p>
        <p className="text-xs text-stone-600 whitespace-pre-line leading-relaxed">{order.shippingAddress}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/account"
          className="border border-gold-300 text-gold-700 text-[10px] tracking-[0.22em] uppercase text-center px-6 py-3 hover:border-gold-500 hover:bg-gold-50 transition-colors"
        >
          View All Orders
        </Link>
        <a
          href="mailto:sales@windsorbeauty.is"
          className="border border-stone-200 text-stone-500 text-[10px] tracking-[0.22em] uppercase text-center px-6 py-3 hover:border-gold-300 hover:text-gold-800 transition-colors"
        >
          Contact Support
        </a>
      </div>
    </div>
  );
}

function LoadingShell() {
  return (
    <div className="max-w-md mx-auto px-4 py-24 text-center">
      <p className="text-[9px] tracking-[0.3em] uppercase text-gold-700">Loading…</p>
    </div>
  );
}

export default function OrderStatusPage() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <OrderStatusContent />
    </Suspense>
  );
}
