"""Tests d'intégration du parcours complet : création → session → correction → résultats."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

# Les tests tournent sur PostgreSQL, comme la production : types natifs (JSONB,
# enums), verrous et dialecte identiques.
os.environ.setdefault(
    "CODEVAL_DATABASE_URL",
    os.environ.get(
        "CODEVAL_TEST_DATABASE_URL",
        "postgresql+psycopg://codeval:codeval@localhost:5432/codeval_test",
    ),
)
os.environ.setdefault("CODEVAL_SECRET_KEY", "test-secret-key-with-enough-entropy")

from app.db import Base, SessionLocal, engine, init_db  # noqa: E402
from app.grading.engine import process_run  # noqa: E402
from app.main import app  # noqa: E402
from app.models import CorrectionRun  # noqa: E402

client = TestClient(app)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def context() -> dict:
    Base.metadata.drop_all(engine)
    init_db()
    res = client.post(
        "/api/auth/register",
        json={
            "organization_name": "Test University",
            "full_name": "Admin Test",
            "email": "admin@test.ci",
            "password": "motdepasse1",
        },
    )
    assert res.status_code == 201, res.text
    admin = res.json()["access_token"]

    client.post(
        "/api/users",
        headers=auth(admin),
        json={
            "email": "prof@test.ci",
            "full_name": "Prof Test",
            "role": "teacher",
            "password": "motdepasse1",
        },
    ).json()
    student = client.post(
        "/api/users",
        headers=auth(admin),
        json={
            "email": "etu@test.ci",
            "full_name": "Étudiant Test",
            "role": "student",
            "password": "motdepasse1",
            "matricule": "INF001",
        },
    ).json()
    classroom = client.post(
        "/api/classrooms", headers=auth(admin), json={"name": "L2 Test"}
    ).json()
    subject = client.post("/api/subjects", headers=auth(admin), json={"name": "Algo"}).json()
    res = client.post(
        f"/api/classrooms/{classroom['id']}/students",
        headers=auth(admin),
        json={"student_ids": [student["id"]]},
    )
    assert res.status_code == 204

    teacher_token = client.post(
        "/api/auth/login", json={"email": "prof@test.ci", "password": "motdepasse1"}
    ).json()["access_token"]
    student_token = client.post(
        "/api/auth/login", json={"email": "etu@test.ci", "password": "motdepasse1"}
    ).json()["access_token"]
    return {
        "admin": admin,
        "teacher": teacher_token,
        "student": student_token,
        "classroom": classroom["id"],
        "subject": subject["id"],
    }


def test_login_rejects_bad_password(context):
    res = client.post("/api/auth/login", json={"email": "prof@test.ci", "password": "faux"})
    assert res.status_code == 401


def test_student_cannot_list_evaluations_as_teacher(context):
    assert client.get("/api/evaluations", headers=auth(context["student"])).status_code == 403


def test_full_flow(context):
    t = auth(context["teacher"])
    s = auth(context["student"])

    evaluation = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Épreuve de test",
            "language": "python",
            "duration_minutes": 30,
            "classroom_id": context["classroom"],
            "subject_id": context["subject"],
            "total_points": 10,
            "rules": {"allow_early_submit": True},
        },
    )
    assert evaluation.status_code == 201, evaluation.text
    eid = evaluation.json()["id"]

    res = client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[
            {
                "title": "Somme",
                "statement": "Lire deux entiers et afficher leur somme.",
                "language": "python",
                "points": 10,
                "starter_code": "",
                "tests": [
                    {"name": "T1", "stdin": "2 3\n", "expected_stdout": "5", "points": 6},
                    {"name": "T2", "stdin": "10 5\n", "expected_stdout": "15", "points": 4},
                ],
            }
        ],
    )
    assert res.status_code == 200, res.text
    exercise_id = res.json()["exercises"][0]["id"]

    # L'apprenant ne voit rien tant que la session n'est pas lancée
    assert client.get(f"/api/me/evaluations/{eid}", headers=s).status_code in (403, 404)

    assert client.post(f"/api/evaluations/{eid}/publish", headers=t).status_code == 200
    assert client.post(f"/api/evaluations/{eid}/start", headers=t).status_code == 200

    exam = client.get(f"/api/me/evaluations/{eid}", headers=s)
    assert exam.status_code == 200
    assert exam.json()["seconds_left"] > 0
    assert "tests" not in exam.text  # les jeux de tests ne fuient jamais côté apprenant

    save = client.put(
        f"/api/me/evaluations/{eid}/exercises/{exercise_id}",
        headers=s,
        json={"code": "a, b = map(int, input().split())\nprint(a + b)\n", "version": 0},
    )
    assert save.status_code == 200 and save.json()["version"] == 1

    assert client.post(f"/api/me/evaluations/{eid}/submit", headers=s).status_code == 200
    # Production figée : plus aucune écriture possible
    assert (
        client.put(
            f"/api/me/evaluations/{eid}/exercises/{exercise_id}",
            headers=s,
            json={"code": "print(0)", "version": 1},
        ).status_code
        == 409
    )

    assert client.post(f"/api/evaluations/{eid}/close", headers=t).status_code == 200
    run = client.post(f"/api/evaluations/{eid}/corrections", headers=t)
    assert run.status_code == 202, run.text

    db = SessionLocal()
    process_run(db, db.get(CorrectionRun, run.json()["id"]))
    db.close()

    results = client.get(f"/api/evaluations/{eid}/results", headers=t).json()
    assert results["participants"][0]["final_score"] == 10.0
    assert results["run"]["status"] == "done"

    # Réajustement manuel tracé
    adjust = client.post(
        f"/api/evaluations/{eid}/results/{results['participants'][0]['participation_id']}/adjust",
        headers=t,
        json={"new_score": 8, "reason": "Barème revu"},
    )
    assert adjust.status_code == 200
    assert adjust.json()["final_score"] == 8.0
    assert adjust.json()["adjustments"][0]["previous_score"] == 10.0

    # Note posée sur un exercice : elle remplace la note automatique de cet
    # exercice, et la copie repart de la somme des exercices : la note globale
    # posée juste avant ne fige pas les corrections qui la suivent.
    participation_id = results["participants"][0]["participation_id"]
    par_exercice = client.post(
        f"/api/evaluations/{eid}/results/{participation_id}/adjust",
        headers=t,
        json={"exercise_id": exercise_id, "new_score": 6, "reason": "Point de méthode"},
    )
    assert par_exercice.status_code == 200, par_exercice.text
    detail = par_exercice.json()
    assert detail["exercises"][0]["final_score"] == 6.0
    assert detail["exercises"][0]["adjusted"] is True
    assert detail["exercises"][0]["auto_score"] == 10.0
    assert detail["final_score"] == 6.0
    # L'énoncé accompagne le résultat : la copie se corrige la question sous les yeux.
    assert detail["exercises"][0]["statement"]

    # Statistiques : la note retenue (6 sur 10) compte pour 12 sur 20.
    stats = client.get("/api/stats", headers=t).json()
    corrigee = next(e for e in stats["evaluations"] if e["id"] == eid)
    assert corrigee["average"] == 12.0 and corrigee["success_rate"] == 100.0
    assert sum(stats["distribution"]) == stats["copies_count"]

    # Le barème de l'exercice borne sa note, pas celui de la copie entière.
    trop = client.post(
        f"/api/evaluations/{eid}/results/{participation_id}/adjust",
        headers=t,
        json={"exercise_id": exercise_id, "new_score": 999, "reason": "Erreur de saisie"},
    )
    assert trop.status_code == 400

    # Relance : nouvelle campagne, l'ancienne reste consultable
    relaunch = client.post(f"/api/evaluations/{eid}/corrections", headers=t)
    assert relaunch.status_code == 202
    assert relaunch.json()["number"] == 2
    assert len(client.get(f"/api/evaluations/{eid}/corrections", headers=t).json()) == 2

    export = client.get(f"/api/evaluations/{eid}/export.csv", headers=t)
    assert export.status_code == 200 and "Étudiant" in export.text


def test_lock_freezes_without_losing_the_last_push(context):
    """Un verrouillage pour sortie d'épreuve ne doit jamais faire perdre le travail."""
    t = auth(context["teacher"])
    s = auth(context["student"])

    evaluation = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Épreuve surveillée",
            "language": "python",
            "duration_minutes": 30,
            "classroom_id": context["classroom"],
            "subject_id": context["subject"],
            "total_points": 10,
            "rules": {"allow_early_submit": True, "track_focus": True, "max_incidents": 1},
        },
    ).json()
    eid = evaluation["id"]
    exercise = client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[{"title": "Somme", "language": "python", "points": 10, "tests": []}],
    ).json()["exercises"][0]["id"]
    client.post(f"/api/evaluations/{eid}/publish", headers=t)
    client.post(f"/api/evaluations/{eid}/start", headers=t)
    client.get(f"/api/me/evaluations/{eid}", headers=s)

    incident = client.post(
        f"/api/me/evaluations/{eid}/incidents", headers=s, json={"type": "tab_hidden"}
    )
    assert incident.status_code == 200
    assert incident.json() == {"incidents": 1, "max_incidents": 1, "locked": True}

    # L'envoi final part après le verrouillage : il doit être accepté.
    late = client.put(
        f"/api/me/evaluations/{eid}/exercises/{exercise}",
        headers=s,
        json={"code": "print(42)", "version": 0},
    )
    assert late.status_code == 200, late.text

    # La copie reste figée : plus aucun accès en écriture par l'épreuve elle-même.
    assert client.get(f"/api/me/evaluations/{eid}", headers=s).status_code in (200, 403)
    monitor = client.get(f"/api/evaluations/{eid}/session", headers=t).json()
    locked_student = next(p for p in monitor["participants"] if p["incidents"] == 1)
    assert locked_student["submitted_at"] is None  # verrouillé n'est pas « a rendu sa copie »


