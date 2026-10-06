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
        operator: '',
        codOperator: '',
        dataCalcul: new Date().toISOString().slice(0, 10),
        tva: 21,                 // cota implicită de TVA; alte opțiuni: 19% sau o valoare introdusă manual
        tvaAlta: false,          // „Altă valoare” aleasă explicit (câmp manual vizibil)
        withTva: true,
        model: 'line',
        modelConfirmat: false,   // ghid: utilizatorul a confirmat tipul de instalație
        exemplu: false           // proiect demo (afișează un banner „Exemplu”)
      },
      utilizatori: [],
      linii: [],
      statii: [],
      complexConfig: { varianta: 3, variantaConfirmata: false, liniiIds: [], liniiU2Ids: [], statiiIds: [] },
      tranzitoriu: { B: 0, S: 0, S2: 0, l2: 0, L: 0 },
      dezvoltator: { Itotal: 0, Ief: 0, dezvoltatori: [] },
      conditii: {
        primCapacitateMaiMare: true,
        capacitateDisponibila: true,
        aniDeLaPF: 0,
        dataPIF: '',
        solutieComuna: true,
        verificate: false,          // ghid: utilizatorul a verificat condițiile din art. 8
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
      // Rol unic: 'prim' (finanțator, primește compensații) | 'existent' | 'nou' (plătește)
      // | 'operator' (art. 6 alin. 5: operatorul de rețea, asimilat unui utilizator nou).
      rol: 'existent',
      faraContract: false,    // art. 7 alin. 2: ATR emis pentru instalația comună, contract neîncheiat
      atrValabilPana: '',     // sfârșitul perioadei de valabilitate a ATR
      dataContract: '',       // data contractului de racordare (art. 17–18)
      tarifInitial: 0         // tariful de racordare înainte de refacerea ATR [lei] (opțional)
    };
    Object.keys(data || {}).forEach(function (k) { u[k] = data[k]; });
    // Compatibilitate: câmpurile booleene vechi (prim / operator) stabilesc rolul.
    if (!data || data.rol === undefined) {
      if (data && data.prim) u.rol = 'prim';
      else if (data && data.operator) u.rol = 'operator';
    }
    delete u.prim;
    delete u.operator;
    p.utilizatori.push(u);
    return u;
  }

  // Adăugare din interfață: primul utilizator devine finanțator, al doilea utilizator
  // nou (cel care plătește), ceilalți existenți — utilizatorul le poate schimba.
  function addUserAuto(p, data) {
    var rol = 'existent';
    if (!primId(p)) rol = 'prim';
    else if (!newIds(p).length) rol = 'nou';
    var d = {};
    Object.keys(data || {}).forEach(function (k) { d[k] = data[k]; });
    if (d.rol === undefined) d.rol = rol;
    return addUser(p, d);
  }

  var ROLURI = ['prim', 'existent', 'nou', 'operator'];

  // Normalizează rolurile (și migrează formatul vechi: prim/operator booleene și
  // lista meta.nouUtilizatoriIds): un singur prim utilizator, roluri valide.
  function normalizeRoles(p) {
    var meta = p.meta || {};
    var legacyNou = {};
    (Array.isArray(meta.nouUtilizatoriIds) ? meta.nouUtilizatoriIds : []).forEach(function (id) { legacyNou[id] = true; });
    if (meta.noulUtilizatorId) legacyNou[meta.noulUtilizatorId] = true;
    var seenPrim = false;
    (p.utilizatori || []).forEach(function (u) {
      if (ROLURI.indexOf(u.rol) < 0) {
        if (u.prim) u.rol = 'prim';
        else if (u.operator) u.rol = 'operator';
        else u.rol = legacyNou[u.id] ? 'nou' : 'existent';
      } else if (u.rol === 'existent' && legacyNou[u.id]) {
        u.rol = 'nou';
      }
      if (u.rol === 'prim') {
        if (seenPrim) u.rol = 'existent';
        seenPrim = true;
      }
      delete u.prim;
      delete u.operator;
    });
    delete meta.nouUtilizatoriIds;
    delete meta.noulUtilizatorId;
    return p;
  }

  function findUser(p, id) {
    for (var i = 0; i < p.utilizatori.length; i++) {
      if (p.utilizatori[i].id === id) return p.utilizatori[i];
    }
    return null;
  }

  // Primul utilizator (finanțatorul / receptorul compensațiilor): rolul „prim”.
  function primId(p) {
    var found = null;
    (p.utilizatori || []).forEach(function (u) { if (u.rol === 'prim' && !found) found = u.id; });
    return found;
  }

  // Utilizatorii care plătesc: rolurile „nou” și „operator” (art. 6 alin. 5 — operatorul
  // se asimilează unui utilizator nou). Ordinea racordării (calcul secvențial, Anexa 1):
  // după data ATR; cei fără dată păstrează ordinea din listă, după cei cu dată.
  function newIds(p) {
    var list = [];
    (p.utilizatori || []).forEach(function (u, i) {
      if (u.rol === 'nou' || u.rol === 'operator') list.push({ id: u.id, d: u.dataATR || '9999-99-99', i: i });
    });
    return list.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i; })
      .map(function (x) { return x.id; });
  }

  // Data intrării în vigoare a metodologiei (Ord. 180/2015, M.Of. 12/07.01.2016).
  var DATA_INTRARE_VIGOARE = '2016-01-07';

  // Art. 17–18: dacă primul utilizator a încheiat contractul de racordare înainte
  // de intrarea în vigoare, se aplică prevederile tranzitorii. Utilizatorii (altii
  // decât primul și decât cei noi) cu contract tot anterior sunt ignorați la
  // repartizare: art. 18 alin. 3 — noul utilizator plătește doar primului și celor
  // cu contract ulterior care au plătit compensație.
  function tranzitoriu(p) {
    var prim = findUser(p, primId(p));
    var activ = !!(prim && prim.dataContract && prim.dataContract < DATA_INTRARE_VIGOARE);
    var noi = newIds(p);
    var ignorati = [];
    var faraData = [];
    if (activ) {
      (p.utilizatori || []).forEach(function (u) {
        if (u.id === prim.id || noi.indexOf(u.id) >= 0) return;
        if (!u.dataContract) faraData.push(u.id);
        else if (u.dataContract < DATA_INTRARE_VIGOARE) ignorati.push(u.id);
      });
    }
    return { activ: activ, ignorati: ignorati, faraData: faraData };
  }

  function demoU6() {
    // Scenariul din modelul .xlsx (rețea U1, emitere ATR 14.11.2018):
    // primii 3 utilizatori + cei racordați ulterior, pe tronsoane comune.
    var p = emptyProject();
    p.meta.operator = 'Operator de distribuție';
    // (exemplu demonstrativ)
    p.meta.model = 'line';
    p.meta.tva = 19;

    var u1 = addUser(p, { codPA: '1000000001', nume: 'U1', putere: 100, prim: true, dataATR: '2017-12-20', dataTR: '2018-03-09' });
    var u2 = addUser(p, { codPA: '1000000002', nume: 'U2', putere: 100, dataATR: '2020-10-19', dataTR: '2020-11-19' });
    var u3 = addUser(p, { codPA: '1000000003', nume: 'U3', putere: 100, dataATR: '2020-12-19', dataTR: '2020-12-20' });
    var u4 = addUser(p, { codPA: '1000000004', nume: 'U4', putere: 100, dataATR: '2021-02-10', dataTR: '2021-03-15' });
    var u5 = addUser(p, { codPA: '1000000005', nume: 'U5', putere: 100, dataATR: '2021-06-10', dataTR: '2021-07-15' });
    var u6 = addUser(p, { codPA: '1000000006', nume: 'U6', putere: 100, rol: 'nou' });

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
    p.meta.modelConfirmat = true;
    p.meta.exemplu = true;
    p.conditii.verificate = true;
    return p;
  }

  function demoU4() {
    // Scenariul U4 din .xlsx: 2 tronsoane a 3000 lei, utilizatori U1..U4.
    // Rezultat așteptat: U4 plătește 500 lei către fiecare din U1,U2,U3.
    var p = emptyProject();
    p.meta.model = 'line';
    p.meta.tva = 19;   // scenariul din modelul .xlsx
    var u1 = addUser(p, { codPA: '1000000001', nume: 'U1', putere: 100, prim: true, dataATR: '2023-01-10', dataTR: '2023-02-10' });
    var u2 = addUser(p, { codPA: '1000000002', nume: 'U2', putere: 100, dataATR: '2023-05-10', dataTR: '2023-06-10' });
    var u3 = addUser(p, { codPA: '1000000003', nume: 'U3', putere: 100, dataATR: '2023-09-10', dataTR: '2023-10-10' });
    var u4 = addUser(p, { codPA: '1000000004', nume: 'U4', putere: 100, rol: 'nou' });
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
    p.meta.modelConfirmat = true;
    p.meta.exemplu = true;
    p.conditii.verificate = true;
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
      u.prim = !!u.prim;            // câmpuri vechi, consumate de normalizeRoles
      u.operator = !!u.operator;
      u.dataContract = str(u.dataContract);
      u.faraContract = !!u.faraContract;
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

    // Format vechi: lista „noilor utilizatori” (consumată de normalizeRoles).
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
      if (l.compVeche === undefined) l.compVeche = 0;     // art. 18: compensații primite sub Ord. 28/2003
      if (l.capacitate === undefined) l.capacitate = 0;   // art. 18 alin. 1 lit. b: capacitatea instalației [kVA]
      (l.tronsoane || []).forEach(function (t) {
        if (t.costManual === undefined) t.costManual = false;
      });
    });
    (p.statii || []).forEach(function (s) {
      if (s.SnRezerva === undefined) s.SnRezerva = 0;
      s.intarire = !!s.intarire;
      if (s.compVeche === undefined) s.compVeche = 0;
    });
    normalizeRoles(p);
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
    tranzitoriu: tranzitoriu,
    DATA_INTRARE_VIGOARE: DATA_INTRARE_VIGOARE,
    newIds: newIds,
    normalizeRoles: normalizeRoles,
    addUserAuto: addUserAuto
  };
})(typeof window !== 'undefined' ? window : this);
