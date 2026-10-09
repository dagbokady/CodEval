"""Enseignant inscrit seul : espace personnel, limite de classes, code de classe."""

from __future__ import annotations

import os
import re
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
# Le .env local peut couper la vérification des e-mails : les tests la veulent.
os.environ["CODEVAL_EMAIL_VERIFICATION"] = "true"

from app import email_verification  # noqa: E402
from app.db import Base, SessionLocal, engine, init_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Classroom, utcnow  # noqa: E402
from app.rate_limit import limiter  # noqa: E402
from app.security import create_join_token  # noqa: E402

client = TestClient(app)

# Les e-mails partent dans cette boîte : adresse -> dernier code reçu.
MAILBOX: dict[str, str] = {}


def _fake_send(to, subject, html, text=None, preheader=""):
    MAILBOX[to] = re.search(r"\b(\d{6})\b", text).group(1)
    return True


email_verification.mail_configured = lambda: True
email_verification.send_email = _fake_send


def email_code(email: str) -> str:
    """Premier temps de l'inscription : demande le code et le lit dans la boîte."""
    from app.models import EmailVerification

    # Le délai entre deux envois ne concerne pas les tests.
    db = SessionLocal()
    try:
        db.query(EmailVerification).filter_by(email=email.lower()).delete()
        db.commit()
    finally:
        db.close()
    res = client.post("/api/auth/email-code", json={"email": email})
    assert res.status_code == 200, res.text
    return MAILBOX[email.lower()]


def create_admin(org_name: str, full_name: str, email: str) -> str:
    """L'administration naît du script de mise en place, pas d'une inscription."""
    from app.exports import slugify
    from app.models import Organization, Role, User
    from app.security import hash_password

    db = SessionLocal()
    try:
        org = Organization(name=org_name, slug=slugify(org_name), settings={})
        db.add(org)
        db.flush()
        db.add(User(organization_id=org.id, email=email, full_name=full_name, role=Role.ADMIN,
                    password_hash=hash_password("motdepasse1")))
        db.commit()
    finally:
        db.close()
    res = client.post("/api/auth/login", json={"email": email, "password": "motdepasse1"})
    assert res.status_code == 200, res.text
    return res.json()["access_token"]


# Un pixel PNG : la plus petite photo valide.
PHOTO = (
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg=="
)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def teacher() -> str:
    Base.metadata.drop_all(engine)
    init_db()
    res = client.post(
        "/api/auth/register-teacher",
        json={"full_name": "Jean Koné", "email": "kone@perso.ci", "password": "motdepasse1",
              "email_code": "000000"},
    )
    assert res.status_code == 422, "la photo est obligatoire"
    res = client.post(
        "/api/auth/register-teacher",
        json={"full_name": "Jean Koné", "email": "kone@perso.ci", "password": "motdepasse1",
              "photo": "data:text/plain;base64,aGVsbG8=", "email_code": "000000"},
    )
    assert res.status_code == 422, "une photo doit être une image"
    res = client.post(
        "/api/auth/register-teacher",
        json={"full_name": "Jean Koné", "email": "kone@perso.ci", "password": "motdepasse1",
              "photo": PHOTO, "gender": "F", "email_code": email_code("kone@perso.ci")},
    )
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["user"]["role"] == "teacher"
    assert body["user"]["photo"] == PHOTO
    assert body["user"]["gender"] == "F"
    assert body["organization"] == "Espace de Jean Koné"
    assert body["organization_kind"] == "personal"
    return body["access_token"]


def test_l_adresse_est_confirmee_par_un_code_avant_l_inscription(teacher):
    signup = {"full_name": "Ama Yao", "email": "ama@perso.ci", "password": "motdepasse1",
              "photo": PHOTO, "gender": "F"}

    # Sans code demandé, ou avec un faux, aucun compte n'est créé.
    res = client.post("/api/auth/register-teacher", json={**signup, "email_code": "123456"})
    assert res.status_code == 400
    code = email_code("ama@perso.ci")
    wrong = "000000" if code != "000000" else "111111"
    res = client.post("/api/auth/register-teacher", json={**signup, "email_code": wrong})
    assert res.status_code == 400
    res = client.post("/api/auth/login", json={"email": "ama@perso.ci", "password": "motdepasse1"})
    assert res.status_code == 401

    # On ne redemande pas un code dans la minute.
    res = client.post("/api/auth/email-code", json={"email": "ama@perso.ci"})
    assert res.status_code == 429

    # Le bon code crée le compte, et ne sert qu'une fois.
    res = client.post("/api/auth/register-teacher", json={**signup, "email_code": code})
    assert res.status_code == 201, res.text
    res = client.post("/api/auth/email-code", json={"email": "AMA@perso.ci"})
    assert res.status_code == 409, "l'adresse a déjà un compte"


