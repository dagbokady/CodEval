"""Statistiques de l'enseignant : ses épreuves corrigées, lues ensemble.

Chaque copie compte pour sa note retenue dans la dernière campagne terminée,
ramenée sur 20. Une épreuve annulée ne compte pas.
"""

from __future__ import annotations

from statistics import median

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import select

from ..classrooms import shared_classroom_ids
from ..deps import DbSession, TeacherUser
from ..models import (
    Classroom,
    CorrectionRun,
    Evaluation,
    EvaluationStatus,
    Participation,
    RunStatus,
    User,
)
from ..services import participant_scores

router = APIRouter(prefix="/api/stats", tags=["statistiques"])

PASS_MARK = 10.0
# Au plus tant d'apprenants signalés : au-delà, la liste ne se lit plus.
AT_RISK_LIMIT = 8


class EvaluationStat(BaseModel):
    id: int
    title: str
    classroom_id: int | None
    classroom_name: str | None
    date: str | None
    copies: int
    average: float
    median: float
    best: float
    worst: float
    success_rate: float


class ClassroomStat(BaseModel):
    id: int
    name: str
    evaluations: int
    students: int
    copies: int
    average: float
    success_rate: float


class StudentStat(BaseModel):
    student_id: int
    full_name: str
    matricule: str | None
    classroom_name: str | None
    copies: int
    average: float
    last: float


class StatsOut(BaseModel):
    evaluations_count: int
    students_count: int
    copies_count: int
    average: float | None
    median: float | None
    success_rate: float | None
    # Nombre de copies par tranche de deux points : [0-2[, [2-4[, … [18-20].
    distribution: list[int]
    evaluations: list[EvaluationStat]
    classrooms: list[ClassroomStat]
    at_risk: list[StudentStat]
    classroom_options: list[dict]


def _r(value: float) -> float:
    return round(value, 2)


def _success(grades: list[float]) -> float:
    return round(sum(1 for g in grades if g >= PASS_MARK) / len(grades) * 100, 1)


@router.get("", response_model=StatsOut)
def teacher_stats(
    user: TeacherUser, db: DbSession, classroom_id: int | None = Query(default=None)
) -> StatsOut:
    evaluations = list(
        db.scalars(
            select(Evaluation)
            .where(
                Evaluation.teacher_id == user.id,
                Evaluation.is_template.isnot(True),
                Evaluation.status != EvaluationStatus.CANCELLED,
            )
            .order_by(Evaluation.created_at)
        )
    )
    classrooms = {
        c.id: c
        for c in db.scalars(
            select(Classroom).where(
                (Classroom.organization_id == user.organization_id)
                | Classroom.id.in_(shared_classroom_ids(db, user) or [0])
            )
        )
    }

    # Une ligne par copie notée : (épreuve, apprenant, note sur 20).
    copies: list[tuple[Evaluation, int, float]] = []
    for evaluation in evaluations:
        run = db.scalar(
            select(CorrectionRun)
            .where(
                CorrectionRun.evaluation_id == evaluation.id,
                CorrectionRun.status == RunStatus.DONE,
            )
            .order_by(CorrectionRun.number.desc())
            .limit(1)
        )
        if run is None:
            continue
        scores = participant_scores(db, run.id)
        if not scores:
            continue
        students = dict(
            db.execute(
                select(Participation.id, Participation.student_id).where(
                    Participation.id.in_(scores)
                )
            ).all()
        )
        for pid, entry in scores.items():
            if entry["max"] and pid in students:
                copies.append((evaluation, students[pid], entry["final"] / entry["max"] * 20))

    # Les classes proposées au filtre : celles où l'enseignant a des notes.
    option_ids = sorted({e.classroom_id for e, _, _ in copies if e.classroom_id})
    classroom_options = [
        {"id": cid, "name": classrooms[cid].name} for cid in option_ids if cid in classrooms
    ]
    if classroom_id is not None:
        copies = [c for c in copies if c[0].classroom_id == classroom_id]

    grades = [g for _, _, g in copies]
    distribution = [0] * 10
    for grade in grades:
        distribution[min(int(grade // 2), 9)] += 1

    by_evaluation: dict[int, list[float]] = {}
    for evaluation, _, grade in copies:
        by_evaluation.setdefault(evaluation.id, []).append(grade)
    evaluation_stats = []
    for evaluation in evaluations:
        marks = by_evaluation.get(evaluation.id)
        if not marks:
            continue
        when = evaluation.closed_at or evaluation.started_at or evaluation.scheduled_start
        classroom = classrooms.get(evaluation.classroom_id)
        evaluation_stats.append(
            EvaluationStat(
                id=evaluation.id,
                title=evaluation.title,
                classroom_id=evaluation.classroom_id,
                classroom_name=classroom.name if classroom else None,
                date=when.isoformat() if when else None,
                copies=len(marks),
                average=_r(sum(marks) / len(marks)),
                median=_r(median(marks)),
                best=_r(max(marks)),
                worst=_r(min(marks)),
                success_rate=_success(marks),
            )
        )
    evaluation_stats.sort(key=lambda e: e.date or "")

    by_classroom: dict[int, list[tuple[int, int, float]]] = {}
    for evaluation, student_id, grade in copies:
        if evaluation.classroom_id in classrooms:
            by_classroom.setdefault(evaluation.classroom_id, []).append(
                (evaluation.id, student_id, grade)
            )
    classroom_stats = sorted(
        (
            ClassroomStat(
                id=cid,
                name=classrooms[cid].name,
                evaluations=len({e for e, _, _ in rows}),
                students=len({s for _, s, _ in rows}),
                copies=len(rows),
                average=_r(sum(g for _, _, g in rows) / len(rows)),
                success_rate=_success([g for _, _, g in rows]),
            )
            for cid, rows in by_classroom.items()
        ),
        key=lambda c: c.name,
    )

    # À accompagner : les apprenants dont la moyenne reste sous 10.
    by_student: dict[int, list[tuple[Evaluation, float]]] = {}
    for evaluation, student_id, grade in copies:
        by_student.setdefault(student_id, []).append((evaluation, grade))
    struggling = sorted(
        (
            (sid, rows)
            for sid, rows in by_student.items()
            if sum(g for _, g in rows) / len(rows) < PASS_MARK
        ),
        key=lambda item: sum(g for _, g in item[1]) / len(item[1]),
    )[:AT_RISK_LIMIT]
    names = {
        u.id: u
        for u in db.scalars(select(User).where(User.id.in_([sid for sid, _ in struggling])))
    } if struggling else {}
    at_risk = []
    for sid, rows in struggling:
        student = names.get(sid)
        if student is None:
            continue
        last_eval, last_grade = rows[-1]
        classroom = classrooms.get(last_eval.classroom_id)
        at_risk.append(
            StudentStat(
                student_id=sid,
                full_name=student.full_name,
                matricule=student.matricule,
                classroom_name=classroom.name if classroom else None,
                copies=len(rows),
                average=_r(sum(g for _, g in rows) / len(rows)),
                last=_r(last_grade),
            )
        )

    return StatsOut(
        evaluations_count=len(evaluation_stats),
        students_count=len(by_student),
        copies_count=len(grades),
        average=_r(sum(grades) / len(grades)) if grades else None,
        median=_r(median(grades)) if grades else None,
        success_rate=_success(grades) if grades else None,
        distribution=distribution,
        evaluations=evaluation_stats,
        classrooms=classroom_stats,
        at_risk=at_risk,
        classroom_options=classroom_options,
    )
