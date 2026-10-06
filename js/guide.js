/*
 * Guide — ghidul pas cu pas. Din starea proiectului derivă lista ordonată de pași
 * (ce mai trebuie completat și unde); primul pas nefăcut este „pasul următor”.
 * Funcții pure, fără DOM: interfața doar evidențiază câmpul indicat de `target`.
 *
 * step = { id, tab, target, label, hint, rule, optional, confirm, done }
 *   - target  → cheia câmpului: valoarea din data-bind sau data-guide (ex. „user.u1.nume”, „btn:add-user”);
 *   - optional → pasul poate fi sărit („Sari”) fără să blocheze calculul;
 *   - confirm → { path, value, label }: buton care confirmă pasul fără completare (ex. modelul implicit).
 */
(function (global) {
  'use strict';

  var S = global.AppState;
  var C = global.AppCalc;

  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function filled(v) { return v !== '' && v !== undefined && v !== null && String(v).trim() !== ''; }

  function steps(p, ctx) {
    ctx = ctx || {};
    var out = [];
    var model = p.meta.model;
    var users = p.utilizatori || [];
    var usesUsers = model === 'line' || model === 'station' || model === 'complex';

    function add(id, tab, target, label, hint, done, extra) {
      var s = { id: id, tab: tab, target: target, label: label, hint: hint || '', done: !!done, optional: false };
      if (extra) Object.keys(extra).forEach(function (k) { s[k] = extra[k]; });
      out.push(s);
    }
    function nm(u) { return u.nume || u.codPA || 'utilizatorul'; }

    /* ---- 1 · Date generale ---- */
    add('model', 'date', 'meta.model', 'Alege tipul de instalație (modelul de calcul)',
      'Pentru o linie electrică folosită în comun rămâne „Anexa 1”. Schimbă modelul sau confirmă.',
      p.meta.modelConfirmat, { confirm: { path: 'meta.modelConfirmat', value: true, label: 'Anexa 1 e corect — continuă' }, rule: 'anexa1' });
    add('operator', 'date', 'meta.operator', 'Completează operatorul de rețea',
      'Apare pe centralizator și la print. Poți sări peste acest pas.', filled(p.meta.operator), { optional: true });

    /* ---- 2 · Utilizatori ---- */
    if (usesUsers) {
      add('user-add-1', 'utilizatori', 'btn:add-user', 'Adaugă primul utilizator — cel care a finanțat instalația',
        'Este „Prim utilizator”: primește compensațiile.', users.length >= 1, { rule: 'art6.1' });
      add('user-add-2', 'utilizatori', 'btn:add-user', 'Adaugă utilizatorul nou — cel care se racordează acum',
        'El plătește compensația. Mai poți adăuga și alți utilizatori existenți.', users.length >= 2, { rule: 'art6.1' });

      users.forEach(function (u, i) {
        add('user-nume:' + u.id, 'utilizatori', 'user.' + u.id + '.nume',
          'Completează numele utilizatorului nr. ' + (i + 1), 'Nume sau denumirea firmei; apare în centralizator.', filled(u.nume));
        if (model !== 'line') {
          add('user-putere:' + u.id, 'utilizatori', 'user.' + u.id + '.putere',
            'Completează puterea aprobată pentru ' + nm(u) + ' (kVA)', 'Se folosește la repartizarea costului stației/postului.', num(u.putere) > 0, { rule: 'art13' });
        }
      });

      if (users.length >= 2) {
        if (!S.primId(p)) {
          add('role-prim', 'utilizatori', 'user.' + users[0].id + '.rol', 'Alege cine este primul utilizator (finanțatorul)',
            'Rolul „Prim utilizator” — cel care primește compensațiile.', false, { rule: 'art6.1' });
        }
        if (!S.newIds(p).length) {
          add('role-nou', 'utilizatori', 'user.' + users[users.length - 1].id + '.rol', 'Alege cine este utilizatorul nou (plătește)',
            'Rolul „Nou” — cel care se racordează acum.', false, { rule: 'art6.1' });
        }
        var noi = S.newIds(p);
        users.forEach(function (u) {
          if (noi.indexOf(u.id) >= 0) return;   // beneficiarii compensației: prim + existenți
          add('tr-date:' + u.id, 'utilizatori', 'user.' + u.id + '.dataTR',
            'Completează „Data achitare TR” pentru ' + nm(u),
            'Beneficiarul trebuie să fi achitat integral tariful de racordare. Dacă nu o știi, sari și confirmă manual la pasul 4.',
            filled(u.dataTR), { optional: true, rule: 'art7.1' });
        });
      }
    }

    /* ---- 3 · Instalație ---- */
    var noiIds = S.newIds(p);
    var primId = S.primId(p);

    function lineSteps(l, label) {
      var id = l.id;
      var nmL = l.nume || label || 'linia';
      add('line-IL:' + id, 'instalatie', 'line.' + id + '.IL', 'Completează costul lucrărilor liniei „' + nmL + '” (I_L, lei)',
        'Valoarea achitată de primul utilizator prin tariful de racordare.', num(l.IL) > 0, { rule: 'anexa1' });
      add('line-L:' + id, 'instalatie', 'line.' + id + '.L', 'Completează lungimea totală a liniei „' + nmL + '” (L, m)',
        'Din I_L / L rezultă costul specific b_L.', num(l.L) > 0, { rule: 'anexa1' });
      var trs = (l.tronsoane || []).filter(function (t) { return t.tip !== 'stalpi'; });
      add('line-trs:' + id, 'instalatie', 'btn:add-tronson:' + id, 'Adaugă cel puțin un tronson al liniei „' + nmL + '”',
        'Un tronson = un segment folosit de aceiași utilizatori.', trs.length >= 1, { rule: 'art12.1' });
      trs.forEach(function (t) {
        add('trs-lungime:' + id + ':' + t.id, 'instalatie', 'tronson.' + id + '.' + t.id + '.lungime',
          'Completează lungimea tronsonului „' + (t.nume || '') + '” (m)', 'Costul tronsonului = lungime × b_L.', num(t.lungime) > 0 || (t.costManual && num(t.cost) > 0));
        if (users.length) {
          add('trs-alloc:' + id + ':' + t.id, 'instalatie', 'cell:' + id + ':' + t.id + ':' + users[0].id,
            'Bifează utilizatorii care folosesc tronsonul „' + (t.nume || '') + '”', 'Costul tronsonului se împarte în cote egale între ei.',
            (t.utilizatori || []).length >= 1, { rule: 'art12.1' });
        }
      });
      noiIds.forEach(function (nid) {
        if (!trs.length) return;
        var on = (l.tronsoane || []).some(function (t) { return (t.utilizatori || []).indexOf(nid) >= 0; });
        var first = trs[0];
        add('nou-alloc:' + id + ':' + nid, 'instalatie', 'cell:' + id + ':' + first.id + ':' + nid,
          'Bifează unde se racordează ' + nm(S.findUser(p, nid)), 'Altfel nu plătește nicio compensație.', on, { rule: 'art12.1' });
      });
    }

    function stationSteps(s) {
      var id = s.id;
      var nmS = s.nume || 'stația';
      add('stat-Sn:' + id, 'instalatie', 'stat.' + id + '.Sn', 'Completează capacitatea nominală a „' + nmS + '” (S_n, kVA)',
        'Puterea transformatorului.', num(s.Sn) > 0, { rule: 'anexa2' });
      add('stat-IT:' + id, 'instalatie', 'stat.' + id + '.IT', 'Completează costul lucrărilor „' + nmS + '” (I_T, lei)',
        'Valoarea achitată de primul utilizator.', num(s.IT) > 0, { rule: 'anexa2' });
      if (primId) {
        add('stat-prim:' + id, 'instalatie', 'cell:' + id + ':' + primId, 'Bifează primul utilizator în „' + nmS + '”',
          'El primește compensația pentru stație/post.', (s.utilizatori || []).indexOf(primId) >= 0, { rule: 'art6.1b' });
      }
      noiIds.forEach(function (nid) {
        add('stat-nou:' + id + ':' + nid, 'instalatie', 'cell:' + id + ':' + nid, 'Bifează ' + nm(S.findUser(p, nid)) + ' în „' + nmS + '”',
          'Plătește compensația proporțional cu puterea aprobată.', (s.utilizatori || []).indexOf(nid) >= 0, { rule: 'art13' });
      });
    }

    if (model === 'line') {
      add('line-add', 'instalatie', 'btn:add-line', 'Adaugă linia electrică', 'Linia realizată de primul utilizator.', p.linii.length >= 1, { rule: 'anexa1' });
      p.linii.forEach(function (l) { lineSteps(l); });
    } else if (model === 'station') {
      add('stat-add', 'instalatie', 'btn:add-stat', 'Adaugă stația / postul de transformare', 'Elementul realizat de primul utilizator.', p.statii.length >= 1, { rule: 'anexa2' });
      p.statii.forEach(stationSteps);
    } else if (model === 'complex') {
      var sel = p.complexConfig;
      var v = Number(sel.varianta) || 3;
      add('cx-var', 'instalatie', 'complex.varianta', 'Alege varianta punctului de racordare', '1 = pe linia U1 · 2 = la bara stației · 3 = pe linia U2 · 4 = pe linia U2, mai departe.',
        sel.variantaConfirmata, { confirm: { path: 'complex.variantaConfirmata', value: true, label: 'Varianta ' + v + ' e corectă — continuă' }, rule: 'art14' });
      var l1 = p.linii.filter(function (l) { return sel.liniiIds.indexOf(l.id) >= 0; });
      var l2 = p.linii.filter(function (l) { return sel.liniiU2Ids.indexOf(l.id) >= 0; });
      var st = p.statii.filter(function (s) { return sel.statiiIds.indexOf(s.id) >= 0; });
      add('cx-l1', 'instalatie', 'btn:add-line', 'Adaugă linia l_U1 (de la primul utilizator spre stație)', '', l1.length >= 1, { rule: 'anexa3' });
      l1.forEach(function (l) { lineSteps(l); });
      if (v >= 2) {
        add('cx-st', 'instalatie', 'btn:add-stat', 'Adaugă stația / postul din instalația complexă', 'Variantele 2–4 folosesc stația.', st.length >= 1, { rule: 'anexa3' });
        st.forEach(stationSteps);
      }
      if (v === 4) {
        add('cx-l2', 'instalatie', 'btn:add-line-u2', 'Adaugă linia l_U2 (în aval de stație)', 'Varianta 4 folosește și a doua linie.', l2.length >= 1, { rule: 'art14' });
        l2.forEach(function (l) { lineSteps(l); });
      }
    } else if (model === 'transitional') {
      [['B', 'Componenta B din tariful de racordare (lei)'], ['S', 'Capacitatea instalației S (kVA)'], ['S2', 'Puterea noului utilizator S₂ (kVA)'],
        ['l2', 'Lungimea folosită l₂ (m)'], ['L', 'Lungimea totală L (m)']].forEach(function (f) {
        add('tranz-' + f[0], 'instalatie', 'tranz.' + f[0], 'Completează: ' + f[1], '', num(p.tranzitoriu[f[0]]) > 0, { rule: 'anexa4' });
      });
    } else if (model === 'developer') {
      var d = p.dezvoltator;
      add('dev-Itotal', 'instalatie', 'dev.Itotal', 'Completează valoarea totală a investiției (I_total, lei)', '', num(d.Itotal) > 0, { rule: 'anexa5' });
      add('dev-Ief', 'instalatie', 'dev.Ief', 'Completează cota de eficiență (I_ef, lei)', 'Din analiza de eficiență economică; poate fi 0. Poți sări.', num(d.Ief) > 0, { optional: true, rule: 'anexa5' });
      add('dev-add', 'instalatie', 'btn:add-dev', 'Adaugă dezvoltatorii / utilizatorii care folosesc rețeaua în comun', '', (d.dezvoltatori || []).length >= 1, { rule: 'anexa5' });
      (d.dezvoltatori || []).forEach(function (x, i) {
        add('dev-putere:' + x.id, 'instalatie', 'devitem.' + x.id + '.putere', 'Completează puterea aprobată a dezvoltatorului nr. ' + (i + 1) + ' (kVA)', '', num(x.putere) > 0, { rule: 'anexa5' });
      });
    }

    /* ---- 4 · Rezultate ---- */
    if (C.CHECK_MODELS.indexOf(model) >= 0) {
      add('cond-review', 'rezultate', 'cond.primCapacitateMaiMare', 'Verifică condițiile cumulative din art. 8',
        'Compensația se calculează numai dacă toate sunt îndeplinite. Bifează situația reală.',
        p.conditii.verificate, { confirm: { path: 'cond.verificate', value: true, label: 'Am verificat condițiile' }, rule: 'art8.1' });
    }
    add('calc', 'rezultate', 'btn:calc', 'Calculează compensațiile', 'Rezultatul se actualizează apoi automat la fiecare modificare.', !!ctx.hasResults);

    // Pașii sărite (doar cei opționali) se consideră rezolvați.
    out.forEach(function (s) { if (!s.done && s.optional && ctx.skipped && ctx.skipped[s.id]) s.done = true, s.skipped = true; });
    return out;
  }

  function next(p, ctx) {
    var all = steps(p, ctx);
    for (var i = 0; i < all.length; i++) if (!all[i].done) return { step: all[i], index: i, total: all.length, done: all.filter(function (s) { return s.done; }).length };
    return null;
  }

  // Starea fiecărui pas (tab) pentru indicatorii din navigare: nr. de pași rămași și probleme.
  function tabStatus(p, ctx, issues) {
    var res = { date: { todo: 0, errors: 0, warnings: 0 }, utilizatori: { todo: 0, errors: 0, warnings: 0 },
      instalatie: { todo: 0, errors: 0, warnings: 0 }, rezultate: { todo: 0, errors: 0, warnings: 0 } };
    steps(p, ctx).forEach(function (s) { if (!s.done && !s.optional && res[s.tab]) res[s.tab].todo++; });
    ((issues && issues.errors) || []).forEach(function (i) { if (res[i.tab]) res[i.tab].errors++; });
    ((issues && issues.warnings) || []).forEach(function (i) { if (res[i.tab]) res[i.tab].warnings++; });
    return res;
  }

  global.AppGuide = { steps: steps, next: next, tabStatus: tabStatus };
})(typeof window !== 'undefined' ? window : this);
