/*
 * State — modelul de date al aplicației, persistență în localStorage,
 * import/export JSON și date demo (inclusiv scenariul din modelul .xlsx).
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'comp-degr:project:v1';

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9);
  }

  function emptyProject() {
    return {
      meta: {
        operator: 'Operator de rețea',
        codOperator: '',
        dataCalcul: new Date().toISOString().slice(0, 10),
        tva: 19,
        withTva: true,
        model: 'line',
        noulUtilizatorId: '',
        nouUtilizatoriIds: []
      },
      utilizatori: [],
      linii: [],
      statii: [],
      complexConfig: { varianta: 3, liniiIds: [], liniiU2Ids: [], statiiIds: [] },
      tranzitoriu: { B: 0, S: 0, S2: 0, l2: 0, L: 0 },
      dezvoltator: { Itotal: 0, Ief: 0, dezvoltatori: [] },
      conditii: {
        primCapacitateMaiMare: true,
        capacitateDisponibila: true,
        aniDeLaPF: 0,
        clientCasnic: false,
        solutieComuna: true,
        tarifAchitatIntegral: true
      }
    };
  }

  function addUser(p, data) {
    var u = {
      id: uid('u'),
      codPA: '',
      nume: '',
      putere: 0,
      dataATR: '',
      dataTR: '',
      tipClient: 'noncasnic',
      prim: false
    };
    Object.keys(data || {}).forEach(function (k) { u[k] = data[k]; });
    p.utilizatori.push(u);
    return u;
  }

  function findUser(p, id) {
    for (var i = 0; i < p.utilizatori.length; i++) {
      if (p.utilizatori[i].id === id) return p.utilizatori[i];
    }
    return null;
  }

  function demoU6() {
    // Scenariul din modelul .xlsx (rețea U1, emitere ATR 14.11.2018):
    // primii 3 utilizatori + cei racordați ulterior, pe tronsoane comune.
    var p = emptyProject();
    p.meta.operator = 'Operator de distribuție';
    p.meta.model = 'line';
    p.meta.tva = 19;

    var u1 = addUser(p, { codPA: '1000000001', nume: 'U1', putere: 100, prim: true, dataATR: '2017-12-20', dataTR: '2018-03-09' });
    var u2 = addUser(p, { codPA: '1000000002', nume: 'U2', putere: 100, dataATR: '2020-10-19', dataTR: '2020-11-19' });
    var u3 = addUser(p, { codPA: '1000000003', nume: 'U3', putere: 100, dataATR: '2020-12-19', dataTR: '2020-12-20' });
    var u4 = addUser(p, { codPA: '1000000004', nume: 'U4', putere: 100 });
    var u5 = addUser(p, { codPA: '1000000005', nume: 'U5', putere: 100 });
    var u6 = addUser(p, { codPA: '1000000006', nume: 'U6', putere: 100 });

    var linie = {
      id: uid('lin'),
      nume: 'Linie U1 — tronsoane (st. 20 - 30)',
      IL: 6000,
      L: 200,
      bL: 30,
      tronsoane: [
        { id: uid('t'), nume: 'Tronson 1 (st.20-21)', lungime: 100, cost: 3000, costManual: false, utilizatori: [u1.id, u2.id, u3.id, u4.id, u5.id, u6.id] },
        { id: uid('t'), nume: 'Tronson 2 (st.21-22)', lungime: 100, cost: 3000, costManual: false, utilizatori: [u1.id, u2.id, u3.id, u4.id, u5.id, u6.id] }
      ]
    };
    p.linii.push(linie);
    p.complexConfig.liniiIds = [linie.id];
    p.meta.nouUtilizatoriIds = [u6.id];
    p.meta.noulUtilizatorId = u6.id;
    return p;
  }

  function demoU4() {
    // Scenariul U4 din .xlsx: 2 tronsoane a 3000 lei, utilizatori U1..U4.
    // Rezultat așteptat: U4 plătește 500 lei către fiecare din U1,U2,U3.
    var p = emptyProject();
    p.meta.model = 'line';
    var u1 = addUser(p, { codPA: '1000000001', nume: 'U1', putere: 100, prim: true });
    var u2 = addUser(p, { codPA: '1000000002', nume: 'U2', putere: 100 });
    var u3 = addUser(p, { codPA: '1000000003', nume: 'U3', putere: 100 });
    var u4 = addUser(p, { codPA: '1000000004', nume: 'U4', putere: 100 });
    var linie = {
      id: uid('lin'),
      nume: 'Linie U1 (2 tronsoane)',
      IL: 6000, L: 200, bL: 30,
      tronsoane: [
        { id: uid('t'), nume: 'Tronson 1', lungime: 100, cost: 3000, costManual: false, utilizatori: [u1.id, u2.id, u3.id, u4.id] },
        { id: uid('t'), nume: 'Tronson 2', lungime: 100, cost: 3000, costManual: false, utilizatori: [u1.id, u2.id, u3.id, u4.id] }
      ]
    };
    p.linii.push(linie);
    p.complexConfig.liniiIds = [linie.id];
    p.meta.nouUtilizatoriIds = [u4.id];
    p.meta.noulUtilizatorId = u4.id;
    return p;
  }

  /* ------------------------------------------------------------------
   * Persistență în IndexedDB (store local, offline).
   *   DB:    comp-degr
   *   store: proiecte   (keyPath = "id")
   * Proiectul curent este păstrat cu id-ul "curent".
   * Se păstrează și o copie sincronă în memorie (cache) pentru citiri
   * imediate; scrierile se propagă asincron către IndexedDB.
   * ------------------------------------------------------------------ */

  var DB_NAME = 'comp-degr';
  var DB_VERSION = 1;
  var STORE = 'proiecte';
  var CURRENT_ID = 'curent';
  var memoryCache = null;      // ultimul proiect încărcat/salvat sincron
  var idbPromise = null;       // promisiunea de deschidere a bazei

  function idbSupported() {
    return !!(global.indexedDB);
  }

  function openDb() {
    if (idbPromise) return idbPromise;
    idbPromise = new Promise(function (resolve, reject) {
      if (!idbSupported()) { reject(new Error('IndexedDB indisponibil')); return; }
      var settled = false;
      var req;
      // IndexedDB poate rămâne blocat (ex. alt tab ține conexiunea) — nu
      // lăsăm inițializarea să aștepte la nesfârșit.
      var timer = setTimeout(function () {
        if (!settled) { settled = true; reject(new Error('Timeout IndexedDB')); }
      }, 3000);
      try {
        req = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        clearTimeout(timer); reject(e); return;
      }
      req.onblocked = function () { /* așteaptă; timeout-ul preia controlul */ };
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () {
        if (settled) { req.result.close(); return; }
        settled = true; clearTimeout(timer); resolve(req.result);
      };
      req.onerror = function () {
        if (settled) return;
        settled = true; clearTimeout(timer); reject(req.error || new Error('Eroare IndexedDB'));
      };
    });
    return idbPromise;
  }

  function idbGet(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function idbPut(value) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function idbDelete(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).delete(key);
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  // Citește sincron din cache-ul de memorie (populat la load/pornire).
  function load() {
    return memoryCache;
  }

  // Salvează sincron în cache și asincron în IndexedDB; păstrează și
  // o copie de siguranță în localStorage (fallback dacă IDB e blocat).
  function save(p) {
    memoryCache = p;
    var record = { id: CURRENT_ID, proiect: p, actualizat: Date.now() };
    if (idbSupported()) {
      idbPut(record).catch(function () { fallbackSave(p); });
    } else {
      fallbackSave(p);
    }
    return Promise.resolve(p);
  }

  function clear() {
    memoryCache = null;
    if (idbSupported()) { idbDelete(CURRENT_ID).catch(function () {}); }
    fallbackClear();
  }

  // Încarcă proiectul curent din IndexedDB în cache-ul de memorie.
  function init() {
    if (!idbSupported()) {
      memoryCache = fallbackLoad();
      return Promise.resolve(memoryCache);
    }
    return idbGet(CURRENT_ID).then(function (rec) {
      if (rec && rec.proiect) {
        memoryCache = migrate(rec.proiect);
      } else {
        // Migrare unică din localStorage (dacă există date vechi).
        var legacy = fallbackLoad();
        if (legacy) {
          memoryCache = legacy;
          save(legacy);
        }
      }
      return memoryCache;
    }).catch(function () {
      memoryCache = fallbackLoad();
      return memoryCache;
    });
  }

  /* --- fallback localStorage (dacă IndexedDB nu e disponibil) --- */
  function fallbackSave(p) {
    try { if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch (e) {}
  }
  function fallbackLoad() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (raw) return migrate(JSON.parse(raw));
    } catch (e) {}
    return null;
  }
  function fallbackClear() {
    try { if (global.localStorage) global.localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  /* --- proiecte multiple (opțional) --- */
  function listProjects() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function migrate(p) {
    var base = emptyProject();
    Object.keys(base).forEach(function (k) {
      if (p[k] === undefined) p[k] = base[k];
    });
    Object.keys(base.meta).forEach(function (k) {
      if (p.meta[k] === undefined) p.meta[k] = base.meta[k];
    });
    (p.linii || []).forEach(function (l) {
      if (l.bLManual === undefined) l.bLManual = false;
      (l.tronsoane || []).forEach(function (t) {
        if (t.costManual === undefined) t.costManual = false;
      });
    });
    // Un singur „prim utilizator”: dacă sunt mai mulți bifați, păstrăm primul.
    // Un singur „prim utilizator”: dacă sunt mai mulți bifați, păstrăm primul.
    if (p.utilizatori && p.utilizatori.length) {
      var seenPrim = false;
      p.utilizatori.forEach(function (u) {
        if (u.prim) {
          if (seenPrim) u.prim = false;
          seenPrim = true;
        }
      });
      var prim = p.utilizatori.filter(function (u) { return u.prim; })[0];
      var primId = prim ? prim.id : null;

      // Migrare: din vechiul câmp unic „noul utilizator” către listă.
      if (!Array.isArray(p.meta.nouUtilizatoriIds)) {
        p.meta.nouUtilizatoriIds = p.meta.noulUtilizatorId ? [p.meta.noulUtilizatorId] : [];
      }
      // Elimină primul utilizator și id-urile inexistente din listă.
      var ids = {};
      p.utilizatori.forEach(function (u) { ids[u.id] = true; });
      p.meta.nouUtilizatoriIds = p.meta.nouUtilizatoriIds.filter(function (id) {
        return ids[id] && id !== primId;
      });
      // Menține sincron câmpul legacy (primul din listă) pentru compatibilitate.
      p.meta.noulUtilizatorId = p.meta.nouUtilizatoriIds.length ? p.meta.nouUtilizatoriIds[0] : '';
    }
    return p;
  }

  global.AppState = {
    STORAGE_KEY: STORAGE_KEY,
    DB_NAME: DB_NAME,
    CURRENT_ID: CURRENT_ID,
    uid: uid,
    emptyProject: emptyProject,
    addUser: addUser,
    findUser: findUser,
    demoU4: demoU4,
    demoU6: demoU6,
    init: init,
    load: load,
    save: save,
    clear: clear,
    listProjects: listProjects,
    idbSupported: idbSupported,
    migrate: migrate
  };
})(typeof window !== 'undefined' ? window : this);