def test_trop_d_essais_invalident_le_code():
    code = email_code("essais@perso.ci")
    wrong = "000000" if code != "000000" else "111111"
    signup = {"full_name": "Essai", "email": "essais@perso.ci", "password": "motdepasse1",
              "photo": PHOTO, "gender": "M"}
    for _ in range(5):
        res = client.post("/api/auth/register-teacher", json={**signup, "email_code": wrong})
        assert res.status_code == 400
    res = client.post("/api/auth/register-teacher", json={**signup, "email_code": code})
    assert res.status_code == 400
    assert "nouveau code" in res.json()["detail"]


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
    res = client.post("/api/subjects", headers=auth(teacher), json={"name": "Algorithmique", "language": "algo"})
    assert res.status_code == 201


def test_un_etablissement_n_a_pas_de_limite():
    admin = create_admin("Lycée Sans Limite", "Admin", "admin@lycee.ci")
    for i in range(3):
        res = client.post("/api/classrooms", headers=auth(admin), json={"name": f"C{i}"})
        assert res.status_code == 201
    assert client.get("/api/plan", headers=auth(admin)).json()["limits"] is None

    # Un enseignant d'établissement crée sa classe et la gère ; ses collègues la
    # voient sans pouvoir la modifier, l'administration garde la main.
    profs = []
    for email in ("prof@lycee.ci", "collegue@lycee.ci"):
        client.post(
            "/api/users",
            headers=auth(admin),
            json={"email": email, "full_name": "Prof", "role": "teacher",
                  "password": "motdepasse1"},
        )
        profs.append(client.post(
            "/api/auth/login", json={"email": email, "password": "motdepasse1"}
        ).json()["access_token"])
    prof, collegue = profs
    res = client.post("/api/classrooms", headers=auth(prof), json={"name": "C9"})
    assert res.status_code == 201, res.text
    cid = res.json()["id"]
    assert client.get(f"/api/classrooms/{cid}", headers=auth(prof)).json()["can_manage"] is True
    assert client.get(f"/api/classrooms/{cid}", headers=auth(collegue)).json()["can_manage"] is False
    renommer = {"name": "C9 bis"}
    assert client.patch(f"/api/classrooms/{cid}", headers=auth(collegue), json=renommer).status_code == 403
    assert client.patch(f"/api/classrooms/{cid}", headers=auth(prof), json=renommer).status_code == 200
    assert client.patch(f"/api/classrooms/{cid}", headers=auth(admin), json=renommer).status_code == 200


