"""Séries de programmation publiées dans la communauté : C, C++, Java et Python.

Un même problème peut servir dans plusieurs langages : son énoncé et ses jeux de
tests sont écrits une fois, et ses attendus sont calculés par un oracle en
Python, pour qu'ils ne puissent pas être faux. Chaque langage fournit sa
solution de référence, montrée à l'enseignant ; `tests/test_seed_community.py`
la fait passer par le moteur de correction pour vérifier qu'elle obtient tous
les points.

Les entrées se lisent sur l'entrée standard, séparées par des blancs ; les
sorties se comparent ligne à ligne, espaces de fin ignorés.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from math import gcd
from typing import Callable

from .grading.languages import default_starter


@dataclass(frozen=True)
class Probleme:
    titre: str
    enonce: str
    cas: list[str]
    oracle: Callable[[list[str]], str]
    theme: str
    points: float = 4.0
    # Ce que l'énoncé impose propre à chaque langage (pointeurs, classe…).
    consignes: dict[str, str] = field(default_factory=dict)


def _stdin(*valeurs) -> str:
    return "\n".join(str(v) for v in valeurs) + "\n"


def _entiers(jetons: list[str]) -> list[int]:
    return [int(j) for j in jetons]


def _jusqua(jetons: list[str], fin: str = "-1") -> tuple[list[int], list[str]]:
    """Les entiers lus jusqu'à la sentinelle, puis le reste des jetons."""
    i = jetons.index(fin)
    return _entiers(jetons[:i]), jetons[i + 1:]


def _chaine(valeurs: list[int]) -> str:
    return " -> ".join([*map(str, valeurs), "NULL"])


def _commandes(jetons: list[str], *, file: bool, vide: str) -> str:
    contenu, sorties, i = [], [], 0
    while jetons[i] != "F":
        if jetons[i] == "E":
            contenu.append(jetons[i + 1])
            i += 2
            continue
        sorties.append((contenu.pop(0) if file else contenu.pop()) if contenu else vide)
        i += 1
    return "\n".join(sorties)


def _bancaire(jetons: list[str]) -> str:
    solde, sorties, i = int(jetons[0]), [], 1
    while jetons[i] != "F":
        op, montant = jetons[i], int(jetons[i + 1])
        if op == "D":
            solde += montant
        elif montant > solde:
            sorties.append("solde insuffisant")
        else:
            solde -= montant
        i += 2
    return "\n".join([*sorties, f"solde = {solde}"])


def _equilibre(texte: str) -> str:
    paires, pile = {")": "(", "]": "[", "}": "{"}, []
    for c in texte:
        if c in "([{":
            pile.append(c)
        elif not pile or pile.pop() != paires[c]:
            return "NON"
    return "NON" if pile else "OUI"


def _premiers(n: int) -> list[int]:
    return [k for k in range(2, n + 1) if all(k % d for d in range(2, int(k ** 0.5) + 1))]


def _fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a


def _transposee(jetons: list[str]) -> str:
    l, c = int(jetons[0]), int(jetons[1])
    m = [jetons[2 + i * c: 2 + (i + 1) * c] for i in range(l)]
    return "\n".join(" ".join(m[i][j] for i in range(l)) for j in range(c))


def _dichotomie(jetons: list[str]) -> str:
    n = int(jetons[0])
    t, x = _entiers(jetons[1:n + 1]), int(jetons[n + 1])
    return str(t.index(x) if x in t else -1)


def _insertion_triee(valeurs: list[int]) -> list[int]:
    return sorted(valeurs)


LISTES = [[4, 8, 15, 16, 23, 42], [7], [], [3, -2, 3, 9, 3]]
COMMANDES = [
    ["E", 5, "E", 8, "D", "E", 1, "D", "D", "D", "F"],
    ["D", "E", 42, "D", "F"],
    ["E", 1, "E", 2, "E", 3, "D", "D", "D", "F"],
]
SAISIE = "Le programme lit des entiers jusqu'à la valeur -1 (non comprise). "
FORMAT_LISTE = (
    "Il affiche la liste sur une ligne, de la tête à la fin, sous la forme "
    "« 4 -> 8 -> 15 -> NULL » (« NULL » seul pour une liste vide). "
)

