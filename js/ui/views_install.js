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

  /* ----------------------- diagramă linie + editor pe distanțe ----------------------- */

  function userName(id) { var u = S.findUser(store.state, id); return u ? uName(u) : id; }
  function roleOf(id) { var u = S.findUser(store.state, id); return u ? u.rol : 'existent'; }

  // Limitele și racordările, indiferent de mod (distanțe sau tronsoane clasice).
  function lineGeo(l) {
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
        (t.utilizatori || []).forEach(function (u) { dist[u] = cum; });
      });
      rec = Object.keys(dist).map(function (u) { return { userId: u, distanta: dist[u] }; });
    }
    rec.forEach(function (r) { if (bounds.indexOf(r.distanta) < 0) bounds.push(r.distanta); });
    if (L > 0 && bounds.indexOf(L) < 0) bounds.push(L);
    bounds.sort(function (a, b) { return a - b; });
    if (!L) L = bounds.length ? bounds[bounds.length - 1] : 0;
    return { L: L, bounds: bounds, rec: rec };
  }

  function LineDiagram(props) {
    var l = props.l;
    var g = lineGeo(l);
    if (!g.L || !g.bounds.length) {
      return html`<p class="hint">Diagrama apare după ce completezi lungimea liniei și distanțele de racordare.</p>`;
    }
    var pad = 46, baseY = 72, MINW = 140, AVAIL = 800;
    var bL = C.lineBl(l);

    // Segmente: lățime proporțională cu lungimea, dar cu un minim lizibil.
    var segsData = [], prev = 0;
    g.bounds.forEach(function (b) {
      var len = b - prev;
      segsData.push({ from: prev, to: b, len: len, cost: len * bL });
      prev = b;
    });
    var distorted = false;
    segsData.forEach(function (s) {
      var prop = g.L > 0 ? (s.len / g.L) * AVAIL : 0;
      s.w = Math.max(MINW, prop);
      if (prop < MINW) distorted = true;
    });
    var totalW = pad * 2 + segsData.reduce(function (a, s) { return a + s.w; }, 0);

    // Poziția fiecărei limite (distanțe) în pixeli.
    var pos = {}; pos[0] = pad;
    var acc = pad;
    segsData.forEach(function (s) { acc += s.w; pos[s.to] = acc; });
    var endX = pos[g.L];
    segsData.forEach(function (s) { s.x1 = pos[s.from]; s.x2 = pos[s.to]; });
    function xOf(d) { return pos[d] !== undefined ? pos[d] : pad; }
    function distToX(d) {
      for (var i = 0; i < segsData.length; i++) {
        var s = segsData[i];
        if (d <= s.to + 1e-6) return s.x1 + (Math.max(s.from, Math.min(s.to, d)) - s.from) / s.len * s.w;
      }
      return endX;
    }

    // Tragere de cerc: mută utilizatorul pe linie (snap la 1 m), apoi salvează.
    function onDown(ev, r) {
      if (ev.button > 0) return;
      ev.preventDefault();
      var circle = ev.currentTarget;
      var gEl = circle.parentNode;
      var svg = circle.ownerSVGElement;
      var pid = ev.pointerId;
      try { circle.setPointerCapture(pid); } catch (e) { /* ignorat */ }
      gEl.classList.add('dragging');
      var nameEl = gEl.querySelector('.dl-name');
      var mEl = gEl.querySelector('.dl-m');
      function move(e2) {
        var rect = svg.getBoundingClientRect();
        var vb = svg.viewBox && svg.viewBox.baseVal;
        var x = (e2.clientX - rect.left) * (vb && rect.width ? vb.width / rect.width : 1);
        var d = g.L;
        for (var i = 0; i < segsData.length; i++) {
          var s = segsData[i];
          if (x <= s.x2) { d = s.from + Math.max(0, Math.min(1, (x - s.x1) / s.w)) * s.len; break; }
        }
        d = Math.max(1, Math.min(g.L, Math.round(d)));
        var cx = distToX(d);
        circle.setAttribute('cx', cx);
        if (nameEl) nameEl.setAttribute('x', cx);
        if (mEl) { mEl.setAttribute('x', cx); mEl.textContent = d + ' m'; }
      }
      function up() {
        try { circle.releasePointerCapture(pid); } catch (e) { /* ignorat */ }
        gEl.classList.remove('dragging');
        circle.removeEventListener('pointermove', move);
        circle.removeEventListener('pointerup', up);
        circle.removeEventListener('pointercancel', up);
        var dd = mEl ? parseInt(String(mEl.textContent).replace(/[^0-9]/g, ''), 10) : NaN;
        if (isFinite(dd) && dd > 0) store.setRacordare(l.id, r.userId, dd);
      }
      circle.addEventListener('pointermove', move);
      circle.addEventListener('pointerup', up);
      circle.addEventListener('pointercancel', up);
      move(ev);
    }

    var segs = segsData.map(function (s, i) {
      var x1 = pos[s.from], x2 = pos[s.to], xm = (x1 + x2) / 2;
      return html`<g key=${'s' + i}>
        <line x1=${x1} y1=${baseY} x2=${x2} y2=${baseY} class="dl-seg" />
        <line x1=${x1} y1=${baseY - 6} x2=${x1} y2=${baseY + 6} class="dl-tick" />
        <text x=${xm} y=${baseY - 34} class="dl-tnum">T${i + 1}</text>
        <text x=${xm} y=${baseY - 18} class="dl-lab">${Math.round(s.len)} m · ${money(s.cost)} lei</text>
      </g>`;
    });

    // Utilizatori: la aceeași distanță, etichetele se stivuiesc vertical.
    var seen = {};
    var sorted = g.rec.slice().sort(function (a, b) { return a.distanta - b.distanta; });
    var usersG = sorted.map(function (r, i) {
      var d = Number(r.distanta);
      var cx = xOf(d);
      var k = seen[d] || 0; seen[d] = k + 1;
      var y0 = baseY + 26 + k * 30;
      return html`<g key=${'u' + i}>
        <circle cx=${cx} cy=${baseY} r="8" class=${'dl-user rol-' + roleOf(r.userId)}
          onPointerDown=${function (e) { onDown(e, r); }} />
        <text x=${cx} y=${y0} class="dl-name">${userName(r.userId)}</text>
        <text x=${cx} y=${y0 + 15} class="dl-m">${Math.round(d)} m</text>
      </g>`;
    });
    var maxStack = 1;
    Object.keys(seen).forEach(function (k) { if (seen[k] > maxStack) maxStack = seen[k]; });
    var H = 132 + (maxStack - 1) * 30;

    var vlist = segsData.map(function (s, i) {
      var at = g.rec.filter(function (r) { return Number(r.distanta) === s.to; });
      return html`<li key=${'v' + i}><strong>T${i + 1}</strong> — ${Math.round(s.from)}–${Math.round(s.to)} m · ${money(s.cost)} lei
        ${at.length ? html` · ${at.map(function (r) { return userName(r.userId); }).join(', ')}` : null}</li>`;
    });

    return html`<div class="diagram-wrap">
      <svg class="diagram" viewBox=${'0 0 ' + totalW + ' ' + H}
        style=${totalW > 900 ? { minWidth: totalW + 'px' } : null}
        role="img" aria-label="Schema liniei, de la punctul de racordare la capăt">
        <text x="6" y=${baseY + 5} class="dl-pr">PR</text>
        <line x1=${pos[0]} y1=${baseY} x2=${endX} y2=${baseY} class="dl-base" />
        ${segs}
        <line x1=${endX} y1=${baseY - 6} x2=${endX} y2=${baseY + 6} class="dl-tick" />
        ${usersG}
      </svg>
    </div>
    <ol class="diagram-vlist" aria-label="Tronsoane (listă)">${vlist}</ol>
    <p class="hint">${distorted ? 'Schemă orientativă — nu este la scară (segmentele scurte au lățime minimă). ' : ''}Trage de cerc pentru a muta un utilizator pe linie; pe ecrane mici folosește lista de mai jos.</p>`;
  }

  function DistEditor(props) {
    var l = props.l;
    var us = users();
    if (!us.length) return html`<p class="muted">Adaugă mai întâi utilizatori în pasul „2 · Utilizatori”.</p>`;
    var rec = {};
    (l.racordari || []).forEach(function (r) { rec[r.userId] = r.distanta; });
    return html`<div class="dist-editor">
      <p class="hint">Setează <strong>distanța de la punctul de racordare (PR) în metri</strong> pentru fiecare utilizator. Tronsoanele și costurile se generează automat.
        Gol = utilizatorul nu e racordat pe această linie.</p>
      <div class="dist-rows">
        ${us.map(function (u) {
          var v = rec[u.id];
          return html`<label class="dist-row" key=${u.id}>
            <span class="dist-name"><span class=${'dot rol-' + u.rol}></span>${uName(u)} <span class="muted">(${V.ROL_LABEL[u.rol]})</span></span>
            <span class="dist-input">
              <input type="number" min="1" step="1" inputmode="numeric" data-guide=${'dist:' + l.id + ':' + u.id}
                value=${v != null ? v : ''} placeholder="—" aria-label=${'Distanța de la punctul de racordare (PR) pentru ' + uName(u) + ' (m)'}
                onChange=${function (e) { store.setRacordare(l.id, u.id, e.target.value); }} /> <span class="muted">m</span>
            </span>
          </label>`;
        })}
      </div>
    </div>`;
  }

  // Tabel read-only cu tronsoanele derivate (modul avansat).
  function TronsonTable(props) {
    var l = props.l;
    var trs = l.tronsoane || [];
    if (!trs.length) return html`<p class="muted">Niciun tronson generat (nicio distanță setată).</p>`;
    return html`<div class="table-wrap"><table class="grid">
      <thead><tr><th>Tronson</th><th>Lungime (m)</th><th>Cost (lei)</th><th>Utilizatori care îl folosesc</th></tr></thead>
      <tbody>${trs.map(function (t) {
        return html`<tr key=${t.id}>
          <td>${t.nume || t.id}${t.tip === 'stalpi' ? html` <${K.RefChip} id="art15.1" />` : null}</td>
          <td class="num">${t.tip === 'stalpi' ? '—' : money(Number(t.lungime) || 0)}</td>
          <td class="num">${money(C.tronsonCost(l, t))}</td>
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
    store.set('complex.varianta', String(n));
    store.set('complex.variantaConfirmata', true);
    store.commit({ noFocus: true });
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
    return html`<${V.Panel} k="instalatie-complex" title="Anexa 3 — instalație de racordare complexă" help=${HELP.STEPS.instalatie.complex}>
      <${K.Field} label="Varianta punctului de racordare" path="complex.varianta" info="complex.varianta">
        <${K.SelectInput} path="complex.varianta" options=${[['1', 'Varianta 1'], ['2', 'Varianta 2'], ['3', 'Varianta 3'], ['4', 'Varianta 4']]}
          onPicked=${function () { store.set('complex.variantaConfirmata', true); }} />
      <//>
      <p class="hint">${VARIANT_TEXT[v]} <${K.RefChip} id="anexa3" /></p>
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
