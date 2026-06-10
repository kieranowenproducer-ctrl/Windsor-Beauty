"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { getOrder, type OrderDetails } from "@/lib/orders";
import { formatPrice } from "@/lib/products";

export default function OrderConfirmationPage({ params }: { params: { orderNumber: string } }) {
  const [order, setOrder] = useState<OrderDetails | null | undefined>(undefined);

  useEffect(() => {
    setOrder(getOrder(params.orderNumber) ?? null);
  }, [params.orderNumber]);

  if (order === undefined) {
    return <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-16" />;
  }

  if (order === null) {
    return (
      <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-20 text-center">
        <h1 className="font-display text-4xl text-brand-charcoal mb-3">Order Not Found</h1>
        <p className="text-sm text-brand-stone mb-8">
          We could not find this order. It may have been placed on a different device or browser.
        </p>
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
    <div className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-10 py-16 sm:py-20">
      <div className="max-w-2xl mx-auto text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-sand">
          <CheckCircle2 className="h-7 w-7 text-brand-champagne-dark" strokeWidth={1.5} />
        </span>
        <p className="mt-6 text-[10px] tracking-ultra-wide uppercase text-brand-champagne-dark">
          Order {order.orderNumber}
        </p>
        <h1 className="mt-2 font-display text-4xl sm:text-5xl text-brand-charcoal">
          Thank You, {order.customer.fullName.split(" ")[0]}.
        </h1>
        <p className="mt-4 text-sm text-brand-stone leading-relaxed">
          Your order has been received. A confirmation email will be sent to{" "}
          <span className="text-brand-charcoal">{order.customer.email}</span> once payment has been processed.
        </p>
      </div>

      <div className="mt-12 max-w-2xl mx-auto border border-brand-line p-6 sm:p-8">
        <div className="flex items-center justify-between pb-4 border-b border-brand-line">
          <h2 className="font-display text-2xl text-brand-charcoal">Order Summary</h2>
          <span className="text-xs text-brand-stone">
            {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>

        <div className="divide-y divide-brand-line">
          {order.items.map((item) => (
            <div key={item.slug} className="py-4 flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="text-brand-charcoal">{item.name}</p>
                <p className="text-xs text-brand-stone">{item.size} &middot; Qty {item.quantity}</p>
              </div>
              <span className="text-brand-charcoal shrink-0">{formatPrice(item.price * item.quantity)}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-brand-line space-y-2.5 text-sm">
          <div className="flex items-center justify-between text-brand-stone">
            <span>Subtotal</span>
            <span>{formatPrice(order.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-brand-stone">
            <span>Shipping</span>
            <span>{order.shipping === 0 ? "Free" : formatPrice(order.shipping)}</span>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-brand-line">
            <span className="text-sm font-medium text-brand-charcoal">Total</span>
            <span className="text-lg font-medium text-brand-charcoal">{formatPrice(order.total)}</span>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-brand-line grid sm:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-[10px] tracking-widest uppercase text-brand-charcoal mb-2">Delivery Address</p>
            <p className="text-brand-stone leading-relaxed">
              {order.customer.fullName}
              <br />
              {order.customer.address}
              <br />
              {order.customer.city}, {order.customer.postcode}
            </p>
          </div>
          <div>
            <p className="text-[10px] tracking-widest uppercase text-brand-charcoal mb-2">Payment Method</p>
            <p className="text-brand-stone">{order.paymentMethod}</p>
            {order.customer.notes && (
              <>
                <p className="text-[10px] tracking-widest uppercase text-brand-charcoal mt-4 mb-2">Order Notes</p>
                <p className="text-brand-stone leading-relaxed">{order.customer.notes}</p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-10 text-center">
        <Link
          href="/shop"
          className="inline-block bg-brand-charcoal text-brand-cream text-[10px] tracking-widest uppercase px-7 py-3.5 hover:bg-brand-champagne-dark transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