def test_timeout_is_reported_even_with_partial_credit():
    """Un dépassement de temps ne doit jamais être masqué par les tests réussis."""
    from app.grading.engine import grade_exercise
    from app.models import Exercise, TestCase, TestKind

    exercise = Exercise(
        id=901, evaluation_id=1, position=1, title="Lecture", statement="", language="python",
        points=10, starter_code="",
    )
    code = "n = int(input())\nif n == 2:\n    while True:\n        pass\nprint(n)\n"
    tests = [
        TestCase(id=1, exercise_id=901, position=1, name="rapide", kind=TestKind.OFFICIAL,
                 stdin="1\n", expected_stdout="1", comparison="trim", points=5, timeout_ms=2000),
        TestCase(id=2, exercise_id=901, position=2, name="boucle infinie", kind=TestKind.OFFICIAL,
                 stdin="2\n", expected_stdout="2", comparison="trim", points=5, timeout_ms=1000),
    ]
    outcome = grade_exercise(code, exercise, tests)
    assert outcome.score == 5.0
    assert outcome.status.value == "timeout"
    assert [t["passed"] for t in outcome.tests] == [True, False]
    assert outcome.tests[1]["timed_out"] is True


def test_bank_exercise_lifecycle(context):
    """Création, partage, recherche et réutilisation d'un exercice de la banque."""
    t = auth(context["teacher"])
    payload = {
        "title": "Somme de deux entiers",
        "statement": "Lire a et b, afficher a + b.",
        "language": "c",
        "points": 6,
        "starter_code": "#include <stdio.h>\n",
        "tags": ["bases"],
        "is_shared": True,
        "tests": [
            {"name": "T1", "stdin": "2 3\n", "expected_stdout": "5", "points": 3},
            {"name": "T2", "kind": "diagnostic", "stdin": "0 0\n", "expected_stdout": "0", "points": 0},
        ],
    }
    created = client.post("/api/bank/exercises", headers=t, json=payload)
    assert created.status_code == 201, created.text
    item = created.json()
    assert len(item["tests"]) == 2 and item["author_name"] == "Prof Test"

    found = client.get("/api/bank/exercises?q=somme&language=c", headers=t).json()
    assert any(e["id"] == item["id"] for e in found["items"])

    updated = client.put(
        f"/api/bank/exercises/{item['id']}",
        headers=t,
        json={**payload, "points": 8, "tests": payload["tests"][:1]},
    ).json()
    assert updated["points"] == 8 and len(updated["tests"]) == 1

    assert client.post(f"/api/bank/exercises/{item['id']}/used", headers=t).json()["uses"] == 1

    # Un apprenant n'a jamais accès à la banque.
    assert client.get("/api/bank/exercises", headers=auth(context["student"])).status_code == 403

    assert client.delete(f"/api/bank/exercises/{item['id']}", headers=t).status_code == 204
    assert client.get(f"/api/bank/exercises/{item['id']}", headers=t).status_code == 404


def test_algorithme_en_blocs_est_traduit_et_corrige():
    """Un algorithme en blocs est traduit en Python puis noté comme tout programme."""
    import json as _json

    from app.grading.algo import AlgoError, transpile
    from app.grading.engine import grade_exercise
    from app.models import Exercise, TestCase, TestKind

    algorithme = [
        {"type": "lire", "cible": "n"},
        {"type": "variable", "nom": "s", "valeur": "0"},
        {"type": "pour", "variable": "i", "debut": "1", "fin": "n",
         "corps": [{"type": "affectation", "cible": "s", "expression": "s + i"}]},
        {"type": "ecrire", "expression": "s"},
    ]
    exercise = Exercise(
        id=902, evaluation_id=1, position=1, title="Somme", statement="", language="c",
        points=6, starter_code="", kind="algo",
        settings={"allowed_elements": ["lire", "ecrire", "variable", "affectation", "pour"]},
    )
    tests = [
        TestCase(id=1, exercise_id=902, position=1, name="n = 5", kind=TestKind.OFFICIAL,
                 stdin="5\n", expected_stdout="15", comparison="trim", points=3, timeout_ms=2000),
        TestCase(id=2, exercise_id=902, position=2, name="n = 1", kind=TestKind.OFFICIAL,
                 stdin="1\n", expected_stdout="1", comparison="trim", points=3, timeout_ms=2000),
    ]
    outcome = grade_exercise(_json.dumps(algorithme), exercise, tests)
    assert outcome.score == 6.0 and outcome.status.value == "ok"

    # Un élément hors palette est refusé avant toute exécution.
    hors_palette = _json.dumps(algorithme + [{"type": "tantque", "condition": "n > 0", "corps": []}])
    refus = grade_exercise(hors_palette, exercise, tests)
    assert refus.status.value == "compile_error"
    assert "TANTQUE" in refus.compile_log

    # Les expressions sont filtrées : pas d'échappatoire vers le système, pas même
    # par une chaîne formatée.
    for expression in ["__import__('os').system('ls')", "open('/etc/passwd')",
                       "f\"{__import__('os')}\"", "rb'x'"]:
        with pytest.raises(AlgoError):
            transpile(_json.dumps([{"type": "ecrire", "expression": expression}]))


def test_qcm_et_correspondance_survivent_a_l_import_dans_une_evaluation(context):
    """Un QCM créé dans la banque doit rester un QCM une fois importé, avec ses choix."""
    t = auth(context["teacher"])

    qcm = client.post(
        "/api/bank/exercises",
        headers=t,
        json={
            "title": "Complexité du tri par insertion",
            "statement": "Quelle est la complexité au pire ?",
            "kind": "qcm",
            "points": 4,
            "settings": {
                "multiple": False,
                "choices": [
                    {"text": "O(n)", "correct": False},
                    {"text": "O(n²)", "correct": True},
                ],
            },
            "tests": [],
        },
    )
    assert qcm.status_code == 201, qcm.text
    assert qcm.json()["kind"] == "qcm"
    assert len(qcm.json()["settings"]["choices"]) == 2

    # La banque doit rendre le type et les paramètres, sinon l'import les perd.
    listed = client.get("/api/bank/exercises?q=complexité", headers=t).json()["items"]
    imported = next(e for e in listed if e["id"] == qcm.json()["id"])
    assert imported["kind"] == "qcm" and imported["settings"]["choices"]

    evaluation = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Évaluation à questions fermées",
            "duration_minutes": 20,
            "classroom_id": context["classroom"],
            "total_points": 8,
        },
    ).json()
    eid = evaluation["id"]

    saved = client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[
            {
                "title": imported["title"],
                "statement": imported["statement"],
                "language": imported["language"],
                "points": imported["points"],
                "kind": imported["kind"],
                "settings": imported["settings"],
                "tests": [],
            },
            {
                "title": "Relier les notations",
                "kind": "matching",
                "points": 4,
                "settings": {"pairs": [{"left": "O(1)", "right": "constant"},
                                       {"left": "O(n)", "right": "linéaire"}]},
                "tests": [],
            },
        ],
    )
    assert saved.status_code == 200, saved.text
    kinds = [e["kind"] for e in saved.json()["exercises"]]
    assert kinds == ["qcm", "matching"]
    assert saved.json()["exercises"][0]["settings"]["choices"][1]["correct"] is True
    assert len(saved.json()["exercises"][1]["settings"]["pairs"]) == 2

    # Côté apprenant : les questions sont bien servies, sans les bonnes réponses.
    client.post(f"/api/evaluations/{eid}/publish", headers=t)
    client.post(f"/api/evaluations/{eid}/start", headers=t)
    exam = client.get(f"/api/me/evaluations/{eid}", headers=auth(context["student"])).json()
    assert [e["kind"] for e in exam["exercises"]] == ["qcm", "matching"]
    # Les réglages à plat d'un exercice d'autrefois sont servis comme une question.
    served_qcm = exam["exercises"][0]["settings"]["questions"][0]
    assert served_qcm["choices"][0]["text"] == "O(n)"
    # Le corrigé ne descend jamais sur le poste de l'apprenant pendant l'épreuve.
    assert all("correct" not in c for c in served_qcm["choices"])
    assert "choices" not in exam["exercises"][0]["settings"]
    client.post(f"/api/evaluations/{eid}/close", headers=t)


def test_epreuve_programmee_s_ouvre_a_l_heure_dite(context):
    """« Commencer l'épreuve » ne doit pas dépendre du prochain tour du planificateur."""
    from datetime import timedelta

    from app.models import utcnow

    t = auth(context["teacher"])
    s = auth(context["student"])
    start = utcnow() - timedelta(minutes=1)

    eid = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Épreuve programmée",
            "language": "python",
            "duration_minutes": 30,
            "classroom_id": context["classroom"],
            "scheduled_start": start.isoformat(),
            "total_points": 5,
        },
    ).json()["id"]
    client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[{"title": "Bonjour", "language": "python", "points": 5, "tests": []}],
    )
    assert client.post(f"/api/evaluations/{eid}/publish", headers=t).status_code == 200

    # L'enseignant n'a pas cliqué sur « Lancer » : l'heure programmée suffit.
    exam = client.get(f"/api/me/evaluations/{eid}", headers=s)
    assert exam.status_code == 200, exam.text
    assert exam.json()["seconds_left"] > 0
    client.post(f"/api/evaluations/{eid}/close", headers=t)


