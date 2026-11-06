/* Editor radial Anexa 1. Geometria SVG este orientativă; distanțele sunt locale. */
(function (global) {
  'use strict';
  var K = global.AppKit, html = K.html, store = K.store, C = global.AppCalc, V = global.AppViews;
  var useState = global.preactHooks.useState, useRef = global.preactHooks.useRef;
  function userName(id) { return C.nameOf(store.state, id); }
  function branchName(l, id) {
    var b = (l.ramuri || []).filter(function (x) { return x.id === id; })[0];
    return b ? b.nume : 'Ramură inexistentă';
  }
  function userCode(id) {
    return 'U' + (store.state.utilizatori.map(function (u) { return u.id; }).indexOf(id) + 1);
  }

  function Draft(props) {
    var pending = useRef(null);
    var value = pending.current !== null ? pending.current : String(props.value == null ? '' : props.value);
    function commit(e) {
      var text = e.target.value;
      if (text === String(props.value == null ? '' : props.value)) { pending.current = null; return; }
      var next = props.numeric ? text.trim().replace(',', '.') : text;
      if (props.onCommit(next) === false) {
        e.target.value = props.value == null ? '' : props.value;
      }
      pending.current = null;
    }
    return html`<input type="text" inputmode=${props.numeric ? 'decimal' : undefined}
      aria-label=${props.label} value=${value}
      onInput=${function (e) { pending.current = e.target.value; }}
      onBlur=${commit} onKeyDown=${function (e) { if (e.key === 'Enter') e.target.blur(); }} />`;
  }

  function TreeDiagram(props) {
    var l = props.l, tree = global.AppTree.analyze(l);
    if (tree.errors.length) return html`<p class="warn">${tree.errors.join(' ')}</p>`;
    var rows = [], y = 55, starts = Object.create(null), ys = Object.create(null), max = 1;
    function walk(b, start) {
      starts[b.id] = start; ys[b.id] = y;
      rows.push(b);
      var recs = l.racordari.filter(function (r) { return r.branchId === b.id; });
      y += 100 + recs.length * 28;
      max = Math.max(max, start + Number(b.L));
      l.ramuri.filter(function (child) { return child.parentId === b.id; })
        .forEach(function (child) { walk(child, start + Number(child.deLa)); });
    }
    if (props.branchOnly) {
      var only = tree.byId[props.branchOnly];
      starts[only.id] = 0; ys[only.id] = 55;
      rows = [only];
      max = Number(only.L);
      y = 120 + Math.min(6, l.racordari.filter(function (r) { return r.branchId === only.id; }).length - (props.userOffset || 0)) * 28;
    } else walk(tree.roots[0], 0);
    function x(b, d) { return 215 + (starts[b.id] + Number(d)) / max * 680; }
    function pick(e, b, t) {
      if (!props.onPick) return;
      var distance = (Number(t.deLa) + Number(t.panaLa)) / 2;
      if (e.type === 'click') {
        var svg = e.currentTarget.ownerSVGElement, ctm = svg.getScreenCTM();
        if (ctm) {
          var point = svg.createSVGPoint(); point.x = e.clientX; point.y = e.clientY;
          var local = point.matrixTransform(ctm.inverse());
          distance = Math.max(0, Math.min(Number(b.L), (local.x - 215) * max / 680 - starts[b.id]));
        }
      }
      props.onPick(b.id, t.id, Math.round(distance * 100) / 100);
    }
    return html`<div class="tree-diagram-wrap"><svg class="tree-diagram" viewBox=${'0 0 980 ' + y}
      role="group" aria-label=${'Rețea ramificată — ' + l.nume}>
      ${rows.map(function (b) {
        var by = ys[b.id], bx = x(b, 0), recs = l.racordari.filter(function (r) { return r.branchId === b.id; });
        if (props.branchOnly) recs = recs.slice(props.userOffset || 0, (props.userOffset || 0) + 6);
        var branchTotal = (l.tronsoane || []).filter(function (t) { return t.branchId === b.id; })
          .reduce(function (sum, t) { return sum + (props.contributions && props.contributions[t.id] ? props.contributions[t.id].total : 0); }, 0);
        var onRoute = tree.routes.some(function (r) {
          return r.userId === props.userId && r.path.some(function (part) { return part.branchId === b.id; });
        });
        return html`<g key=${b.id}>
          ${b.parentId && !props.branchOnly ? html`<line class=${'tree-connector' + (onRoute ? ' tree-route' : '')} x1=${bx} x2=${bx} y1=${ys[b.parentId]} y2=${by} />
            <circle class="tree-junction" cx=${bx} cy=${ys[b.parentId]} r="5" />` : null}
          <text class="tree-branch-label" x="8" y=${by + 4}>${b.nume}</text>
          ${!b.parentId ? html`<${V.PRSymbol} x=${195} y=${by} data=${l.punctRacordare} />` : null}
          ${branchTotal > 0 ? html`<text class="tree-payment-label" x="8" y=${by + 25}>Comp. ${K.money(branchTotal)} lei</text>` : null}
          <text x="215" y=${by - 25}>${b.parentId ? 'Din ' + branchName(l, b.parentId) + ' la ' + b.deLa + ' m' : 'PR · ' + ((l.punctRacordare || {}).denumire || 'originea rețelei')}</text>
          ${(l.tronsoane || []).filter(function (t) { return t.branchId === b.id; }).map(function (t) {
            var paid = props.contributions && props.contributions[t.id];
            var route = props.userId && t.utilizatori.indexOf(props.userId) >= 0;
            var cls = 'tree-segment tip-' + (t.tipLinie || 'nespecificat') + (route ? ' tree-route' : '') + (paid ? ' tree-payment' : '') + (props.segmentId === t.id ? ' tree-selected' : '');
            return html`<g key=${t.id}>
              <line class=${cls} stroke-dasharray=${t.tipLinie === 'LEA' || t.tipLinie === 'LES' ? undefined : '2 5'}
                x1=${x(b, t.deLa)} x2=${x(b, t.panaLa)} y1=${by} y2=${by} />
              <line class="tree-hit" role=${props.onPick ? 'button' : undefined} tabindex=${props.onPick ? '0' : undefined}
                aria-label=${t.nume + (paid ? ' · Comp. ' + K.money(paid.total) + ' lei' : '')}
                x1=${x(b, t.deLa)} x2=${x(b, t.panaLa)} y1=${by} y2=${by}
                onClick=${function (e) { pick(e, b, t); }}
                onKeyDown=${function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e, b, t); } }}>
                <title>${t.nume} · ${K.money(t.cost)} lei${paid ? ' · Comp. ' + K.money(paid.total) + ' lei' : ''}</title>
              </line>
            </g>`;
          })}
          ${(l.zoneTehnice || []).filter(function (z) { return z.branchId === b.id; }).map(function (z) {
            return html`<text class="tree-zone" x=${x(b, z.deLa)} y=${by + 5} text-anchor="middle" key=${z.id}>◆<title>${z.deLa} m · ${z.tipLinie || 'Nespecificat'}</title></text>`;
          })}
          <text x=${bx} y=${by + 20}>0 m</text>
          <text x=${x(b, b.L)} y=${by + 20} text-anchor="end">${b.L} m</text>
          ${recs.map(function (r, i) {
            var rx = x(b, r.distanta), ry = by + 48 + i * 28, left = rx > 650;
            return html`<g key=${r.userId} class=${'tree-user rol-' + ((global.AppState.findUser(store.state, r.userId) || {}).rol || '')}>
              <line x1=${rx} x2=${rx} y1=${by} y2=${ry - 8} />
              <circle cx=${rx} cy=${ry} r="7" />
              <text x=${rx + (left ? -12 : 12)} y=${ry + 4} text-anchor=${left ? 'end' : 'start'}>${userCode(r.userId)} · ${r.distanta} m</text>
            </g>`;
          })}
        </g>`;
      })}
    </svg></div>`;
  }

  function SegmentTable(props) {
    var l = props.l, segments = (l.tronsoane || []).filter(function (t) { return !props.branchId || t.branchId === props.branchId; });
    return html`<table class="grid line-report-table tree-segments">
      <caption>Tronsoane fizice și alocări — ${props.branchId ? branchName(l, props.branchId) : l.nume}</caption>
      <thead><tr><th scope="col">Tronson / interval local</th><th scope="col">Caracteristici</th><th scope="col">Lungime / cost</th><th scope="col">Utilizatori</th></tr></thead>
      <tbody>${segments.map(function (t) {
        return html`<tr key=${t.id} class=${props.segmentId === t.id ? 'tree-selected-row' : ''}>
          <td>${props.onSelect ? html`<button type="button" class="linkish" onClick=${function () { props.onSelect(t.id); }}>${t.nume}</button>` : t.nume}</td>
          <td>${[t.tipLinie || 'Nespecificat', t.conductor, t.sectiune ? t.sectiune + ' mm²' : '', t.observatii].filter(Boolean).join(' · ')}</td>
          <td>${t.lungime} m / ${K.money(C.tronsonCost(l, t))} lei</td>
          <td>${t.utilizatori.map(userName).join(', ') || 'Neutilizat'}</td>
        </tr>`;
      })}</tbody></table>`;
  }

  function Technical(props) {
    var value = props.value;
    return html`<div class="row2 technical-fields">
      <${K.MaterialSelect} onSelect=${props.setMaterial} />
      <label>Tip linie<select aria-label="Tip linie ramură / zonă" value=${value.tipLinie || ''}
        onChange=${function (e) { if (props.set('tipLinie', e.target.value) === false) e.target.value = value.tipLinie || ''; }}>
        <option value="">Nespecificat</option><option value="LEA">LEA — aeriană</option>
        <option value="LES">LES — subterană</option><option value="altul">Altul</option>
      </select></label>
      ${[['conductor', 'Conductor / cablu'], ['sectiune', 'Secțiune (mm²)'], ['observatii', 'Observații']].map(function (field) {
        return html`<label key=${field[0]}>${field[1]}<${Draft} value=${value[field[0]]} label=${field[1]}
          onCommit=${function (v) { return props.set(field[0], v); }} /></label>`;
      })}
    </div>`;
  }

  function TreeEditor(props) {
    var l = props.l, bs = useState(''), us = useState(''), ss = useState(''), tool = useState('inspect');
    var tree = global.AppTree.analyze(l), b = tree.byId[bs[0]] || l.ramuri[0], uid = us[0];
    var rec = l.racordari.filter(function (r) { return r.userId === uid; })[0];
    var selectedUser = global.AppState.findUser(store.state, uid);
    var segment = (l.tronsoane || []).filter(function (t) { return t.id === ss[0]; })[0];
    var result = selectedUser && global.AppState.newIds(store.state).indexOf(uid) >= 0 ? C.runCalculation(store.state) : null;
    var contributions = Object.create(null);
    if (result && !result.error) {
      (result.explicatii || []).forEach(function (item) {
        if (item.de !== uid || item.lineId !== l.id || !(item.suma > 0)) return;
        if (!contributions[item.tronsonId]) contributions[item.tronsonId] = { total: 0, items: [] };
        contributions[item.tronsonId].total += item.suma;
        contributions[item.tronsonId].items.push(item);
      });
    }
    function edit(fn) { return store.editTree(l.id, fn); }
    function setBranch(field, value) {
      return edit(function (next) { next.ramuri.filter(function (x) { return x.id === b.id; })[0][field] = value; });
    }
    function setBranchMaterial(material) {
      return edit(function (next) {
        var branch = next.ramuri.filter(function (x) { return x.id === b.id; })[0];
        branch.tipLinie = material.tipLinie;
        branch.conductor = material.conductor;
        branch.sectiune = material.sectiune;
      });
    }
    function connect(branchId, distance) {
      return edit(function (next) {
        next.racordari = next.racordari.filter(function (r) { return r.userId !== uid; });
        if (branchId) next.racordari.push({ userId: uid, branchId: branchId, distanta: distance });
      });
    }
    function selectSegment(id) {
      tool[1]('inspect');
      ss[1](id);
      var t = (l.tronsoane || []).filter(function (x) { return x.id === id; })[0];
      if (t && t.branchId) bs[1](t.branchId);
    }
    return html`<section class="tree-editor" data-guide=${'tree:' + l.id}>
      <h3>Rețea cu ramuri și subramuri</h3>
      <p class="hint">Fără bucle. Fiecare ramură se desprinde dintr-un punct al părintelui său.
        Distanțele se măsoară de la începutul ramurii; tronsoanele comune sunt numărate o singură dată.
        Adăugarea unei ramuri redistribuie aceeași investiție totală I_L. Ajustează I_L dacă investiția crește.</p>
      ${tree.errors.length ? html`<div class="warn" role="alert">${tree.errors.map(function (text) { return html`<p>${text}</p>`; })}</div>` : null}
      <div class="toolbar">
        <label>Utilizator<select aria-label="Utilizator rețea" value=${uid} onChange=${function (e) { us[1](e.target.value); }}>
          <option value="">Selectează utilizator</option>${store.state.utilizatori.map(function (u) {
            return html`<option value=${u.id} key=${u.id}>${userCode(u.id)} — ${userName(u.id)}</option>`;
          })}
        </select></label>
        ${!props.hideDiagram ? html`<button type="button" class="btn tiny" aria-pressed=${tool[0] === 'inspect'} onClick=${function () { tool[1]('inspect'); }}>Inspectează</button>
          <button type="button" class="btn tiny" disabled=${!uid} aria-pressed=${tool[0] === 'place'}
            onClick=${function () { tool[1]('place'); }}>Racordează pe schemă</button>` : null}
      </div>
      ${!props.hideDiagram ? html`<${TreeDiagram} l=${l} userId=${uid} segmentId=${ss[0]} contributions=${contributions}
        onPick=${function (branchId, segmentId, distance) {
          bs[1](branchId); ss[1](segmentId);
          if (tool[0] === 'place' && uid) connect(branchId, distance);
        }} />
      <${V.LineLegend} />
      <p class="hint">Albastru = traseu folosit; roșu = tronson cu plată („Comp.” în eticheta accesibilă).
        Utilizatorii sunt identificați prin U1, U2 etc. Schema nu este la scară topografică.</p>` : null}
      ${uid ? html`<fieldset class="tree-connection"><legend>Racordare — ${userName(uid)}</legend>
        <div class="row2">
          <label>Ramura utilizatorului<select aria-label="Ramura utilizatorului" value=${rec ? rec.branchId : ''}
            onChange=${function (e) { if (!connect(e.target.value, 0)) e.target.value = rec ? rec.branchId : ''; }}>
            <option value="">Neracordat</option>${l.ramuri.map(function (x) { return html`<option value=${x.id} key=${x.id}>${x.nume}</option>`; })}
          </select></label>
          ${rec ? html`<label>Distanță locală (m)<${Draft} key=${uid + rec.branchId} label="Distanță locală utilizator (m)" value=${rec.distanta} numeric=${true}
            onCommit=${function (v) { return connect(rec.branchId, v); }} /></label>` : null}
        </div>
        <${K.InputNote} path="distanta" />
        ${rec ? html`<p>Lungime traseu de la PR: ${(tree.routes.filter(function (r) { return r.userId === uid; })[0] || {}).distance} m</p>
          <button type="button" class="btn tiny danger" onClick=${function () { connect('', 0); }}>Deconectează utilizatorul</button>` : null}
      </fieldset>` : null}
      <div class="toolbar" role="group" aria-label="Ramurile rețelei">${l.ramuri.map(function (x) {
        return html`<button type="button" class="btn tiny" key=${x.id} aria-pressed=${b && b.id === x.id}
          onClick=${function () { bs[1](x.id); }}>${x.nume}</button>`;
      })}</div>
      ${b ? html`<fieldset class="tree-branch" key=${b.id}><legend>Inspector ramură — ${b.nume}</legend>
        <div class="row2">
          <label>Denumire ramură<${Draft} label="Denumire ramură" value=${b.nume} onCommit=${function (v) { return setBranch('nume', v); }} /></label>
          <label>Lungime ramură (m)<${Draft} label="Lungime ramură (m)" value=${b.L} numeric=${true} onCommit=${function (v) { return setBranch('L', v); }} /></label>
          ${b.parentId ? html`<label>Ramură părinte<select aria-label="Ramură părinte" value=${b.parentId}
            onChange=${function (e) { if (!setBranch('parentId', e.target.value)) e.target.value = b.parentId; }}>
            ${l.ramuri.filter(function (x) { return x.id !== b.id; }).map(function (x) { return html`<option value=${x.id} key=${x.id}>${x.nume}</option>`; })}
          </select></label>
          <label>Desprindere din părinte (m)<${Draft} label="Desprindere din părinte (m)" value=${b.deLa} numeric=${true}
            onCommit=${function (v) { return setBranch('deLa', v); }} /></label>` : html`<p>Originea acestei ramuri este PR.</p>`}
          <label class="chk"><input type="checkbox" checked=${!!b.costManual} aria-label="Cost propriu ramură"
            onChange=${function (e) {
              var on = e.target.checked;
              var ok = edit(function (next) {
                var target = next.ramuri.filter(function (x) { return x.id === b.id; })[0];
                target.costManual = on;
                if (on) target.IL = Number(b.L) * tree.rate;
              });
              if (!ok) e.target.checked = !!b.costManual;
            }} />Cost propriu pentru întreaga ramură</label>
          ${b.costManual ? html`<label>Cost propriu ramură (lei)<${Draft} label="Cost propriu ramură (lei)" value=${b.IL} numeric=${true}
            onCommit=${function (v) { return setBranch('IL', v); }} /></label>` : html`<p>Cost automat: ${K.money(Number(b.L) * tree.rate)} lei</p>`}
        </div>
        <${K.InputNote} path=${'ramura.' + l.id + '.' + b.id + '.L'} />
        ${b.costManual ? html`<${K.InputNote} path=${'ramura.' + l.id + '.' + b.id + '.IL'} />` : null}
        <${Technical} value=${b} set=${setBranch} setMaterial=${setBranchMaterial} />
        <details class="advanced"><summary>Limite tehnice pe această ramură</summary>
          <p class="hint">Caracteristicile ramurii se aplică până la prima limită. Fiecare zonă continuă până la limita următoare sau la capăt.</p>
          ${(l.zoneTehnice || []).filter(function (z) { return z.branchId === b.id; }).map(function (z) {
            function setZone(field, value) {
              return edit(function (next) { next.zoneTehnice.filter(function (x) { return x.id === z.id; })[0][field] = value; });
            }
            function setZoneMaterial(material) {
              return edit(function (next) {
                var zone = next.zoneTehnice.filter(function (x) { return x.id === z.id; })[0];
                zone.tipLinie = material.tipLinie;
                zone.conductor = material.conductor;
                zone.sectiune = material.sectiune;
              });
            }
            return html`<div class="technical-zone" key=${z.id}>
              <label>Început zonă local (m)<${Draft} label="Început zonă local (m)" value=${z.deLa} numeric=${true}
                onCommit=${function (v) { return setZone('deLa', v); }} /></label>
              <${Technical} value=${z} set=${setZone} setMaterial=${setZoneMaterial} />
              <button type="button" class="btn tiny danger" onClick=${function () {
                edit(function (next) { next.zoneTehnice = next.zoneTehnice.filter(function (x) { return x.id !== z.id; }); });
              }}>Șterge limita tehnică</button>
            </div>`;
          })}
          <button type="button" class="btn tiny" onClick=${function () {
            edit(function (next) { next.zoneTehnice.push({ id: global.AppState.uid('zona'), branchId: b.id, deLa: 0 }); });
          }}>+ Limită tehnică la 0 m</button>
          <p class="hint">Dacă există deja o limită la 0 m, mut-o înainte de a adăuga alta.</p>
        </details>
        <div class="toolbar">
          <button type="button" class="btn tiny" onClick=${function () { var id = store.addBranch(l.id, b.id); if (id) bs[1](id); }}>+ Ramură / subramură</button>
          ${b.parentId ? html`<button type="button" class="btn tiny danger" onClick=${function () {
            if (global.confirm('Ștergi această ramură, toate subramurile ei, racordările și limitele tehnice de pe ele? Utilizatorii rămân în proiect, dar devin neracordați aici. Poți anula.')) {
              if (store.delBranch(l.id, b.id)) { bs[1](''); ss[1](''); }
            }
          }}>Șterge ramura și subramurile</button>` : null}
        </div>
      </fieldset>` : null}
      ${segment ? html`<section class="scheme-inspector"><h3>Inspector tronson — ${segment.nume}</h3>
        <p>${segment.lungime} m · ${K.money(C.tronsonCost(l, segment))} lei · ${segment.utilizatori.map(userName).join(', ') || 'Neutilizat'}</p>
        ${contributions[segment.id] ? html`<strong>Comp. ${K.money(contributions[segment.id].total)} lei</strong>` : null}
      </section>` : null}
      ${result ? html`<${V.LineCompensation} l=${l} user=${selectedUser} result=${result} contributions=${contributions} onSelect=${selectSegment} />` : null}
      <${SegmentTable} l=${l} onSelect=${selectSegment} segmentId=${ss[0]} />
      <${V.SpecialCircuits} l=${l} />
    </section>`;
  }

  function TreeReport(props) {
    var l = props.l, tree = global.AppTree.analyze(l), pr = l.punctRacordare || {};
    return html`<section class="line-report tree-report">
      <h3>Schema rețelei ramificate — ${l.nume}</h3>
      <p>PR: ${pr.denumire || 'Nespecificat'} · ${pr.tip || 'tip nespecificat'} ${pr.tensiune ? ' · ' + pr.tensiune + ' kV' : ''} ${pr.observatii || ''}</p>
      <p>Schemă orientativă pe ramuri, fără bucle. Distanțele sunt locale, de la începutul fiecărei ramuri.
        Lungime fizică totală: ${l.L} m; investiție: ${K.money(l.IL)} lei; cost pe ramurile automate: ${K.money(tree.rate)} lei/m.</p>
      ${l.ramuri.map(function (b) {
        var records = l.racordari.filter(function (r) { return r.branchId === b.id; }), pages = [0];
        for (var offset = 6; offset < records.length; offset += 6) pages.push(offset);
        return html`<section class="tree-report-branch" key=${b.id}>
          <h4>${b.nume} — ${b.L} m</h4>
          <p>${b.parentId ? 'Desprindere din ' + branchName(l, b.parentId) + ' la ' + b.deLa + ' m locali' : 'Origine: PR'}.
            Cost ramură: ${K.money(b.costManual ? b.IL : Number(b.L) * tree.rate)} lei (${b.costManual ? 'cost propriu' : 'automat'}).</p>
          ${pages.map(function (start, index) {
            return html`<figure class="tree-report-block" key=${start}>
              <figcaption>${b.nume} · partea ${index + 1}/${pages.length} · distanțe locale</figcaption>
              <${TreeDiagram} l=${l} branchOnly=${b.id} userOffset=${start} />
              <${V.LineLegend} />
            </figure>`;
          })}
          <ul>${records.map(function (r) {
            var route = tree.routes.filter(function (path) { return path.userId === r.userId; })[0];
            return html`<li key=${r.userId}>${userCode(r.userId)} — ${userName(r.userId)} · ${r.distanta} m locali ·
              ${route ? route.distance : '—'} m de la PR</li>`;
          })}</ul>
          <${SegmentTable} l=${l} branchId=${b.id} />
        </section>`;
      })}
      ${(l.tronsoane || []).some(function (t) { return t.tip === 'stalpi'; }) ? html`<h4>Circuite speciale pe stâlpi</h4>
        <ul>${l.tronsoane.filter(function (t) { return t.tip === 'stalpi'; }).map(function (t) {
          return html`<li>${t.nume} · ${K.money(C.tronsonCost(l, t))} lei · ${t.utilizatori.map(userName).join(', ')}</li>`;
        })}</ul>` : null}
    </section>`;
  }

  V.TreeEditor = TreeEditor;
  V.TreeReport = TreeReport;
})(window);
