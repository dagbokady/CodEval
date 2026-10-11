"""Barème d'un exercice de code : ce que l'enseignant contrôle, critère par critère.

Un exercice de code ne se découpe plus en sous-questions. Son barème est une
liste plate de **critères**, chacun avec ses points, de deux familles :

- les **déclarations attendues** « la copie doit contenir une variable
  `compteur` de type entier », « une fonction `long factorielle(int)` »,
  « une structure `Point` avec les champs `x` et `y` » ;
- les **tests d'exécution** des valeurs d'entrée typées, une sortie attendue
  typée (ils vivent dans la table `test_cases`, voir `engine.py`).

Une déclaration se vérifie de deux façons, selon sa portée :

- **par compilation** pour tout ce qui est visible du fichier entier (variable
  globale, fonction, structure) : on engendre une *sonde* un pointeur du type
  exact attendu que l'on fait pointer sur ce que l'apprenant a écrit. Si le nom
  manque ou si le type ne correspond pas, la sonde ne compile pas. C'est une
  garantie, pas une approximation ;
- **par lecture du source** pour une variable locale (« déclarez un `int n` dans
  `main` ») : rien dans le C compilé ne rend une variable locale observable de
  l'extérieur. On isole alors le corps de la fonction, on en retire commentaires
  et chaînes, et l'on y cherche la déclaration. Fiable sur du C de cours, mais
  heuristique : c'est le prix d'un contrôle que le compilateur ne sait pas rendre.

Ce catalogue double `frontend/src/bareme.js`. Tout critère ajouté ici doit l'être
là aussi.
"""

from __future__ import annotations

import re

from .algo_bareme import ALGO_CRITERION_KINDS, describe_algo, is_algo_criterion
from .harness import CUSTOM, HarnessError, ValueType, declaration_of, resolve_type

# Familles de critères de déclaration, dans l'ordre du sélecteur enseignant.
CRITERION_KINDS = ("variable", "function", "struct")

# Un exercice algorithmique range ses exigences dans la même liste, avec ses
# propres familles : voir `algo_bareme.py`.
KNOWN_KINDS = CRITERION_KINDS + ALGO_CRITERION_KINDS


def criteria_of(exercise) -> list[dict]:
    """Les critères de déclaration d'un exercice, ignorant les entrées mal formées."""
    raw = (getattr(exercise, "settings", None) or {}).get("criteria")
    if not isinstance(raw, list):
        return []
    return [c for c in raw if isinstance(c, dict) and c.get("kind") in KNOWN_KINDS]


def function_criteria(exercise) -> dict[str, dict]:
    """Critères « fonction attendue » indexés par identifiant : c'est eux que les
    tests d'appel visent, et d'eux qu'ils tirent les types de leurs valeurs."""
    return {
        str(c.get("id") or ""): c for c in criteria_of(exercise) if c.get("kind") == "function"
    }


def signature_of(criterion: dict) -> dict | None:
    """Signature déclarée par un critère « fonction », ou None si elle est vide."""
    name = str((criterion or {}).get("name") or "").strip()
    if not name or not name.isidentifier():
        return None
    return {
        "name": name,
        "params": [
            {"name": p.get("name") or f"a{i}", "type": p.get("type", "int"),
             "ctype": p.get("ctype")}
            for i, p in enumerate((criterion or {}).get("params") or [])
        ],
        "returns": (criterion or {}).get("returns", "int"),
        "returns_ctype": (criterion or {}).get("returns_ctype"),
    }


def _shown_type(key, c_type=None) -> ValueType:
    """Le type à afficher : un « autre type » mal écrit se montre « ? » au lieu
    de faire échouer toute la description du barème."""
    try:
        return resolve_type(key, c_type)
    except HarnessError:
        return ValueType(str(key), "?", "?", "")


def describe(criterion: dict) -> str:
    """Le critère tel qu'on le montre à l'enseignant et à l'apprenant."""
    kind = criterion.get("kind")
    if is_algo_criterion(kind):
        return describe_algo(criterion)
    name = str(criterion.get("name") or "?")
    if kind == "function":
        signature = signature_of(criterion)
        if signature is None:
            return f"fonction {name}"
        params = ", ".join(
            _param_text(p["type"], p["name"], p.get("ctype")) for p in signature["params"]
        )
        returns = _shown_type(signature["returns"], signature.get("returns_ctype")).c_type
        return f"{returns} {name}({params or 'void'})"
    if kind == "variable":
        where = _scope_text(criterion)
        return f"{_param_text(criterion.get('vtype', 'int'), name, criterion.get('ctype'))}{where}"
    if kind == "struct":
        fields = ", ".join(
            _param_text(f.get("type", "int"), f.get("name") or "?", f.get("ctype"))
            for f in criterion.get("fields") or []
        )
        return f"struct {name} {{ {fields} }}" if fields else f"struct {name}"
    return name


def _param_text(type_key: str, name: str, c_type=None) -> str:
    vtype = _shown_type(type_key, c_type)
    if vtype.is_array:
        return f"{vtype.c_type} {name}[]"
    return f"{vtype.c_type} {name}"


def _scope_text(criterion: dict) -> str:
    if criterion.get("scope") != "local":
        return " (globale)"
    fn = str(criterion.get("in_function") or "").strip()
    return f" (dans {fn})" if fn else " (locale)"


# ----- Sondes de compilation -----
PROBE_HEADER = """/* Sonde de barème engendrée par CodEval : ne pas modifier. */
#define main {student_main}
#include "{student_file}"
#undef main
"""


