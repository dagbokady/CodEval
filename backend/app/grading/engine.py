"""Moteur de correction : compile, exécute, compare aux jeux de tests, note."""

from __future__ import annotations

import time
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import (
    CorrectionResult,
    CorrectionRun,
    Evaluation,
    EvaluationStatus,
    Exercise,
    Participation,
    ResultStatus,
    RunStatus,
    Submission,
    TestCase,
    utcnow,
)
from ..config import settings
from .algo import AlgoError, transpile
from .algo_bareme import check_algo_criterion, is_algo_criterion, parse_document
from .bareme import (
    build_probe,
    criteria_of,
    declares_variable,
    describe,
    function_criteria,
    probe_bodies,
    signature_of,
)
from .harness import CALLABLE_LANGUAGES, HarnessError, build_harness, stdin_for
from .languages import get_language
from . import matching
from .questions import answers_of, questions_of
from .sandbox import Sandbox, Workspace, default_sandbox


@dataclass
class ExerciseOutcome:
    status: ResultStatus
    score: float
    max_score: float
    compile_log: str
    tests: list[dict]
    duration_ms: int


def _matches(expected: str, actual: str, comparison: str) -> bool:
    if comparison == "exact":
        return expected == actual
    if comparison == "numeric":
        try:
            exp = [float(x) for x in expected.split()]
            act = [float(x) for x in actual.split()]
        except ValueError:
            return False
        return len(exp) == len(act) and all(abs(a - b) < 1e-6 for a, b in zip(exp, act))
    return "\n".join(line.rstrip() for line in expected.strip().splitlines()) == "\n".join(
        line.rstrip() for line in actual.strip().splitlines()
    )


import json
import unicodedata


def _grade_one_qcm(question: dict, given, share: float) -> tuple[float, dict]:
    """Une question de QCM : les choix cochés face aux réponses correctes."""
    choices = [c for c in question.get("choices", []) if isinstance(c, dict)]
    correct_indices = {i for i, c in enumerate(choices) if c.get("correct")}
    selected = set()
    if isinstance(given, dict):
        selected = {s for s in given.get("selected", []) if isinstance(s, int)}

    if not correct_indices:
        return 0.0, {"correct": [], "selected": sorted(selected), "passed": False}

    if selected == correct_indices:
        score = share
    elif question.get("multiple"):
        good = len(selected & correct_indices)
        bad = len(selected - correct_indices)
        score = max(0.0, (good - bad) / len(correct_indices)) * share
    else:
        score = 0.0

    return score, {
        "correct": sorted(correct_indices),
        "selected": sorted(selected),
        "passed": selected == correct_indices,
    }


def _grade_one_matching(
    question: dict, given, share: float, exercise: Exercise, rank: int
) -> tuple[float, dict]:
    """Une grille de correspondance : chaque paire retrouvée vaut sa part."""
    pairs = [p for p in question.get("pairs", []) if isinstance(p, dict)]
    if not pairs:
        return 0.0, {"total_pairs": 0, "correct": 0, "passed": False}

    matches = given.get("matches", {}) if isinstance(given, dict) else {}
    if not isinstance(matches, dict):
        matches = {}

    salt = matching.salt_of(exercise)
    correct = sum(
        1
        for i in range(len(pairs))
        if matching.resolve(matches.get(str(i)), salt, len(pairs), rank) == i
    )
    return (correct / len(pairs)) * share, {
        "total_pairs": len(pairs),
        "correct": correct,
        "passed": correct == len(pairs),
    }