P = {
    "pgcd": Probleme(
        "PGCD par l'algorithme d'Euclide",
        "Le programme lit deux entiers strictement positifs a et b et affiche leur plus "
        "grand commun diviseur, calculé par l'algorithme d'Euclide (fonction pgcd).",
        [_stdin(a, b) for a, b in [(12, 18), (17, 5), (100, 75), (7, 7), (1071, 462)]],
        lambda j: str(gcd(int(j[0]), int(j[1]))),
        "fonctions",
    ),
    "somme_moyenne": Probleme(
        "Somme et moyenne",
        "Le programme lit un entier n (n >= 1) puis n entiers. Il affiche leur somme sur "
        "une ligne, puis leur moyenne avec deux chiffres après la virgule (le point est "
        "le séparateur décimal) sur la ligne suivante.",
        [_stdin(len(v), " ".join(map(str, v)))
         for v in [[12, 15, 9], [10, 4, 15, 18], [7], [1, 2, 2], [-3, 4, 0, 8, 2]]],
        lambda j: (lambda v: f"{sum(v)}\n{sum(v) / len(v):.2f}")(_entiers(j[1:])),
        "entrées-sorties",
    ),
    "echange": Probleme(
        "Échange de deux entiers",
        "Le programme lit deux entiers a et b, les échange en appelant une fonction "
        "echanger, puis affiche a et b séparés par une espace.",
        [_stdin(a, b) for a, b in [(3, 7), (-1, 5), (4, 4), (0, 123)]],
        lambda j: f"{j[1]} {j[0]}",
        "pointeurs",
        consignes={
            "c": "La fonction a pour en-tête void echanger(int *a, int *b) : elle reçoit "
                 "les adresses des deux variables.",
            "cpp": "La fonction a pour en-tête void echanger(int &a, int &b) : elle "
                   "reçoit les deux variables par référence.",
        },
    ),
    "longueur": Probleme(
        "Longueur d'une chaîne par pointeur",
        "Le programme lit un mot (sans espace, au plus 100 caractères) et affiche son "
        "nombre de caractères.",
        [_stdin(m) for m in ["bonjour", "a", "anticonstitutionnellement", "CodEval"]],
        lambda j: str(len(j[0])),
        "pointeurs",
        consignes={
            "c": "Écrivez la fonction int longueur(const char *s) sans utiliser strlen ni "
                 "d'indice : avancez un pointeur jusqu'au caractère nul.",
        },
    ),
    "inverser_tableau": Probleme(
        "Tableau dynamique inversé",
        "Le programme lit un entier n (n >= 1) puis n entiers, et les affiche dans "
        "l'ordre inverse, séparés par une espace, sur une ligne.",
        [_stdin(len(v), " ".join(map(str, v)))
         for v in [[1, 2, 3, 4, 5], [42], [9, -1, 0, 7]]],
        lambda j: " ".join(reversed(j[1:])),
        "allocation dynamique",
        consignes={
            "c": "Le tableau est alloué avec malloc à la taille exacte n, puis libéré "
                 "avec free.",
        },
    ),
    "dichotomie": Probleme(
        "Recherche dichotomique",
        "Le programme lit un entier n, puis n entiers distincts triés par ordre "
        "croissant, puis une valeur x. Il affiche l'indice de x dans le tableau (à partir "
        "de 0), ou -1 si x n'y est pas, en procédant par dichotomie.",
        [_stdin(len(t), " ".join(map(str, t)), x)
         for t, x in [([1, 3, 5, 7, 9, 11], 7), ([1, 3, 5, 7, 9, 11], 1),
                      ([1, 3, 5, 7, 9, 11], 11), ([1, 3, 5, 7, 9, 11], 4), ([5], 5)]],
        _dichotomie,
        "tableaux",
    ),
    "transposee": Probleme(
        "Transposée d'une matrice",
        "Le programme lit le nombre de lignes l et de colonnes c (au plus 10 chacun), "
        "puis les l x c entiers de la matrice, ligne par ligne. Il affiche sa transposée : "
        "c lignes de l valeurs séparées par une espace.",
        [_stdin("2 3", "1 2 3", "4 5 6"), _stdin("1 1", "9"), _stdin("3 2", "1 2", "3 4", "5 6")],
        _transposee,
        "tableaux à deux dimensions",
    ),
    "liste_saisie": Probleme(
        "Liste chaînée : saisie et affichage",
        SAISIE + "Chaque valeur est ajoutée en fin d'une liste chaînée. " + FORMAT_LISTE,
        [_stdin(*l, -1) for l in LISTES],
        lambda j: _chaine(_jusqua(j)[0]),
        "listes chaînées",
        consignes={
            "c": "Une cellule est une struct Cellule { int valeur; struct Cellule *suivant; } "
                 "allouée par malloc ; libérez toute la liste avant de quitter.",
            "java": "Une cellule est un objet d'une classe Noeud (champs valeur et suivant) "
                    "que vous écrivez : LinkedList n'est pas autorisée.",
            "python": "Une cellule est un objet d'une classe Noeud (attributs valeur et "
                      "suivant) que vous écrivez : n'utilisez pas de liste Python.",
        },
    ),
    "liste_inversion": Probleme(
        "Liste chaînée : inversion",
        SAISIE + "Chaque valeur est ajoutée en fin d'une liste chaînée. Le programme "
        "inverse ensuite la liste sur place, sans créer de nouvelle cellule (en ne "
        "changeant que les liens suivant). " + FORMAT_LISTE,
        [_stdin(*l, -1) for l in LISTES],
        lambda j: _chaine(_jusqua(j)[0][::-1]),
        "listes chaînées",
        consignes={
            "c": "Écrivez la fonction struct Cellule *inverser(struct Cellule *tete) qui "
                 "renvoie la nouvelle tête.",
            "java": "Écrivez la méthode static Noeud inverser(Noeud tete) qui renvoie la "
                    "nouvelle tête.",
        },
    ),
    "liste_suppression": Probleme(
        "Liste chaînée : suppression d'une valeur",
        SAISIE + "Chaque valeur est ajoutée en fin d'une liste chaînée. Il lit ensuite "
        "une valeur x et supprime de la liste toutes les cellules qui la contiennent. "
        + FORMAT_LISTE,
        [_stdin(*l, -1, x) for l, x in [(LISTES[3], 3), (LISTES[0], 42), (LISTES[0], 4),
                                         ([7], 7), ([1, 2], 5)]],
        lambda j: (lambda v, reste: _chaine([e for e in v if e != int(reste[0])]))(*_jusqua(j)),
        "listes chaînées",
        consignes={
            "c": "Chaque cellule supprimée est libérée avec free.",
        },
    ),
    "liste_triee": Probleme(
        "Liste chaînée triée",
        SAISIE + "Chaque valeur est insérée à sa place dans une liste chaînée, qui reste "
        "triée par ordre croissant. " + FORMAT_LISTE,
        [_stdin(*l, -1) for l in [[5, 1, 4, 2, 3], [9, 9, -4, 0], [], [1, 2, 3]]],
        lambda j: _chaine(_insertion_triee(_jusqua(j)[0])),
        "listes chaînées",
        consignes={
            "cpp": "Les cellules sont créées avec new et détruites avec delete ; "
                   "std::list et std::sort ne sont pas autorisés.",
            "python": "Une cellule est un objet d'une classe Noeud que vous écrivez.",
        },
    ),
    "liste_double": Probleme(
        "Liste doublement chaînée",
        SAISIE + "Chaque valeur est ajoutée en fin d'une liste doublement chaînée (chaque "
        "cellule connaît sa précédente et sa suivante). Le programme affiche les valeurs "
        "de la tête vers la queue sur une ligne, puis de la queue vers la tête sur la "
        "ligne suivante, séparées par une espace ; « vide » seul si la liste est vide.",
        [_stdin(*l, -1) for l in [[1, 2, 3], [42], [], [5, -5, 10, 0]]],
        lambda j: (lambda v: f"{' '.join(map(str, v))}\n{' '.join(map(str, v[::-1]))}"
                   if v else "vide")(_jusqua(j)[0]),
        "listes chaînées",
        consignes={
            "cpp": "Les cellules sont créées avec new et détruites avec delete.",
        },
    ),
    "pile": Probleme(
        "Pile chaînée",
        "Le programme gère une pile d'entiers implémentée par une liste chaînée (on empile "
        "et dépile en tête). Il lit des commandes jusqu'à « F » : « E » suivi d'un entier "
        "empile cet entier ; « D » dépile et affiche la valeur retirée, ou « vide » si la "
        "pile est vide. Chaque affichage est sur sa ligne.",
        [_stdin(*c) for c in COMMANDES],
        lambda j: _commandes(j, file=False, vide="vide"),
        "piles et files",
    ),
    "file": Probleme(
        "File chaînée",
        "Le programme gère une file d'entiers implémentée par une liste chaînée (ajout en "
        "queue, retrait en tête). Il lit des commandes jusqu'à « F » : « E » suivi d'un "
        "entier enfile cet entier ; « D » défile et affiche la valeur retirée, ou « vide » "
        "si la file est vide. Chaque affichage est sur sa ligne.",
        [_stdin(*c) for c in COMMANDES],
        lambda j: _commandes(j, file=True, vide="vide"),
        "piles et files",
        consignes={
            "java": "Écrivez la classe File (avec une classe Noeud et deux références tete "
                    "et queue) ; les collections Java ne sont pas autorisées.",
            "python": "Écrivez la classe File (avec une classe Noeud et deux attributs "
                      "tete et queue) ; collections.deque n'est pas autorisée.",
        },
    ),
    "parentheses": Probleme(
        "Parenthèses équilibrées",
        "Le programme lit un mot composé uniquement des caractères ( ) [ ] { } et affiche "
        "« OUI » s'il est bien parenthésé, « NON » sinon. Utilisez une pile.",
        [_stdin(m) for m in ["([]{()})", "(]", "((", "{[()()]}", "())(", "}"]],
        lambda j: _equilibre(j[0]),
        "piles et files",
    ),
    "frequences": Probleme(
        "Fréquence des mots",
        "Le programme lit des mots en minuscules jusqu'au mot « FIN » (non compris). Il "
        "affiche ensuite chaque mot distinct suivi de son nombre d'occurrences, sous la "
        "forme « mot : n », un par ligne, dans l'ordre alphabétique.",
        [_stdin(*t.split(), "FIN") for t in [
            "le chat et le chien et le rat", "un", "b a b a c"]],
        lambda j: "\n".join(f"{m} : {n}" for m, n in sorted(Counter(j[:j.index("FIN")]).items())),
        "dictionnaires",
        consignes={
            "cpp": "Utilisez std::map.",
            "java": "Utilisez une TreeMap.",
            "python": "Utilisez un dictionnaire.",
        },
    ),
    "tri_insertion": Probleme(
        "Tri par insertion",
        "Le programme lit un entier n (n >= 1) puis n entiers, les trie par ordre croissant "
        "avec l'algorithme du tri par insertion (sans fonction de tri de la bibliothèque) "
        "et les affiche séparés par une espace, sur une ligne.",
        [_stdin(len(v), " ".join(map(str, v)))
         for v in [[5, 2, 9, 1, 5, 6], [1], [3, -1, 2], [10, 9, 8, 7, 6, 5, 4]]],
        lambda j: " ".join(map(str, sorted(_entiers(j[1:])))),
        "tris",
    ),
    "premiers": Probleme(
        "Nombres premiers",
        "Le programme lit un entier n (n >= 2) et affiche, sur une ligne et séparés par une "
        "espace, tous les nombres premiers inférieurs ou égaux à n. Écrivez une fonction "
        "estPremier.",
        [_stdin(n) for n in [10, 2, 30, 50]],
        lambda j: " ".join(map(str, _premiers(int(j[0])))),
        "fonctions",
    ),
    "fibonacci": Probleme(
        "Suite de Fibonacci (récursivité)",
        "F(0) = 0, F(1) = 1 et F(n) = F(n - 1) + F(n - 2). Le programme lit un entier n "
        "(0 <= n <= 25) et affiche F(n), calculé par une fonction récursive.",
        [_stdin(n) for n in [0, 1, 2, 10, 20, 25]],
        lambda j: str(_fib(int(j[0]))),
        "récursivité",
    ),
    "rectangle": Probleme(
        "Classe Rectangle",
        "Écrivez une classe Rectangle (longueur et largeur entières) dotée des méthodes "
        "aire() et perimetre(). Le programme lit la longueur puis la largeur, crée le "
        "rectangle, puis affiche « aire = A » et « perimetre = P » sur deux lignes.",
        [_stdin(a, b) for a, b in [(3, 4), (10, 2), (1, 1), (7, 0)]],
        lambda j: f"aire = {int(j[0]) * int(j[1])}\nperimetre = {2 * (int(j[0]) + int(j[1]))}",
        "programmation objet",
    ),
    "compte": Probleme(
        "Classe CompteBancaire",
        "Écrivez une classe CompteBancaire (solde entier) avec les méthodes deposer(montant) "
        "et retirer(montant) ; un retrait supérieur au solde est refusé. Le programme lit le "
        "solde initial, puis des opérations jusqu'à « F » : « D » suivi d'un montant pour un "
        "dépôt, « R » suivi d'un montant pour un retrait. Chaque retrait refusé affiche "
        "« solde insuffisant » ; à la fin, le programme affiche « solde = S ».",
        [_stdin(100, "D", 50, "R", 30, "R", 500, "F"), _stdin(0, "R", 1, "F"),
         _stdin(10, "D", 5, "D", 5, "R", 20, "F")],
        _bancaire,
        "programmation objet",
    ),
}

