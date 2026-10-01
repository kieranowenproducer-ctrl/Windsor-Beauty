// Royal Mail Click & Drop API client — creates shipments and fetches
// printable labels/customs documents. Requires a Click & Drop business
// account with API access enabled (Settings -> Integrations -> Click & Drop
// API) and the resulting key set as ROYAL_MAIL_API_KEY in the environment.
//
// Docs: https://api.parcel.royalmail.com/ (OpenAPI explorer + sandbox).
// Schema below follows the confirmed v1 CreateOrdersRequest/OrdersResponse —
// `recipient.phoneNumber`/`recipient.emailAddress` are siblings of
// `recipient.address` (not nested inside it), and
// `packages[].packageFormatIdentifier` is a lowercase enum
// (parcel/letter/largeLetter/smallParcel/mediumParcel/largeParcel/documents).

import type { CustomsCategory, PackageFormat } from '@/data/products';

const DEFAULT_BASE_URL = 'https://api.parcel.royalmail.com/api/v1';

function baseUrl(): string {
  return process.env.ROYAL_MAIL_API_BASE_URL || DEFAULT_BASE_URL;
}

export function isRoyalMailConfigured() {
  return Boolean(process.env.ROYAL_MAIL_API_KEY);
}

// True when ROYAL_MAIL_API_BASE_URL has not been overridden — i.e. the
// configured key talks to Royal Mail's live Click & Drop API, so creating a
// label here creates a real shipment and may incur real postage costs.
export function isRoyalMailLiveMode(): boolean {
  return !process.env.ROYAL_MAIL_API_BASE_URL;
}

function requireApiKey() {
  const key = process.env.ROYAL_MAIL_API_KEY;
  if (!key) throw new Error('Royal Mail is not configured — set ROYAL_MAIL_API_KEY in environment variables');
  return key;
}

// Maps the shipping options a customer can pick at checkout (see
// SHIPPING_OPTIONS in src/app/checkout/page.tsx and ShippingService in
// src/data/products.ts) to Royal Mail Click & Drop service register codes
// for this account (Settings -> Shipping services).
// Every UK parcel ships as Royal Mail Tracked 24 (Kieran, 2026-07-17), whatever
// shipping option the customer chose at checkout — so 'uk-standard' and
// 'uk-express' both map to the Tracked 24 service code (TOLP24). Only
// international uses a different service.
export const SERVICE_CODES: Record<string, { code: string; label: string }> = {
  'uk-standard': { code: 'TOLP24', label: 'Royal Mail Tracked 24' },
  'uk-express': { code: 'TOLP24', label: 'Royal Mail Tracked 24' },
  international: { code: 'ITROLP', label: 'Royal Mail International Tracked' },
};

// Thrown on any Royal Mail API failure (HTTP-level or per-order validation
// errors). `code`/`fields` come straight from Royal Mail's error payload so
// the admin can see exactly what was rejected — never includes the API key
// or any other credential. `rawResponse` is the parsed JSON body Royal Mail
// actually returned, stored internally (never shown verbatim to the
// customer) so a real failure can be diagnosed later instead of just
// reading a generic message.
export class RoyalMailApiError extends Error {
  code?: string;
  fields?: string[];
  rawResponse?: unknown;
  constructor(message: string, code?: string, fields?: string[], rawResponse?: unknown) {
    super(message);
    this.name = 'RoyalMailApiError';
    this.code = code;
    this.fields = fields;
    this.rawResponse = rawResponse;
  }
}

// Thrown when Royal Mail has accepted/created an order (it has a real
// orderIdentifier and exists in Click & Drop) but has not produced a
// tracking number — either because label generation failed for a reported
// reason (`labelErrors`), or because an order with this exact reference was
// already sitting in Click & Drop from an earlier attempt. Carrying
// `orderIdentifier` here is the fix for the duplicate-order bug: the caller
// must persist it even though this is an "error" outcome, so a future retry
// looks the existing order up instead of blindly creating another one.
export class RoyalMailPendingPostageError extends RoyalMailApiError {
  orderIdentifier: string;
  constructor(message: string, orderIdentifier: string, rawResponse?: unknown) {
    super(message, 'PENDING_POSTAGE', undefined, rawResponse);
    this.name = 'RoyalMailPendingPostageError';
    this.orderIdentifier = orderIdentifier;
  }
}

export interface ShipmentAddress {
  fullName: string;
  line1: string;
  line2?: string | null;
  line3?: string | null;
  city: string;
  postcode: string;
  countryCode: string;
  phone?: string | null;
  email?: string | null;
}

export interface ShipmentContentItem {
  name: string;
  sku?: string;
  quantity: number;
  unitValue: number;
  unitWeightInGrams: number;
  // Customs fields — only meaningful for international shipments, but safe
  // to include for any order since Royal Mail ignores them for UK parcels.
  customsDescription?: string;
  customsCode?: string;
  originCountryCode?: string;
  customsDeclarationCategory?: CustomsCategory;
}