def _grade_truefalse(answer: str, exercise: Exercise) -> ExerciseOutcome:
    """Vrai/Faux : une affirmation vaut une part égale du barème de la question."""
    settings = exercise.settings or {}
    statements = [s for s in settings.get("statements", []) if isinstance(s, dict)]
    max_score = exercise.points

    if not answer.strip():
        return ExerciseOutcome(ResultStatus.NO_SUBMISSION, 0.0, max_score, "", [], 0)
    if not statements:
        return ExerciseOutcome(ResultStatus.OK, 0.0, max_score, "", [], 0)

    try:
        given = (json.loads(answer) or {}).get("answers", {})
    except (json.JSONDecodeError, AttributeError, TypeError):
        given = {}
    if not isinstance(given, dict):
        given = {}

    details = []
    correct = 0
    for index, statement in enumerate(statements):
        expected = bool(statement.get("answer"))
        chosen = given.get(str(index))
        chosen = None if chosen is None else bool(chosen)
        passed = chosen is not None and chosen == expected
        correct += int(passed)
        details.append(
            {
                "text": statement.get("text", "")[:200],
                "expected": expected,
                "chosen": chosen,
                "passed": passed,
            }
        )

    score = (correct / len(statements)) * max_score
    return ExerciseOutcome(ResultStatus.OK, round(score, 2), max_score, "", details, 0)


def _normalize(text: str) -> str:
    """Comparaison indulgente : casse, accents, ponctuation et espaces effacés.

    Une définition juste ne doit pas être refusée parce qu'elle porte une majuscule
    ou un point final.
    """
    folded = unicodedata.normalize("NFD", text or "")
    folded = "".join(c for c in folded if unicodedata.category(c) != "Mn")
    folded = "".join(c if c.isalnum() else " " for c in folded.lower())
    return " ".join(folded.split())


def _grade_one_short(question: dict, given, share: float) -> tuple[float, dict]:
    """Une question rédigée (définition ou autre).

    Trois cas, selon ce qu'a préparé l'enseignant :
    - aucune réponse attendue → la question attend une correction manuelle (0 point
      proposé, signalé comme tel : l'enseignant réajuste depuis la copie) ;
    - mode « mots-clés » → chaque mot-clé retrouvé rapporte sa part du barème ;
    - sinon → la réponse doit correspondre à l'une des formulations acceptées.
    """
    accepted = [str(a) for a in question.get("accepted", []) if str(a).strip()]
    keywords = bool(question.get("keywords_mode"))
    written = given.get("text", "") if isinstance(given, dict) else (given or "")
    written = str(written)

    if not accepted:
        # Rien à comparer : la note reste à l'enseignant, la copie n'est pas perdue.
        return 0.0, {"manual": True, "passed": None, "answer": written[:2000]}

    given_text = _normalize(written)
    if keywords:
        found = [k for k in accepted if _normalize(k) and _normalize(k) in given_text]
        return (len(found) / len(accepted)) * share, {
            "manual": False,
            "mode": "keywords",
            "expected": accepted,
            "found": found,
            "passed": len(found) == len(accepted),
        }

    passed = bool(given_text) and any(given_text == _normalize(a) for a in accepted)
    return (share if passed else 0.0), {
        "manual": False,
        "mode": "exact",
        "expected": accepted,
        "passed": passed,
    }


def _grade_questions(answer: str, exercise: Exercise) -> ExerciseOutcome:
    """QCM, correspondance et question-réponse : plusieurs questions par exercice.

    Le barème de l'exercice se partage également entre ses questions ; chacune est
    corrigée par la règle de son type, et le détail garde son rang et son intitulé
    pour que la copie corrigée se lise question par question.
    """
    kind = getattr(exercise, "kind", "code")
    questions = questions_of(kind, exercise.settings)
    max_score = exercise.points

    if not answer.strip():
        return ExerciseOutcome(ResultStatus.NO_SUBMISSION, 0.0, max_score, "", [], 0)
    if not questions:
        return ExerciseOutcome(ResultStatus.OK, 0.0, max_score, "", [], 0)

    given = answers_of(kind, answer, len(questions))
    share = max_score / len(questions)
    score = 0.0
    details = []
    for rank, question in enumerate(questions):
        if kind == "qcm":
            part, detail = _grade_one_qcm(question, given[rank], share)
        elif kind == "matching":
            part, detail = _grade_one_matching(question, given[rank], share, exercise, rank)
        else:
            part, detail = _grade_one_short(question, given[rank], share)
        score += part
        details.append(
            {
                "question": rank + 1,
                "prompt": str(question.get("text", ""))[:200],
                "max_score": round(share, 2),
                "score": round(part, 2),
                **detail,
            }
        )

    return ExerciseOutcome(ResultStatus.OK, round(score, 2), max_score, "", details, 0)


