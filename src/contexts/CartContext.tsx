'use client';

import { createContext, useContext, useReducer, useEffect, useRef, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { sumMoney } from '@/lib/money';
import { trackShopAction } from '@/lib/analytics/shopTracking';
import { memberSavingFor, priceForCustomer } from '@/lib/memberPricing';
import { useIsLoggedIn } from '@/hooks/useIsLoggedIn';

export interface CartItem {
  productId: string;
  name: string;
  slug: string;
  variant: string;
  price: number;
  quantity: number;
  image?: string;
}

interface CartState {
  items: CartItem[];
  drawerOpen: boolean;
  /** The slug most recently passed to addItem — used to anchor the basket-popup's upsell heading to "the product that was just added", not the whole basket. Not persisted; resets to null on reload (the drawer that mattered for it is already closed by then). */
  lastAddedSlug: string | null;
}

type CartAction =
  | { type: 'ADD'; item: CartItem }
  | { type: 'REMOVE'; productId: string; variant: string }
  | { type: 'UPDATE_QTY'; productId: string; variant: string; qty: number }
  | { type: 'CLEAR' }
  | { type: 'OPEN_DRAWER' }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'HYDRATE'; items: CartItem[] };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD': {
      const idx = state.items.findIndex(
        i => i.productId === action.item.productId && i.variant === action.item.variant
      );
      if (idx >= 0) {
        const updated = [...state.items];
        updated[idx] = { ...updated[idx], quantity: updated[idx].quantity + action.item.quantity };
        return { ...state, items: updated, lastAddedSlug: action.item.slug };
      }
      return { ...state, items: [...state.items, action.item], lastAddedSlug: action.item.slug };
    }
    case 'REMOVE':
      return {
        ...state,
        items: state.items.filter(
          i => !(i.productId === action.productId && i.variant === action.variant)
        ),
      };
    case 'UPDATE_QTY': {
      if (action.qty <= 0) {
        return {
          ...state,
          items: state.items.filter(
            i => !(i.productId === action.productId && i.variant === action.variant)
          ),
        };
      }
      return {
        ...state,
        items: state.items.map(i =>
          i.productId === action.productId && i.variant === action.variant
            ? { ...i, quantity: action.qty }
            : i
        ),
      };
    }
    case 'CLEAR':
      return { ...state, items: [], lastAddedSlug: null };
    case 'OPEN_DRAWER':
      return { ...state, drawerOpen: true };
    case 'CLOSE_DRAWER':
      return { ...state, drawerOpen: false };
    case 'HYDRATE':
      return { ...state, items: action.items, lastAddedSlug: null };
    default:
      return state;
  }
}

interface CartContextType {
  items: CartItem[];
  drawerOpen: boolean;
  lastAddedSlug: string | null;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string, variant: string) => void;
  updateQty: (productId: string, variant: string, qty: number) => void;
  clearCart: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  totalItems: number;
  totalPrice: number;
  priceForItem: (item: CartItem) => number;
  /** null while the account check is running, then whether they are signed in (a member). */
  isMember: boolean | null;
  /** How much less a member pays for this basket than a non-member. */
  memberSaving: number;
}

const CartContext = createContext<CartContextType | null>(null);

const STORAGE_KEY = 'wb_cart_v2';
const LEGACY_STORAGE_KEY = 'wb_cart';

type StoredCart = { owner: string; items: CartItem[] };

async function currentCartOwner(): Promise<string | null> {
  try {
    const response = await fetch('/api/account/me', { cache: 'no-store' });
    if (response.status === 401) return 'guest';
    if (!response.ok) return null;
    const data = await response.json();
    return Number.isInteger(data?.customer?.id) ? `customer:${data.customer.id}` : null;
  } catch {
    return null;
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [], drawerOpen: false, lastAddedSlug: null });
  const isLoggedIn = useIsLoggedIn();
  const pathname = usePathname();
  const [owner, setOwner] = useState<string | null>(null);
  const ownerRef = useRef<string | null>(null);

  // A browser is shared by guests and members. Bind the saved basket to the
  // actual account, not merely to the device, so another login never inherits it.
  useEffect(() => {
    let cancelled = false;
    const syncOwner = async () => {
      const nextOwner = await currentCartOwner();
      if (cancelled || !nextOwner || nextOwner === ownerRef.current) return;
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as StoredCart | null;
        const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || 'null') as CartItem[] | null;
        const savedItems = stored?.owner === nextOwner && Array.isArray(stored.items)
          ? stored.items
          : !stored && nextOwner === 'guest' && Array.isArray(legacy) ? legacy : [];
        dispatch({ type: 'HYDRATE', items: savedItems });
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        dispatch({ type: 'CLEAR' });
      }
      ownerRef.current = nextOwner;
      setOwner(nextOwner);
    };
    void syncOwner();
    window.addEventListener('focus', syncOwner);
    window.addEventListener('pageshow', syncOwner);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', syncOwner);
      window.removeEventListener('pageshow', syncOwner);
    };
  }, [pathname]);

  // Do not overwrite a saved basket with the initial empty render before the
  // account check has finished.
  useEffect(() => {
    if (!owner) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner, items: state.items } satisfies StoredCart));
  }, [owner, state.items]);

  const totalItems = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const priceForItem = (item: CartItem) => priceForCustomer(item.price, isLoggedIn === true);
  // Cart items retain the catalogue's member price. The visible and submitted
  // total changes only when the verified account state does, so a guest can
  // never keep a member price merely because it was placed in local storage.
  const totalPrice = sumMoney(state.items.map(i => priceForItem(i) * i.quantity));

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        drawerOpen: state.drawerOpen,
        lastAddedSlug: state.lastAddedSlug,
        addItem: item => {
          dispatch({ type: 'ADD', item });
          trackShopAction('add_to_basket', item.slug, item.quantity);
        },
        removeItem: (productId, variant) => dispatch({ type: 'REMOVE', productId, variant }),
        updateQty: (productId, variant, qty) => dispatch({ type: 'UPDATE_QTY', productId, variant, qty }),
        clearCart: () => dispatch({ type: 'CLEAR' }),
        openDrawer: () => dispatch({ type: 'OPEN_DRAWER' }),
        closeDrawer: () => dispatch({ type: 'CLOSE_DRAWER' }),
        totalItems,
        totalPrice,
        priceForItem,
        isMember: isLoggedIn,
        memberSaving: memberSavingFor(state.items),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
