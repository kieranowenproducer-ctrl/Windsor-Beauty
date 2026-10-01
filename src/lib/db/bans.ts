/**
 * Banned accounts, and the addresses that give them away (task 9cd55f28).
 *
 * WHAT A BAN IS. The account is shut: it cannot sign in, and it cannot place an order even as a
 * guest using the same email address. Nothing is deleted, so a ban made in error costs nothing to
 * undo, and every ban and lift is written down with who did it.
 *
 * WHAT A BAN IS NOT. It never blocks an address. Kieran looked at that on 5 August 2026 and left
 * it: addresses are shared by households, offices and whole mobile masts, and anyone determined
 * reconnects on a new one in seconds, so the cost lands on innocent customers and the benefit lands
 * on the least dangerous attacker. What is here instead is what he asked for: the address is
 * FLAGGED when it turns up again, and a person decides.
 *
 * NOTHING HERE BANS ANYBODY BY ITSELF. Every ban in this file is one an admin pressed.
 */

import { requireDb } from './client';

export interface BannedCustomer {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email: string;
  banned_at: string;
  banned_reason: string | null;
  banned_by: string | null;
  /** The addresses this account has been seen on, most recent first. */
  addresses: string[];
}

export interface BanHistoryRow {
  id: number;
  action: 'banned' | 'lifted';
  reason: string | null;
  admin_name: string | null;
  created_at: string;
}

/**
 * An address a banned account used, now seen on somebody else's account.
 *
 * This is the flag the task asks for. It is a warning, never a verdict: a father and son in one
 * house share an address, and so do everybody in one office.
 */
export interface BannedIpMatch {
  ip_address: string;
  /** Who was banned on this address. */
  banned_names: string[];
  /** The other account now seen on it. */
  customer_id: number;
  customer_name: string | null;
  customer_email: string | null;
  /** Already banned too, so the row can say so instead of offering a pointless button. */
  already_banned: boolean;
  last_seen: string;
  events: number;
  city: string | null;
  country: string | null;
}

const displayName = (first: string | null, last: string | null, email: string) =>
  `${first ?? ''} ${last ?? ''}`.trim() || email;

/**
 * Shuts an account.
 *
 * The sessions go in the same breath: without that, a browser that is already signed in keeps
 * working until its cookie runs out, and the ban would look like it had not worked.
 */
export async function banCustomer(params: {
  customerId: number;
  reason: string | null;
  adminName: string | null;
}): Promise<{ ok: boolean; alreadyBanned: boolean }> {
  const db = requireDb();

  const rows = await db`
    SELECT id, first_name, last_name, email, banned_at FROM customers WHERE id = ${params.customerId} LIMIT 1
  `;
  const customer = rows[0] as
    | { id: number; first_name: string | null; last_name: string | null; email: string; banned_at: string | null }
    | undefined;
  if (!customer) return { ok: false, alreadyBanned: false };
  if (customer.banned_at) return { ok: true, alreadyBanned: true };

  await db`
    UPDATE customers
    SET banned_at = now(), banned_reason = ${params.reason}, banned_by = ${params.adminName}
    WHERE id = ${params.customerId}
  `;
  await db`DELETE FROM customer_sessions WHERE customer_id = ${params.customerId}`;
  await db`
    INSERT INTO customer_bans (customer_id, customer_name, customer_email, action, reason, admin_name)
    VALUES (
      ${customer.id},
      ${displayName(customer.first_name, customer.last_name, customer.email)},
      ${customer.email},
      'banned',
      ${params.reason},
      ${params.adminName}
    )
  `;
  return { ok: true, alreadyBanned: false };
}

/** Lets an account back in. The history keeps both the ban and the lift. */
export async function liftCustomerBan(params: {
  customerId: number;
  reason: string | null;
  adminName: string | null;
}): Promise<{ ok: boolean; wasBanned: boolean }> {
  const db = requireDb();

  const rows = await db`
    SELECT id, first_name, last_name, email, banned_at FROM customers WHERE id = ${params.customerId} LIMIT 1
  `;
  const customer = rows[0] as
    | { id: number; first_name: string | null; last_name: string | null; email: string; banned_at: string | null }
    | undefined;
  if (!customer) return { ok: false, wasBanned: false };
  if (!customer.banned_at) return { ok: true, wasBanned: false };

  await db`
    UPDATE customers SET banned_at = NULL, banned_reason = NULL, banned_by = NULL WHERE id = ${params.customerId}
  `;
  await db`
    INSERT INTO customer_bans (customer_id, customer_name, customer_email, action, reason, admin_name)
    VALUES (
      ${customer.id},
      ${displayName(customer.first_name, customer.last_name, customer.email)},
      ${customer.email},
      'lifted',
      ${params.reason},
      ${params.adminName}
    )
  `;
  return { ok: true, wasBanned: true };
}