# ----- Solutions de référence -----
SOLUTIONS: dict[str, dict[str, str]] = {"c": {}, "cpp": {}, "java": {}, "python": {}}

SOLUTIONS["c"]["pgcd"] = r"""#include <stdio.h>

int pgcd(int a, int b)
{
    while (b != 0) {
        int r = a % b;
        a = b;
        b = r;
    }
    return a;
}

int main(void)
{
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\n", pgcd(a, b));
    return 0;
}
"""

SOLUTIONS["c"]["somme_moyenne"] = r"""#include <stdio.h>

int main(void)
{
    int n, x, somme = 0;
    scanf("%d", &n);
    for (int i = 0; i < n; i++) {
        scanf("%d", &x);
        somme += x;
    }
    printf("%d\n%.2f\n", somme, (double)somme / n);
    return 0;
}
"""

SOLUTIONS["c"]["echange"] = r"""#include <stdio.h>

void echanger(int *a, int *b)
{
    int aux = *a;
    *a = *b;
    *b = aux;
}

int main(void)
{
    int a, b;
    scanf("%d %d", &a, &b);
    echanger(&a, &b);
    printf("%d %d\n", a, b);
    return 0;
}
"""

SOLUTIONS["c"]["longueur"] = r"""#include <stdio.h>

int longueur(const char *s)
{
    const char *p = s;
    while (*p != '\0')
        p++;
    return (int)(p - s);
}

int main(void)
{
    char mot[101];
    scanf("%100s", mot);
    printf("%d\n", longueur(mot));
    return 0;
}
"""

