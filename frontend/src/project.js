/**
 * Exercice de code en plusieurs fichiers : un projet C ou C++.
 *
 * L'enseignant déclare les fichiers dans `settings.files` (nom et code de
 * départ) ; l'apprenant les retrouve en onglets, et sa copie est le document
 * JSON `{"files": {"main.c": "…", …}}`. La correction compile tous les fichiers
 * sources ensemble.
 *
 * Ce module double `backend/app/grading/project.py` : les règles de nommage
 * doivent rester les mêmes des deux côtés.
 */

export const MAX_FILES = 12;
const NAME = /^[A-Za-z][A-Za-z0-9_-]{0,40}\.(c|h|cpp|hpp)$/;
const SOURCES = { c: ['.c'], cpp: ['.cpp'] };
const HEADERS = { c: ['.h'], cpp: ['.h', '.hpp'] };

/** Les langages où l'on peut découper l'exercice en fichiers. */
export const PROJECT_LANGUAGES = new Set(Object.keys(SOURCES));

/** Les fichiers déclarés d'un exercice, ou [] pour un fichier unique. */
export function projectFiles(exercise) {
  if ((exercise?.kind ?? 'code') !== 'code') return [];
  const files = exercise?.settings?.files;
  if (!Array.isArray(files)) return [];
  return files.filter((f) => f && typeof f.name === 'string' && f.name.trim());
}

export function isProject(exercise) {
  return projectFiles(exercise).length > 0;
}

export function isSource(name, language) {
  return (SOURCES[language] ?? SOURCES.c).some((ext) => name.endsWith(ext));
}

/** Pourquoi ce nom de fichier serait refusé, ou null s'il est bon. */
export function fileNameIssue(name, language, others = []) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'nom manquant';
  if (!NAME.test(trimmed)) return 'lettres, chiffres, - ou _, puis .c ou .h';
  const allowed = [...(SOURCES[language] ?? []), ...(HEADERS[language] ?? [])];
  if (!allowed.some((ext) => trimmed.endsWith(ext))) {
    return `extension attendue : ${allowed.join(', ')}`;
  }
  if (others.some((other) => other.trim().toLowerCase() === trimmed.toLowerCase())) {
    return 'déjà utilisé';
  }
  return null;
}

/** Le découpage proposé quand l'enseignant passe un exercice en plusieurs fichiers. */
export function defaultProjectFiles(language, mainStarter = '') {
  const ext = language === 'cpp' ? 'cpp' : 'c';
  return [
    { name: 'fonctions.h', starter: '' },
    { name: `fonctions.${ext}`, starter: '' },
    { name: `main.${ext}`, starter: mainStarter },
  ];
}

function mainFile(files, language) {
  const names = files.map((f) => f.name);
  return (
    names.find((n) => n === 'main.c' || n === 'main.cpp') ??
    names.find((n) => isSource(n, language)) ??
    names[0]
  );
}

/**
 * Le contenu de chaque fichier déclaré. Un fichier absent de la copie garde son
 * code de départ ; une copie en texte brut va dans le fichier principal.
 */
export function readProject(code, files, language) {
  let given = {};
  const text = (code ?? '').trim();
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      given = parsed && typeof parsed.files === 'object' ? parsed.files : { [mainFile(files, language)]: code };
    } catch {
      given = { [mainFile(files, language)]: code };
    }
  } else if (text) {
    given = { [mainFile(files, language)]: code };
  }
  return Object.fromEntries(
    files.map((f) => [f.name, typeof given[f.name] === 'string' ? given[f.name] : (f.starter ?? '')]),
  );
}

export function packProject(contents) {
  return JSON.stringify({ files: contents });
}

/** Une copie stockée est-elle un projet ? (sans connaître l'exercice) */
export function projectDocument(code) {
  const text = (code ?? '').trim();
  if (!text.startsWith('{')) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && parsed.files && typeof parsed.files === 'object' && !Array.isArray(parsed.files)) {
      return parsed.files;
    }
  } catch {
    /* pas un projet */
  }
  return null;
}

/** Le projet lu d'un bloc, fichier par fichier : copie imprimée, relecture. */
export function projectText(contents) {
  return Object.entries(contents)
    .map(([name, body]) => `/* ===== ${name} ===== */\n${String(body ?? '').trimEnd()}`)
    .join('\n\n');
}

/**
 * Le code de départ tel qu'on le montre (sujet, copie) : celui de l'exercice,
 * ou, pour un projet, les fichiers fournis et leur contenu.
 */
export function starterText(exercise) {
  const files = projectFiles(exercise);
  if (files.length === 0) return exercise?.starter_code ?? '';
  const fournis = files.filter((f) => (f.starter ?? '').trim());
  return projectText(Object.fromEntries(fournis.map((f) => [f.name, f.starter])));
}
