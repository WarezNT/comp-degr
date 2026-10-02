/*
 * UI — interfața aplicației: formulare, tabele, calcul și export.
 * Vanilla JS, fără build tooling.
 */
(function (global) {
  'use strict';

  var E = global.CompEngine;
  var S = global.AppState;

  var state = null;
  var activeTab = 'date';
  var results = null;
  var initPromise = Promise.resolve(null);

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function esc(v) {
    return String(v === undefined || v === null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(x) {
    return (Math.round((Number(x) || 0) * 100) / 100)
      .toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
            var Lb = Number(l.L) || 0;
            l.bL = Lb > 0 ? (Number(l.IL) || 0) / Lb : 0;
          } else {
            l.bLManual = true;
          }
        }
        // b_L se derivă automat din I_L / L dacă utilizatorul nu l-a fixat manual.
        if ((seg[2] === 'IL' || seg[2] === 'L') && !l.bLManual) {
          var L = Number(l.L) || 0;
          l.bL = L > 0 ? (Number(l.IL) || 0) / L : 0;
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
      utilizatori: orderByIds(s.utilizatori), puteri: puteri, primId: primId
    }, nouCfg);
  }

  // Primul utilizator (finanțatorul / receptorul compensațiilor). Un singur
  // utilizator poate avea acest rol; dacă sunt mai mulți bifați, îl luăm pe primul.
  function getPrimId() {
    var found = null;
    state.utilizatori.forEach(function (u) { if (u.prim && !found) found = u.id; });
    return found;
  }

  // Noii utilizatori (cei care plătesc). Pot fi mai mulți (racordați simultan).
  function getNewIds() {
    var prim = getPrimId();
    var ids = state.meta.nouUtilizatoriIds || [];
    // Compatibilitate cu vechiul câmp unic.
    if (!ids.length && state.meta.noulUtilizatorId) ids = [state.meta.noulUtilizatorId];
    var existing = {};
    state.utilizatori.forEach(function (u) { existing[u.id] = true; });
    return ids.filter(function (id) { return id && id !== prim && existing[id] !== undefined; });
  }

  function setNewIds(ids) {
    state.meta.nouUtilizatoriIds = ids.slice();
    state.meta.noulUtilizatorId = ids.length ? ids[0] : '';
  }

  // Există conflict dacă un utilizator nou este și prim utilizator.
  function roleConflict() {
    var prim = getPrimId();
    if (!prim) return false;
    return (state.meta.nouUtilizatoriIds || []).indexOf(prim) >= 0 ||
      state.meta.noulUtilizatorId === prim;
  }

  // Derivează b_L = I_L / L pentru liniile unde nu a fost fixat manual
  // și costul tronsoanelor în modul automat.
  function deriveAll() {
    (state.linii || []).forEach(function (l) {
      if (!l.bLManual) {
        var L = Number(l.L) || 0;
        l.bL = L > 0 ? (Number(l.IL) || 0) / L : 0;
      }
      (l.tronsoane || []).forEach(function (t) {
        if (!t.costManual) t.cost = (Number(t.lungime) || 0) * (Number(l.bL) || 0);
      });
    });
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
        var bL = Number(l.bL) || (Number(l.L) > 0 ? Number(l.IL) / Number(l.L) : 0);
        var cost = (t.costManual && t.cost !== '' && t.cost !== undefined && t.cost !== null)
          ? Number(t.cost)
          : (Number(t.lungime) || 0) * bL;
        out.push({
          id: t.id,
          nume: (l.nume ? l.nume + ' · ' : '') + (t.nume || ''),
          lungime: t.lungime,
          cost: cost,
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
      // Comasează toate stațiile configurate.
      var statii = state.statii.map(function (s) { return stationCfg(s, puteri, primId, nouCfg); });
      if (statii.length === 1) return mergeCfg(statii[0], nouCfg);
      return { linii: [], statii: statii, nouUtilizatori: nouList, nouUtilizator: nouCfg.nouUtilizator };
    }
    if (model === 'complex') {
      var sel = state.complexConfig;
      var liniiU1 = state.linii.filter(function (l) { return sel.liniiIds.indexOf(l.id) >= 0; });
      var liniiU2 = state.linii.filter(function (l) { return sel.liniiU2Ids.indexOf(l.id) >= 0; });
      var st = state.statii.filter(function (s) { return sel.statiiIds.indexOf(s.id) >= 0; });
      // Echipamentele comune (varianta 2) = suma echipamentelor stațiilor bifate.
      var ec = st.reduce(function (sum, s) { return sum + (Number(s.elementeComune) || 0); }, 0);
      return {
        varianta: Number(sel.varianta) || 1,
        liniiU1: liniiU1.map(function (l) {
          return mergeCfg({ bL: Number(l.bL) || 0, tronsoane: lineTronsoane([l]), primId: primId }, nouCfg);
        }),
        liniiU2: liniiU2.map(function (l) {
          return mergeCfg({ bL: Number(l.bL) || 0, tronsoane: lineTronsoane([l]), primId: primId }, nouCfg);
        }),
        statii: st.map(function (s) { return stationCfg(s, puteri, primId, nouCfg); }),
        echipamenteComune: ec,
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

  function runCalculation() {
    if (roleConflict()) {
      results = { error: 'Primul utilizator nu poate fi și utilizator nou (cel care plătește). Scoate-l din lista de utilizatori noi.' };
      return;
    }
    var model = state.meta.model;
    var nouList = getNewIds();
    var res;
    if (model === 'station') {
      // Anexa 2: însumează toate stațiile (indiferent de număr).
      var puteri = {};
      state.utilizatori.forEach(function (u) { puteri[u.id] = Number(u.putere) || 0; });
      var primId = getPrimId();
      var payments = {};
      state.statii.forEach(function (s) {
        var sub = E.computeStation(stationCfg(s, puteri, primId, { nouUtilizatori: nouList, nouUtilizator: nouList.length === 1 ? nouList[0] : null }));
        E.mergePayments(payments, sub.payments);
      });
      res = { model: 'station', nouUtilizator: nouList.length === 1 ? nouList[0] : null, nouUtilizatori: nouList, payments: payments };
    } else {
      res = E.compute(model, buildConfig(model));
    }
    if (!res.nouUtilizatori) res.nouUtilizatori = nouList;
    results = res;

    var central = null;
    if (res.model === 'line' || res.model === 'station' || res.model === 'complex') {
      central = E.centralizator(res.payments, nouList, state.utilizatori, state.meta.tva, state.meta.withTva);
      res.totals = E.totals(res.payments, state.utilizatori);
    }
    results.central = central;
    results.conditions = E.checkConditions(state.conditii);
  }

  /* ----------------------- rendering ----------------------- */
  function render() {
    document.getElementById('app').innerHTML =
      renderHeader() +
      renderTabs() +
      '<main class="content">' + renderTab() + '</main>';
  }

  function renderHeader() {
    return '' +
      '<header class="topbar">' +
      '<div class="brand"><span class="logo">CD</span>' +
      '<div><h1>Compensatii bănești — racordare în etape diferite</h1>' +
      '<p class="sub">Metodologie ANRE 2015 · Ordinul nr. 180/2015 · instalație comună, rețele electrice de interes public</p></div></div>' +
      '<div class="topbar-actions">' +
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
    return '<nav class="tabs">' + tabs.map(function (t) {
      return '<button data-action="tab" data-tab="' + t[0] + '" class="' + (activeTab === t[0] ? 'active' : '') + '">' + t[1] + '</button>';
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
      field('Cotă TVA (%)', '<input type="number" step="0.01" min="0" data-bind="meta.tva" value="' + esc(m.tva) + '">') +
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
        '<input type="checkbox" data-action="new-user" data-id="' + u.id + '"' +
        (checked ? ' checked' : '') + (isPrim ? ' disabled' : '') + '> ' + label + '</label>';
    }).join('') + '</div>' +
    (sel.length > 1 ? '<p class="hint">Fiecare utilizator nou plătește pe tronsonul/stația pe care este adăugat. Se pot selecta mai mulți.</p>' : '');
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
        '<td>' + text('user.' + u.id + '.codPA', u.codPA) + '</td>' +
        '<td>' + text('user.' + u.id + '.nume', u.nume) + '</td>' +
        '<td>' + number('user.' + u.id + '.putere', u.putere) + '</td>' +
        '<td><input type="date" data-bind="user.' + u.id + '.dataATR" value="' + esc(u.dataATR) + '"></td>' +
        '<td><input type="date" data-bind="user.' + u.id + '.dataTR" value="' + esc(u.dataTR) + '"></td>' +
        '<td><select data-bind="user.' + u.id + '.tipClient">' +
          opts([['noncasnic', 'Non-casnic'], ['casnic', 'Casnic']], u.tipClient) + '</select></td>' +
        '<td class="center">' + checkbox('user.' + u.id + '.prim', u.prim) + '</td>' +
        '<td><button class="btn tiny danger" data-action="del-user" data-id="' + u.id + '">Șterge</button></td>' +
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
        { field: 'Data ATR', desc: 'Data emiterii avizului tehnic de racordare. Ajută la verificarea termenului de 5/10 ani (art. 8).' },
        { field: 'Data achitare TR', desc: 'Data la care a fost achitat tariful de racordare. Condiție pentru a primi compensație.' },
        { field: 'Tip client', desc: 'Casnic sau non-casnic. Pentru client casnic termenul de la art. 8 se extinde la 10 ani.' },
        { field: 'Prim utilizator', desc: 'Bifează utilizatorul care a finanțat inițial instalația (cel care primește compensații la stații/PT).' }
      ],
      note: 'Nu uita să selectezi „Noul utilizator” la pasul 1.',
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
      var bL = Number(l.bL) || 0;
      return '<div class="card">' +
        '<div class="card-head">' +
          '<input class="line-title" data-bind="line.' + l.id + '.nume" value="' + esc(l.nume) + '" placeholder="Denumire linie">' +
          '<button class="btn tiny danger" data-action="del-line" data-id="' + l.id + '">Șterge linia</button>' +
        '</div>' +
        '<div class="row3">' +
          field('① Cost lucrări linie I_L (lei)', number('line.' + l.id + '.IL', l.IL)) +
          field('② Lungime totală L (m)', number('line.' + l.id + '.L', l.L)) +
          field('③ Cost specific b_L (lei/m) — automat = I_L / L',
            number('line.' + l.id + '.bL', l.bL) +
            '<button type="button" class="linkish bL-auto" data-action="line-bl-auto" data-line="' + l.id + '"' +
            (l.bLManual ? '' : ' hidden') + '>↺ recalcul automat din I_L / L</button>') +
        '</div>' +
        '<p class="hint">Costul fiecărui tronson se calculează automat ca <strong>lungime × b_L = ' +
          '<span data-line-bl="' + l.id + '">' + money(bL) + '</span> lei/m</strong>. ' +
          'Completează doar lungimea tronsoanelor; poți trece pe „manual” dacă ai valoarea exactă. ' +
          '<span data-line-status="' + l.id + '">' + lineStatusHtml(l) + '</span></p>' +
        '<div class="toolbar"><strong>Tronsoane</strong>' +
          '<button class="btn tiny" data-action="add-tronson" data-line="' + l.id + '">+ Tronson</button>' +
          '<button class="btn tiny ghost" data-action="auto-all-tronson" data-line="' + l.id + '" title="Recalculează toate tronsoanele din lungime × b_L">↺ Recalculează toate</button></div>' +
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
    var trsSum = (l.tronsoane || []).reduce(function (s, t) { return s + tronsonCost(l, t); }, 0);
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
        { field: 'Utilizatori folosesc tronsonul', desc: 'Adaugă utilizatorii care trec prin acel tronson. Ordinea (↑/↓) = ordinea racordării, primul e finanțatorul.' }
      ],
      note: 'Un tronson folosit de mai mulți utilizatori împarte costul în cote egale; cel care se racordează ulterior plătește diferența.',
      refs: 'Ref.: Anexa nr. 1 și art. 12 din Metodologie.'
    };
  }

  function tronsonCost(l, t) {
    if (t.costManual && t.cost !== '' && t.cost !== undefined && t.cost !== null) return Number(t.cost) || 0;
    return (Number(t.lungime) || 0) * (Number(l.bL) || 0);
  }

  function tronsonRow(l, t) {
    var chips = (t.utilizatori || []).map(function (uid) {
      return '<span class="chip">' + esc(nameOf(uid)) +
        '<button class="mini" data-action="trs-up" data-line="' + l.id + '" data-trs="' + t.id + '" data-uid="' + uid + '" title="sus">↑</button>' +
        '<button class="mini" data-action="trs-down" data-line="' + l.id + '" data-trs="' + t.id + '" data-uid="' + uid + '" title="jos">↓</button>' +
        '<button class="mini danger" data-action="trs-remove" data-line="' + l.id + '" data-trs="' + t.id + '" data-uid="' + uid + '" title="elimină">✕</button>' +
      '</span>';
    }).join(' ');
    var avail = state.utilizatori.filter(function (u) { return (t.utilizatori || []).indexOf(u.id) < 0; });
    var addSel = '<select class="add-user-sel" data-action="trs-add" data-line="' + l.id + '" data-trs="' + t.id + '">' +
      '<option value="">+ utilizator…</option>' +
      avail.map(function (u) { return '<option value="' + u.id + '">' + esc(u.nume || u.codPA) + '</option>'; }).join('') +
      '</select>';
    var costVal = tronsonCost(l, t);
    var costCell;
    if (t.costManual) {
      costCell = number('tronson.' + l.id + '.' + t.id + '.cost', t.cost) +
        '<div class="mini-actions"><button class="linkish" data-action="trs-cost-auto" data-line="' + l.id + '" data-trs="' + t.id + '">↺ automat</button></div>';
    } else {
      costCell = '<span class="auto-val" data-derived-cost="' + l.id + '-' + t.id + '" title="Calculat automat: lungime × b_L">' + money(costVal) + ' lei</span>' +
        '<div class="mini-actions"><button class="linkish" data-action="trs-cost-manual" data-line="' + l.id + '" data-trs="' + t.id + '">✎ manual</button></div>';
    }
    return '<tr>' +
      '<td>' + text('tronson.' + l.id + '.' + t.id + '.nume', t.nume) + '</td>' +
      '<td>' + number('tronson.' + l.id + '.' + t.id + '.lungime', t.lungime) + '</td>' +
      '<td class="cost-cell">' + costCell + '</td>' +
      '<td><div class="chips">' + (chips || '<span class="muted">—</span>') + '</div>' + addSel + '</td>' +
      '<td><button class="btn tiny danger" data-action="del-tronson" data-line="' + l.id + '" data-trs="' + t.id + '">Șterge</button></td>' +
      '</tr>';
  }

  function renderStations() {
    var body = state.statii.map(function (s) {
      var chips = (s.utilizatori || []).map(function (uid) {
        return '<span class="chip">' + esc(nameOf(uid)) +
          '<button class="mini" data-action="st-up" data-st="' + s.id + '" data-uid="' + uid + '" title="sus">↑</button>' +
          '<button class="mini" data-action="st-down" data-st="' + s.id + '" data-uid="' + uid + '" title="jos">↓</button>' +
          '<button class="mini danger" data-action="st-remove" data-st="' + s.id + '" data-uid="' + uid + '" title="elimină">✕</button>' +
        '</span>';
      }).join(' ');
      var avail = state.utilizatori.filter(function (u) { return (s.utilizatori || []).indexOf(u.id) < 0; });
      var SnEf = (Number(s.Sn) || 0) - (Number(s.SnRezerva) || 0);
      return '<div class="card"><div class="card-head">' +
        '<input class="line-title" data-bind="stat.' + s.id + '.nume" value="' + esc(s.nume) + '" placeholder="Denumire stație / PT">' +
        '<button class="btn tiny danger" data-action="del-stat" data-id="' + s.id + '">Șterge</button></div>' +
        '<div class="row3">' +
          field('Capacitate nominală S_n (kVA)', number('stat.' + s.id + '.Sn', s.Sn)) +
          field('Transformator de rezervă N-1 (kVA) — exclus din b_T', number('stat.' + s.id + '.SnRezerva', s.SnRezerva)) +
          field('Cost lucrări I_T (lei)', number('stat.' + s.id + '.IT', s.IT)) +
        '</div>' +
        '<div class="row2">' +
          field('Echipamente comune, altele decât transformatoare (lei)', number('stat.' + s.id + '.elementeComune', s.elementeComune)) +
        '</div>' +
        '<div class="toolbar"><strong>Utilizatori (primul utilizator se bifează la pasul 2 „Utilizatori”)</strong></div>' +
        '<div class="chips">' + (chips || '<span class="muted">—</span>') + '</div>' +
        '<select data-action="st-add" data-st="' + s.id + '"><option value="">+ utilizator…</option>' +
          avail.map(function (u) { return '<option value="' + u.id + '">' + esc(u.nume || u.codPA) + '</option>'; }).join('') +
        '</select>' +
        '<p class="hint">b_T = I_T / S_n efectiv = ' + money(Number(s.IT) || 0) + ' / ' + money(SnEf) +
          ' = <strong>' + money(SnEf > 0 ? (Number(s.IT) || 0) / SnEf : 0) + ' lei/kVA</strong>' +
          (Number(s.SnRezerva) > 0 ? ' (S_n efectiv exclude transformatorul de rezervă, art. 15 alin. 4)' : '') +
          '. Compensația fiecărui utilizator nou = puterea sa aprobată × b_T.</p>' +
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
      return '<label class="chk"><input type="checkbox" data-action="cx-line" data-id="' + l.id + '"' +
        (c.liniiIds.indexOf(l.id) >= 0 ? ' checked' : '') + '> ' + esc(l.nume) + '</label>';
    }).join('') || '<span class="muted">Nu există linii configurate.</span>';
    var liniiU2Chk = state.linii.map(function (l) {
      return '<label class="chk"><input type="checkbox" data-action="cx-line-u2" data-id="' + l.id + '"' +
        (c.liniiU2Ids.indexOf(l.id) >= 0 ? ' checked' : '') + '> ' + esc(l.nume) + '</label>';
    }).join('') || '<span class="muted">—</span>';
    var v = Number(c.varianta) || 1;
    var statiiChk = state.statii.map(function (s) {
      return '<label class="chk"><input type="checkbox" data-action="cx-stat" data-id="' + s.id + '"' +
        (c.statiiIds.indexOf(s.id) >= 0 ? ' checked' : '') + '> ' + esc(s.nume) + '</label>';
    }).join('') || '<span class="muted">Nu există stații configurate.</span>';

    // Descrierea componentelor în funcție de variantă.
    var compDesc = {
      1: 'Varianta 1 — noul utilizator se racordează pe linia U1, în amonte de stație. Se aplică <strong>doar Anexa 1</strong> pentru l_U1.',
      2: 'Varianta 2 — racordare la bara U1 a stației. Se aplică <strong>Anexa 1 (l_U1)</strong> + <strong>echipamentele stației</strong> (altele decât transformatoarele), în cote egale (art. 12 alin. 1).',
      3: 'Varianta 3 — racordare pe linia U2, în aval de stație. Se aplică <strong>Anexa 1 (l_U1)</strong> + <strong>Anexa 2 (stație/PT)</strong>.',
      4: 'Varianta 4 — racordare pe linia U2, mai departe. Se aplică <strong>Anexa 1 (l_U1)</strong> + <strong>Anexa 2 (stație/PT)</strong> + <strong>Anexa 1 (l_U2)</strong>.'
    }[v];

    var staBlock = (v === 3 || v === 4)
      ? '<div class="card"><strong>Stații / posturi de transformare (Anexa 2)</strong><div class="list-chk">' + statiiChk + '</div></div>'
      : (v === 2
        ? '<div class="card"><strong>Echipamente comune ale stației</strong><p class="hint">Valorile „Echipamente comune" din stații se împart în cote egale între utilizatori. Bifează stația folosită:</p><div class="list-chk">' + statiiChk + '</div></div>'
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
        '<td>' + text('devitem.' + x.id + '.nume', x.nume) + '</td>' +
        '<td>' + number('devitem.' + x.id + '.putere', x.putere) + '</td>' +
        '<td><button class="btn tiny danger" data-action="del-dev" data-id="' + x.id + '">Șterge</button></td>' +
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
    var condHtml = E.checkConditions(c).map(function (x, i) {
      var keys = ['primCapacitateMaiMare', 'capacitateDisponibila', 'aniDeLaPF', 'solutieComuna', 'tarifAchitatIntegral'];
      var k = keys[i];
      if (k === 'aniDeLaPF') {
        return '<li class="' + (x.ok ? 'ok' : 'bad') + '">' + esc(x.mesaj) +
          ' <input type="number" min="0" data-bind="cond.aniDeLaPF" value="' + esc(c.aniDeLaPF) + '" class="inline-num"></li>';
      }
      return '<li class="' + (x.ok ? 'ok' : 'bad') + '"><label class="chk"><input type="checkbox" data-bind="cond.' + k + '"' + (c[k] ? ' checked' : '') + '> ' + esc(x.mesaj) + '</label></li>';
    }).join('');

    var warnings = readinessWarnings();
    var warnHtml = warnings.length
      ? '<div class="card warn-card"><strong>Înainte de calcul</strong><ul class="conds">' +
        warnings.map(function (w) { return '<li class="bad">' + esc(w) + '</li>'; }).join('') + '</ul></div>'
      : '';

    var resultHtml;
    if (results && results.error) {
      resultHtml = '<div class="card warn-card"><strong>Nu se poate calcula</strong><p>' + esc(results.error) + '</p></div>';
    } else {
      resultHtml = results ? renderResultsBody() : '<p class="muted">Apasă butonul „Calculează compensațiile”.</p>';
    }

    return section('Rezultate',
      '<div class="toolbar">' +
        '<button class="btn primary" data-action="calc">Calculează compensațiile</button>' +
        '<button class="btn ghost" data-action="export-csv"' + (results ? '' : ' disabled') + '>Export CSV</button>' +
        '<button class="btn ghost" data-action="print"' + (results ? '' : ' disabled') + '>Printează / PDF</button>' +
      '</div>' + warnHtml +
      '<div class="card"><strong>Verificarea condițiilor cumulative (Art. 8)</strong><ul class="conds">' + condHtml + '</ul></div>' +
      resultHtml,
      helperResults()
    );
  }

  function helperResults() {
    return {
      title: 'Ce faci în acest pas',
      intro: 'Bifezi condițiile legale, apeși „Calculează compensațiile” și verifici centralizatorul.',
      items: [
        { field: 'Verificarea condițiilor (Art. 8)', desc: 'Bifează situațiile reale. Compensația se datorează numai dacă TOATE condițiile sunt îndeplinite cumulativ.' },
        { field: 'Ani de la punerea în funcțiune', desc: 'Introdu numărul de ani. Termen: 5 ani (10 ani pentru client casnic).' },
        { field: 'Calculează compensațiile', desc: 'Generează centralizatorul: cine plătește cui, cu și fără TVA.' },
        { field: 'Export CSV', desc: 'Descarcă centralizatorul pentru Excel (separator „;”, zecimale cu virgulă).' },
        { field: 'Printează / PDF', desc: 'Tipărește sau salvează ca PDF, doar conținutul rezultatelor.' }
      ],
      note: 'Noul utilizator plătește fiecare utilizator anterior; totalul pe coloane = suma primită de fiecare.',
      refs: 'Ref.: art. 7–8 și art. 12–16 din Metodologie.'
    };
  }

  function readinessWarnings() {
    var w = [];
    var model = state.meta.model;
    if (state.utilizatori.length < 2) w.push('Adaugă cel puțin 2 utilizatori (unul este utilizator nou) în tabul „2 · Utilizatori”.');
    if (!getPrimId()) w.push('Bifează primul utilizator (finanțatorul, cel care primește compensații) în tabul „2 · Utilizatori”.');
    if (!getNewIds().length) w.push('Bifează cel puțin un utilizator nou (cel care plătește) în tabul „1 · Date generale”.');
    if (roleConflict()) w.push('Un utilizator nou nu poate fi și primul utilizator. Scoate-l din noii utilizatori.');
    if (model === 'line') {
      if (!state.linii.length) w.push('Adaugă cel puțin o linie în tabul „3 · Instalație”.');
      var trsCuUser = 0;
      state.linii.forEach(function (l) {
        (l.tronsoane || []).forEach(function (t) { if ((t.utilizatori || []).length) trsCuUser++; });
      });
      if (state.linii.length && !trsCuUser) w.push('Adaugă utilizatori pe tronsoane (butonul „+ utilizator…” din tabelul tronsoanelor).');
    } else if (model === 'station') {
      if (!state.statii.length) w.push('Adaugă o stație / PT în tabul „3 · Instalație”.');
    } else if (model === 'complex') {
      if (!state.complexConfig.liniiIds.length && !state.complexConfig.statiiIds.length) w.push('Selectează cel puțin o linie sau o stație în tabul „3 · Instalație”.');
    } else if (model === 'developer') {
      if (!(state.dezvoltator.dezvoltatori || []).length) w.push('Adaugă cel puțin un dezvoltator în tabul „3 · Instalație”.');
    }
    return w;
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

    var titlu;
    if (central.newList.length === 1) {
      titlu = 'Centralizator compensații — plătite de <em>' + esc(nameOf(central.newList[0])) + '</em>';
    } else {
      titlu = 'Centralizator compensații — plătite de utilizatorii noi: <em>' +
        esc(central.newList.map(nameOf).join(', ')) + '</em>';
    }

    return '<div class="card highlight">' +
      '<h3>' + titlu + '</h3>' +
      '<p class="hint">Utilizatorii noi plătesc compensații utilizatorilor racordați anterior (primul utilizator este receptorul principal).</p>' +
      (blocante ? '<p class="warn">Atenție: ' + blocante + ' condiții (Art. 8) nu sunt îndeplinite. Compensația se calculează doar dacă sunt îndeplinite cumulativ.</p>' : '<p class="okmsg">Toate condițiile Art. 8 sunt îndeplinite.</p>') +
      '<div class="table-wrap"><table class="grid"><thead><tr>' +
      (multi ? '<th>Cod PA plătitor</th><th>Plătitor (nou)</th>' : '') +
      '<th>Cod PA</th><th>Nume / denumire</th><th>Valoare fără TVA</th><th>Valoare cu TVA</th></tr></thead>' +
      '<tbody>' + rowHtml + '</tbody><tfoot><tr class="total"><td colspan="' + (multi ? 4 : 2) + '">Total</td><td class="num">' +
        money(central.totalFaraTVA) + '</td><td class="num">' + money(central.totalCuTVA) + '</td></tr></tfoot></table></div>' +
      renderPerNou(central, multi) +
      '<p class="hint">Semnat: elaborator operator de rețea. Valorile în ' + (state.meta.operator || '') + '</p>' +
      '</div>' + renderDetails();
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

  function renderDetails() {
    var res = results;
    if (res.model === 'line') {
      var det = res.tronsoaneDetalii.map(function (t) {
        var plati = t.plati.map(function (p) {
          return '<li>' + esc(nameOf(p.deLa)) + ' → ' + esc(nameOf(p.catre)) + ': <strong>' + money(p.suma) + '</strong></li>';
        }).join('');
        return '<div class="det"><strong>' + esc(t.nume || t.id) + '</strong> — cost ' + money(t.cost) +
          ' lei, ' + t.nrUtilizatori + ' utilizatori<br><ul>' + (plati || '<li class="muted">fără compensații</li>') + '</ul></div>';
      }).join('');
      return '<details class="card"><summary>Detaliu pe tronsoane</summary>' + det + '</details>';
    }
    if (res.model === 'station') {
      var rez = Number(res.SnRezerva) > 0
        ? '<br>S_n efectiv = ' + money(res.Sn) + ' − ' + money(res.SnRezerva) + ' (rezervă N-1) = ' + money(res.SnEfectiv) + ' kVA'
        : '';
      return '<details class="card"><summary>Detaliu stație</summary>' +
        '<p>b_T = I_T / S_n = ' + money(res.IT) + ' / ' + money(res.SnEfectiv) + ' = <strong>' + money(res.bT) + ' lei/kVA</strong>' + rez + '</p>' +
        '</details>';
    }
    if (res.model === 'complex') {
      var comps = res.components.map(function (c) {
        if (c.model === 'station') return 'Anexa 2 — ' + money(c.bT) + ' lei/kVA';
        return 'Anexa 1 — ' + money((c.tronsoaneDetalii || []).reduce(function (s, t) { return s + (Number(t.cost) || 0); }, 0)) + ' lei';
      });
      return '<details class="card" open><summary>Varianta ' + esc(res.varianta) + ' — componente însumate</summary>' +
        '<ul>' + (comps.length ? comps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') : '<li class="muted">fără componente</li>') + '</ul></details>';
    }
    return '';
  }

  /* ----------------------- export ----------------------- */
  function toCsv() {
    var central = results && results.central;
    if (!central) return '';
    var multi = central.newList.length > 1;
    var lines = [];
    lines.push((multi ? ['Cod PA platitor', 'Platitor nou', 'Cod PA', 'Nume', 'Valoare fara TVA', 'Valoare cu TVA']
                      : ['Cod PA', 'Nume', 'Valoare fara TVA', 'Valoare cu TVA']).join(';'));
    central.rows.forEach(function (r) {
      var cols = multi
        ? [r.deLaCodPA, '"' + (r.deLaNume || '').replace(/"/g, '""') + '"', r.codPA, '"' + (r.nume || '').replace(/"/g, '""') + '"']
        : [r.codPA, '"' + (r.nume || '').replace(/"/g, '""') + '"'];
      cols.push(String(r.faraTVA).replace('.', ','), String(r.cuTVA).replace('.', ','));
      lines.push(cols.join(';'));
    });
    var tf = ['Total'];
    if (multi) tf.push('');
    tf.push('', String(central.totalFaraTVA).replace('.', ','), String(central.totalCuTVA).replace('.', ','));
    lines.push(tf.join(';'));
    return lines.join('\r\n');
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
    document.addEventListener('click', onClick);
    document.addEventListener('change', onChange);
    document.addEventListener('input', onInput);
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
    S.save(state);

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
      var c = document.querySelector('[data-derived-cost="' + lineId + '-' + t.id + '"]');
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
      S.save(state);
      if (path === 'meta.model' || /^cond\./.test(path) || mPrim) { render(); return; }
      if (path === 'meta.withTva' || path === 'meta.tva') { if (results) { runCalculation(); } render(); return; }
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
    if (a === 'del-user') { delUser(el.dataset.id); return; }
    if (a === 'add-line') { addLine(); return; }
    if (a === 'del-line') { state.linii = state.linii.filter(function (l) { return l.id !== el.dataset.id; }); persistRender(); return; }
    if (a === 'add-tronson') { addTronson(el.dataset.line); return; }
    if (a === 'del-tronson') { delTronson(el.dataset.line, el.dataset.trs); return; }
    if (a === 'trs-cost-manual') { setTronsonManual(el.dataset.line, el.dataset.trs, true); return; }
    if (a === 'trs-cost-auto') { setTronsonManual(el.dataset.line, el.dataset.trs, false); return; }
    if (a === 'line-bl-auto') { setLineBlAuto(el.dataset.line); return; }
    if (a === 'auto-all-tronson') { autoAllTronsoane(el.dataset.line); return; }
    if (a === 'trs-up') { moveTronson(el.dataset.line, el.dataset.trs, el.dataset.uid, -1); return; }
    if (a === 'trs-down') { moveTronson(el.dataset.line, el.dataset.trs, el.dataset.uid, 1); return; }
    if (a === 'trs-remove') { removeTronsonUser(el.dataset.line, el.dataset.trs, el.dataset.uid); return; }
    if (a === 'add-stat') { addStation(); return; }
    if (a === 'del-stat') { state.statii = state.statii.filter(function (s) { return s.id !== el.dataset.id; }); persistRender(); return; }
    if (a === 'st-up') { moveStation(el.dataset.st, el.dataset.uid, -1); return; }
    if (a === 'st-down') { moveStation(el.dataset.st, el.dataset.uid, 1); return; }
    if (a === 'st-remove') { removeStationUser(el.dataset.st, el.dataset.uid); return; }
    if (a === 'add-dev') { state.dezvoltator.dezvoltatori.push({ id: S.uid('dev'), nume: 'Dezvoltator', putere: 0 }); persistRender(); return; }
    if (a === 'del-dev') { state.dezvoltator.dezvoltatori = state.dezvoltator.dezvoltatori.filter(function (d) { return d.id !== el.dataset.id; }); persistRender(); return; }
    if (a === 'calc') { runCalculation(); render(); return; }
    if (a === 'export-csv') { download('centralizator-compensatii.csv', toCsv(), 'text/csv;charset=utf-8'); return; }
    if (a === 'print') { window.print(); return; }
    if (a === 'save-json') { download('proiect-compensatii.json', JSON.stringify(state, null, 2), 'application/json'); return; }
    if (a === 'new') { if (confirm('Ștergi proiectul curent?')) { state = S.emptyProject(); S.save(state); render(); } return; }
    if (a === 'demo-u4') { state = S.demoU4(); S.save(state); results = null; render(); return; }
    if (a === 'demo-u6') { state = S.demoU6(); S.save(state); results = null; render(); return; }
    if (a === 'cx-line') { toggleIn(state.complexConfig.liniiIds, el.dataset.id, el.checked); S.save(state); return; }
    if (a === 'cx-line-u2') { toggleIn(state.complexConfig.liniiU2Ids, el.dataset.id, el.checked); S.save(state); return; }
    if (a === 'cx-stat') { toggleIn(state.complexConfig.statiiIds, el.dataset.id, el.checked); S.save(state); return; }
  }

  function onChangeFile(e) {
    var f = e.target.files && e.target.files[0];
    if (!f) return;
    var reader = new FileReader();
    reader.onload = function () {
      try { state = S.migrate(JSON.parse(reader.result)); S.save(state); deriveAll(); results = null; render(); }
      catch (err) { alert('Fișier JSON invalid.'); }
    };
    reader.readAsText(f);
  }

  /* ----------------------- mutations ----------------------- */
  function persistRender() { S.save(state); render(); }

  function toggleNewUser(id, on) {
    var sel = getNewIds();
    var i = sel.indexOf(id);
    if (on && i < 0) sel.push(id);
    if (!on && i >= 0) sel.splice(i, 1);
    setNewIds(sel);
    persistRender();
  }

  function delUser(id) {
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

  function addTronson(lineId) {
    var l = byId(state.linii, lineId);
    if (!l) return;
    l.tronsoane.push({ id: S.uid('t'), nume: 'Tronson ' + (l.tronsoane.length + 1), lungime: 0, cost: 0, costManual: false, utilizatori: [] });
    persistRender();
  }

  function delTronson(lineId, trsId) {
    var l = byId(state.linii, lineId);
    if (!l) return;
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
    else t.cost = (Number(t.lungime) || 0) * (Number(l.bL) || 0);
    persistRender();
  }

  function setLineBlAuto(lineId) {
    var l = byId(state.linii, lineId); if (!l) return;
    l.bLManual = false;
    var L = Number(l.L) || 0;
    l.bL = L > 0 ? (Number(l.IL) || 0) / L : 0;
    persistRender();
  }

  function autoAllTronsoane(lineId) {
    var l = byId(state.linii, lineId); if (!l) return;
    l.tronsoane.forEach(function (t) {
      t.costManual = false;
      t.cost = (Number(t.lungime) || 0) * (Number(l.bL) || 0);
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
    state.statii.push({ id: S.uid('st'), nume: 'Stație ' + (state.statii.length + 1), Sn: 0, SnRezerva: 0, IT: 0, elementeComune: 0, utilizatori: [] });
    persistRender();
  }

  function addToStation(stId, uid) {
    var s = byId(state.statii, stId); if (!s) return;
    if (s.utilizatori.indexOf(uid) < 0) s.utilizatori.push(uid);
    persistRender();
  }

  function removeStationUser(stId, uid) {
    var s = byId(state.statii, stId); if (!s) return;
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
  function text(bind, val) {
    return '<input type="text" data-bind="' + bind + '" value="' + esc(val) + '">';
  }
  function number(bind, val) {
    var v = (val === undefined || val === null || val === 0 || val === '0' || val === '')
      ? '' : val;
    return '<input type="number" step="0.01" placeholder="0" data-bind="' + bind + '" value="' + esc(v) + '">';
  }
  function checkbox(bind, val) {
    return '<input type="checkbox" data-bind="' + bind + '"' + (val ? ' checked' : '') + '>';
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
    setProject: function (p) { state = p; S.save(state); deriveAll(); results = null; render(); },
    getState: function () { return state; },
    buildConfig: buildConfig,
    setTab: function (t) { activeTab = t; render(); },
    calculate: function () { runCalculation(); render(); return results; }
  };
  document.addEventListener('DOMContentLoaded', function () {
    init();
    document.addEventListener('change', function (e) {
      if (e.target && e.target.dataset && e.target.dataset.action === 'import-json') onChangeFile(e);
    });
  });
})(typeof window !== 'undefined' ? window : this);
