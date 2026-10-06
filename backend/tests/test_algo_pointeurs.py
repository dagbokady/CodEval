"""Pointeurs et listes chaînées en pseudo-code : ALLOUER, LIBERER, NIL, p^.champ."""

from __future__ import annotations

import json
import subprocess
import sys

import pytest

from app.grading.algo import DECLARATIONS, ELEMENTS, AlgoError, transpile

TOUT = list(ELEMENTS) + list(DECLARATIONS)

v = lambda nom, t="entier", **k: {"nom": nom, "type": t, **k}  # noqa: E731
a = lambda c, e: {"type": "affectation", "cible": c, "expression": e}  # noqa: E731
e = lambda x: {"type": "ecrire", "expression": x}  # noqa: E731

NOEUD = {"nom": "Noeud", "champs": [{"nom": "valeur", "type": "ENTIER"},
                                   {"nom": "suivant", "type": "^Noeud"}]}


def run(doc, stdin=""):
    source = transpile(json.dumps(doc), TOUT, saut_de_ligne=False)
    res = subprocess.run([sys.executable, "-c", source], input=stdin,
                         capture_output=True, text=True, timeout=10)
    return res.stdout


def _construire_puis(apres):
    """Lit des entiers jusqu'à -1, les chaîne en fin de liste, puis `apres`."""
    return {
        "types": [NOEUD],
        "variables": [v("tete", "pointeur", cible="Noeud"), v("queue", "pointeur", cible="Noeud"),
                      v("p", "pointeur", cible="Noeud"), v("x")],
        "corps": [
            a("tete", "NIL"),
            {"type": "lire", "cible": "x"},
            {"type": "tantque", "condition": "x <> -1", "corps": [
                {"type": "allouer", "cible": "p"},
                a("p^.valeur", "x"),
                a("p^.suivant", "NIL"),
                {"type": "si", "condition": "tete = NIL", "alors": [a("tete", "p")],
                 "sinon": [a("queue^.suivant", "p")]},
                a("queue", "p"),
                {"type": "lire", "cible": "x"},
            ]},
            *apres,
        ],
    }


AFFICHER = [
    a("p", "tete"),
    {"type": "tantque", "condition": "p <> NIL", "corps": [
        e('p^.valeur, " "'), a("p", "p^.suivant")]},
    e("CRLF"),
]


def test_liste_chainee_construite_et_parcourue():
    assert run(_construire_puis(AFFICHER), "4 8 15 16 -1") == "4 8 15 16 \n"
    assert run(_construire_puis(AFFICHER), "-1") == "\n"


def test_inversion_par_procedure_en_entree_sortie():
    inverser = {"type": "procedure", "nom": "Inverser",
                "parametres": [{"nom": "l", "type": "^Noeud", "mode": "ES"}],
                "variables": [v("prec", "pointeur", cible="Noeud"),
                              v("cour", "pointeur", cible="Noeud"),
                              v("suiv", "pointeur", cible="Noeud")],
                "corps": [a("prec", "NIL"), a("cour", "l"),
                          {"type": "tantque", "condition": "cour <> NIL", "corps": [
                              a("suiv", "cour^.suivant"), a("cour^.suivant", "prec"),
                              a("prec", "cour"), a("cour", "suiv")]},
                          a("l", "prec")]}
    doc = _construire_puis([{"type": "appel", "nom": "Inverser", "arguments": "tete"}, *AFFICHER])
    doc["sousProgrammes"] = [inverser]
    assert run(doc, "1 2 3 -1") == "3 2 1 \n"


def test_deux_pointeurs_designent_la_meme_cellule():
    doc = {"types": [NOEUD],
           "variables": [v("p", "pointeur", cible="Noeud"), v("q", "pointeur", cible="Noeud"),
                         v("n", "nomme", cible="Noeud")],
           "corps": [{"type": "allouer", "cible": "p"}, a("p^.valeur", "1"), a("q", "p"),
                     a("q^.valeur", "2"), e('p^.valeur, " ", p = q')]}
    assert run(doc) == "2 VRAI"
    # Copier la cellule (n ← p^) en fait une valeur indépendante.
    doc["corps"] += [a("n", "p^"), a("n.valeur", "9"), e('" ", p^.valeur')]
    assert run(doc) == "2 VRAI 2"


def test_pointeur_sur_entier_et_liberer():
    doc = {"variables": [v("p", "pointeur", cible="ENTIER")],
           "corps": [{"type": "allouer", "cible": "p"}, {"type": "lire", "cible": "p^"},
                     e("p^ * 2"), {"type": "liberer", "cible": "p"}, e('" ", p = NIL')]}
    assert run(doc, "21") == "42 VRAI"


def test_allouer_exige_un_pointeur_et_l_outil_autorise():
    doc = {"variables": [v("x")], "corps": [{"type": "allouer", "cible": "x"}]}
    with pytest.raises(AlgoError, match="pointeur"):
        transpile(json.dumps(doc), TOUT)
    doc = {"variables": [v("p", "pointeur", cible="ENTIER")],
           "corps": [{"type": "allouer", "cible": "p"}]}
    with pytest.raises(AlgoError, match="autorisé"):
        transpile(json.dumps(doc), ["declaration", "affectation"])
    with pytest.raises(AlgoError):
        transpile(json.dumps({"variables": [v("x")], "corps": [a("x", "x ^ 2")]}), TOUT)
