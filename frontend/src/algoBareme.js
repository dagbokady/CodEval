/**
 * Ce qu'un **algorithme** doit contenir : le barème déclaratif, dit dans le
 * vocabulaire du cours.
 *
 * Un exercice de code se contrôle avec les mots du C : `int total;`,
 * `long factorielle(int)`, `struct Point`. Un algorithme n'a rien de tout cela :
 * il a une partie déclarative (constantes, types, variables typées en entier,
 * réel, chaîne…), un corps fait de blocs (SI, POUR, TANT QUE, LIRE, ECRIRE), et
 * des fonctions dont on ne connaît que le nom et le nombre de paramètres. Le
 * barème d'un exercice algorithmique se saisit donc avec ces mots-là, et se
 * vérifie sur le document de l'apprenant : pas sur un fichier compilé.
 *
 * Les clés de critère sont préfixées `algo_` : une même liste `settings.criteria`
 * porte les deux familles sans qu'on puisse les confondre, ici comme au serveur.
 *
 * Ce catalogue double `backend/app/grading/algo_bareme.py`. Tout critère ajouté
 * ici doit l'être là aussi.
 */

import { DATA_TYPES, ELEMENTS, SIZED_TYPES, typeNotation } from './algoVocabulary';

/** Les familles de critères algorithmiques, dans l'ordre du sélecteur. */
export const ALGO_CRITERION_KINDS = [
  {
    key: 'algo_variable',
    label: 'Variable attendue',
    sample: 'x : entier',
    hint: "Vérifie que la partie déclarative contient cette variable, avec ce type.",
  },
  {
    key: 'algo_constante',
    label: 'Constante attendue',
    sample: 'MAX = 100',
    hint: 'Vérifie que la constante est déclarée ; sa valeur est facultative.',
  },
  {
    key: 'algo_type',
    label: 'Type attendu (enregistrement)',
    sample: 'Etudiant : nom, age',
    hint: "Vérifie que le type est déclaré, et que sa définition nomme les champs demandés.",
  },
  {
    key: 'algo_fonction',
    label: 'Fonction attendue',
    sample: 'FONCTION moyenne(t, n)',
    hint: 'Vérifie que le corps déclare cette fonction, avec ce nombre de paramètres.',
  },
  {
    key: 'algo_structure',
    label: 'Structure attendue',
    sample: 'POUR … FAIRE',
    hint: "Vérifie que l'algorithme emploie cette structure, autant de fois que demandé.",
  },
];

const ALGO_BY_KEY = Object.fromEntries(ALGO_CRITERION_KINDS.map((k) => [k.key, k]));

/** Vrai si ce critère s'écrit dans le vocabulaire algorithmique. */
export function isAlgoCriterion(kind) {
  return Object.hasOwn(ALGO_BY_KEY, kind);
}

export function algoCriterionKind(key) {
  return ALGO_BY_KEY[key] ?? ALGO_BY_KEY.algo_variable;
}

/**
 * Les blocs qu'un critère « structure attendue » peut exiger.
 *
 * Tout le vocabulaire du corps est exigible : y compris le SINON, qui n'est pas
 * un bloc qu'on pose mais la seconde branche du SI : « traitez le cas contraire »
 * est une consigne courante, et le correcteur sait la voir.
 */
export const ALGO_STRUCTURES = Object.entries(ELEMENTS).map(([key, element]) => ({
  key,
  label: element.label,
  group: element.group,
}));

/** Le type de données d'une variable, tel qu'il s'écrit sur le sujet. */
export function dataTypeLabel(key) {
  return DATA_TYPES.find((t) => t.key === key)?.label ?? key;
}

export function isSizedType(key) {
  return SIZED_TYPES.has(key);
}

let compteur = 0;
function newId() {
  compteur += 1;
  return `a${Date.now().toString(36)}${compteur}`;
}

/** Un critère algorithmique vierge, prêt à être rempli. */
export function blankAlgoCriterion(kind = 'algo_variable') {
  const base = { id: newId(), kind, points: 1, name: '' };
  if (kind === 'algo_constante') return { ...base, name: 'MAX', valeur: '' };
  if (kind === 'algo_type') return { ...base, name: 'Etudiant', fields: [] };
  if (kind === 'algo_fonction') return { ...base, name: '', arity: '' };
  if (kind === 'algo_structure') return { ...base, name: '', element: 'pour', min: 1 };
  return { ...base, name: 'x', vtype: 'entier', taille: '' };
}

/** Les champs nommés d'un critère « type attendu ». */
export function algoFieldsOf(criterion) {
  const fields = criterion?.fields;
  return Array.isArray(fields) ? fields : [];
}

/** Le critère tel qu'on le montre à l'enseignant et sur la feuille de sujet. */
export function describeAlgoCriterion(criterion) {
  const nom = criterion?.name?.trim() || '?';
  if (criterion?.kind === 'algo_constante') {
    const valeur = String(criterion.valeur ?? '').trim();
    return valeur ? `Constante ${nom} = ${valeur}` : `Constante ${nom}`;
  }
  if (criterion?.kind === 'algo_type') {
    const champs = algoFieldsOf(criterion)
      .map((f) => String(f ?? '').trim())
      .filter(Boolean);
    return champs.length ? `Type ${nom} : ${champs.join(', ')}` : `Type ${nom}`;
  }
  if (criterion?.kind === 'algo_fonction') {
    const arité = Number(criterion.arity);
    if (!Number.isFinite(arité) || String(criterion.arity ?? '').trim() === '') {
      return `FONCTION ${nom}(…)`;
    }
    const paramètres = Array.from({ length: Math.max(0, arité) }, (_, i) => `p${i + 1}`);
    return `FONCTION ${nom}(${paramètres.join(', ')})`;
  }
  if (criterion?.kind === 'algo_structure') {
    const bloc = ELEMENTS[criterion.element]?.label ?? criterion.element ?? '?';
    const fois = Number(criterion.min) || 1;
    return fois > 1 ? `${bloc} (${fois} fois)` : bloc;
  }
  return `${nom} :${typeNotation(criterion?.vtype ?? 'entier', { taille: criterion?.taille })}`;
}
