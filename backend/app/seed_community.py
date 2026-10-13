"""Sujets ESATIC publiés dans la communauté : python -m app.seed_community

Trois épreuves complètes, recopiées trait pour trait des sujets papier :

- Devoir commun surveillé, Initiation algorithmique (SRIT1, 30/11/2024) ;
- Devoir surveillé, C avancé (M1 MBDS, 27/02/2024) ;
- Examen 2e session, C avancé (M1 MBDS, BIHAR, SIGL, mars 2025).

Chacune devient un élément « sujet » de la communauté, rattaché au premier
administrateur. Mêmes exercices, même numérotation, même barème et même texte
que le papier : rien n'est ajouté à l'énoncé. Ce que le sujet ne fixe pas (ordre
de saisie, signatures exactes) reste donc à corriger à la main.

Rejouable : un sujet déjà publié sous le même titre est mis à jour, pas recréé.
"""

from __future__ import annotations

import sys

from sqlalchemy import select

from .db import SessionLocal
from .models import CommunityItem, Role, User

# Outils de l'étape « outils autorisés » (voir frontend/src/algoVocabulary.js).
OUTILS_ALGO = ["constante", "declaration", "lire", "ecrire", "affectation", "si", "sinon",
               "sinonsi", "pour", "tantque", "repeter"]


def test(name: str, args: list[str], attendu: str, points: float, *,
         types: list[str] | None = None, argv: list[str] | None = None) -> dict:
    """Un jeu de tests comparé sur les derniers nombres affichés : les invites
    et les phrases de l'apprenant restent libres."""
    return {
        "name": name,
        "kind": "official",
        "stdin": "",
        "expected_stdout": attendu,
        "comparison": "last_numbers",
        "points": points,
        "timeout_ms": 3000,
        "target_id": None,
        "expected_type": "string",
        "input_types": types or ["int"] * len(args),
        "args": args,
        "argv": argv or [],
    }


def exercise(title: str, kind: str, language: str, points: float, *, statement: str = "",
             settings: dict, tests: list[dict] | None = None) -> dict:
    return {
        "title": title,
        "statement": statement,
        "language": language,
        "points": points,
        "starter_code": "",
        "kind": kind,
        "settings": settings,
        "tests": tests or [],
    }


def question(text: str, rows: int = 4, accepted: list[str] | None = None,
             keywords: bool = False, points: float | None = None) -> dict:
    """Une question-réponse ; `points` fixe sa part du barème quand le sujet la donne."""
    q = {"text": text, "rows": rows, "accepted": accepted or [], "keywords_mode": keywords}
    if points:
        q["points"] = points
    return q


def qcm(text: str, choices: list[str], correct: int) -> dict:
    return {
        "text": text,
        "multiple": False,
        "choices": [{"text": c, "correct": i == correct} for i, c in enumerate(choices)],
    }


# ----- Devoir commun, Initiation algorithmique (30/11/2024) -----
ALGO_CALCUL_DE_MOYENNE = """\
ALGORITHME CalculDeMoyenne
|/*Cet algorithme calcule la moyenne de N notes. Ici N = 3*/
|     CONSTANTES
|     |     N = 3
|     VARIABLES
|     |     Note : REEL
|     |     SommeDeNotes : REEL
|     |     MoyenneDesNotes : REEL
|     |     NombreDeNotesSaisies : ENTIER
DEBUT
|1    SommeDesNotes ← 0
|2    NombreDeNotesSaisies ← 0
|3    TANTQUE (NombreDeNotesSaisies < N) FAIRE
|4    |     ECRIRE ("Note Numéro : ", NombreDeNotesSaisies +1)
|5    |     LIRE (Note)
|6    |     SommeDesNotes ← SommeDesNotes + Note
|7    |     NombreDeNotesSaisies ← NombreDeNotesSaisies + 1
|8    FINTANTQUE
|9    MoyenneDesNotes ← SommeDesNotes / N
|10   ECRIRE ("Moyenne des ", N, "note(s) : ", MoyenneDesNotes)
FIN"""

