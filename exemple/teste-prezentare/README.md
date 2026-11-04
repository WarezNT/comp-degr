# Scenarii JSON pentru prezentare

Importă fiecare fișier din meniul **Proiect → Import JSON**, apoi apasă **Calculează**
sau deschide pasul **Rezultate**. Scenariile sunt independente și folosesc date
demonstrative; după import pot înlocui proiectul deschis.

| Fișier | Metodă | Rezultat așteptat, fără TVA |
|---|---|---|
| `anexa-1-linie.json` | Anexa 1 — linie, alocare diferențiată pe tronsoane | U3 plătește 1.000 lei lui U1 și 2.500 lei lui U2 (total 3.500 lei) |
| `anexa-1-editor-grafic.json` | Anexa 1 — schemă cu PR, LES/LEA și doi utilizatori noi | U3: 2.000 lei; U4: 2.600 lei; total 4.600 lei |
| `anexa-1-ramuri.json` | Anexa 1 — ramuri A, B și subramura A1, cost propriu opțional | U3: 580 lei; U4: 540 lei; total 1.120 lei |
| `anexa-2-statie.json` | Anexa 2 — transformator, rezervă N-1 și echipamente comune | U3 plătește 41.500 lei lui U1 și 1.500 lei lui U2 (total 43.000 lei) |
| `anexa-2-intarire.json` | Anexa 2 — întărire post, doi utilizatori noi succesivi | U3: 56.333,33 lei; U4: 15.583,33 lei; total 71.916,66 lei |
| `anexa-3-varianta-1.json` | Anexa 3, varianta 1 — l_U1 | Total 10.000 lei: câte 5.000 lei către U1 și U2 |
| `anexa-3-varianta-2.json` | Anexa 3, varianta 2 — l_U1 + echipamente comune | Total 14.000 lei: câte 7.000 lei către U1 și U2 |
| `anexa-3-varianta-3.json` | Anexa 3, varianta 3 — l_U1 + stație/PT | Total 39.000 lei: 32.000 lei către U1 și 7.000 lei către U2 |
| `anexa-3-varianta-4.json` | Anexa 3, varianta 4 — l_U1 + stație/PT + l_U2 | Total 45.000 lei: 35.000 lei către U1 și 10.000 lei către U2 |
| `anexa-4-tranzitoriu.json` | Anexa 4 pct. A — Ord. 28/2003 | `b = 500 lei/kVA`; compensația `C₂ = 13.500 lei` |
| `anexa-5-dezvoltator.json` | Anexa 5 — rețea finanțată de dezvoltatori | Dezvoltatorii A, B și C: 30.000, 15.000 și 15.000 lei (total 60.000 lei) |

TVA-ul este setat la 21% pentru modelele cu centralizator; rezultatul cu TVA este
afișat separat de cel fără TVA. Pentru Anexa 5, sumele reprezintă cotele din
componenta ineficientă a investiției.

## Parcurs grafic — Anexa 3, toate variantele

Importă succesiv scenariile [varianta 1](./anexa-3-varianta-1.json),
[varianta 2](./anexa-3-varianta-2.json), [varianta 3](./anexa-3-varianta-3.json)
și [varianta 4](./anexa-3-varianta-4.json).

1. În **Instalație → Schemă**, alege **U3** din „Utilizator nou analizat”.
   Totalurile trebuie să fie, respectiv, **10.000**, **14.000**, **39.000** și
   **45.000 lei fără TVA**.
2. În varianta 4 verifică **10.000 lei l_U1**, **29.000 lei stație**
   (25.000 transformator + 4.000 echipamente) și **6.000 lei l_U2**.
   Click pe contribuție deschide inspectorul componentei corecte.
3. Schimbă varianta în **2**: l_U2 devine inactivă, iar stația contribuie numai
   cu **4.000 lei echipamente**. Inspectorul stației nu oferă costul transformatorului.
   Modifică echipamentele din 12.000 în 15.000 lei, confirmă cu Enter:
   total **15.000 lei**. **Anulează** restaurează totalul de 14.000 lei.
4. Componentele inactive rămân vizibile și păstrează datele. Schimbarea variantei,
   rolului liniei sau includerii stației se poate anula.
5. Liniile acestor exemple sunt manuale: simpla selectare nu le convertește.
   Pentru plasare grafică, folosește conversia explicită, citește avertismentul
   și revino cu **Anulează** dacă nu dorești înlocuirea alocărilor manuale.
6. În **Rezultate → Printează / PDF**, verifică numai rapoartele componentelor
   active. În varianta 2 nu trebuie să apară un raport de transformator.
7. Test de validare: în varianta 4 pune rezerva stației la **500 kVA**,
   peste S_n de 400 kVA — calculul se blochează. Schimbă în **varianta 2**:
   total **14.000 lei**, fiind folosite numai echipamentele. Datele transformatorului
   se păstrează; revenirea în varianta 4 readuce eroarea. Anulează modificările.
