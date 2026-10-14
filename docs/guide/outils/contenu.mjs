// Le texte du guide. Chaque étape renvoie à une capture ; ses lignes reprennent
// les pastilles numérotées de la capture (bleu : à lire, vert : état prêt).
const A = 'captures/algo/', B = 'captures/cdevoir/', C = 'captures/cexamen/', P = 'captures/sujets/';

export const parts = [];
const part = (id, lettre, titre, sous) => { const p = { id, lettre, titre, sous, blocs: [] }; parts.push(p); return p; };
const step = (img, titre, items = [], opts = {}) => ({ t: 'step', img, titre, items, ...opts });
const paper = (...imgs) => ({ t: 'paper', imgs });
const note = (titre, html, tone = 'info') => ({ t: 'note', titre, html, tone });
const fiche = (id, num, titre, type, correction, pts) => ({ t: 'fiche', id, num, titre, type, correction, pts });
const h = (id, titre, intro = '') => ({ t: 'h', id, titre, intro });
const raw = (html) => ({ t: 'raw', html });
const pair = (a, b) => ({ t: 'pair', a, b });

/* ================= A. Devoir d'algorithmique ================= */
const a = part('A', 'A', "Devoir d'initiation algorithmique", 'Devoir commun surveillé · SRIT1 A, B, C, D · 30/11/2024 · 2 h · 20 points');
a.blocs.push(
  h('A0', 'A.0 Créer l’épreuve (étape 1 « Paramètres »)', 'L’en-tête du sujet donne le titre, la durée et le public :'),
  paper(P + 'algo-entete.png'),
  step(A + 'p0-menu.png', 'Ouvrir le formulaire', [], { lead: 'Dans le menu de gauche, cliquez sur <b>Créer une évaluation</b>.', small: true }),
  step(A + 'p1-epreuve.png', 'Le titre et le type', [
    [1, 'Titre : <b>Devoir commun — Initiation algorithmique</b>. Il figure en tête du sujet.'],
    [2, 'Type : <b>Devoir</b>.'],
  ]),
  step(A + 'p2-pour-qui.png', 'La classe et la matière', [
    [3, 'Classe : <b>SRIT1 A</b>. Sans classe, l’épreuve reste un brouillon que personne ne voit.'],
    [4, 'Matière : <b>Initiation algorithmique</b>. Elle impose le pseudo-code : aucun langage n’est demandé.'],
  ]),
  step(A + 'p3-deroulement.png', 'La durée, le barème et les consignes', [
    [5, 'Durée : bouton <b>2h</b> (le champ affiche 120 minutes).'],
    [6, 'Barème total : <b>20</b>.'],
    [7, 'Cette phrase confirme que la copie se compose en blocs de pseudo-code.', 'blue'],
    [8, 'Consignes : recopiez l’en-tête du sujet (ECUE, semestre, parcours, année). L’étudiant les lit avant de commencer.'],
  ], { after: 'Laissez <b>Ouverture</b> vide si vous lancerez la session vous-même. Les <b>Modalités de passage</b> (repliées) reprennent vos réglages par défaut.' }),
  step(A + 'p4-enregistrer.png', 'Enregistrer', [
    [9, '<b>Enregistrer et continuer</b> crée l’épreuve en brouillon et ouvre l’étape 2 « Exercices ».'],
  ]),

  /* --- Exercice 1 --- */
  fiche('A1', 'Exercice 1', 'Simulation de l’algorithme CalculDeMoyenne', 'Simulation', 'automatique, case par case', 5),
  paper(P + 'algo-ex1.png'),
  step(A + 'e1-01-ajouter.png', 'Ajouter l’exercice', [[1, 'Cliquez sur <b>+ Ajouter un exercice</b>, en haut à droite de l’étape 2.']]),
  step(A + 'e1-02-type.png', 'Choisir le type', [[2, 'Cliquez sur la carte <b>Simulation</b>. Le formulaire apparaît en dessous, déjà réglé pour ce type.']], { medium: true }),
  step(A + 'e1-03-entete.png', 'L’intitulé et l’énoncé', [
    [3, 'Intitulé : <b>Simulation de l’algorithme CalculDeMoyenne</b>.'],
    [4, 'Le type est déjà rempli. N’y touchez pas : changer de type vide l’exercice.'],
    [5, 'Énoncé : « Faire la simulation de l’algorithme ci-dessous pour laquelle l’utilisateur a saisi 10, 11 et 12. »'],
  ]),
  step(A + 'e1-04-algorithme.png', 'L’algorithme à simuler', [
    [6, 'Copiez-collez l’algorithme du sujet, numéros de ligne compris. Remplacez les barres « | » du document Word par des espaces. Sur la feuille de l’étudiant, il s’affiche en police fixe et coloré.'],
  ]),
  step(A + 'e1-05-tableau-vide.png', 'Le tableau, au départ', [
    [7, 'Cliquez dans le titre d’une colonne pour le changer.'],
    [8, '<b>fournie</b> : la colonne est déjà remplie sur la feuille de l’étudiant et n’est pas notée. Laissez-la cochée pour les numéros d’instruction.'],
    [9, '<b>+ Ajouter une ligne</b> : une ligne par instruction exécutée.'],
    [10, '<b>+ Ajouter une colonne</b> : une colonne par variable, plus la condition et l’écran.'],
  ], { after: 'Pour ce sujet : <b>7 colonnes</b> (N°, Note, SommeDesNotes, NombreDeNotesSaisies, MoyenneDesNotes, Condition (l. 3), Écran) et <b>20 lignes</b> : instructions 1 et 2, trois tours de boucle (3, 4, 5, 6, 7), le dernier test (3), puis 9 et 10.' }),
  step(A + 'e1-06-tableau-gauche.png', 'Le tableau rempli (partie gauche)', [
    [11, 'Les colonnes des variables, nommées comme dans l’algorithme.'],
    [12, 'N° : l’ordre d’exécution, recopié sur la feuille de l’étudiant.'],
    [13, 'Dans chaque case, la valeur prise par la variable à cette instruction, comme sur votre corrigé papier.'],
    [14, 'Une case vide n’est pas notée : l’étudiant peut la laisser vide ou recopier la valeur précédente.'],
  ]),
  step(A + 'e1-07-tableau-droite.png', 'Le tableau rempli (partie droite)', [
    [15, 'Condition : VRAI ou FAUX à chaque test du TANTQUE (trois fois VRAI, puis FAUX).'],
    [16, 'Écran : le texte affiché par ECRIRE.'],
    [17, 'Plusieurs réponses admises : séparez-les par « | ». Ici, avec ou sans espace entre « 3 » et « note(s) ».'],
  ], { lead: 'Le tableau défile horizontalement : les dernières colonnes sont à droite.' }),
  note('Comment les cases sont notées', 'Chaque case remplie vaut une part égale des points : 20 cases pour 5 points, soit 0,25 point par case. Les nombres se comparent par leur valeur (<code>10</code> = <code>10,0</code> = <code>10.00</code>). Le texte se compare sans tenir compte des majuscules, des accents ni de la ponctuation (<code>vrai</code> = <code>VRAI</code>).'),
  step(A + 'e1-08-corrige.png', 'Le corrigé (facultatif)', [
    [18, 'Ouvrez <b>Corrigé proposé aux étudiants</b> et écrivez l’explication. Les étudiants la voient avec leur note, si l’épreuve propose le corrigé.'],
  ]),
  step(A + 'e1-09-apercu.png', 'Vérifier l’aperçu', [
    [19, 'À droite, l’aperçu montre la feuille de l’étudiant : l’algorithme, puis le tableau vide avec la colonne N° remplie.', 'blue'],
  ], { medium: true }),

  /* --- Exercice 2 --- */
  fiche('A2', 'Exercice 2', 'Les dix nombres suivants', 'Algorithmique', 'automatique, par jeux de tests (§ A.5)', 5),
  paper(P + 'algo-ex2.png'),
  step(A + 'e2-01-ajouter.png', 'Ajouter l’exercice', [[1, '<b>+ Ajouter un exercice</b>. Le nouvel exercice s’ajoute sous le précédent.']]),
  step(A + 'e2-02-type.png', 'Choisir le type', [[2, 'Cliquez sur <b>Algorithmique</b>.']], { medium: true }),
  step(A + 'e2-03-entete.png', 'L’intitulé et l’énoncé', [
    [3, 'Intitulé : <b>Les dix nombres suivants</b>.'],
    [4, 'Le type, déjà choisi.'],
    [5, 'Énoncé : recopiez celui du sujet, exemple compris.'],
  ]),
  step(A + 'e2-04-outils.png', 'Les outils autorisés', [
    [6, 'Les blocs que l’étudiant pourra poser. Le vocabulaire de base est coché d’office : Constante, Variable, LIRE, ECRIRE, Affectation, SI, SINON, POUR, TANTQUE.'],
    [7, 'Cochez en plus <b>SINONSI</b> et <b>REPETER</b> s’ils ont été vus en cours. Un bloc décoché est refusé à la correction.'],
    [8, '<b>ECRIRE comme au cours</b> : laissez coché.'],
  ]),
  note('Et les tests ?', 'Les jeux de tests de cet exercice se règlent à l’étape 3, une fois les quatre énoncés saisis : voir § A.5.'),

  /* --- Exercice 3 --- */
  fiche('A3', 'Exercice 3', 'Tarif plein ou réduit', 'Algorithmique', 'automatique, par jeux de tests (§ A.5)', 4),
  paper(P + 'algo-ex3.png'),
  pair(step(A + 'e3-01-ajouter.png', 'Ajouter', [[1, '<b>+ Ajouter un exercice</b>.']]), step(A + 'e3-02-type.png', 'Choisir le type', [[2, '<b>Algorithmique</b>.']])),
  step(A + 'e3-03-entete.png', 'L’intitulé et l’énoncé', [
    [3, 'Intitulé : <b>Tarif plein ou réduit</b>.'],
    [4, 'Le type, déjà choisi.'],
    [5, 'Énoncé : recopiez le sujet.'],
    ['!', 'Ajoutez une dernière phrase : « Données à saisir, dans cet ordre : le jour, l’âge, puis OUI ou NON ». Les tests envoient les valeurs dans un ordre fixe : l’étudiant doit les lire dans le même ordre. Les messages affichés restent libres.', 'blue'],
  ]),
  step(A + 'e3-04-outils.png', 'Les outils autorisés', [
    [6, 'Les mêmes blocs qu’à l’exercice 2.'],
    [7, 'SINONSI est utile ici. Cochez aussi REPETER.'],
    [8, 'ECRIRE comme au cours : laissez coché.'],
  ]),

  /* --- Exercice 4 --- */
  fiche('A4', 'Exercice 4', 'Le plus grand nombre et sa position', 'Algorithmique', 'automatique, par jeux de tests (§ A.5)', 6),
  paper(P + 'algo-ex4.png'),
  pair(step(A + 'e4-01-ajouter.png', 'Ajouter', [[1, '<b>+ Ajouter un exercice</b>.']]), step(A + 'e4-02-type.png', 'Choisir le type', [[2, '<b>Algorithmique</b>.']])),
  step(A + 'e4-03-entete.png', 'L’intitulé et l’énoncé', [
    [3, 'Intitulé : <b>Le plus grand nombre et sa position</b>.'],
    [4, 'Le type, déjà choisi.'],
    [5, 'Énoncé : recopiez le sujet, avec le NB et l’exemple d’exécution.'],
  ]),
  step(A + 'e4-04-outils.png', 'Les outils autorisés', [
    [6, 'Les mêmes blocs qu’aux exercices 2 et 3.'], [7, 'SINONSI et REPETER cochés.'], [8, 'ECRIRE comme au cours.'],
  ]),
  step(A + 'x-etape-suivante.png', 'Passer à l’étape 3', [
    [9, '<b>Étape suivante</b> enregistre les quatre exercices et ouvre l’étape 3 « Correction ».'],
  ]),

  /* --- Étape 3 --- */
  h('A5', 'A.5 Étape 3 « Correction » : les jeux de tests des exercices 2, 3 et 4',
    'Un test fait tourner l’algorithme de l’étudiant avec des valeurs choisies, puis compare ce qu’il affiche à ce que vous attendez. Seuls les exercices pratiques passent par cette étape : la simulation se corrige sur son tableau.'),
  step(A + 'c0-vue.png', 'Vue d’ensemble', [
    [1, 'La colonne de gauche liste les exercices à tester. Cliquez sur celui à régler.'],
    [2, 'Le compteur « Prêts à être corrigés » : 0 / 3 au départ.', 'blue'],
  ]),
  note('La comparaison « Nombres affichés »', 'Avec ce mode, vous n’écrivez que les nombres attendus <b>à la fin</b> de l’affichage. Les invites (« Entrez le nombre numéro 1 : ») et les phrases de l’étudiant sont ignorées : <code>Le plus grand est : 15 / C’était le n° 3</code> passe pour <code>15 3</code>. Les décimaux s’écrivent avec un point ou une virgule (<code>4,50</code> = <code>4.5</code>).'),
  raw('<h3 class="sub-h">Exercice 2 — Les dix nombres suivants</h3>'),
  step(A + 'c2-01-ajouter-test.png', 'Ajouter un test', [[3, '<b>+ Ajouter un premier test</b>. « Ce que l’algorithme doit contenir » reste vide : seuls les tests notent la copie.']]),
  step(A + 'c2-02-test.png', 'Remplir le test', [
    [4, 'Nom du test : <b>Départ 17</b>.'],
    [5, '<b>+ Valeur d’entrée</b>, puis la valeur que l’étudiant tape : <b>17</b> (type Entier).'],
    [6, 'Écran : <b>18 19 20 21 22 23 24 25 26 27</b>.'],
    [7, 'Comparaison : <b>Nombres affichés</b>.'],
  ], { after: 'La phrase grise sous le test le résume : relisez-la.' }),
  step(A + 'c2-03-liste.png', 'Les autres tests', [
    [8, '<b>Dupliquer</b> copie le test : changez le nom, la valeur et le résultat attendu.'],
    [9, 'Le <b>Récapitulatif des tests</b> les relit d’un coup d’œil.', 'blue'],
  ]),
  raw(table(['Test', 'Valeur envoyée', 'Écran attendu'], [['Départ 17', '17', '18 19 … 27'], ['Départ négatif', '-3', '-2 -1 0 … 7'], ['Départ 0', '0', '1 2 … 10']])),
  raw('<h3 class="sub-h">Exercice 3 — Tarif plein ou réduit</h3>'),
  step(A + 'c3-00-choisir.png', 'Choisir l’exercice', [[1, 'Cliquez sur <b>Tarif plein ou réduit</b>.']]),
  step(A + 'c3-01-ajouter-test.png', 'Ajouter un test', [[2, '<b>+ Ajouter un premier test</b>.']]),
  step(A + 'c3-02-test.png', 'Remplir le test', [
    [3, 'Nom : <b>Mercredi</b>.'],
    [4, 'Trois valeurs, dans l’ordre de l’énoncé : <b>mercredi</b> (type Chaîne), <b>30</b> (Entier), <b>NON</b> (Chaîne). Le type se change dans la liste à droite de chaque valeur.'],
    [5, 'Écran : <b>4.5</b>.'],
    [6, 'Comparaison : <b>Nombres affichés</b>.'],
  ]),
  step(A + 'c3-03-liste.png', 'Les cinq tests', [
    [7, 'Dupliquez quatre fois et changez les valeurs.'],
    [8, 'Relisez le récapitulatif.', 'blue'],
  ]),
  raw(table(['Test', 'Valeurs envoyées', 'Écran attendu'], [['Mercredi', 'mercredi · 30 · NON', '4.5'], ['Étudiant un lundi', 'lundi · 30 · OUI', '4.5'], ['Enfant un samedi', 'samedi · 12 · NON', '7'], ['Senior un mardi', 'mardi · 70 · NON', '4.5'], ['Adulte un dimanche', 'dimanche · 30 · NON', '7']])),
  raw('<h3 class="sub-h">Exercice 4 — Le plus grand nombre et sa position</h3>'),
  step(A + 'c4-00-choisir.png', 'Choisir l’exercice', [[1, 'Cliquez sur <b>Le plus grand nombre et sa position</b>.']]),
  step(A + 'c4-01-ajouter-test.png', 'Ajouter un test', [[2, '<b>+ Ajouter un premier test</b>.']]),
  step(A + 'c4-02-test.png', 'Remplir le test', [
    [3, 'Nom : <b>Exemple du sujet</b>.'],
    [4, 'Cinq valeurs entières : <b>12, 5, 15, 10</b>, puis <b>0</b> qui arrête la saisie.'],
    [5, 'Écran : <b>15 3</b>, le plus grand puis sa position.'],
    [6, 'Comparaison : <b>Nombres affichés</b>.'],
  ]),
  step(A + 'c4-03-liste.png', 'Les trois tests', [
    [7, 'Dupliquez, puis retirez une valeur avec le bouton <b>−</b> pour les tests plus courts.'],
    [8, 'Relisez le récapitulatif.', 'blue'],
  ]),
  raw(table(['Test', 'Valeurs envoyées', 'Écran attendu'], [['Exemple du sujet', '12 · 5 · 15 · 10 · 0', '15 3'], ['Le plus grand en premier', '3 · 1 · 2 · 0', '3 1'], ['Que des négatifs', '-5 · -2 · -9 · 0', '-2 2']])),
  step(A + 'c9-rail-pret.png', 'Tout est prêt', [
    [9, 'Les trois exercices sont cochés en vert. <b>Étape suivante</b> ouvre les points.', 'green'],
  ]),

  h('A6', 'A.6 Étape 4 « Points & publication »'),
  step(A + 'p5-points.png', 'Les points', [
    [1, 'À l’arrivée, CodEval partage les 20 points à parts égales. Corrigez : <b>5, 5, 4, 6</b>.'],
    [2, 'Le total doit faire <b>20 / 20</b>.'],
  ]),
  step(A + 'p6-publier.png', 'Publier', [
    [3, '<b>Enregistrer et publier</b> : l’épreuve apparaît chez les étudiants de la classe, qui composeront une fois la session lancée. Avec une date d’ouverture, le bouton devient « Enregistrer et programmer ».'],
    [4, '<b>Lancer la session</b> ouvre l’épreuve tout de suite.'],
  ]),
);

