/**
 * Vocabulaire de l'éditeur algorithmique.
 *
 * Un algorithme a toujours la forme du cours d'Initiation à l'algorithmique :
 * un nom, une partie déclarative (CONSTANTES, TYPES, VARIABLES), un corps entre
 * DEBUT et FIN, puis, après FIN, ses sous-programmes (FONCTION, PROCEDURE). Ce
 * squelette n'est pas un choix laissé à l'apprenant : il est posé par l'éditeur
 * et ne peut pas être défait. Ce que l'enseignant règle, exercice par exercice,
 * c'est l'outillage : quels éléments l'apprenant a le droit de poser.
 *
 * Ce vocabulaire double `backend/app/grading/algo.py`, qui traduit le document
 * en Python pour la correction : un élément ajouté ici doit l'être là aussi.
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
    apercu: 'NOM = valeur',
    aide: 'Une valeur nommée qui ne change pas : MAX = 50, TVA = 19,6.',
    make: () => ({ nom: '', valeur: '' }),
  },
  type: {
    group: 'Déclaration',
    section: 'types',
    label: 'Type',
    apercu: 'Nom : STRUCTURE … FINSTRUCTURE',
    aide: 'Un enregistrement (STRUCTURE) ou un type tableau nommé.',
    make: () => ({ nom: '', genre: 'structure', champs: [{ nom: '', type: 'ENTIER' }] }),
  },
  declaration: {
    group: 'Déclaration',
    section: 'variables',
    label: 'Variable',
    apercu: 'nom : TYPE',
    aide: 'Toute variable utilisée doit être déclarée avec son type.',
    make: () => ({ nom: '', type: 'entier', taille: '' }),
  },
};

/** Types de données proposés à l'enseignant (barème) et à l'apprenant. */
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
  { key: 'nomme', label: 'type déclaré (enregistrement…)' },
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
const SCALAR_WORDS = new Set(SCALAR_TYPES.map((t) => t.label));

/** Le type de base des cases d'un tableau : `tableau_reel` → `reel`. */
export function arrayElementType(type) {
  return String(type ?? '').startsWith('tableau_') ? type.slice('tableau_'.length) : null;
}

/**
 * Le type d'une variable tel qu'il s'écrit au cours : `ENTIER`,
 * `TABLEAU[1..MAX] DE REEL`, `TABLEAU[1..10][1..10] DE ENTIER`, `Etudiant`,
 * `^Etudiant`.
 */
export function typeNotation(type = 'entier', { taille, debut, taille2, debut2, cible } = {}) {
  const elements = arrayElementType(type);
  if (elements) {
    const label =
      elements === 'nomme'
        ? String(cible ?? '').trim() || '?'
        : (SCALAR_LABELS[elements] ?? elements.toUpperCase());
    const dims = [
      [debut, taille],
      [debut2, taille2],
    ]
      .filter(([, fin]) => String(fin ?? '').trim())
      .map(([d, fin]) => `[${String(d ?? '').trim() || '1'}..${String(fin).trim()}]`)
      .join('');
    return `TABLEAU${dims} DE ${label}`;
  }
  if (type === 'nomme') return String(cible ?? '').trim() || '?';
  if (type === 'pointeur') return `^${String(cible ?? '').trim()}`;
  return SCALAR_LABELS[type] ?? String(type).toUpperCase();
}

/**
 * Les éléments du corps. `apercu` est l'élément tel qu'il s'écrit au cours : ce
 * qui est en capitales est un mot-clé, le reste est à remplir. `racine`
 * signale ce qui ne se pose qu'après FIN (les sous-programmes) ; `branche`, ce
 * qui n'est pas un bloc mais la branche d'un autre (SINON, SINONSI) ; `herite`,
 * ce que les premières versions proposaient et que le cours n'emploie pas.
 */
