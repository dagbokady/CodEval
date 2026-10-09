"""Exercice de code en plusieurs fichiers : un projet C ou C++.

L'enseignant déclare les fichiers du projet dans `settings.files`, chacun avec
son nom et son code de départ : `Etudiant.h`, `Fonctions.h`, `Fonctions.c`,
`main.c`… L'apprenant les retrouve en onglets. Sa copie est alors un document
JSON `{"files": {"main.c": "…", "Fonctions.c": "…"}}`, et la correction compile
tous les fichiers sources ensemble, comme `gcc main.c Fonctions.c`.

Un exercice sans `settings.files` reste un fichier unique, `main.c` : rien ne
change pour lui.
"""

from __future__ import annotations

import json
import re

FILES_KEY = "files"
MAX_FILES = 12
MAX_STARTER = 20_000

# Le nom d'un fichier entre tel quel dans le répertoire de compilation : pas de
# chemin, pas de point de tête, une extension connue.
_NAME = re.compile(r"[A-Za-z][A-Za-z0-9_-]{0,40}\.(?:c|h|cpp|hpp)")
_SOURCES = {"c": (".c",), "cpp": (".cpp",)}
_HEADERS = {"c": (".h",), "cpp": (".h", ".hpp")}


class ProjectError(ValueError):
    """Liste de fichiers inexploitable : faute de saisie de l'enseignant."""


def check_files(raw, language: str) -> list[dict]:
    """Les fichiers déclarés par l'enseignant, vérifiés ; ProjectError sinon."""
    if not isinstance(raw, list):
        raise ProjectError("Les fichiers du projet forment une liste")
    if language not in _SOURCES:
        raise ProjectError("Un projet en plusieurs fichiers s'écrit en C ou en C++")
    if len(raw) > MAX_FILES:
        raise ProjectError(f"Un projet compte au plus {MAX_FILES} fichiers")
    files: list[dict] = []
    seen: set[str] = set()
    for entry in raw:
        name = str((entry or {}).get("name") or "").strip() if isinstance(entry, dict) else ""
        if not _NAME.fullmatch(name):
            raise ProjectError(
                f"« {name or '(sans nom)'} » n'est pas un nom de fichier valide : "
                "lettres, chiffres, - ou _, puis .c ou .h"
            )
        if not name.endswith(_SOURCES[language] + _HEADERS[language]):
            raise ProjectError(f"« {name} » n'est pas un fichier {language.upper()}")
        if name.lower() in seen:
            raise ProjectError(f"Le fichier « {name} » est déclaré deux fois")
        seen.add(name.lower())
        starter = str(entry.get("starter") or "")
        if len(starter) > MAX_STARTER:
            raise ProjectError(f"Le code de départ de « {name} » est trop long")
        files.append({"name": name, "starter": starter})
    if files and not any(f["name"].endswith(_SOURCES[language]) for f in files):
        raise ProjectError("Le projet doit contenir au moins un fichier source (.c)")
    return files


def project_files(exercise) -> list[dict]:
    """Les fichiers d'un exercice-projet, ou [] pour un exercice à fichier unique.

    Une liste abîmée en base (saisie antérieure à la vérification) ne fait pas
    échouer la correction : l'exercice se relit alors comme un fichier unique.
    """
    if getattr(exercise, "kind", "code") != "code":
        return []
    raw = (getattr(exercise, "settings", None) or {}).get(FILES_KEY)
    if not raw:
        return []
    try:
        return check_files(raw, getattr(exercise, "language", "c"))
    except ProjectError:
        return []


def is_source(name: str, language: str) -> bool:
    return name.endswith(_SOURCES.get(language, (".c",)))


def main_file(files: list[dict], language: str) -> str:
    """Le fichier qui reçoit une copie écrite avant que l'exercice devienne un
    projet : `main.c` s'il existe, sinon le premier fichier source."""
    names = [f["name"] for f in files]
    for candidate in ("main.c", "main.cpp"):
        if candidate in names:
            return candidate
    return next(n for n in names if is_source(n, language))


def starter_document(files: list[dict]) -> str:
    """La copie de départ : chaque fichier avec le code que l'enseignant y a mis."""
    return json.dumps({FILES_KEY: {f["name"]: f["starter"] for f in files}}, ensure_ascii=False)


def read_production(code: str, files: list[dict], language: str) -> dict[str, str]:
    """Le contenu de chaque fichier déclaré, dans l'ordre de l'enseignant.

    Un fichier absent de la copie garde son code de départ ; un fichier que
    l'enseignant n'a pas déclaré est ignoré. Une copie en texte brut (écrite
    avant que l'exercice ne devienne un projet) va dans le fichier principal.
    """
    given: dict = {}
    text = (code or "").strip()
    if text.startswith("{"):
        try:
            parsed = json.loads(text)
        except ValueError:
            parsed = None
        if isinstance(parsed, dict) and isinstance(parsed.get(FILES_KEY), dict):
            given = parsed[FILES_KEY]
        else:
            given = {main_file(files, language): code}
    elif text:
        given = {main_file(files, language): code}
    return {
        f["name"]: str(given[f["name"]]) if isinstance(given.get(f["name"]), str) else f["starter"]
        for f in files
    }


def as_text(contents: dict[str, str]) -> str:
    """Le projet lu d'un bloc, fichier par fichier : pour la copie imprimée et
    pour chercher une variable locale dans tout le projet."""
    return "\n\n".join(f"/* ===== {name} ===== */\n{body.rstrip()}" for name, body in contents.items())
