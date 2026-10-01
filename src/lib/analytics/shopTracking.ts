'use client';

import { queueTrackingEvent } from './trackingQueue';

export const VISIT_ID_KEY = 'wb_visit_id';

export function getVisitId(): string {
  try {
    const existing = sessionStorage.getItem(VISIT_ID_KEY);
    if (existing) return existing;
    const id = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(VISIT_ID_KEY, id);
    return id;
  } catch {
    return '';
  }
}

export type ShopActionKind = NonNullable<import('./trackingQueue').TrackingEvent['kind']>;

/** Record only useful buying signals, never every small interface click. */
export function trackShopAction(kind: ShopActionKind, productSlug?: string, quantity = 1): void {
  queueTrackingEvent({
    kind,
    path: window.location.pathname,
    visit_id: getVisitId(),
    product_slug: productSlug,
    quantity,
  });
}