# Une ligne par instruction exécutée : N°, Note, SommeDesNotes,
# NombreDeNotesSaisies, MoyenneDesNotes, condition du TANTQUE, écran.
SIMULATION = [
    ["1", "", "0", "", "", "", ""],
    ["2", "", "", "0", "", "", ""],
    *[
        ligne
        for tour, (note, somme) in enumerate([(10, 10), (11, 21), (12, 33)], start=1)
        for ligne in (
            ["3", "", "", "", "", "VRAI", ""],
            ["4", "", "", "", "", "", f"Note Numéro : {tour}"],
            ["5", str(note), "", "", "", "", ""],
            ["6", "", str(somme), "", "", "", ""],
            ["7", "", "", str(tour), "", "", ""],
        )
    ],
    ["3", "", "", "", "", "FAUX", ""],
    ["9", "", "", "", "11", "", ""],
    ["10", "", "", "", "", "", "Moyenne des 3note(s) : 11 | Moyenne des 3 note(s) : 11"],
]


def devoir_algo() -> dict:
    return {
        "title": "Devoir commun surveillé — Initiation algorithmique (30/11/2024)",
        "description": "ESATIC, SRIT1 A, B, C, D. Simulation d'algorithme et trois "
                       "algorithmes à écrire, 2h00.",
        "subject_name": "Initiation algorithmique",
        "language": "algo",
        "tags": ["ESATIC", "SRIT1", "Devoir", "2024-2025", "algorithmique"],
        "evaluation": {
            "kind": "devoir",
            "description": "",
            "instructions": "Semestre 1 / Devoir commun surveillé\n"
                            "Année académique : 2024-2025\n"
                            "Parcours : SRIT1 A, B, C, D\n"
                            "ECUE : INITIATION ALGORITHMIQUE\n"
                            "Durée : 2h00",
            "language": "algo",
            "duration_minutes": 120,
            "total_points": 20.0,
            "rules": {},
        },
        "exercises": [
            exercise(
                "Simulation de l’algorithme CalculDeMoyenne", "trace", "algo", 5.0,
                statement="Faire la simulation de l’algorithme ci-dessous pour laquelle "
                          "l’utilisateur a saisi 10, 11 et 12.",
                settings={
                    "algorithm": ALGO_CALCUL_DE_MOYENNE,
                    "columns": [
                        {"title": "N°", "given": True},
                        {"title": "Note", "given": False},
                        {"title": "SommeDesNotes", "given": False},
                        {"title": "NombreDeNotesSaisies", "given": False},
                        {"title": "MoyenneDesNotes", "given": False},
                        {"title": "Condition (l. 3)", "given": False},
                        {"title": "Écran", "given": False},
                    ],
                    "rows": SIMULATION,
                    "solution_notes": "Trois tours de boucle : SommeDesNotes vaut 10, 21 "
                                      "puis 33 ; au 4e test, 3 < 3 est faux et l'on sort. "
                                      "MoyenneDesNotes = 33 / 3 = 11.",
                },
            ),
            exercise(
                "Les dix nombres suivants", "algo", "algo", 5.0,
                statement="Ecrire un algorithme qui demande un nombre de départ à "
                          "l’utilisateur, et qui ensuite affiche les dix nombres suivants. "
                          "Par exemple, si l'utilisateur entre le nombre 17, le programme "
                          "affichera les nombres de 18 à 27.",
                settings={"allowed_elements": OUTILS_ALGO, "ecriture_cours": True},
                tests=[
                    test("Départ 17", ["17"], " ".join(str(n) for n in range(18, 28)), 1.0),
                    test("Départ négatif", ["-3"], " ".join(str(n) for n in range(-2, 8)),
                         1.0),
                    test("Départ 0", ["0"], " ".join(str(n) for n in range(1, 11)), 1.0),
                ],
            ),
            # Le sujet ne fixe pas l'ordre de saisie (jour, âge, étudiant) : pas de
            # jeu de tests, la copie se corrige à la main.
            exercise(
                "Tarif plein ou réduit", "algo", "algo", 4.0,
                statement="Il y a deux tarifs : plein (7 FCFA) et réduit (4,50 FCFA). Le "
                          "tarif réduit s’applique :\n"
                          "• à tout le monde le mercredi,\n"
                          "• aux étudiants quel que soit leur âge et quel que soit le jour,\n"
                          "• aux moins de 18 ans et plus de 65 ans SAUF les samedi et "
                          "dimanche.\n"
                          "Ecrire un Algorithme qui recueille les données nécessaires et "
                          "annonce le prix à payer pour la place.",
                settings={
                    "allowed_elements": OUTILS_ALGO,
                    "ecriture_cours": True,
                    "solution_notes": "LIRE(jour), LIRE(age), LIRE(etudiant)\n"
                                      "SI jour = \"mercredi\" OU etudiant = \"OUI\" OU "
                                      "((age < 18 OU age > 65) ET jour <> \"samedi\" ET "
                                      "jour <> \"dimanche\") ALORS prix ← 4.5\n"
                                      "SINON prix ← 7\nECRIRE(\"Prix à payer : \", prix)",
                },
            ),
            exercise(
                "Le plus grand nombre et sa position", "algo", "algo", 6.0,
                statement="Ecrire un algorithme qui :\n"
                          "1- demande successivement plusieurs nombres à l’utilisateur, et "
                          "qui lui dise ensuite quel était le plus grand parmi ces nombres ;\n"
                          "2- affiche ensuite la position à laquelle avait été saisie ce plus "
                          "grand nombre\n"
                          "NB : On ne connaît pas d’avance combien l’utilisateur souhaite "
                          "saisir de nombres. La saisie des nombres s’arrête lorsque "
                          "l’utilisateur entre un zéro.\n"
                          "Exemple d’exécution :\n"
                          "Entrez le nombre numéro 1 : 12\n"
                          "Entrez le nombre numéro 2 : 5\n"
                          "Entrez le nombre numéro 3 : 15\n"
                          "Entrez le nombre numéro 4 : 10\n"
                          "Le plus grand de ces nombres est : 15\n"
                          "C’était le nombre numéro 3",
                settings={"allowed_elements": OUTILS_ALGO, "ecriture_cours": True},
                tests=[
                    test("Exemple du sujet", ["12", "5", "15", "10", "0"], "15 3", 1.0),
                    test("Le plus grand en premier", ["3", "1", "2", "0"], "3 1", 1.0),
                    test("Que des négatifs", ["-5", "-2", "-9", "0"], "-2 2", 1.0),
                ],
            ),
        ],
    }


