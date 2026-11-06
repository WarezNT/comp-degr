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
- **Branding E.ON**: paleta, tipografia și **dimensiunile componentelor** preluate din
  E.ON UI-Kit (roșu `#EA1B0A`, gri cald, culori de sistem; butoane h44/h48, inputuri h44,
  pași cu cerc numerotat, tabele/notificări/toast/modal). Aplicația rămâne offline
  (se folosesc doar valorile, fără link-uri către CDN). Include: skip-link, `prefers-reduced-motion`,
  focus vizibil și focus în fereastra normei.
- **Manual de utilizare** (`manual.html`), cu toate anexele, exemple numerice și un
  **glosar complet de termeni, simboluri** (`b_L`, `I_T`, `S_n`, `C₂`, `X_ef` etc.),
  **abrevieri și unități**; se deschide din meniul **„Ajutor”** într-o **pagină nouă**.

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

1. **Date generale** — modelul de calcul (Anexa 1–5), operator, dată, cotă TVA (implicit 21%; alegi 19% sau „Altă valoare”, introdusă manual).
   Dacă nu ești sigur ce anexă alegi, deschide **„Ghid de alegere"**: răspunde la câteva
   întrebări despre instalație, primești anexa + varianta potrivită (cu temei legal) și o
   poți aplica cu un click; include și un **tabel de încadrare** (ce instalații intră în fiecare anexă).
2. **Utilizatori** — fiecare utilizator are **un singur rol**: *prim utilizator* (finanțator,
   primește), *nou* (plătește), *existent* sau *operator de rețea* (art. 6 alin. 5). Primul
   adăugat devine prim, al doilea nou. Contract/avize (art. 7, 17–18) într-un rând extensibil.
3. **Instalație** — pentru Anexa 1, completezi **costul lucrării** și **lungimea**, apoi
   lucrezi direct pe **schema liniei**: click dreapta pe un nod sau pe un tronson pentru
   utilizatori, derivări și tronsoane noi. Restul formularelor este strâns în **Detalii**.
   Stațiile/PT, instalația complexă, vechea metodologie și rețeaua de dezvoltator
   păstrează formularele lor.
4. **Rezultate** — stare (probleme cu link „Mergi la câmp”), rezumat (totaluri), centralizator cu
   **„Cum s-a calculat”** pe fiecare sumă (formulă + articol), condițiile art. 8 (restrânse când
   sunt îndeplinite), export CSV, print.

### Introducere grafică — Anexa 1

#### Editorul pe schemă (recomandat)

În pasul **Instalație**, fiecare linie se lucrează direct pe desen:

1. **Datele liniei** — costul lucrărilor `I_L`, lungimea totală `L` și, automat,
   costul specific `b_L = I_L / L`.
2. **Canvasul** — arată PR, nodurile, utilizatorii și tronsoanele. Click dreapta:
   - **pe un nod**: adaugă utilizator, adaugă derivare, prelungește linia cu un
     tronson nou sau șterge ramura;
   - **pe un tronson**: adaugă utilizator la distanța clickului, adaugă derivare
     sau împarte tronsonul (limită tehnică).
3. **Dialogurile** — apar direct peste schemă, cu ramura și distanța deja completate;
   scrii doar numele, lungimea și tipul.
4. **Detalii** — lista exactă de distanțe, tabelul de tronsoane, editorul tehnic,
   planșa și schema veche sunt ascunse într-o singură secțiune, ca să nu concureze
   cu canvasul.

Tronsoanele folosite de utilizatorii cu rol **Nou** sunt marcate cu roșu, inclusiv
pe derivări; o derivare tocmai adăugată primește eticheta **„nou”**. Tronsoanele se
regenerează la fiecare modificare. Liniile importate cu tronsoane manuale rămân
complet editabile în tabelul din **Detalii**, cu un buton explicit de trecere la
distanțe.

#### Derivări (ramuri) în mijlocul liniei

Click dreapta pe nodul sau pe tronsonul dorit → **Adaugă derivare**. Dialogul cere
ramura părinte, distanța de desprindere (de la începutul ramurii părinte, nu de la PR),
lungimea, denumirea și tipul LEA/LES. Poți alege orice punct al ramurii părinte,
deci derivarea poate porni și din mijlocul unui tronson. Aceeași acțiune există și
ca buton **+ Adaugă derivare** în **Detalii**.

