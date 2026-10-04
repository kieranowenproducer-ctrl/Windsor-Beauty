/**
 * Can a search engine tell one product page from another?
 *
 *   npm run check:seo                  the source checks only, no server needed
 *   npm run check:seo:served           also fetch a local build (next start on :3000)
 *   npm run check:seo:live             also fetch www.windsorbeauty.co.uk, as Googlebot
 *
 * WHAT THIS EXISTS TO STOP HAPPENING AGAIN. On 10 August 2026 every one of the 61 product pages
 * served the homepage's title and the homepage's description. /shop/aod-9604 and /shop/bpc-157
 * were, as far as a crawler could tell, the same page as each other and as the front door. No
 * page carried an h1, a canonical link, a price, or any product data at all, and /shop itself
 * served 31KB of HTML containing not one link to a product.
 *
 * The cause was one line at the top of each of the two shop pages: `'use client'`. A client
 * component cannot export `generateMetadata`, so Next fell back to the root layout's title for
 * every shop page, and because the pages also refused to render anything until a browser fetch
 * came back, the served HTML was a spinner. Neither fault announced itself. Both were invisible
 * from inside a browser, where the page looks perfect, and the sitemap and robots.txt were
 * already correct, which made discovery look solved while labelling was not.
 *
 * SO THIS CHECK HAS TWO HALVES, AND THEY PROVE DIFFERENT THINGS.
 *
 *   The SOURCE half reads the files and needs nothing running. It is the half that goes in
 *   `npm run check`, because it costs nothing, cannot flake, and it catches the exact regression
 *   that caused this: a `'use client'` creeping back onto a page that owns metadata.
 *
 *   The SERVED half fetches real HTML with a Googlebot user agent and reads what actually came
 *   down the wire. It is the only half that proves the outcome rather than the intent, and it is
 *   why `--live` exists: this was measured wrong once already from a truncated command, and a
 *   fault that only exists in production is the only kind that matters here.
 *
 * Both halves were watched failing before the fix went in. A check nobody has seen fail proves
 * nothing, and this workspace has learned that more than once.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_CATEGORIES, PRODUCTS } from '@/data/products';
import { PRETTY_SLUG, shopUrl } from '@/lib/slugAliases';
import { SITE_URL } from '@/app/robots';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(root, rel), 'utf-8');
/* For files a check expects to EXIST. A missing one has to read as a failed check, not as a
 * crashed script: the whole point of writing the check first is watching it fail cleanly. */
const readOptional = (rel) => { try { return read(rel); } catch { return ''; } };

const args = process.argv.slice(2);
const LIVE = args.includes('--live');
const SERVED = LIVE || args.includes('--served');
const baseArg = args.find((a) => a.startsWith('--base='));
const BASE = (baseArg ? baseArg.slice('--base='.length) : LIVE ? SITE_URL : 'http://localhost:3000')
  .replace(/\/$/, '');

/* The title and description every shop page wrongly wore. Read from the layout rather than
 * copied, so rewording the homepage cannot quietly turn this check into one that passes on
 * anything. */
const layout = read('src/app/layout.tsx');
const SITE_TITLE = layout.match(/title:\s*'([^']+)'/)?.[1];
const SITE_DESCRIPTION = layout.match(/description:\s*\n?\s*'([^']+)'/)?.[1];

const failures = [];
const notes = [];
let checked = 0;

function ok(condition, message) {
  checked += 1;
  if (!condition) failures.push(message);
  return Boolean(condition);
}

/* ── The source half ───────────────────────────────────────────────────────────────────────── */

