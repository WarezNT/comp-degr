/*
 * CompEngine — motor de calcul pentru metodologia ANRE de stabilire a
 * compensațiilor bănești între utilizatorii racordați în etape diferite,
 * prin instalație comună, la rețele electrice de interes public.
 *
 * Referințe: Metodologia 2015 (M.Of. nr. 12/07.01.2016), anexele nr. 1–5.
 * Funcții pure, fără dependențe, folosibile în browser și în teste.
 */
(function (global) {
  'use strict';

  var EPS = 1e-9;

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : 0;
  }

  // Rotunjire la 2 zecimale, robustă la erori de reprezentare binară
  // (ex. 1.005 · 100 = 100.49999999999999): normalizăm la 12 cifre semnificative.
  function r2(x) {
    var v = num(x);
    var sign = v < 0 ? -1 : 1;
    return sign * Math.round(parseFloat((Math.abs(v) * 100).toPrecision(12))) / 100;
  }

  // Plățile negative sau nule nu se înregistrează: o valoare negativă indică
  // o eroare de date (prinsă de validare), nu trebuie transformată în plată.
  function addPay(m, payer, receiver, amount) {
    if (payer === undefined || payer === null || receiver === undefined || receiver === null) return;
    var a = num(amount);
    if (a <= EPS) return;
    if (!m[payer]) m[payer] = {};
    m[payer][receiver] = (m[payer][receiver] || 0) + a;
  }

  function mergePayments(target, source) {
    Object.keys(source || {}).forEach(function (payer) {
      Object.keys(source[payer]).forEach(function (receiver) {
        addPay(target, payer, receiver, source[payer][receiver]);
      });
    });
    return target;
  }

  /* Împărțire în cote egale, SECVENȚIALĂ (Anexa 1, pct. 2–3): utilizatorii noi
   * se adaugă pe rând, în ordinea racordării. Fiecare utilizator nou plătește
   * celor deja prezenți (vechi sau noi racordați înaintea lui) diferența dintre
   * cota lor înainte (n−1 utilizatori) și după (n utilizatori).
   * Suma primită de un utilizator vechi = cost/n_vechi − cost/n_final.
   * Returnează [{ de, catre, suma }]. */
  function sequentialPayments(cost, users, nouList) {
    var uniq = [];
    (users || []).forEach(function (u) { if (uniq.indexOf(u) < 0) uniq.push(u); });
    var present = uniq.filter(function (u) { return nouList.indexOf(u) < 0; });
    var out = [];
    nouList.forEach(function (nou) {
      if (uniq.indexOf(nou) < 0 || present.indexOf(nou) >= 0) return;
      var before = present.slice();
      present.push(nou);
      if (!before.length || cost <= 0) return;
      var per = cost / before.length - cost / present.length;
      if (per > EPS) {
        before.forEach(function (x) { out.push({ de: nou, catre: x, suma: per }); });
      }
    });
    return out;
  }

  /* ---------------------------------------------------------------
   * Anexa 1 — linie electrică / elemente de rețea cu finanțare în
   * cote egale pe tronsoane.
   *
   * Principiu (art. 12 alin. (1) și Anexa 1): pe fiecare tronson, costul se
   * împarte în cote EGALE între utilizatorii care îl folosesc. Utilizatorii noi
   * se racordează SECVENȚIAL, în ordinea din `nouUtilizatori`: fiecare plătește
   * celor deja prezenți (inclusiv noilor racordați înaintea lui) diferența
   * dintre costul lor înainte și după racordarea sa.
   *
   * cfg = {
   *   bL: number,                       // cost specific lei/m (opțional)
   *   nouUtilizator: userId,            // UN singur utilizator nou (compatibil)
   *   nouUtilizatori: [userId, ...],    // MAI MULȚI utilizatori noi racordați simultan
   *   echipamentComun: number,          // A — echipamente de racordare (opțional)
   *   tronsoane: [{
   *     id, nume, lungime, cost,        // cost explicit SAU lungime * bL
   *     utilizatori: [userId, ...]      // utilizatorii care folosesc tronsonul
   *   }]
   * }
   * ------------------------------------------------------------- */
  function listNew(cfg) {
    var arr = [];
    if (cfg && cfg.nouUtilizatori) arr = cfg.nouUtilizatori.slice();
    else if (cfg && cfg.nouUtilizator) arr = [cfg.nouUtilizator];
    return arr.filter(function (x) { return x !== undefined && x !== null && x !== ''; });
  }

  function computeLine(cfg) {
    cfg = cfg || {};
    var bL = num(cfg.bL);
    var tronsoane = cfg.tronsoane || [];
    var nouList = listNew(cfg);
    var echipamentComun = num(cfg.echipamentComun);

    function isNou(u) { return nouList.indexOf(u) >= 0; }

    var payments = {};
    var finalShare = {};   // costul cu noii utilizatori racordați
    var oldShare = {};     // costul înainte de racordarea noilor utilizatori
    var allUsers = [];
    var tronsoaneDetalii = [];

    function touch(u) { if (u !== undefined && u !== null && u !== '' && allUsers.indexOf(u) < 0) allUsers.push(u); }

    tronsoane.forEach(function (t) {
      var users = (t.utilizatori || []).slice();
      var cost = (t.cost !== undefined && t.cost !== null && t.cost !== '')
        ? num(t.cost)
        : num(t.lungime) * bL;
      var m = users.length;
      var noiAici = users.filter(isNou).length;
      var mOld = m - noiAici;

      var det = {
        id: t.id,
        nume: t.nume,
        lungime: num(t.lungime),
        cost: cost,
        nrUtilizatori: m,
        utilizatori: users.slice(),
        cote: {},
        oldCote: {},
        plati: []
      };

      users.forEach(function (u) {
        touch(u);
        var cota = m > 0 ? cost / m : 0;
        finalShare[u] = (finalShare[u] || 0) + cota;
        det.cote[u] = cota;
        if (!isNou(u) && mOld > 0) {
          oldShare[u] = (oldShare[u] || 0) + cost / mOld;
          det.oldCote[u] = cost / mOld;
        }
      });
      sequentialPayments(cost, users, nouList).forEach(function (p) {
        addPay(payments, p.de, p.catre, p.suma);
        det.plati.push({ deLa: p.de, catre: p.catre, suma: p.suma });
      });
      tronsoaneDetalii.push(det);
    });

    // Echipamente de racordare (A), în cote egale între toți utilizatorii liniei.
    if (echipamentComun > 0 && allUsers.length > 0) {
      var n = allUsers.length;
      var nOld = n - allUsers.filter(isNou).length;
      allUsers.forEach(function (u) {
        finalShare[u] = (finalShare[u] || 0) + echipamentComun / n;
        if (!isNou(u) && nOld > 0) oldShare[u] = (oldShare[u] || 0) + echipamentComun / nOld;
      });
    }

    // Echipamente de racordare (A): tot în cote egale, secvențial.
    if (echipamentComun > 0) {
      sequentialPayments(echipamentComun, allUsers, nouList).forEach(function (p) {
        addPay(payments, p.de, p.catre, p.suma);
      });
    }

    return {
      model: 'line',
      bL: bL,
      nouUtilizator: nouList.length === 1 ? nouList[0] : null,
      nouUtilizatori: nouList.slice(),
      payments: payments,
      finalShare: finalShare,
      oldShare: oldShare,
      tronsoaneDetalii: tronsoaneDetalii
    };
  }

  /* ---------------------------------------------------------------
   * Anexa 2 — stație electrică / post de transformare
   * (repartizare proporțională cu puterea aprobată).
   *
   * cfg = {
   *   Sn: number,                       // capacitate nominală [kVA]
   *   SnRezerva: number,                // capacitate transformator de rezervă N-1 [kVA]
   *   IT: number,                       // cost lucrări [lei]
   *   elementeComune: number,           // echipamente comune [lei] (opțional)
   *   utilizatori: [userId, ...],       // utilizatorii racordați (ordine informativă)
   *   primId: userId,                   // primul utilizator (finanțatorul) — primește
   *   nouUtilizator: userId,            // noul utilizator — plătește
   *   puteri: { userId: kVA }
   * }
   * ------------------------------------------------------------- */
  function computeStation(cfg) {
    cfg = cfg || {};
    if (cfg.statii) return computeStations(cfg);
    var Sn = num(cfg.Sn);
    var SnRezerva = num(cfg.SnRezerva);
    // Art. 15 alin. (4): capacitatea transformatorului de rezervă (criteriul
    // N-1) nu se ia în considerare la calculul costului specific b_T.
    var SnEfectiv = Sn - SnRezerva;
    var IT = num(cfg.IT);
    var bT = SnEfectiv > 0 ? IT / SnEfectiv : 0;
    var users = (cfg.utilizatori || []).slice();
    var puteri = cfg.puteri || {};
    var elementeComune = num(cfg.elementeComune);
    var nouList = listNew(cfg);
    var payments = {};
    var cote = {};
    // Primul utilizator (receptorul) = cel bifat explicit, chiar dacă nu apare
    // în lista stației (el a finanțat instalația); doar dacă nu e indicat
    // niciunul, se folosește primul din listă.
    var prim = cfg.primId ? cfg.primId : users[0];

    // Compensația pe putere: fiecare utilizator NOU plătește primului
    // utilizator cota proporțională cu puterea sa (art. 13).
    users.forEach(function (u) {
      var P = num(puteri[u]);
      cote[u] = P * bT;
      if (nouList.indexOf(u) >= 0 && u !== prim && prim !== undefined) {
        addPay(payments, u, prim, P * bT);
      }
    });

    // Echipamente comune (art. 6 alin. 1 lit. a pct. ii, art. 12 alin. 1): cote
    // egale, aplicate secvențial; plătesc către toți utilizatorii prezenți.
    if (elementeComune > 0 && users.length > 0) {
      sequentialPayments(elementeComune, users, nouList).forEach(function (p) {
        addPay(payments, p.de, p.catre, p.suma);
      });
    }

    return {
      model: 'station',
      Sn: Sn,
      SnRezerva: SnRezerva,
      SnEfectiv: SnEfectiv,
      IT: IT,
      bT: bT,
      elementeComune: elementeComune,
      nouUtilizator: nouList.length === 1 ? nouList[0] : null,
      nouUtilizatori: nouList.slice(),
      cote: cote,
      payments: payments,
      prim: prim
    };
  }

  // Mai multe stații/PT: compensațiile se însumează. Rezultatul păstrează
  // detaliul fiecărei stații în `statii`.
  function computeStations(cfg) {
    var nouList = listNew(cfg);
    var payments = {};
    var statii = (cfg.statii || []).map(function (sc) {
      var o = {};
      Object.keys(sc).forEach(function (k) { o[k] = sc[k]; });
      if (o.nouUtilizatori === undefined) o.nouUtilizatori = nouList;
      if (o.primId === undefined) o.primId = cfg.primId;
      if (o.puteri === undefined) o.puteri = cfg.puteri;
      var res = computeStation(o);
      mergePayments(payments, res.payments);
      return res;
    });
    return {
      model: 'station',
      nouUtilizator: nouList.length === 1 ? nouList[0] : null,
      nouUtilizatori: nouList,
      payments: payments,
      statii: statii
    };
  }

  /* ---------------------------------------------------------------
   * Anexa 3 — instalație de racordare complexă: însumarea componentelor
   * conform variantei punctului de racordare (art. 14).
   *
   * cfg = {
   *   varianta: 1..4,
   *   liniiU1: [cfgLine, ...],   // compensația Anexa 1 pentru l_U1
   *   liniiU2: [cfgLine, ...],   // doar varianta 4 (l_U2)
   *   statii:  [cfgStation, ...],// doar variantele 3 și 4 (Anexa 2)
   *   echipamenteComune: number  // doar varianta 2 (art. 12 alin. 1)
   * }
   *
   * - varianta 1: Anexa 1 pentru l_U1
   * - varianta 2: Anexa 1 (l_U1) + echipamente stație, în cote egale (toți utilizatorii)
   * - varianta 3: Anexa 1 (l_U1) + Anexa 2 (transformator; fără echipamente comune)
   * - varianta 4: Anexa 1 (l_U1) + Anexa 2 (stație/PT) + Anexa 1 (l_U2)
   * ------------------------------------------------------------- */
  function computeComplex(cfg) {
    cfg = cfg || {};
    var v = num(cfg.varianta) || 1;
    var components = [];
    var payments = {};
    var nouList = listNew(cfg);
    var puteri = cfg.puteri || {};

    function withNou(sub) {
      var o = {};
      Object.keys(sub || {}).forEach(function (k) { o[k] = sub[k]; });
      if (o.nouUtilizatori === undefined) o.nouUtilizatori = nouList;
      if (o.nouUtilizator === undefined) o.nouUtilizator = nouList.length === 1 ? nouList[0] : null;
      if (o.primId === undefined) o.primId = cfg.primId;
      if (o.puteri === undefined) o.puteri = puteri;
      return o;
    }

    function addLine(list) {
      (list || []).forEach(function (l) {
        var res = computeLine(withNou(l));
        components.push(res);
        mergePayments(payments, res.payments);
      });
    }
    function addStation(list) {
      (list || []).forEach(function (s) {
        var res = computeStation(withNou(s));
        components.push(res);
        mergePayments(payments, res.payments);
      });
    }

    // Componenta Anexa 1 pentru l_U1 (toate variantele).
    addLine(cfg.liniiU1 || cfg.linii);

    if (v === 2) {
      // Echipamentele electroenergetice ale stației, altele decât
      // transformatoarele: cote egale (art. 12 alin. 1), plătite tuturor
      // utilizatorilor care au contribuit (art. 6 alin. 1 lit. a pct. ii),
      // secvențial, pentru fiecare stație selectată.
      (cfg.statii || []).forEach(function (st) {
        var ec = num(st.elementeComune);
        if (ec <= 0) return;
        sequentialPayments(ec, orderList(st.utilizatori), nouList).forEach(function (pp) {
          addPay(payments, pp.de, pp.catre, pp.suma);
        });
      });
    } else if (v === 3 || v === 4) {
      // Anexa 3, var. 3/4: doar Anexa 1 (l_U1) + Anexa 2 (transformator).
      // Echipamentele comune nu se adaugă (lectura literală a Anexei 3).
      addStation((cfg.statii || []).map(function (st) {
        var o = {};
        Object.keys(st).forEach(function (k) { o[k] = st[k]; });
        o.elementeComune = 0;
        return o;
      }));
    }
    if (v === 4) {
      // Anexa 1 pentru l_U2.
      addLine(cfg.liniiU2);
    }

    return {
      model: 'complex',
      varianta: v,
      payments: payments,
      components: components,
      nouUtilizatori: nouList
    };
  }

  function orderList(a) { return (a || []).slice(); }

  /* ---------------------------------------------------------------
   * Anexa 4 — prevederi tranzitorii (Metodologia Ord. 28/2003).
   * b = B / S ;  C2 = S2 * b * (l2 / L)
   * cfg = { B, S, S2, l2, L }
   * ------------------------------------------------------------- */
  function computeTransitional(cfg) {
    cfg = cfg || {};
    var B = num(cfg.B);
    var S = num(cfg.S);
    var b = S > 0 ? B / S : 0;
    var S2 = num(cfg.S2);
    var l2 = num(cfg.l2);
    var L = num(cfg.L);
    var C2 = b * S2 * (L > 0 ? l2 / L : 0);
    return {
      model: 'transitional',
      b: b,
      C2: C2,
      detalii: { B: B, S: S, S2: S2, l2: l2, L: L }
    };
  }

  /* ---------------------------------------------------------------
   * Anexa 5 — rețea publică finanțată de un prim dezvoltator.
   * cfg = {
   *   Itotal, Ief,
   *   dezvoltatori: [{ id, nume, putere, elementeComune }]
   * }
   * ------------------------------------------------------------- */
  function computeDeveloper(cfg) {
    cfg = cfg || {};
    var Itotal = num(cfg.Itotal);
    var Ief = num(cfg.Ief);
    var Xef = Itotal > 0 ? Ief / Itotal : 0;
    var Xinef = 1 - Xef;
    var dev = cfg.dezvoltatori || [];
    var Ptotal = dev.reduce(function (s, d) { return s + num(d.putere); }, 0);

    var rows = dev.map(function (d) {
      var share = Ptotal > 0 ? Xinef * num(d.putere) / Ptotal : 0;
      return {
        id: d.id,
        nume: d.nume,
        putere: num(d.putere),
        Xinef: share,
        suma: Itotal * share
      };
    });

    return {
      model: 'developer',
      Xef: Xef,
      Xinef: Xinef,
      Itotal: Itotal,
      Ief: Ief,
      rows: rows
    };
  }

  /* ---------------------------------------------------------------
   * Condiții cumulative — Art. 8 din metodologie.
   * ------------------------------------------------------------- */
  // Art. 8 alin. (1) lit. a–d (cumulativ) + art. 7 alin. (1) (tariful achitat
  // integral de cei care primesc compensația). Pragul de ani: 5, respectiv 10
  // pentru primul utilizator casnic (art. 8 alin. 2). `c.tarifAchitatIntegral`
  // trebuie calculat de apelant (din datele beneficiarilor sau confirmare manuală).
  function checkConditions(c) {
    c = c || {};
    var limita = c.clientCasnic ? 10 : 5;
    var ani = num(c.aniDeLaPF);
    return [
      cond(c.primCapacitateMaiMare,
        'Art. 8 alin. 1 lit. a: primul utilizator a contribuit, prin tariful de racordare achitat integral, la o instalație cu capacitate mai mare decât puterea sa aprobată (art. 4).'),
      cond(c.capacitateDisponibila,
        'Art. 8 alin. 1 lit. b: capacitatea instalației nu a fost ocupată integral și permite racordarea noului utilizator.'),
      cond(ani <= limita,
        'Art. 8 alin. 1 lit. c: instalația se află în primii ' + limita + ' ani de la punerea în funcțiune' +
        (c.clientCasnic ? ' (prag extins la 10 ani — prim utilizator casnic, art. 8 alin. 2)' : '') + ' (în caz: ' + ani + ' ani).'),
      cond(c.solutieComuna,
        'Art. 8 alin. 1 lit. d: soluția pentru noul utilizator prevede utilizarea parțială sau totală, în comun, a instalației.'),
      cond(c.tarifAchitatIntegral,
        'Art. 7 alin. 1: tariful de racordare aferent elementelor utilizate în comun a fost achitat integral de utilizatorii care primesc compensația.')
    ];
  }

  function cond(ok, mesaj) {
    return { ok: !!ok, mesaj: mesaj };
  }

  /* ---------------------------------------------------------------
   * Centralizator: ce plătesc noii utilizatori fiecărui utilizator
   * anterior, cu/fără TVA. `newUser` poate fi un id sau o listă de id-uri;
   * plățile se cumulează pe categorii: de la utilizatorul nou X către Y.
   * ------------------------------------------------------------- */
  function centralizator(payments, newUser, utilizatori, tvaRate, withTva) {
    var newList = Array.isArray(newUser) ? newUser.slice() : (newUser ? [newUser] : []);
    var byId = {};
    (utilizatori || []).forEach(function (u) { byId[u.id] = u; });

    function mkRow(payer, rec, base) {
      var tva = withTva ? base * num(tvaRate) / 100 : 0;
      var u = byId[rec] || { id: rec, nume: rec, codPA: '' };
      var p = byId[payer] || { id: payer, nume: payer, codPA: '' };
      return {
        id: rec,
        deLaId: payer,
        deLaNume: p.nume || p.codPA || payer,
        deLaCodPA: p.codPA,
        codPA: u.codPA,
        nume: u.nume,
        faraTVA: r2(base),
        cuTVA: r2(base + tva)
      };
    }

    var rows = [];
    newList.forEach(function (payer) {
      var row = (payments && payments[payer]) || {};
      Object.keys(row).forEach(function (rec) {
        if (Math.abs(num(row[rec])) <= EPS) return;
        rows.push(mkRow(payer, rec, num(row[rec])));
      });
    });

    // Total pe fiecare utilizator nou (pentru afișare separată, dacă e cazul).
    var perNou = {};
    newList.forEach(function (payer) {
      var row = (payments && payments[payer]) || {};
      var tf = 0, tc = 0;
      Object.keys(row).forEach(function (rec) {
        var base = num(row[rec]);
        if (Math.abs(base) <= EPS) return;
        tf += base;
        tc += base + (withTva ? base * num(tvaRate) / 100 : 0);
      });
      perNou[payer] = { faraTVA: r2(tf), cuTVA: r2(tc) };
    });

    var totalFara = rows.reduce(function (s, x) { return s + x.faraTVA; }, 0);
    var totalCu = rows.reduce(function (s, x) { return s + x.cuTVA; }, 0);

    return {
      rows: rows,
      newList: newList,
      perNou: perNou,
      totalFaraTVA: r2(totalFara),
      totalCuTVA: r2(totalCu)
    };
  }

  /* Totaluri pe utilizatori: cine primește (suma coloanei) și cine plătește
   * (suma liniei), plus cota finală din elementele de cost. */
  function totals(payments, utilizatori) {
    var primite = {};
    var platite = {};
    (utilizatori || []).forEach(function (u) { primite[u.id] = 0; platite[u.id] = 0; });
    Object.keys(payments || {}).forEach(function (payer) {
      Object.keys(payments[payer]).forEach(function (rec) {
        platite[payer] = (platite[payer] || 0) + payments[payer][rec];
        primite[rec] = (primite[rec] || 0) + payments[payer][rec];
      });
    });
    return { primite: primite, platite: platite };
  }

  function compute(model, cfg) {
    switch (model) {
      case 'line': return computeLine(cfg);
      case 'station': return computeStation(cfg);
      case 'complex': return computeComplex(cfg);
      case 'transitional': return computeTransitional(cfg);
      case 'developer': return computeDeveloper(cfg);
      default: throw new Error('Model necunoscut: ' + model);
    }
  }

  global.CompEngine = {
    compute: compute,
    computeLine: computeLine,
    computeStation: computeStation,
    computeComplex: computeComplex,
    computeTransitional: computeTransitional,
    computeDeveloper: computeDeveloper,
    checkConditions: checkConditions,
    centralizator: centralizator,
    totals: totals,
    computeStations: computeStations,
    sequentialPayments: sequentialPayments,
    mergePayments: mergePayments,
    r2: r2
  };
})(typeof window !== 'undefined' ? window : this);
