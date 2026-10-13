"""Sujets publiés dans la communauté : python -m app.seed_community

Trois épreuves de l'ESATIC, saisies dans CodEval comme le montre le guide
enseignant (docs/guide) : le devoir commun d'Initiation algorithmique
(30/11/2024), le devoir surveillé de C avancé (27/02/2024) et l'examen de
2e session de C avancé (mars 2025). Chacune est publiée deux fois : en sujet
complet, à reprendre tel quel, et exercice par exercice, à glisser dans une
autre évaluation. Le contenu (énoncés, corrigés, jeux de tests, barèmes) vient
de `seed_community.json`.

Les publications sont rattachées au premier administrateur et ouvertes à toute
la plateforme. Rejouable : une publication déjà faite sous le même titre est
mise à jour, pas recréée.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

from sqlalchemy import select

from .db import SessionLocal
from .models import CommunityItem, Role, User

DATA = Path(__file__).with_name("seed_community.json")


def publications() -> list[dict]:
    """Chaque sujet, puis chacun de ses exercices, prêts à publier."""
    items = []
    for subject in json.loads(DATA.read_text(encoding="utf-8")):
        common = {
            "language": subject["language"],
            "subject_name": subject["subject_name"],
            "tags": subject["tags"],
        }
        exercises = subject["exercises"]
        items.append({
            **common,
            "item_type": "subject",
            "title": subject["title"],
            "description": subject["description"],
            "content": {"evaluation": subject["evaluation"], "exercises": exercises},
            "exercises_count": len(exercises),
            "total_points": subject["evaluation"]["total_points"],
        })
        for title, exercise in zip(subject["exercise_titles"], exercises):
            # Seul, l'exercice porte un intitulé qui se comprend hors du sujet.
            alone = {**copy.deepcopy(exercise), "title": title}
            items.append({
                **common,
                "item_type": "exercise",
                "title": title,
                "description": f"Extrait de « {subject['title']} ».",
                "content": {"exercise": alone},
                "exercises_count": 1,
                "total_points": exercise["points"],
            })
    return items


def main() -> None:
    db = SessionLocal()
    try:
        admin = db.scalar(select(User).where(User.role == Role.ADMIN).order_by(User.id))
        if admin is None:
            sys.exit("Aucun administrateur : lancez d'abord python -m app.seed")
        existing = {item.title: item for item in db.scalars(
            select(CommunityItem).where(CommunityItem.author_id == admin.id)
        )}
        created = 0
        # Publiées de la dernière à la première : la communauté montre les plus
        # récentes d'abord, chaque sujet avant ses exercices.
        for values in reversed(publications()):
            item = existing.get(values["title"])
            if item is None:
                item = CommunityItem(organization_id=admin.organization_id, author_id=admin.id)
                db.add(item)
                created += 1
            for field, value in values.items():
                setattr(item, field, value)
            item.visibility = "all"
        db.commit()
        print(f"Communauté : {created} publication(s) ajoutée(s)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
