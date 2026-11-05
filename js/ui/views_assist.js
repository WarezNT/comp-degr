/* Parcurs asistat: documente, date relevante, revizie și motivele rezultatelor. */
(function (global) {
  'use strict';
  var K = global.AppKit, html = K.html, store = K.store, A = global.AppAssist, C = global.AppCalc, S = global.AppState;
  var useRef = global.preactHooks.useRef;
  var V = global.AppViews;
  function go(target, tab) {
    store.goToStep({ tab: tab || 'instalatie', target: target });
    if (target && !store.findTarget(target)) store.toast('Deschide componenta și verifică datele în formular; câmpul nu este disponibil în modul curent.', 'info');
  }
  function EntryGuide() {
    var p = store.state, parts = A.active(p);
    var title = p.meta.model === 'transitional' ? 'Documente pentru vechea metodologie'
      : p.meta.model === 'developer' ? 'Documente pentru rețeaua dezvoltatorului' : 'Pregătește datele din documente';
    return html`<details class="assist-guide">
      <summary>${title} — ce este necesar și ce este opțional</summary>
      <p>Datele se introduc din situația reală, nu se ajustează pentru obținerea unei sume dorite.
        Zero înseamnă o valoare verificată nulă; o valoare necunoscută nu trebuie înlocuită cu zero.</p>
      <ul>
        ${['line', 'station', 'complex'].indexOf(p.meta.model) >= 0 ? html`<li>Contracte și ATR: cine a finanțat, cine este existent,
          cine se racordează acum și în ce ordine. Documente PIF și dovada achitării integrale TR pentru condiții.</li>` : null}
        ${parts.lines.length || p.meta.model === 'line' || p.meta.model === 'complex' ? html`<li>Plan și deviz:
          investiția în lei, lungimile în metri și utilizatorii care folosesc fiecare traseu comun.
          Costurile proprii ale ramurilor sunt incluse în investiție, nu adăugate încă o dată.</li>` : null}
        ${parts.transformer ? html`<li>Datele transformatorului: S_n și rezerva în kVA, investiția compensată în lei.
          La întărire se folosesc datele transformatorului existent.</li>` : null}
        ${parts.stations.length ? html`<li>Defalcarea echipamentelor comune: verifică ce costuri sunt deja în I_T.
          Nu putem detecta din două sume dacă devizul a fost numărat de două ori.</li>` : null}
        ${p.meta.model === 'transitional' ? html`<li>Componenta B din tariful vechi, capacitatea S, puterea S₂,
          lungimea totală L și porțiunea folosită l₂. Pct. B tranzitoriu rămâne în Anexele 1–3.</li>` : null}
        ${p.meta.model === 'developer' ? html`<li>Devizul rețelei, analiza economică pentru I_ef și puterile aprobate
          ale dezvoltatorilor în kVA. Nu se deduce automat I_ef din desen.</li>` : null}
      </ul>
      <p><strong>Date de calcul</strong> determină suma; <strong>Condiții și documente</strong> determină aplicabilitatea;
        <strong>Opțional / descriptiv</strong> identifică sau descrie instalația.
        PR, LEA/LES, conductorul și secțiunea nu introduc tarife suplimentare.</p>
      <p>Metri, nu kilometri; kVA, nu kW. Conversiile necesită valori documentate și nu se fac automat.
        Confirmă valoarea în document înainte de a o modifica.</p>
      <button type="button" class="btn tiny ghost" onClick=${function () { store.setTab('rezultate'); }}>Deschide revizia datelor →</button>
    </details>`;
  }
  function RouteSummary(props) {
    var p = store.state, parts = props.review.parts, prim = S.primId(p);
    var newIds = ['line', 'station', 'complex'].indexOf(p.meta.model) >= 0 ? S.newIds(p) : [];
    return html`<div class="assist-route">
      <p><strong>${global.AppSelect.MODEL_LABEL[p.meta.model]}${p.meta.model === 'complex' ? ' · varianta ' + p.complexConfig.varianta : ''}</strong></p>
      ${prim && ['line', 'station', 'complex'].indexOf(p.meta.model) >= 0 ? html`<p>Finanțator: ${C.nameOf(p, prim)}.
        Utilizatori noi / operatori: ${newIds.map(function (id) { return C.nameOf(p, id); }).join(', ') || 'niciunul'}.</p>` : null}
      ${newIds.map(function (id) {
        return html`<div class="assist-user-route" key=${id}><strong>${C.nameOf(p, id)} folosește:</strong>
          <ul>${parts.lines.map(function (l) {
            var used = l.tronsoane.filter(function (t) { return t.utilizatori.indexOf(id) >= 0; });
            var route = l.mod === 'ramuri' ? global.AppTree.analyze(l).routes.filter(function (r) { return r.userId === id; })[0] : null;
            var branches = route ? route.path.slice().reverse().map(function (part) {
              return l.ramuri.filter(function (b) { return b.id === part.branchId; })[0].nume;
            }) : [];
            var connected = (l.racordari || []).some(function (r) { return r.userId === id; });
            return html`<li>${l.nume}: ${used.length ? used.length + ' tronsoane folosite'
              : connected ? 'racordat, fără tronson parcurs' : 'neracordat'}${branches.length ? ' · ' + branches.join(' → ') : ''}.
              <button type="button" class="linkish" onClick=${function () { go(l.mod === 'ramuri' ? 'tree:' + l.id : 'line.' + l.id + '.IL'); }}>Verifică traseul</button></li>`;
          })}
          ${parts.stations.map(function (s) {
            return html`<li>${s.nume}: ${s.utilizatori.indexOf(id) >= 0 ? 'racordat' : 'neracordat'};
              ${parts.transformer ? 'transformator + echipamente comune' : 'numai echipamente comune'}.
              <button type="button" class="linkish" onClick=${function () { go('stat.' + s.id + '.elementeComune'); }}>Verifică componenta</button></li>`;
          })}</ul>
        </div>`;
      })}
      ${p.meta.model === 'complex' ? html`<p>Componente inactive păstrate: ${p.linii.filter(function (l) { return parts.lines.indexOf(l) < 0; }).concat(
        p.statii.filter(function (s) { return parts.stations.indexOf(s) < 0; })).map(function (x) { return x.nume || x.id; }).join(', ') || 'niciuna'}.
        Acestea nu contribuie la varianta curentă.</p>` : null}
      ${S.tranzitoriu(p).activ && ['line', 'station', 'complex'].indexOf(p.meta.model) >= 0 ? html`<p>Regim tranzitoriu activ:
        verificați deducerile și participanții excluși după data contractului.</p>` : null}
    </div>`;
  }
  function Review() {
    var p = store.state, r = A.review(p), confirmation = useRef({ project: null, signature: '', checked: false }), signature = JSON.stringify(p);
    if (confirmation.current.project !== p || confirmation.current.signature !== signature) {
      confirmation.current = { project: p, signature: signature, checked: false };
    }
    var confirmed = confirmation.current.checked;
    function tabOf(path) {
      return path.indexOf('user.') === 0 ? 'utilizatori' : path.indexOf('meta.') === 0 ? 'date'
        : path.indexOf('cond.') === 0 ? 'rezultate' : 'instalatie';
    }
    function targetOf(entry) {
      return entry.path.indexOf('ramura.') === 0 ? 'tree:' + entry.path.split('.')[1]
        : entry.derived ? 'tree:' + entry.path.split('.')[1] : entry.path;
    }
    return html`<details class="assist-review card" data-guide="assist-review" open=${!store.results}>
      <summary><strong>Revizie înainte de calcul</strong> · ${r.errors.length ? r.errors.length + ' erori'
        : r.missing.length ? r.missing.length + ' valori necompletate' : 'verifică documentele și situația reală'}</summary>
      <${RouteSummary} review=${r} />
      <div class="assist-review-checks">
        <h3>Ce trebuie verificat</h3>
        ${r.errors.length || r.warnings.length ? html`<p>${r.errors.length} erori și ${r.warnings.length} avertismente în lista problemelor de mai jos.
          <button type="button" class="linkish" onClick=${function () { go('results-status', 'rezultate'); }}>Vezi problemele și corectează</button></p>` : null}
        ${r.missing.length ? html`<ul>${r.missing.map(function (entry) {
          return html`<li>${entry.owner}: ${entry.info.label} este necompletat.
            <button type="button" class="linkish" onClick=${function () { go(targetOf(entry), tabOf(entry.path)); }}>Completează</button></li>`;
        })}</ul>` : null}
        <ul>${r.notes.map(function (note) { return html`<li>${note}</li>`; })}</ul>
        ${r.conditions.some(function (condition) { return !condition.ok; }) ? html`<p class="warn">
          Există condiții neîndeplinite. Confirmarea reviziei nu le bifează și nu deblochează calculul.
          <button type="button" class="linkish" onClick=${function () { go('cond-card', 'rezultate'); }}>Verifică condițiile</button></p>` : null}
      </div>
      <details class="assist-data"><summary>Datele relevante — sursă, unitate și efect asupra calculului</summary>
        <p>Valorile implicite și câmpurile numerice zero nu reprezintă o verificare a documentelor.
          Datele marcate „necesare” trebuie cunoscute; zero poate fi valid, dar trebuie justificat.</p>
        <div class="table-wrap"><table class="grid">
          <caption class="sr-only">Revizia datelor relevante pentru modelul curent</caption>
          <thead><tr><th scope="col">Componentă / câmp</th><th scope="col">Valoare și statut</th><th scope="col">De unde preiau și ce influențează</th><th scope="col">Acțiune</th></tr></thead>
          <tbody>${r.entries.map(function (entry) {
            return html`<tr key=${entry.path}><td>${entry.owner} · ${entry.info.label}<br />${entry.info.category}</td>
              <td>${entry.value === '' || entry.value === undefined || entry.value === null ? 'Necompletat'
                : typeof entry.value === 'boolean' ? entry.value ? 'Da — de verificat' : 'Nu — de verificat' : String(entry.value)}
                <br />${entry.path.indexOf('ramura.') === 0 ? 'Necesar · inspector ramură' : entry.derived ? 'Derivat automat din ramuri' : entry.required ? 'Necesar de cunoscut din documente' : 'Opțional / după situație'}</td>
              <td>${entry.info.source}<br />${entry.info.impact}</td>
              <td><button type="button" class="linkish" onClick=${function () { go(targetOf(entry), tabOf(entry.path)); }}>Verifică / corectează</button></td></tr>`;
          })}</tbody></table></div>
      </details>
      <label class="chk assist-confirm"><input type="checkbox" checked=${confirmed} onChange=${function (e) {
        confirmation.current.checked = e.target.checked; store.render();
      }} />Am verificat în documente rolurile, traseele, costurile, unitățile și condițiile acestei situații.</label>
      <p class="hint">${confirmed ? 'Revizie confirmată pentru datele curente.' : 'Revizia nu este confirmată pentru datele curente.'}${' '}
        Orice modificare a proiectului cere o nouă revizie. Confirmarea nu este salvată în JSON,
        nu reprezintă un aviz și nu schimbă formulele sau condițiile.</p>
      <p class="hint">Revizia este un ajutor, nu o blocare nouă: butonul de calcul păstrează validările și condițiile existente.</p>
    </details>`;
  }
  function Unexpected(props) {
    var items = A.diagnosis(store.state, props.result);
    if (!items.length) return null;
    return html`<details class="assist-diagnosis card"><summary>Înțelege rezultatul — de ce este zero sau de ce nu primește un utilizator?</summary>
      <p>Motive derivate din datele curente și din rezultatul motorului. Modifică numai valori justificate de documente,
        nu pentru obținerea unei anumite sume.</p>
      <ul>${items.map(function (item) { return html`<li><strong>${item.title}</strong><p>${item.text}</p>
        ${item.target ? html`<button type="button" class="linkish" onClick=${function () { go(item.target, item.tab); }}>Verifică datele</button>` : null}</li>`; })}</ul>
    </details>`;
  }
  V.EntryGuide = EntryGuide;
  V.InputReview = Review;
  V.UnexpectedResult = Unexpected;
})(window);
