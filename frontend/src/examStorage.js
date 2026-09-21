/**
 * Brouillons d'épreuve conservés sur le poste de l'apprenant.
 *
 * La frappe écrit d'abord dans le navigateur ; le travail part ensuite au
 * serveur en arrière-plan, à intervalles réguliers, puis à la soumission, à la
 * clôture et au départ de la page. Un brouillon garde la trace de son envoi :
 * s'il n'a pas été transmis, il sera renvoyé à la prochaine occasion.
 */

const prefix = (evaluationId) => `codeval.exam.${evaluationId}.`;
const key = (evaluationId, exerciseId) => `${prefix(evaluationId)}${exerciseId}`;

function readDraft(evaluationId, exerciseId) {
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
      JSON.stringify({ code, at: new Date().toISOString(), synced: false }),
    );
    return true;
  } catch {
    return false; // navigation privée ou quota atteint : on continue en mémoire
  }
}

/** Le serveur a reçu ce code : le brouillon n'est plus « en attente d'envoi ». */
export function markSynced(evaluationId, exerciseId, code) {
  const draft = readDraft(evaluationId, exerciseId);
  if (!draft || draft.code !== code) return;
  try {
    localStorage.setItem(key(evaluationId, exerciseId), JSON.stringify({ ...draft, synced: true }));
  } catch {
    /* rien à faire */
  }
}

/** Brouillons restés sur le poste sans avoir été transmis au serveur. */
export function unsentDrafts(evaluationId) {
  const found = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i);
      if (!name?.startsWith(prefix(evaluationId))) continue;
      const exerciseId = name.slice(prefix(evaluationId).length);
      if (!/^\d+$/.test(exerciseId)) continue;
      const draft = readDraft(evaluationId, exerciseId);
      if (draft && draft.synced === false) found.push({ exerciseId: Number(exerciseId), code: draft.code });
    }
  } catch {
    /* stockage indisponible */
  }
  return found;
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
