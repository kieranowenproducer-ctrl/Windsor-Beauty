// Focused contract checks for permanent Trial Product codes.
// Run: node --import ./scripts/alias-loader.mjs --experimental-strip-types --no-warnings --test scripts/test-trial-product-codes.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { trialRefNumber, trialRoyalMailRef } from '@/lib/trialRoyalMailRef';

test('existing Royal Mail Product numbers stay pinned', () => {
  assert.equal(trialRoyalMailRef(8), 'Product 207');
  assert.equal(trialRoyalMailRef(31), 'Product 661');
  assert.equal(trialRoyalMailRef(33), `Product ${trialRefNumber(33)}`);
});

test('a stored code wins when the historic ID formula cycles', () => {
  assert.equal(trialRefNumber(1), trialRefNumber(900), 'the old formula cycles at 899 IDs');
  assert.equal(trialRoyalMailRef(900, '909'), 'Product 909');
  assert.notEqual(trialRoyalMailRef(900, '909'), trialRoyalMailRef(1));
  assert.equal(trialRoyalMailRef(900, '9007199254740993'), 'Product 9007199254740993');
});

test('a stored code cannot become a fabricated or rounded Product label', () => {
  for (const code of ['0', '-1', '1.5', 'Product 909', '9e2', '', ' 909']) {
    assert.throws(() => trialRoyalMailRef(8, code));
  }
  assert.throws(() => trialRoyalMailRef(8, Number.MAX_SAFE_INTEGER + 1));
});

test('database migration preserves old numbers and never resets the sequence after deletion', () => {
  const source = fs.readFileSync('src/lib/db/trialProducts.ts', 'utf8');
  assert.match(source, /SET product_code = \(\(id::bigint \* 137\) % 899\) \+ 10\s+WHERE product_code IS NULL/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS trial_products_product_code_unique/);
  assert.match(source, /CREATE SEQUENCE IF NOT EXISTS trial_product_code_seq AS bigint START WITH 909/);
  assert.match(source, /MAX\(product_code\)[\s\S]*>= \(SELECT last_value FROM trial_product_code_seq\)/);
  assert.match(source, /SET DEFAULT nextval\('trial_product_code_seq'\)/);
  assert.match(source, /SET NOT NULL/);
});
