import { requireDb } from './client';
import { ensureAccountsAndLimits } from './schema-parts/accounts-and-limits';
import { ensureCustomersAndOrders } from './schema-parts/customers-and-orders';
import { ensureCatalogue } from './schema-parts/catalogue';
import { ensurePromotionsAndShipping } from './schema-parts/promotions-and-shipping';
import { ensureMarketingAndEnquiries } from './schema-parts/marketing-and-enquiries';
import { ensureReviews } from './schema-parts/reviews-and-blog';
import { ensureQrUpsellsAndInvoices } from './schema-parts/qr-upsells-and-invoices';
import { ensureOperationsAndLogs } from './schema-parts/operations-and-logs';
import { ensureReferrals } from './schema-parts/referrals';
import { ensureGlowCardLoyalty } from './schema-parts/glow-card-loyalty';
import { ensureAffiliates } from './schema-parts/affiliates';

// Schema setup — run once via the admin db-setup route. Pure DDL (CREATE TABLE
// IF NOT EXISTS + idempotent ALTERs), extracted verbatim from db.ts on 2026-07-05.
//
// Split into the eight parts below on 2026-08-11. Nothing about what runs changed:
// each part holds the statements it always held, and they are awaited here one after
// another in the same order, so the SQL still runs in exactly the old sequence.
export async function ensureSchema() {
  const db = requireDb();

  await ensureAccountsAndLimits(db);
  await ensureCustomersAndOrders(db);
  await ensureCatalogue(db);
  await ensurePromotionsAndShipping(db);
  await ensureMarketingAndEnquiries(db);
  await ensureReviews(db);
  await ensureQrUpsellsAndInvoices(db);
  await ensureOperationsAndLogs(db);
  await ensureReferrals(db);
  await ensureGlowCardLoyalty(db);
  await ensureAffiliates(db);
}
