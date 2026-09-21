"""Espace établissement : utilisateurs, classes, matières, statistiques."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import delete, func, select

from ..audit import log
from ..deps import AdminUser, CurrentUser, DbSession, StructureManager, TeacherUser
from ..grading.languages import ALGO, DISCIPLINES, enabled_keys
from ..models import (
    AuditLog,
    BankExercise,
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
    AdminUserOut,
    AssignmentOut,
    AssignPayload,
    ClassroomCreate,
    ClassroomDetailOut,
    ClassroomOut,
    ClassroomUpdate,
    DisciplineOut,
    EnrollPayload,
    EvaluationOut,
    NamedCreate,
    Page,
    PasswordResetOut,
    PlanOut,
    SubjectAdminOut,
    SubjectCreate,
    SubjectOut,
    SubjectUpdate,
    UserCreate,
    UserOut,
    UserUpdate,
)
from ..plans import check_classroom_quota, limits, usage
from ..security import hash_password

router = APIRouter(prefix="/api", tags=["établissement"])


# ----- Utilisateurs -----
def _get_user(db, admin: User, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None or user.organization_id != admin.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Utilisateur introuvable")
    return user


def _get_classroom(db, user: User, classroom_id: int) -> Classroom:
    classroom = db.get(Classroom, classroom_id)
    if classroom is None or classroom.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Classe introuvable")
    return classroom


def _get_subject(db, user: User, subject_id: int) -> Subject:
    subject = db.get(Subject, subject_id)
    if subject is None or subject.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Matière introuvable")
    return subject


def _email_taken(db, email: str, except_id: int | None = None) -> bool:
    """La connexion retrouve le compte par son seul e-mail : il est unique sur
    toute la plateforme, pas seulement dans l'établissement."""
    query = select(User.id).where(func.lower(User.email) == email.lower())
    if except_id is not None:
        query = query.where(User.id != except_id)
    return db.scalar(query) is not None


