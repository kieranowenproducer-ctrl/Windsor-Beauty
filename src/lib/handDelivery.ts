// Kieran's delivery exception, authorised 11 October 2026.
// Only call with the customer resolved from the signed-in session.
export function hasHandDelivery(customer: { email: string; email_verified: boolean } | null): boolean {
  return Boolean(customer?.email_verified && customer.email.trim().toLowerCase() === 'angela.jones99a@gmail.com');
}

export const HAND_DELIVERY_LABEL = 'Hand delivered';
