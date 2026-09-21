"""Exercices des TD d'Initiation à l'algorithmique (Licence 1 SRIT), publiés dans
la communauté : python -m app.seed_community

Chaque exercice devient un élément « exercice » de la communauté, rattaché au
premier administrateur. Les exercices à programmer sont des exercices
d'algorithmique corrigés par jeux de tests ; les attendus sont calculés par une
solution de référence écrite ici en Python, pour qu'ils ne puissent pas être
faux. Les questions de cours (simulations, erreurs, complexité) deviennent des
questions-réponses ou des Vrai/Faux.

Rejouable : un exercice déjà publié sous le même titre n'est pas recréé.
"""

from __future__ import annotations

import math
import sys

from sqlalchemy import select

from .db import SessionLocal
from .models import CommunityItem, Role, User

SUBJECT = "Algorithmique"
BASE_TAGS = ["L1 SRIT", "algorithmique"]

# Outils de l'étape « outils autorisés » (voir frontend/src/algoVocabulary.js).
BASE = ["constante", "declaration", "lire", "ecrire", "affectation", "si", "sinon", "pour",
        "tantque"]
SOUS_PROG = ["fonction", "procedure", "retour", "appel"]

LIGNES = (
    "Chaque valeur affichée est suivie d'un passage à la ligne (CRLF) ; "
    "n'affichez aucun message d'invite."
)


def _nombre(x) -> str:
    if isinstance(x, bool):
        return "VRAI" if x else "FAUX"
    if isinstance(x, float):
        if x.is_integer():
            return str(int(x))
        return str(round(x, 6))
    return str(x)


def _sortie(valeurs) -> str:
    return "\n".join(_nombre(v) for v in valeurs)


def algo(td, title, statement, cases, *, points=4.0, comparison="numeric", tools=None,
         solution="", notes=""):
    """cases : liste de (entrée, sortie attendue) ; la sortie est une liste de
    valeurs (une par ligne) ou un texte déjà mis en forme."""
    share = round(points / len(cases), 2) if cases else 0
    tests = []
    for i, (stdin, attendu) in enumerate(cases, start=1):
        sortie = attendu if isinstance(attendu, str) else _sortie(attendu)
        tests.append({
            "name": f"Test {i}",
            "kind": "official",
            "stdin": stdin,
            "expected_stdout": sortie,
            "comparison": comparison,
            "points": share,
            "timeout_ms": 2000,
            "target_id": None,
            "expected_type": "string",
            "input_types": [],
            "args": [],
        })
    return td, {
        "title": title,
        "statement": statement,
        "language": "algo",
        "points": points,
        "starter_code": "",
        "kind": "algo",
        "settings": {
            "allowed_elements": tools or BASE,
            "ecriture_cours": True,
            "solution": solution,
            "solution_notes": notes,
        },
        "tests": tests,
    }


def short(td, title, statement, questions, *, points=2.0, solution="", notes=""):
    """questions : liste de (intitulé, réponses acceptées). Sans réponse
    acceptée, la question est corrigée à la main."""
    return td, {
        "title": title,
        "statement": statement,
        "language": "algo",
        "points": points,
        "starter_code": "",
        "kind": "short",
        "settings": {
            "questions": [
                {"text": text, "accepted": accepted, "keywords_mode": False,
                 "rows": 3 if accepted else 8}
                for text, accepted in questions
            ],
            "solution": solution,
            "solution_notes": notes,
        },
        "tests": [],
    }


def truefalse(td, title, statement, statements, *, points=2.0, notes=""):
    return td, {
        "title": title,
        "statement": statement,
        "language": "algo",
        "points": points,
        "starter_code": "",
        "kind": "truefalse",
        "settings": {
            "statements": [{"text": t, "answer": a} for t, a in statements],
            "solution_notes": notes,
        },
        "tests": [],
    }


# ----- Solutions de référence -----
def bissextile(a: int) -> bool:
    return a % 4 == 0 and (a % 100 != 0 or a % 400 == 0)


def parfaits(limite: int) -> list[int]:
    return [n for n in range(2, limite) if sum(d for d in range(1, n) if n % d == 0) == n]


def admis_module(n1, n2, n3) -> str:
    notes = [n1, n2, n3]
    refuse = (
        sum(1 for n in notes if n < 7.5) >= 2
        or any(n < 6 for n in notes)
        or sum(notes) / 3 < 10
    )
    return "refusé" if refuse else "admis"


