"""Contenu du jeu de donnees du banc : l'evaluation BENCH-SRIT et les variantes
de reponses (chapitre 4, sections 4.2 et 4.3 du memoire).

Ce module ne touche ni a la base ni au tirage : il ne decrit que le contenu.
`gen_dataset.py` tire les copies, `load_dataset.py` les charge en base.

Cinq classes de reponses, trois variantes chacune, pour les exercices de code et
d'algorithmique :

    K1 correcte, K2 partielle, K3 erreur de compilation, K4 boucle infinie,
    K5 vide (non rendue)
"""

from __future__ import annotations

import json

# ---------------------------------------------------------------------------
# Proportions des classes de reponses (section 4.2.2)
# ---------------------------------------------------------------------------

CLASS_WEIGHTS = {"K1": 0.60, "K2": 0.15, "K3": 0.10, "K4": 0.05, "K5": 0.10}

# ---------------------------------------------------------------------------
# Exercice 1 : calculatrice en boucle (code C, 6 points, 6 tests)
# ---------------------------------------------------------------------------

EX1_STATEMENT = (
    "Lire un entier n, puis n operations de la forme a op b, une par ligne, avec "
    "op parmi + - * / %. Afficher le resultat de chaque operation sur sa propre "
    "ligne. Une division ou un modulo par zero affiche ERREUR."
)

EX1_TESTS = [
    ("1\n2 + 3\n", "5\n"),
    ("1\n7 - 10\n", "-3\n"),
    ("1\n6 * 7\n", "42\n"),
    ("1\n9 / 2\n", "4\n"),
    ("1\n9 % 4\n", "1\n"),
    ("2\n5 / 0\n8 + 1\n", "ERREUR\n9\n"),
]

_EX1_OK = r"""#include <stdio.h>

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    for (int k = 0; k < n; k++) {
        int a, b;
        char op;
        if (scanf(" %d %c %d", &a, &op, &b) != 3) return 0;
        if ((op == '/' || op == '%%') && b == 0) {
            printf("ERREUR\n");
            continue;
        }
        if (op == '+') printf("%%d\n", a + b);
        else if (op == '-') printf("%%d\n", a - b);
        else if (op == '*') printf("%%d\n", a * b);
        else if (op == '/') printf("%%d\n", a / b);
        else if (op == '%%') printf("%%d\n", a %% b);
    }
    return 0;
}
"""

# Le modele ci-dessus contient des %% pour proteger les formats de printf lors du
# formatage Python : on les remet a leur valeur reelle une fois pour toutes.
_EX1_OK = _EX1_OK.replace("%%", "%")

_EX1_PARTIEL = _EX1_OK.replace(
    """        else if (op == '%') printf("%d\\n", a % b);\n""", ""
)

_EX1_COMPILE = _EX1_OK.replace("    int n;", "    int n")

_EX1_BOUCLE = r"""#include <stdio.h>

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 0;
    int k = 0;
    while (k < n) {
        int a, b;
        char op;
        scanf(" %d %c %d", &a, &op, &b);
        printf("%d\n", a + b);
    }
    return 0;
}
"""

# ---------------------------------------------------------------------------
# Exercice 2 : premier pointeur sur un entier (code C, 4 points)
# ---------------------------------------------------------------------------

EX2_STATEMENT = (
    "Declarer dans main un entier i valant 42 et un pointeur p sur cet entier, "
    "puis afficher la valeur de i en passant par le pointeur."
)

EX2_TESTS = [("", "42\n")]

EX2_CRITERIA = [
    {
        "id": "c1",
        "kind": "variable",
        "name": "i",
        "vtype": "int",
        "scope": "local",
        "function": "main",
        "points": 1.0,
    }
]

_EX2_OK = """#include <stdio.h>

int main(void) {
    int i = 42;
    int *p = &i;
    printf("%d\\n", *p);
    return 0;
}
"""

# La sortie attendue est bien produite, mais i n'est pas declare int : le critere
# de declaration du bareme echoue, le test d'execution passe.
_EX2_PARTIEL = """#include <stdio.h>

int main(void) {
    long i = 42;
    long *p = &i;
    printf("%ld\\n", *p);
    return 0;
}
"""

_EX2_COMPILE = """#include <stdio.h>

int main(void) {
    int i = 42;
    int *p = &j;
    printf("%d\\n", *p);
    return 0;
}
"""

_EX2_BOUCLE = """#include <stdio.h>

int main(void) {
    int i = 42;
    int *p = &i;
    while (*p > 0) {
        printf("%d\\n", *p);
    }
    return 0;
}
"""