@router.get("/users", response_model=Page)
def list_users(
    admin: AdminUser,
    db: DbSession,
    role: Role | None = None,
    active: bool | None = None,
    classroom_id: int | None = None,
    without_class: bool = False,
    q: str | None = Query(default=None, max_length=100),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
) -> Page:
    filters = [User.organization_id == admin.organization_id]
    if without_class:
        filters += [User.role == Role.STUDENT, ~User.id.in_(select(Enrollment.student_id))]
    if role is not None:
        filters.append(User.role == role)
    if active is not None:
        filters.append(User.is_active == active)
    if classroom_id is not None:
        filters.append(
            User.id.in_(
                select(Enrollment.student_id).where(Enrollment.classroom_id == classroom_id)
            )
        )
    if q:
        pattern = f"%{q.lower()}%"
        filters.append(
            func.lower(User.full_name).like(pattern)
            | func.lower(User.email).like(pattern)
            | func.lower(func.coalesce(User.matricule, "")).like(pattern)
        )
    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    users = list(
        db.scalars(
            select(User)
            .where(*filters)
            .order_by(User.full_name)
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    )
    ids = [u.id for u in users]
    classrooms: dict[int, list[str]] = {}
    last_login: dict[int, object] = {}
    if ids:
        for student_id, name in db.execute(
            select(Enrollment.student_id, Classroom.name)
            .join(Classroom, Classroom.id == Enrollment.classroom_id)
            .where(Enrollment.student_id.in_(ids))
            .order_by(Classroom.name)
        ):
            classrooms.setdefault(student_id, []).append(name)
        for teacher_id, name in db.execute(
            select(TeacherAssignment.teacher_id, Classroom.name)
            .join(Classroom, Classroom.id == TeacherAssignment.classroom_id)
            .where(TeacherAssignment.teacher_id.in_(ids))
            .distinct()
            .order_by(Classroom.name)
        ):
            classrooms.setdefault(teacher_id, []).append(name)
        last_login = dict(
            db.execute(
                select(AuditLog.actor_id, func.max(AuditLog.created_at))
                .where(AuditLog.action == "auth.login", AuditLog.actor_id.in_(ids))
                .group_by(AuditLog.actor_id)
            ).all()
        )
    items = [
        AdminUserOut(
            **UserOut.model_validate(u).model_dump(),
            created_at=u.created_at,
            last_login_at=last_login.get(u.id),
            classrooms=classrooms.get(u.id, []),
        ).model_dump(mode="json")
        for u in users
    ]
    return Page(items=items, total=total, page=page, page_size=page_size)


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, admin: AdminUser, db: DbSession) -> UserOut:
    email = payload.email.lower()
    if _email_taken(db, email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cet e-mail est déjà utilisé")
    classroom = None
    if payload.classroom_id is not None:
        if payload.role is not Role.STUDENT:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY, "Seul un étudiant s'inscrit dans une classe"
            )
        classroom = _get_classroom(db, admin, payload.classroom_id)
    user = User(
        organization_id=admin.organization_id,
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        matricule=(payload.matricule or "").strip() or None,
        gender=payload.gender,
    )
    db.add(user)
    db.flush()
    if classroom is not None:
        db.add(Enrollment(classroom_id=classroom.id, student_id=user.id))
    log(db, admin, admin.organization_id, "user.created", "user", user.id, email=email,
        role=payload.role.value)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, payload: UserUpdate, admin: AdminUser, db: DbSession) -> UserOut:
    user = _get_user(db, admin, user_id)
    data = payload.model_dump(exclude_unset=True)
    # Un administrateur ne se retire pas lui-même l'accès : l'établissement
    # pourrait se retrouver sans personne pour le gérer.
    if user.id == admin.id:
        if data.get("is_active") is False:
            raise HTTPException(status.HTTP_409_CONFLICT, "Vous ne pouvez pas désactiver votre propre compte")
        if data.get("role") not in (None, Role.ADMIN):
            raise HTTPException(status.HTTP_409_CONFLICT, "Vous ne pouvez pas changer votre propre rôle")
    if data.get("email"):
        data["email"] = data["email"].lower()
        if _email_taken(db, data["email"], except_id=user.id):
            raise HTTPException(status.HTTP_409_CONFLICT, "Cet e-mail est déjà utilisé")
    if data.get("role") not in (None, user.role):
        # Les rattachements d'un rôle n'ont plus de sens dans l'autre.
        if user.role is Role.STUDENT:
            db.execute(delete(Enrollment).where(Enrollment.student_id == user.id))
        if user.role is Role.TEACHER:
            db.execute(delete(TeacherAssignment).where(TeacherAssignment.teacher_id == user.id))
    if "password" in data and data["password"]:
        user.password_hash = hash_password(data.pop("password"))
        data["password"] = True
    fields = list(data)
    data.pop("password", None)
    for field, value in data.items():
        if field in ("email", "full_name") and not value:
            continue
        setattr(user, field, value)
    log(db, admin, admin.organization_id, "user.updated", "user", user.id, fields=fields)
    db.commit()
    db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetOut)
def reset_password(user_id: int, admin: AdminUser, db: DbSession) -> PasswordResetOut:
    """Mot de passe provisoire, montré une seule fois à l'administrateur."""
    user = _get_user(db, admin, user_id)
    alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    password = "".join(secrets.choice(alphabet) for _ in range(12))
    user.password_hash = hash_password(password)
    log(db, admin, admin.organization_id, "user.password_reset", "user", user.id)
    db.commit()
    return PasswordResetOut(password=password)


# ----- Matières -----
@router.get("/disciplines", response_model=list[DisciplineOut])
def list_disciplines(teacher: TeacherUser, db: DbSession) -> list[DisciplineOut]:
    """Langages ouverts par l'administration, parmi lesquels l'enseignant choisit
    celui de chacune de ses matières."""
    enabled = enabled_keys(db)
    return [
        DisciplineOut(key=key, label=DISCIPLINES[key], kind="algo" if key == ALGO else "code",
                      enabled=True)
        for key in enabled
    ]


@router.get("/subjects", response_model=list[SubjectOut])
def list_subjects(user: CurrentUser, db: DbSession) -> list[SubjectOut]:
    subjects = db.scalars(
        select(Subject).where(Subject.organization_id == user.organization_id).order_by(Subject.name)
    )
    return [SubjectOut.model_validate(s) for s in subjects]


