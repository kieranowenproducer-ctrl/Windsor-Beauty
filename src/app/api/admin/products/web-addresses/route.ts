import { NextResponse } from 'next/server';
import { hasAdminReadAccess } from '@/lib/adminReadAccess';
import { isDbConfigured, listCustomProducts } from '@/lib/db';
import { productAddressRegistryReady, changeProductAddress } from '@/lib/db/productAddresses';
import { productAddress, RESERVED_PRODUCT_ADDRESSES, validProductAddress } from '@/lib/productAddress';

export const dynamic = 'force-dynamic';
const reply = (body: unknown, status = 200) => NextResponse.json(body, {status, headers:{'Cache-Control':'private, no-store'}});

export async function GET(request: Request) {
  if (!hasAdminReadAccess(request)) return reply({error:'Please sign in as staff.'},401);
  if (!isDbConfigured()) return reply({error:'Database not configured.'},503);
  try {
    const ready = await productAddressRegistryReady();
    const products = Object.values(await listCustomProducts()).map(p => ({slug:p.slug,name:p.name,address:productAddress(p)}));
    return reply({ready,products});
  } catch { return reply({error:'Could not load product links. Please try again.'},503); }
}

export async function POST(request: Request) {
  if (!hasAdminReadAccess(request)) return reply({error:'Please sign in as staff.'},401);
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    return reply({error:'Please open this tool from the Beauty admin panel.'},403);
  }
  if (!isDbConfigured()) return reply({error:'Database not configured.'},503);
  const raw = await request.text();
  if (raw.length > 2048) return reply({error:'The product link is too long.'},400);
  let body: {slug?:unknown;address?:unknown;expectedAddress?:unknown};
  try { body=JSON.parse(raw); } catch { return reply({error:'Check the product link.'},400); }
  if (!body || !validProductAddress(body.slug) || !validProductAddress(body.address) || typeof body.expectedAddress !== 'string'
    || body.expectedAddress.length>200 || RESERVED_PRODUCT_ADDRESSES.includes(body.address)) return reply({error:'Use lowercase letters, numbers and single hyphens for the product link.'},400);
  try {
    if (!await productAddressRegistryReady()) return reply({error:'Product link editing is not installed yet.'},503);
    const result = await changeProductAddress(body.slug,body.address,body.expectedAddress);
    return reply({success:true,...result});
  } catch (err) {
    const message = err instanceof Error ? err.message : '';
    if (/address_in_use|address_retired_slug/.test(message)) return reply({error:'This link is already reserved. Choose a different one.'},409);
    if (/address_changed_reload/.test(message)) return reply({error:'This link changed in another window. Reload before saving.'},409);
    if (/product_not_found/.test(message)) return reply({error:'This product no longer exists. Reload the list.'},404);
    return reply({error:'Could not save the product link. Your entry is kept.'},503);
  }
}
