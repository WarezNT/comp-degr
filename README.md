# Compensatii bănești — racordare în etape diferite

Aplicație web (HTML + CSS + JavaScript, interfață Preact + htm vendorizate, **fără build**) pentru stabilirea
**compensațiilor bănești** între utilizatorii racordați în etape diferite, prin
**instalație comună**, la rețele electrice de interes public.

Bazată pe **Metodologia ANRE 2015** (Ordinul președintelui ANRE nr. 180/2015,
publicată în M.Of. nr. 12 din 07.01.2016), anexele nr. 1–5.

## Cuprins

- [Ce face](#ce-face)
- [Cum se rulează](#cum-se-rulează)
- [Fluxul de utilizare](#fluxul-de-utilizare)
- [Modele de calcul (anexe)](#modele-de-calcul-anexe)
- [Persistență și export](#persistență-și-export)
- [Structura proiectului](#structura-proiectului)
- [Testare](#testare)
- [Documente sursă](#documente-sursă)
- [Limitări și idei de continuare](#limitări-și-idei-de-continuare)

## Ce face

- Model de date **generic** (număr arbitrar de utilizatori, linii, tronsoane, stații,
  dezvoltatori).
- Calculează compensația pe care o plătește **noul utilizator** fiecărui utilizator
  racordat anterior.
- Generează **centralizator** „cine plătește cui”, cu și fără TVA.
- Verifică **condițiile cumulative Art. 8** și avertizează când nu sunt îndeplinite.
- Calcul automat al costului pe tronsoane (`lungime × b_L`) și al costului specific
  `b_L = I_L / L`, cu posibilitate de suprascriere manuală.
- Interfață integral în română, cu **ghid pas cu pas**, ajutor la fiecare câmp (ⓘ) și
  **referința legală** (chip „art. 8 alin. (1) lit. c”, cu textul normei) la fiecare regulă.

## Cum se rulează

Nu necesită server și nu necesită instalare. Deschide direct `index.html` într-un
browser modern (Chrome, Edge, Firefox):

```
index.html
```

Aplicația este 100% offline: nu folosește CDN-uri. Singurele biblioteci sunt copiile
vendorizate din `vendor/` (Preact, htm — vezi `vendor/README.md`); funcționează direct de pe
`file://`, fără build.

## Fluxul de utilizare

La prima deschidere apare un **ecran de start** (Proiect nou / Exemplu / Import). „Proiect nou”
pornește **ghidul pas cu pas**: o bară din josul ecranului spune ce mai trebuie completat,
evidențiază câmpul respectiv (contur galben), mută cursorul pe el și, după ce îl completezi
(Enter / Tab / click), te duce automat la următorul — inclusiv între pași. Poți sări pașii
opționali, opri mutarea automată a focusului sau ascunde ghidul (meniul „Proiect”).

1. **Date generale** — modelul de calcul (Anexa 1–5), operator, dată, cotă TVA.
2. **Utilizatori** — fiecare utilizator are **un singur rol**: *prim utilizator* (finanțator,
   primește), *nou* (plătește), *existent* sau *operator de rețea* (art. 6 alin. 5). Primul
   adăugat devine prim, al doilea nou. Contract/avize (art. 7, 17–18) într-un rând extensibil.
3. **Instalație** — linii cu **grilă de alocare** utilizatori × tronsoane (bifezi cine folosește
   fiecare tronson), stații/PT, instalație complexă (rol per linie: l_U1 / l_U2), vechea
   metodologie, rețea de dezvoltator.
4. **Rezultate** — stare (probleme cu link „Mergi la câmp”), rezumat (totaluri), centralizator cu
   **„Cum s-a calculat”** pe fiecare sumă (formulă + articol), condițiile art. 8 (restrânse când
   sunt îndeplinite), export CSV, print.

Indicatorii de pe pași arată starea: ✓ completat, număr = pași rămași, ✕ = probleme de corectat.
Exemplele U4/U6 (meniul „Proiect”) se deschid fără ghid, cu un banner „Exemplu”.

## Modele de calcul (anexe)

| Model | Anexă | Principiu |
|------|-------|-----------|
| Linie electrică / elemente comune | Anexa 1 (art. 12) | Costul fiecărui tronson se împarte în **cote egale** între utilizatorii care îl folosesc. Compensația noului utilizator către unul existent = cost_înainte − cost_după (utilizatorii noi, pe rând). |
| Stație electrică / post de transformare | Anexa 2 (art. 13) | Repartizare **proporțională cu puterea aprobată**: `b_T = I_T / S_n`, `C_k = S_k · b_T`. |
| Instalație de racordare complexă | Anexa 3 | Sumă de componente după varianta punctului de racordare (1–4): linie `l_U1`, echipamente stație, stație (Anexa 2), linie `l_U2`. |
| Prevederi tranzitorii | Anexa 4 (art. 18) | Fosta metodologie Ord. 28/2003: `b = B / S`, `C_2 = S_2 · b · (l_2 / L)`. |
| Rețea finanțată de un dezvoltator | Anexa 5 (art. 2, 16) | Cotă eficiență/ineficiență pe segmente, `X_D = (1 − X_ef) · P_D / P_total`. |

Detalii despre formule și validarea lor: `docs/formule-ocr.md` (material local, nepublicat în repo — vezi `.gitignore`).

## Persistență și export

- **Persistență locală în IndexedDB** (DB `comp-degr`, store `proiecte`, proiectul
  curent sub id-ul `curent`), cu cache în memorie și fallback în `localStorage` doar
  dacă IndexedDB eșuează. Salvarea e amânată 400 ms la tastare; starea ei
  („Salvat local” / „Nu s-a putut salva”) apare în bara de sus.
  Migrare automată unică din `localStorage` (date vechi).
- **Undo** pentru acțiunile distructive (ștergeri, import, demo, proiect nou), buton
  „↶ Anulează”; Demo / Import / Proiect nou cer confirmare.
- **Import JSON sigur**: structura e normalizată, id-urile sunt reduse la
  `[A-Za-z0-9_-]`, referințele remapate; fișierele > 5 MB sau invalide sunt respinse
  fără a modifica proiectul curent. Aplicația are și CSP restrictiv (`index.html`).
- **Validare** (`js/validate.js`): valori negative, rezervă N-1 ≥ S_n, I_ef > I_total,
  l₂ > L, TVA în afara 0–100 etc. blochează calculul; avertismente pentru utilizatori
  noi neasignați pe niciun tronson/stație sau primul utilizator care lipsește din stație.
- Rezultatele se **actualizează automat** la orice modificare după primul calcul.
- **Art. 8 / art. 7 (conform textului consolidat al metodologiei):** compensația se
  calculează „numai dacă sunt îndeplinite cumulativ” condițiile — calculul e blocat altfel
  (cu opțiunea „Calculează oricum (informativ)”). Anii de la punerea în funcțiune se pot
  deriva din data PIF; pragul e 10 ani dacă primul utilizator e casnic (art. 8 alin. 2);
  „Data achitare TR” se verifică pentru fiecare beneficiar (art. 7 alin. 1); art. 19
  (fonduri publice nerambursabile) exclude aplicarea metodologiei; Anexa 5 pct. 1: 5 ani.
- **Art. 15 alin. 1 și 3:** pe linii, butonul „+ Circuit pe stâlpi existenți” modelează al doilea
  circuit montat pe stâlpii liniei primului utilizator (costul stâlpilor, în cote egale). La
  stații, bifa „Întărire post” limitează compensația la **capacitatea suplimentară** a
  transformatorului existent (S_n − puterile deja racordate); restul îl acoperă noul
  transformator, finanțat de noul utilizator.
- **Art. 6 alin. 5 — operatorul de rețea:** rolul „Operator de rețea” al unui utilizator îl
  asimilează unui utilizator nou (plătește compensație). Trebuie bifat pe tronsoanele/stațiile
  pe care le folosește.
- **Art. 7 alin. 2–3 — refacerea ATR:** în pasul 2 se marchează utilizatorii cu „ATR emis,
  contract neîncheiat” (cu valabilitatea și, opțional, tariful inițial). Când un utilizator
  e bifat ca prim, în Rezultate apare panoul de refacere: ATR-urile valabile se refac din
  oficiu, fără tarif, cu compensația și un **tarif recalculat estimat** (tarif − compensație,
  art. 1 alin. 2); cele expirate nu se refac.
- **Art. 17–18 — prevederi tranzitorii (Anexa 4 pct. B):** dacă primul utilizator are
  „Data contractului” înainte de 07.01.2016, regimul tranzitoriu se activează automat la
  Anexele 1–3: costul liniei/stației se reduce cu compensațiile primite sub Ord. 28/2003
  (ex. 50.000 − 13.500 = 36.500), iar utilizatorii cu contract anterior sunt ignorați la
  repartizare (art. 18 alin. 3). Modelul „Anexa 4 pct. A” rămâne calculatorul vechii metodologii.
- **Utilizatori noi multipli:** se racordează secvențial (Anexa 1), ordonați după Data ATR;
  cel mai târziu plătește și celor noi racordați înaintea lui.
- **Export CSV** — centralizatorul (separator `;`, zecimale cu virgulă, pentru Excel RO).
- **Printează / PDF** — print CSS curat al rezultatelor.
- **Salvează / Import JSON** — backup și partajare proiect.

## Structura proiectului

```
index.html               # punctul de intrare (CSP restrictiv, fără scripturi inline)
css/styles.css           # stiluri (responsive, print)
vendor/                  # Preact, hooks, htm (copii nemodificate) + licențe
js/norma.js              # fragmente din textul consolidat al metodologiei (informativ)
js/rules.js              # registrul unic de reguli/referințe (id → „art. …”, textul normei)
js/help.js               # texte de ajutor pe câmp și pe pas
js/state.js              # model de date (roluri), IndexedDB, sanitizare import, demo
js/validate.js           # validare → probleme { rule, tab, target, text }
js/engine.js             # motorul de calcul (Anexa 1–5, condiții, centralizator, explicații)
js/calc.js               # configurații pentru motor, costuri, condiții, calcul complet, CSV
js/guide.js              # ghidul: lista de pași derivată din stare (funcții pure)
js/store.js              # starea aplicației + acțiuni (undo, salvare, ghid, import/export)
js/ui/core.js            # componente: câmpuri legate de stare, ⓘ, chip-uri de referință, ferestre
js/ui/views_*.js         # vederile: Date generale/Utilizatori, Instalație, Rezultate
js/ui/app.js             # antet, pași, bara de ghid, ecran de start, API-ul AppUI
tests/test.html          # teste unitare motor (în browser)
tests/integration.html   # teste de integrare UI + motor + ghid + securitate (în browser)
tests/run.js             # rulează ambele pagini headless
tests/e2e.js             # e2e Playwright: ghid cu tastatură reală, focus, mobil, contrast
.github/workflows/ci.yml # lint + teste la fiecare push
# locale, nepublicate (în .gitignore): docs/, ajutatoare/ (documente sursă, PDF/xlsx)
```

Scripturile sunt **clasice** (nu module ES), pentru a funcționa direct de pe `file://`.

**Registrul de reguli** (`js/rules.js`) este singura sursă pentru referințele legale: validarea,
condițiile, ghidul și explicațiile de calcul trimit la o regulă prin id; interfața o afișează
uniform, iar un test verifică faptul că toate id-urile folosite există și au text în normă.

## Testare

Testele rulează în browser. Deschide:

- `tests/test.html` — teste unitare ale motorului (exemplele numerice din metodologie
  și din modelul `.xlsx`).
- `tests/integration.html` — teste de integrare (UI + motor + ghid + securitate).
- `tests/e2e.js` — scenarii e2e cu Playwright (nu rulează în browser).

Din linia de comandă (Chromium headless prin Playwright; `npm test` rulează paginile de test
și apoi scenariile e2e):

```
npm install
npx playwright install chromium
npm test        # rulează ambele pagini; cod de ieșire != 0 la eșec
npm run lint    # eslint
```

(`CHROME_PATH=/cale/chrome npm test` folosește un browser deja instalat.)  CI-ul din
GitHub Actions rulează lint + teste la fiecare push.

Acoperire: exemple din metodologie și din modelul `.xlsx` (20.000; 6.666,67/11.666,67;
`b_T`=250 → 25.000; `C_2`=13.500; 87,5%/9,375%; U4 → 500/500/500), calcul automat al costului
pe tronsoane, rotunjire, sanitizarea importului (XSS), validări, actualizarea automată a
rezultatelor, păstrarea focusului, undo, formatul CSV, ghidul pas cu pas (inclusiv un parcurs
complet cu tastatură reală), consistența referințelor legale, mobil (fără scroll orizontal) și contrast.

## Documente sursă

În `ajutatoare/`:

- `metodologie-2015.pdf` — textul metodologiei (recuperat integral).
- `02_Ord_180_2015.pdf` — scanat (OCR).
- `Model_calcul_compensatie_var_O180_2015.pdf` — scanat (OCR).
- `03/04/05_Calcul compensatii ... U4/U5/U6.xlsx` — model de calcul pentru 3 scenarii.

Anexa nr. 5 din Regulamentul de racordare și Ord. 59/2013 sunt menționate de
metodologie ca documente conexe.

## Limitări și idei de continuare

- Anexa 5 (rețeaua dezvoltatorului) este implementată pe baza modelului de calcul din
  metodologie; partea de analiză de eficiență economică nu este automatizată.
- De confirmat cu un specialist: Anexa 3, variantele 3 și 4 — conform textului literal al
  Anexei 3 se aplică doar Anexa 1 + Anexa 2 (transformator), deci echipamentele comune ale
  stației nu se adaugă (art. 6 alin. 1 lit. a pct. ii ar putea susține includerea lor).
- Nu există autentificare/multi-utilizator; datele sunt locale, per browser.
- Posibile extinderi: import direct din `.xlsx`, export `.xlsx`, proiecte multiple
  selectabile în UI, istoric/versiuni per proiect, grafice pentru schemă.