def test_squelette_du_langage_est_fourni_par_defaut(context):
    """Un exercice C sans code de départ ouvre sur un main() compilable."""
    t = auth(context["teacher"])
    s = auth(context["student"])

    languages = client.get("/api/evaluations/languages", headers=t).json()
    assert "return 0;" in next(l for l in languages if l["key"] == "c")["starter_code"]

    eid = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Épreuve C",
            "language": "c",
            "duration_minutes": 30,
            "classroom_id": context["classroom"],
            "total_points": 5,
        },
    ).json()["id"]
    saved = client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[
            {"title": "Afficher bonjour", "language": "c", "points": 3, "starter_code": "",
             "tests": []},
            {"title": "Un QCM", "kind": "qcm", "points": 2,
             "settings": {"choices": [{"text": "oui", "correct": True}]}, "tests": []},
        ],
    ).json()
    code_id, qcm_id = (e["id"] for e in saved["exercises"])
    client.post(f"/api/evaluations/{eid}/publish", headers=t)
    client.post(f"/api/evaluations/{eid}/start", headers=t)

    drafts = client.get(f"/api/me/evaluations/{eid}", headers=s).json()["drafts"]
    assert "int main(void)" in drafts[str(code_id)]
    assert "return 0;" in drafts[str(code_id)]
    assert drafts[str(qcm_id)] == ""  # un QCM n'a pas de squelette
    client.post(f"/api/evaluations/{eid}/close", headers=t)


def test_copie_de_l_apprenant_puis_publication_des_notes(context):
    """L'apprenant voit sa copie dès la clôture ; note et appréciations à la publication."""
    t = auth(context["teacher"])
    s = auth(context["student"])

    eid = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Épreuve à rendre",
            "language": "python",
            "duration_minutes": 30,
            "classroom_id": context["classroom"],
            "total_points": 10,
            "rules": {"allow_early_submit": True},
        },
    ).json()["id"]
    exercise_id = client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[
            {
                "title": "Doubler",
                "statement": "Lire un entier et afficher son double.",
                "language": "python",
                "points": 10,
                "tests": [{"name": "T1", "stdin": "4\n", "expected_stdout": "8", "points": 10}],
            }
        ],
    ).json()["exercises"][0]["id"]

    client.post(f"/api/evaluations/{eid}/publish", headers=t)
    client.post(f"/api/evaluations/{eid}/start", headers=t)

    # Pendant l'épreuve, la copie n'est pas consultable.
    assert client.get(f"/api/me/results/{eid}", headers=s).status_code == 403

    client.put(
        f"/api/me/evaluations/{eid}/exercises/{exercise_id}",
        headers=s,
        json={"code": "print(int(input()) * 2)\n", "version": 0},
    )
    client.post(f"/api/me/evaluations/{eid}/submit", headers=s)
    client.post(f"/api/evaluations/{eid}/close", headers=t)

    # Copie disponible, sans note tant que rien n'est publié.
    copy = client.get(f"/api/me/results/{eid}", headers=s)
    assert copy.status_code == 200, copy.text
    assert copy.json()["published"] is False
    assert copy.json()["score"] is None
    sheet = copy.json()["exercises"][0]
    assert sheet["statement"].startswith("Lire un entier")
    assert "print(int(input())" in sheet["answer"]
    assert sheet["score"] is None

    run = client.post(f"/api/evaluations/{eid}/corrections", headers=t).json()
    db = SessionLocal()
    process_run(db, db.get(CorrectionRun, run["id"]))
    db.close()

    participation_id = client.get(f"/api/evaluations/{eid}/results", headers=t).json()[
        "participants"
    ][0]["participation_id"]
    appreciation = client.post(
        f"/api/evaluations/{eid}/results/{participation_id}/appreciation",
        headers=t,
        json={"text": "Travail clair et correct."},
    )
    assert appreciation.status_code == 200, appreciation.text
    assert appreciation.json()["appreciation"] == "Travail clair et correct."
    client.post(
        f"/api/evaluations/{eid}/results/{participation_id}/appreciation",
        headers=t,
        json={"exercise_id": exercise_id, "text": "Bonne lecture de l'entrée."},
    )

    # Correction faite mais non validée : toujours rien de publié.
    assert client.get(f"/api/me/results/{eid}", headers=s).json()["score"] is None

    assert client.post(f"/api/evaluations/{eid}/validate", headers=t).status_code == 200
    published = client.get(f"/api/me/results/{eid}", headers=s).json()
    assert published["published"] is True
    assert published["score"] == 10.0
    assert published["appreciation"] == "Travail clair et correct."
    assert published["exercises"][0]["score"] == 10.0
    assert published["exercises"][0]["appreciation"] == "Bonne lecture de l'entrée."

    listed = client.get("/api/me/results", headers=s).json()
    entry = next(r for r in listed if r["evaluation_id"] == eid)
    assert entry["published"] is True and entry["score"] == 10.0

    # L'apprenant n'accède qu'à ses propres copies.
    assert client.get(f"/api/evaluations/{eid}/results", headers=s).status_code == 403


def test_corrige_publie_avec_les_notes(context):
    """Le corrigé reste au serveur pendant l'épreuve et paraît avec les notes,
    sauf si l'enseignant a choisi de ne pas le proposer."""
    t = auth(context["teacher"])
    s = auth(context["student"])

    for show in (True, False):
        eid = client.post(
            "/api/evaluations",
            headers=t,
            json={
                "title": "Épreuve avec corrigé",
                "language": "python",
                "duration_minutes": 30,
                "classroom_id": context["classroom"],
                "total_points": 10,
                "rules": {"allow_early_submit": True, "show_solutions": show},
            },
        ).json()["id"]
        exercise_id = client.put(
            f"/api/evaluations/{eid}/exercises",
            headers=t,
            json=[
                {
                    "title": "Tripler",
                    "statement": "Lire un entier et afficher son triple.",
                    "language": "python",
                    "points": 10,
                    "settings": {
                        "solution": "print(int(input()) * 3)",
                        "solution_notes": "On lit l'entier, on le multiplie par 3.",
                    },
                    "tests": [{"name": "T1", "stdin": "2\n", "expected_stdout": "6", "points": 10}],
                }
            ],
        ).json()["exercises"][0]["id"]
        client.post(f"/api/evaluations/{eid}/publish", headers=t)
        client.post(f"/api/evaluations/{eid}/start", headers=t)

        # Pendant l'épreuve, le corrigé ne quitte pas le serveur.
        exam = client.get(f"/api/me/evaluations/{eid}", headers=s).json()
        assert "solution" not in exam["exercises"][0]["settings"]
        assert "solution_notes" not in exam["exercises"][0]["settings"]

        client.put(
            f"/api/me/evaluations/{eid}/exercises/{exercise_id}",
            headers=s,
            json={"code": "print(int(input()) * 3)\n", "version": 0},
        )
        listed = client.get("/api/me/evaluations", headers=s).json()
        entry = next(e for e in listed if e["id"] == eid)
        assert entry["exercises_count"] == 1 and entry["answered_count"] == 1

        client.post(f"/api/me/evaluations/{eid}/submit", headers=s)
        client.post(f"/api/evaluations/{eid}/close", headers=t)

        # Clôturée, non publiée : ni note, ni corrigé.
        before = client.get(f"/api/me/results/{eid}", headers=s).json()
        assert before["solutions_available"] is False
        assert before["exercises"][0]["solution"] == ""

        run = client.post(f"/api/evaluations/{eid}/corrections", headers=t).json()
        db = SessionLocal()
        process_run(db, db.get(CorrectionRun, run["id"]))
        db.close()
        assert client.post(f"/api/evaluations/{eid}/validate", headers=t).status_code == 200

        copy = client.get(f"/api/me/results/{eid}", headers=s).json()
        sheet = copy["exercises"][0]
        assert "solution" not in sheet["settings"]
        assert copy["solutions_available"] is show
        if show:
            assert sheet["solution"] == "print(int(input()) * 3)"
            assert sheet["solution_notes"].startswith("On lit")
            assert [(x["name"], x["input"], x["expected"]) for x in sheet["expected_tests"]] == [
                ("T1", "2\n", "6")
            ]
        else:
            assert sheet["solution"] == "" and sheet["expected_tests"] == []

        listed = client.get("/api/me/evaluations", headers=s).json()
        entry = next(e for e in listed if e["id"] == eid)
        assert entry["published"] is True and entry["score"] == 10.0
        assert entry["status_label"] == "Publié"
        assert entry["solutions_available"] is show


def test_accueil_enseignant_expose_ses_indicateurs(context):
    stats = client.get("/api/stats/teacher", headers=auth(context["teacher"]))
    assert stats.status_code == 200, stats.text
    body = stats.json()
    assert body["evaluations"] >= 1
    assert body["students"] >= 1
    assert client.get("/api/stats/teacher", headers=auth(context["student"])).status_code == 403


