# CodEval : Fonctionnalités existantes

État des lieux du code au 18 septembre 2026 : **trois rôles** (administration,
enseignante, étudiant), **une classe** (SRIT 2A), **une matière**
(Langage C). Ce document décrit ce qui est implémenté aujourd'hui, rôle par rôle
et écran par écran. Il ne décrit pas ce qui reste à faire.

---

## 1. Vue d'ensemble

CodEval est une plateforme SaaS d'évaluation pratique en programmation et en
algorithmique. Le cycle complet est :

```
Enseignante                         Étudiant                     Système
───────────                         ────────                     ───────
crée une évaluation
  + exercices + jeux de tests
publie / programme  ──────────────► voit l'épreuve à venir
ouvre la session    ──────────────► compose en environnement
                                    contrôlé (sans exécution)
                                    rend sa copie          ────► fige la production
clôture (ou expiration du temps)                           ────► gèle tout le monde
lance la correction                                        ────► worker : compile,
                                                                  exécute, note
relit, ajuste, annote
publie les résultats ─────────────► consulte sa copie corrigée
exporte (Excel / CSV)
```

Trois composants :

| Composant | Techno | Rôle |
|---|---|---|
| `backend/` | FastAPI + SQLAlchemy + PostgreSQL | API REST, planificateur de sessions |
| `backend/app/worker.py` | processus Python séparé | correction (compile / exécute / note) |
| `frontend/` | React + Vite + React Router | interfaces enseignante et étudiant |

Choix structurants déjà en place : **multi-établissements** (toutes les données
sont rattachées à une organisation et filtrées à chaque requête), **correction
hors de l'API** (file d'attente = une table, worker réplicable), **traçabilité**
(campagnes historisées, ajustements et opérations sensibles journalisés),
**intégrité** (les productions sont figées à la clôture et l'API refuse toute
écriture ultérieure).

---

## 2. Les rôles

Trois rôles, définis dans `backend/app/models.py` (`Role`) et appliqués par
`backend/app/deps.py` (`AdminUser`, `TeacherUser`, `StudentUser`). Le rôle est porté par le
jeton JWT et vérifié côté serveur à chaque requête ; côté client, le composant
`Protected` filtre en plus la navigation.

### 2.0 Administration (`admin`)

Elle gère la plateforme depuis un backoffice (`/admin`). Elle ne conçoit ni
ne corrige aucune épreuve : les routes enseignantes lui répondent 403.

- **Tableau de bord** (`/admin`, `GET /api/stats/overview`) : comptes, classes,
  évaluations, sessions en cours, réussite moyenne, points à traiter
  (étudiants sans classe, aucun enseignant), sessions ouvertes et activité récente.
- **Utilisateurs** (`/admin/utilisateurs`, `/api/users`) : liste filtrable
  (rôle, état, recherche, sans classe) avec classes et dernière connexion ;
  création (mot de passe initial généré, classe d'inscription d'un étudiant),
  modification, désactivation / réactivation, mot de passe provisoire
  (`POST /api/users/:id/reset-password`). Un administrateur ne peut ni se
  désactiver ni changer son propre rôle. L'e-mail est unique sur toute la plateforme.
- **Classes** (`/admin/classes`, `/admin/classes/:id`) : création, renommage,
  suppression (refusée si des évaluations y sont rattachées), inscription et
  désinscription d'étudiants, attribution d'enseignements (enseignant + matière,
  `/api/classrooms/:id/teachers`).
- **Langages et matières** (`/admin/langages`, `GET/PUT /api/admin/languages`,
  `GET /api/admin/subjects`) : ouvre ou ferme le C, le C++, Python et
  l'algorithmique pour tous les enseignants (C et algorithmique par défaut).
  Fermer un langage ne touche pas aux épreuves existantes : il empêche d'en
  créer de nouvelles. Les matières, créées par les enseignants, y sont listées
  en lecture seule avec leur langage et leur auteur.
- **Évaluations** (`/admin/evaluations`, `GET /api/admin/evaluations`) :
  toutes les épreuves, en lecture seule.
