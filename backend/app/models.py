from __future__ import annotations

import enum
import json
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from .db import Base, SoftDeleteMixin


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# JSONB sur PostgreSQL (indexable, stockage binaire), JSON ailleurs.
JSONColumn = JSON().with_variant(JSONB, "postgresql")


class JSONList(TypeDecorator):
    """Liste JSON, relue en liste quel que soit le type réel de la colonne.

    Les colonnes ajoutées après coup à une base existante le sont en TEXT (voir
    `db._ADDED_COLUMNS`) : le pilote rend alors la chaîne JSON brute, et un
    `list(...)` la découpait caractère par caractère.
    """

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(JSONB())
        return dialect.type_descriptor(JSON())

    def process_result_value(self, value, _dialect):
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except ValueError:
                return []
        return _unsplit(value) if isinstance(value, list) else []


def _unsplit(value: list) -> list:
    """Répare une liste abîmée par l'ancien bogue : la chaîne JSON découpée
    caractère par caractère, parfois plusieurs fois de suite (copie de copie)."""
    while len(value) > 1 and all(isinstance(c, str) and len(c) == 1 for c in value):
        try:
            parsed = json.loads("".join(value))
        except ValueError:
            break
        while isinstance(parsed, str):
            try:
                parsed = json.loads(parsed)
            except ValueError:
                break
        if not isinstance(parsed, list):
            break
        value = parsed
    return value


class UTCDateTime(TypeDecorator):
    """Garantit des datetimes toujours conscients du fuseau (SQLite les perd)."""

    impl = DateTime(timezone=True)
    cache_ok = True

    def process_bind_param(self, value, _dialect):
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value

    def process_result_value(self, value, _dialect):
        if value is not None and value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value


class Role(str, enum.Enum):
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT = "student"


class EvaluationKind(str, enum.Enum):
    """Nature de l'évaluation : ce que l'enseignante annonce à sa classe."""

    DEVOIR = "devoir"
    INTERRO = "interro"
    EXAMEN = "examen"


class EvaluationStatus(str, enum.Enum):
    DRAFT = "draft"              # Brouillon
    SCHEDULED = "scheduled"      # Programmée / Prête
    RUNNING = "running"          # En cours
    CLOSED = "closed"            # Terminée
    CORRECTING = "correcting"    # En correction
    CORRECTED = "corrected"      # Corrigée
    VALIDATED = "validated"      # Validée / Archivée
    CANCELLED = "cancelled"      # Annulée : gardée dans l'historique, hors notes et moyennes


