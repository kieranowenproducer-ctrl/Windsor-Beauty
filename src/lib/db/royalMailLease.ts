import { requireDb } from './client';

// Shared by automatic dispatch and the admin delivery editor. Missing migration
// fails closed; a customer request never installs or changes the schema.
export async function claimRoyalMailDispatch(orderNumber: string, token: string): Promise<boolean> {
  const rows = await requireDb()`UPDATE orders
    SET royal_mail_dispatch_lease_token = ${token}, royal_mail_dispatch_lease_until = now() + interval '3 minutes'
    WHERE order_number = ${orderNumber}
      AND (royal_mail_dispatch_lease_until IS NULL OR royal_mail_dispatch_lease_until < now())
    RETURNING order_number`;
  return rows.length === 1;
}

export async function releaseRoyalMailDispatch(orderNumber: string, token: string): Promise<void> {
  await requireDb()`UPDATE orders SET royal_mail_dispatch_lease_token = NULL, royal_mail_dispatch_lease_until = NULL
    WHERE order_number = ${orderNumber} AND royal_mail_dispatch_lease_token = ${token}`;
}

// Renew immediately before a bounded carrier mutation. An expired or replaced
// owner cannot revive its lease, even if no new owner has claimed it yet.
export async function renewRoyalMailDispatch(orderNumber: string, token: string): Promise<void> {
  const rows = await requireDb()`UPDATE orders
    SET royal_mail_dispatch_lease_until = now() + interval '3 minutes'
    WHERE order_number = ${orderNumber} AND royal_mail_dispatch_lease_token = ${token}
      AND royal_mail_dispatch_lease_until > now()
    RETURNING order_number`;
  if (rows.length !== 1) throw new Error('The parcel update lease expired or changed. Refresh the order before retrying.');
}