/* ================= B. Devoir de C avancé ================= */
const b = part('B', 'B', 'Devoir surveillé de C avancé', 'M1 MBDS · 27/02/2024 · 2 h · 20 points');
b.blocs.push(
  h('B0', 'B.0 Créer l’épreuve (étape 1 « Paramètres »)'),
  paper(P + 'cdevoir-entete.png'),
  step(B + 'p1-epreuve.png', 'Le titre et le type', [[1, 'Titre : <b>Devoir surveillé — C avancé</b>.'], [2, 'Type : <b>Devoir</b>.']]),
  step(B + 'p2-pour-qui.png', 'La classe et la matière', [[3, 'Classe : <b>M1 MBDS</b>.'], [4, 'Matière : <b>C avancé</b>. Elle fixe le langage : C.']]),
  step(B + 'p3-deroulement.png', 'La durée, le barème et les consignes', [
    [5, 'Durée : <b>2h</b>.'], [6, 'Barème : <b>20</b>.'],
    [7, 'Le langage des exercices de code : C, fixé par la matière.', 'blue'],
    [8, 'Consignes : l’en-tête et le bloc « Important à lire ».'],
  ]),
  note('« 1 pt pour la propreté de la copie »', 'Cette consigne n’a pas d’équivalent pour une copie tapée. Gardez des exercices sur 20 et ajoutez le point à la main sur la copie corrigée, avec <b>Modifier la note de cet exercice</b>. Chaque ajustement est enregistré avec son motif.', 'warn'),
  step(B + 'p4-enregistrer.png', 'Enregistrer', [[9, '<b>Enregistrer et continuer</b>.']]),

  fiche('B1', 'Exercice 1', 'Questions de cours', 'Question-réponse', 'mots-clés (question 1) et correction à la main (questions 2 à 6)', 10),
  paper(P + 'cdevoir-ex1.png'),
  pair(step(B + 'e1-01-ajouter.png', 'Ajouter', [[1, '<b>+ Ajouter un exercice</b>.']]), step(B + 'e1-02-type.png', 'Choisir le type', [[2, '<b>Question-réponse</b>.']])),
  step(B + 'e1-03-entete.png', 'L’intitulé', [[3, 'Intitulé : <b>Question de cours</b>.'], [4, 'Le type, déjà choisi.']],
    { after: 'Pas de champ « Énoncé » : avec ce type, chaque question porte son propre texte.' }),
  step(B + 'e1-04-question1.png', 'La question 1, notée sur mots-clés', [
    [5, 'Question posée : « Donner la définition d’une bibliothèque dynamique. »'],
    [6, 'Cochez <b>Noter sur les mots-clés présents</b> : chaque mot-clé retrouvé dans la réponse rapporte sa part.'],
    [7, 'Les mots-clés : <b>exécution</b>, <b>partagée</b>. Majuscules, accents et ponctuation sont ignorés.'],
    [8, '<b>+ Ajouter un mot-clé</b> pour chacun.'],
    [9, '<b>Lignes de réponse sur le sujet</b> : la place laissée sur la version imprimée.'],
  ]),
  note('Trois façons de corriger une question', '<b>Aucune réponse listée</b> : la question vous est signalée pour une correction à la main.<br><b>Formulations acceptées</b> (case décochée) : la réponse doit correspondre à l’une d’elles.<br><b>Mots-clés</b> (case cochée) : chaque mot-clé présent rapporte une part égale des points.'),
  step(B + 'e1-05-question2.png', 'Les questions suivantes', [
    [10, '<b>+ Ajouter une question</b> : elle s’ajoute en dessous, ouverte.'],
    [11, 'Question 2 : « Donner la différence entre une bibliothèque et une librairie. »'],
    [12, 'Aucune réponse listée : vous la corrigerez à la main.', 'blue'],
  ]),
  step(B + 'e1-06-liste.png', 'Les six questions', [
    [13, 'Six questions : les 10 points se partagent également entre elles.'],
    [14, 'Les sous-questions 2.a et 2.b deviennent deux questions séparées.'],
    [15, '<b>Tout replier</b> / <b>Tout déplier</b> pour relire.'],
  ]),
  raw(table(['N°', 'Question', 'Correction'], [['1', 'Donner la définition d’une bibliothèque dynamique.', 'mots-clés : exécution, partagée'], ['2', 'Différence entre une bibliothèque et une librairie.', 'à la main'], ['3', 'Différence entre une bibliothèque statique et une bibliothèque dynamique.', 'à la main'], ['4', 'Dans un projet C, à quoi servent les fichiers en-tête (.h) ?', 'à la main'], ['5', 'Pourquoi utiliser les directives au préprocesseur ?', 'à la main'], ['6', 'Citer 3 directives au préprocesseur et les définir.', 'à la main']])),
  step(B + 'e1-07-corrige.png', 'Le corrigé (facultatif)', [[16, 'Les réponses attendues, montrées aux étudiants avec les notes.']]),

  fiche('B2', 'Exercice 2', 'Programmation C : gestion d’un stock', 'Question-réponse', 'à la main', 10),
  paper(P + 'cdevoir-ex2.png'),
  pair(step(B + 'e2-01-ajouter.png', 'Ajouter', [[1, '<b>+ Ajouter un exercice</b>.']]), step(B + 'e2-02-type.png', 'Choisir le type', [[2, '<b>Question-réponse</b>.']])),
  step(B + 'e2-03-entete.png', 'L’intitulé', [[3, 'Intitulé : <b>Programmation C : gestion d’un stock</b>.'], [4, 'Le type, déjà choisi.']]),
  step(B + 'e2-04-question.png', 'La question', [
    [5, 'La consigne du sujet.'],
    [6, 'Aucune réponse listée : correction à la main.', 'blue'],
    [7, 'Lignes de réponse : <b>12</b>, pour une réponse longue.'],
  ]),
  step(B + 'e2-05-corrige.png', 'Le corrigé', [[8, 'La démarche attendue dans <b>Explications</b> : modules, gardes d’inclusion, compilation séparée.']]),
  note('Une réponse en code plutôt qu’en texte ?', 'Créez alors un exercice <b>Code</b> à plusieurs fichiers (<code>produit.h</code>, <code>stock.h</code>, <code>stock.c</code>, <code>main.c</code>), comme au § C.1.'),

  h('B3', 'B.3 Étapes 3 et 4'),
  step(B + 'c0-rien.png', 'Étape 3 : rien à régler', [[1, 'Aucun exercice pratique : passez directement à l’étape suivante.', 'blue']]),
  step(B + 'p5-points.png', 'Les points', [[1, '<b>10</b> et <b>10</b>.'], [2, 'Total : 20 / 20.']]),
  step(B + 'p6-publier.png', 'Publier', [[3, '<b>Enregistrer et publier</b>.'], [4, 'ou <b>Lancer la session</b>.']]),
);

