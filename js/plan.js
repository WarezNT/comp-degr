/* Planșa derivă nodurile din rețeaua radială; pozițiile grafice nu sunt metri. */
(function (global) {
  'use strict';
  function nodeKey(branchId, distance) { return branchId + ':' + Number(distance); }
  function graph(line) {
    var tree = global.AppTree.analyze(line), nodes = [], edges = [], byKey = Object.create(null), row = 0;
    if (tree.errors.length) return { nodes: nodes, edges: edges, byKey: byKey, errors: tree.errors };
    function walk(branch, start) {
      var y = 100 + row++ * 160, bounds = [0, Number(branch.L)];
      function bound(d) { if (bounds.indexOf(Number(d)) < 0) bounds.push(Number(d)); }
      (line.racordari || []).filter(function (r) { return r.branchId === branch.id; }).forEach(function (r) { bound(r.distanta); });
      (line.noduriPlan || []).filter(function (n) { return n.branchId === branch.id; }).forEach(function (n) { bound(n.distanta); });
      (line.zoneTehnice || []).filter(function (z) { return z.branchId === branch.id; }).forEach(function (z) { bound(z.deLa); });
      var children = line.ramuri.filter(function (b) { return b.parentId === branch.id; });
      children.forEach(function (b) { bound(b.deLa); });
      bounds.sort(function (a, b) { return a - b; });
      bounds.forEach(function (distance, index) {
        var key = nodeKey(branch.id, distance);
        if (distance === 0 && branch.parentId) {
          byKey[key] = byKey[nodeKey(branch.parentId, branch.deLa)];
          return;
        }
        var saved = (line.noduriPlan || []).filter(function (n) {
          return n.branchId === branch.id && Number(n.distanta) === distance;
        })[0];
        var node = { key: key, branchId: branch.id, distance: distance, total: start + distance,
          origin: !branch.parentId && distance === 0, users: [],
          x: saved && isFinite(saved.x) ? Number(saved.x) :
            (branch.parentId ? byKey[nodeKey(branch.parentId, branch.deLa)].x : 90) + index * 240,
          y: saved && isFinite(saved.y) ? Number(saved.y) : y };
        nodes.push(node); byKey[key] = node;
      });
      bounds.slice(1).forEach(function (distance, index) {
        var from = byKey[nodeKey(branch.id, bounds[index])], to = byKey[nodeKey(branch.id, distance)];
        var tech = branch;
        (line.zoneTehnice || []).filter(function (z) {
          return z.branchId === branch.id && Number(z.deLa) <= bounds[index];
        }).sort(function (a, b) { return Number(a.deLa) - Number(b.deLa); }).forEach(function (z) { tech = z; });
        edges.push({ key: nodeKey(branch.id, bounds[index]) + '-' + distance,
          branchId: branch.id, from: from, to: to, length: distance - bounds[index],
          type: tech.tipLinie || '', cost: (distance - bounds[index]) *
            (branch.costManual ? Number(branch.IL) / Number(branch.L) : tree.rate) });
      });
      children.forEach(function (child) { walk(child, start + Number(child.deLa)); });
    }
    walk(tree.roots[0], 0);
    (line.racordari || []).forEach(function (r) {
      var node = byKey[nodeKey(r.branchId, r.distanta)];
      if (node) node.users.push(r.userId);
    });
    (line.zoneTehnice || []).forEach(function (z) { byKey[nodeKey(z.branchId, z.deLa)].technical = true; });
    return { nodes: nodes, edges: edges, byKey: byKey, errors: [] };
  }
  function explicitCosts(line) {
    var analysis = global.AppTree.analyze(line);
    if (analysis.errors.length) throw new Error(analysis.errors.join(' '));
    line.ramuri.forEach(function (b) {
      if (!b.costManual) { b.IL = Number(b.L) * analysis.rate; b.costManual = true; }
    });
  }
  function budget(line) {
    line.IL = line.ramuri.reduce(function (sum, b) { return sum + Number(b.IL); }, 0);
  }
  function empty(line) {
    return line.mod === 'distante' && Number(line.L) === 0 && Number(line.IL) === 0 && !line.bLManual &&
      !(line.racordari || []).length && !(line.tronsoane || []).length && !(line.zoneTehnice || []).length;
  }
  function display(line) {
    if (line.mod === 'ramuri') return graph(line);
    if (line.mod !== 'distante') return { nodes: [], edges: [], errors: [
      'Alocările manuale nu definesc o topologie unică. Tabelul se păstrează; conversia pe distanțe rămâne explicită.'
    ] };
    if (empty(line)) return { nodes: [], edges: [], byKey: Object.create(null), errors: [] };
    var copy = JSON.parse(JSON.stringify(line)), rootId = 'plan-linear';
    copy.mod = 'ramuri';
    copy.ramuri = [{ id: rootId, parentId: '', nume: line.nume, L: line.L,
      costManual: true, IL: Number(line.L) * global.AppCalc.lineBl(line) }];
    copy.IL = copy.ramuri[0].IL;
    (copy.racordari || []).forEach(function (r) { r.branchId = rootId; });
    (copy.zoneTehnice || []).forEach(function (z) { z.branchId = rootId; });
    copy.noduriPlan = [];
    return graph(copy);
  }
  function setPortion(line, values) {
    var previous = line.ramuri.filter(function (b) { return b.id === values.id; })[0];
    var rate = global.AppTree.analyze(line).rate;
    var financial = !previous || Number(previous.L) !== values.L ||
      (previous.costManual ? Number(previous.IL) : Number(previous.L) * rate) !== values.IL;
    if (financial) explicitCosts(line);
    var target = previous || { id: values.id, costManual: true, IL: values.IL };
    ['nume', 'L', 'tipLinie', 'finantatorId', 'parentId', 'deLa'].forEach(function (field) { target[field] = values[field]; });
    ['conductor', 'sectiune'].forEach(function (field) {
      if (values[field] !== undefined) target[field] = values[field];
      else if (target[field] === undefined) target[field] = '';
    });
    (line.zoneTehnice || []).forEach(function (zone) {
      if (zone.branchId !== target.id || Number(zone.deLa) !== 0) return;
      ['tipLinie', 'conductor', 'sectiune'].forEach(function (field) {
        if (values[field] !== undefined) zone[field] = values[field];
      });
    });
    if (financial) target.IL = values.IL;
    if (!previous) line.ramuri.push(target);
    if (financial) budget(line);
  }
  global.AppPlan = { graph: graph, display: display, empty: empty, nodeKey: nodeKey,
    explicitCosts: explicitCosts, budget: budget, setPortion: setPortion };
})(window);
