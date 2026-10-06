# Compensatii bănești — racordare în etape diferite

Aplicație web (HTML + CSS + JavaScript vanilla, fără build tooling) pentru stabilirea
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
- Interfață integral în română, cu **coloană de ajutor** pe fiecare pas.

## Cum se rulează

Nu necesită server și nu necesită instalare. Deschide direct `index.html` într-un
browser modern (Chrome, Edge, Firefox):

```
index.html
```

Aplicația este 100% offline (fără CDN-uri, fără dependențe externe).

## Fluxul de utilizare

1. **Date generale** — operator, dată, cotă TVA, alegerea modelului de calcul (Anexa
   1–5) și selectarea **noului utilizator** (cel care plătește compensația).
2. **Utilizatori** — adaugă toți utilizatorii (cod PA, nume, putere aprobată, date
   ATR/TR, tip client, cine este primul utilizator).
3. **Instalație** — descrie elementele rețelei în funcție de modelul ales:
   linii + tronsoane și utilizatorii care le folosesc, stații/PT, configurația
   instalației complexe etc. Costurile se calculează automat.
4. **Rezultate** — bifează condițiile Art. 8, apasă **Calculează compensațiile**,
   verifică centralizatorul și exportă.

Butoane rapide în bara de sus: **Demo U4**, **Demo U6** (scenarii din modelul `.xlsx`),
**Proiect nou**, **Salvează JSON**, **Import JSON**.

## Modele de calcul (anexe)

| Model | Anexă | Principiu |
|------|-------|-----------|
| Linie electrică / elemente comune | Anexa 1 (art. 12) | Costul fiecărui tronson se împarte în **cote egale** între utilizatorii care îl folosesc. Compensația noului utilizator către unul existent = cost_înainte − cost_după. |
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
- Art. 8: „ani de la punerea în funcțiune” se poate deriva din data PIF.
- **Export CSV** — centralizatorul (separator `;`, zecimale cu virgulă, pentru Excel RO).
- **Printează / PDF** — print CSS curat al rezultatelor.
- **Salvează / Import JSON** — backup și partajare proiect.

## Structura proiectului

```
index.html               # punctul de intrare
css/styles.css           # stiluri (inclusiv layout cu coloană de ajutor, print)
js/engine.js             # motorul de calcul (Anexa 1–5, condiții, centralizator)
js/state.js              # model de date, IndexedDB, sanitizare import, demo
js/validate.js           # validarea datelor proiectului înainte de calcul
js/ui.js                 # interfață: formulare, tabele, calcul, export
tests/test.html          # teste unitare motor (în browser)
tests/integration.html   # teste de integrare UI + motor + securitate (în browser)
tests/run.js             # rulează ambele pagini headless (npm test)
.github/workflows/ci.yml # lint + teste la fiecare push
# locale, nepublicate (în .gitignore): docs/, ajutatoare/ (documente sursă, PDF/xlsx)
```

Scripturile sunt **clasice** (nu module ES), pentru a funcționa direct de pe `file://`.

## Testare

Testele rulează în browser. Deschide:

- `tests/test.html` — teste unitare ale motorului (exemplele numerice din metodologie
  și din modelul `.xlsx`).
- `tests/integration.html` — teste de integrare (UI + motor + IndexedDB).

Din linia de comandă (Chromium headless prin Playwright):

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
rezultatelor, păstrarea focusului, undo și formatul CSV.

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
- De clarificat cu un specialist (metodologic, nemodificat în cod): calculul „ca și cum
  ar veni singur” pentru mai mulți utilizatori noi pe același tronson; Anexa 2 plătește
  doar primului utilizator; tratamentul echipamentelor comune în Anexa 3 (var. 2 vs 3/4).
- Nu există autentificare/multi-utilizator; datele sunt locale, per browser.
- Posibile extinderi: import direct din `.xlsx`, export `.xlsx`, proiecte multiple
  selectabile în UI, istoric/versiuni per proiect, grafice pentru schemă.
