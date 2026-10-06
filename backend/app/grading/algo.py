"""Traduction d'un algorithme en blocs vers du Python exécutable.

L'algorithme a toujours la forme du cours : un nom, une partie déclarative
(constantes, types, variables), un corps encadré par DEBUT et FIN, puis, après
FIN, les sous-programmes (fonctions et procédures). Ce squelette est posé par
l'éditeur ; l'apprenant le remplit avec le seul vocabulaire autorisé par
l'enseignant. Plutôt que d'écrire un interpréteur de pseudo-code, on traduit le
document en Python : la production passe ensuite par le même bac à sable et les
mêmes jeux de tests que n'importe quel autre langage.

La notation est celle du polycopié d'Initiation à l'algorithmique :
`<>` pour « différent », `=` pour l'égalité, ET / OU / NON, DIV / MOD, la
virgule décimale (`4,5`), ECRIRE qui ne passe pas à la ligne et la constante
CRLF qui y passe, la concaténation de chaînes avec `+`, les tableaux indicés à
partir de 1 (à une ou deux dimensions), les enregistrements, les procédures à
paramètres d'entrée (E), de sortie (S) et d'entrée-sortie (E/S), les
pointeurs (`p : ^Noeud`, ALLOUER(p), LIBERER(p), `p^.suivant`, NIL) qui
permettent les listes chaînées.
"""

from __future__ import annotations

import json
import keyword
import re
import unicodedata

PRELUDE = '''import copy
import sys

_donnees = sys.stdin.read().split()
_curseur = 0
_SAUT = {saut}
CRLF = "\\n"


def _texte(valeur):
    if isinstance(valeur, bool):
        return "VRAI" if valeur else "FAUX"
    if isinstance(valeur, float):
        if valeur.is_integer() and abs(valeur) < 1e15:
            return str(int(valeur))
        return format(valeur, ".10g")
    return str(valeur)


class Chaine(str):
    """Une chaîne du cours : `+` la concatène à n'importe quelle valeur."""

    def __add__(self, autre):
        return Chaine(str.__add__(self, _texte(autre)))

    def __radd__(self, autre):
        return Chaine(_texte(autre) + str(self))


class _Enreg:
    """Une variable de type enregistrement (STRUCTURE … FINSTRUCTURE)."""


class _Pointeur:
    """L'adresse d'une zone créée par ALLOUER. `p^` se traduit `p.cible`.

    Copier un pointeur ne copie pas la zone pointée : deux pointeurs peuvent
    désigner la même cellule, c'est tout l'intérêt d'une liste chaînée. Deux
    pointeurs sont égaux s'ils désignent la même zone.
    """

    __slots__ = ("cible",)

    def __init__(self, cible):
        self.cible = cible

    def __deepcopy__(self, memo):
        return self


def _copie(valeur):
    # Affecter ou passer en entrée un tableau, un enregistrement, en fait une copie :
    # en algorithmique, ce sont des valeurs, pas des références.
    if isinstance(valeur, (list, _Enreg)):
        return copy.deepcopy(valeur)
    return valeur


def LIRE(genre="auto"):
    global _curseur
    if _curseur >= len(_donnees):
        brut = None
    else:
        brut = _donnees[_curseur]
        _curseur += 1
    if genre == "entier":
        if brut is None:
            return 0
        try:
            return int(brut)
        except ValueError:
            try:
                return int(float(brut.replace(",", ".")))
            except ValueError:
                return 0
    if genre == "reel":
        try:
            return float(brut.replace(",", ".")) if brut is not None else 0.0
        except ValueError:
            return 0.0
    if genre in ("chaine", "caractere"):
        return Chaine(brut or "")
    if genre == "booleen":
        return (brut or "").upper() in ("VRAI", "V", "OUI", "O", "1", "TRUE")
    if brut is None:
        return 0
    try:
        return int(brut)
    except ValueError:
        try:
            return float(brut.replace(",", "."))
        except ValueError:
            return Chaine(brut)


def ECRIRE(*valeurs):
    # ECRIRE("note numéro ", i) : les morceaux se suivent tels qu'écrits. Au cours,
    # ECRIRE reste sur la ligne ; c'est CRLF qui fait passer à la suivante.
    sys.stdout.write("".join(_texte(v) for v in valeurs) + ("\\n" if _SAUT else ""))


def TABLEAU(taille, valeur=0):
    return [valeur] * int(taille)
'''

# Éléments de la partie déclarative. Ils portent le même nom que dans
# `frontend/src/algoVocabulary.js` : l'enseignant les autorise comme les autres.
DECLARATIONS = {
    "constante": ("Déclaration", "Constante"),
    "type": ("Déclaration", "Type"),
    "declaration": ("Déclaration", "Variable"),
}