- **Journal d'activité** (`/admin/journal`, `GET /api/admin/audit`) : les
  opérations journalisées, filtrables par famille.
Il n'y a pas d'établissement à créer ni à configurer : l'unique compte
d'administration naît de `app.seed`.

### 2.1 Enseignante (`teacher`)

Elle conçoit, surveille, corrige et publie : et administre sa classe. Elle ne
voit que **ses propres évaluations**, dans son établissement.

- **Accueil** (`/accueil`, `GET /api/stats/teacher`) : nombre d'évaluations,
  sessions en cours, évaluations à venir, copies à corriger, étudiants suivis,
  taux de réussite moyen.
- **Mes évaluations** (`/evaluations`) : liste paginée, filtrable, avec le type
  (devoir / interrogation / examen), le statut, la classe, la matière, le nombre
  de participants et d'exercices.
- **Éditeur d'évaluation** (`/evaluations/nouvelle`, `/evaluations/:id`) : voir §4.
- **Suivi de session** (`/evaluations/:id/session`) : voir §6.
- **Résultats et copies** (`/evaluations/:id/resultats`, `.../:participationId`) :
  voir §8.
- **Mes classes** (`/classes`, `/classes/:id`) : sa classe, ses effectifs et les
  évaluations rattachées.
- **Mes matières** (`/matieres`, `/api/subjects`, `GET /api/disciplines`) :
  création d'une matière avec son langage, choisi parmi ceux que
  l'administration a ouverts. Ce langage s'impose aux épreuves de la matière
  (aucun langage à choisir en algorithmique). Seul l'auteur renomme ou
  supprime sa matière ; son langage ne change plus dès qu'une évaluation ou un
  exercice l'utilise. Les matières des collègues restent utilisables.
- **Banque d'exercices** (`/banque`) : voir §5.
- **Statistiques** (`/statistiques`).

Les opérations d'établissement (créer un compte, une classe, une matière,
inscrire un étudiant) sont réservées à l'administration (§2.0).

### 2.2 Étudiant (`student`)

Il n'a accès qu'à ses épreuves et à ses copies. Il ne crée rien.

- **Mes évaluations** (`/mes-evaluations`) : épreuves programmées, en cours et
  passées de sa classe, avec le temps restant.
- **L'épreuve** (`/epreuve/:id`) : écran plein cadre, hors de la coquille
  d'application : voir §7.
- **Mes résultats** (`/mes-resultats`) : liste des copies rendues. La note
  n'apparaît **qu'une fois les résultats publiés** par l'enseignante.
- **Ma copie** (`/mes-resultats/:id`) : copie corrigée, détail des tests, note
  par exercice et appréciations.

### 2.3 Ce qu'un rôle ne peut pas faire

- Une enseignante ne peut pas ouvrir l'évaluation d'une autre enseignante (403),
  ni modifier un exercice de banque dont elle n'est pas l'auteur (403).
- Un étudiant ne voit ni les jeux de tests, ni les corrigés, ni les bonnes
  réponses d'un QCM tant que les résultats ne sont pas publiés : le serveur les
  retire de la réponse (`_public_settings`), il ne s'agit pas d'un simple
  masquage d'interface.
- Aucun rôle ne voit les données d'une autre organisation : chaque requête est
  filtrée sur `organization_id`.

### 2.4 L'installation initiale

`python -m app.seed` crée uniquement le compte d'administration, à partir
des variables de `.env` (copié depuis `.env.example`) : `CODEVAL_ADMIN_EMAIL`,
`CODEVAL_ADMIN_PASSWORD` et, facultatif, `CODEVAL_ADMIN_NAME`.

Aucun enseignant, étudiant, classe, matière, exercice ni évaluation :
l'administrateur ouvre les langages et crée les comptes depuis l'interface.

## 3. Authentification et compte