def test_correspondance_ne_livre_pas_son_corrige_a_l_apprenant(context):
    """L'ordre des paires est la réponse : le poste de l'apprenant ne doit jamais l'avoir."""
    import json as _json

    t = auth(context["teacher"])
    s = auth(context["student"])

    eid = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Correspondances",
            "duration_minutes": 20,
            "classroom_id": context["classroom"],
            "total_points": 6,
            "rules": {"allow_early_submit": True},
        },
    ).json()["id"]
    exercise = client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[
            {
                "title": "Relier les complexités",
                "kind": "matching",
                "points": 6,
                "settings": {
                    "pairs": [
                        {"left": "O(1)", "right": "constant"},
                        {"left": "O(n)", "right": "linéaire"},
                        {"left": "O(n²)", "right": "quadratique"},
                    ]
                },
                "tests": [],
            }
        ],
    ).json()["exercises"][0]
    assert exercise["settings"]["_matching_salt"]  # le serveur a semé son sel

    client.post(f"/api/evaluations/{eid}/publish", headers=t)
    client.post(f"/api/evaluations/{eid}/start", headers=t)
    served = client.get(f"/api/me/evaluations/{eid}", headers=s).json()["exercises"][0]

    # Ni le corrigé, ni le sel, ni le rang d'origine ne descendent sur le poste.
    grid = served["settings"]["questions"][0]
    assert all("right" not in pair for pair in grid["pairs"])
    assert "_matching_salt" not in served["settings"]
    assert "pairs" not in served["settings"]
    options = grid["right_options"]
    assert sorted(o["text"] for o in options) == ["constant", "linéaire", "quadratique"]
    assert all(set(o) == {"token", "text"} for o in options)

    by_text = {o["text"]: o["token"] for o in options}
    client.put(
        f"/api/me/evaluations/{eid}/exercises/{exercise['id']}",
        headers=s,
        json={
            "code": _json.dumps(
                {
                    "matches": {
                        "0": by_text["constant"],
                        "1": by_text["linéaire"],
                        "2": by_text["constant"],
                    }
                }
            ),
            "version": 0,
        },
    )
    client.post(f"/api/me/evaluations/{eid}/submit", headers=s)
    client.post(f"/api/evaluations/{eid}/close", headers=t)

    run = client.post(f"/api/evaluations/{eid}/corrections", headers=t).json()
    db = SessionLocal()
    process_run(db, db.get(CorrectionRun, run["id"]))
    db.close()

    # Deux paires justes sur trois : les jetons ont bien été rattachés à leur rang.
    results = client.get(f"/api/evaluations/{eid}/results", headers=t).json()
    assert results["participants"][0]["final_score"] == 4.0

    client.post(f"/api/evaluations/{eid}/validate", headers=t)
    rows = client.get(f"/api/me/results/{eid}", headers=s).json()["exercises"][0]["matches"]
    assert [r["chosen"] for r in rows] == ["constant", "linéaire", "constant"]
    assert [r["correct"] for r in rows] == [True, True, False]


def test_le_sel_d_une_correspondance_survit_a_une_modification(context):
    """Réenregistrer l'exercice ne doit pas invalider les copies déjà rendues."""
    t = auth(context["teacher"])
    eid = client.post(
        "/api/evaluations",
        headers=t,
        json={"title": "Sel stable", "duration_minutes": 20,
              "classroom_id": context["classroom"], "total_points": 4},
    ).json()["id"]
    body = [
        {
            "title": "Paires",
            "kind": "matching",
            "points": 4,
            "settings": {"pairs": [{"left": "a", "right": "A"}, {"left": "b", "right": "B"}]},
            "tests": [],
        }
    ]
    first = client.put(f"/api/evaluations/{eid}/exercises", headers=t, json=body).json()
    salt = first["exercises"][0]["settings"]["_matching_salt"]

    # Un client qui renvoie les paramètres sans le sel ne doit pas l'effacer.
    again = client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[{**body[0], "id": first["exercises"][0]["id"], "points": 5}],
    ).json()
    assert again["exercises"][0]["settings"]["_matching_salt"] == salt


def test_appreciation_refusee_avant_toute_correction(context):
    """Sans campagne de correction, l'appréciation est refusée : pas enregistrée puis perdue."""
    t = auth(context["teacher"])
    eid = client.post(
        "/api/evaluations",
        headers=t,
        json={"title": "Sans correction", "duration_minutes": 20,
              "classroom_id": context["classroom"], "total_points": 4},
    ).json()["id"]
    client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[{"title": "Q", "language": "python", "points": 4, "tests": []}],
    )
    client.post(f"/api/evaluations/{eid}/publish", headers=t)
    client.post(f"/api/evaluations/{eid}/start", headers=t)
    participation = client.get(f"/api/evaluations/{eid}/session", headers=t).json()[
        "participants"
    ][0]["participation_id"]

    res = client.post(
        f"/api/evaluations/{eid}/results/{participation}/appreciation",
        headers=t,
        json={"text": "Trop tôt"},
    )
    assert res.status_code == 404

    from app.models import Appreciation
    db = SessionLocal()
    assert db.query(Appreciation).filter_by(participation_id=participation).count() == 0
    db.close()
    client.post(f"/api/evaluations/{eid}/close", headers=t)


def test_vrai_faux_et_question_reponse_de_bout_en_bout(context):
    """Les deux nouveaux types : le corrigé reste au serveur, la note se calcule.

    Un Vrai/Faux répartit son barème entre les affirmations ; une question-réponse
    est notée sur les formulations acceptées par l'enseignant.
    """
    import json as _json

    t = auth(context["teacher"])
    s = auth(context["student"])

    eid = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Cours",
            "duration_minutes": 20,
            "classroom_id": context["classroom"],
            "total_points": 8,
            "rules": {"allow_early_submit": True},
        },
    ).json()["id"]
    exercises = client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[
            {
                "title": "Affirmations",
                "kind": "truefalse",
                "points": 4,
                "settings": {
                    "statements": [
                        {"text": "Une boucle peut être infinie", "answer": True},
                        {"text": "Une variable est un mot-clé", "answer": False},
                    ]
                },
                "tests": [],
            },
            {
                "title": "Définition",
                "kind": "short",
                "points": 4,
                "settings": {"accepted": ["une case mémoire nommée"]},
                "tests": [],
            },
        ],
    ).json()["exercises"]

    client.post(f"/api/evaluations/{eid}/publish", headers=t)
    client.post(f"/api/evaluations/{eid}/start", headers=t)
    served = client.get(f"/api/me/evaluations/{eid}", headers=s).json()["exercises"]

    # Le corrigé ne descend jamais sur le poste de l'apprenant.
    assert all("answer" not in st for st in served[0]["settings"]["statements"])
    assert [st["text"] for st in served[0]["settings"]["statements"]] == [
        "Une boucle peut être infinie",
        "Une variable est un mot-clé",
    ]
    assert "accepted" not in served[1]["settings"]

    client.put(
        f"/api/me/evaluations/{eid}/exercises/{exercises[0]['id']}",
        headers=s,
        json={"code": _json.dumps({"answers": {"0": True, "1": True}}), "version": 0},
    )
    client.put(
        f"/api/me/evaluations/{eid}/exercises/{exercises[1]['id']}",
        headers=s,
        json={"code": "Une CASE mémoire nommée.", "version": 0},
    )
    client.post(f"/api/me/evaluations/{eid}/submit", headers=s)
    client.post(f"/api/evaluations/{eid}/close", headers=t)

    run = client.post(f"/api/evaluations/{eid}/corrections", headers=t).json()
    db = SessionLocal()
    process_run(db, db.get(CorrectionRun, run["id"]))
    db.close()

    # 2 points sur 4 au Vrai/Faux (une affirmation sur deux), 4 sur 4 à la
    # définition : la casse, les accents et le point final sont ignorés.
    results = client.get(f"/api/evaluations/{eid}/results", headers=t).json()
    assert results["participants"][0]["final_score"] == 6.0


def test_question_reponse_sans_corrige_attend_la_note_de_l_enseignant():
    """Sans réponse acceptée, la copie n'est pas comptée fausse : elle est signalée."""
    from app.grading.engine import grade_exercise
    from app.models import Exercise

    exercise = Exercise(
        id=902, evaluation_id=1, position=1, title="Expliquez", statement="",
        language="c", points=6, starter_code="", kind="short", settings={"accepted": []},
    )
    outcome = grade_exercise("Ma réponse rédigée en toutes lettres.", exercise, [])
    assert outcome.score == 0.0
    assert outcome.status.value == "ok"
    assert outcome.tests[0]["manual"] is True
    assert outcome.tests[0]["passed"] is None


def test_un_exercice_porte_plusieurs_questions_et_partage_son_bareme():
    """QCM, correspondance et question-réponse : le barème se partage entre les questions."""
    import json as _json

    from app.grading.engine import grade_exercise
    from app.grading.matching import token_for
    from app.models import Exercise

    qcm = Exercise(
        id=903, evaluation_id=1, position=1, title="Tris", statement="",
        language="c", points=6, starter_code="", kind="qcm",
        settings={
            "questions": [
                {
                    "text": "Complexité du tri par insertion au pire ?",
                    "choices": [{"text": "O(n)", "correct": False}, {"text": "O(n²)", "correct": True}],
                },
                {
                    "text": "Un tri stable conserve-t-il l'ordre des égaux ?",
                    "choices": [{"text": "oui", "correct": True}, {"text": "non", "correct": False}],
                },
            ]
        },
    )
    # Première question juste, seconde fausse : la moitié du barème.
    answer = _json.dumps({"questions": [{"selected": [1]}, {"selected": [1]}]})
    outcome = grade_exercise(answer, qcm, [])
    assert outcome.score == 3.0
    assert [detail["question"] for detail in outcome.tests] == [1, 2]
    assert outcome.tests[0]["passed"] is True and outcome.tests[1]["passed"] is False

    short = Exercise(
        id=904, evaluation_id=1, position=2, title="Définitions", statement="",
        language="c", points=4, starter_code="", kind="short",
        settings={
            "questions": [
                {"text": "Qu'est-ce qu'une pile ?", "accepted": ["LIFO"]},
                {"text": "Qu'est-ce qu'une file ?", "accepted": ["FIFO"]},
            ]
        },
    )
    written = _json.dumps({"questions": [{"text": "lifo"}, {"text": "pile"}]})
    assert grade_exercise(written, short, []).score == 2.0

    grids = Exercise(
        id=905, evaluation_id=1, position=3, title="Relier", statement="",
        language="c", points=4, starter_code="", kind="matching",
        settings={
            "_matching_salt": "sel",
            "questions": [
                {"text": "Complexités", "pairs": [{"left": "O(1)", "right": "constant"}]},
                {"text": "Structures", "pairs": [{"left": "pile", "right": "LIFO"}]},
            ],
        },
    )
    # Les jetons de la seconde grille lui sont propres : ceux de la première n'y valent rien.
    relié = _json.dumps(
        {
            "questions": [
                {"matches": {"0": token_for("sel", 0, 0)}},
                {"matches": {"0": token_for("sel", 0, 0)}},
            ]
        }
    )
    assert grade_exercise(relié, grids, []).score == 2.0


