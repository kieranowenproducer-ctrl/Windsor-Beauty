import type { CartItem } from "./cart";

export interface OrderDetails {
  orderNumber: string;
  items: CartItem[];
  subtotal: number;
  shipping: number;
  total: number;
  customer: {
    fullName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    postcode: string;
    notes: string;
  };
  paymentMethod: string;
  createdAt: string;
}

const ORDERS_STORAGE_KEY = "windsor-beauty-orders";

export function generateOrderNumber(): string {
  const random = Math.floor(100000 + Math.random() * 900000);
  return `WB-${random}`;
}

export function saveOrder(order: OrderDetails) {
  try {
    const existing = getAllOrders();
    existing.push(order);
    localStorage.setItem(ORDERS_STORAGE_KEY, JSON.stringify(existing));
  } catch {}
}

export function getAllOrders(): OrderDetails[] {
  try {
    const stored = localStorage.getItem(ORDERS_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function getOrder(orderNumber: string): OrderDetails | undefined {
  return getAllOrders().find((o) => o.orderNumber === orderNumber);
}

export const FREE_SHIPPING_THRESHOLD = 35;
export const STANDARD_SHIPPING_COST = 3.95;

export function calculateShipping(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD || subtotal === 0 ? 0 : STANDARD_SHIPPING_COST;
}