# ---------------------------------------------------------------------------
# Exercice 3 : moyenne de N notes (algorithmique, 4 points)
# ---------------------------------------------------------------------------

EX3_STATEMENT = (
    "ALGORITHME MoyenneNotes. Lire un entier n, puis n notes reelles. "
    "Afficher la moyenne de ces notes."
)

EX3_TESTS = [("3\n10\n12\n14\n", "12"), ("4\n8\n12\n16\n4\n", "10")]

EX3_ALLOWED = ["constante", "declaration", "lire", "ecrire", "si", "sinon", "pour",
               "tantque", "affectation"]

_EX3_VARS = [
    {"nom": "n", "type": "entier"},
    {"nom": "i", "type": "entier"},
    {"nom": "note", "type": "reel"},
    {"nom": "somme", "type": "reel", "valeur": "0"},
]


def _algo(corps: list[dict], variables: list[dict] | None = None) -> str:
    """Un document d'algorithme tel que l'editeur en blocs l'enregistre."""
    return json.dumps(
        {"variables": variables if variables is not None else _EX3_VARS, "corps": corps},
        ensure_ascii=False,
    )


_EX3_OK = _algo([
    {"type": "lire", "cible": "n"},
    {"type": "pour", "variable": "i", "debut": "1", "fin": "n", "pas": "1", "corps": [
        {"type": "lire", "cible": "note"},
        {"type": "affectation", "cible": "somme", "expression": "somme + note"},
    ]},
    {"type": "ecrire", "expression": "somme / n"},
])

# Somme des notes au lieu de la moyenne : le calcul est faux, la copie compile.
_EX3_PARTIEL = _algo([
    {"type": "lire", "cible": "n"},
    {"type": "pour", "variable": "i", "debut": "1", "fin": "n", "pas": "1", "corps": [
        {"type": "lire", "cible": "note"},
        {"type": "affectation", "cible": "somme", "expression": "somme + note"},
    ]},
    {"type": "ecrire", "expression": "somme"},
])

# LIRE sans variable cible : le document est refuse a la transpilation.
_EX3_COMPILE = _algo([
    {"type": "lire", "cible": ""},
    {"type": "ecrire", "expression": "somme"},
])

# TANTQUE dont la condition est toujours vraie.
_EX3_BOUCLE = _algo([
    {"type": "lire", "cible": "n"},
    {"type": "tantque", "condition": "1 < 2", "corps": [
        {"type": "affectation", "cible": "somme", "expression": "somme + 1"},
    ]},
    {"type": "ecrire", "expression": "somme / n"},
])

# ---------------------------------------------------------------------------
# Exercice 4 : QCM (5 questions, 3 points) et exercice 5 : vrai/faux (3 points)
# ---------------------------------------------------------------------------

QCM_QUESTIONS = [
    {"text": "Quel type stocke un entier signe en C ?",
     "choices": [{"text": "int", "correct": True}, {"text": "char *", "correct": False},
                 {"text": "float", "correct": False}], "multiple": False},
    {"text": "Que vaut 7 / 2 entre entiers ?",
     "choices": [{"text": "3", "correct": True}, {"text": "3.5", "correct": False},
                 {"text": "4", "correct": False}], "multiple": False},
    {"text": "Quel operateur donne le reste d'une division entiere ?",
     "choices": [{"text": "%", "correct": True}, {"text": "/", "correct": False},
                 {"text": "&", "correct": False}], "multiple": False},
    {"text": "Quelle fonction affiche sur la sortie standard ?",
     "choices": [{"text": "printf", "correct": True}, {"text": "scanf", "correct": False},
                 {"text": "malloc", "correct": False}], "multiple": False},
    {"text": "Quel caractere termine une chaine en C ?",
     "choices": [{"text": "\\0", "correct": True}, {"text": "\\n", "correct": False},
                 {"text": "EOF", "correct": False}], "multiple": False},
]

TRUEFALSE_STATEMENTS = [
    {"text": "Un pointeur contient une adresse memoire.", "answer": True},
    {"text": "&x donne l'adresse de la variable x.", "answer": True},
    {"text": "*p et p designent toujours la meme valeur.", "answer": False},
    {"text": "Un pointeur non initialise pointe sur 0 par defaut.", "answer": False},
    {"text": "Le nom d'un tableau s'utilise comme un pointeur sur sa premiere case.",
     "answer": True},
]

# ---------------------------------------------------------------------------
# Les cinq exercices de l'evaluation BENCH-SRIT (section 4.2.1)
# ---------------------------------------------------------------------------


