/**
 * Coloration syntaxique maison, pour que le code d'une copie se lise comme
 * dans un éditeur et non comme un bloc de texte gris.
 *
 * Pas de dépendance : CodeMirror sait déjà colorer ce qu'on *écrit*, mais les
 * copies rendues, les énoncés et le code de départ sont du texte figé : un
 * découpage en jetons suffit, et il tient dans un fichier.
 *
 * Les couleurs vivent dans les tokens CSS (`--code-*`) : elles suivent donc le
 * thème clair ou sombre sans que ce fichier ne connaisse le thème.
 */

const PYTHON = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del',
  'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in',
  'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while',
  'with', 'yield', 'None', 'True', 'False', 'self',
]);

const PYTHON_BUILTINS = new Set([
  'abs', 'bool', 'dict', 'enumerate', 'float', 'input', 'int', 'len', 'list', 'map',
  'max', 'min', 'print', 'range', 'round', 'set', 'sorted', 'str', 'sum', 'tuple', 'type',
]);

const C_LIKE = new Set([
  'auto', 'break', 'case', 'catch', 'class', 'const', 'constexpr', 'continue', 'default',
  'delete', 'do', 'else', 'enum', 'extern', 'false', 'for', 'goto', 'if', 'inline',
  'namespace', 'new', 'nullptr', 'operator', 'private', 'protected', 'public', 'return',
  'sizeof', 'static', 'struct', 'switch', 'template', 'this', 'throw', 'true', 'try',
  'typedef', 'union', 'using', 'virtual', 'volatile', 'while', 'NULL',
]);

const C_TYPES = new Set([
  'bool', 'char', 'double', 'float', 'int', 'long', 'short', 'signed', 'size_t',
  'string', 'unsigned', 'void', 'wchar_t',
]);

const C_BUILTINS = new Set([
  'cin', 'cout', 'cerr', 'endl', 'malloc', 'free', 'memset', 'printf', 'puts', 'scanf',
  'sprintf', 'std', 'strcmp', 'strcpy', 'strlen', 'vector',
]);

/**
 * Les mots du pseudo-code, tels qu'ils s'écrivent au cours. On les nomme un à
 * un : une constante en capitales (MAX_NB_NOTES) n'est pas un mot-clé.
 */
const ALGO_KEYWORDS = new Set([
  'ALGORITHME', 'CONSTANTES', 'TYPES', 'VARIABLES', 'DEBUT', 'DÉBUT', 'FIN',
  'ENTIER', 'REEL', 'RÉEL', 'CARACTERE', 'CARACTÈRE', 'CHAINE', 'CHAÎNE', 'BOOLEEN', 'BOOLÉEN',
  'TABLEAU', 'DE', 'TAILLE', 'STRUCTURE', 'FINSTRUCTURE',
  'SI', 'ALORS', 'SINON', 'FINSI', 'POUR', 'FINPOUR', 'TANTQUE', 'FAIRE', 'FINTANTQUE',
  'REPETER', 'RÉPÉTER', 'JUSQU', 'LIRE', 'ECRIRE', 'ÉCRIRE', 'RETOURNE', 'RETOUR',
  'FONCTION', 'FINFONCTION', 'ET', 'OU', 'NON', 'VRAI', 'FAUX', 'MOD', 'DIV',
  'SINONSI', 'SELON', 'DANS', 'FINSELON', 'PROCEDURE', 'PROCÉDURE', 'RETOURNER', 'CRLF',
  'ENRG', 'FINENRG',
  // anciennes copies
  'VARIABLE', 'TANT', 'QUE', 'CONSTANTE', 'DÉCLARATION',
]);

/** Ce que le nom de langage d'un exercice veut dire pour le coloriseur. */
export function highlightFamily(language) {
  const value = String(language ?? '').toLowerCase();
  if (value === 'algo' || value === 'pseudo' || value === 'pseudocode') return 'algo';
  if (value === 'python' || value === 'py') return 'python';
  if (value === 'c' || value === 'cpp' || value === 'c++') return 'c';
  return 'c';
}