8. Test tranzitoriu: în varianta 2, la **Utilizatori**, pune data contractului
   U1 la **2015-01-01** și U2 la **2015-02-01**. U2 este exclus din repartizare:
   U3 plătește **15.000 lei pe l_U1 + 6.000 lei echipamente = 21.000 lei** numai
   către U1. PDF păstrează U2 în racordări, etichetat „Exclus prin regimul tranzitoriu”.

În toate anexele, **Mergi la câmp** deschide inspectorul/secțiunea necesară și
focalizează controlul. Navigarea nu modifică proiectul; la o linie manuală deschide
formularul fără să convertească alocările.

## Parcurs grafic — Anexa 4 pct. A

Importă [anexa-4-tranzitoriu.json](./anexa-4-tranzitoriu.json), apoi alege
**Instalație → Schemă**.

1. Verifică `B = 50.000 lei`, `S = 100 kVA`, `S₂ = 30 kVA`,
   `l₂ = 90 m`, `L = 100 m`: bara este **90%**, `b = 500 lei/kVA`,
   **C₂ = 13.500 lei**.
2. Selectează **Traseu folosit** și introdu `80,5` la l₂. Până la Tab/Enter,
   calculul nu se schimbă; Escape renunță la draft. Confirmarea produce
   **C₂ = 12.075 lei**; **Anulează** restaurează 13.500 lei.
3. `l₂ = 0` produce **0 lei**, `l₂ = 100` produce **15.000 lei**.
   `l₂ = 101`, `L = 0` sau `S = 0` afișează eroare, fără bară/formulă valide.
4. Verifică formula în **Printează / PDF** și reîncarcă pagina:
   valorile confirmate trebuie păstrate. Pct. B rămâne tratat prin regulile
   tranzitorii ale Anexelor 1–3, nu prin acest desen.

## Parcurs grafic — Anexa 5

Importă [anexa-5-dezvoltator.json](./anexa-5-dezvoltator.json), apoi alege
**Instalație → Schemă**.

1. Verifică investiția de **150.000 lei**, componenta eficientă de **90.000 lei**
   (**60%**) și componenta ineficientă de **60.000 lei** (**40%**).
   Puterile 100/50/50 kVA repartizează **30.000/15.000/15.000 lei**.
2. Selectează A și confirmă puterea de **150 kVA**:
   cotele devin **36.000/12.000/12.000 lei**. Poți modifica și denumirea.
3. Adaugă un dezvoltator: puterea inițială zero nu schimbă cotele celorlalți.
   Ștergerea cere confirmare, iar adăugarea/ștergerea se pot anula.
4. Selectează investiția: `I_ef = I_total` produce cote zero, `I_ef = 0`
   repartizează întreaga investiție. `I_ef > I_total`, `I_total = 0` sau puterea
   totală zero blochează calculul. Aplicația nu stabilește automat I_ef.
5. În **Printează / PDF**, verifică numele complete, puterile și formulele.
   Reîncarcă pagina pentru a verifica persistența; formularul vede aceleași date.

## Parcurs de verificare a stației / PT — Anexa 2

Importă [anexa-2-statie.json](./anexa-2-statie.json), apoi alege
**Instalație → Schemă**.

1. Verifică **S_n = 500 kVA**, **rezervă = 100 kVA**, capacitate efectivă
   **400 kVA**, investiție **200.000 lei** și **b_T = 500 lei/kVA**.
2. Selectează **U3**, de 80 kVA: **40.000 lei** pentru transformator, către U1,
   plus **1.500 lei** pentru echipamente către fiecare dintre U1 și U2.
   Total **43.000 lei fără TVA**. Echipamentele au cost 9.000 lei;
   etapa este **2 → 3 participanți**.
3. Modifică puterea U3 la **90,5 kVA**, apoi apasă Tab: total **48.250 lei**.
   Revino cu **Anulează**. Selectarea simplă nu modifică racordările.
4. Apasă **Deconectează de la stație**: U3 rămâne în proiect, fără plăți aici.
   **Anulează** restaurează racordarea și compensația.
5. Selectează transformatorul și pune rezerva la 500 kVA: eroare explicită,
   fără valori de compensație aparent valide. Revino cu **Anulează**.
6. În **Rezultate → Printează / PDF**, verifică schema, rezerva N−1,
   lista de trei utilizatori și formulele. Reîncarcă pagina pentru a verifica
   persistența datelor.

Pentru întărire, importă [anexa-2-intarire.json](./anexa-2-intarire.json):

- Capacitate efectivă existentă **300 kVA**, ocupată inițial **200 kVA**,
  deci **100 kVA** suplimentari.
- U3 folosește **80 kVA**; U4 mai poate compensa doar **20 din cei 80 kVA**.
- b_T este `200.000 / 300` lei/kVA; motorul păstrează precizia completă,
  chiar dacă interfața afișează 666,67.