export const ELEMENTS = {
  lire: {
    group: 'Entrées / sorties',
    label: 'LIRE',
    apercu: 'LIRE(variable)',
    aide: "Range dans la variable ce que l'utilisateur tape. LIRE(j, m, a) en lit plusieurs.",
    make: () => ({ type: 'lire', cible: '' }),
  },
  ecrire: {
    group: 'Entrées / sorties',
    label: 'ECRIRE',
    apercu: 'ECRIRE("texte", valeur)',
    aide: 'Affiche sans passer à la ligne. Ajoutez CRLF pour passer à la ligne.',
    make: () => ({ type: 'ecrire', expression: '' }),
  },
  affectation: {
    group: 'Affectation',
    label: 'Affectation',
    apercu: 'variable ← expression',
    aide: 'Range la valeur de l’expression dans la variable (ou la case t[i], le champ e.nom).',
    make: () => ({ type: 'affectation', cible: '', expression: '' }),
  },
  si: {
    group: 'Conditions',
    label: 'SI',
    apercu: 'SI condition ALORS … FINSI',
    aide: 'Exécute les instructions seulement si la condition est vraie.',
    make: () => ({ type: 'si', condition: '', alors: [], sinonsi: [], sinon: [] }),
  },
  sinonsi: {
    group: 'Conditions',
    label: 'SINONSI',
    apercu: 'SINONSI condition ALORS',
    aide: 'Une autre condition, testée si les précédentes sont fausses (dans un SI).',
    branche: true,
  },
  sinon: {
    group: 'Conditions',
    label: 'SINON',
    apercu: 'SINON',
    aide: 'Ce qui s’exécute quand la condition du SI est fausse.',
    branche: true,
  },
  selon: {
    group: 'Conditions',
    label: 'SELON',
    apercu: 'SELON expression DANS … FINSELON',
    aide: 'Choix multiple : un cas par valeur possible, et SINON pour les autres.',
    make: () => ({
      type: 'selon',
      expression: '',
      cas: [{ valeurs: '', corps: [] }],
      autre: [],
    }),
  },
  pour: {
    group: 'Boucles',
    label: 'POUR',
    apercu: 'POUR i de 1 à n FAIRE … FINPOUR',
    aide: 'Répète un nombre connu de fois. « par pas de -1 » compte à rebours.',
    make: () => ({ type: 'pour', variable: 'i', debut: '1', fin: '', pas: '1', corps: [] }),
  },
  tantque: {
    group: 'Boucles',
    label: 'TANTQUE',
    apercu: 'TANTQUE condition FAIRE … FINTANTQUE',
    aide: 'Répète tant que la condition est vraie ; elle est testée avant chaque tour.',
    make: () => ({ type: 'tantque', condition: '', corps: [] }),
  },
  repeter: {
    group: 'Boucles',
    label: 'REPETER',
    apercu: "REPETER … JUSQU'A condition",
    aide: 'Répète jusqu’à ce que la condition devienne vraie ; au moins un tour.',
    make: () => ({ type: 'repeter', condition: '', corps: [] }),
  },
  fonction: {
    group: 'Sous-programmes',
    label: 'FONCTION',
    apercu: 'FONCTION nom(p : TYPE) : TYPE',
    aide: 'Calcule et RETOURNE une valeur. Elle se déclare après le FIN de l’algorithme.',
    racine: true,
    make: () => ({
      type: 'fonction',
      nom: '',
      parametres: [{ nom: '', type: 'ENTIER', mode: 'E' }],
      typeRetour: 'ENTIER',
      variables: [],
      corps: [],
    }),
  },
  procedure: {
    group: 'Sous-programmes',
    label: 'PROCEDURE',
    apercu: 'PROCEDURE nom((E) p : TYPE, (S) q : TYPE)',
    aide: 'Exécute des actions ; ses paramètres (S) et (E/S) rendent des valeurs. Après FIN.',
    racine: true,
    make: () => ({
      type: 'procedure',
      nom: '',
      parametres: [{ nom: '', type: 'ENTIER', mode: 'E' }],
      variables: [],
      corps: [],
    }),
  },
  appel: {
    group: 'Sous-programmes',
    label: 'Appel de procédure',
    apercu: 'nomProcedure(arguments)',
    aide: 'Exécute une procédure déclarée après FIN.',
    implicite: true,
    make: () => ({ type: 'appel', nom: '', arguments: '' }),
  },
  retour: {
    group: 'Sous-programmes',
    label: 'RETOURNER',
    apercu: 'RETOURNER(expression)',
    aide: 'Dans une fonction : rend le résultat et termine la fonction.',
    make: () => ({ type: 'retour', expression: '' }),
  },
  allouer: {
    group: 'Pointeurs',
    label: 'ALLOUER',
    apercu: 'ALLOUER(p)',
    aide: 'Réserve une zone du type pointé et range son adresse dans p (déclaré p : ^Type). On y accède par p^ ou p^.champ.',
    make: () => ({ type: 'allouer', cible: '' }),
  },
  liberer: {
    group: 'Pointeurs',
    label: 'LIBERER',
    apercu: 'LIBERER(p)',
    aide: 'Rend la zone désignée par p ; p ne désigne plus rien (NIL).',
    make: () => ({ type: 'liberer', cible: '' }),
  },
};

