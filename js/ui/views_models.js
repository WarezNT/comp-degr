/* Scheme pentru Anexele 3–5; calculele rămân exclusiv în AppCalc / CompEngine. */
(function (global) {
  'use strict';
  var K = global.AppKit, html = K.html, store = K.store, C = global.AppCalc, S = global.AppState, V = global.AppViews;
  var useState = global.preactHooks.useState;

  function ModelMode(props) {
    return html`<div class="toolbar scheme-mode" role="group" aria-label="Mod de introducere model">
      <button type="button" class="btn tiny" aria-pressed=${!props.value} onClick=${function () { props.onChange(false); }}>Formular / tabel</button>
      <button type="button" class="btn tiny" aria-pressed=${!!props.value} onClick=${function () { props.onChange(true); }}>Schemă</button>
    </div>`;
  }
  function field(path, label, numeric) {
    return html`<label class="model-field">${label}<${V.CommitInput} key=${path} path=${path} label=${label} numeric=${numeric !== false} /></label>`;
  }
  function Status(props) {
    var r = props.result;
    if (r.error) return html`<section class="model-calculation-status" role="alert">
      <h3>${r.blocked ? 'Calcul blocat: condițiile nu sunt îndeplinite.' : 'Date de corectat înainte de calcul'}</h3>
      <p class="warn">${r.error}</p>
    </section>`;
    return html`<div class="model-calculation-status">
      ${(r.conditions || []).some(function (c) { return !c.ok; }) ? html`<p class="warn"><strong>INFORMATIV — condițiile nu sunt îndeplinite; sumele nu sunt datorate.</strong></p>` : null}
      ${(r.warnings || []).map(function (w) { return html`<p class="warn">${w.text}</p>`; })}
    </div>`;
  }
  function SelectBox(props) {
    var body = html`<strong>${props.title}</strong><span>${props.text}</span>`;
    return props.onSelect ? html`<button type="button" class=${'model-node' + (props.active ? ' model-node-selected' : '') + (props.paid ? ' model-node-paid' : '')}
      aria-pressed=${!!props.active} onClick=${props.onSelect}>${body}</button>`
      : html`<div class=${'model-node' + (props.paid ? ' model-node-paid' : '')}>${body}</div>`;
  }
  function Formula(props) {
    var e = props.item;
    return html`<span>${e.tip === 'transformator' || e.tip === 'intarire'
      ? html`${K.money(e.putere)} kVA × ${K.money(e.bT)} lei/kVA`
      : html`${K.money(e.cost)} / ${e.inainte} − ${K.money(e.cost)} / ${e.dupa}`}
      = <strong>${K.money(e.suma)} lei</strong> · ${global.AppRules.label(e.rule)}</span>`;
  }

  function complexParts() {
    var p = store.state, c = p.complexConfig, variant = Number(c.varianta);
    function order(part) { return part.kind === 'station' ? 1 : part.role === 'l_U1' ? 0 : part.role === 'l_U2' ? 2 : 3; }
    return p.linii.map(function (l) {
      var u1 = c.liniiIds.indexOf(l.id) >= 0, u2 = c.liniiU2Ids.indexOf(l.id) >= 0;
      return { id: 'line:' + l.id, entity: l, kind: 'line', role: u1 ? 'l_U1' : u2 ? 'l_U2' : 'Neinclusă',
        active: u1 || (u2 && variant === 4) };
    }).concat(p.statii.map(function (s) {
      return { id: 'station:' + s.id, entity: s, kind: 'station',
        role: variant === 2 ? 'Doar echipamente comune' : 'Transformator + echipamente',
        active: c.statiiIds.indexOf(s.id) >= 0 && variant >= 2 };
    })).sort(function (a, b) { return order(a) - order(b); });
  }
  function partItems(result, part, uid) {
    if (result.error || !part.active) return [];
    return (result.explicatii || []).filter(function (e) {
      return (!uid || e.de === uid) && (part.kind === 'line' ? e.lineId === part.entity.id : e.stationId === part.entity.id);
    });
  }
  function sumItems(items) { return items.reduce(function (sum, e) { return sum + e.suma; }, 0); }
  function ComplexMap(props) {
    var parts = props.parts, result = props.result;
    return html`<div class="complex-map" aria-label="Componentele instalației complexe">
      <div class="model-origin">PR → l_U1 → stație / PT → l_U2</div>
      <p class="hint">Varianta ${store.state.complexConfig.varianta}. Componentele inactive rămân în proiect, dar nu contribuie la calcul.
        Fiecare linie și stație este afișată separat; nu este o schemă la scară.</p>
      <div class="model-nodes">${parts.map(function (part) {
        var amount = sumItems(partItems(result, part, props.userId));
        return html`<div key=${part.id} data-component-id=${part.id} class=${'complex-part' + (part.active ? '' : ' complex-part-inactive')}>
          <${SelectBox} title=${part.entity.nume || part.entity.id} active=${props.selected === part.id}
            text=${part.role + ' · ' + (part.active ? 'Activă în această variantă' : 'Inactivă în această variantă') +
              (!result.error && part.active ? ' · ' + (props.userId ? 'Comp. ' : 'Total comp. ') + K.money(amount) + ' lei' : '')}
            paid=${amount > 0} onSelect=${props.onSelect ? function () { props.onSelect(part.id); } : null} />
        </div>`;
      })}</div>
      <p class="hint">Contur roșu: componentă cu plată; fundal albastru: componenta selectată.
        Sumele sunt fără TVA${props.userId ? ', pentru utilizatorul analizat.' : ', pentru toți utilizatorii noi.'}</p>
    </div>`;
  }
  function ComplexPayments(props) {
    var result = props.result, parts = props.parts, uid = props.userId;
    if (result.error || !uid) return null;
    var entries = (result.explicatii || []).filter(function (e) { return e.de === uid; });
    return html`<section class="complex-compensation">
      <h3>Compensația pentru ${C.nameOf(store.state, uid)}</h3>
      <p class="model-total">Total proiect: <strong>${K.money(result.central.perNou[uid] ? result.central.perNou[uid].faraTVA : 0)} lei fără TVA</strong></p>
      ${parts.filter(function (part) { return part.active; }).map(function (part) {
        var items = partItems(result, part, uid);
        return html`<section class="complex-contribution" key=${part.id}>
          <h4>${props.onSelect ? html`<button type="button" class="linkish" onClick=${function () { props.onSelect(part.id); }}>${part.entity.nume}</button>` : part.entity.nume}
            — ${K.money(sumItems(items))} lei</h4>
          ${items.length ? html`<ul>${items.map(function (e) {
            return html`<li>${e.sursa} · către ${C.nameOf(store.state, e.catre)}: <${Formula} item=${e} /></li>`;
          })}</ul>` : html`<p>Fără compensații pe această componentă pentru utilizatorul selectat.</p>`}
        </section>`;
      })}
      ${!entries.length ? html`<p>Utilizatorul nu are compensații de plată în această variantă.</p>` : null}
      <p class="hint">Sumele se însumează pe componente; centralizatorul rotunjește totalurile cumulate pe beneficiar.
        Factorii din formule sunt afișați rotunjit, dar motorul păstrează precizia completă.</p>
    </section>`;
  }
  function EquipmentInspector(props) {
    var s = props.s;
    return html`<section class="model-inspector"><h3>${s.nume} — varianta 2</h3>
      <p>În această variantă se compensează numai echipamentele comune, nu transformatorul.
        Racordările sunt comune cu celelalte variante; modificarea lor se păstrează la schimbarea variantei.</p>
      ${!props.embedded ? field('stat.' + s.id + '.nume', 'Denumire stație / PT', false) : null}
      ${field('stat.' + s.id + '.elementeComune', 'Cost echipamente comune (lei)')}
      <div class="list-chk" data-guide=${'alloc:' + s.id}>${store.state.utilizatori.map(function (u) {
        return html`<label class="chk" key=${u.id}><input type="checkbox" checked=${s.utilizatori.indexOf(u.id) >= 0}
          data-guide=${'cell:' + s.id + ':' + u.id}
          aria-label=${'Racordat la echipamente — ' + C.nameOf(store.state, u.id)}
          onChange=${function () { store.toggleStationUser(s.id, u.id); }} />${C.nameOf(store.state, u.id)}</label>`;
      })}</div>
      ${!props.embedded ? html`<button type="button" class="btn tiny danger" onClick=${function () {
        if (global.confirm('Ștergi stația „' + s.nume + '”? Poți anula.')) store.delStation(s.id);
      }}>Șterge stația</button>` : null}
    </section>`;
  }
  function ComplexWorkspace() {
    var selection = useState(''), user = useState(''), parts = complexParts();
    var selected = parts.filter(function (part) { return part.id === selection[0]; })[0];
    var result = C.runCalculation(store.state), c = store.state.complexConfig, newIds = S.newIds(store.state);
    var uid = newIds.indexOf(user[0]) >= 0 ? user[0] : '';
    K.useRevealTarget(function (key) {
      var part = parts.filter(function (item) {
        var id = item.entity.id;
        return item.kind === 'station' ? key.indexOf('stat.' + id + '.') === 0 || key.indexOf('cell:' + id + ':') === 0 || key === 'alloc:' + id
          : ['line.' + id + '.', 'tronson.' + id + '.', 'pr.' + id + '.', 'zona.' + id + '.', 'dist:' + id + ':', 'cell:' + id + ':'].some(function (prefix) {
            return key.indexOf(prefix) === 0;
          }) || key === 'role:' + id || key === 'tree:' + id || key === 'btn:add-tronson:' + id;
      })[0];
      if (part) selection[1](part.id);
    });
    return html`<section class="complex-workspace">
      <div class="toolbar">
        <label>Utilizator nou analizat<select aria-label="Utilizator nou analizat" value=${uid} onChange=${function (e) { user[1](e.target.value); }}>
          <option value="">Selectează utilizator</option>${newIds.map(function (id) {
            return html`<option value=${id} key=${id}>${C.nameOf(store.state, id)}</option>`;
          })}
        </select></label>
        <button type="button" class="btn tiny" data-guide="btn:add-line" onClick=${function () { store.addLine('u1'); }}>+ Linie l_U1</button>
        <button type="button" class="btn tiny" data-guide="btn:add-line-u2" onClick=${function () { store.addLine('u2'); }}>+ Linie l_U2</button>
        <button type="button" class="btn tiny" data-guide="btn:add-stat" onClick=${store.addStation}>+ Stație / PT</button>
      </div>
      <${Status} result=${result} />
      <${ComplexMap} parts=${parts} result=${result} userId=${uid} selected=${selection[0]} onSelect=${selection[1]} />
      <${ComplexPayments} parts=${parts} result=${result} userId=${uid} onSelect=${selection[1]} />
      ${selected ? html`<section class="complex-inspector" key=${selected.id}>
        <h3>Inspector componentă — ${selected.entity.nume}</h3>
        ${!selected.active ? html`<p class="hint">Componentă inactivă în varianta curentă: datele se pot edita, dar nu se adaugă compensații în calcul.</p>` : null}
        ${selected.kind === 'line' ? html`<${V.LineCard} l=${selected.entity} initialScheme=${true} />`
          : Number(c.varianta) === 2 ? html`<label class="chk"><input type="checkbox" aria-label="Stație inclusă în instalația complexă"
            checked=${c.statiiIds.indexOf(selected.entity.id) >= 0}
            onChange=${function (e) { store.setStationIncluded(selected.entity.id, e.target.checked); }} />
            Stație inclusă în instalația complexă</label>
            <${EquipmentInspector} s=${selected.entity} />`
            : html`<${V.StationCard} s=${selected.entity} initialScheme=${true} />`}
      </section>` : html`<p class="hint">Selectează o componentă pentru inspector. Selectarea nu modifică proiectul.</p>`}
    </section>`;
  }

  function TransitionalDiagram(props) {
    var t = store.state.tranzitoriu, r = props.result, valid = !r.error;
    return html`<section class="transitional-diagram" aria-label="Schema de calcul Anexa 4">
      <div class="model-nodes">
        <${SelectBox} title="Investiție și capacitate" text=${'B = ' + K.money(t.B) + ' lei · S = ' + K.money(t.S) + ' kVA'}
          active=${props.selected === 'base'} onSelect=${props.onSelect ? function () { props.onSelect('base'); } : null} />
        <div class="model-arrow" aria-hidden="true">→</div>
        <${SelectBox} title="Utilizator nou" text=${'S₂ = ' + K.money(t.S2) + ' kVA'}
          active=${props.selected === 'user'} onSelect=${props.onSelect ? function () { props.onSelect('user'); } : null} />
        <div class="model-arrow" aria-hidden="true">→</div>
        <${SelectBox} title="Traseu folosit" text=${'l₂ = ' + K.money(t.l2) + ' m din L = ' + K.money(t.L) + ' m'}
          active=${props.selected === 'length'} onSelect=${props.onSelect ? function () { props.onSelect('length'); } : null} />
      </div>
      ${valid ? html`<div class="model-ratio" role="img" aria-label=${'Lungime folosită ' + K.money(t.l2) + ' din ' + K.money(t.L) + ' metri'}>
        <span class="model-used" style=${{ width: Number(t.l2) / Number(t.L) * 100 + '%' }}></span></div>
        <p>Porțiunea albastră reprezintă lungimea folosită: ${K.money(Number(t.l2) / Number(t.L) * 100)}% din L.
          Nu reprezintă o poziție topografică și nu adaugă ramuri.</p>
        <section class="model-formula"><h3>Explicația compensației</h3>
          <p>b = B / S = ${K.money(t.B)} / ${K.money(t.S)} = <strong>${K.money(r.b)} lei/kVA</strong></p>
          <p>C₂ = S₂ × b × (l₂ / L) = ${K.money(t.S2)} × ${K.money(r.b)} × (${K.money(t.l2)} / ${K.money(t.L)})</p>
          <p class="model-total">C₂ = <strong>${K.money(r.C2)} lei</strong></p>
          <p class="hint">Motorul păstrează precizia completă; factorii afișați sunt rotunjiți.
            Anexa 4 pct. A folosește vechea metodologie. Pct. B se tratează prin regulile tranzitorii ale Anexelor 1–3.</p>
        </section>` : null}
    </section>`;
  }
  function TransitionalScheme() {
    var selection = useState('base'), result = C.runCalculation(store.state);
    K.useRevealTarget(function (key) {
      if (key.indexOf('tranz.') === 0) selection[1](key === 'tranz.S2' ? 'user' : key === 'tranz.L' || key === 'tranz.l2' ? 'length' : 'base');
    });
    return html`<section class="transitional-scheme">
      <${Status} result=${result} />
      <${TransitionalDiagram} result=${result} selected=${selection[0]} onSelect=${selection[1]} />
      <section class="model-inspector" key=${selection[0]}><h3>Inspector — ${selection[0] === 'base' ? 'investiție și capacitate' : selection[0] === 'user' ? 'utilizator nou' : 'lungimi'}</h3>
        <div class="row2">${selection[0] === 'base'
          ? html`${field('tranz.B', 'Componenta B din tariful de racordare (lei)')}${field('tranz.S', 'Capacitatea instalației S (kVA)')}`
          : selection[0] === 'user' ? field('tranz.S2', 'Puterea noului utilizator S₂ (kVA)')
            : html`${field('tranz.l2', 'Lungimea folosită l₂ (m)')}${field('tranz.L', 'Lungimea totală L (m)')}`}</div>
        <p class="hint">Confirmă cu Tab/Enter; Escape renunță la textul neconfirmat. Modificările se pot anula.</p>
      </section>
    </section>`;
  }

  function DeveloperDiagram(props) {
    var d = store.state.dezvoltator, result = props.result, rows = !result.error ? result.rows : [];
    var list = props.list || d.dezvoltatori;
    return html`<section class="developer-diagram">
      <${SelectBox} title="Investiția rețelei" text=${'I_total = ' + K.money(d.Itotal) + ' lei · I_ef = ' + K.money(d.Ief) + ' lei'}
        active=${props.selected === null} onSelect=${props.onSelect ? function () { props.onSelect(null); } : null} />
      ${!result.error ? html`<div class="model-ratio developer-ratio" role="img"
        aria-label=${'Eficient ' + K.money(result.Xef * 100) + '%, ineficient ' + K.money(result.Xinef * 100) + '%'}>
        <span class="model-efficient" style=${{ width: result.Xef * 100 + '%' }}></span>
        <span class="model-inefficient" style=${{ width: result.Xinef * 100 + '%' }}></span>
      </div><p>Eficient: ${K.money(result.Xef * 100)}% (${K.money(result.Ief)} lei).
        Ineficient de repartizat: ${K.money(result.Xinef * 100)}% (${K.money(result.Itotal - result.Ief)} lei).</p>` : null}
      <div class="developer-nodes">${list.map(function (x) {
        var row = rows.filter(function (r) { return r.id === x.id; })[0];
        var powerTotal = rows.reduce(function (sum, r) { return sum + r.putere; }, 0);
        return html`<div class="developer-node" key=${x.id}>
          <${SelectBox} title=${x.nume || x.id} text=${K.money(x.putere) + ' kVA' + (row ? ' · Cotă: ' + K.money(row.suma) + ' lei' : '')}
            active=${props.selected === x.id} onSelect=${props.onSelect ? function () { props.onSelect(x.id); } : null} />
          ${row ? html`<div class="developer-power" role="img" aria-label=${'Pondere în puterea totală ' + K.money(row.putere / powerTotal * 100) + '%'}>
            <span style=${{ width: row.putere / powerTotal * 100 + '%' }}></span></div>
            <p>${K.money(row.putere / powerTotal * 100)}% din puterea totală · ${K.money(row.Xinef * 100)}% din investiția totală.</p>` : null}
        </div>`;
      })}</div>
    </section>`;
  }
  function DeveloperFormula(props) {
    var r = props.result, rows = props.rows || r.rows;
    if (r.error) return null;
    var power = r.rows.reduce(function (sum, row) { return sum + row.putere; }, 0);
    return html`<section class="developer-formulas">
      <h3>Repartizarea componentei ineficiente</h3>
      <p>X_ef = ${K.money(r.Ief)} / ${K.money(r.Itotal)} = ${K.money(r.Xef * 100)}%;
        X_inef = 1 − X_ef = ${K.money(r.Xinef * 100)}%.</p>
      <p>Putere totală: ${K.money(power)} kVA. Componentă de repartizat:
        ${K.money(r.Itotal)} − ${K.money(r.Ief)} = <strong>${K.money(r.Itotal - r.Ief)} lei</strong>.</p>
      <ul>${rows.map(function (row) {
        return html`<li key=${row.id}><strong>${row.nume}</strong>:
          (I_total − I_ef) × P_D / P_total =
          (${K.money(r.Itotal)} − ${K.money(r.Ief)}) × ${K.money(row.putere)} / ${K.money(power)}
          = <strong>${K.money(row.suma)} lei</strong>.</li>`;
      })}</ul>
      <p class="hint">Cotele se repartizează după putere, nu după ordinea din desen. Procentele și sumele afișate sunt rotunjite;
        suma valorilor afișate poate diferi cu un ban de componenta ineficientă.
        I_ef se introduce din analiza economică; aplicația nu determină automat eficiența economică.</p>
    </section>`;
  }
  function DeveloperScheme() {
    var selection = useState(null), d = store.state.dezvoltator, result = C.runCalculation(store.state);
    var selected = d.dezvoltatori.filter(function (x) { return x.id === selection[0]; })[0];
    K.useRevealTarget(function (key) {
      if (key.indexOf('dev.') === 0) selection[1](null);
      if (key.indexOf('devitem.') === 0) selection[1](key.split('.')[1]);
    });
    return html`<section class="developer-scheme">
      <div class="toolbar"><button type="button" class="btn tiny" data-guide="btn:add-dev" onClick=${function () {
        store.addDev(); selection[1](store.state.dezvoltator.dezvoltatori.slice(-1)[0].id);
      }}>+ Adaugă dezvoltator</button></div>
      <${Status} result=${result} />
      <${DeveloperDiagram} result=${result} selected=${selected ? selected.id : null} onSelect=${selection[1]} />
      <section class="model-inspector" key=${selected ? 'developer:' + selected.id : 'investment'}>
        <h3>Inspector — ${selected ? selected.nume : 'investiția rețelei'}</h3>
        <div class="row2">${selected
          ? html`${field('devitem.' + selected.id + '.nume', 'Denumire dezvoltator', false)}
            ${field('devitem.' + selected.id + '.putere', 'Putere aprobată dezvoltator (kVA)')}`
          : html`${field('dev.Itotal', 'Valoarea totală a investiției I_total (lei)')}${field('dev.Ief', 'Cota de eficiență I_ef (lei)')}`}</div>
        ${selected ? html`<button type="button" class="btn tiny danger" onClick=${function () {
          if (global.confirm('Ștergi dezvoltatorul „' + selected.nume + '”? Cotele celorlalți se vor redistribui. Poți anula.')) {
            store.delDev(selected.id); selection[1](null);
          }
        }}>Șterge dezvoltatorul</button>` : null}
      </section>
      <${DeveloperFormula} result=${result} rows=${selected && !result.error ? result.rows.filter(function (r) { return r.id === selected.id; }) : undefined} />
    </section>`;
  }

  function ComplexReport(props) {
    var parts = complexParts(), result = props.result, active = parts.filter(function (part) { return part.active; });
    var ignored = S.tranzitoriu(store.state).ignorati, newIds = S.newIds(store.state);
    return html`<section class="complex-report">
      <h3>Instalație complexă — Anexa 3, varianta ${result.varianta}</h3>
      <${ComplexMap} parts=${parts} result=${result} />
      <${Status} result=${result} />
      ${S.newIds(store.state).map(function (id) {
        return html`<${ComplexPayments} parts=${parts} result=${result} userId=${id} key=${id} />`;
      })}
      ${active.map(function (part) {
        if (part.kind === 'line') return html`<${V.LineReport} l=${part.entity} key=${part.id} />`;
        if (result.varianta >= 3) return html`<${V.StationReport} s=${part.entity} result=${result} key=${part.id} />`;
        return html`<section class="complex-equipment-report" key=${part.id}>
          <h3>${part.entity.nume} — numai echipamente comune</h3>
          <p>Cost ${K.money(part.entity.elementeComune)} lei; transformatorul este exclus din varianta 2.</p>
          <p>Racordări fizice și participare la repartizarea echipamentelor:</p>
          <ul>${part.entity.utilizatori.map(function (id) {
            var excluded = ignored.indexOf(id) >= 0 && newIds.indexOf(id) < 0 && id !== S.primId(store.state);
            return html`<li key=${id}>${C.nameOf(store.state, id)} — ${excluded ? 'Exclus prin regimul tranzitoriu' : 'Participant'}</li>`;
          })}</ul>
        </section>`;
      })}
    </section>`;
  }
  function ModelReport(props) {
    var r = props.result;
    if (r.model === 'complex') return html`<${ComplexReport} result=${r} />`;
    if (r.model === 'transitional') return html`<section class="transitional-report">
      <h3>Anexa 4 pct. A — schemă și explicații</h3><${Status} result=${r} /><${TransitionalDiagram} result=${r} />
    </section>`;
    if (r.model !== 'developer') return null;
    var list = store.state.dezvoltator.dezvoltatori, offsets = [0];
    for (var i = 6; i < list.length; i += 6) offsets.push(i);
    return html`<section class="developer-report"><h3>Anexa 5 — repartiția investiției</h3>
      <${Status} result=${r} />
      ${offsets.map(function (offset, index) {
        return html`<section class="developer-report-block" key=${offset}>
          <h4>Dezvoltatori — partea ${index + 1}/${offsets.length}</h4>
          <${DeveloperDiagram} result=${r} list=${list.slice(offset, offset + 6)} />
        </section>`;
      })}
      <${DeveloperFormula} result=${r} />
    </section>`;
  }

  V.ModelMode = ModelMode;
  V.ComplexWorkspace = ComplexWorkspace;
  V.TransitionalScheme = TransitionalScheme;
  V.DeveloperScheme = DeveloperScheme;
  V.ModelReport = ModelReport;
  V.EquipmentInspector = EquipmentInspector;
})(window);
