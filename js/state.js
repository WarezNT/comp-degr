/*
 * State — modelul de date al aplicației, persistență în IndexedDB (cu
 * fallback în localStorage), import/export JSON cu sanitizare și date demo
 * (inclusiv scenariul din modelul .xlsx).
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
        dataPIF: '',
        solutieComuna: true,
        // Art. 7 alin. 1: tariful achitat integral de cei care primesc compensația.
        // Se verifică din „Data achitare TR” a fiecărui beneficiar; bifa de aici
        // este confirmarea manuală când data lipsește.
        tarifAchitatIntegral: false,
        fonduriPublice: false,      // art. 19: instalația finanțată din fonduri nerambursabile
        calcInformativ: false       // calculează oricum, chiar dacă art. 8 nu e îndeplinit
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

  // Primul utilizator (finanțatorul / receptorul compensațiilor). Doar unul
  // poate avea acest rol; dacă sunt mai mulți bifați, îl luăm pe primul.
  function primId(p) {
    var found = null;
    (p.utilizatori || []).forEach(function (u) { if (u.prim && !found) found = u.id; });
    return found;
  }

  // Noii utilizatori (cei care plătesc), fără primul utilizator și fără
  // id-uri inexistente. Pot fi mai mulți (racordați simultan).
  function newIds(p) {
    var prim = primId(p);
    var ids = p.meta.nouUtilizatoriIds || [];
    if (!ids.length && p.meta.noulUtilizatorId) ids = [p.meta.noulUtilizatorId];
    var existing = {};
    (p.utilizatori || []).forEach(function (u) { existing[u.id] = true; });
    var list = ids.filter(function (id) { return id && id !== prim && existing[id] !== undefined; });
    // Ordinea racordării (calcul secvențial, Anexa 1): după data ATR; cei fără
    // dată păstrează ordinea din listă, după cei cu dată (sortare stabilă).
    return list.map(function (id, i) {
      var u = findUser(p, id);
      return { id: id, d: (u && u.dataATR) || '9999-99-99', i: i };
    }).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i; })
      .map(function (x) { return x.id; });
  }

  // Conflict: un utilizator nou este și prim utilizator.
  function roleConflict(p) {
    var prim = primId(p);
    if (!prim) return false;
    return (p.meta.nouUtilizatoriIds || []).indexOf(prim) >= 0 ||
      p.meta.noulUtilizatorId === prim;
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
    var u4 = addUser(p, { codPA: '1000000004', nume: 'U4', putere: 100, dataATR: '2021-02-10', dataTR: '2021-03-15' });
    var u5 = addUser(p, { codPA: '1000000005', nume: 'U5', putere: 100, dataATR: '2021-06-10', dataTR: '2021-07-15' });
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
    var u1 = addUser(p, { codPA: '1000000001', nume: 'U1', putere: 100, prim: true, dataATR: '2023-01-10', dataTR: '2023-02-10' });
    var u2 = addUser(p, { codPA: '1000000002', nume: 'U2', putere: 100, dataATR: '2023-05-10', dataTR: '2023-06-10' });
    var u3 = addUser(p, { codPA: '1000000003', nume: 'U3', putere: 100, dataATR: '2023-09-10', dataTR: '2023-10-10' });
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

  // Salvează sincron în cache și asincron în IndexedDB. Dacă IndexedDB nu e
  // disponibil sau eșuează, se încearcă localStorage. Promisiunea returnată
  // se rezolvă cu true dacă datele au fost persistate undeva, altfel false.
  function save(p) {
    memoryCache = p;
    var record = { id: CURRENT_ID, proiect: p, actualizat: Date.now() };
    if (idbSupported()) {
      return idbPut(record).then(function () { fallbackClear(); return true; }, function () { return fallbackSave(p); });
    }
    return Promise.resolve(fallbackSave(p));
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
          save(legacy).then(function (ok) { if (ok && idbSupported()) fallbackClear(); });
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
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
        return true;
      }
    } catch (e) { /* cotă depășită / acces blocat */ }
    return false;
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

  /* ------------------------------------------------------------------
   * Sanitizare — folosită la încărcarea oricărui proiect (IndexedDB,
   * localStorage, import JSON). Un fișier primit din exterior nu trebuie să
   * poată strica interfața sau injecta HTML prin id-uri/câmpuri:
   *  - structura este normalizată (tipuri, liste);
   *  - toate id-urile sunt reduse la [A-Za-z0-9_-] și rămân unice;
   *  - referințele dintre entități sunt remapate consecvent.
   * ------------------------------------------------------------------ */
  var MODELS = ['line', 'station', 'complex', 'transitional', 'developer'];

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function str(v) { return v === undefined || v === null ? '' : String(v); }

  function sanitize(raw) {
    if (!isObj(raw)) throw new Error('Fișierul nu conține un proiect valid (se așteaptă un obiect JSON).');
    var p = raw;

    var map = {};
    var used = {};
    function safeId(id, prefix) {
      var key = str(id);
      if (map.hasOwnProperty(key)) return map[key];
      var base = key.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || (prefix || 'id');
      var cand = base, i = 1;
      while (used.hasOwnProperty(cand)) { cand = base + '-' + (i++); }
      used[cand] = true;
      map[key] = cand;
      return cand;
    }
    function ref(id) { var k = str(id); return map.hasOwnProperty(k) ? map[k] : null; }
    function refs(list) {
      return arr(list).map(ref).filter(function (x) { return x !== null; });
    }

    p.meta = isObj(p.meta) ? p.meta : {};
    p.utilizatori = arr(p.utilizatori).filter(isObj);
    p.linii = arr(p.linii).filter(isObj);
    p.statii = arr(p.statii).filter(isObj);
    p.tranzitoriu = isObj(p.tranzitoriu) ? p.tranzitoriu : {};
    p.dezvoltator = isObj(p.dezvoltator) ? p.dezvoltator : {};
    p.dezvoltator.dezvoltatori = arr(p.dezvoltator.dezvoltatori).filter(isObj);
    p.conditii = isObj(p.conditii) ? p.conditii : {};
    p.complexConfig = isObj(p.complexConfig) ? p.complexConfig : {};

    // 1) id-urile entităților
    p.utilizatori.forEach(function (u) {
      u.id = safeId(u.id, 'u');
      u.tipClient = u.tipClient === 'casnic' ? 'casnic' : 'noncasnic';
      u.prim = !!u.prim;
    });
    p.linii.forEach(function (l) {
      l.id = safeId(l.id, 'lin');
      l.tronsoane = arr(l.tronsoane).filter(isObj);
      l.tronsoane.forEach(function (t) {
        t.id = safeId(t.id, 't');
        if (t.tip !== 'stalpi') delete t.tip;   // art. 15 alin. 1: singura valoare permisă
      });
    });
    p.statii.forEach(function (s) { s.id = safeId(s.id, 'st'); });
    p.dezvoltator.dezvoltatori.forEach(function (d) { d.id = safeId(d.id, 'dev'); });

    // 2) referințele (utilizatori pe tronsoane/stații) — doar către utilizatori
    var userMap = {};
    p.utilizatori.forEach(function (u) { userMap[u.id] = true; });
    function userRefs(list) {
      return refs(list).filter(function (id) { return userMap[id]; });
    }
    p.linii.forEach(function (l) {
      l.tronsoane.forEach(function (t) { t.utilizatori = userRefs(t.utilizatori); });
    });
    p.statii.forEach(function (s) { s.utilizatori = userRefs(s.utilizatori); });

    // Migrare: din vechiul câmp unic „noul utilizator” către listă.
    if (!Array.isArray(p.meta.nouUtilizatoriIds)) {
      p.meta.nouUtilizatoriIds = p.meta.noulUtilizatorId ? [p.meta.noulUtilizatorId] : [];
    }
    p.meta.nouUtilizatoriIds = userRefs(p.meta.nouUtilizatoriIds);
    var legacyNou = ref(p.meta.noulUtilizatorId);
    p.meta.noulUtilizatorId = legacyNou && userMap[legacyNou] ? legacyNou : '';
    p.complexConfig.liniiIds = refs(p.complexConfig.liniiIds);
    p.complexConfig.liniiU2Ids = refs(p.complexConfig.liniiU2Ids);
    p.complexConfig.statiiIds = refs(p.complexConfig.statiiIds);

    // 3) valori enumerate
    if (MODELS.indexOf(p.meta.model) < 0) p.meta.model = 'line';
    var v = Number(p.complexConfig.varianta);
    p.complexConfig.varianta = (v >= 1 && v <= 4) ? Math.floor(v) : 3;
    p.meta.operator = str(p.meta.operator);
    p.meta.codOperator = str(p.meta.codOperator);
    return p;
  }

  function migrate(p) {
    p = sanitize(p);
    var base = emptyProject();
    Object.keys(base).forEach(function (k) {
      if (p[k] === undefined) p[k] = base[k];
    });
    Object.keys(base.meta).forEach(function (k) {
      if (p.meta[k] === undefined) p.meta[k] = base.meta[k];
    });
    Object.keys(base.conditii).forEach(function (k) {
      if (p.conditii[k] === undefined) p.conditii[k] = base.conditii[k];
    });
    delete p.conditii.clientCasnic;   // derivat din tipul clientului primului utilizator
    (p.linii || []).forEach(function (l) {
      if (l.bLManual === undefined) l.bLManual = false;
      (l.tronsoane || []).forEach(function (t) {
        if (t.costManual === undefined) t.costManual = false;
      });
    });
    (p.statii || []).forEach(function (s) {
      if (s.SnRezerva === undefined) s.SnRezerva = 0;
      s.intarire = !!s.intarire;
    });
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
    migrate: migrate,
    sanitize: sanitize,
    primId: primId,
    newIds: newIds,
    roleConflict: roleConflict
  };
})(typeof window !== 'undefined' ? window : this);
