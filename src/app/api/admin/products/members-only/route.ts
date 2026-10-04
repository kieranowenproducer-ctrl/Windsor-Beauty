import { isDbConfigured, listCustomProducts } from '@/lib/db';
import { productAudience, productAccessRules, setProductMembersOnly, productJson } from '@/lib/productAccess';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  if (!(await productAudience(request)).isAdmin) return productJson({ error: 'Unauthorized' }, { status: 401 });
  if (!isDbConfigured()) return productJson({ error: 'Database not configured.' }, { status: 503 });
  try {
    const rules = await productAccessRules();
    return productJson({ membersOnly: Array.from(rules).filter(([, rule]) => rule.membersOnly).map(([slug]) => slug) });
  } catch { return productJson({ error: 'Product access could not be loaded.' }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!(await productAudience(request)).isAdmin) return productJson({ error: 'Unauthorized' }, { status: 401 });
  if (!isDbConfigured()) return productJson({ error: 'Database not configured.' }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body.slug !== 'string' || !/^[a-z0-9-]+$/.test(body.slug) || typeof body.membersOnly !== 'boolean') return productJson({ error: 'Choose a product and its Members only setting.' }, { status: 400 });
  try {
    if (!(await listCustomProducts())[body.slug]) return productJson({ error: 'Product not found.' }, { status: 404 });
    await setProductMembersOnly(body.slug, body.membersOnly);
    return productJson({ ok: true, slug: body.slug, membersOnly: body.membersOnly });
  } catch { return productJson({ error: 'Members only could not be saved. The reviewed database update may still be needed.' }, { status: 503 }); }
}
