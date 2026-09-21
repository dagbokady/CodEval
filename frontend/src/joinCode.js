/** « ABCD2345 » s'affiche « ABCD-2345 » : plus facile à lire au tableau. */
export function formatJoinCode(code) {
  if (!code) return '';
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

/** Ce que le serveur attend : lettres et chiffres, en majuscules. */
export function cleanJoinCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Lien à partager : il ouvre la page d'inscription avec le code déjà saisi. */
export function joinLink(code) {
  return `${location.origin}/rejoindre/${formatJoinCode(code)}`;
}
