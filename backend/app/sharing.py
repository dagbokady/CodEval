"""Partage depuis la banque : un exercice ou un sujet rangé par un enseignant,
ouvert à ses collègues de l'établissement ou à tous les enseignants.

Le partage passe par la communauté : une publication liée à l'original
(`source_type`, `source_id`). Elle en reste un instantané, que les autres
recopient sans jamais toucher à l'original ; mais tant que le partage dure,
chaque enregistrement de l'original l'actualise, et le supprimer la retire.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from .db import soft_delete
from .grading.matching import SALT_KEY
from .models import BankExercise, CommunityItem, Evaluation, Exercise, Subject

BANK_EXERCISE = "bank_exercise"
TEMPLATE = "template"

_TEST_FIELDS = (
    "name", "stdin", "expected_stdout", "comparison", "points", "timeout_ms",
    "target_id", "expected_type",
)
_EXERCISE_FIELDS = ("title", "statement", "language", "points", "starter_code", "kind")


def snapshot_exercise(exercise: Exercise | BankExercise) -> dict:
    # Le sel d'une correspondance appartient à l'exercice où il a été tiré.
    settings = {k: v for k, v in (exercise.settings or {}).items() if k != SALT_KEY}
    return {
        **{field: getattr(exercise, field) for field in _EXERCISE_FIELDS},
        "settings": settings,
        "tests": [
            {
                **{field: getattr(test, field) for field in _TEST_FIELDS},
                "kind": test.kind.value,
                "input_types": list(test.input_types or []),
                "args": list(test.args or []),
                "argv": list(test.argv or []),
            }
            for test in exercise.tests
        ],
    }


def subject_name(db, subject_id: int | None) -> str | None:
    subject = db.get(Subject, subject_id) if subject_id else None
    return subject.name if subject else None


def evaluation_exercises(db, evaluation: Evaluation) -> list[Exercise]:
    return list(
        db.scalars(
            select(Exercise)
            .where(Exercise.evaluation_id == evaluation.id)
            .options(selectinload(Exercise.tests))
            .order_by(Exercise.position)
        )
    )


def subject_content(evaluation: Evaluation, exercises: list[Exercise]) -> dict:
    """Une épreuve entière : ses réglages et ses exercices, jeux de tests compris."""
    return {
        "evaluation": {
            "kind": evaluation.kind.value,
            "description": evaluation.description,
            "instructions": evaluation.instructions,
            "language": evaluation.language,
            "duration_minutes": evaluation.duration_minutes,
            "total_points": evaluation.total_points,
            "rules": dict(evaluation.rules or {}),
        },
        "exercises": [snapshot_exercise(e) for e in exercises],
    }


def fill_from_exercise(db, item: CommunityItem, exercise: BankExercise) -> None:
    item.item_type = "exercise"
    item.title = exercise.title
    item.language = exercise.language
    item.subject_name = subject_name(db, exercise.subject_id)
    item.tags = list(exercise.tags or [])
    item.content = {"exercise": snapshot_exercise(exercise)}
    item.exercises_count = 1
    item.total_points = exercise.points


def fill_from_template(db, item: CommunityItem, template: Evaluation) -> None:
    exercises = evaluation_exercises(db, template)
    item.item_type = "subject"
    item.title = template.title
    item.language = template.language
    item.subject_name = subject_name(db, template.subject_id)
    item.content = subject_content(template, exercises)
    item.exercises_count = len(exercises)
    item.total_points = template.total_points


def _fill(db, item: CommunityItem, source_type: str, source) -> None:
    if source_type == BANK_EXERCISE:
        fill_from_exercise(db, item, source)
    else:
        fill_from_template(db, item, source)


def shared_items(db, source_type: str, source_id: int) -> list[CommunityItem]:
    return list(
        db.scalars(
            select(CommunityItem).where(
                CommunityItem.source_type == source_type,
                CommunityItem.source_id == source_id,
            )
        )
    )


def share_states(db, source_type: str, ids: list[int]) -> dict[int, str]:
    """La portée du partage de chaque original : « organization » ou « all »."""
    if not ids:
        return {}
    return dict(
        db.execute(
            select(CommunityItem.source_id, CommunityItem.visibility).where(
                CommunityItem.source_type == source_type,
                CommunityItem.source_id.in_(ids),
                CommunityItem.deleted_at.is_(None),
            )
        ).all()
    )


def set_share(db, source_type: str, source, visibility: str, author_id: int,
              organization_id: int) -> CommunityItem | None:
    """Ouvre, élargit, restreint ou retire le partage d'un original.

    Partager (de nouveau) reprend toujours l'original tel qu'il est."""
    items = shared_items(db, source_type, source.id)
    if visibility == "none":
        for item in items:
            soft_delete(item)
        return None
    item = items[0] if items else None
    for extra in items[1:]:
        soft_delete(extra)
    if item is None:
        item = CommunityItem(
            organization_id=organization_id,
            author_id=author_id,
            source_type=source_type,
            source_id=source.id,
            description="",
        )
        db.add(item)
    _fill(db, item, source_type, source)
    item.visibility = visibility
    db.flush()
    return item


def refresh_shares(db, source_type: str, source) -> None:
    """L'original vient d'être enregistré : ce qui en est partagé suit."""
    for item in shared_items(db, source_type, source.id):
        _fill(db, item, source_type, source)


def drop_shares(db, source_type: str, source_id: int) -> None:
    """L'original disparaît : son partage aussi. Les copies déjà tirées restent."""
    for item in shared_items(db, source_type, source_id):
        soft_delete(item)
