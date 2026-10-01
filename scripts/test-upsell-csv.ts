import { parseUpsellCsv, UPSELL_CSV_EXAMPLE } from '../src/lib/upsellCsv';

function section(title: string) {
  console.log(`\n=== ${title} ===`);
}

section('Valid example CSV');
{
  const result = parseUpsellCsv(UPSELL_CSV_EXAMPLE);
  console.log('rows:', result.rows.length, 'errors:', result.errors.length, 'fatal:', result.fatalError);
  console.assert(result.rows.length === 4, 'expected 4 valid rows');
  console.assert(result.errors.length === 0, 'expected no errors');
  console.assert(result.fatalError === null, 'expected no fatal error');
}

section('Missing required columns');
{
  const result = parseUpsellCsv('foo,bar\nretatrutide,bac-water-10ml');
  console.log('fatal:', result.fatalError);
  console.assert(result.fatalError !== null, 'expected a fatal error');
}

section('Self-upsell rejected');
{
  const csv = `trigger_product_handle,upsell_product_handle,priority,active
retatrutide,retatrutide,1,TRUE`;
  const result = parseUpsellCsv(csv);
  console.log('rows:', result.rows.length, 'errors:', result.errors);
  console.assert(result.rows.length === 0, 'self-upsell row should be rejected');
  console.assert(result.errors.length === 1 && /cannot upsell itself/.test(result.errors[0].reason), 'expected self-upsell error');
}

section('Duplicate relationship within file');
{
  const csv = `trigger_product_handle,upsell_product_handle,priority,active
retatrutide,bac-water-10ml,1,TRUE
retatrutide,bac-water-10ml,2,TRUE`;
  const result = parseUpsellCsv(csv);
  console.log('rows:', result.rows.length, 'errors:', result.errors);
  console.assert(result.rows.length === 1, 'expected only the first occurrence to be kept');
  console.assert(result.errors.length === 1 && /Duplicate relationship/.test(result.errors[0].reason), 'expected duplicate error');
}

section('Invalid priority');
{
  const csv = `trigger_product_handle,upsell_product_handle,priority,active
retatrutide,bac-water-10ml,abc,TRUE
retatrutide,insulin-syringes,0,TRUE
retatrutide,alcohol-wipes,-1,TRUE`;
  const result = parseUpsellCsv(csv);
  console.log('rows:', result.rows.length, 'errors:', result.errors.length);
  console.assert(result.rows.length === 0, 'expected all 3 rows to be rejected (non-numeric, zero, negative)');
  console.assert(result.errors.length === 3, 'expected 3 priority errors');
}

section('Invalid active flag');
{
  const csv = `trigger_product_handle,upsell_product_handle,priority,active
retatrutide,bac-water-10ml,1,MAYBE`;
  const result = parseUpsellCsv(csv);
  console.log('rows:', result.rows.length, 'errors:', result.errors);
  console.assert(result.rows.length === 0, 'expected row rejected');
  console.assert(/Invalid active value/.test(result.errors[0]?.reason ?? ''), 'expected active-flag error');
}

section('active = FALSE is stored, not rejected');
{
  const csv = `trigger_product_handle,upsell_product_handle,priority,active
retatrutide,bac-water-10ml,1,FALSE`;
  const result = parseUpsellCsv(csv);
  console.log('rows:', result.rows.length, 'active:', result.rows[0]?.active);
  console.assert(result.rows.length === 1, 'expected the row to be imported');
  console.assert(result.rows[0]?.active === false, 'expected active=false to be preserved');
}

section('Missing column values (blank handle)');
{
  const csv = `trigger_product_handle,upsell_product_handle,priority,active
,bac-water-10ml,1,TRUE`;
  const result = parseUpsellCsv(csv);
  console.log('rows:', result.rows.length, 'errors:', result.errors);
  console.assert(result.rows.length === 0, 'expected row rejected');
}

section('Quoted custom_message containing a comma');
{
  const csv = `trigger_product_handle,upsell_product_handle,priority,custom_message,active
retatrutide,bac-water-10ml,1,"Great value, buy together",TRUE`;
  const result = parseUpsellCsv(csv);
  console.log('rows:', result.rows.length, 'message:', result.rows[0]?.customMessage);
  console.assert(result.rows[0]?.customMessage === 'Great value, buy together', 'expected quoted comma to be preserved');
}

section('Handles normalised to lowercase/trimmed');
{
  const csv = `trigger_product_handle,upsell_product_handle,priority,active
 Retatrutide , BAC-Water-10ML ,1,TRUE`;
  const result = parseUpsellCsv(csv);
  console.log('trigger:', result.rows[0]?.triggerHandle, 'upsell:', result.rows[0]?.upsellHandle);
  console.assert(result.rows[0]?.triggerHandle === 'retatrutide', 'expected lowercase trimmed trigger');
  console.assert(result.rows[0]?.upsellHandle === 'bac-water-10ml', 'expected lowercase trimmed upsell');
}

section('Future start_date/end_date columns');
{
  const csv = `trigger_product_handle,upsell_product_handle,priority,active,start_date,end_date
retatrutide,bac-water-10ml,1,TRUE,2026-01-01,2026-12-31
retatrutide,insulin-syringes,2,TRUE,not-a-date,`;
  const result = parseUpsellCsv(csv);
  console.log('rows:', result.rows.length, 'errors:', result.errors);
  console.assert(result.rows.length === 1, 'expected 1 valid row, 1 rejected for bad date');
  console.assert(result.rows[0]?.startDate === '2026-01-01' && result.rows[0]?.endDate === '2026-12-31', 'expected dates parsed');
}

console.log('\nAll assertions passed (any failures above would have printed "Assertion failed" from console.assert).');
