/**
 * Barème d'un exercice de code : ce que l'enseignant contrôle, critère par critère.
 *
 * Créer un exercice de code, c'est écrire son barème. Celui-ci est une liste
 * plate de critères — plus de sous-questions — de deux familles :
 *
 * - les **déclarations attendues**, rangées dans `settings.criteria` : « la copie
 *   doit contenir une variable `total` de type entier », « une fonction
 *   `long factorielle(int)` », « une structure `Point` avec les champs `x` et
 *   `y` ». Le serveur les vérifie en compilant une sonde du type exact demandé ;
 *   une variable locale, invisible du dehors, se cherche dans le texte du
 *   programme ;
 * - les **tests d'exécution**, rangés dans la table des tests : des valeurs
 *   d'entrée typées et une sortie attendue, elle aussi typée. Un test peut viser
 *   un critère « fonction attendue » — il l'appelle alors directement et hérite
 *   de ses types — ou faire tourner le programme entier, en déclarant lui-même
 *   les types de ce qu'il lui envoie.
 *
 * Un exercice **algorithmique** a les mêmes deux familles, mais ses déclarations
 * se disent dans les mots du cours et non dans ceux du C : elles vivent dans
 * `algoBareme.js`, et se rangent dans la même liste `settings.criteria`.
 *
 * Ce catalogue double `backend/app/grading/bareme.py` et
 * `backend/app/grading/harness.py`. Tout type ou critère ajouté ici doit l'être
 * là aussi.
 */

import { describeAlgoCriterion, isAlgoCriterion } from './algoBareme';

export const VALUE_TYPES = {
  int: { key: 'int', label: 'Entier', c: 'int', input: 'number', example: '42' },
  short: { key: 'short', label: 'Entier court', c: 'short', input: 'number', example: '32000' },
  long: { key: 'long', label: 'Entier long', c: 'long', input: 'number', example: '2400000000' },
  float: {
    key: 'float',
    label: 'Décimal simple précision',
    c: 'float',
    input: 'number',
    step: 'any',
    example: '3.14',
  },
  double: {
    key: 'double',
    label: 'Nombre décimal',
    c: 'double',
    input: 'number',
    step: 'any',
    example: '3.14',
  },
  char: { key: 'char', label: 'Caractère', c: 'char', input: 'text', maxLength: 1, example: 'A' },
  bool: { key: 'bool', label: 'Booléen', c: 'int', input: 'bool', example: '1' },
  string: { key: 'string', label: 'Chaîne', c: 'char *', input: 'text', example: 'bonjour' },
  'short[]': {
    key: 'short[]',
    label: "Tableau d'entiers courts",
    c: 'short t[], int n',
    input: 'list',
    element: 'short',
    example: '3 1 4',
  },
  'int[]': {
    key: 'int[]',
    label: "Tableau d'entiers",
    c: 'int t[], int n',
    input: 'list',
    element: 'int',
    example: '3 1 4 1 5',
  },
  'long[]': {
    key: 'long[]',
    label: "Tableau d'entiers longs",
    c: 'long t[], int n',
    input: 'list',
    element: 'long',
    example: '2400000000 12',
  },
  'float[]': {
    key: 'float[]',
    label: 'Tableau de décimaux simple précision',
    c: 'float t[], int n',
    input: 'list',
    element: 'float',
    example: '1.5 2.5',
  },
  'double[]': {
    key: 'double[]',
    label: 'Tableau de décimaux',
    c: 'double t[], int n',
    input: 'list',
    element: 'double',
    example: '1.5 2.5',
  },
  'char[]': {
    key: 'char[]',
    label: 'Tableau de caractères',
    c: 'char t[], int n',
    input: 'list',
    element: 'char',
    example: 'A B C',
  },
  void: { key: 'void', label: 'Rien (affiche seulement)', c: 'void', input: 'none', returnsOnly: true },
};

export const PARAM_TYPES = Object.values(VALUE_TYPES).filter((t) => !t.returnsOnly);
export const RETURN_TYPES = Object.values(VALUE_TYPES);

/**
 * Les tableaux, rangés par le type de leurs éléments.
 *
 * L'enseignant ne choisit plus « tableau d'entiers » dans la longue liste des
 * types : il choisit « Tableau », puis le type d'un élément. Un tableau de
 * caractères ou de décimaux se demande alors aussi facilement qu'un tableau
 * d'entiers, sans allonger le sélecteur d'une entrée par combinaison.
 */
