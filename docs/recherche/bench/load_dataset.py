#!/usr/bin/env python3
"""Chargement du jeu de copies dans une base CodEval (memoire, section 4.3, etape 4).

Ecrit en base exactement les lignes que l'application aurait ecrites si
l'epreuve avait eu lieu : un etablissement, une enseignante, une classe, les
comptes etudiants, l'evaluation BENCH-SRIT avec ses exercices et ses tests, puis
une participation par etudiant et une soumission par exercice. Aucune epreuve
n'est jouee : la mesure ne porte que sur la correction, qui lit ces lignes.

La base visee est celle de CODEVAL_DATABASE_URL. En usage normal, c'est la base
MODELE (`codeval_bench_tpl`) : l'orchestrateur recree ensuite la base de mesure a
partir d'elle avant chaque mesure.

Prealable : le schema doit exister (`alembic upgrade head` sur cette base).

Usage :
    CODEVAL_DATABASE_URL=postgresql+psycopg://codeval:codeval@localhost:5432/codeval_bench_tpl \
        python3 load_dataset.py --dataset data/dataset_v1.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "backend"))

import dataset_spec as spec  # noqa: E402

from app.db import SessionLocal, engine  # noqa: E402
from app.models import (  # noqa: E402
    Classroom,
    Enrollment,
    Evaluation,
    EvaluationKind,
    EvaluationStatus,
    Exercise,
    Organization,
    Participation,
    Role,
    Subject,
    Submission,
    TeacherAssignment,
    TestCase,
    TestKind,
    User,
)
from app.security import hash_password  # noqa: E402

DEFAULT_DATASET = HERE / "data" / "dataset_v1.json"
PASSWORD = "bench-2026"
EXAM_START = datetime(2026, 1, 15, 8, 0, tzinfo=timezone.utc)


def load_json(path: Path) -> tuple[dict, str]:
    payload = path.read_text(encoding="utf-8")
    return json.loads(payload), hashlib.sha256(payload.encode("utf-8")).hexdigest()


def build(db, dataset: dict) -> dict:
    """Cree toute l'arborescence et rend un compte-rendu chiffre."""
    organization = Organization(**spec.ORGANIZATION)
    db.add(organization)
    db.flush()

    # Un seul calcul de hachage, reutilise : pbkdf2 coute environ 100 ms et nous
    # creons 500 comptes. Le mot de passe est le meme pour tous, le banc n'a pas
    # d'enjeu d'authentification.
    digest = hash_password(PASSWORD)

    teacher = User(organization_id=organization.id, role=Role.TEACHER,
                   password_hash=digest, **spec.TEACHER)
    db.add(teacher)

    subject = Subject(organization_id=organization.id, **spec.SUBJECT)
    classroom = Classroom(organization_id=organization.id, **spec.CLASSROOM)
    db.add_all([subject, classroom])
    db.flush()

    db.add(TeacherAssignment(teacher_id=teacher.id, classroom_id=classroom.id,
                             subject_id=subject.id))

    evaluation = Evaluation(
        organization_id=organization.id,
        teacher_id=teacher.id,
        classroom_id=classroom.id,
        subject_id=subject.id,
        kind=EvaluationKind(spec.EVALUATION["kind"]),
        status=EvaluationStatus.CLOSED,
        title=spec.EVALUATION["title"],
        language=spec.EVALUATION["language"],
        total_points=spec.EVALUATION["total_points"],
        duration_minutes=spec.EVALUATION["duration_minutes"],
        scheduled_start=EXAM_START,
        started_at=EXAM_START,
        ends_at=EXAM_START + timedelta(minutes=spec.EVALUATION["duration_minutes"]),
        closed_at=EXAM_START + timedelta(minutes=spec.EVALUATION["duration_minutes"]),
    )
    db.add(evaluation)
    db.flush()

    exercise_ids: dict[int, int] = {}
    tests = 0
    for item in spec.EXERCISES:
        exercise = Exercise(
            evaluation_id=evaluation.id,
            position=item["position"],
            title=item["title"],
            statement=item["statement"],
            language=item["language"],
            points=item["points"],
            kind=item["kind"],
            settings=item["settings"],
        )
        db.add(exercise)
        db.flush()
        exercise_ids[item["position"]] = exercise.id
        for rank, test in enumerate(item["tests"], start=1):
            db.add(TestCase(
                exercise_id=exercise.id,
                position=rank,
                name=test["name"],
                kind=TestKind.OFFICIAL,
                stdin=test["stdin"],
                expected_stdout=test["expected_stdout"],
                comparison=test["comparison"],
                points=test["points"],
                timeout_ms=test["timeout_ms"],
            ))
            tests += 1

    submissions = 0
    for copy in dataset["copies"]:
        student = User(
            organization_id=organization.id,
            email=copy["email"],
            full_name=copy["full_name"],
            matricule=copy["matricule"],
            role=Role.STUDENT,
            password_hash=digest,
        )
        db.add(student)
        db.flush()
        db.add(Enrollment(classroom_id=classroom.id, student_id=student.id))

        participation = Participation(
            evaluation_id=evaluation.id,
            student_id=student.id,
            started_at=EXAM_START,
            last_seen_at=evaluation.closed_at,
            last_saved_at=evaluation.closed_at,
            submitted_at=evaluation.closed_at,
            frozen_at=evaluation.closed_at,
        )
        db.add(participation)
        db.flush()

        for answer in copy["answers"]:
            db.add(Submission(
                participation_id=participation.id,
                exercise_id=exercise_ids[answer["exercise"]],
                code=answer["code"],
                version=1,
                updated_at=evaluation.closed_at,
            ))
            submissions += 1

    return {
        "organisation": organization.slug,
        "evaluation_id": evaluation.id,
        "exercices": len(spec.EXERCISES),
        "tests": tests,
        "etudiants": len(dataset["copies"]),
        "participations": len(dataset["copies"]),
        "soumissions": submissions,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--force", action="store_true",
                        help="recharger meme si l'evaluation BENCH-SRIT existe deja")
    args = parser.parse_args()

    dataset, digest = load_json(args.dataset)
    print(f"base      : {engine.url.render_as_string(hide_password=True)}")
    print(f"jeu       : {args.dataset} (SHA-256 {digest})")

    db = SessionLocal()
    try:
        existing = db.query(Evaluation).filter(
            Evaluation.title == spec.EVALUATION["title"]
        ).first()
        if existing is not None and not args.force:
            print("L'evaluation BENCH-SRIT est deja presente dans cette base.")
            print("Recreer une base vierge, ou relancer avec --force.")
            raise SystemExit(1)

        report = build(db, dataset)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    for key, value in report.items():
        print(f"{key:15s}: {value}")
    print("\nEmpreinte a reporter dans chaque fichier de mesure :")
    print(digest)


if __name__ == "__main__":
    main()
