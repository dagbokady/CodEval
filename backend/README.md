# CodEval : backend

API de la plateforme d'évaluation pratique en programmation : FastAPI, SQLAlchemy 2,
PostgreSQL, et un worker de correction qui exécute les productions des apprenants
dans un environnement contraint.

## Prérequis

- Python 3.12
- PostgreSQL 17 (local ou `docker compose up -d db`)
- `gcc` et `g++` sur la machine qui exécute le worker (correction C / C++)

## Installation

```bash
python3.12 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
```

```bash
cp .env.example .env
```

Renseigner ensuite `CODEVAL_SECRET_KEY` dans `.env` : par exemple avec une clé générée
par `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

Base de données : soit un PostgreSQL local :

```bash
psql -d postgres -c "CREATE ROLE codeval LOGIN PASSWORD 'codeval'"
```

```bash
createdb -O codeval codeval && createdb -O codeval codeval_test
```

(Si le rôle ou les bases existent déjà, PostgreSQL le signale et il n'y a rien à faire.)

soit le conteneur fourni :

```bash
docker compose up -d db
```

Le schéma est créé au démarrage de l'API. Jeu de démonstration facultatif :

```bash
./.venv/bin/python -m app.seed
```

## Lancement

L'API :

```bash
./.venv/bin/uvicorn app.main:app --port 8000
```

Le worker de correction, dans un autre terminal :

```bash
./.venv/bin/python -m app.worker
```

Documentation interactive de l'API : <http://localhost:8000/docs>.

Comptes de démonstration (mot de passe `codeval2026`) : `admin@demo.ci` (établissement),
`prof@demo.ci` (enseignant), `kone@demo.ci` (apprenant).

## Configuration

Toutes les variables sont préfixées `CODEVAL_` et lues depuis l'environnement ou `.env`.

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `SECRET_KEY` | signature des jetons JWT : **à changer en production** | `dev-secret-change-me` |
| `DATABASE_URL` | connexion PostgreSQL | `postgresql+psycopg://codeval:codeval@localhost:5432/codeval` |
| `TEST_DATABASE_URL` | base utilisée par la suite de tests | `…/codeval_test` |
| `ACCESS_TOKEN_MINUTES` | durée de validité des jetons | `720` |
| `CORS_ORIGINS` | origines autorisées, séparées par des virgules | `http://localhost:5173` |
| `POOL_SIZE` / `POOL_MAX_OVERFLOW` | pool de connexions | `10` / `20` |
| `SANDBOX_CPU_SECONDS` | temps CPU par exécution | `5` |
| `SANDBOX_MEMORY_MB` | mémoire par exécution (Linux) | `256` |
| `SANDBOX_WALL_TIMEOUT` | délai mural par exécution | `10` |
| `SANDBOX_COMPILE_TIMEOUT` | délai de compilation | `20` |
| `SANDBOX_MAX_PROCESSES` | processus par exécution (Linux) | `64` |
| `WORKER_POLL_SECONDS` | fréquence de scrutation des campagnes | `2.0` |

## Organisation du code

```
app/
  config.py      réglages typés (pydantic-settings)
  db.py          moteur, session, création du schéma
  models.py      modèle de données (SQLAlchemy 2, JSONB sur PostgreSQL)
  schemas.py     contrats d'entrée/sortie validés (Pydantic v2)
  security.py    hachage PBKDF2, émission et vérification des jetons
  deps.py        dépendances FastAPI : session, utilisateur courant, rôles
  services.py    règles métier partagées : accès, cycle de vie, scores
  audit.py       journalisation des opérations critiques
  routers/
    auth.py         inscription d'un établissement, connexion, session courante
    org.py          utilisateurs, matières, classes, inscriptions, statistiques
    evaluations.py  évaluations, exercices, jeux de tests, session et suivi
    corrections.py  campagnes, résultats, ajustements, validation, exports CSV et Excel
    bank.py         banque d'exercices réutilisables
    student.py      accès à l'épreuve, sauvegarde automatique, soumission, résultats
  scheduler.py   ouverture automatique des sessions à l'heure programmée
  grading/
    languages.py  langages supportés (C, C++, Python), commandes et squelettes
    matching.py   jetons opaques des exercices « à relier » (corrigé non exposé)
    sandbox.py    exécution contrainte du code non fiable
    engine.py     compilation, exécution des tests, calcul des notes
  worker.py      consommation des campagnes de correction
  exports.py     génération du classeur Excel des résultats
  seed.py        jeu de données de démonstration
```

