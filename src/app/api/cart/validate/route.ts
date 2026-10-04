import { isDbConfigured, listCustomProducts } from '@/lib/db';
import { loadProductAccess, mayAccessProduct, productJson } from '@/lib/productAccess';
export const dynamic = 'force-dynamic';
/** Recheck a saved basket using this request's real account and current flags. */
export async function POST(request: Request) {
  if (!isDbConfigured()) return productJson({ allowedSlugs: [] }, { status: 503 });
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.slugs) || body.slugs.length > 200 || body.slugs.some((slug: unknown) => typeof slug !== 'string')) return productJson({ error: 'Invalid basket.' }, { status: 400 });
  try {
    const [products, access] = await Promise.all([listCustomProducts(), loadProductAccess(request)]);
    return productJson({ allowedSlugs: Array.from(new Set<string>(body.slugs)).filter(slug => Boolean(products[slug]) && mayAccessProduct(slug, access)) });
  } catch { return productJson({ allowedSlugs: [] }, { status: 503 }); }
}