- `POST /api/auth/register` : crée une organisation + son premier compte
  enseignant (le nom de l'organisation devient un `slug` unique).
- **Confirmation de l'adresse** : avant toute création de compte (enseignant par
  `/inscription`, étudiant par le code de classe), `POST /api/auth/email-code`
  envoie un code à six chiffres par Mailjet. Le formulaire le renvoie dans
  `email_code` ; sans code valide, aucun compte ni espace n'est créé. Le code vaut
  15 minutes, cinq essais ; un nouveau code se demande après 60 s, dix au plus
  par heure et par adresse IP.
- `POST /api/auth/login` : e-mail + mot de passe, renvoie un JWT (`sub`,
  organisation, rôle). Les mots de passe sont hachés (`security.py`).
- `GET /api/auth/me` : profil courant, rôle et nom de l'organisation.
- **Paramètres** (`/parametres`) : écran accessible aux deux rôles : identité du
  compte, choix du thème (§13), déconnexion.

---

## 4. Concevoir une évaluation (enseignante)

### 4.1 L'en-tête

Titre, **type** (devoir, interrogation ou examen), description, consignes
générales, matière, classe affectée, langage, durée (5 à 600 minutes), barème
total (par défaut 20 points), date et heure de démarrage programmé.

Le type est purement déclaratif : il ne change ni les règles ni la correction,
il nomme l'épreuve pour la classe et dans les listes.

**Langage** : seul le **C (gcc)** est proposé. Les définitions C++ et Python
restent dans `grading/languages.py`, prêtes à être rouvertes en ajoutant leur
clé à `ENABLED_LANGUAGES`.

### 4.2 Les quatre étapes de l'assistant

L'éditeur d'évaluation se traverse toujours dans le même ordre :

