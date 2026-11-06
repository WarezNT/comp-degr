/*
 * Store — starea aplicației și acțiunile asupra ei (fără randare). Interfața (js/ui/*)
 * citește din `AppStore` și apelează acțiunile; după fiecare modificare store-ul
 * recalculează rezultatele (dacă există), programează salvarea și cere re-randarea.
 */
(function (global) {
  'use strict';

  var S = global.AppState;
  var C = global.AppCalc;
  var G = global.AppGuide;

  var UNDO_MAX = 20;
  var MAX_IMPORT_BYTES = 5 * 1024 * 1024;
  var GUIDE_PREF_KEY = 'comp-degr:ghid';
  var LAST_SAVE_KEY = 'comp-degr:last-save';

  function readLastSaved() {
    try {
      var v = global.localStorage && global.localStorage.getItem(LAST_SAVE_KEY);
      if (!v) return null;
      var d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    } catch (e) { return null; }
  }
  function writeLastSaved(d) {
    try {
      if (global.localStorage) global.localStorage.setItem(LAST_SAVE_KEY, d.toISOString());
    } catch (e) { /* localStorage indisponibil */ }
  }

  var store = {
    state: null,          // proiectul curent (null = ecran de start)
    results: null,        // ultimul rezultat (sau { error, ... })
    tab: 'date',
    guide: { on: true, auto: false, skipped: {}, current: null },   // auto = mută focusul automat la pasul următor
    toastMsg: null,       // { msg, kind }
    saveStatus: 'ok',     // 'ok' | 'pending' | 'failed'
    lastSavedAt: readLastSaved(),   // momentul ultimei salvări reușite
    undoStack: [],
    projectSeq: 0,        // crește la încărcarea unui alt proiect (nu la undo)
    norma: null,          // id-ul regulii afișate în fereastra cu textul normei
    render: function () {},
    ready: Promise.resolve(null)
  };

  var saveTimer = null;
  var toastTimer = null;

  /* ----------------------- acces pe cale ----------------------- */

  function byId(arr, id) { return C.byId(arr, id); }

  store.get = function (path) {
    var p = store.state;
    if (!p) return undefined;
    var seg = path.split('.');
    var o;
    switch (seg[0]) {
      case 'meta': return p.meta[seg[1]];
      case 'tranz': return p.tranzitoriu[seg[1]];
      case 'dev': return p.dezvoltator[seg[1]];
      case 'cond': return p.conditii[seg[1]];
      case 'complex': return p.complexConfig[seg[1]];
      case 'user': o = S.findUser(p, seg[1]); return o ? o[seg[2]] : undefined;
      case 'line': o = byId(p.linii, seg[1]); return o ? o[seg[2]] : undefined;
      case 'pr': o = byId(p.linii, seg[1]); return o && o.punctRacordare ? o.punctRacordare[seg[2]] : undefined;
      case 'zona': o = byId(p.linii, seg[1]); o = o && byId(o.zoneTehnice, seg[2]); return o ? o[seg[3]] : undefined;
      case 'stat': o = byId(p.statii, seg[1]); return o ? o[seg[2]] : undefined;
      case 'tronson': o = byId(p.linii, seg[1]); o = o && byId(o.tronsoane, seg[2]); return o ? o[seg[3]] : undefined;
      case 'devitem': o = byId(p.dezvoltator.dezvoltatori, seg[1]); return o ? o[seg[2]] : undefined;
    }
    return undefined;
  };

  /* ----------------------- notificări ----------------------- */

  store.toast = function (msg, kind) {
    store.toastMsg = { msg: msg, kind: kind || 'info' };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { store.toastMsg = null; store.render(); }, 6000);
    store.render();
  };

  /* ----------------------- salvare ----------------------- */

  function formatSavedAt(d) {
    return pad2(d.getDate()) + '.' + pad2(d.getMonth() + 1) + '.' + d.getFullYear() +
      ', ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  store.formatSavedAt = formatSavedAt;

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!store.state) return Promise.resolve(true);
    return S.save(store.state).then(function (ok) {
      store.saveStatus = ok ? 'ok' : 'failed';
      if (ok) {
        store.lastSavedAt = new Date();
        writeLastSaved(store.lastSavedAt);
      }
      store.render();
      return ok;
    });
  }
  store.flushSave = flushSave;

  function saveNow() { store.saveStatus = 'pending'; return flushSave(); }
  function saveSoon() {
    store.saveStatus = 'pending';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 400);
  }
  store.hasPendingSave = function () { return !!saveTimer; };

  /* ----------------------- calcul ----------------------- */

  // Rezultatele afișate trebuie să reflecte mereu datele curente: dacă există un calcul
  // făcut, îl refacem la orice modificare.
  function recompute() {
    if (store.results && store.state) store.results = C.runCalculation(store.state);
  }
  store.recompute = recompute;

  store.calculate = function () {
    store.results = C.runCalculation(store.state);
    store.render();
    return store.results;
  };

  /* ----------------------- undo ----------------------- */

  function pushUndo() {
    try {
      store.undoStack.push(JSON.stringify(store.state));
      if (store.undoStack.length > UNDO_MAX) store.undoStack.shift();
    } catch (e) { /* proiect nesalvabil — fără undo */ }
  }
  store.pushUndo = pushUndo;

  store.undo = function () {
    if (!store.undoStack.length) return;
    try {
      store.state = S.migrate(JSON.parse(store.undoStack.pop()));
    } catch (e) { store.toast('Nu s-a putut reveni la starea anterioară.', 'error'); return; }
    C.deriveAll(store.state);
    recompute();
    saveNow();
    store.toast('Ultima modificare a fost anulată.', 'info');
  };

  /* ----------------------- modificări de date ----------------------- */

  // Modificare de câmp (la fiecare tastă). Salvarea e amânată, ghidul avansează la commit().
  store.set = function (path, value) {
    C.setPath(store.state, path, value);
    // Alegerea explicită a modelului confirmă pasul „model” din ghid.
    if (path === 'meta.model') store.state.meta.modelConfirmat = true;
    recompute();
    saveSoon();
    store.render();
  };

  store.setTechnicalMaterial = function (path, material) {
    if (!store.state) return false;
    var seg = path.split('.'), target;
    if (seg[0] === 'zona') {
      var line = byId(store.state.linii, seg[1]);
      target = line && byId(line.zoneTehnice, seg[2]);
    } else if (seg[0] === 'tronson') {
      var tronsonLine = byId(store.state.linii, seg[1]);
      target = tronsonLine && byId(tronsonLine.tronsoane, seg[2]);
    }
    if (!target || !material || ['LEA', 'LES', 'altul'].indexOf(material.tipLinie) < 0 ||
      typeof material.conductor !== 'string' || typeof material.sectiune !== 'string') {
      store.toast('Materialul selectat nu poate fi aplicat acestei instalații.', 'error');
      return false;
    }
    mutate(function (p) {
      var item = seg[0] === 'zona'
        ? byId(byId(p.linii, seg[1]).zoneTehnice, seg[2])
        : byId(byId(p.linii, seg[1]).tronsoane, seg[2]);
      item.tipLinie = material.tipLinie;
      item.conductor = material.conductor;
      item.sectiune = material.sectiune;
    }, { undo: true, noFocus: true });
    return true;
  };

  // Finalizarea unei modificări (blur / change / click): aici avansează ghidul.
  store.commit = function (opts) {
    saveNow();
    guideAfterCommit(opts);
  };

  function mutate(fn, opts) {
    opts = opts || {};
    if (opts.undo) pushUndo();
    fn(store.state);
    C.deriveAll(store.state);
    recompute();
    saveNow();
    store.render();
    guideAfterCommit(opts);
  }
  store.mutate = mutate;

  store.setTab = function (t) { store.tab = t; store.render(); };

  /* --- utilizatori --- */
  store.addUser = function () { mutate(function (p) { S.addUserAuto(p); }); };
  store.delUser = function (id) {
    var u = S.findUser(store.state, id);
    if (!global.confirm('Ștergi utilizatorul „' + (u && (u.nume || u.codPA) || id) + '” (și apariția lui pe tronsoane/stații)? Poți anula cu „Anulează”.')) return;
    mutate(function (p) {
      p.utilizatori = p.utilizatori.filter(function (x) { return x.id !== id; });
      p.linii.forEach(function (l) {
        l.racordari = (l.racordari || []).filter(function (r) { return r.userId !== id; });
        (l.ramuri || []).forEach(function (b) { if (b.finantatorId === id) b.finantatorId = ''; });
        l.tronsoane.forEach(function (t) { t.utilizatori = t.utilizatori.filter(function (x) { return x !== id; }); });
      });
      p.statii.forEach(function (s) { s.utilizatori = s.utilizatori.filter(function (x) { return x !== id; }); });
    }, { undo: true });
  };

  /* --- linii și tronsoane --- */
  store.addLine = function (rol) {
    mutate(function (p) {
      var l = { id: S.uid('lin'), nume: 'Linie ' + (p.linii.length + 1), IL: 0, L: 0, bL: 0, compVeche: 0, capacitate: 0, mod: 'distante', racordari: [], tronsoane: [] };
      p.linii.push(l);
      if (p.meta.model === 'complex') {
        (rol === 'u2' ? p.complexConfig.liniiU2Ids : p.complexConfig.liniiIds).push(l.id);
      }
    }, { undo: true });
  };
  store.delLine = function (id) {
    mutate(function (p) {
      p.linii = p.linii.filter(function (l) { return l.id !== id; });
      p.complexConfig.liniiIds = p.complexConfig.liniiIds.filter(function (x) { return x !== id; });
      p.complexConfig.liniiU2Ids = p.complexConfig.liniiU2Ids.filter(function (x) { return x !== id; });
    }, { undo: true });
  };
  store.setLineRole = function (id, rol) {
    mutate(function (p) {
      var c = p.complexConfig;
      c.liniiIds = c.liniiIds.filter(function (x) { return x !== id; });
      c.liniiU2Ids = c.liniiU2Ids.filter(function (x) { return x !== id; });
      if (rol === 'u1') c.liniiIds.push(id);
      else if (rol === 'u2') c.liniiU2Ids.push(id);
    }, { undo: true });
  };
  store.addTronson = function (lineId) {
    mutate(function (p) {
      var l = byId(p.linii, lineId);
      if (l) l.tronsoane.push({ id: S.uid('t'), nume: 'Tronson ' + (l.tronsoane.length + 1), lungime: 0, cost: 0, costManual: false, utilizatori: [] });
    });
  };
  // Art. 15 alin. 1: al doilea circuit pe stâlpii liniei existente (cost propriu, cote egale).
  store.addStalpi = function (lineId) {
    mutate(function (p) {
      var l = byId(p.linii, lineId);
      if (l) l.tronsoane.push({ id: S.uid('t'), tip: 'stalpi', nume: 'Stâlpi — al doilea circuit', lungime: 0, cost: 0, costManual: true, utilizatori: [] });
    });
  };
  store.delTronson = function (lineId, trsId) {
    mutate(function (p) {
      var l = byId(p.linii, lineId);
      if (l) l.tronsoane = l.tronsoane.filter(function (t) { return t.id !== trsId; });
    }, { undo: true });
  };
  store.setTronsonManual = function (lineId, trsId, manual) {
    mutate(function (p) {
      var l = byId(p.linii, lineId); var t = l && byId(l.tronsoane, trsId);
      if (!t) return;
      var cur = C.tronsonCost(l, t);
      t.costManual = manual;
      t.cost = manual ? cur : (Number(t.lungime) || 0) * C.lineBl(l);
    });
  };
  store.setLineBlAuto = function (lineId) {
    mutate(function (p) {
      var l = byId(p.linii, lineId);
      if (l) { l.bLManual = false; l.bL = C.lineBl(l); }
    });
  };
  store.autoAllTronsoane = function (lineId) {
    mutate(function (p) {
      var l = byId(p.linii, lineId);
      if (!l) return;
      l.tronsoane.forEach(function (t) { if (t.tip !== 'stalpi') { t.costManual = false; t.cost = (Number(t.lungime) || 0) * C.lineBl(l); } });
    });
  };
  // Grila de alocare: bifează/debifează un utilizator pe un tronson sau într-o stație.
  store.toggleTronsonUser = function (lineId, trsId, userId) {
    mutate(function (p) {
      var l = byId(p.linii, lineId); var t = l && byId(l.tronsoane, trsId);
      if (!t) return;
      var i = t.utilizatori.indexOf(userId);
      if (i >= 0) t.utilizatori.splice(i, 1); else t.utilizatori.push(userId);
    });
  };
  store.setTronsonAllUsers = function (lineId, trsId, on) {
    mutate(function (p) {
      var l = byId(p.linii, lineId); var t = l && byId(l.tronsoane, trsId);
      if (t) t.utilizatori = on ? p.utilizatori.map(function (u) { return u.id; }) : [];
    });
  };
  store.toggleStationUser = function (stId, userId) {
    mutate(function (p) {
      var s = byId(p.statii, stId);
      if (!s) return;
      var i = s.utilizatori.indexOf(userId);
      if (i >= 0) s.utilizatori.splice(i, 1); else s.utilizatori.push(userId);
    }, { undo: true });
  };

  /* --- linie pe distanțe (puncte de racordare) --- */
  // Setează/șterge distanța de la PR pentru un utilizator; tronsoanele se derivă.
  store.setRacordare = function (lineId, userId, distanta) {
    mutate(function (p) {
      var l = byId(p.linii, lineId);
      if (!l) return;
      if (!Array.isArray(l.racordari)) l.racordari = [];
      var d = Number(distanta);
      var idx = -1;
      l.racordari.forEach(function (r, i) { if (r.userId === userId) idx = i; });
      if (distanta === '' || distanta === null || distanta === undefined || !isFinite(d) || d <= 0) {
        if (idx >= 0) l.racordari.splice(idx, 1);
      } else if (idx >= 0) {
        l.racordari[idx].distanta = d;
      } else {
        l.racordari.push({ userId: userId, distanta: d });
      }
      l.mod = 'distante';
    });
  };

  store.addTechnicalZone = function (lineId, distance) {
    var l = byId(store.state.linii, lineId);
    if (!l) return null;
    var zones = Array.isArray(l.zoneTehnice) ? l.zoneTehnice : [];
    var d = distance === undefined ? (zones.length ? '' : 0) : Number(distance);
    if (d !== '' && (!isFinite(d) || d < 0 ||
      (distance !== undefined && (!(Number(l.L) > 0) || d >= Number(l.L))) ||
      (Number(l.L) > 0 && d >= Number(l.L)) ||
      zones.some(function (z) { return z.deLa !== '' && Math.abs(Number(z.deLa) - d) < 1e-6; }))) return null;
    var id = S.uid('zona');
    mutate(function (p) {
      var line = byId(p.linii, lineId);
      if (!Array.isArray(line.zoneTehnice)) line.zoneTehnice = [];
      line.zoneTehnice.push({ id: id, deLa: d,
        tipLinie: '', conductor: '', sectiune: '', observatii: '' });
    }, { undo: true });
    return id;
  };
  store.moveTechnicalZone = function (lineId, zoneId, distance) {
    var l = byId(store.state.linii, lineId);
    var d = Number(distance);
    var zones = l && Array.isArray(l.zoneTehnice) ? l.zoneTehnice : [];
    if (!l || !isFinite(d) || d < 0 || d >= Number(l.L) ||
      zones.some(function (z) {
        return z.id !== zoneId && z.deLa !== '' && Math.abs(Number(z.deLa) - d) < 1e-6;
      })) return false;
    var zone = byId(l.zoneTehnice, zoneId);
    if (!zone || Math.abs(Number(zone.deLa) - d) < 1e-6) return false;
    mutate(function (p) {
      var line = byId(p.linii, lineId);
      var target = byId(line.zoneTehnice, zoneId);
      if (target) target.deLa = d;
    }, { undo: true });
    return true;
  };
  store.delTechnicalZone = function (lineId, zoneId) {
    mutate(function (p) {
      var l = byId(p.linii, lineId);
      l.zoneTehnice = l.zoneTehnice.filter(function (z) { return z.id !== zoneId; });
    }, { undo: true });
  };

  function treeCandidate(l, rootId) {
    if (!l || l.mod !== 'distante' || !(Number(l.L) > 0)) {
      store.toast('Conversia necesită o linie pe distanțe, cu lungime pozitivă și date valide.', 'error');
      return null;
    }
    if (l.bLManual && (!isFinite(Number(l.bL)) || l.bL === '' || Math.abs(C.lineBl(l) * Number(l.L) - Number(l.IL)) > 1e-6)) {
      store.toast('Înainte de conversie, costul specific trebuie să corespundă investiției I_L / L.', 'error');
      return null;
    }
    var next = JSON.parse(JSON.stringify(l));
    next.mod = 'ramuri';
    next.ramuri = [{ id: rootId, nume: 'Linia principală', parentId: '', deLa: 0, L: l.L, IL: '', costManual: false }];
    next.racordari = next.racordari || [];
    next.zoneTehnice = next.zoneTehnice || [];
    next.racordari.forEach(function (r) { r.branchId = rootId; });
    next.zoneTehnice.forEach(function (z) { z.branchId = rootId; });
    return next;
  }

  store.convertTree = function (lineId) {
    var l = byId(store.state.linii, lineId);
    if (!l) return false;
    var next = treeCandidate(l, S.uid('ramura'));
    if (!next) return false;
    var errors = global.AppTree.analyze(next).errors;
    if (errors.length) { store.toast(errors.join(' '), 'error'); return false; }
    mutate(function (p) { p.linii[p.linii.indexOf(l)] = next; }, { undo: true });
    return true;
  };

  store.editTree = function (lineId, change, opts) {
    var line = byId(store.state.linii, lineId);
    if (!line || line.mod !== 'ramuri') { store.toast('Rețeaua ramificată nu este disponibilă.', 'error'); return false; }
    var next = JSON.parse(JSON.stringify(line));
    change(next);
    var errors = global.AppTree.analyze(next).errors;
    var previous = global.AppTree.analyze(line).errors.slice();
    var introduced = errors.filter(function (error) {
      var index = previous.indexOf(error);
      if (index < 0) return true;
      previous.splice(index, 1);
      return false;
    });
    if (introduced.length) { store.toast(introduced.join(' '), 'error'); return false; }
    mutate(function (p) {
      p.linii[p.linii.indexOf(line)] = next;
    }, { undo: true, noFocus: !!(opts && opts.noFocus) });
    return true;
  };

  store.addBranch = function (lineId, parentId) {
    var id = S.uid('ramura');
    var ok = store.editTree(lineId, function (l) {
      var parent = byId(l.ramuri, parentId);
      l.ramuri.push({ id: id, nume: 'Ramura ' + (l.ramuri.length + 1), parentId: parentId,
        deLa: parent ? Number(parent.L) : 0, L: 100, IL: '', costManual: false });
    });
    return ok ? id : null;
  };

  store.savePlanPortion = function (lineId, values) {
    var line = byId(store.state.linii, lineId), plan = global.AppPlan;
    if (!line || !values.nume.trim() || !(values.L > 0) || !isFinite(values.L) ||
      values.IL < 0 || !isFinite(values.IL) || values.deLa < 0 || !isFinite(values.deLa) ||
      ['LEA', 'LES', 'altul'].indexOf(values.tipLinie) < 0 ||
      (values.finantatorId && !S.findUser(store.state, values.finantatorId))) {
      store.toast('Porțiune invalidă: verifică denumirea, tipul, lungimea, costul și finanțatorul.', 'error');
      return false;
    }
    if (plan.empty(line)) {
      if (values.parentId) { store.toast('Prima porțiune trebuie să înceapă la PR.', 'error'); return false; }
      mutate(function (p) {
        var target = byId(p.linii, lineId);
        target.mod = 'ramuri'; target.bLManual = false; target.noduriPlan = [];
        target.ramuri = [Object.assign({}, values, { conductor: values.conductor || '',
          sectiune: values.sectiune || '', costManual: true })]; target.IL = values.IL;
      }, { undo: true, noFocus: true });
      return true;
    }
    if (line.mod === 'distante') {
      var converted = treeCandidate(line, values.id);
      if (!converted) return false;
      plan.setPortion(converted, values);
      var conversionErrors = global.AppTree.analyze(converted).errors;
      if (conversionErrors.length) { store.toast(conversionErrors.join(' '), 'error'); return false; }
      mutate(function (p) { p.linii[p.linii.indexOf(line)] = converted; }, { undo: true, noFocus: true });
      return true;
    }
    if (line.mod !== 'ramuri' || global.AppTree.analyze(line).errors.length) {
      store.toast('Corectează rețeaua sau efectuează conversia explicită înainte de a edita porțiunile.', 'error');
      return false;
    }
    return store.editTree(lineId, function (next) { plan.setPortion(next, values); }, { noFocus: true });
  };

  store.savePlanConnection = function (lineId, userId, branchId, distance) {
    var line = byId(store.state.linii, lineId);
    if (!line || !S.findUser(store.state, userId) || !isFinite(distance) || distance < 0) {
      store.toast('Racordare invalidă: verifică utilizatorul, nodul și distanța.', 'error');
      return false;
    }
    if (line.mod === 'distante') {
      if (branchId && branchId !== 'plan-linear') {
        store.toast('Nodul selectat nu aparține liniei. Reîncarcă tabelul și încearcă din nou.', 'error');
        return false;
      }
      if (branchId && distance > Number(line.L)) {
        store.toast('Distanța racordării depășește lungimea liniei.', 'error');
        return false;
      }
      mutate(function (p) {
        var target = byId(p.linii, lineId);
        target.racordari = target.racordari.filter(function (r) { return r.userId !== userId; });
        if (branchId) target.racordari.push({ userId: userId, distanta: distance });
      }, { undo: true, noFocus: true });
      return true;
    }
    return store.editTree(lineId, function (target) {
      target.racordari = target.racordari.filter(function (r) { return r.userId !== userId; });
      if (branchId) target.racordari.push({ userId: userId, branchId: branchId, distanta: distance });
    }, { noFocus: true });
  };

  store.delBranch = function (lineId, branchId, keepCosts) {
    return store.editTree(lineId, function (l) {
      if (keepCosts) global.AppPlan.explicitCosts(l);
      var removed = [branchId], count;
      do {
        count = removed.length;
        l.ramuri.forEach(function (b) {
          if (removed.indexOf(b.parentId) >= 0 && removed.indexOf(b.id) < 0) removed.push(b.id);
        });
      } while (removed.length !== count);
      l.ramuri = l.ramuri.filter(function (b) { return removed.indexOf(b.id) < 0; });
      l.racordari = l.racordari.filter(function (r) { return removed.indexOf(r.branchId) < 0; });
      l.zoneTehnice = l.zoneTehnice.filter(function (z) { return removed.indexOf(z.branchId) < 0; });
      l.noduriPlan = (l.noduriPlan || []).filter(function (n) { return removed.indexOf(n.branchId) < 0; });
      if (keepCosts) global.AppPlan.budget(l);
    }, keepCosts ? { noFocus: true } : undefined);
  };

  // Trecerea unei linii „clasice" (tronsoane bifate manual) la modul pe distanțe.
  store.convertLine = function (lineId) {
    mutate(function (p) {
      var l = byId(p.linii, lineId);
      if (!l) return;
      if (!(l.zoneTehnice || []).length) {
        var distance = 0;
        l.zoneTehnice = [];
        (l.tronsoane || []).forEach(function (t) {
          if (t.tip === 'stalpi') return;
          if (t.tipLinie || t.conductor || t.sectiune || t.observatii) {
            l.zoneTehnice.push({ id: S.uid('zona'), deLa: distance, tipLinie: t.tipLinie || '',
              conductor: t.conductor || '', sectiune: t.sectiune || '', observatii: t.observatii || '' });
          } else if (l.zoneTehnice.length) {
            l.zoneTehnice.push({ id: S.uid('zona'), deLa: distance, tipLinie: '', conductor: '', sectiune: '', observatii: '' });
          }
          distance += Number(t.lungime) || 0;
        });
      }
      if (!Array.isArray(l.racordari) || !l.racordari.length) {
        l.racordari = C.racordariFromTronsoane(l);
      }
      l.mod = 'distante';
    });
  };

  /* --- stații --- */
  store.addStation = function () {
    mutate(function (p) {
      var s = { id: S.uid('st'), nume: 'Stație ' + (p.statii.length + 1), Sn: 0, SnRezerva: 0, IT: 0, elementeComune: 0, intarire: false, compVeche: 0, utilizatori: [] };
      p.statii.push(s);
      if (p.meta.model === 'complex') p.complexConfig.statiiIds.push(s.id);
    }, { undo: true });
  };
  store.delStation = function (id) {
    mutate(function (p) {
      p.statii = p.statii.filter(function (s) { return s.id !== id; });
      p.complexConfig.statiiIds = p.complexConfig.statiiIds.filter(function (x) { return x !== id; });
    }, { undo: true });
  };
  store.setStationIncluded = function (id, on) {
    mutate(function (p) {
      var ids = p.complexConfig.statiiIds;
      var i = ids.indexOf(id);
      if (on && i < 0) ids.push(id);
      if (!on && i >= 0) ids.splice(i, 1);
    }, { undo: true });
  };

  // Ghidul de alegere: aplică recomandarea (modelul de calcul + varianta Anexei 3).
  store.applyModel = function (rec) {
    if (!rec || !rec.model) return;
    var S2 = global.AppSelect;
    mutate(function (p) { S2.applyTo(p, rec); }, { undo: true });
    store.toast('Model de calcul aplicat: ' + (S2.MODEL_LABEL[rec.model] || rec.model) + '.', 'info');
  };

  /* --- dezvoltatori (Anexa 5) --- */
  store.addDev = function () { mutate(function (p) { p.dezvoltator.dezvoltatori.push({ id: S.uid('dev'), nume: 'Dezvoltator', putere: 0 }); }, { undo: true }); };
  store.delDev = function (id) {
    mutate(function (p) { p.dezvoltator.dezvoltatori = p.dezvoltator.dezvoltatori.filter(function (d) { return d.id !== id; }); }, { undo: true });
  };

  /* ----------------------- proiect: nou / demo / import / export ----------------------- */

  function isEmptyProject(p) {
    return !p || (!p.utilizatori.length && !p.linii.length && !p.statii.length && !p.meta.operator);
  }

  function loadProject(next) {
    store.state = next;
    store.projectSeq++;
    C.deriveAll(store.state);
    store.results = null;
    store.tab = 'date';
    store.guide.skipped = {};
    store.guide.current = null;
    saveNow();
    store.render();
  }

  store.setAuto = function (on) { store.guide.auto = !!on; store.render(); };

  store.setProject = function (p) {   // folosit de teste și de import
    store.state = S.migrate(p);
    store.projectSeq++;
    C.deriveAll(store.state);
    store.results = null;
    saveNow();
    store.render();
  };

  // Înlocuiește proiectul curent (nou / demo), cu confirmare și undo; fără confirmare pe ecranul de start.
  store.replaceProject = function (next, message, guided) {
    if (store.state && !isEmptyProject(store.state)) {
      if (!global.confirm(message)) return;
      pushUndo();
    }
    loadProject(next);
    if (guided) { store.guide.on = true; store.guide.auto = true; setGuidePref(true); store.advance(true); }
  };
  store.newProject = function () {
    store.replaceProject(S.emptyProject(), 'Ștergi proiectul curent? Poți anula cu „Anulează”.', true);
  };
  store.loadDemo = function (kind) {
    store.replaceProject(kind === 'u6' ? S.demoU6() : S.demoU4(), 'Încărcarea exemplului înlocuiește proiectul curent. Continui? (Poți anula cu „Anulează”.)', false);
  };
  // Proiectul demo devine proiect propriu (dispare bannerul „Exemplu”).
  store.keepAsOwn = function () { mutate(function (p) { p.meta.exemplu = false; }); };

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Curăță o componentă de nume de fișier (Windows nu acceptă \ / : * ? " < > |).
  function filePart(value) {
    return String(value == null ? '' : value).trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_.]+|[-_.]+$/g, '');
  }

  // Numele exportului JSON: PA prim + PA utilizatori noi + DEGR + data exportului.
  // Exemplu: 1000000001_1000000004_DEGR_2026-10-20.json
  function jsonName(project) {
    var p = project || store.state || {};
    var users = Array.isArray(p.utilizatori) ? p.utilizatori : [];
    var parts = [];
    function add(u) {
      if (!u) return;
      var cod = filePart(u.codPA);
      if (cod && parts.indexOf(cod) < 0) parts.push(cod);
    }
    add(users.filter(function (u) { return u.rol === 'prim'; })[0]);
    users.filter(function (u) { return u.rol === 'nou' || u.rol === 'operator'; }).forEach(add);
    var d = new Date();
    var data = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    return (parts.length ? parts.join('_') : 'proiect') + '_DEGR_' + data + '.json';
  }
  store.jsonName = jsonName;
  store.saveJson = function () { download(jsonName(), JSON.stringify(store.state, null, 2), 'application/json'); };
  store.csv = function () { return C.toCsv(store.results); };
  store.exportCsv = function () { download('centralizator-compensatii.csv', store.csv(), 'text/csv;charset=utf-8'); };

  store.importFile = function (input) {
    var f = input.files && input.files[0];
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) { store.toast('Fișierul este prea mare (max. 5 MB).', 'error'); input.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      var imported;
      try { imported = S.migrate(JSON.parse(reader.result)); }
      catch (err) {
        store.toast('Import eșuat: ' + (err && err.message ? err.message : 'fișier JSON invalid') + ' — proiectul curent nu a fost modificat.', 'error');
        input.value = '';
        return;
      }
      if (store.state && !isEmptyProject(store.state)) {
        if (!global.confirm('Importul înlocuiește proiectul curent cu „' + f.name + '”. Continui? (Poți anula cu „Anulează”.)')) { input.value = ''; return; }
        pushUndo();
      }
      var before = store.state;
      try {
        loadProject(imported);
        store.render();
      } catch (err2) {
        store.state = before;
        store.toast('Import eșuat: structura proiectului este incompletă. Proiectul curent a fost păstrat.', 'error');
        store.render();
        input.value = '';
        return;
      }
      store.toast('Proiect importat din „' + f.name + '”.', 'info');
      input.value = '';   // permite reimportul aceluiași fișier
    };
    reader.onerror = function () { store.toast('Fișierul nu a putut fi citit.', 'error'); input.value = ''; };
    reader.readAsText(f);
  };

  /* ----------------------- norma (fereastra cu textul legal) ----------------------- */
  // 2b: la închidere, redă focusul chip-ului care a deschis fereastra (regăsit după data-ref).
  store.openNorma = function (ruleId, trigger) {
    store.normaTrigger = trigger || (function () { try { return (document && document.activeElement) || null; } catch (e) { return null; } })();
    store.norma = ruleId; store.render();
  };
  store.closeNorma = function () {
    var id = store.norma;
    store.norma = null; store.render();
    var back = null;
    try {
      if (id) {
        var nodes = document.querySelectorAll('.ref[data-ref="' + String(id).replace(/["\\]/g, '') + '"]');
        for (var i = 0; i < nodes.length; i++) { if (nodes[i].offsetParent !== null) { back = nodes[i]; break; } }
      }
    } catch (e) { back = null; }
    if (!back) back = store.normaTrigger;
    store.normaTrigger = null;
    if (back && typeof back.focus === 'function') { try { back.focus(); } catch (e) { /* ignorat */ } }
  };

  /* ----------------------- ghid pas cu pas ----------------------- */

  function getGuidePref() {
    try { var v = global.localStorage && global.localStorage.getItem(GUIDE_PREF_KEY); return v === null ? true : v === '1'; }
    catch (e) { return true; }
  }
  function setGuidePref(on) {
    try { if (global.localStorage) global.localStorage.setItem(GUIDE_PREF_KEY, on ? '1' : '0'); } catch (e) { /* ignorat */ }
  }

  store.guideCtx = function () {
    return { hasResults: !!(store.results && !store.results.error), skipped: store.guide.skipped };
  };
  store.guideNext = function () { return store.state ? G.next(store.state, store.guideCtx()) : null; };
  store.guideSteps = function () { return store.state ? G.steps(store.state, store.guideCtx()) : []; };
  store.guideActive = function () { return !!(store.guide.on && store.state && !store.state.meta.exemplu); };

  store.setGuide = function (on) {
    store.guide.on = !!on;
    setGuidePref(!!on);
    store.render();
    if (on) store.advance(false);
  };

  // Mută ghidul la următorul pas: schimbă tabul dacă e nevoie și (opțional) focalizează câmpul.
  store.advance = function (focus) {
    var n = store.guideNext();
    store.guide.current = n ? n.step.id : null;
    if (!n) { store.render(); return; }
    if (focus) {
      if (store.tab !== n.step.tab) store.tab = n.step.tab;
      store.render();
      store.focusTarget(n.step.target);
    } else {
      store.render();
    }
  };

  // După un commit: dacă pasul curent s-a încheiat, trecem la următorul.
  // Focusul se mută automat doar în modul „auto” (proiect nou) și nu dacă utilizatorul
  // și-a ales deja alt câmp (opts.noFocus).
  function guideAfterCommit(opts) {
    if (!store.guideActive()) return;
    var n = store.guideNext();
    var id = n ? n.step.id : null;
    if (id !== store.guide.current) store.advance(store.guide.auto && !(opts && opts.noFocus));
  }

  store.skipStep = function (id) { store.guide.skipped[id] = true; store.advance(true); };
  store.confirmStep = function (step) {
    if (!step.confirm) return;
    C.setPath(store.state, step.confirm.path, step.confirm.value);
    saveNow();
    recompute();
    store.advance(true);
  };
  store.goToStep = function (step) {
    if (store.tab !== step.tab) store.tab = step.tab;
    store.render();
    store.focusTarget(step.target);
  };

  // Găsește elementul cu cheia dată (data-bind / data-guide), îl aduce în vedere și îl focalizează.
  function findTarget(key) {
    if (!key) return null;
    var esc = (global.CSS && global.CSS.escape) ? global.CSS.escape(key) : key.replace(/"/g, '\\"');
    return document.querySelector('[data-guide="' + esc + '"],[data-bind="' + esc + '"]');
  }
  store.findTarget = findTarget;
  store.focusTarget = function (key) {
    var el = findTarget(key);
    // O componentă complexă poate avea încă un inspector imbricat de deschis.
    for (var i = 0; key && !el && i < 2; i++) {
      global.dispatchEvent(new global.CustomEvent('app:reveal-target', { detail: key }));
      store.render();
      el = findTarget(key);
    }
    if (!el) return false;
    for (var parent = el.parentElement; parent; parent = parent.parentElement) {
      if (parent.tagName === 'DETAILS') parent.open = true;
    }
    try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { /* ignorat */ }
    if (typeof el.focus === 'function') el.focus({ preventScroll: true });
    el.setAttribute('data-guide-pulse', '1');
    setTimeout(function () { el.removeAttribute('data-guide-pulse'); }, 1600);
    return true;
  };

  /* ----------------------- inițializare ----------------------- */

  store.init = function () {
    store.guide.on = getGuidePref();
    store.ready = S.init().then(function (loaded) {
      store.state = loaded;          // null → ecran de start
      if (store.state) C.deriveAll(store.state);
      store.advance(false);
      return store.state;
    }).catch(function () {
      store.state = null;
      store.render();
      return null;
    });
    return store.ready;
  };

  global.AppStore = store;
})(typeof window !== 'undefined' ? window : this);
