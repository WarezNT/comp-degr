# Raport verificare — Compensații bănești (comp-degr)

Data: 2026-10-06 · Scop: căutare de probleme + propuneri de îmbunătățire.
Metodă: citire integrală `engine.js`, `state.js`, `ui.js`, `index.html`, teste; rulare teste în Chromium headless; probe Playwright pentru fiecare bug marcat **[confirmat]**.

**Stare generală:** motorul de calcul e curat și testele existente trec (12/12 unitare, 11/11 integrare). Problemele sunt în UI/securitate/validare și în câteva decizii de domeniu netestate. Nicio eroare JS la rulare.

---

## A. Bug-uri (de reparat)

| # | Severitate | Problemă | Loc |
|---|---|---|---|
| A1 | **Mare** | **XSS stocat prin proiect importat** [confirmat]. `state.meta.operator` e inserat neescapat în rezultate (`'Valorile în ' + operator`). În plus, id-urile din JSON (`u.id`, `l.id`, `t.id`...) sunt puse neescapat în atribute (`data-id="..."`, `data-bind="user.<id>.nume"`, `<option value="...">`). Un fișier JSON partajat (README promovează „partajare proiect”) execută cod la deschidere. | `ui.js:846`, `:378-386`, `:512-514`, `:595-606` ș.a. |
| A2 | **Mare** | **Beneficiarul plății se schimbă silențios** [confirmat]. La Anexa 2, dacă primul utilizator nu e adăugat în lista stației, `prim` cade pe `users[0]`: plata de 12.500 lei merge către alt utilizator („ALTUL”), fără avertisment. | `engine.js:206` |
| A3 | **Mare** | **Rezultate vechi afișate ca valide** [confirmat]. După „Calculează”, orice modificare (puteri, tronsoane, utilizatori, condiții Art. 8) nu invalidează `results`; centralizatorul, CSV-ul și printul rămân pe valorile vechi. Doar TVA recalculează. Și mesajul „X condiții neîndeplinite” rămâne înghețat. | `ui.js:1019-1021` |
| A4 | Medie | **Butoanele „Demo U4/U6” suprascriu proiectul curent fără confirmare** [confirmat] (cu autosave, pierdere definitivă). La fel Import JSON; „Șterge” utilizator/linie/tronson/stație nu cer confirmare. | `ui.js:1063-1064`, `:1075` |
| A5 | Medie | **„Detaliu stație” arată 0,00 / 0,00 = 0,00** [confirmat] pentru modelul Anexa 2: `runCalculation` construiește un `res` fără `IT/Sn/SnEfectiv/bT`. | `ui.js:238`, `:874-879` |
| A6 | Medie | **Focus pierdut la Tab** [confirmat]: orice `change` pe un câmp legat face `render()` complet; după Tab, focusul ajunge pe `<body>`. Navigarea cu tastatura prin formulare e practic imposibilă (și problemă de accesibilitate). | `ui.js:1008-1022` |
| A7 | Medie | **Utilizator nou neasignat = „Nicio compensație”, fără explicație.** Dacă noul utilizator nu e pe niciun tronson/stație, rezultatul e gol și `readinessWarnings` nu spune nimic. | `ui.js:773-795` |
| A8 | Mică | Import JSON: alegerea aceluiași fișier de două ori nu face nimic (input-ul nu e resetat); `state` e salvat în IndexedDB **înainte** de `deriveAll/render`, deci un JSON valid dar malformat (ex. `linii` fără `tronsoane`) ajunge persistat și strică randarea. Fără validare de schemă. | `ui.js:1070-1079` |
| A9 | Mică | Persistență: comentariul spune că `save()` ține și copie în `localStorage`, dar codul o face doar dacă IDB eșuează. Erorile IDB sunt înghițite (`catch(function(){})`), utilizatorul nu află niciodată că nu s-a salvat. Legacy din `localStorage` nu e șters după migrare. Cu `file://` unele browsere/Safari private blochează IDB. | `state.js:219-233` |
| A10 | Mică | Rotunjire inconsistentă: `r2()` (centralizator) vs `money()` (UI/detalii) rotunjesc diferit → diferențe de 1 ban între tabele. Trucul `+Number.EPSILON` nu e fiabil la valori mari. CSV scrie `500` / `1234,5` (nu `500,00`). | `engine.js:19`, `ui.js:25`, `:904` |

## B. Validare lipsă (motorul acceptă date absurde fără semnal)

Confirmate în probe:
- **Putere negativă** → `addPay` aplică `Math.abs` și produce plată pozitivă (12.500 lei pentru –50 kVA). `Math.abs` maschează erori de semn.
- **Rezervă N-1 > S_n** → `b_T = 0` silențios (compensație 0).
- **I_ef > I_total** (Anexa 5) → cotă negativă, sumă –50.
- **l_2 > L** (Anexa 4) → C₂ = 500 lei pentru B=1000, S=100, S₂=10 (raport > 100%).
- Nicio verificare: `S₂ > S`, utilizator care apare de două ori, tronson cu lungime/cost negativ, `min="0"` lipsă pe inputurile numerice, TVA > 100.