def test_l_etudiant_entre_par_le_code_puis_se_connecte(teacher):
    limiter._attempts.clear()
    classroom = client.get("/api/classrooms", headers=auth(teacher)).json()[0]
    cid = classroom["id"]

    res = client.post(f"/api/classrooms/{cid}/join-code", headers=auth(teacher), json={})
    assert res.status_code == 200, res.text
    code = res.json()["join_code"]
    assert len(code) == 12
    detail = client.get(f"/api/classrooms/{cid}", headers=auth(teacher)).json()
    assert detail["join_code"] == code

    # Le code se tape comme on le lit au tableau : minuscules et tiret passent.
    typed = f"{code[:4]}-{code[4:8]}-{code[8:]}".lower()
    preview = client.get(f"/api/join/{typed}")
    assert preview.status_code == 200
    assert preview.json()["classroom_name"] == classroom["name"]
    assert preview.json()["organization_name"] == "Espace de Jean Koné"

    res = client.post(
        "/api/join",
        json={"code": typed, "full_name": "Awa Traoré", "email": "awa@etu.ci",
              "password": "motdepasse1", "matricule": "  ", "photo": PHOTO,
              "gender": "F", "email_code": "000000"},
    )
    assert res.status_code == 422, "le matricule est obligatoire"
    res = client.post(
        "/api/join",
        json={"code": typed, "full_name": "Awa Traoré", "email": "awa@etu.ci",
              "password": "motdepasse1", "matricule": "ETU-001", "gender": "F",
              "email_code": "000000"},
    )
    assert res.status_code == 422, "la photo est obligatoire"
    res = client.post(
        "/api/join",
        json={"code": typed, "full_name": "Awa Traoré", "email": "awa@etu.ci",
              "password": "motdepasse1", "matricule": "ETU-001", "photo": PHOTO, "gender": "F",
              "email_code": email_code("awa@etu.ci")},
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
        json={"code": code, "full_name": "Awa", "email": "AWA@etu.ci", "password": "motdepasse1",
              "matricule": "ETU-001", "photo": PHOTO, "gender": "M", "email_code": "000000"},
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


def test_le_lien_d_invitation_expire(teacher):
    limiter._attempts.clear()
    cid = client.get("/api/classrooms", headers=auth(teacher)).json()[0]["id"]
    client.delete(f"/api/classrooms/{cid}/join-code", headers=auth(teacher))
    # Pas de lien sans code ouvert : le lien s'adosse au code.
    res = client.post(f"/api/classrooms/{cid}/join-link", headers=auth(teacher), json={})
    assert res.status_code == 409

    client.post(f"/api/classrooms/{cid}/join-code", headers=auth(teacher), json={})
    res = client.post(
        f"/api/classrooms/{cid}/join-link", headers=auth(teacher), json={"expires_in_hours": 2}
    )
    assert res.status_code == 200, res.text
    token = res.json()["token"]
    assert client.get(f"/api/join/link/{token}").status_code == 200

    res = client.post(
        "/api/join",
        json={"token": token, "full_name": "Koffi", "email": "koffi@etu.ci",
              "password": "motdepasse1", "matricule": "ETU-003", "photo": PHOTO, "gender": "M",
              "email_code": email_code("koffi@etu.ci")},
    )
    assert res.status_code == 201, res.text

    # Échu, le lien ne sert plus.
    expired = create_join_token(cid, "X", utcnow() - timedelta(minutes=1))
    assert client.get(f"/api/join/link/{expired}").status_code == 404
    # Changer le code tue aussi les liens déjà partagés.
    client.post(f"/api/classrooms/{cid}/join-code", headers=auth(teacher), json={})
    assert client.get(f"/api/join/link/{token}").status_code == 404


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
        json={"code": code, "full_name": "Yao", "email": "yao@etu.ci", "password": "motdepasse1",
              "matricule": "ETU-002", "photo": PHOTO, "gender": "M",
              "email_code": email_code("yao@etu.ci")},
    ).json()["access_token"]
    res = client.post(f"/api/classrooms/{cid}/join-code", headers=auth(student), json={})
    assert res.status_code == 403
    res = client.post("/api/classrooms", headers=auth(student), json={"name": "X"})
    assert res.status_code == 403


def test_chacun_change_sa_photo(teacher):
    other = PHOTO.replace("data:image/png", "data:image/webp")
    res = client.put("/api/auth/me/photo", headers=auth(teacher), json={"photo": other})
    assert res.status_code == 200, res.text
    assert res.json()["photo"] == other
    assert client.get("/api/auth/me", headers=auth(teacher)).json()["user"]["photo"] == other

    res = client.put(
        "/api/auth/me/photo", headers=auth(teacher), json={"photo": "data:text/plain;base64,aGVsbG8="}
    )
    assert res.status_code == 422, "une photo doit être une image"

    limiter._attempts.clear()
    student = client.post(
        "/api/auth/login", json={"email": "awa@etu.ci", "password": "motdepasse1"}
    ).json()["access_token"]
    res = client.put("/api/auth/me/photo", headers=auth(student), json={"photo": other})
    assert res.status_code == 200, res.text
    assert res.json()["photo"] == other