function checkSource() {
  for (const rel of ['src/app/shop/page.tsx', 'src/app/shop/[slug]/page.tsx']) {
    const source = read(rel);
    ok(!/^\s*['"]use client['"]/.test(source),
      `${rel} starts with 'use client'. A client component cannot export generateMetadata, so `
      + 'every page under it wears the homepage title. Keep the page a server component and put '
      + 'the interactive part in its own client file.');
    ok(/export\s+(async\s+)?function\s+generateMetadata|export\s+const\s+metadata/.test(source),
      `${rel} exports no metadata, so Next falls back to the root layout's title and description.`);
  }

  const productPage = read('src/app/shop/[slug]/page.tsx');
  ok(/application\/ld\+json/.test(productPage),
    'The product page serves no structured data. Without a Product block carrying a price and an '
    + 'availability, a shop page is just prose to a search engine.');
  ok(/alternates:\s*\{\s*canonical/.test(productPage),
    'The product page sets no canonical URL, so the pretty slug and the internal one can be '
    + 'indexed as two different pages selling the same thing.');

  const sitemap = read('src/app/sitemap.ts');
  ok(/shopUrl\(/.test(sitemap),
    'sitemap.ts builds product URLs from the internal slug while the site links the pretty one, '
    + 'so it advertises addresses nothing on the site links to. Use shopUrl().');

  /* The pretty-slug redirects live in next.config.js, which is CommonJS and cannot import the
   * TypeScript that defines the pairs. Two lists, no compiler between them, so this is the only
   * thing keeping them equal: add a pair to slugAliases and forget the redirect, and the old
   * address 404s the moment the page stops rendering it client-side. */
  const config = read('next.config.js');
  for (const [internal, pretty] of Object.entries(PRETTY_SLUG)) {
    ok(config.includes(`/shop/${internal}`) && config.includes(`/shop/${pretty}`),
      `next.config.js has no redirect from /shop/${internal} to /shop/${pretty}, so the internal `
      + 'slug is a second live address for the same product.');
  }
}

/**
 * The category pages, and the three pages that had nothing at all.
 *
 * ADDED 11 AUGUST 2026. The shop had one address for 47 products and no way for a search engine
 * to see "fat loss" or "sleep" as things this shop sells, because a category existed only as a
 * dropdown value inside a client component. Meanwhile the homepage, the front door and the most
 * linked page on the site, served no canonical, no structured data and no share image, and the
 * blog index served no canonical either.
 *
 * The one rule these checks must never relax: a category page says the category's NAME, its
 * count and the research-use qualifier, and never a sentence about what the category or its
 * compounds do. That boundary is checked below by refusing a description that has grown past the
 * length those three parts can occupy.
 */
async function checkCategorySource() {
  const page = readOptional('src/app/shop/category/[slug]/page.tsx');
  ok(page, 'There is no src/app/shop/category/[slug]/page.tsx, so no category has an address of '
    + 'its own and the shop is one page as far as a search engine is concerned.');
  if (page) {
    ok(!/^\s*['"]use client['"]/.test(page),
      "src/app/shop/category/[slug]/page.tsx starts with 'use client', so it cannot own its title.");
    ok(/export\s+(async\s+)?function\s+generateMetadata/.test(page),
      'src/app/shop/category/[slug]/page.tsx exports no generateMetadata, so every category page '
      + "wears the shop's title and they are all the same page to a crawler.");
    ok(/alternates:\s*\{\s*canonical/.test(page),
      'src/app/shop/category/[slug]/page.tsx sets no canonical URL.');
    ok(/notFound\(\)/.test(page),
      'src/app/shop/category/[slug]/page.tsx never calls notFound(), so a category with no live '
      + 'products would publish an empty shelf.');
  }

  /* One place decides an address, and once published an address never changes. A second copy of
   * the slug rule anywhere else is how /shop/category/fat-loss and /shop/category/fatloss both
   * come to exist. */
  const urls = readOptional('src/lib/categoryUrls.ts');
  ok(urls, 'There is no src/lib/categoryUrls.ts. Category addresses must come from one file.');

  for (const [rel, needle, why] of [
    ['src/app/sitemap.ts', 'liveCategories', 'the sitemap does not list the category pages'],
    ['src/components/Footer.tsx', 'liveCategories', 'the footer does not link the category pages'],
  ]) {
    ok(readOptional(rel).includes(needle),
      `${rel} never calls liveCategories(), so ${why}, or it works out its own list and the two `
      + 'can disagree about which categories exist.');
  }

  /* The round trip, on the real category names. A name that does not survive being turned into
   * an address and read back is a page nobody can reach, and a collision is two categories
   * fighting over one address. */
  if (urls) {
    let mod = null;
    try { mod = await import('@/lib/categoryUrls'); } catch (error) {
      ok(false, `src/lib/categoryUrls.ts does not load: ${error.message}`);
    }
    if (mod?.categorySlug && mod?.categoryFromSlug) {
      const names = [...ALL_CATEGORIES];
      const slugs = names.map((name) => mod.categorySlug(name));
      ok(new Set(slugs).size === slugs.length,
        `Two categories share one address: ${slugs.filter((s, i) => slugs.indexOf(s) !== i).join(', ')}.`);
      for (const name of names) {
        const slug = mod.categorySlug(name);
        ok(/^[a-z0-9][a-z0-9-]*$/.test(slug), `"${name}" makes the address "${slug}", which is not a clean slug.`);
        ok(mod.categoryFromSlug(slug, names) === name,
          `"${name}" becomes "${slug}" and does not come back: got "${mod.categoryFromSlug(slug, names)}".`);
      }
    }
  }

  /* Jobs C and D: three pages that were missing one line each. */
  const home = readOptional('src/app/page.tsx');
  ok(/alternates:\s*\{\s*canonical/.test(home),
    'The homepage sets no canonical, and it is the page most often linked with tracking '
    + 'parameters stuck on the end, so every one of those is a separate page to a crawler.');
  ok(/application\/ld\+json/.test(home),
    'The homepage serves no structured data, so nothing tells a search engine what this business is.');
  ok(/openGraph/.test(home) && /images:/.test(home),
    'The homepage has no share image, so a link pasted into a message shows no picture.');

  ok(/application\/ld\+json/.test(readOptional('src/app/shop/page.tsx')),
    '/shop serves no ItemList structured data, so a listing of 47 products is not declared as a list.');
}

/* ── The served half ───────────────────────────────────────────────────────────────────────── */

const GOOGLEBOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

async function get(url) {
  const res = await fetch(url, { headers: { 'user-agent': GOOGLEBOT }, redirect: 'manual' });
  const html = res.status >= 300 && res.status < 400 ? '' : await res.text();
  return { status: res.status, location: res.headers.get('location'), html };
}

const between = (html, re) => html.match(re)?.[1]?.trim();
const decode = (text = '') => text
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&bull;/g, '•');

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(html))) {
    try { blocks.push(JSON.parse(match[1])); } catch { blocks.push({ __unparseable: match[1].slice(0, 80) }); }
  }
  return blocks.flatMap((b) => (Array.isArray(b) ? b : b?.['@graph'] ? b['@graph'] : [b]));
}

async function checkProductPage(product) {
  const url = `${BASE}${shopUrl(product.slug)}`;
  /* The address the page must claim as its own is the LIVE one, whatever host we happen to be
   * fetching from. A canonical pointing at localhost would be the fault, not the check. */
  const canonicalShouldBe = `${SITE_URL}${shopUrl(product.slug)}`;
  const { status, html } = await get(url);
  if (!ok(status === 200, `${url} answered ${status}, not 200.`)) return;

  const title = decode(between(html, /<title>([^<]*)<\/title>/));
  const description = decode(between(html, /<meta name="description" content="([^"]*)"/));
  const canonical = between(html, /<link rel="canonical" href="([^"]*)"/);
  const headings = html.match(/<h1[\s>]/g) ?? [];
  const h1Text = decode(between(html, /<h1[^>]*>([\s\S]*?)<\/h1>/)?.replace(/<[^>]+>/g, ''));

  ok(title && title.includes(product.name),
    `${url} is titled "${title}". A page about ${product.name} has to say so in its title.`);
  ok(title !== SITE_TITLE, `${url} wears the homepage title, so it is indistinguishable from the front door.`);
  ok(description && description !== SITE_DESCRIPTION,
    `${url} serves the homepage description, so its search result would describe the whole shop.`);
  ok(description && description.length >= 50,
    `${url} has a description of ${description?.length ?? 0} characters, too thin to be its own.`);
  ok(headings.length === 1, `${url} serves ${headings.length} h1 headings; it should serve exactly one.`);
  ok(h1Text && h1Text.includes(product.name),
    `${url} has the h1 "${h1Text}", which does not name the product.`);
  ok(canonical === canonicalShouldBe,
    `${url} declares its canonical as "${canonical}", not "${canonicalShouldBe}".`);

  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ');

  const offered = jsonLdBlocks(html).find((b) => b?.['@type'] === 'Product');
  if (ok(offered, `${url} carries no Product structured data.`)) {
    ok(offered.name?.includes(product.name), `${url} structured data is named "${offered.name}".`);
    const offers = [offered.offers].flat().filter(Boolean);
    ok(offers.length > 0, `${url} structured data carries no offer, so it has no price.`);

    for (const offer of offers) {
      const price = Number(offer.price ?? offer.lowPrice);
      ok(price > 0, `${url} offers a price of "${offer.price ?? offer.lowPrice}".`);
      ok(offer.priceCurrency === 'GBP', `${url} prices in "${offer.priceCurrency}", not GBP.`);
      ok(/schema\.org\/(InStock|OutOfStock|SoldOut|PreOrder|BackOrder|LimitedAvailability)/
        .test(String(offer.availability)),
        `${url} declares availability as "${offer.availability}".`);

      /* THE PRICE HAS TO BE ON THE PAGE TOO. Structured data quoting a figure a visitor cannot
       * see is the one thing in this file that earns a manual penalty rather than a shrug, and it
       * is exactly what would happen if this page ever priced from the static file while the shop
       * priced from the database. Deliberately NOT compared against `@/data/products`: the admin
       * has edited prices there and the database is what the shop charges.
       *
       * Matched against the page's TEXT with the tags taken out, because the pound sign sits in
       * its own element beside the number and the two are never adjacent in the markup. Scripts
       * go first so the block cannot satisfy the check by quoting itself. */
      ok(visibleText.includes(price.toFixed(2)),
        `${url} advertises £${price.toFixed(2)} in its structured data, and that figure appears `
        + 'nowhere in the page a visitor reads.');
    }
  }
}

/**
 * What /shop links to IS the answer to "which products exist".
 *
 * Deliberately not `@/data/products`: the admin has hidden 31 of those 61 and created others that
 * live only in the database, so the static file is wrong in both directions and a check built on
 * it fails on healthy days and passes on broken ones. The served page is the truth, so this reads
 * it and everything below is measured against what it found.
 */
async function checkShopIndex() {
  const url = `${BASE}/shop`;
  const { status, html } = await get(url);
  if (!ok(status === 200, `${url} answered ${status}, not 200.`)) return { links: new Set(), html: '' };

  const title = decode(between(html, /<title>([^<]*)<\/title>/));
  const description = decode(between(html, /<meta name="description" content="([^"]*)"/));
  const headings = html.match(/<h1[\s>]/g) ?? [];
  const links = new Set([...html.matchAll(/href="(\/shop\/[a-z0-9][a-z0-9-]*)"/g)].map((m) => m[1]));

  ok(title !== SITE_TITLE, `${url} wears the homepage title.`);
  ok(description && description !== SITE_DESCRIPTION, `${url} serves the homepage description.`);
  ok(headings.length === 1, `${url} serves ${headings.length} h1 headings; it should serve exactly one.`);

  /* The floor exists because this page once served 31KB of HTML with no product link in it at
   * all, and looked perfect in a browser the whole time. A crawler that cannot reach a page from
   * anywhere on the site treats it as an orphan however loudly the sitemap names it. */
  ok(links.size >= 20,
    `${url} serves ${links.size} product links in its HTML. The grid is drawn in the browser `
    + 'again, so a crawler sees a shop with nothing in it.');
  notes.push(`${url} serves ${links.size} product links in the HTML.`);
  return { links, html };
}

async function checkSitemapAgrees(linkedOnShop) {
  const url = `${BASE}/sitemap.xml`;
  const { status, html } = await get(url);
  if (!ok(status === 200, `${url} answered ${status}, not 200.`)) return;

  /* The sitemap always names the live host, whatever host served it, so compare paths. */
  const listed = new Set([...html.matchAll(/<loc>[^<]*?(\/shop\/[a-z0-9][a-z0-9-]*)<\/loc>/g)]
    .map((m) => m[1]));

  const advertisedButNotLinked = [...listed].filter((path) => !linkedOnShop.has(path));
  const linkedButNotAdvertised = [...linkedOnShop].filter((path) => !listed.has(path));

  ok(advertisedButNotLinked.length === 0,
    `The sitemap advertises ${advertisedButNotLinked.length} product pages that /shop does not `
    + `link to${advertisedButNotLinked.length ? `, starting with ${advertisedButNotLinked.slice(0, 3).join(', ')}` : ''}. `
    + 'A hidden product named in a sitemap is a 404 reported back in Search Console.');
  ok(linkedButNotAdvertised.length === 0,
    `${linkedButNotAdvertised.length} products are linked from /shop and missing from the sitemap`
    + `${linkedButNotAdvertised.length ? `, starting with ${linkedButNotAdvertised.slice(0, 3).join(', ')}` : ''}.`);

  /* An address in a sitemap that answers with a redirect is a crawl instruction pointing at a
   * signpost. Only the aliased ones can be wrong, so only they are worth the requests. */
  for (const pretty of Object.values(PRETTY_SLUG)) {
    if (!listed.has(`/shop/${pretty}`)) continue;
    const { status: code } = await get(`${BASE}/shop/${pretty}`);
    ok(code === 200, `${BASE}/shop/${pretty} answered ${code}; the address the sitemap gives must be the final one.`);
  }
  notes.push(`sitemap.xml advertises ${listed.size} product pages.`);
}

/**
 * The category pages as they actually come down the wire.
 *
 * The footer is the source of truth for which categories exist, for the same reason /shop is the
 * source of truth for which products exist: it is what a visitor and a crawler can actually
 * reach. A category page nothing links to is an orphan however correct its markup.
 */
async function checkCategoryPages(shopHtml) {
  const linked = [...new Set([...shopHtml.matchAll(/href="(\/shop\/category\/[a-z0-9][a-z0-9-]*)"/g)]
    .map((m) => m[1]))];

  if (!ok(linked.length >= 5,
    `/shop serves ${linked.length} category links in its HTML. The footer column is the only way `
    + 'in to these pages, so without it they are orphans.')) return [];
  notes.push(`the footer links ${linked.length} category pages.`);

  for (const p of linked) {
    const { status, html } = await get(`${BASE}${p}`);
    if (!ok(status === 200, `${BASE}${p} answered ${status}, not 200.`)) continue;

    const title = decode(between(html, /<title>([^<]*)<\/title>/));
    const description = decode(between(html, /<meta name="description" content="([^"]*)"/));
    const canonical = between(html, /<link rel="canonical" href="([^"]*)"/);
    const headings = html.match(/<h1[\s>]/g) ?? [];
    const products = new Set([...html.matchAll(/href="(\/shop\/[a-z0-9][a-z0-9-]*)"/g)].map((m) => m[1]));

    ok(title && title !== SITE_TITLE, `${p} is titled "${title}", which is the homepage title.`);
    ok(description && description !== SITE_DESCRIPTION, `${p} serves the homepage description.`);
    ok(headings.length === 1, `${p} serves ${headings.length} h1 headings; it should serve exactly one.`);
    ok(canonical === `${SITE_URL}${p}`, `${p} declares its canonical as "${canonical}", not "${SITE_URL}${p}".`);
    ok(products.size >= 1, `${p} serves no product links, so it is a category page with nothing on it.`);

    /* THE COMPLIANCE LINE, CHECKED RATHER THAN TRUSTED. The description may carry the category
     * name, a count and the standing research-use sentence, and nothing else. A sentence
     * explaining what the category or its compounds do would have to make it longer than that,
     * so a ceiling is the cheapest thing that would notice one being added later. */
    ok(description && description.length <= 220,
      `${p} has a ${description?.length ?? 0}-character description. A category page may say its `
      + 'name, its count and the research-use qualifier, and must never explain what the '
      + 'compounds in it do.');
    ok(/research use only/i.test(description ?? ''),
      `${p} does not carry the research-use qualifier in its description.`);
  }

  return linked;
}

