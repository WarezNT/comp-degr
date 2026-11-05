/* Editor cu noduri: instrumente și proprietăți în stânga, planșă SVG în dreapta. */
(function (global) {
  'use strict';
  var K = global.AppKit, html = K.html, store = K.store, S = global.AppState, P = global.AppPlan;
  var V = global.AppViews, useState = global.preactHooks.useState, useRef = global.preactHooks.useRef;
  function userName(id) { return global.AppCalc.nameOf(store.state, id); }
  function DraftField(props) {
    var value = props.value == null ? '' : props.value;
    if (props.numeric && value !== '') value = String(value).replace('.', ',');
    return html`<label>${props.label}<input name=${props.name} type="text"
      inputmode=${props.numeric ? 'decimal' : undefined} defaultValue=${value}
      required=${!!props.required} autocomplete="off" /></label>`;
  }
  function Financier(props) {
    return html`<label>Finanțator documentat (nu schimbă formula)<select name="financier">
      <option value="" selected=${!props.value}>Necunoscut / de verificat</option>
      ${store.state.utilizatori.map(function (u) { return html`<option value=${u.id} key=${u.id} selected=${props.value === u.id}>${userName(u.id)}</option>`; })}
    </select></label>`;
  }
  function PortionForm(props) {
    var b = props.branch, isEdit = !!b;
    return html`<form class="plan-form" onSubmit=${props.onSubmit}>
      <h4>${isEdit ? 'Proprietățile porțiunii' : 'Porțiune nouă de linie'}</h4>
      <${DraftField} name="name" label="Denumire porțiune" value=${b ? b.nume : ''} required=${true} />
      <label>Tip linie<select name="type" required>
        <option value="" selected=${!b || !b.tipLinie}>Alege tipul</option>
        <option value="LES" selected=${b && b.tipLinie === 'LES'}>LES — punctată</option>
        <option value="LEA" selected=${b && b.tipLinie === 'LEA'}>LEA — continuă</option>
        <option value="altul" selected=${b && b.tipLinie === 'altul'}>Alt tip</option>
      </select></label>
      <${DraftField} name="length" label="Lungime fizică (m)" value=${b ? b.L : ''} numeric=${true} required=${true} />
      <${DraftField} name="cost" label="Costul acestei porțiuni (lei)" value=${b ? props.cost : ''} numeric=${true} required=${true} />
      <${Financier} value=${b && b.finantatorId} />
      <p class="hint">Introdu costul porțiunii, nu totalul rețelei. Zero numai dacă este documentat.
        Totalul I_L se actualizează din costurile porțiunilor, fără redistribuirea investițiilor existente.</p>
      ${props.automatic ? html`<p class="warn">Dacă adaugi o porțiune sau schimbi lungimea/costul, costurile automate existente
        se fixează la valorile lor curente. Repartizarea se păstrează; modificarea se poate anula.</p>` : null}
      <button type="submit" class="btn primary">${isEdit ? 'Salvează porțiunea' : 'Adaugă porțiunea'}</button>
    </form>`;
  }
  function PlanEditor(props) {
    var l = props.l, graph = l.mod === 'ramuri' ? P.graph(l) : { nodes: [], edges: [], errors: [] };
    var selection = useState(''), action = useState(''), expanded = useState(false), zoom = useState(1);
    var draftVersion = useState(0);
    var drag = useRef(null), canvasRef = useRef(null);
    var selectedNode = graph.nodes.filter(function (n) { return n.key === selection[0]; })[0];
    var selectedBranch = (l.ramuri || []).filter(function (b) { return 'branch:' + b.id === selection[0]; })[0];
    function choose(key) { selection[1](key); action[1](''); }
    function report(text) { store.toast(text, 'error'); }
    function editPlan(change) { return store.editTree(l.id, change, { noFocus: true }); }
    function numeric(data, key, positive) {
      var value = K.parseNum(String(data.get(key) || ''));
      if (value === null || value === '' || !isFinite(value) || (positive ? value <= 0 : value < 0)) {
        report('Completează „' + (key === 'cost' ? 'Costul porțiunii' : key === 'distance' ? 'Distanța locală' : 'Lungimea') +
          '” cu o valoare ' + (positive ? 'pozitivă.' : 'nenegativă.')); return null;
      }
      return value;
    }
    function savePortion(event) {
      event.preventDefault();
      var data = new global.FormData(event.currentTarget), length = numeric(data, 'length', true), cost = numeric(data, 'cost', false);
      if (length === null || cost === null) return;
      var name = String(data.get('name') || '').trim(), type = String(data.get('type') || '');
      if (!name || !type) { report('Completează denumirea și tipul porțiunii.'); return; }
      var financier = String(data.get('financier') || ''), id = selectedBranch ? selectedBranch.id : S.uid('ramura');
      if (l.mod !== 'ramuri') {
        var root = { id: id, nume: name, parentId: '', deLa: 0, L: length, IL: cost, costManual: true,
          tipLinie: type, finantatorId: financier };
        store.mutate(function (p) {
          var line = p.linii.filter(function (x) { return x.id === l.id; })[0];
          line.mod = 'ramuri'; line.ramuri = [root]; line.racordari = []; line.zoneTehnice = [];
          line.noduriPlan = []; line.IL = cost; line.bLManual = false;
        }, { undo: true, noFocus: true });
      } else {
        if (!selectedBranch && !selectedNode) { report('Selectează nodul de plecare al porțiunii.'); return; }
        var ok = editPlan(function (next) {
          var previousCost = selectedBranch && (selectedBranch.costManual ? Number(selectedBranch.IL) : Number(selectedBranch.L) * tree.rate);
          var financial = !selectedBranch || length !== Number(selectedBranch.L) || cost !== previousCost;
          if (financial) P.explicitCosts(next);
          if (selectedBranch) {
            var target = next.ramuri.filter(function (b) { return b.id === id; })[0];
            target.nume = name; target.tipLinie = type; target.L = length; target.finantatorId = financier;
            if (financial) target.IL = cost;
          } else {
            next.ramuri.push({ id: id, nume: name, parentId: selectedNode.branchId, deLa: selectedNode.distance,
              L: length, IL: cost, costManual: true, tipLinie: type, finantatorId: financier });
          }
          if (financial) P.budget(next);
        });
        if (!ok) return;
      }
      selection[1](selectedBranch ? 'branch:' + id : P.nodeKey(id, length)); action[1]('');
    }
    function addNode(event) {
      event.preventDefault();
      var data = new global.FormData(event.currentTarget), distance = numeric(data, 'distance', false);
      if (distance === null) return;
      var key = P.nodeKey(selectedBranch.id, distance);
      if (distance > Number(selectedBranch.L)) { report('Distanța trebuie să fie pe porțiunea selectată.'); return; }
      var existing = graph.byKey[key];
      if (existing) { choose(existing.key); return; }
      if (editPlan(function (next) {
        next.noduriPlan = next.noduriPlan || [];
        next.noduriPlan.push({ branchId: selectedBranch.id, distanta: distance, x: 90 + distance / Number(selectedBranch.L) * 240, y: 100 + graph.nodes.length * 45 });
      })) choose(key);
    }
    function attachUser(event) {
      event.preventDefault();
      var data = new global.FormData(event.currentTarget), id = String(data.get('user') || '');
      var name = String(data.get('newName') || '').trim(), role = String(data.get('role') || '');
      if (!id && !name) { report('Alege un utilizator existent sau completează numele celui nou.'); return; }
      var next = JSON.parse(JSON.stringify(store.state));
      if (!id) {
        if (role === 'prim' && S.primId(next)) { report('Există deja un prim utilizator. Verifică rolurile în pasul Utilizatori.'); return; }
        id = S.addUserAuto(next, { nume: name, rol: role }).id;
      }
      var line = next.linii.filter(function (x) { return x.id === l.id; })[0];
      line.racordari = line.racordari.filter(function (r) { return r.userId !== id; });
      line.racordari.push({ userId: id, branchId: selectedNode.branchId, distanta: selectedNode.distance });
      var errors = global.AppTree.analyze(line).errors;
      if (errors.length) { report(errors.join(' ')); return; }
      store.mutate(function (p) {
        p.utilizatori = next.utilizatori;
        p.linii[p.linii.map(function (x) { return x.id; }).indexOf(l.id)] = line;
      }, { undo: true, noFocus: true });
      action[1]('');
    }
    function savePosition(node, x, y) {
      editPlan(function (next) {
        var list = next.noduriPlan || [], found = list.filter(function (n) {
          return n.branchId === node.branchId && Number(n.distanta) === node.distance;
        })[0];
        if (!found) { found = { branchId: node.branchId, distanta: node.distance }; list.push(found); }
        found.x = Math.max(40, Math.min(5000, Math.round(x))); found.y = Math.max(50, Math.min(5000, Math.round(y)));
        next.noduriPlan = list;
      });
    }
    function point(event) {
      var svg = canvasRef.current, matrix = svg && svg.getScreenCTM();
      if (!matrix) return null;
      var p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY;
      return p.matrixTransform(matrix.inverse());
    }
    function pointerDown(event, node) {
      if (event.button !== 0) return;
      var p = point(event); if (!p) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { node: node, element: event.currentTarget, start: p, x: node.x, y: node.y, moved: false };
    }
    function pointerMove(event) {
      var d = drag.current, p = d && point(event);
      if (!p) return;
      var dx = p.x - d.start.x, dy = p.y - d.start.y;
      if (Math.abs(dx) + Math.abs(dy) < 4 && !d.moved) return;
      d.moved = true; d.x = Math.max(40, Math.min(5000, d.node.x + dx)); d.y = Math.max(50, Math.min(5000, d.node.y + dy));
      d.element.setAttribute('transform', 'translate(' + d.x + ' ' + d.y + ')');
    }
    function pointerEnd(event, cancelled) {
      var d = drag.current;
      if (!d) return;
      drag.current = null;
      if (d.element.hasPointerCapture(event.pointerId)) d.element.releasePointerCapture(event.pointerId);
      if (cancelled || !d.moved) d.element.setAttribute('transform', 'translate(' + d.node.x + ' ' + d.node.y + ')');
      else savePosition(d.node, d.x, d.y);
    }
    function keyboardNode(event, node) {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(node.key); }
      var shifts = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] };
      if (event.shiftKey && shifts[event.key]) {
        event.preventDefault(); savePosition(node, node.x + shifts[event.key][0], node.y + shifts[event.key][1]);
      }
    }
    var maxX = Math.max.apply(null, [850].concat(graph.nodes.map(function (n) { return n.x + 180; })));
    var maxY = Math.max.apply(null, [480].concat(graph.nodes.map(function (n) { return n.y + 110 + n.users.length * 24; })));
    var tree = l.mod === 'ramuri' ? global.AppTree.analyze(l) : null;
    var canStart = l.mod === 'distante' && Number(l.L) === 0 && Number(l.IL) === 0 && !l.bLManual &&
      !(l.racordari || []).length && !(l.tronsoane || []).length && !(l.zoneTehnice || []).length;
    var automatic = (l.ramuri || []).some(function (b) { return !b.costManual; });
    return html`<section class=${'plan-editor' + (expanded[0] ? ' plan-expanded' : '')} aria-label="Editor cu noduri"
      onKeyDown=${function (e) {
        if (e.key !== 'Escape') return;
        if (expanded[0]) { expanded[1](false); e.preventDefault(); }
        else if (e.target.form) { draftVersion[1](draftVersion[0] + 1); action[1](''); e.preventDefault(); }
      }}>
      <header class="plan-header">
        <strong>Planșa rețelei — ${l.nume}</strong>
        <button type="button" class="btn tiny" aria-pressed=${expanded[0]} onClick=${function () { expanded[1](!expanded[0]); }}>
          ${expanded[0] ? 'Revino în pagină' : 'Extinde planșa'}</button>
      </header>
      <div class="plan-workspace">
        <aside class="plan-sidebar" aria-label="Instrumente și proprietăți">
          <h3>Construiește rețeaua</h3>
          <p>1. Adaugă o porțiune. 2. Selectează nodul de la capăt. 3. Atașează un utilizator sau continuă linia.</p>
          <p class="warn plan-financing">Finanțatorul este documentat pe porțiune, dar nu schimbă formula.
            Calculul existent folosește participanții și ordinea racordării, nu un istoric al finanțărilor.
            Investițiile succesive U1 → U2 → U3 trebuie verificate separat.</p>
          ${l.mod === 'ramuri' && (l.noduriPlan || []).length ? html`<button type="button" class="btn tiny ghost" onClick=${function () {
            if (global.confirm('Resetezi aranjarea și elimini nodurile libere? Porțiunile, racordările și limitele tehnice rămân neschimbate. Poți anula.')) {
              if (editPlan(function (next) { next.noduriPlan = []; })) choose('');
            }
          }}>Resetează planșa</button>` : null}
          ${l.mod !== 'ramuri' ? canStart ? html`<p>PR este originea rețelei. Introdu prima porțiune; lungimea totală și costul se completează automat.</p>
            <${PortionForm} key=${'start:' + draftVersion[0]} onSubmit=${savePortion} />`
            : html`<p>Planșa necesită o rețea radială. Datele existente nu sunt convertite automat.</p>
              ${l.mod === 'distante' ? html`<button type="button" class="btn" onClick=${function () {
                if (global.confirm('Deschizi această linie ca rețea cu noduri? Traseele și costurile se păstrează; poți anula conversia.')) store.convertTree(l.id);
              }}>Pregătește linia pentru noduri</button>` : html`<p>Folosește conversia explicită pe distanțe din formularul avansat înainte de planșă.</p>`}`
          : graph.errors.length ? html`<div role="alert">${graph.errors.map(function (text) { return html`<p>${text}</p>`; })}<p>Corectează rețeaua în modul avansat.</p></div>`
          : html`
            <p><strong>${K.money(l.IL)} lei</strong> investiție totală · ${tree.length} m fizici.</p>
            <label>Selectează un nod<select aria-label="Nodul selectat" value=${selectedNode ? selectedNode.key : ''}
              onChange=${function (e) { choose(e.target.value); }}>
              <option value="">Alege nodul</option>${graph.nodes.map(function (n, index) {
                return html`<option value=${n.key} key=${n.key}>${n.origin ? 'PR' : 'N' + index} · ${n.total} m de la PR${n.users.length ? ' · ' + n.users.map(userName).join(', ') : ''}</option>`;
              })}
            </select></label>
            <label>Selectează o porțiune<select aria-label="Porțiunea selectată" value=${selectedBranch ? selectedBranch.id : ''}
              onChange=${function (e) { choose(e.target.value ? 'branch:' + e.target.value : ''); }}>
              <option value="">Alege porțiunea</option>${l.ramuri.map(function (b) {
                return html`<option value=${b.id} key=${b.id}>${b.nume} · ${b.L} m</option>`;
              })}
            </select></label>
            ${selectedNode ? html`<h4>${selectedNode.origin ? 'Originea PR' : 'Nod de racordare'} · ${selectedNode.total} m de la PR</h4>
              <p>${selectedNode.users.length ? 'Utilizatori: ' + selectedNode.users.map(userName).join(', ') : 'Niciun utilizator atașat.'}</p>
              <div class="plan-tools">
                <button type="button" class="btn" onClick=${function () { action[1]('extend'); }}>Continuă / ramifică de aici</button>
                <button type="button" class="btn" onClick=${function () { action[1]('attach'); }}>Atașează utilizator</button>
              </div>
              ${selectedNode.users.map(function (id) { return html`<button type="button" class="btn tiny ghost" key=${id} onClick=${function () {
                if (global.confirm('Deconectezi utilizatorul din acest nod? Utilizatorul rămâne în proiect.')) editPlan(function (next) {
                  next.racordari = next.racordari.filter(function (r) { return r.userId !== id; });
                });
              }}>Deconectează ${userName(id)}</button>`; })}
              ${action[0] === 'extend' ? html`<${PortionForm} key=${'extend:' + selectedNode.key} automatic=${automatic} onSubmit=${savePortion} />` : null}
              ${action[0] === 'attach' ? html`<form class="plan-form" key=${'attach:' + selectedNode.key} onSubmit=${attachUser}>
                <h4>Utilizator în acest nod</h4>
                <label>Utilizator existent<select name="user">
                  <option value="" selected>Creează un utilizator nou mai jos</option>${store.state.utilizatori.map(function (u) {
                    return html`<option value=${u.id} key=${u.id}>${userName(u.id)}</option>`;
                  })}
                </select></label>
                <${DraftField} name="newName" label="Nume utilizator nou (numai dacă nu alegi unul existent)" />
                <label>Rol pentru utilizatorul nou<select name="role">
                  <option value="prim" selected=${!S.primId(store.state)}>Prim utilizator</option><option value="nou" selected=${!!S.primId(store.state)}>Nou</option>
                  <option value="existent">Existent</option><option value="operator">Operator</option>
                </select></label>
                <p class="hint">Un utilizator existent va fi mutat din vechea racordare. Rolul său nu se schimbă.
                  Verifică ulterior contractele și datele ATR/TR în pasul Utilizatori.</p>
                <button type="submit" class="btn primary">Confirmă racordarea</button>
              </form>` : null}`
            : selectedBranch ? html`
              <p>Finanțator documentat: ${selectedBranch.finantatorId ? userName(selectedBranch.finantatorId) : 'necunoscut'}.
                Nu este o confirmare a dreptului la compensație.</p>
              <${PortionForm} key=${'edit:' + selectedBranch.id + ':' + draftVersion[0]} branch=${selectedBranch} automatic=${automatic}
                cost=${selectedBranch.costManual ? selectedBranch.IL : Number(selectedBranch.L) * tree.rate} onSubmit=${savePortion} />
              <form class="plan-form" key=${'node:' + selectedBranch.id + ':' + draftVersion[0]} onSubmit=${addNode}>
                <h4>Racordare intermediară</h4>
                <${DraftField} name="distance" label="Distanță de la începutul porțiunii (m)" numeric=${true} required=${true} />
                <p class="hint">Adaugă un nod fără a schimba lungimea, investiția sau finanțatorul porțiunii.</p>
                <button type="submit" class="btn">Adaugă nod pe porțiune</button>
              </form>
              ${selectedBranch.parentId ? html`<button type="button" class="btn danger" onClick=${function () {
                if (!global.confirm('Ștergi porțiunea, continuările și racordările dependente? Costurile rămase vor fi păstrate. Poți anula.')) return;
                if (store.delBranch(l.id, selectedBranch.id, true)) choose('');
              }}>Șterge porțiunea și continuările</button>` : null}`
            : html`<p>Selectează un nod pentru continuare/racordare sau o porțiune pentru lungime, cost și finanțator.</p>`}
          `}
        </aside>
        <div class="plan-board">
          <div class="toolbar plan-navigation" role="group" aria-label="Navigare planșă">
            <button type="button" class="btn tiny" disabled=${zoom[0] <= 0.5} onClick=${function () { zoom[1](Math.max(0.5, zoom[0] - 0.25)); }}>Micșorează</button>
            <span>${Math.round(zoom[0] * 100)}%</span>
            <button type="button" class="btn tiny" disabled=${zoom[0] >= 2} onClick=${function () { zoom[1](Math.min(2, zoom[0] + 0.25)); }}>Mărește</button>
            <button type="button" class="btn tiny ghost" onClick=${function () { zoom[1](1); }}>Scară inițială</button>
          </div>
          <p class="hint">Desen orientativ, nu la scară. Trage nodurile pentru aranjare; lungimile nu se modifică.
            Din tastatură: Enter selectează, Shift + săgeți mută nodul. Derulează planșa pentru deplasare.</p>
          <div class="plan-scroll" tabindex="0" role="region" aria-label="Planșă derulabilă">
            <svg ref=${canvasRef} class="plan-svg" width=${maxX * zoom[0]} height=${maxY * zoom[0]}
              viewBox=${'0 0 ' + maxX + ' ' + maxY} role="group" aria-label="Noduri și porțiuni de rețea"
              onPointerMove=${pointerMove} onPointerUp=${function (e) { pointerEnd(e, false); }}
              onPointerCancel=${function (e) { pointerEnd(e, true); }}>
              ${graph.edges.map(function (edge) {
                var selected = selectedBranch && selectedBranch.id === edge.branchId;
                return html`<g key=${edge.key}>
                  <line class=${'plan-edge tree-segment tip-' + (edge.type || 'nespecificat') + (selected ? ' plan-edge-selected' : '')}
                    x1=${edge.from.x} y1=${edge.from.y} x2=${edge.to.x} y2=${edge.to.y} />
                  <line class="plan-hit" tabindex="0" role="button" aria-label=${'Selectează porțiunea ' + edge.length + ' m · ' + edge.type}
                    x1=${edge.from.x} y1=${edge.from.y} x2=${edge.to.x} y2=${edge.to.y}
                    onClick=${function () { choose('branch:' + edge.branchId); }}
                    onKeyDown=${function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose('branch:' + edge.branchId); } }} />
                  <text class="plan-edge-label" x=${(edge.from.x + edge.to.x) / 2} y=${(edge.from.y + edge.to.y) / 2 - 18}>
                    ${edge.type || 'Tip nespecificat'} · ${edge.length} m · ${K.money(edge.cost)} lei</text>
                </g>`;
              })}
              ${graph.nodes.map(function (node, index) {
                return html`<g class=${'plan-node' + (selectedNode === node ? ' plan-node-selected' : '')} key=${node.key}
                  transform=${'translate(' + node.x + ' ' + node.y + ')'} tabindex="0" role="button"
                  aria-label=${(node.origin ? 'PR' : 'Nod ' + index) + ' · ' + node.total + ' m de la PR'}
                  onClick=${function () { choose(node.key); }} onKeyDown=${function (e) { keyboardNode(e, node); }}
                  onPointerDown=${function (e) { pointerDown(e, node); }}>
                  <circle r="16" /><text class="plan-node-code" y="5">${node.origin ? 'PR' : 'N' + index}</text>
                  ${node.technical ? html`<text class="plan-technical" x="27" y="5">◆</text>` : null}
                  <text class="plan-node-distance" y="-25">${node.total} m de la PR</text>
                  ${node.users.map(function (id, i) { return html`<text class="plan-node-user" key=${id} y=${38 + i * 22}>${userName(id)}</text>`; })}
                </g>`;
              })}
              ${!graph.nodes.length ? html`<text x="60" y="100">PR — adaugă prima porțiune din coloana stângă.</text>` : null}
            </svg>
          </div>
          <${V.LineLegend} />
          <details class="plan-summary"><summary>Verifică traseele utilizatorilor</summary>
            <ul>${(l.racordari || []).map(function (r) {
              var route = tree && tree.routes.filter(function (x) { return x.userId === r.userId; })[0];
              return html`<li key=${r.userId}>${userName(r.userId)}: ${route ? route.distance + ' m de la PR' : 'Traseu indisponibil — verifică rețeaua'}.</li>`;
            })}</ul>
          </details>
        </div>
      </div>
    </section>`;
  }
  V.PlanEditor = PlanEditor;
})(window);