SOLUTIONS["c"]["inverser_tableau"] = r"""#include <stdio.h>
#include <stdlib.h>

int main(void)
{
    int n;
    scanf("%d", &n);
    int *t = malloc(n * sizeof *t);
    if (t == NULL)
        return 1;
    for (int i = 0; i < n; i++)
        scanf("%d", t + i);
    for (int i = n - 1; i >= 0; i--)
        printf("%d%s", t[i], i > 0 ? " " : "\n");
    free(t);
    return 0;
}
"""

SOLUTIONS["c"]["dichotomie"] = r"""#include <stdio.h>

int main(void)
{
    int n, x, t[1000];
    scanf("%d", &n);
    for (int i = 0; i < n; i++)
        scanf("%d", &t[i]);
    scanf("%d", &x);
    int debut = 0, fin = n - 1, trouve = -1;
    while (debut <= fin && trouve == -1) {
        int milieu = (debut + fin) / 2;
        if (t[milieu] == x)
            trouve = milieu;
        else if (t[milieu] < x)
            debut = milieu + 1;
        else
            fin = milieu - 1;
    }
    printf("%d\n", trouve);
    return 0;
}
"""

SOLUTIONS["c"]["transposee"] = r"""#include <stdio.h>

int main(void)
{
    int l, c, m[10][10];
    scanf("%d %d", &l, &c);
    for (int i = 0; i < l; i++)
        for (int j = 0; j < c; j++)
            scanf("%d", &m[i][j]);
    for (int j = 0; j < c; j++)
        for (int i = 0; i < l; i++)
            printf("%d%s", m[i][j], i < l - 1 ? " " : "\n");
    return 0;
}
"""

_C_LISTE = r"""#include <stdio.h>
#include <stdlib.h>

struct Cellule {
    int valeur;
    struct Cellule *suivant;
};

/* Lit des entiers jusqu'à -1 et les chaîne en fin de liste. */
struct Cellule *saisir(void)
{
    struct Cellule *tete = NULL, *queue = NULL;
    int x;
    while (scanf("%d", &x) == 1 && x != -1) {
        struct Cellule *c = malloc(sizeof *c);
        c->valeur = x;
        c->suivant = NULL;
        if (tete == NULL)
            tete = c;
        else
            queue->suivant = c;
        queue = c;
    }
    return tete;
}

void afficher(const struct Cellule *p)
{
    for (; p != NULL; p = p->suivant)
        printf("%d -> ", p->valeur);
    printf("NULL\n");
}

void liberer(struct Cellule *p)
{
    while (p != NULL) {
        struct Cellule *suivant = p->suivant;
        free(p);
        p = suivant;
    }
}
"""

SOLUTIONS["c"]["liste_saisie"] = _C_LISTE + r"""
int main(void)
{
    struct Cellule *tete = saisir();
    afficher(tete);
    liberer(tete);
    return 0;
}
"""

SOLUTIONS["c"]["liste_inversion"] = _C_LISTE + r"""
struct Cellule *inverser(struct Cellule *tete)
{
    struct Cellule *prec = NULL;
    while (tete != NULL) {
        struct Cellule *suivant = tete->suivant;
        tete->suivant = prec;
        prec = tete;
        tete = suivant;
    }
    return prec;
}

int main(void)
{
    struct Cellule *tete = inverser(saisir());
    afficher(tete);
    liberer(tete);
    return 0;
}
"""

