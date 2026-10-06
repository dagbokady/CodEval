"""Les exercices publiés dans la communauté sont justes et faisables.

- chaque solution de référence en C, C++, Java ou Python obtient tous les points
  sur ses propres jeux de tests, en passant par le vrai moteur de correction ;
- chaque exercice d'algorithmique avancée (pointeurs, listes chaînées) se
  résout avec les seuls blocs qu'il autorise.
"""

from __future__ import annotations

import json
import os
import shutil
from types import SimpleNamespace

import pytest

os.environ.setdefault("CODEVAL_SECRET_KEY", "test-secret-key-with-enough-entropy")

from app.grading.engine import grade_exercise  # noqa: E402
from app.seed_community import collections, exercises_avances  # noqa: E402
from app.seed_community_prog import collections as programmation  # noqa: E402

_TEST_FIELDS = ("name", "stdin", "expected_stdout", "comparison", "points", "timeout_ms",
                "target_id", "input_types", "args")
_OUTILS = {"c": "gcc", "cpp": "g++", "java": "javac", "python": "python3"}


def _corriger(exercice: dict, production: str):
    modele = SimpleNamespace(kind=exercice["kind"], language=exercice["language"],
                             points=exercice["points"], settings=exercice["settings"])
    tests = [SimpleNamespace(id=i, kind=SimpleNamespace(value=t["kind"]),
                             **{k: t[k] for k in _TEST_FIELDS})
             for i, t in enumerate(exercice["tests"])]
    return grade_exercise(production, modele, tests)


def test_titres_uniques_et_jeux_de_tests_valides():
    titres = [ex["title"] for *_, items in collections() for _, ex in items]
    assert len(titres) == len(set(titres))
    for *_, items in collections():
        for _, ex in items:
            for test in ex["tests"]:
                # Le formulaire de l'enseignant n'accepte pas plus de 20 valeurs typées.
                assert len(test["input_types"]) <= 20 and len(test["args"]) <= 20
                assert test["expected_stdout"].strip()


CODE = [ex for *_, items in programmation() for _, ex in items]


@pytest.mark.parametrize("exercice", CODE, ids=[ex["title"] for ex in CODE])
def test_solution_de_reference_obtient_tous_les_points(exercice):
    if shutil.which(_OUTILS[exercice["language"]]) is None:
        pytest.skip(f"{_OUTILS[exercice['language']]} absent de cette machine")
    resultat = _corriger(exercice, exercice["settings"]["solution"])
    assert resultat.score == pytest.approx(exercice["points"], abs=0.05), resultat


# ----- Algorithmique avancée : solutions en blocs -----
def v(nom, t="entier", **k):
    return {"nom": nom, "type": t, **k}


def ptr(nom, cible="Cellule"):
    return v(nom, "pointeur", cible=cible)


def lire(c):
    return {"type": "lire", "cible": c}


def ecrire(x):
    return {"type": "ecrire", "expression": x}


def a(c, e):
    return {"type": "affectation", "cible": c, "expression": e}


def si(cond, alors, sinon=()):
    return {"type": "si", "condition": cond, "alors": list(alors), "sinonsi": [],
            "sinon": list(sinon)}


def tq(cond, *corps):
    return {"type": "tantque", "condition": cond, "corps": list(corps)}


def allouer(c):
    return {"type": "allouer", "cible": c}


def liberer(c):
    return {"type": "liberer", "cible": c}


CELLULE = {"nom": "Cellule", "champs": [{"nom": "valeur", "type": "ENTIER"},
                                       {"nom": "suivant", "type": "^Cellule"}]}


def saisie(tete="tete", queue="queue"):
    """Lit jusqu'à -1 et chaîne en fin de liste."""
    return [
        a(tete, "NIL"), lire("x"),
        tq("x <> -1",
           allouer("p"), a("p^.valeur", "x"), a("p^.suivant", "NIL"),
           si(f"{tete} = NIL", [a(tete, "p")], [a(f"{queue}^.suivant", "p")]),
           a(queue, "p"), lire("x")),
    ]


