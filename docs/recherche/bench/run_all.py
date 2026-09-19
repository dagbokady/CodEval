"""Banc d'essai granularité / scalabilité de CodEval (article granularité×passage
à l'échelle). Exécute l'architecture A (existant) sur le dispositif courant, à
échelle réduite documentée. Produit data/results.json et data/run.log (bruts).

Stages : 9.1 débit/latence par charge ; 9.3+9.5 correcteurs × granularité (H1/H2/H3)
via SKIP LOCKED réel ; 9.4 ajustement USL ; 9.9 idempotence (arrêt brutal).
Usage : python -m run_all   (depuis docs/recherche/bench/, base codeval_test lancée)
"""
import sys, os, time, json, subprocess, glob
sys.path.insert(0, os.path.dirname(__file__))
import psycopg
from core import grade, W1, TESTS
import stats as S
HERE = os.path.dirname(__file__); DATA = os.path.join(HERE, "data")
os.makedirs(DATA, exist_ok=True)
DSN = os.environ.get("BENCH_DSN", "postgresql://codeval:codeval@localhost:5432/codeval_test")
OUT = os.path.join(DATA, "results.json"); R = {}
LOGF = open(os.path.join(DATA, "run.log"), "w")
def LOG(m): print(time.strftime("%H:%M:%S"), m, flush=True); print(time.strftime("%H:%M:%S"), m, file=LOGF, flush=True)
def save(): json.dump(R, open(OUT, "w"), indent=1, default=str)
REPS_A, REPS_B = 1, 2   # échelle réduite (poste portable) ; A déterministe (série)

def setup():
    cx = psycopg.connect(DSN, autocommit=True)
    cx.execute("DROP TABLE IF EXISTS bench_task")
    cx.execute("CREATE TABLE bench_task(id serial primary key,batch text,status text default 'pending',"
               "worker int,ncopies int,done_at timestamptz)")
    cx.close()

def s91():
    LOG("9.1 débit/latence par charge (arch A, 1 correcteur, profil rafale)"); rows = []
    for load in [40, 200, 400, 1000]:
        t0 = time.monotonic(); lat = []; fail = 0; to = 0
        for _ in range(load):
            d, out = grade(W1, TESTS); lat.append(time.monotonic()-t0)
            if out.status.name in ("COMPILE_ERROR", "RUNTIME_ERROR"): fail += 1
            if out.status.name == "TIMEOUT": to += 1
        wall = time.monotonic()-t0
        rows.append(dict(load=load, n=load, med=S.median(lat), ci=S.boot_ci(lat),
                    p95=S.pct(lat, 95), p99=S.pct(lat, 99), thr=load/wall*60, fail=fail/load, to=to/load, wall=wall))
        LOG("  load=%d med=%.2fs p95=%.2fs thr=%.1f/min wall=%.0fs" % (load, S.median(lat), S.pct(lat, 95), load/wall*60, wall))
    R["t9_1"] = rows; save()

def s92():
    LOG("9.2 décomposition par étape (échantillon)")
    from app.grading.sandbox import Workspace
    from core import SB
    syn = []; comp = []; exe = []
    for _ in range(60):
        with Workspace() as ws:
            ws.write("main.c", W1)
            t = time.monotonic(); SB.run(ws.path, ["gcc", "-std=c11", "-fsyntax-only", "main.c"], timeout=20); syn.append((time.monotonic()-t)*1000)
            t = time.monotonic(); SB.run(ws.path, ["gcc", "-O1", "-std=c11", "-o", "program", "main.c", "-lm"], timeout=20); comp.append((time.monotonic()-t)*1000)
            t = time.monotonic(); SB.run(ws.path, ["./program"], stdin="3 4", timeout=10); exe.append((time.monotonic()-t)*1000)
    st = lambda x: dict(med=S.median(x), mad=S.mad(x), p95=S.pct(x, 95))
    R["t9_2"] = dict(syntax=st(syn), compile=st(comp), exec=st(exe)); save()
    LOG("  syntaxe med=%.0fms compile med=%.0fms exec med=%.0fms" % (S.median(syn), S.median(comp), S.median(exe)))