| # | Étape | Ce qui s'y décide |
|---|---|---|
| 1 | Paramètres | l'en-tête de l'épreuve (§4.1), et, repliées dessous, les **modalités de passage** (surveillance, sorties autorisées, délai d'entrée, annonce, corrigé) |
| 2 | Exercices | type, intitulé, énoncé, questions, et l'environnement de l'apprenant sur la même carte : la **boîte à outils** d'un exercice algorithmique (bloc toujours visible), le **code de départ** d'un exercice de code (déjà rempli, replié) |
| 3 | Correction | ce que la copie doit contenir, et sur quoi elle est exécutée ; la comparaison se règle sur chaque test (« trim » par défaut) |
| 4 | **Points & publication** | ce que vaut chaque exercice (et, au barème détaillé, chaque déclaration et chaque test), puis un seul bouton qui enregistre et publie |

Trois principes tiennent cet ordre :

- **les points viennent en dernier.** On ne pèse pas un test au moment de
  l'écrire, sans savoir combien il y en aura : ni l'éditeur de barème ni la
  carte d'un test ne portent de champ « points ». Tout se pose à l'étape 4,
  barème complet sous les yeux. Tant qu'aucun exercice n'a été pesé plus qu'un
  autre, le total annoncé y arrive **déjà réparti à parts égales** ;
- **les modalités partent des valeurs par défaut** réglées dans Paramètres :
  elles conviennent presque toujours, et restent repliées sous les paramètres
  de l'épreuve plutôt que d'occuper une étape traversée sans rien y changer ;
- **l'environnement se règle avant la correction**, et de la même façon pour les
  deux exercices pratiques : c'est la même question posée deux fois : que
  trouve l'apprenant devant lui en ouvrant l'exercice ?

La banque d'exercices (§5) suit la même trame, exercice par exercice.

### 4.3 Les exercices

Une évaluation contient une liste ordonnée d'exercices. Chaque exercice a un
titre, un énoncé, un barème en points, un langage et un **type**. Le type est le
**premier choix** de toute création d'exercice : dans l'éditeur d'évaluation comme
dans la banque, un sélecteur présente les types groupés par famille avant que le
formulaire n'apparaisse : c'est lui qui décide de l'outil de réponse de
l'apprenant et du mode de correction.

| Type | Description | Correction |
|---|---|---|
| `code` | éditeur de code (C, C++, Python) | compilation + exécution + jeux de tests |
| `algo` | éditeur d'algorithme **en blocs** (LIRE, ECRIRE, SI, SINON, POUR, TANT QUE, VARIABLE, TABLEAU, FONCTION, affectation, RETOUR) | l'arbre de blocs est traduit en Python, puis passe par le même bac à sable et les mêmes jeux de tests |
| `qcm` | choix unique ou choix multiple | comparaison aux réponses correctes ; en choix multiple, note partielle : `(bonnes − mauvaises) / total` |
| `matching` | mise en correspondance de paires gauche / droite | proportion de paires correctement associées |
| `truefalse` | suite d'affirmations à déclarer vraies ou fausses | proportion d'affirmations correctement tranchées |
| `short` | question-réponse : définitions et réponses rédigées | comparaison aux formulations acceptées (casse, accents et ponctuation ignorés), ou note sur les mots-clés présents ; **sans corrigé saisi, la copie est signalée à l'enseignant pour une correction manuelle** plutôt que comptée fausse |

Le catalogue des types vit dans `frontend/src/exerciseTypes.js` : éditeur
d'évaluation, banque, feuille de sujet et copie corrigée le lisent tous, pour
qu'un type ajouté là apparaisse partout du même coup.

Pour les exercices de code, si l'enseignante ne fournit pas de code de départ, le
serveur propose un squelette compilable du langage : personne ne perd du temps
d'épreuve à retaper l'ossature.

Le corrigé ne quitte jamais le serveur avant publication : le drapeau `correct`
d'un choix de QCM, la véracité d'une affirmation Vrai/Faux et la liste des
réponses acceptées d'une question-réponse sont retirés de ce qui descend sur le
poste de l'apprenant. Pour une correspondance le
**rang d'une paire est sa réponse** le serveur n'envoie donc que les éléments
de gauche et une liste mélangée d'éléments de droite désignés par des **jetons
opaques**, que lui seul sait rattacher.

### 4.4 La structure imposée et les outils autorisés (exercices algorithmiques)

Un algorithme rendu sur CodEval a **toujours** la forme du cours : un nom, une
partie déclarative (Constante, Type, Variable), un corps entre Début et Fin.
Cette structure est posée par l'éditeur et l'apprenant ne peut pas la défaire :
elle n'est ni une option de l'exercice ni un choix de l'enseignante.

Ce qui se règle exercice par exercice, à l'étape 3, c'est l'**outillage** :
quels éléments l'apprenant a le droit de poser dans ce squelette. La liste est
celle de `frontend/src/algoVocabulary.js` : les trois rubriques déclaratives, les
entrées/sorties, les conditions (SI, et le SINON qu'on peut interdire à part),
les boucles, les structures, les opérateurs. Un élément décoché n'apparaît pas
dans la palette de l'apprenant **et** est refusé à la correction
(`backend/app/grading/algo.py`), et la feuille de sujet annonce la liste
autorisée.

Un exercice de code n'a pas d'équivalent : son ossature est justement ce que
l'enseignante écrit librement, dans le champ « code de départ » de la même étape.

### 4.5 Les jeux de tests

Chaque exercice de code ou d'algorithme porte une liste de cas de test :

- **nom**, **entrée standard**, **sortie attendue**, **délai** (ms) : les
  **points**, eux, se posent à la dernière étape (§4.2) ;
- **mode de comparaison** : `trim` (à l'espacement de fin près), `exact`
  (au caractère près) ou `numeric` (tolérance 1e-6 sur les nombres).

Tous les tests comptent dans la note : le barème de l'exercice est réparti au
prorata des points des tests.

### 4.6 Les règles d'épreuve

Configurées par évaluation, appliquées côté client **et** comptées côté serveur :

| Règle | Effet |
|---|---|
| `fullscreen` | plein écran obligatoire ; la sortie du plein écran est un incident |
| `block_paste` | copier / coller bloqué dans l'éditeur |
| `track_focus` | changement d'onglet, perte de focus et sortie du plein écran journalisés |
| `allow_early_submit` | autorise (ou non) le rendu avant la fin du temps |
| `max_incidents` | nombre de sorties autorisées ; au-delà, la copie est **gelée automatiquement**. Vaut **1** par défaut, `0` ne verrouille jamais |
| `announce_to_students` | l'épreuve programmée apparaît (ou non) dans l'espace des étudiants avant son ouverture. Une interrogation non annoncée n'y paraît qu'au lancement de la session |

### 4.7 Cycle de vie

`draft` (brouillon) → `scheduled` (programmée) → `running` (en cours) →
`closed` (terminée) → `correcting` (en correction) → `corrected` (corrigée) →
`validated` (validée / publiée).

Actions correspondantes : `publish`, `start`, `extend` (prolonger le temps),
`close`. Une évaluation ne peut être ouverte que si elle a **au moins un
exercice** et **une classe affectée** ; à l'ouverture, les participations de
tous les inscrits de la classe sont créées automatiquement.

Un **planificateur de fond** (`scheduler.py`, toutes les 30 s) ouvre les
sessions programmées dont l'heure est arrivée. Un rattrapage synchrone
(`start_if_due`) évite qu'un étudiant cliquant « Commencer » à l'heure pile ne
se voie refuser l'accès pendant les secondes d'écart.

---

## 5. Banque d'exercices (enseignante)

Exercices réutilisables, indépendants des évaluations : titre, énoncé, langage,
type, points, code de départ ou outils autorisés, étiquettes, jeux de tests,
matière.

L'assistant de création suit la trame de l'éditeur d'évaluation (§4.2), en
trois écrans pour un exercice pratique : **énoncé et environnement** (intitulé,
énoncé, **outils autorisés** pour un exercice algorithmique ou **code de départ**
pour un exercice de code, corrigé ; matière et étiquettes repliées) →
**correction** (déclarations exigées puis jeux de tests, chacun avec sa
comparaison) → **points** (5 par défaut, répartis à parts égales). Les types sans
exécution (QCM, correspondance, Vrai/Faux, question-réponse) en traversent deux :
énoncé et questions, puis points.

- **Visibilité** : ses propres exercices, plus ceux **partagés** dans
  l'établissement (`is_shared`).
- **Écriture** : seul l'auteur modifie ou supprime.
- **Import** : importer un exercice dans une évaluation en fait une **copie**.
  Modifier la banque ensuite ne touche ni une session en cours, ni une
  production déjà corrigée.
- **Compteur d'usage** : chaque import incrémente `uses`.

---

## 6. Surveiller une session en cours (enseignante)

`GET /api/evaluations/{id}/session` alimente l'écran de suivi en temps réel :

- temps restant, statut de la session ;
- pour chaque participant : connecté ou non, exercices traités, dernière
  sauvegarde, copie rendue ou non, nombre d'incidents ;
- compteurs agrégés : présents, rendus, incidents totaux ;
- **journal des incidents** (`GET /api/evaluations/{id}/incidents`), construit à
  partir du journal d'audit : qui, quel type, quand.

L'enseignante peut **prolonger** la durée ou **clôturer** la session à tout
moment. À la clôture (manuelle ou par expiration) toutes les productions sont
figées (`frozen_at`) et l'API refuse toute écriture ultérieure.

---

## 7. Passer l'épreuve (étudiant)

L'écran d'épreuve (`ExamPage`) est chargé en différé, hors de la coquille
d'application. Il propose :

- l'**énoncé** (`SubjectSheet`), les consignes générales et la navigation entre
  exercices ;
- l'**éditeur de code** avec coloration selon le langage, ou l'**éditeur
  d'algorithme en blocs** (`AlgoEditor`) avec la palette de vocabulaire
  autorisée par l'enseignant, ou l'interface propre au type de la question :
  **QCM**, **correspondance**, **Vrai/Faux** ou **question-réponse** ;
- un **compte à rebours synchronisé sur l'horloge du serveur** (`useNow`), non
  sur celle du poste ;
- **aucune exécution de code** : l'étudiant compose sans pouvoir tester. C'est
  le parti pris de l'évaluation.

### 7.1 Brouillons et résistance à la panne

La frappe n'écrit **que dans le navigateur** (`localStorage`) : aucune requête
réseau tant que le travail n'est pas envoyé. Le serveur reçoit la production à
la soumission, à l'expiration du temps, ou au moment où la page est quittée
(`beforeunload`). Une coupure réseau ne fait donc perdre ni le travail ni le
temps d'épreuve ; les brouillons sont restaurés au retour. Le mode navigation
privée ou un quota atteint sont tolérés : on continue en mémoire.

### 7.2 Contrôle d'intégrité

Sept types d'incidents sont détectés côté client : `fullscreen_exit`,
`tab_hidden`, `window_blur`, `paste_blocked`, `copy_blocked`,
`shortcut_blocked`, `reload_attempt`. Chacun est signalé au serveur, qui seul
**compte** et **verrouille** : un client modifié peut omettre des incidents,
jamais en effacer. Un même incident n'est compté qu'une fois par fenêtre de
1,5 s. Les incidents survenus hors ligne sont accumulés localement et transmis
en lot au retour de la connexion (`/incidents/batch`).

Au-delà du seuil `max_incidents`, la production est **gelée sans être marquée
comme rendue** : l'étudiant n'a pas rendu sa copie, mais l'envoi final du
client reste accepté pendant la fenêtre de tolérance : sinon le travail en cours
serait perdu.

### 7.3 Rendu

Le rendu anticipé est possible si la règle l'autorise. À la soumission, la copie
est marquée rendue et figée. Lorsque **tous** les étudiants ont rendu, une
notification part vers l'enseignante : la correction peut être lancée.

---

## 8. Corriger et publier (enseignante)

### 8.1 Campagnes de correction

`POST /api/evaluations/{id}/corrections` crée une **campagne**
(`CorrectionRun`) numérotée et la met en attente. Le **worker** (processus
séparé, `python -m app.worker`) la réclame (sous `FOR UPDATE SKIP LOCKED` sur
PostgreSQL, donc plusieurs workers peuvent tourner en parallèle) puis, pour
chaque copie et chaque exercice :

1. compile la production si le langage l'exige (gcc, g++ ; Python est
   interprété) ; un algorithme en blocs est d'abord traduit en Python ;
2. l'exécute une fois par cas de test dans un **bac à sable** : répertoire
   temporaire dédié, limites POSIX (CPU, mémoire, descripteurs, processus),
   délai mural, sortie tronquée, environnement minimal, session détachée ;
3. compare la sortie selon le mode du test et attribue les points ;
4. enregistre un `CorrectionResult` : **instantané du code**, note automatique,
   barème, statut, journal de compilation, détail test par test, durée.

Statuts possibles d'une copie : `ok`, `compile_error`, `runtime_error`,
`timeout`, `no_submission`.

**Une relance ne remplace jamais la campagne précédente** : elle en crée une
nouvelle. L'historique complet reste consultable, campagne par campagne.

### 8.2 Relecture

- **Tableau des résultats** (`GET /api/evaluations/{id}/results`) : note, barème,
  tests réussis, statut, note ajustée ou non, pour chaque étudiant : les
  inscrits sans production compris.
- **Détail d'une copie** (`.../results/{participationId}`) : code rendu,
  journal de compilation, résultat de chaque test,
  note par exercice.
- **Réajustement manuel** (`.../adjust`) : l'enseignante corrige une note. Le
  réajustement est **systématiquement tracé** note précédente, nouvelle note,
  auteur, motif, horodatage.
- **Appréciations** (`.../appreciation`) : commentaire général sur la copie ou
  commentaire attaché à un exercice précis, visible par l'étudiant une fois les
  résultats publiés.

### 8.3 Publication

`POST /api/evaluations/{id}/validate` fait passer l'évaluation en `validated` et
**notifie chaque étudiant** que sa copie annotée, sa note et les appréciations
sont consultables. Avant cela, l'étudiant voit sa copie rendue mais aucune note.

### 8.4 Exports

- **`export.xlsx`** classeur complet : feuille de synthèse (contexte,
  effectifs, moyennes), notes par exercice, détail des tests, réajustements et
  incidents. Les inscrits sans production y figurent.
- **`export.csv`** tableau simple, séparateur `;` et virgule décimale, pour
  reprise directe dans un tableur francophone.

Chaque export est journalisé.

---

## 9. Notifications

Notifications internes (`GET /api/notifications`, compteur non lus, marquage lu
/ tout lu), affichées dans la barre supérieure. Événements couverts :

- fin d'épreuve (temps écoulé ou clôture manuelle) → enseignant, avec le nombre
  de productions reçues ;
- tous les étudiants ont rendu → enseignante ;
- résultats publiés → chaque étudiant de l'évaluation.

---

## 10. Traçabilité et sécurité

- **Journal d'audit** (`AuditLog`) : organisation, auteur, action, cible,
  métadonnées, horodatage. Actions journalisées : création d'organisation,
  création et modification d'utilisateur, ouverture et clôture de session,
  incidents d'intégrité, verrouillage d'une copie, soumission, lancement de
  correction, réajustement de note, appréciation, publication des résultats,
  export.
- **Isolation par établissement** appliquée dans chaque requête, pas seulement à
  l'affichage.
- **Isolation d'exécution** : le code des étudiants ne tourne jamais dans le
  processus de l'API, mais dans le worker, sous contraintes de ressources.
  L'interface `Sandbox` permet de substituer une isolation plus forte
  (conteneur, micro-VM) sans toucher au moteur de correction.
- **Gestion d'erreur globale** : toute exception non gérée est journalisée côté
  serveur et renvoyée au client sous forme neutre, sans trace technique.

---

## 11. Points d'entrée de l'API

| Préfixe | Contenu | Rôles |
|---|---|---|
| `/api/auth` | inscription d'organisation, connexion, profil | public / tous |
| `/api/users`, `/api/classrooms`, `/api/subjects`, `/api/stats` | comptes, classes, matières, inscriptions, indicateurs | enseignante |
| `/api/evaluations` | évaluations, exercices, cycle de vie, session, incidents | enseignante |
| `/api/evaluations/{id}/corrections`, `/results`, `/validate`, `/export.*` | correction, relecture, publication, exports | enseignante |
| `/api/bank/exercises` | banque d'exercices | enseignante |
| `/api/me` | épreuves, sauvegarde, incidents, soumission, résultats | étudiant |
| `/api/notifications` | notifications internes | tous |
| `/api/health` | sonde de disponibilité | public |

Documentation interactive : <http://localhost:8000/docs>.

---

## 12. Thème clair / sombre

Toute l'interface est peinte à partir des jetons de `frontend/src/styles/tokens.css` :
un jeu clair sur `:root`, un jeu sombre sur `:root[data-theme='dark']`. Aucun
composant ne connaît le thème : seules les valeurs changent.

Trois modes, proposés par le bouton de la barre supérieure (clair → sombre →
système) et par la section « Apparence » des paramètres :

- **Système** (par défaut) : l'interface recopie la préférence de l'appareil et
  **suit ses changements en direct**, sans rechargement, grâce à un écouteur sur
  `prefers-color-scheme`.
- **Clair** / **Sombre** : choix explicite, conservé sur le poste.

C'est le **mode** qui est mémorisé, pas le thème affiché : quelqu'un resté en
« système » continue de suivre son système d'une session à l'autre. Un script
inline dans `index.html` pose le thème avant le premier rendu, pour qu'un
appareil en sombre n'ait pas d'éclair blanc au chargement. L'attribut vit sur
`<html>`, donc l'écran d'épreuve (rendu hors de la coquille d'application)
en hérite comme le reste.

---

## 13. Tests

```bash
cd backend && ./.venv/bin/python -m pytest tests -q
```

```bash
cd frontend && npm run lint && npm run build
```
