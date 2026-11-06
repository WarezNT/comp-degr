/*
 * Rețea radială: distanțe locale pe ramuri, trasee unice spre PR și costuri
 * distribuite din investiția totală, după deducerea costurilor proprii.
 */
(function (global) {
  'use strict';

  function number(value) {
    return value !== '' && value !== null && value !== undefined && isFinite(Number(value));
  }

  function analyze(line) {
    var branches = line.ramuri || [], errors = [], byId = Object.create(null);
    var length = 0, fixed = 0, autoLength = 0, roots = [];
    function error(text) { errors.push(text); }
    branches.forEach(function (b) {
      if (!b.id || byId[b.id]) error('Identificator de ramură lipsă sau duplicat.');
      byId[b.id] = b;
      if (!b.parentId) roots.push(b);
      if (!number(b.L) || Number(b.L) <= 0) error('Ramura „' + b.nume + '”: lungimea trebuie să fie pozitivă.');
      else {
        length += Number(b.L);
        if (!b.costManual) autoLength += Number(b.L);
      }
      if (b.costManual) {
        if (!number(b.IL) || Number(b.IL) < 0) error('Ramura „' + b.nume + '”: cost propriu invalid.');
        else fixed += Number(b.IL);
      }
    });
    if (roots.length !== 1) error('Rețeaua trebuie să aibă exact o ramură de origine la PR.');
    if (!isFinite(length)) error('Lungimea fizică totală depășește domeniul numeric acceptat.');
    branches.forEach(function (b) {
      if (b.parentId) {
        var parent = byId[b.parentId];
        if (!parent || !number(b.deLa) || Number(b.deLa) < 0 || Number(b.deLa) > Number(parent.L)) {
          error('Ramura „' + b.nume + '”: punctul de desprindere trebuie să fie pe ramura părinte.');
        }
      }
      var seen = Object.create(null), node = b;
      while (node) {
        if (seen[node.id]) { error('Rețeaua conține o buclă.'); break; }
        seen[node.id] = true;
        node = node.parentId ? byId[node.parentId] : null;
      }
    });
    if (!number(line.IL) || Number(line.IL) < 0) error('Investiția totală trebuie să fie un număr nenegativ.');
    if (fixed > Number(line.IL) + 1e-6) error('Costurile proprii depășesc investiția totală I_L.');
    if (!autoLength && Math.abs(fixed - Number(line.IL)) > 1e-6) error('Când toate ramurile au cost propriu, suma lor trebuie să fie egală cu I_L.');
    var rate = autoLength > 0 ? (Number(line.IL) - fixed) / autoLength : 0;
    var records = line.racordari || [], userSeen = Object.create(null);
    records.forEach(function (r) {
      var b = byId[r.branchId];
      if (!b || !number(r.distanta) || Number(r.distanta) < 0 || Number(r.distanta) > Number(b.L)) error('Racordare în afara ramurii sau ramură inexistentă.');
      if (userSeen[r.userId]) error('Un utilizator poate avea o singură racordare în această rețea.');
      userSeen[r.userId] = true;
    });
    var zoneSeen = Object.create(null);
    (line.zoneTehnice || []).forEach(function (z) {
      var b = byId[z.branchId], key = z.branchId + ':' + Number(z.deLa);
      if (!b || !number(z.deLa) || Number(z.deLa) < 0 || Number(z.deLa) >= Number(b.L)) error('Limită tehnică în afara ramurii.');
      if (zoneSeen[key]) error('Limite tehnice duplicate pe aceeași ramură.');
      zoneSeen[key] = true;
    });
    var planSeen = Object.create(null);
    (line.noduriPlan || []).forEach(function (n) {
      var b = byId[n.branchId], key = n.branchId + ':' + Number(n.distanta);
      if (!b || !number(n.distanta) || Number(n.distanta) < 0 || Number(n.distanta) > Number(b.L)) error('Nod de planșă în afara porțiunii.');
      if (planSeen[key]) error('Noduri de planșă duplicate în același punct.');
      planSeen[key] = true;
    });
    var result = { errors: errors, length: length, rate: rate, byId: byId, roots: roots, routes: [], segments: [] };
    if (errors.length) return result;
    records.forEach(function (r) {
      var path = [], b = byId[r.branchId], distance = Number(r.distanta), total = 0;
      while (b) {
        path.push({ branchId: b.id, to: distance });
        total += distance;
        distance = Number(b.deLa);
        b = b.parentId ? byId[b.parentId] : null;
      }
      result.routes.push({ userId: r.userId, path: path, distance: total });
    });
    branches.forEach(function (b) {
      var bounds = [Number(b.L)], zones = (line.zoneTehnice || []).filter(function (z) { return z.branchId === b.id; })
        .slice().sort(function (a, c) { return Number(a.deLa) - Number(c.deLa); });
      function bound(d) { if (d > 0 && bounds.indexOf(d) < 0) bounds.push(d); }
      records.forEach(function (r) { if (r.branchId === b.id) bound(Number(r.distanta)); });
      branches.forEach(function (child) { if (child.parentId === b.id) bound(Number(child.deLa)); });
      zones.forEach(function (z) { bound(Number(z.deLa)); });
      bounds.sort(function (a, c) { return a - c; });
      var prev = 0;
      bounds.forEach(function (to, index) {
        var tech = b;
        zones.forEach(function (z) { if (Number(z.deLa) <= prev) tech = z; });
        var at = result.routes.filter(function (route) {
          return route.path.some(function (part) { return part.branchId === b.id && part.to >= to; });
        }).map(function (route) { return route.userId; });
        result.segments.push({
          id: 'trs-' + line.id + '-' + b.id + '-' + index, branchId: b.id,
          deLa: prev, panaLa: to, nume: b.nume + ' · ' + prev + '–' + to + ' m',
          lungime: to - prev, cost: (to - prev) * (b.costManual ? Number(b.IL) / Number(b.L) : rate),
          costManual: true, utilizatori: at, tipLinie: tech.tipLinie || '',
          conductor: tech.conductor || '', sectiune: tech.sectiune || '', observatii: tech.observatii || ''
        });
        prev = to;
      });
    });
    return result;
  }

  global.AppTree = { analyze: analyze };
})(typeof window !== 'undefined' ? window : this);