SOLUTIONS["c"]["liste_suppression"] = _C_LISTE + r"""
struct Cellule *supprimer(struct Cellule *tete, int x)
{
    struct Cellule **lien = &tete;
    while (*lien != NULL) {
        if ((*lien)->valeur == x) {
            struct Cellule *c = *lien;
            *lien = c->suivant;
            free(c);
        } else {
            lien = &(*lien)->suivant;
        }
    }
    return tete;
}

int main(void)
{
    int x;
    struct Cellule *tete = saisir();
    scanf("%d", &x);
    tete = supprimer(tete, x);
    afficher(tete);
    liberer(tete);
    return 0;
}
"""

SOLUTIONS["c"]["pile"] = r"""#include <stdio.h>
#include <stdlib.h>

struct Cellule {
    int valeur;
    struct Cellule *suivant;
};

void empiler(struct Cellule **pile, int x)
{
    struct Cellule *c = malloc(sizeof *c);
    c->valeur = x;
    c->suivant = *pile;
    *pile = c;
}

/* Rend 1 et range le sommet dans *x, ou 0 si la pile est vide. */
int depiler(struct Cellule **pile, int *x)
{
    if (*pile == NULL)
        return 0;
    struct Cellule *c = *pile;
    *x = c->valeur;
    *pile = c->suivant;
    free(c);
    return 1;
}

int main(void)
{
    struct Cellule *pile = NULL;
    char commande[4];
    int x;
    while (scanf("%3s", commande) == 1 && commande[0] != 'F') {
        if (commande[0] == 'E') {
            scanf("%d", &x);
            empiler(&pile, x);
        } else if (depiler(&pile, &x)) {
            printf("%d\n", x);
        } else {
            printf("vide\n");
        }
    }
    while (depiler(&pile, &x))
        ;
    return 0;
}
"""

SOLUTIONS["cpp"]["somme_moyenne"] = r"""#include <iomanip>
#include <iostream>

int main()
{
    int n, x, somme = 0;
    std::cin >> n;
    for (int i = 0; i < n; i++) {
        std::cin >> x;
        somme += x;
    }
    std::cout << somme << '\n'
              << std::fixed << std::setprecision(2) << static_cast<double>(somme) / n << '\n';
    return 0;
}
"""

SOLUTIONS["cpp"]["echange"] = r"""#include <iostream>

void echanger(int &a, int &b)
{
    int aux = a;
    a = b;
    b = aux;
}

int main()
{
    int a, b;
    std::cin >> a >> b;
    echanger(a, b);
    std::cout << a << ' ' << b << '\n';
    return 0;
}
"""

SOLUTIONS["cpp"]["parentheses"] = r"""#include <iostream>
#include <stack>
#include <string>

bool equilibre(const std::string &mot)
{
    std::stack<char> pile;
    for (char c : mot) {
        if (c == '(' || c == '[' || c == '{') {
            pile.push(c);
            continue;
        }
        char attendu = c == ')' ? '(' : c == ']' ? '[' : '{';
        if (pile.empty() || pile.top() != attendu)
            return false;
        pile.pop();
    }
    return pile.empty();
}

int main()
{
    std::string mot;
    std::cin >> mot;
    std::cout << (equilibre(mot) ? "OUI" : "NON") << '\n';
    return 0;
}
"""

SOLUTIONS["cpp"]["frequences"] = r"""#include <iostream>
#include <map>
#include <string>

int main()
{
    std::map<std::string, int> compte;
    std::string mot;
    while (std::cin >> mot && mot != "FIN")
        compte[mot]++;
    for (const auto &[m, n] : compte)
        std::cout << m << " : " << n << '\n';
    return 0;
}
"""

SOLUTIONS["cpp"]["tri_insertion"] = r"""#include <iostream>
#include <vector>

void triInsertion(std::vector<int> &t)
{
    for (std::size_t i = 1; i < t.size(); i++) {
        int x = t[i];
        std::size_t j = i;
        while (j > 0 && t[j - 1] > x) {
            t[j] = t[j - 1];
            j--;
        }
        t[j] = x;
    }
}

int main()
{
    int n;
    std::cin >> n;
    std::vector<int> t(n);
    for (int &x : t)
        std::cin >> x;
    triInsertion(t);
    for (int i = 0; i < n; i++)
        std::cout << t[i] << (i + 1 < n ? ' ' : '\n');
    return 0;
}
"""

SOLUTIONS["cpp"]["rectangle"] = r"""#include <iostream>

class Rectangle {
public:
    Rectangle(int longueur, int largeur) : longueur_(longueur), largeur_(largeur) {}
    int aire() const { return longueur_ * largeur_; }
    int perimetre() const { return 2 * (longueur_ + largeur_); }

private:
    int longueur_;
    int largeur_;
};

int main()
{
    int l, L;
    std::cin >> L >> l;
    Rectangle r(L, l);
    std::cout << "aire = " << r.aire() << '\n';
    std::cout << "perimetre = " << r.perimetre() << '\n';
    return 0;
}
"""

SOLUTIONS["cpp"]["compte"] = r"""#include <iostream>

class CompteBancaire {
public:
    explicit CompteBancaire(int solde) : solde_(solde) {}
    void deposer(int montant) { solde_ += montant; }
    bool retirer(int montant)
    {
        if (montant > solde_)
            return false;
        solde_ -= montant;
        return true;
    }
    int solde() const { return solde_; }

private:
    int solde_;
};

int main()
{
    int solde, montant;
    char op;
    std::cin >> solde;
    CompteBancaire compte(solde);
    while (std::cin >> op && op != 'F') {
        std::cin >> montant;
        if (op == 'D')
            compte.deposer(montant);
        else if (!compte.retirer(montant))
            std::cout << "solde insuffisant\n";
    }
    std::cout << "solde = " << compte.solde() << '\n';
    return 0;
}
"""

