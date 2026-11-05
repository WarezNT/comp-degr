/* Îndrumare derivată din proiect; nu modifică datele și nu calculează compensații. */
(function (global) {
  'use strict';
  var S = global.AppState, C = global.AppCalc, H = global.AppHelp;

  var INPUTS = {
    'meta.model': ['calcul', 'Model de calcul', 'Situația reală și schema aprobată.', 'Determină anexa aplicabilă, nu suma dorită.'],
    'meta.tva': ['calcul', 'Cotă TVA (%)', 'Cota aplicabilă la data calculului.', 'Schimbă numai valorile cu TVA din centralizator.'],
    'meta.tvaOpt': ['calcul', 'Cotă TVA (%)', 'Cota aplicabilă la data calculului.', 'Schimbă numai valorile cu TVA din centralizator.'],
    'meta.dataCalcul': ['conditii', 'Data întocmirii', 'Data calculului verificat.', 'Stabilește verificarea termenelor, nu data racordării.'],
    'user.nume': ['identificare', 'Nume utilizator', 'ATR / contractul de racordare.', 'Identifică persoana în centralizator, nu schimbă formula.'],
    'user.rol': ['calcul', 'Rol utilizator', 'Contractele și ordinea racordării.', 'Primul utilizator este finanțator; Nou/Operator plătește; Existent poate primi.'],
    'user.putere': ['calcul', 'Putere aprobată (kVA)', 'Puterea aparentă aprobată din ATR, în kVA.', 'Nu introduce consumul, puterea instalată sau kW. Nu convertim kW fără factor de putere verificat.'],
    'user.dataATR': ['calcul', 'Data ATR', 'Avizul tehnic de racordare.', 'Determină ordinea utilizatorilor noi; cei fără dată sunt după cei cu dată, iar la aceeași dată se păstrează ordinea listei.'],
    'user.dataContract': ['conditii', 'Data contractului', 'Contractul de racordare.', 'Contractul finanțatorului anterior lui 07.01.2016 activează regimul tranzitoriu. Nu folosi data ATR în locul său.'],
    'user.dataTR': ['conditii', 'Data achitării integrale TR', 'Documentul care dovedește achitarea integrală.', 'Data lipsește? Verifică documentele înainte de confirmarea manuală a condiției.'],
    'user.tipClient': ['conditii', 'Tipul clientului', 'Contractul finanțatorului.', 'Client casnic: termenul se extinde de la 5 la 10 ani.'],
    'line.IL': ['calcul', 'Investiția liniei (lei)', 'Devizul / componenta de tarif aferentă liniei finanțate.', 'Nu introduce aici și investiția stației; verifică să nu numeri aceleași lucrări de două ori.'],
    'line.L': ['calcul', 'Lungimea liniei (m)', 'Planul / măsurătoarea traseului fizic.', 'Introdu metri, nu kilometri. La ramuri, lungimea este suma ramurilor fizice, nu suma traseelor utilizatorilor.'],
    'line.bL': ['optional', 'Cost specific (lei/m)', 'Automat din investiție / lungime, sau valoare documentată.', 'Suprascrierea manuală înlocuiește raportul automat; golirea revine la automat.'],
    'line.compVeche': ['calcul', 'Compensații vechi linie (lei)', 'Evidența compensațiilor primite sub Ord. 28/2003.', 'Se deduc numai în regim tranzitoriu; zero înseamnă că nu există sume de dedus, nu că sunt necunoscute.'],
    'tronson.cost': ['calcul', 'Cost propriu tronson (lei)', 'Devizul pentru tronsonul respectiv.', 'Un cost propriu înlocuiește costul automat; nu este o investiție suplimentară peste el.'],
    'tronson.lungime': ['calcul', 'Lungime tronson (m)', 'Planul traseului comun.', 'Metri; lungimea determină costul automat al tronsonului.'],
    'distanta': ['calcul', 'Distanță de racordare (m)', 'Schema aprobată și planul traseului.', 'Distanța de la PR stabilește tronsoanele folosite. La ramuri este distanța locală de la începutul ramurii; zero este permis.'],
    'ramura.L': ['calcul', 'Lungime ramură (m)', 'Planul ramurilor fizice.', 'Nu însuma traseele utilizatorilor: același tronson comun se numără o singură dată.'],
    'ramura.IL': ['calcul', 'Cost propriu ramură (lei)', 'Defalcarea devizului pe ramuri.', 'Acest cost este inclus în I_L, nu adăugat peste investiția totală.'],
    'stat.Sn': ['calcul', 'Capacitate nominală (kVA)', 'Datele tehnice ale transformatorului.', 'La întărire introdu capacitatea transformatorului existent, nu a celui nou.'],
    'stat.SnRezerva': ['calcul', 'Rezervă N−1 (kVA)', 'Schema și datele tehnice ale rezervei.', 'Se scade din capacitatea nominală. Zero numai dacă nu există rezervă.'],
    'stat.IT': ['calcul', 'Investiția transformatorului / stației (lei)', 'Devizul / tariful achitat pentru componenta compensată.', 'Verifică dacă I_T conține deja echipamentele declarate separat; aplicația nu poate identifica automat dubla numărare.'],
    'stat.elementeComune': ['calcul', 'Echipamente comune (lei)', 'Defalcarea devizului pentru echipamente, altele decât transformatorul.', 'Cote egale, nu pe putere. Nu repeta costuri deja incluse în I_T.'],
    'stat.compVeche': ['calcul', 'Compensații vechi stație (lei)', 'Evidența compensațiilor primite sub vechea metodologie.', 'Se deduc din I_T numai în regim tranzitoriu; verifică suma netă.'],
    'stat.intarire': ['calcul', 'Întărire post', 'Soluția de racordare aprobată.', 'Limitează plata transformatorului la capacitatea suplimentară a transformatorului existent.'],
    'complex.varianta': ['calcul', 'Varianta punctului de racordare', 'Schema de racordare aprobată.', 'Poziția PR decide componentele compensate; nu alege varianta după suma dorită.'],
    'tranz.B': ['calcul', 'Componenta B (lei)', 'Tariful de racordare din vechea metodologie.', 'Nu este automat întregul tarif sau întreaga investiție.'],
    'tranz.S': ['calcul', 'Capacitatea S (kVA)', 'Documentația aferentă componentei B.', 'Trebuie să fie pozitivă; nu confunda capacitatea cu puterea noului utilizator.'],
    'tranz.S2': ['calcul', 'Puterea noului utilizator S₂ (kVA)', 'ATR-ul noului utilizator.', 'Putere aparentă aprobată, nu kW sau consum.'],
    'tranz.l2': ['calcul', 'Lungime folosită l₂ (m)', 'Traseul comun folosit de noul utilizator.', 'Metri; poate fi zero și nu poate depăși L.'],
    'tranz.L': ['calcul', 'Lungime totală L (m)', 'Planul liniei aferente calculului vechi.', 'Trebuie să fie pozitivă; nu suma lungimilor folosite de toți utilizatorii.'],
    'dev.Itotal': ['calcul', 'Investiție totală (lei)', 'Devizul rețelei publice folosite în comun.', 'Aceeași bază de cost ca în analiza de eficiență.'],
    'dev.Ief': ['calcul', 'Componentă eficientă (lei)', 'Analiza de eficiență economică.', 'Nu se estimează automat. Zero este permis numai dacă analiza justifică acest lucru.'],
    'devitem.putere': ['calcul', 'Putere dezvoltator (kVA)', 'Puterea aprobată din documentația dezvoltatorului.', 'Pondere în puterea totală; zero este permis individual, dar totalul trebuie să fie pozitiv.'],
    'cond.dataPIF': ['conditii', 'Data punerii în funcțiune', 'Documentul de punere în funcțiune.', 'De aici curge termenul de 5/10 ani; nu de la ATR sau contract.'],
    'cond.fonduriPublice': ['conditii', 'Fonduri publice nerambursabile', 'Documentele de finanțare.', 'Dacă instalația finanțatorului a fost realizată din aceste fonduri, metodologia nu se aplică.'],
    'cond.aniDeLaPF': ['conditii', 'Ani de la punerea în funcțiune', 'Documentul PIF și data întocmirii.', 'Folosit numai dacă data PIF nu este completată; data are prioritate.']
  };
  var LABELS = { calcul: 'Date de calcul', conditii: 'Condiții și documente', identificare: 'Identificare', optional: 'Opțional / descriptiv' };
  function keyOf(path) {
    if (path.indexOf('dist:') === 0) return 'distanta';
    var parts = path.split('.');
    if (parts.length === 2) return path;
    if (path.indexOf('ramura.') === 0) return 'ramura.' + parts[3];
    return ['user', 'line', 'stat', 'devitem'].indexOf(parts[0]) >= 0 ? parts[0] + '.' + parts[2]
      : parts[0] === 'tronson' ? 'tronson.' + parts[3] : path;
  }
  function field(path, p) {
    var key = keyOf(path), entry = INPUTS[key], help = H.FIELDS[key === 'devitem.putere' ? 'dev.putere' : key];
    var info = entry ? { kind: entry[0], category: LABELS[entry[0]], label: entry[1], source: entry[2], impact: entry[3] }
      : help ? { kind: 'optional', category: LABELS.optional, label: key, source: 'Documentația instalației / contractele aferente.', impact: help.text } : null;
    if (info && !entry && key.indexOf('cond.') === 0) {
      info.kind = 'conditii'; info.category = LABELS.conditii;
    }
    if (info && p) {
      var parts = active(p), pathParts = path.split('.'), entityId = pathParts[1];
      if (key === 'line.bL' && p.linii.some(function (l) { return l.id === entityId && l.bLManual; })) {
        info.kind = 'calcul'; info.category = LABELS.calcul;
      }
      var unused = key === 'user.putere' && (!parts.transformer || pathParts.length >= 3 && !parts.stations.some(function (s) {
        return s.utilizatori.indexOf(entityId) >= 0 && (Number(s.Sn) > 0 || Number(s.IT) > 0 || s.intarire);
      })) || /^stat\.(Sn|SnRezerva|IT|compVeche|intarire)$/.test(key) && !parts.transformer ||
        pathParts.length >= 3 && (pathParts[0] === 'line' && !parts.lines.some(function (l) { return l.id === entityId; }) ||
          pathParts[0] === 'stat' && !parts.stations.some(function (s) { return s.id === entityId; }));
      if (unused) { info.kind = 'optional'; info.category = 'Non-utilizat în calculul curent'; }
    }
    return info;
  }
  function active(p) {
    var model = p.meta.model, c = p.complexConfig, variant = Number(c.varianta);
    return {
      lines: model === 'line' ? p.linii : model === 'complex' ? p.linii.filter(function (l) {
        return c.liniiIds.indexOf(l.id) >= 0 || variant === 4 && c.liniiU2Ids.indexOf(l.id) >= 0;
      }) : [],
      stations: model === 'station' ? p.statii : model === 'complex' && variant >= 2 ? p.statii.filter(function (s) {
        return c.statiiIds.indexOf(s.id) >= 0;
      }) : [],
      transformer: model === 'station' || model === 'complex' && variant >= 3
    };
  }
  function review(p) {
    var parts = active(p), entries = [], notes = [], check = global.AppValidate.validate(p);
    function add(path, owner, value, required, derived) {
      var info = field(path, p);
      entries.push({ path: path, owner: owner, value: value, required: !!required, derived: !!derived,
        missing: required && (value === '' || value === undefined || value === null),
        info: info || { label: path, category: 'Date de calcul', source: 'Documentația instalației.', impact: '' } });
    }
    add('meta.dataCalcul', 'Proiect', p.meta.dataCalcul, true);
    if (['line', 'station', 'complex'].indexOf(p.meta.model) >= 0) {
      p.utilizatori.forEach(function (u) {
        var owner = C.nameOf(p, u.id), k = 'user.' + u.id + '.';
        add(k + 'nume', owner, u.nume || u.codPA, true);
        add(k + 'rol', owner, u.rol, true);
        if (parts.transformer && parts.stations.some(function (s) {
          return s.utilizatori.indexOf(u.id) >= 0 && (Number(s.Sn) > 0 || Number(s.IT) > 0 || s.intarire);
        })) add(k + 'putere', owner, u.putere, true);
        if (S.newIds(p).indexOf(u.id) >= 0) add(k + 'dataATR', owner, u.dataATR, false);
        else add(k + 'dataTR', owner, u.dataTR, false);
        add(k + 'dataContract', owner, u.dataContract, false);
        if (u.id === S.primId(p)) add(k + 'tipClient', owner, u.tipClient, true);
      });
      notes.push('Ordinea etapelor: ' + S.newIds(p).map(function (id) { return C.nameOf(p, id); }).join(' → ') +
        '. Verifică datele ATR; utilizatorii fără dată sunt după cei cu dată, iar egalitățile păstrează ordinea listei. Aceasta nu este dovada ordinii reale.');
      notes.push('Verifică documentele PIF, achitarea integrală TR și situația reală a condițiilor; valorile implicite nu sunt dovezi.');
      add('cond.dataPIF', 'Condiții', p.conditii.dataPIF, false);
      if (!p.conditii.dataPIF) add('cond.aniDeLaPF', 'Condiții', p.conditii.aniDeLaPF, true);
      add('cond.fonduriPublice', 'Condiții', p.conditii.fonduriPublice, true);
    }
    parts.lines.forEach(function (l) {
      var k = 'line.' + l.id + '.', owner = l.nume || l.id;
      add(k + 'IL', owner, l.IL, true);
      add(k + 'L', owner, l.L, true, l.mod === 'ramuri');
      if (l.bLManual) add(k + 'bL', owner, l.bL, true);
      if (S.tranzitoriu(p).activ) add(k + 'compVeche', owner, l.compVeche, true);
      if (l.mod === 'ramuri') {
        notes.push(owner + ': costurile proprii ale ramurilor sunt incluse în investiție; nu se adaugă peste I_L. Verifică lungimile și racordările în inspectorul ramurii.');
        (l.ramuri || []).forEach(function (b) {
          add('ramura.' + l.id + '.' + b.id + '.L', owner + ' · ' + b.nume, b.L, true, true);
          if (b.costManual) add('ramura.' + l.id + '.' + b.id + '.IL', owner + ' · ' + b.nume, b.IL, true, true);
        });
      } else if (l.mod === 'distante') {
        (l.racordari || []).forEach(function (r) { add('dist:' + l.id + ':' + r.userId, owner + ' · ' + C.nameOf(p, r.userId), r.distanta, true); });
      } else {
        l.tronsoane.forEach(function (t) {
          var key = 'tronson.' + l.id + '.' + t.id + '.';
          add(key + (t.costManual || t.tip === 'stalpi' ? 'cost' : 'lungime'), owner + ' · ' + t.nume,
            t.costManual || t.tip === 'stalpi' ? t.cost : t.lungime, true);
        });
      }
    });
    parts.stations.forEach(function (s) {
      var k = 'stat.' + s.id + '.', owner = s.nume || s.id;
      if (parts.transformer) {
        add(k + 'Sn', owner, s.Sn, true); add(k + 'SnRezerva', owner, s.SnRezerva, true);
        add(k + 'IT', owner, s.IT, true);
        add(k + 'intarire', owner, !!s.intarire, true);
        if (S.tranzitoriu(p).activ) add(k + 'compVeche', owner, s.compVeche, true);
      }
      add(k + 'elementeComune', owner, s.elementeComune, true);
      if (parts.transformer && !Number(s.IT) && !Number(s.Sn)) notes.push(owner +
        ': S_n și I_T sunt zero. Confirmă că documentația prevede numai echipamente, nu un transformator omis.');
      if (parts.transformer && Number(s.IT) > 0 && Number(s.elementeComune) > 0) notes.push(owner +
        ': confirmă în deviz că echipamentele comune nu sunt deja incluse în I_T. Această verificare nu poate fi automatizată.');
    });
    if (p.meta.model === 'transitional') ['B', 'S', 'S2', 'l2', 'L'].forEach(function (key) { add('tranz.' + key, 'Anexa 4 pct. A', p.tranzitoriu[key], true); });
    if (p.meta.model === 'developer') {
      add('dev.Itotal', 'Rețea', p.dezvoltator.Itotal, true); add('dev.Ief', 'Rețea', p.dezvoltator.Ief, true);
      p.dezvoltator.dezvoltatori.forEach(function (d) { add('devitem.' + d.id + '.putere', d.nume || d.id, d.putere, true); });
      notes.push('I_ef trebuie să provină din analiza economică, nu din ajustarea valorilor pentru o cotă dorită.');
    }
    var conditions = C.conditionsFor(p);
    var zeros = entries.filter(function (entry) { return entry.required && entry.value === 0; });
    if (zeros.length) notes.push(zeros.length + ' valori numerice zero de verificat în documente. Zero poate fi corect; nu înseamnă „valoare necunoscută”.');
    return { parts: parts, entries: entries, notes: notes, errors: check.errors, warnings: check.warnings,
      conditions: conditions, missing: entries.filter(function (entry) { return entry.missing; }) };
  }
  function diagnosis(p, result) {
    if (!result) return [];
    if (result.error) return [{ title: result.blocked ? 'De ce nu se poate calcula?' : 'Datele nu permit calculul',
      text: result.error, tab: 'rezultate', target: result.blocked ? 'cond-card' : 'assist-review' }];
    var out = [], parts = active(p), ignored = S.tranzitoriu(p).ignorati;
    function add(title, text, target) { out.push({ title: title, text: text, tab: 'instalatie', target: target }); }
    if (result.model === 'transitional' && result.C2 === 0) {
      ['B', 'S2', 'l2'].forEach(function (key) {
        if (Number(p.tranzitoriu[key]) === 0) add('De ce este C₂ zero?', field('tranz.' + key).label + ' este zero, deci produsul formulei este zero.', 'tranz.' + key);
      });
    } else if (result.model === 'developer') {
      if (result.Xinef === 0) add('De ce sunt cotele zero?', 'I_ef este egal cu I_total: nu există componentă ineficientă de repartizat.', 'dev.Ief');
      result.rows.filter(function (r) { return r.putere === 0; }).forEach(function (r) {
        add('De ce ' + r.nume + ' are cotă zero?', 'Puterea aprobată introdusă este zero; ponderea în puterea totală este zero.', 'devitem.' + r.id + '.putere');
      });
    } else if (result.central) {
      S.newIds(p).forEach(function (id) {
        var relevant = (result.explicatii || []).filter(function (e) { return e.de === id; });
        var connectedLines = parts.lines.filter(function (l) { return l.tronsoane.some(function (t) { return t.utilizatori.indexOf(id) >= 0; }) ||
          (l.mod === 'distante' || l.mod === 'ramuri') && (l.racordari || []).some(function (r) { return r.userId === id; }); });
        var connectedStations = parts.stations.filter(function (s) { return s.utilizatori.indexOf(id) >= 0; });
        if (!connectedLines.length && !connectedStations.length) add('De ce ' + C.nameOf(p, id) + ' nu plătește?',
          'Nu este racordat la nicio componentă activă a modelului curent. Componentele inactive nu generează plăți.', null);
        connectedLines.forEach(function (l) {
          if (!relevant.some(function (e) { return e.lineId === l.id; })) {
            var used = C.buildConfig(p, p.meta.model);
            var segments = p.meta.model === 'line' ? used.tronsoane : (used.liniiU1 || []).concat(used.liniiU2 || []).reduce(function (all, config) { return all.concat(config.tronsoane); }, []);
            var here = segments.filter(function (t) { return t.lineId === l.id && t.utilizatori.indexOf(id) >= 0; });
            var zero = here.length && here.every(function (t) { return Number(t.cost) === 0; });
            add('De ce ' + C.nameOf(p, id) + ' nu plătește pe ' + l.nume + '?',
              !here.length ? 'Nu folosește niciun tronson compensabil; o racordare la originea traseului nu implică o lungime comună parcursă.'
                : zero ? 'Costul repartizabil al tronsoanelor folosite este zero, inclusiv după eventualele deduceri tranzitorii.'
                : 'Motorul nu a generat plăți aici: verifică pe tronsoane participanții eligibili racordați înaintea lui. Traseul folosit nu implică automat o compensație.', l.mod === 'ramuri' ? 'tree:' + l.id : 'line.' + l.id + '.IL');
          }
        });
        connectedStations.forEach(function (s) {
          var sr = (result.statii || result.components || []).filter(function (r) { return r.stationId === s.id; })[0];
          if (parts.transformer && (Number(s.Sn) > 0 || Number(s.IT) > 0 || s.intarire) &&
            !relevant.some(function (e) { return e.stationId === s.id && (e.tip === 'transformator' || e.tip === 'intarire'); })) {
            var reason = Number(S.findUser(p, id).putere) === 0 ? 'Puterea aprobată este zero.'
              : C.stationIT(p, s) === 0 ? 'Investiția netă compensabilă este zero.'
                : sr && sr.suplimentara && Number(sr.suplimentara.folosit[id] || 0) === 0 ? 'La etapa sa, motorul nu mai alocă capacitate suplimentară din transformatorul existent.'
                  : 'Motorul nu a generat o plată pentru transformator; verifică finanțatorul și capacitatea efectivă.';
            add('Transformator — ' + s.nume + ' — ' + C.nameOf(p, id), reason + ' Echipamentele comune se repartizează separat.', 'stat.' + s.id + '.IT');
          }
          if (!relevant.some(function (e) { return e.stationId === s.id && e.tip === 'echipamente'; })) {
            add('Echipamente — ' + s.nume + ' — ' + C.nameOf(p, id),
              Number(s.elementeComune) === 0 ? 'Costul echipamentelor comune este zero.'
                : 'Motorul nu a generat o plată pentru echipamente. Verifică participanții eligibili și ordinea etapelor; racordarea singură nu garantează o plată.',
              'stat.' + s.id + '.elementeComune');
          }
        });
      });
      ignored.filter(function (id) { return S.newIds(p).indexOf(id) < 0 && id !== S.primId(p); }).forEach(function (id) {
        add('De ce ' + C.nameOf(p, id) + ' nu primește?', 'Contractul anterior intrării în vigoare îl exclude din repartizare în regimul tranzitoriu; racordarea fizică rămâne în schemă.', null);
      });
      p.utilizatori.filter(function (u) { return u.rol === 'existent' && ignored.indexOf(u.id) < 0; }).forEach(function (u) {
        if (!result.central.rows.some(function (row) { return row.id === u.id && row.faraTVA > 0; })) add('De ce ' + C.nameOf(p, u.id) + ' nu primește?',
          'Motorul nu a generat plăți către acest utilizator. Transformatorul compensează finanțatorul; la linii/echipamente contează folosirea comună și etapa racordării.', null);
      });
    }
    return out;
  }
  global.AppAssist = { field: field, active: active, review: review, diagnosis: diagnosis };
})(window);
