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
  function fillMaterial(select, material, formId) {
    var form = select.form || global.document.getElementById(formId);
    if (!form) { store.toast('Nu s-au putut completa câmpurile materialului selectat.', 'error'); return; }
    var missing = [];
    [['type', material.tipLinie], ['conductor', material.conductor], ['sectiune', material.sectiune]].forEach(function (field) {
      var input = form.elements.namedItem(field[0]);
      if (input) input.value = field[1];
      else missing.push(field[0]);
    });
    if (missing.length) store.toast('Lipsesc câmpuri pentru materialul selectat: ' + missing.join(', ') + '.', 'error');
  }
  function PortionForm(props) {
    var b = props.branch, isEdit = !!b;
    return html`<form class="plan-form" onSubmit=${props.onSubmit}>
      <h4>${isEdit ? 'Proprietățile porțiunii' : 'Porțiune nouă de linie'}</h4>
      <${DraftField} name="name" label="Denumire porțiune" value=${b ? b.nume : ''} required=${true} />
      <${K.MaterialSelect} onSelect=${function (material, select) { fillMaterial(select, material); }} />
      <label>Tip linie<select name="type" required>
        <option value="" selected=${!b || !b.tipLinie}>Alege tipul</option>
        <option value="LES" selected=${b && b.tipLinie === 'LES'}>LES — punctată</option>
        <option value="LEA" selected=${b && b.tipLinie === 'LEA'}>LEA — continuă</option>
        <option value="altul" selected=${b && b.tipLinie === 'altul'}>Alt tip</option>
      </select></label>
      <${DraftField} name="conductor" label="Conductor / cablu" value=${b ? b.conductor : ''} />
      <${DraftField} name="sectiune" label="Secțiune / configurație (mm²)" value=${b ? b.sectiune : ''} />
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
  function TableInput(props) {
    var value = props.value == null ? '' : props.value;
    if (props.numeric && value !== '') value = String(value).replace('.', ',');
    return html`<input form=${props.form} name=${props.name} aria-label=${props.label}
      inputmode=${props.numeric ? 'decimal' : undefined} defaultValue=${value} required=${!!props.required} autocomplete="off" />`;
  }
  function readNumber(data, name, label, positive) {
    var value = K.parseNum(data.get(name));
    if (value === '' || value === null || (positive ? value <= 0 : value < 0)) {
      store.toast(label + ' : introdu o valoare ' + (positive ? 'pozitivă.' : 'nenegativă.'), 'error');
      return null;
    }
    return value;
  }
  function nodeLabel(graph, node) {
    if (!node) return '—';
    return node.origin ? 'PR' : 'Nod ' + graph.nodes.indexOf(node) + ' · ' + node.total + ' m';
  }
  function branchStart(graph, branch) {
    return branch.parentId
      ? graph.byKey[P.nodeKey(branch.parentId, branch.deLa)]
      : graph.byKey[P.nodeKey(branch.id, 0)];
  }
  function PortionRow(props) {
    var l = props.l, b = props.branch, graph = props.graph, version = useState(0);
    var lineBranches = l.ramuri || [];
    var form = 'portion-' + l.id + '-' + (b ? b.id : 'new');
    var rate = l.mod === 'ramuri' ? global.AppTree.analyze(l).rate : global.AppCalc.lineBl(l);
    var cost = b ? b.costManual ? b.IL : Number(b.L) * rate : '';
    function submit(event) {
      event.preventDefault();
      var data = new global.FormData(event.currentTarget);
      var length = readNumber(data, 'length', 'Lungime', true), amount = readNumber(data, 'cost', 'Cost', false);
      if (length === null || amount === null) return;
      var start = b && !b.parentId ? branchStart(graph, b) : graph.byKey[String(data.get('start') || '')];
      if (!start && !P.empty(l)) { store.toast('Alege nodul de început al porțiunii.', 'error'); return; }
      var id = b ? b.id : S.uid('ramura');
      if (store.savePlanPortion(l.id, { id: id, nume: String(data.get('name') || '').trim(),
        parentId: start && !start.origin ? start.branchId : '', deLa: start && !start.origin ? start.distance : 0,
        L: length, IL: amount,
        tipLinie: String(data.get('type') || ''), conductor: String(data.get('conductor') || ''),
        sectiune: String(data.get('sectiune') || ''), finantatorId: String(data.get('financier') || '') })) {
        version[1](version[0] + 1); props.onSelect('branch:' + id);
      }
    }
    var start = b && graph.byKey ? branchStart(graph, b) : null;
    var end = b && graph.byKey ? graph.byKey[P.nodeKey(b.id, b.L)] : null;
    var startValue = start ? start.key : '';
    var defaultStart = graph.nodes.length ? graph.nodes[graph.nodes.length - 1].key : '';
    if (b && !b.parentId) defaultStart = startValue;
    if (!b && props.selection && graph.byKey[props.selection]) defaultStart = props.selection;
    return html`<tr key=${version[0]} data-portion=${b ? b.id : 'new'}
      class=${b && props.selection === 'branch:' + b.id ? 'plan-table-selected' : ''}
      onKeyDown=${function (e) { if (e.key === 'Escape') { e.stopPropagation(); version[1](version[0] + 1); } }}>
      <th scope="row"><div class="plan-portion-name"><span>${b ? 'Tronson ' + (props.index + 1) : 'Porțiune nouă'}</span>
        <${TableInput} form=${form} name="name" label="Denumire porțiune" value=${b ? b.nume : 'Porțiune nouă'} required=${true} /></div></th>
      <td><select form=${form} name="start" aria-label="Nod de început" value=${b ? startValue : defaultStart}
        disabled=${!!(b && !b.parentId)}>
        ${graph.nodes.map(function (node) {
          var isDescendant = b && (function () {
            var branch = lineBranches.filter(function (x) { return x.id === node.branchId; })[0];
            while (branch && branch.parentId) {
              if (branch.parentId === b.id) return true;
              branch = lineBranches.filter(function (x) { return x.id === branch.parentId; })[0];
            }
            return branch && branch.id === b.id && !branch.parentId;
          })();
          return html`<option value=${node.key} key=${node.key} disabled=${!!isDescendant}>
            ${nodeLabel(graph, node)}${node.users.length ? ' · ' + node.users.map(userName).join(', ') : ''}</option>`;
        })}
        ${!graph.nodes.length ? html`<option value="" selected>Nodul PR</option>` : null}
      </select></td>
      <td class="plan-node-output">${b ? nodeLabel(graph, end) : 'Nod nou după salvare'}</td>
      <td><${TableInput} form=${form} name="length" label="Lungime porțiune (m)" numeric=${true} value=${b ? b.L : ''} required=${true} /></td>
      <td><${TableInput} form=${form} name="cost" label="Cost porțiune (lei)" numeric=${true} value=${cost} required=${true} />
        ${b ? html`<small>${b.costManual ? 'Cost explicit' : 'Cost automat curent'}</small>` : null}</td>
      <td><select form=${form} name="type" aria-label="Tip linie" required>
        <option value="" selected=${!b || !b.tipLinie}>Alege</option>
        ${['LEA', 'LES', 'altul'].map(function (type) { return html`<option value=${type} key=${type} selected=${b && b.tipLinie === type}>${type}</option>`; })}
      </select></td>
      <td class="plan-technical-cell"><${K.MaterialSelect} onSelect=${function (material, select) { fillMaterial(select, material, form); }} />
        <${TableInput} form=${form} name="conductor" label="Conductor / cablu" value=${b ? b.conductor : ''} /></td>
      <td><${TableInput} form=${form} name="sectiune" label="Secțiune / configurație (mm²)" value=${b ? b.sectiune : ''} /></td>
      <td><select form=${form} name="financier" aria-label="Finanțator documentat">
        <option value="" selected=${!b || !b.finantatorId}>Necunoscut / de verificat</option>
        ${store.state.utilizatori.map(function (u) {
          return html`<option value=${u.id} key=${u.id} selected=${b && b.finantatorId === u.id}>${userName(u.id)}</option>`;
        })}
      </select></td>
      <td><form id=${form} onSubmit=${submit}><button type="submit" class="btn tiny">${b ? 'Salvează rândul' : 'Adaugă porțiunea'}</button></form>
        ${b ? html`<button type="button" class="btn tiny ghost" onClick=${function () { props.onSelect('branch:' + b.id); }}>Selectează în planșă</button>` : null}
        ${b && b.parentId ? html`<button type="button" class="btn tiny danger" onClick=${function () {
          if (global.confirm('Ștergi porțiunea și continuările ei, deducând costurile eliminate? Utilizatorii rămân în proiect. Poți anula.')) {
            if (store.delBranch(l.id, b.id, true)) props.onSelect('');
          }
        }}>Șterge</button>` : null}
      </td>
    </tr>`;
  }
  function ConnectionRow(props) {
    var l = props.l, u = props.user, graph = props.graph, r = l.racordari.filter(function (x) { return x.userId === u.id; })[0];
    var version = useState(0), form = 'connection-' + l.id + '-' + u.id;
    function submit(event) {
      event.preventDefault();
      save(new global.FormData(event.currentTarget));
    }
    function save(data) {
      var branch = String(data.get('branch') || '');
      var distance = branch ? readNumber(data, 'distance', 'Distanța locală', false) : 0;
      if (distance === null) return;
      if (store.savePlanConnection(l.id, u.id, branch, distance)) {
        version[1](version[0] + 1);
        var node = branch && graph.byKey[P.nodeKey(branch, distance)];
        props.onSelect(node ? node.key : '');
      }
    }
    var branchId = r && (r.branchId || graph.nodes[0] && graph.nodes[0].branchId);
    var currentNode = r && graph.byKey[P.nodeKey(branchId, r.distanta)];
    var tree = l.mod === 'ramuri' ? global.AppTree.analyze(l) : null;
    var route = tree && tree.routes.filter(function (x) { return x.userId === u.id; })[0];
    var branches = l.mod === 'ramuri' ? l.ramuri : [{ id: 'plan-linear', nume: l.nume || 'Linia principală' }];
    return html`<tr key=${version[0]} data-connection=${u.id}
      onKeyDown=${function (e) { if (e.key === 'Escape') { e.stopPropagation(); version[1](version[0] + 1); } }}>
      <th scope="row">${userName(u.id)}</th>
      <td><select name="branch" aria-label="Tronson utilizator" form=${form}>
        <option value="" selected=${!r}>Neracordat</option>
        ${branches.map(function (b) { return html`<option key=${b.id} value=${b.id} selected=${branchId === b.id}>${b.nume}</option>`; })}
      </select></td>
      <td><input form=${form} name="distance" type="text" inputmode="decimal"
        aria-label="Distanță locală utilizator (m)" data-guide=${l.mod === 'distante' ? 'dist:' + l.id + ':' + u.id : undefined}
        defaultValue=${r ? String(r.distanta).replace('.', ',') : ''} autocomplete="off" /></td>
      <td>${currentNode ? nodeLabel(graph, currentNode) : 'Se generează după salvare'}</td>
      <td>${route ? route.distance + ' m' : '—'}</td>
      <td><form id=${form} onSubmit=${submit}><button type="submit" class="btn tiny">Salvează racordarea</button></form></td>
    </tr>`;
  }
  function PlanTables(props) {
    var l = props.l, tree = l.mod === 'ramuri' ? global.AppTree.analyze(l) : null;
    var graph = P.display(l), branches = (l.ramuri || []).slice();
    if (l.mod === 'distante' && Number(l.L) > 0) {
      var technical = (l.zoneTehnice || []).filter(function (z) { return Number(z.deLa) === 0; })[0] || {};
      branches = [{ id: 'plan-linear', parentId: '', deLa: 0, L: l.L, nume: l.nume || 'Linia principală',
        IL: l.bLManual ? l.IL : '', costManual: !!l.bLManual,
        tipLinie: technical.tipLinie || '', conductor: technical.conductor || '',
        sectiune: technical.sectiune || '', finantatorId: '' }];
    }
    return html`<section class="plan-tables" aria-label="Introducere tabelară a rețelei">
      <h3>Porțiuni de rețea</h3>
      <p class="hint">Fiecare rând definește un tronson între nodul de început și nodul de sfârșit.
        Alege unde începe, apoi introdu lungimea: nodul următor se generează automat.
        Distanțele sunt măsurate local pe porțiunea părinte. Escape anulează draftul rândului.</p>
      <p class="warn plan-financing">Finanțatorul este documentat, dar nu schimbă formula.
        Costurile sunt cele ale porțiunilor, nu totalul rețelei. O lungime/un cost modificat sau o porțiune nouă
        fixează costurile automate la valorile lor curente și actualizează totalul I_L. Poți anula modificarea.</p>
      ${l.mod === 'distante' && !P.empty(l) ? html`<p class="hint">Linia existentă se va transforma în rețea cu noduri numai la confirmarea primei editări tabelare; racordările și limitele tehnice se păstrează. Poți anula conversia.</p>` : null}
      ${graph.errors.length ? html`<div class="warn" role="alert">${graph.errors.map(function (text) { return html`<p>${text}</p>`; })}</div>` : null}
      ${l.mod === 'ramuri' && (l.noduriPlan || []).length ? html`<button type="button" class="btn tiny ghost" onClick=${function () {
        if (global.confirm('Resetezi aranjarea și elimini nodurile libere? Porțiunile, racordările și limitele tehnice rămân neschimbate. Poți anula.')) {
          if (store.editTree(l.id, function (next) { next.noduriPlan = []; }, { noFocus: true })) props.onSelect('');
        }
      }}>Resetează planșa</button>` : null}
      <div class="table-wrap"><table class="plan-portions"><caption>Tronsoane și nodurile dintre ele</caption>
        <colgroup><col class="plan-col-name" /><col class="plan-col-start" /><col class="plan-col-node" />
          <col class="plan-col-length" /><col class="plan-col-cost" />
          <col class="plan-col-type" /><col class="plan-col-material" /><col class="plan-col-section" />
          <col class="plan-col-financier" /><col class="plan-col-actions" /></colgroup>
        <thead><tr><th>Tronson / denumire</th><th>Nod de început</th><th>Nod de sfârșit</th><th>Lungime (m)</th>
          <th>Cost (lei)</th><th>Tip linie</th><th>Material uzual / conductor</th><th>Secțiune (mm²)</th>
          <th>Finanțator documentat</th><th>Acțiuni</th></tr></thead>
        <tbody>${branches.map(function (b, index) {
          return html`<${PortionRow} key=${b.id + JSON.stringify(b) + (tree ? tree.rate : '')}
            l=${l} graph=${graph} branch=${b} index=${index} selection=${props.selection} onSelect=${props.onSelect} />`;
        })}
          ${l.mod === 'ramuri' || P.empty(l) ? html`<${PortionRow} key=${'new:' + l.mod}
            l=${l} graph=${graph} index=${branches.length} selection=${props.selection} onSelect=${props.onSelect} />` : null}
        </tbody>
      </table></div>
      ${l.mod === 'ramuri' || l.mod === 'distante' && Number(l.L) > 0 ? html`<h3>Racordarea utilizatorilor la noduri</h3>
        <p class="hint">Alege direct nodul din listă. Nodurile se generează din capetele tronsoanelor, ramificații și limite existente.</p>
        <div class="table-wrap"><table class="plan-connections"><caption>Racordările utilizatorilor</caption>
          <colgroup><col class="plan-col-user" /><col class="plan-col-connection" /><col class="plan-col-distance" />
            <col class="plan-col-node-output" /><col class="plan-col-route" /><col class="plan-col-connection-actions" /></colgroup>
          <thead><tr><th>Utilizator</th><th>Tronson</th><th>Distanță locală (m)</th>
            <th>Nod generat</th><th>Traseu de la PR (m)</th><th>Acțiuni</th></tr></thead>
          <tbody>${store.state.utilizatori.map(function (u) {
            var r = l.racordari.filter(function (x) { return x.userId === u.id; })[0];
            return html`<${ConnectionRow} key=${u.id + JSON.stringify(r)} l=${l} graph=${graph} user=${u} onSelect=${props.onSelect} />`;
          })}</tbody>
        </table></div>` : null}
    </section>`;
  }
  function PlanEditor(props) {
    var l = props.l, graph = props.tableMode ? P.display(l) :
      l.mod === 'ramuri' ? P.graph(l) : { nodes: [], edges: [], errors: [] };
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
      if (l.mod === 'ramuri' && !selectedBranch && !selectedNode) { report('Selectează nodul de plecare al porțiunii.'); return; }
      if (!store.savePlanPortion(l.id, { id: id, nume: name, L: length, IL: cost, tipLinie: type,
        conductor: String(data.get('conductor') || ''), sectiune: String(data.get('sectiune') || ''),
        finantatorId: financier, parentId: selectedBranch ? selectedBranch.parentId : selectedNode ? selectedNode.branchId : '',
        deLa: selectedBranch ? Number(selectedBranch.deLa) || 0 : selectedNode ? selectedNode.distance : 0 })) return;
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
      if (l.mod !== 'ramuri') return;
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
      if (l.mod !== 'ramuri') return;
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
    var newSet = {};
    S.newIds(store.state).forEach(function (id) { newSet[id] = true; });
    var newRoutes = tree && !tree.errors.length ? tree.routes.filter(function (r) { return newSet[r.userId]; }) : [];
    function edgeUsedByNew(edge) {
      return newRoutes.some(function (route) {
        return route.path.some(function (part) {
          return part.branchId === edge.branchId && part.to >= edge.to.distance - 1e-6;
        });
      });
    }
    var canStart = P.empty(l);
    var automatic = (l.ramuri || []).some(function (b) { return !b.costManual; });
    return html`<section class=${'plan-editor' + (props.tableMode ? ' plan-tabular' : '') + (expanded[0] ? ' plan-expanded' : '')} aria-label="Editor cu noduri"
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
        ${!props.tableMode ? html`<aside class="plan-sidebar" aria-label="Instrumente și proprietăți">
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
        </aside>` : null}
        <div class="plan-board">
          <div class="toolbar plan-navigation" role="group" aria-label="Navigare planșă">
            <button type="button" class="btn tiny" disabled=${zoom[0] <= 0.5} onClick=${function () { zoom[1](Math.max(0.5, zoom[0] - 0.25)); }}>Micșorează</button>
            <span>${Math.round(zoom[0] * 100)}%</span>
            <button type="button" class="btn tiny" disabled=${zoom[0] >= 2} onClick=${function () { zoom[1](Math.min(2, zoom[0] + 0.25)); }}>Mărește</button>
            <button type="button" class="btn tiny ghost" onClick=${function () { zoom[1](1); }}>Scară inițială</button>
          </div>
          <p class="hint">Desen orientativ, nu la scară. ${l.mod === 'ramuri'
            ? 'Trage nodurile pentru aranjare; lungimile nu se modifică. Din tastatură: Enter selectează, Shift + săgeți mută nodul.'
            : 'Datele din tabel generează automat nodurile, fără conversia proiectului.'}
            Derulează planșa pentru deplasare.</p>
          ${props.tableMode && graph.errors.length ? html`<div class="warn" role="alert">${graph.errors.map(function (text) { return html`<p>${text}</p>`; })}</div>` : null}
          <div class="plan-scroll" tabindex="0" role="region" aria-label="Planșă derulabilă">
            <svg ref=${canvasRef} class="plan-svg" width=${maxX * zoom[0]} height=${maxY * zoom[0]}
              viewBox=${'0 0 ' + maxX + ' ' + maxY} role="group" aria-label="Noduri și porțiuni de rețea"
              onPointerMove=${pointerMove} onPointerUp=${function (e) { pointerEnd(e, false); }}
              onPointerCancel=${function (e) { pointerEnd(e, true); }}>
              ${graph.edges.map(function (edge) {
                var selected = selectedBranch && selectedBranch.id === edge.branchId;
                return html`<g key=${edge.key}>
                  <line class=${'plan-edge tree-segment tip-' + (edge.type || 'nespecificat') +
                    (edgeUsedByNew(edge) ? ' plan-edge-new' : '') + (selected ? ' plan-edge-selected' : '')}
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
              var route = tree ? tree.routes.filter(function (x) { return x.userId === r.userId; })[0] :
                graph.nodes.filter(function (n) { return n.users.indexOf(r.userId) >= 0; }).map(function (n) { return { distance: n.total }; })[0];
              return html`<li key=${r.userId}>${userName(r.userId)}: ${route ? route.distance + ' m de la PR' : 'Traseu indisponibil — verifică rețeaua'}.</li>`;
            })}</ul>
          </details>
        </div>
      </div>
      ${props.tableMode ? html`<${PlanTables} l=${l} selection=${selection[0]} onSelect=${choose} />` : null}
    </section>`;
  }
  V.PlanEditor = PlanEditor;
})(window);