def _exercice_au_bareme():
    """Un exercice de C dont le barème mêle déclarations attendues et tests."""
    from app.models import Exercise

    return Exercise(
        id=902, evaluation_id=1, position=1, title="Fonctions", statement="", language="c",
        points=10, starter_code="", kind="code",
        settings={
            "criteria": [
                {
                    "id": "c1", "kind": "function", "points": 2, "name": "factorielle",
                    "params": [{"name": "n", "type": "int"}], "returns": "long",
                },
                {
                    "id": "c2", "kind": "function", "points": 2, "name": "somme",
                    "params": [{"name": "t", "type": "int[]"}], "returns": "int",
                },
                {"id": "c3", "kind": "variable", "points": 1, "name": "total", "vtype": "int",
                 "scope": "global"},
                {"id": "c4", "kind": "variable", "points": 1, "name": "i", "vtype": "int",
                 "scope": "local", "in_function": "main"},
                {"id": "c5", "kind": "struct", "points": 2, "name": "Point",
                 "fields": [{"name": "x", "type": "int"}, {"name": "y", "type": "int"}]},
            ]
        },
    )


def _tests_du_bareme():
    from app.models import TestCase, TestKind

    def case(identifier, cible, args, expected, name):
        return TestCase(
            id=identifier, exercise_id=902, position=identifier, name=name,
            kind=TestKind.OFFICIAL, target_id=cible, args=args, input_types=[],
            expected_type="long", stdin="", expected_stdout=expected, comparison="trim",
            points=0.5, timeout_ms=2000,
        )

    return [
        case(1, "c1", [5], "120", "5!"),
        case(2, "c1", [0], "1", "0!"),
        case(3, "c2", [[1, 2, 3]], "6", "trois valeurs"),
        case(4, "c2", [[]], "0", "tableau vide"),
    ]


CODE_JUSTE = """#include <stdio.h>
int total = 0;
struct Point { int x; int y; };
long factorielle(int n) { long r = 1; for (int k = 2; k <= n; k++) r *= k; return r; }
int somme(int t[], int n) { int s = 0; for (int k = 0; k < n; k++) s += t[k]; return s; }
int main(void) { int i = 3; printf("%ld", factorielle(i)); return 0; }
"""


def test_le_bareme_note_declarations_et_tests():
    """Chaque critère du barème pèse ses points : déclarations comme exécutions."""
    from app.grading.engine import grade_exercise

    outcome = grade_exercise(CODE_JUSTE, _exercice_au_bareme(), _tests_du_bareme())
    assert outcome.score == 10.0 and outcome.status.value == "ok"
    assert [d["category"] for d in outcome.tests] == ["declaration"] * 5 + ["test"] * 4
    assert all(d["passed"] for d in outcome.tests)
    # L'entrée est rendue lisible : l'enseignant voit l'appel qui a été joué.
    assert outcome.tests[5]["input"] == "factorielle(5)"


def test_une_declaration_absente_ne_coute_que_ses_points():
    """Retirer la variable globale ne fait perdre que le point de son critère."""
    from app.grading.engine import grade_exercise

    sans_total = CODE_JUSTE.replace("int total = 0;\n", "")
    outcome = grade_exercise(sans_total, _exercice_au_bareme(), _tests_du_bareme())
    assert outcome.score == 9.0
    manqué = [d for d in outcome.tests if not d["passed"]]
    assert len(manqué) == 1 and manqué[0]["expected"] == "int total (globale)"


def test_une_variable_locale_se_cherche_dans_le_source():
    """Le compilateur n'expose pas une variable locale : on la lit dans le code."""
    from app.grading.engine import grade_exercise

    renommée = CODE_JUSTE.replace("int i = 3;", "int compteur = 3;").replace(
        "factorielle(i)", "factorielle(compteur)"
    )
    outcome = grade_exercise(renommée, _exercice_au_bareme(), _tests_du_bareme())
    assert outcome.score == 9.0
    manqué = [d for d in outcome.tests if not d["passed"]]
    assert len(manqué) == 1 and manqué[0]["expected"] == "int i (dans main)"


def test_un_nom_en_commentaire_ne_vaut_pas_declaration():
    """Commentaires et chaînes sont retirés avant la recherche : pas de faux positif."""
    from app.grading.bareme import declares_variable

    critère = {"kind": "variable", "name": "i", "vtype": "int", "scope": "local",
               "in_function": "main"}
    triche = 'int main(void) { /* int i = 0; */ printf("int i = 0;"); return 0; }'
    assert declares_variable(triche, critère) is False
    assert declares_variable("int main(void) { int i = 0; return 0; }", critère) is True


def test_une_signature_fausse_ne_coute_que_son_critere():
    """La factorielle garde ses points quand la somme est mal déclarée."""
    from app.grading.engine import grade_exercise

    faux = CODE_JUSTE.replace("int somme(int t[], int n)", "double somme(int t[], int n)")
    outcome = grade_exercise(faux, _exercice_au_bareme(), _tests_du_bareme())
    # Perdus : le critère « somme » (2 pts) et ses deux tests (1 pt).
    assert outcome.score == 7.0
    réussis = {d["name"] for d in outcome.tests if d["passed"]}
    assert "5!" in réussis and "trois valeurs" not in réussis


def test_une_faute_de_syntaxe_est_signalee_une_seule_fois():
    """Un point-virgule oublié casse toute l'unité de compilation : on le dit une fois."""
    from app.grading.engine import grade_exercise

    cassé = CODE_JUSTE.replace("int s = 0;", "int s = 0")
    outcome = grade_exercise(cassé, _exercice_au_bareme(), _tests_du_bareme())
    assert outcome.score == 0.0 and outcome.status.value == "compile_error"
    assert outcome.tests == [] and outcome.compile_log


def test_un_test_de_programme_entier_passe_par_l_entree_standard():
    """Sans critère visé, les valeurs typées du test descendent sur l'entrée standard."""
    from app.grading.engine import grade_exercise
    from app.models import Exercise, TestCase, TestKind

    exercise = Exercise(
        id=903, evaluation_id=1, position=1, title="Somme lue", statement="", language="c",
        points=4, starter_code="", kind="code", settings={},
    )
    test = TestCase(
        id=1, exercise_id=903, position=1, name="12 + 8", kind=TestKind.OFFICIAL,
        target_id=None, args=[12, 8], input_types=["int", "int"], expected_type="int",
        stdin="", expected_stdout="20", comparison="trim", points=1, timeout_ms=2000,
    )
    code = '#include <stdio.h>\nint main(void){int a,b;scanf("%d %d",&a,&b);printf("%d",a+b);return 0;}\n'
    outcome = grade_exercise(code, exercise, [test])
    assert outcome.score == 4.0
    assert outcome.tests[0]["input"] == "12 · 8"


def test_une_structure_declaree_par_typedef_est_acceptee():
    """`typedef struct { … } Point;` satisfait le critère au même titre."""
    from app.grading.engine import grade_exercise
    from app.models import Exercise

    exercise = Exercise(
        id=904, evaluation_id=1, position=1, title="Point", statement="", language="c",
        points=2, starter_code="", kind="code",
        settings={"criteria": [{"id": "s", "kind": "struct", "points": 2, "name": "Point",
                                "fields": [{"name": "x", "type": "double"}]}]},
    )
    code = "typedef struct { double x; } Point;\nint main(void){ return 0; }\n"
    assert grade_exercise(code, exercise, []).score == 2.0


def test_le_bareme_fait_l_aller_retour_par_l_api(context):
    """Critères de déclaration et tests typés survivent à l'enregistrement."""
    t = auth(context["teacher"])
    eid = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Barème C", "language": "c", "duration_minutes": 30,
            "classroom_id": context["classroom"], "subject_id": context["subject"],
            "total_points": 10,
        },
    ).json()["id"]

    criteria = [
        {"id": "c1", "kind": "function", "points": 2, "name": "factorielle",
         "params": [{"name": "n", "type": "int"}], "returns": "long"},
        {"id": "c2", "kind": "variable", "points": 1, "name": "i", "vtype": "int",
         "scope": "local", "in_function": "main"},
    ]
    res = client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[{
            "title": "Factorielle", "statement": "", "language": "c", "points": 10,
            "kind": "code", "starter_code": "", "settings": {"criteria": criteria},
            "tests": [
                {"name": "5!", "target_id": "c1", "args": [5], "expected_type": "long",
                 "expected_stdout": "120", "points": 2},
                {"name": "lecture", "input_types": ["int", "int"], "args": [2, 3],
                 "expected_type": "int", "expected_stdout": "5", "points": 5},
            ],
        }],
    )
    assert res.status_code == 200, res.text
    exercise = res.json()["exercises"][0]
    assert exercise["settings"]["criteria"] == criteria
    appel, lecture = exercise["tests"]
    assert appel["target_id"] == "c1" and appel["args"] == [5] and appel["expected_type"] == "long"
    assert lecture["target_id"] is None and lecture["input_types"] == ["int", "int"]


