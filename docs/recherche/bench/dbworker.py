"""Processus correcteur du banc : réclame une tâche via la clause de réservation
sans attente réelle de PostgreSQL (SELECT ... FOR UPDATE SKIP LOCKED), corrige,
enregistre. Reproduit fidèlement le mécanisme de worker.py sur une table jetable."""
import sys, os, time, json
sys.path.insert(0, os.path.dirname(__file__))
import psycopg
from core import grade, W1, TESTS
DSN = os.environ.get("BENCH_DSN", "postgresql://codeval:codeval@localhost:5432/codeval_test")

def worker(batch, wid, outpath):
    cx = psycopg.connect(DSN, autocommit=True); rec = []; idle = 0
    while True:
        t0 = time.monotonic()
        row = cx.execute(
            "UPDATE bench_task SET status='run',worker=%s "
            "WHERE id=(SELECT id FROM bench_task WHERE batch=%s AND status='pending' "
            "ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING id,ncopies",
            (wid, batch)).fetchone()
        claim_ms = (time.monotonic()-t0)*1000
        if row is None:
            if cx.execute("SELECT count(*) FROM bench_task WHERE batch=%s AND status='pending'",
                          (batch,)).fetchone()[0] == 0: break
            idle += 1; time.sleep(0.002); continue
        tid, nc = row; g0 = time.monotonic()
        for _ in range(nc): grade(W1, TESTS)
        grade_ms = (time.monotonic()-g0)*1000
        cx.execute("UPDATE bench_task SET status='done',done_at=clock_timestamp() WHERE id=%s", (tid,))
        rec.append({"tid": tid, "nc": nc, "claim_ms": claim_ms, "grade_ms": grade_ms})
    cx.close()
    json.dump({"wid": wid, "idle": idle, "rec": rec}, open(outpath, "w"))

if __name__ == "__main__":
    worker(sys.argv[1], int(sys.argv[2]), sys.argv[3])
