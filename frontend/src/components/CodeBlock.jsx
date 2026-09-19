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
  const famille = familleDe(text, language);
  return (
    <pre className={`code-bloc code-bloc--${famille} ${className}`.trim()} {...rest}>
      <code>{peindre(text, famille)}</code>
    </pre>
  );
}