/**
 * Un texte qui commence par un mot du pseudo-code français est un algorithme,
 * même si l'exercice porte un langage : c'est le cas d'un exercice « algo »
 * relu depuis sa forme JSON.
 */
export function looksLikeAlgo(code) {
  return /^\s*(ALGORITHME|VARIABLE|TABLEAU|POUR|TANTQUE|TANT QUE|SI|SELON|FONCTION|PROCEDURE|LIRE|ECRIRE|ÉCRIRE|RETOUR|DÉBUT|DEBUT)\b/m
    .test(code ?? '') || /^algorithme\b/.test((code ?? '').trimStart());
}

function commentPattern(family) {
  if (family === 'python') return String.raw`#[^\n]*`;
  if (family === 'algo') return String.raw`//[^\n]*|/\*[\s\S]*?\*/`;
  return String.raw`//[^\n]*|/\*[\s\S]*?\*/`;
}

function buildRegex(family) {
  return new RegExp(
    [
      `(?<com>${commentPattern(family)})`,
      family === 'c' ? String.raw`(?<pre>^[ \t]*#[a-z_]+[^\n]*)` : null,
      String.raw`(?<str>"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')`,
      String.raw`(?<num>\b\d+(?:[.,]\d+)?\b)`,
      String.raw`(?<id>[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_]*)`,
      String.raw`(?<op>[←→≤≥≠]|[-+*/%=<>!&|^~?:]+)`,
      String.raw`(?<pon>[{}()[\];,.])`,
    ]
      .filter(Boolean)
      .join('|'),
    'gmu',
  );
}

const CACHE = new Map();

function regexFor(family) {
  if (!CACHE.has(family)) CACHE.set(family, buildRegex(family));
  const regex = CACHE.get(family);
  regex.lastIndex = 0;
  return regex;
}

/** Le rôle d'un identifiant : mot réservé, type, appel de fonction, ou variable. */
function classifyWord(word, family, after) {
  if (family === 'algo') {
    if (ALGO_KEYWORDS.has(word)) return 'kw';
    return after === '(' ? 'fn' : 'var';
  }
  if (family === 'python') {
    if (PYTHON.has(word)) return 'kw';
    if (PYTHON_BUILTINS.has(word)) return 'fn';
  } else {
    if (C_TYPES.has(word)) return 'typ';
    if (C_LIKE.has(word)) return 'kw';
    if (C_BUILTINS.has(word)) return 'fn';
  }
  return after === '(' ? 'fn' : 'var';
}

/**
 * Découpe le code en jetons `{ text, cls }`. `cls` nul = texte neutre, rendu
 * sans balise : une copie de 300 lignes ne doit pas produire 300 000 spans.
 */
export function tokenize(code, family = 'c') {
  const source = code ?? '';
  const regex = regexFor(family);
  const tokens = [];
  let last = 0;
  let match;

  while ((match = regex.exec(source)) !== null) {
    const groups = match.groups ?? {};
    if (match.index > last) tokens.push({ text: source.slice(last, match.index), cls: null });

    let cls = null;
    if (groups.com) cls = 'com';
    else if (groups.pre) cls = 'pre';
    else if (groups.str) cls = 'str';
    else if (groups.num) cls = 'num';
    else if (groups.op) cls = 'op';
    else if (groups.pon) cls = 'pon';
    else if (groups.id) {
      const rest = source.slice(match.index + match[0].length);
      cls = classifyWord(match[0], family, rest.trimStart()[0]);
      if (cls === 'var') cls = null;
    }

    tokens.push({ text: match[0], cls });
    last = match.index + match[0].length;
  }
  if (last < source.length) tokens.push({ text: source.slice(last), cls: null });
  return tokens;
}