def prix_cinema(jour: str, etudiant: str, age: int) -> float:
    week_end = jour in ("samedi", "dimanche")
    reduit = jour == "mercredi" or etudiant == "O" or ((age < 18 or age > 65) and not week_end)
    return 4.5 if reduit else 7


def age(jn, mn, an, jj, mj, aj) -> int:
    ans = aj - an
    if (mj, jj) < (mn, jn):
        ans -= 1
    return ans


def affranchissement(poids: int, code: str) -> tuple[float, float]:
    def tranche(eco):
        if poids <= 20:
            return 0.50 if eco else 0.55
        if poids <= 50:
            return 0.72 if eco else 0.88
        return 0.87 if eco else 1.33

    if code == "M":
        return tranche(True), tranche(False)
    if poids <= 20:
        return 0.50, 0.55
    dizaines = math.ceil(poids / 10)
    sup_eco, sup_rap = (0.04, 0.06) if code == "D" else (0.10, 0.15)
    return round(0.50 + dizaines * sup_eco, 2), round(0.55 + dizaines * sup_rap, 2)


def facture(ai, ni) -> float:
    c = ni - ai
    if c <= 100:
        conso = c * 0.20
    elif c <= 250:
        conso = 100 * 0.20 + (c - 100) * 0.35
    else:
        conso = 100 * 0.20 + 150 * 0.35 + (c - 250) * 0.20
    return round(25 + conso, 2)


