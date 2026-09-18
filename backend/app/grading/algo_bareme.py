"""Ce qu'un **algorithme** doit contenir : le barème déclaratif d'un exercice en blocs.

Un exercice de code se contrôle par compilation : on engendre une sonde du type
exact attendu, et si elle compile, la déclaration existe. Un algorithme n'a rien
à compiler : il est traduit en Python pour être exécuté, et ce Python a perdu
l'essentiel de ce qu'on voulait vérifier : le type déclaré d'une variable, le
nom d'un enregistrement, la présence d'une boucle POUR plutôt que d'un TANT QUE.

On ne lit donc pas la traduction, mais le document même de l'apprenant : le JSON
que produit l'éditeur en blocs, dont la forme est décrite dans
`frontend/src/algoVocabulary.js`. La partie déclarative répond des variables, des
constantes et des types ; le corps, parcouru récursivement, répond des fonctions
et des structures de contrôle.

Ce catalogue double `frontend/src/algoBareme.js`. Tout critère ajouté ici doit
l'être là aussi.
"""

from __future__ import annotations

import json

from .algo import ELEMENTS

# Familles de critères algorithmiques. Le préfixe « algo_ » les distingue sans
# ambiguïté des critères de code dans une même liste `settings.criteria`.
ALGO_CRITERION_KINDS = (
    "algo_variable",
    "algo_constante",
    "algo_type",
    "algo_fonction",
    "algo_structure",
)

# Les types de données du cours, tels qu'ils s'écrivent sur le sujet. Cette table
# couvre `algo.TYPES_DONNEES` : un type ajouté à l'éditeur se nomme aussi ici.
TYPE_LABELS = {
    "entier": "ENTIER",
    "reel": "REEL",
    "caractere": "CARACTERE",
    "chaine": "CHAINE",
    "booleen": "BOOLEEN",
    "pointeur": "^",
}

# Les clés des enfants d'un bloc : c'est par elles qu'on descend dans le corps.
_ENFANTS = ("corps", "alors", "sinon")


def is_algo_criterion(kind) -> bool:
    return kind in ALGO_CRITERION_KINDS


def describe_algo(criterion: dict) -> str:
    """Le critère tel qu'on le montre à l'enseignant et à l'apprenant."""
    kind = criterion.get("kind")
    nom = str(criterion.get("name") or "").strip() or "?"

    if kind == "algo_constante":
        valeur = str(criterion.get("valeur") or "").strip()
        return f"Constante {nom} = {valeur}" if valeur else f"Constante {nom}"
    if kind == "algo_type":
        champs = [str(c).strip() for c in (criterion.get("fields") or []) if str(c).strip()]
        return f"Type {nom} : {', '.join(champs)}" if champs else f"Type {nom}"
    if kind == "algo_fonction":
        arité = _entier(criterion.get("arity"))
        if arité is None:
            return f"FONCTION {nom}(…)"
        params = ", ".join(f"p{i + 1}" for i in range(arité))
        return f"FONCTION {nom}({params})"
    if kind == "algo_structure":
        bloc = ELEMENTS.get(str(criterion.get("element") or ""), (None, "?"))[1]
        fois = _entier(criterion.get("min")) or 1
        return f"{bloc} ({fois} fois)" if fois > 1 else bloc

    return f"{nom} :{type_notation(str(criterion.get('vtype') or 'entier'), criterion.get('taille'))}"


def type_notation(vtype: str, taille=None) -> str:
    """Le type tel qu'il s'écrit au cours : ENTIER, TABLEAU[1..MAX] DE REEL."""
    if vtype.startswith("tableau_"):
        éléments = TYPE_LABELS.get(vtype.removeprefix("tableau_"), vtype.removeprefix("tableau_"))
        borne = str(taille or "").strip()
        return f"TABLEAU[1..{borne}] DE {éléments}" if borne else f"TABLEAU DE {éléments}"
    return TYPE_LABELS.get(vtype, vtype.upper())


def parse_document(production: str) -> dict:
    """Le document de l'apprenant, quelle que soit la génération de l'éditeur.

    Les copies antérieures à la structure obligatoire ne portaient que la liste
    des blocs : on les relit comme un corps sans partie déclarative, pour qu'une
    copie déjà rendue reste jugeable.
    """
    try:
        document = json.loads(production) if (production or "").strip() else {}
    except json.JSONDecodeError:
        return {}
    if isinstance(document, list):
        return {"corps": document}
    if not isinstance(document, dict):
        return {}
    if document.get("corps") is None and isinstance(document.get("blocs"), list):
        document = {**document, "corps": document["blocs"]}
    return document


