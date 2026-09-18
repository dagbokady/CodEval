"""Cœur du banc d'essai : appelle le VRAI moteur de correction (grade_exercise)
et le VRAI SubprocessSandbox du dépôt. Aucune modification du code de production.
La correction d'une « réponse à un exercice » (compilation + exécution des cas de
test réels) est ici l'unité de service mesurée."""
import sys, os, time, types
_REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
sys.path.insert(0, os.path.join(_REPO, "backend"))
from app.grading.engine import grade_exercise            # noqa: E402
from app.grading.sandbox import SubprocessSandbox         # noqa: E402

SB = SubprocessSandbox()

def tc(expected="", stdin="", comparison="numeric", timeout_ms=10000, points=1.0, tid=1):
    return types.SimpleNamespace(
        id=tid, name=f"t{tid}", kind=types.SimpleNamespace(value="official"),
        points=points, target_id=None, timeout_ms=timeout_ms, stdin=stdin,
        input_types=None, args=None, expected_stdout=expected, comparison=comparison)

def ex(points=1.0, language="c"):
    return types.SimpleNamespace(kind="code", points=points, language=language, settings={}, tests=[])

def grade(code, tests):
    t0 = time.monotonic()
    out = grade_exercise(code, ex(), tests, SB)
    return (time.monotonic()-t0), out

# W1 : exercice trivial (lit deux entiers, affiche la somme) : profil « correction
# académique légère » retenu pour les mesures de granularité et de scalabilité.
W1 = r'''#include <stdio.h>
int main(void){long a,b;if(scanf("%ld %ld",&a,&b)!=2)return 1;printf("%ld\n",a+b);return 0;}
'''
TESTS = [tc(expected="7", stdin="3 4"), tc(expected="30", stdin="10 20")]
