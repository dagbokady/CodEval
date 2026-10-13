/**
 * Ce que l'éditeur sur la feuille sait d'un exercice, hors de tout affichage :
 * ce qui manque avant de publier, la forme d'un nouveau test, ce qu'un test
 * envoie au programme.
 */

import { callableCriteria, testIssues, valueType } from './bareme';
import { needsTests } from './exerciseTypes';
import { questionsOf } from './questions';
import { traceColumns, traceRows } from './trace';

/** Le test vierge des éditeurs : programme entier, comparaison souple. */
export const EMPTY_TEST = {
  id: null,
  name: 'Test',
  kind: 'official',
  target_id: null,
  input_types: [],
  expected_type: 'string',
  args: [],
  argv: [],
  stdin: '',
  expected_stdout: '',
  comparison: 'trim',
  points: 1,
  timeout_ms: 2000,
};

let counter = 0;
/** Une clé d'affichage pour ce qui n'a pas encore d'identifiant serveur. */
export function newKey(prefix = 'k') {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}`;
}

/** Nombre de lignes qu'occupe un texte dans un champ de `width` caractères. */
export function rowsFor(text, width = 84) {
  return String(text ?? '')
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / width)), 0);
}

/**
 * La comparaison d'un exercice : celle de ses tests quand ils s'accordent. Un
 * algorithme compare par défaut les nombres affichés : les messages de
 * l'apprenant (« Entrez un nombre : ») ne doivent pas faire échouer sa copie.
 */
export function comparisonOf(exercise) {
  const used = new Set((exercise.tests ?? []).map((t) => t.comparison ?? 'trim'));
  if (used.size === 1) return [...used][0];
  if (used.size > 1) return 'mixed';
  return exercise.kind === 'algo' ? 'last_numbers' : 'trim';
}

/** Un nouveau test du programme entier, réglé comme ceux qui l'entourent. */
export function newProgramTest(exercise) {
  const comparison = comparisonOf(exercise);
  return {
    ...EMPTY_TEST,
    _key: newKey('t'),
    name: `Test ${(exercise.tests ?? []).length + 1}`,
    comparison: comparison === 'mixed' ? 'trim' : comparison,
  };
}

/**
 * Ce que le test envoie sur l'entrée standard, en texte : celui qu'il porte,
 * ou celui que le correcteur fabrique de ses valeurs typées (même règle que
 * `harness.stdin_for` : un tableau descend en deux lignes, sa taille puis ses
 * éléments).
 */
export function stdinOf(test) {
  const types = Array.isArray(test?.input_types) ? test.input_types : [];
  if (types.length === 0) return test?.stdin ?? '';
  const args = Array.isArray(test.args) ? test.args : [];
  const lines = [];
  types.forEach((entry, index) => {
    const key = typeof entry === 'object' && entry ? entry.type : entry;
    const value = args[index];
    if (valueType(key).input === 'list') {
      const items = String(value ?? '').trim().split(/\s+/).filter(Boolean);
      lines.push(String(items.length), items.join(' '));
    } else {
      lines.push(String(value ?? ''));
    }
  });
  return lines.join('\n');
}

/**
 * Des questions de QCM collées depuis un traitement de texte : une question par
 * paragraphe, une proposition par ligne commencée par « - », la bonne par « * ».
 * Plusieurs « * » font une question à choix multiple.
 */
export function parseQcmText(text) {
  return String(text ?? '')
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const prompt = [];
      const choices = [];
      for (const line of block.split('\n').map((l) => l.trim()).filter(Boolean)) {
        const match = line.match(/^([-*+])\s*(.*)$/);
        if (match) choices.push({ text: match[2], correct: match[1] !== '-' });
        else prompt.push(line);
      }
      return {
        text: prompt.join(' '),
        multiple: choices.filter((c) => c.correct).length > 1,
        choices,
      };
    });
}

/** Les réglages d'un exercice à plusieurs questions, ses questions remplacées. */
export function withQuestions(settings, questions) {
  return { ...(settings ?? {}), questions };
}

/**
 * Ce qui manque à un exercice pour être corrigé juste. Vide : il est prêt.
 * Chaque message nomme l'endroit à reprendre, pour que l'enseignant y aille
 * sans chercher.
 */
export function exerciseIssues(exercise) {
  const issues = [];
  const kind = exercise.kind ?? 'code';
  if (!String(exercise.title ?? '').trim()) issues.push('Intitulé manquant');
  if ((kind === 'code' || kind === 'algo') && !String(exercise.statement ?? '').trim()) {
    issues.push('Énoncé manquant');
  }

  if (needsTests(kind)) {
    const tests = exercise.tests ?? [];
    const callable = callableCriteria(exercise);
    if (tests.length === 0) issues.push('Aucun test');
    tests.forEach((test, index) => {
      const problems = testIssues(test, callable);
      if (problems.length) issues.push(`Test ${index + 1} : ${problems[0]}`);
    });
  }

  if (kind === 'qcm') {
    questionsOf(kind, exercise.settings).forEach((question, index) => {
      const label = `Q${index + 1}`;
      const choices = (question.choices ?? []).filter((c) => String(c.text ?? '').trim());
      if (!String(question.text ?? '').trim()) issues.push(`${label} : question vide`);
      else if (choices.length < 2) issues.push(`${label} : au moins deux propositions`);
      else if (!(question.choices ?? []).some((c) => c.correct)) {
        issues.push(`${label} : entourez la bonne réponse`);
      }
    });
  }

  if (kind === 'matching') {
    questionsOf(kind, exercise.settings).forEach((question, index) => {
      const pairs = question.pairs ?? [];
      const label = `Q${index + 1}`;
      if (pairs.length < 2) issues.push(`${label} : au moins deux paires`);
      else if (pairs.some((p) => !String(p.left ?? '').trim() || !String(p.right ?? '').trim())) {
        issues.push(`${label} : paire incomplète`);
      }
    });
  }

  if (kind === 'short') {
    questionsOf(kind, exercise.settings).forEach((question, index) => {
      if (!String(question.text ?? '').trim()) issues.push(`Q${index + 1} : question vide`);
    });
  }

  if (kind === 'truefalse') {
    const statements = exercise.settings?.statements ?? [];
    if (statements.length === 0) issues.push('Aucune affirmation');
    statements.forEach((statement, index) => {
      if (!String(statement.text ?? '').trim()) issues.push(`Affirmation ${index + 1} vide`);
    });
  }

  if (kind === 'trace') {
    const columns = traceColumns(exercise.settings);
    const expected = traceRows(exercise.settings).some((row) =>
      row.some((cell, c) => columns[c] && !columns[c].given && cell.trim()),
    );
    if (!String(exercise.settings?.algorithm ?? '').trim()) issues.push('Algorithme manquant');
    else if (!expected) issues.push('Aucune case attendue dans le tableau');
  }

  if (!(Number(exercise.points) > 0)) issues.push('Aucun point');
  return issues;
}
