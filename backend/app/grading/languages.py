from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Language:
    key: str
    label: str
    filename: str
    compile_cmd: list[str] | None
    run_cmd: list[str]
    editor_mode: str
    # Squelette proposé à l'apprenant lorsque l'enseignant n'a pas fourni de code
    # de départ : un programme vide mais compilable, pour que personne ne perde du
    # temps d'épreuve à retaper l'ossature du langage.
    starter_code: str = ""


C_STARTER = """#include <stdio.h>

int main(void)
{
    /* Écrivez votre programme ici */

    return 0;
}
"""

CPP_STARTER = """#include <iostream>

int main()
{
    // Écrivez votre programme ici

    return 0;
}
"""

PYTHON_STARTER = """def main():
    # Écrivez votre programme ici
    pass


if __name__ == "__main__":
    main()
"""


LANGUAGES: dict[str, Language] = {
    "c": Language(
        key="c",
        label="C (gcc)",
        filename="main.c",
        compile_cmd=["gcc", "-O1", "-std=c11", "-o", "program", "main.c", "-lm"],
        run_cmd=["./program"],
        editor_mode="c",
        starter_code=C_STARTER,
    ),
    "cpp": Language(
        key="cpp",
        label="C++ (g++)",
        filename="main.cpp",
        compile_cmd=["g++", "-O1", "-std=c++17", "-o", "program", "main.cpp"],
        run_cmd=["./program"],
        editor_mode="cpp",
        starter_code=CPP_STARTER,
    ),
    "python": Language(
        key="python",
        label="Python 3",
        filename="main.py",
        compile_cmd=None,
        run_cmd=["python3", "main.py"],
        editor_mode="python",
        starter_code=PYTHON_STARTER,
    ),
}

DEFAULT_LANGUAGE = "c"

# Langages proposés à l'enseignante. La plateforme ne sert aujourd'hui qu'un
# cours de langage C : les autres définitions restent en place, prêtes à être
# rouvertes en ajoutant leur clé ici.
ENABLED_LANGUAGES = ("c",)


def enabled_languages() -> list[Language]:
    return [LANGUAGES[key] for key in ENABLED_LANGUAGES if key in LANGUAGES]


def get_language(key: str) -> Language:
    return LANGUAGES.get(key, LANGUAGES[DEFAULT_LANGUAGE])


def default_starter(language: str, kind: str = "code") -> str:
    """Squelette du langage, uniquement pour les exercices de programmation."""
    if kind != "code":
        return ""
    return get_language(language).starter_code
