import { cookies } from 'next/headers';
import { CUSTOMER_SESSION_COOKIE, getSessionTokenFromRequest } from '@/lib/auth';
import { findCustomerByValidSessionToken, type CustomerRow } from '@/lib/db';
import { isDbConfigured, requireDb } from '@/lib/db/client';

import { mayAccessProduct, type ProductAccess, type ProductAudience, type ProductAccessRule } from './productVisibility';
export { mayAccessProduct, filterProductRecords, type ProductAccess, type ProductAudience, type ProductAccessRule } from './productVisibility';
export const PRODUCT_PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
export function productJson(body: unknown, init: ResponseInit = {}): Response {
  return Response.json(body, { ...init, headers: { ...PRODUCT_PRIVATE_HEADERS, ...Object.fromEntries(new Headers(init.headers)) } });
}

export async function filterProductReviews<T extends { id: number; product_slug?: string | null; product_slugs?: string[] }>(reviews: T[], access: ProductAccess): Promise<T[]> {
  if (!isDbConfigured() || !reviews.length) return reviews;
  const links = await requireDb()`SELECT review_id,product_slug FROM review_product_links WHERE review_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(reviews.map(r => r.id))}::jsonb)::integer)`;
  const blocked = new Set((links as { review_id: number; product_slug: string }[]).filter(link => !mayAccessProduct(link.product_slug, access)).map(link => link.review_id));
  return reviews.filter(review => !blocked.has(review.id) && (!review.product_slug || mayAccessProduct(review.product_slug, access)) && !(review.product_slugs ?? []).some(slug => !mayAccessProduct(slug, access)));
}

/** Beauty's established members keep access, including legacy unverified members. */
export function eligibleProductMember(customer: Pick<CustomerRow, 'account_status' | 'membership_status' | 'banned_at'> | null): boolean {
  return Boolean(customer && customer.account_status === 'active' && customer.membership_status === 'member' && !customer.banned_at);
}

export async function productAudience(request?: Request): Promise<ProductAudience> {
  const jar = request ? null : await cookies();
  const read = (name: string) => request ? getSessionTokenFromRequest(request, name) : jar?.get(name)?.value;
  const expected = process.env.ADMIN_SESSION_TOKEN?.trim();
  const isAdmin = Boolean(expected && read('wb_admin_session') === expected);
  const token = read(CUSTOMER_SESSION_COOKIE);
  const customer = token && isDbConfigured() ? await findCustomerByValidSessionToken(token).catch(() => null) : null;
  return { isAdmin, isMember: eligibleProductMember(customer) };
}

/** Old schema means default off; read errors never mean public access. No runtime DDL. */
export async function productAccessRules(): Promise<Map<string, ProductAccessRule>> {
  if (!isDbConfigured()) return new Map();
  const rows = await requireDb()`SELECT slug,hidden,coalesce((to_jsonb(v)->>'members_only')::boolean,false) AS members_only FROM product_visibility v`;
  return new Map((rows as { slug: string; hidden: boolean; members_only: boolean }[]).map(row => [row.slug, { hidden: row.hidden, membersOnly: row.members_only }]));
}

export async function loadProductAccess(request?: Request): Promise<ProductAccess> {
  const [rules, audience] = await Promise.all([productAccessRules(), productAudience(request)]);
  return { rules, audience };
}

export async function setProductMembersOnly(slug: string, membersOnly: boolean): Promise<void> {
  // Explicit additive schema installation is required before the first toggle.
  await requireDb()`SELECT members_only FROM product_visibility WHERE false`;
  await requireDb()`INSERT INTO product_visibility(slug,hidden,members_only,updated_at)
    VALUES (${slug},false,${membersOnly},now()) ON CONFLICT(slug) DO UPDATE SET members_only=${membersOnly},updated_at=now()`;
}