def test_evaluation_bank(context):
    """Banque d'évaluations : mettre une épreuve en modèle, puis la redonner."""
    t = auth(context["teacher"])

    source = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Épreuve à réutiliser",
            "language": "python",
            "duration_minutes": 45,
            "classroom_id": context["classroom"],
            "subject_id": context["subject"],
            "total_points": 20,
        },
    ).json()
    client.put(
        f"/api/evaluations/{source['id']}/exercises",
        headers=t,
        json=[
            {
                "title": "Produit",
                "statement": "Afficher le produit de deux entiers.",
                "language": "python",
                "points": 20,
                "starter_code": "",
                "tests": [
                    {"name": "T1", "stdin": "2 3\n", "expected_stdout": "6", "points": 20}
                ],
            }
        ],
    )

    res = client.post(f"/api/evaluations/{source['id']}/save-as-template", headers=t)
    assert res.status_code == 201, res.text
    template = res.json()
    assert template["id"] != source["id"]
    assert template["classroom_id"] is None
    assert len(template["exercises"]) == 1
    assert len(template["exercises"][0]["tests"]) == 1

    listing = client.get("/api/evaluations/templates", headers=t).json()
    ids = [item["id"] for item in listing["items"]]
    assert template["id"] in ids
    assert source["id"] not in ids

    # Un modèle ne traîne pas dans la liste des épreuves de l'enseignant.
    evaluations = client.get("/api/evaluations", headers=t).json()
    assert template["id"] not in [item["id"] for item in evaluations["items"]]

    res = client.post(
        f"/api/evaluations/templates/{template['id']}/use",
        headers=t,
        json={"title": "Rattrapage", "classroom_id": context["classroom"]},
    )
    assert res.status_code == 201, res.text
    copy = res.json()
    assert copy["title"] == "Rattrapage"
    assert copy["status"] == "draft"
    assert copy["classroom_id"] == context["classroom"]
    assert copy["exercises"][0]["title"] == "Produit"
    assert copy["exercises"][0]["tests"][0]["expected_stdout"] == "6"
    # La copie est indépendante : elle ne partage ni ses exercices, ni ses tests.
    assert copy["exercises"][0]["id"] != template["exercises"][0]["id"]

    # Et elle réapparaît, elle, parmi les épreuves.
    evaluations = client.get("/api/evaluations", headers=t).json()
    assert copy["id"] in [item["id"] for item in evaluations["items"]]


def test_start_without_schedule_dates_the_evaluation(context):
    """Épreuve lancée sur place : l'heure du lancement lui sert de date."""
    t = auth(context["teacher"])
    evaluation = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Épreuve surprise",
            "language": "python",
            "duration_minutes": 20,
            "classroom_id": context["classroom"],
            "total_points": 10,
        },
    ).json()
    assert evaluation["scheduled_start"] is None
    client.put(
        f"/api/evaluations/{evaluation['id']}/exercises",
        headers=t,
        json=[
            {
                "title": "Somme",
                "statement": "Additionner.",
                "language": "python",
                "points": 10,
                "starter_code": "",
                "tests": [{"name": "T1", "stdin": "1 1\n", "expected_stdout": "2", "points": 10}],
            }
        ],
    )
    started = client.post(f"/api/evaluations/{evaluation['id']}/start", headers=t)
    assert started.status_code == 200, started.text
    body = started.json()
    assert body["scheduled_start"] is not None
    assert body["scheduled_start"] == body["started_at"]



def test_algorithme_du_cours_tableau_indice_depuis_un():
    """Le modèle du cours : chaînes accentuées, LIRE dans une case, tableau 1..N,
    boucle POUR à rebours et ECRIRE de plusieurs morceaux."""
    import json as _json

    from app.grading.engine import grade_exercise
    from app.models import Exercise, TestCase, TestKind

    document = {
        "nom": "SaisieAffichageNotes",
        "constantes": [{"nom": "MAX_NB_NOTES", "valeur": "500"}],
        "variables": [
            {"nom": "notes", "type": "tableau_reel", "taille": "MAX_NB_NOTES"},
            {"nom": "i", "type": "entier"},
            {"nom": "reponse", "type": "chaine"},
        ],
        "corps": [
            {"type": "affectation", "cible": "reponse", "expression": '"oui"'},
            {"type": "affectation", "cible": "i", "expression": "0"},
            {"type": "tantque", "condition": 'reponse = "oui" ET i < MAX_NB_NOTES', "corps": [
                {"type": "affectation", "cible": "i", "expression": "i + 1"},
                {"type": "lire", "cible": "notes[i]"},
                {"type": "lire", "cible": "reponse"},
            ]},
            {"type": "pour", "variable": "i", "debut": "i", "fin": "1", "pas": "-1", "corps": [
                {"type": "ecrire", "expression": '"note numéro ", i, " : ", notes[i]'},
            ]},
        ],
    }
    exercise = Exercise(
        id=903, evaluation_id=1, position=1, title="Notes", statement="", language="c",
        points=2, starter_code="", kind="algo",
        settings={"allowed_elements": ["constante", "declaration", "lire", "ecrire",
                                       "tantque", "pour", "affectation"]},
    )
    tests = [
        TestCase(id=1, exercise_id=903, position=1, name="deux notes", kind=TestKind.OFFICIAL,
                 stdin="12 oui 15.5 non", comparison="exact", points=2, timeout_ms=2000,
                 expected_stdout="note numéro 2 : 15.5\nnote numéro 1 : 12\n"),
    ]
    outcome = grade_exercise(_json.dumps(document), exercise, tests)
    assert outcome.score == 2.0, outcome


def test_annuler_une_evaluation_terminee(context):
    """Une épreuve close s'annule : elle reste chez l'enseignant, sort des résultats
    de l'apprenant, qui en est prévenu, et ne se publie plus."""
    t = auth(context["teacher"])
    s = auth(context["student"])

    eid = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": "Épreuve à annuler",
            "language": "python",
            "duration_minutes": 30,
            "classroom_id": context["classroom"],
            "total_points": 10,
        },
    ).json()["id"]
    client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[{"title": "Doubler", "language": "python", "points": 10,
               "tests": [{"name": "T1", "stdin": "4\n", "expected_stdout": "8", "points": 10}]}],
    )

    # Un brouillon ne s'annule pas : il se supprime.
    assert client.post(f"/api/evaluations/{eid}/cancel", headers=t).status_code == 409

    client.post(f"/api/evaluations/{eid}/publish", headers=t)
    client.post(f"/api/evaluations/{eid}/start", headers=t)
    client.post(f"/api/evaluations/{eid}/close", headers=t)
    assert any(r["evaluation_id"] == eid for r in client.get("/api/me/results", headers=s).json())

    # L'apprenant ne peut pas annuler.
    assert client.post(f"/api/evaluations/{eid}/cancel", headers=s).status_code == 403

    response = client.post(f"/api/evaluations/{eid}/cancel", headers=t)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"

    # Toujours dans l'historique de l'enseignant.
    corrected = client.get("/api/evaluations?group=corrected", headers=t).json()["items"]
    assert any(e["id"] == eid and e["status"] == "cancelled" for e in corrected)

    # Sorti des résultats de l'apprenant, copie fermée, notification reçue.
    assert all(r["evaluation_id"] != eid for r in client.get("/api/me/results", headers=s).json())
    assert client.get(f"/api/me/results/{eid}", headers=s).status_code == 403
    titres = [n["title"] for n in client.get("/api/me/notifications", headers=s).json()]
    assert "Évaluation annulée : Épreuve à annuler" in titres

    # Plus de publication possible.
    assert client.post(f"/api/evaluations/{eid}/validate", headers=t).status_code == 409


def test_register_creates_admin(context):
    me = client.get("/api/auth/me", headers=auth(context["admin"])).json()
    assert me["user"]["role"] == "admin"


def test_teacher_cannot_manage_establishment(context):
    t = auth(context["teacher"])
    assert client.get("/api/users", headers=t).status_code == 403
    res = client.post(
        "/api/users",
        headers=t,
        json={"email": "x@test.ci", "full_name": "Pirate", "role": "admin", "password": "motdepasse1"},
    )
    assert res.status_code == 403
    assert client.post("/api/classrooms", headers=t, json={"name": "X"}).status_code == 403
    assert client.get("/api/admin/audit", headers=t).status_code == 403
    assert client.get("/api/stats/overview", headers=t).status_code == 403


def test_admin_user_management(context):
    a = auth(context["admin"])
    me = client.get("/api/auth/me", headers=a).json()["user"]

    # Un e-mail est unique sur toute la plateforme.
    res = client.post(
        "/api/users",
        headers=a,
        json={"email": "PROF@test.ci", "full_name": "Doublon", "role": "teacher", "password": "motdepasse1"},
    )
    assert res.status_code == 409

    # Un étudiant créé directement dans sa classe.
    res = client.post(
        "/api/users",
        headers=a,
        json={
            "email": "etu2@test.ci",
            "full_name": "Second Étudiant",
            "role": "student",
            "password": "motdepasse1",
            "matricule": "INF002",
            "classroom_id": context["classroom"],
        },
    )
    assert res.status_code == 201, res.text
    student = res.json()
    listing = client.get(
        f"/api/users?role=student&classroom_id={context['classroom']}", headers=a
    ).json()
    names = {u["email"]: u for u in listing["items"]}
    assert names["etu2@test.ci"]["classrooms"] == ["L2 Test"]

    # L'administrateur ne se désactive pas lui-même.
    res = client.patch(f"/api/users/{me['id']}", headers=a, json={"is_active": False})
    assert res.status_code == 409

    # Mot de passe provisoire : il permet de se connecter.
    temp = client.post(f"/api/users/{student['id']}/reset-password", headers=a).json()["password"]
    res = client.post("/api/auth/login", json={"email": "etu2@test.ci", "password": temp})
    assert res.status_code == 200

    # Désactivé, le compte ne se connecte plus.
    client.patch(f"/api/users/{student['id']}", headers=a, json={"is_active": False})
    res = client.post("/api/auth/login", json={"email": "etu2@test.ci", "password": temp})
    assert res.status_code == 403

    client.delete(f"/api/classrooms/{context['classroom']}/students/{student['id']}", headers=a)
    students = client.get(f"/api/classrooms/{context['classroom']}/students", headers=a).json()
    assert student["id"] not in {s["id"] for s in students}