Dacă linia este încă pe distanțe, trecerea la rețeaua cu ramuri se face automat
în aceeași acțiune, păstrând racordările. `I_L` rămâne neschimbat, iar costul
derivării se calculează automat din `b_L`; dacă derivarea aduce investiție nouă,
crește `I_L` după salvare. Operația are undo, iar lista ramurilor arată ierarhia
și punctul de desprindere. Pentru un tronson fizic nou care continuă linia, alege
**Prelungește linia (tronson nou)** din meniul nodului.

#### Planșă cu noduri + tabel (opțiune avansată)

În **Instalație → Detalii → Opțiuni avansate**, deschide **Planșă cu noduri + tabel**.
Schema este deasupra tabelelor; definițiile din tabel generează nodurile și
tronsoanele din desen.

- În **Tronsoane și nodurile dintre ele**, fiecare rând definește o porțiune:
  denumire, nod de început, lungime, cost, tip LEA/LES și finanțator documentat.
  La prima porțiune, originea este PR; la următoarea, alege nodul la care începe
  extinderea. Nodul de sfârșit se calculează automat din lungimea introdusă.
- Pentru **material uzual**, selectorul completează tipul liniei, conductorul/cablul
  și secțiunea; toate câmpurile rămân editabile manual. Catalogul include NA2XABY
  (3x35+16–3x240+120 mm²), NFA2X (50+3x50–50+3x95 mm²) și NA2XS(F)2Y
  monopolar, 20 kV, 150 mm². Sunt opțiuni descriptive și nu modifică formulele
  sau costurile de calcul; aceeași listă este disponibilă în editorii tehnici
  pentru zone, ramuri și tronsoane manuale. Tipul, conductorul/cablul și secțiunea
  se păstrează pe porțiune și se transmit tronsoanelor derivate; secțiunile compuse
  sunt păstrate ca text (de exemplu `3x35+16`), nu validate ca valori numerice.
  La conversia unei linii existente, presetul selectat se aplică și zonei tehnice
  care începe la 0 m. Nu este necesară migrarea proiectelor salvate.
- În tabelul **Racordarea utilizatorilor la noduri**, alege tronsonul și distanța
  locală de la începutul lui. Astfel se poate racorda un utilizator și în interiorul
  unei porțiuni; nodul intermediar apare în desen și traseul de la PR se calculează.
- Exemplu: Tronsonul 1, PR → Nod 1, **400 m / 40.000 lei**; U1 la 400 m.
  Tronsonul 2, Nod 1 → Nod 2, **500 m / 50.000 lei**; U2 la 500 m pe Tronsonul 2.
  Rețeaua are 900 m și 90.000 lei, iar distanța lui U2 de la PR este 900 m.
  Pentru U3 la 300 m pe Tronsonul 2, introdu 300 m în rândul lui U3: schema
  generează nodul intermediar la 700 m de PR.
- Tronsoanele și racordările se salvează la confirmarea explicită a fiecărui rând,
  nu la fiecare tastă. Escape anulează draftul. O linie existentă pe distanțe se
  transformă la prima salvare tabelară; racordările și limitele tehnice se păstrează,
  iar conversia se poate anula. Alocările manuale nu sunt convertite automat.
- LEA este desenată cu linie continuă, LES cu linie punctată. Culorile folosesc
  tokenii locali E.ON Storybook. Desenul este orientativ: poziția nodurilor nu
  stabilește metri, costuri sau racordări.
- **Opțiunile avansate** rămân disponibile pentru limite tehnice, alocări speciale și
  detaliul de calcul. Butonul **Formular avansat** revine din planșă la formularul simplu.

#### Schema veche și unelte grafice (în Detalii)

Deschide **Detalii → Schemă** pentru vechiul editor interactiv, util pentru
inspectarea tronsoanelor, mutarea limitelor și explicația vizuală a compensației.

- Selectează un utilizator din stânga (sau adaugă unul): se activează acțiunea
  **Racordează utilizator**. Apasă pe linie pentru a-l racorda; lungimea totală trebuie
  completată în prealabil. Alege **Selectează tronson** pentru a inspecta în panoul din
  dreapta un tronson fără să creezi o racordare.
- Selectează un cerc pentru a edita numele, codul PA, rolul, puterea, distanța și datele
  ATR/TR în panoul de proprietăți. Datele utilizatorului sunt comune tuturor liniilor.