export interface CreateShipmentParams {
  orderReference: string;
  orderDate: string; // ISO 8601
  recipient: ShipmentAddress;
  weightInGrams: number;
  packageFormat: PackageFormat;
  dimensions?: { heightMm: number; widthMm: number; depthMm: number };
  serviceCode: string;
  subtotal: number;
  shippingCostCharged: number;
  total: number;
  currencyCode?: string;
  items: ShipmentContentItem[];
  /** When true, requests a CN22/CN23 customs declaration be generated alongside the label. */
  international?: boolean;
}

export interface CreatedShipment {
  orderIdentifier: string;
  trackingNumber: string;
  trackingUrl: string;
}

// Builds the Royal Mail public tracking page URL for a tracking number —
// shared by the dispatch tracking email and the admin orders UI so both
// link to the same place.
export function buildTrackingUrl(trackingNumber: string): string {
  return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(trackingNumber)}`;
}

async function royalMailFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireApiKey()}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    cache: 'no-store',
  });
  return res;
}

interface ExistingOrderLookup {
  orderIdentifier: string;
  trackingNumber: string | null;
}

// Looks up whether an order with this exact orderReference already exists
// in Click & Drop — GET /orders/{orderIdentifiers} accepts an order
// reference in place of a numeric identifier (quoted, per Royal Mail's
// documented syntax). Used by createShipmentOrder to avoid ever creating a
// second Royal Mail order for the same Windsor Glow order: Royal Mail does
// NOT enforce orderReference uniqueness on its side, so without this check
// a retried "Create Label" click after a failed attempt silently creates a
// brand new duplicate shipment every time. Returns null on a clean "not
// found" — any other failure is swallowed (returns null) so a transient
// lookup error never blocks a genuinely new order from being created.
async function getOrderByReference(orderReference: string): Promise<ExistingOrderLookup | null> {
  try {
    const quotedRef = encodeURIComponent(`"${orderReference}"`);
    const res = await royalMailFetch(`/orders/${quotedRef}`, { method: 'GET' });
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    const orders: Array<Record<string, any>> = Array.isArray(data) ? data : Array.isArray(data?.orders) ? data.orders : [];
    if (orders.length === 0) return null;

    // Multiple historical duplicates can exist under the same reference
    // (the exact bug this lookup prevents going forward) — prefer one that
    // already has a tracking number; otherwise take the most recently
    // created so a retry's error message points at the latest attempt.
    const withTracking = orders.find((o) => o?.trackingNumber || o?.packages?.[0]?.trackingNumber);
    const chosen = withTracking ?? orders.reduce((latest, o) =>
      !latest || new Date(String(o.createdOn)) > new Date(String(latest.createdOn)) ? o : latest
    );

    if (!chosen?.orderIdentifier) return null;
    const trackingNumber = chosen.trackingNumber ?? chosen.packages?.[0]?.trackingNumber ?? null;
    return { orderIdentifier: String(chosen.orderIdentifier), trackingNumber: trackingNumber ? String(trackingNumber) : null };
  } catch {
    return null;
  }
}

// Creates a single shipment order in Click & Drop and returns the
// identifiers needed to print its label and track it. Throws
// RoyalMailApiError with Royal Mail's own error message on failure so the
// admin sees the real reason (e.g. "postcode is invalid", "serviceCode not
// available on this account") — the caller is responsible for persisting
// `error.message` against the order and never logging the API key.
//
// Throws RoyalMailPendingPostageError (not a plain RoyalMailApiError) when
// Royal Mail has accepted/created the order but no tracking number exists
// yet — the caller MUST still persist that error's `orderIdentifier` against
// the order, otherwise the next retry has no way to know an order already
// exists and will create a duplicate.
export async function createShipmentOrder(params: CreateShipmentParams): Promise<CreatedShipment> {
  // Check for an existing order under this reference first — see
  // getOrderByReference's comment for why this matters.
  const existing = await getOrderByReference(params.orderReference);
  if (existing) {
    if (existing.trackingNumber) {
      return {
        orderIdentifier: existing.orderIdentifier,
        trackingNumber: existing.trackingNumber,
        trackingUrl: buildTrackingUrl(existing.trackingNumber),
      };
    }
    throw new RoyalMailPendingPostageError(
      `An order for this reference already exists in Royal Mail Click & Drop (order ${existing.orderIdentifier}) but has not been assigned a tracking number yet. Check the order in Click & Drop directly — it may need postage applied manually, or may still be processing.`,
      existing.orderIdentifier
    );
  }

  const recipient: Record<string, unknown> = {
    address: {
      fullName: params.recipient.fullName,
      addressLine1: params.recipient.line1,
      addressLine2: params.recipient.line2 || undefined,
      addressLine3: params.recipient.line3 || undefined,
      city: params.recipient.city,
      postcode: params.recipient.postcode,
      countryCode: params.recipient.countryCode,
    },
  };
  if (params.recipient.phone) recipient.phoneNumber = params.recipient.phone;
  if (params.recipient.email) recipient.emailAddress = params.recipient.email;

  const pkg: Record<string, unknown> = {
    weightInGrams: params.weightInGrams,
    packageFormatIdentifier: params.packageFormat,
    contents: params.items.map((item) => ({
      name: item.name,
      SKU: item.sku || undefined,
      quantity: item.quantity,
      unitValue: item.unitValue,
      unitWeightInGrams: item.unitWeightInGrams,
      customsDescription: item.customsDescription || undefined,
      customsCode: item.customsCode || undefined,
      originCountryCode: item.originCountryCode || undefined,
      customsDeclarationCategory: item.customsDeclarationCategory || undefined,
    })),
  };
  if (params.dimensions) {
    pkg.dimensions = {
      heightInMms: params.dimensions.heightMm,
      widthInMms: params.dimensions.widthMm,
      depthInMms: params.dimensions.depthMm,
    };
  }

  const order: Record<string, unknown> = {
    orderReference: params.orderReference,
    orderDate: params.orderDate,
    recipient,
    subtotal: params.subtotal,
    shippingCostCharged: params.shippingCostCharged,
    total: params.total,
    currencyCode: params.currencyCode || 'GBP',
    packages: [pkg],
    postageDetails: {
      serviceCode: params.serviceCode,
    },
  };

  if (process.env.ROYAL_MAIL_TRADING_NAME) {
    order.sender = { tradingName: process.env.ROYAL_MAIL_TRADING_NAME };
  }

  // CN22/CN23 customs documentation — only requested for international
  // shipments. `includeLabelInResponse: false` keeps the response small
  // since the label is fetched separately via /orders/{id}/label.
  if (params.international) {
    order.label = { includeLabelInResponse: false, includeCN: true };
  }

  const res = await royalMailFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({ items: [order] }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = data?.errors?.[0]?.errorMessage || data?.title || `Royal Mail rejected the request (HTTP ${res.status})`;
    throw new RoyalMailApiError(message, data?.errors?.[0]?.errorCode, data?.errors?.[0]?.fields, data);
  }

  const failed = data?.failedOrders?.[0];
  if (failed) {
    const firstError = failed.errors?.[0];
    const message = firstError?.errorMessage || 'Royal Mail rejected this order.';
    throw new RoyalMailApiError(message, firstError?.errorCode, firstError?.fields, data);
  }

  const created = data?.createdOrders?.[0];
  const orderIdentifier = created?.orderIdentifier;
  const trackingNumber = created?.trackingNumber ?? created?.packages?.[0]?.trackingNumber;

  if (!orderIdentifier) {
    // Nothing usable came back at all — genuinely unexpected, no order to
    // retry against, so this stays a plain (non-pending) error.
    throw new RoyalMailApiError('Royal Mail accepted the request but did not return an order identifier.', undefined, undefined, data);
  }

  if (!trackingNumber) {
    // The order WAS created in Click & Drop (it has a real orderIdentifier)
    // but no tracking number came back. `labelErrors` is where Royal Mail
    // actually explains why label/postage generation failed — surface that
    // verbatim instead of a generic message. The orderIdentifier must be
    // returned to the caller via RoyalMailPendingPostageError so it gets
    // persisted and a retry doesn't create a second duplicate order.
    const labelErrors = Array.isArray(created?.labelErrors) ? created.labelErrors : [];
    const reason = labelErrors.length > 0
      ? labelErrors.map((e: { message?: string; code?: string }) => e?.message || e?.code).filter(Boolean).join('; ')
      : null;
    const message = reason
      ? `Royal Mail created order ${orderIdentifier} but could not generate a label: ${reason}`
      : `Royal Mail created order ${orderIdentifier} but has not assigned a tracking number yet. It may need postage applied manually in Click & Drop, or may still be processing.`;
    throw new RoyalMailPendingPostageError(message, String(orderIdentifier), data);
  }

  return {
    orderIdentifier: String(orderIdentifier),
    trackingNumber: String(trackingNumber),
    trackingUrl: buildTrackingUrl(String(trackingNumber)),
  };
}

export type LabelDocumentType = 'postageLabel' | 'despatchNote' | 'CN22' | 'CN23';

// Fetches a printable PDF document (postage label, despatch note, or CN22/CN23
// customs declaration) for a previously created shipment.
export async function fetchShipmentLabel(
  orderIdentifier: string,
  documentType: LabelDocumentType = 'postageLabel'
): Promise<ArrayBuffer> {
  const params = new URLSearchParams({ documentType });
  if (documentType === 'postageLabel') params.set('includeReturnsLabel', 'false');

  const res = await royalMailFetch(
    `/orders/${encodeURIComponent(orderIdentifier)}/label?${params.toString()}`,
    { method: 'GET', headers: { Accept: 'application/pdf' } }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.errors?.[0]?.errorMessage || `Royal Mail could not generate the document (HTTP ${res.status})`;
    throw new RoyalMailApiError(message, data?.errors?.[0]?.errorCode);
  }

  return res.arrayBuffer();
}

/* ── What Royal Mail can tell us about a parcel already sent (task d912f632) ──────────────────── */

/**
 * WHAT THIS IS, AND JUST AS IMPORTANTLY WHAT IT IS NOT.
 *
 * Kieran asked for a button that shows whether each parcel has been delivered. It cannot, and the
 * reason is not a shortcut: this shop is connected to Royal Mail's Click & Drop, which is their
 * DESPATCH system. Asked about a real dispatched order it returns exactly orderIdentifier,
 * orderReference, createdOn, orderDate, printedOn, shippedOn, trackingNumber and packages, and no
 * delivery status of any kind. Three other likely tracking paths on that API return 404. Delivery
 * status lives in Royal Mail's separate Tracking API, which refused this shop's key outright.
 *
 * So this reports the two things Royal Mail genuinely knows: whether it has PRINTED the label, and
 * whether it has TAKEN the parcel. Nothing here ever says delivered or in transit, and the screen
 * says out loud that it does not know those. A tracking feature that quietly guesses is worse than
 * no tracking feature, because it gets believed.
 *
 * ONE CALL FOR THE WHOLE SHOP. The orders list returns every order together, so pressing the button
 * makes a single request no matter how many orders there are, rather than one request per parcel.
 * That is the difference between a button that answers in a second and one that hammers Royal Mail
 * and takes minutes.
 */
export interface RoyalMailParcelState {
  /** The Windsor Glow order number. Royal Mail stores it as the order reference. */
  orderReference: string;
  trackingNumber: string | null;
  /** When Royal Mail printed the label. Null means it has not. */
  printedOn: string | null;
  /** When Royal Mail took the parcel. Null means it has not, whatever the shop's own status says. */
  shippedOn: string | null;
}

export async function fetchRoyalMailParcelStates(): Promise<RoyalMailParcelState[]> {
  // No query parameters, and that is measured rather than lazy. Click & Drop rejects `pageSize`
  // outright with a 400, and `page` is accepted and then ignored: page 1, 2 and 3 all return the
  // same rows. What comes back is the 25 most recent orders on the account, and there is no
  // parameter found that gets past that.
  //
  // So this refreshes the RECENT parcels, not every parcel ever sent, and the screen says so. That
  // is the right trade for what the button is for, which is seeing what still needs doing: an order
  // from three months ago is finished and nobody is chasing it. Fetching the rest would mean one
  // request per order against a live carrier API, for an answer nobody is waiting on.
  const res = await royalMailFetch('/orders', { method: 'GET' });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.errors?.[0]?.errorMessage || `Royal Mail would not answer (HTTP ${res.status})`;
    throw new RoyalMailApiError(message, data?.errors?.[0]?.errorCode);
  }

  const data = await res.json().catch(() => null);
  const orders: Array<Record<string, unknown>> = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown> | null)?.orders)
      ? ((data as Record<string, unknown>).orders as Array<Record<string, unknown>>)
      : [];

  const states: RoyalMailParcelState[] = [];
  for (const order of orders) {
    const reference = String(order?.orderReference ?? '').trim();
    // No reference, no way to know whose parcel it is. Skipped rather than guessed at.
    if (!reference) continue;
    const tracking = String(order?.trackingNumber ?? '').trim();
    states.push({
      orderReference: reference,
      trackingNumber: tracking || null,
      printedOn: order?.printedOn ? String(order.printedOn) : null,
      shippedOn: order?.shippedOn ? String(order.shippedOn) : null,
    });
  }
  return states;
}

/**
 * The two facts, turned into the words the Orders screen shows.
 *
 * Deliberately never "delivered" and never "in transit". "Royal Mail has the parcel" is the
 * furthest this can honestly go, because it is the last thing Royal Mail tells us.
 */
export function describeParcelState(state: Pick<RoyalMailParcelState, 'printedOn' | 'shippedOn'> | null): string {
  if (!state) return 'Royal Mail has no record of this one.';
  if (state.shippedOn) return 'Royal Mail has the parcel.';
  if (state.printedOn) return 'Royal Mail has printed the label, but has not taken the parcel yet.';
  return 'Royal Mail has the order, but has not printed a label yet.';
}
