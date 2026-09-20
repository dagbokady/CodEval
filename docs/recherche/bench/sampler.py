"""Échantillonneur du banc (mémoire, section 4.1.3). Observe la correction, ne la
réalise pas : relève toutes les 500 ms l'occupation du processeur et la mémoire
résidente des workers ET de leurs processus fils (gcc, programme compilé), et
toutes les secondes le nombre de sessions en attente de verrou dans PostgreSQL.

Fournit M6 (processeur), M7 (mémoire pic) et M8 (attentes de verrous). Les relevés
ne sont jamais affichés : ils sont écrits dans un fichier JSON à l'arrêt, que
l'orchestrateur joint au fichier de mesure.

Usage :
  python sampler.py --out data/samples.json --match dbworker.py
  python sampler.py --out data/samples.json --pids 4211,4212 --duree 120
Arrêt : SIGINT ou SIGTERM (l'orchestrateur envoie SIGTERM à l'étape 6).
"""
import argparse, json, os, signal, sys, time
import psutil

DSN = os.environ.get("BENCH_DSN", "postgresql://codeval:codeval@localhost:5432/codeval_test")
PAS = 0.5          # période d'échantillonnage CPU/mémoire (section 4.1.3)
PAS_VERROUS = 1.0  # période d'échantillonnage des attentes de verrou
_stop = False


def _arret(signum, frame):
    global _stop
    _stop = True


class Cible:
    """Suit les processus mesurés : les racines (workers) et tous leurs descendants.

    Les fils comptent : sur le poste de mesure, gcc et le programme de l'étudiant
    sont des enfants du worker, et leur mémoire pèse dans le seuil de 4 Go de R6.
    """

    def __init__(self, pids, motif):
        self.pids, self.motif, self.vus = pids, motif, {}

    def _racines(self):
        if self.pids:
            return [p for p in self.pids if psutil.pid_exists(p)]
        # Exclus : l'échantillonneur lui-même et ses ancêtres (le shell qui l'a lancé
        # porte le motif dans sa propre ligne de commande et serait compté à tort).
        exclus = {os.getpid()}
        try:
            exclus |= {a.pid for a in psutil.Process().parents()}
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
        out = []
        for p in psutil.process_iter(["pid", "cmdline"]):
            if p.info["pid"] in exclus:
                continue
            try:
                if self.motif in " ".join(p.info["cmdline"] or []):
                    out.append(p.info["pid"])
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        return out

    def processus(self):
        """Renvoie les objets psutil des racines et de leurs descendants, en gardant
        les instances d'un tour à l'autre : cpu_percent() est relatif au dernier appel."""
        vivants = {}
        for pid in self._racines():
            try:
                p = self.vus.get(pid) or psutil.Process(pid)
                grappe = [p] + p.children(recursive=True)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            for q in grappe:
                obj = self.vus.get(q.pid, q)
                vivants[q.pid] = obj
                if q.pid not in self.vus:
                    try:
                        obj.cpu_percent()   # amorce : le premier appel renvoie toujours 0
                    except (psutil.NoSuchProcess, psutil.AccessDenied):
                        vivants.pop(q.pid, None)
        self.vus = vivants
        return list(vivants.values())


def releve(cible):
    cpu = rss = 0.0
    n = 0
    for p in cible.processus():
        try:
            cpu += p.cpu_percent()
            rss += p.memory_info().rss
            n += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return cpu, rss / 1e6, n


def verrous(cx):
    if cx is None:
        return None
    try:
        return cx.execute(
            "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type='Lock'").fetchone()[0]
    except Exception:
        return None


def resume(ech, vrr):
    cpu = [e["cpu"] for e in ech] or [0.0]
    rss = [e["rss_mo"] for e in ech] or [0.0]
    lck = [v["n"] for v in vrr if v["n"] is not None] or [0]
    return {
        "m6_cpu_moy": sum(cpu) / len(cpu), "m6_cpu_max": max(cpu),   # % (100 = un cœur)
        "m7_rss_pic_mo": max(rss),
        "m8_verrous_moy": sum(lck) / len(lck), "m8_verrous_max": max(lck),
        "n_echantillons": len(ech),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True, help="fichier JSON des relevés bruts")
    ap.add_argument("--pids", default="", help="PID des workers, séparés par des virgules")
    ap.add_argument("--match", default="dbworker.py", help="motif de ligne de commande si --pids absent")
    ap.add_argument("--duree", type=float, default=0, help="arrêt automatique après N secondes (0 = sans limite)")
    a = ap.parse_args()

    signal.signal(signal.SIGINT, _arret)
    signal.signal(signal.SIGTERM, _arret)

    cx = None
    try:
        import psycopg
        cx = psycopg.connect(DSN, autocommit=True)
    except Exception as e:
        print("verrous non échantillonnés (%s)" % e, file=sys.stderr)

    cible = Cible([int(x) for x in a.pids.split(",") if x.strip()], a.match)
    ech, vrr = [], []
    t0 = time.monotonic()
    prochain_verrou = 0.0
    while not _stop:
        t = time.monotonic() - t0
        if a.duree and t >= a.duree:
            break
        cpu, rss_mo, n = releve(cible)
        ech.append({"t": round(t, 3), "cpu": cpu, "rss_mo": rss_mo, "nproc": n})
        if t >= prochain_verrou:
            vrr.append({"t": round(t, 3), "n": verrous(cx)})
            prochain_verrou = t + PAS_VERROUS
        time.sleep(max(0.0, PAS - (time.monotonic() - t0 - t)))

    if cx is not None:
        cx.close()
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump({"pas_ms": int(PAS * 1000), "pas_verrous_ms": int(PAS_VERROUS * 1000),
               "duree_s": round(time.monotonic() - t0, 3), "cibles": a.pids or a.match,
               "cpu_logique": psutil.cpu_count(), "echantillons": ech, "verrous": vrr,
               "resume": resume(ech, vrr)}, open(a.out, "w"), indent=1)


if __name__ == "__main__":
    main()
