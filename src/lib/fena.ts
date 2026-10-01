import { findOrderByNumber, updateOrderFenaPaymentId, type OrderRow } from '@/lib/db';
import type { Product } from '@/data/products';
import { getProductsBySlug } from './shipping';
import { outboundItemName, logGenericNameAudit, type GenericNameAudit } from './genericNames';

// Fena Toolkit API — shared by the live checkout's /api/payment/fena/create
// route and the invoice "Send Invoice" flow. Both only ever need an
// `orderNumber`; everything else (amount, address, items) is read straight
// off the existing `orders` row, so this works identically for a checkout
// order or an invoice-created order with zero special-casing.
//
//   POST https://epos.api.prod-gcp.fena.co/open/payments/single/create-and-process
//   Headers: integration-id + secret-key
//   Response: { result: { link: "https://..." } }
//
// Required env vars:
//   FENA_API_KEY    — Integration ID (Terminal ID in Fena dashboard)
//   FENA_API_SECRET — Secret Key (Terminal Secret in Fena dashboard)
//   NEXT_PUBLIC_SITE_URL — e.g. https://www.windsorbeauty.co.uk
export type CreateFenaPaymentLinkResult =
  | { ok: true; paymentUrl: string; fenaPaymentId: string | null }
  // `error` is always safe to show a customer (generic). `detail` is the
  // specific technical reason (e.g. Fena's own validation message) — surface
  // it to the admin panel and logs only, never to a public checkout page.
  | { ok: false; error: string; detail?: string; status: number };

// Deliberately permissive — this is a fast local pre-check to catch the obvious
// breakers (missing @, no TLD, embedded spaces) with a clear message before we
// spend a Fena round trip. Fena remains the authoritative validator; this just
// stops a malformed address reaching it and coming back as a generic 400. This
// exists because a real invoice (#30, 2026-07-06) was saved with a malformed
// customer email and Fena rejected every send with
// `customerEmail: Incorrect email`, which surfaced only as "check Fena is configured".
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// `items[].name` carries a GENERIC description, never the real product name or
// dosage — see src/lib/genericNames.ts. `productsBySlug` is the merged catalogue;
// a slug missing from it is safe (it falls back to a generic default, never the
// real name), which is why an empty map is an acceptable argument.
export function buildFenaPayload(order: OrderRow, siteUrl: string, productsBySlug: Map<string, Product>) {
  const audits: GenericNameAudit[] = [];
  const items = order.items.map(i => {
    // A missing slug is normal — bespoke invoice lines have no catalogue entry.
    // Falls back to the generic default, never the real name.
    const { name, audit } = outboundItemName(i.slug ? productsBySlug.get(i.slug) : undefined, {
      slug: i.slug ?? '(bespoke/no-slug)',
      realName: `${i.name}${i.variant ? ` (${i.variant})` : ''}`,
      destination: 'fena',
      // A Trial line must carry the same permanent Product code on the
      // payment provider's item list as on its invoice and shipment.
      fulfilmentRef: i.fulfilmentRef,
    });
    audits.push(audit);
    return { name, quantity: i.quantity, price: Number(i.price).toFixed(2) };
  });
  logGenericNameAudit(order.order_number, audits);

  return {
    reference:       order.order_number,
    amount:          Number(order.total).toFixed(2),
    customerEmail:   order.email.trim(),
    customerName:    order.customer_name.trim(),
    customRedirectUrl: `${siteUrl}/checkout/success?order=${order.order_number}`,
    items,
    deliveryAddress: {
      line1:    order.shipping_line1 ?? '',
      line2:    order.shipping_line2 ?? '',
      city:     order.shipping_city  ?? '',
      postcode: order.shipping_postcode ?? '',
      country:  order.shipping_country  ?? 'GB',
    },
  };
}

