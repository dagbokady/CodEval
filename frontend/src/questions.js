/**
 * Exercices à plusieurs questions : QCM, correspondance, question-réponse.
 *
 * Un exercice de ces types n'a pas d'énoncé unique : il porte une liste de
 * questions, chacune avec son intitulé et son corrigé, rangées dans
 * `settings.questions`. Le barème de l'exercice se partage également entre elles.
 *
 * Les exercices d'avant cette évolution rangeaient leur unique question à plat
 * dans `settings` : on les relit ici comme une liste d'un élément, côté serveur
 * comme côté navigateur, plutôt que de réécrire la base.
 */

const MULTI_QUESTION_KINDS = new Set(['qcm', 'matching', 'short']);

const LEGACY_FIELDS = {
  qcm: ['choices', 'multiple'],
  matching: ['pairs', 'right_options'],
  short: ['accepted', 'keywords_mode', 'rows'],
};

const BLANKS = {
  qcm: () => ({
    text: '',
    multiple: false,
    choices: [{ text: '', correct: false }, { text: '', correct: false }],
  }),
  matching: () => ({ text: '', pairs: [{ left: '', right: '' }, { left: '', right: '' }] }),
  short: () => ({ text: '', accepted: [], keywords_mode: false, rows: 4 }),
};

function isMultiQuestion(kind) {
  return MULTI_QUESTION_KINDS.has(kind);
}

/** Une question vierge du type demandé, prête à être remplie. */
export function blankQuestion(kind) {
  return (BLANKS[kind] ?? BLANKS.short)();
}

/** Les questions d'un exercice, ancienne forme à plat comprise. */
export function questionsOf(kind, settings) {
  if (!isMultiQuestion(kind)) return [];
  const source = settings ?? {};
  if (Array.isArray(source.questions)) {
    return source.questions.filter((question) => question && typeof question === 'object');
  }
  const legacy = {};
  for (const field of LEGACY_FIELDS[kind]) {
    if (field in source) legacy[field] = source[field];
  }
  return [{ ...blankQuestion(kind), text: '', ...legacy }];
}

/** Les réponses de l'apprenant, une par question, ancienne production comprise. */
export function answersOf(kind, value, count) {
  const blanks = Array.from({ length: Math.max(count, 0) }, () => null);
  const text = (value ?? '').trim();
  if (!text) return blanks;

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    // Question-réponse d'autrefois : la production était le texte brut.
    data = kind === 'short' ? { text } : null;
  }

  const given = Array.isArray(data?.questions) ? data.questions : [data];
  return blanks.map((_, index) => given[index] ?? null);
}

/** Production complète, à partir des réponses question par question. */
export function packAnswers(answers) {
  return JSON.stringify({ questions: answers });
}
