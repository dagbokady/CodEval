/**
 * Déclarations C collées par l'enseignant, lues comme critères du barème.
 *
 * Sur la feuille, l'enseignant ne remplit plus un formulaire par fonction : il
 * colle les prototypes, les structures et les variables globales tels qu'ils
 * figurent dans son sujet, et chacun devient un critère de `bareme.js`
 * (« fonction attendue », « structure attendue », « variable attendue »). Ce
 * qui ne se lit pas est rendu tel quel : l'enseignant le saisit alors à la main
 * dans l'éditeur détaillé, plutôt que de le voir disparaître en silence.
 *
 * Les types suivent le catalogue de `bareme.js` : un type du langage (`int`,
 * `double`, `char *`…) prend sa clé, un tableau d'éléments simples suivi de sa
 * taille (`int t[], int n`) devient un seul paramètre « tableau », et tout le
 * reste (`Etudiant *`, `struct Note`) un « autre type » écrit en toutes lettres.
 */

import { blankCriterion, customTypeIssue } from './bareme';

const SCALARS = {
  int: 'int',
  short: 'short',
  long: 'long',
  float: 'float',
  double: 'double',
  char: 'char',
  bool: 'bool',
  _Bool: 'bool',
};
const ARRAY_ELEMENTS = new Set(['short', 'int', 'long', 'float', 'double', 'char']);
const QUALIFIERS = /\b(?:const|static|extern|volatile|register|inline)\b/g;

