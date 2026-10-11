"""Simulation d'algorithme : le tableau de simulation, rempli à la main.

L'enseignant donne un algorithme (`settings.algorithm`) et le tableau attendu :
ses colonnes (`settings.columns`, chacune `{"title", "given"}`) et ses lignes
(`settings.rows`, une liste de cases par ligne). Une colonne « fournie » (le
numéro d'instruction, typiquement) est recopiée telle quelle sur la feuille de
l'apprenant ; les autres arrivent vides, et c'est lui qui les remplit en
déroulant l'algorithme, comme sur une copie papier.

La copie est le document `{"cells": [[…], …]}`, dans les dimensions du tableau.
Chaque case que l'enseignant a remplie vaut une part égale du barème ; une case
qu'il a laissée vide n'est pas notée (au cours, on répète ou non la valeur qui
ne change pas : les deux usages se valent).
"""

from __future__ import annotations

import json
import re
import unicodedata

MAX_COLUMNS = 12
MAX_ROWS = 80
MAX_CELL = 200
MAX_ALGORITHM = 20_000

_NUMBER = re.compile(r"[+-]?\d+(?:[.,]\d+)?")
_QUOTES = "\"'«»“”‘’ "


class TraceError(ValueError):
    """Tableau inexploitable : faute de saisie de l'enseignant."""


def _cell(value) -> str:
    return "" if value is None else str(value)[:MAX_CELL]


def check_settings(settings: dict) -> dict:
    """Les réglages d'une simulation, remis en forme ; TraceError sinon.

    Chaque ligne est ramenée au nombre de colonnes : une case manquante est
    vide, une case en trop est retirée.
    """
    raw_columns = settings.get("columns") or []
    raw_rows = settings.get("rows") or []
    if not isinstance(raw_columns, list) or not isinstance(raw_rows, list):
        raise TraceError("Le tableau de simulation est mal formé")
    if len(raw_columns) > MAX_COLUMNS:
        raise TraceError(f"Un tableau de simulation compte au plus {MAX_COLUMNS} colonnes")
    if len(raw_rows) > MAX_ROWS:
        raise TraceError(f"Un tableau de simulation compte au plus {MAX_ROWS} lignes")
    algorithm = str(settings.get("algorithm") or "")
    if len(algorithm) > MAX_ALGORITHM:
        raise TraceError("L'algorithme à simuler est trop long")

    columns = []
    for column in raw_columns:
        column = column if isinstance(column, dict) else {"title": column}
        columns.append(
            {"title": _cell(column.get("title")).strip(), "given": bool(column.get("given"))}
        )
    width = len(columns)
    rows = []
    for row in raw_rows:
        cells = row if isinstance(row, list) else []
        rows.append([_cell(cells[i]) if i < len(cells) else "" for i in range(width)])
    return {**settings, "algorithm": algorithm, "columns": columns, "rows": rows}


def table_of(settings: dict | None) -> tuple[list[dict], list[list[str]]]:
    """Colonnes et lignes attendues ; un réglage abîmé se lit comme un tableau vide."""
    try:
        checked = check_settings(settings or {})
    except TraceError:
        return [], []
    return checked["columns"], checked["rows"]


def public_settings(settings: dict) -> dict:
    """Le tableau tel que l'apprenant le reçoit : seules les colonnes fournies
    gardent leur contenu, les autres arrivent vides."""
    columns, rows = table_of(settings)
    return {
        **settings,
        "columns": columns,
        "rows": [
            [cell if columns[i]["given"] else "" for i, cell in enumerate(row)] for row in rows
        ],
    }


def read_answer(answer: str, height: int, width: int) -> list[list[str]]:
    """Les cases remplies par l'apprenant, ramenées aux dimensions du tableau."""
    try:
        cells = (json.loads(answer or "null") or {}).get("cells")
    except (ValueError, AttributeError):
        cells = None
    if not isinstance(cells, list):
        cells = []
    grid = []
    for r in range(height):
        row = cells[r] if r < len(cells) and isinstance(cells[r], list) else []
        grid.append([_cell(row[c]) if c < len(row) else "" for c in range(width)])
    return grid


def _fold(text: str) -> str:
    """Casse, accents, guillemets et ponctuation effacés : « Note Numéro : 1 »
    vaut « note numero 1 »."""
    folded = unicodedata.normalize("NFD", text or "")
    folded = "".join(c for c in folded if unicodedata.category(c) != "Mn")
    folded = "".join(c if c.isalnum() else " " for c in folded.lower())
    return " ".join(folded.split())


def _number(text: str) -> float | None:
    bare = (text or "").strip().strip(_QUOTES)
    if not _NUMBER.fullmatch(bare):
        return None
    return float(bare.replace(",", "."))


def same_value(expected: str, given: str) -> bool:
    """Une case juste ? Plusieurs réponses admises se séparent par « | ».

    Deux nombres se comparent par leur valeur (11 = 11,0 = 11.00) ; le reste
    sans tenir compte de la casse, des accents ni de la ponctuation.
    """
    for option in expected.split("|"):
        a, b = _number(option), _number(given)
        if a is not None and b is not None:
            if abs(a - b) < 1e-6:
                return True
        elif _fold(option) and _fold(option) == _fold(given):
            return True
    return False


def grade(answer: str, settings: dict, points: float) -> tuple[float, list[dict]]:
    """La note du tableau et le détail case par case (cases notées seulement)."""
    columns, rows = table_of(settings)
    grid = read_answer(answer, len(rows), len(columns))
    graded = [
        (r, c)
        for r, row in enumerate(rows)
        for c, expected in enumerate(row)
        if not columns[c]["given"] and expected.strip()
    ]
    if not graded:
        return 0.0, []
    share = points / len(graded)
    details = []
    score = 0.0
    for r, c in graded:
        expected, given = rows[r][c], grid[r][c]
        passed = same_value(expected, given)
        score += share if passed else 0.0
        details.append(
            {
                "row": r,
                "col": c,
                "name": f"Ligne {r + 1} · {columns[c]['title'] or f'colonne {c + 1}'}",
                "expected": expected,
                "actual": given,
                "passed": passed,
            }
        )
    return score, details
