from __future__ import annotations

from datetime import datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .models import EvaluationKind, EvaluationStatus, ResultStatus, Role, RunStatus, TestKind


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----- Auth -----
class RegisterOrg(BaseModel):
    organization_name: str = Field(min_length=2, max_length=160)
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: Role
    matricule: str | None = None
    is_active: bool
    organization_id: int


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    organization: str


# ----- Organisation -----
class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    role: Role
    password: str = Field(min_length=8, max_length=128)
    matricule: str | None = Field(default=None, max_length=60)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    role: Role | None = None
    is_active: bool | None = None
    matricule: str | None = Field(default=None, max_length=60)
    password: str | None = Field(default=None, min_length=8, max_length=128)


class NamedCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ClassroomCreate(NamedCreate):
    level: str | None = Field(default=None, max_length=60)


class SubjectOut(ORMModel):
    id: int
    name: str


class ClassroomOut(ORMModel):
    id: int
    name: str
    level: str | None = None
    students_count: int = 0


class ClassroomDetailOut(ORMModel):
    id: int
    name: str
    level: str | None = None
    students_count: int = 0
    subject_name: str | None = None
    created_at: datetime | None = None


class EnrollPayload(BaseModel):
    student_ids: list[int] = Field(min_length=1, max_length=500)


# ----- Évaluations -----
class TestCaseIn(BaseModel):
    id: int | None = None
    name: str = Field(default="Test", max_length=120)
    kind: TestKind = TestKind.OFFICIAL
    stdin: str = ""
    expected_stdout: str = ""
    comparison: str = "trim"
    points: float = Field(default=1.0, ge=0, le=100)
    timeout_ms: int = Field(default=2000, ge=100, le=30000)
    # Critère « fonction attendue » que ce test appelle ; vide pour un test qui
    # fait tourner le programme entier.
    target_id: str | None = Field(default=None, max_length=24)
    # Types des valeurs d'entrée d'un test de programme entier ; un test d'appel
    # les tient du critère qu'il vise.
    input_types: list = Field(default_factory=list, max_length=20)
    # Type de la valeur attendue.
    expected_type: str = Field(default="string", max_length=20)
    # Valeurs d'entrée, dans l'ordre des types déclarés.
    args: list = Field(default_factory=list, max_length=20)

    @field_validator("comparison")
    @classmethod
    def _check_comparison(cls, v: str) -> str:
        if v not in {"trim", "exact", "numeric"}:
            raise ValueError("comparison doit être trim, exact ou numeric")
        return v

    @field_validator("expected_type", mode="before")
    @classmethod
    def _default_expected_type(cls, v):
        # Les tests écrits avant le barème typé n'ont pas de type de sortie :
        # on les relit comme du texte, ce qu'ils étaient.
        return v or "string"

    @field_validator("args", "input_types", mode="before")
    @classmethod
    def _coerce_args(cls, v):
        # D'anciennes lignes ont pu stocker la liste comme la chaîne JSON "[]".
        # On la désérialise pour ne pas casser la lecture.
        if isinstance(v, str):
            import json as _json
            try:
                parsed = _json.loads(v)
            except ValueError:
                return []
            return parsed if isinstance(parsed, list) else []
        return v if v is not None else []