SOLUTIONS["cpp"]["liste_triee"] = r"""#include <iostream>

struct Cellule {
    int valeur;
    Cellule *suivant;
};

void inserer(Cellule *&tete, int x)
{
    Cellule **lien = &tete;
    while (*lien != nullptr && (*lien)->valeur <= x)
        lien = &(*lien)->suivant;
    *lien = new Cellule{x, *lien};
}

int main()
{
    Cellule *tete = nullptr;
    int x;
    while (std::cin >> x && x != -1)
        inserer(tete, x);
    for (Cellule *p = tete; p != nullptr; p = p->suivant)
        std::cout << p->valeur << " -> ";
    std::cout << "NULL\n";
    while (tete != nullptr) {
        Cellule *suivant = tete->suivant;
        delete tete;
        tete = suivant;
    }
    return 0;
}
"""

SOLUTIONS["cpp"]["liste_double"] = r"""#include <iostream>

struct Cellule {
    int valeur;
    Cellule *precedent;
    Cellule *suivant;
};

int main()
{
    Cellule *tete = nullptr, *queue = nullptr;
    int x;
    while (std::cin >> x && x != -1) {
        Cellule *c = new Cellule{x, queue, nullptr};
        if (queue == nullptr)
            tete = c;
        else
            queue->suivant = c;
        queue = c;
    }
    if (tete == nullptr) {
        std::cout << "vide\n";
        return 0;
    }
    for (Cellule *p = tete; p != nullptr; p = p->suivant)
        std::cout << p->valeur << (p->suivant ? ' ' : '\n');
    for (Cellule *p = queue; p != nullptr; p = p->precedent)
        std::cout << p->valeur << (p->precedent ? ' ' : '\n');
    while (tete != nullptr) {
        Cellule *suivant = tete->suivant;
        delete tete;
        tete = suivant;
    }
    return 0;
}
"""

SOLUTIONS["java"]["somme_moyenne"] = r"""import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int n = sc.nextInt();
        int somme = 0;
        for (int i = 0; i < n; i++) {
            somme += sc.nextInt();
        }
        System.out.println(somme);
        System.out.println(String.format(java.util.Locale.ROOT, "%.2f", (double) somme / n));
    }
}
"""

SOLUTIONS["java"]["premiers"] = r"""import java.util.Scanner;
import java.util.StringJoiner;

public class Main {
    static boolean estPremier(int k) {
        if (k < 2) {
            return false;
        }
        for (int d = 2; d * d <= k; d++) {
            if (k % d == 0) {
                return false;
            }
        }
        return true;
    }

    public static void main(String[] args) {
        int n = new Scanner(System.in).nextInt();
        StringJoiner ligne = new StringJoiner(" ");
        for (int k = 2; k <= n; k++) {
            if (estPremier(k)) {
                ligne.add(String.valueOf(k));
            }
        }
        System.out.println(ligne);
    }
}
"""

SOLUTIONS["java"]["tri_insertion"] = r"""import java.util.Scanner;
import java.util.StringJoiner;

public class Main {
    static void triInsertion(int[] t) {
        for (int i = 1; i < t.length; i++) {
            int x = t[i];
            int j = i;
            while (j > 0 && t[j - 1] > x) {
                t[j] = t[j - 1];
                j--;
            }
            t[j] = x;
        }
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        int[] t = new int[sc.nextInt()];
        for (int i = 0; i < t.length; i++) {
            t[i] = sc.nextInt();
        }
        triInsertion(t);
        StringJoiner ligne = new StringJoiner(" ");
        for (int x : t) {
            ligne.add(String.valueOf(x));
        }
        System.out.println(ligne);
    }
}
"""

SOLUTIONS["java"]["rectangle"] = r"""import java.util.Scanner;

class Rectangle {
    private final int longueur;
    private final int largeur;

    Rectangle(int longueur, int largeur) {
        this.longueur = longueur;
        this.largeur = largeur;
    }

    int aire() {
        return longueur * largeur;
    }

    int perimetre() {
        return 2 * (longueur + largeur);
    }
}

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        Rectangle r = new Rectangle(sc.nextInt(), sc.nextInt());
        System.out.println("aire = " + r.aire());
        System.out.println("perimetre = " + r.perimetre());
    }
}
"""

SOLUTIONS["java"]["compte"] = r"""import java.util.Scanner;

class CompteBancaire {
    private int solde;

    CompteBancaire(int solde) {
        this.solde = solde;
    }

    void deposer(int montant) {
        solde += montant;
    }

    boolean retirer(int montant) {
        if (montant > solde) {
            return false;
        }
        solde -= montant;
        return true;
    }

    int getSolde() {
        return solde;
    }
}

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        CompteBancaire compte = new CompteBancaire(sc.nextInt());
        String op = sc.next();
        while (!op.equals("F")) {
            int montant = sc.nextInt();
            if (op.equals("D")) {
                compte.deposer(montant);
            } else if (!compte.retirer(montant)) {
                System.out.println("solde insuffisant");
            }
            op = sc.next();
        }
        System.out.println("solde = " + compte.getSolde());
    }
}
"""

SOLUTIONS["java"]["frequences"] = r"""import java.util.Map;
import java.util.Scanner;
import java.util.TreeMap;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        Map<String, Integer> compte = new TreeMap<>();
        String mot = sc.next();
        while (!mot.equals("FIN")) {
            compte.merge(mot, 1, Integer::sum);
            mot = sc.next();
        }
        for (Map.Entry<String, Integer> e : compte.entrySet()) {
            System.out.println(e.getKey() + " : " + e.getValue());
        }
    }
}
"""

