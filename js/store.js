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

  var store = {
    state: null,          // proiectul curent (null = ecran de start)
    results: null,        // ultimul rezultat (sau { error, ... })
    tab: 'date',
    guide: { on: true, auto: false, skipped: {}, current: null },   // auto = mută focusul automat la pasul următor
    toastMsg: null,       // { msg, kind }
    saveStatus: 'ok',     // 'ok' | 'pending' | 'failed'
    undoStack: [],
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

  function flushSave() {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (!store.state) return Promise.resolve(true);
    return S.save(store.state).then(function (ok) {
      store.saveStatus = ok ? 'ok' : 'failed';
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
    guideAfterCommit();
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
      p.linii.forEach(function (l) { l.tronsoane.forEach(function (t) { t.utilizatori = t.utilizatori.filter(function (x) { return x !== id; }); }); });
      p.statii.forEach(function (s) { s.utilizatori = s.utilizatori.filter(function (x) { return x !== id; }); });
    }, { undo: true });
  };

  /* --- linii și tronsoane --- */
  store.addLine = function (rol) {
    mutate(function (p) {
      var l = { id: S.uid('lin'), nume: 'Linie ' + (p.linii.length + 1), IL: 0, L: 0, bL: 0, compVeche: 0, capacitate: 0, tronsoane: [] };
      p.linii.push(l);
      if (p.meta.model === 'complex') {
        (rol === 'u2' ? p.complexConfig.liniiU2Ids : p.complexConfig.liniiIds).push(l.id);
      }
    });
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
    });
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
    });
  };

  /* --- stații --- */
  store.addStation = function () {
    mutate(function (p) {
      var s = { id: S.uid('st'), nume: 'Stație ' + (p.statii.length + 1), Sn: 0, SnRezerva: 0, IT: 0, elementeComune: 0, intarire: false, compVeche: 0, utilizatori: [] };
      p.statii.push(s);
      if (p.meta.model === 'complex') p.complexConfig.statiiIds.push(s.id);
    });
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
    });
  };

  /* --- dezvoltatori (Anexa 5) --- */
  store.addDev = function () { mutate(function (p) { p.dezvoltator.dezvoltatori.push({ id: S.uid('dev'), nume: 'Dezvoltator', putere: 0 }); }); };
  store.delDev = function (id) {
    mutate(function (p) { p.dezvoltator.dezvoltatori = p.dezvoltator.dezvoltatori.filter(function (d) { return d.id !== id; }); }, { undo: true });
  };

  /* ----------------------- proiect: nou / demo / import / export ----------------------- */

  function isEmptyProject(p) {
    return !p || (!p.utilizatori.length && !p.linii.length && !p.statii.length && !p.meta.operator);
  }

  function loadProject(next) {
    store.state = next;
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
  store.saveJson = function () { download('proiect-compensatii.json', JSON.stringify(store.state, null, 2), 'application/json'); };
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
  store.openNorma = function (ruleId) { store.norma = ruleId; store.render(); };
  store.closeNorma = function () { store.norma = null; store.render(); };

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
    if (!el) return false;
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
