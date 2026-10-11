from __future__ import annotations

from datetime import datetime

from typing import Literal

import base64
import binascii

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .grading.project import FILES_KEY, ProjectError, check_files
from .models import EvaluationKind, EvaluationStatus, ResultStatus, Role, RunStatus, TestKind


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ----- Auth -----
PHOTO_MAX_BYTES = 300_000
_PHOTO_PREFIXES = ("data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,")


def check_photo(value: str) -> str:
    """Une image JPEG, PNG ou WebP en data URL, de 300 Ko au plus."""
    prefix = next((p for p in _PHOTO_PREFIXES if value.startswith(p)), None)
    if prefix is None:
        raise ValueError("La photo doit être une image JPEG, PNG ou WebP")
    try:
        raw = base64.b64decode(value[len(prefix):], validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("Photo illisible") from None
    if not raw or len(raw) > PHOTO_MAX_BYTES:
        raise ValueError("La photo ne doit pas dépasser 300 Ko")
    return value


Gender = Literal["F", "M"]


class EmailCodeRequest(BaseModel):
    email: EmailStr


class RegisterTeacher(BaseModel):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Code reçu à l'adresse saisie : il confirme qu'elle appartient à l'inscrit.
    # Absent seulement quand la vérification est coupée (développement).
    email_code: str | None = Field(default=None, min_length=6, max_length=6)
    photo: str
    gender: Gender

    @field_validator("photo")
    @classmethod
    def _photo(cls, value: str) -> str:
        return check_photo(value)


class PhotoUpdate(BaseModel):
    photo: str

    @field_validator("photo")
    @classmethod
    def _photo(cls, value: str) -> str:
        return check_photo(value)


SheetLayout = Literal["classique", "centre", "officiel"]


class SheetHeaderSettings(BaseModel):
    """L'en-tête que l'enseignant pose sur ses feuilles. Une ligne vide ou une
    liste vide laisse la valeur par défaut (nom de l'établissement, matière)."""

    layout: SheetLayout = "classique"
    logo: str | None = None
    # Bloc de gauche : établissement, département, filière…
    left_lines: list[str] = Field(default_factory=list, max_length=4)
    # Bloc de droite, disposition « officiel » : République, devise…
    right_lines: list[str] = Field(default_factory=list, max_length=4)
    # Le titre centré au-dessus du cartouche (examen, concours, matière).
    title: str = Field(default="", max_length=160)
    show_classroom: bool = True
    show_session: bool = True

    @field_validator("logo")
    @classmethod
    def _logo(cls, value: str | None) -> str | None:
        return check_photo(value) if value else None

    @field_validator("left_lines", "right_lines")
    @classmethod
    def _lines(cls, value: list[str]) -> list[str]:
        lines = [line.strip()[:160] for line in value]
        while lines and not lines[-1]:
            lines.pop()
        return lines


class JoinClassPayload(BaseModel):
    """On entre dans une classe par son code, ou par le jeton d'un lien."""

    code: str | None = Field(default=None, min_length=4, max_length=20)
    token: str | None = Field(default=None, min_length=10, max_length=1000)

    @model_validator(mode="after")
    def _code_or_token(self):
        if not self.code and not self.token:
            raise ValueError("Saisissez le code de la classe")
        return self


class JoinClassSignup(JoinClassPayload):
    full_name: str = Field(min_length=2, max_length=160)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    email_code: str | None = Field(default=None, min_length=6, max_length=6)
    # Obligatoire : c'est lui qui identifie la copie sur les relevés de notes.
    matricule: str = Field(max_length=60)
    photo: str
    gender: Gender

    @field_validator("matricule")
    @classmethod
    def _matricule(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Le matricule est obligatoire")
        return value

    @field_validator("photo")
    @classmethod
    def _photo(cls, value: str) -> str:
        return check_photo(value)


class JoinClassPreview(BaseModel):
    classroom_name: str
    level: str | None = None
    organization_name: str


class LoginPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(ORMModel):
    id: int
    email: str
    full_name: str
    role: Role
    matricule: str | None = None
    photo: str | None = None
    gender: str | None = None
    sheet_header: dict | None = None
    is_active: bool
    organization_id: int


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut
    organization: str
    organization_kind: str = "institution"


class ForgotPasswordPayload(BaseModel):
    email: EmailStr


class ResetPasswordPayload(BaseModel):
    token: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=128)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class AccountDeletion(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)


class EmailChangeRequest(BaseModel):
    email: EmailStr
    current_password: str = Field(min_length=1, max_length=128)


class EmailChangeConfirm(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)


# ----- Organisation -----
class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    role: Role
    password: str = Field(min_length=8, max_length=128)
    matricule: str | None = Field(default=None, max_length=60)
    gender: Gender | None = None
    # Classe où inscrire d'emblée un étudiant : un compte créé sans classe ne
    # voit aucune épreuve.
    classroom_id: int | None = None

    @model_validator(mode="after")
    def _student_matricule(self):
        if self.role is Role.STUDENT and not (self.matricule or "").strip():
            raise ValueError("Le matricule est obligatoire pour un étudiant")
        return self


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    email: EmailStr | None = None
    role: Role | None = None
    is_active: bool | None = None
    matricule: str | None = Field(default=None, max_length=60)
    gender: Gender | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)


