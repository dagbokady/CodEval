"""Jeu de données initial : python -m app.seed

Une seule enseignante, une seule classe, deux matières — le langage C et
l'initiation à l'algorithmique, qui se répondent : la première se travaille avec
l'éditeur de code, la seconde avec l'éditeur de blocs. Aucun exercice ni
évaluation : l'enseignante crée les siens depuis l'interface.

Le script est rejouable : sur une base déjà installée, il n'ajoute que les
matières manquantes et les rattachements qui vont avec.
"""

from __future__ import annotations

from sqlalchemy import select

from .db import SessionLocal, init_db
from .models import (
    Classroom,
    Enrollment,
    Organization,
    Role,
    Subject,
    TeacherAssignment,
    User,
)
from .security import hash_password

ORG_NAME = "ESATIC — École Supérieure Africaine des TIC"
ORG_SLUG = "esatic"
PASSWORD = "codeval2026"

TEACHER = ("dr.johnson@esatic.ci", "Dr Johnson")
CLASSROOM = ("SRIT 2A", "2ᵉ année")
SUBJECTS = ["Langage C", "Initiation à l'algorithmique"]
STUDENTS = [
    ("coulibaly.moussa@esatic.ci", "Coulibaly Moussa", "SRIT2A-001"),
    ("kone.aminata@esatic.ci", "Koné Aminata", "SRIT2A-002"),
    ("traore.ibrahim@esatic.ci", "Traoré Ibrahim", "SRIT2A-003"),
    ("bamba.fatou@esatic.ci", "Bamba Fatou", "SRIT2A-004"),
    ("diallo.sekou@esatic.ci", "Diallo Sékou", "SRIT2A-005"),
]


def _compléter_matières(db, org: Organization) -> list[str]:
    """Les matières du catalogue absentes de l'établissement, créées et rattachées.

    Une matière ajoutée au catalogue après la première installation n'a aucune
    raison de manquer aux bases déjà en service : on la crée, et on y rattache
    les enseignants là où ils enseignent déjà.
    """
    ajoutées: list[str] = []
    classrooms = db.scalars(select(Classroom).where(Classroom.organization_id == org.id)).all()
    teachers = db.scalars(
        select(User).where(User.organization_id == org.id, User.role == Role.TEACHER)
    ).all()

    for name in SUBJECTS:
        if db.scalar(
            select(Subject).where(Subject.organization_id == org.id, Subject.name == name)
        ):
            continue
        subject = Subject(organization_id=org.id, name=name)
        db.add(subject)
        db.flush()
        ajoutées.append(name)
        for teacher in teachers:
            for classroom in classrooms:
                db.add(
                    TeacherAssignment(
                        teacher_id=teacher.id,
                        classroom_id=classroom.id,
                        subject_id=subject.id,
                    )
                )
    return ajoutées


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        existante = db.scalar(select(Organization).where(Organization.slug == ORG_SLUG))
        if existante:
            ajoutées = _compléter_matières(db, existante)
            db.commit()
            if ajoutées:
                print(f"Matière ajoutée : {', '.join(ajoutées)}")
            else:
                print("Jeu de données déjà présent.")
            return

        org = Organization(name=ORG_NAME, slug=ORG_SLUG, settings={})
        db.add(org)
        db.flush()

        def user(email: str, name: str, role: Role, matricule: str | None = None) -> User:
            u = User(
                organization_id=org.id,
                email=email,
                password_hash=hash_password(PASSWORD),
                full_name=name,
                role=role,
                matricule=matricule,
            )
            db.add(u)
            return u

        teacher = user(TEACHER[0], TEACHER[1], Role.TEACHER)
        students = [user(email, name, Role.STUDENT, mat) for email, name, mat in STUDENTS]
        db.flush()

        subjects = [Subject(organization_id=org.id, name=name) for name in SUBJECTS]
        classroom = Classroom(organization_id=org.id, name=CLASSROOM[0], level=CLASSROOM[1])
        db.add_all([*subjects, classroom])
        db.flush()

        for student in students:
            db.add(Enrollment(classroom_id=classroom.id, student_id=student.id))
        for subject in subjects:
            db.add(
                TeacherAssignment(
                    teacher_id=teacher.id, classroom_id=classroom.id, subject_id=subject.id
                )
            )
        db.commit()

        print(f"Établissement    : {ORG_NAME}")
        print(f"Enseignante      : {TEACHER[1]} <{TEACHER[0]}>")
        print(f"Classe           : {CLASSROOM[0]} — {len(students)} étudiants")
        print(f"Matières         : {' · '.join(SUBJECTS)}")
        print(f"Mot de passe     : {PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
