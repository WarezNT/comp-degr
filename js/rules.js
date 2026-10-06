/*
 * Rules — registrul unic al temeiurilor legale. Orice mesaj (validare, condiții,
 * explicații de calcul, ajutor) trimite la o regulă prin id; referința se afișează
 * identic peste tot (chip „art. 8 alin. 1 lit. c”) și deschide fragmentul din norma
 * consolidată (js/norma.js). Mesajele fără temei legal (ex. valori negative) nu au id.
 */
(function (global) {
  'use strict';

  // id → { ref: eticheta afișată, norma: cheia din AppNorma, scurt: ce stabilește }
  var RULES = {
    'art1.2':   { ref: 'Art. 1 alin. (2)',        norma: 'art-1',  scurt: 'Compensația reduce tariful de racordare al noului utilizator.' },
    'art2.2':   { ref: 'Art. 2 alin. (2)',        norma: 'art-2',  scurt: 'Aplicare la rețeaua finanțată de un prim dezvoltator.' },
    'art4':     { ref: 'Art. 4',                  norma: 'art-4',  scurt: 'Capacitatea instalației poate depăși puterea aprobată.' },
    'art6.1':   { ref: 'Art. 6 alin. (1)',        norma: 'art-6',  scurt: 'Cine plătește și cui: toți utilizatorii / primul utilizator.' },
    'art6.1b':  { ref: 'Art. 6 alin. (1) lit. b', norma: 'art-6',  scurt: 'Stația/postul de transformare: compensația se plătește primului utilizator.' },
    'art6.2':   { ref: 'Art. 6 alin. (2)',        norma: 'art-6',  scurt: 'Valoarea compensației se precizează în avizul tehnic.' },
    'art6.5':   { ref: 'Art. 6 alin. (5)',        norma: 'art-6',  scurt: 'Operatorul de rețea se asimilează unui utilizator nou.' },
    'art7.1':   { ref: 'Art. 7 alin. (1)',        norma: 'art-7',  scurt: 'Compensația se precizează numai dacă beneficiarii au achitat integral tariful.' },
    'art7.2':   { ref: 'Art. 7 alin. (2)–(3)',    norma: 'art-7',  scurt: 'Refacerea avizelor tehnice când un utilizator devine prim utilizator.' },
    'art8.1':   { ref: 'Art. 8 alin. (1)',        norma: 'art-8',  scurt: 'Condiții cumulative: compensația se calculează numai dacă toate sunt îndeplinite.' },
    'art8.1a':  { ref: 'Art. 8 alin. (1) lit. a', norma: 'art-8',  scurt: 'Capacitate mai mare decât puterea aprobată (art. 4).' },
    'art8.1b':  { ref: 'Art. 8 alin. (1) lit. b', norma: 'art-8',  scurt: 'Capacitate neocupată integral.' },
    'art8.1c':  { ref: 'Art. 8 alin. (1) lit. c', norma: 'art-8',  scurt: 'Primii 5 ani de la punerea în funcțiune.' },
    'art8.1d':  { ref: 'Art. 8 alin. (1) lit. d', norma: 'art-8',  scurt: 'Soluție cu utilizare în comun a instalației.' },
    'art8.2':   { ref: 'Art. 8 alin. (2)',        norma: 'art-8',  scurt: '10 ani dacă primul utilizator e client casnic.' },
    'art9':     { ref: 'Art. 9',                  norma: 'art-9',  scurt: 'Factorii de care depinde valoarea compensației.' },
    'art11':    { ref: 'Art. 11',                 norma: 'art-11', scurt: 'Compensația = suma compensațiilor pe fiecare element comun.' },
    'art12.1':  { ref: 'Art. 12 alin. (1)',       norma: 'art-12', scurt: 'Linii/echipamente: toți contribuie în cote egale.' },
    'art13':    { ref: 'Art. 13',                 norma: 'art-13', scurt: 'Stație/post: cote proporționale cu puterea aprobată, către primul utilizator.' },
    'art14':    { ref: 'Art. 14',                 norma: 'art-14', scurt: 'Instalație complexă (linii + stație): Anexa 3.' },
    'art15.1':  { ref: 'Art. 15 alin. (1)',       norma: 'art-15', scurt: 'Al doilea circuit pe stâlpii existenți: compensație pentru stâlpi.' },
    'art15.2':  { ref: 'Art. 15 alin. (2)',       norma: 'art-15', scurt: 'Racordare la bara superioară: echipamente comune, fără transformatoare.' },
    'art15.3':  { ref: 'Art. 15 alin. (3)',       norma: 'art-15', scurt: 'Întărirea postului: compensație pentru capacitatea suplimentară.' },
    'art15.4':  { ref: 'Art. 15 alin. (4)',       norma: 'art-15', scurt: 'Transformatorul de rezervă (N-1) nu intră în costul specific.' },
    'art16':    { ref: 'Art. 16',                 norma: 'art-16', scurt: 'Rețele de joasă tensiune finanțate de dezvoltatori: Anexa 5.' },
    'art17':    { ref: 'Art. 17',                 norma: 'art-17', scurt: 'Metodologia se aplică contractelor încheiate după 07.01.2016.' },
    'art18.1a': { ref: 'Art. 18 alin. (1) lit. a', norma: 'art-18', scurt: 'Cost net = componenta din tarif − compensațiile primite sub Ord. 28/2003.' },
    'art18.1b': { ref: 'Art. 18 alin. (1) lit. b', norma: 'art-18', scurt: 'Capacitate suplimentară = capacitatea instalației − puterile utilizatorilor anteriori.' },
    'art18.2':  { ref: 'Art. 18 alin. (2)',       norma: 'art-18', scurt: 'Recalcularea și refacerea avizelor în 3 luni.' },
    'art18.3a': { ref: 'Art. 18 alin. (3) lit. a', norma: 'art-18', scurt: 'Se plătește doar primului utilizator și celor cu contract ulterior.' },
    'art18.3b': { ref: 'Art. 18 alin. (3) lit. b', norma: 'art-18', scurt: 'Stație/post: se plătește doar primului utilizator.' },
    'art19':    { ref: 'Art. 19',                 norma: 'art-19', scurt: 'Excepție: instalația finanțată din fonduri publice nerambursabile.' },
    'anexa1':   { ref: 'Anexa 1',                 norma: 'anexa-1', scurt: 'Model de calcul pentru linii electrice.' },
    'anexa2':   { ref: 'Anexa 2',                 norma: 'anexa-2', scurt: 'Model de calcul pentru stații/posturi: C(k) = S(k) · b(T).' },
    'anexa3':   { ref: 'Anexa 3',                 norma: 'anexa-3', scurt: 'Model de calcul pentru instalații complexe (variantele 1–4).' },
    'anexa4':   { ref: 'Anexa 4',                 norma: 'anexa-4', scurt: 'Exemple pentru prevederile tranzitorii (pct. A: Ord. 28/2003; pct. B: metodologia nouă).' },
    'anexa5':   { ref: 'Anexa 5',                 norma: 'anexa-5', scurt: 'Rețea finanțată de un prim dezvoltator: cote de eficiență/ineficiență.' }
  };

  function get(id) { return RULES[id] || null; }
  function label(id) { var r = RULES[id]; return r ? r.ref : ''; }
  function text(id) { var r = RULES[id]; return r && global.AppNorma ? (global.AppNorma[r.norma] || '') : ''; }

  global.AppRules = { RULES: RULES, get: get, label: label, text: text };
})(typeof window !== 'undefined' ? window : this);
