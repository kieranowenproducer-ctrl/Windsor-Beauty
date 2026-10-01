// ADSLAB item 16: the after-the-click tables must never show a raw web address
// as the name of a page. Pure functions, no database.
//   npm run test:ad-page-names
import assert from 'node:assert/strict';
import test from 'node:test';
import { describePage, prettifySlug, pageTitle } from '../src/lib/ads/pageNames.ts';

test('the fixed pages read as a person would say them', () => {
  assert.equal(pageTitle('/'), 'Home page');
  assert.equal(pageTitle('/shop'), 'Shop, the whole product list');
  assert.equal(pageTitle('/reviews'), 'Reviews page');
  assert.equal(pageTitle('/checkout/success'), 'Thank-you page, straight after ordering');
  assert.equal(pageTitle('/account'), 'Their own account area');
  assert.equal(pageTitle('/account/login'), 'Sign-in page');
  assert.equal(pageTitle('/account/register'), 'Signing up for an account');
  assert.equal(pageTitle('/account/verify-email'), 'Confirming their email address');
  assert.equal(pageTitle('/cart'), 'Basket');
});

test('the small print is grouped and named, not left as an address', () => {
  assert.equal(pageTitle('/privacy'), 'Small print: Privacy policy');
  assert.equal(pageTitle('/refund-policy'), 'Small print: Refund policy');
});

test('a product page uses the real product name when it is supplied', () => {
  const names = { '/shop/retatrutide-pen': 'Retatrutide Pen' };
  assert.equal(pageTitle('/shop/retatrutide-pen', names), 'Product page: Retatrutide Pen');
});

test('a product page with no supplied name still reads as words', () => {
  assert.equal(
    pageTitle('/shop/recovery-pen-windsor-glow-bpc-157-tb500-kpv'),
    'Product page: Recovery Pen Windsor Glow BPC 157 TB500 KPV',
  );
  assert.equal(pageTitle('/shop/wolverine-blend'), 'Product page: Wolverine Blend');
});

test('articles, categories and offers are named too', () => {
  assert.equal(pageTitle('/shop/category/fat-loss', { '/shop/category/fat-loss': 'Fat Loss' }), 'Shop, the Fat Loss category');
  assert.equal(pageTitle('/promotion/summer-sale'), 'Offer: Summer Sale');
});

test('the address is always kept beside the name, for tracing a row', () => {
  const d = describePage('/account/verify-email');
  assert.equal(d.address, '/account/verify-email');
  assert.equal(d.kind, 'account');
  assert.ok(!d.title.includes('/'), `the name must not contain a slash: ${d.title}`);
});

test('no page name is ever a bare address', () => {
  const paths = [
    '/', '/shop', '/reviews', '/checkout/success', '/account', '/account/login', '/account/register',
    '/account/verify-email', '/shop/anything', '/shop/category/anything',
    '/orders/WG-1001', '/pay/abc123', '/r/gym-poster', '/something-nobody-planned-for', '/privacy',
  ];
  for (const path of paths) {
    const title = describePage(path).title;
    assert.ok(title.length > 0, `${path} produced an empty name`);
    assert.ok(!title.startsWith('/'), `${path} still shows as an address: ${title}`);
  }
});

test('a trailing slash does not create a second, uglier name', () => {
  assert.equal(pageTitle('/shop/'), pageTitle('/shop'));
  assert.equal(pageTitle('/reviews/'), 'Reviews page');
});

test('short letter-only words keep their capitals, doses stay lowercase', () => {
  assert.equal(prettifySlug('bpc-157'), 'BPC 157');
  assert.equal(prettifySlug('dsip-10mg'), 'DSIP 10mg');
  assert.equal(prettifySlug('super-human-blend'), 'Super Human Blend');
});
