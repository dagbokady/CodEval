/**
 * Un bloc de code coloré. Le découpage en jetons vit dans `highlight.js` ; ce
 * fichier ne fait que poser les balises et les classes de couleur.
 */

import { highlightFamily, looksLikeAlgo, tokenize } from '../highlight';

function peindre(text, family) {
  return tokenize(text, family).map((token, index) =>
    token.cls ? (
      <span key={index} className={`tok-${token.cls}`}>
        {token.text}
      </span>
    ) : (
      token.text
    ),
  );
}

/** Le pseudo-code se reconnaît tout seul, quel que soit le langage annoncé. */
function familleDe(text, language) {
  return looksLikeAlgo(text) ? 'algo' : highlightFamily(language);
}

export default function CodeBlock({ code, language, className = '', ...rest }) {
  const text = code ?? '';
  return (
    <pre className={`code-bloc ${className}`.trim()} {...rest}>
      <code>{peindre(text, familleDe(text, language))}</code>
    </pre>
  );
}

/** Code court dans une phrase, coloré de la même façon. */
export function InlineCode({ code, language, className = '' }) {
  const text = code ?? '';
  return (
    <code className={`code-inline ${className}`.trim()}>
      {peindre(text, familleDe(text, language))}
    </code>
  );
}
