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
export function usePromotionPreview(items: CartItem[]): PromotionPreview | null {
  const [preview, setPreview] = useState<PromotionPreview | null>(null);

  useEffect(() => {
    if (!items.length) {
      setPreview(null);
      return;
    }

    const handle = setTimeout(() => {
      fetch('/api/cart/promotion-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items.map(item => ({ slug: item.slug, variant: item.variant, quantity: item.quantity })),
        }),
      })
        .then(res => res.json())
        .then((data: PromotionPreview) => setPreview(data))
        .catch(() => setPreview(null));
    }, 300);

    return () => clearTimeout(handle);
  }, [items]);

  return preview;
}
