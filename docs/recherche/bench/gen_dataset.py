#!/usr/bin/env python3
"""Tirage du jeu de copies du banc (memoire, section 4.3, etape 1).

Tire N copies a partir d'une graine fixee : pour chaque copie et chaque exercice
de code ou d'algorithmique, une classe de reponse (K1 a K5) selon les
proportions de la section 4.2.2, puis une variante dans cette classe. Les
reponses de QCM et de vrai/faux sont tirees au hasard parmi les choix possibles.

Le resultat est un fichier JSON unique, dont l'empreinte SHA-256 est calculee et
ecrite a cote : deux mesures ne sont comparables que si elles portent la meme.

Usage :
    python3 gen_dataset.py --seed 2026 --copies 500
    python3 gen_dataset.py --seed 2026 --copies 500 --out data/dataset_v1.json
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
from pathlib import Path

import dataset_spec as spec

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE / "data" / "dataset_v1.json"


def pick_class(rng: random.Random) -> str:
    classes = list(spec.CLASS_WEIGHTS)
    weights = [spec.CLASS_WEIGHTS[c] for c in classes]
    return rng.choices(classes, weights=weights, k=1)[0]


def random_qcm_answer(rng: random.Random) -> str:
    questions = []
    for question in spec.QCM_QUESTIONS:
        count = len(question["choices"])
        questions.append({"selected": [rng.randrange(count)]})
    return json.dumps({"questions": questions}, ensure_ascii=False)


def random_truefalse_answer(rng: random.Random) -> str:
    answers = {str(i): rng.choice([True, False])
               for i in range(len(spec.TRUEFALSE_STATEMENTS))}
    return json.dumps({"answers": answers}, ensure_ascii=False)


def build(seed: int, copies: int) -> dict:
    rng = random.Random(seed)
    dataset = {
        "seed": seed,
        "copies_count": copies,
        "evaluation": spec.EVALUATION["title"],
        "exercises": [
            {"position": e["position"], "title": e["title"], "kind": e["kind"],
             "points": e["points"]}
            for e in spec.EXERCISES
        ],
        "copies": [],
    }

    for index in range(1, copies + 1):
        answers = []
        for exercise in spec.EXERCISES:
            if exercise["variants"] is None:
                if exercise["kind"] == "qcm":
                    code = random_qcm_answer(rng)
                else:
                    code = random_truefalse_answer(rng)
                answers.append({"exercise": exercise["position"], "class": "R",
                                "variant": None, "code": code})
                continue
            klass = pick_class(rng)
            variant = rng.randrange(3)
            answers.append({"exercise": exercise["position"], "class": klass,
                            "variant": variant,
                            "code": exercise["variants"][klass][variant]})
        dataset["copies"].append({
            "index": index,
            "matricule": f"BENCH{index:04d}",
            "full_name": f"Etudiant {index:03d}",
            "email": f"etudiant{index:04d}@bench.local",
            "answers": answers,
        })

    return dataset


def summary(dataset: dict) -> str:
    counts: dict[str, int] = {}
    for copy in dataset["copies"]:
        for answer in copy["answers"]:
            counts[answer["class"]] = counts.get(answer["class"], 0) + 1
    total = sum(counts.values())
    drawn = sum(v for k, v in counts.items() if k != "R")
    lines = [f"{total} reponses tirees pour {len(dataset['copies'])} copies"]
    for klass in sorted(k for k in counts if k != "R"):
        part = 100.0 * counts[klass] / drawn
        attendu = 100.0 * spec.CLASS_WEIGHTS[klass]
        lines.append(f"  {klass} : {counts[klass]:5d} ({part:4.1f} %, attendu {attendu:4.1f} %)")
    if "R" in counts:
        lines.append(f"  QCM et vrai/faux (reponses au hasard) : {counts['R']}")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seed", type=int, default=2026)
    parser.add_argument("--copies", type=int, default=500)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()

    dataset = build(args.seed, args.copies)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(dataset, ensure_ascii=False, indent=1, sort_keys=True)
    args.out.write_text(payload, encoding="utf-8")

    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    (args.out.parent / (args.out.stem + ".sha256")).write_text(
        f"{digest}  {args.out.name}\n", encoding="utf-8"
    )

    print(summary(dataset))
    print(f"fichier   : {args.out}")
    print(f"SHA-256   : {digest}")


if __name__ == "__main__":
    main()
