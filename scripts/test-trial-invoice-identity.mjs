import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInvoiceInput } from '@/lib/invoices';
import { anonymiseTrialLines } from '@/lib/invoiceTrialLines';

const inventory = [{
  id: 17,
  name: 'Internal Trial cream',
  productCode: '909',
  variants: [{ dosage: '10 mg', price: 42, stock: 2 }],
}];

const base = {
  customerName: 'Test customer',
  email: 'test@example.com',
  lineItems: [{
    type: 'trial', slug: 'trial:17', name: 'Internal Trial cream',
    description: '10 mg', quantity: 1, unitPrice: 42, discount: 3,
    fulfilmentRef: 'Product 123456', // the browser must never select the code
  }],
};

test('picked Trial identity survives invoice save and renders the same permanent code', () => {
  const saved = parseInvoiceInput(base, inventory);
  assert.ok(saved);
  assert.equal(saved.lineItems[0].type, 'trial');
  assert.equal(saved.lineItems[0].slug, 'trial:17');
  assert.equal(saved.lineItems[0].name, 'Product 909');
  assert.equal(saved.lineItems[0].fulfilmentRef, 'Product 909');
  assert.equal(saved.lineItems[0].lineTotal, 39);

  const printed = anonymiseTrialLines(saved.lineItems);
  assert.equal(printed[0].name, 'Product 909');
  assert.equal(printed[0].fulfilmentRef, 'Product 909');
  assert.equal(printed[0].description, undefined);
  assert.equal(printed[0].slug, undefined);
  assert.equal(printed[0].lineTotal, 39);
  assert.ok(!JSON.stringify(printed).includes('Internal Trial cream'));
});

test('a manual line cannot smuggle a Trial name or code onto an invoice', () => {
  for (const line of [
    { type: 'custom', name: ' internal  trial cream ' },
    { type: 'custom', name: 'Product 909' },
    { type: 'custom', name: 'Internal Trial Cream (300ml)' },
    { type: 'product', name: 'Internal-Trial Cream', slug: 'ordinary-product' },
    { type: 'custom', name: 'Special item', description: 'Internal Trial Cream' },
  ]) {
    assert.equal(parseInvoiceInput({ ...base, lineItems: [{ ...line, quantity: 1, unitPrice: 42 }] }, inventory), null);
  }
});

test('a Trial line requires a real inventory id and selected variant', () => {
  assert.equal(parseInvoiceInput({ ...base, lineItems: [{ ...base.lineItems[0], slug: 'trial:99' }] }, inventory), null);
  assert.equal(parseInvoiceInput({ ...base, lineItems: [{ ...base.lineItems[0], description: 'unknown' }] }, inventory), null);
  assert.equal(parseInvoiceInput({ ...base, lineItems: [{ ...base.lineItems[0], type: 'custom' }] }, inventory), null);
});

test('the admin builder shows the real Trial name, but the picker never exposes costs', async () => {
  // Regression, 16 Sept: the builder listed only "Product 36", "Product 53" and
  // the admin could not tell what anything was. The name is for the admin's
  // eyes only; the saved line is still replaced with the code (tested above).
  const { readFile } = await import('node:fs/promises');
  const route = await readFile(new URL('../src/app/api/admin/invoices/trial-picker/route.ts', import.meta.url), 'utf8');
  assert.match(route, /name: product\.name/);
  assert.match(route, /\(\{ dosage, price, stock \}\) => \(\{ dosage, price, stock \}\)/);
  assert.doesNotMatch(route, /rawCost|components|shipping/);
  const builder = await readFile(new URL('../src/app/admin/invoices/[id]/edit/InvoiceLineItems.tsx', import.meta.url), 'utf8');
  assert.match(builder, /\{p\.name\} \(\{p\.code\}\)/);
});
