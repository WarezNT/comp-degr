/*
 * UI — interfața aplicației: formulare, tabele, calcul și export.
 * Vanilla JS, fără build tooling.
 */
(function (global) {
  'use strict';

  var E = global.CompEngine;
  var S = global.AppState;
  var V = global.AppValidate;

  var state = null;
  var activeTab = 'date';
  var results = null;
  var initPromise = Promise.resolve(null);
  var eventsBound = false;

  var undoStack = [];          // instantanee JSON ale proiectului (max 20)
  var UNDO_MAX = 20;
  var saveTimer = null;
  var saveStatus = 'ok';       // 'ok' | 'pending' | 'failed'

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // Aceeași rotunjire ca în motor (E.r2), ca să nu apară diferențe de 1 ban.
  function money(x) {
    return E.r2(x).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Număr cu 2 zecimale, virgulă zecimală, fără separator de mii (CSV pentru Excel RO).
  function csvNum(x) {
    return E.r2(x).toFixed(2).replace('.', ',');
  }

  /* ----------------------- notificări, undo, salvare ----------------------- */
  var toastTimer = null;
  function toast(msg, kind) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show ' + (kind || 'info');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 6000);
  }

  function pushUndo() {
    try {
      undoStack.push(JSON.stringify(state));
      if (undoStack.length > UNDO_MAX) undoStack.shift();
    } catch (e) { /* proiect nesalvabil — fără undo */ }
    updateUndoButton();
  }

  function undo() {
    if (!undoStack.length) return;
    try {
      state = S.migrate(JSON.parse(undoStack.pop()));
    } catch (e) { toast('Nu s-a putut reveni la starea anterioară.', 'error'); updateUndoButton(); return; }
    deriveAll();
    recompute();
    saveNow();
    render();
    toast('Ultima modificare a fost anulată.', 'info');
  }

  function updateUndoButton() {
    var b = document.querySelector('[data-action="undo"]');
    if (b) b.disabled = !undoStack.length;
  }

  function saveStatusHtml() {
    if (saveStatus === 'failed') return '⚠ Nu s-a putut salva local — folosește „Salvează JSON”';
    if (saveStatus === 'pending') return 'Se salvează…';
    return 'Salvat local';
  }

  function updateSaveStatus() {
    var el = document.getElementById('save-status');
    if (!el) return;
    el.textContent = saveStatusHtml();
    el.className = 'save-status ' + saveStatus;
  }

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!state) return Promise.resolve(true);
    return S.save(state).then(function (ok) {
      saveStatus = ok ? 'ok' : 'failed';
      updateSaveStatus();
      return ok;
    });
  }

  // Salvare imediată (acțiuni discrete) / amânată (tastare).
  function saveNow() {
    saveStatus = 'pending';
    updateSaveStatus();
    return flushSave();
  }
  function saveSoon() {
    saveStatus = 'pending';
    updateSaveStatus();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }

  // Rezultatele afișate trebuie să reflecte mereu datele curente: dacă
  // există un calcul făcut, îl refacem la orice modificare.
  function recompute() {
    if (results) runCalculation();
  }

  function nameOf(id) {
    var u = S.findUser(state, id);
    return u ? (u.nume || u.codPA || id) : id;
  }

  /* ----------------------- data binding ----------------------- */
  function setBind(path, value) {
    var seg = path.split('.');
    if (seg[0] === 'meta') state.meta[seg[1]] = value;
    else if (seg[0] === 'tranz') state.tranzitoriu[seg[1]] = value;
    else if (seg[0] === 'dev') state.dezvoltator[seg[1]] = value;
    else if (seg[0] === 'cond') state.conditii[seg[1]] = value;
    else if (seg[0] === 'complex') state.complexConfig[seg[1]] = value;
    else if (seg[0] === 'user') { var u = S.findUser(state, seg[1]); if (u) u[seg[2]] = value; }
    else if (seg[0] === 'line') {
      var l = byId(state.linii, seg[1]);
      if (l) {
        l[seg[2]] = value;
        if (seg[2] === 'bL') {
          // Golirea câmpului revine la calculul automat din I_L / L.
          if (value === '' || value === null) {
            l.bLManual = false;
            l.bL = lineBl(l);
          } else {
            l.bLManual = true;
          }
        }
        // b_L se derivă automat din I_L / L dacă utilizatorul nu l-a fixat manual.
        if ((seg[2] === 'IL' || seg[2] === 'L') && !l.bLManual) {
          l.bL = lineBl(l);
        }
      }
    }
    else if (seg[0] === 'stat') { var st = byId(state.statii, seg[1]); if (st) st[seg[2]] = value; }
    else if (seg[0] === 'tronson') {
      var ln = byId(state.linii, seg[1]);
      if (ln) { var t = byId(ln.tronsoane, seg[2]); if (t) t[seg[3]] = value; }
    }
    else if (seg[0] === 'devitem') {
      var d = byId(state.dezvoltator.dezvoltatori, seg[1]);
      if (d) d[seg[2]] = value;
    }
  }

  function byId(arr, id) {
    for (var i = 0; i < (arr || []).length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function mergeCfg(a, b) {
    var o = {};
    Object.keys(a).forEach(function (k) { o[k] = a[k]; });
    Object.keys(b).forEach(function (k) { o[k] = b[k]; });
    return o;
  }

  function stationCfg(s, puteri, primId, nouCfg) {
    return mergeCfg({
      Sn: s.Sn, SnRezerva: s.SnRezerva || 0, IT: s.IT, elementeComune: s.elementeComune,
      intarire: !!s.intarire,
      utilizatori: orderByIds(s.utilizatori), puteri: puteri, primId: primId
    }, nouCfg);
  }

  // Primul utilizator (finanțatorul / receptorul compensațiilor). Un singur
  // utilizator poate avea acest rol; dacă sunt mai mulți bifați, îl luăm pe primul.
  function getPrimId() { return S.primId(state); }

  // Noii utilizatori (cei care plătesc). Pot fi mai mulți (racordați simultan).
  function getNewIds() { return S.newIds(state); }

  function setNewIds(ids) {
    state.meta.nouUtilizatoriIds = ids.slice();
    state.meta.noulUtilizatorId = ids.length ? ids[0] : '';
  }

  // Există conflict dacă un utilizator nou este și prim utilizator.

  // Derivează b_L = I_L / L pentru liniile unde nu a fost fixat manual
  // și costul tronsoanelor în modul automat.
  function deriveAll() {
    (state.linii || []).forEach(function (l) {
      if (!l.bLManual) l.bL = lineBl(l);
      (l.tronsoane || []).forEach(function (t) {
        if (!t.costManual) t.cost = tronsonCost(l, t);
      });
    });
  }

  // Sursa unică pentru costurile liniei: b_L = I_L / L (dacă nu e fixat
  // manual) și costul tronsonului = lungime × b_L (dacă nu e fixat manual).
  function lineBl(l) {
    if (l.bLManual) return Number(l.bL) || 0;
    var L = Number(l.L) || 0;
    return L > 0 ? (Number(l.IL) || 0) / L : 0;
  }

  function tronsonCost(l, t) {
    if (t.costManual && t.cost !== '' && t.cost !== undefined && t.cost !== null) return Number(t.cost) || 0;
    return (Number(t.lungime) || 0) * lineBl(l);
  }

  /* ----------------------- helpers ----------------------- */
  function orderByIds(ids) {
    // Păstrează ordinea explicită din listă (ordinea racordării).
    return (ids || []).slice();
  }

  function lineTronsoane(cfgLines) {
    var out = [];
    (cfgLines || []).forEach(function (l) {
      (l.tronsoane || []).forEach(function (t) {
        out.push({
          id: t.id,
          tip: t.tip,
          nume: (l.nume ? l.nume + ' · ' : '') + (t.nume || ''),
          lungime: t.lungime,
          cost: tronsonCost(l, t),
          utilizatori: orderByIds(t.utilizatori)
        });
      });
    });
    return out;
  }

  function buildConfig(model, singleNou) {
    var puteri = {};
    state.utilizatori.forEach(function (u) { puteri[u.id] = Number(u.putere) || 0; });
    var primId = getPrimId();
    // Dacă singleNou e dat, configurăm doar acel utilizator nou (scenariu
    // individual); altfel toți noii utilizatori selectați.
    var nouList = singleNou ? [singleNou] : getNewIds();
    var nouCfg = { nouUtilizatori: nouList, nouUtilizator: nouList.length === 1 ? nouList[0] : null };

    if (model === 'line') {
      var lcfg = { bL: 0, tronsoane: lineTronsoane(state.linii), primId: primId };
      return mergeCfg(lcfg, nouCfg);
    }
    if (model === 'station') {
      // Toate stațiile configurate; motorul le însumează.
      return {
        statii: state.statii.map(function (s) { return stationCfg(s, puteri, primId, nouCfg); }),
        puteri: puteri, primId: primId,
        nouUtilizatori: nouList, nouUtilizator: nouCfg.nouUtilizator
      };
    }
    if (model === 'complex') {
      var sel = state.complexConfig;
      var liniiU1 = state.linii.filter(function (l) { return sel.liniiIds.indexOf(l.id) >= 0; });
      var liniiU2 = state.linii.filter(function (l) { return sel.liniiU2Ids.indexOf(l.id) >= 0; });
      var st = state.statii.filter(function (s) { return sel.statiiIds.indexOf(s.id) >= 0; });
      return {
        varianta: Number(sel.varianta) || 1,
        liniiU1: liniiU1.map(function (l) {
          return mergeCfg({ bL: lineBl(l), tronsoane: lineTronsoane([l]), primId: primId }, nouCfg);
        }),
        liniiU2: liniiU2.map(function (l) {
          return mergeCfg({ bL: lineBl(l), tronsoane: lineTronsoane([l]), primId: primId }, nouCfg);
        }),
        statii: st.map(function (s) { return stationCfg(s, puteri, primId, nouCfg); }),
        puteri: puteri,
        nouUtilizatori: nouList,
        nouUtilizator: nouCfg.nouUtilizator
      };
    }
    if (model === 'transitional') {
      return {
        B: state.tranzitoriu.B, S: state.tranzitoriu.S, S2: state.tranzitoriu.S2,
        l2: state.tranzitoriu.l2, L: state.tranzitoriu.L
      };
    }
    if (model === 'developer') {
      return { Itotal: state.dezvoltator.Itotal, Ief: state.dezvoltator.Ief, dezvoltatori: state.dezvoltator.dezvoltatori };
    }
    return {};
  }

  // Anii de la punerea în funcțiune: derivați din data PIF dacă e completată,
  // altfel valoarea introdusă manual.
  function effectiveYears() {
    var c = state.conditii;
    if (c.dataPIF && state.meta.dataCalcul) {
      var a = new Date(c.dataPIF), b = new Date(state.meta.dataCalcul);
      if (!isNaN(a) && !isNaN(b)) {
        return Math.max(0, Math.round(((b - a) / 86400000 / 365.25) * 100) / 100);
      }
    }
    return Number(c.aniDeLaPF) || 0;
  }

  var CHECK_MODELS = ['line', 'station', 'complex'];

  // Beneficiarii compensațiilor (cei care primesc): din plățile calculate;
  // dacă nu se poate calcula încă, toți utilizatorii care nu sunt noi.
  function receiverIds() {
    var ids = {};
    var model = state.meta.model;
    if (CHECK_MODELS.indexOf(model) >= 0 && !V.validate(state).errors.length) {
      try {
        var r = E.compute(model, buildConfig(model));
        Object.keys(r.payments || {}).forEach(function (payer) {
          Object.keys(r.payments[payer]).forEach(function (rec) { ids[rec] = true; });
        });
      } catch (e) { /* se folosește lista de rezervă */ }
    }
    var list = Object.keys(ids);
    if (!list.length) {
      var nou = getNewIds();
      list = state.utilizatori.map(function (u) { return u.id; }).filter(function (id) { return nou.indexOf(id) < 0; });
    }
    return list;
  }

  // Art. 7 alin. (1): fiecare beneficiar trebuie să fi achitat integral tariful.
  // Se verifică din „Data achitare TR” (completată și nu ulterioară datei
  // întocmirii); bifa din Rezultate confirmă manual când data lipsește.
  function tariffStatus() {
    var dc = state.meta.dataCalcul;
    var missing = receiverIds().filter(function (id) {
      var u = S.findUser(state, id);
      return u && (!u.dataTR || (dc && u.dataTR > dc));
    });
    return {
      missing: missing.map(nameOf),
      ok: !missing.length || !!state.conditii.tarifAchitatIntegral
    };
  }

  function currentConditions() {
    var c = {};
    Object.keys(state.conditii).forEach(function (k) { c[k] = state.conditii[k]; });
    c.aniDeLaPF = effectiveYears();
    var prim = S.findUser(state, getPrimId());
    c.clientCasnic = !!(prim && prim.tipClient === 'casnic');   // art. 8 alin. 2: prag 10 ani
    c.tarifAchitatIntegral = tariffStatus().ok;
    return c;
  }

  // Condițiile care se aplică modelului ales: art. 8 (+ art. 7) pentru Anexele
  // 1–3; pentru Anexa 5, termenul de 5 ani (pct. 1); nimic pentru Anexa 4.
  function conditionsFor() {
    var model = state.meta.model;
    if (CHECK_MODELS.indexOf(model) >= 0) return E.checkConditions(currentConditions());
    if (model === 'developer') {
      var ani = effectiveYears();
      return [{ ok: ani <= 5, mesaj: 'Anexa 5 pct. 1: contractul de finanțare/racordare se încheie în cel mult 5 ani de la punerea în funcțiune a rețelei finanțate de primul dezvoltator (în caz: ' + ani + ' ani).' }];
    }
    return [];
  }

  function runCalculation() {
    var check = V.validate(state);
    if (check.errors.length) {
      results = { error: check.errors.join(' '), errors: check.errors, warnings: check.warnings };
      return;
    }
    var model = state.meta.model;
    var nouList = getNewIds();
    var res = E.compute(model, buildConfig(model));
    if (!res.nouUtilizatori) res.nouUtilizatori = nouList;
    results = res;

    var conds = conditionsFor();
    var failed = conds.filter(function (x) { return !x.ok; });
    if (failed.length && !state.conditii.calcInformativ) {
      // Art. 8 alin. 1: compensația se calculează și se plătește NUMAI dacă
      // sunt îndeplinite cumulativ condițiile.
      results = {
        error: 'Compensația se calculează și se plătește numai dacă sunt îndeplinite cumulativ condițiile (art. 8 alin. 1). Neîndeplinite: ' +
          failed.map(function (x) { return x.mesaj; }).join(' | ') +
          (tariffStatus().ok ? '' : ' Beneficiari fără „Data achitare TR”: ' + tariffStatus().missing.join(', ') + '.') +
          ' — Dacă vrei totuși o valoare orientativă, bifează „Calculează oricum (informativ)” în lista de condiții.',
        blocked: true, conditions: conds, warnings: check.warnings
      };
      return;
    }

    var central = null;
    if (res.model === 'line' || res.model === 'station' || res.model === 'complex') {
      central = E.centralizator(res.payments, nouList, state.utilizatori, state.meta.tva, state.meta.withTva);
      res.totals = E.totals(res.payments, state.utilizatori);
    }
    results.central = central;
    results.conditions = conds;
    results.warnings = check.warnings;
  }

  /* ----------------------- rendering ----------------------- */
  // Selector care identifică elementul focusat după atributele data-*,
  // ca să-l putem reface după re-randare.
  function focusSelector(el) {
    if (!el || !el.dataset || el === document.body) return null;
    var keys = Object.keys(el.dataset);
    if (!keys.length) return null;
    return el.tagName.toLowerCase() + keys.map(function (k) {
      return '[data-' + k.replace(/[A-Z]/g, function (m) { return '-' + m.toLowerCase(); }) +
        '="' + String(el.dataset[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"]';
    }).join('');
  }

  function render() {
    var app = document.getElementById('app');
    var sel = focusSelector(document.activeElement);
    var scrollY = global.scrollY;
    app.innerHTML =
      renderHeader() +
      renderTabs() +
      '<main class="content" id="panel" role="tabpanel" aria-labelledby="tab-' + activeTab + '">' + renderTab() + '</main>';
    if (sel) {
      try {
        var again = app.querySelector(sel);
        if (again) again.focus({ preventScroll: true });
      } catch (e) { /* selector invalid — se renunță la refocalizare */ }
    }
    global.scrollTo(0, scrollY);
    updateUndoButton();
    updateSaveStatus();
  }

  function renderHeader() {
    return '' +
      '<header class="topbar">' +
      '<div class="brand"><span class="logo" aria-hidden="true">CD</span>' +
      '<div><h1>Compensații bănești — racordare în etape diferite</h1>' +
      '<p class="sub">Metodologie ANRE 2015 · Ordinul nr. 180/2015 · instalație comună, rețele electrice de interes public</p></div></div>' +
      '<div class="topbar-actions">' +
      '<span id="save-status" class="save-status ok" role="status">Salvat local</span>' +
      '<button data-action="undo" class="btn ghost" title="Anulează ultima modificare distructivă (ștergere, import, demo, proiect nou)" disabled>↶ Anulează</button>' +
      '<button data-action="demo-u4" class="btn ghost" title="Încarcă scenariul U4 din modelul xlsx">Demo U4</button>' +
      '<button data-action="demo-u6" class="btn ghost" title="Încarcă scenariul U6 din modelul xlsx">Demo U6</button>' +
      '<button data-action="new" class="btn ghost">Proiect nou</button>' +
      '<button data-action="save-json" class="btn">Salvează JSON</button>' +
      '<label class="btn ghost file">Import JSON<input type="file" accept=".json,application/json" data-action="import-json" hidden></label>' +
      '</div></header>';
  }

  function renderTabs() {
    var tabs = [
      ['date', '1 · Date generale'],
      ['utilizatori', '2 · Utilizatori'],
      ['instalatie', '3 · Instalație'],
      ['rezultate', '4 · Rezultate']
    ];
    return '<nav class="tabs" role="tablist" aria-label="Pașii calculului">' + tabs.map(function (t) {
      var on = activeTab === t[0];
      return '<button role="tab" id="tab-' + t[0] + '" aria-selected="' + on + '" aria-controls="panel" data-action="tab" data-tab="' + t[0] + '" class="' + (on ? 'active' : '') + '">' + t[1] + '</button>';
    }).join('') + '</nav>';
  }

  function renderTab() {
    if (activeTab === 'date') return renderDate();
    if (activeTab === 'utilizatori') return renderUsers();
    if (activeTab === 'instalatie') return renderInstallation();
    if (activeTab === 'rezultate') return renderResults();
    return '';
  }

  /* ---------- text ajutător (coloana din dreapta) ---------- */
  function helperPanel(block) {
    if (!block) return '';
    var items = (block.items || []).map(function (it) {
      return '<li><span class="h-field">' + esc(it.field) + '</span>' +
        '<span class="h-desc">' + it.desc + '</span></li>';
    }).join('');
    return '<aside class="helper">' +
      '<div class="helper-head"><span class="helper-ico">?</span><strong>' + esc(block.title || 'Ce completezi aici') + '</strong></div>' +
      (block.intro ? '<p class="helper-intro">' + block.intro + '</p>' : '') +
      (items ? '<ul class="helper-list">' + items + '</ul>' : '') +
      (block.note ? '<p class="helper-note">' + block.note + '</p>' : '') +
      (block.refs ? '<p class="helper-refs">' + block.refs + '</p>' : '') +
      '</aside>';
  }

  /* ---------- tab: date generale ---------- */
  function renderDate() {
    var m = state.meta;
    var models = [
      ['line', 'Anexa 1 — linie electrică / elemente comune'],
      ['station', 'Anexa 2 — stație electrică / post de transformare'],
      ['complex', 'Anexa 3 — instalație de racordare complexă'],
      ['transitional', 'Anexa 4 — prevederi tranzitorii'],
      ['developer', 'Anexa 5 — rețea publică finanțată de un dezvoltator']
    ];
    return section('Date generale',
      field('Operator de rețea', text('meta.operator', m.operator)) +
      field('Cod operator', text('meta.codOperator', m.codOperator)) +
      field('Data întocmirii', '<input type="date" data-bind="meta.dataCalcul" value="' + esc(m.dataCalcul) + '">') +
      field('Cotă TVA (%)', '<input type="number" step="0.01" min="0" max="100" data-bind="meta.tva" value="' + esc(m.tva) + '">') +
      field('Aplică TVA în centralizator', checkbox('meta.withTva', m.withTva)) +
      field('Model de calcul', '<select data-bind="meta.model">' + models.map(function (o) {
        return '<option value="' + o[0] + '"' + (m.model === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>') +
      field('Noii utilizatori (cei care plătesc compensația)', newUsersPicker()),
      helperDate()
    );
  }

  function newUsersPicker() {
    if (!state.utilizatori.length) {
      return '<p class="muted">Nu există utilizatori. Adaugă mai întâi utilizatori în tabul „2 · Utilizatori”.</p>';
    }
    var prim = getPrimId();
    var sel = getNewIds();
    return '<div class="list-chk">' + state.utilizatori.map(function (u) {
      var isPrim = u.id === prim;
      var checked = sel.indexOf(u.id) >= 0;
      var nume = u.nume || u.codPA || u.id;
      var pa = (u.codPA && u.nume) ? ' <span class="muted">(PA: ' + esc(u.codPA) + ')</span>' : '';
      var label = esc(nume) + pa +
        (isPrim ? ' <span class="muted">(prim utilizator — receptor)</span>' : '');
      return '<label class="chk' + (isPrim ? ' disabled' : '') + '">' +
        '<input type="checkbox" data-action="new-user" data-id="' + esc(u.id) + '"' +
        (checked ? ' checked' : '') + (isPrim ? ' disabled' : '') + '> ' + label + '</label>';
    }).join('') + '</div>' +
    (sel.length > 1 ? '<p class="hint">Fiecare utilizator nou plătește pe tronsonul/stația pe care este adăugat. Se pot selecta mai mulți: se racordează <strong>pe rând</strong> (Anexa 1), în ordinea Datei ATR (dacă lipsește, ordinea din listă); cel racordat mai târziu plătește și celor racordați înaintea lui.</p>' : '');
  }

  function helperDate() {
    return {
      title: 'Ce completezi în acest pas',
      intro: 'Alegi tipul de instalație și care utilizatori sunt <strong>noi</strong> (se racordează acum și plătesc compensația). Pot fi mai mulți, pe tronsoane/stații diferite.',
      items: [
        { field: 'Operator de rețea / Cod operator', desc: 'Datele operatorului care întocmește calculul (apar pe centralizator).' },
        { field: 'Data întocmirii', desc: 'Data la care se emite avizul/cuantumul compensației.' },
        { field: 'Cotă TVA', desc: 'Procentul de TVA folosit în centralizator (ex. 19). Valoarea cotei poate fi pusă 0 dacă lucrezi fără TVA.' },
        { field: 'Aplică TVA în centralizator', desc: 'Bifează pentru a adăuga coloana „cu TVA”. Dacă debifezi, se afișează doar valorile fără TVA.' },
        { field: 'Model de calcul', desc: 'Anexa aplicabilă: linie electrică (Anexa 1), stație/PT (Anexa 2), instalație complexă (Anexa 3), tranzitoriu (Anexa 4) sau rețea dezvoltator (Anexa 5).' },
        { field: 'Noii utilizatori', desc: 'Bifează unul sau mai mulți utilizatori care se racordează acum și plătesc compensația. Fiecare plătește pe tronsonul/stația unde este adăugat. Primul utilizator (receptorul) nu poate fi și utilizator nou.' }
      ],
      note: 'Sfat: dacă nu ai încă utilizatori, mergi la pasul 2 „Utilizatori” și adaugă-i.',
      refs: 'Ref.: art. 6 și art. 12–16 din Metodologie.'
    };
  }

  /* ---------- tab: utilizatori ---------- */
  function renderUsers() {
    var rows = state.utilizatori.map(function (u) {
      return '<tr>' +
        '<td>' + text('user.' + esc(u.id) + '.codPA', u.codPA, 'Cod PA') + '</td>' +
        '<td>' + text('user.' + esc(u.id) + '.nume', u.nume, 'Nume / denumire') + '</td>' +
        '<td>' + number('user.' + esc(u.id) + '.putere', u.putere, 'Putere aprobată (kVA)') + '</td>' +
        '<td><input type="date" aria-label="Data ATR" data-bind="user.' + esc(u.id) + '.dataATR" value="' + esc(u.dataATR) + '"></td>' +
        '<td><input type="date" aria-label="Data achitare TR" data-bind="user.' + esc(u.id) + '.dataTR" value="' + esc(u.dataTR) + '"></td>' +
        '<td><select aria-label="Tip client" data-bind="user.' + esc(u.id) + '.tipClient">' +
          opts([['noncasnic', 'Non-casnic'], ['casnic', 'Casnic']], u.tipClient) + '</select></td>' +
        '<td class="center">' + checkbox('user.' + esc(u.id) + '.prim', u.prim, 'Prim utilizator') + '</td>' +
        '<td><button class="btn tiny danger" data-action="del-user" data-id="' + esc(u.id) + '" aria-label="Șterge utilizatorul ' + esc(u.nume || u.codPA || '') + '">Șterge</button></td>' +
        '</tr>';
    }).join('');

    return section('Utilizatori',
      '<div class="toolbar"><button class="btn" data-action="add-user">+ Adaugă utilizator</button>' +
      '<span class="hint">Ordinea racordării pe fiecare element se stabilește în tabul „Instalație”.</span></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
      '<th>Cod PA</th><th>Nume / denumire</th><th>Putere aprobată (kVA)</th><th>Data ATR</th><th>Data achitare TR</th><th>Tip client</th><th class="center">Prim utilizator</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="empty">Niciun utilizator. Adaugă cel puțin unul.</td></tr>') + '</tbody></table></div>',
      helperUsers()
    );
  }

  function helperUsers() {
    return {
      title: 'Ce completezi în acest pas',
      intro: 'Adaugi toți utilizatorii implicați (cei racordați anterior și cel nou). Ordinea cronologică a racordării se stabilește la pasul 3.',
      items: [
        { field: 'Cod PA', desc: 'Codul de punct de racordare / identificatorul utilizatorului (ex. 1000000004).' },
        { field: 'Nume / denumire', desc: 'Numele persoanei sau denumirea firmei. Apare în centralizator.' },
        { field: 'Putere aprobată (kVA)', desc: 'Puterea aprobată prin avizul tehnic. Se folosește la stații/PT (Anexa 2) și la rețeaua de dezvoltator (Anexa 5).' },
        { field: 'Data ATR', desc: 'Data emiterii avizului tehnic de racordare. Nu intră în verificarea termenului de 5/10 ani (acela se măsoară de la punerea în funcțiune, pasul 4); se folosește doar pentru <strong>ordinea racordării</strong> a utilizatorilor noi (calcul secvențial, Anexa 1).' },
        { field: 'Data achitare TR', desc: 'Data la care a fost achitat integral tariful de racordare. <strong>Obligatorie pentru beneficiarii compensației</strong> (art. 7 alin. 1): fără ea, condiția nu e îndeplinită decât prin confirmare manuală la pasul 4.' },
        { field: 'Tip client', desc: 'Casnic sau non-casnic. Contează tipul <strong>primului utilizator</strong>: dacă e casnic, termenul din art. 8 se extinde automat la 10 ani (art. 8 alin. 2).' },
        { field: 'Prim utilizator', desc: 'Bifează utilizatorul care a finanțat inițial instalația (cel care primește compensații la stații/PT).' }
      ],
      note: 'Nu uita să selectezi utilizatorii noi la pasul 1. Dacă sunt mai mulți, ordinea racordării se ia după Data ATR.',
      refs: 'Ref.: art. 3 (definiții), art. 8 din Metodologie.'
    };
  }

  /* ---------- tab: instalatie ---------- */
  function renderInstallation() {
    var model = state.meta.model;
    if (model === 'line') return renderLines();
    if (model === 'station') return renderStations();
    if (model === 'complex') return renderComplex();
    if (model === 'transitional') return renderTransitional();
    if (model === 'developer') return renderDeveloper();
    return '';
  }

  function renderLines() {
    var body = state.linii.map(function (l) {
      var bL = lineBl(l);
      return '<div class="card">' +
        '<div class="card-head">' +
          '<input class="line-title" data-bind="line.' + esc(l.id) + '.nume" value="' + esc(l.nume) + '" placeholder="Denumire linie" aria-label="Denumire linie">' +
          '<button class="btn tiny danger" data-action="del-line" data-id="' + esc(l.id) + '">Șterge linia</button>' +
        '</div>' +
        '<div class="row3">' +
          field('① Cost lucrări linie I_L (lei)', number('line.' + esc(l.id) + '.IL', l.IL)) +
          field('② Lungime totală L (m)', number('line.' + esc(l.id) + '.L', l.L)) +
          field('③ Cost specific b_L (lei/m) — automat = I_L / L',
            number('line.' + esc(l.id) + '.bL', l.bL) +
            '<button type="button" class="linkish bL-auto" data-action="line-bl-auto" data-line="' + esc(l.id) + '"' +
            (l.bLManual ? '' : ' hidden') + '>↺ recalcul automat din I_L / L</button>') +
        '</div>' +
        '<p class="hint">Costul fiecărui tronson se calculează automat ca <strong>lungime × b_L = ' +
          '<span data-line-bl="' + esc(l.id) + '">' + money(bL) + '</span> lei/m</strong>. ' +
          'Completează doar lungimea tronsoanelor; poți trece pe „manual” dacă ai valoarea exactă. ' +
          '<span data-line-status="' + esc(l.id) + '">' + lineStatusHtml(l) + '</span></p>' +
        '<div class="toolbar"><strong>Tronsoane</strong>' +
          '<button class="btn tiny" data-action="add-tronson" data-line="' + esc(l.id) + '">+ Tronson</button>' +
          '<button class="btn tiny" data-action="add-stalpi" data-line="' + esc(l.id) + '" title="Art. 15 alin. 1: al doilea circuit montat pe stâlpii unei linii aeriene existente">+ Circuit pe stâlpi existenți</button>' +
          '<button class="btn tiny ghost" data-action="auto-all-tronson" data-line="' + esc(l.id) + '" title="Recalculează toate tronsoanele din lungime × b_L">↺ Recalculează toate</button></div>' +
        '<div class="table-wrap"><table class="grid"><thead><tr>' +
          '<th>Denumire</th><th>Lungime (m)</th><th>Cost (lei, auto)</th><th>Utilizatori folosesc tronsonul</th><th></th>' +
        '</tr></thead><tbody>' + (l.tronsoane.map(function (t) { return tronsonRow(l, t); }).join('') ||
          '<tr><td colspan="5" class="empty">Niciun tronson. Apasă „+ Tronson”.</td></tr>') + '</tbody></table></div>' +
      '</div>';
    }).join('');

    return section('Anexa 1 — linie electrică',
      '<div class="toolbar"><button class="btn" data-action="add-line">+ Adaugă linie</button>' +
      '<span class="hint">Pe fiecare tronson costul se împarte în cote egale între utilizatorii care îl folosesc.</span></div>' +
      (body || '<div class="empty card">Nicio linie configurată. Apasă „+ Adaugă linie”.</div>'),
      helperLines()
    );
  }

  function lineStatusHtml(l) {
    // Costul stâlpilor (art. 15 alin. 1) face parte din costul unui tronson existent: nu se adună de două ori.
    var trsSum = (l.tronsoane || []).reduce(function (s, t) { return t.tip === 'stalpi' ? s : s + tronsonCost(l, t); }, 0);
    var IL = Number(l.IL) || 0;
    if (IL <= 0) return '';
    var diff = IL - trsSum;
    var okSum = Math.abs(diff) < 0.5;
    return '<span class="badge ' + (okSum ? 'ok' : 'warn') + '">' +
      (okSum ? '✓ suma tronsoanelor = I_L (' + money(trsSum) + ' lei)'
             : '⚠ suma tronsoanelor = ' + money(trsSum) + ' lei, diferă de I_L cu ' + money(diff) + ' lei') +
      '</span>';
  }

  function helperLines() {
    return {
      title: 'Ce completezi în acest pas',
      intro: 'Descrii <strong>linia electrică</strong> realizată de primul utilizator și tronsoanele ei. Costul se calculează automat.',
      items: [
        { field: 'Denumire linie', desc: 'Un nume sugestiv (ex. „Linie U1 — st. 20–30”).' },
        { field: '① Cost lucrări I_L', desc: 'Valoarea totală a lucrărilor liniei, achitată de primul utilizator prin tariful de racordare.' },
        { field: '② Lungime totală L', desc: 'Lungimea totală a liniei, în metri.' },
        { field: '③ Cost specific b_L', desc: 'Se calculează automat = I_L / L. Îl poți suprascrie doar dacă ai valoarea exactă.' },
        { field: 'Denumire tronson', desc: 'Numele tronsonului (ex. „Tronson 1 (st.20–21)”).' },
        { field: 'Lungime tronson', desc: 'Lungimea tronsonului, în metri. Din ea se calculează automat costul = lungime × b_L.' },
        { field: 'Cost tronson', desc: 'Afișat automat (lungime × b_L). Buton „✎ manual” pentru valoare impusă, „↺ automat” pentru revenire.' },
        { field: 'Circuit pe stâlpi existenți', desc: 'Art. 15 alin. 1: dacă noul utilizator montează un al doilea circuit pe stâlpii liniei aeriene a primului utilizator, apasă „+ Circuit pe stâlpi existenți”, introdu <strong>costul stâlpilor</strong> utilizați în comun și adaugă utilizatorii care folosesc stâlpii (inclusiv noul utilizator). Costul se împarte în cote egale.' },
        { field: 'Utilizatori folosesc tronsonul', desc: 'Adaugă utilizatorii care trec prin acel tronson. Ordinea (↑/↓) = ordinea racordării, primul e finanțatorul.' }
      ],
      note: 'Un tronson folosit de mai mulți utilizatori împarte costul în cote egale; cel care se racordează ulterior plătește diferența.',
      refs: 'Ref.: Anexa nr. 1 și art. 12 din Metodologie.'
    };
  }

  function tronsonRow(l, t) {
    var chips = (t.utilizatori || []).map(function (uid) {
      return '<span class="chip">' + esc(nameOf(uid)) +
        '<button class="mini" data-action="trs-up" data-line="' + esc(l.id) + '" data-trs="' + esc(t.id) + '" data-uid="' + esc(uid) + '" title="sus" aria-label="Mută mai sus">↑</button>' +
        '<button class="mini" data-action="trs-down" data-line="' + esc(l.id) + '" data-trs="' + esc(t.id) + '" data-uid="' + esc(uid) + '" title="jos" aria-label="Mută mai jos">↓</button>' +
        '<button class="mini danger" data-action="trs-remove" data-line="' + esc(l.id) + '" data-trs="' + esc(t.id) + '" data-uid="' + esc(uid) + '" title="elimină" aria-label="Elimină utilizatorul">✕</button>' +
      '</span>';
    }).join(' ');
    var avail = state.utilizatori.filter(function (u) { return (t.utilizatori || []).indexOf(u.id) < 0; });
    var addSel = '<select class="add-user-sel" data-action="trs-add" data-line="' + esc(l.id) + '" data-trs="' + esc(t.id) + '" aria-label="Adaugă utilizator pe tronson">' +
      '<option value="">+ utilizator…</option>' +
      avail.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.nume || u.codPA) + '</option>'; }).join('') +
      '</select>';
    var costVal = tronsonCost(l, t);
    var costCell;
    var stalpi = t.tip === 'stalpi';
    if (stalpi) {
      costCell = number('tronson.' + esc(l.id) + '.' + esc(t.id) + '.cost', t.cost, 'Costul stâlpilor utilizați în comun (lei)') +
        '<div class="hint">costul stâlpilor</div>';
    } else if (t.costManual) {
      costCell = number('tronson.' + esc(l.id) + '.' + esc(t.id) + '.cost', t.cost, 'Cost tronson (lei)') +
        '<div class="mini-actions"><button class="linkish" data-action="trs-cost-auto" data-line="' + esc(l.id) + '" data-trs="' + esc(t.id) + '">↺ automat</button></div>';
    } else {
      costCell = '<span class="auto-val" data-derived-cost="' + esc(l.id) + '-' + esc(t.id) + '" title="Calculat automat: lungime × b_L">' + money(costVal) + ' lei</span>' +
        '<div class="mini-actions"><button class="linkish" data-action="trs-cost-manual" data-line="' + esc(l.id) + '" data-trs="' + esc(t.id) + '">✎ manual</button></div>';
    }
    return '<tr>' +
      '<td>' + text('tronson.' + esc(l.id) + '.' + esc(t.id) + '.nume', t.nume, 'Denumire tronson') + '</td>' +
      '<td>' + (stalpi ? '<span class="muted">—</span>' : number('tronson.' + esc(l.id) + '.' + esc(t.id) + '.lungime', t.lungime, 'Lungime tronson (m)')) + '</td>' +
      '<td class="cost-cell">' + costCell + '</td>' +
      '<td><div class="chips">' + (chips || '<span class="muted">—</span>') + '</div>' + addSel + '</td>' +
      '<td><button class="btn tiny danger" data-action="del-tronson" data-line="' + esc(l.id) + '" data-trs="' + esc(t.id) + '">Șterge</button></td>' +
      '</tr>';
  }

  function stationHintHtml(s) {
    var SnEf = (Number(s.Sn) || 0) - (Number(s.SnRezerva) || 0);
    return 'b_T = I_T / S_n efectiv = ' + money(Number(s.IT) || 0) + ' / ' + money(SnEf) +
      ' = <strong>' + money(SnEf > 0 ? (Number(s.IT) || 0) / SnEf : 0) + ' lei/kVA</strong>' +
      (Number(s.SnRezerva) > 0 ? ' (S_n efectiv exclude transformatorul de rezervă, art. 15 alin. 4)' : '') +
      (s.intarire
        ? '. <strong>Întărire post (art. 15 alin. 3):</strong> compensația = puterea noului utilizator × b_T, doar în limita capacității suplimentare a transformatorului existent (S_n efectiv − puterile utilizatorilor deja racordați = <strong>' +
          money(Math.max(0, SnEf - stationOccupied(s))) + ' kVA</strong>); restul îl acoperă noul transformator, finanțat de noul utilizator.'
        : '. Compensația fiecărui utilizator nou = puterea sa aprobată × b_T.');
  }

  // Puterea aprobată a utilizatorilor deja racordați la stație (fără cei noi).
  function stationOccupied(s) {
    var nou = getNewIds();
    return (s.utilizatori || []).reduce(function (sum, id) {
      if (nou.indexOf(id) >= 0) return sum;
      var u = S.findUser(state, id);
      return sum + (u ? Number(u.putere) || 0 : 0);
    }, 0);
  }

  function refreshStationDerived(stId) {
    var st = byId(state.statii, stId);
    var node = document.querySelector('[data-st-hint="' + stId + '"]');
    if (st && node) node.innerHTML = stationHintHtml(st);
  }

  function renderStations() {
    var body = state.statii.map(function (s) {
      var chips = (s.utilizatori || []).map(function (uid) {
        return '<span class="chip">' + esc(nameOf(uid)) +
          '<button class="mini" data-action="st-up" data-st="' + esc(s.id) + '" data-uid="' + esc(uid) + '" title="sus" aria-label="Mută mai sus">↑</button>' +
          '<button class="mini" data-action="st-down" data-st="' + esc(s.id) + '" data-uid="' + esc(uid) + '" title="jos" aria-label="Mută mai jos">↓</button>' +
          '<button class="mini danger" data-action="st-remove" data-st="' + esc(s.id) + '" data-uid="' + esc(uid) + '" title="elimină" aria-label="Elimină utilizatorul">✕</button>' +
        '</span>';
      }).join(' ');
      var avail = state.utilizatori.filter(function (u) { return (s.utilizatori || []).indexOf(u.id) < 0; });
      return '<div class="card"><div class="card-head">' +
        '<input class="line-title" data-bind="stat.' + esc(s.id) + '.nume" value="' + esc(s.nume) + '" placeholder="Denumire stație / PT" aria-label="Denumire stație / PT">' +
        '<button class="btn tiny danger" data-action="del-stat" data-id="' + esc(s.id) + '">Șterge</button></div>' +
        '<div class="row3">' +
          field('Capacitate nominală S_n (kVA)', number('stat.' + esc(s.id) + '.Sn', s.Sn)) +
          field('Transformator de rezervă N-1 (kVA) — exclus din b_T', number('stat.' + esc(s.id) + '.SnRezerva', s.SnRezerva)) +
          field('Cost lucrări I_T (lei)', number('stat.' + esc(s.id) + '.IT', s.IT)) +
        '</div>' +
        '<div class="row2">' +
          field('Echipamente comune, altele decât transformatoare (lei)', number('stat.' + esc(s.id) + '.elementeComune', s.elementeComune)) +
          field('Întărire post — transformator înlocuit / al doilea transformator (art. 15 alin. 3)', checkbox('stat.' + esc(s.id) + '.intarire', s.intarire)) +
        '</div>' +
        '<div class="toolbar"><strong>Utilizatori (primul utilizator se bifează la pasul 2 „Utilizatori”)</strong></div>' +
        '<div class="chips">' + (chips || '<span class="muted">—</span>') + '</div>' +
        '<select aria-label="Adaugă utilizator în stație" data-action="st-add" data-st="' + esc(s.id) + '"><option value="">+ utilizator…</option>' +
          avail.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.nume || u.codPA) + '</option>'; }).join('') +
        '</select>' +
        '<p class="hint" data-st-hint="' + esc(s.id) + '">' + stationHintHtml(s) + '</p>' +
      '</div>';
    }).join('');

    return section('Anexa 2 — stație electrică / post de transformare',
      '<div class="toolbar"><button class="btn" data-action="add-stat">+ Adaugă stație / PT</button></div>' +
      (body || '<div class="empty card">Nicio stație configurată.</div>'),
      helperStations()
    );
  }

  function helperStations() {
    return {
      title: 'Ce completezi în acest pas',
      intro: 'Descrii <strong>stația / postul de transformare</strong> folosit în comun. Compensația este proporțională cu puterea aprobată.',
      items: [
        { field: 'Denumire stație / PT', desc: 'Numele stației sau postului de transformare.' },
        { field: 'Capacitate nominală S_n', desc: 'Capacitatea transformatoarelor, în kVA (ex. 400).' },
        { field: 'Cost lucrări I_T', desc: 'Valoarea lucrărilor stației/PT achitată de primul utilizator.' },
        { field: 'Întărire post (art. 15 alin. 3)', desc: 'Bifează dacă pentru noul utilizator se înlocuiește transformatorul cu unul mai mare sau se montează al doilea transformator. Completează S_n și I_T ale transformatorului <strong>existent</strong>; noul utilizator plătește primului doar pentru capacitatea suplimentară a acestuia.' },
        { field: 'Echipamente comune', desc: 'Opțional: valoarea echipamentelor (altele decât transformatoarele) folosite în comun; se împarte în cote egale.' },
        { field: 'Utilizatori', desc: 'Adaugă utilizatorii racordați la stație/PT. Primul utilizator (finanțatorul) se bifează în tabul „Utilizatori”; ceilalți îi plătesc compensație.' }
      ],
      note: 'b_T = I_T / S_n [lei/kVA]; compensația = puterea aprobată a noului utilizator × b_T.',
      refs: 'Ref.: Anexa nr. 2 și art. 13 din Metodologie.'
    };
  }

  function renderComplex() {
    var c = state.complexConfig;
    var variants = [1, 2, 3, 4];
    var liniiChk = state.linii.map(function (l) {
      return '<label class="chk"><input type="checkbox" data-action="cx-line" data-id="' + esc(l.id) + '"' +
        (c.liniiIds.indexOf(l.id) >= 0 ? ' checked' : '') + '> ' + esc(l.nume) + '</label>';
    }).join('') || '<span class="muted">Nu există linii configurate.</span>';
    var liniiU2Chk = state.linii.map(function (l) {
      return '<label class="chk"><input type="checkbox" data-action="cx-line-u2" data-id="' + esc(l.id) + '"' +
        (c.liniiU2Ids.indexOf(l.id) >= 0 ? ' checked' : '') + '> ' + esc(l.nume) + '</label>';
    }).join('') || '<span class="muted">—</span>';
    var v = Number(c.varianta) || 1;
    var statiiChk = state.statii.map(function (s) {
      return '<label class="chk"><input type="checkbox" data-action="cx-stat" data-id="' + esc(s.id) + '"' +
        (c.statiiIds.indexOf(s.id) >= 0 ? ' checked' : '') + '> ' + esc(s.nume) + '</label>';
    }).join('') || '<span class="muted">Nu există stații configurate.</span>';

    // Descrierea componentelor în funcție de variantă.
    var compDesc = {
      1: 'Varianta 1 — noul utilizator se racordează pe linia U1, în amonte de stație. Se aplică <strong>doar Anexa 1</strong> pentru l_U1.',
      2: 'Varianta 2 — racordare la bara U1 a stației. Se aplică <strong>Anexa 1 (l_U1)</strong> + <strong>echipamentele stației</strong> (altele decât transformatoarele), în cote egale între toți utilizatorii care au contribuit (art. 12 alin. 1, art. 6 alin. 1 lit. a).',
      3: 'Varianta 3 — racordare pe linia U2, în aval de stație. Se aplică <strong>Anexa 1 (l_U1)</strong> + <strong>Anexa 2 (transformator)</strong>. Conform Anexei 3, echipamentele comune ale stației NU se adaugă aici (de confirmat cu un specialist).',
      4: 'Varianta 4 — racordare pe linia U2, mai departe. Se aplică <strong>Anexa 1 (l_U1)</strong> + <strong>Anexa 2 (transformator)</strong> + <strong>Anexa 1 (l_U2)</strong>. Echipamentele comune ale stației nu se adaugă (de confirmat).'
    }[v];

    var staBlock = (v === 3 || v === 4)
      ? '<div class="card"><strong>Stații / posturi de transformare (Anexa 2)</strong><div class="list-chk">' + statiiChk + '</div></div>'
      : (v === 2
        ? '<div class="card"><strong>Echipamente comune ale stației</strong><p class="hint">Valorile „Echipamente comune" din stații se împart în cote egale între toți utilizatorii stației. Bifează stația folosită:</p><div class="list-chk">' + statiiChk + '</div></div>'
        : '');

    var u2Block = (v === 4)
      ? '<div class="card"><strong>Linii l_U2 (Anexa 1)</strong><div class="list-chk">' + liniiU2Chk + '</div></div>'
      : '';

    return section('Anexa 3 — instalație de racordare complexă',
      field('Varianta punctului de racordare', '<select data-bind="complex.varianta">' +
        opts(variants.map(function (vv) { return [String(vv), 'Varianta ' + vv]; }), String(v)) + '</select>') +
      '<p class="hint">' + compDesc + '</p>' +
      '<div class="card"><strong>Linii incluse (l_U1) — Anexa 1</strong><div class="list-chk">' + liniiChk + '</div></div>' +
      staBlock + u2Block,
      helperComplex()
    );
  }

  function helperComplex() {
    return {
      title: 'Ce completezi în acest pas',
      intro: 'Instalația complexă combină linii și o stație/PT. Alegi varianta punctului de racordare a noului utilizator; aplicația însumează componentele corespunzătoare.',
      items: [
        { field: 'Varianta', desc: '1 = doar linia l_U1 · 2 = l_U1 + echipamentele stației (cote egale) · 3 = l_U1 + stația (Anexa 2) · 4 = l_U1 + stație + linia l_U2.' },
        { field: 'Linii incluse (l_U1)', desc: 'Liniile dintre punctul de racordare al primului utilizator și cel al noului utilizator (Anexa 1).' },
        { field: 'Stații / PT', desc: 'Apare la variantele 2/3/4: la 3/4 se aplică Anexa 2 (proporțional cu puterea); la 2 doar echipamentele comune, în cote egale.' },
        { field: 'Linii l_U2', desc: 'Doar varianta 4: linia de cealaltă tensiune, în aval de stație (Anexa 1).' }
      ],
      note: 'Compensația totală = suma componentelor din varianta aleasă.',
      refs: 'Ref.: Anexa nr. 3 și art. 14 din Metodologie.'
    };
  }

  function renderTransitional() {
    var t = state.tranzitoriu;
    return section('Anexa 4 — prevederi tranzitorii (Ord. 28/2003)',
      '<div class="row3">' +
        field('Componenta B din tariful de racordare (lei)', number('tranz.B', t.B)) +
        field('Capacitatea instalației S (kVA)', number('tranz.S', t.S)) +
        field('Puterea noului utilizator S_2 (kVA)', number('tranz.S2', t.S2)) +
        field('Lungimea folosită l_2 (m)', number('tranz.l2', t.l2)) +
        field('Lungimea totală L (m)', number('tranz.L', t.L)) +
      '</div>' +
      '<p class="hint">b = B / S ; C_2 = S_2 · b · (l_2 / L).</p>',
      helperTransitional()
    );
  }

  function helperTransitional() {
    return {
      title: 'Ce completezi în acest pas',
      intro: 'Pentru situațiile tranzitorii (instalații finanțate înainte de 2016, sub vechea metodologie Ord. 28/2003).',
      items: [
        { field: 'Componenta B', desc: 'Componenta din tariful de racordare achitată de primul utilizator (lei).' },
        { field: 'Capacitatea S', desc: 'Capacitatea instalației de racordare aferentă tarifului achitat (kVA).' },
        { field: 'Puterea noului utilizator S_2', desc: 'Puterea aprobată a utilizatorului care se racordează acum (kVA).' },
        { field: 'Lungimea folosită l_2', desc: 'Lungimea porțiunii de linie folosită de noul utilizator (m).' },
        { field: 'Lungimea totală L', desc: 'Lungimea totală a liniei (m).' }
      ],
      note: 'b = B/S [lei/kVA]; C_2 = S_2 · b · (l_2/L).',
      refs: 'Ref.: Anexa nr. 4 și art. 18 din Metodologie.'
    };
  }

  function renderDeveloper() {
    var d = state.dezvoltator;
    var rows = (d.dezvoltatori || []).map(function (x) {
      return '<tr>' +
        '<td>' + text('devitem.' + esc(x.id) + '.nume', x.nume, 'Denumire dezvoltator') + '</td>' +
        '<td>' + number('devitem.' + esc(x.id) + '.putere', x.putere, 'Putere aprobată (kVA)') + '</td>' +
        '<td><button class="btn tiny danger" data-action="del-dev" data-id="' + esc(x.id) + '">Șterge</button></td>' +
        '</tr>';
    }).join('');
    return section('Anexa 5 — rețea publică finanțată de un prim dezvoltator',
      '<div class="row2">' +
        field('Valoarea totală a investiției I_total (lei)', number('dev.Itotal', d.Itotal)) +
        field('Cota de eficiență I_ef (lei)', number('dev.Ief', d.Ief)) +
      '</div>' +
      '<div class="toolbar"><strong>Dezvoltatori / utilizatori</strong>' +
        '<button class="btn tiny" data-action="add-dev">+ Adaugă</button></div>' +
      '<div class="table-wrap"><table class="grid"><thead><tr><th>Denumire</th><th>Putere aprobată (kVA)</th><th></th></tr></thead>' +
      '<tbody>' + (rows || '<tr><td colspan="3" class="empty">Niciun dezvoltator.</td></tr>') + '</tbody></table></div>' +
      '<p class="hint">X_ef = I_ef / I_total ; X_inef = 1 − X_ef ; X_D = X_inef · P_D / P_total.</p>',
      helperDeveloper()
    );
  }

  function helperDeveloper() {
    return {
      title: 'Ce completezi în acest pas',
      intro: 'Rețea electrică de interes public finanțată de un prim dezvoltator, folosită apoi în comun de alți dezvoltatori/utilizatori.',
      items: [
        { field: 'I_total', desc: 'Valoarea totală a investiției în rețeaua folosită în comun (lei).' },
        { field: 'I_ef', desc: 'Cota de eficiență a investiției, suportată de operatorul de distribuție (lei), din analiza de eficiență economică.' },
        { field: 'Dezvoltatori / utilizatori', desc: 'Adaugă părțile care folosesc în comun rețeaua, cu puterea aprobată a fiecăreia (kVA).' }
      ],
      note: 'Cota de ineficiență (I_total − I_ef) se împarte proporțional cu puterile aprobate.',
      refs: 'Ref.: Anexa nr. 5, art. 2 alin. (2), art. 16 din Metodologie.'
    };
  }

  /* ---------- tab: rezultate ---------- */
  function renderResults() {
    var c = state.conditii;
    var years = effectiveYears();
    var fromDate = !!(c.dataPIF && state.meta.dataCalcul);
    var keys = ['primCapacitateMaiMare', 'capacitateDisponibila', 'aniDeLaPF', 'solutieComuna', 'tarifAchitatIntegral'];
    var model = state.meta.model;
    var conds = conditionsFor();
    var tariff = tariffStatus();

    function yearsLi(x) {
      return '<li class="' + (x.ok ? 'ok' : 'bad') + '">' + esc(x.mesaj) +
        '<div class="years-row">' +
        '<label>Data punerii în funcțiune: <input type="date" data-bind="cond.dataPIF" value="' + esc(c.dataPIF) + '"></label> ' +
        '<label>sau ani (manual): <input type="number" min="0" step="0.1" data-bind="cond.aniDeLaPF" value="' + esc(c.aniDeLaPF) + '" class="inline-num"' + (fromDate ? ' disabled' : '') + ' aria-label="Ani de la punerea în funcțiune (manual)"></label>' +
        (fromDate ? ' <span class="hint">calculat din date: ' + esc(years) + ' ani (la data întocmirii)</span>' : '') +
        '</div></li>';
    }

    var condHtml;
    if (CHECK_MODELS.indexOf(model) >= 0) {
      condHtml = conds.map(function (x, i) {
        var k = keys[i];
        if (k === 'aniDeLaPF') return yearsLi(x);
        if (k === 'tarifAchitatIntegral') {
          return '<li class="' + (x.ok ? 'ok' : 'bad') + '">' + esc(x.mesaj) +
            (tariff.missing.length
              ? '<div class="hint">Fără „Data achitare TR” (sau ulterioară datei întocmirii): ' + esc(tariff.missing.join(', ')) + '.</div>'
              : '<div class="hint">Toți beneficiarii au data achitării TR completată.</div>') +
            '<label class="chk"><input type="checkbox" data-bind="cond.tarifAchitatIntegral"' + (c.tarifAchitatIntegral ? ' checked' : '') + '> Confirm manual că toți beneficiarii au achitat integral tariful</label></li>';
        }
        return '<li class="' + (x.ok ? 'ok' : 'bad') + '"><label class="chk"><input type="checkbox" data-bind="cond.' + k + '"' + (c[k] ? ' checked' : '') + '> ' + esc(x.mesaj) + '</label></li>';
      }).join('') +
        '<li class="' + (c.fonduriPublice ? 'bad' : 'ok') + '"><label class="chk"><input type="checkbox" data-bind="cond.fonduriPublice"' + (c.fonduriPublice ? ' checked' : '') + '> Instalația primului utilizator a fost finanțată din fonduri publice nerambursabile (art. 19 — metodologia nu se aplică)</label></li>';
    } else if (model === 'developer') {
      condHtml = conds.map(yearsLi).join('');
    } else {
      condHtml = '';
    }
    var condCard = condHtml
      ? '<div class="card"><strong>Verificarea condițiilor cumulative' + (model === 'developer' ? ' (Anexa 5)' : ' (Art. 8)') + '</strong>' +
        '<p class="hint">Calculul este blocat cât timp o condiție nu e îndeplinită (art. 8 alin. 1: „numai dacă sunt îndeplinite cumulativ”).</p>' +
        '<ul class="conds">' + condHtml + '</ul>' +
        '<label class="chk"><input type="checkbox" data-bind="cond.calcInformativ"' + (c.calcInformativ ? ' checked' : '') + '> Calculează oricum (informativ — valorile nu sunt datorate dacă o condiție nu e îndeplinită)</label></div>'
      : '';

    var check = V.validate(state);
    var listHtml = '';
    if (check.errors.length) {
      listHtml += '<div class="card err-card" role="alert"><strong>De corectat înainte de calcul</strong><ul class="conds">' +
        check.errors.map(function (w) { return '<li class="bad">' + esc(w) + '</li>'; }).join('') + '</ul></div>';
    }
    if (check.warnings.length) {
      listHtml += '<div class="card warn-card"><strong>Atenție</strong><ul class="conds">' +
        check.warnings.map(function (w) { return '<li class="bad">' + esc(w) + '</li>'; }).join('') + '</ul></div>';
    }

    var resultHtml;
    if (results && results.error) {
      resultHtml = '<div class="card warn-card" role="alert"><strong>Nu se poate calcula</strong><p>' + esc(results.error) + '</p></div>';
    } else {
      resultHtml = results ? renderResultsBody() : '<p class="muted">Apasă butonul „Calculează compensațiile”.</p>';
    }
    var canExport = !!(results && !results.error && results.central);
    var canPrint = !!(results && !results.error);

    return section('Rezultate',
      '<div class="toolbar">' +
        '<button class="btn primary" data-action="calc">Calculează compensațiile</button>' +
        '<button class="btn ghost" data-action="export-csv"' + (canExport ? '' : ' disabled') + '>Export CSV</button>' +
        '<button class="btn ghost" data-action="print"' + (canPrint ? '' : ' disabled') + '>Printează / PDF</button>' +
      '</div>' + (results ? '<p class="hint">Rezultatul se actualizează automat când modifici datele.</p>' : '') + listHtml +
      condCard +
      '<div id="results-region" aria-live="polite">' + resultHtml + '</div>',
      helperResults()
    );
  }

  function helperResults() {
    return {
      title: 'Ce faci în acest pas',
      intro: 'Bifezi condițiile legale, apeși „Calculează compensațiile” și verifici centralizatorul.',
      items: [
        { field: 'Verificarea condițiilor (Art. 8)', desc: 'Bifează situațiile reale. Compensația se calculează și se plătește <strong>numai dacă</strong> toate condițiile sunt îndeplinite cumulativ; altfel calculul este blocat (poți cere o valoare orientativă cu „Calculează oricum”).' },
        { field: 'Punerea în funcțiune / ani', desc: 'Completează data punerii în funcțiune (anii se calculează la data întocmirii) sau introdu anii manual. Termen: 5 ani (10 ani dacă primul utilizator e casnic — se aplică automat din tipul clientului).' },
        { field: 'Tariful achitat (art. 7)', desc: 'Se verifică din „Data achitare TR” a fiecărui beneficiar; poți confirma manual dacă data lipsește.' },
        { field: 'Fonduri publice (art. 19)', desc: 'Dacă instalația primului utilizator a fost finanțată din fonduri nerambursabile, metodologia nu se aplică.' },
        { field: 'Calculează compensațiile', desc: 'Generează centralizatorul: cine plătește cui, cu și fără TVA.' },
        { field: 'Export CSV', desc: 'Descarcă centralizatorul pentru Excel (separator „;”, zecimale cu virgulă).' },
        { field: 'Printează / PDF', desc: 'Tipărește sau salvează ca PDF, doar conținutul rezultatelor.' }
      ],
      note: 'Noul utilizator plătește fiecare utilizator anterior; totalul pe coloane = suma primită de fiecare.',
      refs: 'Ref.: art. 7–8 și art. 12–16 din Metodologie.'
    };
  }

  function renderResultsBody() {
    var model = results.model;
    if (model === 'transitional') {
      return '<div class="card"><h3>Anexa 4 — rezultat</h3>' +
        '<p>b = ' + money(results.b) + ' lei/kVA</p>' +
        '<p class="big">C_2 = <strong>' + money(results.C2) + ' lei</strong></p></div>';
    }
    if (model === 'developer') {
      var rows = results.rows.map(function (r) {
        return '<tr><td>' + esc(r.nume) + '</td><td class="num">' + money(r.putere) + '</td>' +
          '<td class="num">' + (r.Xinef * 100).toFixed(3) + '%</td><td class="num">' + money(r.suma) + '</td></tr>';
      }).join('');
      return '<div class="card"><h3>Anexa 5 — cote de participare</h3>' +
        '<p>X_ef = ' + (results.Xef * 100).toFixed(2) + '% · X_inef = ' + (results.Xinef * 100).toFixed(2) + '%</p>' +
        '<table class="grid"><thead><tr><th>Dezvoltator</th><th>Putere (kVA)</th><th>Cotă ineficiență</th><th>Sumă (lei)</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table></div>';
    }

    var central = results.central;
    var multi = central.rows.some(function (r) { return r.deLaId; }) && central.newList.length > 1;
    var rowHtml = central.rows.map(function (r) {
      return '<tr>' +
        (multi ? '<td>' + esc(r.deLaCodPA || r.deLaNume) + '</td>' +
                 '<td>' + esc(r.deLaNume) + '</td>' : '') +
        '<td>' + esc(r.codPA) + '</td><td>' + esc(r.nume) + '</td>' +
        '<td class="num">' + money(r.faraTVA) + '</td><td class="num">' + money(r.cuTVA) + '</td></tr>';
    }).join('') || '<tr><td colspan="' + (multi ? 6 : 4) + '" class="empty">Nicio compensație de plată.</td></tr>';

    var cond = results.conditions;
    var blocante = cond.filter(function (x) { return !x.ok; }).length;
    var printHead = '<div class="print-head"><strong>' + esc(state.meta.operator || '') + '</strong>' +
      (state.meta.codOperator ? ' · cod operator ' + esc(state.meta.codOperator) : '') +
      ' · data întocmirii: ' + esc(state.meta.dataCalcul || '') +
      ' · ' + esc(modelLabel(state.meta.model)) + '</div>';

    var titlu;
    if (central.newList.length === 1) {
      titlu = 'Centralizator compensații — plătite de <em>' + esc(nameOf(central.newList[0])) + '</em>';
    } else {
      titlu = 'Centralizator compensații — plătite de utilizatorii noi: <em>' +
        esc(central.newList.map(nameOf).join(', ')) + '</em>';
    }

    return '<div class="card highlight">' +
      printHead +
      '<h3>' + titlu + (blocante ? ' <span class="badge warn">INFORMATIV — condiții Art. 8 neîndeplinite</span>' : '') + '</h3>' +
      '<p class="hint">Utilizatorii noi plătesc compensații utilizatorilor racordați anterior (primul utilizator este receptorul principal).</p>' +
      (blocante ? '<p class="warn">Atenție: ' + blocante + ' condiții (Art. 8) nu sunt îndeplinite. Compensația se calculează doar dacă sunt îndeplinite cumulativ.</p>' : '<p class="okmsg">Toate condițiile Art. 8 sunt îndeplinite.</p>') +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
      (multi ? '<th>Cod PA plătitor</th><th>Plătitor (nou)</th>' : '') +
      '<th>Cod PA</th><th>Nume / denumire</th><th>Valoare fără TVA</th><th>Valoare cu TVA</th></tr></thead>' +
      '<tbody>' + rowHtml + '</tbody><tfoot><tr class="total"><td colspan="' + (multi ? 4 : 2) + '">Total</td><td class="num">' +
        money(central.totalFaraTVA) + '</td><td class="num">' + money(central.totalCuTVA) + '</td></tr></tfoot></table></div>' +
      renderPerNou(central, multi) +
      '<div class="signatures"><span>Întocmit: ' + esc(state.meta.operator || 'operator de rețea') + '</span>' +
      '<span>Semnătură: ____________________</span></div>' +
      '</div>' + renderDetails();
  }

  function modelLabel(m) {
    return {
      line: 'Anexa 1 — linie electrică', station: 'Anexa 2 — stație / PT', complex: 'Anexa 3 — instalație complexă',
      transitional: 'Anexa 4 — tranzitoriu', developer: 'Anexa 5 — dezvoltator'
    }[m] || m;
  }

  function renderPerNou(central, multi) {
    if (!multi) return '';
    var rows = central.newList.map(function (id) {
      var p = central.perNou[id] || { faraTVA: 0, cuTVA: 0 };
      return '<tr><td>' + esc(nameOf(id)) + '</td><td class="num">' + money(p.faraTVA) + '</td><td class="num">' + money(p.cuTVA) + '</td></tr>';
    }).join('');
    return '<details class="card" open><summary>Total pe fiecare utilizator nou</summary>' +
      '<table class="grid"><thead><tr><th>Utilizator nou</th><th>Total fără TVA</th><th>Total cu TVA</th></tr></thead><tbody>' +
      rows + '</tbody></table></details>';
  }

  // Art. 15 alin. 3: capacitatea suplimentară a transformatorului existent.
  function intarireHtml(st) {
    if (!st || !st.intarire || !st.suplimentara) return '';
    var sp = st.suplimentara;
    var folosit = Object.keys(sp.folosit).map(function (id) {
      return esc(nameOf(id)) + ': ' + money(sp.folosit[id]) + ' kVA × ' + money(st.bT) + ' = <strong>' + money(sp.folosit[id] * st.bT) + ' lei</strong>';
    }).join('; ');
    return '<br><em>Întărire post (art. 15 alin. 3):</em> capacitate suplimentară existentă ' + money(sp.initiala) + ' kVA (S_n efectiv ' +
      money(st.SnEfectiv) + ' − ' + money(sp.ocupata) + ' kVA deja racordați)' +
      (folosit ? ' — compensație pentru: ' + folosit : '') +
      '; rămasă neutilizată ' + money(sp.ramasa) + ' kVA.';
  }

  function renderDetails() {
    var res = results;
    if (res.model === 'line') {
      var det = res.tronsoaneDetalii.map(function (t) {
        var plati = t.plati.map(function (p) {
          return '<li>' + esc(nameOf(p.deLa)) + ' → ' + esc(nameOf(p.catre)) + ': <strong>' + money(p.suma) + '</strong></li>';
        }).join('');
        return '<div class="det"><strong>' + esc(t.nume || t.id) + '</strong>' +
          (t.tip === 'stalpi' ? ' <span class="badge ok">art. 15 alin. 1 — stâlpi în comun</span>' : '') + ' — cost ' + money(t.cost) +
          ' lei, ' + t.nrUtilizatori + ' utilizatori<br><ul>' + (plati || '<li class="muted">fără compensații</li>') + '</ul></div>';
      }).join('');
      return '<details class="card"><summary>Detaliu pe tronsoane</summary>' + det + '</details>';
    }
    if (res.model === 'station') {
      var blocks = (res.statii || []).map(function (st, i) {
        var nm = (state.statii[i] && state.statii[i].nume) || ('Stația ' + (i + 1));
        var rez = Number(st.SnRezerva) > 0
          ? '<br>S_n efectiv = ' + money(st.Sn) + ' − ' + money(st.SnRezerva) + ' (rezervă N-1) = ' + money(st.SnEfectiv) + ' kVA'
          : '';
        return '<p><strong>' + esc(nm) + '</strong>: b_T = I_T / S_n = ' + money(st.IT) + ' / ' + money(st.SnEfectiv) +
          ' = <strong>' + money(st.bT) + ' lei/kVA</strong>' + rez + intarireHtml(st) + '</p>';
      }).join('');
      return '<details class="card"><summary>Detaliu stații</summary>' + blocks + '</details>';
    }
    if (res.model === 'complex') {
      var comps = res.components.map(function (c) {
        if (c.model === 'station') return 'Anexa 2 — ' + money(c.bT) + ' lei/kVA' + (c.intarire ? ' (întărire post, art. 15 alin. 3)' : '');
        return 'Anexa 1 — ' + money((c.tronsoaneDetalii || []).reduce(function (s, t) { return s + (Number(t.cost) || 0); }, 0)) + ' lei';
      });
      return '<details class="card" open><summary>Varianta ' + esc(res.varianta) + ' — componente însumate</summary>' +
        '<ul>' + (comps.length ? comps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') : '<li class="muted">fără componente</li>') + '</ul></details>';
    }
    return '';
  }

  /* ----------------------- export ----------------------- */
  function csvText(v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; }

  function toCsv() {
    var central = results && results.central;
    if (!central) return '';
    var multi = central.newList.length > 1;
    var lines = [];
    lines.push((multi ? ['Cod PA platitor', 'Platitor nou', 'Cod PA', 'Nume', 'Valoare fara TVA', 'Valoare cu TVA']
                      : ['Cod PA', 'Nume', 'Valoare fara TVA', 'Valoare cu TVA']).join(';'));
    central.rows.forEach(function (r) {
      var cols = multi
        ? [csvText(r.deLaCodPA), csvText(r.deLaNume), csvText(r.codPA), csvText(r.nume)]
        : [csvText(r.codPA), csvText(r.nume)];
      cols.push(csvNum(r.faraTVA), csvNum(r.cuTVA));
      lines.push(cols.join(';'));
    });
    var tf = ['Total'];
    while (tf.length < (multi ? 4 : 2)) tf.push('');
    tf.push(csvNum(central.totalFaraTVA), csvNum(central.totalCuTVA));
    lines.push(tf.join(';'));
    // BOM UTF-8: Excel recunoaște diacriticele.
    return '\ufeff' + lines.join('\r\n');
  }

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /* ----------------------- events ----------------------- */
  function init() {
    bindEvents();
    // Încarcă proiectul din IndexedDB (asincron), apoi afișează.
    initPromise = S.init().then(function (loaded) {
      state = loaded || S.demoU6();
      deriveAll();
      render();
      return state;
    }).catch(function () {
      state = S.demoU6();
      deriveAll();
      render();
      return state;
    });
    return initPromise;
  }

  function bindEvents() {
    if (eventsBound) return;
    eventsBound = true;
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
    // Nu pierdem ultima tastare dacă pagina se închide în fereastra de debounce.
    global.addEventListener('pagehide', function () { if (saveTimer) flushSave(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && saveTimer) flushSave();
    });
  }

  function onInput(e) {
    var t = e.target;
    if (!t || !t.dataset || !t.dataset.bind) return;
    var path = t.dataset.bind;

    // Sincronizăm modelul FĂRĂ să re-randăm tot ecranul (altfel câmpul
    // pierde focusul/cursorul la fiecare tastă și cifrele se amestecă).
    if (t.type === 'number') {
      setBind(path, t.value === '' ? '' : Number(t.value));
    } else if (t.type !== 'checkbox' && t.tagName !== 'SELECT') {
      setBind(path, t.value);
    } else {
      return; // checkbox/select -> tratate la 'change'
    }
    recompute();
    saveSoon();

    // Actualizare țintită a valorilor derivate (b_L, cost tronsoane, status).
    var seg = path.split('.');
    if (seg[0] === 'line' || seg[0] === 'tronson') {
      refreshLineDerived(seg[1]);
    }
  }

  // Reîmprospătează doar elementele calculate ale unei linii, fără re-randare.
  function refreshLineDerived(lineId) {
    var l = byId(state.linii, lineId);
    if (!l) return;

    // Câmpul b_L: îl actualizăm doar dacă nu este chiar cel editat și nu
    // a fost fixat manual de utilizator.
    var bLInput = document.querySelector('[data-bind="line.' + lineId + '.bL"]');
    if (bLInput && bLInput !== document.activeElement && !l.bLManual) {
      bLInput.value = (Number(l.bL) || 0);
    }
    // Linkul „recalcul automat” apare doar când b_L este manual.
    var autoLink = document.querySelector('[data-action="line-bl-auto"][data-line="' + lineId + '"]');
    if (autoLink) autoLink.hidden = !l.bLManual;

    var blNode = document.querySelector('[data-line-bl="' + lineId + '"]');
    if (blNode) blNode.textContent = money(l.bL);

    var stNode = document.querySelector('[data-line-status="' + lineId + '"]');
    if (stNode) stNode.innerHTML = lineStatusHtml(l);

    (l.tronsoane || []).forEach(function (t) {
      var c = document.querySelector('[data-derived-cost="' + lineId + '-' + esc(t.id) + '"]');
      if (c) c.textContent = money(tronsonCost(l, t)) + ' lei';
    });
  }

  function onChange(e) {
    var t = e.target;
    if (!t || !t.dataset) return;

    if (t.dataset.bind) {
      var path = t.dataset.bind;
      var val;
      if (t.type === 'checkbox') val = t.checked;
      else if (t.type === 'number') val = t.value === '' ? '' : Number(t.value);
      else val = t.value;
      setBind(path, val);

      // „Prim utilizator”: un singur utilizator poate avea rolul; dacă tocmai
      // a fost bifat cel care era «noul utilizator», îl scoatem din noii utilizatori.
      var mPrim = /^user\.([^.]+)\.prim$/.exec(path);
      if (mPrim && val) {
        var chosen = mPrim[1];
        state.utilizatori.forEach(function (u) { if (u.id !== chosen) u.prim = false; });
        setNewIds(getNewIds().filter(function (id) { return id !== chosen; }));
      }
      recompute();
      saveNow();

      // Câmpurile text/număr/dată nu schimbă structura ecranului: nu re-randăm
      // (altfel focusul se pierde la Tab și navigarea cu tastatura se rupe).
      var plain = (t.tagName === 'INPUT' && t.type !== 'checkbox' && t.type !== 'radio');
      var structural = path === 'meta.model' || path === 'meta.dataCalcul' || /^cond\./.test(path) || !!mPrim;
      if (plain && !structural) {
        var seg = path.split('.');
        if (seg[0] === 'line' || seg[0] === 'tronson') refreshLineDerived(seg[1]);
        if (seg[0] === 'stat') refreshStationDerived(seg[1]);
        return;
      }
      render();
      return;
    }

    var a = t.dataset.action;
    if (a === 'trs-add') { if (t.value) { addToTronson(t.dataset.line, t.dataset.trs, t.value); } }
    else if (a === 'st-add') { if (t.value) { addToStation(t.dataset.st, t.value); } }
  }

  function onClick(e) {
    var el = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!el) return;
    var a = el.dataset.action;
    if (!a) return;

    if (a === 'tab') { activeTab = el.dataset.tab; render(); return; }
    if (a === 'new-user') { toggleNewUser(el.dataset.id, el.checked); return; }
    if (a === 'add-user') { S.addUser(state); persistRender(); return; }
    if (a === 'undo') { undo(); return; }
    if (a === 'del-user') {
      if (confirm('Ștergi utilizatorul „' + nameOf(el.dataset.id) + '” (și apariția lui pe tronsoane/stații)? Poți anula cu „Anulează”.')) delUser(el.dataset.id);
      return;
    }
    if (a === 'add-line') { addLine(); return; }
    if (a === 'del-line') {
      pushUndo();
      state.linii = state.linii.filter(function (l) { return l.id !== el.dataset.id; });
      state.complexConfig.liniiIds = state.complexConfig.liniiIds.filter(function (x) { return x !== el.dataset.id; });
      state.complexConfig.liniiU2Ids = state.complexConfig.liniiU2Ids.filter(function (x) { return x !== el.dataset.id; });
      persistRender(); return;
    }
    if (a === 'add-tronson') { addTronson(el.dataset.line); return; }
    if (a === 'add-stalpi') { addStalpi(el.dataset.line); return; }
    if (a === 'del-tronson') { delTronson(el.dataset.line, el.dataset.trs); return; }
    if (a === 'trs-cost-manual') { setTronsonManual(el.dataset.line, el.dataset.trs, true); return; }
    if (a === 'trs-cost-auto') { setTronsonManual(el.dataset.line, el.dataset.trs, false); return; }
    if (a === 'line-bl-auto') { setLineBlAuto(el.dataset.line); return; }
    if (a === 'auto-all-tronson') { autoAllTronsoane(el.dataset.line); return; }
    if (a === 'trs-up') { moveTronson(el.dataset.line, el.dataset.trs, el.dataset.uid, -1); return; }
    if (a === 'trs-down') { moveTronson(el.dataset.line, el.dataset.trs, el.dataset.uid, 1); return; }
    if (a === 'trs-remove') { removeTronsonUser(el.dataset.line, el.dataset.trs, el.dataset.uid); return; }
    if (a === 'add-stat') { addStation(); return; }
    if (a === 'del-stat') {
      pushUndo();
      state.statii = state.statii.filter(function (s) { return s.id !== el.dataset.id; });
      state.complexConfig.statiiIds = state.complexConfig.statiiIds.filter(function (x) { return x !== el.dataset.id; });
      persistRender(); return;
    }
    if (a === 'st-up') { moveStation(el.dataset.st, el.dataset.uid, -1); return; }
    if (a === 'st-down') { moveStation(el.dataset.st, el.dataset.uid, 1); return; }
    if (a === 'st-remove') { removeStationUser(el.dataset.st, el.dataset.uid); return; }
    if (a === 'add-dev') { state.dezvoltator.dezvoltatori.push({ id: S.uid('dev'), nume: 'Dezvoltator', putere: 0 }); persistRender(); return; }
    if (a === 'del-dev') { pushUndo(); state.dezvoltator.dezvoltatori = state.dezvoltator.dezvoltatori.filter(function (d) { return d.id !== el.dataset.id; }); persistRender(); return; }
    if (a === 'calc') { runCalculation(); render(); focusResults(); return; }
    if (a === 'export-csv') { download('centralizator-compensatii.csv', toCsv(), 'text/csv;charset=utf-8'); return; }
    if (a === 'print') { window.print(); return; }
    if (a === 'save-json') { download('proiect-compensatii.json', JSON.stringify(state, null, 2), 'application/json'); return; }
    if (a === 'new') { replaceProject(S.emptyProject(), 'Ștergi proiectul curent? Poți anula cu „Anulează”.'); return; }
    if (a === 'demo-u4') { replaceProject(S.demoU4(), 'Încărcarea demo-ului înlocuiește proiectul curent. Continui? (Poți anula cu „Anulează”.)'); return; }
    if (a === 'demo-u6') { replaceProject(S.demoU6(), 'Încărcarea demo-ului înlocuiește proiectul curent. Continui? (Poți anula cu „Anulează”.)'); return; }
    if (a === 'cx-line') { toggleIn(state.complexConfig.liniiIds, el.dataset.id, el.checked); recompute(); saveNow(); return; }
    if (a === 'cx-line-u2') { toggleIn(state.complexConfig.liniiU2Ids, el.dataset.id, el.checked); recompute(); saveNow(); return; }
    if (a === 'cx-stat') { toggleIn(state.complexConfig.statiiIds, el.dataset.id, el.checked); recompute(); saveNow(); return; }
  }

  var MAX_IMPORT_BYTES = 5 * 1024 * 1024;

  function onChangeFile(e) {
    var input = e.target;
    var f = input.files && input.files[0];
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) {
      toast('Fișierul este prea mare (max. 5 MB).', 'error');
      input.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var imported;
      try {
        imported = S.migrate(JSON.parse(reader.result));
      } catch (err) {
        toast('Import eșuat: ' + (err && err.message ? err.message : 'fișier JSON invalid') + ' — proiectul curent nu a fost modificat.', 'error');
        input.value = '';
        return;
      }
      if (!confirm('Importul înlocuiește proiectul curent cu „' + f.name + '”. Continui? (Poți anula cu „Anulează”.)')) {
        input.value = '';
        return;
      }
      pushUndo();
      state = imported;
      deriveAll();
      results = null;
      // Randăm întâi: dacă datele sunt inutilizabile, nu ajung persistate.
      try {
        render();
      } catch (err2) {
        undo();
        toast('Import eșuat: structura proiectului este incompletă. Proiectul curent a fost păstrat.', 'error');
        input.value = '';
        return;
      }
      saveNow();
      toast('Proiect importat din „' + f.name + '”.', 'info');
      // Permite reimportul aceluiași fișier.
      input.value = '';
    };
    reader.onerror = function () { toast('Fișierul nu a putut fi citit.', 'error'); input.value = ''; };
    reader.readAsText(f);
  }

  // Înlocuiește tot proiectul (nou / demo), cu confirmare și posibilitate de undo.
  function replaceProject(next, message) {
    if (!confirm(message)) return;
    pushUndo();
    state = next;
    deriveAll();
    results = null;
    saveNow();
    render();
  }

  function focusResults() {
    var el = document.getElementById('results-region');
    if (el) { el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: false }); }
  }

  /* ----------------------- mutations ----------------------- */
  function persistRender() { recompute(); saveNow(); render(); }

  function toggleNewUser(id, on) {
    var sel = getNewIds();
    var i = sel.indexOf(id);
    if (on && i < 0) sel.push(id);
    if (!on && i >= 0) sel.splice(i, 1);
    setNewIds(sel);
    persistRender();
  }

  function delUser(id) {
    pushUndo();
    state.utilizatori = state.utilizatori.filter(function (u) { return u.id !== id; });
    state.linii.forEach(function (l) {
      l.tronsoane.forEach(function (t) { t.utilizatori = t.utilizatori.filter(function (x) { return x !== id; }); });
    });
    state.statii.forEach(function (s) { s.utilizatori = s.utilizatori.filter(function (x) { return x !== id; }); });
    setNewIds(getNewIds().filter(function (x) { return x !== id; }));
    persistRender();
  }

  function addLine() {
    state.linii.push({
      id: S.uid('lin'), nume: 'Linie ' + (state.linii.length + 1),
      IL: 0, L: 0, bL: 0, tronsoane: []
    });
    persistRender();
  }

  // Art. 15 alin. 1: al doilea circuit pe stâlpii liniei existente. Se modelează
  // ca un element cu cost propriu (costul stâlpilor utilizați în comun), în cote
  // egale între utilizatorii care folosesc stâlpii.
  function addStalpi(lineId) {
    var l = byId(state.linii, lineId);
    if (!l) return;
    l.tronsoane.push({
      id: S.uid('t'), tip: 'stalpi', nume: 'Stâlpi — al doilea circuit (art. 15 alin. 1)',
      lungime: 0, cost: 0, costManual: true, utilizatori: []
    });
    persistRender();
  }

  function addTronson(lineId) {
    var l = byId(state.linii, lineId);
    if (!l) return;
    l.tronsoane.push({ id: S.uid('t'), nume: 'Tronson ' + (l.tronsoane.length + 1), lungime: 0, cost: 0, costManual: false, utilizatori: [] });
    persistRender();
  }

  function delTronson(lineId, trsId) {
    var l = byId(state.linii, lineId);
    if (!l) return;
    pushUndo();
    l.tronsoane = l.tronsoane.filter(function (t) { return t.id !== trsId; });
    persistRender();
  }

  function setTronsonManual(lineId, trsId, manual) {
    var l = byId(state.linii, lineId); if (!l) return;
    var t = byId(l.tronsoane, trsId); if (!t) return;
    t.costManual = manual;
    // La trecerea pe „manual” preluăm valoarea calculată curentă, ca punct
    // de plecare, în loc să afișăm un câmp gol/stale.
    if (manual) t.cost = tronsonCost(l, t);
    else t.cost = (Number(t.lungime) || 0) * lineBl(l);
    persistRender();
  }

  function setLineBlAuto(lineId) {
    var l = byId(state.linii, lineId); if (!l) return;
    l.bLManual = false;
    l.bL = lineBl(l);
    persistRender();
  }

  function autoAllTronsoane(lineId) {
    var l = byId(state.linii, lineId); if (!l) return;
    l.tronsoane.forEach(function (t) {
      t.costManual = false;
      t.cost = (Number(t.lungime) || 0) * lineBl(l);
    });
    persistRender();
  }

  function addToTronson(lineId, trsId, uid) {
    var l = byId(state.linii, lineId); if (!l) return;
    var t = byId(l.tronsoane, trsId); if (!t) return;
    if (t.utilizatori.indexOf(uid) < 0) t.utilizatori.push(uid);
    persistRender();
  }

  function removeTronsonUser(lineId, trsId, uid) {
    var l = byId(state.linii, lineId); if (!l) return;
    var t = byId(l.tronsoane, trsId); if (!t) return;
    pushUndo();
    t.utilizatori = t.utilizatori.filter(function (x) { return x !== uid; });
    persistRender();
  }

  function moveTronson(lineId, trsId, uid, dir) {
    var l = byId(state.linii, lineId); if (!l) return;
    var t = byId(l.tronsoane, trsId); if (!t) return;
    moveInArray(t.utilizatori, uid, dir);
    persistRender();
  }

  function addStation() {
    state.statii.push({ id: S.uid('st'), nume: 'Stație ' + (state.statii.length + 1), Sn: 0, SnRezerva: 0, IT: 0, elementeComune: 0, intarire: false, utilizatori: [] });
    persistRender();
  }

  function addToStation(stId, uid) {
    var s = byId(state.statii, stId); if (!s) return;
    if (s.utilizatori.indexOf(uid) < 0) s.utilizatori.push(uid);
    persistRender();
  }

  function removeStationUser(stId, uid) {
    var s = byId(state.statii, stId); if (!s) return;
    pushUndo();
    s.utilizatori = s.utilizatori.filter(function (x) { return x !== uid; });
    persistRender();
  }

  function moveStation(stId, uid, dir) {
    var s = byId(state.statii, stId); if (!s) return;
    moveInArray(s.utilizatori, uid, dir);
    persistRender();
  }

  function moveInArray(arr, val, dir) {
    var i = arr.indexOf(val);
    if (i < 0) return;
    var j = i + dir;
    if (j < 0 || j >= arr.length) return;
    arr.splice(i, 1);
    arr.splice(j, 0, val);
  }

  function toggleIn(arr, id, on) {
    var i = arr.indexOf(id);
    if (on && i < 0) arr.push(id);
    if (!on && i >= 0) arr.splice(i, 1);
  }

  /* ----------------------- small html helpers ----------------------- */
  function section(title, body, helper) {
    var content = '<div class="panel-main"><h2>' + esc(title) + '</h2>' + body + '</div>';
    var side = helperPanel(helper);
    return '<section class="panel' + (side ? ' with-helper' : '') + '">' + content + side + '</section>';
  }
  function field(label, control) {
    return '<label class="field"><span>' + esc(label) + '</span>' + control + '</label>';
  }
  function aria(label) { return label ? ' aria-label="' + esc(label) + '"' : ''; }
  function text(bind, val, label) {
    return '<input type="text" data-bind="' + bind + '" value="' + esc(val) + '"' + aria(label) + '>';
  }
  // Valorile din calcul nu pot fi negative: min="0" (browserul semnalează,
  // iar validarea din aplicație blochează calculul).
  function number(bind, val, label) {
    var v = (val === undefined || val === null || val === 0 || val === '0' || val === '')
      ? '' : val;
    return '<input type="number" step="any" min="0" placeholder="0" data-bind="' + bind + '" value="' + esc(v) + '"' + aria(label) + '>';
  }
  function checkbox(bind, val, label) {
    return '<input type="checkbox" data-bind="' + bind + '"' + (val ? ' checked' : '') + aria(label) + '>';
  }
  function opts(pairs, val) {
    return pairs.map(function (p) {
      return '<option value="' + esc(p[0]) + '"' + (String(val) === String(p[0]) ? ' selected' : '') + '>' + esc(p[1]) + '</option>';
    }).join('');
  }

  global.AppUI = {
    init: init,
    onChangeFile: onChangeFile,
    render: render,
    ready: function () { return initPromise; },
    setProject: function (p) { state = p; saveNow(); deriveAll(); results = null; render(); },
    flushSave: flushSave,
    undo: undo,
    validate: function () { return V.validate(state); },
    getState: function () { return state; },
    buildConfig: buildConfig,
    setTab: function (t) { activeTab = t; render(); },
    calculate: function () { runCalculation(); render(); return results; },
    undoDepth: function () { return undoStack.length; },
    csv: toCsv
  };
  document.addEventListener('DOMContentLoaded', function () {
    init();
    document.addEventListener('change', function (e) {
      if (e.target && e.target.dataset && e.target.dataset.action === 'import-json') onChangeFile(e);
    });
  });
})(typeof window !== 'undefined' ? window : this);