- Originea este marcată cu simbolul tipului de PR și etichetată cu denumirea/codul și
  tensiunea. Inspectorul tronsonului arată intervalul de la PR, lungimea, costul,
  caracteristicile și utilizatorii; aceleași tronsoane pot fi selectate din tabel.
- Legenda diferențiază **LEA prin linie continuă** și **LES prin linie punctată**,
  inclusiv pe ramuri și în PDF; culorile folosesc tokenii locali E.ON Storybook;
  zonele cu limite tehnice sunt marcate separat. Tipul nespecificat sau „Altul” are
  un stil distinct și rămâne identificat textual în legendă.
- Alege **Editează limite** pentru a adăuga o delimitare prin click pe linie sau pentru
  a muta un marcaj prin tragere. Inspectorul permite introducerea distanței exacte,
  inclusiv zecimale; limitele nu pot coincide sau ieși din lungimea liniei. Modificările
  regenerează tronsoanele, se pot anula și nu schimbă pozițiile utilizatorilor.
- Mută cercul prin tragere (pas de 1 m) sau introdu distanța exactă, inclusiv zecimale.
  Din tastatură, cercurile se selectează cu Enter/Spațiu și se mută cu săgețile stânga/dreapta.
- Traseul utilizatorului selectat și tronsoanele folosite sunt evidențiate cu albastru.
  „Deconectează de pe linie” elimină doar racordarea, nu utilizatorul.
- La selectarea unui utilizator **Nou** (sau **Operator de rețea**), schema explică
  automat compensația: tronsoanele care generează plăți sunt marcate cu roșu și
  „Comp.”, iar panoul arată contribuția fiecăruia, beneficiarii, formula și totalul
  fără TVA pe linie, separat de totalul întregului proiect. Click pe contribuție
  deschide inspectorul tronsonului. Traseul albastru nu implică automat o plată.
  Explicațiile folosesc motorul existent, inclusiv ordinea noilor utilizatori și
  regulile tranzitorii; datele invalide sau condițiile neîndeplinite blochează și
  explicația. Calculul informativ este etichetat explicit, iar centralizatorul rămâne
  reperul pentru rotunjirea sumelor cumulate pe beneficiar.
- Liniile cu tronsoane manuale cer conversie explicită, cu avertisment și posibilitatea de
  anulare: conversia poate înlocui costurile și alocările manuale.
- În **Rezultate → Printează / PDF**, raportul Anexei 1 include automat schemele
  tuturor liniilor, PR, utilizatorii, limitele tehnice și legenda LEA/LES. Alege
  „Salvează ca PDF” în dialogul browserului; nu este necesară o bibliotecă externă.
  Liniile lungi sunt împărțite în blocuri de cel mult trei tronsoane, cu numerotare
  continuă și tabele cu distanțe, caracteristici, costuri și alocări exacte.
  Pentru liniile manuale, cercul indică ultimul tronson al utilizatorului, nu
  folosirea tuturor tronsoanelor anterioare; alocările din tabel sunt determinante.

Schema este orientativă; calculul folosește distanțele numerice și aceleași date ca
formularul. Poziția în desen nu stabilește rolurile sau ordinea racordării.
Stațiile au propriul mod grafic descris mai jos; celelalte anexe păstrează editorii existenți.
Datele se salvează local și se exportă în același format JSON. Alegerea modului și
selecția vizuală nu sunt salvate în proiect.

### Ramuri și subramuri — Anexa 1

#### Planșă cu noduri

După conversia explicită la ramuri, în **Instalație → Detalii → Opțiuni avansate →
Planșă cu noduri + tabel**, desenul SVG este deasupra tabelelor de porțiuni și racordări.
**Extinde planșa** oferă mai mult spațiu desenului în aceeași
pagină; butonul de revenire sau Escape închide modul extins. Totul funcționează
offline, fără biblioteci sau servicii noi.

- Tabelul este fluxul principal de introducere: o porțiune începe la un nod ales și
  se termină la nodul rezultat din lungimea locală. Un consumator se racordează la
  o porțiune și distanță locală, nu este el însuși o ramură.
- Exemplu: porțiune inițială LES **400 m / 40.000 lei**, U1 în nodul de la 400 m;
  continuare **500 m / 50.000 lei**, U2 în nodul de la 900 m. Total: **900 m și
  90.000 lei**. Cu U1 prim utilizator și U2 nou, fără reduceri/excluderi,
  motorul existent calculează **20.000 lei fără TVA** pe porțiunea comună.