def _variants(ok: str, partiel: str, compile_error: str, boucle: str) -> dict[str, list[str]]:
    """Trois variantes par classe. Les variantes d'une meme classe different par
    un detail sans effet sur le cout de correction : commentaire, nom de variable
    intermediaire, ordre d'une declaration."""
    return {
        "K1": [ok,
               "/* copie 2 */\n" + ok,
               ok.replace("int k = 0;", "int compteur = 0;").replace("k <", "compteur <")
                 .replace("k++", "compteur++")],
        "K2": [partiel,
               "/* copie 2 */\n" + partiel,
               partiel.replace("(void)", "()")],
        "K3": [compile_error,
               "/* copie 2 */\n" + compile_error,
               compile_error.replace("(void)", "()")],
        "K4": [boucle,
               "/* copie 2 */\n" + boucle,
               boucle.replace("(void)", "()")],
        "K5": ["", "", ""],
    }


def _algo_variants(ok: str, partiel: str, compile_error: str, boucle: str) -> dict[str, list[str]]:
    """Meme chose pour l'algorithmique : le document est du JSON, on ne peut pas
    y glisser de commentaire, les trois variantes sont donc identiques au sein
    d'une classe."""
    return {"K1": [ok] * 3, "K2": [partiel] * 3, "K3": [compile_error] * 3,
            "K4": [boucle] * 3, "K5": ["", "", ""]}


EXERCISES = [
    {
        "position": 1,
        "title": "Calculatrice en boucle",
        "kind": "code",
        "language": "c",
        "points": 6.0,
        "statement": EX1_STATEMENT,
        "settings": {},
        "tests": [
            {"name": f"Test {i + 1}", "stdin": stdin, "expected_stdout": out,
             "comparison": "trim", "points": 1.0, "timeout_ms": 2000}
            for i, (stdin, out) in enumerate(EX1_TESTS)
        ],
        "variants": _variants(_EX1_OK, _EX1_PARTIEL, _EX1_COMPILE, _EX1_BOUCLE),
    },
    {
        "position": 2,
        "title": "Premier pointeur sur un entier",
        "kind": "code",
        "language": "c",
        "points": 4.0,
        "statement": EX2_STATEMENT,
        "settings": {"criteria": EX2_CRITERIA},
        "tests": [
            {"name": "Test 1", "stdin": EX2_TESTS[0][0], "expected_stdout": EX2_TESTS[0][1],
             "comparison": "trim", "points": 3.0, "timeout_ms": 2000}
        ],
        "variants": _variants(_EX2_OK, _EX2_PARTIEL, _EX2_COMPILE, _EX2_BOUCLE),
    },
    {
        "position": 3,
        "title": "Moyenne de N notes",
        "kind": "algo",
        "language": "algo",
        "points": 4.0,
        "statement": EX3_STATEMENT,
        "settings": {"allowed_elements": EX3_ALLOWED},
        "tests": [
            {"name": f"Test {i + 1}", "stdin": stdin, "expected_stdout": out,
             "comparison": "numeric", "points": 2.0, "timeout_ms": 2000}
            for i, (stdin, out) in enumerate(EX3_TESTS)
        ],
        "variants": _algo_variants(_EX3_OK, _EX3_PARTIEL, _EX3_COMPILE, _EX3_BOUCLE),
    },
    {
        "position": 4,
        "title": "Notions de base du C",
        "kind": "qcm",
        "language": "c",
        "points": 3.0,
        "statement": "Cocher la bonne reponse pour chaque question.",
        "settings": {"questions": QCM_QUESTIONS},
        "tests": [],
        "variants": None,  # reponses tirees au hasard, voir gen_dataset.py
    },
    {
        "position": 5,
        "title": "Vrai ou faux sur les pointeurs",
        "kind": "truefalse",
        "language": "c",
        "points": 3.0,
        "statement": "Indiquer si chaque affirmation est vraie ou fausse.",
        "settings": {"statements": TRUEFALSE_STATEMENTS},
        "tests": [],
        "variants": None,
    },
]

EVALUATION = {
    "title": "BENCH-SRIT",
    "kind": "examen",
    "language": "c",
    "total_points": sum(e["points"] for e in EXERCISES),
    "duration_minutes": 90,
}

ORGANIZATION = {"name": "ESATIC (banc de mesure)", "slug": "bench-esatic"}
TEACHER = {"email": "enseignante@bench.local", "full_name": "Enseignante du banc"}
CLASSROOM = {"name": "SRIT1 (banc)", "level": "Licence 1"}
SUBJECT = {"name": "Algorithmique et programmation C"}
STUDENT_COUNT = 500
