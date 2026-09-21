/**
 * « 9E5G97CJ34DD » s'affiche « 9E5G-97CJ-34DD » : des groupes de quatre, plus
 * faciles à lire au tableau. Les anciens codes de huit gardent leur forme.
 */
export function formatJoinCode(code) {
  if (!code) return '';
  return code.match(/.{1,4}/g).join('-');
}

/** Ce que le serveur attend : lettres et chiffres, en majuscules. */
export function cleanJoinCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Pendant la saisie : on remet les tirets à mesure, au plus douze caractères. */
export function typeJoinCode(value) {
  return formatJoinCode(cleanJoinCode(value).slice(0, 12));
}

/** Lien d'invitation : il porte un jeton qui expire, pas le code lui-même. */
export function joinLink(token) {
  return `${location.origin}/rejoindre/lien/${token}`;
}
