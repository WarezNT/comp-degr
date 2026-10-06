'use strict';
/*
 * Teste end-to-end în Chromium (Playwright): interacțiuni reale — tastare, Tab, click —
 * pentru ghidul pas cu pas, păstrarea focusului, mobil și contrast.
 */
const path = require('path');
const { chromium } = require('playwright');

const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let failures = 0;

function check(name, ok, detail) {
  console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : ' — ' + detail));
  if (!ok) failures++;
}

async function newPage(browser, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto(URL);
  await page.waitForSelector('#app *');
  return page;
}

// Câmpul evidențiat de ghid (cheia data-bind / data-guide).
const activeKey = (page) => page.evaluate(() => {
  const el = document.querySelector('[data-guide-active]');
  return el ? (el.getAttribute('data-bind') || el.getAttribute('data-guide')) : null;
});
const focusedKey = (page) => page.evaluate(() => {
  const el = document.activeElement;
  return el ? (el.getAttribute('data-bind') || el.getAttribute('data-guide')) : null;
});

(async () => {
  const launchOpts = { args: ['--no-sandbox'] };
  if (process.env.CHROME_PATH) launchOpts.executablePath = process.env.CHROME_PATH;
  const browser = await chromium.launch(launchOpts);

  /* ---------- 1. Proiect nou: ghid pas cu pas, cu tastatură reală ---------- */
  console.log('Ghid pas cu pas (proiect nou)');
  let page = await newPage(browser, 1300, 1000);
  check('ecranul de start apare fără proiect salvat', !!(await page.$('.start-card')), 'lipsește');
  await page.click('.start-actions [data-action="new"]');
  check('primul pas: câmpul „model” e evidențiat', (await activeKey(page)) === 'meta.model', String(await activeKey(page)));
  check('focusul e mutat pe câmpul indicat', (await focusedKey(page)) === 'meta.model', String(await focusedKey(page)));
  check('bara de ghid arată „Pasul 1”', /Pasul 1 ·/.test(await page.textContent('.guidebar')), '');

  await page.click('.guidebar >> text=Anexa 1 e corect');
  check('după confirmare, ghidul trece la „operator”', (await activeKey(page)) === 'meta.operator', String(await activeKey(page)));
  check('…și focusul urmează', (await focusedKey(page)) === 'meta.operator', String(await focusedKey(page)));

  await page.keyboard.type('Operator Test');
  await page.keyboard.press('Enter');
  check('Enter în câmp → ghidul trece la tabul Utilizatori, butonul „Adaugă utilizator”', (await activeKey(page)) === 'btn:add-user' && (await page.getAttribute('#tab-utilizatori', 'aria-selected')) === 'true', String(await activeKey(page)));

  // restul parcursului, cu acțiuni reale pe elementul evidențiat
  let guard = 0;
  while (guard++ < 40) {
    const done = await page.$('.guidebar.done');
    if (done) break;
    const key = await activeKey(page);
    if (!key) { check('există un câmp evidențiat la fiecare pas', false, 'la pasul ' + guard); break; }
    const A = '[data-guide-active]';
    if (key.startsWith('btn:') || key.startsWith('cell:')) {
      await page.click(A);
    } else if (/\.nume$/.test(key)) {
      await page.fill(A, 'Utilizator ' + guard); await page.keyboard.press('Tab');
    } else if (/\.dataTR$/.test(key)) {
      await page.fill(A, '2024-01-01'); await page.keyboard.press('Tab');
    } else if (/\.IL$/.test(key)) {
      await page.click(A); await page.keyboard.type('6000'); await page.keyboard.press('Tab');
    } else if (/\.L$/.test(key)) {
      await page.click(A); await page.keyboard.type('200'); await page.keyboard.press('Tab');
    } else if (/\.lungime$/.test(key)) {
      await page.click(A); await page.keyboard.type('100'); await page.keyboard.press('Tab');
    } else {
      // pas cu confirmare (ex. „Am verificat condițiile”) sau opțional
      const confirm = await page.$('.guidebar button:has-text("continuă"), .guidebar button:has-text("Am verificat")');
      if (confirm) await confirm.click();
      else { check('pas necunoscut în scenariu', false, key); break; }
    }
    // calculul se face din butonul evidențiat; după el ghidul se încheie
  }
  check('ghidul a ajuns la „Toate datele sunt completate”', !!(await page.$('.guidebar.done')), 'după ' + guard + ' pași');
  const total = await page.evaluate(() => window.AppUI.store.results && window.AppUI.store.results.central && window.AppUI.store.results.central.totalFaraTVA);
  check('calculul final a dat un rezultat pozitiv', total > 0, String(total));
  check('fără erori JS în tot parcursul', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  /* ---------- 2. Focus la Tab între câmpuri, fără re-randare totală ---------- */
  console.log('Tastatură și focus');
  page = await newPage(browser, 1300, 1000);
  await page.click('.start-actions [data-action="demo-u4"]');
  await page.click('#tab-date');
  await page.focus('[data-bind="meta.operator"]');
  await page.keyboard.type('XY');
  await page.keyboard.press('Tab');
  const f = await focusedKey(page);
  check('după Tab focusul trece la câmpul următor (nu la <body>)', f === 'meta.codOperator', String(f));
  // panoul nu se remontează la o modificare (animația rulează doar la schimbarea pasului)
  await page.evaluate(() => document.getElementById('panel').firstElementChild.setAttribute('data-marker', '1'));
  await page.check('[data-bind="meta.withTva"]');
  const keep = await page.evaluate(() => document.getElementById('panel').firstElementChild.getAttribute('data-marker'));
  check('panoul nu se remontează la o modificare (fără „flash”)', keep === '1', 'panou remontat');
  await page.click('#tab-utilizatori');
  const remount = await page.evaluate(() => document.getElementById('panel').firstElementChild.getAttribute('data-marker'));
  check('panoul se schimbă la schimbarea pasului', remount === null, 'același panou');
  await page.close();

  /* ---------- 3. Mobil ---------- */
  console.log('Mobil (390 px)');
  page = await newPage(browser, 390, 800);
  await page.click('.start-actions [data-action="demo-u4"]');
  for (const t of ['date', 'utilizatori', 'instalatie', 'rezultate']) {
    await page.click('#tab-' + t);
    if (t === 'rezultate') await page.click('[data-guide="btn:calc"]');
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('fără scroll orizontal pe pagină la pasul „' + t + '”', over <= 1, 'depășire ' + over + 'px');
  }
  await page.click('#tab-utilizatori');
  const thead = await page.evaluate(() => getComputedStyle(document.querySelector('table.users thead')).display);
  check('tabelul de utilizatori devine carduri pe mobil', thead === 'none', thead);
  const helperOpen = await page.evaluate(() => { const d = document.querySelector('.helper details'); return d ? d.open : null; });
  check('ajutorul e restrâns pe mobil', helperOpen === false, String(helperOpen));
  const helperBelow = await page.evaluate(() => {
    const main = document.querySelector('.panel-main').getBoundingClientRect();
    const help = document.querySelector('.helper').getBoundingClientRect();
    return help.top >= main.bottom - 1;
  });
  check('ajutorul stă sub conținut pe mobil', helperBelow, 'deasupra');
  await page.close();

  /* ---------- 4. Contrast ---------- */
  console.log('Accesibilitate');
  page = await newPage(browser, 1300, 900);
  await page.click('.start-actions [data-action="demo-u4"]');
  await page.click('#tab-instalatie');
  const ratio = await page.evaluate(() => {
    function lum(c) { const a = c.match(/\d+/g).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; }
    const el = document.querySelector('.hint');
    const fg = lum(getComputedStyle(el).color);
    const bg = lum(getComputedStyle(document.body).backgroundColor);
    const hi = Math.max(fg, bg), lo = Math.min(fg, bg);
    return (hi + 0.05) / (lo + 0.05);
  });
  check('textul de ajutor are contrast ≥ 4,5:1 (' + ratio.toFixed(2) + ')', ratio >= 4.5, ratio.toFixed(2));
  const unlabeled = await page.evaluate(() => Array.from(document.querySelectorAll('input, select')).filter((e) => {
    if (e.type === 'hidden') return false;
    if (e.getAttribute('aria-label')) return false;
    if (e.id && document.querySelector('label[for="' + e.id + '"]')) return false;
    if (e.closest('label')) return false;
    return true;
  }).length);
  check('toate câmpurile au etichetă (label / aria-label)', unlabeled === 0, unlabeled + ' fără etichetă');
  await page.close();

  /* ---------- 5. Persistență și import ---------- */
  console.log('Persistență și import');
  page = await newPage(browser, 1300, 900);
  await page.click('.start-actions [data-action="new"]');
  await page.click('.guidebar >> text=Anexa 1 e corect');
  await page.keyboard.type('Operator Persistent');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);   // fereastra de debounce a salvării
  await page.reload();
  await page.waitForSelector('.tabs');
  const saved = await page.evaluate(() => window.AppUI.getState().meta.operator);
  check('proiectul se păstrează după reîncărcare (fără ecran de start)', saved === 'Operator Persistent', String(saved));
  // import în format vechi (prim/operator booleene + lista noilor utilizatori)
  const fs = require('fs');
  const os = require('os');
  const file = path.join(os.tmpdir(), 'comp-degr-old-format.json');
  fs.writeFileSync(file, JSON.stringify({
    meta: { model: 'line', operator: 'Import vechi', nouUtilizatoriIds: ['b'] },
    utilizatori: [{ id: 'a', nume: 'A', prim: true, dataTR: '2020-01-01' }, { id: 'b', nume: 'B' }],
    linii: [{ id: 'l', nume: 'L', IL: 3000, L: 100, tronsoane: [{ id: 't', nume: 'T', lungime: 100, utilizatori: ['a', 'b'] }] }]
  }));
  await page.setInputFiles('input[data-action="import-json"]', file);
  await page.waitForFunction(() => window.AppUI.getState().meta.operator === 'Import vechi');
  const roles = await page.evaluate(() => window.AppUI.getState().utilizatori.map((u) => u.rol).join());
  check('importul din formatul vechi migrează rolurile (prim,nou)', roles === 'prim,nou', roles);
  await page.close();

  await browser.close();
  console.log(failures ? '\n' + failures + ' verificări e2e eșuate.' : '\nToate verificările e2e au trecut.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