@router.get("/admin/subjects", response_model=list[SubjectAdminOut])
def list_subjects_admin(admin: AdminUser, db: DbSession) -> list[SubjectAdminOut]:
    org = admin.organization_id

    def counts(column, *where) -> dict:
        return dict(db.execute(select(column, func.count()).where(*where).group_by(column)).all())

    evaluations = counts(Evaluation.subject_id, Evaluation.organization_id == org,
                         Evaluation.is_template.is_(False))
    bank = counts(BankExercise.subject_id, BankExercise.organization_id == org)
    teachers = dict(
        db.execute(
            select(TeacherAssignment.subject_id, func.count(func.distinct(TeacherAssignment.teacher_id)))
            .group_by(TeacherAssignment.subject_id)
        ).all()
    )
    subjects = list(
        db.scalars(select(Subject).where(Subject.organization_id == org).order_by(Subject.name))
    )
    author_ids = {s.author_id for s in subjects if s.author_id}
    authors = (
        dict(db.execute(select(User.id, User.full_name).where(User.id.in_(author_ids))).all())
        if author_ids
        else {}
    )
    return [
        SubjectAdminOut(
            id=s.id,
            name=s.name,
            language=s.language,
            author_id=s.author_id,
            author_name=authors.get(s.author_id),
            evaluations_count=evaluations.get(s.id, 0),
            bank_count=bank.get(s.id, 0),
            teachers_count=teachers.get(s.id, 0),
        )
        for s in subjects
    ]


def _subject_name_taken(db, org_id: int, name: str, except_id: int | None = None) -> bool:
    query = select(Subject.id).where(
        Subject.organization_id == org_id, func.lower(Subject.name) == name.lower()
    )
    if except_id is not None:
        query = query.where(Subject.id != except_id)
    return db.scalar(query) is not None


def _check_language(db, language: str) -> None:
    if language not in DISCIPLINES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Langage inconnu")
    if language not in enabled_keys(db):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Ce langage est désactivé par l'administration"
        )


def _subject_used(db, subject: Subject) -> int:
    used = db.scalar(select(func.count(Evaluation.id)).where(Evaluation.subject_id == subject.id))
    return (used or 0) + (
        db.scalar(select(func.count(BankExercise.id)).where(BankExercise.subject_id == subject.id)) or 0
    )


def _own_subject(db, teacher: User, subject_id: int) -> Subject:
    """Seul l'enseignant qui a créé une matière la modifie."""
    subject = _get_subject(db, teacher, subject_id)
    if subject.author_id != teacher.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Seul l'enseignant qui a créé cette matière peut la modifier"
        )
    return subject


@router.post("/subjects", response_model=SubjectOut, status_code=status.HTTP_201_CREATED)
def create_subject(payload: SubjectCreate, teacher: TeacherUser, db: DbSession) -> SubjectOut:
    name = payload.name.strip()
    _check_language(db, payload.language)
    if _subject_name_taken(db, teacher.organization_id, name):
        raise HTTPException(status.HTTP_409_CONFLICT, "Matière déjà existante")
    subject = Subject(
        organization_id=teacher.organization_id,
        name=name,
        language=payload.language,
        author_id=teacher.id,
    )
    db.add(subject)
    db.flush()
    log(db, teacher, teacher.organization_id, "subject.created", "subject", subject.id,
        name=name, language=payload.language)
    db.commit()
    db.refresh(subject)
    return SubjectOut.model_validate(subject)


@router.patch("/subjects/{subject_id}", response_model=SubjectOut)
def update_subject(
    subject_id: int, payload: SubjectUpdate, teacher: TeacherUser, db: DbSession
) -> SubjectOut:
    subject = _own_subject(db, teacher, subject_id)
    if payload.name is not None:
        name = payload.name.strip()
        if _subject_name_taken(db, teacher.organization_id, name, except_id=subject.id):
            raise HTTPException(status.HTTP_409_CONFLICT, "Matière déjà existante")
        if name != subject.name:
            log(db, teacher, teacher.organization_id, "subject.renamed", "subject", subject.id,
                previous=subject.name, name=name)
            subject.name = name
    if payload.language is not None and payload.language != subject.language:
        _check_language(db, payload.language)
        # Les épreuves déjà rattachées ont été écrites pour l'ancien langage.
        if _subject_used(db, subject):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Des évaluations ou des exercices utilisent cette matière : son langage ne change plus",
            )
        subject.language = payload.language
    db.commit()
    return SubjectOut.model_validate(subject)


