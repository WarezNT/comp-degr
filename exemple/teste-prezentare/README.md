# Scenarii JSON pentru prezentare

Importă fiecare fișier din meniul **Proiect → Import JSON**, apoi apasă **Calculează**
sau deschide pasul **Rezultate**. Scenariile sunt independente și folosesc date
demonstrative; după import pot înlocui proiectul deschis.

| Fișier | Metodă | Rezultat așteptat, fără TVA |
|---|---|---|
| `anexa-1-linie.json` | Anexa 1 — linie, alocare diferențiată pe tronsoane | U3 plătește 1.000 lei lui U1 și 2.500 lei lui U2 (total 3.500 lei) |
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
