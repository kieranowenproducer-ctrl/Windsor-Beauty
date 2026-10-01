// Visual audit: /pay page (locked + unlocked states) and the coming-soon
// registration modal, on production. node scripts/audit-shots.mjs <outdir> <payToken>
import puppeteer from 'puppeteer-core';

const [outDir = '.', payToken] = process.argv.slice(2);
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  defaultViewport: { width: 860, height: 1250 },
});
const page = await browser.newPage();

// Pre-pass the site EntryGate (session-scoped) so we photograph the pay page
// itself; the gate has its own screenshot from the earlier pass.
await page.evaluateOnNewDocument(() => {
  sessionStorage.setItem('wg_entry_confirmed', 'true');
  sessionStorage.setItem('wg_terms_accepted', 'true');
});

// 1. Pay page — locked state (checkbox unticked)
await page.goto(`https://www.windsorglow.com/pay/${payToken}`, { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise(r => setTimeout(r, 1200));
await page.screenshot({ path: `${outDir}/wg-pay-locked.png` });

// 2. Tick the T&C box -> buttons unlock
const ticked = await page.evaluate(() => {
  const box = document.querySelector('input[type="checkbox"]');
  if (box && !box.checked) { box.click(); return true; }
  return !!box;
});
await new Promise(r => setTimeout(r, 700));
await page.screenshot({ path: `${outDir}/wg-pay-unlocked.png` });
console.log('pay page checkbox found:', ticked);

// 3. Coming-soon modal with the new expectations panel
await page.goto('https://www.windsorglow.com/coming-soon', { waitUntil: 'networkidle0', timeout: 60000 });
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Become a Windsor Glow Member'));
  btn?.click();
});
await new Promise(r => setTimeout(r, 800));
await page.screenshot({ path: `${outDir}/wg-modal.png` });

await browser.close();
console.log('done');