# Vocabulaire du corps, groupé comme dans la palette.
ELEMENTS = {
    "lire": ("Entrées / sorties", "LIRE(…)"),
    "ecrire": ("Entrées / sorties", "ECRIRE(…)"),
    "affectation": ("Affectation", "variable ← expression"),
    "si": ("Conditions", "SI … ALORS … FINSI"),
    "sinon": ("Conditions", "SINON"),
    "sinonsi": ("Conditions", "SINONSI … ALORS"),
    "selon": ("Conditions", "SELON … DANS … FINSELON"),
    "pour": ("Boucles", "POUR … FINPOUR"),
    "tantque": ("Boucles", "TANTQUE … FINTANTQUE"),
    "repeter": ("Boucles", "REPETER … JUSQU'A"),
    "fonction": ("Sous-programmes", "FONCTION"),
    "procedure": ("Sous-programmes", "PROCEDURE"),
    "retour": ("Sous-programmes", "RETOURNER(…)"),
    "appel": ("Sous-programmes", "Appel de procédure"),
    "allouer": ("Pointeurs", "ALLOUER(p)"),
    "liberer": ("Pointeurs", "LIBERER(p)"),
}

DEFAULT_ELEMENTS = ["constante", "declaration", "lire", "ecrire", "si", "sinon", "pour",
                    "tantque", "affectation"]

# Identificateurs : lettres accentuées comprises (« échanger », « Pluviométrie »).
_IDENT = re.compile(r"[^\W\d]\w*")
_SYMBOLES = set(" \t+-*/%()[].,<>=!\"'")
_FORBIDDEN_NAMES = {
    "import", "eval", "exec", "compile", "open", "globals", "locals", "getattr",
    "setattr", "delattr", "vars", "dir", "input", "exit", "quit", "breakpoint",
    "os", "sys", "subprocess", "socket", "shutil", "pickle", "copy",
}
_RESERVED = {"Chaine", "LIRE", "ECRIRE", "TABLEAU", "CRLF"}
# Les méthodes des valeurs Python : `x.upper`, `t.append`… ne sont pas des champs.
_METHODES = {nom for base in (str, list, int, float, dict, bool) for nom in dir(base)}
_MOTS = {
    "et": "and", "ou": "or", "non": "not", "vrai": "True", "faux": "False",
    "mod": "%", "div": "//", "nil": "None",
}


class AlgoError(ValueError):
    """Algorithme impossible à traduire : élément interdit ou expression invalide."""


_CHAINE = re.compile(r'"(?:[^"\\\n]|\\.)*"|\'(?:[^\'\\\n]|\\.)*\'')
_GUILLEMETS = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"'})


# ----- Expressions -----
def _normaliser(texte: str) -> str:
    return (texte or "").translate(_GUILLEMETS).replace(" ", " ").strip()


def _decoupe(source: str) -> list[str]:
    """Sépare une liste d'arguments sur ses virgules de premier niveau.

    Une virgule entre deux chiffres, sans espace (`4,5`), est une virgule
    décimale, comme dans les corrigés du cours : elle ne sépare rien.
    """
    texte = _normaliser(source)
    morceaux, courant, profondeur, i = [], [], 0, 0
    while i < len(texte):
        c = texte[i]
        if c in "\"'":
            fin = _fin_de_chaine(texte, i)
            courant.append(texte[i:fin])
            i = fin
            continue
        if c in "([":
            profondeur += 1
        elif c in ")]":
            profondeur -= 1
        elif c == "," and profondeur == 0:
            décimale = (
                i > 0 and i + 1 < len(texte) and texte[i - 1].isdigit() and texte[i + 1].isdigit()
            )
            if not décimale:
                morceaux.append("".join(courant).strip())
                courant = []
                i += 1
                continue
        courant.append(c)
        i += 1
    morceaux.append("".join(courant).strip())
    return [m for m in morceaux if m]


def _fin_de_chaine(texte: str, debut: int) -> int:
    guillemet, i = texte[debut], debut + 1
    while i < len(texte):
        if texte[i] == "\\":
            i += 2
            continue
        if texte[i] == guillemet:
            return i + 1
        i += 1
    return len(texte)


def _virgules_decimales(texte: str) -> str:
    """`4,5` → `4.5`, sauf entre les parenthèses d'un appel ou les crochets d'un
    indice, où la virgule sépare des arguments."""
    pile: list[str] = []
    contexte = []
    for i, c in enumerate(texte):
        if c == "(":
            avant = texte[:i].rstrip()
            pile.append("appel" if avant and (avant[-1].isalnum() or avant[-1] in "_)]") else "groupe")
        elif c == "[":
            pile.append("indice")
        elif c in ")]" and pile:
            pile.pop()
        contexte.append(any(p != "groupe" for p in pile))

    def remplace(m: re.Match) -> str:
        return m.group(0) if contexte[m.start()] else f"{m.group(1)}.{m.group(2)}"

    return re.sub(r"(?<![\w.])(\d+),(\d+)(?![\w.])", remplace, texte)


