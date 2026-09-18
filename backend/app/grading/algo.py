"""Traduction d'un algorithme en blocs vers du Python exécutable.

L'algorithme a toujours la forme du cours : un nom, une partie déclarative
(constantes, types, variables), puis un corps encadré par Début et Fin. Ce
squelette est posé par l'éditeur ; l'apprenant le remplit avec le seul
vocabulaire autorisé par l'enseignant (LIRE, ECRIRE, SI, POUR, TANT QUE…).
Plutôt que d'écrire un interpréteur de pseudo-code, on traduit le document en
Python : la production passe ensuite par le même bac à sable et les mêmes jeux
de tests que n'importe quel autre langage.
"""

from __future__ import annotations

import json
import re

PRELUDE = '''import sys

_donnees = sys.stdin.read().split()
_curseur = 0


def LIRE():
    global _curseur
    if _curseur >= len(_donnees):
        return 0
    brut = _donnees[_curseur]
    _curseur += 1
    try:
        return int(brut)
    except ValueError:
        try:
            return float(brut)
        except ValueError:
            return brut


def ECRIRE(*valeurs):
    # ECRIRE("note numéro ", i) : les morceaux se suivent tels qu'écrits.
    print(*valeurs, sep="")


def TABLEAU(taille, valeur=0):
    return [valeur] * int(taille)
'''

# Éléments de la partie déclarative. Ils portent le même nom que dans
# `frontend/src/algoVocabulary.js` : l'enseignant les autorise comme les autres.
DECLARATIONS = {
    "constante": ("Déclaration", "Constante"),
    "type": ("Déclaration", "Type"),
    "declaration": ("Déclaration", "Variable"),
}

# Valeur initiale d'une variable selon son type déclaré.
TYPES_DONNEES = {
    "entier": "0",
    "reel": "0.0",
    "caractere": '""',
    "chaine": '""',
    "booleen": "False",
    # TABLEAU[1..taille] : une case de plus, pour que les indices 1 à taille
    # existent tous (la case 0 reste disponible pour qui compte depuis 0).
    "tableau_entier": "TABLEAU(({taille}) + 1, 0)",
    "tableau_reel": "TABLEAU(({taille}) + 1, 0.0)",
    "tableau_caractere": 'TABLEAU(({taille}) + 1, "")',
    "tableau_chaine": 'TABLEAU(({taille}) + 1, "")',
    "tableau_booleen": "TABLEAU(({taille}) + 1, False)",
    "pointeur": "None",
}

# Vocabulaire du corps, groupé comme dans la maquette.
ELEMENTS = {
    "lire": ("Entrées / sorties", "LIRE()"),
    "ecrire": ("Entrées / sorties", "ECRIRE()"),
    "si": ("Conditions", "SI … ALORS … FINSI"),
    "sinon": ("Conditions", "SINON"),
    "pour": ("Boucles", "POUR … FINPOUR"),
    "tantque": ("Boucles", "TANTQUE … FINTANTQUE"),
    "repeter": ("Boucles", "REPETER … JUSQU'A"),
    "variable": ("Structures", "VARIABLE"),
    "tableau": ("Structures", "TABLEAU"),
    "fonction": ("Structures", "FONCTION … FINFONCTION"),
    "affectation": ("Opérateurs", "← (affectation)"),
    "retour": ("Opérateurs", "RETOURNE()"),
}

DEFAULT_ELEMENTS = ["constante", "declaration", "lire", "ecrire", "si", "sinon", "pour",
                    "tantque", "variable", "tableau", "affectation"]

_IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
_ALLOWED_CHARS = re.compile(r"^[A-Za-z0-9_ \t\+\-\*/%\(\)\[\]\.,<>=!\"'≠≤≥]*$")
_FORBIDDEN_NAMES = {
    "import", "eval", "exec", "compile", "open", "globals", "locals", "getattr",
    "setattr", "delattr", "vars", "dir", "input", "exit", "quit", "breakpoint",
    "os", "sys", "subprocess", "socket", "shutil", "pickle",
}
_MOTS = {
    "ET": "and", "OU": "or", "NON": "not", "VRAI": "True", "FAUX": "False",
    "mod": "%", "MOD": "%", "DIV": "//",
}


class AlgoError(ValueError):
    """Algorithme impossible à traduire : élément interdit ou expression invalide."""


_CHAINE = re.compile(r'"(?:[^"\\\n]|\\.)*"|\'(?:[^\'\\\n]|\\.)*\'')