def check_algo_criterion(document: dict, criterion: dict) -> tuple[bool, str]:
    """La copie satisfait-elle cette exigence ? Rend (satisfait, journal).

    Le journal ne sert qu'à expliquer un refus qui n'est pas la faute de
    l'apprenant : une exigence incomplète, que l'enseignant devra reprendre.
    """
    kind = criterion.get("kind")
    nom = str(criterion.get("name") or "").strip()

    if kind == "algo_structure":
        élément = str(criterion.get("element") or "")
        if élément not in ELEMENTS:
            return False, "Exigence incomplète : structure inconnue."
        minimum = _entier(criterion.get("min")) or 1
        return _compte_structure(document.get("corps") or [], élément) >= minimum, ""

    if not nom:
        return False, "Exigence incomplète : nom manquant."

    if kind == "algo_variable":
        return _variable(document, criterion, nom), ""
    if kind == "algo_constante":
        return _constante(document, criterion, nom), ""
    if kind == "algo_type":
        return _type(document, criterion, nom), ""
    if kind == "algo_fonction":
        return _fonction(document.get("corps") or [], criterion, nom), ""
    return False, "Exigence inconnue."


# ----- Partie déclarative -----
def _variable(document: dict, criterion: dict, nom: str) -> bool:
    attendu = str(criterion.get("vtype") or "entier")
    taille = str(criterion.get("taille") or "").strip()
    for variable in document.get("variables") or []:
        if not isinstance(variable, dict) or not _même(variable.get("nom"), nom):
            continue
        if str(variable.get("type") or "entier") != attendu:
            return False
        # Une taille laissée vide par l'enseignant ne l'exige pas ; demandée, elle
        # se compare telle qu'elle est écrite, constante nommée comprise.
        if taille and str(variable.get("taille") or "").strip() != taille:
            return False
        return True
    return False


def _constante(document: dict, criterion: dict, nom: str) -> bool:
    valeur = str(criterion.get("valeur") or "").strip()
    for constante in document.get("constantes") or []:
        if not isinstance(constante, dict) or not _même(constante.get("nom"), nom):
            continue
        if valeur and str(constante.get("valeur") or "").strip() != valeur:
            return False
        return True
    return False


def _type(document: dict, criterion: dict, nom: str) -> bool:
    """Un enregistrement : son nom, et les champs que l'énoncé exige.

    La définition est écrite librement par l'apprenant (« nom : chaîne, age :
    entier ») : on ne peut pas en tirer des types champ par champ, mais on peut
    y chercher les noms des champs demandés, comme mots entiers.
    """
    champs = [str(c).strip() for c in (criterion.get("fields") or []) if str(c).strip()]
    for déclaré in document.get("types") or []:
        if not isinstance(déclaré, dict) or not _même(déclaré.get("nom"), nom):
            continue
        mots = _mots(str(déclaré.get("definition") or ""))
        return all(champ.casefold() in mots for champ in champs)
    return False


# ----- Corps -----
def _fonction(corps: list, criterion: dict, nom: str) -> bool:
    arité = _entier(criterion.get("arity"))
    for bloc in _parcours(corps):
        if bloc.get("type") != "fonction" or not _même(bloc.get("nom"), nom):
            continue
        if arité is None:
            return True
        if len(bloc.get("parametres") or []) == arité:
            return True
    return False


def _compte_structure(corps: list, élément: str) -> int:
    """Combien de fois cette structure apparaît, à tous les niveaux d'imbrication.

    Le SINON n'est pas un bloc qu'on pose : c'est la seconde branche d'un SI, et
    c'est sa présence qu'on compte.
    """
    if élément == "sinon":
        return sum(1 for bloc in _parcours(corps) if bloc.get("type") == "si" and bloc.get("sinon"))
    return sum(1 for bloc in _parcours(corps) if bloc.get("type") == élément)


def _parcours(corps):
    """Tous les blocs du corps, les imbriqués compris."""
    for bloc in corps or []:
        if not isinstance(bloc, dict):
            continue
        yield bloc
        for clé in _ENFANTS:
            enfants = bloc.get(clé)
            if isinstance(enfants, list):
                yield from _parcours(enfants)


# ----- Outils -----
def _même(écrit, attendu: str) -> bool:
    """Deux noms se valent à la casse près : l'algorithmique n'est pas le C."""
    return str(écrit or "").strip().casefold() == attendu.casefold()


def _mots(texte: str) -> set[str]:
    séparé = "".join(c if c.isalnum() or c == "_" else " " for c in texte)
    return {mot.casefold() for mot in séparé.split()}


def _entier(valeur) -> int | None:
    """Un nombre saisi par l'enseignant, ou None s'il a laissé le champ vide."""
    texte = str(valeur if valeur is not None else "").strip()
    if not texte:
        return None
    try:
        return int(float(texte))
    except ValueError:
        return None