def _identifiant(nom: str, source: str) -> str:
    """Un nom écrit par l'apprenant, rendu utilisable en Python."""
    if nom.startswith("_") or "__" in nom or nom.lower() in _FORBIDDEN_NAMES or nom in _RESERVED:
        raise AlgoError(f"Le nom « {nom} » n'est pas autorisé (dans « {source} »).")
    # Un mot réservé de Python (`in`, `is`, `lambda`…) est un nom comme un autre au cours.
    return f"{nom}_" if keyword.iskeyword(nom) or keyword.issoftkeyword(nom) else nom


def _expression(source: str) -> str:
    texte = _normaliser(source)
    if not texte:
        raise AlgoError("Une expression est vide.")
    # Le texte entre guillemets est libre (accents, « : », « ? ») : on le met de
    # côté le temps du contrôle, pour ne filtrer que le code autour.
    chaines: list[str] = []

    def _garde(match: re.Match) -> str:
        chaines.append(match.group(0))
        return f"\x00{len(chaines) - 1}\x00"

    texte = _CHAINE.sub(_garde, texte)
    # Une chaîne collée à un nom (f"…", b"…", r"…") changerait de nature en Python :
    # f"{…}" exécuterait du code. Le pseudo-code n'a pas de préfixe de chaîne.
    if re.search(r"\w\x00\d+\x00|\x00\d+\x00\w", texte):
        raise AlgoError("Expression non autorisée.")
    texte = texte.replace("≠", "<>").replace("≤", "<=").replace("≥", ">=")
    texte = _dereferencer(texte)
    for c in texte:
        if not (c.isalnum() or c == "_" or c in _SYMBOLES or c == "\x00"):
            raise AlgoError(f"Caractère non autorisé dans l'expression « {source} ».")
    if "__" in texte:
        raise AlgoError("Expression non autorisée.")
    texte = texte.replace("<>", "!=")
    texte = _virgules_decimales(texte)

    def _mot(match: re.Match) -> str:
        nom = match.group(0)
        debut = match.start()
        if debut > 0 and texte[debut - 1] == ".":
            if nom in _METHODES or nom.startswith("_"):
                raise AlgoError(f"« .{nom} » n'est pas un champ d'enregistrement valide.")
            return nom
        if nom.lower() in _MOTS:
            return _MOTS[nom.lower()]
        if nom == "CRLF":
            return nom
        return _identifiant(nom, source)

    texte = _IDENT.sub(_mot, texte)
    # Au cours, « = » est l'égalité ; l'affectation s'écrit avec la flèche.
    texte = re.sub(r"(?<![=!<>])=(?!=)", "==", texte)
    return re.sub(r"\x00(\d+)\x00", lambda m: f"Chaine({chaines[int(m.group(1))]})", texte)


# `p^` : un chapeau collé à ce qu'il suit (nom, case, champ) et suivi d'autre
# chose qu'un opérande. `x ^ 2` reste une puissance, que le cours n'emploie pas
# dans les expressions évaluées : elle est refusée plus loin.
_DEREF = re.compile(r"(?<=[\w\])])\s*\^(?!\s*[\w(\x00])")


def _dereferencer(texte: str) -> str:
    """`p^.valeur` → `p.cible.valeur` : la zone que désigne le pointeur."""
    return _DEREF.sub(".cible", texte)


def _nom(source: str) -> str:
    nom = _normaliser(source)
    if not _IDENT.fullmatch(nom):
        raise AlgoError(f"« {source} » n'est pas un nom valide.")
    return _identifiant(nom, source)


