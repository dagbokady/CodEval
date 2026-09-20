"""Orchestrateur du banc (mémoire, section 4.5.2). Enchaîne les 8 étapes d'une
mesure pour chaque configuration, sans intervention. Il ne corrige rien : il
prépare, déclenche, chronomètre et exporte.

Lancement (interpréteur du backend, pour psycopg) :

    cd docs/recherche/bench
    ../../../backend/.venv/bin/python orchestrate.py --arch seq --charges 10,50 --repetitions 6

Prérequis : la base modèle `codeval_bench_tpl` chargée (section 4.3) et la
colonne `written_at` ajoutée (section 4.5.1).
"""
from __future__ import annotations

import argparse
import json
import os
import platform
import random
import shutil
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import psycopg

ICI = Path(__file__).resolve().parent
DEPOT = ICI.parents[2]
BACKEND = DEPOT / "backend"
# `.venv/bin/python` sous macOS et Linux, `.venv\\Scripts\\python.exe` sous Windows.
PYTHON = (BACKEND / ".venv" / ("Scripts" if os.name == "nt" else "bin")
          / ("python.exe" if os.name == "nt" else "python"))
DONNEES = ICI / "data"

UTILISATEUR = os.environ.get("BENCH_PGUSER", "codeval")
MDP = os.environ.get("BENCH_PGPASSWORD", "codeval")
HOTE = os.environ.get("BENCH_PGHOST", "localhost")
PORT = os.environ.get("BENCH_PGPORT", "5432")
MODELE = os.environ.get("BENCH_TPL", "codeval_bench_tpl")
MESURE = os.environ.get("BENCH_DB", "codeval_bench_run")

DSN = f"postgresql://{UTILISATEUR}:{MDP}@{HOTE}:{PORT}/{MESURE}"
URL_APP = f"postgresql+psycopg://{UTILISATEUR}:{MDP}@{HOTE}:{PORT}/{MESURE}"

# Architecture -> (motif de ligne de commande pour l'échantillonneur, étape 2).
# Seules les architectures présentes dans le code sont mesurables. A, B et P
# seront ajoutées ici quand leur worker existera (sections 4.6 à 4.8).
ARCHITECTURES = {
    "seq": {"motif": "app.worker", "module": "app.worker", "file": None},
}


def journal(msg: str, fichier=None) -> None:
    ligne = f"{datetime.now(timezone.utc).isoformat(timespec='seconds')} {msg}"
    print(ligne, flush=True)
    if fichier is not None:
        fichier.write(ligne + "\n")
        fichier.flush()


def sh(cmd: list[str], **kw) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, check=True, capture_output=True, text=True, **kw)


def empreinte_jeu() -> str:
    f = DONNEES / "dataset_v1.sha256"
    return f.read_text(encoding="utf-8").split()[0] if f.exists() else "inconnue"


def commit() -> str:
    try:
        return sh(["git", "-C", str(DEPOT), "rev-parse", "HEAD"]).stdout.strip()
    except Exception:
        return "inconnu"


def environnement() -> dict:
    return {
        "systeme": platform.platform(),
        "python": platform.python_version(),
        "coeurs": os.cpu_count(),
        "commit": commit(),
        "dataset_sha256": empreinte_jeu(),
    }


# --- Étape 1 -----------------------------------------------------------------

def recreer_base(charge: int) -> int:
    """Recrée la base de mesure depuis le modèle, puis coupe à `charge` copies.
    Renvoie le nombre de notes attendues."""
    sh(["dropdb", "--if-exists", MESURE])
    sh(["createdb", "-O", UTILISATEUR, "-T", MODELE, MESURE])
    with psycopg.connect(DSN, autocommit=True) as cx:
        cx.execute("DELETE FROM submissions WHERE participation_id IN "
                   "(SELECT id FROM participations ORDER BY id OFFSET %s)", (charge,))
        cx.execute("DELETE FROM participations WHERE id IN "
                   "(SELECT id FROM participations ORDER BY id OFFSET %s)", (charge,))
        copies = cx.execute("SELECT count(*) FROM participations").fetchone()[0]
        exercices = cx.execute("SELECT count(*) FROM exercises").fetchone()[0]
    if copies != charge:
        raise SystemExit(f"{copies} copies au lieu de {charge} : le modèle est trop petit.")
    return copies * exercices