# ----- Devoir surveillé, C avancé (27/02/2024) -----
def devoir_c() -> dict:
    return {
        "title": "Devoir surveillé — C avancé (27/02/2024)",
        "description": "ESATIC, M1 MBDS. Questions de cours et approche modulaire d'une "
                       "gestion de stock, 2h00.",
        "subject_name": "C avancé",
        "language": "c",
        "tags": ["ESATIC", "M1 MBDS", "Devoir", "2023-2024", "C avancé"],
        "evaluation": {
            "kind": "devoir",
            "description": "",
            "instructions": "Devoir surveillé\n"
                            "Année académique : 2023-2024\n"
                            "Parcours : M1 MBDS\n"
                            "ECUE : C avancé\n"
                            "Durée : 2h00\n\n"
                            "Important à lire :\n"
                            "- Les copies conformes seront automatiquement sanctionnées "
                            "d’une note de 0/20.\n"
                            "- Tout documents est formellement interdit\n"
                            "- Tout appareil électronique doit être éteint (Téléphone, "
                            "Ordinateur, Tablette, etc.).\n"
                            "- 1 pt pour la propriété de la copie\n\n"
                            "Bon courage !",
            "language": "c",
            "duration_minutes": 120,
            "total_points": 20.0,
            "rules": {},
        },
        "exercises": [
            exercise(
                "Question de cours", "short", "c", 10.0,
                settings={
                    "questions": [
                        question("Donner la définition d’une bibliothèque dynamique.",
                                 accepted=["exécution", "partagée"], keywords=True),
                        question("Donner la différence entre :\n"
                                 "a. Une bibliothèque et une librairie\n"
                                 "b. Une bibliothèque statistique et une bibliothèque "
                                 "dynamique", rows=8),
                        question("Dans un projet C à quoi servent les fichiers entête "
                                 "(extension .h)"),
                        question("Pourquoi utiliser les directives au préprocesseur"),
                        question("Citer 3 directives au préprocesseur et les définir",
                                 rows=6),
                    ],
                    "solution_notes": "1. Code compilé chargé à l'exécution et partagé entre "
                                      "programmes (.so, .dll).\n"
                                      "2.a « Librairie » est un faux ami de library : le "
                                      "terme juste est bibliothèque.\n"
                                      "2.b Statique : copiée dans l'exécutable à l'édition "
                                      "de liens. Dynamique : chargée à l'exécution, "
                                      "partagée, mise à jour sans recompiler.\n"
                                      "3. Les .h déclarent l'interface d'un module "
                                      "(prototypes, types, constantes).\n"
                                      "4. Transformer le source avant compilation : "
                                      "inclusions, macros, compilation conditionnelle, "
                                      "gardes d'inclusion.\n"
                                      "5. #include, #define, #ifndef/#endif…",
                },
            ),
            exercise(
                "programmation C", "short", "c", 10.0,
                settings={
                    "questions": [
                        question("Proposer une approche pour réaliser une application de "
                                 "gestion d’un stock. Votre approche devra être modulaire.",
                                 rows=12),
                    ],
                    "solution_notes": "Découpage attendu : un module produit (produit.h : la "
                                      "structure Produit), un module stock (stock.h : "
                                      "prototypes ; stock.c : ajout, retrait, recherche, "
                                      "valeur du stock), un main.c qui pilote le menu ; "
                                      "gardes d'inclusion dans chaque .h ; compilation "
                                      "séparée puis édition de liens.",
                },
            ),
        ],
    }


