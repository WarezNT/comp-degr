/*
 * Calc — logica de aplicație fără interfață: construirea configurațiilor pentru motor,
 * derivarea costurilor, condițiile din art. 8 / art. 7, calculul complet al unui proiect
 * și exportul CSV. Toate funcțiile primesc proiectul `p` explicit (fără stare globală).
 */
(function (global) {
  'use strict';

  var E = global.CompEngine;
  var S = global.AppState;
  var V = global.AppValidate;

  var CHECK_MODELS = ['line', 'station', 'complex'];

  function byId(arr, id) {
    for (var i = 0; i < (arr || []).length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function nameOf(p, id) {
    var u = S.findUser(p, id);
    return u ? (u.nume || u.codPA || id) : id;
  }

  /* ----------------------- costuri linie / stație ----------------------- */

  // Sursa unică pentru costurile liniei: b_L = I_L / L (dacă nu e fixat manual)
  // și costul tronsonului = lungime × b_L (dacă nu e fixat manual).
  function lineBl(l) {
    if (l.bLManual) return Number(l.bL) || 0;
    var L = Number(l.L) || 0;
    return L > 0 ? (Number(l.IL) || 0) / L : 0;
  }

  function tronsonCost(l, t) {
    if (t.costManual && t.cost !== '' && t.cost !== undefined && t.cost !== null) return Number(t.cost) || 0;
    return (Number(t.lungime) || 0) * lineBl(l);
  }

  // Derivează b_L și costurile tronsoanelor în modul automat.
  function deriveAll(p) {
    (p.linii || []).forEach(function (l) {
      if (!l.bLManual) l.bL = lineBl(l);
      (l.tronsoane || []).forEach(function (t) {
        if (!t.costManual) t.cost = tronsonCost(l, t);
      });
    });
  }

  // Art. 18: costul net al unei linii în regim tranzitoriu: (I_L − compensații vechi) / I_L.
  function lineFactor(p, l) {
    return S.tranzitoriu(p).activ ? E.factorCostNet(l.IL, l.compVeche) : 1;
  }
  function stationIT(p, s) {
    var IT = Number(s.IT) || 0;
    return S.tranzitoriu(p).activ ? Math.max(0, IT - Math.max(0, Number(s.compVeche) || 0)) : IT;
  }

  // Puterea aprobată a utilizatorilor deja racordați la stație (fără cei noi).
  function stationOccupied(p, s) {
    var nou = S.newIds(p);
    return (s.utilizatori || []).reduce(function (sum, id) {
      if (nou.indexOf(id) >= 0) return sum;
      var u = S.findUser(p, id);
      return sum + (u ? Number(u.putere) || 0 : 0);
    }, 0);
  }

  /* ----------------------- modificare pe cale (data binding) ----------------------- */

  // Setează o valoare după o cale de forma „user.<id>.nume”, „line.<id>.IL”,
  // „tronson.<linie>.<tronson>.lungime”, „meta.tva”, „cond.dataPIF” etc.
  function setPath(p, path, value) {
    var seg = path.split('.');
    if (seg[0] === 'meta') p.meta[seg[1]] = value;
    else if (seg[0] === 'tranz') p.tranzitoriu[seg[1]] = value;
    else if (seg[0] === 'dev') p.dezvoltator[seg[1]] = value;
    else if (seg[0] === 'cond') p.conditii[seg[1]] = value;
    else if (seg[0] === 'complex') p.complexConfig[seg[1]] = value;
    else if (seg[0] === 'user') {
      var u = S.findUser(p, seg[1]);
      if (u) {
        u[seg[2]] = value;
        // Un singur prim utilizator: când cineva primește rolul „prim”, ceilalți devin „existent”.
        if (seg[2] === 'rol' && value === 'prim') {
          p.utilizatori.forEach(function (x) { if (x.id !== u.id && x.rol === 'prim') x.rol = 'existent'; });
        }
      }
    } else if (seg[0] === 'line') {
      var l = byId(p.linii, seg[1]);
      if (l) {
        l[seg[2]] = value;
        if (seg[2] === 'bL') {
          // Golirea câmpului revine la calculul automat din I_L / L.
          if (value === '' || value === null) { l.bLManual = false; l.bL = lineBl(l); }
          else l.bLManual = true;
        }
        if ((seg[2] === 'IL' || seg[2] === 'L') && !l.bLManual) l.bL = lineBl(l);
      }
    } else if (seg[0] === 'stat') {
      var st = byId(p.statii, seg[1]);
      if (st) st[seg[2]] = value;
    } else if (seg[0] === 'tronson') {
      var ln = byId(p.linii, seg[1]);
      if (ln) { var t = byId(ln.tronsoane, seg[2]); if (t) t[seg[3]] = value; }
    } else if (seg[0] === 'devitem') {
      var d = byId(p.dezvoltator.dezvoltatori, seg[1]);
      if (d) d[seg[2]] = value;
    }
    deriveAll(p);
  }

  /* ----------------------- configurații pentru motor ----------------------- */

  function mergeCfg(a, b) {
    var o = {};
    Object.keys(a).forEach(function (k) { o[k] = a[k]; });
    Object.keys(b).forEach(function (k) { o[k] = b[k]; });
    return o;
  }

  function stationCfg(p, s, puteri, primId, nouCfg) {
    return mergeCfg({
      Sn: s.Sn, SnRezerva: s.SnRezerva || 0, IT: stationIT(p, s), elementeComune: s.elementeComune,
      intarire: !!s.intarire, ignorati: S.tranzitoriu(p).ignorati,
      utilizatori: (s.utilizatori || []).slice(), puteri: puteri, primId: primId
    }, nouCfg);
  }

  function lineTronsoane(p, lines) {
    var out = [];
    (lines || []).forEach(function (l) {
      (l.tronsoane || []).forEach(function (t) {
        out.push({
          id: t.id,
          tip: t.tip,
          nume: (l.nume ? l.nume + ' · ' : '') + (t.nume || ''),
          lungime: t.lungime,
          cost: tronsonCost(l, t) * lineFactor(p, l),
          utilizatori: (t.utilizatori || []).slice()
        });
      });
    });
    return out;
  }

  function buildConfig(p, model, singleNou) {
    var puteri = {};
    p.utilizatori.forEach(function (u) { puteri[u.id] = Number(u.putere) || 0; });
    var primId = S.primId(p);
    var ignorati = S.tranzitoriu(p).ignorati;
    var nouList = singleNou ? [singleNou] : S.newIds(p);
    var nouCfg = { nouUtilizatori: nouList, nouUtilizator: nouList.length === 1 ? nouList[0] : null };

    if (model === 'line') {
      return mergeCfg({ bL: 0, tronsoane: lineTronsoane(p, p.linii), primId: primId, ignorati: ignorati }, nouCfg);
    }
    if (model === 'station') {
      return {
        statii: p.statii.map(function (s) { return stationCfg(p, s, puteri, primId, nouCfg); }),
        puteri: puteri, primId: primId, ignorati: ignorati,
        nouUtilizatori: nouList, nouUtilizator: nouCfg.nouUtilizator
      };
    }
    if (model === 'complex') {
      var sel = p.complexConfig;
      var liniiU1 = p.linii.filter(function (l) { return sel.liniiIds.indexOf(l.id) >= 0; });
      var liniiU2 = p.linii.filter(function (l) { return sel.liniiU2Ids.indexOf(l.id) >= 0; });
      var st = p.statii.filter(function (s) { return sel.statiiIds.indexOf(s.id) >= 0; });
      function lineCfg(l) {
        return mergeCfg({ bL: lineBl(l), tronsoane: lineTronsoane(p, [l]), primId: primId, ignorati: ignorati }, nouCfg);
      }
      return {
        varianta: Number(sel.varianta) || 1,
        liniiU1: liniiU1.map(lineCfg),
        liniiU2: liniiU2.map(lineCfg),
        statii: st.map(function (s) { return stationCfg(p, s, puteri, primId, nouCfg); }),
        puteri: puteri, ignorati: ignorati,
        nouUtilizatori: nouList, nouUtilizator: nouCfg.nouUtilizator
      };
    }
    if (model === 'transitional') {
      return { B: p.tranzitoriu.B, S: p.tranzitoriu.S, S2: p.tranzitoriu.S2, l2: p.tranzitoriu.l2, L: p.tranzitoriu.L };
    }
    if (model === 'developer') {
      return { Itotal: p.dezvoltator.Itotal, Ief: p.dezvoltator.Ief, dezvoltatori: p.dezvoltator.dezvoltatori };
    }
    return {};
  }

  /* ----------------------- condiții (art. 8, art. 7, Anexa 5) ----------------------- */

  // Anii de la punerea în funcțiune: derivați din data PIF dacă e completată,
  // altfel valoarea introdusă manual.
  function effectiveYears(p) {
    var c = p.conditii;
    if (c.dataPIF && p.meta.dataCalcul) {
      var a = new Date(c.dataPIF), b = new Date(p.meta.dataCalcul);
      if (!isNaN(a) && !isNaN(b)) {
        return Math.max(0, Math.round(((b - a) / 86400000 / 365.25) * 100) / 100);
      }
    }
    return Number(c.aniDeLaPF) || 0;
  }

  // Beneficiarii compensațiilor (cei care primesc): din plățile calculate;
  // dacă nu se poate calcula încă, toți utilizatorii care nu plătesc.
  function receiverIds(p) {
    var ids = {};
    var model = p.meta.model;
    if (CHECK_MODELS.indexOf(model) >= 0 && !V.validate(p).errors.length) {
      try {
        var r = E.compute(model, buildConfig(p, model));
        Object.keys(r.payments || {}).forEach(function (payer) {
          Object.keys(r.payments[payer]).forEach(function (rec) { ids[rec] = true; });
        });
      } catch (e) { /* se folosește lista de rezervă */ }
    }
    var list = Object.keys(ids);
    if (!list.length) {
      var nou = S.newIds(p);
      list = p.utilizatori.map(function (u) { return u.id; }).filter(function (id) { return nou.indexOf(id) < 0; });
    }
    return list;
  }

  // Art. 7 alin. (1): fiecare beneficiar trebuie să fi achitat integral tariful. Se verifică
  // din „Data achitare TR” (completată și nu ulterioară datei întocmirii); bifa din Rezultate
  // confirmă manual când data lipsește.
  function tariffStatus(p) {
    var dc = p.meta.dataCalcul;
    var missingIds = receiverIds(p).filter(function (id) {
      var u = S.findUser(p, id);
      return u && (!u.dataTR || (dc && u.dataTR > dc));
    });
    return {
      missingIds: missingIds,
      missing: missingIds.map(function (id) { return nameOf(p, id); }),
      ok: !missingIds.length || !!p.conditii.tarifAchitatIntegral
    };
  }

  function currentConditions(p) {
    var c = {};
    Object.keys(p.conditii).forEach(function (k) { c[k] = p.conditii[k]; });
    c.aniDeLaPF = effectiveYears(p);
    var prim = S.findUser(p, S.primId(p));
    c.clientCasnic = !!(prim && prim.tipClient === 'casnic');   // art. 8 alin. 2: prag 10 ani
    c.tarifAchitatIntegral = tariffStatus(p).ok;
    return c;
  }

  // Condițiile aplicabile modelului: art. 8 (+ art. 7) pentru Anexele 1–3; pentru Anexa 5,
  // termenul de 5 ani (pct. 1); nimic pentru Anexa 4 pct. A.
  function conditionsFor(p) {
    var model = p.meta.model;
    if (CHECK_MODELS.indexOf(model) >= 0) return E.checkConditions(currentConditions(p));
    if (model === 'developer') {
      var ani = effectiveYears(p);
      return [{ ok: ani <= 5, rule: 'anexa5', mesaj: 'Contractul de finanțare/racordare se încheie în cel mult 5 ani de la punerea în funcțiune a rețelei finanțate de primul dezvoltator (în caz: ' + ani + ' ani).' }];
    }
    return [];
  }

  /* ----------------------- calcul complet ----------------------- */

  // Returnează rezultatul sau un obiect { error, errors, blocked, ... } când calculul nu e posibil.
  function runCalculation(p) {
    var check = V.validate(p);
    if (check.errors.length) {
      return { error: check.errors.map(V.describe).join(' '), errors: check.errors, warnings: check.warnings };
    }
    var model = p.meta.model;
    var nouList = S.newIds(p);
    var res = E.compute(model, buildConfig(p, model));
    if (!res.nouUtilizatori) res.nouUtilizatori = nouList;

    var conds = conditionsFor(p);
    var failed = conds.filter(function (x) { return !x.ok; });
    if (failed.length && !p.conditii.calcInformativ) {
      // Art. 8 alin. 1: compensația se calculează și se plătește NUMAI dacă sunt îndeplinite cumulativ condițiile.
      var tf = tariffStatus(p);
      var rl = global.AppRules;
      return {
        error: 'Compensația se calculează și se plătește numai dacă sunt îndeplinite cumulativ condițiile (' + rl.label('art8.1') + '). Neîndeplinite: ' +
          failed.map(function (x) { return x.mesaj + (rl.label(x.rule) ? ' (' + rl.label(x.rule) + ')' : ''); }).join(' | ') +
          (tf.ok ? '' : ' Beneficiari fără „Data achitare TR”: ' + tf.missing.join(', ') + '.') +
          ' — Pentru o valoare orientativă, bifează „Calculează oricum (informativ)”.',
        blocked: true, failed: failed, conditions: conds, warnings: check.warnings
      };
    }

    var central = null;
    if (res.model === 'line' || res.model === 'station' || res.model === 'complex') {
      central = E.centralizator(res.payments, nouList, p.utilizatori, p.meta.tva, p.meta.withTva);
      res.totals = E.totals(res.payments, p.utilizatori);
      // Explicațiile de calcul se leagă de rândurile centralizatorului (plătitor → beneficiar).
      central.rows.forEach(function (row) {
        row.explicatii = (res.explicatii || []).filter(function (x) { return x.de === row.deLaId && x.catre === row.id; });
      });
    }
    res.central = central;
    res.conditions = conds;
    res.warnings = check.warnings;
    return res;
  }

  /* ----------------------- export CSV ----------------------- */

  function csvText(v) { return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"'; }
  function csvNum(x) { return E.r2(x).toFixed(2).replace('.', ','); }

  function toCsv(results) {
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
    return '﻿' + lines.join('\r\n');
  }

  global.AppCalc = {
    CHECK_MODELS: CHECK_MODELS,
    byId: byId, nameOf: nameOf,
    lineBl: lineBl, tronsonCost: tronsonCost, deriveAll: deriveAll,
    lineFactor: lineFactor, stationIT: stationIT, stationOccupied: stationOccupied,
    setPath: setPath, buildConfig: buildConfig,
    effectiveYears: effectiveYears, receiverIds: receiverIds, tariffStatus: tariffStatus,
    currentConditions: currentConditions, conditionsFor: conditionsFor,
    runCalculation: runCalculation, toCsv: toCsv
  };
})(typeof window !== 'undefined' ? window : this);