- Pentru U3 pe extindere, alege Tronsonul 2 și distanța locală **300 m** în tabelul
  racordărilor: schema generează nodul la **700 m de la PR**.
- Costul introdus este **costul porțiunii**, fără bifă separată de activare.
  La adăugare sau modificare de lungime/cost, costurile automate existente se
  fixează la valorile curente, apoi se actualizează investiția totală.
  Ștergerea unei porțiuni elimină și continuările/racordările dependente și
  deduce costurile eliminate; utilizatorii rămân în proiect. Operațiile au undo.
- **Finanțator documentat** este o referință opțională, salvată în JSON.
  **Nu modifică beneficiarii sau formula de compensare.** Investițiile succesive
  U1 → U2 → U3 nu sunt un registru financiar automat; verifică separat
  drepturile și documentele. Proiectele vechi nu primesc finanțatori presupuşi.
- Trage nodurile sau folosește **Shift + săgeți** pentru aranjare; Enter/Spațiu
  selectează. Zoomul și derularea ajută navigarea. Pozițiile se salvează, dar nu
  stabilesc metri, costuri sau racordări. Acțiunile din tabel pot selecta rândul în
  desen. **Resetează planșa** elimină aranjarea și
  nodurile libere, fără a elimina porțiuni, utilizatori sau limite tehnice.
- Formularele păstrează drafturile fără salvare la fiecare tastă; confirmarea
  se face cu butonul formularului/Enter, iar Escape anulează draftul.
  **Opțiunile avansate** păstrează limitele tehnice, alocările speciale și toate
  controalele existente. Conversia datelor vechi în rețea radială este explicită.

#### Formularul avansat existent

În **Rezultate → Detaliu pe tronsoane**, numărul participanților este etichetat ca
situație finală. Fiecare utilizator nou are o etapă separată cu numărul de participanți
înainte și după racordare, plățile sale și motivul lipsei compensațiilor, dacă este cazul.

- În **Instalație**, apasă **→ Rețea cu ramuri** pentru o linie validă pe distanțe.
  Conversia este explicită: linia existentă devine ramura principală, păstrând
  racordările, zonele și calculul. **Anulează** revine la starea anterioară.
  Liniile cu alocări manuale necesită mai întâi conversia explicită pe distanțe;
  un cost specific manual diferit de `I_L / L` trebuie corectat înainte.
- Selectează ramura, apoi **+ Ramură / subramură**. Inspectorul permite alegerea
  părintelui, punctului de desprindere, lungimii și caracteristicilor LEA/LES.
  Rețeaua are o singură origine la PR, fără bucle sau reuniri.
- Distanțele utilizatorilor și limitelor tehnice sunt **locale**, măsurate de la
  începutul ramurii. Selectează utilizatorul și ramura, introdu distanța exactă
  (acceptă virgulă zecimală), sau folosește **Racordează pe schemă** și click.
  **Inspectează** selectează tronsoane fără să schimbe racordările.
- Lungimea totală este suma lungimilor fizice ale ramurilor, nu suma traseelor
  utilizatorilor. Fiecare utilizator folosește numai drumul său până la PR;
  ramurile surori nu sunt incluse, iar trunchiul comun se numără o singură dată.
- `I_L` rămâne **investiția totală inclusiv costurile proprii**. Opțional, bifează
  **Cost propriu pentru întreaga ramură**: acel cost se repartizează uniform pe
  ramura respectivă, iar restul investiției se distribuie proporțional cu
  lungimile ramurilor automate. Adăugarea unei ramuri nu mărește automat `I_L`.
  Costurile proprii nu pot depăși investiția; dacă toate ramurile au cost propriu,
  suma lor trebuie să fie exact `I_L`.
- Limitele tehnice se editează în inspectorul ramurii; caracteristicile descriu
  rețeaua și nu adaugă tarife. Ștergerea unei ramuri cere confirmare și elimină
  subramurile, limitele și racordările dependente, nu utilizatorii din proiect.
- Traseul albastru și compensațiile roșii folosesc același motor de calcul,
  inclusiv ordinea noilor utilizatori. PDF-ul include fiecare ramură, părintele,
  desprinderea, utilizatorii și alocările exacte. Ramurile cu mulți utilizatori
  au continuări grafice de maximum șase racordări per bloc.