export const ARRAY_TYPES = Object.values(VALUE_TYPES).filter((t) => t.input === 'list');

/** La clé « tableau » (`int[]`) faite du type d'un élément (`int`). */
export function arrayOf(element) {
  return VALUE_TYPES[`${element}[]`] ? `${element}[]` : 'int[]';
}

/** Le type d'un élément (`int`) d'un type tableau (`int[]`). */
export function elementOf(key) {
  return valueType(key).element ?? 'int';
}

export function isArrayType(key) {
  return valueType(key).input === 'list';
}

/** Langages où le serveur sait vérifier une déclaration et appeler une fonction. */
export const DECLARATION_LANGUAGES = new Set(['c', 'cpp']);

/** Les familles de critères, dans l'ordre du sélecteur enseignant. */
export const CRITERION_KINDS = [
  {
    key: 'variable',
    label: 'Variable attendue',
    sample: 'int total;',
    hint: "Vérifie que la copie déclare cette variable, avec ce type.",
  },
  {
    key: 'function',
    label: 'Fonction attendue',
    sample: 'int somme(int a, int b)',
    hint: "Vérifie le nom, les types des paramètres et le type de retour. Les tests d'exécution peuvent l'appeler.",
  },
  {
    key: 'struct',
    label: 'Structure attendue',
    sample: 'struct Point { int x; }',
    hint: 'Vérifie que la structure existe et que ses champs ont les types demandés.',
  },
];

/** Les trois façons de comparer une sortie, dites en clair. */
export const COMPARISONS = [
  {
    key: 'trim',
    label: 'Souple',
    hint: 'ignore les espaces et les lignes vides en fin',
    exemple: '« 42 » et « 42   » passent tous les deux',
  },
  {
    key: 'exact',
    label: 'Exacte',
    hint: 'caractère par caractère',
    exemple: 'un espace de trop fait échouer le test',
  },
  {
    key: 'numeric',
    label: 'Numérique',
    hint: 'compare les nombres, à 10⁻⁶ près',
    exemple: '« 2.8 » et « 2.800001 » passent tous les deux',
  },
];

const KIND_BY_KEY = Object.fromEntries(CRITERION_KINDS.map((k) => [k.key, k]));

export function criterionKind(key) {
  return KIND_BY_KEY[key] ?? KIND_BY_KEY.variable;
}

export function valueType(key) {
  return VALUE_TYPES[key] ?? VALUE_TYPES.int;
}

let counter = 0;
function newId() {
  counter += 1;
  return `c${Date.now().toString(36)}${counter}`;
}

/** Un critère vierge de la famille demandée, prêt à être rempli. */
export function blankCriterion(kind = 'variable') {
  const base = { id: newId(), kind, points: 1, name: '' };
  if (kind === 'function') return { ...base, params: [], returns: 'int' };
  if (kind === 'struct') return { ...base, fields: [{ name: '', type: 'int' }] };
  return { ...base, vtype: 'int', scope: 'global', in_function: 'main' };
}

/** Les critères d'un exercice, en ignorant ce qui n'en est pas. */
export function criteriaOf(exercise) {
  const criteria = exercise?.settings?.criteria;
  if (!Array.isArray(criteria)) return [];
  return criteria.filter(
    (c) => c && typeof c === 'object' && (KIND_BY_KEY[c.kind] || isAlgoCriterion(c.kind)),
  );
}

/** Les critères « fonction attendue » : les seuls qu'un test puisse appeler. */
export function callableCriteria(exercise) {
  if (!DECLARATION_LANGUAGES.has(exercise?.language)) return [];
  return criteriaOf(exercise).filter((c) => c.kind === 'function' && c.name?.trim());
}

export function paramsOf(criterion) {
  const params = criterion?.params;
  return Array.isArray(params) ? params : [];
}

export function fieldsOf(criterion) {
  const fields = criterion?.fields;
  return Array.isArray(fields) ? fields : [];
}

function paramText(type, name) {
  const kind = valueType(type);
  return kind.input === 'list' ? `${kind.c.split(' ')[0]} ${name}[]` : `${kind.c} ${name}`;
}