/** Every ban and lift for one account, newest first. Answers "why can they not get in?". */
export async function listBanHistory(customerId: number): Promise<BanHistoryRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT id, action, reason, admin_name, created_at
    FROM customer_bans
    WHERE customer_id = ${customerId}
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return rows as unknown as BanHistoryRow[];
}

/** The banned accounts, with the addresses each has been seen on. */
export async function listBannedCustomers(): Promise<BannedCustomer[]> {
  const db = requireDb();
  const rows = await db`
    SELECT c.id, c.first_name, c.last_name, c.email, c.banned_at, c.banned_reason, c.banned_by,
           COALESCE(
             (SELECT ARRAY_AGG(ip ORDER BY ip)
              FROM (
                SELECT DISTINCT l.ip_address AS ip
                FROM ip_activity_log l
                WHERE l.ip_address IS NOT NULL
                  AND (l.customer_id = c.id OR lower(l.customer_email) = lower(c.email))
              ) a),
             '{}'
           ) AS addresses
    FROM customers c
    WHERE c.banned_at IS NOT NULL
    ORDER BY c.banned_at DESC
  `;
  return rows as unknown as BannedCustomer[];
}

/**
 * The flag: an address a banned account used, seen since on somebody else's account.
 *
 * Matched on the customer id AND the email, because an address recorded against a batch code check
 * or an enquiry carries the email but no account link, and dropping those would lose exactly the
 * sightings worth having.
 *
 * A banned account's own later sightings are excluded, or every banned person would flag themselves
 * forever.
 */
export async function listBannedIpMatches(): Promise<BannedIpMatch[]> {
  const db = requireDb();
  const rows = await db`
    WITH banned AS (
      SELECT id, email, TRIM(CONCAT_WS(' ', first_name, last_name)) AS name FROM customers WHERE banned_at IS NOT NULL
    ),
    banned_ips AS (
      SELECT DISTINCT l.ip_address, b.id AS banned_id,
             COALESCE(NULLIF(b.name, ''), b.email) AS banned_name
      FROM ip_activity_log l
      JOIN banned b ON (l.customer_id = b.id OR lower(l.customer_email) = lower(b.email))
      WHERE l.ip_address IS NOT NULL
    )
    SELECT bi.ip_address,
           ARRAY_AGG(DISTINCT bi.banned_name)                                        AS banned_names,
           c.id                                                                      AS customer_id,
           COALESCE(NULLIF(TRIM(CONCAT_WS(' ', c.first_name, c.last_name)), ''), c.email) AS customer_name,
           c.email                                                                   AS customer_email,
           (c.banned_at IS NOT NULL)                                                 AS already_banned,
           MAX(l.created_at)                                                         AS last_seen,
           COUNT(*)::int                                                             AS events,
           (ARRAY_AGG(l.city    ORDER BY l.created_at DESC) FILTER (WHERE l.city    IS NOT NULL))[1] AS city,
           (ARRAY_AGG(l.country ORDER BY l.created_at DESC) FILTER (WHERE l.country IS NOT NULL))[1] AS country
    FROM banned_ips bi
    JOIN ip_activity_log l ON l.ip_address = bi.ip_address
    JOIN customers c ON (c.id = l.customer_id OR lower(c.email) = lower(l.customer_email))
    WHERE c.id <> bi.banned_id
    GROUP BY bi.ip_address, c.id, c.first_name, c.last_name, c.email, c.banned_at
    ORDER BY MAX(l.created_at) DESC
    LIMIT 200
  `;
  return rows as unknown as BannedIpMatch[];
}

/**
 * Is this account shut?
 *
 * Deliberately its own small query rather than a field somewhere: sign-in and checkout both ask it
 * on every attempt, and both must get today's answer, not one cached before the ban was pressed.
 */
export async function isCustomerBanned(customerId: number): Promise<boolean> {
  const db = requireDb();
  const rows = await db`SELECT banned_at FROM customers WHERE id = ${customerId} LIMIT 1`;
  return Boolean((rows[0] as { banned_at: string | null } | undefined)?.banned_at);
}