class TestCaseOut(TestCaseIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    position: int


# Types de question proposés à l'enseignant. « code » et « algo » sont les
# exercices pratiques ; les autres sont des questions à correction automatique.
ExerciseKind = Literal["code", "algo", "qcm", "matching", "truefalse", "short"]


class ExerciseIn(BaseModel):
    id: int | None = None
    title: str = Field(min_length=1, max_length=200)
    statement: str = ""
    language: str = "c"
    points: float = Field(default=5.0, ge=0, le=1000)
    starter_code: str = ""
    kind: ExerciseKind = "code"
    settings: dict = Field(default_factory=dict)
    tests: list[TestCaseIn] = Field(default_factory=list, max_length=50)


class ExerciseOut(ORMModel):
    id: int
    position: int
    title: str
    statement: str
    language: str
    points: float
    starter_code: str
    kind: str = "code"
    settings: dict = Field(default_factory=dict)
    tests: list[TestCaseOut] = []


class ExercisePublicOut(ORMModel):
    """Vue apprenant : jamais les jeux de tests."""

    id: int
    position: int
    title: str
    statement: str
    language: str
    points: float
    kind: str = "code"
    starter_code: str = ""
    settings: dict = Field(default_factory=dict)


# ----- Banque d'exercices -----
class BankExerciseIn(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    statement: str = ""
    language: str = "c"
    points: float = Field(default=5.0, ge=0, le=1000)
    starter_code: str = ""
    kind: ExerciseKind = "code"
    settings: dict = Field(default_factory=dict)
    subject_id: int | None = None
    tags: list[str] = Field(default_factory=list, max_length=10)
    is_shared: bool = False
    tests: list[TestCaseIn] = Field(default_factory=list, max_length=50)


class BankExerciseOut(ORMModel):
    id: int
    title: str
    statement: str
    language: str
    points: float
    starter_code: str
    kind: str = "code"
    settings: dict = Field(default_factory=dict)
    subject_id: int | None
    tags: list[str]
    is_shared: bool
    uses: int
    created_at: datetime
    updated_at: datetime
    author_id: int
    author_name: str | None = None
    subject_name: str | None = None
    tests: list[TestCaseOut] = []


class EvaluationBase(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    kind: EvaluationKind = EvaluationKind.DEVOIR
    description: str = ""
    instructions: str = ""
    language: str = "c"
    duration_minutes: int = Field(default=90, ge=5, le=600)
    scheduled_start: datetime | None = None
    classroom_id: int | None = None
    subject_id: int | None = None
    total_points: float = Field(default=20.0, gt=0, le=1000)
    rules: dict = Field(default_factory=dict)


class EvaluationCreate(EvaluationBase):
    pass


class EvaluationUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    kind: EvaluationKind | None = None
    description: str | None = None
    instructions: str | None = None
    language: str | None = None
    duration_minutes: int | None = Field(default=None, ge=5, le=600)
    scheduled_start: datetime | None = None
    classroom_id: int | None = None
    subject_id: int | None = None
    total_points: float | None = Field(default=None, gt=0, le=1000)
    rules: dict | None = None


class EvaluationOut(ORMModel):
    id: int
    title: str
    kind: EvaluationKind
    description: str
    instructions: str
    language: str
    duration_minutes: int
    scheduled_start: datetime | None
    status: EvaluationStatus
    total_points: float
    rules: dict
    started_at: datetime | None
    ends_at: datetime | None
    closed_at: datetime | None
    validated_at: datetime | None
    classroom_id: int | None
    subject_id: int | None
    classroom_name: str | None = None
    subject_name: str | None = None
    participants_count: int = 0
    exercises_count: int = 0
    success_rate: float | None = None
    # Renseigné pour les modèles de la banque : la banque est ouverte à tout
    # l'établissement, mais seul son auteur peut retoucher un modèle.
    is_owner: bool = False


class EvaluationDetailOut(EvaluationOut):
    exercises: list[ExerciseOut] = []


class Page(BaseModel):
    items: list
    total: int
    page: int
    page_size: int


# ----- Session -----
class SessionParticipant(BaseModel):
    participation_id: int
    student_id: int
    full_name: str
    matricule: str | None
    connected: bool
    exercises_done: int
    last_saved_at: datetime | None
    submitted_at: datetime | None
    incidents: int = 0


class IncidentPayload(BaseModel):
    """Événement d'intégrité signalé par le poste de l'apprenant."""

    type: Literal[
        "fullscreen_exit", "tab_hidden", "window_blur", "paste_blocked", "copy_blocked",
        "shortcut_blocked", "reload_attempt",
    ]


class OfflineIncident(BaseModel):
    type: Literal[
        "fullscreen_exit", "tab_hidden", "window_blur", "paste_blocked", "copy_blocked",
        "shortcut_blocked", "reload_attempt",
    ]
    at: str


class OfflineIncidentBatch(BaseModel):
    """Lot d'incidents accumulés hors ligne et transmis au retour de connexion."""

    incidents: list[OfflineIncident]


class IncidentOut(BaseModel):
    participation_id: int
    full_name: str
    type: str
    created_at: datetime


class SessionMonitorOut(BaseModel):
    status: EvaluationStatus
    ends_at: datetime | None
    seconds_left: int | None
    connected: int
    submitted: int
    total: int
    incidents: int = 0
    last_save: datetime | None
    participants: list[SessionParticipant]


class ExtendPayload(BaseModel):
    extra_minutes: int = Field(ge=1, le=180)


# ----- Apprenant -----
class AutosavePayload(BaseModel):
    code: str = Field(max_length=200_000)
    version: int = 0


class StudentEvaluationOut(ORMModel):
    id: int
    title: str
    language: str
    status: EvaluationStatus
    duration_minutes: int
    scheduled_start: datetime | None
    ends_at: datetime | None
    subject_name: str | None = None
    classroom_name: str | None = None
    submitted_at: datetime | None = None


class StudentExamOut(BaseModel):
    evaluation: StudentEvaluationOut
    instructions: str
    rules: dict
    seconds_left: int
    server_time: datetime
    exercises: list[ExercisePublicOut]
    drafts: dict[int, str]
    saved_exercise_ids: list[int]
    incidents: int
    max_incidents: int
    submitted_at: datetime | None


# ----- Correction & résultats -----
class RunOut(ORMModel):
    id: int
    number: int
    status: RunStatus
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    processed: int
    total: int
    stats: dict
    error: str | None
    triggered_by_name: str | None = None


class ExerciseResultOut(BaseModel):
    exercise_id: int
    exercise_title: str
    # Le type dit à l'enseignant comment lire le détail : jeux de tests pour un
    # exercice pratique, correction automatique ailleurs, note à poser à la main
    # pour une question-réponse sans corrigé.
    kind: str = "code"
    # L'énoncé et ses réglages voyagent avec le résultat : une copie corrigée se
    # lit exercice par exercice, la question au-dessus de la réponse.
    statement: str = ""
    settings: dict = Field(default_factory=dict)
    language: str = ""
    starter_code: str = ""
    points: float = 0.0
    matches: list = Field(default_factory=list)
    status: ResultStatus
    auto_score: float
    # Note retenue sur cet exercice : l'automatique, ou celle que l'enseignant a
    # posée à la main avant publication.
    final_score: float = 0.0
    adjusted: bool = False
    max_score: float
    compile_log: str
    code: str = ""
    tests: list
    appreciation: str = ""


class ScoreLineOut(BaseModel):
    """Une ligne de relevé : l'exercice et ce qu'il a rapporté.

    C'est ce qu'on lit sur une copie sans l'ouvrir — « Exercice 1 : 0/4 » —
    et c'est écrit sur les réglures de la vignette, comme sur un vrai paquet.
    """

    label: str
    title: str
    score: float | None = None
    max_score: float = 0.0


class ParticipantResultOut(BaseModel):
    participation_id: int
    student_id: int
    full_name: str
    matricule: str | None
    auto_score: float
    final_score: float
    max_score: float
    adjusted: bool
    tests_passed: int
    tests_total: int
    time_spent_seconds: int | None
    status: str
    lines: list[ScoreLineOut] = Field(default_factory=list)


class ResultsOut(BaseModel):
    run: RunOut | None
    runs: list[RunOut]
    participants: list[ParticipantResultOut]
    average: float | None
    success_rate: float | None
    best_score: float | None
    total_points: float


class SubmissionDetailOut(BaseModel):
    participation_id: int
    full_name: str
    matricule: str | None
    final_score: float
    max_score: float
    exercises: list[ExerciseResultOut]
    adjustments: list[dict]
    appreciation: str = ""


class AdjustPayload(BaseModel):
    exercise_id: int | None = None
    new_score: float = Field(ge=0, le=1000)
    reason: str = Field(min_length=3, max_length=500)


class AppreciationPayload(BaseModel):
    """Appréciation générale (exercise_id nul) ou attachée à un exercice."""

    exercise_id: int | None = None
    text: str = Field(default="", max_length=2000)


class StudentResultOut(BaseModel):
    evaluation_id: int
    title: str
    subject_name: str | None
    date: datetime | None
    score: float | None
    total_points: float
    status: str
    published: bool = False
    lines: list[ScoreLineOut] = Field(default_factory=list)


# ----- Copie de l'apprenant -----
class StudentCopyExercise(BaseModel):
    """Une feuille de la copie : l'énoncé, la production, puis la note publiée."""

    exercise_id: int
    position: int
    title: str
    statement: str
    language: str
    kind: str
    points: float
    settings: dict = Field(default_factory=dict)
    starter_code: str = ""
    answer: str = ""
    # Correspondances relues côté serveur : l'apprenant a répondu par jetons opaques.
    matches: list[dict] = Field(default_factory=list)
    score: float | None = None
    max_score: float | None = None
    status: ResultStatus | None = None
    compile_log: str = ""
    tests: list = Field(default_factory=list)
    appreciation: str = ""


class StudentCopyOut(BaseModel):
    evaluation_id: int
    title: str
    subject_name: str | None = None
    classroom_name: str | None = None
    instructions: str = ""
    date: datetime | None = None
    duration_minutes: int
    submitted_at: datetime | None = None
    published: bool = False
    corrected: bool = False
    status_label: str
    score: float | None = None
    total_points: float
    appreciation: str = ""
    exercises: list[StudentCopyExercise]