Recomandare: validare centralizată (`validate(project)` → listă erori/avertismente), afișată în „Înainte de calcul” și blocând calculul la erori.

## C. Domeniu / corectitudine metodologică (de confirmat cu un specialist)

1. **Art. 8 nu blochează nimic.** Aplicația calculează și când condițiile nu sunt îndeplinite (doar avertizează). `dataATR`/`dataTR` sunt colectate dar **nu sunt folosite**: „ani de la punerea în funcțiune” se introduce manual, deși se poate deriva din date; condiția „tarif achitat integral” nu se verifică din `dataTR`.
2. **Mai mulți utilizatori noi pe același tronson:** fiecare e calculat „ca și cum ar veni singur” (comportament din .xlsx, documentat). Suma datorată unui utilizator vechi ≠ cota reală când n utilizatori noi vin simultan (ex. 2·(c/3 − c/4) ≠ c/2 − c/4). Trebuie confirmat că e intenționat și afișat explicit în UI.
3. **Anexa 2:** doar primul utilizator primește compensația; ceilalți utilizatori existenți nu primesc nimic, spre deosebire de `elementeComune` (care se împarte către toți cei existenți). Inconsistență în același model.
4. **Anexa 3, varianta 2 vs 3/4:** `echipamenteComune` e tratat diferit — în v2 plătește doar noul utilizator către `prim` și se ia doar `statii[0]` pentru utilizatori, dar suma echipamentelor vine din toate stațiile bifate; în v3/v4 `elementeComune` din stație intră și în calculul Anexei 2, deși textul variantei spune „doar Anexa 1 + Anexa 2”.
5. **Calea `buildConfig('station')` cu >1 stație** returnează un obiect fără `model` valid (`{linii, statii}`); `compute('station', ...)` l-ar ignora. Cod mort/capcană (UI folosește altă cale). Expusă prin `AppUI.buildConfig`.
6. TVA calculat per rând, apoi rotunjit; dacă se emite o factură per beneficiar e corect, dacă e per total, totalul cu TVA poate diferi cu câțiva bani.
7. Antetul (operator, cod operator, data întocmirii) **nu apare pe rezultat/print** (în afara frazei greșite de la A1: „Valorile în <operator>”, text fără sens). Un centralizator oficial ar trebui să le includă + câmpuri de semnătură.

## D. Calitate cod / arhitectură

- `ui.js` 1255 linii: HTML prin concatenare de stringuri, `render()` total la fiecare modificare, `data-bind` cu path-uri string; fragil (cauza A1, A6). Propunere: un helper `h()`/template tagged cu escape implicit, re-randare pe tab, nu pe câmp.
- Un `save()` în IndexedDB **la fiecare tastă** (serializare proiect întreg). Adaugă debounce (300–500 ms).
- `init()` leagă listenerii pe `document` de fiecare dată (dublare dacă e apelat de teste/hot reload); `bindEvents` ar trebui să fie idempotent.
- `orderByIds`, `orderList`, `deriveAll`/`lineTronsoane`/`tronsonCost` repetă logica de cost tronson în 3 locuri (`engine`, `deriveAll`, `lineTronsoane`, `tronsonCost`) — sursă de divergență.
- State: `noulUtilizatorId` (legacy) ținut în paralel cu `nouUtilizatoriIds`; `cote` returnat de `computeStation` nefolosit; `listProjects()`/DB cu proiecte multiple nefolosite în UI.
- Fără `package.json`, linter (eslint e disponibil local), CI. Testele se rulează manual în browser; niciun test nu acoperă: XSS/escape, import JSON malformat, valori negative, model `developer`/`transitional` prin UI, export CSV, persistență IDB, migrate().
- Ref. fișier lipsă: README trimite la `docs/formule-ocr.md`, `docs/ISTORIC-AI.md`, `ajutatoare/` — toate în `.gitignore`, deci **linkuri moarte pe GitHub/Pages**. README spune „12/12 și 11/11” (corect azi, dar manual).

## E. Accesibilitate / UX

- Tab-urile sunt `<button>` fără `role="tablist/tab"`, `aria-selected`; panourile fără `role="tabpanel"`.
- Multe inputuri în tabele fără etichetă (doar `placeholder`/coloană); butoane `↑ ↓ ✕` doar cu `title`, fără `aria-label`.
- Focus pierdut la re-randare (A6). Erorile/avertismentele nu sunt `aria-live`.
- Mesaje prin `alert`/`confirm` native („Fișier JSON invalid.” fără detalii despre ce e greșit).
- Fără titlu/antet pe print (vezi C7), fără mod „doar rezultate” în ecran mic verificat.
- `<title>` fără diacritice („Compensatii”), inconsistent cu restul UI-ului.
- Nu există undo, nici listă de proiecte (deși IDB o permite), nici export `.xlsx` (modelul de referință e .xlsx).

## F. Plan recomandat (ordine)