def _expression(source: str, *, condition: bool = False) -> str:
    texte = (source or "").strip()
    if not texte:
        raise AlgoError("Une expression est vide.")
    # Le texte entre guillemets est libre (accents, « : », « ? ») : on le met de
    # côté le temps du contrôle, pour ne filtrer que le code autour.
    chaines: list[str] = []

    def _garde(match: re.Match) -> str:
        chaines.append(match.group(0))
        return f"_chaine{len(chaines) - 1}_"

    texte = _CHAINE.sub(_garde, texte)
    # Une chaîne collée à un nom (f"…", b"…", r"…") changerait de nature en Python :
    # f"{…}" exécuterait du code. Le pseudo-code n'a pas de préfixe de chaîne.
    if re.search(r"[A-Za-z0-9_]_chaine\d+_|_chaine\d+_[A-Za-z0-9_]", texte):
        raise AlgoError("Expression non autorisée.")
    texte = texte.replace("≠", "!=").replace("≤", "<=").replace("≥", ">=")
    if not _ALLOWED_CHARS.match(texte):
        raise AlgoError(f"Caractère non autorisé dans l'expression « {source} ».")
    if "__" in re.sub(r"_chaine\d+_", "", texte):
        raise AlgoError("Expression non autorisée.")
    for nom in _IDENT.findall(texte):
        if nom.lower() in _FORBIDDEN_NAMES and nom not in ("LIRE", "ECRIRE", "TABLEAU"):
            raise AlgoError(f"Le nom « {nom} » n'est pas autorisé.")
    texte = re.sub(r"\b(ET|OU|NON|VRAI|FAUX|mod|MOD|DIV)\b", lambda m: _MOTS[m.group(0)], texte)
    if condition:
        # « = » signifie l'égalité dans une condition ; « ← » sert à l'affectation.
        texte = re.sub(r"(?<![=!<>])=(?!=)", "==", texte)
    return re.sub(r"_chaine(\d+)_", lambda m: chaines[int(m.group(1))], texte)


def _nom(source: str) -> str:
    nom = (source or "").strip()
    if not _IDENT.fullmatch(nom) or "__" in nom or nom.lower() in _FORBIDDEN_NAMES:
        raise AlgoError(f"« {source} » n'est pas un nom de variable valide.")
    return nom


def _cible(source: str) -> str:
    """Ce qui reçoit une valeur : une variable, ou une case de tableau `t[i]`."""
    cible = (source or "").strip()
    if "[" not in cible:
        return _nom(cible)
    if not cible.endswith("]"):
        raise AlgoError(f"« {source} » n'est pas une case de tableau valide.")
    base = _nom(cible[: cible.index("[")])
    return f"{base}[{_expression(cible[cible.index('[') + 1 : -1])}]"


def _bloc(noeud: dict, niveau: int, autorises: set[str], lignes: list[str]) -> None:
    marge = "    " * niveau
    type_ = noeud.get("type")
    if type_ not in ELEMENTS:
        raise AlgoError(f"Élément inconnu : {type_}.")
    if type_ not in autorises:
        raise AlgoError(f"L'élément « {ELEMENTS[type_][1]} » n'est pas autorisé pour cette question.")

    if type_ == "lire":
        # LIRE(notes[i]) range la valeur lue dans une case du tableau.
        lignes.append(f"{marge}{_cible(noeud.get('cible'))} = LIRE()")
    elif type_ == "ecrire":
        lignes.append(f"{marge}ECRIRE({_expression(noeud.get('expression'))})")
    elif type_ == "variable":
        valeur = noeud.get("valeur") or "0"
        lignes.append(f"{marge}{_nom(noeud.get('nom'))} = {_expression(valeur)}")
    elif type_ == "tableau":
        lignes.append(f"{marge}{_nom(noeud.get('nom'))} = TABLEAU({_expression(noeud.get('taille'))})")
    elif type_ == "affectation":
        lignes.append(f"{marge}{_cible(noeud.get('cible'))} = {_expression(noeud.get('expression'))}")
    elif type_ == "retour":
        lignes.append(f"{marge}return {_expression(noeud.get('expression'))}")
    elif type_ == "si":
        lignes.append(f"{marge}if {_expression(noeud.get('condition'), condition=True)}:")
        _corps(noeud.get("alors"), niveau + 1, autorises, lignes)
        sinon = noeud.get("sinon") or []
        if sinon:
            if "sinon" not in autorises:
                raise AlgoError("L'élément « SINON » n'est pas autorisé pour cette question.")
            lignes.append(f"{marge}else:")
            _corps(sinon, niveau + 1, autorises, lignes)
    elif type_ == "pour":
        variable = _nom(noeud.get("variable"))
        debut = _expression(noeud.get("debut"))
        fin = _expression(noeud.get("fin"))
        pas = _expression(str(noeud.get("pas") or "").strip() or "1")
        # « par pas de » : la borne finale est incluse, dans un sens comme dans l'autre.
        lignes.append(
            f"{marge}for {variable} in range(int({debut}), int({fin}) + (1 if int({pas}) > 0 else -1), int({pas})):"
        )
        _corps(noeud.get("corps"), niveau + 1, autorises, lignes)
    elif type_ == "tantque":
        lignes.append(f"{marge}while {_expression(noeud.get('condition'), condition=True)}:")
        _corps(noeud.get("corps"), niveau + 1, autorises, lignes)
    elif type_ == "repeter":
        # « Répéter … jusqu'à » exécute d'abord, teste ensuite : Python n'a pas de
        # do-while, on le compose avec une boucle infinie et une sortie conditionnelle.
        lignes.append(f"{marge}while True:")
        _corps(noeud.get("corps"), niveau + 1, autorises, lignes)
        lignes.append(f"{marge}    if {_expression(noeud.get('condition'), condition=True)}:")
        lignes.append(f"{marge}        break")
    elif type_ == "fonction":
        parametres = [_nom(p) for p in (noeud.get("parametres") or [])]
        lignes.append(f"{marge}def {_nom(noeud.get('nom'))}({', '.join(parametres)}):")
        _corps(noeud.get("corps"), niveau + 1, autorises, lignes)


