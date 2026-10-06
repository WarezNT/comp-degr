/*
 * App — cadrul aplicației: antet, pași (cu stare), ghid pas cu pas, ecran de start,
 * banner pentru exemple, ferestre și API-ul public `AppUI` (folosit de teste).
 */
(function (global) {
  'use strict';

  var preact = global.preact;
  var K = global.AppKit;
  var html = K.html;
  var store = K.store;
  var C = global.AppCalc;
  var V = global.AppValidate;
  var G = global.AppGuide;
  var Views = global.AppViews;

  var TABS = [['date', '1 · Date generale'], ['utilizatori', '2 · Utilizatori'], ['instalatie', '3 · Instalație'], ['rezultate', '4 · Rezultate']];

  /* ----------------------- antet ----------------------- */

  function closeMenu(e) {
    var d = e.target.closest ? e.target.closest('details') : null;
    if (d) d.removeAttribute('open');
  }

  function Header() {
    var st = store.saveStatus;
    var txt = st === 'failed' ? '⚠ Nu s-a putut salva local — folosește „Salvează JSON”' : (st === 'pending' ? 'Se salvează…' : 'Salvat local');
    var has = !!store.state;
    return html`<header class="topbar">
      <div class="brand"><span class="logo" aria-hidden="true">CD</span>
        <div><h1>Compensații bănești — racordare în etape diferite</h1>
        <p class="sub">Metodologie ANRE 2015 · Ordinul nr. 180/2015 · instalație comună, rețele electrice de interes public</p></div></div>
      <div class="topbar-actions">
        <span id="save-status" class=${'save-status ' + st} role="status">${has ? txt : ''}</span>
        ${has ? html`<button type="button" data-action="undo" class="btn ghost" disabled=${!store.undoStack.length}
          title="Anulează ultima modificare distructivă (ștergere, import, exemplu, proiect nou)" onClick=${store.undo}>↶ Anulează</button>` : null}
        <details class="menu"><summary class="btn ghost">Proiect ▾</summary>
          <div class="menu-pop" onClick=${closeMenu}>
            <button type="button" data-action="new" class="menu-item" onClick=${store.newProject}>Proiect nou (cu ghid)</button>
            <button type="button" data-action="demo-u4" class="menu-item" onClick=${function () { store.loadDemo('u4'); }}>Exemplu U4</button>
            <button type="button" data-action="demo-u6" class="menu-item" onClick=${function () { store.loadDemo('u6'); }}>Exemplu U6</button>
            <label class="menu-item file">Import JSON<input type="file" accept=".json,application/json" data-action="import-json" hidden
              onChange=${function (e) { store.importFile(e.target); }} /></label>
            ${has ? html`<button type="button" data-action="save-json" class="menu-item" onClick=${store.saveJson}>Salvează JSON</button>` : null}
            ${has ? html`<button type="button" data-action="toggle-guide" class="menu-item" onClick=${function () { store.setGuide(!store.guide.on); }}>${store.guide.on ? 'Ascunde ghidul pas cu pas' : 'Arată ghidul pas cu pas'}</button>` : null}
          </div>
        </details>
      </div>
    </header>`;
  }

  /* ----------------------- pași (taburi) ----------------------- */

  function Tabs() {
    var p = store.state;
    var status = G.tabStatus(p, store.guideCtx(), V.validate(p));
    return html`<nav class="tabs" role="tablist" aria-label="Pașii calculului">
      ${TABS.map(function (t) {
        var on = store.tab === t[0];
        var s = status[t[0]];
        var mark = s.errors ? html`<span class="tabst err" title=${s.errors + ' probleme de corectat'}>✕ ${s.errors}</span>`
          : (s.todo ? html`<span class="tabst todo" title=${s.todo + ' pași de completat'}>${s.todo}</span>`
          : html`<span class="tabst ok" title="Completat">✓</span>`);
        return html`<button type="button" role="tab" id=${'tab-' + t[0]} aria-selected=${on} aria-controls="panel"
          data-action="tab" data-tab=${t[0]} class=${on ? 'active' : ''} onClick=${function () { store.setTab(t[0]); }}>${t[1]} ${mark}</button>`;
      })}
    </nav>`;
  }

  function StepNav() {
    var i = TABS.map(function (t) { return t[0]; }).indexOf(store.tab);
    var prev = TABS[i - 1], next = TABS[i + 1];
    return html`<div class="stepnav">
      ${prev ? html`<button type="button" class="btn ghost" onClick=${function () { store.setTab(prev[0]); }}>← ${prev[1]}</button>` : html`<span></span>`}
      ${next ? html`<button type="button" class="btn" onClick=${function () { store.setTab(next[0]); }}>${next[1]} →</button>` : null}
    </div>`;
  }

  /* ----------------------- ghid pas cu pas ----------------------- */

  function GuideBar() {
    var p = store.state;
    if (p.meta.exemplu) return null;
    if (!store.guide.on) {
      return html`<div class="guidebar mini"><button type="button" class="btn tiny" onClick=${function () { store.setGuide(true); }}>▶ Pornește ghidul pas cu pas</button></div>`;
    }
    var n = store.guideNext();
    var steps = store.guideSteps();
    var done = steps.filter(function (s) { return s.done; }).length;
    var pct = steps.length ? Math.round(done / steps.length * 100) : 0;
    if (!n) {
      return html`<div class="guidebar done" role="status"><div class="gb-main">
        <strong>✓ Toate datele sunt completate.</strong> <span class="muted">Verifică rezultatul, exportă CSV sau printează.</span></div>
        <div class="gb-actions"><button type="button" class="btn tiny ghost" onClick=${function () { store.setGuide(false); }}>Ascunde ghidul ✕</button></div></div>`;
    }
    var s = n.step;
    return html`<div class="guidebar" role="region" aria-label="Ghid pas cu pas">
      <div class="gb-progress" aria-hidden="true"><span style=${{ width: pct + '%' }}></span></div>
      <div class="gb-main">
        <div class="gb-step">Pasul ${done + 1} · ${done} din ${steps.length} completate</div>
        <div class="gb-label"><strong>${s.label}</strong> <${K.RefChip} id=${s.rule} /></div>
        ${s.hint ? html`<div class="gb-hint">${s.hint}</div>` : null}
      </div>
      <div class="gb-actions">
        <button type="button" class="btn tiny primary" onClick=${function () { store.goToStep(s); }}>Mergi la câmp ▸</button>
        ${s.confirm ? html`<button type="button" class="btn tiny" onClick=${function () { store.confirmStep(s); }}>${s.confirm.label}</button>` : null}
        ${s.optional ? html`<button type="button" class="btn tiny ghost" onClick=${function () { store.skipStep(s.id); }}>Sari</button>` : null}
        <label class="chk gb-auto"><input type="checkbox" checked=${store.guide.auto} onChange=${function (e) { store.setAuto(e.target.checked); }} /> Mută-mă automat</label>
        <button type="button" class="btn tiny ghost" onClick=${function () { store.setGuide(false); }} aria-label="Ascunde ghidul">✕</button>
      </div>
    </div>`;
  }

  /* ----------------------- ecran de start și bannere ----------------------- */

  function StartScreen() {
    return html`<main class="content start"><section class="panel start-card">
      <h2>Bun venit</h2>
      <p>Calculezi compensațiile bănești dintre utilizatorii racordați în etape diferite, prin instalație comună (Metodologia ANRE, Ord. 180/2015). Aplicația te <strong>ghidează pas cu pas</strong>: îți arată ce câmp completezi și te duce la următorul.</p>
      <div class="start-actions">
        <button type="button" class="btn primary big" data-action="new" onClick=${store.newProject}>Proiect nou — cu ghid pas cu pas</button>
        <button type="button" class="btn big" data-action="demo-u4" onClick=${function () { store.loadDemo('u4'); }}>Vezi un exemplu (U4)</button>
        <label class="btn ghost big file">Importă un proiect (JSON)<input type="file" accept=".json,application/json" data-action="import-json" hidden onChange=${function (e) { store.importFile(e.target); }} /></label>
      </div>
      <ol class="start-steps">
        <li><strong>Date generale</strong> — tipul de instalație și operatorul.</li>
        <li><strong>Utilizatori</strong> — cine a finanțat instalația și cine se racordează acum.</li>
        <li><strong>Instalație</strong> — linia sau stația și cine o folosește.</li>
        <li><strong>Rezultate</strong> — condițiile legale, centralizatorul și explicația fiecărei sume.</li>
      </ol>
      <p class="hint">Datele rămân local, în browserul tău.</p>
    </section></main>`;
  }

  function DemoBanner() {
    if (!store.state.meta.exemplu) return null;
    return html`<div class="demo-banner" role="note"><span><strong>Exemplu demonstrativ.</strong> Poți explora liber; modificările se salvează în acest proiect.</span>
      <span class="demo-actions"><button type="button" class="btn tiny" onClick=${store.newProject}>Pornește un proiect nou</button>
      <button type="button" class="btn tiny ghost" onClick=${store.keepAsOwn}>Păstrează ca proiect propriu</button></span></div>`;
  }

  /* ----------------------- aplicația ----------------------- */

  function App() {
    var p = store.state;
    if (!p) {
      return html`<${preact.Fragment}><${Header} /><${StartScreen} /><${K.Toast} /><${K.NormaModal} /><//>`;
    }
    var panel;
    if (store.tab === 'date') panel = html`<${Views.GeneralView} />`;
    else if (store.tab === 'utilizatori') panel = html`<${Views.UsersView} />`;
    else if (store.tab === 'instalatie') panel = html`<${Views.InstallView} />`;
    else panel = html`<${Views.ResultsView} />`;
    return html`<${preact.Fragment}>
      <${Header} /><${Tabs} /><${DemoBanner} />
      <main class="content" id="panel" role="tabpanel" aria-labelledby=${'tab-' + store.tab}>${panel}<${StepNav} /></main>
      <${GuideBar} />
      <${K.Toast} /><${K.NormaModal} />
    <//>`;
  }

  /* ----------------------- randare + API ----------------------- */

  var root = null;
  var rendering = false;

  // Evidențiază câmpul indicat de ghid (atribut data-guide-active, necontrolat de Preact).
  function markGuideTarget() {
    var old = document.querySelectorAll('[data-guide-active]');
    for (var i = 0; i < old.length; i++) old[i].removeAttribute('data-guide-active');
    if (!store.state || !store.guideActive()) return;
    var n = store.guideNext();
    if (!n || store.tab !== n.step.tab) return;
    var el = store.findTarget(n.step.target);
    if (el) el.setAttribute('data-guide-active', '1');
  }

  function rerender() {
    if (!root || rendering) return;
    rendering = true;
    try { preact.render(html`<${App} />`, root); } finally { rendering = false; }
    markGuideTarget();
  }

  function init() {
    root = document.getElementById('app');
    store.render = rerender;
    store.wide = !!(global.matchMedia && global.matchMedia('(min-width: 1000px)').matches);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && store.norma) store.closeNorma(); });
    // Nu pierdem ultima tastare dacă pagina se închide în fereastra de debounce.
    global.addEventListener('pagehide', function () { if (store.hasPendingSave()) store.flushSave(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && store.hasPendingSave()) store.flushSave();
    });
    rerender();
    return store.init();
  }

  global.AppUI = {
    init: init,
    render: rerender,
    ready: function () { return store.ready; },
    store: store,
    setProject: function (p) { store.setProject(p); },
    getState: function () { return store.state; },
    buildConfig: function (model, single) { return C.buildConfig(store.state, model, single); },
    setTab: function (t) { store.setTab(t); },
    calculate: function () { return store.calculate(); },
    flushSave: function () { return store.flushSave(); },
    undo: function () { store.undo(); },
    undoDepth: function () { return store.undoStack.length; },
    validate: function () { return V.validate(store.state); },
    csv: function () { return store.csv(); }
  };

  document.addEventListener('DOMContentLoaded', init);
})(typeof window !== 'undefined' ? window : this);