/** Every ?category= link ever sent or pasted has to keep landing somewhere real. */
async function checkCategoryRedirect() {
  const name = 'Fat Loss';
  const url = `${BASE}/shop?category=${encodeURIComponent(name)}`;
  const { status, location } = await get(url);
  ok(status >= 300 && status < 400,
    `${url} answered ${status}. The old filter links have to redirect to the category page, or `
    + 'the same shelf lives at two addresses.');
  ok((location ?? '').endsWith('/shop/category/fat-loss'),
    `${url} redirects to "${location}", not /shop/category/fat-loss.`);
}

/** The footer and the sitemap have to name the same set, or one of them is lying. */
async function checkCategorySitemapAgrees(linkedInFooter) {
  const { status, html } = await get(`${BASE}/sitemap.xml`);
  if (!ok(status === 200, `${BASE}/sitemap.xml answered ${status}, not 200.`)) return;

  const listed = new Set([...html.matchAll(/<loc>[^<]*?(\/shop\/category\/[a-z0-9][a-z0-9-]*)<\/loc>/g)]
    .map((m) => m[1]));
  const footer = new Set(linkedInFooter);

  const onlySitemap = [...listed].filter((p) => !footer.has(p));
  const onlyFooter = [...footer].filter((p) => !listed.has(p));
  ok(onlySitemap.length === 0,
    `The sitemap advertises ${onlySitemap.length} category pages the footer does not link`
    + `${onlySitemap.length ? `: ${onlySitemap.slice(0, 3).join(', ')}` : ''}.`);
  ok(onlyFooter.length === 0,
    `The footer links ${onlyFooter.length} category pages the sitemap does not advertise`
    + `${onlyFooter.length ? `: ${onlyFooter.slice(0, 3).join(', ')}` : ''}.`);
  notes.push(`sitemap.xml advertises ${listed.size} category pages.`);
}