def _acces(source: str) -> tuple[str, str, list]:
    """Découpe `t[i][j].nom` en (base, traduction python, accès successifs)."""
    texte = _normaliser(source)
    m = _IDENT.match(texte)
    if not m:
        raise AlgoError(f"« {source} » ne peut pas recevoir de valeur.")
    base = m.group(0)
    python = _identifiant(base, source)
    accès: list = []
    i = m.end()
    while i < len(texte):
        c = texte[i]
        if c.isspace():
            i += 1
            continue
        if c == "[":
            profondeur, j = 1, i + 1
            while j < len(texte) and profondeur:
                if texte[j] == "[":
                    profondeur += 1
                elif texte[j] == "]":
                    profondeur -= 1
                j += 1
            if profondeur:
                raise AlgoError(f"« {source} » : crochet non fermé.")
            # t[i, j] s'écrit aussi t[i][j].
            for indice in _decoupe(texte[i + 1 : j - 1]):
                python += f"[{_expression(indice)}]"
                accès.append("[]")
            i = j
            continue
        if c == ".":
            champ = _IDENT.match(texte, i + 1)
            if not champ or champ.group(0) in _METHODES or champ.group(0).startswith("_"):
                raise AlgoError(f"« {source} » : champ d'enregistrement invalide.")
            python += f".{champ.group(0)}"
            accès.append(champ.group(0))
            i = champ.end()
            continue
        if c == "^":
            python += ".cible"
            accès.append("^")
            i += 1
            continue
        raise AlgoError(f"« {source} » ne peut pas recevoir de valeur.")
    return base, python, accès


# ----- Types -----
_SCALAIRES = {
    "entier": "0",
    "reel": "0.0",
    "caractere": 'Chaine("")',
    "chaine": 'Chaine("")',
    "booleen": "False",
}
_ALIAS_SCALAIRES = {
    "ENTIER": "entier", "ENTIERS": "entier", "INT": "entier",
    "REEL": "reel", "REELS": "reel",
    "CARACTERE": "caractere", "CARACTERES": "caractere", "CAR": "caractere", "CHAR": "caractere",
    "CHAINE": "chaine", "CHAINES": "chaine", "CHAINEDECARACTERES": "chaine",
    "CHAINESDECARACTERES": "chaine",
    "BOOLEEN": "booleen", "BOOLEENS": "booleen",
}
# Clés de types proposées par l'éditeur pour une variable.
SCALAR_LABELS = {
    "entier": "ENTIER", "reel": "REEL", "caractere": "CARACTERE", "chaine": "CHAINE",
    "booleen": "BOOLEEN",
}


def _sans_accents(texte: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", texte) if unicodedata.category(c) != "Mn"
    )


def parse_type(texte: str) -> tuple:
    """Lit un type écrit au cours.

    Rend ("scalaire", clé) | ("tableau", [(début, fin), …], élément) |
    ("nomme", Nom) | ("pointeur", type pointé).
    """
    brut = _normaliser(texte).replace("’", "'")
    if not brut:
        return ("scalaire", "entier")
    if brut.startswith("^"):
        return ("pointeur", brut[1:].strip())
    m = re.match(r"(?i)^tableau\s*((?:\[[^\]]*\]\s*)*)\s*(?:de\s+|d')\s*(.+)$", brut)
    if m:
        dimensions = []
        for bloc in re.findall(r"\[([^\]]*)\]", m.group(1)):
            for dim in _decoupe(bloc):
                if ".." in dim:
                    debut, fin = (p.strip() for p in dim.split("..", 1))
                else:
                    debut, fin = "1", dim.strip()
                dimensions.append((debut or "1", fin))
        return ("tableau", dimensions, parse_type(m.group(2)))
    cle = re.sub(r"[\s'_-]", "", _sans_accents(brut).upper())
    if cle in _ALIAS_SCALAIRES:
        return ("scalaire", _ALIAS_SCALAIRES[cle])
    if not _IDENT.fullmatch(brut):
        raise AlgoError(f"Type « {texte} » illisible.")
    return ("nomme", brut)


def variable_type_text(variable: dict) -> str:
    """Le type d'une variable de l'éditeur, écrit comme au cours."""
    genre = str(variable.get("type") or "entier")
    cible = str(variable.get("cible") or "").strip()
    if genre.startswith("tableau_"):
        élément = genre.removeprefix("tableau_")
        élément = cible if élément == "nomme" else SCALAR_LABELS.get(élément, élément.upper())
        dims = ""
        for debut, fin in (("debut", "taille"), ("debut2", "taille2")):
            borne = str(variable.get(fin) or "").strip()
            if borne:
                dims += f"[{str(variable.get(debut) or '').strip() or '1'}..{borne}]"
        return f"TABLEAU{dims} DE {élément}"
    if genre == "nomme":
        return cible
    if genre == "pointeur":
        return f"^{cible}"
    return SCALAR_LABELS.get(genre, genre.upper())


