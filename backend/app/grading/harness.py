"""Types des valeurs de test, et harnais d'appel de fonction.

Un test d'exécution porte des **valeurs**, pas du texte à mettre en forme : ses
types sont déclarés une fois : dans le critère de barème pour un test qui appelle
une fonction, sur le test lui-même pour un test qui fait tourner le programme
entier. De ces types on tire deux choses :

- le programme de test, un `main` engendré qui appelle la fonction de l'apprenant
  avec les valeurs du test et imprime ce qu'elle retourne ;
- l'entrée standard d'un test de programme entier, écrite dans l'ordre des types
  déclarés.

Les contrôles de déclaration du barème (variable, fonction, structure attendues)
vivent dans `bareme.py`, qui reprend les types définis ici.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


class HarnessError(ValueError):
    """Signature ou valeur de test inexploitable : faute de saisie, pas de l'apprenant."""


@dataclass(frozen=True)
class ValueType:
    key: str
    label: str
    c_type: str
    printf: str
    # Un tableau occupe deux paramètres C : le pointeur, puis sa taille.
    is_array: bool = False


TYPES: dict[str, ValueType] = {
    "int": ValueType("int", "Entier", "int", "%d"),
    "short": ValueType("short", "Entier court", "short", "%hd"),
    "long": ValueType("long", "Entier long", "long", "%ld"),
    "float": ValueType("float", "Décimal simple précision", "float", "%.6g"),
    "double": ValueType("double", "Nombre décimal", "double", "%.6g"),
    "char": ValueType("char", "Caractère", "char", "%c"),
    "bool": ValueType("bool", "Booléen (0 / 1)", "bool", "%d"),
    "string": ValueType("string", "Chaîne de caractères", "char *", "%s"),
    "short[]": ValueType("short[]", "Tableau d'entiers courts", "short", "%hd", is_array=True),
    "int[]": ValueType("int[]", "Tableau d'entiers", "int", "%d", is_array=True),
    "long[]": ValueType("long[]", "Tableau d'entiers longs", "long", "%ld", is_array=True),
    "float[]": ValueType("float[]", "Tableau de décimaux simple précision", "float", "%.6g", is_array=True),
    "double[]": ValueType("double[]", "Tableau de décimaux", "double", "%.6g", is_array=True),
    "char[]": ValueType("char[]", "Tableau de caractères", "char", "%c", is_array=True),
    "bool[]": ValueType("bool[]","Tableau de booléens","bool","%d",is_array=True),
    "void": ValueType("void", "Rien (affiche seulement)", "void", ""),
}

# Langages disposant du harnais d'appel de fonction. Ailleurs, une sous-question
# est corrigée par entrée/sortie même si elle déclare une signature.
CALLABLE_LANGUAGES = {"c", "cpp"}


def get_type(key: str) -> ValueType:
    try:
        return TYPES[key]
    except KeyError:
        raise HarnessError(f"Type de valeur inconnu : {key}") from None


# « Autre type » : un type C écrit en toutes lettres par l'enseignant (une
# structure, un pointeur : `Etudiant *`, `struct Note`). Il entre tel quel dans
# les sondes compilées : on n'y admet que des mots et des étoiles.
CUSTOM = "custom"
_C_TYPE = re.compile(
    r"(?:(?:const|unsigned|signed|struct|enum|union|long|short)\s+)*"
    r"[A-Za-z_]\w*(?:\s*\*)*"
)


def custom_c_type(text) -> str:
    """Le type C d'un « autre type », normalisé, ou HarnessError s'il n'en est pas un."""
    cleaned = " ".join(str(text or "").split())
    if not cleaned or len(cleaned) > 60 or not _C_TYPE.fullmatch(cleaned):
        raise HarnessError(f"« {text} » n'est pas un type C valide")
    return cleaned


def resolve_type(key, c_type=None) -> ValueType:
    """Le type d'un paramètre, d'un retour, d'un champ ou d'une variable : un
    type du catalogue, ou un « autre type » dont le texte C accompagne la clé."""
    if key == CUSTOM:
        text = custom_c_type(c_type)
        return ValueType(CUSTOM, text, text, "")
    return get_type(key)


# ----- Rendu des valeurs -----
def _escape(text: str) -> str:
    out = []
    for ch in text:
        if ch == "\\":
            out.append("\\\\")
        elif ch == '"':
            out.append('\\"')
        elif ch == "\n":
            out.append("\\n")
        elif ch == "\t":
            out.append("\\t")
        elif ord(ch) < 32 or ord(ch) == 127:
            out.append(f"\\{ord(ch):03o}")
        else:
            out.append(ch)
    return "".join(out)


def _as_list(value) -> list:
    if isinstance(value, list):
        return value
    text = str(value or "").replace(",", " ").replace(";", " ")
    return [piece for piece in text.split() if piece]


def _number(value, kind: str) -> str:
    try:
        if kind == "double":
            return repr(float(value))
        return str(int(str(value).strip()))
    except (TypeError, ValueError):
        raise HarnessError(f"« {value} » n'est pas un {kind} valide") from None