/** Job C and Job D, measured on the wire rather than in the source. */
async function checkFrontDoorPages() {
  const home = await get(`${BASE}/`);
  if (ok(home.status === 200, `${BASE}/ answered ${home.status}, not 200.`)) {
    const canonical = between(home.html, /<link rel="canonical" href="([^"]*)"/);
    ok(canonical === `${SITE_URL}/`, `The homepage declares its canonical as "${canonical}", not "${SITE_URL}/".`);
    ok(/property="og:image"/.test(home.html), 'The homepage serves no og:image, so a pasted link shows no picture.');
    const org = jsonLdBlocks(home.html).find((b) => b?.['@type'] === 'Organization');
    if (ok(org, 'The homepage carries no Organization structured data.')) {
      ok(org.name === 'Windsor Beauty', `The homepage Organization is named "${org.name}".`);
      ok(org.url === SITE_URL, `The homepage Organization gives its url as "${org.url}".`);
      /* INVENTED FACTS ARE THE ONE FAILURE MODE THAT MATTERS HERE. Structured data is read as a
       * factual claim about the business, so this block may only repeat what the site already
       * says. A postal address, a phone number or a company number appearing here would have
       * come from nowhere. */
      ok(!org.address && !org.telephone && !org.taxID && !org.vatID,
        'The homepage Organization block carries an address, telephone or company number. Those '
        + 'are not on the site, so they were invented. Only Kieran can supply them.');
    }
  }

  const blog = await get(`${BASE}/blog`);
  ok(blog.status === 404, `${BASE}/blog answered ${blog.status}, not 404.`);
}

