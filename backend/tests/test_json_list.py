"""Relecture des listes JSON stockées dans une colonne TEXT.

Sur une base existante, `args` et `input_types` ont été ajoutées en TEXT : le
pilote rend la chaîne JSON brute. Copier une épreuve la découpait alors
caractère par caractère, et relire la copie faisait échouer l'API.
"""

from app.models import JSONList


def test_une_chaine_json_est_relue_en_liste():
    assert JSONList().process_result_value('["12 15 9 18"]', None) == ["12 15 9 18"]


def test_une_liste_reste_une_liste():
    assert JSONList().process_result_value(["int"], None) == ["int"]


def test_une_valeur_illisible_devient_une_liste_vide():
    assert JSONList().process_result_value("pas du json", None) == []
    assert JSONList().process_result_value(None, None) == []
