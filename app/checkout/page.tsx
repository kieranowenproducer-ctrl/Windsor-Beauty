"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import {
  calculateShipping,
  generateOrderNumber,
  saveOrder,
  SHIPPING_OPTIONS,
  FREE_SHIPPING_THRESHOLD,
  type ShippingMethod,
} from "@/lib/orders";
import { formatPrice } from "@/lib/products";

const inputClasses =
  "w-full border border-brand-line bg-white px-4 py-3 text-sm text-brand-charcoal placeholder:text-brand-stone focus:outline-none focus:border-brand-champagne transition-colors";

const labelClasses = "block text-[10px] tracking-widest uppercase text-brand-charcoal mb-2";

export default function CheckoutPage() {
  const router = useRouter();
  const { items, subtotal, clearCart, hydrated } = useCart();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postcode, setPostcode] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("Card");
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod>("standard");
  const [submitting, setSubmitting] = useState(false);

  const freeStandardShipping = subtotal >= FREE_SHIPPING_THRESHOLD;
  const shipping = calculateShipping(subtotal, shippingMethod);
  const total = subtotal + shipping;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;
    setSubmitting(true);

    const orderNumber = generateOrderNumber();
    saveOrder({
      orderNumber,
      items,
      subtotal,
      shipping,
      shippingMethod,
      total,
      customer: { fullName, email, phone, address, city, postcode, notes },
      paymentMethod,
      createdAt: new Date().toISOString(),
    });

    clearCart();
    router.push(`/order-confirmation/${orderNumber}`);
  }

  if (!hydrated) {
    return <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-16" />;
  }

  if (items.length === 0) {
    return (
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-20 text-center">
        <h1 className="font-display text-4xl text-brand-charcoal mb-3">Your Basket is Empty</h1>
        <p className="text-sm text-brand-stone mb-8">Add a few essentials to your basket before checking out.</p>
        <Link
          href="/shop"
          className="inline-block bg-brand-charcoal text-brand-cream text-[10px] tracking-widest uppercase px-7 py-3.5 hover:bg-brand-champagne-dark transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-12 sm:py-16">
      <h1 className="font-display text-4xl sm:text-5xl text-brand-charcoal mb-10">Checkout</h1>

      <form onSubmit={handleSubmit} className="grid lg:grid-cols-3 gap-12">
        {/* Form */}
        <div className="lg:col-span-2 space-y-10">
          <div>
            <h2 className="font-display text-2xl text-brand-charcoal mb-5">Contact Details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="fullName" className={labelClasses}>Full Name</label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClasses}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label htmlFor="email" className={labelClasses}>Email</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClasses}
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label htmlFor="phone" className={labelClasses}>Phone</label>
                <input
                  id="phone"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClasses}
                  placeholder="07123 456789"
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="font-display text-2xl text-brand-charcoal mb-5">Delivery Address</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="address" className={labelClasses}>Address</label>
                <input
                  id="address"
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={inputClasses}
                  placeholder="123 High Street"
                />
              </div>
              <div>
                <label htmlFor="city" className={labelClasses}>Town / City</label>
                <input
                  id="city"
                  type="text"
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClasses}
                  placeholder="London"
                />
              </div>
              <div>
                <label htmlFor="postcode" className={labelClasses}>Postcode</label>
                <input
                  id="postcode"
                  type="text"
                  required
                  value={postcode}
                  onChange={(e) => setPostcode(e.target.value)}
                  className={inputClasses}
                  placeholder="SW1A 1AA"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="notes" className={labelClasses}>Order Notes (Optional)</label>
                <textarea
                  id="notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className={inputClasses}
                  placeholder="Delivery instructions, safe place, etc."
                />
              </div>
            </div>
          </div>

          <div>
            <h2 className="font-display text-2xl text-brand-charcoal mb-5">Delivery Options</h2>
            <div className="space-y-3">
              {SHIPPING_OPTIONS.map((option) => {
                const cost = calculateShipping(subtotal, option.id);
                const isFree = option.id === "standard" && freeStandardShipping;
                return (
                  <label
                    key={option.id}
                    className={`flex items-center justify-between gap-3 border px-4 py-3.5 cursor-pointer transition-colors ${
                      shippingMethod === option.id
                        ? "border-brand-champagne bg-brand-sand/40"
                        : "border-brand-line hover:border-brand-champagne"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="shippingMethod"
                        value={option.id}
                        checked={shippingMethod === option.id}
                        onChange={() => setShippingMethod(option.id)}
                        className="accent-brand-champagne-dark"
                      />
                      <span>
                        <span className="block text-sm text-brand-charcoal">{option.label}</span>
                        <span className="block text-xs text-brand-stone mt-0.5">{option.description}</span>
                      </span>
                    </span>
                    <span className="text-sm font-medium text-brand-charcoal shrink-0">
                      {isFree ? "Free" : formatPrice(cost)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <h2 className="font-display text-2xl text-brand-charcoal mb-5">Payment Method</h2>
            <div className="space-y-3">
              {["Card", "PayPal"].map((method) => (
                <label
                  key={method}
                  className={`flex items-center gap-3 border px-4 py-3.5 cursor-pointer transition-colors ${
                    paymentMethod === method
                      ? "border-brand-champagne bg-brand-sand/40"
                      : "border-brand-line hover:border-brand-champagne"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value={method}
                    checked={paymentMethod === method}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="accent-brand-champagne-dark"
                  />
                  <span className="text-sm text-brand-charcoal">{method}</span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-brand-stone leading-relaxed">
              Payment details will be collected securely once payment processing is enabled.
              Your order will be confirmed by email.
            </p>
          </div>
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="border border-brand-line p-6 sticky top-24">
            <h2 className="text-[10px] tracking-widest uppercase text-brand-charcoal mb-5">Order Summary</h2>

            <div className="divide-y divide-brand-line mb-4">
              {items.map((item) => (
                <div key={item.slug} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div>
                    <p className="text-brand-charcoal">{item.name}</p>
                    <p className="text-xs text-brand-stone">{item.size} &middot; Qty {item.quantity}</p>
                  </div>
                  <span className="text-brand-charcoal shrink-0">{formatPrice(item.price * item.quantity)}</span>
                </div>
              ))}
            </div>

            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between text-brand-stone">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-brand-stone">
                <span>Shipping</span>
                <span>{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-brand-line flex items-center justify-between">
              <span className="text-sm font-medium text-brand-charcoal">Total</span>
              <span className="text-lg font-medium text-brand-charcoal">{formatPrice(total)}</span>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 w-full text-center bg-brand-charcoal text-brand-cream text-[10px] tracking-widest uppercase px-7 py-3.5 hover:bg-brand-champagne-dark transition-colors disabled:opacity-60"
            >
              {submitting ? "Placing Order..." : "Place Order"}
            </button>
            <Link
              href="/cart"
              className="mt-3 block text-center text-[10px] tracking-widest uppercase text-brand-stone hover:text-brand-charcoal transition-colors"
            >
              Back to Basket
            </Link>
          </div>
        </div>
      </form>
    </div>
  );
}
