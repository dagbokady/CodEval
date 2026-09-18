# CodEval

Plateforme SaaS d'évaluation pratique en programmation et algorithmique : une enseignante
prépare une évaluation et ses jeux de tests, ouvre une session pour sa classe, les
étudiants rédigent leur programme dans un environnement contrôlé sans pouvoir
l'exécuter, puis la correction automatique compile, exécute et note les productions
figées.

```
backend/    API FastAPI + worker de correction (PostgreSQL)   → backend/README.md
frontend/   Interface React (Vite)                            → frontend/README.md
```

## Démarrage rapide

**1. Base de données** PostgreSQL local (voir `backend/README.md`) ou, à défaut :

```bash
cd backend && docker compose up -d db
```

**2. API**

```bash
python3.12 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
```

```bash
cp .env.example .env
```

Renseigner `CODEVAL_SECRET_KEY` dans le fichier `.env`, puis charger le jeu de
démonstration et démarrer l'API :

```bash
./.venv/bin/python -m app.seed
```

```bash
./.venv/bin/uvicorn app.main:app --port 8000
```

**3. Worker de correction**, dans un autre terminal :

```bash
cd backend && ./.venv/bin/python -m app.worker
```

**4. Interface**, dans un troisième terminal :

```bash
cd frontend && npm install && npm run dev
```

Interface sur <http://localhost:5173>, API sur <http://localhost:8000/docs>.
Comptes chargés par le jeu de données (mot de passe `codeval2026`) :
`dr.johnson@esatic.ci` (enseignante) et les 5 étudiants de la classe SRIT 2A,
`coulibaly.moussa@esatic.ci` … `diallo.sekou@esatic.ci`.

Fonctionnalités détaillées : [FONCTIONNALITES.md](FONCTIONNALITES.md).

## Choix structurants

- **Multi-établissements** : toutes les données sont rattachées à une organisation et
  filtrées à chaque requête ; une enseignante ne voit que ses propres évaluations.
- **Correction séparée de l'API** : les campagnes sont consommées par un worker
  distinct, réplicable, pour que la charge de correction ne dégrade pas les temps de
  réponse pendant les sessions.
- **Traçabilité** : une relance de correction crée une nouvelle campagne sans écraser
  la précédente ; les réajustements manuels et les opérations sensibles sont journalisés.
- **Intégrité** : à la clôture d'une session, les productions sont figées et toute
  écriture ultérieure est refusée par l'API.
- **Sobriété** : aucun composant d'infrastructure au-delà de PostgreSQL : la file de
  correction est une table.

## Tests

```bash
cd backend && ./.venv/bin/python -m pytest tests -q
```

```bash
cd frontend && npm run lint && npm run build
```
