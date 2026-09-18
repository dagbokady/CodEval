"""Exercices à plusieurs questions : QCM, correspondance, question-réponse.

Un même exercice porte plusieurs questions : un QCM en contient autant qu'on veut,
une correspondance plusieurs grilles à relier, une question-réponse plusieurs
définitions. Les paramètres les rangent sous ``settings["questions"]``, chaque
question portant son propre intitulé et son propre corrigé.

Les exercices créés avant cette évolution n'ont pas de liste : leurs réglages
*sont* l'unique question. On les relit ici comme une liste d'un élément, plutôt
que de réécrire la base : une copie déjà rendue doit rester corrigible.
"""

from __future__ import annotations

import json

MULTI_QUESTION_KINDS = ("qcm", "matching", "short")

# Champs qui, à plat, décrivaient l'unique question d'un exercice d'autrefois.
_LEGACY_FIELDS = {
    "qcm": ("choices", "multiple"),
    "matching": ("pairs",),
    "short": ("accepted", "keywords_mode", "rows"),
}


def is_multi(kind: str) -> bool:
    return kind in MULTI_QUESTION_KINDS


def questions_of(kind: str, settings: dict | None) -> list[dict]:
    """Les questions d'un exercice, ancienne forme comprise."""
    settings = settings or {}
    if not is_multi(kind):
        return []
    listed = settings.get("questions")
    if isinstance(listed, list):
        return [q for q in listed if isinstance(q, dict)]
    legacy = {field: settings[field] for field in _LEGACY_FIELDS[kind] if field in settings}
    return [{"text": settings.get("statement", ""), **legacy}]


def answers_of(kind: str, answer: str | None, count: int) -> list:
    """Les réponses de l'apprenant, une par question, dans l'ordre des questions.

    La production est un objet ``{"questions": [...]}``. Une production antérieure
    ne connaît qu'une réponse, à plat : elle devient celle de la première question.
    """
    blanks = [None] * max(count, 0)
    text = (answer or "").strip()
    if not text:
        return blanks

    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        # Question-réponse d'autrefois : la production était le texte brut.
        data = {"text": text} if kind == "short" else None

    if isinstance(data, dict) and isinstance(data.get("questions"), list):
        given = data["questions"]
    else:
        given = [data]

    return [given[i] if i < len(given) else None for i in range(max(count, 0))]
