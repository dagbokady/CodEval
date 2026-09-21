"""Enseignant inscrit seul : espace personnel, limite de classes, code de classe."""

from __future__ import annotations

import os
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault(
    "CODEVAL_DATABASE_URL",
    os.environ.get(
        "CODEVAL_TEST_DATABASE_URL",
        "postgresql+psycopg://codeval:codeval@localhost:5432/codeval_test",
    ),
)
os.environ.setdefault("CODEVAL_SECRET_KEY", "test-secret-key-with-enough-entropy")

from app.db import Base, SessionLocal, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Classroom, utcnow  # noqa: E402
from app.rate_limit import limiter  # noqa: E402

client = TestClient(app)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def teacher() -> str:
    Base.metadata.drop_all(engine)
    init_db()
    res = client.post(
        "/api/auth/register-teacher",
        json={"full_name": "Jean Koné", "email": "kone@perso.ci", "password": "motdepasse1"},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["user"]["role"] == "teacher"
    assert body["organization"] == "Espace de Jean Koné"
    assert body["organization_kind"] == "personal"
    return body["access_token"]


def test_l_enseignant_gere_lui_meme_ses_classes_dans_la_limite_de_deux(teacher):
    plan = client.get("/api/plan", headers=auth(teacher)).json()
    assert plan == {
        "kind": "personal",
        "plan": "free",
        "limits": {"classrooms": 2},
        "usage": {"classrooms": 0},
    }
    for name in ("L1 Info", "L2 Info"):
        res = client.post("/api/classrooms", headers=auth(teacher), json={"name": name})
        assert res.status_code == 201, res.text
    res = client.post("/api/classrooms", headers=auth(teacher), json={"name": "L3 Info"})
    assert res.status_code == 402
    assert "2 classes" in res.json()["detail"]
    assert client.get("/api/plan", headers=auth(teacher)).json()["usage"] == {"classrooms": 2}

    # Il crée aussi ses matières, sans administration au-dessus de lui.
    res = client.post("/api/subjects", headers=auth(teacher), json={"name": "Algorithmique"})
    assert res.status_code == 201


def test_un_etablissement_n_a_pas_de_limite():
    res = client.post(
        "/api/auth/register",
        json={
            "organization_name": "Lycée Sans Limite",
            "full_name": "Admin",
            "email": "admin@lycee.ci",
            "password": "motdepasse1",
        },
    )
    admin = res.json()["access_token"]
    assert res.json()["organization_kind"] == "institution"
    for i in range(3):
        res = client.post("/api/classrooms", headers=auth(admin), json={"name": f"C{i}"})
        assert res.status_code == 201
    assert client.get("/api/plan", headers=auth(admin)).json()["limits"] is None

    # Un enseignant d'établissement ne crée pas de classe : l'administration s'en charge.
    client.post(
        "/api/users",
        headers=auth(admin),
        json={"email": "prof@lycee.ci", "full_name": "Prof", "role": "teacher",
              "password": "motdepasse1"},
    )
    prof = client.post(
        "/api/auth/login", json={"email": "prof@lycee.ci", "password": "motdepasse1"}
    ).json()["access_token"]
    res = client.post("/api/classrooms", headers=auth(prof), json={"name": "C9"})
    assert res.status_code == 403


def test_l_etudiant_entre_par_le_code_puis_se_connecte(teacher):
    limiter._attempts.clear()
    classroom = client.get("/api/classrooms", headers=auth(teacher)).json()[0]
    cid = classroom["id"]

    res = client.post(f"/api/classrooms/{cid}/join-code", headers=auth(teacher), json={})
    assert res.status_code == 200, res.text
    code = res.json()["join_code"]
    assert len(code) == 8
    detail = client.get(f"/api/classrooms/{cid}", headers=auth(teacher)).json()
    assert detail["join_code"] == code

    # Le code se tape comme on le lit au tableau : minuscules et tiret passent.
    typed = f"{code[:4]}-{code[4:]}".lower()
    preview = client.get(f"/api/join/{typed}")
    assert preview.status_code == 200
    assert preview.json()["classroom_name"] == classroom["name"]
    assert preview.json()["organization_name"] == "Espace de Jean Koné"

    res = client.post(
        "/api/join",
        json={"code": typed, "full_name": "Awa Traoré", "email": "awa@etu.ci",
              "password": "motdepasse1"},
    )
    assert res.status_code == 201, res.text
    assert res.json()["user"]["role"] == "student"
    student = res.json()["access_token"]
    assert [c["id"] for c in client.get("/api/me/classrooms", headers=auth(student)).json()] == [cid]

    # L'étudiant ne lit pas le code de sa propre classe.
    assert client.get(f"/api/classrooms/{cid}", headers=auth(student)).json()["join_code"] is None

    # Une fois inscrit, il n'a plus besoin du code : il se connecte.
    res = client.post("/api/auth/login", json={"email": "awa@etu.ci", "password": "motdepasse1"})
    assert res.status_code == 200

    # Même e-mail une seconde fois : on l'envoie vers la connexion.
    res = client.post(
        "/api/join",
        json={"code": code, "full_name": "Awa", "email": "AWA@etu.ci", "password": "motdepasse1"},
    )
    assert res.status_code == 409

    # Il rejoint la seconde classe de l'enseignant depuis son espace.
    other = client.get("/api/classrooms", headers=auth(teacher)).json()[1]["id"]
    other_code = client.post(
        f"/api/classrooms/{other}/join-code", headers=auth(teacher), json={"expires_in_days": 7}
    ).json()["join_code"]
    res = client.post("/api/me/classrooms/join", headers=auth(student), json={"code": other_code})
    assert res.status_code == 200
    assert len(client.get("/api/me/classrooms", headers=auth(student)).json()) == 2

    # Changer le code tue l'ancien, sans sortir les inscrits de la classe.
    new_code = client.post(
        f"/api/classrooms/{cid}/join-code", headers=auth(teacher), json={}
    ).json()["join_code"]
    assert new_code != code
    assert client.get(f"/api/join/{code}").status_code == 404
    students = client.get(f"/api/classrooms/{cid}/students", headers=auth(teacher)).json()
    assert [s["email"] for s in students] == ["awa@etu.ci"]

    # Fermer le code : plus personne n'entre.
    res = client.delete(f"/api/classrooms/{cid}/join-code", headers=auth(teacher))
    assert res.status_code == 204
    assert client.get(f"/api/join/{new_code}").status_code == 404

    # L'enseignant peut retirer un apprenant de sa classe.
    sid = students[0]["id"]
    res = client.delete(f"/api/classrooms/{cid}/students/{sid}", headers=auth(teacher))
    assert res.status_code == 204


def test_un_code_expire_ne_sert_plus(teacher):
    limiter._attempts.clear()
    cid = client.get("/api/classrooms", headers=auth(teacher)).json()[0]["id"]
    code = client.post(
        f"/api/classrooms/{cid}/join-code", headers=auth(teacher), json={"expires_in_days": 1}
    ).json()["join_code"]
    with SessionLocal() as db:
        db.get(Classroom, cid).join_code_expires_at = utcnow() - timedelta(minutes=1)
        db.commit()
    assert client.get(f"/api/join/{code}").status_code == 404


def test_deviner_un_code_finit_par_etre_bloque():
    limiter._attempts.clear()
    for _ in range(5):
        assert client.get("/api/join/ZZZZZZZZ").status_code == 404
    assert client.get("/api/join/ZZZZZZZZ").status_code == 429
    limiter._attempts.clear()


def test_seul_le_personnel_gere_le_code(teacher):
    limiter._attempts.clear()
    cid = client.get("/api/classrooms", headers=auth(teacher)).json()[0]["id"]
    code = client.post(
        f"/api/classrooms/{cid}/join-code", headers=auth(teacher), json={}
    ).json()["join_code"]
    student = client.post(
        "/api/join",
        json={"code": code, "full_name": "Yao", "email": "yao@etu.ci", "password": "motdepasse1"},
    ).json()["access_token"]
    res = client.post(f"/api/classrooms/{cid}/join-code", headers=auth(student), json={})
    assert res.status_code == 403
    res = client.post("/api/classrooms", headers=auth(student), json={"name": "X"})
    assert res.status_code == 403