class _Contexte:
    def __init__(self, autorises: set[str], saut: bool):
        self.autorises = autorises
        self.saut = saut
        self.structures: dict[str, dict[str, tuple]] = {}
        self.alias: dict[str, tuple] = {}
        self.signatures: dict[str, dict] = {}
        self.portee: dict[str, tuple] = {}
        self.procedure: list[str] | None = None
        self.dans_sous_programme = False
        self.compteur = 0

    def temporaire(self, prefixe: str) -> str:
        self.compteur += 1
        return f"_{prefixe}{self.compteur}"

    def verifier(self, cle: str) -> None:
        if cle not in self.autorises:
            libelle = ELEMENTS.get(cle, DECLARATIONS.get(cle, (None, cle)))[1]
            raise AlgoError(f"L'élément « {libelle} » n'est pas autorisé pour cette question.")

    def resoudre(self, genre: tuple) -> tuple:
        """Remplace un type nommé qui n'est qu'un alias par ce qu'il désigne."""
        vus = set()
        while genre[0] == "nomme" and genre[1] in self.alias and genre[1] not in vus:
            vus.add(genre[1])
            genre = self.alias[genre[1]]
        return genre

    def constructeur(self, genre: tuple) -> str:
        """L'expression Python qui crée une valeur initiale de ce type."""
        genre = self.resoudre(genre)
        if genre[0] == "scalaire":
            return _SCALAIRES[genre[1]]
        if genre[0] == "pointeur":
            return "None"
        if genre[0] == "nomme":
            if genre[1] not in self.structures:
                raise AlgoError(f"Type « {genre[1]} » inconnu : déclarez-le dans TYPES.")
            return f"_nouveau_{genre[1]}()"
        _, dimensions, élément = genre
        valeur = self.constructeur(élément)
        if not dimensions:
            return "[]"
        # TABLEAU[1..N] : une case de plus, pour que les indices 1 à N existent
        # tous (la case 0 reste libre pour qui compte depuis 0).
        for _, fin in reversed(dimensions):
            valeur = f"[{valeur} for _ in range(int({_expression(fin)}) + 1)]"
        return valeur

    def genre_de(self, source: str) -> tuple | None:
        """Le type déclaré de `t[i].champ`, `p^.suivant`… ; None s'il est inconnu."""
        try:
            base, _, accès = _acces(source)
        except AlgoError:
            return None
        genre = self.portee.get(base)
        if genre is None:
            return None
        for pas in accès:
            genre = self.resoudre(genre)
            if pas == "[]":
                if genre[0] != "tableau":
                    return None
                dims = genre[1][1:]
                genre = ("tableau", dims, genre[2]) if dims else genre[2]
            elif pas == "^":
                if genre[0] != "pointeur" or not genre[1]:
                    return None
                genre = parse_type(genre[1])
            else:
                if genre[0] != "nomme" or genre[1] not in self.structures:
                    return None
                genre = self.structures[genre[1]].get(pas)
                if genre is None:
                    return None
        return self.resoudre(genre)

    def genre_lu(self, source: str) -> str:
        """Le type de ce que LIRE va remplir : il décide de la conversion."""
        genre = self.genre_de(source)
        return genre[1] if genre is not None and genre[0] == "scalaire" else "auto"


