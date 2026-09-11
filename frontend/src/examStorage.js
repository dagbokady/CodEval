/**
 * Brouillons d'épreuve conservés sur le poste de l'apprenant.
 *
 * La frappe n'écrit que dans le navigateur : aucune requête réseau tant que le
 * travail n'est pas envoyé. Le serveur ne reçoit la production qu'à la
 * soumission, à l'expiration du temps, ou lorsque la page est quittée.
 */

const key = (evaluationId, exerciseId) => `codeval.exam.${evaluationId}.${exerciseId}`;

export function readDraft(evaluationId, exerciseId) {
  try {
    const raw = localStorage.getItem(key(evaluationId, exerciseId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeDraft(evaluationId, exerciseId, code) {
  try {
    localStorage.setItem(
      key(evaluationId, exerciseId),
      JSON.stringify({ code, at: new Date().toISOString() }),
    );
    return true;
  } catch {
    return false; // navigation privée ou quota atteint : on continue en mémoire
  }
}

export function clearDrafts(evaluationId, exerciseIds) {
  exerciseIds.forEach((id) => {
    try {
      localStorage.removeItem(key(evaluationId, id));
    } catch {
      /* rien à faire */
    }
  });
}

/** Brouillons locaux plus récents que la dernière version connue du serveur. */
export function restoreDrafts(evaluationId, exercises, serverDrafts) {
  const restored = {};
  exercises.forEach((exercise) => {
    const local = readDraft(evaluationId, exercise.id);
    if (local && local.code !== (serverDrafts[exercise.id] ?? '')) {
      restored[exercise.id] = local.code;
    }
  });
  return restored;
}

// ── Incidents hors ligne ──────────────────────────────────────────────
const incidentsKey = (evaluationId) => `codeval.exam.${evaluationId}.pendingIncidents`;

export function pushOfflineIncident(evaluationId, type) {
  try {
    const raw = localStorage.getItem(incidentsKey(evaluationId));
    const list = raw ? JSON.parse(raw) : [];
    list.push({ type, at: new Date().toISOString() });
    localStorage.setItem(incidentsKey(evaluationId), JSON.stringify(list));
  } catch { /* quota ou navigation privée */ }
}

export function readOfflineIncidents(evaluationId) {
  try {
    const raw = localStorage.getItem(incidentsKey(evaluationId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function clearOfflineIncidents(evaluationId) {
  try { localStorage.removeItem(incidentsKey(evaluationId)); } catch { /* */ }
}

// ── Snapshot final (timer expiré hors ligne) ──────────────────────────
const snapshotKey = (evaluationId) => `codeval.exam.${evaluationId}.finalSnapshot`;

export function writeFinalSnapshot(evaluationId, editsMap) {
  try {
    localStorage.setItem(
      snapshotKey(evaluationId),
      JSON.stringify({ edits: editsMap, at: new Date().toISOString() }),
    );
  } catch { /* */ }
}

export function readFinalSnapshot(evaluationId) {
  try {
    const raw = localStorage.getItem(snapshotKey(evaluationId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function clearFinalSnapshot(evaluationId) {
  try { localStorage.removeItem(snapshotKey(evaluationId)); } catch { /* */ }
}
