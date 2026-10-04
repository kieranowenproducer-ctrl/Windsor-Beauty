// Task dfe5e9ae: working out where a visit came from, and which callers are
// not people. Pure functions, no database.   npm run test:site-visits
import assert from 'node:assert/strict';
import test from 'node:test';
import { looksLikeBot, sourceForVisit, visitSourceFrom } from '../src/lib/db/siteVisits.ts';

const IG_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 Instagram 336.0.0.30.90';
const FB_APP = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/21F90 [FBAN/FBIOS;FBAV/470.0.0.0.0]';
const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

test('a tagged link wins over everything else', () => {
  assert.equal(visitSourceFrom({ utmSource: 'instagram', referrer: 'https://www.google.com/', userAgent: SAFARI }).source, 'instagram');
  assert.equal(visitSourceFrom({ utmSource: 'IG', userAgent: SAFARI }).source, 'instagram');
  assert.equal(visitSourceFrom({ utmSource: 'newsletter', userAgent: SAFARI }).source, 'email');
  assert.deepEqual(visitSourceFrom({ utmSource: 'flyer-august', userAgent: SAFARI }), { source: 'campaign-link', detail: 'flyer-august' });
});

test('a QR or tracking-link campaign cookie counts as a tracking link', () => {
  assert.deepEqual(visitSourceFrom({ campaignSlug: 'gym-poster', userAgent: SAFARI }), { source: 'campaign-link', detail: 'campaign gym-poster' });
});

test('the referring site is read when there is no tag', () => {
  assert.equal(visitSourceFrom({ referrer: 'https://l.instagram.com/?u=https://www.windsorbeauty.co.uk', userAgent: SAFARI }).source, 'instagram');
  assert.equal(visitSourceFrom({ referrer: 'https://m.facebook.com/', userAgent: SAFARI }).source, 'facebook');
  assert.equal(visitSourceFrom({ referrer: 'https://www.tiktok.com/@someone', userAgent: SAFARI }).source, 'tiktok');
  assert.equal(visitSourceFrom({ referrer: 'https://www.google.co.uk/', userAgent: SAFARI }).source, 'google');
  assert.equal(visitSourceFrom({ referrer: 'https://t.co/abc', userAgent: SAFARI }).source, 'twitter');
  assert.deepEqual(visitSourceFrom({ referrer: 'https://blog.example.org/peptides', userAgent: SAFARI }), { source: 'another-site', detail: 'blog.example.org' });
});

test('moving around our own site is internal, not a new arrival', () => {
  assert.equal(visitSourceFrom({ referrer: 'https://www.windsorbeauty.is/shop', userAgent: SAFARI }).source, 'internal');
  assert.equal(visitSourceFrom({ referrer: 'https://windsorbeauty.is/', userAgent: SAFARI }).source, 'internal');
  assert.equal(visitSourceFrom({ referrer: 'https://www.windsorbeauty.co.uk/shop', userAgent: SAFARI }).source, 'internal');
  assert.equal(visitSourceFrom({ referrer: 'http://localhost:3000/', userAgent: SAFARI }).source, 'internal');
});

test('the app the visitor is browsing inside is the last resort before direct', () => {
  assert.deepEqual(visitSourceFrom({ userAgent: IG_APP }), { source: 'instagram', detail: 'Instagram app' });
  assert.deepEqual(visitSourceFrom({ userAgent: FB_APP }), { source: 'facebook', detail: 'Facebook app' });
  assert.deepEqual(visitSourceFrom({ userAgent: SAFARI }), { source: 'direct', detail: null });
  assert.deepEqual(visitSourceFrom({}), { source: 'direct', detail: null });
});

test('a later page in the same session reads as moving around the site, unless a link was tagged', () => {
  assert.equal(sourceForVisit({ landing: false, userAgent: IG_APP }).source, 'internal');
  assert.equal(sourceForVisit({ landing: false, userAgent: SAFARI }).source, 'internal');
  assert.equal(sourceForVisit({ landing: false, referrer: 'https://www.windsorbeauty.co.uk/shop', userAgent: SAFARI }).source, 'internal');
  assert.equal(sourceForVisit({ landing: false, utmSource: 'instagram', userAgent: SAFARI }).source, 'instagram');
  assert.equal(sourceForVisit({ landing: true, userAgent: IG_APP }).source, 'instagram');
  assert.equal(sourceForVisit({ landing: true, userAgent: SAFARI }).source, 'direct');
});

test('crawlers, monitors and scripts are not visitors', () => {
  assert.equal(looksLikeBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
  assert.equal(looksLikeBot('facebookexternalhit/1.1'), true);
  assert.equal(looksLikeBot('curl/8.4.0'), true);
  assert.equal(looksLikeBot('Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0'), true);
  assert.equal(looksLikeBot(''), true);
  assert.equal(looksLikeBot(SAFARI), false);
  assert.equal(looksLikeBot(IG_APP), false);
});