# ----- Corps -----
def _bloc(noeud: dict, niveau: int, ctx: _Contexte, lignes: list[str]) -> None:
    marge = "    " * niveau
    type_ = noeud.get("type")
    if type_ not in ELEMENTS:
        raise AlgoError(f"Élément inconnu : {type_}.")
    if type_ == "appel":
        if not ({"procedure", "fonction", "appel"} & ctx.autorises):
            ctx.verifier("procedure")
    elif type_ == "fonction" and ctx.dans_sous_programme:
        raise AlgoError("Une fonction ne se déclare pas dans une autre.")
    else:
        ctx.verifier(type_)

    if type_ == "lire":
        # LIRE(j, m, a) lit plusieurs valeurs d'un coup.
        cibles = _decoupe(noeud.get("cible") or "")
        if not cibles:
            raise AlgoError("LIRE() n'indique pas quelle variable remplir.")
        for cible in cibles:
            _, python, _ = _acces(cible)
            lignes.append(f'{marge}{python} = LIRE("{ctx.genre_lu(cible)}")')
    elif type_ == "ecrire":
        morceaux = [_expression(m) for m in _decoupe(noeud.get("expression") or "")]
        lignes.append(f"{marge}ECRIRE({', '.join(morceaux)})")
    elif type_ == "affectation":
        _, cible, _ = _acces(noeud.get("cible"))
        lignes.append(f"{marge}{cible} = _copie({_expression(noeud.get('expression'))})")
    elif type_ == "allouer":
        # ALLOUER(p) réserve une zone du type pointé et range son adresse dans p.
        cible = noeud.get("cible") or ""
        _, python, _ = _acces(cible)
        genre = ctx.genre_de(cible)
        if genre is None or genre[0] != "pointeur" or not genre[1]:
            raise AlgoError(
                f"ALLOUER({_normaliser(cible)}) : « {_normaliser(cible)} » n'est pas déclaré "
                "comme un pointeur (^Type)."
            )
        zone = ctx.constructeur(parse_type(genre[1]))
        lignes.append(f"{marge}{python} = _Pointeur({zone})")
    elif type_ == "liberer":
        # LIBERER(p) rend la zone : p ne désigne plus rien (NIL).
        _, python, _ = _acces(noeud.get("cible") or "")
        lignes.append(f"{marge}{python} = None")
    elif type_ == "retour":
        if not ctx.dans_sous_programme:
            raise AlgoError("RETOURNER ne s'emploie que dans une fonction.")
        if ctx.procedure is not None:
            lignes.append(f"{marge}return ({', '.join(ctx.procedure)}{',' if ctx.procedure else ''})")
        else:
            lignes.append(f"{marge}return {_expression(noeud.get('expression'))}")
    elif type_ == "si":
        lignes.append(f"{marge}if {_expression(noeud.get('condition'))}:")
        _corps(noeud.get("alors"), niveau + 1, ctx, lignes)
        for branche in noeud.get("sinonsi") or []:
            ctx.verifier("sinonsi")
            lignes.append(f"{marge}elif {_expression(branche.get('condition'))}:")
            _corps(branche.get("corps"), niveau + 1, ctx, lignes)
        sinon = noeud.get("sinon") or []
        if sinon:
            ctx.verifier("sinon")
            lignes.append(f"{marge}else:")
            _corps(sinon, niveau + 1, ctx, lignes)
    elif type_ == "selon":
        sujet = ctx.temporaire("selon")
        lignes.append(f"{marge}{sujet} = {_expression(noeud.get('expression'))}")
        mot = "if"
        for cas in noeud.get("cas") or []:
            valeurs = [_expression(v) for v in _decoupe(cas.get("valeurs") or "")]
            if not valeurs:
                raise AlgoError("Un cas du SELON n'a pas de valeur.")
            test = " or ".join(f"{sujet} == {v}" for v in valeurs)
            lignes.append(f"{marge}{mot} {test}:")
            _corps(cas.get("corps"), niveau + 1, ctx, lignes)
            mot = "elif"
        autre = noeud.get("autre") or []
        if mot == "if":
            lignes.append(f"{marge}if True:")
            _corps(autre, niveau + 1, ctx, lignes)
        elif autre:
            lignes.append(f"{marge}else:")
            _corps(autre, niveau + 1, ctx, lignes)
    elif type_ == "pour":
        variable = _nom(noeud.get("variable"))
        debut = _expression(noeud.get("debut"))
        fin = _expression(noeud.get("fin"))
        pas = _expression(str(noeud.get("pas") or "").strip() or "1")
        # « par pas de » : la borne finale est incluse, dans un sens comme dans l'autre.
        lignes.append(
            f"{marge}for {variable} in range(int({debut}), int({fin}) + (1 if int({pas}) > 0 else -1), int({pas})):"
        )
        _corps(noeud.get("corps"), niveau + 1, ctx, lignes)
    elif type_ == "tantque":
        lignes.append(f"{marge}while {_expression(noeud.get('condition'))}:")
        _corps(noeud.get("corps"), niveau + 1, ctx, lignes)
    elif type_ == "repeter":
        # « Répéter … jusqu'à » exécute d'abord, teste ensuite : Python n'a pas de
        # do-while, on le compose avec une boucle infinie et une sortie conditionnelle.
        lignes.append(f"{marge}while True:")
        _corps(noeud.get("corps"), niveau + 1, ctx, lignes)
        lignes.append(f"{marge}    if {_expression(noeud.get('condition'))}:")
        lignes.append(f"{marge}        break")
    elif type_ == "appel":
        _appel(noeud, marge, ctx, lignes)
    elif type_ in ("fonction", "procedure"):
        # Ancienne forme : une fonction posée dans le corps, paramètres sans type.
        _sous_programme(noeud, niveau, ctx, lignes)


def _appel(noeud: dict, marge: str, ctx: _Contexte, lignes: list[str]) -> None:
    nom = _normaliser(noeud.get("nom"))
    signature = ctx.signatures.get(nom)
    if signature is None:
        raise AlgoError(f"« {nom or '?'} » n'est ni une procédure ni une fonction déclarée.")
    arguments = _decoupe(noeud.get("arguments") or "")
    modes = signature["modes"]
    if len(arguments) != len(modes):
        raise AlgoError(
            f"{nom} attend {len(modes)} paramètre{'s' if len(modes) > 1 else ''}, "
            f"l'appel en donne {len(arguments)}."
        )
    valeurs, sorties = [], []
    for argument, mode in zip(arguments, modes):
        if mode in ("S", "ES"):
            # Un paramètre de sortie reçoit une valeur : c'est forcément une variable.
            _, cible, _ = _acces(argument)
            valeurs.append(cible)
            sorties.append(cible)
        else:
            valeurs.append(_expression(argument))
    appel = f"{_nom(nom)}({', '.join(valeurs)})"
    if signature["genre"] == "procedure" and sorties:
        resultat = ctx.temporaire("sortie")
        lignes.append(f"{marge}{resultat} = {appel}")
        for rang, cible in enumerate(sorties):
            lignes.append(f"{marge}{cible} = {resultat}[{rang}]")
    else:
        lignes.append(f"{marge}{appel}")