Séparation des responsabilités : les routers ne portent que le transport et
l'autorisation, `services.py` porte les règles du cycle de vie, `grading/` ne connaît
ni HTTP ni authentification.

## Modèle de données

`Organization` cloisonne tout le reste : chaque requête est filtrée sur
`organization_id`, et un enseignant ne voit que ses propres évaluations.

`Evaluation` suit les états du cahier des charges : `draft → scheduled → running →
closed → correcting → corrected → validated`. À la clôture, chaque `Participation`
reçoit un `frozen_at` : les `Submission` ne sont plus modifiables.

`BankExercise` est un exercice réutilisable, visible de son auteur et (s'il est
partagé) de tout l'établissement. L'importer dans une évaluation en fait une **copie** :
modifier la banque ensuite ne touche ni une session en cours ni une production corrigée.

`Appreciation` porte le commentaire de l'enseignant sur une copie : général ou attaché
à un exercice. Il n'est servi à l'apprenant qu'une fois l'évaluation `validated`.

`CorrectionRun` matérialise une campagne de correction numérotée. Une relance crée une
nouvelle campagne : les résultats précédents restent consultables. `ScoreAdjustment`
conserve chaque réajustement manuel (auteur, note précédente, motif, horodatage), et
`AuditLog` journalise les opérations sensibles.

## Ouverture des sessions

Une évaluation programmée s'ouvre seule à l'heure dite : `scheduler.py` la scrute
toutes les 30 secondes, et les routes apprenant appliquent le même rattrapage à la
lecture (`services.start_if_due`). Sans ce second filet, l'apprenant qui clique sur
« Commencer l'épreuve » à l'heure pile se verrait refuser l'accès jusqu'au tour suivant
du planificateur.

## Types de questions

Outre le code et l'algorithme en blocs, un exercice peut être un QCM ou une mise en
correspondance ; les deux sont corrigés sans exécution. Leur corrigé ne descend jamais
sur le poste de l'apprenant : le drapeau `correct` d'un choix est retiré, et les
éléments de droite d'une correspondance sont mélangés et désignés par un jeton opaque
(`grading/matching.py`). Ce jeton dérive d'un sel tiré au hasard et rangé dans
`settings` avec l'exercice, afin qu'une rotation de `SECRET_KEY` ne rende pas
incorrigibles les copies déjà rendues.

## Correction automatique

Le worker réclame les campagnes en attente (`SELECT … FOR UPDATE SKIP LOCKED` sur
PostgreSQL, ce qui permet d'en lancer plusieurs en parallèle), puis pour chaque
production : compilation si le langage l'exige, exécution de chaque test dans un
processus isolé, comparaison des sorties (souple, exacte ou numérique) et calcul de la
note. Le barème de l'exercice est réparti au prorata des points des tests.

Le traitement est idempotent par `(campagne, participation, exercice)` : un worker
interrompu peut reprendre sans dupliquer de résultat.

## Sécurité

Le code soumis est du code non fiable. `grading/sandbox.py` l'exécute dans un
répertoire temporaire jetable, avec un environnement minimal et des limites POSIX :
temps CPU, mémoire, taille des fichiers, descripteurs, nombre de processus, plus un
délai mural et une troncature des sorties. `RLIMIT_AS` et `RLIMIT_NPROC` ne sont posés
que sous Linux, inexploitables sous macOS.

L'interface `Sandbox` isole ce choix : une implémentation par conteneur ou micro-VM se
substitue sans toucher au moteur. En production, faire tourner le worker sur un hôte
dédié, sans accès réseau sortant.

## Tests

```bash
./.venv/bin/python -m pytest tests -q
```

La suite tourne sur PostgreSQL (mêmes types et mêmes verrous qu'en production) et
couvre le parcours complet : création d'un établissement, rôles, création d'une
évaluation, ouverture de session, sauvegarde, soumission, gel des productions,
correction réelle (compilation et exécution), ajustement tracé, relance d'une seconde
campagne et export.

## Mise en production

Points à traiter avant un déploiement réel, non couverts par ce MVP :

- **Migrations** : le schéma est créé par `create_all`. Introduire Alembic avant la
  première évolution du modèle sur une base contenant des données.
- Exécuter le worker sur des hôtes séparés de l'API, dimensionnés CPU.
- Servir l'API derrière un reverse proxy en HTTPS et restreindre `CORS_ORIGINS`.
- Sauvegarder la base : elle contient les productions des apprenants et les résultats.
