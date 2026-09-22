/**
 * Valeurs de départ d'une nouvelle évaluation, réglées par l'enseignante dans
 * ses paramètres.
 *
 * Elles restent sur le poste, comme le thème : le serveur ne connaît pas encore
 * de préférences par compte. Elles ne pré-remplissent que les évaluations
 * créées ensuite : une évaluation existante garde ses propres réglages.
 */

import { EVAL_KIND_LABELS } from './format';

const STORAGE_KEY = 'codeval.evaluation-defaults';

export const FACTORY_DEFAULTS = {
  kind: 'devoir',
  language: 'c',
  duration_minutes: 90,
  total_points: 20,
  rules: {
    fullscreen: true,
    block_paste: true,
    allow_early_submit: true,
    track_focus: true,
    // Une sortie d'épreuve, et la copie se ferme : c'est la règle par défaut,
    // celle qu'un surveillant applique en salle. L'enseignant peut l'assouplir.
    max_incidents: 1,
    // Passé ce délai après l'ouverture, un étudiant qui n'est pas encore entré
    // dans l'épreuve ne le peut plus. 0 : l'entrée reste ouverte jusqu'à la fin.
    late_entry_minutes: 0,
    // La classe voit qu'une épreuve l'attend. L'enseignant peut préparer une
    // interrogation sans l'annoncer : elle n'apparaîtra qu'à son ouverture.
    announce_to_students: true,
    // Une fois les notes publiées, chaque exercice s'accompagne de son corrigé.
    show_solutions: true,
  },
};

export function readEvaluationDefaults() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!stored || typeof stored !== 'object') return FACTORY_DEFAULTS;
    return {
      ...FACTORY_DEFAULTS,
      ...stored,
      rules: { ...FACTORY_DEFAULTS.rules, ...stored.rules },
    };
  } catch {
    return FACTORY_DEFAULTS; // navigation privée, stockage refusé ou valeur corrompue
  }
}

export function saveEvaluationDefaults(defaults) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
    return true;
  } catch {
    return false;
  }
}

export function resetEvaluationDefaults() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* rien à effacer */
  }
  return FACTORY_DEFAULTS;
}

/** Les types d'évaluation, avec ce qui les distingue pour l'enseignante. */
export const EVALUATION_KINDS = [
  { value: 'devoir', label: EVAL_KIND_LABELS.devoir, hint: 'Travail long, sujet complet' },
  { value: 'interro', label: EVAL_KIND_LABELS.interro, hint: 'Courte, vérifie une notion' },
  { value: 'examen', label: EVAL_KIND_LABELS.examen, hint: 'Épreuve surveillée, notée' },
];

/** Les modalités de passage, telles qu'on les présente partout. */
export const RULE_SWITCHES = [
  ['fullscreen', 'Mode plein écran obligatoire', "L'apprenant ne peut pas quitter l'onglet pendant l'épreuve."],
  ['block_paste', 'Bloquer le copier-coller', 'Désactive le collage de code externe dans l’éditeur.'],
  ['allow_early_submit', 'Autoriser la soumission anticipée', 'L’apprenant peut rendre sa copie avant la fin.'],
  ['track_focus', 'Détecter les sorties d’épreuve', 'Changement d’onglet, perte de focus et sortie du plein écran sont journalisés.'],
];

export const DURATION_PRESETS = [30, 60, 90, 120, 180];