/** Le texte sans commentaires ni directives du préprocesseur. */
function stripNoise(text) {
  return String(text ?? '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}

/**
 * Découpe en déclarations : un `;` hors accolades en clôt une. Le corps d'une
 * fonction définie (et pas seulement déclarée) est sauté : seule sa signature
 * compte.
 */
function statementsOf(text) {
  const out = [];
  let current = '';
  let depth = 0;
  let skippingBody = false;
  for (const ch of stripNoise(text)) {
    if (ch === '{') {
      if (depth === 0 && /\)\s*$/.test(current)) skippingBody = true;
      depth += 1;
      if (!skippingBody) current += ch;
      continue;
    }
    if (ch === '}') {
      depth = Math.max(0, depth - 1);
      if (skippingBody) {
        if (depth === 0) {
          out.push(current);
          current = '';
          skippingBody = false;
        }
        continue;
      }
      current += ch;
      continue;
    }
    if (skippingBody) continue;
    if (ch === ';' && depth === 0) {
      out.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

/** `const char *nom` → type « char * », nom « nom » ; `int t[10]` → tableau. */
function splitDeclarator(text) {
  const cleaned = text.replace(QUALIFIERS, ' ').replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(.*?)([A-Za-z_]\w*)\s*(\[[^\]]*\])?$/);
  if (!match) return null;
  const [, head, name, brackets] = match;
  // Sans nom (« int » seul dans un prototype), le dernier mot est le type.
  if (!head.replace(/\*/g, '').trim()) return { rawType: cleaned, name: '', array: false };
  return { rawType: head.trim(), name, array: Boolean(brackets) };
}

/** Le type du catalogue pour un type C écrit, ou `null` s'il ne se lit pas. */
function typeOf(rawType, array) {
  const compact = rawType.replace(QUALIFIERS, ' ').replace(/\s+/g, ' ').trim();
  const stars = (compact.match(/\*/g) ?? []).length;
  const base = compact.replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
  if (!base) return null;

  if (array) {
    if (stars === 0 && ARRAY_ELEMENTS.has(base)) return { type: `${base}[]` };
    return custom(`${base} ${'*'.repeat(stars + 1)}`);
  }
  if (stars === 0 && base === 'void') return { type: 'void' };
  if (stars === 1 && base === 'char') return { type: 'string' };
  if (stars === 0 && SCALARS[base]) return { type: SCALARS[base] };
  return custom(stars ? `${base} ${'*'.repeat(stars)}` : base);
}

function custom(text) {
  return customTypeIssue(text) ? null : { type: 'custom', ctype: text };
}

/** Les paramètres d'un prototype ; `null` si l'un d'eux ne se lit pas. */
function paramsOf(text) {
  const inside = text.trim();
  if (!inside || inside === 'void') return [];
  const parts = inside.split(',').map((p) => p.trim());
  const params = [];
  for (let i = 0; i < parts.length; i += 1) {
    const declarator = splitDeclarator(parts[i]);
    if (!declarator) return null;
    const kind = typeOf(declarator.rawType, declarator.array);
    if (!kind || kind.type === 'void') return null;
    params.push({ name: declarator.name || `a${params.length + 1}`, ...kind });
    // Un tableau du catalogue porte sa taille : l'entier qui le suit est elle.
    if (kind.type.endsWith('[]')) {
      const next = parts[i + 1] && splitDeclarator(parts[i + 1]);
      const size = next && typeOf(next.rawType, next.array);
      if (size && ['int', 'short', 'long'].includes(size.type)) i += 1;
    }
  }
  return params;
}

function functionCriterion(statement) {
  const match = statement.match(/^(.*?)\(([^()]*)\)$/);
  if (!match) return null;
  const head = splitDeclarator(match[1]);
  if (!head?.name || head.array) return null;
  const returns = typeOf(head.rawType, false);
  const params = paramsOf(match[2]);
  if (!returns || !params) return null;
  return {
    ...blankCriterion('function'),
    name: head.name,
    returns: returns.type,
    ...(returns.ctype ? { returns_ctype: returns.ctype } : {}),
    params: params.map(({ name, type, ctype }) => ({ name, type, ...(ctype ? { ctype } : {}) })),
  };
}

/** Les champs d'une structure ; `int x, y;` en donne deux. */
function fieldsOf(body) {
  const fields = [];
  for (const declaration of body.split(';').map((d) => d.trim()).filter(Boolean)) {
    const [first, ...others] = declaration.split(',').map((d) => d.trim());
    const head = splitDeclarator(first);
    if (!head?.name) return null;
    const baseType = head.rawType.replace(/\*/g, '').trim();
    for (const [rawType, declarator] of [
      [head.rawType, head],
      ...others.map((other) => {
        const extra = other.match(/^(\**)\s*([A-Za-z_]\w*)\s*(\[[^\]]*\])?$/);
        return extra
          ? [`${baseType} ${extra[1]}`, { name: extra[2], array: Boolean(extra[3]) }]
          : [null, null];
      }),
    ]) {
      if (!declarator) return null;
      const kind = typeOf(rawType, declarator.array);
      if (!kind || kind.type === 'void') return null;
      fields.push({ name: declarator.name, type: kind.type, ...(kind.ctype ? { ctype: kind.ctype } : {}) });
    }
  }
  return fields;
}

function structCriterion(statement) {
  const typedef = statement.match(/^typedef struct\s*(\w+)?\s*\{(.*)\}\s*(\w+)$/);
  const tagged = statement.match(/^struct\s+(\w+)\s*\{(.*)\}$/);
  const name = typedef ? typedef[3] : tagged?.[1];
  const body = typedef ? typedef[2] : tagged?.[2];
  if (!name) return null;
  const fields = fieldsOf(body ?? '');
  if (!fields) return null;
  return { ...blankCriterion('struct'), name, fields };
}

function variableCriterion(statement) {
  const declaration = statement.replace(/=.*$/, '').trim();
  if (/^(typedef|struct\s+\w+$)/.test(declaration)) return null;
  const declarator = splitDeclarator(declaration);
  if (!declarator?.name) return null;
  const kind = typeOf(declarator.rawType, declarator.array);
  if (!kind || kind.type === 'void') return null;
  return {
    ...blankCriterion('variable'),
    name: declarator.name,
    vtype: kind.type,
    ...(kind.ctype ? { ctype: kind.ctype } : {}),
    scope: 'global',
  };
}

/**
 * @returns {{ criteria: object[], unread: string[] }} les critères lus, dans
 *   l'ordre du texte, et les déclarations restées illisibles.
 */
export function parseDeclarations(text) {
  const criteria = [];
  const unread = [];
  for (const statement of statementsOf(text)) {
    const criterion = statement.includes('{')
      ? structCriterion(statement)
      : statement.includes('(')
        ? functionCriterion(statement)
        : variableCriterion(statement);
    if (criterion) criteria.push(criterion);
    else unread.push(statement);
  }
  return { criteria, unread };
}