export async function createFenaPaymentLink(orderNumber: string): Promise<CreateFenaPaymentLinkResult> {
  const integrationId = process.env.FENA_API_KEY;
  const secretKey      = process.env.FENA_API_SECRET;
  const siteUrl         = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.windsorbeauty.co.uk';

  if (!integrationId || !secretKey) {
    // Name the exact missing var(s) so the admin sees "Missing FENA_API_KEY in
    // this environment" rather than a vague "not configured". `error` stays
    // customer-safe; `detail` is admin/log only. (In production both are set —
    // confirmed via `vercel env ls` — so this branch is for a genuinely
    // unconfigured environment, e.g. local dev without the keys.)
    const missing = [
      !integrationId ? 'FENA_API_KEY' : null,
      !secretKey ? 'FENA_API_SECRET' : null,
    ].filter(Boolean).join(' and ');
    return {
      ok: false,
      error: 'Payment is not configured. Please contact us to complete your order.',
      detail: `Missing ${missing} in this environment — set it in the Fena section of the environment config.`,
      status: 503,
    };
  }

  const order = await findOrderByNumber(orderNumber);
  if (!order) {
    return { ok: false, error: 'Order not found', status: 404 };
  }

  // Defensive pre-check — Fena hard-rejects a malformed customerEmail with a
  // generic 400, so catch it here with a specific, actionable message instead
  // of burning a round trip and reporting a vague "payment provider error".
  const email = order.email?.trim() ?? '';
  if (!isValidEmail(email)) {
    return {
      ok: false,
      error: 'The customer email address is not valid. Please correct it and try again.',
      detail: `Customer email failed validation before Fena: "${order.email ?? ''}" (order ${order.order_number})`,
      status: 400,
    };
  }

  // Merged catalogue, used only to look up each line's generic outbound name.
  // If this lookup fails we deliberately continue with an EMPTY map rather than
  // failing the payment: an empty map makes every item fall back to the generic
  // default, which is safe. It can never fall back to the real name. A customer
  // must not be blocked from paying because a catalogue read hiccuped.
  let productsBySlug = new Map<string, Product>();
  try {
    productsBySlug = await getProductsBySlug();
  } catch (err) {
    console.error('[fena] catalogue lookup failed; falling back to generic default names', err);
  }

  let paymentUrl: string;
  let fenaPaymentId: string | null = null;

  try {
    const res = await fetch(
      'https://epos.api.prod-gcp.fena.co/open/payments/single/create-and-process',
      {
        method:  'POST',
        headers: {
          'Content-Type':   'application/json',
          'integration-id': integrationId,
          'secret-key':     secretKey,
        },
        body: JSON.stringify(buildFenaPayload(order, siteUrl, productsBySlug)),
      }
    );

    const data = await res.json().catch(() => null);

    if (!res.ok || !data?.result?.link) {
      console.error('[fena] API error:', res.status, JSON.stringify(data));
      // Fena returns a human-readable validation reason on 4xx (e.g.
      // "customerEmail: Incorrect email"). Pass it through as `detail` so the
      // admin panel can show the actual cause; keep `error` customer-safe.
      const fenaMessage = typeof data?.message === 'string' ? data.message : undefined;
      return {
        ok: false,
        error: 'Payment provider error. Please try again or contact us.',
        detail: fenaMessage ? `Fena rejected the request (HTTP ${res.status}): ${fenaMessage}` : `Fena returned HTTP ${res.status}.`,
        status: 502,
      };
    }

    paymentUrl    = data.result.link;
    fenaPaymentId = data.result?.id ?? data.result?.paymentId ?? data.id ?? null;
  } catch (err) {
    console.error('[fena] Fetch error:', err);
    return { ok: false, error: 'Could not reach payment provider. Please try again.', status: 502 };
  }

  await updateOrderFenaPaymentId(order.order_number, fenaPaymentId, paymentUrl).catch(() => {});

  return { ok: true, paymentUrl, fenaPaymentId };
}