class AdminUserOut(UserOut):
    """Compte vu par l'administration : où il est rattaché, quand il a servi."""

    created_at: datetime | None = None
    last_login_at: datetime | None = None
    classrooms: list[str] = []
    # Nom de l'espace personnel du compte, s'il n'est pas de l'établissement.
    space: str | None = None


class PasswordResetOut(BaseModel):
    password: str


class NamedCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class ClassroomCreate(NamedCreate):
    level: str | None = Field(default=None, max_length=60)


class ClassroomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    level: str | None = Field(default=None, max_length=60)


class SubjectOut(ORMModel):
    id: int
    name: str
    language: str
    author_id: int | None = None


class SubjectCreate(NamedCreate):
    language: str = Field(min_length=1, max_length=30)


class SubjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    language: str | None = Field(default=None, min_length=1, max_length=30)


class SubjectAdminOut(SubjectOut):
    author_name: str | None = None
    evaluations_count: int = 0
    bank_count: int = 0
    teachers_count: int = 0


class ClassroomOut(ORMModel):
    id: int
    name: str
    level: str | None = None
    students_count: int = 0
    teachers_count: int = 0
    evaluations_count: int = 0
    # Classe d'un autre enseignant, partagée avec l'utilisateur.
    shared: bool = False
    can_manage: bool = False
    owner_name: str | None = None


class ClassroomDetailOut(ORMModel):
    id: int
    name: str
    level: str | None = None
    students_count: int = 0
    subject_name: str | None = None
    created_at: datetime | None = None
    join_code: str | None = None
    join_code_expires_at: datetime | None = None
    shared: bool = False
    can_manage: bool = False
    owner_name: str | None = None
    organization_name: str | None = None


class SharePayload(BaseModel):
    email: EmailStr


class ShareOut(BaseModel):
    id: int
    teacher_id: int
    teacher_name: str
    teacher_email: str
    organization_name: str
    is_self: bool = False


class TeamMemberOut(BaseModel):
    """Un enseignant de la classe, quelle que soit la porte par laquelle il y est."""

    teacher_id: int
    teacher_name: str
    teacher_email: str
    organization_name: str
    # owner : l'a créée ; invited : invité par partage.
    role: str
    share_id: int | None = None
    is_self: bool = False


class JoinCodePayload(BaseModel):
    # Nul : le code reste valable jusqu'à ce qu'on le ferme.
    expires_in_days: int | None = Field(default=None, ge=1, le=365)


class JoinLinkPayload(BaseModel):
    expires_in_hours: int = Field(default=48, ge=1, le=720)


class JoinLinkOut(BaseModel):
    token: str
    expires_at: datetime


class JoinCodeOut(BaseModel):
    join_code: str | None
    join_code_expires_at: datetime | None = None


class EnrollPayload(BaseModel):
    student_ids: list[int] = Field(min_length=1, max_length=500)


class AssignPayload(BaseModel):
    teacher_id: int
    subject_id: int


class AssignmentOut(BaseModel):
    id: int
    teacher_id: int
    teacher_name: str
    teacher_email: str
    subject_id: int
    subject_name: str


class OrganizationOut(ORMModel):
    id: int
    name: str
    slug: str
    created_at: datetime | None = None


class DisciplineOut(BaseModel):
    key: str
    label: str
    # « code » : un langage compilé ou interprété. « algo » : pseudo-code en blocs.
    kind: str
    enabled: bool


class DisciplineToggle(BaseModel):
    enabled: bool


class OrganizationUpdate(BaseModel):
    name: str = Field(min_length=2, max_length=160)


class PlanOut(BaseModel):
    kind: str
    plan: str
    # Nul : aucune limite.
    limits: dict | None = None
    usage: dict


class AuditEntryOut(BaseModel):
    id: int
    action: str
    target_type: str
    target_id: int | None
    actor_id: int | None
    actor_name: str | None
    meta: dict
    created_at: datetime


