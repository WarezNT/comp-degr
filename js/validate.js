/*
 * Validate — verificarea datelor proiectului înainte de calcul.
 *
 * Returnează { errors: [issue], warnings: [issue] }, unde
 *   issue = { rule, severity, text, tab, target }
 *   - rule   → id din AppRules (temeiul legal; chip-ul „art. …” din interfață) sau null;
 *   - tab    → pasul în care se corectează ('date' | 'utilizatori' | 'instalatie' | 'rezultate');
 *   - target → cheia câmpului de evidențiat (data-bind / data-guide) sau null.
 *   - errors   → blochează calculul (date imposibile sau incomplete);
 *   - warnings → calculul rulează, dar rezultatul poate fi neașteptat.
 */
(function (global) {
  'use strict';

  var S = global.AppState;

  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }

  function validate(p) {
    var errors = [];
    var warnings = [];
    var model = p.meta.model;
    var users = p.utilizatori || [];
    var primId = S.primId(p);
    var newIds = S.newIds(p);
    var usesUsers = model === 'line' || model === 'station' || model === 'complex';

    function err(rule, text, tab, target) { errors.push({ rule: rule, severity: 'error', text: text, tab: tab, target: target || null }); }
    function warn(rule, text, tab, target) { warnings.push({ rule: rule, severity: 'warning', text: text, tab: tab, target: target || null }); }

    function nonNeg(label, v, tab, target) {
      if (v === '' || v === undefined || v === null) return;
      if (n(v) < 0) err(null, label + ' nu poate fi negativ(ă).', tab, target);
    }
    function nameOf(id) {
      var u = S.findUser(p, id);
      return u ? (u.nume || u.codPA || id) : id;
    }

    /* --- generale --- */
    var tva = n(p.meta.tva);
    if (tva < 0 || tva > 100) err(null, 'Cota TVA trebuie să fie între 0 și 100%.', 'date', 'meta.tva');

    if (usesUsers) {
      if (users.length < 2) err('art6.1', 'Adaugă cel puțin 2 utilizatori: primul utilizator (finanțatorul) și unul nou (care plătește).', 'utilizatori', 'btn:add-user');
      if (!primId) warn('art6.1', 'Nu există un prim utilizator (finanțatorul, cel care primește compensații). Alege rolul „Prim utilizator” pentru unul dintre utilizatori.', 'utilizatori');
      if (!newIds.length) err('art6.1', 'Alege rolul „Nou” (cel care plătește compensația) pentru cel puțin un utilizator.', 'utilizatori');
      if (p.conditii && p.conditii.fonduriPublice) {
        err('art19', 'Metodologia nu se aplică: instalația primului utilizator a fost finanțată din fonduri publice nerambursabile.', 'rezultate', 'cond.fonduriPublice');
      }
      users.forEach(function (u) {
        if (u.faraContract && u.id === primId) {
          warn('art7.2', 'Utilizatorul „' + nameOf(u.id) + '” este marcat „ATR fără contract” și, în același timp, prim utilizator (a încheiat contractul). Debifează „ATR fără contract”.', 'utilizatori', 'user.' + u.id + '.faraContract');
        }
        if (u.faraContract && newIds.indexOf(u.id) < 0 && u.id !== primId) {
          warn('art7.2', 'Utilizatorul „' + nameOf(u.id) + '” are ATR pentru instalația comună, dar nu are rolul „Nou”; compensația lui nu e calculată.', 'utilizatori', 'user.' + u.id + '.rol');
        }
      });
      if (!primId && users.some(function (u) { return u.faraContract; })) {
        warn('art7.2', 'Refacerea ATR se aplică după ce un utilizator încheie contractul de racordare: dă-i rolul „Prim utilizator”.', 'utilizatori');
      }

      users.forEach(function (u) {
        var nm = nameOf(u.id);
        nonNeg('Puterea aprobată a utilizatorului „' + nm + '”', u.putere, 'utilizatori', 'user.' + u.id + '.putere');
        nonNeg('Tariful inițial al utilizatorului „' + nm + '”', u.tarifInitial, 'utilizatori', 'user.' + u.id + '.tarifInitial');
        if (u.dataATR && u.dataTR && u.dataTR < u.dataATR) {
          warn(null, 'Utilizatorul „' + nm + '”: data achitării TR este anterioară datei ATR.', 'utilizatori', 'user.' + u.id + '.dataTR');
        }
      });
    }

    /* --- art. 17–18: prevederi tranzitorii --- */
    if (usesUsers) {
      var tr = S.tranzitoriu(p);
      var primU = S.findUser(p, primId);
      if (tr.activ) {
        if (tr.faraData.length) {
          warn('art18.3a', 'Lipsește „Data contractului” pentru ' + tr.faraData.map(nameOf).join(', ') +
            '; se consideră cu contract ulterior intrării în vigoare (07.01.2016) și participă la repartizare.', 'utilizatori', 'user.' + tr.faraData[0] + '.dataContract');
        }
        newIds.forEach(function (id) {
          var uu = S.findUser(p, id);
          if (uu && uu.dataContract && uu.dataContract < S.DATA_INTRARE_VIGOARE) {
            warn('art17', 'Utilizatorul nou „' + nameOf(id) + '” are contractul înainte de 07.01.2016; prevederile tranzitorii privesc utilizatori noi cu contract ulterior.', 'utilizatori', 'user.' + id + '.dataContract');
          }
        });
      } else if (primU && (p.linii || []).concat(p.statii || []).some(function (x) { return n(x.compVeche) > 0; })) {
        warn('art17', 'Sunt completate compensații primite sub vechea metodologie, dar regimul tranzitoriu nu e activ (contractul primului utilizator nu e anterior 07.01.2016); valorile sunt ignorate.', 'instalatie');
      }
    }

    /* --- Anexa 1 --- */
    function checkLine(l) {
      var nm = l.nume || l.id;
      nonNeg('Costul lucrărilor liniei „' + nm + '” (I_L)', l.IL, 'instalatie', 'line.' + l.id + '.IL');
      nonNeg('Lungimea liniei „' + nm + '” (L)', l.L, 'instalatie', 'line.' + l.id + '.L');
      nonNeg('Costul specific b_L al liniei „' + nm + '”', l.bL, 'instalatie', 'line.' + l.id + '.bL');
      nonNeg('Compensațiile vechi ale liniei „' + nm + '”', l.compVeche, 'instalatie', 'line.' + l.id + '.compVeche');
      nonNeg('Capacitatea instalației liniei „' + nm + '”', l.capacitate, 'instalatie', 'line.' + l.id + '.capacitate');
      if (n(l.compVeche) > n(l.IL) && n(l.IL) > 0) {
        err('art18.1a', 'Linia „' + nm + '”: compensațiile primite sub vechea metodologie (' + n(l.compVeche) + ' lei) depășesc I_L (' + n(l.IL) + ' lei).', 'instalatie', 'line.' + l.id + '.compVeche');
      }
      (l.tronsoane || []).forEach(function (t) {
        var tn = '„' + nm + ' · ' + (t.nume || t.id) + '”';
        nonNeg('Lungimea tronsonului ' + tn, t.lungime, 'instalatie', 'tronson.' + l.id + '.' + t.id + '.lungime');
        if (t.costManual) nonNeg('Costul tronsonului ' + tn, t.cost, 'instalatie', 'tronson.' + l.id + '.' + t.id + '.cost');
        if (t.tip === 'stalpi' && !(n(t.cost) > 0)) {
          warn('art15.1', 'Circuitul pe stâlpi existenți ' + tn + ' are costul stâlpilor 0; nu va genera compensație.', 'instalatie', 'tronson.' + l.id + '.' + t.id + '.cost');
        }
        var seen = {};
        (t.utilizatori || []).forEach(function (u) {
          if (seen[u]) err('art12.1', 'Utilizatorul „' + nameOf(u) + '” apare de două ori pe tronsonul ' + tn + '.', 'instalatie');
          seen[u] = true;
        });
      });
    }

    function assignedToLines(lines, id) {
      return lines.some(function (l) {
        return (l.tronsoane || []).some(function (t) { return (t.utilizatori || []).indexOf(id) >= 0; });
      });
    }
    function assignedToStations(stations, id) {
      return stations.some(function (s) { return (s.utilizatori || []).indexOf(id) >= 0; });
    }

    function checkStation(s) {
      var nm = s.nume || s.id;
      var key = 'stat.' + s.id + '.';
      nonNeg('Capacitatea S_n a stației „' + nm + '”', s.Sn, 'instalatie', key + 'Sn');
      nonNeg('Transformatorul de rezervă al stației „' + nm + '”', s.SnRezerva, 'instalatie', key + 'SnRezerva');
      nonNeg('Costul lucrărilor I_T al stației „' + nm + '”', s.IT, 'instalatie', key + 'IT');
      nonNeg('Compensațiile vechi ale stației „' + nm + '”', s.compVeche, 'instalatie', key + 'compVeche');
      if (n(s.compVeche) > n(s.IT) && n(s.IT) > 0) {
        err('art18.1a', 'Stația „' + nm + '”: compensațiile primite sub vechea metodologie depășesc I_T.', 'instalatie', key + 'compVeche');
      }
      nonNeg('Echipamentele comune ale stației „' + nm + '”', s.elementeComune, 'instalatie', key + 'elementeComune');
      var efectiv = n(s.Sn) - n(s.SnRezerva);
      if (n(s.SnRezerva) > 0 && efectiv <= 0) {
        err('art15.4', 'Stația „' + nm + '”: transformatorul de rezervă (' + n(s.SnRezerva) + ' kVA) trebuie să fie mai mic decât S_n (' + n(s.Sn) + ' kVA).', 'instalatie', key + 'SnRezerva');
      } else if (n(s.IT) > 0 && efectiv <= 0) {
        err('anexa2', 'Stația „' + nm + '”: S_n efectiv trebuie să fie mai mare decât 0 pentru a calcula costul specific b_T.', 'instalatie', key + 'Sn');
      }
      var seen = {};
      var sumP = 0;
      (s.utilizatori || []).forEach(function (u) {
        if (seen[u]) err('art13', 'Utilizatorul „' + nameOf(u) + '” apare de două ori în stația „' + nm + '”.', 'instalatie');
        seen[u] = true;
        var uu = S.findUser(p, u);
        if (uu) sumP += n(uu.putere);
      });
      if (s.intarire) {
        // La întărire, puterile noilor utilizatori pot depăși capacitatea existentă.
        var occ = 0;
        (s.utilizatori || []).forEach(function (u) {
          if (newIds.indexOf(u) < 0) { var uu2 = S.findUser(p, u); if (uu2) occ += n(uu2.putere); }
        });
        if (efectiv > 0 && occ >= efectiv) {
          warn('art15.3', 'Stația „' + nm + '” (întărire): nu mai există capacitate suplimentară în transformatorul existent; compensația va fi 0.', 'instalatie', key + 'Sn');
        }
      } else if (efectiv > 0 && sumP > efectiv) {
        warn('anexa2', 'Stația „' + nm + '”: suma puterilor aprobate (' + sumP + ' kVA) depășește S_n efectiv (' + efectiv + ' kVA); modelul presupune puteri în limita capacității transformatorului.', 'instalatie', key + 'Sn');
      }
      if (primId && (s.utilizatori || []).indexOf(primId) < 0) {
        warn('art6.1b', 'Primul utilizator („' + nameOf(primId) + '”) nu este în lista stației „' + nm + '”; compensația se plătește totuși lui. Bifează-l în stație dacă e racordat la ea.', 'instalatie', 'alloc:' + s.id);
      }
      users.forEach(function (u) {
        if ((s.utilizatori || []).indexOf(u.id) >= 0 && n(u.putere) <= 0 && newIds.indexOf(u.id) >= 0) {
          warn('art13', 'Utilizatorul nou „' + nameOf(u.id) + '” are puterea aprobată 0 kVA; compensația la stație va fi 0.', 'utilizatori', 'user.' + u.id + '.putere');
        }
      });
    }

    if (model === 'line') {
      if (!p.linii.length) err('anexa1', 'Adaugă cel puțin o linie în pasul „Instalație”.', 'instalatie', 'btn:add-line');
      p.linii.forEach(checkLine);
      var withUsers = p.linii.some(function (l) {
        return (l.tronsoane || []).some(function (t) { return (t.utilizatori || []).length; });
      });
      if (p.linii.length && !withUsers) err('art12.1', 'Bifează utilizatorii care folosesc tronsoanele (grila de alocare din pasul „Instalație”).', 'instalatie');
      newIds.forEach(function (id) {
        if (!assignedToLines(p.linii, id)) {
          warn('art12.1', 'Utilizatorul nou „' + nameOf(id) + '” nu este bifat pe niciun tronson; nu va plăti nicio compensație.', 'instalatie');
        }
      });
    } else if (model === 'station') {
      if (!p.statii.length) err('anexa2', 'Adaugă o stație / un post de transformare în pasul „Instalație”.', 'instalatie', 'btn:add-stat');
      p.statii.forEach(checkStation);
      newIds.forEach(function (id) {
        if (!assignedToStations(p.statii, id)) {
          warn('art13', 'Utilizatorul nou „' + nameOf(id) + '” nu este bifat în nicio stație; nu va plăti nicio compensație.', 'instalatie');
        }
      });
    } else if (model === 'complex') {
      var sel = p.complexConfig;
      var v = Number(sel.varianta) || 1;
      var l1 = p.linii.filter(function (l) { return sel.liniiIds.indexOf(l.id) >= 0; });
      var l2 = p.linii.filter(function (l) { return sel.liniiU2Ids.indexOf(l.id) >= 0; });
      var st = p.statii.filter(function (s) { return sel.statiiIds.indexOf(s.id) >= 0; });
      if (!l1.length && !st.length) err('anexa3', 'Adaugă cel puțin o linie (l_U1) sau o stație în instalația complexă.', 'instalatie');
      if ((v === 2 || v === 3 || v === 4) && !st.length) warn('anexa3', 'Varianta ' + v + ' folosește o stație, dar nu a fost inclusă niciuna.', 'instalatie');
      if (v === 4 && !l2.length) warn('art14', 'Varianta 4 folosește linia l_U2, dar nu a fost inclusă nicio linie în această poziție.', 'instalatie');
      l1.concat(l2).forEach(checkLine);
      st.forEach(checkStation);
    } else if (model === 'transitional') {
      var t = p.tranzitoriu;
      ['B', 'S', 'S2', 'l2', 'L'].forEach(function (k) { nonNeg('Câmpul „' + k + '” (Anexa 4)', t[k], 'instalatie', 'tranz.' + k); });
      if (n(t.S) <= 0) err('anexa4', 'Capacitatea instalației S trebuie să fie mai mare decât 0.', 'instalatie', 'tranz.S');
      if (n(t.L) <= 0) err('anexa4', 'Lungimea totală L trebuie să fie mai mare decât 0.', 'instalatie', 'tranz.L');
      if (n(t.L) > 0 && n(t.l2) > n(t.L)) err('anexa4', 'Lungimea folosită l_2 nu poate depăși lungimea totală L.', 'instalatie', 'tranz.l2');
      if (n(t.S) > 0 && n(t.S2) > n(t.S)) warn('anexa4', 'Puterea noului utilizator S_2 depășește capacitatea instalației S.', 'instalatie', 'tranz.S2');
    } else if (model === 'developer') {
      var d = p.dezvoltator;
      nonNeg('I_total', d.Itotal, 'instalatie', 'dev.Itotal');
      nonNeg('I_ef', d.Ief, 'instalatie', 'dev.Ief');
      if (n(d.Itotal) <= 0) err('anexa5', 'Valoarea totală a investiției I_total trebuie să fie mai mare decât 0.', 'instalatie', 'dev.Itotal');
      if (n(d.Ief) > n(d.Itotal)) err('anexa5', 'Cota de eficiență I_ef nu poate depăși I_total.', 'instalatie', 'dev.Ief');
      if (!(d.dezvoltatori || []).length) err('anexa5', 'Adaugă cel puțin un dezvoltator în pasul „Instalație”.', 'instalatie', 'btn:add-dev');
      var ptot = 0;
      (d.dezvoltatori || []).forEach(function (x) {
        nonNeg('Puterea dezvoltatorului „' + (x.nume || x.id) + '”', x.putere, 'instalatie', 'devitem.' + x.id + '.putere');
        ptot += n(x.putere);
      });
      if ((d.dezvoltatori || []).length && ptot <= 0) err('anexa5', 'Puterea totală a dezvoltatorilor trebuie să fie mai mare decât 0.', 'instalatie');
    }

    return { errors: errors, warnings: warnings };
  }

  // Text unic pentru un issue, cu referința legală (ex. pentru mesaje compuse).
  function describe(issue) {
    var ref = global.AppRules ? global.AppRules.label(issue.rule) : '';
    return issue.text + (ref ? ' (' + ref + ')' : '');
  }

  global.AppValidate = { validate: validate, describe: describe };
})(typeof window !== 'undefined' ? window : this);
