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

# Ce que l'administration ouvre ou ferme pour toute la plateforme : les langages
# de programmation, plus l'algorithmique, qui se compose en blocs de pseudo-code
# et n'a pas de compilateur.
ALGO = "algo"
DISCIPLINES: dict[str, str] = {
    "c": "Langage C",
    "cpp": "C++",
    "python": "Python",
    ALGO: "Algorithmique",
}
# Ouverts tant que l'administration n'a rien réglé.
DEFAULT_ENABLED = ("c", ALGO)
_SETTING_KEY = "enabled_languages"


def enabled_keys(db) -> list[str]:
    from ..models import PlatformSetting

    setting = db.get(PlatformSetting, _SETTING_KEY)
    keys = setting.value if setting is not None and isinstance(setting.value, list) else DEFAULT_ENABLED
    return [key for key in DISCIPLINES if key in keys]


def set_enabled(db, key: str, enabled: bool) -> list[str]:
    from ..models import PlatformSetting

    keys = set(enabled_keys(db))
    if enabled:
        keys.add(key)
    else:
        keys.discard(key)
    ordered = [k for k in DISCIPLINES if k in keys]
    setting = db.get(PlatformSetting, _SETTING_KEY)
    if setting is None:
        db.add(PlatformSetting(key=_SETTING_KEY, value=ordered))
    else:
        setting.value = ordered
    return ordered


def enabled_languages(db) -> list[Language]:
    """Langages de programmation ouverts, sans l'algorithmique."""
    return [LANGUAGES[key] for key in enabled_keys(db) if key in LANGUAGES]


def get_language(key: str) -> Language:
    return LANGUAGES.get(key, LANGUAGES[DEFAULT_LANGUAGE])


def default_starter(language: str, kind: str = "code") -> str:
    """Squelette du langage, uniquement pour les exercices de programmation."""
    if kind != "code":
        return ""
    return get_language(language).starter_code