def test_admin_classrooms_and_subjects(context):
    a = auth(context["admin"])
    teacher = next(
        u for u in client.get("/api/users?role=teacher", headers=a).json()["items"]
        if u["email"] == "prof@test.ci"
    )
    classroom = client.post("/api/classrooms", headers=a, json={"name": "L3 Temp"}).json()
    subject = client.post("/api/subjects", headers=a, json={"name": "Réseaux"}).json()
    assert client.post("/api/subjects", headers=a, json={"name": "réseaux"}).status_code == 409

    res = client.post(
        f"/api/classrooms/{classroom['id']}/teachers",
        headers=a,
        json={"teacher_id": teacher["id"], "subject_id": subject["id"]},
    )
    assert res.status_code == 201, res.text
    assignment = res.json()
    assert assignment["subject_name"] == "Réseaux"
    listing = {c["id"]: c for c in client.get("/api/classrooms", headers=a).json()}
    assert listing[classroom["id"]]["teachers_count"] == 1

    res = client.patch(
        f"/api/classrooms/{classroom['id']}", headers=a, json={"name": "L3 Réseaux", "level": "L3"}
    )
    assert res.json()["name"] == "L3 Réseaux"

    # Une matière utilisée par une évaluation ne se supprime pas.
    assert client.delete(f"/api/subjects/{context['subject']}", headers=a).status_code == 409
    assert client.delete(f"/api/classrooms/{context['classroom']}", headers=a).status_code == 409

    assert client.delete(f"/api/subjects/{subject['id']}", headers=a).status_code == 204
    assert client.delete(f"/api/classrooms/{classroom['id']}", headers=a).status_code == 204


def test_admin_supervision(context):
    a = auth(context["admin"])
    overview = client.get("/api/stats/overview", headers=a).json()
    assert overview["admins"] == 1
    evaluations = client.get("/api/admin/evaluations", headers=a).json()
    assert evaluations["total"] >= 1
    assert evaluations["items"][0]["teacher_name"] == "Prof Test"
    audit = client.get("/api/admin/audit?action=user", headers=a).json()
    assert audit["total"] >= 2
    assert all(e["action"].startswith("user.") for e in audit["items"])
    res = client.patch("/api/admin/organization", headers=a, json={"name": "Test University 2"})
    assert res.json()["name"] == "Test University 2"


def test_notation_du_cours_d_algorithmique():
    """<>, virgule décimale, SELON, SINONSI, ECRIRE + CRLF, procédures (E)/(S)/(E/S),
    récursivité, tableaux à deux dimensions et enregistrements."""
    import json as _json
    import subprocess
    import sys

    from app.grading.algo import DECLARATIONS, ELEMENTS, AlgoError, transpile

    tout = list(ELEMENTS) + list(DECLARATIONS)

    def run(doc, stdin=""):
        source = transpile(_json.dumps(doc), tout, saut_de_ligne=False)
        return subprocess.run([sys.executable, "-c", source], input=stdin,
                              capture_output=True, text=True, timeout=10).stdout

    v = lambda nom, t="entier", **k: {"nom": nom, "type": t, **k}  # noqa: E731
    a = lambda c, e: {"type": "affectation", "cible": c, "expression": e}  # noqa: E731
    e = lambda x: {"type": "ecrire", "expression": x}  # noqa: E731

    cinema = {"variables": [v("jour", "chaine"), v("etud", "caractere"), v("prix", "reel")],
              "corps": [{"type": "lire", "cible": "jour, etud"},
                        {"type": "si", "condition": "etud = 'o'", "alors": [a("prix", "4,5")],
                         "sinonsi": [{"condition": 'jour <> "sa"', "corps": [a("prix", "4,5")]}],
                         "sinon": [a("prix", "7")]}, e("prix")]}
    assert run(cinema, "sa n") == "7" and run(cinema, "lu n") == "4.5"

    triangle = {"variables": [v("n"), v("i"), v("j")], "corps": [
        {"type": "lire", "cible": "n"},
        {"type": "pour", "variable": "i", "debut": "1", "fin": "n", "corps": [
            {"type": "pour", "variable": "j", "debut": "1", "fin": "n-i+1", "corps": [e("'a'")]},
            e("CRLF")]}]}
    assert run(triangle, "3") == "aaa\naa\na\n"

    vote = {"variables": [v("c", "caractere"), v("oui")], "corps": [
        {"type": "repeter", "condition": "c = 'X'", "corps": [
            {"type": "lire", "cible": "c"},
            {"type": "selon", "expression": "c", "cas": [{"valeurs": "'O'", "corps": [a("oui", "oui + 1")]}]}]},
        e('"oui : " + oui')]}
    assert run(vote, "O N O X") == "oui : 2"

    tri = {"variables": [v("c1", "caractere"), v("c2", "caractere")], "corps": [
        {"type": "lire", "cible": "c1, c2"},
        {"type": "appel", "nom": "échanger", "arguments": "c1, c2"}, e("c1, c2")],
        "sousProgrammes": [{"type": "procedure", "nom": "échanger", "parametres": [
            {"nom": "x", "type": "CARACTERE", "mode": "ES"}, {"nom": "y", "type": "CARACTERE", "mode": "ES"}],
            "variables": [v("aux", "caractere")], "corps": [a("aux", "x"), a("x", "y"), a("y", "aux")]}]}
    assert run(tri, "A B") == "BA"

    fact = {"variables": [v("n")], "corps": [{"type": "lire", "cible": "n"}, e("fact(n)")],
            "sousProgrammes": [{"type": "fonction", "nom": "fact", "parametres": [{"nom": "k", "type": "ENTIER"}],
                                "typeRetour": "ENTIER", "corps": [
                {"type": "si", "condition": "k <= 1", "alors": [{"type": "retour", "expression": "1"}],
                 "sinon": [{"type": "retour", "expression": "k * fact(k - 1)"}]}]}]}
    assert run(fact, "5") == "120"

    classe = {"types": [{"nom": "Etudiant", "champs": [{"nom": "nom", "type": "CHAINE"},
                                                      {"nom": "notes", "type": "TABLEAU[1..2] DE REEL"}]}],
              "variables": [v("t", "tableau_nomme", cible="Etudiant", taille="2"),
                            v("m", "tableau_entier", taille="2", taille2="2")],
              "corps": [{"type": "lire", "cible": "t[2].nom, t[2].notes[1]"}, a("m[2][1]", "7"),
                        e('t[2].nom, " ", t[2].notes[1] * 2, " ", m[2][1]')]}
    assert run(classe, "Awa 7,5") == "Awa 15 7"

    for dangereux in ['"a".format', "x.__class__", "_donnees"]:
        with pytest.raises(AlgoError):
            transpile(_json.dumps({"corps": [e(dangereux)]}), tout)


# ── Envoi du travail d'un étudiant qui n'a pas soumis ─────────────────────


def _running_exam(context, title: str) -> tuple[int, int]:
    t = auth(context["teacher"])
    eid = client.post(
        "/api/evaluations",
        headers=t,
        json={
            "title": title,
            "language": "python",
            "duration_minutes": 30,
            "classroom_id": context["classroom"],
            "subject_id": context["subject"],
            "total_points": 10,
            "rules": {"allow_early_submit": False},
        },
    ).json()["id"]
    exercise = client.put(
        f"/api/evaluations/{eid}/exercises",
        headers=t,
        json=[{"title": "Somme", "language": "python", "points": 10, "tests": []}],
    ).json()["exercises"][0]["id"]
    client.post(f"/api/evaluations/{eid}/publish", headers=t)
    assert client.post(f"/api/evaluations/{eid}/start", headers=t).status_code == 200
    assert client.get(f"/api/me/evaluations/{eid}", headers=auth(context["student"])).status_code == 200
    return eid, exercise


def _shift_closure(eid: int, seconds_ago: int) -> None:
    """Fait comme si l'épreuve avait été close il y a `seconds_ago` secondes."""
    from datetime import timedelta

    from app.models import Evaluation, Participation, utcnow

    db = SessionLocal()
    evaluation = db.get(Evaluation, eid)
    moment = utcnow() - timedelta(seconds=seconds_ago)
    evaluation.closed_at = moment
    db.execute(
        Participation.__table__.update()
        .where(Participation.evaluation_id == eid)
        .values(frozen_at=moment)
    )
    db.commit()
    db.close()


def _expire(eid: int, seconds_ago: int) -> None:
    """Place l'échéance de l'épreuve dans le passé, sans que personne ne l'ait constatée."""
    from datetime import timedelta

    from app.models import Evaluation, utcnow

    db = SessionLocal()
    db.get(Evaluation, eid).ends_at = utcnow() - timedelta(seconds=seconds_ago)
    db.commit()
    db.close()


def test_status_pulse_follows_extension_and_closure(context):
    t, s = auth(context["teacher"]), auth(context["student"])
    eid, _ = _running_exam(context, "Pouls de l'épreuve")
    pulse = client.get(f"/api/me/evaluations/{eid}/status", headers=s).json()
    assert pulse["status"] == "running" and pulse["seconds_left"] > 0 and not pulse["frozen"]

    before = pulse["seconds_left"]
    client.post(f"/api/evaluations/{eid}/extend", headers=t, json={"extra_minutes": 10})
    assert client.get(f"/api/me/evaluations/{eid}/status", headers=s).json()["seconds_left"] >= before + 590

    client.post(f"/api/evaluations/{eid}/close", headers=t)
    pulse = client.get(f"/api/me/evaluations/{eid}/status", headers=s).json()
    assert pulse["status"] == "closed" and pulse["frozen"]
    assert pulse["upload_seconds_left"] > 0


