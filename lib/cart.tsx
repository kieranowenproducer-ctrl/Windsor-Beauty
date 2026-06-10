"use client";

import { createContext, useContext, useEffect, useReducer, useState } from "react";

export interface CartItem {
  slug: string;
  name: string;
  price: number;
  size: string;
  quantity: number;
}

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: "ADD"; item: Omit<CartItem, "quantity">; quantity?: number }
  | { type: "REMOVE"; slug: string }
  | { type: "UPDATE_QTY"; slug: string; quantity: number }
  | { type: "CLEAR" }
  | { type: "SET"; items: CartItem[] };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const qty = action.quantity ?? 1;
      const existing = state.items.find((i) => i.slug === action.item.slug);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.slug === action.item.slug ? { ...i, quantity: i.quantity + qty } : i
          ),
        };
      }
      return { items: [...state.items, { ...action.item, quantity: qty }] };
    }
    case "REMOVE":
      return { items: state.items.filter((i) => i.slug !== action.slug) };
    case "UPDATE_QTY":
      return {
        items: state.items
          .map((i) => (i.slug === action.slug ? { ...i, quantity: action.quantity } : i))
          .filter((i) => i.quantity > 0),
      };
    case "CLEAR":
      return { items: [] };
    case "SET":
      return { items: action.items };
    default:
      return state;
  }
}

const CART_STORAGE_KEY = "windsor-beauty-cart";

const CartContext = createContext<{
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (slug: string) => void;
  updateQuantity: (slug: string, quantity: number) => void;
  clearCart: () => void;
  itemCount: number;
  subtotal: number;
  hydrated: boolean;
} | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CART_STORAGE_KEY);
      if (stored) {
        const items: CartItem[] = JSON.parse(stored);
        dispatch({ type: "SET", items });
      }
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.items));
    } catch {}
  }, [state.items, hydrated]);

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = state.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        addItem: (item, quantity) => dispatch({ type: "ADD", item, quantity }),
        removeItem: (slug) => dispatch({ type: "REMOVE", slug }),
        updateQuantity: (slug, quantity) => dispatch({ type: "UPDATE_QTY", slug, quantity }),
        clearCart: () => dispatch({ type: "CLEAR" }),
        itemCount,
        subtotal,
        hydrated,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