- Plățile fără TVA trebuie să fie:

  | Plătitor | Beneficiar | Fără TVA |
  |---|---|---:|
  | U3 | U1 | 54.833,33 lei |
  | U3 | U2 | 1.500 lei |
  | U4 | U1 | 14.083,33 lei |
  | U4 | U2 | 750 lei |
  | U4 | U3 | 750 lei |
  | **Total** | | **71.916,66 lei** |

Nu se schimbă formulele în funcție de poziția din desen; ordinea etapelor este
ordinea utilizatorilor noi din proiect.

## Parcurs de verificare a editorului grafic

Importă [anexa-1-editor-grafic.json](./anexa-1-editor-grafic.json). Datele sunt
fictive, cu data calculului fixată; nu reprezintă un aviz tehnic.

1. În **Instalație → Schemă**, verifică PR **PT DEMO 01, 0,4 kV** și linia de
   **1.000 m / 12.000 lei**, cu `b_L = 12 lei/m`.
2. Zonele sunt LES de la 0 m, LEA de la 150 m, LES de la 500 m.
   Racordările sunt U2 la 200 m, U1 la 400 m, U3 la 600 m și U4 la 800 m.
   Rezultă **7 tronsoane**; ultimul, 800–1.000 m, nu are utilizatori.
3. Selectează **U3**: **2.000 lei** fără TVA, din primele 3 tronsoane.
   Selectează **U4**: **2.600 lei**, din primele 5 tronsoane.
   U4 plătește și către U3, deoarece utilizatorii noi sunt introduși secvențial,
   în ordinea lor din lista proiectului (nu după poziția pe linie).
4. În **Rezultate**, verifică plățile:

   | Plătitor | Beneficiar | Fără TVA | Cu TVA 21% |
   |---|---|---:|---:|
   | U3 | U1 | 1.600 lei | 1.936 lei |
   | U3 | U2 | 400 lei | 484 lei |
   | U4 | U1 | 600 lei | 726 lei |
   | U4 | U2 | 200 lei | 242 lei |
   | U4 | U3 | 1.800 lei | 2.178 lei |
   | **Total** | | **4.600 lei** | **5.566 lei** |

5. Folosește **Printează / PDF → Salvează ca PDF**: raportul trebuie să includă
   toate cele 7 tronsoane în 3 blocuri, legenda, utilizatorii și datele tehnice.
6. Opțional, mută limita de la 150 la 175 m: tronsoanele se regenerează, dar
   totalul rămâne 4.600 lei, deoarece caracteristicile nu schimbă tariful.
   Revino cu **Anulează**.

## Parcurs de verificare a ramurilor și subramurilor

Importă [anexa-1-ramuri.json](./anexa-1-ramuri.json), apoi deschide **Instalație**.

1. Verifică **PT RADIAL DEMO**, linia principală de 100 m, ramura A de 60 m,
   ramura B de 40 m și subramura A1 de 20 m, desprinsă din A la 30 m.
   Lungimea fizică este **220 m**, investiția **2.640 lei**. A1 are cost propriu
   de 240 lei; rămân 2.400 lei pe 200 m automați, adică **12 lei/m**.
2. Selectează **U3**: traseul are **150 m** (100 + 30 + 20), dar compensația este
   **580 lei**, numai pe linia principală și primii 30 m din A.
   U3 nu folosește ramura B. A1 nu generează plată, nefiind folosită de
   utilizatorii racordați înaintea lui.
3. Selectează **U4**: **540 lei**, inclusiv 100 lei către U3, introdus anterior.
4. În **Rezultate**, verifică:

   | Plătitor | Beneficiar | Fără TVA | Cu TVA 21% |
   |---|---|---:|---:|
   | U3 | U1 | 380 lei | 459,80 lei |
   | U3 | U2 | 200 lei | 242 lei |
   | U4 | U1 | 100 lei | 121 lei |
   | U4 | U2 | 340 lei | 411,40 lei |
   | U4 | U3 | 100 lei | 121 lei |
   | **Total** | | **1.120 lei** | **1.355,20 lei** |

5. În inspectorul A, adaugă o subramură, modifică lungimea sau punctul de
   desprindere; verifică actualizarea lungimii totale și revino cu **Anulează**.
   Alegerea A1 ca părinte pentru A trebuie refuzată ca buclă.
6. În inspectorul A1, schimbă costul propriu la **440 lei**: investiția rămâne
   2.640 lei, iar tariful ramurilor automate devine **11 lei/m**. Revino cu
   **Anulează**. O racordare la 21 m pe A1 trebuie refuzată, lungimea fiind 20 m.
7. **Printează / PDF** trebuie să includă toate cele patru ramuri, punctele de
   desprindere și toate cele cinci tronsoane fizice (A este împărțită la 30 m).
   Reîncarcă pagina: topologia, costurile și racordările trebuie să rămână.