AFFICHAGE = [
    si("tete = NIL", [ecrire('"liste vide", CRLF')]),
    a("p", "tete"),
    tq("p <> NIL", ecrire("p^.valeur, CRLF"), a("p", "p^.suivant")),
]
VARIABLES = [ptr("tete"), ptr("queue"), ptr("p"), ptr("q"), v("x")]


def doc(corps, variables=VARIABLES, types=(CELLULE,), sous_programmes=()):
    return {"nom": "Liste", "constantes": [], "types": list(types),
            "variables": list(variables), "corps": list(corps),
            "sousProgrammes": list(sous_programmes)}


def commandes(file: bool, vide: str):
    defiler = [ecrire("tete^.valeur, CRLF"), a("p", "tete"), a("tete", "tete^.suivant"),
               liberer("p")]
    if file:
        defiler.append(si("tete = NIL", [a("queue", "NIL")]))
        enfiler = [si("tete = NIL", [a("tete", "p")], [a("queue^.suivant", "p")]),
                   a("queue", "p")]
    else:
        enfiler = [a("p^.suivant", "tete"), a("tete", "p")]
    return doc([
        a("tete", "NIL"), lire("c"),
        tq("c <> 'F'",
           si("c = 'E'",
              [lire("x"), allouer("p"), a("p^.valeur", "x"), a("p^.suivant", "NIL"), *enfiler],
              [si("tete = NIL", [ecrire(f'"{vide}", CRLF')], defiler)]),
           lire("c")),
    ], variables=[*VARIABLES, v("c", "caractere")])


CELLULE2 = {"nom": "Cellule2", "champs": [{"nom": "valeur", "type": "ENTIER"},
                                         {"nom": "precedent", "type": "^Cellule2"},
                                         {"nom": "suivant", "type": "^Cellule2"}]}

