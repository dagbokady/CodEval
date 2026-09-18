/**
 * Vocabulaire de l'éditeur algorithmique.
 *
 * Un algorithme a toujours la même forme : celle du cours : un nom, une partie
 * déclarative (constantes, types, variables), puis un corps encadré par Début et
 * Fin. Ce squelette n'est pas un choix laissé à l'apprenant : il est posé par
 * l'éditeur et ne peut pas être défait. Ce que l'enseignant règle, exercice par
 * exercice, c'est l'outillage : quels éléments l'apprenant a le droit de poser
 * dans ce squelette.
 */

/**
 * Les éléments de la partie déclarative. Ils ne se posent qu'entre l'en-tête
 * ALGORITHME et DEBUT, chacun dans sa rubrique (CONSTANTES, TYPES, VARIABLES).
 */
export const DECLARATION_ELEMENTS = {
  constante: {
    group: 'Déclaration',
    section: 'constantes',
    label: 'Constante',
    rubrique: 'Constante',
    make: () => ({ nom: 'MAX', valeur: '100' }),
  },
  type: {
    group: 'Déclaration',
    section: 'types',
    label: 'Type (STRUCTURE)',
    rubrique: 'Type',
    make: () => ({
      nom: 'Etudiant',
      champs: [{ nom: 'nom', type: 'CHAINE' }, { nom: 'age', type: 'ENTIER' }],
      definition: 'nom : CHAINE, age : ENTIER',
    }),
  },
  declaration: {
    group: 'Déclaration',
    section: 'variables',
    label: 'Variable',
    rubrique: 'Variable',
    make: () => ({ nom: 'x', type: 'entier', taille: '' }),
  },
};

/** Types de données proposés dans la partie déclarative. */
export const DATA_TYPES = [
  { key: 'entier', label: 'entier' },
  { key: 'reel', label: 'réel' },
  { key: 'caractere', label: 'caractère' },
  { key: 'chaine', label: 'chaîne' },
  { key: 'booleen', label: 'booléen' },
  { key: 'tableau_entier', label: "tableau d'entiers", sized: true },
  { key: 'tableau_reel', label: 'tableau de réels', sized: true },
  { key: 'tableau_caractere', label: 'tableau de caractères', sized: true },
  { key: 'tableau_chaine', label: 'tableau de chaînes', sized: true },
  { key: 'tableau_booleen', label: 'tableau de booléens', sized: true },
  { key: 'pointeur', label: 'pointeur', pointer: true },
];

export const SIZED_TYPES = new Set(DATA_TYPES.filter((t) => t.sized).map((t) => t.key));

/** Les types de base tels qu'ils s'écrivent au cours, en capitales. */
export const SCALAR_TYPES = [
  { key: 'entier', label: 'ENTIER' },
  { key: 'reel', label: 'REEL' },
  { key: 'caractere', label: 'CARACTERE' },
  { key: 'chaine', label: 'CHAINE' },
  { key: 'booleen', label: 'BOOLEEN' },
];

const SCALAR_LABELS = Object.fromEntries(SCALAR_TYPES.map((t) => [t.key, t.label]));

/** Le type de base des cases d'un tableau : `tableau_reel` → `reel`. */
export function arrayElementType(type) {
  return String(type ?? '').startsWith('tableau_') ? type.slice('tableau_'.length) : null;
}

/**
 * Le type d'une variable tel qu'il s'écrit au cours : `ENTIER`,
 * `TABLEAU[1..MAX] DE REEL`, `^Etudiant`.
 */
export function typeNotation(type = 'entier', { taille, debut, cible } = {}) {
  const elements = arrayElementType(type);
  if (elements) {
    const fin = String(taille ?? '').trim();
    const label = SCALAR_LABELS[elements] ?? elements.toUpperCase();
    return fin ? `TABLEAU[${String(debut ?? '').trim() || '1'}..${fin}] DE ${label}` : `TABLEAU DE ${label}`;
  }
  if (type === 'pointeur') return `^${String(cible ?? '').trim()}`;
  return SCALAR_LABELS[type] ?? String(type).toUpperCase();
}

/** Les éléments du corps : les actions, entre Début et Fin. */
export const ELEMENTS = {
  lire: { group: 'Entrées / sorties', label: 'LIRE()', make: () => ({ type: 'lire', cible: 'n' }) },
  ecrire: {
    group: 'Entrées / sorties',
    label: 'ECRIRE()',
    make: () => ({ type: 'ecrire', expression: '' }),
  },
  si: {
    group: 'Conditions',
    label: 'SI … ALORS … FINSI',
    make: () => ({ type: 'si', condition: '', alors: [], sinon: [] }),
  },
  // Le SINON ne s'insère pas seul : c'est la seconde branche du SI. Il reste
  // autorisable à part, pour un exercice qui demande de s'en passer.
  sinon: { group: 'Conditions', label: 'SINON (branche du SI)', standalone: false },
  pour: {
    group: 'Boucles',
    label: 'POUR … FINPOUR',
    make: () => ({ type: 'pour', variable: 'i', debut: '1', fin: '', pas: '1', corps: [] }),
  },
  tantque: {
    group: 'Boucles',
    label: 'TANTQUE … FINTANTQUE',
    make: () => ({ type: 'tantque', condition: '', corps: [] }),
  },
  repeter: {
    group: 'Boucles',
    label: "REPETER … JUSQU'A",
    make: () => ({ type: 'repeter', condition: '', corps: [] }),
  },
  variable: {
    group: 'Structures',
    label: 'variable ← valeur (initialisation)',
    make: () => ({ type: 'variable', nom: 'x', valeur: '0' }),
  },
  tableau: {
    group: 'Structures',
    label: 'TABLEAU',
    make: () => ({ type: 'tableau', nom: 't', taille: 'n' }),
  },
  fonction: {
    group: 'Structures',
    label: 'FONCTION … FINFONCTION',
    make: () => ({ type: 'fonction', nom: 'f', parametres: [], typeRetour: 'ENTIER', corps: [] }),
  },
  affectation: {
    group: 'Opérateurs',
    label: '← (affectation)',
    make: () => ({ type: 'affectation', cible: 'x', expression: '' }),
  },
  retour: {
    group: 'Opérateurs',
    label: 'RETOURNE()',
    make: () => ({ type: 'retour', expression: '' }),
  },
};