def test_teacher_closure_keeps_unfinished_work(context):
    """L'enseignant clôt avant la fin : le dernier état de l'étudiant doit arriver."""
    t, s = auth(context["teacher"]), auth(context["student"])
    eid, exercise = _running_exam(context, "Clôture anticipée")
    client.put(f"/api/me/evaluations/{eid}/exercises/{exercise}", headers=s,
               json={"code": "print(1", "version": 0})
    client.post(f"/api/evaluations/{eid}/close", headers=t)

    final = client.put(f"/api/me/evaluations/{eid}/exercises/{exercise}", headers=s,
                       json={"code": "print(1)", "version": 1})
    assert final.status_code == 200, final.text
    assert final.json()["closed"] is True

    # Corriger maintenant noterait une copie peut-être incomplète.
    refused = client.post(f"/api/evaluations/{eid}/corrections", headers=t)
    assert refused.status_code == 409 and "relancez" in refused.json()["detail"]

    _shift_closure(eid, 10_000)
    assert client.put(f"/api/me/evaluations/{eid}/exercises/{exercise}", headers=s,
                      json={"code": "print(2)", "version": 2}).status_code == 409
    assert client.post(f"/api/evaluations/{eid}/corrections", headers=t).status_code == 202

    detail = client.get(f"/api/evaluations/{eid}/results", headers=t)
    assert detail.status_code == 200
    from app.models import Submission

    db = SessionLocal()
    code = db.scalar(Submission.__table__.select().with_only_columns(Submission.code)
                     .where(Submission.exercise_id == exercise))
    db.close()
    assert code == "print(1)"


def test_final_upload_after_expiry_is_measured_from_the_deadline(context):
    s = auth(context["student"])

    # Échéance passée depuis 30 s : l'envoi final est dans la fenêtre de tolérance.
    eid, exercise = _running_exam(context, "Fin du temps récente")
    _expire(eid, 30)
    res = client.put(f"/api/me/evaluations/{eid}/exercises/{exercise}", headers=s,
                     json={"code": "print('fini')", "version": 0})
    assert res.status_code == 200, res.text
    assert res.json()["closed"] is True and res.json()["seconds_left"] == 0

    # Échéance passée depuis une heure, jamais constatée : la fenêtre est close,
    # même si c'est cette requête qui découvre la fin de l'épreuve.
    eid, exercise = _running_exam(context, "Fin du temps ancienne")
    _expire(eid, 3600)
    res = client.put(f"/api/me/evaluations/{eid}/exercises/{exercise}", headers=s,
                     json={"code": "print('trop tard')", "version": 0})
    assert res.status_code == 409


def test_no_upload_once_correction_started(context):
    t, s = auth(context["teacher"]), auth(context["student"])
    eid, exercise = _running_exam(context, "Correction lancée")
    client.post(f"/api/evaluations/{eid}/close", headers=t)
    _shift_closure(eid, 10_000)
    assert client.post(f"/api/evaluations/{eid}/corrections", headers=t).status_code == 202
    # Même revenue dans la fenêtre, une copie ne change plus sous la correction.
    _shift_closure(eid, 5)
    assert client.put(f"/api/me/evaluations/{eid}/exercises/{exercise}", headers=s,
                      json={"code": "print(3)", "version": 0}).status_code == 409


def test_scheduler_closes_expired_sessions(context):
    import asyncio

    from app.scheduler import _tick

    eid, _ = _running_exam(context, "Clôture par le planificateur")
    _expire(eid, 5)
    asyncio.run(_tick())
    monitor = client.get(f"/api/evaluations/{eid}/session", headers=auth(context["teacher"]))
    assert monitor.json()["status"] == "closed"


def test_communaute_publier_recuperer_et_moderer(context):
    """Communauté : un sujet publié par un établissement resservi par un autre."""
    t, a = auth(context["teacher"]), auth(context["admin"])

    source = client.post(
        "/api/evaluations",
        headers=t,
        json={"title": "Sujet partagé", "language": "python", "duration_minutes": 60,
              "subject_id": context["subject"], "total_points": 20},
    ).json()
    client.put(
        f"/api/evaluations/{source['id']}/exercises",
        headers=t,
        json=[{"title": "Somme", "language": "python", "points": 20,
               "tests": [{"name": "T1", "stdin": "1 2\n", "expected_stdout": "3",
                          "points": 20}]}],
    )
    # Seule la banque se publie : une épreuve ordinaire est refusée.
    sources = client.get("/api/community/sources", headers=t).json()
    assert source["id"] not in [e["id"] for e in sources["evaluations"]]
    res = client.post("/api/community", headers=t,
                      json={"source_type": "evaluation", "source_id": source["id"]})
    assert res.status_code == 404

    template = client.post(f"/api/evaluations/{source['id']}/save-as-template", headers=t).json()
    sources = client.get("/api/community/sources", headers=t).json()
    assert template["id"] in [e["id"] for e in sources["evaluations"]]

    res = client.post(
        "/api/community",
        headers=t,
        json={"source_type": "evaluation", "source_id": template["id"],
              "description": "Contrôle de rentrée", "tags": ["boucles"]},
    )
    assert res.status_code == 201, res.text
    subject_item = res.json()
    assert subject_item["item_type"] == "subject"
    assert subject_item["exercises_count"] == 1
    assert subject_item["subject_name"] == "Algo"

    # Publier est un instantané : retoucher l'original ne change pas la publication.
    client.put(f"/api/evaluations/{template['id']}/exercises", headers=t, json=[])
    detail = client.get(f"/api/community/{subject_item['id']}", headers=t).json()
    assert detail["content"]["exercises"][0]["tests"][0]["expected_stdout"] == "3"

    bank = client.post(
        "/api/bank/exercises",
        headers=t,
        json={"title": "Maximum", "language": "c", "points": 4,
              "tests": [{"name": "T", "stdin": "3 9\n", "expected_stdout": "9", "points": 4}]},
    ).json()
    exercise_item = client.post(
        "/api/community", headers=t,
        json={"source_type": "bank_exercise", "source_id": bank["id"]},
    ).json()
    assert exercise_item["title"] == "Maximum"

    # Un autre établissement voit la communauté et en tire des copies.
    other_admin = client.post(
        "/api/auth/register",
        json={"organization_name": "Autre École", "full_name": "Admin Deux",
              "email": "admin2@autre.ci", "password": "motdepasse1"},
    ).json()["access_token"]
    client.post("/api/users", headers=auth(other_admin),
                json={"email": "prof2@autre.ci", "full_name": "Prof Deux", "role": "teacher",
                      "password": "motdepasse1"})
    other = auth(client.post("/api/auth/login", json={
        "email": "prof2@autre.ci", "password": "motdepasse1"}).json()["access_token"])

    listing = client.get("/api/community", headers=other).json()
    ids = [item["id"] for item in listing["items"]]
    assert subject_item["id"] in ids and exercise_item["id"] in ids
    assert all(not item["can_delete"] for item in listing["items"])
    assert client.get("/api/community?item_type=exercise", headers=other).json()["total"] >= 1

    # On ne publie pas le travail d'un autre établissement.
    res = client.post("/api/community", headers=other,
                      json={"source_type": "bank_exercise", "source_id": bank["id"]})
    assert res.status_code == 404

    res = client.post(f"/api/community/{exercise_item['id']}/to-bank", headers=other)
    assert res.status_code == 201, res.text
    assert res.json()["target"] == "bank_exercise"
    copy = client.get(f"/api/bank/exercises/{res.json()['id']}", headers=other).json()
    assert copy["tests"][0]["expected_stdout"] == "9"

    res = client.post(f"/api/community/{subject_item['id']}/to-bank", headers=other)
    assert res.json()["target"] == "template"
    templates = client.get("/api/evaluations/templates", headers=other).json()
    assert res.json()["id"] in [item["id"] for item in templates["items"]]

    res = client.post(f"/api/community/{subject_item['id']}/use", headers=other,
                      json={"title": "Contrôle repris"})
    assert res.status_code == 201, res.text
    evaluation = client.get(f"/api/evaluations/{res.json()['evaluation_id']}",
                            headers=other).json()
    assert evaluation["status"] == "draft"
    assert evaluation["title"] == "Contrôle repris"
    assert evaluation["subject_id"] is None  # « Algo » n'existe pas chez eux
    assert evaluation["exercises"][0]["tests"][0]["expected_stdout"] == "3"
    assert client.get(f"/api/community/{subject_item['id']}", headers=other).json()["uses"] == 2

    # La recherche couvre les mots-clés ; « les plus repris » passe en tête.
    found = client.get("/api/community?q=boucles", headers=other).json()
    assert [item["id"] for item in found["items"]] == [subject_item["id"]]
    popular = client.get("/api/community?sort=popular", headers=other).json()["items"]
    assert popular[0]["id"] == subject_item["id"]

    # L'administration publie et modère ce qui vient de son établissement.
    assert client.post(f"/api/community/{exercise_item['id']}/use", headers=a,
                       json={}).status_code == 403
    assert client.delete(f"/api/community/{subject_item['id']}",
                         headers=auth(other_admin)).status_code == 403
    assert client.delete(f"/api/community/{subject_item['id']}", headers=a).status_code == 204
    assert client.delete(f"/api/community/{exercise_item['id']}", headers=t).status_code == 204