SOLUTIONS["java"]["parentheses"] = r"""import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Scanner;

public class Main {
    static boolean equilibre(String mot) {
        Deque<Character> pile = new ArrayDeque<>();
        for (char c : mot.toCharArray()) {
            if (c == '(' || c == '[' || c == '{') {
                pile.push(c);
                continue;
            }
            char attendu = c == ')' ? '(' : c == ']' ? '[' : '{';
            if (pile.isEmpty() || pile.pop() != attendu) {
                return false;
            }
        }
        return pile.isEmpty();
    }

    public static void main(String[] args) {
        String mot = new Scanner(System.in).next();
        System.out.println(equilibre(mot) ? "OUI" : "NON");
    }
}
"""

_JAVA_LISTE = r"""import java.util.Scanner;

class Noeud {
    int valeur;
    Noeud suivant;

    Noeud(int valeur) {
        this.valeur = valeur;
    }
}

public class Main {
    static Noeud saisir(Scanner sc) {
        Noeud tete = null;
        Noeud queue = null;
        int x = sc.nextInt();
        while (x != -1) {
            Noeud n = new Noeud(x);
            if (tete == null) {
                tete = n;
            } else {
                queue.suivant = n;
            }
            queue = n;
            x = sc.nextInt();
        }
        return tete;
    }

    static void afficher(Noeud p) {
        StringBuilder ligne = new StringBuilder();
        for (; p != null; p = p.suivant) {
            ligne.append(p.valeur).append(" -> ");
        }
        System.out.println(ligne.append("NULL"));
    }
"""

SOLUTIONS["java"]["liste_saisie"] = _JAVA_LISTE + r"""
    public static void main(String[] args) {
        afficher(saisir(new Scanner(System.in)));
    }
}
"""

SOLUTIONS["java"]["liste_inversion"] = _JAVA_LISTE + r"""
    static Noeud inverser(Noeud tete) {
        Noeud prec = null;
        while (tete != null) {
            Noeud suivant = tete.suivant;
            tete.suivant = prec;
            prec = tete;
            tete = suivant;
        }
        return prec;
    }

    public static void main(String[] args) {
        afficher(inverser(saisir(new Scanner(System.in))));
    }
}
"""

SOLUTIONS["java"]["file"] = r"""import java.util.Scanner;

class File {
    private static class Noeud {
        final int valeur;
        Noeud suivant;

        Noeud(int valeur) {
            this.valeur = valeur;
        }
    }

    private Noeud tete;
    private Noeud queue;

    boolean estVide() {
        return tete == null;
    }

    void enfiler(int x) {
        Noeud n = new Noeud(x);
        if (queue == null) {
            tete = n;
        } else {
            queue.suivant = n;
        }
        queue = n;
    }

    int defiler() {
        int x = tete.valeur;
        tete = tete.suivant;
        if (tete == null) {
            queue = null;
        }
        return x;
    }
}

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        File file = new File();
        String commande = sc.next();
        while (!commande.equals("F")) {
            if (commande.equals("E")) {
                file.enfiler(sc.nextInt());
            } else {
                System.out.println(file.estVide() ? "vide" : String.valueOf(file.defiler()));
            }
            commande = sc.next();
        }
    }
}
"""

SOLUTIONS["python"]["somme_moyenne"] = '''import sys


def main():
    jetons = sys.stdin.read().split()
    n = int(jetons[0])
    valeurs = [int(x) for x in jetons[1:n + 1]]
    somme = sum(valeurs)
    print(somme)
    print(f"{somme / n:.2f}")


if __name__ == "__main__":
    main()
'''

SOLUTIONS["python"]["premiers"] = '''def est_premier(k):
    if k < 2:
        return False
    d = 2
    while d * d <= k:
        if k % d == 0:
            return False
        d += 1
    return True


def main():
    n = int(input())
    print(" ".join(str(k) for k in range(2, n + 1) if est_premier(k)))


if __name__ == "__main__":
    main()
'''

SOLUTIONS["python"]["fibonacci"] = '''def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)


def main():
    print(fib(int(input())))


if __name__ == "__main__":
    main()
'''

SOLUTIONS["python"]["transposee"] = '''import sys


def main():
    jetons = [int(x) for x in sys.stdin.read().split()]
    l, c = jetons[0], jetons[1]
    m = [jetons[2 + i * c:2 + (i + 1) * c] for i in range(l)]
    for j in range(c):
        print(" ".join(str(m[i][j]) for i in range(l)))


if __name__ == "__main__":
    main()
'''

SOLUTIONS["python"]["frequences"] = '''import sys


def main():
    compte = {}
    for mot in sys.stdin.read().split():
        if mot == "FIN":
            break
        compte[mot] = compte.get(mot, 0) + 1
    for mot in sorted(compte):
        print(f"{mot} : {compte[mot]}")


if __name__ == "__main__":
    main()
'''

SOLUTIONS["python"]["parentheses"] = '''def equilibre(mot):
    paires = {")": "(", "]": "[", "}": "{"}
    pile = []
    for c in mot:
        if c in "([{":
            pile.append(c)
        elif not pile or pile.pop() != paires[c]:
            return False
    return not pile


def main():
    print("OUI" if equilibre(input().strip()) else "NON")


if __name__ == "__main__":
    main()
'''

SOLUTIONS["python"]["rectangle"] = '''class Rectangle:
    def __init__(self, longueur, largeur):
        self.longueur = longueur
        self.largeur = largeur

    def aire(self):
        return self.longueur * self.largeur

    def perimetre(self):
        return 2 * (self.longueur + self.largeur)


def main():
    r = Rectangle(int(input()), int(input()))
    print(f"aire = {r.aire()}")
    print(f"perimetre = {r.perimetre()}")


if __name__ == "__main__":
    main()
'''

_PY_LISTE = '''import sys


class Noeud:
    def __init__(self, valeur, suivant=None):
        self.valeur = valeur
        self.suivant = suivant


def afficher(tete):
    morceaux = []
    p = tete
    while p is not None:
        morceaux.append(str(p.valeur))
        p = p.suivant
    print(" -> ".join(morceaux + ["NULL"]))
'''

