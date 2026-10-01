import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'src/data/pearl/offline-sources/pep-university.json');
const url = 'https://pepuniversity.com/peptide-codex.php';
const executablePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const browser = await chromium.launch({
  headless: false,
  executablePath,
  args: ['--window-position=-32000,-32000', '--disable-blink-features=AutomationControlled'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForSelector('#peptide-dropdown option:nth-child(2)', { state: 'attached', timeout: 30_000 });
  const options = await page.locator('#peptide-dropdown option').evaluateAll((nodes) => nodes
    .map((node) => ({ value: node.value, name: node.textContent?.trim() || '' }))
    .filter((item) => item.value));
  const previous = await readFile(output, 'utf8').then(JSON.parse).catch(() => ({ records: [], failures: [] }));
  const retryOnly = process.argv.includes('--retry-failures');
  const wanted = retryOnly
    ? options.filter((option) => (previous.failures || []).some((failure) => failure.value === option.value))
    : options;
  const records = retryOnly ? [...(previous.records || [])] : [];
  const failures = [];
  for (const [index, option] of wanted.entries()) {
    try {
      await page.locator('#peptide-dropdown').selectOption(option.value);
      await page.waitForFunction((expected) => document.querySelector('#out-title')?.textContent?.trim() === expected, option.name, { timeout: 15_000 });
      const record = await page.locator('#codex-results').evaluate((root, selected) => {
        const texts = (selector) => Array.from(root.querySelectorAll(selector)).map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '').filter(Boolean);
        const protocols = Array.from(root.querySelectorAll('#tables-container .tab-content')).map((panel, panelIndex) => ({
          label: root.querySelectorAll('#tables-container .tab-btn')[panelIndex]?.textContent?.trim() || `Protocol ${panelIndex + 1}`,
          rows: Array.from(panel.querySelectorAll('tbody tr')).map((row) => {
            const cells = Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() || '');
            return { timeframe: cells[0] || '', dose: cells[1] || '', notes: cells[2] || '' };
          }),
        })).filter((protocol) => protocol.rows.length);
        return {
          key: selected.value,
          optionName: selected.name,
          name: root.querySelector('#out-title')?.textContent?.trim() || selected.name,
          routes: texts('#out-routes .badge'),
          description: root.querySelector('#out-desc')?.textContent?.replace(/\s+/g, ' ').trim() || '',
          vialSizes: Array.from(root.querySelectorAll('#codex-vial-select option')).map((node) => node.textContent?.trim() || '').filter((value) => value && !/select|custom/i.test(value)),
          protocols,
          washout: texts('#out-washout li'),
          contraindications: texts('#out-contra li'),
          sideEffects: texts('#out-sides li'),
        };
      }, option);
      const existing = records.findIndex((item) => item.key === record.key);
      if (existing === -1) records.push(record); else records[existing] = record;
      process.stdout.write(`\rPeptide University: ${index + 1}/${wanted.length}`);
    } catch (error) {
      failures.push({ ...option, error: String(error) });
    }
  }
  process.stdout.write('\n');
  await writeFile(output, `${JSON.stringify({
    sourceId: 'pep-university',
    sourceUrl: url,
    capturedAt: new Date().toISOString(),
    records,
    failures,
  }, null, 2)}\n`, 'utf8');
  console.log(`Captured ${records.length}/${options.length} public compound records (${failures.length} failures) to ${output}`);
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
