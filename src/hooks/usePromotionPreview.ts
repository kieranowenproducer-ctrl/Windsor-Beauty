'use client';

import { useEffect, useState } from 'react';
import type { CartItem } from '@/contexts/CartContext';

export interface AppliedRuleSummary {
  ruleId: number;
  name: string;
  type: string;
  description: string;
  discountAmount: number;
}

export interface FreeItemAward {
  slug: string;
  dosage: string;
  name: string;
  price: number;
  quantity: number;
}

export interface PromotionPreview {
  subtotal: number;
  ruleDiscountAmount: number;
  subtotalAfterRules: number;
  appliedRules: AppliedRuleSummary[];
  freeItems: FreeItemAward[];
}

// Debounced preview of automatic promotion rules for the current basket:
// shared by the cart and checkout pages so both show the same figures.
export function usePromotionPreview(items: CartItem[], enabled = true): PromotionPreview | null {
  const key = JSON.stringify(items.map(item => ({ slug: item.slug, variant: item.variant, quantity: item.quantity })));
  const [result, setResult] = useState<{ key: string; preview: PromotionPreview } | null>(null);

  useEffect(() => {
    if (!items.length || !enabled) {
      return;
    }
    let cancelled = false;

    const handle = setTimeout(() => {
      fetch('/api/cart/promotion-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({ slug: item.slug, variant: item.variant, quantity: item.quantity })),
        }),
      })
        .then(res => { if (!res.ok) throw new Error('Savings could not be checked'); return res.json(); })
        .then((data: PromotionPreview) => {
          if (!Number.isFinite(data.subtotal) || !Number.isFinite(data.subtotalAfterRules) || !Array.isArray(data.appliedRules) || !Array.isArray(data.freeItems)) throw new Error('Invalid savings preview');
          if (data.subtotal === 0 && items.some(item => item.price > 0)) throw new Error('Savings preview is unavailable');
          if (!cancelled) setResult({ key, preview: data });
        })
        .catch(() => { if (!cancelled) setResult(null); });
    }, 300);

    return () => { cancelled = true; clearTimeout(handle); };
  }, [items, key, enabled]);

  return enabled && items.length > 0 && result?.key === key ? result.preview : null;
}
