"""Correspondances : présentation mélangée côté apprenant, correction côté serveur.

Une paire « à relier » porte sa propre réponse : l'élément de droite de rang *i*
répond à l'élément de gauche de rang *i*. Envoyer les rangs au navigateur, même
mélangés, revient donc à envoyer le corrigé. On expose à la place un jeton opaque
par élément de droite ; seul le serveur sait à quel rang il correspond.

Le jeton dérive d'un sel tiré au hasard **et rangé avec l'exercice** : il survit à
une rotation de la clé de signature, sinon une copie déjà rendue deviendrait
incorrigible du jour où l'on change `CODEVAL_SECRET_KEY`.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets

from .questions import answers_of, questions_of

SALT_KEY = "_matching_salt"
_TOKEN_LENGTH = 12


def ensure_salt(settings: dict) -> dict:
    """Dote un exercice de correspondance de son sel, une fois pour toutes."""
    if not settings.get(SALT_KEY):
        settings[SALT_KEY] = secrets.token_hex(8)
    return settings


def salt_of(exercise) -> str:
    """Sel de l'exercice. Repli déterministe pour les exercices antérieurs au sel."""
    return (exercise.settings or {}).get(SALT_KEY) or f"exercise-{exercise.id}"


def token_for(salt: str, index: int, question: int = 0) -> str:
    """Jeton stable d'un élément de droite : ni devinable, ni ordonnable.

    Un exercice porte plusieurs grilles à relier : le rang de la question entre
    dans le jeton, sinon la deuxième grille rejouerait les jetons de la première.
    La première garde la forme d'origine, pour que les copies déjà rendues
    restent lisibles.
    """
    label = f"right:{index}" if question == 0 else f"q{question}:right:{index}"
    digest = hmac.new(salt.encode(), label.encode(), hashlib.sha256).hexdigest()
    return digest[:_TOKEN_LENGTH]


def tokens(salt: str, count: int, question: int = 0) -> dict[str, int]:
    """Table jeton → rang d'origine, reconstruite à la correction."""
    return {token_for(salt, index, question): index for index in range(count)}


def shuffled_order(count: int, seed: int) -> list[int]:
    """Mélange reproductible : le même exercice garde le même ordre d'affichage,
    sinon les propositions sauteraient d'un rechargement à l'autre."""
    order = list(range(count))
    state = ((seed or 1) * 2654435761) % 2147483647
    for i in range(count - 1, 0, -1):
        state = (state * 48271) % 2147483647
        j = state % (i + 1)
        order[i], order[j] = order[j], order[i]
    return order


def resolve(answer, salt: str, count: int, question: int = 0) -> int | None:
    """Rang d'origine désigné par l'apprenant.

    Accepte le jeton opaque de l'épreuve, et par tolérance un rang numérique
    (productions antérieures à l'introduction des jetons).
    """
    if answer is None:
        return None
    text = str(answer)
    index = tokens(salt, count, question).get(text)
    if index is not None:
        return index
    try:
        value = int(text)
    except ValueError:
        return None
    return value if 0 <= value < count else None


def readable_matches(exercise, answer: str, published: bool) -> list[dict]:
    """Relit les correspondances rendues : l'apprenant a répondu par jetons, seul
    le serveur peut dire quel élément il a relié : et si c'était le bon.

    Un exercice porte plusieurs grilles : chaque ligne rappelle le rang de sa
    question, pour que la copie les rende séparément. `published` faux tait le
    corrigé : la copie se lit avant la publication sans le livrer.
    """
    if exercise.kind != "matching":
        return []
    grids = questions_of("matching", exercise.settings)
    if not grids:
        return []
    given = answers_of("matching", answer, len(grids))
    salt = salt_of(exercise)

    rows = []
    for rank, grid in enumerate(grids):
        pairs = [p for p in grid.get("pairs", []) if isinstance(p, dict)]
        chosen = given[rank].get("matches", {}) if isinstance(given[rank], dict) else {}
        if not isinstance(chosen, dict):
            chosen = {}
        for index, pair in enumerate(pairs):
            picked = resolve(chosen.get(str(index)), salt, len(pairs), rank)
            rows.append(
                {
                    "question": rank + 1,
                    "prompt": str(grid.get("text", "")),
                    "left": pair.get("left", ""),
                    "chosen": pairs[picked].get("right", "") if picked is not None else None,
                    "expected": pair.get("right", "") if published else None,
                    "correct": (picked == index) if published else None,
                }
            )
    return rows
