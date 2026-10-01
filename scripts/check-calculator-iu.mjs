// Open the calculator and actually use it, at desktop and phone width (task e1f77268).
//
//   npm run build && npm start -- -p 3213     (in another terminal)
//   npm run check:calculator-iu
//
// The unit tests in scripts/test-syringe-iu.mjs prove the sums. They cannot prove that the control
// is on the screen, that the IU reading reaches the results, or that a customer's typed figures
// survive a change of unit, because none of that is arithmetic. This drives the real page.
//
// The clearing is the one to watch. The page used to empty the amount and the dose when somebody
// crossed between mass and IU, and Kieran asked for that to stop: "Ensure if someone changes to iu
// or mg or whatever that any number that a customer enters doesn't clear also."
import { chromium } from 'playwright-core';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// The cached browser, whichever build happens to be there. Same finder as check-responsive.mjs:
// the version is deliberately not pinned, because a check that cannot run is worse than none.
function findChromium() {
  const root = join(process.env.LOCALAPPDATA ?? join(process.env.HOME ?? '', 'AppData', 'Local'), 'ms-playwright');
  if (!existsSync(root)) return null;
  for (const build of readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().reverse()) {
    for (const exe of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const path = join(root, build, exe);
      if (existsSync(path)) return path;
    }
  }
  return null;
}
const exe = findChromium();
if (!exe) {
  console.error('\n  No cached chromium found. Run `npx playwright install chromium` once.\n');
  process.exit(1);
}

const BASE = process.env.BASE || 'http://localhost:3213';
let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ok       ${name}`); }
  else { failed++; console.log(`  FAILED   ${name}${detail ? '\n             ' + detail : ''}`); }
};

const browser = await chromium.launch({ executablePath: exe });

for (const [label, width, height] of [['desktop', 1280, 900], ['phone', 390, 844]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  console.log(`\n=== ${label} (${width}px) ===\n`);
  await page.goto(`${BASE}/calculator`, { waitUntil: 'networkidle' });

  const vialUnit = page.getByLabel('Vial unit');
  check('the vial has a unit control', await vialUnit.count() === 1);
  const options = await vialUnit.locator('option').allTextContents();
  check('it offers mg and IU', options.join(',') === 'mg,IU', `got ${JSON.stringify(options)}`);

  // The old second question must be gone.
  const bodyText = await page.locator('body').innerText();
  check('the old "How is the product amount measured?" box is gone',
    !bodyText.includes('How is the product amount measured'));

  // Type a real growth hormone vial, in milligrams first.
  const amount = page.locator('input[placeholder="Enter a custom amount"]').first();
  const dose = page.locator('input[placeholder="Enter a custom amount"]').last();
  const water = page.locator('input[type="number"]').nth(1);
  await amount.fill('36');
  await water.fill('3');
  await dose.fill('2');
  await page.waitForTimeout(150);

  // Now switch the vial to IU. Nothing may clear.
  await vialUnit.selectOption('iu');
  await page.waitForTimeout(200);
  check('switching to IU keeps the vial amount', await amount.inputValue() === '36', `got "${await amount.inputValue()}"`);
  check('switching to IU keeps the water', await water.inputValue() === '3', `got "${await water.inputValue()}"`);
  check('switching to IU keeps the dose', await dose.inputValue() === '2', `got "${await dose.inputValue()}"`);

  const after = await page.locator('body').innerText();
  check('the concentration now reads in IU per mL', /12\.00 IU\/mL/.test(after),
    after.split('\n').filter(l => /IU\/mL|mcg\/mL/.test(l)).join(' | '));
  check('the dose line reads in IU', /\b2 IU\b/.test(after));
  check('no microgram figure is shown for an IU vial', !/mcg\/mL/.test(after));
  check('the draw volume is shown', /0\.167 mL/.test(after), after.split('\n').filter(l => / mL/.test(l)).slice(0, 4).join(' | '));

  // And back again, still keeping everything.
  await vialUnit.selectOption('mg');
  await page.waitForTimeout(200);
  check('switching back to mg keeps every figure',
    await amount.inputValue() === '36' && await water.inputValue() === '3' && await dose.inputValue() === '2');
  const back = await page.locator('body').innerText();
  check('and the milligram reading returns', /mcg\/mL/.test(back));

  // Nothing may hang off the side of a phone.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('the page does not scroll sideways', overflow <= 1, `overflows by ${overflow}px`);

  // The V3 pen tab shares these figures and sits in the file that was changed, so it is checked
  // rather than assumed.
  await page.getByRole('button', { name: /V3 pen/ }).click();
  await page.waitForTimeout(300);
  const pen = await page.locator('body').innerText();
  check('the V3 pen tab still opens', /IU and V3-Pen Calculator|V3-Pen/.test(pen));
  check('and it still has the figures typed on the syringe side', pen.includes('36') || pen.includes('3'));

  await page.close();
}

console.log(`\n  ${passed + failed} checks, ${passed} passed, ${failed} failed.\n`);
await browser.close();
process.exit(failed > 0 ? 1 : 0);