/**
 * Tout ce que l'enseignant peut autoriser, déclarations comprises : c'est cette
 * table que lit l'écran « Outils autorisés ».
 */
const ALL_ELEMENTS = { ...DECLARATION_ELEMENTS, ...ELEMENTS };

/** Le vocabulaire de base d'un nouvel exercice : de quoi écrire les premiers TD. */
export const DEFAULT_ELEMENTS = [
  'constante', 'declaration',
  'lire', 'ecrire', 'affectation', 'si', 'sinon', 'pour', 'tantque',
];

/** L'ordre des rubriques dans la partie déclarative, tel qu'il est enseigné. */
export const DECLARATION_SECTIONS = [
  { key: 'constantes', element: 'constante', label: 'Constante', titre: 'CONSTANTES' },
  { key: 'types', element: 'type', label: 'Type', titre: 'TYPES' },
  { key: 'variables', element: 'declaration', label: 'Variable', titre: 'VARIABLES' },
];

/** Un algorithme vide, mais déjà structuré : le squelette existe toujours. */
export function emptyAlgorithm(nom = '') {
  return { nom, constantes: [], types: [], variables: [], corps: [], sousProgrammes: [] };
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
  const liste = (v) => (Array.isArray(v) ? v : []);
  return {
    nom: typeof data.nom === 'string' ? data.nom : '',
    constantes: liste(data.constantes),
    types: liste(data.types),
    variables: liste(data.variables),
    corps: Array.isArray(data.corps) ? data.corps : liste(data.blocs),
    sousProgrammes: liste(data.sousProgrammes),
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

/** La définition d'un type tableau nommé : `TABLEAU[1..MAX] DE CARACTERE`. */
export function arrayTypeDefinition(type) {
  const element = String(type.element ?? '').trim() || 'ENTIER';
  const dims = [
    [type.debut, type.taille],
    [type.debut2, type.taille2],
  ]
    .filter(([, fin]) => String(fin ?? '').trim())
    .map(([d, fin]) => `[${String(d ?? '').trim() || '1'}..${String(fin).trim()}]`)
    .join('');
  return `TABLEAU${dims} DE ${element}`;
}

/** Le type d'un champ ou d'un paramètre : un type du cours s'écrit en capitales. */
export function normalizeTypeText(text) {
  const brut = String(text ?? '');
  const mot = brut.trim().toUpperCase();
  if (SCALAR_WORDS.has(mot) || /^TABLEAU\b/.test(mot)) {
    return brut.replace(/tableau|\bde\b|entier|reel|réel|caractere|caractère|chaine|chaîne|booleen|booléen/gi, (m) => m.toUpperCase());
  }
  return brut;
}

export function serializeAlgorithm(doc) {
  return JSON.stringify(doc);
}

/**
 * L'ordre des groupes d'outils, tel qu'il est enseigné : on déclare, on lit et
 * on écrit, on affecte, puis on branche, on répète, on découpe en sous-programmes.
 */
export const TOOL_GROUPS = [
  'Déclaration',
  'Entrées / sorties',
  'Affectation',
  'Conditions',
  'Boucles',
  'Sous-programmes',
  'Pointeurs',
];

/**
 * Les outils que l'enseignant peut autoriser, groupés dans l'ordre du cours.
 *
 * Tout ce que le vocabulaire connaît est autorisable, y compris ce qui ne se
 * pose pas seul : le SINON n'est pas un bloc qu'on insère, c'est la seconde
 * branche du SI : mais l'interdire a un sens (« traitez ce cas sans SINON »),
 * et le correcteur sait le refuser. L'appel de procédure va de soi dès qu'une
 * procédure est permise ; les éléments hérités ne sont plus proposés.
 */
export function toolGroups() {
  const byGroup = new Map(TOOL_GROUPS.map((group) => [group, []]));
  for (const [key, element] of Object.entries(ALL_ELEMENTS)) {
    if (element.herite || element.implicite) continue;
    if (!byGroup.has(element.group)) byGroup.set(element.group, []);
    byGroup.get(element.group).push({ key, ...element });
  }
  return [...byGroup.entries()]
    .filter(([, elements]) => elements.length > 0)
    .map(([group, elements]) => ({ group, elements }));
}

/** Toutes les clés autorisables, pour le bouton « tout autoriser ». */
export const ALL_ELEMENT_KEYS = Object.keys(ALL_ELEMENTS).filter(
  (key) => !ALL_ELEMENTS[key].herite && !ALL_ELEMENTS[key].implicite,
);

/** Les opérateurs du cours, rappelés sous la palette et insérables d'un clic. */
export const OPERATEURS = [
  { texte: '←', aide: 'affectation' },
  { texte: '=', aide: 'égal' },
  { texte: '<>', aide: 'différent' },
  { texte: '<', aide: 'inférieur' },
  { texte: '<=', aide: 'inférieur ou égal' },
  { texte: '>', aide: 'supérieur' },
  { texte: '>=', aide: 'supérieur ou égal' },
  { texte: 'ET', aide: 'et logique' },
  { texte: 'OU', aide: 'ou logique' },
  { texte: 'NON', aide: 'négation' },
  { texte: 'DIV', aide: 'quotient entier' },
  { texte: 'MOD', aide: 'reste de la division' },
  { texte: 'VRAI', aide: 'booléen vrai' },
  { texte: 'FAUX', aide: 'booléen faux' },
  { texte: 'CRLF', aide: 'passage à la ligne' },
  { texte: '^', aide: 'zone pointée (p^, p^.suivant)', colle: true },
  { texte: 'NIL', aide: 'pointeur qui ne désigne rien' },
];

/* ----- Relecture en texte ----- */

const MODES = { E: '(E)', S: '(S)', ES: '(E/S)' };

function modeOf(parametre) {
  const brut = String(parametre?.mode ?? 'E').toUpperCase().replace('/', '');
  return MODES[brut] ? brut : 'E';
}

/** Les paramètres d'un sous-programme, tels qu'ils s'écrivent dans son en-tête. */
function parametersText(node) {
  return (node.parametres ?? [])
    .map((p) => {
      if (typeof p === 'string') return p;
      const type = String(p.type ?? '').trim();
      const tete = node.type === 'procedure' ? `${MODES[modeOf(p)]} ` : '';
      return `${tete}${p.nom ?? ''}${type ? ` : ${type}` : ''}`;
    })
    .join(', ');
}

function declarationsText(doc, indent) {
  const pad = '    '.repeat(indent);
  const lines = [];
  const commentaire = (ligne) => {
    const texte = String(ligne?.commentaire ?? '').trim();
    return texte ? ` /* ${texte} */` : '';
  };
  if (doc.constantes?.length) {
    lines.push(`${pad}CONSTANTES`);
    doc.constantes.forEach((c) => lines.push(`${pad}    ${c.nom} = ${c.valeur}${commentaire(c)}`));
  }
  if (doc.types?.length) {
    lines.push(`${pad}TYPES`);
    doc.types.forEach((t) => {
      if (t.genre === 'tableau') {
        lines.push(`${pad}    ${t.nom} = ${t.definition || arrayTypeDefinition(t)}${commentaire(t)}`);
        return;
      }
      lines.push(`${pad}    ${t.nom} : STRUCTURE${commentaire(t)}`);
      structFields(t).forEach((c) => lines.push(`${pad}        ${c.nom} : ${c.type}`));
      lines.push(`${pad}    FINSTRUCTURE`);
    });
  }
  if (doc.variables?.length) {
    lines.push(`${pad}VARIABLES`);
    doc.variables.forEach((v) => {
      const init = String(v.valeur ?? '').trim() ? ` = ${v.valeur}` : '';
      lines.push(`${pad}    ${v.nom} : ${typeNotation(v.type ?? 'entier', v)}${init}${commentaire(v)}`);
    });
  }
  return lines;
}

/** Le corps, relu comme sur le polycopié : mots-clés en capitales, sans point-virgule. */
function blocksText(blocs, indent = 0) {
  const pad = '    '.repeat(indent);
  const lines = [];
  const body = (list) => {
    if (list?.length) lines.push(blocksText(list, indent + 1));
  };
  for (const b of blocs ?? []) {
    if (b.type === 'variable') lines.push(`${pad}${b.nom} ← ${b.valeur || '0'}`);
    else if (b.type === 'lire') lines.push(`${pad}LIRE(${b.cible ?? ''})`);
    else if (b.type === 'ecrire') lines.push(`${pad}ECRIRE(${b.expression ?? ''})`);
    else if (b.type === 'affectation') lines.push(`${pad}${b.cible} ← ${b.expression}`);
    else if (b.type === 'retour') lines.push(`${pad}RETOURNER(${b.expression ?? ''})`);
    else if (b.type === 'allouer') lines.push(`${pad}ALLOUER(${b.cible ?? ''})`);
    else if (b.type === 'liberer') lines.push(`${pad}LIBERER(${b.cible ?? ''})`);
    else if (b.type === 'appel') lines.push(`${pad}${b.nom}(${b.arguments ?? ''})`);
    else if (b.type === 'tableau') lines.push(`${pad}TABLEAU ${b.nom} DE TAILLE ${b.taille}`);
    else if (b.type === 'pour') {
      const pas = String(b.pas ?? '1').trim();
      lines.push(
        `${pad}POUR ${b.variable} de ${b.debut} à ${b.fin}${pas && pas !== '1' ? ` par pas de ${pas}` : ''} FAIRE`,
      );
      body(b.corps);
      lines.push(`${pad}FINPOUR`);
    } else if (b.type === 'tantque') {
      lines.push(`${pad}TANTQUE ${b.condition} FAIRE`);
      body(b.corps);
      lines.push(`${pad}FINTANTQUE`);
    } else if (b.type === 'repeter') {
      lines.push(`${pad}REPETER`);
      body(b.corps);
      lines.push(`${pad}JUSQU'A ${b.condition}`);
    } else if (b.type === 'si') {
      lines.push(`${pad}SI ${b.condition} ALORS`);
      body(b.alors);
      (b.sinonsi ?? []).forEach((branche) => {
        lines.push(`${pad}SINONSI ${branche.condition} ALORS`);
        body(branche.corps);
      });
      if (b.sinon?.length) {
        lines.push(`${pad}SINON`);
        body(b.sinon);
      }
      lines.push(`${pad}FINSI`);
    } else if (b.type === 'selon') {
      lines.push(`${pad}SELON ${b.expression} DANS`);
      (b.cas ?? []).forEach((cas) => {
        lines.push(`${pad}    ${cas.valeurs} :`);
        if (cas.corps?.length) lines.push(blocksText(cas.corps, indent + 2));
      });
      if (b.autre?.length) {
        lines.push(`${pad}    SINON :`);
        lines.push(blocksText(b.autre, indent + 2));
      }
      lines.push(`${pad}FINSELON`);
    } else if (b.type === 'fonction' || b.type === 'procedure') {
      lines.push(...subprogramText(b, indent));
    }
  }
  return lines.join('\n');
}

function subprogramText(node, indent = 0) {
  const pad = '    '.repeat(indent);
  const lines = [];
  if (node.type === 'procedure') {
    lines.push(`${pad}PROCEDURE ${node.nom}(${parametersText(node)})`);
  } else {
    const retour = String(node.typeRetour ?? '').trim();
    lines.push(`${pad}FONCTION ${node.nom}(${parametersText(node)})${retour ? ` : ${retour}` : ''}`);
  }
  lines.push(...declarationsText({ variables: node.variables }, indent + 1));
  lines.push(`${pad}DEBUT`);
  const corps = blocksText(node.corps, indent + 1);
  if (corps) lines.push(corps);
  lines.push(`${pad}FIN`);
  return lines;
}

/** Tout l'algorithme en pseudo-code, tel qu'on l'écrirait sur la copie. */
export function algorithmText(doc) {
  const lines = [`ALGORITHME ${doc.nom || ''}`.trimEnd()];
  lines.push(...declarationsText(doc, 1));
  lines.push('DEBUT');
  const corps = blocksText(doc.corps, 1);
  if (corps) lines.push(corps);
  lines.push('FIN');
  (doc.sousProgrammes ?? []).forEach((sp) => {
    lines.push('');
    lines.push(...subprogramText(sp, 0));
  });
  return lines.join('\n');
}
