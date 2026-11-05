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

  // Răspunsuri trecătoare (persistă cât timp aplicația e deschisă).
  function emptyAnswers() { return { fonduriPublice: false, obiect: '', varianta: '', intarire: false, scop: 'actual', contract: '' }; }
  var ans = emptyAnswers(), project = null;

  function set(key, val) { ans[key] = val; store.render(); }

  function SelectGuide() {
    if (project !== store.state) { project = store.state; ans = emptyAnswers(); }
    var rec = ans.obiect === 'complex' && ans.scop !== 'vechi' && !ans.varianta && !ans.fonduriPublice ? null : A.recommend(ans);
    var current = store.state ? store.state.meta.model : null;
    var selected = current ? A.MODEL_LABEL[current] : '';

    return html`<div class="sel-guide">
      <p class="hint">Răspunde la întrebările de mai jos; îți spunem ce <strong>anexă</strong> (model de calcul) și ce
        <strong>variantă</strong> se potrivesc, cu temeiul legal. Recomandarea nu modifică proiectul până la aplicare
        și nu confirmă condițiile. Urmărim calculul corect al situației reale, nu o sumă-țintă.</p>
      <label for="sel-scop">Ce situație calculezi?</label>
      <select id="sel-scop" value=${ans.scop} onChange=${function (e) { set('scop', e.target.value); }}>
        <option value="actual">Compensația pentru racordarea unui utilizator acum</option>
        <option value="vechi">Reconstituirea calculului după vechea metodologie (Ord. 28/2003)</option>
      </select>

      <label class="chk"><input type="checkbox" checked=${ans.fonduriPublice}
        onChange=${function (e) { set('fonduriPublice', e.target.checked); }} />
        Instalația primului utilizator a fost finanțată din fonduri publice nerambursabile</label>
      <p class="hint">Bifa nebifată nu este dovada absenței fondurilor publice. Verifică sursa finanțării și condiția din Rezultate.</p>

      ${ans.scop !== 'vechi' ? html`<fieldset class="sel-q" disabled=${ans.fonduriPublice}>
        <legend>Ce a finanțat primul utilizator (elementul folosit în comun)?</legend>
        ${A.OBIECTE.map(function (o) {
          return html`<label class="chk"><input type="radio" name="sel-obiect" value=${o[0]} checked=${ans.obiect === o[0]}
            onChange=${function () { set('obiect', o[0]); }} /> ${o[1]}</label>`;
        })}
      </fieldset>` : null}

      ${ans.obiect === 'complex' && ans.scop !== 'vechi' ? html`<div class="sel-q">
        <label for="sel-var">Unde se racordează noul utilizator?</label>
        <select id="sel-var" value=${ans.varianta} onChange=${function (e) { set('varianta', e.target.value); }}>
          <option value="">Selectează poziția din schema aprobată</option>
          ${A.VARIANTE.map(function (v) { return html`<option value=${v[0]} selected=${ans.varianta === v[0]}>${v[1]}</option>`; })}
        </select>
      </div>` : null}

      ${ans.obiect === 'statie' && ans.scop !== 'vechi' ? html`<label class="chk"><input type="checkbox" checked=${ans.intarire}
        onChange=${function (e) { set('intarire', e.target.checked); }} />
        Este o lucrare de întărire a postului (transformator înlocuit/mărit sau al doilea transformator)</label>` : null}

        ${ans.scop !== 'vechi' && ans.obiect && ans.obiect !== 'dezvoltator' ? html`<div class="sel-q">
          <label for="sel-contract">Contractul finanțatorului este anterior lui 07.01.2016?</label>
          <select id="sel-contract" value=${ans.contract} onChange=${function (e) { set('contract', e.target.value); }}>
            <option value="">Nu am verificat documentul</option><option value="da">Da, am verificat contractul</option>
            <option value="nu">Nu, am verificat contractul</option>
          </select>
          <p class="hint">${ans.contract === 'da' ? 'Păstrează anexa instalației și completează data contractului și compensațiile vechi; regimul tranzitoriu se aplică din datele proiectului.'
            : ans.contract === 'nu' ? 'Introdu data contractului verificată; răspunsul de aici nu înlocuiește documentul.'
              : 'Verifică data contractului, nu data ATR. Nu presupunem că lipsa informației înseamnă „nu”.'}</p>
        </div>` : null}

      ${rec ? renderRec(rec, selected) : html`<p class="hint muted-sel">${ans.obiect === 'complex'
        ? 'Selectează explicit poziția PR din schema aprobată; nu presupunem varianta.'
        : 'Alege mai sus ce a finanțat primul utilizator pentru a vedea recomandarea.'}</p>`}

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
      ${selected ? html`<p class="hint">Modelul curent: ${selected}.
        Aplicarea păstrează utilizatorii și instalațiile; verifică rolurile și componentele incluse după schimbare.</p>` : null}
      <button type="button" class="btn" onClick=${function () {
        if (!store.state) return;
        store.applyModel(rec);
        if (rec.model === 'station' && rec.intarire && store.state.statii.length !== 1) {
          store.toast('Aplică apoi „Întărire post” pe stația corectă; nu alegem automat între mai multe stații.', 'info');
        }
      }}>
            Aplică recomandarea${rec.model === 'complex' && rec.varianta ? ' (varianta ' + rec.varianta + ')' : ''}
      </button>
      <p class="hint">În pasul Utilizatori, identifică finanțatorul din contract și utilizatorul nou din ATR.
        Rolurile precompletate la adăugare sunt propuneri, nu verificări documentare.</p>
    </div>`;
  }

  function renderTable() {
    return html`<details class="sel-table">
      <summary>Tabel de încadrare — ce fel de instalație intră în fiecare anexă</summary>
      <div class="table-wrap"><table class="grid">
        <caption class="sr-only">Tabel de încadrare pe anexe</caption>
        <thead><tr><th scope="col">Anexă</th><th scope="col">Tip de instalație</th><th scope="col">Cum o recunoști</th><th scope="col">Temei</th></tr></thead>
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