/**
 * Tout ce que l'enseignant peut autoriser, déclarations comprises : c'est cette
 * table que lit l'écran « Outils autorisés ».
 */
export const ALL_ELEMENTS = { ...DECLARATION_ELEMENTS, ...ELEMENTS };

export const DEFAULT_ELEMENTS = [
  'constante', 'declaration',
  'lire', 'ecrire', 'si', 'sinon', 'pour', 'tantque', 'variable', 'tableau', 'affectation',
];

/** L'ordre des rubriques dans la partie déclarative, tel qu'il est enseigné. */
export const DECLARATION_SECTIONS = [
  { key: 'constantes', element: 'constante', label: 'Constante' },
  { key: 'types', element: 'type', label: 'Type' },
  { key: 'variables', element: 'declaration', label: 'Variable' },
];

/** Un algorithme vide, mais déjà structuré : le squelette existe toujours. */
export function emptyAlgorithm(nom = '') {
  return { nom, constantes: [], types: [], variables: [], corps: [] };
}

/**
 * Lit la production d'un apprenant.
 *
 * Les copies antérieures à la structure obligatoire ne contenaient que la liste
 * des blocs : on les relit comme le corps d'un algorithme sans déclarations,
 * pour qu'aucune copie déjà rendue ne devienne illisible.
 */
export function parseAlgorithm(value) {
  if (!value || !String(value).trim()) return emptyAlgorithm();
  let data;
  try {
    data = JSON.parse(value);
  } catch {
    return emptyAlgorithm();
  }
  if (Array.isArray(data)) return { ...emptyAlgorithm(), corps: data };
  if (!data || typeof data !== 'object') return emptyAlgorithm();
  return {
    nom: typeof data.nom === 'string' ? data.nom : '',
    constantes: Array.isArray(data.constantes) ? data.constantes : [],
    types: Array.isArray(data.types) ? data.types : [],
    variables: Array.isArray(data.variables) ? data.variables : [],
    corps: Array.isArray(data.corps) ? data.corps : Array.isArray(data.blocs) ? data.blocs : [],
  };
}

/** Les champs d'un enregistrement ; les anciens types n'avaient qu'une définition en texte. */
export function structFields(type) {
  if (Array.isArray(type?.champs)) return type.champs;
  return String(type?.definition ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [nom, ...reste] = part.split(':');
      return { nom: nom.trim(), type: reste.join(':').trim() };
    });
}

export function structDefinition(champs) {
  return champs.map((c) => `${c.nom} : ${c.type}`).join(', ');
}

export function serializeAlgorithm(doc) {
  return JSON.stringify(doc);
}

/** Vrai si l'algorithme ne contient encore rien de l'apprenant. */
export function isEmptyAlgorithm(doc) {
  return (
    !doc.nom?.trim() &&
    doc.constantes.length === 0 &&
    doc.types.length === 0 &&
    doc.variables.length === 0 &&
    doc.corps.length === 0
  );
}

/**
 * L'ordre des groupes d'outils, tel qu'il est enseigné : on déclare d'abord,
 * on lit et on écrit, puis on branche, on répète, on structure, on calcule.
 */
export const TOOL_GROUPS = [
  'Déclaration',
  'Entrées / sorties',
  'Conditions',
  'Boucles',
  'Structures',
  'Opérateurs',
];

/**
 * Les outils que l'enseignant peut autoriser, groupés dans l'ordre du cours.
 *
 * Tout ce que le vocabulaire connaît est autorisable, y compris ce qui ne se
 * pose pas seul : le SINON n'est pas un bloc qu'on insère, c'est la seconde
 * branche du SI : mais l'interdire a un sens (« traitez ce cas sans SINON »),
 * et le correcteur sait le refuser.
 */
export function toolGroups() {
  const byGroup = new Map(TOOL_GROUPS.map((group) => [group, []]));
  for (const [key, element] of Object.entries(ALL_ELEMENTS)) {
    if (!byGroup.has(element.group)) byGroup.set(element.group, []);
    byGroup.get(element.group).push({ key, ...element });
  }
  return [...byGroup.entries()]
    .filter(([, elements]) => elements.length > 0)
    .map(([group, elements]) => ({ group, elements }));
}

/** Toutes les clés autorisables, pour le bouton « tout autoriser ». */
export const ALL_ELEMENT_KEYS = Object.keys(ALL_ELEMENTS);
