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

  /* ---------------------------------------------------------------
   * Anexa 1 — linie electrică / elemente de rețea cu finanțare în
   * cote egale pe tronsoane.
   *
   * Principiu (ordine-independent, conform art. 12 alin. (1) și Anexei 1):
   * pe fiecare tronson, costul se împarte în cote EGALE între utilizatorii
   * care îl folosesc. Compensația pe care o plătește unul sau mai mulți
   * utilizatori noi unui utilizator existent = costul acestuia din urmă
   * înainte de racordarea noilor utilizatori minus costul său după.
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

    // Defalcare pe tronsoane (informativ), per utilizator nou.
    tronsoaneDetalii.forEach(function (det) {
      Object.keys(det.cote).forEach(function (x) {
        if (isNou(x)) return;
        var c = (det.oldCote[x] || 0) - (det.cote[x] || 0);
        if (c > EPS) {
          nouList.forEach(function (nou) {
            if (det.utilizatori.indexOf(nou) >= 0) det.plati.push({ deLa: nou, catre: x, suma: c });
          });
        }
      });
    });

    // Compensații per utilizator nou, fiecare ca și cum s-ar racorda singur
    // (conform modelului din anexă/.xlsx), apoi cumulate.
    nouList.forEach(function (nou) {
      allUsers.forEach(function (x) {
        if (x === nou || isNou(x)) return;
        // Costul lui x înainte de racordarea lui `nou`:
        var beforeX = 0, afterX = 0;
        tronsoane.forEach(function (t) {
          var users = t.utilizatori || [];
          if (users.indexOf(x) < 0) return;
          var cost = (t.cost !== undefined && t.cost !== null && t.cost !== '')
            ? num(t.cost) : num(t.lungime) * bL;
          var withNou = users.indexOf(nou) >= 0;
          var mNow = users.length;
          var mBefore = withNou ? mNow - 1 : mNow;
          afterX += mNow > 0 ? cost / mNow : 0;
          beforeX += mBefore > 0 ? cost / mBefore : 0;
        });
        var comp = beforeX - afterX;
        if (comp > EPS) addPay(payments, nou, x, comp);
      });
    });

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

    // Echipamente comune (art. 12 alin. 1): cote egale; compensația noilor
    // utilizatori = cost_înainte − cost_după pentru fiecare utilizator existent.
    if (elementeComune > 0 && users.length > 0) {
      var n = users.length;
      var nOld = n - users.filter(function (u) { return nouList.indexOf(u) >= 0; }).length;
      users.forEach(function (x) {
        if (nouList.indexOf(x) >= 0) return;
        var comp = (nOld > 0 ? elementeComune / nOld : 0) - elementeComune / n;
        if (comp > EPS) {
          nouList.forEach(function (nou) { addPay(payments, nou, x, comp); });
        }
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
   * - varianta 2: Anexa 1 (l_U1) + echipamente stație, în cote egale
   * - varianta 3: Anexa 1 (l_U1) + Anexa 2 (stație/PT)
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
      // transformatoarele: împărțire în cote egale (art. 12 alin. 1),
      // aplicată utilizatorilor stației.
      var ec = num(cfg.echipamenteComune);
      if (ec > 0) {
        // Determină utilizatorii stației (primul din listă = primul utilizator).
        var st = (cfg.statii || [])[0];
        var users = st ? orderList(st.utilizatori) : [];
        if (users.length) {
          var prim = (st.primId && users.indexOf(st.primId) >= 0) ? st.primId : users[0];
          var n = users.length;
          var nOld = n - users.filter(function (u) { return nouList.indexOf(u) >= 0; }).length;
          users.forEach(function (x) {
            if (x === prim) return;
            if (nouList.indexOf(x) < 0) return; // plătește doar utilizatorul nou
            var comp = (nOld > 0 ? ec / nOld : 0) - ec / n;
            if (comp > EPS) addPay(payments, x, prim, comp);
          });
        }
      }
    } else if (v === 3 || v === 4) {
      // Anexa 2 pentru stație/PT.
      addStation(cfg.statii);
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
  function checkConditions(c) {
    c = c || {};
    var limita = c.clientCasnic ? 10 : 5;
    var ani = num(c.aniDeLaPF);
    return [
      cond(c.primCapacitateMaiMare,
        'Primul utilizator a contribuit, prin tariful de racordare, la realizarea unei instalații cu capacitate mai mare decât puterea sa aprobată (art. 4).'),
      cond(c.capacitateDisponibila,
        'Capacitatea instalației nu a fost ocupată integral și permite racordarea noului utilizator (există capacitate suplimentară).'),
      cond(ani <= limita,
        'Instalația se află în primii ' + limita + ' ani de la punerea în funcțiune (în caz: ' + ani + ' ani).'),
      cond(c.solutieComuna,
        'Soluția stabilită pentru noul utilizator prevede utilizarea parțială sau totală, în comun, a instalației.'),
      cond(c.tarifAchitatIntegral,
        'Tariful de racordare aferent elementelor utilizate în comun a fost achitat integral de utilizatorii care primesc compensația.')
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

  // Cumulat „cine plătește cui”, per utilizator nou: se construiește pe rând
  // câte un scenariu cu un singur nou utilizator (comportamentul din .xlsx)
  // și se însumează. Astfel, dacă se racordează doi utilizatori simultan
  // (schemă cu n+1 față de n-1), fiecare plătește ca și cum ar veni singur.
  function allPayments(model, buildCfg) {
    var list = buildCfg().nouUtilizatori || [];
    var total = {};
    list.forEach(function (nou) {
      var cfg = buildCfg(nou);
      var res = compute(model, cfg);
      mergePayments(total, res.payments);
    });
    return total;
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
    allPayments: allPayments,
    checkConditions: checkConditions,
    centralizator: centralizator,
    totals: totals,
    computeStations: computeStations,
    mergePayments: mergePayments,
    r2: r2
  };
})(typeof window !== 'undefined' ? window : this);
