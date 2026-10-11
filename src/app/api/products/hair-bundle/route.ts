import { loadShopServerData } from '@/lib/shopServerData';
import { productJson } from '@/lib/productAccess';
export const dynamic = 'force-dynamic';
export async function GET() {
  const data = await loadShopServerData();
  return productJson({ bundle: data.hairBundle ?? null });
}
