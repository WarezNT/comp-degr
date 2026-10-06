/*
 * Vederea „3 · Instalație”: linii (cu grila de alocare utilizatori × tronsoane), stații,
 * instalații complexe, vechea metodologie (Anexa 4 pct. A) și rețele de dezvoltatori (Anexa 5).
 */
(function (global) {
  'use strict';

  var K = global.AppKit;
  var html = K.html;
  var store = K.store;
  var S = global.AppState;
  var C = global.AppCalc;
  var V = global.AppViews;
  var HELP = global.AppHelp;
  var money = K.money;

  function users() { return store.state.utilizatori; }
  function uName(u) { return u.nume || u.codPA || 'fără nume'; }

  /* ----------------------- prevederi tranzitorii (art. 17–18) ----------------------- */

  function tranzLineHint(l) {
    if (!S.tranzitoriu(store.state).activ) return 'Regimul tranzitoriu nu e activ (data contractului primului utilizator nu e anterioară 07.01.2016).';
    var f = C.lineFactor(store.state, l);
    return html`Regim tranzitoriu activ: costul net = I_L − compensații vechi = <strong>${money((Number(l.IL) || 0) * f)} lei</strong> (factor ${f.toFixed(4).replace('.', ',')} aplicat pe fiecare tronson).`;
  }

  function TranzDetails(props) {
    var p = store.state;
    var x = props.x;
    var kind = props.kind;
    var t = S.tranzitoriu(p);
    var open = t.activ || Number(x.compVeche) > 0 || (kind === 'line' && Number(x.capacitate) > 0);
    var key = kind + '.' + x.id + '.';
    return html`<details class="tranz" open=${open}>
      <summary>Prevederi tranzitorii <${K.RefChip} id="art18.1a" /></summary>
      <div class="row2">
        <${K.Field} label="Compensații primite sub Ord. 28/2003 (lei)" path=${key + 'compVeche'} info=${kind + '.compVeche'}><${K.NumInput} path=${key + 'compVeche'} /><//>
        ${kind === 'line' ? html`<${K.Field} label="Capacitatea instalației (kVA)" path=${key + 'capacitate'} info="line.capacitate"><${K.NumInput} path=${key + 'capacitate'} /><//>` : null}
      </div>
      <p class="hint">${kind === 'line' ? tranzLineHint(x)
        : (t.activ ? html`Regim tranzitoriu activ: I_T net = ${money(C.stationIT(p, x))} lei (I_T − compensații vechi).` : 'Regimul tranzitoriu nu e activ (data contractului primului utilizator nu e anterioară 07.01.2016).')}</p>
    </details>`;
  }

  /* ----------------------- linie + grila de alocare ----------------------- */

  function lineStatus(l) {
    // Costul stâlpilor (art. 15 alin. 1) face parte din costul unui tronson existent: nu se adună de două ori.
    var sum = (l.tronsoane || []).reduce(function (s, t) { return t.tip === 'stalpi' ? s : s + C.tronsonCost(l, t); }, 0);
    var IL = Number(l.IL) || 0;
    if (IL <= 0) return null;
    var diff = IL - sum;
    var ok = Math.abs(diff) < 0.5;
    return html`<span class=${'badge ' + (ok ? 'ok' : 'warn')}>${ok
      ? '✓ suma tronsoanelor = I_L (' + money(sum) + ' lei)'
      : '⚠ suma tronsoanelor = ' + money(sum) + ' lei, diferă de I_L cu ' + money(diff) + ' lei'}</span>`;
  }

  function CostCell(props) {
    var l = props.l, t = props.t;
    var path = 'tronson.' + l.id + '.' + t.id + '.cost';
    if (t.tip === 'stalpi') {
      return html`<${K.NumInput} path=${path} label="Costul stâlpilor utilizați în comun (lei)" /><div class="hint">costul stâlpilor</div>`;
    }
    if (t.costManual) {
      return html`<${K.NumInput} path=${path} label="Cost tronson (lei)" />
        <div class="mini-actions"><button type="button" class="linkish" onClick=${function () { store.setTronsonManual(l.id, t.id, false); }}>↺ automat</button></div>`;
    }
    return html`<span class="auto-val" data-derived-cost=${l.id + '-' + t.id} title="Calculat automat: lungime × b_L">${money(C.tronsonCost(l, t))} lei</span>
      <div class="mini-actions"><button type="button" class="linkish" onClick=${function () { store.setTronsonManual(l.id, t.id, true); }}>✎ manual</button></div>`;
  }

  function AllocMatrix(props) {
    var l = props.l;
    var us = users();
    var noi = S.newIds(store.state);
    if (!us.length) return html`<p class="muted">Adaugă mai întâi utilizatori în pasul „2 · Utilizatori”.</p>`;
    return html`<div class="table-wrap"><table class="grid matrix">
      <thead><tr>
        <th>Tronson</th><th>Lungime (m) <${K.Info} k="tronson.lungime" /></th><th>Cost (lei) <${K.Info} k="tronson.cost" /></th>
        ${us.map(function (u) {
          return html`<th class=${'ucol rol-' + u.rol} title=${V.ROL_LABEL[u.rol]}><div class="uname">${uName(u)}</div><div class="urol">${V.ROL_LABEL[u.rol]}</div></th>`;
        })}
        <th>Toți</th><th></th>
      </tr></thead>
      <tbody>
        ${(l.tronsoane || []).length ? l.tronsoane.map(function (t) {
          var base = 'tronson.' + l.id + '.' + t.id + '.';
          var stalpi = t.tip === 'stalpi';
          var allOn = us.length && us.every(function (u) { return t.utilizatori.indexOf(u.id) >= 0; });
          return html`<tr key=${t.id} class=${stalpi ? 'stalpi' : ''} data-guide=${'alloc:' + l.id + ':' + t.id}>
            <td><${K.TextInput} path=${base + 'nume'} label="Denumire tronson" />${stalpi ? html` <${K.RefChip} id="art15.1" /> <${K.Info} k="stalpi" />` : null}</td>
            <td>${stalpi ? html`<span class="muted">—</span>` : html`<${K.NumInput} path=${base + 'lungime'} label="Lungime tronson (m)" />`}</td>
            <td class="cost-cell"><${CostCell} l=${l} t=${t} /></td>
            ${us.map(function (u) {
              var on = t.utilizatori.indexOf(u.id) >= 0;
              return html`<td class=${'center cell' + (noi.indexOf(u.id) >= 0 ? ' nou' : '')}>
                <input type="checkbox" data-guide=${'cell:' + l.id + ':' + t.id + ':' + u.id} checked=${on}
                  aria-label=${uName(u) + ' folosește ' + (t.nume || 'tronsonul')}
                  onChange=${function () { store.toggleTronsonUser(l.id, t.id, u.id); }} />
              </td>`;
            })}
            <td class="center"><button type="button" class="btn tiny ghost" onClick=${function () { store.setTronsonAllUsers(l.id, t.id, !allOn); }}>${allOn ? 'Niciunul' : 'Toți'}</button></td>
            <td><button type="button" class="btn tiny danger" onClick=${function () { store.delTronson(l.id, t.id); }} aria-label=${'Șterge ' + (t.nume || 'tronsonul')}>Șterge</button></td>
          </tr>`;
        }) : html`<tr><td colspan=${us.length + 5} class="empty">Niciun tronson. Apasă „+ Tronson”.</td></tr>`}
      </tbody>
    </table></div>
    <p class="hint matrix-hint">Derulează tabelul spre dreapta pentru a bifa utilizatorii →</p>`;
  }

  function LineCard(props) {
    var l = props.l;
    var p = store.state;
    var id = l.id;
    var bL = C.lineBl(l);
    var complex = p.meta.model === 'complex';
    var role = p.complexConfig.liniiIds.indexOf(id) >= 0 ? 'u1' : (p.complexConfig.liniiU2Ids.indexOf(id) >= 0 ? 'u2' : '');
    return html`<div class="card line-card" key=${id}>
      <div class="card-head">
        <${K.TextInput} path=${'line.' + id + '.nume'} label="Denumire linie" ph="Denumire linie" />
        ${complex ? html`<select aria-label="Rol în instalația complexă" data-guide=${'role:' + id}
          onChange=${function (e) { store.setLineRole(id, e.target.value); }}>
          <option value="" selected=${role === ''}>Neinclusă</option>
          <option value="u1" selected=${role === 'u1'}>Linia l_U1 (Anexa 1)</option>
          <option value="u2" selected=${role === 'u2'}>Linia l_U2 (Anexa 1, var. 4)</option>
        </select>` : null}
        <button type="button" class="btn tiny danger" onClick=${function () { store.delLine(id); }}>Șterge linia</button>
      </div>
      <div class="row3">
        <${K.Field} label="① Cost lucrări I_L (lei)" path=${'line.' + id + '.IL'} info="line.IL"><${K.NumInput} path=${'line.' + id + '.IL'} /><//>
        <${K.Field} label="② Lungime totală L (m)" path=${'line.' + id + '.L'} info="line.L"><${K.NumInput} path=${'line.' + id + '.L'} /><//>
        <${K.Field} label="③ Cost specific b_L (lei/m)" path=${'line.' + id + '.bL'} info="line.bL">
          <${K.NumInput} path=${'line.' + id + '.bL'} />
          <button type="button" class="linkish bL-auto" hidden=${!l.bLManual} onClick=${function () { store.setLineBlAuto(id); }}>↺ automat = I_L / L</button>
        <//>
      </div>
      <p class="hint">Costul fiecărui tronson = <strong>lungime × b_L = <span data-line-bl=${id}>${money(bL)}</span> lei/m</strong>. <${K.RefChip} id="art12.1" />
        <span data-line-status=${id}>${lineStatus(l)}</span></p>
      <${TranzDetails} kind="line" x=${l} />
      <div class="toolbar"><strong>Tronsoane și utilizatori</strong>
        <button type="button" class="btn tiny" data-guide=${'btn:add-tronson:' + id} onClick=${function () { store.addTronson(id); }}>+ Tronson</button>
        <button type="button" class="btn tiny" title="Art. 15 alin. 1: al doilea circuit pe stâlpii unei linii aeriene existente" onClick=${function () { store.addStalpi(id); }}>+ Circuit pe stâlpi existenți</button>
        <button type="button" class="btn tiny ghost" onClick=${function () { store.autoAllTronsoane(id); }}>↺ Recalculează toate</button>
      </div>
      <${AllocMatrix} l=${l} />
    </div>`;
  }

  function LinesEditor(props) {
    var p = store.state;
    var list = props.list || p.linii;
    return html`<div>
      ${list.length ? list.map(function (l) { return html`<${LineCard} l=${l} key=${l.id} />`; })
        : html`<div class="empty card">Nicio linie. Apasă „+ Adaugă linie”.</div>`}
    </div>`;
  }

  /* ----------------------- stație ----------------------- */

  function stationHint(s) {
    var p = store.state;
    var SnEf = (Number(s.Sn) || 0) - (Number(s.SnRezerva) || 0);
    var bT = SnEf > 0 ? (Number(s.IT) || 0) / SnEf : 0;
    var txt = html`b_T = I_T / S_n efectiv = ${money(Number(s.IT) || 0)} / ${money(SnEf)} = <strong>${money(bT)} lei/kVA</strong>`;
    var extra = Number(s.SnRezerva) > 0 ? html` (S_n efectiv exclude transformatorul de rezervă <${K.RefChip} id="art15.4" />)` : null;
    var tail = s.intarire
      ? html`. <strong>Întărire post</strong> <${K.RefChip} id="art15.3" />: compensația = puterea noului utilizator × b_T, doar în limita capacității suplimentare a transformatorului existent
          (S_n efectiv − puterile deja racordate = <strong>${money(Math.max(0, SnEf - C.stationOccupied(p, s)))} kVA</strong>).`
      : html`. Compensația fiecărui utilizator nou = puterea sa aprobată × b_T <${K.RefChip} id="art13" />.`;
    return html`${txt}${extra}${tail}`;
  }

  function StationCard(props) {
    var s = props.s;
    var id = s.id;
    var p = store.state;
    var complex = p.meta.model === 'complex';
    var included = p.complexConfig.statiiIds.indexOf(id) >= 0;
    var k = 'stat.' + id + '.';
    var noi = S.newIds(p);
    return html`<div class="card station-card" key=${id}>
      <div class="card-head">
        <${K.TextInput} path=${k + 'nume'} label="Denumire stație / PT" ph="Denumire stație / PT" />
        ${complex ? html`<label class="chk"><input type="checkbox" checked=${included} onChange=${function (e) { store.setStationIncluded(id, e.target.checked); }} /> Inclusă în instalația complexă</label>` : null}
        <button type="button" class="btn tiny danger" onClick=${function () { store.delStation(id); }}>Șterge</button>
      </div>
      <div class="row3">
        <${K.Field} label="Capacitate nominală S_n (kVA)" path=${k + 'Sn'} info="stat.Sn"><${K.NumInput} path=${k + 'Sn'} /><//>
        <${K.Field} label="Transformator de rezervă N-1 (kVA)" path=${k + 'SnRezerva'} info="stat.SnRezerva"><${K.NumInput} path=${k + 'SnRezerva'} /><//>
        <${K.Field} label="Cost lucrări I_T (lei)" path=${k + 'IT'} info="stat.IT"><${K.NumInput} path=${k + 'IT'} /><//>
      </div>
      <div class="row2">
        <${K.Field} label="Echipamente comune, altele decât transformatoare (lei)" path=${k + 'elementeComune'} info="stat.elementeComune"><${K.NumInput} path=${k + 'elementeComune'} /><//>
        <${K.Field} label="Întărire post" info="stat.intarire" id=${'f-' + id + '-int'}><${K.CheckInput} path=${k + 'intarire'} label="Transformator înlocuit / al doilea transformator" /><//>
      </div>
      <${TranzDetails} kind="stat" x=${s} />
      <div class="toolbar"><strong>Utilizatori racordați la stație</strong></div>
      <div class="list-chk" data-guide=${'alloc:' + id}>
        ${users().length ? users().map(function (u) {
          var on = (s.utilizatori || []).indexOf(u.id) >= 0;
          return html`<label class=${'chk' + (noi.indexOf(u.id) >= 0 ? ' nou' : '')}>
            <input type="checkbox" data-guide=${'cell:' + id + ':' + u.id} checked=${on} onChange=${function () { store.toggleStationUser(id, u.id); }} />
            ${uName(u)} <span class="muted">(${V.ROL_LABEL[u.rol]})</span></label>`;
        }) : html`<span class="muted">Adaugă mai întâi utilizatori.</span>`}
      </div>
      <p class="hint" data-st-hint=${id}>${stationHint(s)}</p>
    </div>`;
  }

  function StationsEditor(props) {
    var list = props.list || store.state.statii;
    return html`<div>
      ${list.length ? list.map(function (s) { return html`<${StationCard} s=${s} key=${s.id} />`; })
        : html`<div class="empty card">Nicio stație. Apasă „+ Adaugă stație / PT”.</div>`}
    </div>`;
  }

  /* ----------------------- instalație complexă ----------------------- */

  var VARIANT_TEXT = {
    1: 'Varianta 1 — noul utilizator se racordează pe linia U1, în amonte de stație. Se aplică doar Anexa 1 pentru l_U1.',
    2: 'Varianta 2 — racordare la bara U1 a stației. Anexa 1 (l_U1) + echipamentele stației (altele decât transformatoarele), în cote egale între toți utilizatorii care au contribuit.',
    3: 'Varianta 3 — racordare pe linia U2, în aval de stație. Anexa 1 (l_U1) + Anexa 2 (transformator). Echipamentele comune ale stației NU se adaugă (lectura literală a Anexei 3; de confirmat).',
    4: 'Varianta 4 — racordare pe linia U2, mai departe. Anexa 1 (l_U1) + Anexa 2 (transformator) + Anexa 1 (l_U2).'
  };

  function ComplexView() {
    var p = store.state;
    var c = p.complexConfig;
    var v = Number(c.varianta) || 3;
    return html`<${V.Panel} k="instalatie-complex" title="Anexa 3 — instalație de racordare complexă" help=${HELP.STEPS.instalatie.complex}>
      <${K.Field} label="Varianta punctului de racordare" path="complex.varianta" info="complex.varianta">
        <${K.SelectInput} path="complex.varianta" options=${[['1', 'Varianta 1'], ['2', 'Varianta 2'], ['3', 'Varianta 3'], ['4', 'Varianta 4']]}
          onPicked=${function () { store.set('complex.variantaConfirmata', true); }} />
      <//>
      <p class="hint">${VARIANT_TEXT[v]} <${K.RefChip} id="anexa3" /></p>
      <h3>Linii (Anexa 1)</h3>
      <div class="toolbar">
        <button type="button" class="btn" data-guide="btn:add-line" onClick=${function () { store.addLine('u1'); }}>+ Linie l_U1</button>
        ${v === 4 ? html`<button type="button" class="btn" data-guide="btn:add-line-u2" onClick=${function () { store.addLine('u2'); }}>+ Linie l_U2</button>` : null}
        <span class="hint">Fiecare linie are un rol: l_U1, l_U2 sau neinclusă.</span>
      </div>
      <${LinesEditor} />
      ${v >= 2 ? html`<h3>Stație / post de transformare</h3>
        <div class="toolbar"><button type="button" class="btn" data-guide="btn:add-stat" onClick=${store.addStation}>+ Adaugă stație / PT</button></div>
        <${StationsEditor} />` : null}
    <//>`;
  }

  /* ----------------------- Anexa 4 pct. A și Anexa 5 ----------------------- */

  function TransitionalView() {
    return html`<${V.Panel} k="instalatie-tranz" title="Anexa 4 pct. A — compensație după vechea metodologie (Ord. 28/2003)" help=${HELP.STEPS.instalatie.transitional}>
      <div class="row3">
        <${K.Field} label="Componenta B din tariful de racordare (lei)" path="tranz.B" info="tranz.B"><${K.NumInput} path="tranz.B" /><//>
        <${K.Field} label="Capacitatea instalației S (kVA)" path="tranz.S" info="tranz.S"><${K.NumInput} path="tranz.S" /><//>
        <${K.Field} label="Puterea noului utilizator S₂ (kVA)" path="tranz.S2" info="tranz.S2"><${K.NumInput} path="tranz.S2" /><//>
        <${K.Field} label="Lungimea folosită l₂ (m)" path="tranz.l2" info="tranz.l2"><${K.NumInput} path="tranz.l2" /><//>
        <${K.Field} label="Lungimea totală L (m)" path="tranz.L" info="tranz.L"><${K.NumInput} path="tranz.L" /><//>
      </div>
      <p class="hint">b = B / S ; C₂ = S₂ · b · (l₂ / L). <${K.RefChip} id="anexa4" /></p>
    <//>`;
  }

  function DeveloperView() {
    var d = store.state.dezvoltator;
    return html`<${V.Panel} k="instalatie-dev" title="Anexa 5 — rețea publică finanțată de un prim dezvoltator" help=${HELP.STEPS.instalatie.developer}>
      <div class="row2">
        <${K.Field} label="Valoarea totală a investiției I_total (lei)" path="dev.Itotal" info="dev.Itotal"><${K.NumInput} path="dev.Itotal" /><//>
        <${K.Field} label="Cota de eficiență I_ef (lei)" path="dev.Ief" info="dev.Ief"><${K.NumInput} path="dev.Ief" /><//>
      </div>
      <div class="toolbar"><strong>Dezvoltatori / utilizatori</strong>
        <button type="button" class="btn tiny" data-guide="btn:add-dev" onClick=${store.addDev}>+ Adaugă</button></div>
      <div class="table-wrap"><table class="grid responsive"><thead><tr><th>Denumire</th><th>Putere aprobată (kVA) <${K.Info} k="dev.putere" /></th><th></th></tr></thead>
        <tbody>${(d.dezvoltatori || []).length ? d.dezvoltatori.map(function (x) {
          return html`<tr key=${x.id}>
            <td data-label="Denumire"><${K.TextInput} path=${'devitem.' + x.id + '.nume'} label="Denumire dezvoltator" /></td>
            <td data-label="Putere (kVA)"><${K.NumInput} path=${'devitem.' + x.id + '.putere'} label="Putere aprobată (kVA)" /></td>
            <td><button type="button" class="btn tiny danger" onClick=${function () { store.delDev(x.id); }}>Șterge</button></td>
          </tr>`;
        }) : html`<tr><td colspan="3" class="empty">Niciun dezvoltator.</td></tr>`}</tbody></table></div>
      <p class="hint">X_ef = I_ef / I_total ; X_inef = 1 − X_ef ; X_D = X_inef · P_D / P_total. <${K.RefChip} id="anexa5" /></p>
    <//>`;
  }

  /* ----------------------- Anexa 1 / Anexa 2 ----------------------- */

  function LineView() {
    return html`<${V.Panel} k="instalatie-line" title="Anexa 1 — linie electrică" help=${HELP.STEPS.instalatie.line}>
      <div class="toolbar"><button type="button" class="btn" data-guide="btn:add-line" onClick=${function () { store.addLine(); }}>+ Adaugă linie</button>
        <span class="hint">Pe fiecare tronson costul se împarte în cote egale între utilizatorii care îl folosesc. <${K.RefChip} id="art12.1" /></span></div>
      <${LinesEditor} />
    <//>`;
  }

  function StationView() {
    return html`<${V.Panel} k="instalatie-station" title="Anexa 2 — stație electrică / post de transformare" help=${HELP.STEPS.instalatie.station}>
      <div class="toolbar"><button type="button" class="btn" data-guide="btn:add-stat" onClick=${store.addStation}>+ Adaugă stație / PT</button></div>
      <${StationsEditor} />
    <//>`;
  }

  function InstallView() {
    var m = store.state.meta.model;
    if (m === 'line') return html`<${LineView} />`;
    if (m === 'station') return html`<${StationView} />`;
    if (m === 'complex') return html`<${ComplexView} />`;
    if (m === 'transitional') return html`<${TransitionalView} />`;
    return html`<${DeveloperView} />`;
  }

  V.InstallView = InstallView;
})(typeof window !== 'undefined' ? window : this);
