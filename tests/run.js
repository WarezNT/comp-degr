'use strict';
/*
 * Rulează în Chromium headless paginile de test și iese cu cod != 0 dacă
 * vreun test eșuează.  Utilizare:  npm test
 * (opțional: CHROME_PATH=/cale/catre/chrome pentru un browser existent)
 */
const path = require('path');
const { chromium } = require('playwright');

const PAGES = ['tests/test.html', 'tests/integration.html'];

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launchOpts);
  let failed = 0;
  for (const rel of PAGES) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('file://' + path.resolve(__dirname, '..', rel));
    await page.waitForSelector('.summary', { timeout: 15000 });
    const summary = (await page.textContent('.summary')).trim();
    const fails = await page.$$eval('.t.fail, .fail.t', (els) => els.map((e) => e.textContent.trim()));
    console.log(rel + ' — ' + summary);
    fails.forEach((f) => console.log('   ✗ ' + f));
    errors.forEach((e) => console.log('   JS error: ' + e));
    if (fails.length || errors.length || /(\d+) eșuate/.exec(summary)[1] !== '0') failed++;
    await page.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