1. **Securitate:** escape peste tot (inclusiv atribute/id-uri) + sanitizare la import (regenerare id-uri ca `[A-Za-z0-9_-]`); adaugă CSP `default-src 'self'` în `index.html`.
2. **Corectitudine:** invalidare `results` la orice modificare; fix `prim` neînscris în stație (eroare, nu fallback); popularea `res` pentru detaliul stației; avertisment utilizator nou neasignat.
3. **Validare** centralizată (secțiunea B) cu blocare la erori.
4. **UX date:** confirmări la Demo/Import/ștergeri; render țintit (nu total) ca să nu se piardă focusul; debounce la salvare; semnal vizibil când salvarea eșuează.
5. **Domeniu:** derivare automată a condițiilor Art. 8 din `dataATR/dataTR`; clarificare cu un specialist a punctelor C2–C4; antet + semnături în print.
6. **Ingineria proiectului:** teste noi pentru cele de mai sus, `package.json` cu `eslint` + rulare headless a testelor în CI (GitHub Actions), reparat README (linkuri/`docs`).

*Nu am modificat codul aplicației; singurul fișier adăugat este acest raport (necomis).*

---

## Stare implementare (actualizat)

**Rezolvat:** A1–A10 (escape + sanitizare import + CSP; beneficiar stație; rezultate auto-actualizate; confirmări + undo; detaliu stații; focus păstrat; avertisment utilizator nou neasignat; import robust; stare salvare vizibilă + debounce; rotunjire/CSV), B (validare centralizată în `js/validate.js`), C1 (ani din data PIF), C5 (calea multi-stație), C7 (antet + semnături la print, banner „INFORMATIV” când Art. 8 nu e îndeplinit), D (cost tronson unificat, `bindEvents` idempotent, lint, CI, `npm test`, README corectat), E (ARIA pe tab-uri, etichete, `min=0`, diacritice, favicon, toast în loc de `alert`).

**Netratat intenționat (necesită decizie de specialist, nu s-a schimbat nicio formulă):** C2 (utilizatori noi simultani — doar notă în UI), C3 (Anexa 2: doar primul primește), C4 (echipamente comune în Anexa 3), C6 (TVA pe rând vs. pe total).
**Nemplementat (extinderi):** export .xlsx, listă de proiecte în UI, refactor `ui.js` către componente.


## Actualizare — verificare față de textul consolidat al metodologiei (Ord. 180/2015, cu Ord. 10/2016 și 16/2019)

| Punct | Ce spune norma | Ce s-a făcut |
|---|---|---|
| Art. 8 blochează? | Art. 8 alin. 1: „se calculează și se plătește **numai dacă** sunt îndeplinite cumulativ” (4 condiții, lit. a–d) | Calcul blocat; opțiune explicită „Calculează oricum (informativ)”. Condiția a 5-a din aplicație = art. 7 alin. 1 (reetichetată). Prag 10 ani pentru prim casnic (art. 8 alin. 2) derivat din tipul clientului (înainte nu putea fi activat). Art. 19 (fonduri publice) adăugat ca excludere. Anexa 5 pct. 1 (5 ani) verificat. |
| dataATR / dataTR | Termenul curge de la punerea în funcțiune, nu de la ATR; art. 7 alin. 1 cere tariful achitat de fiecare beneficiar | `dataTR` verificată per beneficiar (confirmare manuală posibilă); `dataATR` folosită doar pentru ordinea racordării; text de ajutor corectat. |
| Utilizatori noi multipli | Anexa 1: un singur utilizator nou pe rând (n−1 → n), exemple secvențiale | Calcul secvențial (`sequentialPayments`), ordine după Data ATR; noii plătesc și celor racordați înaintea lor. Total primit de un utilizator vechi = cost/n_vechi − cost/n_final. |
| Echipamente comune Anexa 3 | Var. 2: art. 12 alin. 1 (cote egale, toți cei care au contribuit); var. 3/4: doar Anexa 1 + Anexa 2 | Var. 2 plătește tuturor; var. 3/4 nu mai adaugă echipamente comune (notă în UI, de confirmat). |
| Antet/semnături | Norma nu impune format; valoarea se precizează în ATR (art. 6 alin. 2) | Neschimbat (practică, nu obligație). |
| Anexa 2 (doar primul primește) | Art. 6 alin. 1 lit. b, art. 13 | Confirmat — corect în aplicație. |

Modelat ulterior: art. 15 alin. 1 (element „stâlpi” cu cost propriu, cote egale) și art. 15 alin. 3 (întărire post: compensație = b_T × min(puterea nouă, capacitatea suplimentară a transformatorului existent), consum succesiv pentru mai mulți utilizatori noi).

Modelat ulterior: art. 6 alin. 5 (operator de rețea = utilizator nou, inclus automat) și art. 7 alin. 2–3 (panou de refacere ATR: doar ATR valabile, fără tarif, tarif recalculat estimat; tariful oficial se stabilește cu Metodologia de stabilire a tarifului de racordare).

Modelat ulterior: art. 17–18 + Anexa 4 pct. B (regim tranzitoriu activat de data contractului primului utilizator: cost net = I_L − compensații vechi, utilizatori cu contract anterior ignorați, capacitate suplimentară informativă; exemplul din anexă reproduce 14.600 / 21.900). Din textul consolidat nu mai rămâne nemodelat niciun articol de calcul.
