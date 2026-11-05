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
  var useState = global.preactHooks.useState;
  var useRef = global.preactHooks.useRef;

  function users() { return store.state.utilizatori; }
  function uName(u) { return u.nume || u.codPA || 'fără nume'; }
  function reportUserLabel(id) {
    return 'U' + (users().map(function (u) { return u.id; }).indexOf(id) + 1);
  }

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

  /* ----------------------- diagramă linie + editor pe distanțe ----------------------- */

  function userName(id) { var u = S.findUser(store.state, id); return u ? uName(u) : id; }
  function roleOf(id) { var u = S.findUser(store.state, id); return u ? u.rol : 'existent'; }
  var PR_TYPES = [['', 'Nespecificat'], ['post', 'Post de transformare'], ['firida', 'Firidă'],
    ['statie', 'Stație'], ['stalp', 'Stâlp'], ['altul', 'Altul']];

  function technicalLabel(t) {
    return [t.tipLinie, t.conductor, t.sectiune ? t.sectiune + ' mm²' : ''].filter(Boolean).join(' · ');
  }

  function prTypeLabel(tip) {
    var match = PR_TYPES.filter(function (o) { return o[0] === tip && o[0]; })[0];
    return match ? match[1] : 'Punct de racordare';
  }

  function prShort(tip) {
    return { post: 'PT', firida: 'F', statie: 'ST', stalp: 'S', altul: 'PR' }[tip] || 'PR';
  }

  function PRSymbol(props) {
    var x = props.x, y = props.y, tip = (props.data || {}).tip;
    return html`<g class="dl-pr-symbol" role="img" aria-label=${prTypeLabel(tip) + ' ' + ((props.data || {}).denumire || '')}>
      ${tip === 'stalp'
        ? html`<circle cx=${x} cy=${y} r="15" /><line x1=${x - 11} y1=${y} x2=${x + 11} y2=${y} />`
        : html`<rect x=${x - 18} y=${y - 14} width="36" height="28" rx=${tip === 'firida' ? 2 : 5} />
          ${tip === 'post' || tip === 'statie' ? html`<line x1=${x - 10} y1=${y - 5} x2=${x + 10} y2=${y - 5} />
            <line x1=${x - 10} y1=${y + 3} x2=${x + 10} y2=${y + 3} />` : null}`}
      <text x=${x} y=${y + 4}>${prShort(tip)}</text>
    </g>`;
  }

  function TechnicalFields(props) {
    var k = props.path;
    return html`<div class="row2">
      <${K.Field} label="Tip linie" path=${k + 'tipLinie'}><${K.SelectInput} path=${k + 'tipLinie'}
        options=${[['', 'Nespecificat'], ['LEA', 'LEA — aeriană'], ['LES', 'LES — subterană'], ['altul', 'Altul']]} /><//>
      <${K.Field} label="Conductor / cablu" path=${k + 'conductor'}><${K.TextInput} path=${k + 'conductor'} /><//>
      <${K.Field} label="Secțiune (mm²)" path=${k + 'sectiune'}><${K.NumInput} path=${k + 'sectiune'} /><//>
      <${K.Field} label="Observații" path=${k + 'observatii'}><${K.TextInput} path=${k + 'observatii'} /><//>
    </div>`;
  }

  function LineTechnicalEditor(props) {
    var l = props.l;
    var k = 'pr.' + l.id + '.';
    return html`<details class="advanced technical-editor">
      <summary>Originea liniei (PR) și caracteristici tehnice</summary>
      <p class="hint">Date descriptive, fără costuri suplimentare. PR este originea măsurării distanțelor:
        un post sau o firidă descrisă aici nu este inclusă automat în compensație.</p>
      <div class="row2">
        <${K.Field} label="Tip punct de racordare" path=${k + 'tip'}><${K.SelectInput} path=${k + 'tip'} options=${PR_TYPES} /><//>
        <${K.Field} label="Denumire / cod PR" path=${k + 'denumire'}><${K.TextInput} path=${k + 'denumire'} /><//>
        <${K.Field} label="Nivel de tensiune (kV)" path=${k + 'tensiune'}><${K.NumInput} path=${k + 'tensiune'} /><//>
        <${K.Field} label="Observații PR" path=${k + 'observatii'}><${K.TextInput} path=${k + 'observatii'} /><//>
      </div>
      ${l.mod === 'distante' ? html`<div class="technical-zones">
        <h3>Zone tehnice ale liniei</h3>
        <p class="hint">Fiecare zonă începe la distanța indicată și continuă până la următoarea zonă sau la capătul liniei.
          Începe cu 0 m pentru a descrie linia de la PR. Limitele tehnice împart tronsoanele, independent de utilizatori.
          Porțiunea anterioară primei zone rămâne nespecificată. Costurile se calculează în continuare cu același b_L.</p>
        ${(l.zoneTehnice || []).map(function (z, i) {
          var path = 'zona.' + l.id + '.' + z.id + '.';
          return html`<div class="technical-zone" key=${z.id}>
            <div class="toolbar"><strong>Zona tehnică ${i + 1}</strong>
              <button type="button" class="btn tiny danger" onClick=${function () { store.delTechnicalZone(l.id, z.id); }}>Șterge zona</button></div>
            <${K.Field} label="Început zonă — distanță de la PR (m)" path=${path + 'deLa'}><${K.NumInput} path=${path + 'deLa'} ph="0 (originea liniei)" /><//>
            <${TechnicalFields} path=${path} />
          </div>`;
        })}
        <button type="button" class="btn tiny" onClick=${function () { store.addTechnicalZone(l.id); }}>+ Zonă tehnică</button>
      </div>` : l.mod === 'ramuri' ? html`<p class="hint">Caracteristicile și limitele tehnice se editează în inspectorul fiecărei ramuri.</p>` : html`<div>
        <p class="hint">În modul manual, caracteristicile se completează direct pe fiecare tronson. Limitele sunt cele din tabel.</p>
        ${(l.tronsoane || []).filter(function (t) { return t.tip !== 'stalpi'; }).map(function (t) {
          return html`<details class="advanced" key=${t.id}><summary>${t.nume || t.id} — caracteristici</summary>
            <${TechnicalFields} path=${'tronson.' + l.id + '.' + t.id + '.'} /></details>`;
        })}
      </div>`}
    </details>`;
  }

  // Limitele și racordările, indiferent de mod (distanțe sau tronsoane clasice).
  function lineGeo(l, report) {
    var L = Number(l.L) || 0;
    var rec = [], bounds = [];
    if (l.mod === 'distante') {
      rec = (l.racordari || []).filter(function (r) { var d = Number(r.distanta); return r && d > 0 && (!L || d <= L); })
        .map(function (r) { return { userId: r.userId, distanta: Number(r.distanta) }; });
    } else {
      var cum = 0, dist = {};
      (l.tronsoane || []).forEach(function (t) {
        if (!t || t.tip === 'stalpi') return;
        cum += Number(t.lungime) || 0;
        if (report && cum > 0 && bounds.indexOf(cum) < 0) bounds.push(cum);
        (t.utilizatori || []).forEach(function (u) { dist[u] = cum; });
      });
      rec = Object.keys(dist).map(function (u) { return { userId: u, distanta: dist[u] }; });
    }
    rec.forEach(function (r) { if (bounds.indexOf(r.distanta) < 0) bounds.push(r.distanta); });
    if (l.mod === 'distante') {
      (l.zoneTehnice || []).forEach(function (z) {
        var d = Number(z.deLa);
        if (d > 0 && d < L && bounds.indexOf(d) < 0) bounds.push(d);
      });
    }
    if (L > 0 && bounds.indexOf(L) < 0) bounds.push(L);
    bounds.sort(function (a, b) { return a - b; });
    if (!L) L = bounds.length ? bounds[bounds.length - 1] : 0;
    return { L: L, bounds: bounds, rec: rec };
  }

  function LineDiagram(props) {
    var l = props.l;
    var g = lineGeo(l, props.report);
    var drag = useRef(null);
    var editable = l.mod === 'distante';
    var selected = g.rec.filter(function (r) { return r.userId === props.selectedId; })[0];
    if (!g.L || !g.bounds.length) {
      return html`<p class="hint">Diagrama apare după ce completezi lungimea liniei și distanțele de racordare.</p>`;
    }
    var pad = 186, baseY = 72, MINW = 140, AVAIL = 800;
    var bL = C.lineBl(l);
    var regularTronsoane = (l.tronsoane || []).filter(function (t) { return t.tip !== 'stalpi'; });
    var regularInfo = [], regularLength = 0;
    regularTronsoane.forEach(function (t) {
      var length = Number(t.lungime) || 0;
      regularInfo.push({ from: regularLength, to: regularLength + length, tronson: t });
      regularLength += length;
    });
    var technicalZones = (l.zoneTehnice || []).filter(function (z) {
      return z.deLa !== '' && isFinite(Number(z.deLa));
    }).slice().sort(function (a, b) { return Number(a.deLa) - Number(b.deLa); });
    var zoneIndex = 0, technicalIndex = 0, tronsonIndex = 0;

    // Segmente: lățime proporțională cu lungimea, dar cu un minim lizibil.
    var segsData = [], prev = 0;
    g.bounds.forEach(function (b) {
      var len = b - prev;
      var technical = {};
      if (l.mod === 'distante') {
        while (zoneIndex < technicalZones.length && Number(technicalZones[zoneIndex].deLa) <= prev) zoneIndex++;
        if (zoneIndex > 0) technical = technicalZones[zoneIndex - 1];
      } else {
        while (technicalIndex < regularInfo.length && regularInfo[technicalIndex].to <= prev) technicalIndex++;
        var existing = regularInfo[technicalIndex] && regularInfo[technicalIndex].from <= prev
          ? regularInfo[technicalIndex].tronson : null;
        technical = existing || {};
      }
      while (tronsonIndex < regularInfo.length && regularInfo[tronsonIndex].to < b - 1e-6) tronsonIndex++;
      var tronson = regularInfo[tronsonIndex] && Math.abs(regularInfo[tronsonIndex].to - b) < 1e-6
        ? regularInfo[tronsonIndex].tronson : null;
      segsData.push({ from: prev, to: b, len: len, cost: tronson ? C.tronsonCost(l, tronson) : len * bL,
        tipLinie: technical.tipLinie || '', technical: technical, tronson: tronson });
      prev = b;
    });
    var segmentOffset = props.segmentOffset || 0;
    if (props.report) segsData = segsData.slice(segmentOffset, segmentOffset + 3);
    if (!segsData.length) return null;
    var firstDistance = segsData[0].from;
    var lastDistance = segsData[segsData.length - 1].to;
    var distorted = false;
    segsData.forEach(function (s) {
      var prop = g.L > 0 ? (s.len / g.L) * AVAIL : 0;
      s.w = props.report ? 180 : Math.max(MINW, prop);
      if (prop < MINW) distorted = true;
    });
    var totalW = pad * 2 + (props.report ? 540 : segsData.reduce(function (a, s) { return a + s.w; }, 0));

    // Poziția fiecărei limite (distanțe) în pixeli.
    var pos = {}; pos[firstDistance] = pad;
    var acc = pad;
    segsData.forEach(function (s) { acc += s.w; pos[s.to] = acc; });
    var endX = pos[lastDistance];
    segsData.forEach(function (s) { s.x1 = pos[s.from]; s.x2 = pos[s.to]; });
    function xOf(d) { return pos[d] !== undefined ? pos[d] : pad; }
    function distToX(d) {
      for (var i = 0; i < segsData.length; i++) {
        var s = segsData[i];
        if (d <= s.to + 1e-6) return s.x1 + (Math.max(s.from, Math.min(s.to, d)) - s.from) / s.len * s.w;
      }
      return endX;
    }

    // CTM include scalarea și marginile SVG, inclusiv într-un container derulat.
    function distanceAt(ev, svg, precision, min, max) {
      var point = svg.createSVGPoint();
      point.x = ev.clientX; point.y = ev.clientY;
      var x = point.matrixTransform(svg.getScreenCTM().inverse()).x;
      var d = g.L;
      for (var i = 0; i < segsData.length; i++) {
        var s = segsData[i];
        if (x <= s.x2) { d = s.from + Math.max(0, Math.min(1, (x - s.x1) / s.w)) * s.len; break; }
      }
      precision = precision || 1;
      min = min === undefined ? Math.min(1, g.L) : min;
      max = max === undefined ? g.L : max;
      return Math.max(min, Math.min(max, Math.round(d / precision) * precision));
    }

    function onDown(ev, r) {
      if (!editable || ev.button > 0) return;
      ev.preventDefault();
      var circle = ev.currentTarget;
      if (drag.current) return;
      drag.current = { pointerId: ev.pointerId, userId: r.userId, original: r.distanta,
        distance: r.distanta, startX: ev.clientX, startY: ev.clientY, moved: false };
      circle.setPointerCapture(ev.pointerId);
      circle.parentNode.classList.add('dragging');
    }

    function zoneRange(zoneId) {
      var index = -1;
      for (var i = 0; i < technicalZones.length; i++) {
        if (technicalZones[i].id === zoneId) { index = i; break; }
      }
      if (index < 0) return null;
      var min = index ? Number(technicalZones[index - 1].deLa) + 0.1 : 0.1;
      var max = index + 1 < technicalZones.length ? Number(technicalZones[index + 1].deLa) - 0.1 : g.L - 0.1;
      return { min: Math.max(0.1, min), max: Math.min(g.L - 0.1, max) };
    }

    function zonePoints(x) {
      return x + ',' + (baseY - 12) + ' ' + (x + 6) + ',' + (baseY - 6) + ' ' +
        x + ',' + baseY + ' ' + (x - 6) + ',' + (baseY - 6);
    }

    function onZoneDown(ev, zone) {
      if (props.tool !== 'zones' || ev.button > 0) {
        if (props.onSelectZone) props.onSelectZone(zone.id);
        ev.stopPropagation();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      var group = ev.currentTarget;
      if (drag.current) return;
      var range = zoneRange(zone.id);
      drag.current = { kind: 'zone', pointerId: ev.pointerId, zoneId: zone.id,
        original: Number(zone.deLa), distance: Number(zone.deLa), range: range,
        startX: ev.clientX, startY: ev.clientY, moved: false };
      group.setPointerCapture(ev.pointerId);
      group.classList.add('dragging');
    }

    function onZoneKey(ev, zone) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      ev.preventDefault();
      ev.stopPropagation();
      if (props.onSelectZone) props.onSelectZone(zone.id);
    }

    function preview(circle, d) {
      var group = circle.parentNode;
      var cx = distToX(d);
      circle.setAttribute('cx', cx);
      group.querySelector('.dl-name').setAttribute('x', cx);
      var label = group.querySelector('.dl-m');
      label.setAttribute('x', cx);
      label.textContent = d + ' m';
    }

    function onMove(ev) {
      var current = drag.current;
      if (!current || ev.pointerId !== current.pointerId) return;
      if (Math.abs(ev.clientX - current.startX) + Math.abs(ev.clientY - current.startY) < 3 && !current.moved) return;
      current.moved = true;
      if (current.kind === 'zone') {
        if (!current.range || current.range.max < current.range.min) return;
        current.distance = distanceAt(ev, ev.currentTarget.ownerSVGElement, 0.1,
          current.range.min, current.range.max);
        var group = ev.currentTarget;
        var x = distToX(current.distance);
        group.querySelector('.dl-zone-guide').setAttribute('x1', x);
        group.querySelector('.dl-zone-guide').setAttribute('x2', x);
        group.querySelector('.dl-zone-marker').setAttribute('points', zonePoints(x));
      } else {
        current.distance = distanceAt(ev, ev.currentTarget.ownerSVGElement);
        preview(ev.currentTarget, current.distance);
      }
    }

    function onEnd(ev, cancel) {
      var current = drag.current;
      if (!current || ev.pointerId !== current.pointerId) return;
      drag.current = null;
      var target = ev.currentTarget;
      if (current.kind === 'zone') {
        target.classList.remove('dragging');
        var originalX = distToX(current.original);
        target.querySelector('.dl-zone-guide').setAttribute('x1', originalX);
        target.querySelector('.dl-zone-guide').setAttribute('x2', originalX);
        target.querySelector('.dl-zone-marker').setAttribute('points', zonePoints(originalX));
        if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId);
        if (cancel) return;
        if (props.onSelectZone) props.onSelectZone(current.zoneId);
        if (current.moved && current.distance !== current.original && props.onMoveZone) {
          props.onMoveZone(current.zoneId, current.distance);
        }
      } else {
        target.parentNode.classList.remove('dragging');
        preview(target, current.original);
        if (target.hasPointerCapture(ev.pointerId)) target.releasePointerCapture(ev.pointerId);
        if (!cancel) {
          if (props.onSelect) props.onSelect(current.userId);
          if (current.moved && current.distance !== current.original) {
            store.pushUndo();
            store.setRacordare(l.id, current.userId, current.distance);
          }
        }
      }
    }

    var segs = segsData.map(function (s, i) {
      var x1 = pos[s.from], x2 = pos[s.to], xm = (x1 + x2) / 2;
      var t = s.tronson || {};
      var contribution = props.contributions && props.contributions[t.id];
      var selectedSegment = props.selectedTronsonId === t.id;
      var segName = t.nume || ('Tronson ' + (i + 1));
      var startLabel = s.from.toLocaleString('ro-RO') + ' m';
      var endLabel = s.to.toLocaleString('ro-RO') + ' m';
      var clickLabel = props.tool === 'place' ? 'Racordează utilizatorul selectat' :
        props.tool === 'zones' ? 'Adaugă limită tehnică' : 'Selectează tronsonul';
      return html`<g key=${'s' + i}>
        <title>${segName}, ${startLabel}–${endLabel}, ${technicalLabel(s.technical)} · ${clickLabel}</title>
        <line x1=${x1} y1=${baseY} x2=${x2} y2=${baseY}
          class=${'dl-seg' + (s.tipLinie ? ' tip-' + s.tipLinie : '') +
            (selected && selected.distanta >= s.to ? ' dl-route' : '') +
            (contribution ? ' dl-compensated' : '') +
            (selectedSegment ? ' dl-segment-selected' : '')} />
        ${props.onPlace ? html`<line x1=${x1} y1=${baseY} x2=${x2} y2=${baseY} class="dl-place"
          tabindex="0" role="button" aria-label=${segName + ', ' + startLabel + '–' + endLabel + '. ' + clickLabel}
          onClick=${function (e) {
            if (props.tool === 'zones' && props.onAddZone) props.onAddZone(distanceAt(e, e.currentTarget.ownerSVGElement, 0.1, 0.1, g.L - 0.1));
            else if (props.tool === 'place') props.onPlace(distanceAt(e, e.currentTarget.ownerSVGElement));
            else if (props.onSegmentSelect && s.tronson) props.onSegmentSelect(s.tronson.id);
          }}
          onKeyDown=${function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            if (props.tool === 'zones' && props.onAddZone) props.onAddZone(Math.max(0.1, Math.min(g.L - 0.1, Math.round((s.from + s.to) * 5) / 10)));
            else if (props.tool === 'place') props.onPlace(Math.max(1, Math.round((s.from + s.to) / 2)));
            else if (props.onSegmentSelect && s.tronson) props.onSegmentSelect(s.tronson.id);
          }}>
          <title>${clickLabel}</title>
        </line>` : null}
        ${selectedSegment ? html`<text x=${xm} y=${baseY + 53} class="dl-inspector-label">Selectat</text>` : null}
        <line x1=${x1} y1=${baseY - 6} x2=${x1} y2=${baseY + 6} class="dl-tick" />
        <text x=${xm} y=${baseY - 34} class="dl-tnum">T${segmentOffset + i + 1}</text>
        ${contribution ? html`<text x=${xm} y=${baseY - 50} class="dl-compensation-label">Comp. ${money(contribution.total)} lei</text>` : null}
        <text x=${xm} y=${baseY - 18} class="dl-lab">${money(s.len)} m · ${money(s.cost)} lei</text>
      </g>`;
    });
    var zoneMarkers = technicalZones.filter(function (zone) {
      return Number(zone.deLa) > 0 && Number(zone.deLa) >= firstDistance && Number(zone.deLa) <= lastDistance;
    }).map(function (zone) {
      var x = distToX(Number(zone.deLa));
      var selectedZone = zone.id === props.selectedZoneId;
      return html`<g key=${zone.id} class=${'dl-zone-handle' + (selectedZone ? ' dl-zone-selected' : '')}
        tabindex=${props.report ? null : '0'} role=${props.report ? null : 'button'} aria-pressed=${props.report ? null : selectedZone}
        aria-label=${'Limită tehnică la ' + zone.deLa + ' m'}
        onPointerDown=${function (e) { onZoneDown(e, zone); }}
        onPointerMove=${onMove} onPointerUp=${function (e) { onEnd(e, false); }}
        onPointerCancel=${function (e) { onEnd(e, true); }}
        onLostPointerCapture=${function (e) { onEnd(e, true); }}
        onClick=${function (e) { e.stopPropagation(); if (props.onSelectZone) props.onSelectZone(zone.id); }}
        onKeyDown=${function (e) { onZoneKey(e, zone); }}>
        <line x1=${x} y1=${baseY - 15} x2=${x} y2=${baseY + 8} class="dl-zone-guide" />
        <polygon points=${zonePoints(x)} class="dl-zone-marker"><title>Limită tehnică la ${zone.deLa} m</title></polygon>
      </g>`;
    });

    // Utilizatori: la aceeași distanță, etichetele se stivuiesc vertical.
    var seen = {};
    var sorted = g.rec.filter(function (r) {
      return r.distanta >= firstDistance && r.distanta <= lastDistance;
    }).sort(function (a, b) { return a.distanta - b.distanta; });
    var usersG = sorted.map(function (r, i) {
      var d = Number(r.distanta);
      var cx = xOf(d);
      var k = seen[d] || 0; seen[d] = k + 1;
      var y0 = baseY + 26 + k * 30;
      return html`<g key=${r.userId}>
        <circle cx=${cx} cy=${baseY} r=${props.selectedId === r.userId ? 11 : 8}
          class=${'dl-user rol-' + roleOf(r.userId) + (props.selectedId === r.userId ? ' dl-selected' : '')}
          tabindex=${props.onSelect ? '0' : null} role=${props.onSelect ? 'button' : null}
          aria-label=${userName(r.userId) + ', ' + d + ' m'}
          aria-pressed=${props.onSelect ? props.selectedId === r.userId : null}
          onClick=${function () { if (props.onSelect) props.onSelect(r.userId); }}
          onKeyDown=${function (e) {
            if (!props.onSelect) return;
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onSelect(r.userId); }
            if (editable && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
              e.preventDefault();
              var next = Math.max(Math.min(1, g.L), Math.min(g.L, d + (e.key === 'ArrowRight' ? 1 : -1)));
              if (next !== d) { store.pushUndo(); store.setRacordare(l.id, r.userId, next); }
            }
          }}
          onPointerDown=${function (e) { if (!props.report) onDown(e, r); }}
          onPointerMove=${onMove} onPointerUp=${function (e) { onEnd(e, false); }}
          onPointerCancel=${function (e) { onEnd(e, true); }}
          onLostPointerCapture=${function (e) { onEnd(e, true); }} />
        <text x=${cx} y=${y0} class="dl-name">${props.report ? reportUserLabel(r.userId) : userName(r.userId)}</text>
        <text x=${cx} y=${y0 + 15} class="dl-m">${d} m</text>
      </g>`;
    });
    var maxStack = 1;
    Object.keys(seen).forEach(function (k) { if (seen[k] > maxStack) maxStack = seen[k]; });
    var H = 132 + (maxStack - 1) * 30;

    var vlist = segsData.map(function (s, i) {
      var at = g.rec.filter(function (r) { return Number(r.distanta) === s.to; });
      return html`<li key=${'v' + i}><strong>T${i + 1}</strong> — ${money(s.from)}–${money(s.to)} m · ${money(s.cost)} lei
        ${s.tipLinie ? ' · ' + s.tipLinie : ''}${at.length ? html` · ${at.map(function (r) { return userName(r.userId); }).join(', ')}` : null}</li>`;
    });

    return html`<div class="diagram-wrap">
      <svg class="diagram" viewBox=${'0 0 ' + totalW + ' ' + H}
        style=${!props.report && totalW > 900 ? { minWidth: totalW + 'px' } : null}
        role=${props.onSelect ? 'group' : 'img'} aria-label="Schema liniei, de la punctul de racordare la capăt">
        ${firstDistance === 0 ? html`<text x="6" y=${baseY - 13} class="dl-origin-label">PR · ${prTypeLabel((l.punctRacordare || {}).tip)}</text>
          <text x="6" y=${baseY + 4} class="dl-origin-name">${(l.punctRacordare || {}).denumire || 'Origine linie'}</text>
          <text x="6" y=${baseY + 20} class="dl-origin-voltage">${(l.punctRacordare || {}).tensiune ? l.punctRacordare.tensiune + ' kV' : ''}</text>
          <${PRSymbol} x=${pad - 22} y=${baseY} data=${l.punctRacordare || {}} />` :
          html`<text x="6" y=${baseY} class="dl-origin-label">Continuare de la ${firstDistance} m</text>`}
        <line x1=${pad} y1=${baseY} x2=${endX} y2=${baseY} class="dl-base" />
        ${segs}
        ${zoneMarkers}
        <line x1=${endX} y1=${baseY - 6} x2=${endX} y2=${baseY + 6} class="dl-tick" />
        ${usersG}
      </svg>
    </div>
    ${props.report ? null : html`<ol class="diagram-vlist" aria-label="Tronsoane (listă)">${vlist}</ol>
    <p class="hint">${distorted ? 'Schemă orientativă — nu este la scară (segmentele scurte au lățime minimă). ' : ''}
      ${props.tool === 'zones' ? 'Apasă pe linie pentru a adăuga o limită; trage un marcaj pentru a-l muta. Distanța exactă se editează în inspector.' :
        editable ? 'Trage de cerc pentru a muta un utilizator pe linie. Distanțele numerice determină calculul.' : 'Schemă orientativă; alocările se editează în tabel.'}</p>`}`;
  }

  function RacordareInput(props) {
    var l = props.l;
    var rec = (l.racordari || []).filter(function (x) { return x.userId === props.userId; })[0];
    var value = rec ? rec.distanta : '';
    var id = props.id || ('distance-' + l.id + '-' + props.userId);
    var draft = useRef({ text: null, last: undefined });
    var r = draft.current;
    var focused = document.activeElement && document.activeElement.id === id;
    // O salvare asincronă nu trebuie să rescrie distanța încă neconfirmată.
    if (r.text === null || (value !== r.last && !focused)) r.text = String(value);
    r.last = value;
    return html`<input type="number" min=${Math.min(1, Number(l.L) || 1)} max=${Number(l.L) > 0 ? l.L : null}
      step="any" inputmode="decimal" data-guide=${'dist:' + l.id + ':' + props.userId}
      value=${r.text} placeholder="—" id=${id}
      aria-label=${'Distanța de la punctul de racordare (PR) pentru ' + userName(props.userId) + ' (m)'}
      onInput=${function (e) { r.text = e.target.value; }}
      onChange=${function (e) {
        r.text = e.target.value;
        if (!e.target.reportValidity()) return;
        store.setRacordare(l.id, props.userId, e.target.value);
      }} />`;
  }

  function DistEditor(props) {
    var l = props.l;
    var us = users();
    if (!us.length) return html`<p class="muted">Adaugă mai întâi utilizatori în pasul „2 · Utilizatori”.</p>`;
    return html`<div class="dist-editor">
      <p class="hint">Setează <strong>distanța de la punctul de racordare (PR) în metri</strong> pentru fiecare utilizator. Tronsoanele și costurile se generează automat.
        Gol = utilizatorul nu e racordat pe această linie.</p>
      <div class="dist-rows">
        ${us.map(function (u) {
          return html`<label class="dist-row" key=${u.id}>
            <span class="dist-name"><span class=${'dot rol-' + u.rol}></span>${uName(u)} <span class="muted">(${V.ROL_LABEL[u.rol]})</span></span>
            <span class="dist-input">
              <${RacordareInput} l=${l} userId=${u.id} /> <span class="muted">m</span>
            </span>
          </label>`;
        })}
      </div>
    </div>`;
  }

  function LineScheme(props) {
    var l = props.l;
    var selection = useState('');
    var selectedId = selection[0], select = selection[1];
    var segmentSelection = useState('');
    var selectedTronsonId = segmentSelection[0], selectTronson = segmentSelection[1];
    var zoneSelection = useState('');
    var selectedZoneId = zoneSelection[0], selectZone = zoneSelection[1];
    var toolState = useState('inspect');
    var tool = toolState[0], setTool = toolState[1];
    var u = S.findUser(store.state, selectedId);
    var selectedTronson = (l.tronsoane || []).filter(function (t) { return t.id === selectedTronsonId; })[0];
    var selectedZone = (l.zoneTehnice || []).filter(function (z) { return z.id === selectedZoneId; })[0];
    var compensation = u && S.newIds(store.state).indexOf(u.id) >= 0 && ['line', 'complex'].indexOf(store.state.meta.model) >= 0
      ? C.runCalculation(store.state) : null;
    var contributions = Object.create(null);
    if (compensation && !compensation.error) {
      (compensation.explicatii || []).forEach(function (item) {
        if (item.de !== u.id || item.lineId !== l.id) return;
        if (!contributions[item.tronsonId]) contributions[item.tronsonId] = { total: 0, items: [] };
        contributions[item.tronsonId].total += item.suma;
        contributions[item.tronsonId].items.push(item);
      });
    }
    function moveZone(id, d) {
      var moved = store.moveTechnicalZone(l.id, id, d);
      if (!moved) store.toast('Limita nu poate coincide cu o altă limită sau depăși linia.', 'error');
      return moved;
    }
    if (l.mod !== 'distante') return html`<div class="scheme-legacy">
      <p>Această linie folosește tronsoane introduse manual.</p>
      <p class="hint">Editorul grafic necesită racordări pe distanțe. Conversia regenerează tronsoanele și costurile;
        alocările speciale și costurile manuale pot fi înlocuite. Tabelul rămâne disponibil fără conversie.</p>
      <button type="button" class="btn" onClick=${function () {
        if (!global.confirm('Conversia pe distanțe regenerează tronsoanele și costurile automate și poate schimba alocările manuale. Continui? Poți reveni cu „Anulează”.')) return;
        store.pushUndo();
        store.convertLine(l.id);
      }}>Pregătește linia pentru schemă</button>
    </div>`;
    var rec = {};
    (l.racordari || []).forEach(function (r) { rec[r.userId] = r.distanta; });
    var path = u ? 'user.' + u.id + '.' : '';
    var fieldPrefix = 'scheme-' + l.id + '-' + selectedId + '-';
    return html`<div class="line-scheme">
      <section class="scheme-palette" aria-label="Utilizatori de racordat">
        <h3>Utilizatori</h3>
        <p class="hint">Selectează un utilizator, apoi apasă pe linie sau introdu distanța.</p>
        <button type="button" class="btn tiny" onClick=${function () {
          store.addUser();
          select(users()[users().length - 1].id);
        }}>+ Adaugă utilizator</button>
        <div class="scheme-users">${users().map(function (item) {
          return html`<button type="button" key=${item.id} class="scheme-user"
            aria-pressed=${item.id === selectedId} onClick=${function () {
              select(item.id); selectTronson(''); selectZone(''); setTool('place');
            }}>
            <span class=${'dot rol-' + item.rol}></span>
            <span><strong>${uName(item)}</strong><small>${V.ROL_LABEL[item.rol]} · ${rec[item.id] != null ? rec[item.id] + ' m' : 'neracordat'}</small></span>
          </button>`;
        })}</div>
        ${(l.zoneTehnice || []).length ? html`<h4>Zone tehnice</h4>
          <div class="scheme-zone-list" aria-label="Selectează o zonă tehnică">
            ${(l.zoneTehnice || []).map(function (zone, index) {
              return html`<button type="button" class="btn tiny" key=${zone.id}
                aria-pressed=${zone.id === selectedZoneId} onClick=${function () {
                  selectZone(zone.id); selectTronson('');
                }}>Zona ${index + 1} · ${zone.deLa === '' ? 'distanță lipsă' : zone.deLa + ' m'}</button>`;
            })}
          </div>` : null}
      </section>
      <section class=${'scheme-canvas tool-' + tool} aria-label="Schemă monofilară">
        <h3>${l.nume || 'Linie'} · PR ${(l.punctRacordare || {}).denumire || ''} → capăt</h3>
        <p class="hint">${PR_TYPES.filter(function (o) { return o[0] === (l.punctRacordare || {}).tip && o[0]; }).map(function (o) { return o[1]; }).join('')}
          ${(l.punctRacordare || {}).tensiune ? ' · ' + l.punctRacordare.tensiune + ' kV' : ''}</p>
        <div class="toolbar scheme-mode scheme-tools" role="group" aria-label="Acțiunea pe schemă">
          <button type="button" class="btn tiny" aria-pressed=${tool === 'inspect'} onClick=${function () { setTool('inspect'); }}>Selectează tronson</button>
          <button type="button" class="btn tiny" aria-pressed=${tool === 'place'} disabled=${!u}
            onClick=${function () { if (u) setTool('place'); }}>Racordează utilizator</button>
          <button type="button" class="btn tiny" aria-pressed=${tool === 'zones'} onClick=${function () { setTool('zones'); selectTronson(''); }}>
            Editează limite</button>
        </div>
        <${LineLegend} />
        ${Number(l.L) > 0 ? html`<${LineDiagram} l=${l} selectedId=${selectedId} selectedTronsonId=${selectedTronsonId}
          contributions=${contributions}
          selectedZoneId=${selectedZoneId}
          tool=${tool} onSelect=${function (id) { select(id); selectTronson(''); selectZone(''); }}
          onSelectZone=${function (id) { selectZone(id); selectTronson(''); }}
          onSegmentSelect=${function (id) { selectTronson(id); selectZone(''); }}
          onAddZone=${function (d) {
            if (d <= 0 || d >= Number(l.L)) { store.toast('Alege o poziție între 0 m și capătul liniei.', 'error'); return; }
            var id = store.addTechnicalZone(l.id, d);
            if (!id) { store.toast('Există deja o limită tehnică la această distanță.', 'error'); return; }
            selectZone(id); selectTronson('');
          }}
          onMoveZone=${moveZone}
          onPlace=${function (d) {
            if (!u) { store.toast('Selectează mai întâi un utilizator din listă.', 'info'); return; }
            if (Number(rec[u.id]) === d) return;
            store.pushUndo();
            store.setRacordare(l.id, u.id, d);
          }} />` : html`<p class="hint">Completează lungimea totală L de mai sus pentru a desena linia.</p>`}
        <p class="hint">Selectează un tronson pentru detalii; pentru o racordare, selectează utilizatorul și schimbă acțiunea.
          Din tastatură, folosește Tab și Enter. Poziția grafică nu stabilește rolul sau ordinea racordării.</p>
        ${compensation ? html`<${LineCompensation} l=${l} user=${u} result=${compensation} contributions=${contributions}
          onSelect=${function (id) { selectTronson(id); selectZone(''); setTool('inspect'); }} />` : null}
        <${TronsonTable} l=${l} selectedId=${selectedId} selectedTronsonId=${selectedTronsonId}
          contributions=${contributions}
          onSelect=${function (id) { selectTronson(id); selectZone(''); }} />
      </section>
      <section class="scheme-properties" aria-label=${selectedZone ? 'Proprietăți zonă tehnică' : selectedTronson ? 'Proprietăți tronson' : 'Proprietăți utilizator'}>
        ${selectedZone ? html`<${TechnicalZoneInspector} l=${l} zone=${selectedZone} onMoveZone=${moveZone}
          onClose=${function () { selectZone(''); }}
          onDelete=${function () { store.delTechnicalZone(l.id, selectedZone.id); selectZone(''); }} />` :
          selectedTronson ? html`<${TronsonInspector} l=${l} t=${selectedTronson}
          onUser=${function (id) { select(id); selectTronson(''); selectZone(''); setTool('place'); }}
          onClose=${function () { selectTronson(''); }} />` : html`<div>
        <h3>Proprietăți utilizator</h3>
        ${u ? html`<div key=${u.id}>
          <${K.Field} label="Nume / denumire" path=${path + 'nume'} id=${fieldPrefix + 'nume'}><${K.TextInput} path=${path + 'nume'} id=${fieldPrefix + 'nume'} /><//>
          <${K.Field} label="Cod PA" path=${path + 'codPA'} id=${fieldPrefix + 'codPA'}><${K.TextInput} path=${path + 'codPA'} id=${fieldPrefix + 'codPA'} /><//>
          <${K.Field} label="Rol" path=${path + 'rol'} id=${fieldPrefix + 'rol'}><${K.SelectInput} path=${path + 'rol'} id=${fieldPrefix + 'rol'}
            options=${Object.keys(V.ROL_LABEL).map(function (role) { return [role, V.ROL_LABEL[role]]; })} /><//>
          <${K.Field} label="Putere aprobată (kVA)" path=${path + 'putere'} id=${fieldPrefix + 'putere'}><${K.NumInput} path=${path + 'putere'} id=${fieldPrefix + 'putere'} /><//>
          <${K.Field} label="Distanță de la PR (m)" path=${'dist:' + l.id + ':' + u.id} id=${fieldPrefix + 'distanta'}>
            <${RacordareInput} l=${l} userId=${u.id} id=${fieldPrefix + 'distanta'} />
          <//>
          <${K.Field} label="Data ATR" path=${path + 'dataATR'} id=${fieldPrefix + 'dataATR'}><${K.DateInput} path=${path + 'dataATR'} id=${fieldPrefix + 'dataATR'} /><//>
          <${K.Field} label="Data achitare TR" path=${path + 'dataTR'} id=${fieldPrefix + 'dataTR'}><${K.DateInput} path=${path + 'dataTR'} id=${fieldPrefix + 'dataTR'} /><//>
          <p class="hint">Datele utilizatorului sunt comune tuturor liniilor. Contractul și celelalte avize se completează în pasul „Utilizatori”.</p>
          <button type="button" class="btn tiny danger" disabled=${rec[u.id] == null} onClick=${function () {
            store.pushUndo(); store.setRacordare(l.id, u.id, '');
          }}>Deconectează de pe linie</button>
        </div>` : html`<p class="hint">Selectează un utilizator din listă sau din schemă pentru a-i edita datele.</p>`}
        </div>`}
      </section>
    </div>`;
  }

  function LineLegend() {
    return html`<ul class="dl-legend" aria-label="Legendă tip linie">
      <li><span class="dl-legend-line lea"></span>LEA — linie aeriană</li>
      <li><span class="dl-legend-line les"></span>LES — linie subterană</li>
      <li><span class="dl-legend-line unknown"></span>Tip nespecificat / altul</li>
      <li><span class="dl-zone-key">◆</span>Limită tehnică</li>
    </ul>`;
  }

  function LineCompensation(props) {
    var result = props.result;
    if (result.error) return html`<section class="line-compensation">
      <h3>Compensația pentru ${uName(props.user)}</h3>
      <p class="warn">${result.blocked ? 'Calcul blocat: condițiile cumulative nu sunt îndeplinite.' : 'Datele proiectului trebuie corectate înainte de calcul.'}</p>
      <p>${result.error}</p>
      <button type="button" class="btn tiny" onClick=${function () { store.calculate(); store.setTab('rezultate'); }}>Verifică în Rezultate</button>
    </section>`;
    var entries = (props.l.tronsoane || []).filter(function (t) { return !!props.contributions[t.id]; });
    var total = entries.reduce(function (sum, t) { return sum + props.contributions[t.id].total; }, 0);
    var informative = (result.conditions || []).some(function (c) { return !c.ok; });
    var projectTotal = result.central.perNou[props.user.id];
    return html`<section class="line-compensation" aria-label="Explicația vizuală a compensației">
      <h3>Compensația pentru ${uName(props.user)}</h3>
      ${informative ? html`<p class="warn"><strong>INFORMATIV — condițiile nu sunt îndeplinite; sumele nu sunt datorate.</strong></p>` : null}
      <p><strong class="line-compensation-total">Total pe această linie: ${money(total)} lei fără TVA</strong></p>
      <p class="hint">Tronsoanele care contribuie la plată sunt marcate cu roșu și „Comp.”.
        Albastrul indică traseul utilizatorului, nu automat o compensație.
        Sumele sunt preluate din motorul de calcul, în ordinea utilizatorilor noi din proiect.</p>
      ${entries.length ? html`<ul class="line-compensation-items">${entries.map(function (t) {
        var entry = props.contributions[t.id];
        return html`<li key=${t.id}>
          <button type="button" class="linkish" onClick=${function () { props.onSelect(t.id); }}>${t.nume || t.id}</button>
          <strong> — ${money(entry.total)} lei</strong>
          <ul>${entry.items.map(function (item) {
            return html`<li>Către ${userName(item.catre)}:
              ${money(item.cost)} / ${item.inainte} − ${money(item.cost)} / ${item.dupa}
              = <strong>${money(item.suma)} lei</strong> <${K.RefChip} id=${item.rule} /></li>`;
          })}</ul>
        </li>`;
      })}</ul>` : html`<p>Nicio compensație de plată pe această linie pentru utilizatorul selectat.</p>`}
      <p class="hint">Total în proiect (toate liniile): ${money(projectTotal ? projectTotal.faraTVA : 0)} lei fără TVA.
        Centralizatorul rotunjește sumele cumulate pe beneficiar; valorile afișate pe tronsoane pot avea diferențe de rotunjire.</p>
    </section>`;
  }

  function LineReport(props) {
    var l = props.l;
    if (l.mod === 'ramuri') return html`<${V.TreeReport} l=${l} />`;
    var g = lineGeo(l, true);
    var chunks = [];
    for (var i = 0; i < g.bounds.length; i += 3) chunks.push(i);
    var pr = l.punctRacordare || {};
    var from = 0;
    var reportUsers = users().filter(function (u) {
      return g.rec.some(function (r) { return r.userId === u.id; }) ||
        (l.tronsoane || []).some(function (t) { return (t.utilizatori || []).indexOf(u.id) >= 0; });
    });
    return html`<section class="line-report">
      <h3>Schema liniei — ${l.nume || l.id}</h3>
      <p>PR: ${prTypeLabel(pr.tip)} · ${pr.denumire || 'denumire nespecificată'}
        ${pr.tensiune ? ' · ' + pr.tensiune + ' kV' : ''}${pr.observatii ? ' · ' + pr.observatii : ''}</p>
      <p class="hint">Schemă orientativă, nu este la scară. Distanțele sunt măsurate de la PR.
        ${l.mod !== 'distante' ? 'În modul manual, cercul indică ultimul tronson al utilizatorului; alocările exacte sunt în tabel.' : ''}</p>
      ${chunks.map(function (offset, index) {
        return html`<figure class="line-report-block" key=${offset}>
          <figcaption>${l.nume || l.id} · partea ${index + 1}/${chunks.length} ·
            ${offset ? g.bounds[offset - 1] : 0}–${g.bounds[Math.min(offset + 2, g.bounds.length - 1)]} m de la PR</figcaption>
          <${LineDiagram} l=${l} report=${true} segmentOffset=${offset} />
          <${LineLegend} />
        </figure>`;
      })}
      <h4>Utilizatori în schemă</h4>
      <ul class="line-report-users">${reportUsers.map(function (u) {
        var rec = g.rec.filter(function (r) { return r.userId === u.id; })[0];
        return html`<li key=${u.id}><strong>${reportUserLabel(u.id)}</strong> — ${uName(u)}
          ${u.codPA ? ' · PA ' + u.codPA : ''} · ${V.ROL_LABEL[u.rol]}${rec ? ' · ' + rec.distanta + ' m' : ''}</li>`;
      })}</ul>
      <table class="grid line-report-table">
        <caption>Tronsoane, caracteristici și alocări — ${l.nume || l.id}</caption>
        <thead><tr><th scope="col">Tronson / interval de la PR</th><th scope="col">Caracteristici tehnice</th>
          <th scope="col">Lungime / cost</th><th scope="col">Utilizatori</th></tr></thead>
        <tbody>${(l.tronsoane || []).map(function (t) {
          var start = from;
          if (t.tip !== 'stalpi') from += Number(t.lungime) || 0;
          return html`<tr key=${t.id}>
            <td>${t.nume || t.id}<br />${t.tip === 'stalpi' ? 'Circuit pe stâlpi existenți' : start + '–' + from + ' m'}</td>
            <td>${technicalLabel(t)}${t.observatii ? html`<br />${t.observatii}` : null}</td>
            <td>${t.tip === 'stalpi' ? '—' : money(Number(t.lungime) || 0) + ' m'}<br />${money(C.tronsonCost(l, t))} lei</td>
            <td>${(t.utilizatori || []).map(reportUserLabel).join(', ') || 'Niciun utilizator'}</td>
          </tr>`;
        })}</tbody>
      </table>
    </section>`;
  }

  function ZoneDistanceInput(props) {
    var zone = props.zone;
    var id = 'zone-distance-' + props.l.id + '-' + zone.id;
    var value = Number(zone.deLa);
    var draft = useRef({ text: null, last: undefined });
    var r = draft.current;
    var focused = document.activeElement && document.activeElement.id === id;
    if (r.text === null || (r.last !== value && !focused)) r.text = String(zone.deLa).replace('.', ',');
    r.last = value;
    function restore() {
      r.text = String(props.zone.deLa).replace('.', ',');
      r.last = Number(props.zone.deLa);
      store.render();
    }
    return html`<${K.Field} label="Început zonă — distanță de la PR (m)" id=${id}>
      <input type="text" inputmode="decimal" id=${id} value=${r.text} aria-label="Început zonă — distanță de la PR (m)"
        onInput=${function (e) { r.text = e.target.value; }}
        onKeyDown=${function (e) { if (e.key === 'Enter') e.target.blur(); }}
        onBlur=${function (e) {
          var text = e.target.value.trim();
          var d = Number(text.replace(',', '.'));
          if (!text || !isFinite(d) || d < 0 || d >= Number(props.l.L)) {
            store.toast('Introdu o distanță de la 0 m până înainte de capătul liniei.', 'error');
            restore();
            return;
          }
          if (Math.abs(d - Number(props.zone.deLa)) < 1e-6) { r.text = text; return; }
          r.last = d;
          if (!props.onMoveZone(props.zone.id, d)) restore();
        }} />
    <//>`;
  }

  function TechnicalZoneInspector(props) {
    var zone = props.zone;
    return html`<div class="tronson-inspector zone-inspector">
      <div class="toolbar"><h3>Proprietăți zonă tehnică</h3>
        <button type="button" class="btn tiny ghost" aria-label="Închide detaliile zonei" onClick=${props.onClose}>×</button></div>
      <strong>${zone.tipLinie === 'LEA' ? 'LEA — linie aeriană' : zone.tipLinie === 'LES' ? 'LES — linie subterană' : zone.tipLinie || 'Tip nespecificat'}</strong>
      <${ZoneDistanceInput} l=${props.l} zone=${zone} onMoveZone=${props.onMoveZone} />
      <dl>
        <dt>Conductor / cablu</dt><dd>${zone.conductor || 'Nespecificat'}</dd>
        <dt>Secțiune</dt><dd>${zone.sectiune ? zone.sectiune + ' mm²' : 'Nespecificată'}</dd>
        ${zone.observatii ? html`<dt>Observații</dt><dd>${zone.observatii}</dd>` : null}
      </dl>
      <p class="hint">Limita împarte tronsoanele, independent de poziția utilizatorilor. Costul se recalculează după noua delimitare.</p>
      <button type="button" class="btn tiny ghost" onClick=${function () {
        var editor = document.querySelector('.technical-editor');
        if (editor) { editor.open = true; editor.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }}>Editează caracteristicile zonei</button>
      <button type="button" class="btn tiny danger" onClick=${props.onDelete}>Șterge limita tehnică</button>
    </div>`;
  }

  function TronsonInspector(props) {
    var l = props.l, t = props.t;
    var at = (t.utilizatori || []).map(function (id) { return S.findUser(store.state, id); }).filter(Boolean);
    return html`<div class="tronson-inspector">
      <div class="toolbar"><h3>Proprietăți tronson</h3>
        <button type="button" class="btn tiny ghost" aria-label="Închide detaliile tronsonului" onClick=${props.onClose}>×</button></div>
      <strong>${t.nume || 'Tronson'}</strong>
      <dl>
        <dt>De la PR</dt><dd>${money((l.tronsoane || []).slice(0, (l.tronsoane || []).indexOf(t))
          .reduce(function (sum, x) { return x.tip === 'stalpi' ? sum : sum + (Number(x.lungime) || 0); }, 0))} m</dd>
        <dt>Lungime</dt><dd>${money(Number(t.lungime) || 0)} m</dd>
        <dt>Cost</dt><dd>${money(C.tronsonCost(l, t))} lei</dd>
        <dt>Tip linie</dt><dd>${t.tipLinie === 'LEA' ? 'LEA — aeriană' : t.tipLinie === 'LES' ? 'LES — subterană' : t.tipLinie || 'Nespecificat'}</dd>
        <dt>Conductor / cablu</dt><dd>${t.conductor || 'Nespecificat'}</dd>
        <dt>Secțiune</dt><dd>${t.sectiune ? t.sectiune + ' mm²' : 'Nespecificată'}</dd>
        ${t.observatii ? html`<dt>Observații</dt><dd>${t.observatii}</dd>` : null}
      </dl>
      <h4>Utilizatori care folosesc tronsonul</h4>
      ${at.length ? html`<ul class="inspector-users">${at.map(function (user) {
        return html`<li key=${user.id}><button type="button" class="linkish" onClick=${function () { props.onUser(user.id); }}>
          ${uName(user)} — ${V.ROL_LABEL[user.rol]}</button></li>`;
      })}</ul>` : html`<p class="hint">Niciun utilizator nu folosește acest tronson.</p>`}
      <p class="hint">Caracteristicile tehnice sunt descriptive. Costul este calculat automat din lungime și b_L.</p>
      <button type="button" class="btn tiny ghost" onClick=${function () {
        var editor = document.querySelector('.technical-editor');
        if (editor) { editor.open = true; editor.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }}>Editează datele tehnice ale liniei</button>
    </div>`;
  }

  // Tabel read-only cu tronsoanele derivate (modul avansat).
  function TronsonTable(props) {
    var l = props.l;
    var trs = l.tronsoane || [];
    if (!trs.length) return html`<p class="muted">Niciun tronson generat (nicio distanță setată).</p>`;
    return html`<div class="table-wrap"><table class="grid">
      <caption class="sr-only">Tronsoane: lungime, cost și utilizatori</caption>
      <thead><tr><th scope="col">Tronson</th><th scope="col">Lungime (m)</th><th scope="col">Cost (lei)</th><th scope="col">Utilizatori care îl folosesc</th></tr></thead>
      <tbody>${trs.map(function (t) {
        var contribution = props.contributions && props.contributions[t.id];
        return html`<tr key=${t.id} class=${(props.selectedTronsonId === t.id ? 'scheme-tronson-selected ' : '') +
          (props.selectedId && (t.utilizatori || []).indexOf(props.selectedId) >= 0 ? 'scheme-user-route ' : '') +
          (contribution ? 'scheme-compensated' : '')}>
          <td>${props.onSelect ? html`<button type="button" class="linkish" aria-pressed=${props.selectedTronsonId === t.id}
            onClick=${function () { props.onSelect(t.id); }}>${t.nume || t.id}</button>` : t.nume || t.id}
            ${t.tip === 'stalpi' ? html` <${K.RefChip} id="art15.1" />` : null}
            <div class="hint">${technicalLabel(t)}</div>${t.observatii ? html`<div class="hint">${t.observatii}</div>` : null}</td>
          <td class="num">${t.tip === 'stalpi' ? '—' : money(Number(t.lungime) || 0)}</td>
          <td class="num">${money(C.tronsonCost(l, t))}
            ${contribution ? html`<div class="hint">Compensație: ${money(contribution.total)} lei</div>` : null}</td>
          <td>${(t.utilizatori || []).map(function (u) { return html`<span class="chip-s">${userName(u)}</span>`; })}</td>
        </tr>`;
      })}</tbody></table></div>`;
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
      <caption class="sr-only">Tronsoane și utilizatorii care le folosesc</caption>
      <thead><tr>
        <th scope="col">Tronson</th><th scope="col">Lungime (m) <${K.Info} k="tronson.lungime" /></th><th scope="col">Cost (lei) <${K.Info} k="tronson.cost" /></th>
        ${us.map(function (u) {
          return html`<th scope="col" class=${'ucol rol-' + u.rol} title=${V.ROL_LABEL[u.rol]}><div class="uname">${uName(u)}</div><div class="urol">${V.ROL_LABEL[u.rol]}</div></th>`;
        })}
        <th scope="col">Toți</th><th scope="col" aria-label="Acțiuni"></th>
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
    var mode = useState(!!props.initialScheme);
    var scheme = (p.meta.model === 'line' || complex) && mode[0];
    K.useRevealTarget(function (key) {
      if (['dist:' + id + ':', 'tronson.' + id + '.', 'cell:' + id + ':'].some(function (prefix) { return key.indexOf(prefix) === 0; }) ||
        key === 'btn:add-tronson:' + id) mode[1](false);
    });
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
        <${K.Field} label="② Lungime totală L (m)" path=${'line.' + id + '.L'} info="line.L">${l.mod === 'ramuri'
          ? html`<output>${l.L} m — suma ramurilor</output>` : html`<${K.NumInput} path=${'line.' + id + '.L'} />`}<//>
        <${K.Field} label="③ Cost specific b_L (lei/m)" path=${'line.' + id + '.bL'} info="line.bL">
          ${l.mod === 'ramuri' ? html`<output>${money(bL)} lei/m — ramuri automate</output>` : html`<${K.NumInput} path=${'line.' + id + '.bL'} />`}
          <button type="button" class="linkish bL-auto" hidden=${!l.bLManual} onClick=${function () { store.setLineBlAuto(id); }}>↺ automat = I_L / L</button>
        <//>
      </div>
      <p class="hint">${l.mod === 'ramuri' ? 'După deducerea costurilor proprii, restul investiției se distribuie pe lungimea ramurilor automate.' : 'Costul fiecărui tronson = lungime × b_L.'}
        <strong> <span data-line-bl=${id}>${money(bL)}</span> lei/m</strong>. <${K.RefChip} id="art12.1" />
        <span data-line-status=${id}>${lineStatus(l)}</span></p>
      <${TranzDetails} kind="line" x=${l} />
      <${LineTechnicalEditor} l=${l} />
      ${(p.meta.model === 'line' || complex) && l.mod === 'distante' ? html`<div class="toolbar">
        <button type="button" class="btn tiny" onClick=${function () {
          if (global.confirm('Transformi linia într-o rețea cu ramuri și subramuri, fără bucle? Racordările și limitele existente se păstrează pe linia principală. Poți reveni cu „Anulează”.')) store.convertTree(id);
        }}>→ Rețea cu ramuri</button>
      </div>` : null}
      ${(p.meta.model === 'line' || complex) && l.mod !== 'ramuri' ? html`<div class="toolbar scheme-mode" role="group" aria-label="Mod de introducere">
        <button type="button" class="btn tiny" aria-pressed=${!scheme} onClick=${function () { mode[1](false); }}>Formular / tabel</button>
        <button type="button" class="btn tiny" aria-pressed=${scheme} onClick=${function () { mode[1](true); }}>Schemă</button>
      </div>` : null}
      ${l.mod === 'ramuri' ? html`<${V.TreeEditor} l=${l} />` : scheme ? html`<${LineScheme} l=${l} />` : html`<div>
      <${LineDiagram} l=${l} />
      ${l.mod === 'distante' ? html`<div>
        <div class="toolbar"><strong>Puncte de racordare</strong>
          <button type="button" class="btn tiny" title="Art. 15 alin. 1: al doilea circuit pe stâlpii unei linii aeriene existente" onClick=${function () { store.addStalpi(id); }}>+ Circuit pe stâlpi existenți</button>
        </div>
        <${DistEditor} l=${l} />
        <details class="advanced"><summary>Mod avansat — tronsoane derivate (${(l.tronsoane || []).length})</summary><${TronsonTable} l=${l} /></details>
      </div>` : html`<div>
        <div class="toolbar"><strong>Tronsoane și utilizatori</strong>
          <button type="button" class="btn tiny" data-guide=${'btn:add-tronson:' + id} onClick=${function () { store.addTronson(id); }}>+ Tronson</button>
          <button type="button" class="btn tiny" title="Art. 15 alin. 1: al doilea circuit pe stâlpii unei linii aeriene existente" onClick=${function () { store.addStalpi(id); }}>+ Circuit pe stâlpi existenți</button>
          <button type="button" class="btn tiny ghost" onClick=${function () { store.autoAllTronsoane(id); }}>↺ Recalculează toate</button>
          <button type="button" class="btn tiny" onClick=${function () { store.convertLine(id); }} title="Trece linia la editorul pe distanțe (puncte de racordare)">→ Editează pe distanțe</button>
        </div>
        <${AllocMatrix} l=${l} />
      </div>`}
      </div>`}
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

  // Diagrama stației: bară proporțională cu puterile aprobate + capacitatea liberă.
  function StationDiagram(props) {
    var s = props.s;
    var us = users().filter(function (u) { return (s.utilizatori || []).indexOf(u.id) >= 0; });
    var Sn = Number(s.Sn) || 0, rez = Number(s.SnRezerva) || 0;
    var cap = Math.max(0, Sn - rez);
    var bT = cap > 0 ? (Number(s.IT) || 0) / cap : 0;
    var total = us.reduce(function (a, u) { return a + (Number(u.putere) || 0); }, 0);
    if (!Sn && !total) {
      return html`<p class="hint">Completează S_n și puterile aprobate pentru a vedea diagrama stației.</p>`;
    }
    var base = Math.max(cap, total, 1);
    var free = Math.max(0, cap - total);
    return html`<div class="st-diagram">
      <div class="st-head">Capacitate efectivă <strong>${money(cap)} kVA</strong>${rez > 0 ? ' (S_n ' + money(Sn) + ' − rezervă ' + money(rez) + ')' : ''}
        · ocupat <strong>${money(total)} kVA</strong>${free > 0 ? ' · liber ' + money(free) + ' kVA' : ''}</div>
      <div class="st-bar" role="img" aria-label="Repartiția puterii aprobate pe utilizatori">
        ${us.map(function (u) {
          var pu = Number(u.putere) || 0;
          if (pu <= 0) return null;
          return html`<span class=${'st-seg rol-' + u.rol} style=${{ width: Math.max(0, Math.min(100, pu / base * 100)) + '%' }} title=${uName(u) + ': ' + money(pu) + ' kVA'}></span>`;
        })}
        ${free > 0 ? html`<span class="st-free" style=${{ width: Math.max(0, Math.min(100, free / base * 100)) + '%' }} title=${'liber: ' + money(free) + ' kVA'}></span>` : null}
      </div>
      <ul class="st-legend">
        ${us.map(function (u) {
          var pu = Number(u.putere) || 0;
          return html`<li key=${u.id}><span class=${'dot rol-' + u.rol}></span>${uName(u)}
            <span class="muted">${money(pu)} kVA${bT > 0 ? ' · ' + money(pu * bT) + ' lei' : ''}</span></li>`;
        })}
      </ul>
      <p class="hint">b_T = I_T / S_n efectiv = ${money(Number(s.IT) || 0)} / ${money(cap)} = <strong>${money(bT)} lei/kVA</strong>.</p>
    </div>`;
  }

  function StationCard(props) {
    var s = props.s;
    var id = s.id;
    var p = store.state;
    var complex = p.meta.model === 'complex';
    var included = p.complexConfig.statiiIds.indexOf(id) >= 0;
    var k = 'stat.' + id + '.';
    var noi = S.newIds(p);
    var mode = useState(!!props.initialScheme), scheme = (p.meta.model === 'station' || complex) && mode[0];
    return html`<div class="card station-card" key=${id}>
      <div class="card-head">
        <${K.TextInput} path=${k + 'nume'} label="Denumire stație / PT" ph="Denumire stație / PT" />
        ${complex ? html`<label class="chk"><input type="checkbox" checked=${included} onChange=${function (e) { store.setStationIncluded(id, e.target.checked); }} /> Inclusă în instalația complexă</label>` : null}
        <button type="button" class="btn tiny danger" onClick=${function () { store.delStation(id); }}>Șterge</button>
      </div>
      ${(p.meta.model === 'station' || complex) ? html`<div class="toolbar scheme-mode" role="group" aria-label="Mod de introducere stație">
        <button type="button" class="btn tiny" aria-pressed=${!scheme} onClick=${function () { mode[1](false); }}>Formular / tabel</button>
        <button type="button" class="btn tiny" aria-pressed=${scheme} onClick=${function () { mode[1](true); }}>Schemă</button>
      </div>` : null}
      ${complex && Number(p.complexConfig.varianta) === 2 ? html`<p class="hint">Varianta 2 include numai echipamentele comune;
        datele transformatorului se păstrează pentru celelalte variante, dar nu intră în calcul.</p>` : null}
      ${scheme ? (complex && Number(p.complexConfig.varianta) === 2
        ? html`<${V.EquipmentInspector} s=${s} embedded=${true} />` : html`<${V.StationScheme} s=${s} />`) : html`<div>
      <div class="row3">
        <${K.Field} label="Capacitate nominală S_n (kVA)" path=${k + 'Sn'} info="stat.Sn"><${K.NumInput} path=${k + 'Sn'} /><//>
        <${K.Field} label="Transformator de rezervă N-1 (kVA)" path=${k + 'SnRezerva'} info="stat.SnRezerva"><${K.NumInput} path=${k + 'SnRezerva'} /><//>
        <${K.Field} label="Cost lucrări I_T (lei)" path=${k + 'IT'} info="stat.IT"><${K.NumInput} path=${k + 'IT'} /><//>
      </div>
      <div class="row2">
        <${K.Field} label="Echipamente comune, altele decât transformatoare (lei)" path=${k + 'elementeComune'} info="stat.elementeComune"><${K.NumInput} path=${k + 'elementeComune'} /><//>
        <${K.Field} label="Întărire post" info="stat.intarire" id=${'f-' + id + '-int'}><${K.CheckInput} path=${k + 'intarire'} label="Transformator înlocuit / al doilea transformator" /><//>
      </div>
      <${StationDiagram} s=${s} />
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
      </div>`}
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
    3: 'Varianta 3 — racordare pe linia U2, în aval de stație. Anexa 1 (l_U1) + Anexa 2 (stație/PT) + echipamentele comune ale stației (cote egale).',
    4: 'Varianta 4 — racordare pe linia U2, mai departe. Anexa 1 (l_U1) + Anexa 2 (stație/PT) + echipamentele comune ale stației (cote egale) + Anexa 1 (l_U2).'
  };

  /* --- schema de ansamblu: PR → l_U1 → stație → l_U2, cu marcajele variantelor --- */

  // Poziția marcajelor pe traseu (coordonată x în viewBox-ul de 1000 px) și descrierea lor.
  var CX_VARIANTS = [
    { n: 1, x: 160, where: 'pe linia U1, în amonte de stație' },
    { n: 2, x: 306, where: 'la bara U1 a stației' },
    { n: 3, x: 654, where: 'pe linia U2, imediat în aval de stație' },
    { n: 4, x: 880, where: 'pe linia U2, mai departe de stație' }
  ];

  function cxLines(p, ids) {
    var list = (ids || []).map(function (id) { return C.byId(p.linii, id); }).filter(Boolean);
    return {
      list: list,
      L: list.reduce(function (s, l) { return s + (Number(l.L) || 0); }, 0),
      IL: list.reduce(function (s, l) { return s + (Number(l.IL) || 0); }, 0)
    };
  }
  function cxStation(p, ids) {
    var list = (ids || []).map(function (id) { return C.byId(p.statii, id); }).filter(Boolean);
    return list[0] || null;
  }
  function cxLineText(x) {
    if (!x.list.length) return 'neinclusă';
    return K.fmtNum(x.L) + ' m · ' + money(x.IL) + ' lei';
  }

  // Selectarea variantei din butoane: același efect ca selectorul existent, dar fără să
  // mute pasul ghidului (utilizatorul rămâne în „Instalație”, pe schemă).
  function cxPick(n) {
    store.mutate(function (p) {
      p.complexConfig.varianta = String(n);
      p.complexConfig.variantaConfirmata = true;
    }, { undo: true, noFocus: true });
  }

  function cxMarker(o, active, baseY) {
    return html`<g key=${'mk' + o.n} class=${'cx-mk' + (active ? ' active' : '')}>
      <line x1=${o.x} y1=${baseY + 6} x2=${o.x} y2=${baseY + 27} class="cx-mk-stem" />
      <circle cx=${o.x} cy=${baseY + 40} r="13" />
      <text x=${o.x} y=${baseY + 45}>${o.n}</text>
    </g>`;
  }

  function ComplexScheme() {
    var p = store.state;
    var c = p.complexConfig;
    var v = Number(c.varianta) || 3;
    var u1 = cxLines(p, c.liniiIds);
    var u2 = cxLines(p, c.liniiU2Ids);
    var st = cxStation(p, c.statiiIds);
    var baseY = 92;

    // Avertismente: varianta aleasă cere componente care lipsesc (nu blochează calculul).
    var warns = [];
    if (!u1.list.length) warns.push('Varianta ' + v + ' necesită cel puțin o linie l_U1 inclusă în instalația complexă.');
    if (v >= 2 && !st) warns.push('Varianta ' + v + ' necesită o stație / PT inclusă în instalația complexă.');
    if (v === 4 && !u2.list.length) warns.push('Varianta 4 necesită o linie l_U2 inclusă în instalația complexă.');

    var snEf = st ? (Number(st.Sn) || 0) - (Number(st.SnRezerva) || 0) : 0;
    var stSn = st ? 'S_n = ' + K.fmtNum(st.Sn) + ' kVA' + (Number(st.SnRezerva) > 0 ? ' (efectiv ' + K.fmtNum(snEf) + ' kVA)' : '') : '';
    var stIT = st ? 'I_T = ' + money(st.IT) + ' lei' : '';

    var stName = String(st && st.nume || 'Stație / PT');
    if (stName.length > 34) stName = stName.slice(0, 33) + '…';

    var stationSvg = st
      ? html`<g class="cx-st">
          <rect x="330" y=${baseY - 50} width="300" height="100" rx="12" />
          <text x="480" y=${baseY - 26} class="cx-st-name">${stName}</text>
          <text x="480" y=${baseY + 1} class="cx-st-val">${stSn}</text>
          <text x="480" y=${baseY + 22} class="cx-st-val">${stIT}</text>
          ${Number(st.elementeComune) > 0 ? html`<text x="480" y=${baseY + 41} class="cx-st-note">echipamente comune ${money(st.elementeComune)} lei</text>` : null}
        </g>`
      : html`<g class="cx-st empty">
          <rect x="330" y=${baseY - 50} width="300" height="100" rx="12" />
          <text x="480" y=${baseY - 4} class="cx-st-name">Stație / PT neinclusă</text>
          <text x="480" y=${baseY + 20} class="cx-st-note">variantele 2–4 o cer</text>
        </g>`;

    var buttons = CX_VARIANTS.map(function (o) {
      var on = v === o.n;
      return html`<button type="button" key=${o.n} class=${'cx-variant' + (on ? ' active' : '')} data-variant=${o.n}
        aria-pressed=${on ? 'true' : 'false'}
        aria-label=${'Varianta ' + o.n + ' — racordare ' + o.where}
        onClick=${function () { cxPick(o.n); }}>
        <span class="cx-vnum" aria-hidden="true">${o.n}</span>
        <span class="cx-vtext"><strong>Varianta ${o.n}</strong><span class="cx-vwhere">${o.where}</span></span>
      </button>`;
    });

    // Legenda: ce componente se însumează în varianta aleasă.
    var legend = [html`<li key="u1"><strong>Anexa 1 — linia l_U1</strong> <span class="muted">${cxLineText(u1)}</span></li>`];
    if (v === 2) {
      legend.push(html`<li key="eq"><strong>Echipamentele stației</strong> <span class="muted">în cote egale între utilizatorii care au contribuit <${K.RefChip} id="art12.1" /></span></li>`);
    }
    if (v >= 3) {
      legend.push(html`<li key="a2"><strong>Anexa 2 — stația / PT</strong> <span class="muted">${st ? stSn + ' · ' + stIT : 'stație neinclusă'}</span></li>`);
      legend.push(html`<li key="com"><strong>Echipamentele comune ale stației</strong> <span class="muted">în cote egale</span></li>`);
    }
    if (v === 4) {
      legend.push(html`<li key="u2"><strong>Anexa 1 — linia l_U2</strong> <span class="muted">${cxLineText(u2)}</span></li>`);
    }

    return html`<section class="cx-scheme" data-variant=${v} aria-labelledby="cx-title">
      <div class="cx-scheme-head">
        <strong id="cx-title">Schema de ansamblu</strong>
        <span class="muted">Punctul de racordare (PR) → linia l_U1 → stația T → linia l_U2. Marcajele 1–4 arată variantele.</span>
      </div>
      <div class="cx-canvas">
        <svg viewBox="0 32 1000 122" aria-hidden="true" focusable="false">
          <text x="2" y=${baseY + 5} class="cx-pr">PR</text>
          <circle cx="34" cy=${baseY} r="5" class="cx-pr-dot" />
          <line x1="34" y1=${baseY} x2="330" y2=${baseY} class=${'cx-line cx-u1' + (u1.list.length ? '' : ' cx-off')} />
          <text x="182" y=${baseY - 26} class="cx-lab">${'L_U1 · ' + cxLineText(u1)}</text>
          <line x1="630" y1=${baseY} x2="964" y2=${baseY} class=${'cx-line cx-u2' + (u2.list.length ? '' : ' cx-off')} />
          <text x="797" y=${baseY - 26} class="cx-lab">${'L_U2 · ' + cxLineText(u2)}</text>
          <line x1="964" y1=${baseY - 8} x2="964" y2=${baseY + 8} class="cx-tick" />
          <text x="970" y=${baseY + 4} class="cx-end">capăt</text>
          ${stationSvg}
          ${CX_VARIANTS.map(function (o) { return cxMarker(o, v === o.n, baseY); })}
        </svg>
      </div>
      <div class="cx-variants" role="group" aria-label="Varianta punctului de racordare">${buttons}</div>
      ${warns.length ? html`<ul class="cx-warns">${warns.map(function (w, i) { return html`<li class="cx-warn" key=${i}>${w}</li>`; })}</ul>` : null}
      <div class="cx-legend">
        <p class="cx-legend-title">Ce intră în calcul la <strong>varianta ${v}</strong>:</p>
        <ul>${legend}</ul>
      </div>
    </section>`;
  }

  function ComplexView() {
    var p = store.state;
    var c = p.complexConfig;
    var v = Number(c.varianta) || 3;
    var mode = useState(false);
    return html`<${V.Panel} k="instalatie-complex" title="Anexa 3 — instalație de racordare complexă" help=${HELP.STEPS.instalatie.complex}>
      <${K.Field} label="Varianta punctului de racordare" path="complex.varianta" info="complex.varianta">
        <select id="f-complex_varianta" data-bind="complex.varianta" aria-label="Varianta punctului de racordare" value=${String(v)}
          onChange=${function (e) { cxPick(Number(e.target.value)); }}>
          ${[1, 2, 3, 4].map(function (n) { return html`<option value=${String(n)} key=${n}>Varianta ${n}</option>`; })}
        </select>
      <//>
      <p class="hint">${VARIANT_TEXT[v]} <${K.RefChip} id="anexa3" /></p>
      <${V.ModelMode} value=${mode[0]} onChange=${mode[1]} />
      ${mode[0] ? html`<${V.ComplexWorkspace} />` : html`<div>
      <${ComplexScheme} />
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
      </div>`}
    <//>`;
  }

  /* ----------------------- Anexa 4 pct. A și Anexa 5 ----------------------- */

  function TransitionalView() {
    var mode = useState(false);
    return html`<${V.Panel} k="instalatie-tranz" title="Anexa 4 pct. A — compensație după vechea metodologie (Ord. 28/2003)" help=${HELP.STEPS.instalatie.transitional}>
      <${V.ModelMode} value=${mode[0]} onChange=${mode[1]} />
      ${mode[0] ? html`<${V.TransitionalScheme} />` : html`<div>
      <div class="row3">
        <${K.Field} label="Componenta B din tariful de racordare (lei)" path="tranz.B" info="tranz.B"><${K.NumInput} path="tranz.B" /><//>
        <${K.Field} label="Capacitatea instalației S (kVA)" path="tranz.S" info="tranz.S"><${K.NumInput} path="tranz.S" /><//>
        <${K.Field} label="Puterea noului utilizator S₂ (kVA)" path="tranz.S2" info="tranz.S2"><${K.NumInput} path="tranz.S2" /><//>
        <${K.Field} label="Lungimea folosită l₂ (m)" path="tranz.l2" info="tranz.l2"><${K.NumInput} path="tranz.l2" /><//>
        <${K.Field} label="Lungimea totală L (m)" path="tranz.L" info="tranz.L"><${K.NumInput} path="tranz.L" /><//>
      </div>
      <p class="hint">b = B / S ; C₂ = S₂ · b · (l₂ / L). <${K.RefChip} id="anexa4" /></p>
      </div>`}
    <//>`;
  }

  function DeveloperView() {
    var d = store.state.dezvoltator;
    var mode = useState(false);
    return html`<${V.Panel} k="instalatie-dev" title="Anexa 5 — rețea publică finanțată de un prim dezvoltator" help=${HELP.STEPS.instalatie.developer}>
      <${V.ModelMode} value=${mode[0]} onChange=${mode[1]} />
      ${mode[0] ? html`<${V.DeveloperScheme} />` : html`<div>
      <div class="row2">
        <${K.Field} label="Valoarea totală a investiției I_total (lei)" path="dev.Itotal" info="dev.Itotal"><${K.NumInput} path="dev.Itotal" /><//>
        <${K.Field} label="Cota de eficiență I_ef (lei)" path="dev.Ief" info="dev.Ief"><${K.NumInput} path="dev.Ief" /><//>
      </div>
      <div class="toolbar"><strong>Dezvoltatori / utilizatori</strong>
        <button type="button" class="btn tiny" data-guide="btn:add-dev" onClick=${store.addDev}>+ Adaugă</button></div>
      <div class="table-wrap"><table class="grid responsive">
        <caption class="sr-only">Dezvoltatori: denumire, putere aprobată și acțiuni</caption>
        <thead><tr><th scope="col">Denumire</th><th scope="col">Putere aprobată (kVA) <${K.Info} k="dev.putere" /></th><th scope="col"><span class="sr-only">Acțiuni</span></th></tr></thead>
        <tbody>${(d.dezvoltatori || []).length ? d.dezvoltatori.map(function (x) {
          return html`<tr key=${x.id}>
            <td data-label="Denumire"><${K.TextInput} path=${'devitem.' + x.id + '.nume'} label="Denumire dezvoltator" /></td>
            <td data-label="Putere (kVA)"><${K.NumInput} path=${'devitem.' + x.id + '.putere'} label="Putere aprobată (kVA)" /></td>
            <td><button type="button" class="btn tiny danger" onClick=${function () { store.delDev(x.id); }}>Șterge</button></td>
          </tr>`;
        }) : html`<tr><td colspan="3" class="empty">Niciun dezvoltator.</td></tr>`}</tbody></table></div>
      <p class="hint">X_ef = I_ef / I_total ; X_inef = 1 − X_ef ; X_D = X_inef · P_D / P_total. <${K.RefChip} id="anexa5" /></p>
      </div>`}
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
  V.LineReport = LineReport;
  V.LineCompensation = LineCompensation;
  V.LineLegend = LineLegend;
  V.PRSymbol = PRSymbol;
  V.LineCard = LineCard;
  V.StationCard = StationCard;
  V.SpecialCircuits = function (props) {
    var l = Object.assign({}, props.l, { tronsoane: (props.l.tronsoane || []).filter(function (t) { return t.tip === 'stalpi'; }) });
    return html`<details class="advanced"><summary>Circuite pe stâlpi existenți (art. 15 alin. 1)</summary>
      <button type="button" class="btn tiny" onClick=${function () { store.addStalpi(l.id); }}>+ Circuit pe stâlpi existenți</button>
      <${AllocMatrix} l=${l} />
    </details>`;
  };
})(typeof window !== 'undefined' ? window : this);
