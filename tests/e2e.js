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
    } else if (key.startsWith('dist:')) {
      // linie pe distanțe: fiecare utilizator primește o distanță de la PR
      await page.fill(A, String(10 * guard));
      await page.keyboard.press('Tab');
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
  const helper = await page.evaluate(() => {
    const menu = document.querySelector('details.help-menu');
    return { exists: !!menu, open: menu ? menu.open : null, aside: !!document.querySelector('.helper') };
  });
  check('ajutorul e în bara de sus, restrâns', helper.exists && helper.open === false, JSON.stringify(helper));
  check('fără panoul de ajutor în coloana din dreapta', helper.aside === false, 'există încă');
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

  /* ---------- 6. Ecrane late: fără scroll în tabele ---------- */
  console.log('Ecrane late');
  for (const w of [1366, 1920, 3440]) {
    page = await newPage(browser, w, 1000);
    await page.click('.start-actions [data-action="demo-u4"]');
    let worst = 0;
    for (const t of ['utilizatori', 'instalatie', 'rezultate']) {
      await page.click('#tab-' + t);
      if (t === 'utilizatori') await page.evaluate(() => document.querySelectorAll('details.contract').forEach((d) => { d.open = true; }));
      if (t === 'rezultate') await page.click('[data-guide="btn:calc"]');
      const o = await page.evaluate(() => Math.max(0, ...Array.from(document.querySelectorAll('.table-wrap')).map((e) => e.scrollWidth - e.clientWidth)));
      worst = Math.max(worst, o);
    }
    check('fără scroll orizontal în tabele la ' + w + ' px', worst <= 1, 'depășire ' + worst + 'px');
    const cw = await page.evaluate(() => document.querySelector('.content').getBoundingClientRect().width);
    if (w >= 1920) check('conținutul folosește lățimea ecranului la ' + w + ' px (' + Math.round(cw) + ')', cw >= Math.min(w, 2600) * 0.9, String(cw));
    await page.close();
  }

  /* ---------- 7. Introducere grafică (Anexa 1) ---------- */
  console.log('Editor monofilar');
  page = await newPage(browser, 1440, 1000);
  await page.evaluate(() => {
    const p = window.AppState.emptyProject();
    p.meta.operator = 'Test schemă';
    p.meta.modelConfirmat = true;
    p.conditii.tarifAchitatIntegral = true;
    window.AppState.addUser(p, { id: 'prim', nume: 'Finanțator', rol: 'prim', putere: 100 });
    window.AppState.addUser(p, { id: 'nou', nume: 'Solicitant', rol: 'nou', putere: 50 });
    p.linii.push({ id: 'linie', nume: 'Linie test', IL: 24000, L: 800, mod: 'distante',
      punctRacordare: { tip: 'post', denumire: 'PT 123', tensiune: 0.4, observatii: '' },
      racordari: [{ userId: 'prim', distanta: 800 }], tronsoane: [] });
    window.AppUI.setProject(p);
    window.AppUI.store.guide.on = false;
    window.AppUI.setTab('instalatie');
  });
  const projectBeforeMode = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await page.getByRole('button', { name: 'Schemă', exact: true }).click();
  check('alegerea modului grafic nu modifică proiectul', await page.evaluate(() => JSON.stringify(window.AppUI.getState())) === projectBeforeMode, '');
  await page.mouse.move(0, 0);
  const modeStyle = await page.locator('.line-card > .scheme-mode [aria-pressed="true"]').evaluate((el) => {
    const s = getComputedStyle(el);
    return { height: el.getBoundingClientRect().height, background: s.backgroundColor, color: s.color };
  });
  check('selectorul respectă E.ON: înălțime 48 px și selecție albastră cu text alb', modeStyle.height === 48 && modeStyle.background === 'rgb(0, 117, 194)' && modeStyle.color === 'rgb(255, 255, 255)', JSON.stringify(modeStyle));
  await page.locator('.line-card > .scheme-mode [aria-pressed="true"]').hover();
  check('hover activ E.ON folosește highlight-dark', await page.locator('.line-card > .scheme-mode [aria-pressed="true"]').evaluate((el) => getComputedStyle(el).backgroundColor) === 'rgb(0, 86, 143)', '');
  const noSelectionPoint = await segmentPoint(0, 0.5);
  await page.mouse.click(noSelectionPoint.x, noSelectionPoint.y);
  const inspected = await page.locator('.scheme-properties').innerText();
  check('click pe tronson îl selectează și afișează lungimea, costul și utilizatorii', /800,00 m/.test(inspected) &&
    /24\.000,00 lei/.test(inspected) && /Finanțator/.test(inspected) &&
    await page.evaluate(() => window.AppUI.getState().linii[0].racordari.length) === 1, inspected);
  check('simbolul PR arată tipul, denumirea și tensiunea', await page.locator('.dl-pr-symbol').getAttribute('aria-label') === 'Post de transformare PT 123' &&
    await page.locator('.dl-origin-voltage').textContent() === '0.4 kV', '');
  check('inspectorul selectat evidențiază tronsonul în diagramă și tabel', await page.locator('.dl-segment-selected').count() === 1 &&
    await page.locator('.scheme-tronson-selected').count() === 1, '');
  await page.locator('.scheme-canvas .dl-place').first().focus();
  await page.keyboard.press('Enter');
  check('tronsonul poate fi selectat și din tastatură', await page.locator('.dl-segment-selected').count() === 1, '');
  await page.locator('.scheme-canvas table').getByRole('button', { name: /Tronson 1/ }).click();
  check('același inspector se deschide și din tabel', /24\.000,00 lei/.test(await page.locator('.scheme-properties').innerText()), '');
  await page.getByRole('button', { name: /Solicitant.*neracordat/ }).click();
  check('selectarea utilizatorului activează explicit uneltele de racordare', await page.locator('.scheme-canvas').getAttribute('class') === 'scheme-canvas tool-place', '');

  // Coordonate reale ale segmentelor, inclusiv scalare SVG și scroll intern.
  async function segmentPoint(index, ratio) {
    return page.locator('.scheme-canvas .dl-place').nth(index).evaluate((el, ratio) => {
      const svg = el.ownerSVGElement;
      const pt = svg.createSVGPoint();
      pt.x = el.x1.baseVal.value + (el.x2.baseVal.value - el.x1.baseVal.value) * ratio;
      pt.y = el.y1.baseVal.value;
      const screen = pt.matrixTransform(svg.getScreenCTM());
      return { x: screen.x, y: screen.y };
    }, ratio);
  }
  const distanceOfNew = () => page.evaluate(() => {
    const r = window.AppUI.getState().linii[0].racordari.find((r) => r.userId === 'nou');
    return r ? r.distanta : null;
  });
  let point = await segmentPoint(0, 0.5);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => window.AppUI.getState().linii[0].racordari.length === 2);
  check('click la mijlocul liniei racordează exact la 400 m', await distanceOfNew() === 400, String(await distanceOfNew()));
  check('traseul utilizatorului este evidențiat în schemă și tabel', await page.locator('.dl-route').count() === 1 && await page.locator('.scheme-user-route').count() === 1, '');
  const firstTotal = await page.evaluate(() => window.AppUI.calculate().central.totalFaraTVA);
  check('schema produce compensația exactă: 400 × 30 / 2 = 6000 lei', firstTotal === 6000, String(firstTotal));
  const distanceInput = page.locator('.scheme-properties input[type="number"]');
  await distanceInput.fill('500.5');
  await distanceInput.press('Tab');
  check('panoul acceptă distanța exactă cu zecimale', await distanceOfNew() === 500.5, String(await distanceOfNew()));
  const updatedTotal = await page.evaluate(() => window.AppUI.store.results.central.totalFaraTVA);
  check('rezultatul se recalculează după editarea distanței: 7507,50 lei', updatedTotal === 7507.5, String(updatedTotal));
  await distanceInput.fill('900');
  await distanceInput.press('Tab');
  check('distanța peste lungimea liniei este semnalată și nu se salvează', await distanceOfNew() === 500.5 && await distanceInput.evaluate((el) => !el.validity.valid), '');
  await distanceInput.fill('500');
  await distanceInput.press('Tab');
  let circle = page.locator('.scheme-canvas circle[aria-label^="Solicitant,"]');
  await circle.scrollIntoViewIfNeeded();
  let box = await circle.boundingBox();
  point = await segmentPoint(0, 0.6);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 8 });
  check('tragerea nu salvează stări intermediare', await distanceOfNew() === 500, String(await distanceOfNew()));
  await page.mouse.up();
  check('tragerea salvează exact 300 m la eliberare', await distanceOfNew() === 300, String(await distanceOfNew()));

  circle = page.locator('.scheme-canvas circle[aria-label^="Solicitant,"]');
  await circle.focus();
  await page.keyboard.press('ArrowRight');
  check('săgeata dreapta mută racordarea cu exact 1 m', await distanceOfNew() === 301, String(await distanceOfNew()));
  const depthBeforeCancel = await page.evaluate(() => window.AppUI.undoDepth());
  box = await circle.boundingBox();
  point = await segmentPoint(0, 0.5);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 5 });
  await circle.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  check('pointercancel păstrează racordarea și istoricul undo', await distanceOfNew() === 301 && await page.evaluate(() => window.AppUI.undoDepth()) === depthBeforeCancel, '');

  await page.getByRole('button', { name: 'Formular / tabel', exact: true }).click();
  const formDistance = await page.locator('[data-guide="dist:linie:nou"]').inputValue();
  const formTotal = await page.evaluate(() => window.AppUI.calculate().central.totalFaraTVA);
  check('formularul vede aceeași distanță și același calcul', formDistance === '301' && formTotal === 4515, formDistance + ' / ' + formTotal);
  await page.getByRole('button', { name: 'Schemă', exact: true }).click();
  await page.locator('.scheme-palette').getByRole('button', { name: /Solicitant.*301 m/ }).click();
  await page.getByRole('button', { name: 'Deconectează de pe linie', exact: true }).click();
  check('deconectarea elimină numai racordarea', await distanceOfNew() === null && await page.evaluate(() => window.AppUI.getState().utilizatori.length) === 2, '');
  await page.evaluate(() => window.AppUI.undo());
  check('undo restaurează racordarea deconectată', await distanceOfNew() === 301, '');
  await page.locator('.scheme-palette').getByRole('button', { name: '+ Adaugă utilizator', exact: true }).click();
  await page.locator('.scheme-properties [data-bind$=".nume"]').fill('Utilizator grafic');
  await page.locator('.scheme-properties [data-bind$=".nume"]').press('Tab');
  check('utilizatorul se adaugă și se editează fără părăsirea schemei', await page.evaluate(() => window.AppUI.getState().utilizatori[2].nume) === 'Utilizator grafic', '');
  await page.locator('.scheme-properties input[type="number"]').fill('1');
  await page.evaluate(() => window.AppUI.render());
  check('o randare de salvare păstrează distanța încă neconfirmată', await page.locator('.scheme-properties input[type="number"]').inputValue() === '1', '');
  await page.locator('.scheme-properties input[type="number"]').press('Tab');
  await page.waitForFunction(() => window.AppUI.getState().linii[0].racordari.some((r) => r.userId !== 'prim' && r.userId !== 'nou' && r.distanta === 1));
  await page.locator('.scheme-palette').getByRole('button', { name: /Solicitant.*301 m/ }).click();
  const diagramOverflow = await page.locator('.scheme-canvas .diagram-wrap').evaluate((el) => {
    el.scrollLeft = 120;
    return el.scrollWidth > el.clientWidth;
  });
  point = await segmentPoint(1, 0.5);
  const clickedSegment = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? el.outerHTML : 'în afara paginii';
  }, point);
  await page.mouse.click(point.x, point.y);
  check('click pe segment scurt/deformat, cu scroll, păstrează distanța corectă (151 m)', diagramOverflow && await distanceOfNew() === 151, String(await distanceOfNew()) + ' / ' + clickedSegment);
  await page.setViewportSize({ width: 390, height: 800 });
  check('schema rămâne vizibilă pe mobil, fără scroll al paginii', await page.locator('.scheme-canvas .diagram-wrap').isVisible() && await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1, '');
  await page.locator('.scheme-palette').getByRole('button', { name: /Solicitant.*151 m/ }).click();
  await page.locator('.scheme-properties input[type="number"]').fill('225');
  await page.locator('.scheme-properties input[type="number"]').press('Tab');
  await page.evaluate(() => window.AppUI.flushSave());
  await page.reload();
  await page.waitForSelector('.tabs');
  check('racordările grafice persistă după reîncărcare', await distanceOfNew() === 225, String(await distanceOfNew()));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => {
    window.AppUI.store.addLine();
    window.AppUI.setTab('instalatie');
  });
  await page.getByRole('button', { name: 'Schemă', exact: true }).nth(0).click();
  await page.getByRole('button', { name: 'Schemă', exact: true }).nth(1).click();
  const palettes = page.locator('.scheme-palette');
  await palettes.nth(0).getByRole('button', { name: /Solicitant/ }).click();
  await palettes.nth(1).getByRole('button', { name: /Solicitant/ }).click();
  const powers = page.locator('.scheme-properties [data-bind="user.nou.putere"]');
  await powers.nth(0).fill('75');
  check('același utilizator pe două linii: puterea se sincronizează și în timpul tastării', await powers.nth(1).inputValue() === '75', await powers.nth(1).inputValue());
  await powers.nth(0).press('Tab');
  const uniqueIds = await page.locator('.line-scheme input, .line-scheme select').evaluateAll((els) => {
    const ids = els.map((el) => el.id);
    return ids.every(Boolean) && new Set(ids).size === ids.length;
  });
  check('panourile aceleiași persoane au etichete și id-uri distincte per linie', uniqueIds, '');
  check('linia fără lungime explică de ce nu poate fi desenată', /Completează lungimea totală/.test(await page.locator('.scheme-canvas').nth(1).innerText()), '');
  check('fără erori JS în editorul grafic', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  page = await newPage(browser, 1300, 1000);
  await page.click('.start-actions [data-action="demo-u4"]');
  await page.click('#tab-instalatie');
  const legacyState = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  const normalizedLegacy = await page.evaluate(() => JSON.stringify(window.AppState.migrate(JSON.parse(JSON.stringify(window.AppUI.getState())))));
  await page.getByRole('button', { name: 'Schemă', exact: true }).first().click();
  check('modul grafic nu convertește automat liniile manuale', await page.locator('.scheme-legacy').count() === 1 && await page.evaluate(() => JSON.stringify(window.AppUI.getState())) === legacyState, '');
  page.removeAllListeners('dialog');
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: 'Pregătește linia pentru schemă' }).click();
  check('refuzul conversiei păstrează exact proiectul', await page.evaluate(() => JSON.stringify(window.AppUI.getState())) === legacyState, '');
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'Pregătește linia pentru schemă' }).click();
  await page.waitForSelector('.line-scheme');
  await page.evaluate(() => window.AppUI.undo());
  check('undo restaurează toate datele manuale, cu valorile implicite ale migrării', await page.evaluate(() => JSON.stringify(window.AppUI.getState())) === normalizedLegacy, '');
  check('fără erori JS la conversie și undo', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  console.log('Originea liniei și zone tehnice');
  page = await newPage(browser, 1440, 1000);
  await page.evaluate(() => {
    const p = window.AppState.emptyProject();
    p.meta.operator = 'Date tehnice';
    p.conditii.calcInformativ = true;
    window.AppState.addUser(p, { id: 'prim', nume: 'A', rol: 'prim' });
    window.AppState.addUser(p, { id: 'nou', nume: 'B', rol: 'nou' });
    p.linii = [{ id: 'l', L: 800, IL: 24000, mod: 'distante', racordari: [
      { userId: 'prim', distanta: 800 }, { userId: 'nou', distanta: 400 }], tronsoane: [] }];
    window.AppUI.setProject(p);
    window.AppUI.store.guide.on = false;
    window.AppUI.setTab('instalatie');
  });
  await page.locator('.technical-editor > summary').click();
  await page.locator('[data-bind="pr.l.tip"]').selectOption('post');
  await page.locator('[data-bind="pr.l.denumire"]').fill('PT 123');
  await page.locator('[data-bind="pr.l.denumire"]').press('Tab');
  await page.locator('[data-bind="pr.l.tensiune"]').fill('0,4');
  await page.locator('[data-bind="pr.l.tensiune"]').press('Tab');
  await page.getByRole('button', { name: '+ Zonă tehnică', exact: true }).click();
  await page.locator('.technical-zone').nth(0).locator('[data-bind$=".tipLinie"]').selectOption('LES');
  await page.locator('.technical-zone').nth(0).locator('[data-bind$=".conductor"]').fill('ACYY');
  await page.locator('.technical-zone').nth(0).locator('[data-bind$=".conductor"]').press('Tab');
  await page.getByRole('button', { name: '+ Zonă tehnică', exact: true }).click();
  await page.locator('.technical-zone').nth(1).locator('[data-bind$=".deLa"]').fill('100');
  await page.locator('.technical-zone').nth(1).locator('[data-bind$=".deLa"]').press('Tab');
  await page.locator('.technical-zone').nth(1).locator('[data-bind$=".tipLinie"]').selectOption('LEA');
  await page.locator('.technical-zone').nth(1).locator('[data-bind$=".conductor"]').fill('AAC 70');
  await page.locator('.technical-zone').nth(1).locator('[data-bind$=".conductor"]').press('Tab');
  await page.getByRole('button', { name: 'Schemă', exact: true }).click();
  check('PR descris și limita tehnică apar în schemă', /PT 123/.test(await page.locator('.scheme-canvas').innerText()) && await page.locator('.scheme-canvas .dl-seg').count() === 3, '');
  const lineStyles = await page.locator('.scheme-canvas .dl-seg').evaluateAll((els) => els.map((el) => ({
    type: el.classList.contains('tip-LEA') ? 'LEA' : el.classList.contains('tip-LES') ? 'LES' : '',
    dash: getComputedStyle(el).strokeDasharray
  })));
  check('LEA este întreruptă, iar LES este continuă (distincție fără culoare)', lineStyles[0].type === 'LES' &&
    lineStyles[0].dash === 'none' && lineStyles[1].type === 'LEA' && lineStyles[1].dash !== 'none', JSON.stringify(lineStyles));
  await page.locator('.scheme-canvas .dl-place').nth(1).focus();
  await page.keyboard.press('Enter');
  const inspectedTechnical = await page.locator('.scheme-properties').innerText();
  check('tronsonul LEA selectat își afișează caracteristicile în inspector', inspectedTechnical.includes('LEA') &&
    inspectedTechnical.includes('AAC 70'), inspectedTechnical);
  check('tabelul derivat arată caracteristicile LES și LEA', /LES.*ACYY/s.test(await page.locator('.scheme-canvas table').innerText()) && /LEA/.test(await page.locator('.scheme-canvas table').innerText()), '');
  const racordariBeforeZoneEdit = await page.evaluate(() => JSON.stringify(window.AppUI.getState().linii[0].racordari));
  const totalBeforeZoneEdit = await page.evaluate(() => window.AppUI.calculate().central.totalFaraTVA);
  await page.getByRole('button', { name: 'Editează limite', exact: true }).click();
  point = await segmentPoint(1, 0.5);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => window.AppUI.getState().linii[0].zoneTehnice.length === 3);
  check('clickul pe schemă adaugă o limită la poziția aleasă și regenerează tronsoanele',
    await page.evaluate(() => Math.abs(Number(window.AppUI.getState().linii[0].zoneTehnice[2].deLa) - 250) < 0.1) &&
      await page.locator('.scheme-canvas .dl-seg').count() === 4, '');
  await page.evaluate(() => window.AppUI.undo());
  check('undo anulează adăugarea grafică a limitei', await page.evaluate(() => window.AppUI.getState().linii[0].zoneTehnice.length) === 2, '');
  point = await segmentPoint(1, 0.5);
  await page.mouse.click(point.x, point.y);
  await page.waitForFunction(() => window.AppUI.getState().linii[0].zoneTehnice.length === 3);
  let zoneDistance = page.locator('.zone-inspector input[aria-label^="Început zonă"]');
  await zoneDistance.fill('260,5');
  await zoneDistance.press('Tab');
  check('inspectorul mută limita la distanța numerică exactă', await page.evaluate(() =>
    window.AppUI.getState().linii[0].zoneTehnice.some((z) => Number(z.deLa) === 260.5)) &&
      await page.locator('.scheme-canvas .dl-seg').count() === 4, '');
  zoneDistance = page.locator('.zone-inspector input[aria-label^="Început zonă"]');
  await zoneDistance.fill('100');
  await zoneDistance.press('Tab');
  check('distanța care coincide cu altă limită este refuzată fără modificarea datelor',
    await page.evaluate(() => window.AppUI.getState().linii[0].zoneTehnice.some((z) => Number(z.deLa) === 260.5)) &&
      await page.locator('.scheme-canvas .dl-seg').count() === 4, '');
  zoneDistance = page.locator('.zone-inspector input[aria-label^="Început zonă"]');
  await zoneDistance.fill('900');
  await zoneDistance.press('Tab');
  check('distanța din afara liniei este refuzată explicit',
    await page.evaluate(() => window.AppUI.getState().linii[0].zoneTehnice.some((z) => Number(z.deLa) === 260.5)) &&
      await page.locator('.toast.error').count() > 0, '');
  let zoneHandle = page.locator('.scheme-canvas .dl-zone-handle').nth(1);
  const zoneBox = await zoneHandle.boundingBox();
  point = await segmentPoint(2, 0.5);
  const undoBeforeZoneCancel = await page.evaluate(() => window.AppUI.undoDepth());
  await page.mouse.move(zoneBox.x + zoneBox.width / 2, zoneBox.y + zoneBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 5 });
  await zoneHandle.dispatchEvent('pointercancel', { pointerId: 1 });
  await page.mouse.up();
  check('pointercancel nu salvează repoziționarea limitei sau un undo', await page.evaluate(() =>
    window.AppUI.getState().linii[0].zoneTehnice.some((z) => Number(z.deLa) === 260.5)) &&
      await page.evaluate(() => window.AppUI.undoDepth()) === undoBeforeZoneCancel, '');
  await zoneHandle.scrollIntoViewIfNeeded();
  const handleBox = await zoneHandle.boundingBox();
  point = await segmentPoint(2, 0.5);
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 8 });
  await page.mouse.up();
  check('tragerea mută limita la noua distanță și regenerează tronsoanele', await page.evaluate(() =>
    window.AppUI.getState().linii[0].zoneTehnice.some((z) => Number(z.deLa) === 330.3)) &&
      await page.locator('.scheme-canvas .dl-seg').count() === 4, '');
  check('editarea limitelor nu modifică racordările sau compensația', await page.evaluate(({ racordari, total }) =>
    JSON.stringify(window.AppUI.getState().linii[0].racordari) === racordari &&
    window.AppUI.calculate().central.totalFaraTVA === total, { racordari: racordariBeforeZoneEdit, total: totalBeforeZoneEdit }), '');
  await page.evaluate(() => window.AppUI.undo());
  check('undo restaurează poziția numerică anterioară a limitei', await page.evaluate(() =>
    window.AppUI.getState().linii[0].zoneTehnice.some((z) => Number(z.deLa) === 260.5)), '');
  zoneHandle = page.locator('.scheme-canvas .dl-zone-handle').nth(1);
  let movedBox = await zoneHandle.boundingBox();
  point = await segmentPoint(2, 0.5);
  await page.mouse.move(movedBox.x + movedBox.width / 2, movedBox.y + movedBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 8 });
  await page.mouse.up();
  check('limita repoziționată persistă înainte de reîncărcare', await page.evaluate(() =>
    window.AppUI.getState().linii[0].zoneTehnice.some((z) => Number(z.deLa) === 330.3)), '');
  await page.getByRole('button', { name: 'Șterge zona', exact: true }).nth(1).click();
  check('ștergerea zonei selectate regenerează tronsoanele', await page.locator('.scheme-canvas .dl-seg').count() === 3, '');
  await page.evaluate(() => window.AppUI.undo());
  check('undo restaurează zona tehnică', await page.locator('.scheme-canvas .dl-seg').count() === 4, '');
  await page.evaluate(() => window.AppUI.flushSave());
  await page.reload();
  await page.waitForSelector('.tabs');
  const technicalSaved = await page.evaluate(() => {
    const l = window.AppUI.getState().linii[0];
    return l.punctRacordare.denumire === 'PT 123' && Number(l.punctRacordare.tensiune) === 0.4 &&
      l.zoneTehnice.length === 3 && l.zoneTehnice[0].conductor === 'ACYY' &&
      l.zoneTehnice.some((z) => Number(z.deLa) === 330.3);
  });
  check('PR și limitele tehnice editate persistă după reîncărcare', technicalSaved, '');
  check('fără erori JS la editarea datelor tehnice', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  await browser.close();
  console.log(failures ? '\n' + failures + ' verificări e2e eșuate.' : '\nToate verificările e2e au trecut.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