# ----- Examen 2e session, C avancé (mars 2025) -----
ENONCE_EXAMEN = """\
On se propose d’écrire un programme en C permettant de calculer la moyenne des notes d’une classe de 40 étudiants et d’afficher le nom et la note des 40 étudiants ainsi que la moyenne de la classe.

• Les structures des données se présentent comme suites :
    o Etudiant (matricule, nom, note) ;
    o Note (date, note)
• Les fonctions et procédures utilisées sont :
    o Procédure : AjouterNote (ValeurNote, &UnEtudiant)
    o Fonction : MoyenneNotes(&TabEtudiants) retourne un réel
    o Procédure : AfficherTout (&TabEtudiants)

Pour une organisation modulaire du code, on se propose de créer les 5 fichiers suivants :

Etudiant.h ; Note.h ; Fonctions.h ; Fonctions.c ; main.c

NB : (Quelques bout de code pour vous aider si et seulement si vous en avez besoin (pas obligatoires ) ).
• (type*)malloc(count*sizeof(type)) ;
• #include <stdio.h> ;
• #include <stdlib.h> ;
• #ifndef __ ;
• #define __ ;
• #endif ;

1) Donne le contenu des fichiers Etudiant.h ; Note.h, Fonctions.h, (02 pts par fonction)
2) Donne le contenu du fichier Fonctions.c (02 pts)"""

SOLUTION_FICHIERS = """\
/* ===== Note.h ===== */
#ifndef NOTE_H
#define NOTE_H

typedef struct Note {
    char date[11];
    float note;
} Note;

#endif

/* ===== Etudiant.h ===== */
#ifndef ETUDIANT_H
#define ETUDIANT_H

#include "Note.h"

typedef struct Etudiant {
    char matricule[16];
    char nom[40];
    Note note;
} Etudiant;

#endif

/* ===== Fonctions.h ===== */
#ifndef FONCTIONS_H
#define FONCTIONS_H

#include "Etudiant.h"

extern int NbEtudiants;

void AjouterNote(float ValeurNote, Etudiant *UnEtudiant);
float MoyenneNotes(Etudiant *TabEtudiants);
void AfficherTout(Etudiant *TabEtudiants);

#endif

/* ===== Fonctions.c ===== */
#include <stdio.h>
#include "Fonctions.h"

int NbEtudiants = 40;

void AjouterNote(float ValeurNote, Etudiant *UnEtudiant)
{
    UnEtudiant->note.note = ValeurNote;
}

float MoyenneNotes(Etudiant *TabEtudiants)
{
    float somme = 0;
    for (int i = 0; i < NbEtudiants; i++) somme += TabEtudiants[i].note.note;
    return NbEtudiants > 0 ? somme / NbEtudiants : 0;
}

void AfficherTout(Etudiant *TabEtudiants)
{
    for (int i = 0; i < NbEtudiants; i++)
        printf("%s : %.2f\\n", TabEtudiants[i].nom, TabEtudiants[i].note.note);
    printf("Moyenne de la classe : %.2f\\n", MoyenneNotes(TabEtudiants));
}"""

