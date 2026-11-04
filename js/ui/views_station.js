/* Anexa 2: schemă orientativă, inspector și explicații din motorul existent. */
(function (global) {
  'use strict';
  var K = global.AppKit, html = K.html, store = K.store;
  var S = global.AppState, C = global.AppCalc, V = global.AppViews;
  var useState = global.preactHooks.useState, useRef = global.preactHooks.useRef;
  function name(id) { return C.nameOf(store.state, id); }
  function code(id) { return 'U' + (store.state.utilizatori.map(function (u) { return u.id; }).indexOf(id) + 1); }
  function connected(s) { return store.state.utilizatori.filter(function (u) { return s.utilizatori.indexOf(u.id) >= 0; }); }
  function itemsFor(result, s, userId) {
    return result && !result.error ? (result.explicatii || []).filter(function (e) {
      return e.stationId === s.id && e.de === userId;
    }) : [];
  }
  function total(items) { return items.reduce(function (sum, e) { return sum + e.suma; }, 0); }
  function stationResult(result, s) {
    return result && !result.error ? (result.statii || result.components || []).filter(function (r) { return r.stationId === s.id; })[0] : null;
  }

  function CommitInput(props) {
    var pending = useRef(null), dirty = useRef(false), value = store.get(props.path);
    function text(v) { return props.numeric ? K.fmtShow(v) : String(v == null ? '' : v); }
    return html`<input type="text" inputmode=${props.numeric ? 'decimal' : undefined}
      data-bind=${props.path} aria-label=${props.label} placeholder=${props.numeric ? '0' : undefined} autocomplete="off"
      value=${pending.current === null ? text(value) : pending.current}
      onInput=${function (e) { pending.current = e.target.value; dirty.current = true; }}
      onFocus=${function (e) {
        if (pending.current === null && props.numeric) { pending.current = K.fmtEdit(value); e.target.value = pending.current; }
      }}
      onBlur=${function (e) {
        if (!dirty.current) { pending.current = null; e.target.value = text(store.get(props.path)); return; }
        dirty.current = false;
        var next = props.numeric ? K.parseNum(e.target.value) : e.target.value;
        if (props.numeric && (next === null || Number(next) < 0)) {
          store.toast('Introdu o valoare numerică nenegativă pentru „' + props.label + '”.', 'error');
          pending.current = null; e.target.value = text(value); return;
        }
        pending.current = null;
        if (String(next) === String(value == null ? '' : value)) { e.target.value = text(value); return; }
        var target = e.relatedTarget;
        store.mutate(function (p) { C.setPath(p, props.path, next); },
          { undo: true, noFocus: !!(target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) });
        e.target.value = text(store.get(props.path));
      }}
      onKeyDown=${function (e) {
        if (e.key === 'Enter') e.target.blur();
        if (e.key === 'Escape') { dirty.current = false; pending.current = null; e.target.value = text(value); e.target.blur(); }
      }} />`;
  }

  function Metrics(props) {
    var s = props.s, capacity = Number(s.Sn) - Number(s.SnRezerva), net = C.stationIT(store.state, s);
    var occupied = connected(s).reduce(function (sum, u) { return sum + Number(u.putere || 0); }, 0);
    return html`<div class="station-metrics">
      <p>Capacitate efectivă: ${K.money(s.Sn)} − ${K.money(s.SnRezerva)} = <strong>${K.money(capacity)} kVA</strong>.
        Rezerva N−1 nu participă la b_T.</p>
      <p>Putere aprobată totală racordată: <strong>${K.money(occupied)} kVA</strong>.
        ${occupied > capacity ? html`<span class="warn">${s.intarire ? 'Depășirea este acoperită prin întărire; motorul limitează compensația la capacitatea suplimentară existentă.' : 'Puterea depășește capacitatea efectivă; verifică dimensionarea și avertismentele din Rezultate.'}</span>`
          : html`Capacitate liberă după toate racordările: ${K.money(Math.max(0, capacity - occupied))} kVA.`}</p>
      ${capacity > 0 ? html`<p>b_T = investiție netă / capacitate efectivă =
        ${K.money(net)} / ${K.money(capacity)} = <strong>${K.money(net / capacity)} lei/kVA</strong>.
        ${Number(s.compVeche) && S.tranzitoriu(store.state).activ ? 'Investiția netă exclude compensațiile vechi.' : ''}</p>`
        : html`<p class="warn">Completează o capacitate efectivă pozitivă pentru calculul b_T.</p>`}
    </div>`;
  }

  function StationDiagram(props) {
    var s = props.s, us = props.users || connected(s), selected = props.selected || '';
    var explanations = props.items || [], paidTransformer = explanations.some(function (e) { return e.tip === 'transformator' || e.tip === 'intarire'; });
    var paidEquipment = explanations.some(function (e) { return e.tip === 'echipamente'; });
    var on = s.utilizatori.indexOf(props.userId) >= 0, height = 265 + us.length * 52;
    function select(id) { if (props.onSelect) props.onSelect(id); }
    function keyboard(e, id) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(id); } }
    function attrs(id) {
      return { role: props.onSelect ? 'button' : undefined, tabindex: props.onSelect ? 0 : undefined,
        'aria-pressed': props.onSelect ? selected === id : undefined };
    }
    return html`<div class="station-diagram-wrap"><svg class="station-diagram" viewBox=${'0 0 920 ' + height}
      role="group" aria-label=${'Schema stației — ' + s.nume}>
      <text x="30" y="27">PR / alimentare</text><line x1="30" y1="45" x2="165" y2="45" class="station-wire" />
      <g ...${attrs('@transformator')} class=${'station-node station-transformer' + (paidTransformer ? ' station-paid' : '') + (selected === '@transformator' ? ' station-selected' : '')}
        aria-label="Transformator" onClick=${function () { select('@transformator'); }} onKeyDown=${function (e) { keyboard(e, '@transformator'); }}>
        <rect x="165" y="20" width="360" height="90" rx="8" />
        <circle cx="200" cy="55" r="15" /><circle cx="200" cy="72" r="15" />
        <text x="232" y="48">Transformator · S_n ${K.money(s.Sn)} kVA</text>
        <text x="232" y="72">I_T ${K.money(s.IT)} lei</text>
        <text x="232" y="94">${s.intarire ? 'Întărire post — art. 15 alin. 3' : 'Repartizare pe putere — art. 13'}</text>
      </g>
      <g class="station-reserve" role="img" aria-label=${'Rezervă N−1: ' + K.money(s.SnRezerva) + ' kVA, exclusă din calcul'}>
        <rect x="555" y="20" width="325" height="90" rx="8" />
        <text x="575" y="48">Rezervă N−1: ${K.money(s.SnRezerva)} kVA</text>
        <text x="575" y="74">Exclusă din capacitatea efectivă</text>
      </g>
      <line x1="345" x2="345" y1="110" y2="145" class=${'station-wire' + (on ? ' station-route' : '')} />
      <g ...${attrs('@echipamente')} class=${'station-node' + (paidEquipment ? ' station-paid' : '') + (selected === '@echipamente' ? ' station-selected' : '')}
        aria-label="Echipamente comune" onClick=${function () { select('@echipamente'); }} onKeyDown=${function (e) { keyboard(e, '@echipamente'); }}>
        <rect x="165" y="145" width="360" height="60" rx="8" />
        <text x="185" y="170">Echipamente comune</text>
        <text x="185" y="191">${K.money(s.elementeComune)} lei · cote egale, succesiv</text>
      </g>
      <line x1="345" x2="345" y1="205" y2=${height - 30} class="station-wire" />
      ${on && us.some(function (u) { return u.id === props.userId; }) ? html`<line x1="345" x2="345" y1="205"
        y2=${253 + us.map(function (u) { return u.id; }).indexOf(props.userId) * 52} class="station-wire station-route" />` : null}
      ${us.length ? us.map(function (u, index) {
        var y = 235 + index * 52, active = u.id === props.userId;
        return html`<g key=${u.id}>
          <line x1="345" x2="490" y1=${y + 18} y2=${y + 18} class=${'station-wire' + (active ? ' station-route' : '')} />
          <g ...${attrs(u.id)} class=${'station-node station-user rol-' + u.rol + (active ? ' station-selected' : '')}
            aria-label=${code(u.id) + ' — ' + name(u.id) + ', ' + K.money(u.putere) + ' kVA'}
            onClick=${function () { select(u.id); }} onKeyDown=${function (e) { keyboard(e, u.id); }}>
            <rect x="490" y=${y} width="390" height="38" rx="6" />
            <text x="510" y=${y + 24}>${code(u.id)} · ${K.money(u.putere)} kVA · ${V.ROL_LABEL[u.rol]}</text>
          </g>
        </g>`;
      }) : html`<text x="390" y="250">Niciun utilizator racordat</text>`}
      ${explanations.length ? html`<text class="station-payment-label" x="30" y=${height - 10}>Comp. ${K.money(total(explanations))} lei fără TVA pentru ${code(props.userId)}</text>` : null}
    </svg></div>`;
  }

  function Explanation(props) {
    var result = props.result, s = props.s, u = props.user, report = !!props.report;
    if (!result) return null;
    if (result.error) return html`<section class="station-compensation">
      <h3>Compensația pentru ${name(u.id)}</h3>
      <p class="warn">${result.blocked ? 'Calcul blocat: condițiile cumulative nu sunt îndeplinite.' : 'Corectează datele proiectului înainte de calcul.'}</p>
      <p>${result.error}</p>
    </section>`;
    var items = itemsFor(result, s, u.id), sr = stationResult(result, s);
    var informative = (result.conditions || []).some(function (c) { return !c.ok; });
    var connectedHere = s.utilizatori.indexOf(u.id) >= 0, ignored = S.tranzitoriu(store.state).ignorati;
    var order = S.newIds(store.state).filter(function (id) { return s.utilizatori.indexOf(id) >= 0; });
    var before = s.utilizatori.filter(function (id) { return order.indexOf(id) < 0 && (ignored.indexOf(id) < 0 || id === S.primId(store.state)); }).length + order.indexOf(u.id);
    var used = sr && sr.suplimentara ? Number(sr.suplimentara.folosit[u.id] || 0) : Number(u.putere || 0);
    return html`<section class="station-compensation">
      <h3>Compensația pentru ${name(u.id)}</h3>
      ${informative ? html`<p class="warn"><strong>INFORMATIV — condițiile nu sunt îndeplinite; sumele nu sunt datorate.</strong></p>` : null}
      <p class="station-compensation-total"><strong>Total pe această stație: ${K.money(total(items))} lei fără TVA</strong></p>
      ${connectedHere ? html`<p>Echipamente comune — etapa racordării: ${before} → ${before + 1} ${before + 1 === 1 ? 'participant' : 'participanți'}.
        Ordinea este cea a utilizatorilor noi din proiect, nu poziția în desen.</p>` : html`<p>Utilizatorul nu este racordat la această stație; nu are plăți aici.</p>`}
      ${connectedHere && sr && sr.intarire ? html`<p class="station-spare">Întărire: capacitate suplimentară inițială ${K.money(sr.suplimentara.initiala)} kVA;
        pentru acest utilizator se compensează ${K.money(used)} din ${K.money(u.putere)} kVA.
        Ceilalți utilizatori noi consumă succesiv aceeași capacitate disponibilă a transformatorului existent.</p>` : null}
      ${items.length ? html`<ul class="station-contributions">${items.map(function (e) {
        var equipment = e.tip === 'echipamente', label = equipment ? 'Echipamente comune' : 'Transformator';
        return html`<li>
          ${report ? html`<strong>${label}</strong>` : html`<button type="button" class="linkish"
            onClick=${function () { props.onSelect(equipment ? '@echipamente' : '@transformator'); }}>${label}</button>`}
          — către ${name(e.catre)}:
          ${equipment ? html`${K.money(e.cost)} / ${e.inainte} − ${K.money(e.cost)} / ${e.dupa}` : html`${K.money(e.putere)} kVA × ${K.money(e.bT)} lei/kVA`}
          = <strong>${K.money(e.suma)} lei</strong>${report ? ' · ' + global.AppRules.label(e.rule) : html` <${K.RefChip} id=${e.rule} />`}
        </li>`;
      })}</ul>` : connectedHere ? html`<p>Fără compensații de plată aici: verifică puterea, investiția netă,
        capacitatea suplimentară la întărire și existența participanților anteriori pentru echipamente.</p>` : null}
      <p class="hint">Sumele sunt preluate din motorul de calcul. Total în proiect:
        ${K.money(result.central.perNou[u.id] ? result.central.perNou[u.id].faraTVA : 0)} lei fără TVA.
        Centralizatorul rotunjește sumele cumulate pe beneficiar; formulele afișează factori rotunjiți pentru lizibilitate.</p>
    </section>`;
  }

  function StationScheme(props) {
    var s = props.s, selection = useState('@transformator'), selected = selection[0], userSelection = useState('');
    function select(id) {
      selection[1](id);
      if (S.findUser(store.state, id)) userSelection[1](id);
    }
    var u = S.findUser(store.state, userSelection[0]), inspectorUser = S.findUser(store.state, selected);
    var p = store.state, k = 'stat.' + s.id + '.';
    K.useRevealTarget(function (key) {
      if (key.indexOf(k) === 0) select(key === k + 'elementeComune' ? '@echipamente' : '@transformator');
      if (key.indexOf('user.') === 0) {
        var id = key.split('.')[1];
        if (S.findUser(p, id)) select(id);
      }
    });
    var result = u && S.newIds(p).indexOf(u.id) >= 0 ? C.runCalculation(p) : null;
    var items = itemsFor(result, s, userSelection[0]), validation = global.AppValidate.validate(p);
    function field(path, label, numeric) {
      return html`<label>${label}<${CommitInput} key=${path} path=${path} label=${label} numeric=${numeric} /></label>`;
    }
    return html`<section class="station-scheme" aria-label=${'Editor grafic — ' + s.nume} data-guide=${'alloc:' + s.id}>
      <p class="hint">Selectează transformatorul, echipamentele sau un utilizator pentru a-i edita proprietățile.
        Racordarea se schimbă numai prin butonul explicit, nu prin selectare. Schema este orientativă, nu la scară.</p>
      <div class="station-layout">
        <aside class="station-palette">
          <h3>Elemente</h3>
          <button type="button" class="btn tiny" aria-pressed=${selected === '@transformator'} onClick=${function () { select('@transformator'); }}>Transformator</button>
          <button type="button" class="btn tiny" aria-pressed=${selected === '@echipamente'} onClick=${function () { select('@echipamente'); }}>Echipamente comune</button>
          <h3>Utilizatori</h3>
          ${p.utilizatori.map(function (person) {
            return html`<button type="button" class="station-person" key=${person.id} aria-pressed=${person.id === selected}
              data-guide=${'cell:' + s.id + ':' + person.id}
              onClick=${function () { select(person.id); }}>
              <strong>${code(person.id)} — ${name(person.id)}</strong>
              <span>${V.ROL_LABEL[person.rol]} · ${K.money(person.putere)} kVA</span>
              <span>${s.utilizatori.indexOf(person.id) >= 0 ? 'Racordat' : 'Neracordat'}</span>
            </button>`;
          })}
        </aside>
        <div class="station-canvas">
          <${Metrics} s=${s} />
          ${validation.errors.length ? html`<div class="warn station-validation" role="alert">Date invalide:
            ${validation.errors.map(function (e) { return html`<p>${e.text}</p>`; })}</div>` : null}
          ${(validation.warnings || []).filter(function (w) { return w.target && (w.target.indexOf(k) === 0 || w.target === 'alloc:' + s.id); }).map(function (w) {
            return html`<p class="warn">${w.text}</p>`;
          })}
          <${StationDiagram} s=${s} selected=${selected} userId=${u ? u.id : ''} onSelect=${select} items=${items} />
          <p class="hint">Bleu / albastru = racordare selectată. Roșu + «Comp.» = componentă care generează plată.
            Rezerva este delimitată întrerupt; nu este alocată utilizatorilor.</p>
          ${u && result ? html`<${Explanation} s=${s} user=${u} result=${result} onSelect=${select} />` : null}
        </div>
        <section class="station-inspector" key=${selected}>
          ${inspectorUser ? html`<h3>Proprietăți — ${name(inspectorUser.id)}</h3>
            ${field('user.' + inspectorUser.id + '.nume', 'Nume utilizator', false)}
            ${field('user.' + inspectorUser.id + '.codPA', 'Cod PA', false)}
            ${field('user.' + inspectorUser.id + '.putere', 'Putere aprobată (kVA)', true)}
            <p>${V.ROL_LABEL[inspectorUser.rol]} · date comune tuturor stațiilor și liniilor.
              Rolul și avizele se editează în pasul Utilizatori.</p>
            <button type="button" class=${'btn tiny' + (s.utilizatori.indexOf(inspectorUser.id) >= 0 ? ' danger' : '')}
              onClick=${function () { store.toggleStationUser(s.id, inspectorUser.id); }}>
              ${s.utilizatori.indexOf(inspectorUser.id) >= 0 ? 'Deconectează de la stație' : 'Racordează la stație'}</button>
          ` : selected === '@echipamente' ? html`<h3>Proprietăți echipamente comune</h3>
            ${field(k + 'elementeComune', 'Cost echipamente comune (lei)', true)}
            <p>Altele decât transformatoarele. Repartizare în cote egale, în etapele racordării utilizatorilor noi.</p>
            <${K.RefChip} id="art12.1" />
          ` : html`<h3>Proprietăți transformator</h3>
            ${field(k + 'Sn', 'Capacitate nominală S_n (kVA)', true)}
            ${field(k + 'SnRezerva', 'Transformator de rezervă N-1 (kVA)', true)}
            ${field(k + 'IT', 'Cost lucrări I_T (lei)', true)}
            <label class="chk"><input type="checkbox" checked=${!!s.intarire} aria-label="Întărire post în schemă"
              onChange=${function (e) { var on = e.target.checked; store.mutate(function (p) {
                C.byId(p.statii, s.id).intarire = on;
              }, { undo: true }); }} />Transformator înlocuit / al doilea transformator</label>
            <${K.RefChip} id=${s.intarire ? 'art15.3' : 'art13'} />
            <p class="hint">La întărire, S_n și investiția se referă la transformatorul existent; motorul limitează puterea compensată.</p>
            <details class="advanced"><summary>Prevederi tranzitorii</summary>
              ${field(k + 'compVeche', 'Compensații vechi (lei)', true)}
              <p>Se deduc din I_T numai când regimul tranzitoriu al proiectului este activ.</p>
            </details>
          `}
        </section>
      </div>
    </section>`;
  }

  function StationReport(props) {
    var s = props.s, result = props.result, us = connected(s), chunks = [0];
    for (var i = 6; i < us.length; i += 6) chunks.push(i);
    var ignored = S.tranzitoriu(store.state).ignorati, newUsers = S.newIds(store.state);
    return html`<section class="station-report">
      <h3>Stație / PT — ${s.nume}</h3>
      <${Metrics} s=${s} />
      <p>Echipamente comune: ${K.money(s.elementeComune)} lei. ${s.intarire ? 'Regim de întărire a postului.' : 'Regim proporțional cu puterea aprobată.'}
        Schemă orientativă; lista de utilizatori și calculele de mai jos sunt determinante.</p>
      ${chunks.map(function (offset, index) {
        return html`<figure class="station-report-block" key=${offset}>
          <figcaption>${s.nume} · partea ${index + 1}/${chunks.length}. Transformatorul și echipamentele se repetă doar pentru orientare.</figcaption>
          <${StationDiagram} s=${s} users=${us.slice(offset, offset + 6)} />
        </figure>`;
      })}
      <table class="grid station-report-table"><caption>Utilizatori racordați — ${s.nume}</caption>
        <thead><tr><th scope="col">Utilizator</th><th scope="col">Rol</th><th scope="col">Putere aprobată</th><th scope="col">Participare la calcul</th></tr></thead>
        <tbody>${us.map(function (u) {
          var excluded = ignored.indexOf(u.id) >= 0 && newUsers.indexOf(u.id) < 0 && u.id !== S.primId(store.state);
          return html`<tr key=${u.id}><td>${code(u.id)} — ${name(u.id)}${u.codPA ? ' · PA ' + u.codPA : ''}</td>
            <td>${V.ROL_LABEL[u.rol]}</td><td>${K.money(u.putere)} kVA</td>
            <td>${excluded ? 'Exclus prin regimul tranzitoriu' : 'Participant'}</td></tr>`;
        })}</tbody>
      </table>
      ${s.utilizatori.indexOf(S.primId(store.state)) < 0 ? html`<p>Finanțatorul ${name(S.primId(store.state))} nu este racordat aici,
        dar primește compensația pentru transformator conform modelului de calcul.</p>` : null}
      ${store.state.utilizatori.filter(function (u) { return newUsers.indexOf(u.id) >= 0 && s.utilizatori.indexOf(u.id) >= 0; }).map(function (u) {
        return html`<${Explanation} s=${s} user=${u} result=${result} report=${true} key=${u.id} />`;
      })}
    </section>`;
  }

  V.StationScheme = StationScheme;
  V.StationReport = StationReport;
  V.CommitInput = CommitInput;
})(window);
