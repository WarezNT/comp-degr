/*
 * Select — ghid de alegere a anexei (modelului de calcul) și a variantei.
 *
 * Pe baza Metodologiei ANRE 2015 (Ord. 180/2015) cartografiază tipurile de
 * instalații pe modelul de calcul potrivit: Anexa 1 (linie / elemente comune,
 * cote egale), Anexa 2 (stație/PT — transformator ∝ putere; echipamente comune
 * în cote egale), Anexa 3 (instalație complexă, variantele 1–4), Anexa 4
 * (regim tranzitoriu — situație, nu tip de instalație) și Anexa 5 (rețea de
 * dezvoltator). Funcții pure, fără DOM; referințele legale sunt id-uri din
 * AppRules (chip-urile „art. …”).
 */
(function (global) {
  'use strict';

  // Întrebarea principală: ce a finanțat primul utilizator (elementul folosit în comun).
  var OBIECTE = [
    ['linie', 'O linie electrică (LEA/LES, coloană comună) folosită de mai mulți utilizatori'],
    ['stalpi', 'Doar stâlpii unei linii aeriene existente (al doilea circuit)'],
    ['statie', 'O stație / post de transformare (transformator)'],
    ['echipamente', 'Doar echipamente electroenergetice / module de conexiune (fără transformator)'],
    ['complex', 'Atât o linie, cât și o stație/PT (instalație complexă, două tensiuni)'],
    ['dezvoltator', 'O rețea electrică de interes public finanțată de un dezvoltator']
  ];

  var VARIANTE = [
    ['1', 'Varianta 1 — racordare pe linia U1, în amonte de stație (doar Anexa 1)'],
    ['2', 'Varianta 2 — racordare la bara U1 a stației (Anexa 1 + echipamentele stației)'],
    ['3', 'Varianta 3 — racordare pe linia U2, în aval de stație (Anexa 1 + Anexa 2 + echipamente comune)'],
    ['4', 'Varianta 4 — racordare pe linia U2, mai departe (Anexa 1 + Anexa 2 + echipamente comune + linia U2)']
  ];

  var VARIANT_TEXT = {
    1: 'noul utilizator se racordează pe linia U1, în amonte de stație',
    2: 'noul utilizator se racordează la bara U1 a stației',
    3: 'noul utilizator se racordează pe linia U2, în aval de stație',
    4: 'noul utilizator se racordează pe linia U2, mai departe (folosește și linia U2)'
  };

  var MODEL_LABEL = {
    line: 'Anexa 1 — linie electrică / elemente comune',
    station: 'Anexa 2 — stație electrică / post de transformare',
    complex: 'Anexa 3 — instalație de racordare complexă',
    transitional: 'Anexa 4 pct. A — compensație după vechea metodologie (Ord. 28/2003)',
    developer: 'Anexa 5 — rețea publică finanțată de un dezvoltator'
  };

  // Tabelul de încadrare: instalații recunoscute → model + temei legal.
  var CLASSES = [
    { model: 'line', anexa: 'Anexa 1', tip: 'Linie electrică folosită în comun (LEA/LES, coloană comună)',
      semne: 'Mai mulți utilizatori racordați pe același traseu; cost pe lungime (I_L, L); tronsoane folosite de utilizatori diferiți.',
      rules: ['art6.1', 'art12.1', 'anexa1'] },
    { model: 'line', anexa: 'Anexa 1', tip: 'Al doilea circuit pe stâlpii unei linii aeriene existente',
      semne: 'Circuit nou montat pe stâlpi deja finanțați de primul utilizator; se compensează stâlpii folosiți în comun.',
      rules: ['art15.1', 'anexa1'] },
    { model: 'station', anexa: 'Anexa 2', tip: 'Stație electrică / post de transformare (transformator)',
      semne: 'Există transformator; racordarea celui nou se face pe putere (kVA), cote proporționale cu puterea aprobată.',
      rules: ['art6.1b', 'art13', 'anexa2'] },
    { model: 'station', anexa: 'Anexa 2', tip: 'Doar echipamente electroenergetice (fără transformator)',
      semne: 'Celule de linie, celulă de racord, servicii interne, module de conexiune, separatoare — folosite în comun, fără transformator. Se introduc la „Echipamente comune" (cote egale), cu S_n = 0 și I_T = 0.',
      rules: ['art6.1', 'art12.1', 'art15.2'] },
    { model: 'station', anexa: 'Anexa 2', tip: 'Întărirea unui post existent',
      semne: 'Transformator înlocuit cu unul mai mare sau echipare cu al doilea transformator, pentru racordarea noului utilizator; compensația se limitează la capacitatea suplimentară a transformatorului existent.',
      rules: ['art15.3', 'anexa2'] },
    { model: 'complex', anexa: 'Anexa 3', tip: 'Instalație de racordare complexă',
      semne: 'Două linii de tensiuni diferite (U1, U2) plus o stație/PT între ele; varianta depinde de poziția punctului de racordare al noului utilizator.',
      rules: ['art14', 'anexa3'] },
    { model: 'transitional', anexa: 'Anexa 4', tip: 'Regim tranzitoriu (situație, nu tip de instalație)',
      semne: 'Contractul primului utilizator încheiat înainte de 07.01.2016; compensații primite sub vechea metodologie (Ord. 28/2003).',
      rules: ['art17', 'art18.1a', 'anexa4'] },
    { model: 'developer', anexa: 'Anexa 5', tip: 'Rețea electrică publică finanțată de un prim dezvoltator',
      semne: 'Ansamblu de locuințe; al doilea dezvoltator sau utilizator din afara ansamblului; se aplică analiza de eficiență economică.',
      rules: ['art2.2', 'art16', 'anexa5'] }
  ];

  function num(v) { var x = Number(v); return isFinite(x) ? x : 0; }

  // Reconmandare din răspunsuri. answers = { fonduriPublice, obiect, varianta, intarire }
  // Returnează null dacă încă nu s-a ales obiectul; { stop:true } dacă metodologia nu se aplică.
  function recommend(answers) {
    var a = answers || {};
    if (a.fonduriPublice) {
      return {
        stop: true, model: null, obiect: null, rules: ['art19'],
        titlu: 'Metodologia nu se aplică',
        explicatie: 'Prevederile metodologiei nu se aplică dacă instalația de racordare a primului utilizator a fost finanțată din fonduri publice nerambursabile.'
      };
    }
    switch (a.obiect) {
      case 'linie':
        return { model: 'line', obiect: 'linie', titlu: MODEL_LABEL.line, rules: ['art6.1', 'art12.1', 'anexa1'],
          explicatie: 'Linia electrică se împarte în tronsoane; pe fiecare tronson costul se împarte în cote EGALE între utilizatorii care îl folosesc. Noul utilizator plătește diferența față de cei racordați anterior.' };
      case 'stalpi':
        return { model: 'line', obiect: 'stalpi', titlu: MODEL_LABEL.line, rules: ['art15.1', 'anexa1'],
          explicatie: 'Pentru al doilea circuit pe stâlpii liniei existente, noul utilizator plătește compensație pentru stâlpii folosiți în comun (cote egale). În Anexa 1 adaugă un element „Circuit pe stâlpi existenți".' };
      case 'statie':
        if (a.intarire) {
          return { model: 'station', obiect: 'statie', intarire: true, titlu: MODEL_LABEL.station, rules: ['art15.3', 'anexa2'],
            explicatie: 'Întărirea postului (transformator înlocuit/mărit sau al doilea transformator): noul utilizator plătește compensație doar pentru CAPACITATEA SUPLIMENTARĂ a transformatorului existent. Bifează „Întărire post" la stație.' };
        }
        return { model: 'station', obiect: 'statie', titlu: MODEL_LABEL.station, rules: ['art6.1b', 'art13', 'anexa2'],
          explicatie: 'Stația/postul de transformare: compensația se plătește primului utilizator, proporțional cu puterea aprobată: b_T = I_T / S_n, C = putere × b_T.' };
      case 'echipamente':
        return { model: 'station', obiect: 'echipamente', titlu: MODEL_LABEL.station, rules: ['art6.1', 'art12.1', 'art15.2'],
          explicatie: 'Doar echipamentele electroenergetice (altele decât transformatoarele) folosite în comun se împart în cote EGALE între utilizatori. În Anexa 2: lasă S_n = 0 și I_T = 0 și completează „Echipamente comune, altele decât transformatoare".' };
      case 'dezvoltator':
        return { model: 'developer', obiect: 'dezvoltator', titlu: MODEL_LABEL.developer, rules: ['art2.2', 'art16', 'anexa5'],
          explicatie: 'Rețeaua publică finanțată de un prim dezvoltator: cota de ineficiență a investiției se împarte proporțional cu puterile aprobate.' };
      case 'complex':
        var v = num(a.varianta) || 1;
        return { model: 'complex', obiect: 'complex', varianta: v, titlu: MODEL_LABEL.complex, rules: ['art14', 'anexa3'],
          explicatie: 'Instalație complexă (linie + stație/PT, două tensiuni). ' + (VARIANT_TEXT[v] ? 'Varianta ' + v + ': ' + VARIANT_TEXT[v] + '.' : '') +
            ' Compensația totală = suma componentelor variantei (Anexa 1 + Anexa 2 + echipamente, după caz).' };
      default:
        return null;
    }
  }

  // Aplică recomandarea pe proiect (model + variantă + steaguri). Pură peste `p`.
  function applyTo(p, rec) {
    if (!p || !rec || !rec.model) return false;
    p.meta.model = rec.model;
    p.meta.modelConfirmat = true;
    if (rec.model === 'complex' && rec.varianta) {
      p.complexConfig.varianta = num(rec.varianta);
      p.complexConfig.variantaConfirmata = true;
    }
    if (rec.model === 'station' && rec.intarire && p.statii && p.statii.length === 1) {
      p.statii[0].intarire = true;
    }
    return true;
  }

  global.AppSelect = {
    OBIECTE: OBIECTE, VARIANTE: VARIANTE, VARIANT_TEXT: VARIANT_TEXT,
    MODEL_LABEL: MODEL_LABEL, CLASSES: CLASSES,
    recommend: recommend, applyTo: applyTo
  };
})(typeof window !== 'undefined' ? window : this);
