/*
 * Vederi: panou cu ajutor, „Date generale” și „Utilizatori”.
 */
(function (global) {
  'use strict';

  var K = global.AppKit;
  var html = K.html;
  var store = K.store;
  var S = global.AppState;
  var HELP = global.AppHelp;
  var C = global.AppCalc;

  var ROLES = [
    ['prim', 'Prim utilizator (finanțator)'],
    ['existent', 'Existent'],
    ['nou', 'Nou (plătește)'],
    ['operator', 'Operator de rețea (art. 6 alin. 5)']
  ];
  var ROL_LABEL = { prim: 'Prim utilizator', existent: 'Existent', nou: 'Nou', operator: 'Operator de rețea' };

  var MODELS = [
    ['line', 'Anexa 1 — linie electrică / elemente comune'],
    ['station', 'Anexa 2 — stație electrică / post de transformare'],
    ['complex', 'Anexa 3 — instalație de racordare complexă'],
    ['transitional', 'Anexa 4 pct. A — compensație după vechea metodologie (Ord. 28/2003)'],
    ['developer', 'Anexa 5 — rețea publică finanțată de un dezvoltator']
  ];

  function nameOf(id) { return C.nameOf(store.state, id); }

  /* Ajutorul pasului: scurt; pe ecran mare rămâne deschis în dreapta, pe mobil e restrâns sub conținut. */
  function Help(props) {
    var b = props.block;
    if (!b) return null;
    return html`<aside class="helper"><details open=${!!store.wide}>
      <summary><span class="helper-ico">?</span> Ajutor — ${b.titlu}</summary>
      <p class="helper-intro">${b.intro}</p>
      ${b.rules && b.rules.length ? html`<p class="helper-refs">Temei: ${b.rules.map(function (r) { return html`<${K.RefChip} id=${r} /> `; })}</p>` : null}
      <p class="helper-note">Pune cursorul pe ⓘ de lângă un câmp pentru explicația lui.</p>
    </details></aside>`;
  }

  // Panoul unui pas: titlu + conținut + ajutor. Cheia schimbă elementul la schimbarea pasului,
  // deci animația de intrare rulează doar atunci, nu la fiecare modificare de date.
  function Panel(props) {
    return html`<section class=${'panel' + (props.help ? ' with-helper' : '')} key=${props.k}>
      <div class="panel-main"><h2>${props.title}</h2>${props.children}</div>
      <${Help} block=${props.help} />
    </section>`;
  }

  /* ----------------------- 1 · Date generale ----------------------- */

  // Cota de TVA: 21% (implicit), 19% sau „Altă valoare” (câmp numeric manual).
  function tvaChoice() {
    var m = store.state.meta;
    var t = Number(m.tva);
    if (m.tvaAlta || (t !== 21 && t !== 19)) return 'alta';
    return String(t);
  }

  function TvaPicker() {
    var choice = tvaChoice();
    return html`<div class="tva-picker">
      <select id="f-meta_tvaOpt" data-bind="meta.tvaOpt" aria-label="Cotă TVA" value=${choice}
        onChange=${function (e) {
          var v = e.target.value;
          if (v === 'alta') { store.set('meta.tvaAlta', true); }
          else { store.set('meta.tvaAlta', false); store.set('meta.tva', Number(v)); }
          store.commit();
        }}>
        <option value="21" selected=${choice === '21'}>21%</option>
        <option value="19" selected=${choice === '19'}>19%</option>
        <option value="alta" selected=${choice === 'alta'}>Altă valoare…</option>
      </select>
      ${choice === 'alta' ? html`<label class="tva-manual">Cotă (%) <${K.NumInput} path="meta.tva" label="Cotă TVA introdusă manual (%)" /></label>` : null}
    </div>`;
  }

  function GeneralView() {
    var p = store.state;
    var prim = S.primId(p);
    var noi = S.newIds(p);
    return html`<${Panel} k="date" title="Date generale" help=${HELP.STEPS.date}>
      <div class="row2">
        <${K.Field} label="Operator de rețea" path="meta.operator" info="meta.operator"><${K.TextInput} path="meta.operator" ph="ex. Delgaz Grid" /><//>
        <${K.Field} label="Cod operator" path="meta.codOperator" info="meta.codOperator"><${K.TextInput} path="meta.codOperator" /><//>
      </div>
      <div class="row3">
        <${K.Field} label="Data întocmirii" path="meta.dataCalcul" info="meta.dataCalcul"><${K.DateInput} path="meta.dataCalcul" /><//>
        <${K.Field} label="Cotă TVA" path="meta.tvaOpt" info="meta.tva"><${TvaPicker} /><//>
        <${K.Field} label="Centralizator" info="meta.withTva" id="f-meta_withTva"><${K.CheckInput} path="meta.withTva" label="Afișează și valorile cu TVA" /><//>
      </div>
      <${K.Field} label="Model de calcul" path="meta.model" info="meta.model">
        <${K.SelectInput} path="meta.model" options=${MODELS} />
      <//>
      <div class="roles-summary card">
        <strong>Cine plătește și cine primește</strong>
        <p class="hint">Rolurile se stabilesc în pasul „2 · Utilizatori”.</p>
        ${['line', 'station', 'complex'].indexOf(p.meta.model) >= 0 ? html`
          <ul>
            <li>Prim utilizator (primește): ${prim ? html`<strong>${nameOf(prim)}</strong>` : html`<span class="muted">nealeas</span>`}</li>
            <li>Utilizatori noi (plătesc): ${noi.length ? html`<strong>${noi.map(nameOf).join(', ')}</strong>` : html`<span class="muted">niciunul</span>`}</li>
          </ul>
          <button type="button" class="btn tiny ghost" onClick=${function () { store.setTab('utilizatori'); }}>Mergi la utilizatori →</button>`
        : html`<p class="muted">Acest model nu folosește utilizatori cu roluri.</p>`}
      </div>
    <//>`;
  }

  /* ----------------------- 2 · Utilizatori ----------------------- */

  function UserRow(props) {
    var u = props.u;
    var k = 'user.' + u.id + '.';
    var prim = u.id === S.primId(store.state);
    return html`<${global.preact.Fragment}>
      <tr class=${'urow rol-' + u.rol}>
        <td data-label="Rol"><${K.SelectInput} path=${k + 'rol'} options=${ROLES} label="Rol" /></td>
        <td data-label="Cod PA"><${K.TextInput} path=${k + 'codPA'} label="Cod PA" /></td>
        <td data-label="Nume / denumire"><${K.TextInput} path=${k + 'nume'} label="Nume / denumire" ph="Nume" /></td>
        <td data-label="Putere (kVA)"><${K.NumInput} path=${k + 'putere'} label="Putere aprobată (kVA)" /></td>
        <td data-label="Data ATR"><${K.DateInput} path=${k + 'dataATR'} label="Data ATR" /></td>
        <td data-label="Data achitare TR"><${K.DateInput} path=${k + 'dataTR'} label="Data achitare TR" /></td>
        <td data-label="Tip client"><${K.SelectInput} path=${k + 'tipClient'} options=${[['noncasnic', 'Non-casnic'], ['casnic', 'Casnic']]} label="Tip client" /></td>
        <td class="actions"><button type="button" class="btn tiny danger" onClick=${function () { store.delUser(u.id); }}
          aria-label=${'Șterge utilizatorul ' + (u.nume || u.codPA || '')}>Șterge</button></td>
      </tr>
      <tr class="subrow"><td colspan="8">
        <details class="contract" open=${!!(u.dataContract || u.faraContract || u.atrValabilPana || Number(u.tarifInitial) > 0)}>
          <summary>Contract și avize <span class="muted">(art. 7 alin. 2, art. 17–18)</span></summary>
          <div class="row4">
            <${K.Field} label="Data contractului" path=${k + 'dataContract'} info="user.dataContract"><${K.DateInput} path=${k + 'dataContract'} /><//>
            <${K.Field} label="ATR fără contract" info="user.faraContract" id=${'f-' + u.id + '-fc'}>
              ${prim ? html`<span class="muted">— (prim utilizator)</span>` : html`<${K.CheckInput} path=${k + 'faraContract'} label="ATR emis, contract neîncheiat" />`}
            <//>
            <${K.Field} label="ATR valabil până la" path=${k + 'atrValabilPana'} info="user.atrValabilPana"><${K.DateInput} path=${k + 'atrValabilPana'} disabled=${prim} /><//>
            <${K.Field} label="Tarif inițial (lei)" path=${k + 'tarifInitial'} info="user.tarifInitial"><${K.NumInput} path=${k + 'tarifInitial'} /><//>
          </div>
        </details>
      </td></tr>
    <//>`;
  }

  function UsersView() {
    var p = store.state;
    var h = html;
    return html`<${Panel} k="utilizatori" title="Utilizatori" help=${HELP.STEPS.utilizatori}>
      <div class="toolbar">
        <button type="button" class="btn" data-guide="btn:add-user" onClick=${store.addUser}>+ Adaugă utilizator</button>
        <span class="hint">Primul utilizator adăugat devine „Prim utilizator”, al doilea „Nou”; poți schimba rolurile.</span>
      </div>
      <div class="table-wrap"><table class="grid responsive users">
        <thead><tr>
          <th>Rol <${K.Info} k="user.rol" /></th><th><${K.Abbr} k="PA" /> <${K.Info} k="user.codPA" /></th><th>Nume / denumire</th>
          <th>Putere (kVA) <${K.Info} k="user.putere" /></th><th><${K.Abbr} k="ATR" /> <${K.Info} k="user.dataATR" /></th>
          <th>Achitare <${K.Abbr} k="TR" /> <${K.Info} k="user.dataTR" /></th><th>Tip client <${K.Info} k="user.tipClient" /></th><th></th>
        </tr></thead>
        <tbody>
          ${p.utilizatori.length
            ? p.utilizatori.map(function (u) { return h`<${UserRow} u=${u} key=${u.id} />`; })
            : h`<tr><td colspan="8" class="empty">Niciun utilizator. Apasă „+ Adaugă utilizator”.</td></tr>`}
        </tbody>
      </table></div>
    <//>`;
  }

  global.AppViews = global.AppViews || {};
  global.AppViews.Panel = Panel;
  global.AppViews.Help = Help;
  global.AppViews.GeneralView = GeneralView;
  global.AppViews.UsersView = UsersView;
  global.AppViews.ROL_LABEL = ROL_LABEL;
  global.AppViews.MODELS = MODELS;
})(typeof window !== 'undefined' ? window : this);