def _prepare_code(code: str, exercise: Exercise) -> tuple[str, object]:
    """Code réellement compilé, et son langage. L'algorithme en blocs devient du Python."""
    if getattr(exercise, "kind", "code") == "algo":
        code = transpile(code, (exercise.settings or {}).get("allowed_elements"))
        return code, get_language("python")
    return code, get_language(exercise.language)


# Une signature qui ne correspond pas doit arrêter la compilation, pas se
# contenter d'un avertissement : selon les versions de gcc, ces deux diagnostics
# ne sont pas des erreurs par défaut.
HARNESS_FLAGS = ["-Werror=incompatible-pointer-types", "-Werror=implicit-function-declaration"]


def _syntax_check(sandbox: Sandbox, source: str, lang) -> str:
    """Le fichier de l'apprenant se compile-t-il, `main` ou pas ?"""
    if not lang.compile_cmd:
        return ""
    with Workspace() as ws:
        ws.write(lang.filename, source)
        std = [arg for arg in lang.compile_cmd if arg.startswith("-std=")]
        cmd = [lang.compile_cmd[0], *std, "-fsyntax-only", lang.filename]
        res = sandbox.run(ws.path, cmd, timeout=settings.sandbox_compile_timeout)
    if res.exit_code != 0:
        return (res.stderr or res.stdout or "Échec de compilation")[:4000]
    return ""


def _compile(sandbox: Sandbox, ws: Workspace, lang, source_name: str, flags: list[str] = []) -> str:
    """Compile `source_name` en `program`. Rend le journal d'erreur, vide si tout va bien."""
    if not lang.compile_cmd:
        return ""
    cmd = [source_name if arg == lang.filename else arg for arg in lang.compile_cmd]
    cmd = cmd[:1] + list(flags) + cmd[1:]
    comp = sandbox.run(ws.path, cmd, timeout=settings.sandbox_compile_timeout)
    if comp.exit_code != 0:
        return (comp.stderr or comp.stdout or "Échec de compilation")[:4000]
    return ""


def _run_case(sandbox: Sandbox, ws: Workspace, lang, test: TestCase, stdin: str, index: int | None):
    cmd = list(lang.run_cmd) + ([str(index)] if index is not None else [])
    return sandbox.run(ws.path, cmd, stdin=stdin, timeout=test.timeout_ms / 1000)


def _probe_compile(sandbox: Sandbox, ws: Workspace, lang) -> str:
    """Compile une sonde de barème sans édition de liens. Journal vide = satisfait."""
    std = [arg for arg in lang.compile_cmd if arg.startswith("-std=")]
    cmd = [lang.compile_cmd[0], *HARNESS_FLAGS, *std, "-fsyntax-only", lang.filename]
    res = sandbox.run(ws.path, cmd, timeout=settings.sandbox_compile_timeout)
    if res.exit_code == 0:
        return ""
    return (res.stderr or res.stdout or "La sonde de barème n'a pas compilé")[:2000]


def _check_criterion(
    criterion: dict,
    source: str,
    sandbox: Sandbox,
    lang,
    callable_language: bool,
    document: dict | None = None,
) -> tuple[bool, str]:
    """La copie satisfait-elle ce critère de déclaration ? Rend (satisfait, journal).

    Un algorithme se juge sur le document même de l'apprenant (`document`) : sa
    traduction en Python a perdu les types déclarés et le nom des structures.
    Une variable locale d'un programme en C se cherche dans le texte : le
    compilateur ne l'expose pas. Tout le reste passe par une sonde : si elle
    compile, la déclaration existe et a le type demandé.
    """
    if is_algo_criterion(criterion.get("kind")):
        if document is None:
            return False, "Exigence algorithmique hors d'un exercice d'algorithmique : à corriger à la main."
        return check_algo_criterion(document, criterion)
    if document is not None:
        return False, "Critère de code dans un exercice d'algorithmique : à corriger à la main."
    if criterion.get("kind") == "variable" and criterion.get("scope") == "local":
        return declares_variable(source, criterion), ""
    if not callable_language or not lang.compile_cmd:
        return False, "Contrôle de déclaration réservé au C et au C++ : à corriger à la main."

    bodies = probe_bodies(criterion)
    if not bodies:
        return False, "Critère incomplet : nom ou type manquant."

    extension = lang.filename.rsplit(".", 1)[1]
    student_file = f"student.{extension}"
    log = ""
    for body in bodies:
        with Workspace() as ws:
            ws.write(student_file, source)
            ws.write(lang.filename, build_probe(body, student_file))
            log = _probe_compile(sandbox, ws, lang)
        if not log:
            return True, ""
    return False, log


