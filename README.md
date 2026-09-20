# CodEval

Plateforme d'évaluation pratique en programmation et en algorithmique.

Une enseignante prépare une évaluation et ses jeux de tests, puis ouvre une session pour
sa classe. Les étudiants rédigent leur programme dans un environnement contrôlé, sans
pouvoir l'exécuter. À la clôture, les productions sont figées et la correction
automatique compile, exécute et note chaque copie.

```
frontend/   Interface React (Vite)                          → frontend/README.md
backend/    API FastAPI + worker de correction (PostgreSQL) → backend/README.md
docs/       Banc de mesure du moteur de correction          → docs/recherche/bench/README.md
```

## Démarrage rapide

Prérequis : Python 3.12, Node.js 20 ou plus, PostgreSQL, et `gcc` sur la machine qui
exécute le worker.

**1. Base de données.** Un PostgreSQL local (voir `backend/README.md`) ou, à défaut, le
conteneur fourni :

```bash
cd backend && docker compose up -d db
```

**2. API.** Depuis `backend/` :

```bash
python3.12 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
```

```bash
cp .env.example .env
```

Renseigner `CODEVAL_SECRET_KEY` dans `.env`, puis charger le jeu de démonstration et
démarrer l'API :

```bash
./.venv/bin/python -m app.seed
```

```bash
./.venv/bin/uvicorn app.main:app --port 8000
```

**3. Worker de correction**, dans un autre terminal, depuis `backend/` :

```bash
./.venv/bin/python -m app.worker
```

**4. Interface**, dans un troisième terminal, depuis `frontend/` :

```bash
npm install && npm run dev
```

Interface sur <http://localhost:5173>, documentation de l'API sur
<http://localhost:8000/docs>.

Comptes chargés par le jeu de démonstration, tous avec le mot de passe `codeval2026` :

| Compte | Rôle |
| --- | --- |
| `admin@esatic.ci` | administration de l'établissement |
| `dr.johnson@esatic.ci` | enseignante |
| `coulibaly.moussa@esatic.ci` … `diallo.sekou@esatic.ci` | les 5 étudiants de la classe SRIT 2A |

## Ce que fait la plateforme

Trois espaces distincts sont servis par la même application React, et l'API applique
l'autorisation sur chaque requête.

| Espace | Ce qu'il permet |
| --- | --- |
| Enseignant | créer une évaluation et ses exercices, programmer et suivre une session, relancer une correction, réajuster une note, publier les résultats, gérer ses classes et sa banque d'exercices |
| Étudiant | composer dans un environnement contrôlé, avec sauvegarde automatique, puis consulter sa copie et ses résultats une fois publiés |
| Établissement | tableau de bord, utilisateurs, classes, vue d'ensemble des évaluations |

Six types de question cohabitent dans une même épreuve : QCM, correspondance,
vrai/faux, réponse courte, exercice de code et exercice d'algorithmique en blocs. Les
quatre premiers sont corrigés par comparaison, sans exécution ; les deux derniers
passent par le compilateur et la sandbox. Le langage activé aujourd'hui est le C : le
C++ et Python sont décrits dans `grading/languages.py` mais désactivés
(`ENABLED_LANGUAGES`).

## Cycle de vie d'une évaluation

```
draft ──> scheduled ──> running ──> closed ──> correcting ──> corrected ──> validated
                                                     │
                                                     └──> (relance : nouvelle campagne)
```

Une évaluation peut aussi passer à `cancelled` : elle reste dans l'historique, mais
sort des notes et des moyennes.

À la clôture, chaque participation reçoit un `frozen_at` et l'API refuse toute écriture
ultérieure sur les productions. La correction ne démarre donc jamais sur une copie
encore modifiable.

## Comment la correction se déroule

```
   API FastAPI                PostgreSQL                 Worker de correction
        │                          │                              │
        │  crée la campagne        │                              │
        ├─────────────────────────>│                              │
        │                          │<──── réserve une campagne ───┤  SELECT … FOR UPDATE
        │                          │                              │  SKIP LOCKED
        │                          │                              │
        │                          │        pour chaque copie, pour chaque exercice :
        │                          │        compilation, exécution des tests en sandbox,
        │                          │        comparaison des sorties, calcul de la note
        │                          │                              │
        │                          │<──── écrit les résultats ────┤
```

Le traitement est idempotent par `(campagne, participation, exercice)` : un worker
interrompu reprend sans produire de doublon. Une relance de correction crée une
nouvelle campagne numérotée, sans écraser la précédente.

## Choix structurants

- **Multi-établissements** : toutes les données sont rattachées à une organisation et
  filtrées à chaque requête ; une enseignante ne voit que ses propres évaluations.
- **Correction séparée de l'API** : les campagnes sont consommées par un worker
  distinct, réplicable, pour que la charge de correction ne dégrade pas les temps de
  réponse pendant les sessions.
- **Sobriété** : aucun composant d'infrastructure au-delà de PostgreSQL. La file de
  correction est une table, et la réservation sans attente (`SKIP LOCKED`) suffit à
  faire coexister plusieurs workers.
- **Traçabilité** : chaque réajustement manuel conserve son auteur, la note
  précédente, le motif et l'horodatage ; les opérations sensibles sont journalisées.
- **Intégrité** : les corrigés ne descendent jamais sur le poste de l'étudiant. Le
  drapeau `correct` d'un choix est retiré, et les éléments d'une correspondance sont
  mélangés et désignés par un jeton opaque dérivé d'un sel propre à l'exercice.
- **Code non fiable isolé** : la sandbox exécute chaque production dans un répertoire
  temporaire jetable, avec des limites de temps processeur, de mémoire, de taille de
  fichiers et de nombre de processus, plus un délai mural et une troncature des sorties.

## Tests

```bash
cd backend && ./.venv/bin/python -m pytest tests -q
```

La suite tourne sur PostgreSQL, avec les mêmes types et les mêmes verrous qu'en
production, et couvre le parcours complet : création d'un établissement, rôles,
création d'une évaluation, ouverture de session, sauvegarde, soumission, gel des
productions, correction réelle avec compilation et exécution, ajustement tracé,
relance d'une seconde campagne et export.

```bash
cd frontend && npm run lint && npm run build
```

## Aller plus loin

| Document | Contenu |
| --- | --- |
| [backend/README.md](backend/README.md) | configuration, modèle de données, sandbox, mise en production |
| [frontend/README.md](frontend/README.md) | organisation des écrans, conventions, rôles et navigation |
| [FONCTIONNALITES.md](FONCTIONNALITES.md) | inventaire détaillé des fonctionnalités |
| [docs/recherche/bench/README.md](docs/recherche/bench/README.md) | banc de mesure du moteur de correction : granularité des tâches et passage à l'échelle |

## Limites connues

- Le schéma est créé au démarrage par `Base.metadata.create_all`. Une migration
  initiale Alembic existe (`backend/alembic/versions/`) : sur une base contenant des
  données, passer par `alembic upgrade head` avant toute évolution du modèle.
- Sous macOS, la sandbox n'applique pas les limites de mémoire ni de nombre de
  processus, qui ne valent que sous Linux. Le worker de production doit tourner sur un
  hôte Linux dédié, sans accès réseau sortant.
- Le worker réserve une campagne entière à la fois : le parallélisme est limité au
  nombre de campagnes en attente, pas au nombre de copies. Le banc de `docs/recherche/`
  mesure précisément cette limite.
