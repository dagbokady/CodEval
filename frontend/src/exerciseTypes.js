/**
 * Catalogue des types de question : source unique de vérité.
 *
 * Créer une question commence toujours par choisir son type : c'est lui qui
 * décide de l'éditeur proposé à l'enseignant, du rendu sur le sujet, de l'outil
 * de réponse de l'apprenant et du mode de correction. Éditeur d'évaluation,
 * banque d'exercices, feuille de sujet et copie corrigée lisent tous cette
 * table, pour qu'un type ajouté ici apparaisse partout du même coup.
 */

import { blankQuestion } from './questions';
import { DEFAULT_ELEMENTS } from './algoVocabulary';

const EXERCISE_TYPES = [
  {
    key: 'qcm',
    badge: 'QCM',
    label: 'QCM',
    tagline: 'Question à choix multiples',
    description: "L'apprenant coche une ou plusieurs propositions parmi celles que vous écrivez.",
    family: 'Questions fermées',
    grading: 'auto',
    sheetTitle: 'QUESTIONS À CHOIX MULTIPLES (QCM)',
    needsTests: false,
    usesLanguage: false,
    multiQuestion: true,
    gradingNote:
      'La correction est automatique : les points sont attribués selon les réponses cochées.',
    defaults: () => ({ questions: [blankQuestion('qcm')] }),
  },
  {
    key: 'matching',
    badge: 'Correspondance',
    label: 'Correspondance',
    tagline: 'Relier gauche ↔ droite',
    description:
      "L'apprenant relie chaque élément de la colonne de gauche à celui qui lui correspond à droite.",
    family: 'Questions fermées',
    grading: 'auto',
    sheetTitle: 'QUESTIONS DE CORRESPONDANCE',
    needsTests: false,
    usesLanguage: false,
    multiQuestion: true,
    gradingNote:
      'La correction est automatique : chaque paire correctement reliée rapporte des points.',
    defaults: () => ({ questions: [blankQuestion('matching')] }),
  },
  {
    key: 'truefalse',
    badge: 'Vrai/Faux',
    label: 'Vrai ou Faux',
    tagline: 'Affirmations à trancher',
    description:
      "Une suite d'affirmations ; l'apprenant déclare chacune vraie ou fausse.",
    family: 'Questions fermées',
    grading: 'auto',
    sheetTitle: 'QUESTIONS VRAI / FAUX',
    needsTests: false,
    usesLanguage: false,
    gradingNote:
      'La correction est automatique : chaque affirmation vaut une part égale du barème.',
    defaults: () => ({
      statements: [{ text: '', answer: true }, { text: '', answer: false }],
    }),
  },
  {
    key: 'short',
    badge: 'Question-réponse',
    label: 'Question-réponse',
    tagline: 'Définitions et réponses rédigées',
    description:
      "L'apprenant rédige sa réponse. Indiquez les formulations acceptées pour une correction automatique, ou laissez vide pour corriger à la main.",
    family: 'Questions ouvertes',
    grading: 'mixed',
    sheetTitle: 'QUESTIONS DE COURS',
    needsTests: false,
    usesLanguage: false,
    multiQuestion: true,
    gradingNote:
      "Correction automatique si vous listez les réponses acceptées ; sinon la question vous est signalée pour une correction manuelle.",
    defaults: () => ({ questions: [blankQuestion('short')] }),
  },
  {
    key: 'code',
    badge: 'Code',
    label: 'Exercice pratique : code',
    tagline: 'Programme à écrire',
    description:
      "L'apprenant écrit un programme dans l'éditeur de code. Corrigé par jeux de tests.",
    family: 'Exercices pratiques',
    grading: 'tests',
    sheetTitle: 'EXERCICES DE PROGRAMMATION',
    needsTests: true,
    usesLanguage: true,
    gradingNote:
      'La correction exécute le programme sur vos jeux de tests officiels.',
    defaults: () => ({}),
  },
  {
    key: 'algo',
    badge: 'Algorithmique',
    label: 'Exercice pratique : algorithmique',
    tagline: 'Algorithme en blocs',
    description:
      "L'apprenant compose un algorithme avec les blocs que vous autorisez. Corrigé par jeux de tests.",
    family: 'Exercices pratiques',
    grading: 'tests',
    sheetTitle: "EXERCICES D'ALGORITHMIQUE",
    needsTests: true,
    usesLanguage: false,
    gradingNote:
      "L'algorithme est traduit puis exécuté sur vos jeux de tests officiels.",
    // Un exercice algorithmique naît avec le vocabulaire de base déjà autorisé :
    // l'étape « outils » part d'un état écrit, et l'exercice garde trace de ce
    // qui était permis le jour où il a été créé.
    defaults: () => ({ allowed_elements: [...DEFAULT_ELEMENTS], ecriture_cours: true }),
  },
];

const BY_KEY = Object.fromEntries(EXERCISE_TYPES.map((type) => [type.key, type]));

/** Type d'une question, avec repli sur « code » pour les données antérieures. */
export function exerciseType(kind) {
  return BY_KEY[kind] ?? BY_KEY.code;
}

/** Les familles dans l'ordre du catalogue, pour le sélecteur de type. */
export function typeFamilies() {
  const families = [];
  for (const type of EXERCISE_TYPES) {
    const found = families.find((f) => f.name === type.family);
    if (found) found.types.push(type);
    else families.push({ name: type.family, types: [type] });
  }
  return families;
}

/** Étiquettes courtes (listes, badges, résumés), indexées par type. */
export const KIND_LABELS = Object.fromEntries(
  EXERCISE_TYPES.map((type) => [type.key, type.badge]),
);

/**
 * Types dont l'exercice porte plusieurs questions : leur énoncé se lit question
 * par question, l'exercice lui-même n'en a donc pas.
 */
export function hasQuestions(kind) {
  return Boolean(exerciseType(kind).multiQuestion);
}

/** Types corrigés par jeux de tests : les seuls à ouvrir l'étape « Barème & tests ». */
export function needsTests(kind) {
  return exerciseType(kind).needsTests;
}

/**
 * Types composés dans un langage de programmation : c'est-à-dire l'exercice de
 * code, et lui seul. Un algorithme s'écrit en blocs de pseudo-code : demander
 * « quel langage ? » à une épreuve qui n'en contient aucun n'a pas de réponse.
 */
export function usesLanguage(kind) {
  return (kind ?? 'code') === 'code';
}

/** Une épreuve n'a de langage que si elle demande au moins un exercice de code. */
export function evaluationUsesLanguage(exercises) {
  if (!exercises || exercises.length === 0) return true;
  return exercises.some((exercise) => usesLanguage(exercise.kind));
}

/**
 * Le langage qu'impose la matière de l'épreuve.
 *
 * `null` : une matière d'algorithmique, où l'on compose en pseudo-code et où
 * aucun langage n'est à choisir. Une clé (`'c'`, `'python'`…) : le cours de ce
 * langage, qui le fixe d'office. `undefined` : la matière ne dit rien, le choix
 * reste à l'enseignant.
 */
export function subjectLanguage(subjectName) {
  const name = String(subjectName ?? '').toLowerCase();
  if (!name) return undefined;
  if (/algo/.test(name)) return null;
  if (/c\+\+|\bcpp\b/.test(name)) return 'cpp';
  if (/python/.test(name)) return 'python';
  if (/(^|langage |programmation )c\b(?!\+)|^c$/.test(name)) return 'c';
  return undefined;
}
