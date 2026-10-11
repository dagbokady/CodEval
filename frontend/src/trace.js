/**
 * Simulation d'algorithme : le tableau de simulation.
 *
 * L'enseignant donne l'algorithme (`settings.algorithm`) et le tableau attendu :
 * ses colonnes (`settings.columns`, chacune `{ title, given }`) et ses lignes
 * (`settings.rows`). Une colonne « fournie » (le numéro d'instruction, souvent)
 * est recopiée sur la feuille de l'apprenant ; les autres arrivent vides. La
 * copie est le document `{"cells": [[…], …]}`, aux dimensions du tableau.
 *
 * Ce module double `backend/app/grading/trace.py`, qui seul sait noter une case.
 */

export const MAX_COLUMNS = 12;
export const MAX_ROWS = 80;

/** Le tableau qu'un exercice de simulation propose à sa création. */
export function defaultTrace() {
  return {
    algorithm: '',
    columns: [
      { title: 'N° instruction', given: true },
      { title: 'Variable 1', given: false },
      { title: 'Écran', given: false },
    ],
    rows: [
      ['1', '', ''],
      ['2', '', ''],
    ],
  };
}

/** Les colonnes déclarées, toujours sous la forme `{ title, given }`. */
export function traceColumns(settings) {
  const columns = Array.isArray(settings?.columns) ? settings.columns : [];
  return columns.map((column) =>
    column && typeof column === 'object'
      ? { title: String(column.title ?? ''), given: Boolean(column.given) }
      : { title: String(column ?? ''), given: false },
  );
}

/** Les lignes du tableau, chacune ramenée au nombre de colonnes. */
export function traceRows(settings) {
  const width = traceColumns(settings).length;
  const rows = Array.isArray(settings?.rows) ? settings.rows : [];
  return rows.map((row) =>
    Array.from({ length: width }, (_, c) => (Array.isArray(row) ? String(row[c] ?? '') : '')),
  );
}

/** Les cases de la copie, aux dimensions du tableau ; vides à défaut. */
export function readTrace(value, height, width) {
  let cells = [];
  try {
    const parsed = JSON.parse(value || 'null');
    if (Array.isArray(parsed?.cells)) cells = parsed.cells;
  } catch {
    /* copie vide ou illisible : tableau vierge */
  }
  return Array.from({ length: height }, (_, r) =>
    Array.from({ length: width }, (_, c) => {
      const row = Array.isArray(cells[r]) ? cells[r] : [];
      return String(row[c] ?? '');
    }),
  );
}

export function packTrace(cells) {
  return JSON.stringify({ cells });
}

/**
 * Le verdict de chaque case notée, tiré du détail de correction : `"r:c"` →
 * `{ passed, expected }`. Le serveur seul compare ; on ne fait que relire.
 */
export function traceVerdicts(details) {
  const verdicts = new Map();
  for (const detail of details ?? []) {
    if (Number.isInteger(detail?.row) && Number.isInteger(detail?.col)) {
      verdicts.set(`${detail.row}:${detail.col}`, detail);
    }
  }
  return verdicts;
}

/**
 * La largeur de chaque colonne, en caractères : celle de son titre ou de sa plus
 * longue case. Une colonne « Écran » qui reçoit « Note Numéro : 1 » doit le
 * montrer en entier plutôt que le tronquer.
 */
export function traceWidths(columns, grids, { cap = 36, extra = 2 } = {}) {
  return columns.map((column, c) => {
    let longest = column.title.length;
    for (const grid of grids) {
      for (const row of grid ?? []) longest = Math.max(longest, String(row?.[c] ?? '').length);
    }
    return `${Math.min(cap, Math.max(5, longest)) + extra}ch`;
  });
}