def lendemain(j, m, a) -> tuple[int, int, int]:
    jours = [31, 29 if bissextile(a) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    if j < jours[m - 1]:
        return j + 1, m, a
    if m < 12:
        return 1, m + 1, a
    return 1, 1, a + 1


def classes_ages(ages: list[int]) -> str:
    effectifs = [0] * 9
    for x in ages:
        effectifs[min(x // 10, 8)] += 1
    return "\n".join(f"classe {k} : {'*' * n}".rstrip() for k, n in enumerate(effectifs))


def pluviometrie(releves: list[tuple[str, int, int]]) -> list[int]:
    somme = [0] * 12
    for _, mois, hauteur in releves:
        somme[mois - 1] += hauteur
    return somme


def matrice_td4() -> str:
    t = [[0] * 10 for _ in range(10)]
    for i in range(10):
        t[5][i] = 1          # ligne d'indice 6
        t[i][8] = 1          # colonne d'indice 9
        t[i][i] = 1          # diagonale principale
        t[i][9 - i] = 1      # diagonale secondaire
    return "\n".join(" ".join(str(v) for v in ligne) for ligne in t)


def _stdin(*valeurs) -> str:
    return "\n".join(str(v) for v in valeurs)


# ----- Les exercices -----
def exercises() -> list[tuple[str, dict]]:
    items = []
    add = items.append

    # TD de révision
    td = "TD révision"
    add(short(td, "Priorité des opérateurs et évaluation d'expressions",
        "Exercice 1 du TD de révision.",
        [
            ("Donnez l'ordre dans lequel sont évalués les opérateurs de l'expression :\n"
             "((3 * a) - x ^ 2) - (((c - d) / (a / b)) / d)", []),
            ("Évaluez l'expression : 5 + 2 * 6 - 4 + (8 + 2 ^ 3) / (2 - 4 + 5 * 2)", ["15"]),
        ],
        notes="5 + 12 - 4 + 16 / 8 = 13 + 2 = 15."))
    add(truefalse(td, "Évaluation d'expressions logiques",
        "Sachant que a = 4, b = 5, c = -1 et d = 0, dites si chaque expression vaut VRAI.",
        [
            ("(a < b) ET (c >= d)", False),
            ("NON (a < b) OU (c # b)", True),
            ("NON (a # b ^ 2) OU (a * c < d)", True),
        ],
        notes="VRAI ET FAUX = FAUX ; FAUX OU VRAI = VRAI ; NON VRAI OU VRAI = VRAI."))
    add(short(td, "Algorithme incorrect",
        "Donnez toutes les raisons pour lesquelles l'algorithme suivant est incorrect :\n\n"
        "Algoritme Incorrect\n  x, y : Entier\n  z : Reel\nDébut\n  z ← x + 2\n  y ← z\n"
        "  x * 2 ← 3 + z\n  y ← 5y + 3\nFin.",
        [("Listez les erreurs en les expliquant.", [])],
        notes="Mot-clé ALGORITHME mal orthographié, rubrique VARIABLES absente, x utilisé "
              "sans valeur, un réel affecté à un entier (y ← z), une expression à gauche de "
              "la flèche (x * 2 ← …), multiplication implicite 5y au lieu de 5 * y."))
    add(algo(td, "Somme et produit de deux entiers",
        "Écrivez un algorithme qui lit deux entiers au clavier puis affiche leur somme, "
        "puis leur produit. " + LIGNES,
        [(_stdin(a, b), [a + b, a * b]) for a, b in [(3, 4), (-5, 2), (0, 9), (12, 12)]],
        solution="LIRE(a)\nLIRE(b)\nECRIRE(a + b, CRLF)\nECRIRE(a * b, CRLF)"))
    add(algo(td, "Valeur absolue",
        "Écrivez un algorithme qui lit un entier quelconque et affiche sa valeur absolue. "
        + LIGNES,
        [(_stdin(x), [abs(x)]) for x in (7, -7, 0, -123)],
        solution="LIRE(x)\nSI x < 0 ALORS\n  x ← -x\nFINSI\nECRIRE(x, CRLF)"))
    add(algo(td, "Équation du second degré",
        "Écrivez un algorithme qui résout dans R l'équation ax² + bx + c = 0 (a non nul). "
        "Il lit a, b et c puis affiche :\n"
        "- « aucune solution » si le discriminant est négatif ;\n"
        "- la solution double si le discriminant est nul ;\n"
        "- sinon les deux solutions, la plus petite d'abord, chacune sur sa ligne.\n"
        "N'affichez aucun message d'invite.",
        [
            (_stdin(1, 0, 1), "aucune solution"),
            (_stdin(2, 1, 5), "aucune solution"),
            (_stdin(1, -4, 4), "2"),
            (_stdin(2, 4, 2), "-1"),
        ],
        comparison="trim",
        notes="Le calcul des deux racines demande une racine carrée : les jeux de tests ne "
              "couvrent que les cas « aucune solution » et « solution double ». Le cas à "
              "deux solutions se vérifie à la lecture."))
    add(algo(td, "Année bissextile",
        "Une année est bissextile si elle est multiple de 4, sauf si elle est multiple de "
        "100 ; elle l'est toutefois si elle est multiple de 400.\n"
        "Écrivez un algorithme qui lit une année positive et affiche « bissextile » ou "
        "« non bissextile ».",
        [(_stdin(a), "bissextile" if bissextile(a) else "non bissextile")
         for a in (1980, 1996, 2000, 2100, 3000, 2023)],
        comparison="trim"))
    add(algo(td, "Nombres parfaits",
        "Un nombre parfait est égal à la somme de ses diviseurs, lui-même excepté "
        "(6 = 3 + 2 + 1). Écrivez un algorithme qui affiche tous les nombres parfaits "
        "inférieurs à 1000. " + LIGNES,
        [("", parfaits(1000))]))
    add(algo(td, "Palindrome (chaîne)",
        "Un palindrome se lit de la même façon de gauche à droite et de droite à gauche "
        "(« RADAR », « LAVAL »). Écrivez un algorithme Palind qui lit la longueur n du mot "
        "puis ses n caractères, un par un, et affiche « palindrome » ou « non palindrome ».",
        [
            (_stdin(len(m), *m), "palindrome" if m == m[::-1] else "non palindrome")
            for m in ("RADAR", "AZIZA", "LAVAL", "ALGO", "AB", "A")
        ],
        comparison="trim"))
    add(algo(td, "Fonction Triangle (Pythagore)",
        "Écrivez une fonction Triangle(a, b, c) qui renvoie VRAI si a, b et c peuvent être "
        "les côtés d'un triangle rectangle (a² = b² + c², b² = a² + c² ou c² = a² + b²).\n"
        "L'algorithme principal lit a, b et c puis affiche le résultat de Triangle(a, b, c).",
        [
            (_stdin(a, b, c), "VRAI" if a*a == b*b + c*c or b*b == a*a + c*c
             or c*c == a*a + b*b else "FAUX")
            for a, b, c in [(3, 4, 5), (5, 3, 4), (13, 12, 5), (2, 3, 4), (1, 1, 1)]
        ],
        comparison="trim", tools=BASE + SOUS_PROG))

    # TD 2
    td = "TD 2"
    add(short(td, "Chercher l'erreur",
        "Relevez les erreurs de l'algorithme suivant en les expliquant.\n\n"
        "ALGORITHME AlgoACorriger\n  CONSTANTE\n    PI = 3.14\n  VARIABLES\n    m : ENTIER\n"
        "    n, p, q : REEL\n    c, d, 1x : CARACTERE\n    b1, b2 : BOOLEEN\nDEBUT\n"
        "  m ← 7\n  p ← n + p\n  c ← 'u'\n  x ← 2.5\n  b1 ← c != 'r'\n  b2 ← (m == 7) OU b1\n"
        "  n ← m * PI\n  m * 3 ← m + 5\n  p = 7.0\n  PI ← 3.14159\n  q ← 3m\nFIN",
        [("Listez les erreurs.", [])],
        notes="1x n'est pas un identificateur valide ; n et p utilisés sans valeur ; x non "
              "déclaré ; != et == ne sont pas la notation du cours (<> et =) ; expression "
              "à gauche de la flèche ; p = 7.0 est une comparaison, pas une affectation ; "
              "on ne modifie pas une constante ; 3m au lieu de 3 * m."))
    add(short(td, "Simulation : la corde et la poulie",
        "ALGORITHME Corde lit le périmètre de la poulie puis la longueur de la corde, "
        "calcule nbTours ← lgCorde DIV perimetre et lgReste ← lgCorde MOD perimetre, puis "
        "affiche « on peut faire nbTours tours » et « il reste lgReste cm non enroulés ».",
        [
            ("Pour un périmètre de 30 cm et une corde de 100 cm, que vaut nbTours ?", ["3"]),
            ("Et lgReste ?", ["10"]),
            ("Relevez les erreurs de nommage de variables dans cet algorithme.", []),
        ],
        notes="nbTour et lgreste ne correspondent pas aux variables déclarées nbTours et "
              "lgReste."))
    add(short(td, "Simulation : calcul de prix et DIV / MOD",
        "Simulez les deux algorithmes.\n\nPremier : prix ← 15, taux ← 10.5, "
        "remise ← (prix * taux), remise ← remise / 100, prix ← prix - remise, ECRIRE(prix).\n\n"
        "Second : a ← 10, b ← 70, puis q1 ← (a + b) / 5, q2 ← (a + b) DIV 5, "
        "r2 ← (a + b) MOD 5.",
        [
            ("Valeur affichée par le premier algorithme ?", ["13.425", "13,425"]),
            ("Valeurs de q1, q2 et r2 dans le second (séparées par des espaces) ?",
             ["16 16 0"]),
            ("Et avec le diviseur 3 au lieu de 5 : q2 et r2 ?", ["26 2"]),
        ],
        notes="Remise = 157,5 / 100 = 1,575. Avec 3 : q1 ≈ 26,67, q2 = 26, r2 = 2."))
    add(algo(td, "Conversion euro en franc CFA",
        "Écrivez un algorithme qui lit une somme en euros puis affiche son équivalent en "
        "francs CFA (1 € = 655,957 FCFA, à déclarer comme constante). " + LIGNES,
        [(_stdin(x), [round(x * 655.957, 6)]) for x in (1, 10, 0, 2.5)],
        tools=BASE))
    add(algo(td, "Échange de deux variables",
        "Écrivez un algorithme qui lit var1 et var2, les affiche, échange leur contenu "
        "(sans les intervertir à l'affichage), puis les affiche à nouveau. " + LIGNES,
        [(_stdin(a, b), [a, b, b, a]) for a, b in [(3, 7), (-1, 5), (4, 4)]],
        solution="tmp ← var1\nvar1 ← var2\nvar2 ← tmp"))
    add(algo(td, "Permutation circulaire de trois variables",
        "Écrivez un algorithme qui lit trois réels var1, var2 et var3, les affiche, effectue "
        "une permutation circulaire à droite (var1 reçoit var3, var2 reçoit var1, var3 "
        "reçoit var2) puis les affiche à nouveau. " + LIGNES,
        [(_stdin(a, b, c), [a, b, c, c, a, b]) for a, b, c in [(3.56, 210, 4), (1, 2, 3)]],
        solution="tmp ← var3\nvar3 ← var2\nvar2 ← var1\nvar1 ← tmp"))

    # TD 2 et TD 3 (exercices communs)
    td = "TD 2, TD 3"
    add(short(td, "Simulation d'expressions booléennes",
        "L'algorithme lit un caractère c et un entier m, puis calcule b1 ← c <> 'r' et "
        "b2 ← (m = 7) OU b1, et affiche b1 et b2.",
        [
            ("Pour c = 'r' et m = 7 : valeurs de b1 et b2 ?", ["FAUX VRAI"]),
            ("Pour c = 'r' et m = 3 : valeurs de b1 et b2 ?", ["FAUX FAUX"]),
            ("Pour c = 'a' et m = 3 : valeurs de b1 et b2 ?", ["VRAI VRAI"]),
        ]))
    add(algo(td, "Admission à un module",
        "Un module comporte 3 notes sur 20. Un étudiant est refusé si au moins l'un des cas "
        "suivants se présente : deux des trois notes sont strictement inférieures à 7,5 ; "
        "une note est strictement inférieure à 6 ; la moyenne est strictement inférieure "
        "à 10.\nÉcrivez un algorithme qui lit les trois notes et affiche « admis » ou "
        "« refusé ».",
        [(_stdin(*n), admis_module(*n))
         for n in [(12, 14, 10), (5, 18, 18), (7, 7, 18), (9, 9, 11), (8, 16, 7)]],
        comparison="trim"))
    add(short(td, "Admission à un examen",
        "Variables : option (chaîne, 'science' ou 'lettre') et NLV, NF, NM, NP, les notes "
        "de langue vivante, français, maths et physique (même coefficient).",
        [
            ("Écrivez la condition : moyenne des quatre notes >= 10 et moyenne >= 10 sur "
             "les matières de l'option (français et langue vivante pour 'lettre', maths et "
             "physique pour 'science').", []),
            ("Écrivez la condition : moyenne >= 10 dans chaque matière de l'option.", []),
        ]))

    # TD 3
    td = "TD 3"
    add(short(td, "Simulation d'instructions conditionnelles",
        "test_1 lit heure et affiche « soir » si heure > 12, « matin » sinon. test_2 fait "
        "de même, mais seulement si 0 <= heure <= 23.",
        [
            ("Qu'affichent test_1 et test_2 pour heure = 25 ?", ["soir rien"]),
            ("Proposez un jeu d'essai qui teste chaque partie des deux algorithmes.", []),
        ]))
    add(truefalse(td, "Conditionnelles et séquence",
        "test_1 : SI nb <= 0 ALORS nb ← nb + 5 SINON nb ← nb - 5.\n"
        "test_2 : SI nb <= 0 ALORS nb ← nb + 5 FINSI puis SI nb > 0 ALORS nb ← nb - 5 FINSI.",
        [
            ("Pour 5, les deux algorithmes affichent 0.", True),
            ("Pour 0, les deux algorithmes affichent 5.", False),
            ("Pour -5, les deux algorithmes affichent 0.", True),
            ("Les deux algorithmes sont équivalents.", False),
        ],
        notes="Pour 0, test_2 ajoute 5 puis, 5 étant positif, le retire : il affiche 0."))
    add(algo(td, "Prix d'une place de cinéma",
        "Deux tarifs : plein (7 FCFA) et réduit (4,50 FCFA). Le réduit s'applique à tout le "
        "monde le mercredi, aux étudiants quel que soit le jour, aux moins de 18 ans et aux "
        "plus de 65 ans sauf le samedi et le dimanche.\nL'algorithme lit le jour (en "
        "minuscules), « O » ou « N » pour étudiant, puis l'âge, et affiche le prix. "
        + LIGNES,
        [(_stdin(j, e, a), [prix_cinema(j, e, a)])
         for j, e, a in [("mercredi", "N", 30), ("lundi", "O", 40), ("lundi", "N", 12),
                         ("samedi", "N", 70), ("dimanche", "O", 70), ("jeudi", "N", 30)]]))
    add(algo(td, "Calcul d'âge",
        "L'algorithme lit la date de naissance (jour, mois, année) puis la date du jour "
        "(jour, mois, année) et affiche l'âge en années entières révolues. Les dates sont "
        "valides et la naissance est antérieure. " + LIGNES,
        [(_stdin(*d), [age(*d)]) for d in [
            (15, 6, 2000, 21, 9, 2026), (21, 9, 2000, 21, 9, 2026),
            (22, 9, 2000, 21, 9, 2026), (1, 12, 1990, 30, 11, 2026)]]))
    add(algo(td, "Affranchissement",
        "L'algorithme lit le poids d'une lettre (en grammes, moins de 100) et un code "
        "(M métropole, D DOM, T TOM), puis affiche le tarif économique puis le tarif "
        "rapide.\nMétropole, rapide : 0,55 jusqu'à 20 g, 0,88 jusqu'à 50 g, 1,33 jusqu'à "
        "100 g ; économique : 0,50, 0,72, 0,87.\nDOM-TOM jusqu'à 20 g : 0,55 en rapide, "
        "0,50 en économique. Au-delà : ce tarif de base plus, par tranche de 10 g entamée "
        "du poids total, 0,06 (DOM) ou 0,15 (TOM) en rapide et 0,04 (DOM) ou 0,10 (TOM) en "
        "économique. Exemple : 21 g et 30 g en DOM rapide coûtent 0,55 + 3 × 0,06 = 0,73. "
        + LIGNES,
        [(_stdin(p, c), list(affranchissement(p, c)))
         for p, c in [(15, "M"), (35, "M"), (80, "M"), (20, "D"), (21, "D"), (31, "D"),
                      (45, "T")]]))
    add(algo(td, "Facture d'électricité",
        "Sans utiliser ET, OU ni NON, écrivez l'algorithme qui lit l'ancien index AI et le "
        "nouvel index NI puis affiche le montant de la facture : 25 € d'abonnement, 0,20 € "
        "le kWh pour les 100 premiers, 0,35 € pour les 150 suivants, 0,20 € au-delà de "
        "250 kWh. " + LIGNES,
        [(_stdin(ai, ni), [facture(ai, ni)])
         for ai, ni in [(1000, 1050), (1000, 1100), (1000, 1200), (1000, 1250),
                        (1000, 1400)]]))

    # TD 4
    td = "TD 4"
    notes10 = [12, 8.5, 15, 9, 11, 14, 7, 18, 10, 13]
    add(algo(td, "Saisie et affichage de 10 notes",
        "Écrivez un algorithme qui saisit les notes de 10 étudiants dans un tableau puis "
        "les affiche toutes. " + LIGNES,
        [(_stdin(*notes10), notes10), (_stdin(*range(10)), list(range(10)))]))
    add(algo(td, "Saisie d'un nombre variable de notes",
        "L'algorithme lit le nombre de notes n (au plus 50, à déclarer comme constante), "
        "puis les n notes, et les affiche. " + LIGNES,
        [(_stdin(n, *v), v) for n, v in [(3, [12, 15, 9]), (1, [20]), (5, [1, 2, 3, 4, 5])]]))
    add(algo(td, "Note maximale, minimale et moyenne",
        "À la suite de l'exercice précédent : l'algorithme lit n puis les n notes et "
        "affiche la note maximale, la note minimale puis la moyenne. " + LIGNES,
        [(_stdin(len(v), *v), [max(v), min(v), round(sum(v) / len(v), 6)])
         for v in [[12, 15, 9], [20], [10, 4, 16, 18]]]))
    add(algo(td, "Tableau de notes avec valeur sentinelle",
        "Le tableau de 10 notes est initialisé dans l'algorithme avec 12, 8, 16, 5 puis -1, "
        "qui marque la fin logique du tableau. Affichez les notes sous la forme :\n"
        "[12, 8, 16, 5,]",
        [("", "[12, 8, 16, 5,]")], comparison="trim", points=2.0))
    add(algo(td, "Notes de plusieurs matières",
        "L'algorithme lit le nombre de matières (au plus 7), le nombre d'étudiants, puis, "
        "matière par matière, la note de chaque étudiant. Il affiche ensuite la moyenne "
        "de chaque matière, puis la moyenne de chaque étudiant. " + LIGNES,
        [
            (_stdin(2, 3, 10, 12, 14, 8, 16, 12),
             [12, 12, 9, 14, 13]),
            (_stdin(1, 2, 15, 5), [10, 15, 5]),
        ]))
    add(algo(td, "Palindrome (tableau de caractères)",
        "Un mot est rangé dans un tableau de caractères d'au plus 50 éléments. "
        "L'algorithme lit sa longueur puis ses caractères un par un et affiche "
        "« palindrome » ou « non palindrome ».",
        [(_stdin(len(m), *m), "palindrome" if m == m[::-1] else "non palindrome")
         for m in ("kayak", "laval", "tableau", "ab")],
        comparison="trim"))
    add(algo(td, "Initialisation partielle d'un tableau à deux dimensions",
        "Un tableau d'entiers 10 x 10 est initialisé à 0 (indices de 1 à 10). "
        "Mettez à 1 la ligne d'indice 6, la colonne d'indice 9 et les deux diagonales, "
        "puis affichez le tableau : une ligne par ligne du tableau, les valeurs séparées "
        "par une espace.",
        [("", matrice_td4())], comparison="trim"))
    add(algo(td, "Date du lendemain",
        "L'algorithme lit une date valide (jour, mois, année) et affiche la date du "
        "lendemain (jour, mois, année). Une année est bissextile si elle est divisible par "
        "4 et non par 100, ou divisible par 400. Un tableau peut stocker le nombre de "
        "jours de chaque mois. " + LIGNES,
        [(_stdin(*d), list(lendemain(*d)))
         for d in [(21, 9, 2026), (30, 9, 2026), (31, 12, 2026), (28, 2, 2024),
                   (28, 2, 2023), (28, 2, 1900), (29, 2, 2000)]],
        tools=BASE + ["type"]))
    add(algo(td, "Structure contenant un tableau",
        "Avec le type\nTabEntiers : STRUCTURE\n  tab : TABLEAU[1..50] DE ENTIER\n"
        "  nbElements : ENTIER\nFINSTRUCTURE\nécrivez un algorithme qui ajoute des entiers "
        "au tableau : après chaque saisie, il lit la réponse à « encore (O/N) ? ». "
        "À la fin, il affiche les éléments du tableau. " + LIGNES,
        [
            (_stdin(5, "O", 8, "O", 3, "N"), [5, 8, 3]),
            (_stdin(42, "N"), [42]),
        ],
        tools=BASE + ["type", "repeter"]))
    add(short(td, "Modélisation d'un système scolaire",
        "Définissez les structures Matiere (nom, coefficient), Matieres (15 au plus), "
        "Etudiant (nom, prénom, notes, moyenne générale), Etudiants (40 au plus) et Classe "
        "(nom, matières, étudiants), puis écrivez l'algorithme de saisie des matières et "
        "des étudiants d'une classe.",
        [("Donnez les déclarations de types.", []), ("Donnez l'algorithme de saisie.", [])],
        points=4.0))

    # TD 5
    td = "TD 5"
    comp = {"A": "T", "T": "A", "C": "G", "G": "C"}
    add(algo(td, "Brin d'ADN complémentaire",
        "L'algorithme lit les bases d'un brin d'ADN ('A', 'C', 'G' ou 'T'), une par une, "
        "jusqu'au caractère 'X', et les range dans un tableau. Il construit puis affiche le "
        "brin complémentaire (A et T, C et G se correspondent), les bases collées les unes "
        "aux autres. Exemple : ATGATCCG donne TACTAGGC.",
        [(_stdin(*b, "X"), "".join(comp[c] for c in b)) for b in ("ATGATCCG", "A", "GGCC")],
        comparison="trim"))
    add(algo(td, "Classes d'âge",
        "L'algorithme lit des âges jusqu'à une valeur négative, sans les mémoriser, et "
        "compte l'effectif de chacune des neuf classes : [0, 10[ classe 0, [10, 20[ classe "
        "1, ..., [70, 80[ classe 7, 80 et plus classe 8. Il affiche ensuite une ligne par "
        "classe, avec une étoile par personne :\nclasse 0 : *\nclasse 1 : *****\n...",
        [
            (_stdin(68, 92, 60, 24, 71, 14, 52, 12, 16, 40, 80, 18, 20, 40, 10, 6, 48, 43, 25,
                    -1),
             classes_ages([68, 92, 60, 24, 71, 14, 52, 12, 16, 40, 80, 18, 20, 40, 10, 6, 48,
                           43, 25])),
            (_stdin(5, 85, -3), classes_ages([5, 85])),
        ],
        comparison="trim"))
    pluvio_cas = [
        [("Dijon", 10, 150), ("Lyon", 10, 80), ("Dijon", 3, 40)],
        [("Abidjan", 6, 500)],
    ]

    def _pluvio_stdin(releves):
        return _stdin(*[v for r in releves for v in r], "Z")

    pluvio_texte = (
        "Un relevé comprend un lieu, un numéro de mois et une hauteur de précipitation en mm "
        "(entre 10 et 1000). La procédure SaisirReleves lit des relevés jusqu'au lieu « Z » "
        "et compte leur nombre Nbsaisis ; la saisie du mois et celle de la hauteur passent "
        "par une procédure de saisie contrôlée. ExploiterReleves remplit le vecteur Somme "
        "(la somme des hauteurs de chaque mois) et AfficherSomme affiche les 12 sommes, de "
        "janvier à décembre. " + LIGNES
    )
    add(algo(td, "Pluviométrie",
        pluvio_texte + "\nLes relevés sont rangés dans trois vecteurs Lieux, Mois et Hauteurs.",
        [(_pluvio_stdin(r), pluviometrie(r)) for r in pluvio_cas],
        tools=BASE + SOUS_PROG))
    add(algo(td, "Pluviométrie avec structures",
        pluvio_texte + "\nCette fois, un relevé est une structure (lieu, mois, hauteur) "
        "rangée dans un unique vecteur de relevés.",
        [(_pluvio_stdin(r), pluviometrie(r)) for r in pluvio_cas],
        tools=BASE + SOUS_PROG + ["type"]))

    # TD de complexité
    td = "TD complexité"
    add(algo(td, "Recherche d'un élément dans un vecteur",
        "L'algorithme lit n, les n entiers d'un vecteur puis une valeur x, et affiche "
        "l'indice (à partir de 1) de la première occurrence de x, ou 0 si x est absent. "
        + LIGNES,
        [(_stdin(len(v), *v, x), [v.index(x) + 1 if x in v else 0])
         for v, x in [([4, 8, 15, 16], 15), ([4, 8, 15, 16], 4), ([4, 8, 15, 16], 23),
                      ([7], 7)]]))
    add(short(td, "Complexité de la recherche séquentielle",
        "Pour l'algorithme de recherche d'un élément dans un vecteur de taille n :",
        [
            ("Nombre de comparaisons dans le meilleur des cas ?", ["1"]),
            ("Nombre de comparaisons dans le pire des cas ?", ["n"]),
            ("Complexité en notation Grand-O ?", ["O(n)"]),
        ]))
    add(short(td, "Matrices creuses",
        "Une matrice d'entiers contenant environ 90 % de zéros est représentée soit par un "
        "tableau à deux dimensions, soit par un tableau de triplets (i, j, valeur) pour les "
        "seuls éléments non nuls.",
        [
            ("Écrivez l'algorithme de la somme des éléments pour chaque représentation.", []),
            ("Comparez leurs complexités spatiale et temporelle et donnez la valeur critique "
             "du nombre d'éléments non nuls.", []),
        ],
        points=4.0))
    add(short(td, "Complexité asymptotique",
        "Donnez la complexité en notation Grand-O de chaque fonction (exemple : "
        "T0(n) = 3n est en O(n)).",
        [
            ("T1(n) = 6n³ + 10n² + 5n + 2", ["O(n^3)", "O(n3)", "O(n³)"]),
            ("T2(n) = 3 log2 n + 4", ["O(log n)", "O(logn)", "O(log2 n)"]),
            ("T3(n) = 2^n + 6n² + 7n", ["O(2^n)"]),
            ("T4(n) = 7k + 2 (k constant)", ["O(1)"]),
            ("T5(n) = 4 log2 n + n", ["O(n)"]),
            ("T6(n) = 2 log10 k + kn² (k constant)", ["O(n^2)", "O(n2)", "O(n²)"]),
        ],
        points=3.0))
    add(short(td, "Algorithme fictif",
        "total ← 0 ; POUR i de 1 à n - 1 : POUR j de i + 1 à n : total ← total + 1.",
        [
            ("Que calcule cet algorithme et quelle est sa complexité ?", []),
            ("Complexité d'un algorithme qui examine n données, en supprime une et "
             "recommence jusqu'à ce qu'il n'en reste plus ?", ["O(n^2)", "O(n²)", "O(n2)"]),
        ],
        notes="total vaut n(n - 1) / 2, le nombre de paires : O(n²). Le second examine "
              "n + (n - 1) + ... + 1 données : O(n²)."))

    return items


def main() -> None:
    db = SessionLocal()
    try:
        admin = db.scalar(select(User).where(User.role == Role.ADMIN).order_by(User.id))
        if admin is None:
            sys.exit("Aucun administrateur : lancez d'abord python -m app.seed")
        existing = set(db.scalars(
            select(CommunityItem.title).where(CommunityItem.author_id == admin.id)
        ))
        created = 0
        for td, exercise in exercises():
            if exercise["title"] in existing:
                continue
            db.add(CommunityItem(
                organization_id=admin.organization_id,
                author_id=admin.id,
                item_type="exercise",
                title=exercise["title"],
                description=f"{td}, Initiation à l'algorithmique (L1 SRIT).",
                language="algo",
                subject_name=SUBJECT,
                tags=[td, *BASE_TAGS],
                content={"exercise": exercise},
                exercises_count=1,
                total_points=exercise["points"],
            ))
            created += 1
        db.commit()
        print(f"Communauté : {created} exercice(s) ajouté(s)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