def test_enseignant_regle_l_entete_des_feuilles(teacher):
    header = {
        "layout": "officiel",
        "logo": PHOTO,
        "left_lines": ["Université Félix Houphouët-Boigny", "UFR Mathématiques et Informatique", ""],
        "right_lines": ["République de Côte d'Ivoire", "Union - Discipline - Travail"],
        "title": "Examen de fin de semestre",
        "show_classroom": False,
        "show_session": True,
    }
    res = client.put("/api/auth/me/sheet-header", headers=auth(teacher), json=header)
    assert res.status_code == 200, res.text
    saved = res.json()["sheet_header"]
    assert saved["layout"] == "officiel"
    assert saved["left_lines"] == header["left_lines"][:2], "les lignes vides de fin tombent"
    assert client.get("/api/auth/me", headers=auth(teacher)).json()["user"]["sheet_header"] == saved

    # L'en-tête suit l'épreuve : l'aperçu de l'enseignant le reprend.
    evaluation = client.post(
        "/api/evaluations", headers=auth(teacher), json={"title": "Contrôle", "duration_minutes": 30}
    )
    assert evaluation.status_code == 201, evaluation.text
    detail = client.get(f"/api/evaluations/{evaluation.json()['id']}", headers=auth(teacher))
    assert detail.json()["sheet_header"] == saved

    res = client.put(
        "/api/auth/me/sheet-header", headers=auth(teacher), json={**header, "layout": "penché"}
    )
    assert res.status_code == 422
    res = client.put(
        "/api/auth/me/sheet-header",
        headers=auth(teacher),
        json={**header, "logo": "data:text/plain;base64,aGVsbG8="},
    )
    assert res.status_code == 422, "le logo doit être une image"

    limiter._attempts.clear()
    student = client.post(
        "/api/auth/login", json={"email": "awa@etu.ci", "password": "motdepasse1"}
    ).json()["access_token"]
    res = client.put("/api/auth/me/sheet-header", headers=auth(student), json=header)
    assert res.status_code == 403


def _nouvel_enseignant(email: str) -> str:
    res = client.post(
        "/api/auth/register-teacher",
        json={"full_name": "Awa Traoré", "email": email, "password": "motdepasse1",
              "photo": PHOTO, "gender": "F", "email_code": email_code(email)},
    )
    assert res.status_code == 201, res.text
    return res.json()["access_token"]


def test_une_classe_se_partage_avec_un_enseignant_d_un_autre_espace(teacher):
    from app.models import Evaluation

    cid = client.get("/api/classrooms", headers=auth(teacher)).json()[0]["id"]
    invite = _nouvel_enseignant("invite@perso.ci")
    assert client.get(f"/api/classrooms/{cid}", headers=auth(invite)).status_code == 404

    # Seul le gestionnaire partage, et seulement avec un enseignant.
    partager = f"/api/classrooms/{cid}/shares"
    assert client.post(partager, headers=auth(invite), json={"email": "kone@perso.ci"}).status_code == 404
    assert client.post(partager, headers=auth(teacher), json={"email": "awa@etu.ci"}).status_code == 404
    assert client.post(partager, headers=auth(teacher), json={"email": "nobody@x.ci"}).status_code == 404
    res = client.post(partager, headers=auth(teacher), json={"email": "INVITE@perso.ci"})
    assert res.status_code == 201, res.text
    share_id = res.json()["id"]
    assert client.post(partager, headers=auth(teacher), json={"email": "invite@perso.ci"}).status_code == 409

    # L'invité voit la classe, sans la gérer.
    classe = next(c for c in client.get("/api/classrooms", headers=auth(invite)).json() if c["id"] == cid)
    assert classe["shared"] is True and classe["can_manage"] is False
    assert client.get(f"/api/classrooms/{cid}/students", headers=auth(invite)).status_code == 200

    # Chacun voit toute l'équipe de la classe, soi compris.
    equipe = client.get(f"/api/classrooms/{cid}/team", headers=auth(invite)).json()
    roles = {m["teacher_email"]: (m["role"], m["is_self"]) for m in equipe}
    assert roles["invite@perso.ci"] == ("invited", True)
    assert ("owner", False) in roles.values()
    assert next(m for m in equipe if m["role"] == "invited")["share_id"] == share_id
    renommer = {"name": "Piratée"}
    assert client.patch(f"/api/classrooms/{cid}", headers=auth(invite), json=renommer).status_code == 403

    # Son épreuve vit dans l'espace de la classe : les inscrits la reçoivent là
    # où ils sont, et l'invité la retrouve depuis le sien.
    res = client.post(
        "/api/evaluations", headers=auth(invite), json={"title": "Interro", "classroom_id": cid}
    )
    assert res.status_code == 201, res.text
    eid = res.json()["id"]
    db = SessionLocal()
    try:
        classroom = db.get(Classroom, cid)
        assert db.get(Evaluation, eid).organization_id == classroom.organization_id
    finally:
        db.close()
    assert client.get(f"/api/evaluations/{eid}", headers=auth(invite)).status_code == 200
    assert eid in [e["id"] for e in client.get("/api/evaluations", headers=auth(invite)).json()["items"]]
    assert client.get(f"/api/evaluations/{eid}", headers=auth(teacher)).status_code == 403

    # L'invité se retire : la classe disparaît de son espace, son épreuve lui reste.
    res = client.delete(f"/api/classrooms/{cid}/shares/{share_id}", headers=auth(invite))
    assert res.status_code == 204
    assert client.get(f"/api/classrooms/{cid}", headers=auth(invite)).status_code == 404
    assert client.get(f"/api/evaluations/{eid}", headers=auth(invite)).status_code == 200