def _corps(blocs, niveau: int, autorises: set[str], lignes: list[str]) -> None:
    if not blocs:
        lignes.append("    " * niveau + "pass")
        return
    for noeud in blocs:
        _bloc(noeud, niveau, autorises, lignes)


def _declarations(document: dict, autorises: set[str], lignes: list[str]) -> None:
    """Traduit la partie déclarative : constantes, types, variables."""
    constantes = document.get("constantes") or []
    types = document.get("types") or []
    variables = document.get("variables") or []

    for rubrique, contenu in (("constante", constantes), ("type", types),
                              ("declaration", variables)):
        if contenu and rubrique not in autorises:
            raise AlgoError(
                f"L'élément « {DECLARATIONS[rubrique][1]} » n'est pas autorisé pour cette question."
            )

    for constante in constantes:
        lignes.append(f"{_nom(constante.get('nom'))} = {_expression(constante.get('valeur'))}")

    # Un enregistrement ne s'exécute pas : il documente la copie, et les critères
    # du barème sont ce qui le vérifie. On en garde la trace, sans plus.
    for type_ in types:
        # La définition est libre : on la ramène à une ligne, sans quoi un retour
        # chariot ferait sortir le commentaire de son commentaire.
        definition = " ".join(str(type_.get("definition") or "").split())
        lignes.append(f"# Type {_nom(type_.get('nom'))} : {definition}")

    for variable in variables:
        nom = _nom(variable.get("nom"))
        modele = TYPES_DONNEES.get(variable.get("type") or "entier")
        if modele is None:
            raise AlgoError(f"Type de donnée inconnu : {variable.get('type')}.")
        if "{taille}" in modele:
            taille = str(variable.get("taille") or "").strip()
            if not taille:
                raise AlgoError(f"La taille du tableau « {nom} » n'est pas indiquée.")
            modele = modele.format(taille=_expression(taille))
        lignes.append(f"{nom} = {modele}")


def transpile(production: str, allowed: list[str] | None = None) -> str:
    """Traduit le document de l'apprenant (JSON) en programme Python complet."""
    try:
        document = json.loads(production) if production.strip() else {}
    except json.JSONDecodeError as exc:
        raise AlgoError("Algorithme illisible.") from exc

    # Les copies antérieures à la structure obligatoire ne portaient que la liste
    # des blocs : on les relit comme un corps sans déclarations.
    if isinstance(document, list):
        document = {"corps": document}
    if not isinstance(document, dict):
        raise AlgoError("Algorithme illisible.")

    corps = document.get("corps")
    if corps is None:
        corps = document.get("blocs")
    if corps is None:
        corps = []
    if not isinstance(corps, list):
        raise AlgoError("Algorithme illisible.")

    autorises = set(allowed or DEFAULT_ELEMENTS)
    lignes: list[str] = []
    _declarations(document, autorises, lignes)
    debut_du_corps = len(lignes)
    for noeud in corps:
        _bloc(noeud, 0, autorises, lignes)
    if len(lignes) == debut_du_corps:
        raise AlgoError("Le corps de l'algorithme est vide.")

    source = PRELUDE + "\n\n" + "\n".join(lignes) + "\n"
    try:
        compile(source, "<algorithme>", "exec")
    except SyntaxError as exc:
        raise AlgoError(f"Algorithme invalide : {exc.msg}") from exc
    return source
