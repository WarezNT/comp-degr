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
    if (!key) {
      const nextTab = await page.evaluate(() => {
        const next = window.AppUI.store.guideNext();
        return next && next.step.tab;
      });
      if (nextTab && await page.getAttribute('#tab-' + nextTab, 'aria-selected') !== 'true') {
        await page.click('#tab-' + nextTab);
        continue;
      }
      const detail = await page.evaluate(() => JSON.stringify(window.AppUI.store.guideNext()));
      check('există un câmp evidențiat la fiecare pas', false, 'la pasul ' + guard + ' ' + detail); break;
    }
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
  await page.locator('.scheme-canvas .dl-place').first().scrollIntoViewIfNeeded();
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
  await page.locator('[data-guide="dist:linie:nou"]').fill('301');
  await page.keyboard.press('Tab');
  const formTotal = await page.evaluate(() => window.AppUI.calculate().central.totalFaraTVA);
  check('tabelul vede aceeași distanță și același calcul', await page.locator('[data-guide="dist:linie:nou"]').inputValue() === '301' && formTotal === 4515, formDistance + ' / ' + formTotal);
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
  await page.locator('.technical-zone').nth(1).getByLabel('Material uzual').selectOption('lea-70');
  check('materialul uzual completează tipul, conductorul și secțiunea tehnică', await page.evaluate(() => {
    const z = window.AppUI.getState().linii[0].zoneTehnice[1];
    return z.tipLinie === 'LEA' && z.conductor === 'NFA2X' && z.sectiune === '50+3x70';
  }), '');
  await page.locator('.technical-zone').nth(1).locator('[data-bind$=".conductor"]').fill('AAC 70');
  await page.locator('.technical-zone').nth(1).locator('[data-bind$=".sectiune"]').fill('50+3x70 modificat');
  await page.locator('.technical-zone').nth(1).locator('[data-bind$=".conductor"]').press('Tab');
  await page.getByRole('button', { name: 'Schemă', exact: true }).click();
  check('PR descris și limita tehnică apar în schemă', /PT 123/.test(await page.locator('.scheme-canvas').innerText()) && await page.locator('.scheme-canvas .dl-seg').count() === 3, '');
  const lineStyles = await page.locator('.scheme-canvas .dl-seg').evaluateAll((els) => els.map((el) => ({
    type: el.classList.contains('tip-LEA') ? 'LEA' : el.classList.contains('tip-LES') ? 'LES' : '',
    dash: getComputedStyle(el).strokeDasharray,
    cap: getComputedStyle(el).strokeLinecap
  })));
  check('LES este punctată, iar LEA este continuă (distincție fără culoare)', lineStyles[0].type === 'LES' &&
    lineStyles[0].dash === '1px, 12px' && lineStyles[0].cap === 'round' &&
    lineStyles[1].type === 'LEA' && lineStyles[1].dash === 'none', JSON.stringify(lineStyles));
  check('legenda folosește aceeași convenție LES/LEA', await page.evaluate(() =>
    getComputedStyle(document.querySelector('.scheme-canvas .dl-legend-line.les')).borderTopStyle === 'dotted' &&
    getComputedStyle(document.querySelector('.scheme-canvas .dl-legend-line.lea')).borderTopStyle === 'solid'), '');
  check('paleta schemelor corespunde tokenilor E.ON Storybook', await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const tokens = { '--eon-red500': '#ea1b0a', '--eon-red600': '#c41708', '--eon-red700': '#9d1207',
      '--eon-grey700': '#5c5c5c', '--eon-grey800': '#404040', '--eon-white': '#ffffff',
      '--eon-system-highlight': '#0075c2', '--eon-system-highlight-dark': '#00568f', '--eon-system-highlight-light': '#ccebff' };
    return Object.entries(tokens).every(([key, value]) => root.getPropertyValue(key).trim() === value) &&
      root.getPropertyValue('--info').trim() === '#0075c2';
  }), '');
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
      l.zoneTehnice[1].sectiune === '50+3x70 modificat' &&
      l.zoneTehnice.some((z) => Number(z.deLa) === 330.3);
  });
  check('PR și limitele tehnice editate persistă după reîncărcare', technicalSaved, '');
  console.log('Scheme în print / PDF — Anexa 1');
  await page.evaluate(() => {
    window.AppUI.calculate();
    window.AppUI.setTab('rezultate');
  });
  check('schemele de print nu aglomerează rezultatele pe ecran', !await page.locator('.print-line-schemes').isVisible(), '');
  const projectBeforePrint = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.emulateMedia({ media: 'print' });
  check('printul include PR, toate tronsoanele, utilizatorii și legenda',
    await page.locator('.print-line-schemes').isVisible() &&
    await page.locator('.line-report .dl-pr-symbol').count() === 1 &&
    await page.locator('.line-report .dl-seg').count() === 4 &&
    await page.locator('.line-report .dl-legend').count() === 2 &&
    /PT 123/.test(await page.locator('.line-report').innerText()) &&
    /U1.*A.*U2.*B/s.test(await page.locator('.line-report-users').innerText()), '');
  check('schemele lungi sunt împărțite în blocuri de maximum trei tronsoane', await page.locator('.line-report-block').evaluateAll((els) =>
    els.length === 2 && els.every((el) => el.querySelectorAll('.dl-seg').length <= 3)), '');
  check('continuările păstrează numerotarea tronsoanelor', await page.locator('.line-report-block').nth(1).locator('.dl-tnum').first().textContent() === 'T4', '');
  check('toate blocurile păstrează aceeași scară vizuală și mărime a textului', await page.locator('.line-report svg').evaluateAll((els) =>
    new Set(els.map((el) => el.viewBox.baseVal.width)).size === 1), '');
  check('marcajele tehnice și caracteristicile sunt incluse în raport',
    await page.locator('.line-report .dl-zone-marker').count() >= 2 &&
    /LES.*ACYY/s.test(await page.locator('.line-report-table').innerText()) &&
    /LEA.*AAC 70/s.test(await page.locator('.line-report-table').innerText()), '');
  check('PDF păstrează LES punctată și LEA continuă', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.line-report .tip-LES')).every((el) =>
      getComputedStyle(el).strokeDasharray === '1px, 12px' && getComputedStyle(el).strokeLinecap === 'round') &&
    Array.from(document.querySelectorAll('.line-report .tip-LEA')).every((el) =>
      getComputedStyle(el).strokeDasharray === 'none')), '');
  check('SVG-urile de print nu sunt tăiate de scroll sau lățimi minime', await page.locator('.line-report .diagram-wrap').evaluateAll((els) =>
    els.every((el) => {
      const svg = el.querySelector('svg');
      return getComputedStyle(el).overflowX === 'visible' &&
        svg.getBoundingClientRect().width <= el.getBoundingClientRect().width + 1 &&
        el.scrollWidth <= el.clientWidth + 1;
    })), '');
  check('raportul de print nu conține controale interactive', await page.locator('.print-line-schemes [role="button"], .print-line-schemes [tabindex], .print-line-schemes input').count() === 0, '');
  const pdf = await page.pdf({ format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' }, printBackground: false });
  check('Chrome generează un PDF A4 real cu raportul', pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 5000, String(pdf.length));
  check('tipărirea nu modifică proiectul', await page.evaluate(() => JSON.stringify(window.AppUI.getState())) === projectBeforePrint, '');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => {
    const p = window.AppUI.getState();
    p.linii.push({ id: 'manual-print', nume: 'Linie manuală pentru print', L: 90, IL: 900, mod: 'manual', tronsoane: [
      { id: 'manual-1', nume: 'Manual 1', lungime: 30, utilizatori: ['prim', 'nou'], cost: 300, costManual: true },
      { id: 'manual-2', nume: 'Manual 2', lungime: 60, utilizatori: ['prim', 'nou'], cost: 600, costManual: true }
    ] });
    window.AppUI.setProject(p);
    window.AppUI.calculate();
  });
  await page.emulateMedia({ media: 'print' });
  check('printul păstrează toate limitele și costurile liniilor manuale', await page.locator('.line-report').count() === 2 &&
    await page.locator('.line-report').nth(1).locator('.dl-seg').count() === 2 &&
    /300,00 lei.*600,00 lei/s.test(await page.locator('.line-report').nth(1).locator('table').innerText()), '');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => {
    const p = window.AppUI.getState();
    p.meta.model = 'station';
    window.AppUI.setProject(p);
    window.AppUI.calculate();
  });
  check('raportul Anexei 1 nu apare pentru alte modele sau calcule invalide', await page.locator('.print-line-schemes').count() === 0, '');
  check('fără erori JS la editarea datelor tehnice', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  console.log('Explicația vizuală a compensației');
  page = await newPage(browser, 1440, 1000);
  await page.evaluate(() => {
    const p = window.AppState.emptyProject();
    p.conditii.tarifAchitatIntegral = true;
    window.AppState.addUser(p, { id: 'prim', nume: 'Finanțator', rol: 'prim' });
    window.AppState.addUser(p, { id: 'vechi', nume: 'Existent', rol: 'existent' });
    window.AppState.addUser(p, { id: 'nou1', nume: 'Solicitant unu', rol: 'nou' });
    window.AppState.addUser(p, { id: 'nou2', nume: 'Solicitant doi', rol: 'nou' });
    p.linii = [
      { id: 'linie1', nume: 'Linie comună', L: 1000, IL: 12000, mod: 'distante', tronsoane: [], racordari: [
        { userId: 'prim', distanta: 400 }, { userId: 'vechi', distanta: 200 },
        { userId: 'nou1', distanta: 600 }, { userId: 'nou2', distanta: 800 }] },
      { id: 'linie2', nume: 'Linie comună', L: 100, IL: 600, mod: 'distante', tronsoane: [], racordari: [
        { userId: 'prim', distanta: 100 }, { userId: 'nou1', distanta: 100 }] }
    ];
    window.AppUI.setProject(p);
    window.AppUI.store.guide.on = false;
    window.AppUI.setTab('instalatie');
  });
  await page.getByRole('button', { name: 'Schemă', exact: true }).first().click();
  const compensationCanvas = page.locator('.scheme-canvas').first();
  const selectPayer = async (name) => page.locator('.scheme-palette').first().getByRole('button', { name }).click();
  const visualState = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await selectPayer(/Solicitant unu/);
  check('primul nou: doar tronsoanele care generează plăți sunt marcate', await compensationCanvas.locator('.dl-compensated').count() === 2 &&
    await compensationCanvas.locator('.dl-route').count() === 3 &&
    await compensationCanvas.locator('.scheme-compensated').count() === 2, '');
  check('primul nou: total linie 2.000 lei, total proiect 2.300 lei',
    /2\.000,00 lei/.test(await compensationCanvas.locator('.line-compensation-total').innerText()) &&
    /Total în proiect.*2\.300,00 lei/.test(await compensationCanvas.locator('.line-compensation').innerText()), '');
  check('formulele și beneficiarii sunt explicați pentru fiecare tronson',
    /Către Finanțator:.*2\.400,00 \/ 2 − 2\.400,00 \/ 3.*400,00 lei/s.test(
      await compensationCanvas.locator('.line-compensation-items').innerText()), '');
  check('selecția vizuală nu modifică proiectul și nu pornește calculul salvat',
    await page.evaluate(() => JSON.stringify(window.AppUI.getState())) === visualState &&
    await page.evaluate(() => window.AppUI.store.results === null), '');
  await compensationCanvas.locator('.line-compensation-items .linkish').first().click();
  check('clickul pe contribuție deschide inspectorul și comută pe inspecție',
    await page.locator('.scheme-properties .tronson-inspector').count() === 1 &&
    await compensationCanvas.getAttribute('class') === 'scheme-canvas tool-inspect', '');
  await selectPayer(/Solicitant doi/);
  check('al doilea nou: 2.600 lei, trei tronsoane și plată către noul racordat înainte',
    /2\.600,00 lei/.test(await compensationCanvas.locator('.line-compensation-total').innerText()) &&
    await compensationCanvas.locator('.dl-compensated').count() === 3 &&
    /Către Solicitant unu/.test(await compensationCanvas.locator('.line-compensation-items').innerText()), '');
  await page.evaluate(() => window.AppUI.store.set('cond.solutieComuna', false));
  check('condițiile neîndeplinite elimină sumele și evidențierea de plată',
    /Calcul blocat/.test(await compensationCanvas.locator('.line-compensation').innerText()) &&
    await compensationCanvas.locator('.dl-compensated').count() === 0 &&
    await compensationCanvas.locator('.line-compensation-total').count() === 0, '');
  await page.evaluate(() => window.AppUI.store.set('cond.calcInformativ', true));
  check('calculul informativ afișează explicit că sumele nu sunt datorate',
    /INFORMATIV.*sumele nu sunt datorate/.test(await compensationCanvas.locator('.line-compensation').innerText()) &&
    /2\.600,00 lei/.test(await compensationCanvas.locator('.line-compensation-total').innerText()), '');
  await page.evaluate(() => window.AppUI.store.set('line.linie1.IL', -1));
  check('datele invalide nu produc o compensație vizuală falsă',
    /Datele proiectului trebuie corectate/.test(await compensationCanvas.locator('.line-compensation').innerText()) &&
    await compensationCanvas.locator('.dl-compensation-label').count() === 0, '');
  await page.evaluate(() => {
    window.AppUI.store.set('line.linie1.IL', 12000);
    window.AppUI.store.set('cond.solutieComuna', true);
    window.AppUI.store.set('cond.calcInformativ', false);
  });
  await selectPayer(/Solicitant unu/);
  await page.locator('.scheme-properties').first().locator('input[type="number"]').fill('100');
  await page.locator('.scheme-properties').first().locator('input[type="number"]').press('Tab');
  check('mutarea racordării actualizează imediat contribuțiile și totalul',
    /400,00 lei/.test(await compensationCanvas.locator('.line-compensation-total').innerText()) &&
    await compensationCanvas.locator('.dl-compensated').count() === 1 &&
    /Total în proiect.*700,00 lei/.test(await compensationCanvas.locator('.line-compensation').innerText()), '');
  await page.setViewportSize({ width: 390, height: 800 });
  check('explicația rămâne lizibilă pe mobil fără overflow al paginii', await compensationCanvas.locator('.line-compensation').isVisible() &&
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), '');
  await selectPayer(/Existent/);
  check('selectarea unui utilizator existent închide explicația plătitorului',
    await compensationCanvas.locator('.line-compensation').count() === 0 &&
    await compensationCanvas.locator('.dl-compensated').count() === 0, '');
  await selectPayer(/Solicitant doi/);
  await page.getByRole('button', { name: 'Deconectează de pe linie', exact: true }).click();
  check('un utilizator neracordat are explicit zero plăți pe linie',
    /Nicio compensație de plată/.test(await compensationCanvas.locator('.line-compensation').innerText()) &&
    /Total pe această linie: 0,00 lei/.test(await compensationCanvas.locator('.line-compensation-total').innerText()) &&
    await compensationCanvas.locator('.dl-compensated').count() === 0, '');
  await page.evaluate(() => window.AppUI.undo());
  check('undo restaurează și explicația calculată pentru racordare',
    /1\.900,00 lei/.test(await compensationCanvas.locator('.line-compensation-total').innerText()) &&
    await compensationCanvas.locator('.dl-compensated').count() === 3, '');
  check('fără erori JS în explicația vizuală', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  console.log('Scenariu demonstrativ importat — parcurs complet');
  page = await newPage(browser, 1440, 1000);
  await page.click('.start-actions [data-action="demo-u4"]');
  await page.setInputFiles('input[data-action="import-json"]',
    path.join(__dirname, '..', 'exemple', 'teste-prezentare', 'anexa-1-editor-grafic.json'));
  await page.waitForFunction(() => window.AppUI.getState().meta.operator === 'Operator demonstrativ — verificare editor grafic');
  await page.click('#tab-instalatie');
  await page.getByRole('button', { name: 'Schemă', exact: true }).click();
  check('scenariul importat are PR și 7 tronsoane cu limite LES/LEA independente',
    /PT DEMO 01/.test(await page.locator('.scheme-canvas').innerText()) &&
    await page.locator('.scheme-canvas .dl-seg').count() === 7 &&
    await page.locator('.scheme-canvas .tip-LES').count() === 4 &&
    await page.locator('.scheme-canvas .tip-LEA').count() === 3, '');
  await page.locator('.scheme-palette').getByRole('button', { name: /U3 — nou/ }).click();
  check('scenariul U3: 2.000 lei din 3 tronsoane', /2\.000,00 lei/.test(
    await page.locator('.line-compensation-total').innerText()) &&
    await page.locator('.dl-compensated').count() === 3, '');
  await page.locator('.scheme-palette').getByRole('button', { name: /U4 — nou/ }).click();
  check('scenariul U4: 2.600 lei din 5 tronsoane, inclusiv către U3', /2\.600,00 lei/.test(
    await page.locator('.line-compensation-total').innerText()) &&
    await page.locator('.dl-compensated').count() === 5 &&
    /Către U3/.test(await page.locator('.line-compensation-items').innerText()), '');
  await page.getByRole('button', { name: /Zona 2 · 150 m/ }).click();
  await page.locator('.zone-inspector input').fill('175');
  await page.locator('.zone-inspector input').press('Tab');
  check('mutarea limitei demonstrative păstrează totalul și racordările', await page.evaluate(() => {
    const p = window.AppUI.getState();
    return p.linii[0].zoneTehnice[1].deLa === 175 &&
      p.linii[0].racordari.map((r) => r.distanta).join() === '400,200,600,800' &&
      window.AppCalc.runCalculation(p).central.totalFaraTVA === 4600;
  }), '');
  await page.evaluate(() => window.AppUI.undo());
  await page.click('#tab-rezultate');
  await page.getByRole('button', { name: 'Calculează compensațiile', exact: true }).click();
  check('centralizatorul demonstrativ are exact cele 5 plăți și TVA-ul așteptat', await page.evaluate(() => {
    const r = window.AppUI.store.results;
    const actual = r.central.rows.map((x) => [x.deLaId, x.id, x.faraTVA, x.cuTVA]);
    return !r.error && r.conditions.every((x) => x.ok) &&
      JSON.stringify(actual) === JSON.stringify([
        ['u3', 'u1', 1600, 1936], ['u3', 'u2', 400, 484],
        ['u4', 'u1', 600, 726], ['u4', 'u2', 200, 242], ['u4', 'u3', 1800, 2178]
      ]) && r.central.totalFaraTVA === 4600 && r.central.totalCuTVA === 5566;
  }), '');
  await page.emulateMedia({ media: 'print' });
  check('PDF-ul demonstrativ include 3 blocuri, 7 tronsoane și legenda repetată',
    await page.locator('.line-report-block').count() === 3 &&
    await page.locator('.line-report .dl-seg').count() === 7 &&
    await page.locator('.line-report .dl-legend').count() === 3 &&
    await page.locator('.line-report-table tbody tr').count() === 7, '');
  const demoPdf = await page.pdf({ format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  check('scenariul demonstrativ generează efectiv PDF', demoPdf.subarray(0, 5).toString() === '%PDF-' && demoPdf.length > 5000, '');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.AppUI.flushSave());
  await page.reload();
  await page.waitForSelector('.tabs');
  const persistedDemo = await page.evaluate(() => {
    const p = window.AppUI.getState();
    const r = window.AppCalc.runCalculation(p);
    return { distance: p.linii[0].zoneTehnice[1].deLa, pr: p.linii[0].punctRacordare.denumire,
      total: r.central && r.central.totalFaraTVA, error: r.error };
  });
  check('scenariul importat persistă după reîncărcare', Number(persistedDemo.distance) === 150 &&
    persistedDemo.pr === 'PT DEMO 01' && persistedDemo.total === 4600, JSON.stringify(persistedDemo));
  check('fără erori JS în parcursul demonstrativ', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  console.log('Rețea ramificată — trasee, editare, undo și PDF');
  page = await newPage(browser, 1440, 1000);
  await page.click('.start-actions [data-action="demo-u4"]');
  await page.setInputFiles('input[data-action="import-json"]',
    path.join(__dirname, '..', 'exemple', 'teste-prezentare', 'anexa-1-ramuri.json'));
  await page.waitForFunction(() => window.AppUI.getState().linii[0].mod === 'ramuri');
  await page.click('#tab-instalatie');
  check('importul ramificat are 220 m fizici, 5 tronsoane și 2.640 lei fără dublarea trunchiului', await page.evaluate(() => {
    const l = window.AppUI.getState().linii[0];
    return l.L === 220 && l.tronsoane.length === 5 && l.tronsoane.reduce((s, t) => s + t.cost, 0) === 2640;
  }), '');
  await page.getByText('Proprietăți tehnice, alocări speciale și detaliu de calcul', { exact: true }).click();
  await page.getByLabel('Utilizator rețea', { exact: true }).selectOption('u3');
  check('U3 folosește principală → A → A1, dar plătește numai pe principală și primii 30 m din A',
    await page.locator('.plan-svg .plan-node').count() > 0 &&
    /580,00 lei/.test(await page.locator('.line-compensation-total').innerText()) &&
    /150 m/.test(await page.locator('.tree-connection').innerText()), '');
  const treeBeforeSelection = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await page.getByLabel('Utilizator rețea', { exact: true }).selectOption('u4');
  check('U4 are 540 lei, inclusiv 100 lei către U3; selecția nu modifică proiectul',
    /540,00 lei/.test(await page.locator('.line-compensation-total').innerText()) &&
    /Către U3/.test(await page.locator('.line-compensation-items').innerText()) &&
    await page.evaluate(() => JSON.stringify(window.AppUI.getState())) === treeBeforeSelection, '');
  await page.locator('.tree-editor .tree-segments button').first().press('Enter');
  check('inspectorul tronsonului se deschide din tastatură', /1\.200,00 lei/.test(
    await page.locator('.tree-editor .scheme-inspector').innerText()), '');
  await page.getByLabel('Utilizator rețea', { exact: true }).selectOption('u3');
  const treeTableConnection = page.locator('.plan-connections [data-connection="u3"]');
  await treeTableConnection.getByLabel('Distanță locală utilizator (m)', { exact: true }).fill('10');
  await treeTableConnection.getByRole('button', { name: 'Salvează racordarea', exact: true }).click();
  check('tabelul generează nodul la distanța locală, fără a interpreta coordonatele ca metri', await page.evaluate(() =>
    Number(window.AppUI.getState().linii[0].racordari.find((r) => r.userId === 'u3').distanta)) === 10 &&
    await page.locator('.plan-node[aria-label*="140 m de la PR"]').count() > 0, '');
  await page.evaluate(() => window.AppUI.undo());
  const treeDistance = page.locator('.tree-editor').getByLabel('Distanță locală utilizator (m)', { exact: true });
  await treeDistance.fill('12,5');
  await page.evaluate(() => window.AppUI.store.render());
  check('salvarea asincronă nu golește distanța locală neconfirmată', await treeDistance.inputValue() === '12,5', '');
  await treeDistance.press('Tab');
  check('editarea exactă salvează distanța locală și traseul de la PR', await page.evaluate(() => {
    const l = window.AppUI.getState().linii[0];
    return Number(l.racordari.find((r) => r.userId === 'u3').distanta) === 12.5 &&
      window.AppTree.analyze(l).routes.find((r) => r.userId === 'u3').distance === 142.5;
  }), '');
  await treeDistance.fill('21');
  await treeDistance.press('Tab');
  check('racordarea în afara ramurii este refuzată fără modificarea datelor',
    Number(await treeDistance.inputValue()) === 12.5, '');
  await page.evaluate(() => window.AppUI.undo());
  await page.getByRole('button', { name: 'Ramura A', exact: true }).click();
  await page.locator('.tree-editor').getByLabel('Desprindere din părinte (m)', { exact: true }).fill('80');
  await page.locator('.tree-editor').getByLabel('Desprindere din părinte (m)', { exact: true }).press('Tab');
  check('mutarea desprinderii actualizează întregul subarbore, fără a muta ramura soră', await page.evaluate(() => {
    const l = window.AppUI.getState().linii[0], t = window.AppTree.analyze(l);
    return t.routes.find((r) => r.userId === 'u3').distance === 130 &&
      t.routes.find((r) => r.userId === 'u2').distance === 140;
  }), '');
  await page.evaluate(() => window.AppUI.undo());
  await page.getByRole('button', { name: 'Ramura A', exact: true }).click();
  await page.getByRole('button', { name: '+ Ramură / subramură', exact: true }).click();
  await page.getByLabel('Denumire ramură', { exact: true }).fill('Subramură nouă');
  await page.getByLabel('Denumire ramură', { exact: true }).press('Tab');
  await page.getByLabel('Lungime ramură (m)', { exact: true }).fill('25');
  await page.getByLabel('Lungime ramură (m)', { exact: true }).press('Tab');
  check('subramura se creează din ramura selectată și lungimea fizică crește cu 25 m', await page.evaluate(() => {
    const l = window.AppUI.getState().linii[0], b = l.ramuri.find((x) => x.nume === 'Subramură nouă');
    return b.parentId === 'a' && Number(b.L) === 25 && l.L === 245;
  }), '');
  await page.getByRole('button', { name: 'Șterge ramura și subramurile', exact: true }).click();
  check('ștergerea ramurii noi restaurează bugetul și lungimea fizică inițială', await page.evaluate(() => {
    const l = window.AppUI.getState().linii[0];
    return l.ramuri.length === 4 && l.L === 220 && window.AppCalc.runCalculation(window.AppUI.getState()).central.totalFaraTVA === 1120;
  }), '');
  await page.getByRole('button', { name: 'Subramura A1', exact: true }).click();
  await page.getByLabel('Cost propriu ramură (lei)', { exact: true }).fill('440');
  await page.getByLabel('Cost propriu ramură (lei)', { exact: true }).press('Tab');
  check('costul propriu nu se adună peste I_L: restul este distribuit pe ramurile automate', await page.evaluate(() => {
    const l = window.AppUI.getState().linii[0];
    return l.IL === 2640 && window.AppCalc.lineBl(l) === 11 &&
      l.tronsoane.reduce((s, t) => s + t.cost, 0) === 2640;
  }), '');
  await page.evaluate(() => window.AppUI.undo());
  await page.getByRole('button', { name: 'Ramura A', exact: true }).click();
  await page.getByLabel('Ramură părinte', { exact: true }).selectOption('a1');
  check('bucla A → A1 → A este refuzată', await page.evaluate(() =>
    window.AppUI.getState().linii[0].ramuri.find((b) => b.id === 'a').parentId === 'root') &&
    await page.getByLabel('Ramură părinte', { exact: true }).inputValue() === 'root', '');
  await page.locator('.tree-branch').getByText('Limite tehnice pe această ramură', { exact: true }).click();
  await page.getByRole('button', { name: '+ Limită tehnică la 0 m', exact: true }).click();
  await page.getByLabel('Început zonă local (m)', { exact: true }).fill('15');
  await page.getByLabel('Început zonă local (m)', { exact: true }).press('Tab');
  await page.locator('.tree-branch .technical-zone').getByLabel('Tip linie ramură / zonă', { exact: true }).selectOption('LES');
  check('limite tehnice pe ramură: împărțire fără schimbarea compensației', await page.evaluate(() => {
    const l = window.AppUI.getState().linii[0];
    return l.zoneTehnice.length === 1 && Number(l.zoneTehnice[0].deLa) === 15 &&
      l.tronsoane.length === 6 && window.AppCalc.runCalculation(window.AppUI.getState()).central.totalFaraTVA === 1120;
  }), '');
  check('planșa unificată aplică LES punctată și LEA continuă', await page.evaluate(() => {
    const les = Array.from(document.querySelectorAll('.plan-svg .plan-edge.tip-LES'));
    const lea = Array.from(document.querySelectorAll('.plan-svg .plan-edge.tip-LEA'));
    return les.length > 0 && lea.length > 0 && les.every((el) =>
      getComputedStyle(el).strokeDasharray === '1px, 12px' && getComputedStyle(el).strokeLinecap === 'round') &&
      lea.every((el) => getComputedStyle(el).strokeDasharray === 'none');
  }), '');
  await page.setViewportSize({ width: 390, height: 900 });
  check('rețeaua rămâne utilizabilă pe mobil fără overflow al întregii pagini', await page.evaluate(() =>
    document.documentElement.scrollWidth <= 391), '');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('#tab-rezultate');
  await page.getByRole('button', { name: 'Calculează compensațiile', exact: true }).click();
  check('centralizatorul ramificat păstrează exact plățile secvențiale', await page.evaluate(() => {
    const r = window.AppUI.store.results;
    return !r.error && r.central.totalFaraTVA === 1120 && JSON.stringify(r.central.rows.map((x) => [x.deLaId, x.id, x.faraTVA])) ===
      JSON.stringify([['u3', 'u1', 380], ['u3', 'u2', 200], ['u4', 'u1', 100], ['u4', 'u2', 340], ['u4', 'u3', 100]]);
  }), '');
  await page.emulateMedia({ media: 'print' });
  check('raportul PDF separă ramurile, păstrează topologia și toate cele 6 tronsoane',
    await page.locator('.tree-report-branch').count() === 4 &&
    await page.locator('.tree-report .tree-segments tbody tr').count() === 6 &&
    await page.locator('.tree-report button, .tree-report input, .tree-report [tabindex]').count() === 0 &&
    /Desprindere din Ramura A la 30 m locali/.test(await page.locator('.tree-report').innerText()), '');
  check('diagramele de print nu sunt tăiate de scroll', await page.evaluate(() =>
    Array.from(document.querySelectorAll('.tree-report .tree-diagram')).every((svg) => svg.getBoundingClientRect().width <= svg.parentElement.clientWidth + 1)), '');
  check('PDF ramificat păstrează stilurile LES și LEA și culorile E.ON', await page.evaluate(() => {
    const les = Array.from(document.querySelectorAll('.tree-report .tree-segment.tip-LES'));
    const lea = Array.from(document.querySelectorAll('.tree-report .tree-segment.tip-LEA'));
    return les.length > 0 && lea.length > 0 && les.every((el) =>
      getComputedStyle(el).strokeDasharray === '1px, 12px' && getComputedStyle(el).strokeLinecap === 'round') &&
      lea.every((el) => getComputedStyle(el).strokeDasharray === 'none') &&
      getComputedStyle(document.querySelector('.tree-report .tree-segment')).stroke === 'rgb(92, 92, 92)';
  }), '');
  const treePdf = await page.pdf({ format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  check('PDF A4 ramificat generat efectiv', treePdf.subarray(0, 5).toString() === '%PDF-' && treePdf.length > 5000, '');
  const treeBeforeLongReport = await page.evaluate(() => JSON.parse(JSON.stringify(window.AppUI.getState())));
  await page.evaluate(() => {
    const p = JSON.parse(JSON.stringify(window.AppUI.getState()));
    for (let i = 0; i < 8; i++) {
      const u = window.AppState.addUser(p, { id: 'suplimentar' + i, rol: 'existent', nume: 'Utilizator suplimentar ' + i,
        dataTR: '2024-01-15', dataContract: '2024-01-10' });
      p.linii[0].racordari.push({ userId: u.id, branchId: 'b', distanta: 40 });
    }
    window.AppUI.setProject(p);
    window.AppUI.setTab('rezultate');
    window.AppUI.calculate();
  });
  check('ramura cu 10 racordări este împărțită în blocuri de maximum 6, fără utilizatori omişi', await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('.tree-report-block'));
    return blocks.length === 5 && blocks.every((block) => block.querySelectorAll('.tree-user').length <= 6 &&
      block.querySelector('svg').viewBox.baseVal.height <= 288) && document.querySelectorAll('.tree-report .tree-user').length === 12;
  }), '');
  const longTreePdf = await page.pdf({ format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  check('continuările ramurilor generează PDF fără reducerea întregii scheme pe o singură pagină',
    longTreePdf.subarray(0, 5).toString() === '%PDF-' && await page.evaluate(() =>
      Array.from(document.querySelectorAll('.tree-report svg')).every((svg) => {
        const rect = svg.getBoundingClientRect();
        return rect.height / rect.width <= 288 / 980 + 0.001;
      })), '');
  await page.evaluate((p) => window.AppUI.setProject(p), treeBeforeLongReport);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.AppUI.flushSave());
  await page.reload();
  await page.waitForSelector('.tabs');
  check('ramurile, costurile proprii și limitele persistă după reîncărcare', await page.evaluate(() => {
    const l = window.AppUI.getState().linii[0], r = window.AppCalc.runCalculation(window.AppUI.getState());
    return l.mod === 'ramuri' && l.ramuri.length === 4 && Number(l.ramuri[3].IL) === 240 &&
      Number(l.zoneTehnice[0].deLa) === 15 && r.central.totalFaraTVA === 1120;
  }), '');
  await page.evaluate(() => window.AppUI.store.delUser('u3'));
  check('ștergerea utilizatorului elimină racordarea din rețea, fără realocare la derivare', await page.evaluate(() => {
    const p = window.AppUI.getState();
    return !p.utilizatori.some((u) => u.id === 'u3') && !p.linii[0].racordari.some((r) => r.userId === 'u3') &&
      !p.linii[0].tronsoane.some((t) => t.utilizatori.includes('u3'));
  }), '');
  await page.evaluate(() => window.AppUI.undo());
  await page.setInputFiles('input[data-action="import-json"]',
    path.join(__dirname, '..', 'exemple', 'teste-prezentare', 'anexa-1-editor-grafic.json'));
  await page.waitForFunction(() => window.AppUI.getState().linii[0].mod === 'distante');
  await page.click('#tab-instalatie');
  await page.locator('.line-card details.line-advanced').first().evaluate((el) => { el.open = true; });
  await page.getByRole('button', { name: '→ Rețea cu ramuri', exact: true }).click();
  check('conversia din UI păstrează cele 7 tronsoane, descrierile și calculul liniar', await page.evaluate(() => {
    const p = window.AppUI.getState(), l = p.linii[0];
    return l.mod === 'ramuri' && l.ramuri.length === 1 && l.tronsoane.length === 7 &&
      l.zoneTehnice.every((z) => z.branchId === l.ramuri[0].id) &&
      window.AppCalc.runCalculation(p).central.totalFaraTVA === 4600;
  }), '');
  await page.evaluate(() => window.AppUI.undo());
  check('undo după conversie restaurează modul pe distanțe', await page.evaluate(() =>
    window.AppUI.getState().linii[0].mod === 'distante'), '');
  check('fără erori JS în editorul ramificat', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  console.log('Anexa 2 — editor grafic, rezervă, întărire și PDF');
  page = await newPage(browser, 1440, 1000);
  await page.click('.start-actions [data-action="demo-u4"]');
  await page.setInputFiles('input[data-action="import-json"]',
    path.join(__dirname, '..', 'exemple', 'teste-prezentare', 'anexa-2-statie.json'));
  await page.waitForFunction(() => window.AppUI.getState().meta.model === 'station');
  await page.click('#tab-instalatie');
  const stationBase = await page.evaluate(() => JSON.parse(JSON.stringify(window.AppUI.getState())));
  await page.getByRole('button', { name: 'Schemă', exact: true }).click();
  const stationCanvas = page.locator('.station-scheme');
  await stationCanvas.locator('.station-user').last().press('Enter');
  check('selectarea în schemă nu modifică proiectul și nu salvează un calcul', await page.evaluate((p) =>
    JSON.stringify(window.AppUI.getState()) === JSON.stringify(p) && window.AppUI.store.results === null, stationBase), '');
  check('Anexa 2: 40.000 lei transformator + 3.000 lei echipamente = 43.000 lei',
    /43\.000,00 lei/.test(await stationCanvas.locator('.station-compensation-total').innerText()) &&
    await stationCanvas.locator('.station-contributions li').count() === 3 &&
    await stationCanvas.locator('.station-paid').count() === 2 &&
    /2 → 3 participanți/.test(await stationCanvas.locator('.station-compensation').innerText()), '');
  check('rezerva N−1 este marcată separat și exclusă din capacitatea efectivă',
    /400,00 kVA/.test(await stationCanvas.locator('.station-metrics').innerText()) &&
    /100,00 kVA/.test(await stationCanvas.locator('.station-reserve').textContent()), '');
  const stationPower = stationCanvas.getByLabel('Putere aprobată (kVA)', { exact: true });
  const stationDepth = await page.evaluate(() => window.AppUI.undoDepth());
  await stationPower.focus(); await stationPower.press('Tab');
  await stationPower.fill('42'); await stationPower.press('Escape');
  check('focusul fără editare și Escape nu modifică starea sau istoricul undo', await page.evaluate((depth) =>
    window.AppUI.undoDepth() === depth && window.AppUI.getState().utilizatori[2].putere === 80, stationDepth), '');
  await stationPower.fill('90,5');
  await page.evaluate(() => window.AppUI.store.render());
  check('inspectorul păstrează puterea neconfirmată și nu modifică proiectul la fiecare tastă',
    await stationPower.inputValue() === '90,5' && await page.evaluate(() =>
      Number(window.AppUI.getState().utilizatori.find((u) => u.id === 'u3').putere) === 80), '');
  await stationPower.press('Tab');
  check('puterea zecimală confirmată regenerează compensația exactă',
    /48\.250,00 lei/.test(await stationCanvas.locator('.station-compensation-total').innerText()), '');
  await stationPower.fill('-1'); await stationPower.press('Tab');
  check('puterea negativă este refuzată fără salvare', await page.evaluate(() =>
    Number(window.AppUI.getState().utilizatori.find((u) => u.id === 'u3').putere) === 90.5), '');
  await page.evaluate(() => window.AppUI.undo());
  check('undo restaurează puterea și compensația', /43\.000,00 lei/.test(
    await stationCanvas.locator('.station-compensation-total').innerText()), '');
  await stationCanvas.locator('.station-contributions').getByRole('button', { name: 'Echipamente comune', exact: true }).first().click();
  check('clickul pe contribuție deschide inspectorul componentei fără a pierde utilizatorul',
    await stationCanvas.getByLabel('Cost echipamente comune (lei)', { exact: true }).count() === 1 &&
    /43\.000,00 lei/.test(await stationCanvas.locator('.station-compensation-total').innerText()), '');
  await stationCanvas.getByLabel('Cost echipamente comune (lei)', { exact: true }).fill('12000');
  await stationCanvas.getByLabel('Cost echipamente comune (lei)', { exact: true }).press('Tab');
  check('editarea echipamentelor actualizează plata secvențială', /44\.000,00 lei/.test(
    await stationCanvas.locator('.station-compensation-total').innerText()), '');
  await page.evaluate(() => window.AppUI.undo());
  await stationCanvas.locator('.station-palette').getByRole('button', { name: 'Transformator', exact: true }).click();
  await stationCanvas.getByLabel('Transformator de rezervă N-1 (kVA)', { exact: true }).fill('500');
  await stationCanvas.getByLabel('Transformator de rezervă N-1 (kVA)', { exact: true }).press('Tab');
  check('N−1 invalid este semnalat și nu produce sume sau evidențieri false',
    await stationCanvas.locator('.station-validation').count() === 1 &&
    await stationCanvas.locator('.station-compensation-total, .station-paid').count() === 0, '');
  await page.evaluate(() => window.AppUI.undo());
  await stationCanvas.locator('.station-person').last().click();
  await stationCanvas.getByRole('button', { name: 'Deconectează de la stație', exact: true }).click();
  check('deconectarea explicită păstrează utilizatorul și explică absența plăților',
    /0,00 lei/.test(await stationCanvas.locator('.station-compensation-total').innerText()) &&
    /nu este racordat/.test(await stationCanvas.locator('.station-compensation').innerText()) &&
    await page.evaluate(() => window.AppUI.getState().utilizatori.length === 3), '');
  await page.evaluate(() => window.AppUI.undo());
  await page.getByRole('button', { name: 'Formular / tabel', exact: true }).click();
  check('formularul existent vede aceleași valori și racordări', await page.evaluate(() => {
    const p = window.AppUI.getState();
    return p.statii[0].utilizatori.length === 3 && p.utilizatori[2].putere === 80 &&
      document.querySelectorAll('.station-card .list-chk input:checked').length === 3;
  }), '');
  await page.getByRole('button', { name: 'Schemă', exact: true }).click();
  await stationCanvas.locator('.station-person').last().click();
  await page.evaluate(() => window.AppUI.store.set('cond.solutieComuna', false));
  check('condițiile neîndeplinite blochează și explicația vizuală', /Calcul blocat/.test(
    await stationCanvas.locator('.station-compensation').innerText()) &&
    await stationCanvas.locator('.station-compensation-total').count() === 0, '');
  await page.evaluate(() => window.AppUI.store.set('cond.calcInformativ', true));
  check('calculul informativ este etichetat explicit', /INFORMATIV/.test(
    await stationCanvas.locator('.station-compensation').innerText()), '');
  await page.evaluate((p) => {
    window.AppUI.setProject(p);
    window.AppUI.setTab('instalatie');
  }, stationBase);
  if (!await page.locator('.station-scheme').count()) await page.getByRole('button', { name: 'Schemă', exact: true }).click();
  await page.locator('.station-person').last().click();
  await page.setViewportSize({ width: 390, height: 900 });
  check('editorul de stație nu produce scroll orizontal pe întreaga pagină pe mobil', await page.evaluate(() =>
    document.documentElement.scrollWidth <= 391), '');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.click('#tab-rezultate');
  await page.getByRole('button', { name: 'Calculează compensațiile', exact: true }).click();
  check('raportul de stație este ascuns pe ecran', !await page.locator('.print-station-schemes').isVisible(), '');
  await page.emulateMedia({ media: 'print' });
  check('PDF stație: toate racordările, rezerva, formulele și niciun control interactiv',
    await page.locator('.station-report .station-user').count() === 3 &&
    await page.locator('.station-report .station-report-table tbody tr').count() === 3 &&
    await page.locator('.station-report button, .station-report input, .station-report [tabindex]').count() === 0 &&
    /80,00 kVA × 500,00 lei\/kVA/.test(await page.locator('.station-report').innerText()), '');
  const stationPdf = await page.pdf({ format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  check('Chrome generează un PDF A4 real pentru Anexa 2', stationPdf.subarray(0, 5).toString() === '%PDF-' && stationPdf.length > 5000, '');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate((p) => {
    p.statii.push(Object.assign({}, p.statii[0], { id: 's2', IT: 100000, elementeComune: 0 }));
    window.AppUI.setProject(p); window.AppUI.setTab('instalatie');
  }, stationBase);
  const stationCards = page.locator('.station-card');
  for (let i = 0; i < 2; i++) {
    const card = stationCards.nth(i);
    if (!await card.locator('.station-scheme').count()) await card.getByRole('button', { name: 'Schemă', exact: true }).click();
    await card.locator('.station-person').last().click();
  }
  check('stațiile cu nume identice au contribuții separate și total de proiect comun',
    /43\.000,00 lei/.test(await stationCards.nth(0).locator('.station-compensation-total').innerText()) &&
    /20\.000,00 lei/.test(await stationCards.nth(1).locator('.station-compensation-total').innerText()) &&
    /63\.000,00 lei/.test(await stationCards.nth(0).locator('.station-compensation .hint').innerText()), '');
  await stationCards.nth(0).getByLabel('Putere aprobată (kVA)', { exact: true }).fill('60');
  await stationCards.nth(0).getByLabel('Putere aprobată (kVA)', { exact: true }).press('Tab');
  check('aceeași putere aprobată se sincronizează între inspectorii stațiilor',
    await stationCards.nth(1).getByLabel('Putere aprobată (kVA)', { exact: true }).inputValue() === '60' &&
    /15\.000,00 lei/.test(await stationCards.nth(1).locator('.station-compensation-total').innerText()), '');
  await page.setInputFiles('input[data-action="import-json"]',
    path.join(__dirname, '..', 'exemple', 'teste-prezentare', 'anexa-2-intarire.json'));
  await page.waitForFunction(() => window.AppUI.getState().statii[0].id === 'pt-intarire');
  await page.click('#tab-instalatie');
  if (!await page.locator('.station-scheme').count()) await page.getByRole('button', { name: 'Schemă', exact: true }).click();
  await page.locator('.station-person').last().click();
  check('întărirea consumă succesiv rezerva de capacitate: U4 compensează doar 20 din 80 kVA',
    /20,00 din 80,00 kVA/.test(await page.locator('.station-spare').innerText()) &&
    /15\.583,33 lei/.test(await page.locator('.station-compensation-total').innerText()) &&
    await page.evaluate(() => window.AppCalc.runCalculation(window.AppUI.getState()).central.totalFaraTVA === 71916.66), '');
  await page.evaluate((p) => {
    p.utilizatori[0].dataContract = '2015-01-01'; p.utilizatori[1].dataContract = '2015-02-01';
    p.statii[0].compVeche = 100000;
    window.AppUI.setProject(p); window.AppUI.setTab('instalatie');
  }, stationBase);
  if (!await page.locator('.station-scheme').count()) await page.getByRole('button', { name: 'Schemă', exact: true }).click();
  await page.locator('.station-person').last().click();
  check('tranzitoriu: b_T net și participanți eligibili, nu investiția brută',
    /250,00 lei\/kVA/.test(await page.locator('.station-metrics').innerText()) &&
    /24\.500,00 lei/.test(await page.locator('.station-compensation-total').innerText()) &&
    /1 → 2 participanți/.test(await page.locator('.station-compensation').innerText()), '');
  await page.evaluate((p) => {
    for (let i = 0; i < 7; i++) {
      const u = window.AppState.addUser(p, { id: 'extra' + i, nume: 'Suplimentar ' + i, rol: 'existent', putere: 1, dataTR: '2024-02-01' });
      p.statii[0].utilizatori.push(u.id);
    }
    window.AppUI.setProject(p); window.AppUI.setTab('rezultate'); window.AppUI.calculate();
  }, stationBase);
  await page.emulateMedia({ media: 'print' });
  check('PDF cu 10 utilizatori: două blocuri de maximum 6, fără omisiuni sau tăiere', await page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll('.station-report-block'));
    return blocks.length === 2 && document.querySelectorAll('.station-report .station-user').length === 10 &&
      blocks.every((b) => b.querySelectorAll('.station-user').length <= 6 &&
        b.querySelector('svg').getBoundingClientRect().width <= b.clientWidth + 1);
  }), '');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.AppUI.flushSave()); await page.reload(); await page.waitForSelector('.tabs');
  check('editarea și racordările stației persistă la reîncărcare', await page.evaluate(() => {
    const p = window.AppUI.getState();
    return p.meta.model === 'station' && p.statii[0].utilizatori.length === 10 &&
      p.statii[0].SnRezerva === 100 && !window.AppCalc.runCalculation(p).error;
  }), '');
  check('fără erori JS în fluxul grafic Anexa 2', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  console.log('Anexele 3–5 — scheme, inspectori, persistență și PDF');
  page = await newPage(browser, 1440, 1000);
  const example = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'exemple', 'teste-prezentare', name), 'utf8'));
  async function loadModel(p) {
    await page.evaluate((project) => {
      window.AppUI.setProject(project); window.AppUI.setTab('instalatie');
    }, p);
    await page.locator('.scheme-mode[aria-label="Mod de introducere model"]')
      .getByRole('button', { name: 'Schemă', exact: true }).click();
  }
  async function mobileModel(name) {
    await page.setViewportSize({ width: 390, height: 900 });
    check(name + ': fără scroll orizontal pe întreaga pagină', await page.evaluate(() =>
      document.documentElement.scrollWidth <= 391), '');
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  const complexBase = example('anexa-3-varianta-4.json');
  await loadModel(complexBase);
  const beforeComplex = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await page.getByLabel('Utilizator nou analizat', { exact: true }).selectOption('u3');
  await page.locator('.complex-map .model-node').first().press('Enter');
  check('Anexa 3: 45.000 lei, selecție nemutantă și linie manuală neconvertită',
    /45\.000,00 lei/.test(await page.locator('.complex-compensation .model-total').innerText()) &&
    await page.locator('.complex-part').evaluateAll((parts) =>
      parts.map((part) => part.dataset.componentId).join() === 'line:l1,station:s1,line:l2') &&
    /Pregătește linia pentru schemă/.test(await page.locator('.complex-inspector').innerText()) &&
    await page.evaluate((before) => JSON.stringify(window.AppUI.getState()) === before &&
      window.AppUI.store.results === null, beforeComplex), '');
  await page.getByLabel('Rol în instalația complexă', { exact: true }).selectOption('');
  check('excluderea l_U1 păstrează linia, dar scade contribuția la 35.000 lei',
    /35\.000,00 lei/.test(await page.locator('.complex-compensation .model-total').innerText()) &&
    await page.evaluate(() => window.AppUI.getState().linii.length === 2), '');
  await page.evaluate(() => window.AppUI.undo());
  await page.getByLabel('Varianta punctului de racordare', { exact: true }).selectOption('2');
  check('varianta 2: 10.000 linie + 4.000 echipamente, fără transformator sau l_U2',
    /14\.000,00 lei/.test(await page.locator('.complex-compensation .model-total').innerText()) &&
    await page.locator('.complex-map .complex-part-inactive').count() === 1, '');
  await page.locator('.complex-part[data-component-id="station:s1"] .model-node').click();
  check('inspectorul variantei 2 editează numai echipamentele și racordările',
    await page.locator('.complex-inspector input[data-bind="stat.s1.elementeComune"]').count() === 1 &&
    await page.locator('.complex-inspector input[data-bind="stat.s1.IT"], .complex-inspector .station-transformer').count() === 0, '');
  const equipment = page.locator('.complex-inspector').getByLabel('Cost echipamente comune (lei)', { exact: true });
  await equipment.fill('15000'); await equipment.press('Enter');
  check('echipamente editate: recalculare la 15.000 lei', /15\.000,00 lei/.test(
    await page.locator('.complex-compensation .model-total').innerText()), '');
  await page.evaluate(() => window.AppUI.undo());
  await page.getByLabel('Stație inclusă în instalația complexă', { exact: true }).uncheck();
  check('stația neinclusă rămâne vizibilă și nu generează plăți', /10\.000,00 lei/.test(
    await page.locator('.complex-compensation .model-total').innerText()), '');
  await page.evaluate(() => window.AppUI.undo());
  await mobileModel('Anexa 3');
  for (let variant = 1; variant <= 4; variant++) {
    await loadModel(example('anexa-3-varianta-' + variant + '.json'));
    await page.getByLabel('Utilizator nou analizat', { exact: true }).selectOption('u3');
    check('Anexa 3 varianta ' + variant + ': totalul scenariului existent',
      new RegExp(['10\\.000', '14\\.000', '39\\.000', '45\\.000'][variant - 1] + ',00 lei').test(
        await page.locator('.complex-compensation .model-total').innerText()), '');
    await page.click('#tab-rezultate');
    await page.getByRole('button', { name: 'Calculează compensațiile', exact: true }).click();
    check('raportul complex este ascuns pe ecran', !await page.locator('.print-model-schemes').isVisible(), '');
    await page.emulateMedia({ media: 'print' });
    const report = page.locator('.complex-report');
    const pdf = await page.pdf({ format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
    check('PDF varianta ' + variant + ': componente active, formule, fără controale și fișier real',
      await report.locator('.line-report').count() === (variant === 4 ? 2 : 1) &&
      await report.locator('.station-report').count() === (variant >= 3 ? 1 : 0) &&
      await report.locator('input, button, select, [tabindex]').count() === 0 &&
      pdf.subarray(0, 5).toString() === '%PDF-' && pdf.length > 5000, '');
    await page.emulateMedia({ media: 'screen' });
  }
  await loadModel(complexBase);
  await page.getByLabel('Utilizator nou analizat', { exact: true }).selectOption('u3');
  await page.evaluate(() => window.AppUI.store.set('cond.solutieComuna', false));
  check('Anexa 3: condițiile invalide ascund compensațiile și marcajele de plată',
    /Calcul blocat/.test(await page.locator('.model-calculation-status').innerText()) &&
    await page.locator('.complex-compensation, .model-node-paid').count() === 0, '');
  await page.evaluate(() => window.AppUI.store.set('cond.calcInformativ', true));
  check('Anexa 3: explicația informativă este etichetată', /INFORMATIV/.test(
    await page.locator('.model-calculation-status').innerText()) &&
    /45\.000,00 lei/.test(await page.locator('.complex-compensation .model-total').innerText()), '');

  await loadModel(example('anexa-4-tranzitoriu.json'));
  check('Anexa 4: b=500 și C₂=13.500 lei, proporție de 90%', /13\.500,00 lei/.test(
    await page.locator('.model-formula').innerText()) &&
    await page.locator('.model-used').evaluate((el) => el.style.width) === '90%', '');
  await page.locator('.transitional-diagram .model-node').last().press('Enter');
  const usedLength = page.getByLabel('Lungimea folosită l₂ (m)', { exact: true });
  const modelDepth = await page.evaluate(() => window.AppUI.undoDepth());
  await usedLength.focus(); await usedLength.press('Tab');
  await usedLength.fill('80,5'); await page.evaluate(() => window.AppUI.store.render());
  check('inspector Anexa 4: draft păstrat, fără mutație la tastare', await usedLength.inputValue() === '80,5' &&
    await page.evaluate((depth) => Number(window.AppUI.getState().tranzitoriu.l2) === 90 &&
      window.AppUI.undoDepth() === depth, modelDepth), '');
  await usedLength.press('Escape');
  check('Escape anulează numai draftul', await page.evaluate((depth) =>
    window.AppUI.undoDepth() === depth && Number(window.AppUI.getState().tranzitoriu.l2) === 90, modelDepth), '');
  await usedLength.fill('80,5'); await usedLength.press('Enter');
  check('confirmarea zecimalelor produce C₂=12.075 lei', /12\.075,00 lei/.test(
    await page.locator('.model-formula').innerText()), '');
  await usedLength.fill('101'); await usedLength.press('Tab');
  check('l₂>L este eroare explicită, fără formulă sau proporție aparent validă',
    await page.locator('.model-calculation-status[role="alert"]').count() === 1 &&
    await page.locator('.model-formula, .model-used').count() === 0, '');
  await page.evaluate(() => window.AppUI.undo());
  await mobileModel('Anexa 4');
  await page.evaluate(() => window.AppUI.flushSave()); await page.reload(); await page.waitForSelector('.tabs');
  check('Anexa 4: lungimea confirmată și calculul persistă la reîncărcare', await page.evaluate(() =>
    Number(window.AppUI.getState().tranzitoriu.l2) === 80.5 &&
    window.AppCalc.runCalculation(window.AppUI.getState()).C2 === 12075), '');
  await page.click('#tab-rezultate');
  await page.getByRole('button', { name: 'Calculează compensațiile', exact: true }).click();
  await page.emulateMedia({ media: 'print' });
  const transitionalPdf = await page.pdf({ format: 'A4' });
  check('Anexa 4: PDF real cu formula exactă, fără controale',
    /12\.075,00 lei/.test(await page.locator('.transitional-report').innerText()) &&
    await page.locator('.transitional-report input, .transitional-report button, .transitional-report [tabindex]').count() === 0 &&
    transitionalPdf.subarray(0, 5).toString() === '%PDF-' && transitionalPdf.length > 5000, '');
  await page.emulateMedia({ media: 'screen' });

  const developerBase = example('anexa-5-dezvoltator.json');
  await loadModel(developerBase);
  check('Anexa 5: 60% eficient, 40% ineficient; cote de 30.000/15.000/15.000 lei',
    /60,00%/.test(await page.locator('.developer-diagram').innerText()) &&
    /30\.000,00 lei/.test(await page.locator('.developer-nodes').innerText()) &&
    (await page.locator('.developer-nodes').innerText()).match(/15\.000,00 lei/g).length === 2, '');
  await page.locator('.developer-node .model-node').first().press('Enter');
  const developerName = page.getByLabel('Denumire dezvoltator', { exact: true });
  await developerName.fill('Dezvoltator cu nume complet modificat');
  await page.evaluate(() => window.AppUI.store.render());
  check('Anexa 5: denumirea neconfirmată rezistă re-randării și nu schimbă proiectul',
    await developerName.inputValue() === 'Dezvoltator cu nume complet modificat' &&
    await page.evaluate(() => window.AppUI.getState().dezvoltator.dezvoltatori[0].nume === 'Dezvoltator A'), '');
  await developerName.press('Tab');
  const developerPower = page.getByLabel('Putere aprobată dezvoltator (kVA)', { exact: true });
  await developerPower.fill('150'); await developerPower.press('Enter');
  check('Anexa 5: puterea modificată repartizează 36.000/12.000/12.000 lei',
    /36\.000,00 lei/.test(await page.locator('.developer-nodes').innerText()) &&
    (await page.locator('.developer-nodes').innerText()).match(/12\.000,00 lei/g).length === 2, '');
  await page.getByRole('button', { name: '+ Adaugă dezvoltator', exact: true }).click();
  check('adăugarea selectează un dezvoltator de putere zero și păstrează cotele',
    await page.locator('.developer-node').count() === 4 &&
    /0,00 kVA · Cotă: 0,00 lei/.test(await page.locator('.developer-node .model-node[aria-pressed="true"]').innerText()) &&
    await page.evaluate(() => window.AppUI.getState().dezvoltator.dezvoltatori.slice(-1)[0].putere === 0) &&
    /36\.000,00 lei/.test(await page.locator('.developer-nodes').innerText()), '');
  await page.getByRole('button', { name: 'Șterge dezvoltatorul', exact: true }).click();
  await page.waitForFunction(() => window.AppUI.getState().dezvoltator.dezvoltatori.length === 3);
  await page.evaluate(() => window.AppUI.undo());
  check('ștergerea confirmată este anulabilă', await page.locator('.developer-node').count() === 4, '');
  await page.evaluate(() => window.AppUI.undo());
  await mobileModel('Anexa 5');
  await page.evaluate(() => window.AppUI.flushSave()); await page.reload(); await page.waitForSelector('.tabs');
  check('Anexa 5: denumirea, puterea și cotele persistă la reîncărcare', await page.evaluate(() => {
    const p = window.AppUI.getState();
    return p.dezvoltator.dezvoltatori[0].nume === 'Dezvoltator cu nume complet modificat' &&
      Number(p.dezvoltator.dezvoltatori[0].putere) === 150 && window.AppCalc.runCalculation(p).rows[0].suma === 36000;
  }), '');
  const longDevelopers = example('anexa-5-dezvoltator.json');
  for (let i = 3; i < 10; i++) longDevelopers.dezvoltator.dezvoltatori.push({
    id: 'dev-extra-' + i, nume: 'Dezvoltator suplimentar cu denumire completă și foarte lungă ' + i, putere: 10
  });
  await loadModel(longDevelopers);
  await mobileModel('Anexa 5 cu 10 dezvoltatori');
  await page.click('#tab-rezultate');
  await page.getByRole('button', { name: 'Calculează compensațiile', exact: true }).click();
  await page.emulateMedia({ media: 'print' });
  const developerPdf = await page.pdf({ format: 'A4', margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });
  check('Anexa 5: PDF real cu 10 dezvoltatori în blocuri de maximum 6, nume complete și fără controale',
    await page.locator('.developer-report .developer-report-block').count() === 2 &&
    await page.locator('.developer-report .developer-node').count() === 10 &&
    await page.locator('.developer-report button, .developer-report input, .developer-report [tabindex]').count() === 0 &&
    await page.locator('.developer-report-block').evaluateAll((blocks) =>
      blocks.every((b) => b.querySelectorAll('.developer-node').length <= 6 &&
        Array.from(b.querySelectorAll('.model-node')).every((n) => n.scrollWidth <= n.clientWidth + 1))) &&
    developerPdf.subarray(0, 5).toString() === '%PDF-' && developerPdf.length > 5000, '');
  check('fără erori JS în fluxurile grafice Anexele 3–5', page.errors.length === 0, page.errors.join('; '));
  await page.emulateMedia({ media: 'screen' });
  console.log('Rafinare cap-coadă — componente active, regim tranzitoriu și navigare la câmp');
  const inactiveComplex = example('anexa-3-varianta-4.json');
  inactiveComplex.complexConfig.varianta = 2;
  inactiveComplex.statii[0].SnRezerva = 500;
  inactiveComplex.linii[1].L = -1;
  await loadModel(inactiveComplex);
  await page.getByLabel('Utilizator nou analizat', { exact: true }).selectOption('u3');
  check('datele păstrate în componente inactive nu blochează varianta 2',
    await page.locator('.model-calculation-status[role="alert"]').count() === 0 &&
    /14\.000,00 lei/.test(await page.locator('.complex-compensation .model-total').innerText()), '');
  await page.getByLabel('Varianta punctului de racordare', { exact: true }).selectOption('4');
  check('activarea componentelor invalide blochează imediat calculul și evidențierile',
    await page.locator('.model-calculation-status[role="alert"]').count() === 1 &&
    await page.locator('.complex-compensation, .model-node-paid').count() === 0, '');
  await page.evaluate(() => window.AppUI.undo());
  const inactiveSnapshot = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await page.evaluate(() => window.AppUI.store.goToStep({ tab: 'instalatie', target: 'stat.s1.elementeComune' }));
  check('Mergi la câmp deschide inspectorul componentei corecte și îi dă focus fără modificarea datelor',
    await page.locator('.complex-inspector input[data-bind="stat.s1.elementeComune"]').evaluate((el) => el === document.activeElement) &&
    await page.evaluate((snapshot) => JSON.stringify(window.AppUI.getState()) === snapshot, inactiveSnapshot), '');
  await page.getByRole('group', { name: 'Mod de introducere model', exact: true })
    .getByRole('button', { name: 'Formular / tabel', exact: true }).click();
  await page.locator('.station-card .scheme-mode').getByRole('button', { name: 'Schemă', exact: true }).click();
  check('varianta 2 are același inspector doar pentru echipamente și din formularul stației',
    await page.locator('.station-card .station-transformer, .station-card input[data-bind="stat.s1.IT"]').count() === 0 &&
    await page.locator('.station-card input[data-bind="stat.s1.elementeComune"]').count() === 1, '');

  const transitionalComplex = example('anexa-3-varianta-4.json');
  transitionalComplex.complexConfig.varianta = 2;
  transitionalComplex.utilizatori[0].dataContract = '2015-01-01';
  transitionalComplex.utilizatori[1].dataContract = '2015-02-01';
  await loadModel(transitionalComplex);
  await page.getByLabel('Utilizator nou analizat', { exact: true }).selectOption('u3');
  check('varianta 2 tranzitorie: 15.000 lei linie + 6.000 lei echipamente, numai către U1',
    /21\.000,00 lei/.test(await page.locator('.complex-compensation .model-total').innerText()) &&
    await page.evaluate(() => {
      const r = window.AppCalc.runCalculation(window.AppUI.getState());
      return r.central.rows.every((row) => row.id !== 'u2') &&
        r.explicatii.filter((e) => e.stationId === 's1').every((e) => e.catre === 'u1' && e.suma === 6000);
    }), '');
  await page.click('#tab-rezultate');
  await page.getByRole('button', { name: 'Calculează compensațiile', exact: true }).click();
  await page.emulateMedia({ media: 'print' });
  check('PDF varianta 2: racordările fizice rămân, iar utilizatorul vechi este marcat exclus',
    /U2 — existent — Exclus prin regimul tranzitoriu/.test(await page.locator('.complex-equipment-report').innerText()) &&
    /21\.000,00 lei/.test(await page.locator('.complex-report').innerText()), '');
  await page.emulateMedia({ media: 'screen' });

  for (const entry of [
    { file: 'anexa-3-varianta-4.json', target: 'stat.s1.elementeComune' },
    { file: 'anexa-3-varianta-4.json', target: 'stat.s1.compVeche' },
    { file: 'anexa-3-varianta-4.json', target: 'tronson.l1.t1.lungime' },
    { file: 'anexa-4-tranzitoriu.json', target: 'tranz.l2' },
    { file: 'anexa-5-dezvoltator.json', target: 'devitem.d2.putere' }
  ]) {
    await loadModel(example(entry.file));
    const snapshot = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
    await page.evaluate((target) => window.AppUI.store.goToStep({ tab: 'instalatie', target }), entry.target);
    const input = page.locator('[data-bind="' + entry.target + '"]');
    check('navigare la ' + entry.target + ': inspector vizibil, câmp focalizat și stare nemodificată',
      await input.isVisible() && await input.evaluate((el) => el === document.activeElement) &&
      await page.evaluate((before) => JSON.stringify(window.AppUI.getState()) === before, snapshot), '');
    await page.setViewportSize({ width: 320, height: 900 });
    check(entry.target + ': inspector utilizabil la 320 px fără scroll pe întreaga pagină',
      await page.evaluate(() => document.documentElement.scrollWidth <= 321), '');
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.evaluate(() => window.AppUI.store.goToStep({ tab: 'instalatie', target: 'devitem.d1.putere' }));
  await page.getByLabel('Putere aprobată dezvoltator (kVA)', { exact: true }).fill('125');
  await page.getByLabel('Putere aprobată dezvoltator (kVA)', { exact: true }).press('Tab');
  check('editarea după navigarea la câmp funcționează, iar undo restaurează valoarea',
    await page.evaluate(() => Number(window.AppUI.getState().dezvoltator.dezvoltatori[0].putere) === 125), '');
  await page.evaluate(() => window.AppUI.undo());
  check('undo după editare asistată restaurează calculul de 30.000 lei pentru A', await page.evaluate(() =>
    window.AppCalc.runCalculation(window.AppUI.getState()).rows[0].suma === 30000), '');
  check('fără erori JS în scenariile rafinate', page.errors.length === 0, page.errors.join('; '));

  console.log('Parcurs asistat — situație, revizie, corectare și explicații');
  await loadModel(example('anexa-3-varianta-4.json'));
  await page.click('#tab-date');
  await page.locator('.select-guide > summary').click();
  await page.locator('.select-guide input[value="complex"]').check();
  check('alegerea situației nu presupune varianta PR sau data contractului',
    await page.locator('.select-guide').getByRole('button', { name: /Aplică recomandarea/ }).count() === 0 &&
    await page.locator('#sel-contract').inputValue() === '', '');
  const beforeRecommendation = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await page.locator('#sel-var').selectOption('2');
  check('recomandarea nu schimbă proiectul înainte de aplicare', await page.evaluate((snapshot) =>
    JSON.stringify(window.AppUI.getState()) === snapshot, beforeRecommendation), '');
  await page.locator('.select-guide').getByRole('button', { name: /Aplică recomandarea/ }).click();
  check('recomandarea schimbă varianta în același model, fără pierderea componentelor',
    await page.evaluate(() => {
      const p = window.AppUI.getState();
      return p.meta.model === 'complex' && p.complexConfig.varianta === 2 &&
        p.linii.length === 2 && window.AppCalc.runCalculation(p).central.totalFaraTVA === 14000;
    }), '');
  await page.evaluate(() => window.AppUI.undo());
  check('undo restaurează modelul anterior recomandării', await page.evaluate((snapshot) =>
    JSON.stringify(window.AppUI.getState()) === snapshot, beforeRecommendation), '');

  await loadModel(example('anexa-5-dezvoltator.json'));
  await page.click('#tab-rezultate');
  const beforeReview = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await page.locator('.assist-confirm input').check();
  check('revizia nu calculează, nu confirmă condițiile și nu salvează date noi',
    await page.locator('.assist-confirm input').isChecked() &&
    await page.evaluate((snapshot) => JSON.stringify(window.AppUI.getState()) === snapshot &&
      window.AppUI.store.results === null, beforeReview), '');
  await page.locator('.assist-data > summary').click();
  await page.locator('.assist-data tr').filter({ hasText: 'Componentă eficientă (lei)' })
    .getByRole('button', { name: 'Verifică / corectează', exact: true }).click();
  check('corectarea din revizie focalizează câmpul exact fără a modifica proiectul',
    await page.locator('[data-bind="dev.Ief"]').evaluate((el) => el === document.activeElement) &&
    await page.evaluate((snapshot) => JSON.stringify(window.AppUI.getState()) === snapshot, beforeReview), '');
  await page.getByRole('group', { name: 'Mod de introducere model', exact: true })
    .getByRole('button', { name: 'Schemă', exact: true }).click();
  await page.evaluate(() => window.AppUI.store.goToStep({ tab: 'instalatie', target: 'dev.Ief' }));
  const efficiency = page.getByLabel('Cota de eficiență I_ef (lei)', { exact: true });
  check('același câmp este disponibil și în inspector, cu documentul-sursă',
    await efficiency.evaluate((el) => el === document.activeElement) &&
    /analiza de eficiență economică/i.test(await page.locator('.model-inspector').textContent()), '');
  await efficiency.fill('150000');
  check('draftul din corectare nu modifică proiectul la fiecare tastă', await page.evaluate(() =>
    window.AppUI.getState().dezvoltator.Ief === 90000), '');
  await efficiency.press('Escape');
  await efficiency.fill('150000'); await efficiency.press('Enter');
  check('înlocuirea valorii după Escape nu concatenează vechea sumă', await page.evaluate(() =>
    window.AppUI.getState().dezvoltator.Ief === 150000), '');
  await page.click('#tab-rezultate');
  check('editarea cere o nouă revizie', !await page.locator('.assist-confirm input').isChecked(), '');
  await page.getByRole('button', { name: 'Calculează compensațiile', exact: true }).click();
  await page.locator('.assist-diagnosis > summary').click();
  check('eficiență integrală: cotele zero sunt explicate fără schimbarea formulelor',
    /nu există componentă ineficientă/.test(await page.locator('.assist-diagnosis').innerText()) &&
    await page.evaluate(() => window.AppUI.store.results.rows.every((row) => row.suma === 0)), '');
  if (!await page.locator('.assist-review').evaluate((el) => el.open)) await page.locator('.assist-review > summary').click();
  await page.locator('.assist-data').evaluate((el) => { el.open = true; });
  await page.setViewportSize({ width: 320, height: 900 });
  const reviewMobile = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    table: document.querySelector('.assist-data .table-wrap').scrollWidth,
    viewport: document.querySelector('.assist-data .table-wrap').clientWidth
  }));
  check('revizia și explicațiile rămân utilizabile la 320 px',
    reviewMobile.page <= 321 && reviewMobile.table > reviewMobile.viewport, JSON.stringify(reviewMobile));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ media: 'print' });
  check('PDF nu include revizia interactivă sau îndrumările de completare', await page.evaluate(() =>
    getComputedStyle(document.querySelector('.assist-review')).display === 'none' &&
    Array.from(document.querySelectorAll('.input-note')).every((el) => getComputedStyle(el).display === 'none') &&
    Array.from(document.querySelectorAll('.assist-diagnosis button')).every((el) => getComputedStyle(el).display === 'none')), '');
  await page.emulateMedia({ media: 'screen' });

  const zeroLength = example('anexa-4-tranzitoriu.json'); zeroLength.tranzitoriu.l2 = 0;
  await loadModel(zeroLength); await page.click('#tab-rezultate');
  await page.getByRole('button', { name: 'Calculează compensațiile', exact: true }).click();
  await page.locator('.assist-diagnosis > summary').click();
  check('lungimea zero este validă și explică factorul nul al Anexei 4',
    /Lungime folosită l₂ \(m\) este zero/.test(await page.locator('.assist-diagnosis').innerText()) &&
    await page.evaluate(() => window.AppUI.store.results.C2 === 0), '');
  await page.locator('.assist-diagnosis').getByRole('button', { name: 'Verifică datele', exact: true }).click();
  check('explicația rezultatului conduce la câmpul exact fără a modifica valoarea', await page.evaluate(() =>
    document.activeElement.dataset.bind === 'tranz.l2' && window.AppUI.getState().tranzitoriu.l2 === 0), '');
  check('fără erori JS în parcursul asistat', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  console.log('Planșa cu noduri — U1 400 m, U2 +500 m, U3 intermediar');
  page = await newPage(browser, 1440, 1100);
  await page.evaluate(() => {
    const p = window.AppState.emptyProject();
    p.conditii.tarifAchitatIntegral = true;
    window.AppState.addUser(p, { id: 'u1', nume: 'U1', rol: 'prim', putere: 100 });
    window.AppState.addUser(p, { id: 'u2', nume: 'U2', rol: 'nou', putere: 100 });
    window.AppState.addUser(p, { id: 'u3', nume: 'U3', rol: 'existent', putere: 100 });
    p.linii = [{ id: 'plan', nume: 'Rețea demonstrativă', mod: 'distante', L: 0, IL: 0,
      tronsoane: [], racordari: [], zoneTehnice: [] }];
    window.AppUI.setProject(p); window.AppUI.setTab('instalatie');
  });
  const planEntry = () => page.getByRole('button', { name: 'Planșă cu noduri + tabel', exact: true });
  const enterPlan = async () => {
    await page.locator('.line-card details.line-advanced').first().evaluate((el) => { el.open = true; });
    if (await planEntry().first().getAttribute('aria-pressed') !== 'true') await planEntry().first().click();
  };
  await enterPlan();
  const plan = page.locator('.plan-editor');
  const newPortion = () => plan.locator('.plan-portions tr[data-portion="new"]');
  const portion = (id) => plan.locator('.plan-portions tr[data-portion="' + id + '"]');
  const connection = (id) => plan.locator('.plan-connections tr[data-connection="' + id + '"]');
  check('coloanele tabelului de tronsoane se aliniază cu celulele fiecărui rând',
    await page.evaluate(() => {
      const table = document.querySelector('.plan-portions');
      const headers = Array.from(table.tHead.rows[0].cells);
      const row = table.querySelector('tbody tr[data-portion="new"]');
      return headers.length === row.cells.length && headers.every((header, index) => {
        const head = header.getBoundingClientRect(), cell = row.cells[index].getBoundingClientRect();
        return Math.abs(head.left - cell.left) < 1 && Math.abs(head.width - cell.width) < 1;
      });
    }), '');
  const emptySnapshot = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await newPortion().getByLabel('Denumire porțiune').fill('Porțiune inițială');
  await newPortion().getByLabel('Lungime porțiune (m)').fill('400');
  check('datele planșei sunt drafturi, fără salvare la fiecare tastă',
    await page.evaluate((snapshot) => JSON.stringify(window.AppUI.getState()) === snapshot, emptySnapshot), '');
  await newPortion().getByLabel('Lungime porțiune (m)').press('Escape');
  check('Escape anulează draftul fără a schimba proiectul', await newPortion().getByLabel('Lungime porțiune (m)').inputValue() === '', '');
  await newPortion().getByLabel('Material uzual').selectOption('les-jt-35');
  check('presetul LES completează tipul și câmpurile de material editabile',
    await newPortion().getByLabel('Tip linie').inputValue() === 'LES' &&
    await newPortion().getByLabel('Conductor / cablu').inputValue() === 'NA2XABY' &&
    await newPortion().getByLabel('Secțiune / configurație (mm²)').inputValue() === '3x35+16', '');
  check('catalogul planșei conține presetul LES MT de 20 kV',
    /20 kV/.test(await newPortion().getByLabel('Material uzual').locator('option[value="les-mt-150"]').textContent()), '');
  await newPortion().getByLabel('Denumire porțiune').fill('Porțiune inițială');
  await newPortion().getByLabel('Tip linie').selectOption('LES');
  await newPortion().getByLabel('Lungime porțiune (m)').fill('400');
  await newPortion().getByLabel('Cost porțiune (lei)').fill('-1');
  await newPortion().getByRole('button', { name: 'Adaugă porțiunea', exact: true }).click();
  check('costul negativ este refuzat explicit, nu transformat în zero',
    await page.evaluate(() => window.AppUI.getState().linii[0].mod === 'distante') &&
    /nenegativă/.test(await page.locator('.toast').innerText()), '');
  await newPortion().getByLabel('Cost porțiune (lei)').fill('40.000');
  await newPortion().getByRole('button', { name: 'Adaugă porțiunea', exact: true }).click();
  check('prima porțiune creează PR și capăt distinct, cu cost explicit',
    await plan.locator('.plan-node').count() === 2 &&
    await page.evaluate(() => {
      const l = window.AppUI.getState().linii[0];
      return l.mod === 'ramuri' && l.L === 400 && l.IL === 40000 && l.ramuri[0].costManual &&
        l.ramuri[0].conductor === 'NA2XABY' && l.ramuri[0].sectiune === '3x35+16';
    }), '');
  const rootId = await page.evaluate(() => window.AppUI.getState().linii[0].ramuri[0].id);
  await connection('u1').getByLabel('Tronson utilizator').selectOption(rootId);
  await connection('u1').getByLabel('Distanță locală utilizator (m)').fill('400');
  await connection('u1').getByRole('button', { name: 'Salvează racordarea', exact: true }).click();
  check('coloanele tabelului de racordări separă tronsonul, distanța și acțiunea',
    await page.evaluate(() => {
      const table = document.querySelector('.plan-connections');
      const headers = Array.from(table.tHead.rows[0].cells);
      const row = table.querySelector('tbody tr[data-connection="u1"]');
      return headers.length === 6 && row.cells.length === headers.length &&
        row.cells[1].querySelector('select') && row.cells[2].querySelector('input') &&
        row.cells[5].querySelector('button') && headers.every((header, index) => {
          const head = header.getBoundingClientRect(), cell = row.cells[index].getBoundingClientRect();
          return Math.abs(head.left - cell.left) < 1 && Math.abs(head.width - cell.width) < 1;
        });
    }), '');
  await newPortion().getByLabel('Denumire porțiune').fill('Extindere');
  await newPortion().getByLabel('Nod de început').selectOption(rootId + ':400');
  await newPortion().getByLabel('Material uzual').selectOption('lea-70');
  await newPortion().getByLabel('Conductor / cablu').fill('NFA2X modificat manual');
  await newPortion().getByLabel('Secțiune / configurație (mm²)').fill('50+3x70 special');
  await newPortion().getByLabel('Lungime porțiune (m)').fill('500');
  await newPortion().getByLabel('Cost porțiune (lei)').fill('50.000');
  await newPortion().getByRole('button', { name: 'Adaugă porțiunea', exact: true }).click();
  const extensionId = await page.evaluate(() => window.AppUI.getState().linii[0].ramuri[1].id);
  await connection('u2').getByLabel('Tronson utilizator').selectOption(extensionId);
  await connection('u2').getByLabel('Distanță locală utilizator (m)').fill('500');
  await connection('u2').getByRole('button', { name: 'Salvează racordarea', exact: true }).click();
  const planIds = await page.evaluate(() => ({
    root: window.AppUI.getState().linii[0].ramuri[0].id,
    extension: window.AppUI.getState().linii[0].ramuri[1].id,
    u1: window.AppUI.getState().utilizatori[0].id,
    u2: window.AppUI.getState().utilizatori[1].id
  }));
  check('400 + 500 m: rețeaua și bugetul sunt corecte; U2 plătește 20.000 lei pe tronsonul comun',
    await page.evaluate(() => {
      const p = window.AppUI.getState(), l = p.linii[0], r = window.AppCalc.runCalculation(p);
      return l.L === 900 && l.IL === 90000 && l.ramuri[0].IL === 40000 && l.ramuri[1].IL === 50000 &&
        l.ramuri[1].deLa === 400 && l.ramuri[1].tipLinie === 'LEA' &&
        l.ramuri[1].conductor === 'NFA2X modificat manual' && l.ramuri[1].sectiune === '50+3x70 special' &&
        window.AppTree.analyze(l).routes[1].distance === 900 &&
        !r.error && r.central.totalFaraTVA === 20000;
    }), '');
  await portion(planIds.extension).getByLabel('Finanțator documentat').selectOption(planIds.u2);
  await portion(planIds.extension).getByRole('button', { name: 'Salvează rândul', exact: true }).click();
  check('finanțatorul este salvat distinct de utilizatori, fără schimbarea compensației',
    await page.evaluate((id) => {
      const p = window.AppUI.getState();
      return p.linii[0].ramuri[1].finantatorId === id && window.AppCalc.runCalculation(p).central.totalFaraTVA === 20000;
    }, planIds.u2) && /nu schimbă formula/.test(await plan.locator('.plan-financing').innerText()), '');
  const beforeLayout = await page.evaluate(() => JSON.stringify(window.AppUI.getState().linii[0].tronsoane));
  const endpoint = plan.getByRole('button', { name: 'Nod 2 · 900 m de la PR', exact: true });
  const oldTransform = await endpoint.getAttribute('transform');
  await endpoint.focus(); await page.keyboard.press('Shift+ArrowDown');
  check('mutarea din tastatură păstrează traseele și costurile',
    oldTransform !== await endpoint.getAttribute('transform') &&
    await page.evaluate((before) => JSON.stringify(window.AppUI.getState().linii[0].tronsoane) === before, beforeLayout), '');
  const beforeDrag = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  const oldLayout = await page.evaluate(() => window.AppUI.getState().linii[0].noduriPlan[0]);
  const circleBox = await endpoint.locator('circle').boundingBox();
  await page.mouse.move(circleBox.x + circleBox.width / 2, circleBox.y + circleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(circleBox.x + circleBox.width / 2 + 80, circleBox.y + circleBox.height / 2 + 60, { steps: 4 });
  check('tragerea nu salvează poziții intermediare', await page.evaluate((before) =>
    JSON.stringify(window.AppUI.getState()) === before, beforeDrag), '');
  await page.mouse.up();
  check('tragerea nodului salvează doar poziția grafică',
    await page.evaluate(({ before, old }) => {
      const p = window.AppUI.getState();
      const position = p.linii[0].noduriPlan[0];
      return position.x === old.x + 80 && position.y === old.y + 60 &&
        JSON.stringify(p.linii[0].tronsoane) === before &&
        window.AppCalc.runCalculation(p).central.totalFaraTVA === 20000;
    }, { before: beforeLayout, old: oldLayout }), '');
  const cancelSnapshot = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  const cancelCircle = await endpoint.locator('circle').boundingBox();
  await page.mouse.move(cancelCircle.x + cancelCircle.width / 2, cancelCircle.y + cancelCircle.height / 2);
  await page.mouse.down(); await page.mouse.move(cancelCircle.x + 50, cancelCircle.y + 50);
  await endpoint.dispatchEvent('pointercancel', { pointerId: 1 }); await page.mouse.up();
  check('pointercancel anulează numai aranjarea neconfirmată', await page.evaluate((before) =>
    JSON.stringify(window.AppUI.getState()) === before, cancelSnapshot), '');
  await plan.getByRole('button', { name: 'Extinde planșa', exact: true }).click();
  check('modul extins mărește planșa și păstrează tabelul de introducere',
    await page.locator('.plan-expanded').count() === 1 &&
    await page.locator('.plan-tables').count() === 1 &&
    await page.evaluate(() => document.querySelector('.plan-board').getBoundingClientRect().width > 0), '');
  await plan.getByRole('button', { name: 'Mărește', exact: true }).click();
  await plan.getByRole('button', { name: 'Micșorează', exact: true }).press('Escape');
  check('Escape închide modul extins', await page.locator('.plan-expanded').count() === 0, '');
  await connection('u3').getByLabel('Tronson utilizator').selectOption(planIds.extension);
  await connection('u3').getByLabel('Distanță locală utilizator (m)').fill('300');
  await connection('u3').getByRole('button', { name: 'Salvează racordarea', exact: true }).click();
  check('nod la 300 m pe extindere = 700 m de la PR, fără schimbarea calculului',
    await plan.getByRole('button', { name: 'Nod 2 · 700 m de la PR', exact: true }).count() === 1 &&
    await page.evaluate(() => window.AppUI.getState().linii[0].IL === 90000), '');
  check('U3 folosește 400 + 300 m, fără dublarea investiției și fără ghicirea finanțatorului',
    await page.evaluate(() => {
      const p = window.AppUI.getState(), l = p.linii[0], a = window.AppTree.analyze(l);
      return !a.errors.length && a.routes[2].distance === 700 && l.IL === 90000 && l.L === 900 &&
        l.ramuri[0].finantatorId === '' && l.tronsoane.reduce((s, t) => s + t.cost, 0) === 90000;
    }), '');
  await page.setViewportSize({ width: 320, height: 900 });
  check('planșa la 320 px: derulare conținută, fără depășirea paginii', await page.evaluate(() =>
    document.documentElement.scrollWidth <= 321 &&
    document.querySelector('.plan-scroll').scrollWidth > document.querySelector('.plan-scroll').clientWidth), '');
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.evaluate(() => window.AppUI.flushSave());
  const persistedPlan = await page.evaluate(() => {
    const p = window.AppState.migrate(JSON.parse(JSON.stringify(window.AppUI.getState())));
    window.AppCalc.deriveAll(p);
    return JSON.stringify(p);
  });
  await page.reload(); await page.waitForSelector('#app *');
  await page.click('#tab-instalatie'); await enterPlan();
  check('redeschiderea păstrează nodurile, finanțatorii și costurile', await page.evaluate((before) =>
    JSON.stringify(window.AppUI.getState()) === before, persistedPlan), '');
  await page.getByRole('button', { name: 'Formular avansat', exact: true }).click();
  check('formularul avansat rămâne disponibil', await page.locator('.tree-editor').count() === 1, '');
  await page.evaluate(() => {
    const p = window.AppState.demoU4(); window.AppUI.setProject(p); window.AppUI.setTab('instalatie');
  });
  const manualBeforePlan = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await enterPlan();
  check('proiectele cu tronsoane manuale nu sunt convertite sau suprascrise la deschiderea planșei',
    await page.evaluate((before) => JSON.stringify(window.AppUI.getState()) === before, manualBeforePlan) &&
    /Alocările manuale/.test(await plan.locator('.plan-tables [role="alert"]').innerText()) &&
    await plan.locator('form').count() === 0, '');
  await page.evaluate(() => {
    const p = window.AppState.emptyProject(); p.conditii.tarifAchitatIntegral = true;
    window.AppState.addUser(p, { id: 'prim', nume: 'U1', rol: 'prim' });
    window.AppState.addUser(p, { id: 'nou', nume: 'U2', rol: 'nou' });
    p.linii = [{ id: 'old', nume: 'Linie existentă', mod: 'distante', L: 400, IL: 40000,
      tronsoane: [], zoneTehnice: [], racordari: [{ userId: 'prim', distanta: 400 }, { userId: 'nou', distanta: 400 }] }];
    window.AppUI.setProject(p); window.AppUI.setTab('instalatie');
  });
  await enterPlan();
  const legacyPortion = portion('plan-linear');
  await legacyPortion.getByLabel('Tip linie').selectOption('LES');
  await legacyPortion.getByLabel('Finanțator documentat').selectOption('prim');
  await legacyPortion.getByRole('button', { name: 'Salvează rândul', exact: true }).click();
  const convertedRoot = await page.evaluate(() => window.AppUI.getState().linii[0].ramuri[0].id);
  check('prima salvare tabelară convertește linia, păstrând traseele și costurile automate', await page.evaluate(() => {
    const p = window.AppUI.getState(), l = p.linii[0];
    return l.IL === 40000 && l.L === 400 && !l.ramuri[0].costManual && l.ramuri[0].tipLinie === 'LES' &&
      l.ramuri[0].finantatorId === 'prim' &&
      window.AppCalc.runCalculation(p).central.totalFaraTVA === 20000;
  }), '');
  check('documentarea finanțatorului nu fixează costurile automate', await page.evaluate(() => {
    const p = window.AppUI.getState(), b = p.linii[0].ramuri[0];
    return b.finantatorId === 'prim' && !b.costManual && p.linii[0].IL === 40000 &&
      window.AppCalc.runCalculation(p).central.totalFaraTVA === 20000;
  }), '');
  await portion(convertedRoot).getByLabel('Finanțator documentat').selectOption('nou');
  await portion(convertedRoot).getByLabel('Tip linie').selectOption('LEA');
  await portion(convertedRoot).getByLabel('Lungime porțiune (m)').fill('100');
  await portion(convertedRoot).getByLabel('Lungime porțiune (m)').press('Escape');
  check('Escape restaurează inclusiv tipul și finanțatorul selectat',
    await portion(convertedRoot).getByLabel('Tip linie').inputValue() === 'LES' &&
    await portion(convertedRoot).getByLabel('Finanțator documentat').inputValue() === 'prim' &&
    await portion(convertedRoot).getByLabel('Lungime porțiune (m)').inputValue() === '400', '');
  const invalidLengthBefore = await page.evaluate(() => JSON.stringify(window.AppUI.getState()));
  await portion(convertedRoot).getByLabel('Lungime porțiune (m)').fill('100');
  await portion(convertedRoot).getByRole('button', { name: 'Salvează rândul', exact: true }).click();
  check('scurtarea sub racordări este refuzată atomic, fără costuri parțial modificate',
    await page.evaluate((before) => JSON.stringify(window.AppUI.getState()) === before, invalidLengthBefore) &&
    /Racordare în afara/.test(await page.locator('.toast').innerText()), '');
  check('fără erori JS în planșa cu noduri', page.errors.length === 0, page.errors.join('; '));
  await page.close();

  await browser.close();
  console.log(failures ? '\n' + failures + ' verificări e2e eșuate.' : '\nToate verificările e2e au trecut.');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