@router.delete("/subjects/{subject_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subject(subject_id: int, teacher: TeacherUser, db: DbSession) -> None:
    subject = _own_subject(db, teacher, subject_id)
    if _subject_used(db, subject):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Des évaluations ou des exercices utilisent cette matière : elle ne peut pas être supprimée",
        )
    db.execute(delete(TeacherAssignment).where(TeacherAssignment.subject_id == subject.id))
    log(db, teacher, teacher.organization_id, "subject.deleted", "subject", subject.id, name=subject.name)
    db.delete(subject)
    db.commit()


# ----- Classes -----
@router.get("/classrooms", response_model=list[ClassroomOut])
def list_classrooms(user: CurrentUser, db: DbSession) -> list[ClassroomOut]:
    rows = list(
        db.scalars(
            select(Classroom)
            .where(Classroom.organization_id == user.organization_id)
            .order_by(Classroom.name)
        )
    )
    ids = [c.id for c in rows]
    students = teachers = evaluations = {}
    if ids:
        students = dict(
            db.execute(
                select(Enrollment.classroom_id, func.count(Enrollment.id))
                .where(Enrollment.classroom_id.in_(ids))
                .group_by(Enrollment.classroom_id)
            ).all()
        )
        teachers = dict(
            db.execute(
                select(TeacherAssignment.classroom_id, func.count(func.distinct(TeacherAssignment.teacher_id)))
                .where(TeacherAssignment.classroom_id.in_(ids))
                .group_by(TeacherAssignment.classroom_id)
            ).all()
        )
        evaluations = dict(
            db.execute(
                select(Evaluation.classroom_id, func.count(Evaluation.id))
                .where(Evaluation.classroom_id.in_(ids), Evaluation.is_template.is_(False))
                .group_by(Evaluation.classroom_id)
            ).all()
        )
    return [
        ClassroomOut(
            id=c.id,
            name=c.name,
            level=c.level,
            students_count=students.get(c.id, 0),
            teachers_count=teachers.get(c.id, 0),
            evaluations_count=evaluations.get(c.id, 0),
        )
        for c in rows
    ]


@router.get("/classrooms/{classroom_id}", response_model=ClassroomDetailOut)
def get_classroom(classroom_id: int, user: CurrentUser, db: DbSession) -> ClassroomDetailOut:
    classroom = _get_classroom(db, user, classroom_id)
    students_count = db.scalar(
        select(func.count(Enrollment.id)).where(Enrollment.classroom_id == classroom_id)
    ) or 0
    subject_row = db.execute(
        select(Subject.name)
        .join(Evaluation, Evaluation.subject_id == Subject.id)
        .where(Evaluation.classroom_id == classroom_id)
        .limit(1)
    ).first()
    # Le code d'accès reste entre les mains de l'équipe : un étudiant n'a pas
    # à le lire, encore moins à le faire circuler.
    staff = user.role is not Role.STUDENT
    return ClassroomDetailOut(
        id=classroom.id,
        name=classroom.name,
        level=classroom.level,
        students_count=students_count,
        subject_name=subject_row[0] if subject_row else None,
        created_at=classroom.created_at,
        join_code=classroom.join_code if staff else None,
        join_code_expires_at=classroom.join_code_expires_at if staff else None,
    )


@router.get("/classrooms/{classroom_id}/evaluations", response_model=list[EvaluationOut])
def classroom_evaluations(classroom_id: int, user: CurrentUser, db: DbSession) -> list[EvaluationOut]:
    _get_classroom(db, user, classroom_id)
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
def create_classroom(payload: ClassroomCreate, manager: StructureManager, db: DbSession) -> ClassroomOut:
    check_classroom_quota(db, manager.organization)
    classroom = Classroom(
        organization_id=manager.organization_id, name=payload.name.strip(), level=payload.level or None
    )
    db.add(classroom)
    db.flush()
    log(db, manager, manager.organization_id, "classroom.created", "classroom", classroom.id,
        name=classroom.name)
    db.commit()
    db.refresh(classroom)
    return ClassroomOut(id=classroom.id, name=classroom.name, level=classroom.level)