# --- Étape 2 -----------------------------------------------------------------

def vider_file(arch: str) -> None:
    cible = ARCHITECTURES[arch]["file"]
    if cible is None:
        return
    with psycopg.connect(DSN, autocommit=True) as cx:
        cx.execute(f"TRUNCATE TABLE {cible}")


# --- Étape 3 -----------------------------------------------------------------

def demarrer(arch: str, n_workers: int, ech_fichier: Path, jrn_fichier: Path):
    env = dict(os.environ, BENCH_DSN=DSN, CODEVAL_DATABASE_URL=URL_APP)
    ech = subprocess.Popen(
        [str(PYTHON), str(ICI / "sampler.py"), "--out", str(ech_fichier),
         "--match", ARCHITECTURES[arch]["motif"]],
        cwd=str(ICI), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    sortie = open(jrn_fichier, "w", encoding="utf-8")
    workers = [subprocess.Popen([str(PYTHON), "-m", ARCHITECTURES[arch]["module"]],
                                cwd=str(BACKEND), env=env, stdout=sortie,
                                stderr=subprocess.STDOUT)
               for _ in range(n_workers)]
    time.sleep(5)
    return ech, workers, sortie


# --- Étape 4 -----------------------------------------------------------------

def declencher() -> tuple[int, datetime]:
    with psycopg.connect(DSN, autocommit=True) as cx:
        evaluation = cx.execute("SELECT id FROM evaluations ORDER BY id LIMIT 1").fetchone()[0]
        enseignant = cx.execute("SELECT id FROM users WHERE role = 'TEACHER' "
                                "ORDER BY id LIMIT 1").fetchone()[0]
        ligne = cx.execute(
            "INSERT INTO correction_runs "
            "(evaluation_id, number, triggered_by, status, created_at, processed, total, stats) "
            "VALUES (%s, 1, %s, 'PENDING', now(), 0, 0, '{}') RETURNING id, created_at",
            (evaluation, enseignant)).fetchone()
    return ligne[0], ligne[1]


# --- Étape 5 -----------------------------------------------------------------

def attendre(run_id: int, attendues: int, limite: float) -> tuple[bool, int]:
    """Compte les notes toutes les 200 ms. Renvoie (terminee, notes obtenues)."""
    debut = time.monotonic()
    with psycopg.connect(DSN, autocommit=True) as cx:
        while time.monotonic() - debut < limite:
            notes = cx.execute("SELECT count(*) FROM correction_results "
                               "WHERE run_id = %s", (run_id,)).fetchone()[0]
            statut = cx.execute("SELECT status FROM correction_runs WHERE id = %s",
                                (run_id,)).fetchone()[0]
            if notes >= attendues or statut in ("DONE", "PARTIAL", "FAILED"):
                return True, notes
            time.sleep(0.2)
        notes = cx.execute("SELECT count(*) FROM correction_results "
                           "WHERE run_id = %s", (run_id,)).fetchone()[0]
    return False, notes


# --- Étape 6 -----------------------------------------------------------------

def arreter(ech, workers, sortie) -> None:
    for w in workers:
        w.send_signal(signal.SIGTERM)
    for w in workers:
        try:
            w.wait(timeout=30)
        except subprocess.TimeoutExpired:
            w.kill()
    sortie.close()
    ech.send_signal(signal.SIGTERM)   # l'échantillonneur écrit son fichier en partant
    try:
        ech.wait(timeout=30)
    except subprocess.TimeoutExpired:
        ech.kill()


# --- Étape 7 -----------------------------------------------------------------

REQUETE_TOTAL = """
SELECT count(*),
       extract(epoch FROM max(r.written_at) - c.created_at),
       count(DISTINCT r.participation_id)
FROM correction_results r JOIN correction_runs c ON c.id = r.run_id
WHERE c.id = %s GROUP BY c.created_at
"""

REQUETE_LATENCE = """
SELECT percentile_cont(0.5)  WITHIN GROUP (ORDER BY d),
       percentile_cont(0.95) WITHIN GROUP (ORDER BY d)
FROM (SELECT extract(epoch FROM max(r.written_at) - min(c.created_at)) AS d
      FROM correction_results r JOIN correction_runs c ON c.id = r.run_id
      WHERE c.id = %s GROUP BY r.participation_id) s
"""


def exporter(run_id: int) -> dict:
    with psycopg.connect(DSN, autocommit=True) as cx:
        notes, duree, copies = cx.execute(REQUETE_TOTAL, (run_id,)).fetchone()
        p50, p95 = cx.execute(REQUETE_LATENCE, (run_id,)).fetchone()
        # PostgreSQL rend des Decimal : tout ramener en float avant de calculer.
        duree, p50, p95 = float(duree), float(p50), float(p95)
        statuts = dict(cx.execute("SELECT status, count(*) FROM correction_results "
                                  "WHERE run_id = %s GROUP BY status", (run_id,)).fetchall())
        doublons = cx.execute(
            "SELECT count(*) FROM (SELECT participation_id, exercise_id "
            "FROM correction_results WHERE run_id = %s "
            "GROUP BY 1, 2 HAVING count(*) > 1) d", (run_id,)).fetchone()[0]
        lignes = cx.execute(
            "SELECT participation_id, exercise_id, auto_score, max_score, status, "
            "duration_ms, written_at FROM correction_results WHERE run_id = %s "
            "ORDER BY participation_id, exercise_id", (run_id,)).fetchall()
        campagne = cx.execute("SELECT status, processed, total FROM correction_runs "
                              "WHERE id = %s", (run_id,)).fetchone()
    return {
        "m1_t_total_s": round(duree, 3),
        "m2_debit_copies_min": round(copies * 60.0 / duree, 2) if duree else None,
        "m3_p50_s": round(p50, 3), "m3_p95_s": round(p95, 3),
        "m9_notes": notes, "m9_doublons": doublons,
        "statuts": statuts,
        "campagne": {"statut": campagne[0], "traitees": campagne[1], "total": campagne[2]},
        "notes_horodatees": [
            {"copie": a, "exercice": b, "note": c, "bareme": d, "statut": e,
             "duree_ms": f, "ecrite_a": g.isoformat()}
            for a, b, c, d, e, f, g in lignes],
    }


# --- Une mesure --------------------------------------------------------------

def mesurer(arch: str, n: int, charge: int, rep: int, args, jrn) -> dict:
    nom = f"{arch}_N{n}_c{charge}_r{rep}"
    chauffe = rep == 0
    journal(f"{nom} debut{' (chauffe)' if chauffe else ''}", jrn)

    attendues = recreer_base(charge)                                    # 1
    vider_file(arch)                                                    # 2
    ech_f = DONNEES / f"{nom}.ech.json"
    jrn_f = DONNEES / f"{nom}.worker.log"
    ech, workers, sortie = demarrer(arch, n, ech_f, jrn_f)              # 3
    try:
        run_id, t0 = declencher()                                       # 4
        terminee, obtenues = attendre(run_id, attendues, args.limite)   # 5
    finally:
        arreter(ech, workers, sortie)                                   # 6

    mesure = {                                                          # 7
        "configuration": {"architecture": arch, "workers": n, "charge": charge,
                          "repetition": rep, "chauffe": chauffe},
        "environnement": environnement(),
        "t0": t0.isoformat(),
        "terminee": terminee,
        "notes_attendues": attendues,
        "notes_obtenues": obtenues,
    }
    mesure.update(exporter(run_id) if obtenues else {})
    mesure["echantillons"] = json.loads(ech_f.read_text(encoding="utf-8")) if ech_f.exists() else None
    mesure["journal_worker"] = jrn_f.read_text(encoding="utf-8") if jrn_f.exists() else ""
    (DONNEES / f"{nom}.json").write_text(
        json.dumps(mesure, indent=1, ensure_ascii=False), encoding="utf-8")
    for temporaire in (ech_f, jrn_f):
        temporaire.unlink(missing_ok=True)

    etat = "terminee" if terminee else "NON TERMINEE"
    journal(f"{nom} {etat} : {mesure.get('m1_t_total_s')} s, "
            f"{mesure.get('m2_debit_copies_min')} copies/min, {obtenues} notes", jrn)
    return mesure


def resume(m: dict) -> dict:
    c = m["configuration"]
    return {"architecture": c["architecture"], "workers": c["workers"],
            "charge": c["charge"], "repetition": c["repetition"], "chauffe": c["chauffe"],
            "terminee": m["terminee"], "t_total_s": m.get("m1_t_total_s"),
            "debit_copies_min": m.get("m2_debit_copies_min"),
            "p50_s": m.get("m3_p50_s"), "p95_s": m.get("m3_p95_s"),
            "notes": m.get("m9_notes"), "doublons": m.get("m9_doublons"),
            "cpu_moy": (m.get("echantillons") or {}).get("resume", {}).get("m6_cpu_moy"),
            "rss_pic_mo": (m.get("echantillons") or {}).get("resume", {}).get("m7_rss_pic_mo"),
            "verrous_moy": (m.get("echantillons") or {}).get("resume", {}).get("m8_verrous_moy")}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--arch", default="seq", choices=sorted(ARCHITECTURES))
    ap.add_argument("--workers", default="1", help="valeurs de N, séparées par des virgules")
    ap.add_argument("--charges", default="10,50,100,200,500")
    ap.add_argument("--repetitions", type=int, default=6,
                    help="la répétition 0 est la chauffe, elle n'est pas analysée")
    ap.add_argument("--graine", type=int, default=2026)
    ap.add_argument("--limite", type=float, default=3600, help="abandon après N secondes")
    ap.add_argument("--refroidissement", type=float, default=60)
    args = ap.parse_args()

    for outil in ("dropdb", "createdb"):
        if shutil.which(outil) is None:
            raise SystemExit(f"{outil} introuvable : installer les outils clients de PostgreSQL.")
    if not PYTHON.exists():
        raise SystemExit(f"{PYTHON} introuvable : créer l'environnement du backend.")
    DONNEES.mkdir(exist_ok=True)

    workers = [int(x) for x in args.workers.split(",")]
    charges = [int(x) for x in args.charges.split(",")]
    configurations = [(n, c) for n in workers for c in charges]

    jrn = open(DONNEES / f"campagne_{args.arch}.log", "a", encoding="utf-8")
    journal(f"campagne {args.arch} : {len(configurations)} configurations x "
            f"{args.repetitions} repetitions = {len(configurations) * args.repetitions} mesures", jrn)
    journal(f"jeu de donnees {empreinte_jeu()}", jrn)

    agregats, debut = [], time.monotonic()
    # Blocs aléatoires : l'ordre des configurations est retiré au sort à chaque
    # tour, avec la graine, pour qu'une dérive de la machine ne pénalise pas
    # toujours la même configuration.
    for rep in range(args.repetitions):
        tour = list(configurations)
        random.Random(args.graine + rep).shuffle(tour)
        for n, charge in tour:
            try:
                agregats.append(resume(mesurer(args.arch, n, charge, rep, args, jrn)))
            except KeyboardInterrupt:
                journal("campagne interrompue", jrn)
                raise
            except Exception as e:
                journal(f"{args.arch}_N{n}_c{charge}_r{rep} ECHEC : {e}", jrn)
            (DONNEES / f"agregats_{args.arch}.json").write_text(
                json.dumps(agregats, indent=1, ensure_ascii=False), encoding="utf-8")
            time.sleep(args.refroidissement)                             # 8

    journal(f"campagne terminee en {round((time.monotonic() - debut) / 60, 1)} min, "
            f"{len(agregats)} mesures", jrn)
    jrn.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
