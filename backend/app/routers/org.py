"""Espace établissement : utilisateurs, classes, matières, statistiques."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from ..audit import log
from ..deps import CurrentUser, DbSession, TeacherUser
from ..models import (
    Classroom,
    CorrectionResult,
    CorrectionRun,
    Enrollment,
    Evaluation,
    EvaluationStatus,
    Participation,
    Role,
    RunStatus,
    Subject,
    TeacherAssignment,
    User,
)
from ..schemas import (
    ClassroomCreate,
    ClassroomDetailOut,
    ClassroomOut,
    EnrollPayload,
    EvaluationOut,
    NamedCreate,
    Page,
    SubjectOut,
    UserCreate,
    UserOut,
    UserUpdate,
)
from ..security import hash_password

router = APIRouter(prefix="/api", tags=["établissement"])


# ----- Utilisateurs -----
@router.get("/users", response_model=Page)
def list_users(
    admin: TeacherUser,
    db: DbSession,
    role: Role | None = None,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> Page:
    filters = [User.organization_id == admin.organization_id]
    if role is not None:
        filters.append(User.role == role)
    if q:
        pattern = f"%{q.lower()}%"
        filters.append(
            func.lower(User.full_name).like(pattern) | func.lower(User.email).like(pattern)
        )
    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    users = db.scalars(
        select(User)
        .where(*filters)
        .order_by(User.full_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page(
        items=[UserOut.model_validate(u).model_dump() for u in users],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, admin: TeacherUser, db: DbSession) -> UserOut:
    email = payload.email.lower()
    exists = db.scalar(
        select(User).where(User.organization_id == admin.organization_id, User.email == email)
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cet e-mail est déjà utilisé")
    user = User(
        organization_id=admin.organization_id,
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        matricule=payload.matricule,
    )
    db.add(user)
    log(db, admin, admin.organization_id, "user.created", "user", None, email=email,
        role=payload.role.value)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, admin: TeacherUser, db: DbSession) -> UserOut:
    user = db.get(User, user_id)
    if user is None or user.organization_id != admin.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Utilisateur introuvable")
    data = payload.model_dump(exclude_unset=True)
    if "password" in data and data["password"]:
        user.password_hash = hash_password(data.pop("password"))
    data.pop("password", None)
    for field, value in data.items():
        setattr(user, field, value)
    log(db, admin, admin.organization_id, "user.updated", "user", user.id, fields=list(data))
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


# ----- Matières -----
@router.get("/subjects", response_model=list[SubjectOut])
def list_subjects(user: CurrentUser, db: DbSession) -> list[SubjectOut]:
    subjects = db.scalars(
        select(Subject).where(Subject.organization_id == user.organization_id).order_by(Subject.name)
    )
    return [SubjectOut.model_validate(s) for s in subjects]


@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(payload: NamedCreate, admin: TeacherUser, db: DbSession) -> SubjectOut:
    exists = db.scalar(
        select(Subject).where(
            Subject.organization_id == admin.organization_id, Subject.name == payload.name
        )
    )
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Matière déjà existante")
    subject = Subject(organization_id=admin.organization_id, name=payload.name)
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return SubjectOut.model_validate(subject)


# ----- Classes -----
@router.get("/classrooms", response_model=list[ClassroomOut])
def list_classrooms(user: CurrentUser, db: DbSession) -> list[ClassroomOut]:
    counts = dict(
        db.execute(
            select(Enrollment.classroom_id, func.count(Enrollment.id)).group_by(
                Enrollment.classroom_id
            )
        ).all()
    )
    rows = db.scalars(
        select(Classroom)
        .where(Classroom.organization_id == user.organization_id)
        .order_by(Classroom.name)
    )
    return [
        ClassroomOut(
            id=c.id, name=c.name, level=c.level, students_count=counts.get(c.id, 0)
        )
        for c in rows
    ]


@router.get("/classrooms/{classroom_id}", response_model=ClassroomDetailOut)
def get_classroom(classroom_id: int, user: CurrentUser, db: DbSession) -> ClassroomDetailOut:
    classroom = db.get(Classroom, classroom_id)
    if classroom is None or classroom.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Classe introuvable")
    students_count = db.scalar(
        select(func.count(Enrollment.id)).where(Enrollment.classroom_id == classroom_id)
    ) or 0
    subject_row = db.execute(
        select(Subject.name)
        .join(Evaluation, Evaluation.subject_id == Subject.id)
        .where(Evaluation.classroom_id == classroom_id)
        .limit(1)
    ).first()
    return ClassroomDetailOut(
        id=classroom.id,
        name=classroom.name,
        level=classroom.level,
        students_count=students_count,
        subject_name=subject_row[0] if subject_row else None,
        created_at=classroom.created_at,
    )


@router.get("/classrooms/{classroom_id}/evaluations", response_model=list[EvaluationOut])
def classroom_evaluations(classroom_id: int, user: CurrentUser, db: DbSession) -> list[EvaluationOut]:
    classroom = db.get(Classroom, classroom_id)
    if classroom is None or classroom.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Classe introuvable")
    rows = db.scalars(
        select(Evaluation)
        .where(Evaluation.classroom_id == classroom_id)
        .order_by(Evaluation.scheduled_start.desc().nullslast(), Evaluation.id.desc())
    )
    results = []
    for ev in rows:
        subject = db.get(Subject, ev.subject_id) if ev.subject_id else None
        cls = db.get(Classroom, ev.classroom_id) if ev.classroom_id else None
        results.append(EvaluationOut(
            id=ev.id,
            title=ev.title,
            description=ev.description,
            instructions=ev.instructions,
            language=ev.language,
            duration_minutes=ev.duration_minutes,
            scheduled_start=ev.scheduled_start,
            status=ev.status,
            total_points=ev.total_points,
            rules=ev.rules,
            started_at=ev.started_at,
            ends_at=ev.ends_at,
            closed_at=ev.closed_at,
            validated_at=ev.validated_at,
            classroom_id=ev.classroom_id,
            subject_id=ev.subject_id,
            classroom_name=cls.name if cls else None,
            subject_name=subject.name if subject else None,
        ))
    return results


@router.post("/classrooms", response_model=ClassroomOut, status_code=status.HTTP_201_CREATED)
def create_classroom(payload: ClassroomCreate, admin: TeacherUser, db: DbSession) -> ClassroomOut:
    classroom = Classroom(
        organization_id=admin.organization_id, name=payload.name, level=payload.level
    )
    db.add(classroom)
    log(db, admin, admin.organization_id, "classroom.created", "classroom", None, name=payload.name)
    db.commit()
    db.refresh(classroom)
    return ClassroomOut(id=classroom.id, name=classroom.name, level=classroom.level)


@router.get("/classrooms/{classroom_id}/students", response_model=list[UserOut])
def classroom_students(classroom_id: int, user: CurrentUser, db: DbSession) -> list[UserOut]:
    classroom = db.get(Classroom, classroom_id)
    if classroom is None or classroom.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Classe introuvable")
    students = db.scalars(
        select(User)
        .join(Enrollment, Enrollment.student_id == User.id)
        .where(Enrollment.classroom_id == classroom_id)
        .order_by(User.full_name)
    )
    return [UserOut.model_validate(s) for s in students]


@router.post("/classrooms/{classroom_id}/students", status_code=status.HTTP_204_NO_CONTENT)
def enroll_students(
    classroom_id: int, payload: EnrollPayload, admin: TeacherUser, db: DbSession
) -> None:
    classroom = db.get(Classroom, classroom_id)
    if classroom is None or classroom.organization_id != admin.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Classe introuvable")
    valid = set(
        db.scalars(
            select(User.id).where(
                User.id.in_(payload.student_ids),
                User.organization_id == admin.organization_id,
                User.role == Role.STUDENT,
            )
        )
    )
    already = set(
        db.scalars(select(Enrollment.student_id).where(Enrollment.classroom_id == classroom_id))
    )
    for student_id in valid - already:
        db.add(Enrollment(classroom_id=classroom_id, student_id=student_id))
    db.commit()


@router.post("/classrooms/{classroom_id}/teachers", status_code=status.HTTP_204_NO_CONTENT)
def assign_teacher(
    classroom_id: int,
    teacher_id: int,
    subject_id: int,
    admin: TeacherUser,
    db: DbSession,
) -> None:
    teacher = db.get(User, teacher_id)
    if teacher is None or teacher.organization_id != admin.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enseignant introuvable")
    exists = db.scalar(
        select(TeacherAssignment).where(
            TeacherAssignment.teacher_id == teacher_id,
            TeacherAssignment.classroom_id == classroom_id,
            TeacherAssignment.subject_id == subject_id,
        )
    )
    if exists is None:
        db.add(
            TeacherAssignment(
                teacher_id=teacher_id, classroom_id=classroom_id, subject_id=subject_id
            )
        )
        db.commit()


# ----- Statistiques établissement -----
@router.get("/stats/overview")
def stats_overview(admin: TeacherUser, db: DbSession) -> dict:
    org = admin.organization_id
    counts = {
        role.value: db.scalar(
            select(func.count(User.id)).where(User.organization_id == org, User.role == role)
        )
        or 0
        for role in Role
    }
    evaluations = (
        db.scalar(select(func.count(Evaluation.id)).where(Evaluation.organization_id == org)) or 0
    )
    running = (
        db.scalar(
            select(func.count(Evaluation.id)).where(
                Evaluation.organization_id == org, Evaluation.status == EvaluationStatus.RUNNING
            )
        )
        or 0
    )
    classrooms = (
        db.scalar(select(func.count(Classroom.id)).where(Classroom.organization_id == org)) or 0
    )
    # Seule la dernière campagne de chaque évaluation compte dans l'indicateur.
    latest_runs = (
        select(func.max(CorrectionRun.id).label("run_id"))
        .join(Evaluation, Evaluation.id == CorrectionRun.evaluation_id)
        .where(Evaluation.organization_id == org, CorrectionRun.status == RunStatus.DONE)
        .group_by(CorrectionRun.evaluation_id)
        .subquery()
    )
    avg_row = db.execute(
        select(func.sum(CorrectionResult.auto_score), func.sum(CorrectionResult.max_score))
        .join(latest_runs, latest_runs.c.run_id == CorrectionResult.run_id)
    ).first()
    average = None
    if avg_row and avg_row[0] is not None and avg_row[1]:
        average = round(avg_row[0] / avg_row[1] * 100, 1)
    return {
        "teachers": counts.get("teacher", 0),
        "students": counts.get("student", 0),
        "admins": counts.get("admin", 0),
        "classrooms": classrooms,
        "evaluations": evaluations,
        "running_sessions": running,
        "average_success": average,
    }


@router.get("/stats/teacher")
def stats_teacher(user: TeacherUser, db: DbSession) -> dict:
    """Indicateurs de la page d'accueil enseignant, limités à ses évaluations."""
    filters = [Evaluation.organization_id == user.organization_id]
    if user.role is Role.TEACHER:
        filters.append(Evaluation.teacher_id == user.id)

    def count(*extra) -> int:
        return db.scalar(select(func.count(Evaluation.id)).where(*filters, *extra)) or 0

    evaluation_ids = list(db.scalars(select(Evaluation.id).where(*filters)))
    students = 0
    if evaluation_ids:
        students = (
            db.scalar(
                select(func.count(func.distinct(Participation.student_id))).where(
                    Participation.evaluation_id.in_(evaluation_ids)
                )
            )
            or 0
        )

    # Moyenne de réussite sur la dernière campagne terminée de chaque évaluation.
    average = None
    if evaluation_ids:
        latest_runs = (
            select(func.max(CorrectionRun.id).label("run_id"))
            .where(
                CorrectionRun.evaluation_id.in_(evaluation_ids),
                CorrectionRun.status == RunStatus.DONE,
            )
            .group_by(CorrectionRun.evaluation_id)
            .subquery()
        )
        row = db.execute(
            select(func.sum(CorrectionResult.auto_score), func.sum(CorrectionResult.max_score))
            .join(latest_runs, latest_runs.c.run_id == CorrectionResult.run_id)
        ).first()
        if row and row[0] is not None and row[1]:
            average = round(row[0] / row[1] * 100, 1)

    return {
        "evaluations": count(),
        "running": count(Evaluation.status == EvaluationStatus.RUNNING),
        "scheduled": count(
            Evaluation.status.in_([EvaluationStatus.DRAFT, EvaluationStatus.SCHEDULED])
        ),
        "to_correct": count(
            Evaluation.status.in_([EvaluationStatus.CLOSED, EvaluationStatus.CORRECTED])
        ),
        "students": students,
        "average_success": average,
    }