@router.patch("/classrooms/{classroom_id}", response_model=ClassroomOut)
def update_classroom(
    classroom_id: int, payload: ClassroomUpdate, manager: StructureManager, db: DbSession
) -> ClassroomOut:
    classroom = _get_classroom(db, manager, classroom_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("name"):
        classroom.name = data["name"].strip()
    if "level" in data:
        classroom.level = data["level"] or None
    log(db, manager, manager.organization_id, "classroom.updated", "classroom", classroom.id,
        fields=list(data))
    db.commit()
    return ClassroomOut(id=classroom.id, name=classroom.name, level=classroom.level)


@router.delete("/classrooms/{classroom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_classroom(classroom_id: int, manager: StructureManager, db: DbSession) -> None:
    classroom = _get_classroom(db, manager, classroom_id)
    if db.scalar(select(func.count(Evaluation.id)).where(Evaluation.classroom_id == classroom.id)):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Des évaluations sont rattachées à cette classe : elle ne peut pas être supprimée",
        )
    db.execute(delete(Enrollment).where(Enrollment.classroom_id == classroom.id))
    db.execute(delete(TeacherAssignment).where(TeacherAssignment.classroom_id == classroom.id))
    log(db, manager, manager.organization_id, "classroom.deleted", "classroom", classroom.id,
        name=classroom.name)
    db.delete(classroom)
    db.commit()


@router.get("/classrooms/{classroom_id}/students", response_model=list[UserOut])
def classroom_students(classroom_id: int, user: CurrentUser, db: DbSession) -> list[UserOut]:
    _get_classroom(db, user, classroom_id)
    students = db.scalars(
        select(User)
        .join(Enrollment, Enrollment.student_id == User.id)
        .where(Enrollment.classroom_id == classroom_id)
        .order_by(User.full_name)
    )
    return [UserOut.model_validate(s) for s in students]


@router.post("/classrooms/{classroom_id}/students", status_code=status.HTTP_204_NO_CONTENT)
def enroll_students(
    classroom_id: int, payload: EnrollPayload, manager: StructureManager, db: DbSession
) -> None:
    classroom = _get_classroom(db, manager, classroom_id)
    valid = set(
        db.scalars(
            select(User.id).where(
                User.id.in_(payload.student_ids),
                User.organization_id == manager.organization_id,
                User.role == Role.STUDENT,
            )
        )
    )
    already = set(
        db.scalars(select(Enrollment.student_id).where(Enrollment.classroom_id == classroom_id))
    )
    added = valid - already
    for student_id in added:
        db.add(Enrollment(classroom_id=classroom_id, student_id=student_id))
    if added:
        log(db, manager, manager.organization_id, "classroom.enrolled", "classroom", classroom.id,
            students=sorted(added))
    db.commit()


@router.delete(
    "/classrooms/{classroom_id}/students/{student_id}", status_code=status.HTTP_204_NO_CONTENT
)
def unenroll_student(classroom_id: int, student_id: int, manager: StructureManager, db: DbSession) -> None:
    classroom = _get_classroom(db, manager, classroom_id)
    enrollment = db.scalar(
        select(Enrollment).where(
            Enrollment.classroom_id == classroom.id, Enrollment.student_id == student_id
        )
    )
    if enrollment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Étudiant non inscrit dans cette classe")
    db.delete(enrollment)
    log(db, manager, manager.organization_id, "classroom.unenrolled", "classroom", classroom.id,
        student=student_id)
    db.commit()


@router.get("/classrooms/{classroom_id}/teachers", response_model=list[AssignmentOut])
def classroom_teachers(classroom_id: int, admin: AdminUser, db: DbSession) -> list[AssignmentOut]:
    _get_classroom(db, admin, classroom_id)
    rows = db.execute(
        select(TeacherAssignment, User, Subject)
        .join(User, User.id == TeacherAssignment.teacher_id)
        .join(Subject, Subject.id == TeacherAssignment.subject_id)
        .where(TeacherAssignment.classroom_id == classroom_id)
        .order_by(User.full_name, Subject.name)
    )
    return [
        AssignmentOut(
            id=a.id,
            teacher_id=u.id,
            teacher_name=u.full_name,
            teacher_email=u.email,
            subject_id=s.id,
            subject_name=s.name,
        )
        for a, u, s in rows
    ]


@router.post(
    "/classrooms/{classroom_id}/teachers",
    response_model=AssignmentOut,
    status_code=status.HTTP_201_CREATED,
)
def assign_teacher(
    classroom_id: int, payload: AssignPayload, admin: AdminUser, db: DbSession
) -> AssignmentOut:
    classroom = _get_classroom(db, admin, classroom_id)
    teacher = db.get(User, payload.teacher_id)
    if (
        teacher is None
        or teacher.organization_id != admin.organization_id
        or teacher.role is not Role.TEACHER
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Enseignant introuvable")
    subject = _get_subject(db, admin, payload.subject_id)
    assignment = db.scalar(
        select(TeacherAssignment).where(
            TeacherAssignment.teacher_id == teacher.id,
            TeacherAssignment.classroom_id == classroom.id,
            TeacherAssignment.subject_id == subject.id,
        )
    )
    if assignment is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cet enseignement est déjà attribué")
    assignment = TeacherAssignment(
        teacher_id=teacher.id, classroom_id=classroom.id, subject_id=subject.id
    )
    db.add(assignment)
    db.flush()
    log(db, admin, admin.organization_id, "classroom.teacher_assigned", "classroom", classroom.id,
        teacher=teacher.id, subject=subject.id)
    db.commit()
    return AssignmentOut(
        id=assignment.id,
        teacher_id=teacher.id,
        teacher_name=teacher.full_name,
        teacher_email=teacher.email,
        subject_id=subject.id,
        subject_name=subject.name,
    )


@router.delete(
    "/classrooms/{classroom_id}/teachers/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT
)
def unassign_teacher(
    classroom_id: int, assignment_id: int, admin: AdminUser, db: DbSession
) -> None:
    classroom = _get_classroom(db, admin, classroom_id)
    assignment = db.get(TeacherAssignment, assignment_id)
    if assignment is None or assignment.classroom_id != classroom.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attribution introuvable")
    log(db, admin, admin.organization_id, "classroom.teacher_unassigned", "classroom",
        classroom.id, teacher=assignment.teacher_id, subject=assignment.subject_id)
    db.delete(assignment)
    db.commit()


# ----- Offre -----
@router.get("/plan", response_model=PlanOut)
def my_plan(user: CurrentUser, db: DbSession) -> PlanOut:
    """L'offre de l'espace et ce qu'il en consomme, pour l'afficher avant qu'une
    création ne soit refusée."""
    org = user.organization
    return PlanOut(kind=org.kind, plan=org.plan, limits=limits(org), usage=usage(db, org))


# ----- Statistiques établissement -----
@router.get("/stats/overview")
def stats_overview(admin: AdminUser, db: DbSession) -> dict:
    org = admin.organization_id
    counts = {
        role.value: db.scalar(
            select(func.count(User.id)).where(User.organization_id == org, User.role == role)
        )
        or 0
        for role in Role
    }
    evaluations = (
        db.scalar(
            select(func.count(Evaluation.id)).where(
                Evaluation.organization_id == org, Evaluation.is_template.is_(False)
            )
        )
        or 0
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
        .where(
            Evaluation.organization_id == org,
            Evaluation.status != EvaluationStatus.CANCELLED,
            CorrectionRun.status == RunStatus.DONE,
        )
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
    inactive = db.scalar(
        select(func.count(User.id)).where(User.organization_id == org, User.is_active.is_(False))
    ) or 0
    # Un étudiant sans classe ne voit aucune épreuve : c'est un oubli à réparer.
    unassigned = db.scalar(
        select(func.count(User.id)).where(
            User.organization_id == org,
            User.role == Role.STUDENT,
            User.is_active.is_(True),
            ~User.id.in_(select(Enrollment.student_id)),
        )
    ) or 0
    return {
        "inactive_users": inactive,
        "students_without_class": unassigned,
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
    # Les moyennes ignorent les épreuves annulées ; le nombre d'élèves, non.
    counted_ids = list(
        db.scalars(
            select(Evaluation.id).where(*filters, Evaluation.status != EvaluationStatus.CANCELLED)
        )
    )
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
    if counted_ids:
        latest_runs = (
            select(func.max(CorrectionRun.id).label("run_id"))
            .where(
                CorrectionRun.evaluation_id.in_(counted_ids),
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