def literal(vtype: ValueType, value) -> str:
    """Valeur saisie par l'enseignant → littéral C."""
    if vtype.key in ("int", "short", "long"):
        return _number(value, "int")
    if vtype.key in ("double", "float"):
        return _number(value, "double") + ("f" if vtype.key == "float" else "")
    if vtype.key == "bool":
        return "1" if str(value).strip().lower() in ("1", "true", "vrai", "oui") else "0"
    if vtype.key == "char":
        text = str(value or " ")
        return f"'{_escape(text[0])}'"
    if vtype.key == "string":
        return f'"{_escape(str(value or ""))}"'
    raise HarnessError(f"{vtype.label} ne se rend pas comme une valeur simple")


def stdin_for(types: list, args: list) -> str:
    """Valeurs typées → entrée standard, pour un test du programme entier.

    Un tableau descend sur deux lignes : sa taille, puis ses éléments : la forme
    que prennent les exercices « lisez n, puis n valeurs ».
    """
    lines: list[str] = []
    keys = [t.get("type", "int") if isinstance(t, dict) else str(t) for t in types]
    for key, value in zip(keys, list(args) + [None] * len(keys)):
        vtype = get_type(key)
        if vtype.is_array:
            items = _as_list(value)
            lines.append(str(len(items)))
            lines.append(" ".join(str(x) for x in items))
        else:
            lines.append(str("" if value is None else value))
    return "".join(line + "\n" for line in lines)


# ----- Génération du programme de test -----
def declaration_of(sig: dict, variable: str) -> str:
    """Déclaration du pointeur de fonction attendu : la sonde de signature."""
    parts: list[str] = []
    for param in sig["params"]:
        vtype = resolve_type(param["type"], param.get("ctype"))
        if vtype.is_array:
            parts.extend([f"{vtype.c_type} *", "int"])
        else:
            parts.append(vtype.c_type)
    ret = resolve_type(sig["returns"], sig.get("returns_ctype"))
    return f"{ret.c_type} (*{variable})({', '.join(parts) or 'void'})"


def is_callable(sig: dict) -> bool:
    """Un test peut-il appeler cette fonction ? Pas si elle reçoit ou rend un
    « autre type » : une structure ne s'écrit pas comme valeur de test. Elle se
    vérifie alors par sa déclaration, et se teste par le programme entier."""
    return sig["returns"] != CUSTOM and all(p["type"] != CUSTOM for p in sig["params"])


def _call(sig: dict, args: list) -> tuple[list[str], str]:
    """Déclarations locales des arguments, puis l'expression d'appel."""
    setup: list[str] = []
    passed: list[str] = []
    for index, param in enumerate(sig["params"]):
        vtype = get_type(param["type"])
        value = args[index] if index < len(args) else None
        if vtype.is_array:
            items = _as_list(value)
            # Les éléments se rendent comme la valeur simple qu'ils sont : un
            # tableau de caractères s'écrit {'a', 'b'}, pas {97, 98}.
            element = get_type(vtype.key[:-2])
            rendered = ", ".join(literal(element, item) for item in items)
            name = f"__arg{index}"
            # Un tableau vide n'est pas déclarable en C : on réserve un élément
            # et l'on passe une longueur nulle.
            setup.append(f"    {vtype.c_type} {name}[] = {{{rendered or '0'}}};")
            passed.extend([name, str(len(items))])
        else:
            passed.append(literal(vtype, value))
    return setup, f"{sig['name']}({', '.join(passed)})"


HARNESS_HEADER = """/* Programme de test engendré par CodEval : ne pas modifier. */
#define main {student_main}
#include "{student_file}"
#undef main

#include <stdio.h>
#include <stdlib.h>

/* Sonde de signature : échoue à la compilation si la fonction attendue est
   absente, mal nommée, ou n'a pas les paramètres ou le retour demandés. */
static {probe} = {name};
"""


def build_harness(sig: dict, cases: list[list], student_file: str) -> str:
    """Programme de test complet : un cas par indice reçu en argument."""
    if not is_callable(sig):
        raise HarnessError(
            "une fonction qui reçoit ou rend une structure ne s'appelle pas depuis un test : "
            "vérifiez-la par sa déclaration et testez le programme entier"
        )
    ret = get_type(sig["returns"])
    body: list[str] = []
    for index, args in enumerate(cases):
        setup, call = _call(sig, args)
        body.append(f"    if (__case == {index}) {{")
        body.extend(f"    {line}" for line in setup)
        if ret.key == "void":
            body.append(f"        {call};")
        else:
            body.append(f"        {ret.c_type} __r = {call};")
            body.append(f'        printf("{ret.printf}", __r);')
        body.append("        return 0;")
        body.append("    }")

    header = HARNESS_HEADER.format(
        student_main="__codeval_student_main",
        student_file=student_file,
        probe=declaration_of(sig, "__codeval_probe"),
        name=sig["name"],
    )
    # La sonde n'est jamais appelée : on la référence pour que le compilateur ne
    # la signale pas comme inutilisée.
    return (
        header
        + "\nint main(int argc, char **argv)\n{\n"
        "    int __case = (argc > 1) ? atoi(argv[1]) : 0;\n"
        "    (void)argv;\n"
        "    (void)__codeval_probe;\n"
        + "\n".join(body)
        + "\n    return 0;\n}\n"
    )
