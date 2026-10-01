// Two things that happen when "Run Database Setup" is pressed, before and after
// the tables are created:
//
// 1. claimDatabaseForThisShop: makes sure the database belongs to Windsor Beauty.
//    This code began as a copy of another shop's. If its database address is ever
//    pasted here by mistake, setup must refuse rather than start writing Windsor
//    Beauty's tables and products into somebody else's live shop.
//
// 2. seedStarterProducts: on a brand-new shop, copies the starter catalogue in
//    once so there is something to test with. It never runs a second time, so
//    products deleted in the admin panel stay deleted.
import { requireDb } from './client';
import { STARTER_PRODUCTS, STARTER_STOCK } from '@/data/starterProducts';

export const SHOP_ID = 'windsor-beauty';

export async function claimDatabaseForThisShop(): Promise<void> {
  const db = requireDb();
  const [identity] = (await db`SELECT to_regclass('public.shop_identity') AS t`) as { t: string | null }[];
  if (!identity.t) {
    // No marker yet. That is only acceptable on an empty database.
    const [orders] = (await db`SELECT to_regclass('public.orders') AS t`) as { t: string | null }[];
    if (orders.t) {
      throw new Error(
        'This database already holds another shop and is not marked as Windsor Beauty. Setup has stopped and changed nothing. Check DATABASE_URL.'
      );
    }
    await db`CREATE TABLE shop_identity (shop TEXT PRIMARY KEY, claimed_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
    await db`INSERT INTO shop_identity (shop) VALUES (${SHOP_ID})`;
    return;
  }
  const rows = (await db`SELECT shop FROM shop_identity`) as { shop: string }[];
  if (rows.length !== 1 || rows[0].shop !== SHOP_ID) {
    throw new Error(
      'This database is marked as belonging to a different shop. Setup has stopped and changed nothing. Check DATABASE_URL.'
    );
  }
}

export async function seedStarterProducts(): Promise<{ seeded: number }> {
  const db = requireDb();
  const [marker] = (await db`SELECT starter_seeded_at FROM shop_identity WHERE shop = ${SHOP_ID}`.catch(() => [])) as {
    starter_seeded_at: string | null;
  }[];
  if (marker?.starter_seeded_at) return { seeded: 0 };
  await db`ALTER TABLE shop_identity ADD COLUMN IF NOT EXISTS starter_seeded_at TIMESTAMPTZ`;
  const [done] = (await db`SELECT starter_seeded_at FROM shop_identity WHERE shop = ${SHOP_ID}`) as {
    starter_seeded_at: string | null;
  }[];
  if (done?.starter_seeded_at) return { seeded: 0 };

  const [existing] = (await db`SELECT count(*)::int AS n FROM custom_products`) as { n: number }[];
  let seeded = 0;
  if (existing.n === 0) {
    for (const product of STARTER_PRODUCTS) {
      await db`
        INSERT INTO custom_products (slug, data, updated_at)
        VALUES (${product.slug}, ${JSON.stringify(product)}, now())
        ON CONFLICT (slug) DO NOTHING
      `;
      for (const variant of product.variants) {
        await db`
          INSERT INTO product_variant_stock (slug, dosage, quantity)
          VALUES (${product.slug}, ${variant.dosage}, ${STARTER_STOCK})
          ON CONFLICT (slug, dosage) DO NOTHING
        `;
      }
      seeded++;
    }
  }
  await db`UPDATE shop_identity SET starter_seeded_at = now() WHERE shop = ${SHOP_ID}`;
  return { seeded };
}