def _criterion_detail(criterion: dict, passed: bool, share: float, log: str) -> dict:
    manual = not passed and "à corriger à la main" in log
    return {
        "criterion_id": str(criterion.get("id") or ""),
        "category": "declaration",
        "name": str(criterion.get("label") or describe(criterion))[:200],
        "passed": passed,
        "manual": manual,
        "points": round(share if passed else 0, 2),
        "max_points": round(share, 2),
        "input": "",
        "expected": describe(criterion)[:500],
        "actual": "trouvée" if passed else "absente",
        "error": "" if passed else log[:500],
        "timed_out": False,
    }


def _grade_code(
    code: str, exercise: Exercise, tests: list[TestCase], sandbox: Sandbox
) -> ExerciseOutcome:
    """Correction d'un exercice de code sur son barème.

    Le barème mêle deux sortes de critères : les déclarations attendues, portées
    par `settings.criteria`, et les tests d'exécution, portés par la table des
    tests. Les uns et les autres pèsent leurs points dans le même total, et
    chacun est jugé pour lui-même : une sonde qui échoue ne coûte que ses points.
    """
    started = time.monotonic()
    max_score = exercise.points

    def elapsed() -> int:
        return int((time.monotonic() - started) * 1000)

    if not code.strip():
        return ExerciseOutcome(ResultStatus.NO_SUBMISSION, 0.0, max_score, "", [], elapsed())

    try:
        source, lang = _prepare_code(code, exercise)
    except AlgoError as erreur:
        return ExerciseOutcome(ResultStatus.COMPILE_ERROR, 0.0, max_score, str(erreur), [], elapsed())

    criteria = criteria_of(exercise)
    # Les exigences d'un exercice algorithmique se lisent sur le document rendu,
    # pas sur sa traduction : on le garde sous la main pour la boucle des critères.
    document = parse_document(code) if getattr(exercise, "kind", "code") == "algo" else None
    official = [t for t in tests if t.kind.value == "official"]
    weight_total = (
        sum(float(c.get("points") or 0) for c in criteria)
        + sum(float(t.points or 0) for t in official)
    ) or float(len(criteria) + len(official)) or 1.0

    # La syntaxe du fichier est vérifiée d'abord, sans édition de liens : une
    # copie qui ne contient que des fonctions n'a pas de `main`, et ce n'est pas
    # une faute. En revanche un `;` manquant casse toute l'unité de compilation :
    # aucun critère n'est alors jugeable, et le dire une fois vaut mieux que de
    # le répéter à chaque ligne du barème.
    log = _syntax_check(sandbox, source, lang)
    if log:
        return ExerciseOutcome(ResultStatus.COMPILE_ERROR, 0.0, max_score, log, [], elapsed())

    callable_language = lang.key in CALLABLE_LANGUAGES
    score = 0.0
    details: list[dict] = []
    logs: list[str] = []
    status = ResultStatus.OK

    for criterion in criteria:
        share = (float(criterion.get("points") or 0) / weight_total) * max_score
        passed, note = _check_criterion(
            criterion, source, sandbox, lang, callable_language, document
        )
        if passed:
            score += share
        elif note:
            logs.append(f"{describe(criterion)} : {note}")
        details.append(_criterion_detail(criterion, passed, share, note))

    functions = function_criteria(exercise)
    for target_id, cases in _by_target(tests).items():
        criterion = functions.get(target_id) if target_id else None
        signature = signature_of(criterion) if criterion and callable_language else None
        outcome = _run_group(
            source, lang, sandbox, cases, signature, weight_total, max_score
        )
        score += outcome["score"]
        details.extend(outcome["details"])
        if outcome["log"]:
            logs.append(outcome["log"])
        if outcome["status"] is not ResultStatus.OK and status is ResultStatus.OK:
            status = outcome["status"]
        elif outcome["status"] is ResultStatus.TIMEOUT:
            status = ResultStatus.TIMEOUT

    return ExerciseOutcome(
        status,
        round(min(score, max_score), 2),
        max_score,
        "\n\n".join(logs)[:4000],
        details,
        elapsed(),
    )