/** Le critère tel qu'on le montre à l'enseignant et sur le sujet. */
export function describeCriterion(criterion) {
  if (isAlgoCriterion(criterion?.kind)) return describeAlgoCriterion(criterion);
  const name = criterion?.name?.trim() || '?';
  if (criterion?.kind === 'function') {
    const params = paramsOf(criterion)
      .map((p, i) => paramText(p.type, p.name || `a${i + 1}`))
      .join(', ');
    return `${valueType(criterion.returns).c} ${name}(${params || 'void'})`;
  }
  if (criterion?.kind === 'struct') {
    const fields = fieldsOf(criterion)
      .filter((f) => f.name?.trim())
      .map((f) => `${valueType(f.type).c} ${f.name}`)
      .join('; ');
    return fields ? `struct ${name} { ${fields}; }` : `struct ${name}`;
  }
  const scope =
    criterion?.scope === 'local'
      ? ` (dans ${criterion.in_function?.trim() || 'une fonction'})`
      : ' (globale)';
  return `${paramText(criterion?.vtype ?? 'int', name)}${scope}`;
}

/**
 * Le nom d'une ligne de barème.
 *
 * La plupart des critères en portent un — c'est ce qu'on exige de la copie. Une
 * structure attendue, elle, n'a rien à nommer : ce qu'on exige, c'est le bloc
 * lui-même, et c'est donc lui qui titre la ligne.
 */
export function criterionTitle(criterion) {
  const name = criterion?.name?.trim();
  if (name) return name;
  if (criterion?.kind === 'algo_structure') return describeAlgoCriterion(criterion);
  return '';
}

/** Une valeur telle qu'on l'écrirait dans du code, pour les résumés lisibles. */
export function formatValue(type, value) {
  const raw = String(value ?? '').trim();
  if (raw === '') return '…';
  const kind = valueType(type);
  if (kind.input === 'list') {
    const items = raw.split(/\s+/).map((item) => formatValue(kind.element ?? 'int', item));
    return `{${items.join(', ')}}`;
  }
  if (kind.input === 'bool') return raw === '0' ? 'faux' : 'vrai';
  if (type === 'char') return `'${raw}'`;
  // « void » : le test juge ce qui s'affiche, donc du texte.
  if (kind.input === 'text' || kind.input === 'none') return `"${raw.replace(/\n/g, ' ⏎ ')}"`;
  return raw;
}

/** Poids total du barème : les critères, plus les tests officiels. */
export function baremeWeight(criteria, tests) {
  const fromCriteria = criteria.reduce((sum, c) => sum + Number(c.points || 0), 0);
  const fromTests = (tests ?? [])
    .filter((t) => t.kind === 'official')
    .reduce((sum, t) => sum + Number(t.points || 0), 0);
  return Math.round((fromCriteria + fromTests) * 100) / 100;
}

/** Répartit également les points de l'exercice entre critères et tests officiels. */
export function distributeBareme(criteria, tests, total) {
  const official = (tests ?? []).filter((t) => t.kind === 'official');
  const count = criteria.length + official.length;
  if (count === 0) return { criteria, tests: tests ?? [] };
  const share = Math.round((Number(total) / count) * 100) / 100;
  return {
    criteria: criteria.map((c) => ({ ...c, points: share })),
    tests: (tests ?? []).map((t) => (t.kind === 'official' ? { ...t, points: share } : t)),
  };
}

/** Vrai tant que l'enseignant n'a pas demandé un barème ligne à ligne. */
export function isSimpleScoring(exercise) {
  return exercise?.settings?.scoring_mode !== 'custom';
}

/**
 * Le total de l'exercice partagé à parts égales entre tout ce qui note — les
 * déclarations exigées comme les tests officiels. C'est le barème simplifié,
 * recalculé chaque fois que le total de l'exercice change.
 */
export function autoDistribute(exercise) {
  const { criteria, tests } = distributeBareme(
    criteriaOf(exercise),
    exercise.tests,
    Number(exercise.points) || 0,
  );
  return { ...exercise, settings: { ...exercise.settings, criteria }, tests };
}

/** Types d'entrée d'un test : ceux du critère visé, ou ceux que le test déclare. */
export function inputTypesOf(test, criterion) {
  if (criterion) {
    return paramsOf(criterion).map((p, i) => ({
      name: p.name || `a${i + 1}`,
      type: p.type ?? 'int',
      locked: true,
    }));
  }
  const declared = Array.isArray(test?.input_types) ? test.input_types : [];
  return declared.map((type, i) => ({ name: `entrée ${i + 1}`, type, locked: false }));
}

/** Type de la valeur attendue : celui du critère visé, ou celui du test. */
export function expectedTypeOf(test, criterion) {
  if (criterion) return criterion.returns ?? 'int';
  return test?.expected_type ?? 'string';
}