def _parametres(noeud: dict) -> list[dict]:
    """Les paramètres d'un sous-programme, quelle que soit la version de l'éditeur."""
    resultat = []
    for p in noeud.get("parametres") or []:
        if isinstance(p, str):
            resultat.append({"nom": p, "type": "", "mode": "E"})
        elif isinstance(p, dict):
            mode = str(p.get("mode") or "E").upper().replace("/", "")
            resultat.append({"nom": p.get("nom"), "type": p.get("type") or "",
                             "mode": mode if mode in ("E", "S", "ES") else "E"})
    return resultat


def _sous_programme(noeud: dict, niveau: int, ctx: _Contexte, lignes: list[str]) -> None:
    genre = "procedure" if noeud.get("type") == "procedure" else "fonction"
    ctx.verifier(genre)
    marge = "    " * niveau
    parametres = _parametres(noeud)
    noms = [_nom(p["nom"]) for p in parametres]
    lignes.append(f"{marge}def {_nom(noeud.get('nom'))}({', '.join(noms)}):")

    portee_appelant, procedure_appelante = ctx.portee, ctx.procedure
    dans_appelant = ctx.dans_sous_programme
    ctx.portee = dict(portee_appelant)
    ctx.dans_sous_programme = True
    interieur = "    " * (niveau + 1)
    for p, nom in zip(parametres, noms):
        ctx.portee[str(p["nom"]).strip()] = parse_type(p["type"]) if p["type"] else ("scalaire", "auto")
        if p["mode"] == "E":
            # Un paramètre d'entrée est une copie : la procédure ne touche pas l'original.
            lignes.append(f"{interieur}{nom} = _copie({nom})")
    for variable in noeud.get("variables") or []:
        lignes.append(f"{interieur}{_declaration_variable(variable, ctx)}")
    sorties = [nom for p, nom in zip(parametres, noms) if p["mode"] in ("S", "ES")]
    ctx.procedure = sorties if genre == "procedure" else None
    _corps(noeud.get("corps"), niveau + 1, ctx, lignes)
    if genre == "procedure" and sorties:
        lignes.append(f"{interieur}return ({', '.join(sorties)},)")
    ctx.portee, ctx.procedure, ctx.dans_sous_programme = (
        portee_appelant, procedure_appelante, dans_appelant,
    )


def _corps(blocs, niveau: int, ctx: _Contexte, lignes: list[str]) -> None:
    if not blocs:
        lignes.append("    " * niveau + "pass")
        return
    for noeud in blocs:
        _bloc(noeud, niveau, ctx, lignes)


# ----- Partie déclarative -----
def _declaration_variable(variable: dict, ctx: _Contexte) -> str:
    nom_source = str(variable.get("nom") or "").strip()
    nom = _nom(nom_source)
    texte = variable_type_text(variable)
    genre = variable.get("type") or "entier"
    if genre.startswith("tableau_") and not str(variable.get("taille") or "").strip():
        raise AlgoError(f"La taille du tableau « {nom_source} » n'est pas indiquée.")
    type_parse = parse_type(texte)
    ctx.portee[nom_source] = type_parse
    initiale = str(variable.get("valeur") or "").strip()
    if not initiale:
        return f"{nom} = {ctx.constructeur(type_parse)}"
    if initiale.startswith("{") and initiale.endswith("}"):
        # notes : TABLEAU[1..10] DE REEL = {12, 8, 16, 5, -1} : les cases 1, 2, 3…
        valeurs = [_expression(v) for v in _decoupe(initiale[1:-1])]
        tableau = ctx.constructeur(type_parse)
        return (
            f"{nom} = {tableau}\n"
            f"for _rang, _valeur in enumerate([{', '.join(valeurs)}], 1):\n"
            f"    {nom}[_rang] = _valeur"
        )
    return f"{nom} = {_expression(initiale)}"


