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
| `anexa-3-varianta-1.json` | Anexa 3, varianta 1 — l_U1 | Total 10.000 lei: câte 5.000 lei către U1 și U2 |
| `anexa-3-varianta-2.json` | Anexa 3, varianta 2 — l_U1 + echipamente comune | Total 14.000 lei: câte 7.000 lei către U1 și U2 |
| `anexa-3-varianta-3.json` | Anexa 3, varianta 3 — l_U1 + stație/PT | Total 39.000 lei: 32.000 lei către U1 și 7.000 lei către U2 |
| `anexa-3-varianta-4.json` | Anexa 3, varianta 4 — l_U1 + stație/PT + l_U2 | Total 45.000 lei: 35.000 lei către U1 și 10.000 lei către U2 |
| `anexa-4-tranzitoriu.json` | Anexa 4 pct. A — Ord. 28/2003 | `b = 500 lei/kVA`; compensația `C₂ = 13.500 lei` |
| `anexa-5-dezvoltator.json` | Anexa 5 — rețea finanțată de dezvoltatori | Dezvoltatorii A, B și C: 30.000, 15.000 și 15.000 lei (total 60.000 lei) |

TVA-ul este setat la 21% pentru modelele cu centralizator; rezultatul cu TVA este
afișat separat de cel fără TVA. Pentru Anexa 5, sumele reprezintă cotele din
componenta ineficientă a investiției.

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