def _by_target(tests: list[TestCase]) -> dict[str, list[TestCase]]:
    """Les tests groupés par critère visé : un groupe, une compilation."""
    groups: dict[str, list[TestCase]] = {}
    for test in tests:
        groups.setdefault(str(test.target_id or ""), []).append(test)
    return groups


def _run_group(
    source: str,
    lang,
    sandbox: Sandbox,
    cases: list[TestCase],
    signature: dict | None,
    weight_total: float,
    max_score: float,
) -> dict:
    """Compile puis joue un groupe de tests : appels d'une même fonction, ou
    exécutions du programme entier."""
    score = 0.0
    details: list[dict] = []
    status = ResultStatus.OK

    with Workspace() as ws:
        if signature is not None:
            student_file = f"student.{lang.filename.rsplit('.', 1)[1]}"
            ws.write(student_file, source)
            try:
                program = build_harness(
                    signature, [list(t.args or []) for t in cases], student_file
                )
            except HarnessError as erreur:
                return {
                    "score": 0.0,
                    "details": [_failed_detail(t, str(erreur), signature) for t in cases],
                    "log": f"{signature['name']} : {erreur}",
                    "status": ResultStatus.COMPILE_ERROR,
                }
            ws.write(lang.filename, program)
        else:
            ws.write(lang.filename, source)

        log = _compile(sandbox, ws, lang, lang.filename, HARNESS_FLAGS if signature else [])
        if log:
            return {
                "score": 0.0,
                "details": [_failed_detail(t, log, signature) for t in cases],
                "log": log,
                "status": ResultStatus.COMPILE_ERROR,
            }

        # La première exécution d'un binaire neuf paie un coût fixe (vérification
        # de signature, chargement en mémoire) de plusieurs centaines de
        # millisecondes. On l'absorbe hors barème pour ne pas pénaliser
        # arbitrairement le premier test du groupe.
        if signature is None:
            sandbox.run(ws.path, lang.run_cmd, stdin="", timeout=settings.sandbox_wall_timeout)

        for index, test in enumerate(cases):
            if signature is not None:
                stdin, case_index = test.stdin, index
            elif test.input_types:
                stdin, case_index = stdin_for(list(test.input_types), list(test.args or [])), None
            else:
                stdin, case_index = test.stdin, None
            res = _run_case(sandbox, ws, lang, test, stdin, case_index)
            passed = (
                not res.timed_out
                and res.exit_code == 0
                and _matches(test.expected_stdout, res.stdout, test.comparison)
            )
            official = test.kind.value == "official"
            share = (float(test.points or 0) / weight_total) * max_score if official else 0.0
            if passed:
                score += share
            if res.timed_out:
                status = ResultStatus.TIMEOUT
            elif res.exit_code != 0 and status is ResultStatus.OK:
                status = ResultStatus.RUNTIME_ERROR
            details.append(
                {
                    "test_id": test.id,
                    "category": "test",
                    "name": test.name,
                    "kind": test.kind.value,
                    "passed": passed,
                    "points": round(share if passed else 0, 2),
                    "max_points": round(share, 2),
                    "input": _readable_input(test, signature),
                    "expected": test.expected_stdout[:500],
                    "actual": res.stdout[:500],
                    "error": res.stderr[:500],
                    "timed_out": res.timed_out,
                }
            )

    return {"score": score, "details": details, "log": "", "status": status}