def _declarations(document: dict, ctx: _Contexte, lignes: list[str]) -> None:
    """Traduit la partie déclarative : constantes, types, variables."""
    constantes = document.get("constantes") or []
    types = document.get("types") or []
    variables = document.get("variables") or []

    for rubrique, contenu in (("constante", constantes), ("type", types),
                              ("declaration", variables)):
        if contenu:
            ctx.verifier(rubrique)

    for constante in constantes:
        nom = str(constante.get("nom") or "").strip()
        lignes.append(f"{_nom(nom)} = {_expression(constante.get('valeur'))}")

    # Les types d'abord recensés, puis traduits : un enregistrement peut en
    # contenir un autre déclaré plus bas.
    for déclaré in types:
        nom = _nom(déclaré.get("nom"))
        if déclaré.get("genre") == "tableau":
            ctx.alias[nom] = parse_type(déclaré.get("definition") or "")
        else:
            ctx.structures[nom] = {}
    for déclaré in types:
        nom = _nom(déclaré.get("nom"))
        if nom in ctx.alias:
            continue
        champs = _champs(déclaré)
        ctx.structures[nom] = {c: parse_type(t) for c, t in champs}
    for nom, champs in ctx.structures.items():
        lignes.append(f"def _nouveau_{nom}():")
        lignes.append("    e = _Enreg()")
        for champ, genre in champs.items():
            if not _IDENT.fullmatch(champ) or champ in _METHODES or champ.startswith("_"):
                raise AlgoError(f"Champ « {champ} » invalide dans le type {nom}.")
            lignes.append(f"    e.{champ} = {ctx.constructeur(genre)}")
        lignes.append("    return e")

    for variable in variables:
        lignes.append(_declaration_variable(variable, ctx))


def _champs(déclaré: dict) -> list[tuple[str, str]]:
    champs = déclaré.get("champs")
    if isinstance(champs, list):
        return [(str(c.get("nom") or "").strip(), str(c.get("type") or ""))
                for c in champs if isinstance(c, dict) and str(c.get("nom") or "").strip()]
    resultat = []
    for morceau in str(déclaré.get("definition") or "").split(","):
        if ":" in morceau:
            nom, type_ = morceau.split(":", 1)
            resultat.append((nom.strip(), type_.strip()))
    return resultat


def transpile(production: str, allowed: list[str] | None = None, *, saut_de_ligne: bool = True) -> str:
    """Traduit le document de l'apprenant (JSON) en programme Python complet.

    `saut_de_ligne` : ECRIRE passe-t-il à la ligne après chaque affichage ? Au
    cours, non (c'est le rôle de CRLF) ; les exercices créés avant l'alignement
    sur le cours gardent l'ancien comportement.
    """
    try:
        document = json.loads(production) if production.strip() else {}
    except json.JSONDecodeError as exc:
        raise AlgoError("Algorithme illisible.") from exc

    # Les copies antérieures à la structure obligatoire ne portaient que la liste
    # des blocs : on les relit comme un corps sans déclarations.
    if isinstance(document, list):
        document = {"corps": document}
    if not isinstance(document, dict):
        raise AlgoError("Algorithme illisible.")

    corps = document.get("corps")
    if corps is None:
        corps = document.get("blocs")
    if corps is None:
        corps = []
    sous_programmes = document.get("sousProgrammes") or []
    if not isinstance(corps, list) or not isinstance(sous_programmes, list):
        raise AlgoError("Algorithme illisible.")

    ctx = _Contexte(set(allowed or DEFAULT_ELEMENTS), saut_de_ligne)
    for noeud in [*sous_programmes, *corps]:
        if isinstance(noeud, dict) and noeud.get("type") in ("fonction", "procedure"):
            parametres = _parametres(noeud)
            ctx.signatures[_normaliser(noeud.get("nom"))] = {
                "genre": noeud.get("type"),
                "modes": [p["mode"] for p in parametres],
            }

    lignes: list[str] = []
    _declarations(document, ctx, lignes)
    for noeud in sous_programmes:
        if not isinstance(noeud, dict) or noeud.get("type") not in ("fonction", "procedure"):
            raise AlgoError("Après FIN, seuls des fonctions et des procédures se déclarent.")
        _sous_programme(noeud, 0, ctx, lignes)
    debut_du_corps = len(lignes)
    for noeud in corps:
        _bloc(noeud, 0, ctx, lignes)
    if len(lignes) == debut_du_corps:
        raise AlgoError("Le corps de l'algorithme est vide.")

    source = PRELUDE.replace("{saut}", "True" if saut_de_ligne else "False") + "\n\n" + "\n".join(lignes) + "\n"
    try:
        compile(source, "<algorithme>", "exec")
    except SyntaxError as exc:
        raise AlgoError(f"Algorithme invalide : {exc.msg}") from exc
    return source
