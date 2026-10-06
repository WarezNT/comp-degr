/*
 * Help — textele de ajutor. Fiecare câmp are o explicație scurtă (butonul ⓘ de lângă etichetă)
 * și, unde e cazul, referința la regula din AppRules; fiecare pas are doar o introducere scurtă.
 */
(function (global) {
  'use strict';

  var FIELDS = {
    'meta.operator': { text: 'Operatorul de rețea care întocmește calculul. Apare pe centralizator și la print.' },
    'meta.codOperator': { text: 'Codul operatorului (opțional). Apare pe centralizator.' },
    'meta.dataCalcul': { text: 'Data întocmirii. Se folosește la verificarea termenelor: anii de la punerea în funcțiune și „Data achitare TR”.' },
    'meta.tva': { text: 'Cota de TVA folosită în centralizator: implicit 21%; poți alege 19% sau „Altă valoare” (introdusă manual, între 0 și 100; 0 dacă lucrezi fără TVA).' },
    'meta.withTva': { text: 'Dacă e bifat, centralizatorul are și coloana „cu TVA”.' },
    'meta.model': { text: 'Anexa aplicabilă: linie electrică (Anexa 1), stație/PT (Anexa 2), instalație complexă (Anexa 3), vechea metodologie (Anexa 4 pct. A) sau rețea de dezvoltator (Anexa 5). Prevederile tranzitorii (art. 17–18) se aplică automat la Anexele 1–3 dacă primul utilizator are contractul înainte de 07.01.2016.', rule: 'art11' },

    'user.rol': { text: 'Prim utilizator = a finanțat instalația și primește compensații. Nou = se racordează acum și plătește. Existent = racordat între timp (primește la linii). Operator de rețea = se asimilează unui utilizator nou și plătește.', rule: 'art6.1' },
    'user.codPA': { text: 'Codul punctului de racordare (PA) / identificatorul utilizatorului, ex. 1000000004.' },
    'user.nume': { text: 'Numele persoanei sau denumirea firmei. Apare în centralizator.' },
    'user.putere': { text: 'Puterea aprobată prin avizul tehnic [kVA]. Se folosește la stații/PT (Anexa 2), la întărirea postului și la rețeaua dezvoltatorilor (Anexa 5).', rule: 'art13' },
    'user.dataATR': { text: 'Data emiterii avizului tehnic de racordare. Nu intră în termenul de 5/10 ani (care curge de la punerea în funcțiune); stabilește doar ordinea racordării utilizatorilor noi.', rule: 'art8.1c' },
    'user.dataTR': { text: 'Data la care a fost achitat integral tariful de racordare. Obligatorie pentru beneficiarii compensației; fără ea, condiția se confirmă manual la pasul 4.', rule: 'art7.1' },
    'user.tipClient': { text: 'Contează tipul primului utilizator: dacă e casnic, termenul din art. 8 se extinde la 10 ani.', rule: 'art8.2' },
    'user.dataContract': { text: 'Data contractului de racordare. Dacă primul utilizator are contractul înainte de 07.01.2016, se aplică prevederile tranzitorii.', rule: 'art17' },
    'user.faraContract': { text: 'ATR emis pentru instalația comună, dar contract neîncheiat. Când altcineva devine prim utilizator, ATR-ul valabil se reface din oficiu, fără tarif.', rule: 'art7.2' },
    'user.atrValabilPana': { text: 'Sfârșitul perioadei de valabilitate a ATR. Un ATR expirat nu se reface.', rule: 'art7.2' },
    'user.tarifInitial': { text: 'Tariful de racordare înainte de refacerea ATR [lei], opțional; permite estimarea tarifului recalculat (tarif − compensație).', rule: 'art1.2' },

    'line.IL': { text: 'Valoarea totală a lucrărilor liniei, achitată de primul utilizator prin tariful de racordare [lei].', rule: 'anexa1' },
    'line.L': { text: 'Lungimea totală a liniei [m].', rule: 'anexa1' },
    'line.bL': { text: 'Cost specific [lei/m]. Se calculează automat = I_L / L; îl poți suprascrie dacă ai valoarea exactă (golește câmpul pentru revenire).', rule: 'anexa1' },
    'line.compVeche': { text: 'Compensațiile primite de primul utilizator sub vechea metodologie (Ord. 28/2003). Se scad din costul instalației; folosit doar când contractul primului utilizator e anterior 07.01.2016.', rule: 'art18.1a' },
    'line.capacitate': { text: 'Capacitatea instalației de racordare [kVA]; opțional, pentru a afișa capacitatea suplimentară (capacitate − puterile utilizatorilor anteriori).', rule: 'art18.1b' },
    'tronson.lungime': { text: 'Lungimea tronsonului [m]. Costul lui = lungime × b_L, în cote egale între utilizatorii care îl folosesc.', rule: 'art12.1' },
    'tronson.cost': { text: 'Cost tronson [lei]: automat (lungime × b_L) sau introdus manual dacă ai valoarea exactă.', rule: 'anexa1' },
    'stalpi': { text: 'Al doilea circuit montat pe stâlpii liniei aeriene existente: noul utilizator plătește pentru stâlpii folosiți în comun. Introdu costul stâlpilor și bifează utilizatorii care îi folosesc.', rule: 'art15.1' },

    'stat.Sn': { text: 'Capacitatea nominală a transformatorului [kVA].', rule: 'anexa2' },
    'stat.SnRezerva': { text: 'Transformator de rezervă (criteriul N-1) [kVA]: nu intră în costul specific b_T.', rule: 'art15.4' },
    'stat.IT': { text: 'Costul lucrărilor stației/postului, achitat de primul utilizator [lei]. b_T = I_T / S_n.', rule: 'anexa2' },
    'stat.elementeComune': { text: 'Echipamente comune, altele decât transformatoarele [lei]: se împart în cote egale între utilizatori.', rule: 'art12.1' },
    'stat.intarire': { text: 'Transformator înlocuit cu unul mai mare sau al doilea transformator, necesar noului utilizator: compensația se limitează la capacitatea suplimentară a transformatorului existent. Completează S_n și I_T ale transformatorului existent.', rule: 'art15.3' },
    'stat.compVeche': { text: 'Compensațiile primite sub vechea metodologie (Ord. 28/2003), scăzute din I_T. Doar în regim tranzitoriu.', rule: 'art18.1a' },

    'complex.varianta': { text: '1 = pe linia U1 (doar Anexa 1) · 2 = la bara U1 a stației (Anexa 1 + echipamente stație) · 3 = pe linia U2 (Anexa 1 + Anexa 2) · 4 = pe linia U2, mai departe (Anexa 1 + Anexa 2 + Anexa 1).', rule: 'art14' },

    'tranz.B': { text: 'Componenta B din tariful de racordare achitat de primul utilizator [lei].', rule: 'anexa4' },
    'tranz.S': { text: 'Capacitatea instalației de racordare aferentă tarifului achitat [kVA].', rule: 'anexa4' },
    'tranz.S2': { text: 'Puterea aprobată a noului utilizator [kVA].', rule: 'anexa4' },
    'tranz.l2': { text: 'Lungimea porțiunii de linie folosite de noul utilizator [m].', rule: 'anexa4' },
    'tranz.L': { text: 'Lungimea totală a liniei [m].', rule: 'anexa4' },

    'dev.Itotal': { text: 'Valoarea totală a investiției în rețeaua folosită în comun [lei].', rule: 'anexa5' },
    'dev.Ief': { text: 'Cota de eficiență, suportată de operatorul de distribuție [lei], din analiza de eficiență economică. Poate fi 0.', rule: 'anexa5' },
    'dev.putere': { text: 'Puterea aprobată a dezvoltatorului/utilizatorului [kVA]; cota de ineficiență se împarte proporțional cu puterile.', rule: 'anexa5' },

    'cond.dataPIF': { text: 'Data punerii în funcțiune a instalației. Anii se calculează la data întocmirii; altfel introdu anii manual.', rule: 'art8.1c' },
    'cond.fonduriPublice': { text: 'Dacă instalația primului utilizator a fost finanțată din fonduri publice nerambursabile, metodologia nu se aplică.', rule: 'art19' },
    'cond.calcInformativ': { text: 'Permite un calcul orientativ chiar dacă o condiție nu e îndeplinită. Valorile nu sunt datorate în acest caz.', rule: 'art8.1' }
  };

  // Introduceri scurte pe pas / model.
  var STEPS = {
    date: { titlu: 'Date generale', intro: 'Alege tipul de instalație și completează datele operatorului. Restul pașilor se adaptează modelului ales.' },
    utilizatori: { titlu: 'Utilizatori', intro: 'Adaugă toți utilizatorii și dă fiecăruia un rol: prim utilizator (finanțator), nou (plătește), existent sau operator de rețea.', rules: ['art6.1', 'art6.5'] },
    instalatie: {
      line: { titlu: 'Anexa 1 — linie electrică', intro: 'Descrie linia primului utilizator, tronsoanele ei și bifează cine folosește fiecare tronson. Costul unui tronson se împarte în cote egale.', rules: ['art12.1', 'anexa1'] },
      station: { titlu: 'Anexa 2 — stație / post de transformare', intro: 'Descrie stația/postul și bifează utilizatorii racordați. Compensația se plătește primului utilizator, proporțional cu puterea aprobată.', rules: ['art13', 'anexa2'] },
      complex: { titlu: 'Anexa 3 — instalație complexă', intro: 'Alege varianta punctului de racordare; aplicația însumează componentele: linia l_U1, stația și, la varianta 4, linia l_U2.', rules: ['art14', 'anexa3'] },
      transitional: { titlu: 'Anexa 4 pct. A — vechea metodologie', intro: 'Compensația stabilită sub Ord. 28/2003, pentru contracte anterioare 07.01.2016. Rezultatul se poate trece apoi în „Prevederi tranzitorii” la linie/stație.', rules: ['art18.1a', 'anexa4'] },
      developer: { titlu: 'Anexa 5 — rețea finanțată de un dezvoltator', intro: 'Cota de ineficiență a investiției se împarte între dezvoltatori proporțional cu puterile aprobate.', rules: ['art2.2', 'anexa5'] }
    },
    rezultate: { titlu: 'Rezultate', intro: 'Verifică condițiile legale, calculează și citește centralizatorul. Pentru fiecare sumă poți vedea „Cum s-a calculat”.', rules: ['art8.1', 'art11'] }
  };

  var ABBR = {
    PA: 'Punct de racordare / cod loc de consum',
    TR: 'Tarif de racordare',
    ATR: 'Aviz tehnic de racordare',
    PIF: 'Punere în funcțiune',
    PT: 'Post de transformare',
    OD: 'Operator de distribuție'
  };

  global.AppHelp = { FIELDS: FIELDS, STEPS: STEPS, ABBR: ABBR };
})(typeof window !== 'undefined' ? window : this);