def test_chacun_change_son_mot_de_passe(teacher):
    token = _nouvel_enseignant("awa@perso.ci")
    res = client.put("/api/auth/me/password", headers=auth(token),
                     json={"current_password": "mauvais", "new_password": "nouveaumdp1"})
    assert res.status_code == 400
    res = client.put("/api/auth/me/password", headers=auth(token),
                     json={"current_password": "motdepasse1", "new_password": "nouveaumdp1"})
    assert res.status_code == 200, res.text
    assert client.post("/api/auth/login", json={"email": "awa@perso.ci", "password": "motdepasse1"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "awa@perso.ci", "password": "nouveaumdp1"}).status_code == 200


def test_changer_d_adresse_demande_un_code_envoye_a_la_nouvelle(teacher):
    token = _nouvel_enseignant("bintou@perso.ci")
    body = {"email": "bintou.new@perso.ci", "current_password": "motdepasse1"}
    res = client.post("/api/auth/me/email-code", headers=auth(token),
                      json={**body, "current_password": "mauvais"})
    assert res.status_code == 400
    res = client.post("/api/auth/me/email-code", headers=auth(token),
                      json={**body, "email": "kone@perso.ci"})
    assert res.status_code == 409, "adresse déjà prise"
    res = client.post("/api/auth/me/email-code", headers=auth(token), json=body)
    assert res.status_code == 200, res.text
    code = MAILBOX["bintou.new@perso.ci"]
    wrong = "000000" if code != "000000" else "111111"
    res = client.put("/api/auth/me/email", headers=auth(token),
                     json={"email": "bintou.new@perso.ci", "code": wrong})
    assert res.status_code == 400
    res = client.put("/api/auth/me/email", headers=auth(token),
                     json={"email": "bintou.new@perso.ci", "code": code})
    assert res.status_code == 200, res.text
    assert res.json()["email"] == "bintou.new@perso.ci"
    assert client.post("/api/auth/login", json={"email": "bintou@perso.ci", "password": "motdepasse1"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "bintou.new@perso.ci", "password": "motdepasse1"}).status_code == 200


def test_mot_de_passe_oublie_par_lien(teacher):
    from app.models import PasswordResetToken

    assert client.post("/api/auth/forgot-password", json={"email": "inconnu@perso.ci"}).json() == {"ok": True}
    for _ in range(2):
        assert client.post("/api/auth/forgot-password", json={"email": "kone@perso.ci"}).status_code == 200
    db = SessionLocal()
    try:
        tokens = [t.token for t in db.query(PasswordResetToken).order_by(PasswordResetToken.id)]
    finally:
        db.close()
    assert len(tokens) == 2
    res = client.post("/api/auth/reset-password", json={"token": tokens[-1], "password": "reinit12345"})
    assert res.status_code == 200, res.text
    # Le lien utilisé comme le précédent ne servent plus.
    for token in tokens:
        res = client.post("/api/auth/reset-password", json={"token": token, "password": "autre12345"})
        assert res.status_code == 400
    assert client.post("/api/auth/login", json={"email": "kone@perso.ci", "password": "reinit12345"}).status_code == 200


def test_les_e_mails_portent_le_logo_et_restent_lisibles(monkeypatch):
    import app.mail as mail

    page = mail.render_email("<p>Contenu</p>" + mail.button("https://x.ci/?a=1&b=2", "Ouvrir"))
    # Le logo est dessiné en HTML : aucune image à charger ni à joindre.
    assert "&lt;/&gt;</td>" in page and "<img" not in page and "<p>Contenu</p>" in page
    assert 'href="https://x.ci/?a=1&amp;b=2"' in page

    sent = {}

    class Reply:
        status_code = 200

        @staticmethod
        def json():
            return {"Messages": [{"Status": "success"}]}

    monkeypatch.setattr(mail.settings, "mailjet_api_key", "k")
    monkeypatch.setattr(mail.settings, "mailjet_api_secret", "s")
    monkeypatch.setattr(mail.httpx, "post", lambda *a, json, **k: sent.update(json) or Reply)
    assert mail.send_email("a@b.ci", "Sujet", "<p>Salut</p>", "Salut")
    message = sent["Messages"][0]
    assert message["TrackClicks"] == "disabled" and message["TrackOpens"] == "disabled"
    assert "InlinedAttachments" not in message
    assert message["TextPart"] == "Salut"

    monkeypatch.setattr(mail.settings, "smtp_from", "noreply@gmail.com")
    assert mail.sender_warning()
    monkeypatch.setattr(mail.settings, "smtp_from", "noreply@codeval.ci")
    assert mail.sender_warning() is None