def _pointer_to(vtype: ValueType, expression: str) -> str:
    """Pointeur du type attendu, pointant sur ce que l'apprenant a écrit.

    Un tableau se convertit déjà en pointeur : on ne prend pas son adresse.
    """
    if vtype.is_array:
        return f"{vtype.c_type} *__codeval_probe = {expression};"
    return f"{vtype.c_type} *__codeval_probe = &({expression});"


def _struct_probe(criterion: dict, type_name: str) -> str:
    lines = [f"static {type_name} __codeval_s;"]
    for index, field in enumerate(criterion.get("fields") or []):
        vtype = resolve_type(field.get("type", "int"), field.get("ctype"))
        member = str(field.get("name") or "").strip()
        if not member.isidentifier():
            continue
        target = f"__codeval_s.{member}"
        pointer = (
            f"{vtype.c_type} *__codeval_f{index} = {target};"
            if vtype.is_array
            else f"{vtype.c_type} *__codeval_f{index} = &({target});"
        )
        lines.append(f"static {pointer}")
    return "\n".join(lines)


def probe_bodies(criterion: dict) -> list[str]:
    """Corps de sonde à essayer, du plus précis au plus tolérant.

    Une structure peut avoir été nommée `struct Point` ou déclarée par `typedef` :
    on essaie les deux écritures avant de conclure qu'elle manque.
    """
    try:
        return _probe_bodies(criterion)
    except HarnessError:
        # Un type inconnu ou mal écrit : le critère est incomplet, pas la copie fautive.
        return []


def _probe_bodies(criterion: dict) -> list[str]:
    kind = criterion.get("kind")
    name = str(criterion.get("name") or "").strip()
    if not name.isidentifier():
        return []

    if kind == "function":
        signature = signature_of(criterion)
        if signature is None:
            return []
        return [f"static {declaration_of(signature, '__codeval_probe')} = {name};"]

    if kind == "variable":
        vtype = resolve_type(criterion.get("vtype", "int"), criterion.get("ctype"))
        return [f"static {_pointer_to(vtype, name)}"]

    if kind == "struct":
        return [_struct_probe(criterion, f"struct {name}"), _struct_probe(criterion, name)]

    return []


def build_probe(body: str, student_file: str) -> str:
    header = PROBE_HEADER.format(
        student_main="__codeval_student_main", student_file=student_file
    )
    return f"{header}\n{body}\n"


# ----- Lecture du source, pour les variables locales -----
_NOISE = re.compile(
    r"""//[^\n]*        # commentaire de fin de ligne
      | /\*.*?\*/        # commentaire encadré
      | "(?:\\.|[^"\\])*" # chaîne
      | '(?:\\.|[^'\\])*' # caractère
    """,
    re.VERBOSE | re.DOTALL,
)


def strip_noise(source: str) -> str:
    """Le code sans ses commentaires ni ses littéraux : un nom écrit dans un
    commentaire ou dans un `printf` ne vaut pas déclaration."""
    return _NOISE.sub(lambda m: " " * len(m.group(0)) if "\n" not in m.group(0) else
                      "\n" * m.group(0).count("\n"), source)


def function_body(source: str, fn_name: str) -> str | None:
    """Corps de la fonction demandée, accolades comprises retirées, ou None."""
    opening = re.search(rf"\b{re.escape(fn_name)}\s*\([^;{{}}]*\)\s*\{{", source)
    if opening is None:
        return None
    start = opening.end() - 1
    depth = 0
    for index in range(start, len(source)):
        if source[index] == "{":
            depth += 1
        elif source[index] == "}":
            depth -= 1
            if depth == 0:
                return source[start + 1 : index]
    return source[start + 1 :]


def _declaration_pattern(vtype: ValueType, name: str) -> str:
    """Motif d'une déclaration de `name` au type attendu.

    Les parenthèses sont exclues du remplissage entre le type et le nom : une
    liste de paramètres (`int somme(int t[], int n)`) n'est pas une déclaration
    de variable, et n'a donc pas à satisfaire le critère.
    """
    escaped = re.escape(name)
    if vtype.key == CUSTOM:
        # « Etudiant *tab » : les mots du type, puis ses étoiles, espaces libres.
        words = re.findall(r"\w+|\*", vtype.c_type)
        typed = r"\s*".join(rf"\b{w}\b" if w != "*" else r"\*" for w in words)
        return rf"{typed}[^;{{}}()]*?\b{escaped}\b\s*(?:=|;|,|\[)"
    if vtype.is_array:
        return rf"\b{vtype.c_type}\b[^;{{}}()]*?\b{escaped}\s*\["
    if vtype.key == "string":
        return rf"\bchar\b[^;{{}}()]*?\*[^;{{}}()]*?\b{escaped}\b\s*(?:=|;|,|\[)"
    return rf"\b{vtype.c_type}\b[^;{{}}()*]*?\b{escaped}\b\s*(?:=|;|,|\[)"


def declares_variable(source: str, criterion: dict) -> bool:
    """La copie déclare-t-elle la variable locale demandée, au type demandé ?"""
    name = str(criterion.get("name") or "").strip()
    if not name.isidentifier():
        return False
    try:
        vtype = resolve_type(criterion.get("vtype", "int"), criterion.get("ctype"))
    except HarnessError:
        return False
    clean = strip_noise(source)
    fn = str(criterion.get("in_function") or "").strip()
    if fn:
        body = function_body(clean, fn)
        if body is None:
            return False
        clean = body
    return re.search(_declaration_pattern(vtype, name), clean) is not None