class AdminEvaluationOut(BaseModel):
    id: int
    title: str
    kind: EvaluationKind
    status: EvaluationStatus
    teacher_name: str
    classroom_name: str | None
    subject_name: str | None
    scheduled_start: datetime | None
    duration_minutes: int
    participants_count: int
    created_at: datetime | None


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
    # Arguments de la ligne de commande d'un test du programme entier.
    argv: list[str] = Field(default_factory=list, max_length=20)

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

    @field_validator("argv", mode="before")
    @classmethod
    def _check_argv(cls, v):
        # Un argument est toujours du texte : « 40 » saisi comme nombre aussi.
        if v is None:
            return []
        if not isinstance(v, list):
            raise ValueError("Les arguments de ligne de commande forment une liste")
        args = [str(arg) for arg in v]
        if any(len(arg) > 200 for arg in args):
            raise ValueError("Un argument de ligne de commande fait au plus 200 caractères")
        return args

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


def _checked_project(model):
    """Les fichiers d'un exercice-projet (`settings.files`), vérifiés avant
    d'être enregistrés : leurs noms entrent tels quels dans le répertoire de
    compilation."""
    files = (model.settings or {}).get(FILES_KEY)
    if model.kind != "code" or not files:
        return model
    try:
        model.settings = {**model.settings, FILES_KEY: check_files(files, model.language)}
    except ProjectError as erreur:
        raise ValueError(str(erreur)) from None
    return model


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

    @model_validator(mode="after")
    def _project(self):
        return _checked_project(self)


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

    @model_validator(mode="after")
    def _project(self):
        return _checked_project(self)


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


# ----- Communauté -----
class CommunityPublishIn(BaseModel):
    """Publier dans la communauté un exercice de la banque ou une épreuve."""

    source_type: Literal["bank_exercise", "evaluation"]
    source_id: int
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str = Field(default="", max_length=2000)
    tags: list[str] = Field(default_factory=list, max_length=10)


class CommunityUseIn(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    classroom_id: int | None = None


class CommunityItemOut(BaseModel):
    id: int
    item_type: str
    title: str
    description: str
    language: str
    subject_name: str | None
    tags: list[str]
    exercises_count: int
    total_points: float
    uses: int
    created_at: datetime
    author_id: int
    author_name: str | None = None
    organization_name: str | None = None
    # Auteur, ou administrateur de l'établissement de l'auteur.
    can_delete: bool = False
    # Type d'un exercice seul (QCM, code…), lisible sans charger le contenu.
    exercise_kind: str | None = None
    # Types d'exercice présents (un seul pour un exercice), pour les couleurs.
    exercise_kinds: list[str] = []
    # Miniature du contenu pour la carte : énoncé et début des propositions.
    preview: dict = {}
    # Notes des enseignants : moyenne sur 5 (nulle sans note), nombre, et la sienne.
    rating_avg: float | None = None
    rating_count: int = 0
    my_rating: int | None = None
    # Faux pour l'auteur (on ne note pas son propre travail) et l'administration.
    can_rate: bool = False
    content: dict | None = None


class CommunityRatingIn(BaseModel):
    stars: int = Field(ge=1, le=5)


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
    # L'en-tête de l'auteur : les aperçus et les copies le reprennent.
    sheet_header: dict | None = None


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
    kind: EvaluationKind = EvaluationKind.DEVOIR
    total_points: float = 20.0
    # Le tableau de bord de l'apprenant : où il en est, et ce qu'il a obtenu.
    exercises_count: int = 0
    answered_count: int = 0
    score: float | None = None
    published: bool = False
    solutions_available: bool = False
    status_label: str = ""
    # Délai d'entrée dépassé sans avoir ouvert l'épreuve : elle reste visible, fermée.
    entry_closed: bool = False
    # Renseigné à l'ouverture de l'épreuve seulement : le logo pèse trop pour la liste.
    sheet_header: dict | None = None


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

    C'est ce qu'on lit sur une copie sans l'ouvrir (« Exercice 1 : 0/4 »)
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
    # Le corrigé, publié avec les notes si l'enseignant le propose : la solution
    # type, ses explications, et ce que le programme devait produire.
    solution: str = ""
    solution_notes: str = ""
    expected_tests: list[dict] = Field(default_factory=list)


class StudentCopyOut(BaseModel):
    evaluation_id: int
    title: str
    sheet_header: dict | None = None
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
    # Le corrigé accompagne-t-il cette copie ? Publiée, et proposée par l'enseignant.
    solutions_available: bool = False
    exercises: list[StudentCopyExercise]
