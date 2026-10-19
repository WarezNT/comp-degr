/*
 * Vedere — „Ghid de alegere” (nota ajutătoare): întrebări despre instalație →
 * recomandă anexa (modelul de calcul) și varianta la Anexa 3, cu temei legal.
 * Răspunsurile sunt trecătoare (nu fac parte din proiect), păstrate în modul.
 */
(function (global) {
  'use strict';

  var K = global.AppKit;
  var html = K.html;
  var store = K.store;
  var V = global.AppViews = global.AppViews || {};
  var A = global.AppSelect;
  var S = global.AppState;

  // Răspunsuri trecătoare (persistă cât timp aplicația e deschisă).
  var ans = { fonduriPublice: false, obiect: '', varianta: '3', intarire: false };

  function set(key, val) { ans[key] = val; store.render(); }

  function SelectGuide() {
    var rec = A.recommend(ans);
    var current = store.state ? store.state.meta.model : null;
    var selected = current ? A.MODEL_LABEL[current] : '';

    return html`<div class="sel-guide">
      <p class="hint">Răspunde la întrebările de mai jos; îți spunem ce <strong>anexă</strong> (model de calcul) și ce
        <strong>variantă</strong> se potrivesc, cu temeiul legal. Poți aplica recomandarea cu un click.</p>

      <label class="chk"><input type="checkbox" checked=${ans.fonduriPublice}
        onChange=${function (e) { set('fonduriPublice', e.target.checked); }} />
        Instalația primului utilizator a fost finanțată din fonduri publice nerambursabile</label>

      <fieldset class="sel-q" disabled=${ans.fonduriPublice}>
        <legend>Ce a finanțat primul utilizator (elementul folosit în comun)?</legend>
        ${A.OBIECTE.map(function (o) {
          return html`<label class="chk"><input type="radio" name="sel-obiect" value=${o[0]} checked=${ans.obiect === o[0]}
            onChange=${function () { set('obiect', o[0]); }} /> ${o[1]}</label>`;
        })}
      </fieldset>

      ${ans.obiect === 'complex' ? html`<div class="sel-q">
        <label for="sel-var">Unde se racordează noul utilizator?</label>
        <select id="sel-var" value=${ans.varianta} onChange=${function (e) { set('varianta', e.target.value); }}>
          ${A.VARIANTE.map(function (v) { return html`<option value=${v[0]} selected=${ans.varianta === v[0]}>${v[1]}</option>`; })}
        </select>
      </div>` : null}

      ${ans.obiect === 'statie' ? html`<label class="chk"><input type="checkbox" checked=${ans.intarire}
        onChange=${function (e) { set('intarire', e.target.checked); }} />
        Este o lucrare de întărire a postului (transformator înlocuit/mărit sau al doilea transformator)</label>` : null}

      ${rec ? renderRec(rec, selected) : html`<p class="hint muted-sel">Alege mai sus ce a finanțat primul utilizator pentru a vedea recomandarea.</p>`}

      ${renderTable()}
    </div>`;
  }

  function renderRec(rec, selected) {
    if (rec.stop) {
      return html`<div class="sel-rec stop">
        <strong>${rec.titlu}</strong>
        <p>${rec.explicatie}</p>
        <p>Temei: ${(rec.rules || []).map(function (r) { return html`<${K.RefChip} id=${r} /> `; })}</p>
      </div>`;
    }
    return html`<div class="sel-rec">
      <div class="sel-rec-head"><strong>Recomandare: ${rec.titlu}</strong></div>
      <p>${rec.explicatie}</p>
      <p class="sel-refs">Temei: ${(rec.rules || []).map(function (r) { return html`<${K.RefChip} id=${r} /> `; })}</p>
      ${selected && selected === A.MODEL_LABEL[rec.model]
        ? html`<p class="hint">Modelul curent este deja „${selected}".</p>`
        : html`<button type="button" class="btn" onClick=${function () { store.applyModel(rec); }}>
            Aplică recomandarea${rec.model === 'complex' && rec.varianta ? ' (varianta ' + rec.varianta + ')' : ''}
          </button>`}
    </div>`;
  }

  function renderTable() {
    return html`<details class="sel-table">
      <summary>Tabel de încadrare — ce fel de instalație intră în fiecare anexă</summary>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Anexă</th><th>Tip de instalație</th><th>Cum o recunoști</th><th>Temei</th></tr></thead>
        <tbody>
          ${A.CLASSES.map(function (c) {
            return html`<tr>
              <td>${c.anexa}</td>
              <td>${c.tip}</td>
              <td>${c.semne}</td>
              <td>${(c.rules || []).map(function (r) { return html`<${K.RefChip} id=${r} /> `; })}</td>
            </tr>`;
          })}
        </tbody>
      </table></div>
      <p class="hint">Transversal: operatorul de rețea se asimilează unui utilizator nou <${K.RefChip} id="art6.5" />;
        pentru primul utilizator client casnic termenul din art. 8 se extinde la 10 ani <${K.RefChip} id="art8.2" />.
        Regimul tranzitoriu <${K.RefChip} id="art17" /> se aplică automat dacă primul utilizator are contractul înainte de 07.01.2016.</p>
    </details>`;
  }

  V.SelectGuide = SelectGuide;
})(typeof window !== 'undefined' ? window : this);