SOLUTION_MAIN = """\
1) main.c
#include <stdio.h>
#include <stdlib.h>
#include "Fonctions.h"

int main(int argc, char *argv[])
{
    if (argc < 2) return 1;
    NbEtudiants = atoi(argv[1]);
    Etudiant *TabEtudiants = (Etudiant *)malloc(NbEtudiants * sizeof(Etudiant));
    if (TabEtudiants == NULL) return 1;

    for (int i = 0; i < NbEtudiants; i++) {
        float valeur;
        scanf("%15s %39s %f", TabEtudiants[i].matricule, TabEtudiants[i].nom, &valeur);
        AjouterNote(valeur, &TabEtudiants[i]);
    }
    AfficherTout(TabEtudiants);
    free(TabEtudiants);
    return 0;
}

2) Commandes
gcc -c Fonctions.c
gcc -c main.c
gcc Fonctions.o main.o -o ProgrammeMoyenne.exe"""


def _etudiant_ptr(name: str) -> dict:
    return {"name": name, "type": "custom", "ctype": "Etudiant *"}


def examen_c() -> dict:
    return {
        "title": "Examen 2e session — C avancé (mars 2025)",
        "description": "ESATIC, M1 MBDS, BIHAR, SIGL. Programme C modulaire en 5 fichiers, "
                       "commandes de compilation et QCM, 2h00.",
        "subject_name": "C avancé",
        "language": "c",
        "tags": ["ESATIC", "M1 MBDS", "BIHAR", "SIGL", "Examen", "2024-2025", "C avancé"],
        "evaluation": {
            "kind": "examen",
            "description": "",
            "instructions": "Examen 2ième session\n"
                            "Année académique : 2024-2025\n"
                            "Parcours : M1 MBDS, BIHAR, SIGL\n"
                            "ECUE : C avancé\n"
                            "Durée : 2h00",
            "language": "c",
            "duration_minutes": 120,
            "total_points": 20.0,
            "rules": {},
        },
        "exercises": [
            # Corrigé sur les déclarations (structures et prototypes) ; le corps des
            # fonctions de Fonctions.c se relit à la main.
            exercise(
                "Etudiant.h ; Note.h ; Fonctions.h ; Fonctions.c", "code", "c", 8.0,
                statement=ENONCE_EXAMEN,
                settings={
                    "files": [{"name": f, "starter": ""} for f in (
                        "Etudiant.h", "Note.h", "Fonctions.h", "Fonctions.c")],
                    "criteria": [
                        {"id": "note", "kind": "struct", "name": "Note", "points": 2,
                         "fields": [{"name": "note", "type": "float"}]},
                        {"id": "etudiant", "kind": "struct", "name": "Etudiant", "points": 2,
                         "fields": [{"name": "note", "type": "custom", "ctype": "Note"}]},
                        {"id": "ajouter", "kind": "function", "name": "AjouterNote",
                         "returns": "void", "points": 1.34,
                         "params": [{"name": "ValeurNote", "type": "float"},
                                    _etudiant_ptr("UnEtudiant")]},
                        {"id": "moyenne", "kind": "function", "name": "MoyenneNotes",
                         "returns": "float", "points": 1.33,
                         "params": [_etudiant_ptr("TabEtudiants")]},
                        {"id": "afficher", "kind": "function", "name": "AfficherTout",
                         "returns": "void", "points": 1.33,
                         "params": [_etudiant_ptr("TabEtudiants")]},
                    ],
                    "solution": SOLUTION_FICHIERS,
                },
            ),
            exercise(
                "main.c et commandes de compilation", "short", "c", 7.0,
                statement="Soit la commande suivante permettant de lancer le programme "
                          "final obtenu après les différentes phases de compilations :\n\n"
                          "c :> ProgrammeMoyenne.exe 40",
                settings={
                    "questions": [
                        question("Donne le contenu du fichier main.c (04 pts)", rows=20,
                                 points=4),
                        question("Donne la suite des commandes ayant permis d’obtenir le "
                                 "fichier ProgrammeMoyenne.exe (03 pts)", rows=5,
                                 accepted=["Fonctions.c", "main.c", "Fonctions.o",
                                           "-o ProgrammeMoyenne.exe"],
                                 keywords=True, points=3),
                    ],
                    "solution_notes": SOLUTION_MAIN,
                },
            ),
            exercise(
                "QCM", "qcm", "c", 5.0,
                settings={"questions": [
                    qcm("Quelle est la principale fonction d’une directive de "
                        "préprocesseur en C ?", [
                            "Modifier le code source avant la compilation.",
                            "Améliorer les performances du programme.",
                            "Ajouter de nouvelles fonctionnalités au langage C.",
                            "Remplacer automatiquement les erreurs de syntaxe.",
                        ], 0),
                    qcm("Lors de la compilation d’un programme en C, quelle est l’étape "
                        "effectuée en premier ?", [
                            "L’édition de liens (linking).",
                            "L’assemblage (assembly).",
                            "Le prétraitement (preprocessing).",
                            "L’exécution du programme.",
                        ], 2),
                    qcm("Quelle affirmation est correcte concernant les bibliothèques "
                        "dynamiques ?", [
                            "Elles sont incluses directement dans l’exécutable du programme.",
                            "Elles permettent de réduire la taille des exécutables en "
                            "partageant du code.",
                            "Elles ne peuvent pas être mises à jour sans recompiler "
                            "l’application.",
                            "Elles sont chargées uniquement lors de la compilation.",
                        ], 1),
                    qcm("Quelle est la principale différence entre une bibliothèque "
                        "statique et une bibliothèque dynamique ?", [
                            "Une bibliothèque statique est chargée à l’exécution tandis "
                            "qu’une bibliothèque dynamique est incluse à la compilation.",
                            "Une bibliothèque dynamique est plus rapide qu’une bibliothèque "
                            "statique.",
                            "Une bibliothèque statique est intégrée directement dans "
                            "l’exécutable, tandis qu’une bibliothèque dynamique est chargée "
                            "à l’exécution.",
                            "Les bibliothèques statiques ne peuvent pas être utilisées en C.",
                        ], 2),
                    # Trois propositions, comme sur le papier : la b) y réunit deux phrases.
                    qcm("Quelle est la conséquence d’un mauvais lien vers une bibliothèque "
                        "dynamique ?", [
                            "Le programme ne pourra pas être compilé.",
                            "Le programme risque de planter ou de ne pas s’exécuter "
                            "correctement.  Le programme fonctionnera mais avec des "
                            "performances réduites.",
                            "Il n’y aura aucun effet, car les bibliothèques sont "
                            "automatiquement gérées.",
                        ], 1),
                ]},
            ),
        ],
    }


def subjects() -> list[dict]:
    return [devoir_algo(), devoir_c(), examen_c()]


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
        for subject in subjects():
            values = {
                "item_type": "subject",
                "description": subject["description"],
                "language": subject["language"],
                "subject_name": subject["subject_name"],
                "tags": subject["tags"],
                "content": {"evaluation": subject["evaluation"],
                            "exercises": subject["exercises"]},
                "exercises_count": len(subject["exercises"]),
                "total_points": sum(e["points"] for e in subject["exercises"]),
            }
            item = existing.get(subject["title"])
            if item is None:
                item = CommunityItem(organization_id=admin.organization_id,
                                     author_id=admin.id, title=subject["title"])
                db.add(item)
                created += 1
            for field, value in values.items():
                setattr(item, field, value)
        db.commit()
        print(f"Communauté : {created} sujet(s) ajouté(s)")
    finally:
        db.close()


if __name__ == "__main__":
    main()
