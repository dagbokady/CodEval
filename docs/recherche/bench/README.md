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

## Fichiers
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