_PY_SAISIE = '''

def saisir(jetons):
    """Chaîne en fin de liste les entiers lus jusqu'à -1 ; rend (tête, reste)."""
    tete = queue = None
    i = 0
    while int(jetons[i]) != -1:
        cellule = Noeud(int(jetons[i]))
        if tete is None:
            tete = cellule
        else:
            queue.suivant = cellule
        queue = cellule
        i += 1
    return tete, jetons[i + 1:]
'''

SOLUTIONS["python"]["liste_saisie"] = _PY_LISTE + _PY_SAISIE + '''

def main():
    tete, _ = saisir(sys.stdin.read().split())
    afficher(tete)


if __name__ == "__main__":
    main()
'''

SOLUTIONS["python"]["liste_suppression"] = _PY_LISTE + _PY_SAISIE + '''

def supprimer(tete, x):
    while tete is not None and tete.valeur == x:
        tete = tete.suivant
    p = tete
    while p is not None and p.suivant is not None:
        if p.suivant.valeur == x:
            p.suivant = p.suivant.suivant
        else:
            p = p.suivant
    return tete


def main():
    tete, reste = saisir(sys.stdin.read().split())
    afficher(supprimer(tete, int(reste[0])))


if __name__ == "__main__":
    main()
'''

SOLUTIONS["python"]["liste_triee"] = _PY_LISTE + '''

def inserer(tete, x):
    if tete is None or x < tete.valeur:
        return Noeud(x, tete)
    p = tete
    while p.suivant is not None and p.suivant.valeur <= x:
        p = p.suivant
    p.suivant = Noeud(x, p.suivant)
    return tete


def main():
    tete = None
    for jeton in sys.stdin.read().split():
        if int(jeton) == -1:
            break
        tete = inserer(tete, int(jeton))
    afficher(tete)


if __name__ == "__main__":
    main()
'''

SOLUTIONS["python"]["file"] = '''import sys


class Noeud:
    def __init__(self, valeur):
        self.valeur = valeur
        self.suivant = None


class File:
    def __init__(self):
        self.tete = None
        self.queue = None

    def est_vide(self):
        return self.tete is None

    def enfiler(self, x):
        cellule = Noeud(x)
        if self.queue is None:
            self.tete = cellule
        else:
            self.queue.suivant = cellule
        self.queue = cellule

    def defiler(self):
        x = self.tete.valeur
        self.tete = self.tete.suivant
        if self.tete is None:
            self.queue = None
        return x


def main():
    jetons = sys.stdin.read().split()
    file = File()
    i = 0
    while jetons[i] != "F":
        if jetons[i] == "E":
            file.enfiler(int(jetons[i + 1]))
            i += 2
        else:
            print("vide" if file.est_vide() else file.defiler())
            i += 1


if __name__ == "__main__":
    main()
'''

SOLUTIONS["python"]["pile"] = '''import sys


class Noeud:
    def __init__(self, valeur, suivant=None):
        self.valeur = valeur
        self.suivant = suivant


def main():
    jetons = sys.stdin.read().split()
    sommet = None
    i = 0
    while jetons[i] != "F":
        if jetons[i] == "E":
            sommet = Noeud(int(jetons[i + 1]), sommet)
            i += 2
            continue
        if sommet is None:
            print("vide")
        else:
            print(sommet.valeur)
            sommet = sommet.suivant
        i += 1


if __name__ == "__main__":
    main()
'''

# ----- Les séries -----
SERIES = {
    "c": ("Programmation en C", ["langage C", "programmation"], "programmation en C"),
    "cpp": ("Programmation en C++", ["C++", "programmation"], "programmation en C++"),
    "java": ("Programmation en Java", ["Java", "programmation"], "programmation en Java"),
    "python": ("Programmation en Python", ["Python", "programmation"],
               "programmation en Python"),
}
SUFFIXES = {"c": "C", "cpp": "C++", "java": "Java", "python": "Python"}
# Une JVM met quelques centaines de millisecondes à démarrer.
DELAIS_MS = {"java": 5000}
NOTE_JAVA = "\n\nLa classe principale s'appelle Main (fichier Main.java)."


def exercice(langage: str, cle: str) -> tuple[str, dict]:
    probleme = P[cle]
    enonce = probleme.enonce
    consigne = probleme.consignes.get(langage)
    if consigne:
        enonce += "\n\n" + consigne
    if langage == "java":
        enonce += NOTE_JAVA
    part = round(probleme.points / len(probleme.cas), 2)
    tests = [
        {
            "name": f"Test {i}",
            "kind": "official",
            "stdin": stdin,
            "expected_stdout": probleme.oracle(stdin.split()),
            "comparison": "trim",
            "points": part,
            "timeout_ms": DELAIS_MS.get(langage, 2000),
            "target_id": None,
            "expected_type": "string",
            "input_types": [],
            "args": [],
        }
        for i, stdin in enumerate(probleme.cas, start=1)
    ]
    return probleme.theme[0].upper() + probleme.theme[1:], {
        "title": f"{probleme.titre} ({SUFFIXES[langage]})",
        "statement": enonce,
        "language": langage,
        "points": probleme.points,
        "starter_code": default_starter(langage),
        "kind": "code",
        "settings": {"solution": SOLUTIONS[langage][cle], "solution_notes": ""},
        "tests": tests,
    }


def collections() -> list[tuple[str, list[str], str, list[tuple[str, dict]]]]:
    """(matière, étiquettes, cours, exercices) de chaque langage."""
    resultat = []
    for langage, (matiere, etiquettes, cours) in SERIES.items():
        items = [exercice(langage, cle) for cle in SOLUTIONS[langage]]
        resultat.append((matiere, etiquettes, cours, items))
    return resultat
