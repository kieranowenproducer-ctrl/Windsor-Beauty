// The product name sent to Royal Mail and to the payment provider.
//
// Windsor Beauty sells skincare and has nothing to keep from a courier or a payment provider, so
// the name that goes out is the real product name. The file and its function names are kept from
// an earlier version of the shop so that every caller still works unchanged.
//
// THE ORDER, most specific first:
//   1. A trial product's own fixed reference, e.g. "Product 284". Trial products are still sent
//      under their reference and never under a name (see src/lib/trialRoyalMailRef.ts).
//   2. A "Shipping description" typed for the product in the admin panel, if there is one.
//   3. The product's real name.
//   4. The name written on the order line, for a line that has no catalogue product behind it
//      (a bespoke invoice line, or a product since removed).
//   5. DEFAULT_GENERIC_NAME, only when there is no name of any kind.
//
// Customs fields are separate and are not touched here. See src/lib/royalMail.ts.

import type { Product } from '@/data/products';

/** Last resort, used only when a line has no name at all. */
export const DEFAULT_GENERIC_NAME = 'Skincare product';

/** A record of the name sent for one order line, for our own log. */
export interface GenericNameAudit {
  /** Catalogue slug, or the raw slug from the order line if not in the catalogue. */
  slug: string;
  /** The name as written on the order line, with its size. */
  realName: string;
  /** The name that was sent. */
  genericName: string;
  /** Which rule produced it. */
  source: 'product.genericName' | 'product.name' | 'order-line' | 'default' | 'trial-fulfilment-ref';
  /** Where it was going. */
  destination: 'royal-mail' | 'fena';
}

/**
 * The name to send for a product.
 *
 * A typed "Shipping description" wins, then the product's real name. `slug` is accepted so
 * existing callers keep compiling; it plays no part in the answer.
 */
export function genericNameFor(product: Product | undefined, slug?: string): {
  name: string;
  source: GenericNameAudit['source'];
} {
  void slug;
  const explicit = product?.genericName?.trim();
  if (explicit) return { name: explicit, source: 'product.genericName' };

  const real = product?.name?.trim();
  if (real) return { name: real, source: 'product.name' };

  return { name: DEFAULT_GENERIC_NAME, source: 'default' };
}

/** The name to put on an outbound payload for one order line. */
export function outboundItemName(
  product: Product | undefined,
  opts: {
    slug: string;
    realName: string;
    destination: GenericNameAudit['destination'];
    /**
     * A trial product's fixed neutral reference, e.g. "Product 284". Wins over everything, because
     * a trial line arrives here with its name and slug already removed on purpose.
     */
    fulfilmentRef?: string;
  }
): { name: string; audit: GenericNameAudit } {
  const audit = (name: string, source: GenericNameAudit['source']) => ({
    name,
    audit: {
      slug: opts.slug,
      realName: opts.realName,
      genericName: name,
      source,
      destination: opts.destination,
    },
  });

  const ref = opts.fulfilmentRef?.trim();
  if (ref) return audit(ref, 'trial-fulfilment-ref');

  const resolved = genericNameFor(product, opts.slug);
  if (resolved.source !== 'default') return audit(resolved.name, resolved.source);

  const lineName = opts.realName?.trim();
  if (lineName) return audit(lineName, 'order-line');

  return audit(DEFAULT_GENERIC_NAME, 'default');
}

/**
 * The stock code sent to Royal Mail: the product's own slug.
 * A line with no slug (a trial line or a bespoke invoice line) sends none.
 */
export function outboundSku(slug: string | undefined): string | undefined {
  const value = slug?.trim();
  return value ? value : undefined;
}

/**
 * Write the names that were sent to our own log.
 *
 * A structured console log on purpose: it costs nothing and cannot fail a customer's checkout or
 * a dispatch if the write errors.
 */
export function logGenericNameAudit(orderReference: string, records: GenericNameAudit[]): void {
  if (records.length === 0) return;
  console.info('[outbound-names] names sent', JSON.stringify({
    orderReference,
    destination: records[0]?.destination,
    at: new Date().toISOString(),
    mappings: records.map((r) => ({
      slug: r.slug,
      real: r.realName,
      sent: r.genericName,
      via: r.source,
    })),
  }));
}