Exemplu de verificare: [rețea ramificată](exemple/teste-prezentare/anexa-1-ramuri.json)
și [pașii de testare](exemple/teste-prezentare/README.md).

Referința vizuală este [E.ON UI-Kit Storybook](https://storybook.web-ui.eon.com/eon/master/?path=/docs/intro--docs),
inclusiv componenta **Form / Segmented Button Group** pentru selectorul de mod:
înălțime 48 px, selecție albastră `#0075c2`, hover activ `#00568f` și focus vizibil.
Editorul folosește tokenii E.ON comuni aplicației; acțiunile principale rămân roșii.
Adaptarea este implementată local în HTML/CSS/SVG, nu prin încărcarea bibliotecii
sau a fonturilor de pe CDN. Fontul E.ON este folosit doar dacă este instalat local.

### Originea liniei și caracteristici tehnice

În fiecare linie, deschide **Originea liniei (PR) și caracteristici tehnice**:

- PR: tip (post de transformare, firidă, stație, stâlp, altul), denumire/cod,
  nivel de tensiune în kV și observații. Aceste date nu adaugă costul obiectului în calcul.
- În modul pe distanțe, adaugă **zone tehnice** cu distanța de început de la PR,
  tip LEA/LES/altul, conductor/cablu, secțiune în mm² și observații.
  De exemplu: LES de la 0 m, LEA de la 100 m. O zonă continuă până la următoarea
  sau până la capătul liniei; partea dinaintea primei zone rămâne nespecificată.
- Limitele tehnice împart automat tronsoanele, chiar dacă nu există utilizatori acolo.
  Mutarea unui utilizator nu mută și limita tehnică. Toate segmentele păstrează același
  cost specific al liniei; caracteristicile nu introduc tarife diferite.
- În modul manual, caracteristicile se introduc direct pe fiecare tronson.
  La conversia pe distanțe sunt preluate în zone tehnice.

Datele se păstrează în salvarea locală și în JSON. Limitele duplicate, negative sau
în afara liniei blochează calculul și sunt indicate în validare.

Indicatorii de pe pași arată starea: ✓ completat, număr = pași rămași, ✕ = probleme de corectat.
Exemplele U4/U6 (meniul „Proiect”) se deschid fără ghid, cu un banner „Exemplu”.

### Introducere grafică — Anexa 2

În **Instalație**, fiecare stație/PT are selectorul **Formular / tabel → Schemă**,
cu aceleași culori E.ON și aceleași date ca formularul. Nu este necesară conversia
proiectului; alegerea modului și selecția nu schimbă datele sau rezultatul salvat.

- Selectează **transformatorul** pentru capacitatea nominală, rezerva N−1,
  investiție, întărire și compensațiile vechi. Rezerva este desenată separat,
  cu linie întreruptă, și exclusă din capacitatea efectivă.
- Selectează **echipamentele comune** pentru costul lor, separat de transformator.
  Acestea se repartizează în cote egale, succesiv, între participanții eligibili.
- Selectează un **utilizator** din paletă sau din schemă (click/Enter/Spațiu)
  pentru nume, cod PA și putere aprobată. Puterea este comună tuturor stațiilor
  și liniilor; rolul și avizele se editează în pasul Utilizatori.
  **Racordează la stație / Deconectează de la stație** sunt acțiuni explicite.
- Câmpurile inspectorului se confirmă la Tab/Enter/pierderea focusului, acceptă
  virgulă zecimală și au **Anulează**; Escape abandonează textul neconfirmat.
  Textul tastat nu este pierdut la o salvare asincronă.
- Pentru un utilizator nou, componentele care generează plăți sunt marcate
  roșu și însoțite de **Comp.**. Panoul explică beneficiarii, formulele,
  totalul pe stație și totalul proiectului, folosind numai motorul existent.
  Click pe contribuție deschide inspectorul componentei.
- La **întărire**, panoul arată capacitatea suplimentară inițială și puterea
  compensată pentru fiecare nou utilizator, în ordinea din proiect. Partea
  acoperită de noul transformator nu generează compensație pentru cel existent.
  Regimul tranzitoriu folosește investiția netă și exclude participanții vechi
  conform regulilor existente; utilizatorii fizic racordați rămân în desen.
- Datele invalide sau condițiile cumulative neîndeplinite blochează și explicația
  vizuală. Calculul informativ este etichetat explicit.
- **Rezultate → Printează / PDF** include schemele stațiilor, rezerva,
  capacitățile, lista completă a utilizatorilor și formulele compensațiilor.
  Schemele se împart în blocuri de maximum șase utilizatori; simbolurile
  repetate pe continuări nu reprezintă investiții suplimentare.

Exemple: [stație cu N−1](exemple/teste-prezentare/anexa-2-statie.json) și
[întărire în două etape](exemple/teste-prezentare/anexa-2-intarire.json).

### Introducere grafică — Anexele 3–5

În **Instalație → Schemă**, selectează componentele pentru a le deschide inspectorul.
Formularele rămân disponibile; schema folosește aceleași date, fără migrare sau
conversie automată. Explicațiile sunt calculate de motorul existent; datele invalide
și condițiile neîndeplinite nu produc sume aparent valide.

- **Anexa 3:** alege varianta și utilizatorul nou analizat. Harta arată separat
  toate liniile și stațiile, inclusiv componentele inactive. Selecția sau clickul pe
  o contribuție deschide editorul componentei, fără a schimba racordările.
  Rolul liniei (`l_U1`, `l_U2`, neinclusă), includerea stației și varianta se pot anula.
  În **varianta 2**, inspectorul stației editează numai echipamentele comune și
  racordările; transformatorul nu intră în calcul sau în raportul de cost.
  Validarea urmărește componentele active: datele păstrate în l_U2 (variantele
  1–3) sau în transformator (variantele 1–2) nu blochează calculul curent.
  La activarea lor într-o altă variantă, valorile sunt din nou validate.
  În regimul tranzitoriu, și echipamentele variantei 2 exclud participanții vechi,
  după aceleași reguli ca în celelalte variante; racordările fizice se păstrează.
  Liniile cu ramuri folosesc același editor ca Anexa 1; liniile manuale cer în
  continuare conversie explicită înainte de plasarea grafică a utilizatorilor.
- **Anexa 4 pct. A:** selectează investiția/capacitatea, utilizatorul sau lungimile.
  Bara arată proporția `l₂ / L`, nu o poziție topografică. Inspectorul păstrează
  formula `C₂ = S₂ × (B / S) × (l₂ / L)`; lungimea zero este permisă, dar `S = 0`,
  `L = 0` sau `l₂ > L` blochează calculul.
- **Anexa 5:** bara separă investiția eficientă de cea ineficientă; fiecare
  dezvoltator are puterea, ponderea și cota în lei. Selectează investiția pentru
  `I_total`/`I_ef`, sau un dezvoltator pentru denumire/putere. Adăugarea și
  ștergerea au undo; ștergerea cere confirmare. `I_ef` rămâne rezultatul introdus
  al analizei economice, nu o estimare automată făcută de desen.

În inspectorii noi, **Tab/Enter confirmă** valorile și **Escape anulează draftul**.
Tastarea nu salvează și nu recalculează la fiecare caracter. Datele confirmate se
salvează local și în JSON. Schemele nu schimbă ordinea etapelor sau formulele.
**Mergi la câmp** din ghid sau din lista problemelor deschide inspectorul necesar
și secțiunile închise. Pentru tronsoanele manuale se deschide formularul, fără
conversie. Navigarea nu adaugă modificări în istoricul de anulare.

**Rezultate → Printează / PDF** include schemele și explicațiile pentru modelul
ales: componentele active ale Anexei 3, formula Anexei 4 sau repartițiile Anexei 5.
La Anexa 3, componentele inactive sunt identificate în hartă, fără rapoarte de cost;
la Anexa 5 sunt maximum șase dezvoltatori într-un bloc grafic. Rapoartele nu includ
controale de editare; calculele informative rămân etichetate explicit.

Pentru verificare manuală, folosește [scenariile și pașii de prezentare](exemple/teste-prezentare/README.md).

### Introducere asistată — de la situația reală la rezultat

1. În **Date generale → Pornește de la situația reală — Ghid de alegere**,
   identifică instalația finanțată și poziția PR. Varianta Anexei 3 se alege
   explicit. Recomandarea nu schimbă proiectul până la **Aplică recomandarea**,
   inclusiv când schimbi numai varianta; aplicarea se poate anula.
   Reconstituirea după Ord. 28/2003 este distinctă de regimul tranzitoriu pentru
   o racordare actuală. Răspunsurile sunt temporare, nu confirmări legale.
2. În **Utilizatori** și **Instalație**, deschide lista documentelor necesare.
   Îndrumările câmpurilor importante explică sursa, unitatea și efectul:
   metri, nu kilometri; kVA, nu kW sau consum; costuri comune fără dublă numărare.
   Datele neutilizate de modelul curent sunt semnalate; nu se șterg.
3. În **Rezultate → Revizie înainte de calcul**, verifică finanțatorul,
   utilizatorii noi, traseele, componentele active, valorile lipsă și riscurile.
   **Datele relevante** oferă valoarea, documentul-sursă și **Verifică / corectează**
   către formularul sau inspectorul necesar. Problemele existente rămân într-o
   singură listă, cu legături de corectare.
4. Confirmarea reviziei este numai un reper temporar pentru datele curente.
   Nu se salvează în JSON, se pierde la schimbare/părăsirea vederii și nu confirmă
   condițiile sau documentele în locul utilizatorului. Calculul rămâne disponibil
   cu validările și blocările existente.
5. După calcul, **Înțelege rezultatul** explică factorii zero, lipsa unui traseu
   activ, participanții excluși sau lipsa unei plăți. Transformatorul și
   echipamentele sunt explicate separat. Modifică numai date justificate, nu
   valori alese pentru a obține o sumă-țintă.

**Zero nu înseamnă necunoscut.** Poate fi valid, dar trebuie verificat în documente;
valorile implicite și condițiile bifate nu sunt dovezi. Ghidul acceptă zerourile
permise de model, iar revizia le semnalează pentru verificare. Îndrumările și
revizia interactivă nu apar în PDF. Formulele și schema JSON nu se schimbă.

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
manual.html              # manual de utilizare (toate anexele + exemple), deschis din „Ajutor”
css/styles.css           # stiluri (responsive, print)
css/manual.css           # stilurile manualului (cuprins, tipar, print)
vendor/                  # Preact, hooks, htm (copii nemodificate) + licențe
js/norma.js              # textul consolidat al metodologiei (informativ; formulele/schemele apar ca marcaje)
js/rules.js              # registrul unic de reguli/referințe (id → „art. …”, textul normei)
js/help.js               # texte de ajutor pe câmp și pe pas
js/select.js             # ghidul de alegere a anexei/variantei (recommend, tabel de încadrare)
js/state.js              # model de date (roluri), IndexedDB, sanitizare import, demo
js/tree.js               # rețea radială: validare, trasee, tronsoane și costuri pe ramuri
js/validate.js           # validare → probleme { rule, tab, target, text }
js/engine.js             # motorul de calcul (Anexa 1–5, condiții, centralizator, explicații)
js/calc.js               # configurații pentru motor, costuri, condiții, calcul complet, CSV
js/guide.js              # ghidul: lista de pași derivată din stare (funcții pure)
js/store.js              # starea aplicației + acțiuni (undo, salvare, ghid, import/export)
js/ui/core.js            # componente: câmpuri legate de stare, ⓘ, chip-uri de referință, ferestre
js/ui/views_*.js         # vederile: Date generale/Utilizatori, Instalație, Rezultate, Ghid de alegere
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
complet cu tastatură reală), **ghidul de alegere a anexei/variantei** (`AppSelect.recommend`),
consistența referințelor legale, mobil (fără scroll orizontal) și contrast.

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
- **De confirmat cu un specialist (problemă deschisă):** Anexa 3, variantele 3 și 4.
  Textul literal al Anexei 3 lit. c) și d) prevede doar Anexa 1 (linia `l1`, respectiv
  `l1` + `lu2`) + Anexa 2 (stația/PT); echipamentele comune ale stației, altele decât
  transformatoarele, sunt menționate expres doar la varianta 2 lit. b) pct. (ii). Rămâne
  de stabilit dacă la v3/v4 ele se adaugă separat sau sunt deja cuprinse în `I_T` din
  Anexa 2: art. 6 alin. (1) lit. a) pct. (ii) și art. 12 alin. (1) pot susține includerea,
  dar o adăugare separată ar produce dublă numărare dacă `I_T` le include deja.
  Implementarea actuală le include în v3/v4 cu titlu de ipoteză de lucru.
- Nu există autentificare/multi-utilizator; datele sunt locale, per browser.
- Posibile extinderi: import direct din `.xlsx`, export `.xlsx`, proiecte multiple
  selectabile în UI, istoric/versiuni per proiect, grafice pentru schemă.