/** /shop declaring itself a list of products. Hidden, and it changes nothing a visitor sees. */
function checkShopItemList(shopHtml) {
  const list = jsonLdBlocks(shopHtml).find((b) => b?.['@type'] === 'ItemList');
  if (!ok(list, '/shop carries no ItemList structured data.')) return;
  ok(Array.isArray(list.itemListElement) && list.itemListElement.length >= 20,
    `/shop declares an ItemList of ${list.itemListElement?.length ?? 0} items.`);
}

/* ── Run ───────────────────────────────────────────────────────────────────────────────────── */

console.log('\n  CAN A SEARCH ENGINE TELL THE PRODUCTS APART\n');
checkSource();
await checkCategorySource();
console.log(`  source: ${checked} checks over the shop pages, the category pages, the front door, `
  + 'the sitemap and the redirects.');

if (SERVED) {
  console.log(`  fetching ${BASE} as Googlebot: /shop, the category pages, /, sitemap.xml, `
    + 'and a sample of product pages\n');
  try {
    const { links: linked, html: shopHtml } = await checkShopIndex();
    await checkSitemapAgrees(linked);
    checkShopItemList(shopHtml);
    const categoryPaths = await checkCategoryPages(shopHtml);
    await checkCategorySitemapAgrees(categoryPaths);
    await checkCategoryRedirect();
    await checkFrontDoorPages();

    /* Sampled from what the shop really links to, so a product the admin hid this morning is not
     * mistaken for a broken page. Both aliased products are included when they are live, because
     * the canonical is likeliest to be wrong on exactly the two whose public address is not their
     * internal one. */
    const live = PRODUCTS.filter((p) => linked.has(shopUrl(p.slug)));
    const sample = [
      ...live.slice(0, 3),
      ...Object.keys(PRETTY_SLUG).map((internal) => live.find((p) => p.slug === internal)),
    ].filter((p, i, all) => p && all.indexOf(p) === i);

    for (const product of sample) await checkProductPage(product);
    notes.push(`checked ${sample.length} product pages: ${sample.map((p) => p.name).join(', ')}.`);
  } catch (error) {
    failures.push(`Could not read ${BASE}: ${error.message}. Start the site (npm run build && npm run start) `
      + 'or pass --base, or run --live against the real one.');
  }
} else {
  console.log('  served: not fetched. Run check:seo:served against a build, or check:seo:live '
    + 'against the real site, to prove what actually comes down the wire.\n');
}

for (const note of notes) console.log(`  ..    ${note}`);

if (failures.length) {
  console.log(`\n  ${failures.length} of ${checked} checks FAILED:\n`);
  for (const line of failures) console.log(`  FAIL  ${line}\n`);
  process.exit(1);
}
console.log(`\n  All ${checked} checks pass.\n`);
