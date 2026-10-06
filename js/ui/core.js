/*
 * UI core — componente reutilizabile (Preact + htm, fără build): câmpuri legate de stare,
 * ajutor inline (ⓘ), chip-uri cu referința legală, ferestre și formatări.
 */
(function (global) {
  'use strict';

  var h = global.preact.h;
  var useRef = global.preactHooks.useRef;
  var html = global.htm.bind(h);

  var E = global.CompEngine;
  var R = global.AppRules;
  var HELP = global.AppHelp;
  var store = global.AppStore;

  /* ----------------------- formatări și parsare ----------------------- */

  // 1.234,56 (ro-RO)
  function money(x) {
    return E.r2(x).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtNum(x, max) {
    return (Number(x) || 0).toLocaleString('ro-RO', { maximumFractionDigits: max === undefined ? 4 : max });
  }

  // Text de editare: fără separator de mii, virgulă zecimală; 0 / gol → câmp gol (placeholder 0).
  function fmtEdit(v) {
    if (v === '' || v === undefined || v === null) return '';
    var n = Number(v);
    if (!isFinite(n) || n === 0) return '';
    return String(Math.round(n * 1e6) / 1e6).replace('.', ',');
  }
  // Text afișat după ce câmpul pierde focusul: separator de mii.
  function fmtShow(v) {
    if (v === '' || v === undefined || v === null) return '';
    var n = Number(v);
    if (!isFinite(n) || n === 0) return '';
    return n.toLocaleString('ro-RO', { maximumFractionDigits: 6 });
  }
  // „1.234,5” / „1234,5” / „1234.5” / „1.234” (mii) → număr; gol → ''; invalid → null.
  function parseNum(text) {
    var t = String(text === undefined || text === null ? '' : text).trim().replace(/\s/g, '');
    if (t === '') return '';
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    var n = Number(t);
    return isFinite(n) ? n : null;
  }

  function safeKey(path) { return String(path).replace(/[^A-Za-z0-9_-]/g, '_'); }

  /* ----------------------- referințe legale ----------------------- */

  // Chip „art. 8 alin. (1) lit. c”; la click se deschide textul normei.
  function RefChip(props) {
    var r = R.get(props.id);
    if (!r) return null;
    return html`<button type="button" class="ref" title=${r.scurt} data-ref=${props.id}
      onClick=${function (e) { e.preventDefault(); e.stopPropagation(); store.openNorma(props.id); }}>${r.ref}</button>`;
  }

  // Explicație scurtă lângă etichetă (ⓘ); se deschide/închide cu click, fără stare JS.
  function Info(props) {
    var f = HELP.FIELDS[props.k];
    if (!f) return null;
    return html`<details class="info">
      <summary tabindex="-1" aria-label="Ce înseamnă acest câmp?" title="Ce înseamnă?">ⓘ</summary>
      <div class="info-pop" role="note">${f.text}${f.rule ? html` <${RefChip} id=${f.rule} />` : null}</div>
    </details>`;
  }

  function Abbr(props) {
    return html`<abbr title=${HELP.ABBR[props.k] || ''}>${props.k}</abbr>`;
  }

  /* ----------------------- câmpuri legate de stare ----------------------- */

  // Etichetă + ajutor + control. `info` = cheia din HELP.FIELDS.
  function Field(props) {
    var id = props.id || ('f-' + safeKey(props.path || props.label));
    // Ordinea în DOM (și deci la Tab): etichetă → control → ⓘ; vizual, ⓘ stă lângă etichetă.
    // ⓘ e doar pentru mouse/touch (tabindex -1); utilizatorii de tastatură / cititoare de ecran primesc
    // același text prin aria-describedby pe grupul de control.
    var f = props.info ? HELP.FIELDS[props.info] : null;
    return html`<div class=${'field' + (props.class ? ' ' + props.class : '')}>
      <label for=${id}>${props.label}</label>
      <div class="control" role="group" aria-describedby=${f ? id + '-help' : null}>${props.children}</div>
      <${Info} k=${props.info} />
      ${f ? html`<span id=${id + '-help'} class="sr-only">${f.text}</span>` : null}
      ${props.hint ? html`<div class="hint">${props.hint}</div>` : null}
    </div>`;
  }

  // Pe blur, ghidul poate muta focusul — dar nu dacă utilizatorul și-a ales deja alt câmp.
  function blurCommit(e) {
    var rt = e && e.relatedTarget;
    store.commit({ noFocus: !!(rt && /^(INPUT|SELECT|TEXTAREA)$/.test(rt.tagName)) });
  }

  function TextInput(props) {
    var path = props.path;
    var v = store.get(path);
    return html`<input type="text" id=${props.id || ('f-' + safeKey(path))} data-bind=${path}
      value=${v === undefined || v === null ? '' : v} placeholder=${props.ph || ''}
      aria-label=${props.label || null} autocomplete="off"
      onInput=${function (e) { store.set(path, e.target.value); }}
      onChange=${function (e) { store.set(path, e.target.value); }}
      onBlur=${blurCommit}
      onKeyDown=${function (e) { if (e.key === 'Enter') e.target.blur(); }} />`;
  }

  function DateInput(props) {
    var path = props.path;
    var v = store.get(path);
    return html`<input type="date" id=${props.id || ('f-' + safeKey(path))} data-bind=${path} value=${v || ''}
      aria-label=${props.label || null} disabled=${!!props.disabled}
      onInput=${function (e) { store.set(path, e.target.value); }}
      onChange=${function (e) { store.set(path, e.target.value); store.commit(); }} />`;
  }

  // Număr cu virgulă zecimală și separator de mii la părăsirea câmpului. Textul tastat nu
  // este rescris cât timp câmpul e în curs de editare.
  function NumInput(props) {
    var path = props.path;
    var value = store.get(path);
    var ref = useRef({ text: null, last: undefined, invalid: false });
    var r = ref.current;
    var focused = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute('data-bind') === path;
    if (r.text === null || (value !== r.last && !focused)) { r.text = fmtShow(value); r.invalid = false; }
    r.last = value;
    function onText(e) {
      r.text = e.target.value;
      var n = parseNum(r.text);
      if (n === null) { r.invalid = true; store.render(); return; }
      r.invalid = false;
      r.last = n;
      store.set(path, n);
    }
    var neg = Number(value) < 0;
    return html`<input type="text" inputmode="decimal" id=${props.id || ('f-' + safeKey(path))} data-bind=${path}
      class=${r.invalid || neg ? 'invalid' : ''} aria-invalid=${r.invalid || neg ? 'true' : null}
      value=${r.text} placeholder=${props.ph || '0'} aria-label=${props.label || null} autocomplete="off"
      onInput=${onText} onChange=${onText}
      onFocus=${function () { r.text = fmtEdit(value); store.render(); }}
      onBlur=${function (e) { r.text = fmtShow(store.get(path)); r.invalid = false; store.render(); blurCommit(e); }}
      onKeyDown=${function (e) { if (e.key === 'Enter') e.target.blur(); }} />`;
  }

  function SelectInput(props) {
    var path = props.path;
    var v = String(store.get(path));
    return html`<select id=${props.id || ('f-' + safeKey(path))} data-bind=${path} aria-label=${props.label || null}
      onChange=${function (e) { store.set(path, e.target.value); store.commit(); if (props.onPicked) props.onPicked(e.target.value); }}>
      ${props.options.map(function (o) { return html`<option value=${o[0]} selected=${String(o[0]) === v}>${o[1]}</option>`; })}
    </select>`;
  }

  function CheckInput(props) {
    var path = props.path;
    return html`<label class="chk"><input type="checkbox" data-bind=${path} checked=${!!store.get(path)} aria-label=${props.aria || null}
      onChange=${function (e) { store.set(path, e.target.checked); store.commit(); }} /> ${props.label}</label>`;
  }

  /* ----------------------- diverse ----------------------- */

  function Card(props) {
    return html`<div class=${'card' + (props.class ? ' ' + props.class : '')} ...${props.attrs || {}}>${props.children}</div>`;
  }

  // Fereastra cu textul normei (deschisă din orice chip de referință).
  function NormaModal() {
    var id = store.norma;
    if (!id) return null;
    var r = R.get(id);
    if (!r) return null;
    var text = R.text(id);
    return html`<div class="modal-back" onClick=${function (e) { if (e.target === e.currentTarget) store.closeNorma(); }}>
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="norma-title" data-norma=${id}>
        <div class="modal-head"><strong id="norma-title">${r.ref}</strong>
          <button type="button" class="btn tiny ghost" onClick=${store.closeNorma} aria-label="Închide">✕</button></div>
        <p class="hint">${r.scurt}</p>
        <pre class="norma-text">${text || 'Textul nu este disponibil.'}</pre>
        <p class="hint">Text consolidat — Ord. ANRE 180/2015 (M.Of. 12/07.01.2016), cu modificările Ord. 10/2016 și 16/2019. Informativ: verifică pe sursa oficială.</p>
      </div>
    </div>`;
  }

  function Toast() {
    var t = store.toastMsg;
    return html`<div id="toast" class=${'toast' + (t ? ' show ' + t.kind : '')} role="status" aria-live="polite">${t ? t.msg : ''}</div>`;
  }

  // Lista de probleme (erori/avertismente), fiecare cu referință și buton „Mergi la câmp”.
  function IssueList(props) {
    var items = props.items || [];
    if (!items.length) return null;
    return html`<ul class="conds issues">
      ${items.map(function (i) {
        return html`<li class=${i.severity === 'error' ? 'bad' : 'warn-li'}>
          <span class="issue-text">${i.text}</span>
          <${RefChip} id=${i.rule} />
          ${i.tab ? html`<button type="button" class="linkish go" onClick=${function () { store.goToStep({ tab: i.tab, target: i.target }); }}>Mergi la câmp →</button>` : null}
        </li>`;
      })}
    </ul>`;
  }

  global.AppKit = {
    h: h, html: html, store: store,
    money: money, fmtNum: fmtNum, fmtEdit: fmtEdit, fmtShow: fmtShow, parseNum: parseNum,
    RefChip: RefChip, Info: Info, Abbr: Abbr, Field: Field,
    TextInput: TextInput, DateInput: DateInput, NumInput: NumInput, SelectInput: SelectInput, CheckInput: CheckInput,
    Card: Card, NormaModal: NormaModal, Toast: Toast, IssueList: IssueList,
    blurCommit: blurCommit
  };
})(typeof window !== 'undefined' ? window : this);
