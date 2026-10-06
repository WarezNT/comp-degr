/*
 * Vederea „4 · Rezultate”: stare (erori/avertismente), rezumat, centralizator cu explicații
 * „Cum s-a calculat”, panouri pentru prevederile tranzitorii și refacerea ATR, condiții.
 */
(function (global) {
  'use strict';

  var K = global.AppKit;
  var html = K.html;
  var store = K.store;
  var S = global.AppState;
  var E = global.CompEngine;
  var C = global.AppCalc;
  var V = global.AppValidate;
  var Views = global.AppViews;
  var HELP = global.AppHelp;
  var money = K.money;

  function nameOf(id) { return C.nameOf(store.state, id); }

  /* ----------------------- explicații de calcul ----------------------- */

  var TIP_LABEL = {
    tronson: 'Tronson', stalpi: 'Stâlpi (al doilea circuit)', echipamente: 'Echipamente comune',
    transformator: 'Transformator', intarire: 'Transformator — întărire post'
  };

  function Explain(props) {
    var list = props.items || [];
    if (!list.length) return html`<span class="muted">—</span>`;
    return html`<details class="how"><summary>Cum s-a calculat</summary>
      <ul class="how-list">${list.map(function (x) {
        var formula;
        if (x.tip === 'transformator' || x.tip === 'intarire') {
          formula = x.putere + ' kVA × ' + money(x.bT) + ' lei/kVA';
        } else {
          formula = money(x.cost) + ' / ' + x.inainte + ' − ' + money(x.cost) + ' / ' + x.dupa;
        }
        return html`<li><strong>${TIP_LABEL[x.tip] || x.tip}</strong>${x.sursa && x.tip !== 'transformator' ? ' „' + x.sursa + '”' : ''}:
          <span class="formula">${formula} = <strong>${money(x.suma)} lei</strong></span> <${K.RefChip} id=${x.rule} /></li>`;
      })}</ul></details>`;
  }

  /* ----------------------- panouri auxiliare ----------------------- */

  function OperatorNote(props) {
    var ops = props.central.newList.filter(function (id) { var u = S.findUser(store.state, id); return u && u.rol === 'operator'; });
    if (!ops.length) return null;
    return html`<p class="hint">Operatorul de rețea (${ops.map(nameOf).join(', ')}) este asimilat unui utilizator nou — folosește instalația primului utilizator pentru instalații proprii și plătește compensație. <${K.RefChip} id="art6.5" /></p>`;
  }

  function TranzPanel() {
    var p = store.state;
    var t = S.tranzitoriu(p);
    if (!t.activ) return null;
    var prim = S.findUser(p, S.primId(p));
    var items = [];
    items.push(html`Primul utilizator („${nameOf(prim.id)}”) a încheiat contractul la <strong>${prim.dataContract}</strong>, înainte de intrarea în vigoare a metodologiei (${S.DATA_INTRARE_VIGOARE}) → se aplică prevederile tranzitorii. <${K.RefChip} id="art17" />`);
    items.push(t.ignorati.length
      ? html`Noul utilizator plătește doar primului utilizator și celor cu contract ulterior intrării în vigoare. <strong>Ignorați</strong> (contract anterior, compensați după vechea metodologie): ${t.ignorati.map(nameOf).join(', ')}. <${K.RefChip} id="art18.3a" />`
      : 'Niciun alt utilizator cu contract anterior intrării în vigoare nu a fost exclus din repartizare.');
    if (t.faraData.length) items.push(html`<span class="warn">Fără „Data contractului” (considerați cu contract ulterior): ${t.faraData.map(nameOf).join(', ')}.</span>`);
    (p.linii || []).forEach(function (l) {
      if (p.meta.model === 'complex' && p.complexConfig.liniiIds.indexOf(l.id) < 0 && p.complexConfig.liniiU2Ids.indexOf(l.id) < 0) return;
      if (!(Number(l.IL) > 0)) return;
      var f = C.lineFactor(p, l);
      var sup = null;
      if (Number(l.capacitate) > 0) {
        var occ = p.utilizatori.reduce(function (sum, u) { return (u.id !== prim.id && t.ignorati.indexOf(u.id) >= 0) ? sum + (Number(u.putere) || 0) : sum; }, 0);
        sup = html`; capacitate suplimentară = ${money(l.capacitate)} − ${money(occ)} = <strong>${money(Math.max(0, Number(l.capacitate) - occ))} kVA</strong> <${K.RefChip} id="art18.1b" />`;
      }
      items.push(html`Linia „${l.nume}”: I_L ${money(l.IL)} − compensații vechi ${money(l.compVeche)} = <strong>${money((Number(l.IL) || 0) * f)} lei</strong> <${K.RefChip} id="art18.1a" />${sup}.`);
    });
    (p.statii || []).forEach(function (s) {
      if (Number(s.compVeche) > 0) {
        items.push(html`Stația „${s.nume}”: I_T ${money(s.IT)} − ${money(s.compVeche)} = <strong>${money(C.stationIT(p, s))} lei</strong>; compensația se plătește doar primului utilizator. <${K.RefChip} id="art18.3b" />`);
      }
    });
    return html`<details class="card" open><summary>Prevederi tranzitorii aplicate</summary><ul>${items.map(function (x) { return html`<li>${x}</li>`; })}</ul></details>`;
  }

  function AtrPanel(props) {
    var p = store.state;
    var prim = S.primId(p);
    if (!prim) return null;
    var rows = E.refaceAtr({
      dataCalcul: p.meta.dataCalcul, central: props.central,
      utilizatori: p.utilizatori.map(function (u) {
        return { id: u.id, nume: u.nume || u.codPA || u.id, faraContract: !!u.faraContract && u.id !== prim, valabilPana: u.atrValabilPana, tarifInitial: u.tarifInitial };
      })
    });
    if (!rows.length) return null;
    var statusTxt = { refacut: 'ATR se reface', 'valabilitate-necompletata': 'ATR se reface (valabilitatea nu e completată — verifică)', expirat: 'ATR expirat — nu se reface' };
    return html`<details class="card" open><summary>Refacerea avizelor tehnice de racordare <${K.RefChip} id="art7.2" /></summary>
      <p class="hint">Utilizator care a încheiat contractul (prim utilizator): <strong>${nameOf(prim)}</strong>. ATR-urile celorlalți utilizatori, dacă sunt în perioada de valabilitate, se refac de operator:
        a) din oficiu, la solicitarea încheierii contractului; b) cu menționarea tarifului de racordare recalculat și a valorii compensației; c) <strong>fără perceperea unui tarif</strong>.</p>
      <div class="table-wrap"><table class="grid"><thead><tr><th>Utilizator</th><th>Stare ATR</th><th>Compensație (fără TVA / cu TVA)</th><th>Tarif inițial (lei)</th><th>Tarif recalculat — estimare (lei)</th></tr></thead><tbody>
        ${rows.map(function (r) {
          var comp = r.refacut ? (r.selectat ? money(r.compensatieFaraTVA) + ' / ' + money(r.compensatieCuTVA) : html`<span class="muted">nu are rolul „Nou”</span>`) : html`<span class="muted">—</span>`;
          return html`<tr><td>${r.nume}</td><td>${statusTxt[r.status]}${r.valabilPana ? ' (până la ' + r.valabilPana + ')' : ''}</td>
            <td class="num">${comp}</td><td class="num">${r.tarifInitial > 0 ? money(r.tarifInitial) : '—'}</td>
            <td class="num">${r.tarifRecalculat !== null ? money(r.tarifRecalculat) : '—'}</td></tr>`;
        })}
      </tbody></table></div>
      ${S.tranzitoriu(p).activ ? html`<p class="hint">Recalcularea și refacerea avizelor valabile, fără contract, se face în 3 luni de la intrarea în vigoare a metodologiei (${S.DATA_INTRARE_VIGOARE} → 2016-04-07), fără tarif. <${K.RefChip} id="art18.2" /></p>` : null}
      <p class="hint">Estimare: tarif recalculat = tarif inițial − compensație. <${K.RefChip} id="art1.2" /> Valoarea oficială a tarifului se stabilește conform Metodologiei de stabilire a tarifului de racordare.</p></details>`;
  }

  function intarireInfo(st) {
    if (!st || !st.intarire || !st.suplimentara) return null;
    var sp = st.suplimentara;
    var folosit = Object.keys(sp.folosit).map(function (id) {
      return nameOf(id) + ': ' + money(sp.folosit[id]) + ' kVA × ' + money(st.bT) + ' = ' + money(sp.folosit[id] * st.bT) + ' lei';
    }).join('; ');
    return html`<br /><em>Întărire post</em> <${K.RefChip} id="art15.3" />: capacitate suplimentară existentă ${money(sp.initiala)} kVA (S_n efectiv ${money(st.SnEfectiv)} − ${money(sp.ocupata)} kVA deja racordați)${folosit ? ' — compensație pentru: ' + folosit : ''}; rămasă neutilizată ${money(sp.ramasa)} kVA.`;
  }

  function Details(props) {
    var res = props.res;
    var p = store.state;
    if (res.model === 'line') {
      return html`<details class="card"><summary>Detaliu pe tronsoane</summary>${res.tronsoaneDetalii.map(function (t) {
        return html`<div class="det"><strong>${t.nume || t.id}</strong>${t.tip === 'stalpi' ? html` <${K.RefChip} id="art15.1" />` : null} — cost ${money(t.cost)} lei, ${t.nrUtilizatori} utilizatori
          <ul>${t.plati.length ? t.plati.map(function (x) { return html`<li>${nameOf(x.deLa)} → ${nameOf(x.catre)}: <strong>${money(x.suma)}</strong></li>`; }) : html`<li class="muted">fără compensații</li>`}</ul></div>`;
      })}</details>`;
    }
    if (res.model === 'station') {
      return html`<details class="card"><summary>Detaliu stații</summary>${(res.statii || []).map(function (st, i) {
        var nm = (p.statii[i] && p.statii[i].nume) || ('Stația ' + (i + 1));
        return html`<p><strong>${nm}</strong>: b_T = I_T / S_n = ${money(st.IT)} / ${money(st.SnEfectiv)} = <strong>${money(st.bT)} lei/kVA</strong>
          ${Number(st.SnRezerva) > 0 ? html`<br />S_n efectiv = ${money(st.Sn)} − ${money(st.SnRezerva)} (rezervă N-1) = ${money(st.SnEfectiv)} kVA <${K.RefChip} id="art15.4" />` : null}${intarireInfo(st)}</p>`;
      })}</details>`;
    }
    if (res.model === 'complex') {
      return html`<details class="card" open><summary>Varianta ${res.varianta} — componente însumate <${K.RefChip} id="anexa3" /></summary><ul>
        ${res.components.length ? res.components.map(function (c) {
          if (c.model === 'station') return html`<li>Anexa 2 — ${money(c.bT)} lei/kVA${c.intarire ? ' (întărire post)' : ''}</li>`;
          return html`<li>Anexa 1 — ${money((c.tronsoaneDetalii || []).reduce(function (s, t) { return s + (Number(t.cost) || 0); }, 0))} lei</li>`;
        }) : html`<li class="muted">fără componente</li>`}</ul></details>`;
    }
    return null;
  }

  /* ----------------------- rezultat ----------------------- */

  function Summary(props) {
    var c = props.central;
    var payers = c.newList.length;
    var recv = {};
    c.rows.forEach(function (r) { recv[r.id] = true; });
    var withTva = !!store.state.meta.withTva;
    return html`<div class="tiles">
      <div class="tile"><div class="tile-l">Total fără TVA</div><div class="tile-v">${money(c.totalFaraTVA)} <span>lei</span></div></div>
      ${withTva ? html`<div class="tile"><div class="tile-l">Total cu TVA (${store.state.meta.tva}%)</div><div class="tile-v">${money(c.totalCuTVA)} <span>lei</span></div></div>` : null}
      <div class="tile"><div class="tile-l">Beneficiari</div><div class="tile-v">${Object.keys(recv).length}</div></div>
      <div class="tile"><div class="tile-l">Plătitori (utilizatori noi)</div><div class="tile-v">${payers}</div></div>
    </div>`;
  }

  function PerNou(props) {
    var c = props.central;
    if (c.newList.length < 2) return null;
    return html`<details class="card" open><summary>Total pe fiecare utilizator nou</summary>
      <table class="grid"><thead><tr><th>Utilizator nou</th><th>Total fără TVA</th><th>Total cu TVA</th></tr></thead><tbody>
      ${c.newList.map(function (id) { var x = c.perNou[id] || { faraTVA: 0, cuTVA: 0 };
        return html`<tr><td>${nameOf(id)}</td><td class="num">${money(x.faraTVA)}</td><td class="num">${money(x.cuTVA)}</td></tr>`; })}
      </tbody></table></details>`;
  }

  function Centralizator(props) {
    var res = props.res;
    var c = res.central;
    var p = store.state;
    var multi = c.newList.length > 1;
    var failed = (res.conditions || []).filter(function (x) { return !x.ok; });
    var title = c.newList.length === 1
      ? html`Centralizator compensații — plătite de <em>${nameOf(c.newList[0])}</em>`
      : html`Centralizator compensații — plătite de utilizatorii noi: <em>${c.newList.map(nameOf).join(', ')}</em>`;
    var cols = multi ? 6 : 4;
    return html`<div class="card highlight" id="centralizator">
      <div class="print-head"><strong>${p.meta.operator || ''}</strong>${p.meta.codOperator ? ' · cod operator ' + p.meta.codOperator : ''} · data întocmirii: ${p.meta.dataCalcul || ''} · ${Views.MODELS.filter(function (m) { return m[0] === p.meta.model; })[0][1]}</div>
      <h3>${title}${failed.length ? html` <span class="badge warn">INFORMATIV — condițiile din art. 8 nu sunt îndeplinite</span>` : null}</h3>
      <${Summary} central=${c} />
      <p class="hint">Utilizatorii noi plătesc compensații utilizatorilor racordați anterior (primul utilizator este receptorul principal). <${K.RefChip} id="art6.1" /></p>
      <${OperatorNote} central=${c} />
      ${failed.length ? html`<p class="warn">Atenție: ${failed.length} condiții nu sunt îndeplinite. Compensația se calculează și se plătește numai dacă sunt îndeplinite cumulativ. <${K.RefChip} id="art8.1" /></p>` : null}
      <div class="table-wrap"><table class="grid centralizator"><thead><tr>
        ${multi ? html`<th>Cod PA plătitor</th><th>Plătitor (nou)</th>` : null}
        <th>Cod PA</th><th>Nume / denumire</th><th>Valoare fără TVA</th><th>Valoare cu TVA</th><th>Explicație</th></tr></thead>
        <tbody>${c.rows.length ? c.rows.map(function (r) {
          return html`<tr>
            ${multi ? html`<td>${r.deLaCodPA || r.deLaNume}</td><td>${r.deLaNume}</td>` : null}
            <td>${r.codPA}</td><td>${r.nume}</td><td class="num">${money(r.faraTVA)}</td><td class="num">${money(r.cuTVA)}</td>
            <td class="how-cell"><${Explain} items=${r.explicatii} /></td></tr>`;
        }) : html`<tr><td colspan=${cols + 1} class="empty">Nicio compensație de plată.</td></tr>`}</tbody>
        <tfoot><tr class="total"><td colspan=${multi ? 4 : 2}>Total</td><td class="num">${money(c.totalFaraTVA)}</td><td class="num">${money(c.totalCuTVA)}</td><td></td></tr></tfoot></table></div>
      <${PerNou} central=${c} />
      <div class="signatures"><span>Întocmit: ${p.meta.operator || 'operator de rețea'}</span><span>Semnătură: ____________________</span></div>
    </div>`;
  }

  function TransitionalResult(props) {
    return html`<div class="card"><h3>Anexa 4 pct. A — rezultat <${K.RefChip} id="anexa4" /></h3>
      <p>b = ${money(props.res.b)} lei/kVA</p><p class="big">C₂ = <strong>${money(props.res.C2)} lei</strong></p></div>`;
  }
  function DeveloperResult(props) {
    var res = props.res;
    return html`<div class="card"><h3>Anexa 5 — cote de participare <${K.RefChip} id="anexa5" /></h3>
      <p>X_ef = ${(res.Xef * 100).toFixed(2)}% · X_inef = ${(res.Xinef * 100).toFixed(2)}%</p>
      <table class="grid"><thead><tr><th>Dezvoltator</th><th>Putere (kVA)</th><th>Cotă ineficiență</th><th>Sumă (lei)</th></tr></thead><tbody>
      ${res.rows.map(function (r) { return html`<tr><td>${r.nume}</td><td class="num">${money(r.putere)}</td><td class="num">${(r.Xinef * 100).toFixed(3)}%</td><td class="num">${money(r.suma)}</td></tr>`; })}
      </tbody></table></div>`;
  }

  /* ----------------------- condiții (art. 8 / art. 7) ----------------------- */

  var COND_KEYS = ['primCapacitateMaiMare', 'capacitateDisponibila', 'aniDeLaPF', 'solutieComuna', 'tarifAchitatIntegral'];

  // Rând „ani de la punerea în funcțiune” (definit la nivel de modul: să nu fie recreat la fiecare randare).
  function YearsLi(props) {
    var x = props.x;
    return html`<li class=${x.ok ? 'ok' : 'bad'}><span>${x.mesaj}</span> <${K.RefChip} id=${x.rule} />
      <div class="years-row">
        <label>Data punerii în funcțiune <${K.Info} k="cond.dataPIF" /> <${K.DateInput} path="cond.dataPIF" /></label>
        <label>sau ani (manual) <${K.NumInput} path="cond.aniDeLaPF" label="Ani de la punerea în funcțiune (manual)" /></label>
        ${props.fromDate ? html`<span class="hint">calculat din date: ${props.years} ani (la data întocmirii)</span>` : null}
      </div></li>`;
  }

  function ConditionsCard() {
    var p = store.state;
    var c = p.conditii;
    var model = p.meta.model;
    if (model === 'transitional') return null;
    var conds = C.conditionsFor(p);
    var years = C.effectiveYears(p);
    var fromDate = !!(c.dataPIF && p.meta.dataCalcul);
    var tariff = C.tariffStatus(p);
    var anyFail = conds.some(function (x) { return !x.ok; });
    var check = model !== 'developer';
    var blocked = !!(store.results && store.results.blocked);

    var items;
    if (check) {
      items = conds.map(function (x, i) {
        var k = COND_KEYS[i];
        if (k === 'aniDeLaPF') return html`<${YearsLi} x=${x} key=${k} fromDate=${fromDate} years=${years} />`;
        if (k === 'tarifAchitatIntegral') {
          return html`<li class=${x.ok ? 'ok' : 'bad'} key=${k}><span>${x.mesaj}</span> <${K.RefChip} id=${x.rule} />
            <div class="hint">${tariff.missing.length ? 'Fără „Data achitare TR” (sau ulterioară datei întocmirii): ' + tariff.missing.join(', ') + '.' : 'Toți beneficiarii au data achitării TR completată.'}</div>
            <${K.CheckInput} path="cond.tarifAchitatIntegral" label="Confirm manual că toți beneficiarii au achitat integral tariful" /></li>`;
        }
        return html`<li class=${x.ok ? 'ok' : 'bad'} key=${k}><${K.CheckInput} path=${'cond.' + k} label=${x.mesaj} /> <${K.RefChip} id=${x.rule} /></li>`;
      });
      items.push(html`<li class=${c.fonduriPublice ? 'bad' : 'ok'} key="fp"><${K.CheckInput} path="cond.fonduriPublice" label="Instalația primului utilizator a fost finanțată din fonduri publice nerambursabile (metodologia nu se aplică)" /> <${K.RefChip} id="art19" /></li>`);
    } else {
      items = conds.map(function (x) { return html`<${YearsLi} x=${x} key="y" fromDate=${fromDate} years=${years} />`; });
    }

    return html`<details class="card cond" open=${anyFail || blocked || !store.results} data-guide="cond-card">
      <summary><strong>Verificarea condițiilor cumulative ${model === 'developer' ? '(Anexa 5)' : html`(art. 8) <${K.RefChip} id="art8.1" />`}</strong>
        ${anyFail ? html` <span class="badge warn">${conds.filter(function (x) { return !x.ok; }).length} neîndeplinite</span>` : html` <span class="badge ok">✓ îndeplinite</span>`}</summary>
      <p class="hint">Calculul este blocat cât timp o condiție nu e îndeplinită („numai dacă sunt îndeplinite cumulativ”).</p>
      <ul class="conds">${items}</ul>
      <${K.CheckInput} path="cond.calcInformativ" label="Calculează oricum (informativ — valorile nu sunt datorate dacă o condiție nu e îndeplinită)" />
    </details>`;
  }

  /* ----------------------- vederea ----------------------- */

  function StatusBlock() {
    var p = store.state;
    var check = V.validate(p);
    var res = store.results;
    var out = [];
    if (check.errors.length) {
      out.push(html`<div class="card err-card" role="alert" key="err"><strong>De corectat înainte de calcul</strong><${K.IssueList} items=${check.errors} /></div>`);
    }
    if (res && res.blocked) {
      out.push(html`<div class="card warn-card" role="alert" key="blk"><strong>Nu se poate calcula încă</strong>
        <p>Compensația se calculează și se plătește numai dacă sunt îndeplinite cumulativ condițiile. <${K.RefChip} id="art8.1" /> Neîndeplinite:</p>
        <ul class="conds">${res.failed.map(function (x) { return html`<li class="bad"><span>${x.mesaj}</span> <${K.RefChip} id=${x.rule} /></li>`; })}</ul>
        <p class="hint">Corectează în „Verificarea condițiilor” de mai jos sau cere o valoare orientativă.</p>
        <button type="button" class="btn tiny" onClick=${function () { store.set('cond.calcInformativ', true); store.commit(); }}>Calculează oricum (informativ)</button></div>`);
    }
    if (check.warnings.length) {
      out.push(html`<div class="card warn-card" key="warn"><strong>Atenție</strong><${K.IssueList} items=${check.warnings} /></div>`);
    }
    return out;
  }

  function ResultsView() {
    var res = store.results;
    var ok = !!(res && !res.error && !res.blocked);
    var body = null;
    if (ok) {
      if (res.model === 'transitional') body = html`<${TransitionalResult} res=${res} />`;
      else if (res.model === 'developer') body = html`<${DeveloperResult} res=${res} />`;
      else body = html`<${Centralizator} res=${res} /><${TranzPanel} /><${Details} res=${res} /><${AtrPanel} central=${res.central} />`;
    } else if (!res) {
      body = html`<p class="muted">Apasă „Calculează compensațiile”.</p>`;
    }
    var canExport = ok && !!res.central;
    return html`<${Views.Panel} k="rezultate" title="Rezultate" help=${HELP.STEPS.rezultate}>
      <div class="toolbar">
        <button type="button" class="btn primary" data-guide="btn:calc" onClick=${store.calculate}>Calculează compensațiile</button>
        <button type="button" class="btn ghost" disabled=${!canExport} onClick=${store.exportCsv}>Export CSV</button>
        <button type="button" class="btn ghost" disabled=${!ok} onClick=${function () { global.print(); }}>Printează / PDF</button>
      </div>
      ${res ? html`<p class="hint">Rezultatul se actualizează automat când modifici datele.</p>` : null}
      <${StatusBlock} />
      <div id="results-region" aria-live="polite">${body}</div>
      <${ConditionsCard} />
    <//>`;
  }

  Views.ResultsView = ResultsView;
})(typeof window !== 'undefined' ? window : this);
