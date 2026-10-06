/*
 * Validate — verificarea datelor proiectului înainte de calcul.
 * Returnează { errors: [...], warnings: [...] }:
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

    function nonNeg(label, v) {
      if (v === '' || v === undefined || v === null) return;
      if (n(v) < 0) errors.push(label + ' nu poate fi negativ(ă).');
    }
    function nameOf(id) {
      var u = S.findUser(p, id);
      return u ? (u.nume || u.codPA || id) : id;
    }

    /* --- generale --- */
    var tva = n(p.meta.tva);
    if (tva < 0 || tva > 100) errors.push('Cota TVA trebuie să fie între 0 și 100%.');

    if (usesUsers) {
      if (users.length < 2) errors.push('Adaugă cel puțin 2 utilizatori (primul utilizator și unul nou) în tabul „2 · Utilizatori”.');
      if (!primId) warnings.push('Nu este bifat primul utilizator (finanțatorul, cel care primește compensații) în tabul „2 · Utilizatori”.');
      if (!newIds.length) errors.push('Bifează cel puțin un utilizator nou (cel care plătește) în tabul „1 · Date generale”.');
      if (p.conditii && p.conditii.fonduriPublice) {
        errors.push('Art. 19: metodologia nu se aplică dacă instalația primului utilizator a fost finanțată din fonduri publice nerambursabile.');
      }
      users.forEach(function (u) {
        if (u.operator && u.id === primId) {
          errors.push('Operatorul de rețea („' + nameOf(u.id) + '”, art. 6 alin. 5) nu poate fi primul utilizator: el se asimilează unui utilizator nou și plătește compensație.');
        }
        if (u.faraContract && u.id === primId) {
          warnings.push('Utilizatorul „' + nameOf(u.id) + '” este marcat „ATR fără contract” și, în același timp, prim utilizator (a încheiat contractul). Debifează „ATR fără contract”.');
        }
        if (u.faraContract && newIds.indexOf(u.id) < 0 && u.id !== primId) {
          warnings.push('Art. 7 alin. 2: utilizatorul „' + nameOf(u.id) + '” are ATR pentru instalația comună, dar nu e selectat ca utilizator nou; compensația lui nu e calculată.');
        }
      });
      if (!primId && users.some(function (u) { return u.faraContract; })) {
        warnings.push('Art. 7 alin. 2 se aplică după ce un utilizator încheie contractul de racordare: bifează-l ca prim utilizator.');
      }
      if (S.roleConflict(p)) errors.push('Primul utilizator nu poate fi și utilizator nou (cel care plătește). Scoate-l din lista de utilizatori noi.');

      users.forEach(function (u) {
        var nm = nameOf(u.id);
        nonNeg('Puterea aprobată a utilizatorului „' + nm + '”', u.putere);
        nonNeg('Tariful inițial al utilizatorului „' + nm + '”', u.tarifInitial);
        if (u.dataATR && u.dataTR && u.dataTR < u.dataATR) {
          warnings.push('Utilizatorul „' + nm + '”: data achitării TR este anterioară datei ATR.');
        }
      });
    }

    /* --- Anexa 1 --- */
    function checkLine(l) {
      var nm = l.nume || l.id;
      nonNeg('Costul lucrărilor liniei „' + nm + '” (I_L)', l.IL);
      nonNeg('Lungimea liniei „' + nm + '” (L)', l.L);
      nonNeg('Costul specific b_L al liniei „' + nm + '”', l.bL);
      (l.tronsoane || []).forEach(function (t) {
        var tn = '„' + nm + ' · ' + (t.nume || t.id) + '”';
        nonNeg('Lungimea tronsonului ' + tn, t.lungime);
        if (t.costManual) nonNeg('Costul tronsonului ' + tn, t.cost);
        if (t.tip === 'stalpi' && !(n(t.cost) > 0)) {
          warnings.push('Circuitul pe stâlpi existenți ' + tn + ' (art. 15 alin. 1) are costul stâlpilor 0; nu va genera compensație.');
        }
        var seen = {};
        (t.utilizatori || []).forEach(function (u) {
          if (seen[u]) errors.push('Utilizatorul „' + nameOf(u) + '” apare de două ori pe tronsonul ' + tn + '.');
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
      nonNeg('Capacitatea S_n a stației „' + nm + '”', s.Sn);
      nonNeg('Transformatorul de rezervă al stației „' + nm + '”', s.SnRezerva);
      nonNeg('Costul lucrărilor I_T al stației „' + nm + '”', s.IT);
      nonNeg('Echipamentele comune ale stației „' + nm + '”', s.elementeComune);
      var efectiv = n(s.Sn) - n(s.SnRezerva);
      if (n(s.SnRezerva) > 0 && efectiv <= 0) {
        errors.push('Stația „' + nm + '”: transformatorul de rezervă (' + n(s.SnRezerva) + ' kVA) trebuie să fie mai mic decât S_n (' + n(s.Sn) + ' kVA).');
      } else if (n(s.IT) > 0 && efectiv <= 0) {
        errors.push('Stația „' + nm + '”: S_n efectiv trebuie să fie mai mare decât 0 pentru a calcula b_T.');
      }
      var seen = {};
      var sumP = 0;
      (s.utilizatori || []).forEach(function (u) {
        if (seen[u]) errors.push('Utilizatorul „' + nameOf(u) + '” apare de două ori în stația „' + nm + '”.');
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
          warnings.push('Stația „' + nm + '” (întărire, art. 15 alin. 3): nu mai există capacitate suplimentară în transformatorul existent; compensația va fi 0.');
        }
      } else if (efectiv > 0 && sumP > efectiv) {
        warnings.push('Stația „' + nm + '”: suma puterilor aprobate (' + sumP + ' kVA) depășește S_n efectiv (' + efectiv + ' kVA); Anexa 2 presupune puteri în limita capacității transformatorului.');
      }
      if (primId && (s.utilizatori || []).indexOf(primId) < 0) {
        warnings.push('Primul utilizator („' + nameOf(primId) + '”) nu este în lista stației „' + nm + '”; compensația se plătește totuși lui. Adaugă-l în stație dacă e racordat la ea.');
      }
      users.forEach(function (u) {
        if ((s.utilizatori || []).indexOf(u.id) >= 0 && n(u.putere) <= 0 && newIds.indexOf(u.id) >= 0) {
          warnings.push('Utilizatorul nou „' + nameOf(u.id) + '” are puterea aprobată 0 kVA; compensația la stație va fi 0.');
        }
      });
    }

    if (model === 'line') {
      if (!p.linii.length) errors.push('Adaugă cel puțin o linie în tabul „3 · Instalație”.');
      p.linii.forEach(checkLine);
      var withUsers = p.linii.some(function (l) {
        return (l.tronsoane || []).some(function (t) { return (t.utilizatori || []).length; });
      });
      if (p.linii.length && !withUsers) errors.push('Adaugă utilizatori pe tronsoane (selectorul „+ utilizator…” din tabelul tronsoanelor).');
      newIds.forEach(function (id) {
        if (!assignedToLines(p.linii, id)) {
          warnings.push('Utilizatorul nou „' + nameOf(id) + '” nu este adăugat pe niciun tronson; nu va plăti nicio compensație.');
        }
      });
    } else if (model === 'station') {
      if (!p.statii.length) errors.push('Adaugă o stație / PT în tabul „3 · Instalație”.');
      p.statii.forEach(checkStation);
      newIds.forEach(function (id) {
        if (!assignedToStations(p.statii, id)) {
          warnings.push('Utilizatorul nou „' + nameOf(id) + '” nu este adăugat în nicio stație; nu va plăti nicio compensație.');
        }
      });
    } else if (model === 'complex') {
      var sel = p.complexConfig;
      var v = Number(sel.varianta) || 1;
      var l1 = p.linii.filter(function (l) { return sel.liniiIds.indexOf(l.id) >= 0; });
      var l2 = p.linii.filter(function (l) { return sel.liniiU2Ids.indexOf(l.id) >= 0; });
      var st = p.statii.filter(function (s) { return sel.statiiIds.indexOf(s.id) >= 0; });
      if (!l1.length && !st.length) errors.push('Selectează cel puțin o linie sau o stație în tabul „3 · Instalație”.');
      if ((v === 2 || v === 3 || v === 4) && !st.length) warnings.push('Varianta ' + v + ' folosește o stație, dar nu a fost bifată niciuna.');
      if (v === 4 && !l2.length) warnings.push('Varianta 4 folosește linia l_U2, dar nu a fost bifată nicio linie.');
      l1.concat(l2).forEach(checkLine);
      st.forEach(checkStation);
    } else if (model === 'transitional') {
      var t = p.tranzitoriu;
      ['B', 'S', 'S2', 'l2', 'L'].forEach(function (k) { nonNeg('Câmpul „' + k + '” (Anexa 4)', t[k]); });
      if (n(t.S) <= 0) errors.push('Anexa 4: capacitatea instalației S trebuie să fie mai mare decât 0.');
      if (n(t.L) <= 0) errors.push('Anexa 4: lungimea totală L trebuie să fie mai mare decât 0.');
      if (n(t.L) > 0 && n(t.l2) > n(t.L)) errors.push('Anexa 4: lungimea folosită l_2 nu poate depăși lungimea totală L.');
      if (n(t.S) > 0 && n(t.S2) > n(t.S)) warnings.push('Anexa 4: puterea noului utilizator S_2 depășește capacitatea instalației S.');
    } else if (model === 'developer') {
      var d = p.dezvoltator;
      nonNeg('I_total', d.Itotal);
      nonNeg('I_ef', d.Ief);
      if (n(d.Itotal) <= 0) errors.push('Anexa 5: valoarea totală a investiției I_total trebuie să fie mai mare decât 0.');
      if (n(d.Ief) > n(d.Itotal)) errors.push('Anexa 5: cota de eficiență I_ef nu poate depăși I_total.');
      if (!(d.dezvoltatori || []).length) errors.push('Anexa 5: adaugă cel puțin un dezvoltator în tabul „3 · Instalație”.');
      var ptot = 0;
      (d.dezvoltatori || []).forEach(function (x) {
        nonNeg('Puterea dezvoltatorului „' + (x.nume || x.id) + '”', x.putere);
        ptot += n(x.putere);
      });
      if ((d.dezvoltatori || []).length && ptot <= 0) errors.push('Anexa 5: puterea totală a dezvoltatorilor trebuie să fie mai mare decât 0.');
    }

    return { errors: errors, warnings: warnings };
  }

  global.AppValidate = { validate: validate };
})(typeof window !== 'undefined' ? window : this);
