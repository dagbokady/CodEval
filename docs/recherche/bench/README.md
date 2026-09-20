# Banc d'essai : granularité des tâches et passage à l'échelle

Banc reproductible de l'article « granularité × scalabilité » du moteur de
correction de CodEval. Il mesure l'**architecture A (l'existant)** sur le
dispositif courant, et compare le découpage **par campagne (actuel)** au
découpage **fin (une réponse à un exercice)**. Il appelle le vrai moteur de
correction (`app.grading.engine.grade_exercise`) et le vrai bac à sable
(`app.grading.sandbox.SubprocessSandbox`) : le code de production n'est pas modifié.

Le découpage fin n'existe PAS dans le produit (worker.py réserve une campagne
entière) : il est ici **orchestré par le banc** via une table jetable `bench_task`
et la clause `SELECT … FOR UPDATE SKIP LOCKED`, identique au mécanisme de worker.py.

## Prérequis
- Base `codeval_test` accessible (voir `backend/README.md`), variable `BENCH_DSN`
  sinon `postgresql://codeval:codeval@localhost:5432/codeval_test`.
- Le venv du backend (`backend/.venv`) avec psycopg ; gcc/clang pour la compilation C.

## Exécution
```bash
cd docs/recherche/bench
../../../backend/.venv/bin/python run_all.py
```
Sorties **brutes** dans `data/` : `results.json` (agrégats par stage) et `run.log`
(journal horodaté). La table `bench_task` est créée puis supprimée à la fin
(remise à zéro). Chaque répétition repart d'une table purgée.

## Jeu de données du mémoire (chapitre 4)

Deux scripts produisent les copies corrigées pendant les mesures. Ils sont
indépendants du reste du banc et n'ont besoin que du backend.

```bash
cd docs/recherche/bench

# 1. Tirage des 500 copies (graine fixée) -> data/dataset_v1.json + empreinte
python3 gen_dataset.py --seed 2026 --copies 500

# 2. Chargement dans la base MODÈLE (le schéma doit déjà exister :
#    alembic upgrade head sur cette base)
CODEVAL_DATABASE_URL=postgresql+psycopg://codeval:codeval@localhost:5432/codeval_bench_tpl \
    ../../../backend/.venv/bin/python load_dataset.py --dataset data/dataset_v1.json
```

Le chargement écrit les lignes qu'une vraie session aurait écrites (établissement,
enseignante, classe, 500 comptes étudiants, évaluation BENCH-SRIT, participations
et soumissions). Aucune épreuve n'est jouée : seule la correction est mesurée.
L'orchestrateur recrée ensuite la base de mesure à partir de ce modèle avant
chaque mesure, puis retire les copies au-delà de la charge voulue.

Les cinq classes de réponses (K1 correcte, K2 partielle, K3 erreur de
compilation, K4 boucle infinie, K5 vide) ont été vérifiées contre le vrai moteur
de correction : elles produisent bien les statuts `ok`, `compile_error`,
`timeout` et `no_submission` attendus.

## Échantillonneur (M6, M7, M8)

Observe une mesure sans y participer : processeur et mémoire résidente des workers
**et de leurs fils** (gcc, programme compilé) toutes les 500 ms, sessions en attente
de verrou dans PostgreSQL toutes les secondes. Il n'affiche rien : les relevés sont
écrits en JSON à l'arrêt.

```bash
# démarré avant les workers (étape 3 du protocole), arrêté par SIGTERM (étape 6)
../../../backend/.venv/bin/python sampler.py --out data/samples.json --match dbworker.py
```

`--pids 4211,4212` cible des workers précis plutôt qu'un motif de ligne de commande ;
`--duree N` arrête automatiquement après N secondes. Le fichier contient les
échantillons bruts et un `resume` : `m6_cpu_moy`, `m6_cpu_max` (en %, 100 = un cœur
saturé), `m7_rss_pic_mo`, `m8_verrous_moy`, `m8_verrous_max`.

Dépendance : `psutil` (hors `backend/requirements.txt`, c'est un outil de mesure et
non du code de production) : `../../../backend/.venv/bin/pip install psutil`.

## Fichiers
- `orchestrate.py` : orchestrateur des mesures (section 4.5.2) : recrée la base, lance
  l'échantillonneur et les workers, déclenche la campagne, attend, exporte, refroidit.
- `sampler.py` : échantillonneur processeur / mémoire / verrous (M6, M7, M8).
- `dataset_spec.py` : contenu de l'évaluation BENCH-SRIT et variantes de réponses.
- `gen_dataset.py` : tirage et gel du jeu de copies (empreinte SHA-256).
- `load_dataset.py` : chargement du jeu de copies dans une base CodEval.
- `core.py` : enveloppe de correction (grade) + programme W1 + jeux de tests.
- `dbworker.py` : processus correcteur (réservation SKIP LOCKED réelle).
- `run_all.py` : stages 9.1 (débit/latence par charge), 9.3+9.5 (correcteurs ×
  granularité, H1/H2/H3), 9.4 (ajustement USL), 9.9 (idempotence), 9.2 (décomposition).
- `stats.py` : percentiles, IC bootstrap, ajustement USL, Mann-Whitney, Cliff (Python pur).

## Portée et limites (à retenir)
- **Échelle réduite** : répétitions A=1 (série, déterministe), B=2 : PAS les 10
  répétitions ni les 2 exécutions de chauffe du protocole. Charges 40/200/400/1000
  (C1–C4) ; C5/C6 non exécutées. À refaire à pleine échelle avant publication.
- **macOS uniquement** : ce banc couvre la granularité et le passage à l'échelle.
  Les niveaux d'isolement (cloisons du noyau, conteneur, gVisor, micro-VM) ne sont
  pas mesurables ici (cgroups/seccomp = Linux) et relèvent du travail « sécurité »
  distinct.