parcours = {"nom": "t", "type": "^Cellule", "mode": "E"}
SOLUTIONS_ALGO = {
    "Échange de deux entiers par pointeurs": doc(
        [allouer("p"), allouer("q"), lire("p^"), lire("q^"), a("x", "p^"), a("p^", "q^"),
         a("q^", "x"), ecrire("p^, CRLF"), ecrire("q^, CRLF")],
        variables=[ptr("p", "ENTIER"), ptr("q", "ENTIER"), v("x")], types=()),
    "Liste chaînée : saisie et affichage": doc(saisie() + AFFICHAGE),
    "Liste chaînée : insertion en tête": doc([
        a("tete", "NIL"), lire("x"),
        tq("x <> -1", allouer("p"), a("p^.valeur", "x"), a("p^.suivant", "tete"),
           a("tete", "p"), lire("x")),
        *AFFICHAGE]),
    "Longueur et somme d'une liste chaînée": doc(
        saisie() + [ecrire("Longueur(tete), CRLF"), ecrire("Somme(tete), CRLF")],
        sous_programmes=[
            {"type": "fonction", "nom": nom, "parametres": [parcours], "typeRetour": "ENTIER",
             "variables": [v("n"), ptr("c")],
             "corps": [a("n", "0"), a("c", "t"),
                       tq("c <> NIL", a("n", f"n + {pas}"), a("c", "c^.suivant")),
                       {"type": "retour", "expression": "n"}]}
            for nom, pas in (("Longueur", "1"), ("Somme", "c^.valeur"))]),
    "Recherche dans une liste chaînée": doc(saisie() + [
        lire("x"), a("q", "tete"), {"type": "affectation", "cible": "i", "expression": "1"},
        a("pos", "0"),
        tq("q <> NIL ET pos = 0", si("q^.valeur = x", [a("pos", "i")]), a("i", "i + 1"),
           a("q", "q^.suivant")),
        ecrire("pos, CRLF")], variables=[*VARIABLES, v("i"), v("pos")]),
    "Suppression des occurrences d'une valeur": doc(saisie() + [
        lire("x"),
        tq("tete <> NIL ET tete^.valeur = x", a("p", "tete"), a("tete", "tete^.suivant"),
           liberer("p")),
        a("p", "tete"),
        tq("p <> NIL ET p^.suivant <> NIL",
           si("p^.suivant^.valeur = x",
              [a("q", "p^.suivant"), a("p^.suivant", "q^.suivant"), liberer("q")],
              [a("p", "p^.suivant")])),
        *AFFICHAGE]),
    "Insertion dans une liste triée": doc([
        a("tete", "NIL"), lire("x"),
        tq("x <> -1",
           allouer("p"), a("p^.valeur", "x"),
           si("tete = NIL OU x < tete^.valeur",
              [a("p^.suivant", "tete"), a("tete", "p")],
              [a("q", "tete"),
               tq("q^.suivant <> NIL ET q^.suivant^.valeur <= x", a("q", "q^.suivant")),
               a("p^.suivant", "q^.suivant"), a("q^.suivant", "p")]),
           lire("x")),
        *AFFICHAGE]),
    "Inversion d'une liste chaînée": doc(
        saisie() + [{"type": "appel", "nom": "Inverser", "arguments": "tete"}, *AFFICHAGE],
        sous_programmes=[{
            "type": "procedure", "nom": "Inverser",
            "parametres": [{"nom": "l", "type": "^Cellule", "mode": "ES"}],
            "variables": [ptr("prec"), ptr("cour"), ptr("suiv")],
            "corps": [a("prec", "NIL"), a("cour", "l"),
                      tq("cour <> NIL", a("suiv", "cour^.suivant"),
                         a("cour^.suivant", "prec"), a("prec", "cour"), a("cour", "suiv")),
                      a("l", "prec")]}]),
    "Fusion de deux listes triées": doc(
        saisie("t1", "queue") + saisie("t2", "queue") + [
            a("tete", "NIL"),
            tq("t1 <> NIL OU t2 <> NIL",
               si("t2 = NIL OU (t1 <> NIL ET t1^.valeur <= t2^.valeur)",
                  [a("p", "t1"), a("t1", "t1^.suivant")],
                  [a("p", "t2"), a("t2", "t2^.suivant")]),
               a("p^.suivant", "NIL"),
               si("tete = NIL", [a("tete", "p")], [a("queue^.suivant", "p")]),
               a("queue", "p")),
            *AFFICHAGE],
        variables=[*VARIABLES, ptr("t1"), ptr("t2")]),
    "Pile implémentée par une liste chaînée": commandes(file=False, vide="pile vide"),
    "File implémentée par une liste chaînée": commandes(file=True, vide="file vide"),
    "Liste doublement chaînée": doc(
        [a("tete", "NIL"), a("queue", "NIL"), lire("x"),
         tq("x <> -1", allouer("p"), a("p^.valeur", "x"), a("p^.suivant", "NIL"),
            a("p^.precedent", "queue"),
            si("tete = NIL", [a("tete", "p")], [a("queue^.suivant", "p")]),
            a("queue", "p"), lire("x")),
         si("tete = NIL", [ecrire('"liste vide", CRLF')]),
         a("p", "tete"), tq("p <> NIL", ecrire("p^.valeur, CRLF"), a("p", "p^.suivant")),
         a("p", "queue"), tq("p <> NIL", ecrire("p^.valeur, CRLF"), a("p", "p^.precedent"))],
        variables=[ptr("tete", "Cellule2"), ptr("queue", "Cellule2"), ptr("p", "Cellule2"),
                   v("x")],
        types=[CELLULE2]),
}

ALGO = [ex for _, ex in exercises_avances() if ex["kind"] == "algo"]


def test_chaque_exercice_avance_a_sa_solution():
    assert {ex["title"] for ex in ALGO} == set(SOLUTIONS_ALGO)


@pytest.mark.parametrize("exercice", ALGO, ids=[ex["title"] for ex in ALGO])
def test_algorithme_avance_resolu_avec_les_blocs_autorises(exercice):
    production = json.dumps(SOLUTIONS_ALGO[exercice["title"]])
    resultat = _corriger(exercice, production)
    assert resultat.score == pytest.approx(exercice["points"], abs=0.05), resultat
