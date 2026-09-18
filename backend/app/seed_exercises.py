"""Deux exercices de TD prêts à l'emploi : python -m app.seed_exercises

`seed.py` laisse volontairement la banque vide. Ce script y ajoute les exercices
10 et 11 du TD de langage C (la calculatrice et le premier contact avec les
pointeurs) pour qu'une banque fraîchement installée ait de quoi montrer un
barème complet : des tests sur le programme entier d'un côté, une déclaration
contrôlée de l'autre.

Il est rejouable : un exercice déjà présent sous le même titre n'est pas
recréé.
"""

from __future__ import annotations

from sqlalchemy import select

from .db import SessionLocal, init_db
from .models import BankExercise, BankTestCase, Role, Subject, TestKind, User

CALCULATRICE = {
    "title": "Calculatrice en boucle",
    "points": 6.0,
    "tags": ["boucles", "entrées-sorties", "TD"],
    "statement": (
        "Écrire un programme se comportant comme une calculatrice, c'est-à-dire "
        "exécutant la boucle suivante :\n"
        "1. lecture d'une ligne supposée contenir un entier, un opérateur et un entier "
        "(ex : 1 + 3). Les opérateurs sont +, -, *, \\ et % ;\n"
        "2. calcul de la valeur de l'expression ;\n"
        "3. impression du résultat à l'écran.\n\n"
        "La boucle s'arrête à la fin de l'entrée. Le programme n'affiche que le "
        "résultat, un par ligne, sans autre texte. L'opérateur \\ note la division "
        "entière et % le reste."
    ),
    "starter_code": (
        "#include <stdio.h>\n\n"
        "int main(void)\n"
        "{\n"
        "    int a, b;\n"
        "    char op;\n\n"
        "    /* Lire tant qu'il reste une ligne à lire, puis afficher le résultat. */\n\n"
        "    return 0;\n"
        "}\n"
    ),
    "criteria": [],
    "tests": [
        ("Addition", "1 + 3", "4"),
        ("Soustraction", "10 - 4", "6"),
        ("Multiplication", "6 * 7", "42"),
        ("Division entière", "9 \\ 2", "4"),
        ("Reste de la division", "9 % 2", "1"),
        ("Plusieurs lignes de suite", "2 + 2\n5 * 5\n7 \\ 2", "4\n25\n3"),
    ],
}

POINTEURS = {
    "title": "Premier pointeur sur un entier",
    "points": 4.0,
    "tags": ["pointeurs", "TD"],
    "statement": (
        "Écrire un programme dans lequel vous :\n"
        "1. déclarerez un entier i et un pointeur vers un entier, p ;\n"
        "2. initialiserez i à 5 et ferez pointer p sur i ;\n"
        "3. imprimerez la valeur de i ;\n"
        "4. modifierez l'entier pointé par p pour qu'il vaille 42 : en utilisant p, "
        "et non pas i ;\n"
        "5. imprimerez la valeur de i une dernière fois.\n\n"
        "Le programme affiche donc deux lignes : 5, puis 42."
    ),
    "starter_code": (
        "#include <stdio.h>\n\n"
        "int main(void)\n"
        "{\n"
        "    int i;\n"
        "    int *p;\n\n"
        "    /* 1. i vaut 5, p pointe sur i.\n"
        "       2. Afficher i, le modifier à travers p, puis l'afficher à nouveau. */\n\n"
        "    return 0;\n"
        "}\n"
    ),
    # La déclaration exigée : l'entier i, local à main. Le pointeur, lui, se
    # vérifie par le résultat : c'est tout l'objet de l'exercice.
    "criteria": [
        {
            "id": "c1",
            "kind": "variable",
            "name": "i",
            "vtype": "int",
            "scope": "local",
            "in_function": "main",
            "points": 1.0,
        }
    ],
    "tests": [("Avant puis après modification", "", "5\n42")],
}


def _exercice(db, org_id: int, author_id: int, subject_id: int | None, spec: dict) -> bool:
    déjà = db.scalar(
        select(BankExercise).where(
            BankExercise.organization_id == org_id, BankExercise.title == spec["title"]
        )
    )
    if déjà:
        return False

    officiels = len(spec["tests"])
    part = round(
        (spec["points"] - sum(c["points"] for c in spec["criteria"])) / max(officiels, 1), 2
    )
    exercise = BankExercise(
        organization_id=org_id,
        author_id=author_id,
        subject_id=subject_id,
        title=spec["title"],
        statement=spec["statement"],
        language="c",
        points=spec["points"],
        starter_code=spec["starter_code"],
        kind="code",
        settings={"criteria": spec["criteria"]},
        tags=spec["tags"],
        is_shared=True,
    )
    db.add(exercise)
    db.flush()

    for position, (name, entrée, attendu) in enumerate(spec["tests"], start=1):
        db.add(
            BankTestCase(
                bank_exercise_id=exercise.id,
                position=position,
                name=name,
                kind=TestKind.OFFICIAL,
                # Le sujet donne l'expression telle quelle : une ligne de texte,
                # pas des valeurs typées à recomposer.
                input_types=["string"] if entrée else [],
                args=[entrée] if entrée else [],
                expected_type="string",
                expected_stdout=attendu,
                comparison="trim",
                points=part,
            )
        )
    return True


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        teacher = db.scalar(select(User).where(User.role == Role.TEACHER).order_by(User.id))
        if teacher is None:
            print("Aucun enseignant en base : lancez d'abord python -m app.seed")
            return
        # Ces deux exercices sont du TD de langage C : ils vont dans cette
        # matière-là, et non dans la première venue du catalogue.
        subject = db.scalar(
            select(Subject).where(
                Subject.organization_id == teacher.organization_id,
                Subject.name == "Langage C",
            )
        ) or db.scalar(
            select(Subject)
            .where(Subject.organization_id == teacher.organization_id)
            .order_by(Subject.id)
        )

        ajoutés = [
            spec["title"]
            for spec in (CALCULATRICE, POINTEURS)
            if _exercice(
                db, teacher.organization_id, teacher.id, subject.id if subject else None, spec
            )
        ]
        db.commit()

        if ajoutés:
            print(f"Ajouté à la banque de {teacher.full_name} :")
            for titre in ajoutés:
                print(f"  · {titre}")
        else:
            print("Les deux exercices sont déjà dans la banque.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