class RunStatus(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    PARTIAL = "partial"
    FAILED = "failed"


class ResultStatus(str, enum.Enum):
    OK = "ok"
    COMPILE_ERROR = "compile_error"
    RUNTIME_ERROR = "runtime_error"
    TIMEOUT = "timeout"
    NO_SUBMISSION = "no_submission"


class TestKind(str, enum.Enum):
    OFFICIAL = "official"
    DIAGNOSTIC = "diagnostic"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class OrganizationKind(str, enum.Enum):
    # Espace d'un enseignant inscrit seul : il y gère lui-même classes et matières.
    PERSONAL = "personal"
    # Établissement : une administration, plusieurs enseignants.
    INSTITUTION = "institution"


class Plan(str, enum.Enum):
    FREE = "free"  # Offre gratuite, bornée (voir `plans.FREE_LIMITS`)
    PRO = "pro"    # Sans limite


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    settings: Mapped[dict] = mapped_column(JSONColumn, default=dict)
    kind: Mapped[str] = mapped_column(String(20), default=OrganizationKind.INSTITUTION.value)
    plan: Mapped[str] = mapped_column(String(20), default=Plan.PRO.value)

    @property
    def is_personal(self) -> bool:
        return self.kind == OrganizationKind.PERSONAL.value


class User(Base, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("organization_id", "email", name="uq_user_org_email"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    email: Mapped[str] = mapped_column(String(190), index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(160))
    role: Mapped[Role] = mapped_column(Enum(Role), index=True)
    matricule: Mapped[str | None] = mapped_column(String(60), default=None)
    # Photo de profil, en data URL : l'image est réduite dans le navigateur.
    photo: Mapped[str | None] = mapped_column(Text, default=None)
    # « F » ou « M » : accorde les libellés (Enseignante, Étudiante).
    gender: Mapped[str | None] = mapped_column(String(1), default=None)
    # En-tête des feuilles de l'enseignant (logo, lignes, titre, disposition) :
    # posé sur chacune de ses épreuves, côté apprenant comme côté correction.
    sheet_header: Mapped[dict | None] = mapped_column(JSONColumn, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    organization: Mapped[Organization] = relationship()


class Subject(Base, SoftDeleteMixin, TimestampMixin):
    __tablename__ = "subjects"
    __table_args__ = (UniqueConstraint("organization_id", "name", name="uq_subject_org_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    # Langage enseigné : une clé de `grading.languages.DISCIPLINES` (« c »,
    # « algo »…). Il fixe celui des épreuves rattachées à la matière.
    language: Mapped[str] = mapped_column(String(30), default="c")
    # Enseignant qui l'a créée : lui seul la renomme ou la supprime.
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None, index=True)


class PlatformSetting(Base):
    """Réglage de toute la plateforme, posé par l'administration (langages ouverts…)."""

    __tablename__ = "platform_settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict | list] = mapped_column(JSONColumn, default=dict)


class Classroom(Base, SoftDeleteMixin, TimestampMixin):
    __tablename__ = "classrooms"

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    level: Mapped[str | None] = mapped_column(String(60), default=None)
    # Code que l'enseignant donne à sa classe pour qu'elle s'inscrive. Il ne sert
    # qu'à entrer : le fermer ou le changer laisse les inscrits en place.
    join_code: Mapped[str | None] = mapped_column(String(16), default=None, unique=True, index=True)
    join_code_expires_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    # L'enseignant qui l'a créée. Nul pour les classes posées par l'administration
    # et pour celles d'avant cette colonne.
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)


class ClassroomShare(Base, TimestampMixin):
    """Un enseignant invité dans la classe d'un autre, même d'un autre espace.

    La classe reste où elle est, avec ses inscrits : l'invité y fait passer ses
    épreuves, et l'apprenant n'a jamais qu'une classe.
    """

    __tablename__ = "classroom_shares"
    __table_args__ = (UniqueConstraint("classroom_id", "teacher_id", name="uq_classroom_share"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    classroom_id: Mapped[int] = mapped_column(ForeignKey("classrooms.id"), index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    invited_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (UniqueConstraint("classroom_id", "student_id", name="uq_enrollment"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    classroom_id: Mapped[int] = mapped_column(ForeignKey("classrooms.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)


class TeacherAssignment(Base):
    """Enseignant rattaché à une classe / matière."""

    __tablename__ = "teacher_assignments"
    __table_args__ = (
        UniqueConstraint("teacher_id", "classroom_id", "subject_id", name="uq_teacher_class_subject"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    classroom_id: Mapped[int] = mapped_column(ForeignKey("classrooms.id"), index=True)
    subject_id: Mapped[int] = mapped_column(ForeignKey("subjects.id"), index=True)


class Evaluation(Base, SoftDeleteMixin, TimestampMixin):
    __tablename__ = "evaluations"
    __table_args__ = (Index("ix_eval_org_status", "organization_id", "status"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    classroom_id: Mapped[int | None] = mapped_column(ForeignKey("classrooms.id"), index=True)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), index=True)

    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[EvaluationKind] = mapped_column(
        Enum(EvaluationKind), default=EvaluationKind.DEVOIR, index=True
    )
    description: Mapped[str] = mapped_column(Text, default="")
    instructions: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str] = mapped_column(String(30), default="c")
    duration_minutes: Mapped[int] = mapped_column(Integer, default=90)
    scheduled_start: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    status: Mapped[EvaluationStatus] = mapped_column(
        Enum(EvaluationStatus), default=EvaluationStatus.DRAFT, index=True
    )
    total_points: Mapped[float] = mapped_column(Float, default=20.0)
    rules: Mapped[dict] = mapped_column(JSONColumn, default=dict)  # fullscreen, block_paste, allow_submit
    # Modèle de la banque d'évaluations : une épreuve complète mise de côté pour
    # être réutilisée. Elle n'est jamais passée par un apprenant : on en tire une
    # copie, qui vit ensuite sa propre vie.
    is_template: Mapped[bool] = mapped_column(Boolean, default=False)

    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    closed_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    validated_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)

    exercises: Mapped[list[Exercise]] = relationship(
        back_populates="evaluation", cascade="all, delete-orphan", order_by="Exercise.position"
    )


class Exercise(Base, SoftDeleteMixin):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    evaluation_id: Mapped[int] = mapped_column(ForeignKey("evaluations.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(200))
    statement: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str] = mapped_column(String(30), default="c")
    points: Mapped[float] = mapped_column(Float, default=5.0)
    starter_code: Mapped[str] = mapped_column(Text, default="")
    # « code » : éditeur de code. « algo » : éditeur d'algorithme en blocs.
    kind: Mapped[str] = mapped_column(String(20), default="code")
    settings: Mapped[dict] = mapped_column(JSONColumn, default=dict)

    evaluation: Mapped[Evaluation] = relationship(back_populates="exercises")
    tests: Mapped[list[TestCase]] = relationship(
        back_populates="exercise", cascade="all, delete-orphan", order_by="TestCase.position"
    )


class TestCase(Base):
    __tablename__ = "test_cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(120), default="Test")
    kind: Mapped[TestKind] = mapped_column(Enum(TestKind), default=TestKind.OFFICIAL)
    stdin: Mapped[str] = mapped_column(Text, default="")
    expected_stdout: Mapped[str] = mapped_column(Text, default="")
    comparison: Mapped[str] = mapped_column(String(20), default="trim")  # trim | exact | numeric
    points: Mapped[float] = mapped_column(Float, default=1.0)
    timeout_ms: Mapped[int] = mapped_column(Integer, default=2000)
    # Critère « fonction attendue » du barème que ce test appelle
    # (`settings.criteria`). Vide : le test fait tourner le programme entier et
    # écrit ses valeurs sur l'entrée standard.
    target_id: Mapped[str | None] = mapped_column(String(24), nullable=True, default=None)
    # Types des valeurs d'entrée, pour un test de programme entier. Un test
    # d'appel les tient du critère qu'il vise.
    input_types: Mapped[list] = mapped_column(JSONList, default=list)
    # Type de la valeur attendue : il décide du champ de saisie de l'enseignant.
    expected_type: Mapped[str] = mapped_column(String(20), default="string")
    # Valeurs d'entrée typées, dans l'ordre des types déclarés.
    args: Mapped[list] = mapped_column(JSONList, default=list)

    exercise: Mapped[Exercise] = relationship(back_populates="tests")


class BankExercise(Base, SoftDeleteMixin, TimestampMixin):
    """Exercice réutilisable. Indépendant des évaluations : l'importer dans une
    évaluation en fait une copie, que la banque n'affectera plus."""

    __tablename__ = "bank_exercises"
    __table_args__ = (Index("ix_bank_org_author", "organization_id", "author_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    subject_id: Mapped[int | None] = mapped_column(ForeignKey("subjects.id"), default=None)
    title: Mapped[str] = mapped_column(String(200))
    statement: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str] = mapped_column(String(30), default="c")
    points: Mapped[float] = mapped_column(Float, default=5.0)
    starter_code: Mapped[str] = mapped_column(Text, default="")
    kind: Mapped[str] = mapped_column(String(20), default="code")
    settings: Mapped[dict] = mapped_column(JSONColumn, default=dict)
    tags: Mapped[list] = mapped_column(JSONColumn, default=list)
    is_shared: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)
    uses: Mapped[int] = mapped_column(Integer, default=0)

    tests: Mapped[list["BankTestCase"]] = relationship(
        back_populates="exercise", cascade="all, delete-orphan", order_by="BankTestCase.position"
    )


class BankTestCase(Base):
    __tablename__ = "bank_test_cases"

    id: Mapped[int] = mapped_column(primary_key=True)
    bank_exercise_id: Mapped[int] = mapped_column(ForeignKey("bank_exercises.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=1)
    name: Mapped[str] = mapped_column(String(120), default="Test")
    kind: Mapped[TestKind] = mapped_column(Enum(TestKind), default=TestKind.OFFICIAL)
    stdin: Mapped[str] = mapped_column(Text, default="")
    expected_stdout: Mapped[str] = mapped_column(Text, default="")
    comparison: Mapped[str] = mapped_column(String(20), default="trim")
    points: Mapped[float] = mapped_column(Float, default=1.0)
    timeout_ms: Mapped[int] = mapped_column(Integer, default=2000)
    target_id: Mapped[str | None] = mapped_column(String(24), nullable=True, default=None)
    input_types: Mapped[list] = mapped_column(JSONList, default=list)
    expected_type: Mapped[str] = mapped_column(String(20), default="string")
    args: Mapped[list] = mapped_column(JSONList, default=list)

    exercise: Mapped[BankExercise] = relationship(back_populates="tests")


class CommunityItem(Base, SoftDeleteMixin, TimestampMixin):
    """Exercice ou sujet complet publié pour toute la plateforme.

    La publication est un instantané : le contenu (énoncés, jeux de tests,
    barèmes) est recopié dans `content`, si bien que retoucher ou supprimer
    l'original ne change rien à ce qu'ont déjà récupéré les autres. À l'inverse,
    ce qu'on tire de la communauté (banque, évaluation) en est une copie.
    """

    __tablename__ = "community_items"
    __table_args__ = (Index("ix_community_type_created", "item_type", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    # « exercise » : un exercice seul. « subject » : une épreuve entière.
    item_type: Mapped[str] = mapped_column(String(20), default="exercise")
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str] = mapped_column(String(30), default="c")
    # Nom, pas identifiant : les matières appartiennent à chaque établissement.
    subject_name: Mapped[str | None] = mapped_column(String(120), default=None)
    tags: Mapped[list] = mapped_column(JSONList, default=list)
    content: Mapped[dict] = mapped_column(JSONColumn, default=dict)
    exercises_count: Mapped[int] = mapped_column(Integer, default=1)
    total_points: Mapped[float] = mapped_column(Float, default=0.0)
    uses: Mapped[int] = mapped_column(Integer, default=0)


class Participation(Base):
    __tablename__ = "participations"
    __table_args__ = (UniqueConstraint("evaluation_id", "student_id", name="uq_participation"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    evaluation_id: Mapped[int] = mapped_column(ForeignKey("evaluations.id"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    last_seen_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    last_saved_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    submitted_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    frozen_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    incidents: Mapped[int] = mapped_column(Integer, default=0)


class Submission(Base):
    """Production d'un apprenant pour un exercice. Figée à la clôture."""

    __tablename__ = "submissions"
    __table_args__ = (UniqueConstraint("participation_id", "exercise_id", name="uq_submission"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    participation_id: Mapped[int] = mapped_column(ForeignKey("participations.id"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    code: Mapped[str] = mapped_column(Text, default="")
    version: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class CorrectionRun(Base):
    """Campagne de correction. Historisée, jamais écrasée (CDC X)."""

    __tablename__ = "correction_runs"
    __table_args__ = (UniqueConstraint("evaluation_id", "number", name="uq_run_number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    evaluation_id: Mapped[int] = mapped_column(ForeignKey("evaluations.id"), index=True)
    number: Mapped[int] = mapped_column(Integer, default=1)
    triggered_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[RunStatus] = mapped_column(Enum(RunStatus), default=RunStatus.PENDING, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    finished_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    processed: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer, default=0)
    stats: Mapped[dict] = mapped_column(JSONColumn, default=dict)
    error: Mapped[str | None] = mapped_column(Text, default=None)


class CorrectionResult(Base):
    __tablename__ = "correction_results"
    __table_args__ = (
        UniqueConstraint("run_id", "participation_id", "exercise_id", name="uq_result"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("correction_runs.id"), index=True)
    participation_id: Mapped[int] = mapped_column(ForeignKey("participations.id"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    code_snapshot: Mapped[str] = mapped_column(Text, default="")
    auto_score: Mapped[float] = mapped_column(Float, default=0.0)
    max_score: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[ResultStatus] = mapped_column(Enum(ResultStatus), default=ResultStatus.OK)
    compile_log: Mapped[str] = mapped_column(Text, default="")
    tests: Mapped[list] = mapped_column(JSONColumn, default=list)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)


class ScoreAdjustment(Base):
    """Réajustement manuel d'une note, systématiquement tracé (CDC VI/X)."""

    __tablename__ = "score_adjustments"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("correction_runs.id"), index=True)
    participation_id: Mapped[int] = mapped_column(ForeignKey("participations.id"), index=True)
    exercise_id: Mapped[int | None] = mapped_column(ForeignKey("exercises.id"), default=None)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    previous_score: Mapped[float] = mapped_column(Float, default=0.0)
    new_score: Mapped[float] = mapped_column(Float, default=0.0)
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class Appreciation(Base):
    """Appréciation rédigée par l'enseignant sur une copie.

    `exercise_id` nul : appréciation générale de la copie. Sinon : commentaire
    attaché à un exercice. Visible par l'apprenant une fois les résultats publiés.
    """

    __tablename__ = "appreciations"
    __table_args__ = (Index("ix_appreciation_participation", "participation_id", "exercise_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    participation_id: Mapped[int] = mapped_column(ForeignKey("participations.id"), index=True)
    exercise_id: Mapped[int | None] = mapped_column(ForeignKey("exercises.id"), default=None)
    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow, onupdate=utcnow)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notif_user_read", "user_id", "read"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(500), default="")
    link: Mapped[str] = mapped_column(String(300), default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    used_at: Mapped[datetime | None] = mapped_column(UTCDateTime(), default=None)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class EmailVerification(Base):
    """Code envoyé à une adresse avant la création du compte qui la porte.

    Seul le dernier code d'une adresse compte ; les précédents restent le temps
    de compter les envois par adresse IP."""

    __tablename__ = "email_verifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(190), index=True)
    code_hash: Mapped[str] = mapped_column(String(64))
    ip: Mapped[str] = mapped_column(String(64), index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(UTCDateTime())
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    __table_args__ = (Index("ix_audit_org_created", "organization_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    organization_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), default=None)
    action: Mapped[str] = mapped_column(String(60), index=True)
    target_type: Mapped[str] = mapped_column(String(40), default="")
    target_id: Mapped[int | None] = mapped_column(Integer, default=None)
    meta: Mapped[dict] = mapped_column(JSONColumn, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime(), default=utcnow)