/* ================= C. Examen de C avancé ================= */
const c = part('C', 'C', 'Examen 2e session de C avancé', 'M1 MBDS, BIHAR, SIGL · mars 2025 · 2 h · 20 points');
c.blocs.push(
  h('C0', 'C.0 Créer l’épreuve (étape 1 « Paramètres »)'),
  paper(P + 'cexamen-entete.png'),
  step(C + 'p1-epreuve.png', 'Le titre et le type', [[1, 'Titre : <b>Examen 2e session — C avancé</b>.'], [2, 'Type : <b>Examen</b>.']]),
  step(C + 'p2-pour-qui.png', 'La classe et la matière', [[3, 'Classe : <b>M1 MBDS</b>.'], [4, 'Matière : <b>C avancé</b>.']]),
  step(C + 'p3-deroulement.png', 'La durée, le barème et les consignes', [[5, '<b>2h</b>.'], [6, '<b>20</b>.'], [7, 'Langage : C.', 'blue'], [8, 'L’en-tête du sujet.']]),
  step(C + 'p4-enregistrer.png', 'Enregistrer', [[9, '<b>Enregistrer et continuer</b>.']]),

  fiche('C1', 'Exercices 1 et 2.1', 'Le programme modulaire en cinq fichiers', 'Code (plusieurs fichiers)', 'automatique : déclarations attendues et tests (§ C.4)', 12),
  note('Pourquoi un seul exercice ?', 'Les exercices 1 et 2.1 demandent les fichiers d’un <b>même programme</b> : les en-têtes et <code>Fonctions.c</code> (8 pts), puis <code>main.c</code> (4 pts). Réunis en un exercice de 12 points, l’étudiant écrit tout dans un même projet, et la correction peut le compiler et l’exécuter.'),
  paper(P + 'cexamen-commun.png', P + 'cexamen-ex1.png', P + 'cexamen-ex2.png'),
  pair(step(C + 'e1-01-ajouter.png', 'Ajouter', [[1, '<b>+ Ajouter un exercice</b>.']]), step(C + 'e1-02-type.png', 'Choisir le type', [[2, '<b>Code</b>.']])),
  step(C + 'e1-03-entete.png', 'L’intitulé et l’énoncé', [
    [3, 'Intitulé : <b>Exercices 1 et 2.1 — Programme modulaire : moyenne d’une classe</b>.'],
    [4, 'Le type, déjà choisi.'],
    [5, 'Énoncé : le texte commun du sujet, les questions 1, 2 et 2.1, puis ce que la correction doit connaître : les signatures exactes, le nombre d’étudiants lu dans <code>argv[1]</code>, une ligne « matricule nom note » par étudiant.'],
  ]),
  step(C + 'e1-04-code-depart.png', 'Passer en projet', [
    [6, 'Ouvrez <b>Code de départ</b>.'],
    [7, 'Choisissez <b>Plusieurs fichiers (projet : .h et .c)</b>.'],
  ]),
  step(C + 'e1-05-fichiers.png', 'Les cinq fichiers', [
    [8, 'Renommez les fichiers dans l’ordre des onglets : <b>Etudiant.h</b>, <b>Note.h</b>, <b>Fonctions.h</b>, <b>Fonctions.c</b>, <b>main.c</b>.'],
    [9, 'Code de départ : laissez vide, l’étudiant écrit tout.'],
    [10, '<b>+ Fichier</b> : le projet naît avec trois fichiers, ajoutez les deux autres.'],
    [11, 'La correction compile tous les fichiers .c ensemble.', 'blue'],
  ]),
  step(C + 'e1-06-corrige.png', 'Le corrigé (facultatif)', [[12, 'La solution type : le contenu des cinq fichiers.']]),

  fiche('C2', 'Exercice 2.2', 'Les commandes de compilation', 'Question-réponse', 'automatique, sur mots-clés', 3),
  paper(P + 'cexamen-ex2.png'),
  pair(step(C + 'e2-01-ajouter.png', 'Ajouter', [[1, '<b>+ Ajouter un exercice</b>.']]), step(C + 'e2-02-type.png', 'Choisir le type', [[2, '<b>Question-réponse</b>.']])),
  step(C + 'e2-03-entete.png', 'L’intitulé', [[3, 'Intitulé : <b>Exercice 2.2 — Les commandes de compilation</b>.'], [4, 'Le type, déjà choisi.']]),
  step(C + 'e2-04-question.png', 'La question', [
    [5, 'La question, avec la commande <code>c:&gt; ProgrammeMoyenne.exe 40</code>.'],
    [6, 'Cochez <b>Noter sur les mots-clés présents</b>.'],
    [7, 'Les quatre mots-clés : <b>Fonctions.c</b>, <b>main.c</b>, <b>Fonctions.o</b>, <b>-o ProgrammeMoyenne.exe</b>.'],
  ]),
  note('Exemple de notation', 'Une compilation séparée puis une édition de liens contient les quatre mots-clés : 3 / 3. Une seule commande (<code>gcc Fonctions.c main.c -o ProgrammeMoyenne.exe</code>) n’a pas le fichier objet : 3 mots-clés sur 4, soit 2,25 / 3.'),

  fiche('C3', 'Exercice 3', 'QCM', 'QCM', 'automatique', 5),
  paper(P + 'cexamen-ex3.png'),
  pair(step(C + 'e3-01-ajouter.png', 'Ajouter', [[1, '<b>+ Ajouter un exercice</b>.']]), step(C + 'e3-02-type.png', 'Choisir le type', [[2, '<b>QCM</b>.']])),
  step(C + 'e3-03-entete.png', 'L’intitulé', [[3, 'Intitulé : <b>Exercice 3 — QCM</b>.'], [4, 'Le type, déjà choisi.']]),
  step(C + 'e3-04-question1.png', 'La question 1', [
    [5, 'La question.'],
    [6, 'Les quatre propositions, sans « a) » devant : l’étudiant les verra dans un ordre mélangé.'],
    [7, 'Cochez la bonne réponse.'],
    [8, 'Deux choix au départ : <b>+ Ajouter un choix</b> deux fois.'],
    [9, '<b>Plusieurs réponses possibles</b> : laissez décoché.'],
  ]),
  step(C + 'e3-05-question5.png', 'Les questions 2 à 5', [
    [10, '<b>+ Ajouter une question</b> pour chacune.'],
    [11, 'Question 5 : dans le PDF, les propositions b) et c) sont collées sur une ligne. Saisissez-les comme deux choix.'],
  ]),
  step(C + 'e3-06-liste.png', 'Les cinq questions', [[12, 'Cinq questions : 1 point chacune.']], { medium: true }),
  raw(table(['Question', 'Bonne réponse'], [['1. Fonction d’une directive de préprocesseur', 'a) Modifier le code source avant la compilation'], ['2. Première étape de la compilation', 'c) Le prétraitement'], ['3. Bibliothèques dynamiques', 'b) Réduire la taille des exécutables en partageant du code'], ['4. Statique / dynamique', 'c) Statique intégrée à l’exécutable, dynamique chargée à l’exécution'], ['5. Mauvais lien vers une bibliothèque dynamique', 'b) Le programme risque de planter']])),

  h('C4', 'C.4 Étape 3 « Correction » : le programme en cinq fichiers',
    'L’exercice de code se corrige de deux façons : les <b>déclarations</b> que la copie doit contenir (structures, fonctions avec leur signature), puis les <b>tests</b> qui compilent et lancent le programme entier.'),
  step(C + 'c0-vue.png', 'Vue d’ensemble', [
    [1, 'Le seul exercice pratique de l’examen.'],
    [2, 'Questions et QCM : rien à régler ici.', 'blue'],
  ]),
  step(C + 'c1-01-choix.png', 'Ajouter une déclaration', [
    [3, 'Cliquez sur <b>+ Ajouter une déclaration</b>, puis <b>Structure attendue</b> pour Note et Etudiant.'],
    [4, '<b>Fonction attendue</b> pour les trois fonctions.'],
  ]),
  step(C + 'c1-02-structures.png', 'Les structures', [
    [5, 'Le nom de la structure : <b>Note</b>.'],
    [6, 'Le champ <b>note</b>, de type <b>Décimal simple précision</b> (float). Un champ existe déjà : <b>+ Champ</b> en ajoute d’autres.'],
    [7, 'Pour <b>Etudiant</b>, le champ note est de type <b>Autre type</b> : écrivez <code>Note</code>, comme en C.'],
    [8, 'La déclaration telle qu’elle sera cherchée dans la copie.', 'blue'],
  ]),
  step(C + 'c1-03-fonction.png', 'Une fonction', [
    [9, 'Le nom exact : <b>AjouterNote</b>.'],
    [10, 'Retourne : <b>Rien (affiche seulement)</b>, c’est-à-dire void.'],
    [11, '<b>+ Paramètre</b> : ValeurNote (Décimal simple précision), puis UnEtudiant.'],
    [12, 'UnEtudiant : <b>Autre type</b>, puis <code>Etudiant *</code>.'],
    [13, 'La signature vérifiée à la compilation.', 'blue'],
  ]),
  step(C + 'c1-04-declarations.png', 'Les deux autres fonctions', [
    [14, '<code>float MoyenneNotes(Etudiant *TabEtudiants, int n)</code>.', 'blue'],
    [15, '<code>void AfficherTout(Etudiant *TabEtudiants, int n)</code>.', 'blue'],
  ]),
  step(C + 'c1-05-ajouter-test.png', 'Ajouter un test', [
    [16, '<b>+ Ajouter un premier test</b>. Les fonctions reçoivent un <code>Etudiant *</code> : un test ne peut pas les appeler seules, il lance le programme entier.'],
  ]),
  step(C + 'c1-06-test.png', 'Remplir le test', [
    [17, 'Le test compile tous les fichiers et lance le programme.'],
    [18, 'Trois valeurs de type <b>Chaîne</b>, une par étudiant : <b>E001 Kone 12</b>, <b>E002 Yao 16</b>, <b>E003 Traore 11</b>.'],
    [19, 'Arguments de la ligne de commande : <b>3</b>. Il remplace le 40 de <code>ProgrammeMoyenne.exe 40</code>.'],
    [20, 'Écran : <b>13</b>, la moyenne (12 + 16 + 11) / 3.'],
    [21, 'Comparaison : <b>Nombres affichés</b>. Seule la moyenne, dernière valeur affichée, est vérifiée : la présentation de la liste reste libre.'],
  ]),
  step(C + 'c1-07-tests.png', 'Les deux tests', [[22, 'Dupliquez pour un second test : argument <b>1</b>, valeur <b>E010 Awa 20</b>, écran <b>20</b>.', 'blue']]),

  h('C5', 'C.5 Étape 4 « Points & publication »'),
  step(C + 'p5-points.png', 'Les points', [[1, '<b>12</b>, <b>3</b> et <b>5</b>.'], [2, 'Total : 20 / 20.']]),
  step(C + 'p5b-detail.png', 'Le détail du barème de l’exercice 1', [
    [3, 'Cliquez sur <b>Détail du barème</b>.'],
    [4, 'Cochez <b>Peser chaque ligne moi-même</b>. Sinon, les 12 points se partagent à parts égales entre les sept lignes.'],
    [5, 'Note 2, Etudiant 2, AjouterNote 1, MoyenneNotes 0,5, AfficherTout 0,5 : 6 points de déclarations. Puis 3 + 3 points de tests.'],
    [6, 'Le barème de l’exercice : 12 / 12.'],
  ]),
  step(C + 'p6-publier.png', 'Publier', [[7, '<b>Enregistrer et publier</b>.'], [8, 'ou <b>Lancer la session</b>.']]),
);

export function table(head, rows) {
  return `<table class="data"><thead><tr>${head.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x) => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