def seed(batch, gran, load):
    cx = psycopg.connect(DSN, autocommit=True)
    cx.execute("DELETE FROM bench_task WHERE batch=%s", (batch,))
    if gran == "A":
        cx.execute("INSERT INTO bench_task(batch,ncopies) VALUES(%s,%s)", (batch, load))
    else:
        with cx.cursor().copy("COPY bench_task(batch,ncopies) FROM STDIN") as cp:
            for _ in range(load): cp.write_row((batch, 1))
    cx.close()

def run_workers(batch, n):
    outs = [os.path.join(DATA, "w_%s_%d.json" % (batch, w)) for w in range(n)]
    t0 = time.monotonic()
    ps = [subprocess.Popen([sys.executable, os.path.join(HERE, "dbworker.py"), batch, str(w), outs[w]]) for w in range(n)]
    for p in ps: p.wait()
    wall = time.monotonic()-t0
    data = [json.load(open(o)) for o in outs if os.path.exists(o)]
    for o in outs:
        try: os.remove(o)
        except OSError: pass
    return wall, data

def s93():
    LOG("9.3/9.5 correcteurs x granularité (H1,H2,H3)"); load = 200; Ns = [1, 2, 4, 8, 16]
    res = {"A": {}, "B": {}}
    for gran, reps in [("A", REPS_A), ("B", REPS_B)]:
        for n in Ns:
            walls = []; thrs = []; occ = []; claims = []
            for rep in range(reps):
                b = "%s%d_%d" % (gran, n, rep); seed(b, gran, load); wall, data = run_workers(b, n)
                corr = sum(r["nc"] for d in data for r in d["rec"])
                busy = sum(r["grade_ms"] for d in data for r in d["rec"])/1000.0
                walls.append(wall); thrs.append(corr/wall*60); occ.append(busy/(wall*n))
                claims += [r["claim_ms"] for d in data for r in d["rec"]]
            res[gran][n] = dict(thr=S.mean(thrs), wall=S.mean(walls), occ=S.mean(occ),
                                claim_med=S.median(claims), claim_p95=S.pct(claims, 95), reps=reps)
            LOG("  %s N=%2d thr=%.1f/min wall=%.0fs occ=%.2f" % (gran, n, S.mean(thrs), S.mean(walls), S.mean(occ)))
    R["t9_3"] = res; save()
    X = [res["B"][n]["thr"] for n in Ns]
    R["t9_4"] = S.usl_fit(Ns, X); R["t9_4"]["cores"] = os.cpu_count(); save()
    LOG("  USL sigma=%.3f kappa=%.4f r2=%.3f Npeak=%.1f" % (R["t9_4"]["sigma"], R["t9_4"]["kappa"], R["t9_4"]["r2"], R["t9_4"]["npeak"]))

def s99():
    LOG("9.9 idempotence (arrêt brutal d'un correcteur)")
    b = "fault"; seed(b, "B", 60)
    p = subprocess.Popen([sys.executable, os.path.join(HERE, "dbworker.py"), b, "0", os.path.join(DATA, "f0.json")])
    time.sleep(3); p.kill(); p.wait()
    cx = psycopg.connect(DSN, autocommit=True)
    done1 = cx.execute("SELECT count(*) FROM bench_task WHERE batch=%s AND status='done'", (b,)).fetchone()[0]
    cx.execute("UPDATE bench_task SET status='pending',worker=NULL WHERE batch=%s AND status='run'", (b,)); cx.close()
    run_workers(b, 2)
    cx = psycopg.connect(DSN, autocommit=True)
    done2 = cx.execute("SELECT count(*) FROM bench_task WHERE batch=%s AND status='done'", (b,)).fetchone()[0]
    total = cx.execute("SELECT count(*) FROM bench_task WHERE batch=%s", (b,)).fetchone()[0]; cx.close()
    for f in glob.glob(os.path.join(DATA, "f0.json")): os.remove(f)
    R["t9_9"] = dict(done_avant_crash=done1, done_final=done2, total=total, double=done2 > total); save()
    LOG("  done avant crash=%d final=%d/%d double-comptage=%s" % (done1, done2, total, done2 > total))

if __name__ == "__main__":
    setup()
    for fn in [s92, s99, s93, s91]:
        try: fn()
        except Exception as e:
            import traceback; LOG("ERREUR %s: %s" % (fn.__name__, e)); traceback.print_exc(file=LOGF)
    cx = psycopg.connect(DSN, autocommit=True); cx.execute("DROP TABLE IF EXISTS bench_task"); cx.close()
    LOG("TERMINÉ"); save()