def test_l_administration_voit_les_inscrits_et_ne_compte_plus_les_supprimes(teacher):
    """Les enseignants inscrits seuls et leurs apprenants figurent dans la liste
    et le tableau de bord de l'administration ; un compte supprimé n'y compte plus."""
    limiter._attempts.clear()
    admin = auth(create_admin("Plateforme", "Admin", "admin@plateforme.ci"))

    def overview():
        return client.get("/api/stats/overview", headers=admin).json()

    before = overview()
    res = client.post(
        "/api/auth/register-teacher",
        json={"full_name": "Prof Libre", "email": "libre@perso.ci", "password": "motdepasse1",
              "photo": PHOTO, "gender": "M", "email_code": email_code("libre@perso.ci")},
    )
    assert res.status_code == 201, res.text
    prof = auth(res.json()["access_token"])
    cid = client.post("/api/classrooms", headers=prof, json={"name": "Terminale D"}).json()["id"]
    code = client.post(f"/api/classrooms/{cid}/join-code", headers=prof, json={}).json()["join_code"]
    res = client.post(
        "/api/join",
        json={"code": code, "full_name": "Élève Libre", "email": "eleve@libre.ci",
              "password": "motdepasse1", "matricule": "LIB-1", "photo": PHOTO, "gender": "F",
              "email_code": email_code("eleve@libre.ci")},
    )
    assert res.status_code == 201, res.text

    listed = {u["email"]: u for u in client.get(
        "/api/users", headers=admin, params={"q": "libre", "page_size": 100}).json()["items"]}
    assert listed["libre@perso.ci"]["space"] == "Espace de Prof Libre"
    assert listed["libre@perso.ci"]["classrooms"] == ["Terminale D"]
    assert listed["eleve@libre.ci"]["classrooms"] == ["Terminale D"]
    after = overview()
    assert after["teachers"] == before["teachers"] + 1
    assert after["students"] == before["students"] + 1

    # Un espace personnel n'a pas d'administration : son rôle ne change pas.
    res = client.patch(f"/api/users/{listed['eleve@libre.ci']['id']}", headers=admin,
                       json={"role": "admin"})
    assert res.status_code == 409

    # Supprimés, ils sortent de la liste comme des compteurs.
    for email in ("libre@perso.ci", "eleve@libre.ci"):
        assert client.delete(f"/api/users/{listed[email]['id']}", headers=admin).status_code == 204
    assert client.get("/api/users", headers=admin, params={"q": "libre"}).json()["total"] == 0
    assert (overview()["teachers"], overview()["students"]) == (
        before["teachers"], before["students"])


def test_sans_verification_l_inscription_se_passe_de_code(teacher, monkeypatch):
    """En développement (`CODEVAL_EMAIL_VERIFICATION=false`), enseignant et
    apprenant s'inscrivent sans code ; activée, la vérification reste exigée."""
    from app.config import settings

    limiter._attempts.clear()
    signup = {"full_name": "Prof Local", "email": "prof@esatic.edu.ci",
              "password": "motdepasse1", "photo": PHOTO, "gender": "M"}
    assert client.post("/api/auth/register-teacher", json=signup).status_code == 400

    monkeypatch.setattr(settings, "email_verification", False)
    res = client.post("/api/auth/email-code", json={"email": "prof@esatic.edu.ci"})
    assert res.json() == {"ok": True, "required": False}
    assert "prof@esatic.edu.ci" not in MAILBOX
    res = client.post("/api/auth/register-teacher", json=signup)
    assert res.status_code == 201, res.text
    prof = auth(res.json()["access_token"])
    cid = client.post("/api/classrooms", headers=prof, json={"name": "L2 Réseaux"}).json()["id"]
    code = client.post(f"/api/classrooms/{cid}/join-code", headers=prof, json={}).json()["join_code"]
    res = client.post(
        "/api/join",
        json={"code": code, "full_name": "Étudiant Local", "email": "etudiant@esatic.edu.ci",
              "password": "motdepasse1", "matricule": "ESA-1", "photo": PHOTO, "gender": "F"},
    )
    assert res.status_code == 201, res.text