def _failed_detail(test: TestCase, log: str, signature: dict | None) -> dict:
    return {
        "test_id": test.id,
        "category": "test",
        "name": test.name,
        "kind": test.kind.value,
        "passed": False,
        "points": 0,
        "max_points": 0,
        "input": _readable_input(test, signature),
        "expected": test.expected_stdout[:500],
        "actual": "",
        "error": log[:500],
        "timed_out": False,
    }


def _readable_input(test: TestCase, signature: dict | None) -> str:
    """Entrée du test telle qu'on la montre à l'enseignant et à l'apprenant."""
    values = list(test.args or [])
    if signature is not None:
        rendered = ", ".join(
            "[" + " ".join(str(x) for x in v) + "]" if isinstance(v, list) else str(v)
            for v in values
        )
        return f"{signature['name']}({rendered})"
    if test.input_types and values:
        return " · ".join(str(v) for v in values)
    return test.stdin[:200]


def grade_exercise(
    code: str, exercise: Exercise, tests: list[TestCase], sandbox: Sandbox = default_sandbox
) -> ExerciseOutcome:
    kind = getattr(exercise, "kind", "code")
    if kind in ("qcm", "matching", "short"):
        return _grade_questions(code, exercise)
    if kind == "truefalse":
        return _grade_truefalse(code, exercise)
    return _grade_code(code, exercise, list(tests), sandbox)


def process_run(db: Session, run: CorrectionRun, sandbox: Sandbox = default_sandbox) -> None:
    """Traite une campagne de correction. Idempotent par (run, participation, exercice)."""
    evaluation = db.get(Evaluation, run.evaluation_id)
    exercises = list(
        db.scalars(
            select(Exercise)
            .where(Exercise.evaluation_id == evaluation.id)
            .options(selectinload(Exercise.tests))
            .order_by(Exercise.position)
        )
    )
    participations = list(
        db.scalars(select(Participation).where(Participation.evaluation_id == evaluation.id))
    )

    run.status = RunStatus.RUNNING
    run.started_at = utcnow()
    run.total = len(participations)
    run.processed = 0
    db.commit()

    stats = {"compile_errors": 0, "timeouts": 0, "no_submission": 0, "failures": 0}
    for participation in participations:
        submissions = {
            s.exercise_id: s
            for s in db.scalars(
                select(Submission).where(Submission.participation_id == participation.id)
            )
        }
        for exercise in exercises:
            existing = db.scalar(
                select(CorrectionResult).where(
                    CorrectionResult.run_id == run.id,
                    CorrectionResult.participation_id == participation.id,
                    CorrectionResult.exercise_id == exercise.id,
                )
            )
            if existing is not None:
                continue
            code = submissions[exercise.id].code if exercise.id in submissions else ""
            try:
                outcome = grade_exercise(code, exercise, exercise.tests, sandbox)
            except Exception as exc:  # isolation d'un échec unitaire
                stats["failures"] += 1
                outcome = ExerciseOutcome(
                    ResultStatus.RUNTIME_ERROR, 0.0, exercise.points, str(exc)[:500], [], 0
                )
            if outcome.status is ResultStatus.COMPILE_ERROR:
                stats["compile_errors"] += 1
            elif outcome.status is ResultStatus.TIMEOUT:
                stats["timeouts"] += 1
            elif outcome.status is ResultStatus.NO_SUBMISSION:
                stats["no_submission"] += 1
            db.add(
                CorrectionResult(
                    run_id=run.id,
                    participation_id=participation.id,
                    exercise_id=exercise.id,
                    code_snapshot=code,
                    auto_score=outcome.score,
                    max_score=outcome.max_score,
                    status=outcome.status,
                    compile_log=outcome.compile_log,
                    tests=outcome.tests,
                    duration_ms=outcome.duration_ms,
                )
            )
        run.processed = (run.processed or 0) + 1
        db.commit()

    run.status = RunStatus.PARTIAL if stats["failures"] else RunStatus.DONE
    run.finished_at = utcnow()
    run.stats = stats
    if evaluation.status in (EvaluationStatus.CORRECTING, EvaluationStatus.CLOSED):
        evaluation.status = EvaluationStatus.CORRECTED
    db.commit()
