/**
 * La correspondance telle qu'elle se fait sur papier : deux blocs face à face,
 * un point au bout de chaque élément, et un trait tiré de l'un à l'autre.
 *
 * L'apprenant ne choisit pas dans une liste déroulante — il relie. C'est le
 * geste de l'épreuve, et c'est aussi la seule lecture qui montre d'un coup
 * d'œil ce qui est relié, ce qui ne l'est pas, et ce qui l'est de travers.
 *
 * Le tracé est mesuré sur le rendu réel : les points bougent avec le texte, la
 * largeur et le thème, donc les traits se recalculent à chaque changement de
 * taille plutôt que de se fier à une grille supposée.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * `left` et `right` : [{ key, text }]. `links` associe une clé de gauche à une
 * clé de droite. `tone(leftKey)` colore le trait quand la correction est lue.
 */
export default function MatchingBoard({
  left,
  right,
  links = {},
  onLink,
  readOnly = false,
  tone,
  ariaLabel = 'Correspondances à relier',
}) {
  const board = useRef(null);
  const points = useRef(new Map());
  const [traits, setTraits] = useState([]);
  const [taille, setTaille] = useState({ width: 0, height: 0 });
  /* L'élément de gauche en attente de sa destination : le premier clic
     l'arme, le second tire le trait. */
  const [armé, setArmé] = useState(null);

  const noter = useCallback((clé, node) => {
    if (node) points.current.set(clé, node);
    else points.current.delete(clé);
  }, []);

  const retracer = useCallback(() => {
    const zone = board.current;
    if (!zone) return;
    const cadre = zone.getBoundingClientRect();
    setTaille({ width: cadre.width, height: cadre.height });
    const tracés = [];
    Object.entries(links).forEach(([leftKey, rightKey]) => {
      const départ = points.current.get(`g:${leftKey}`);
      const arrivée = points.current.get(`d:${rightKey}`);
      if (!départ || !arrivée) return;
      const a = départ.getBoundingClientRect();
      const b = arrivée.getBoundingClientRect();
      tracés.push({
        key: leftKey,
        x1: a.left + a.width / 2 - cadre.left,
        y1: a.top + a.height / 2 - cadre.top,
        x2: b.left + b.width / 2 - cadre.left,
        y2: b.top + b.height / 2 - cadre.top,
        tone: tone ? tone(leftKey) : null,
      });
    });
    setTraits(tracés);
  }, [links, tone]);

  useLayoutEffect(retracer, [retracer, left, right]);

  useEffect(() => {
    const zone = board.current;
    if (!zone || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(retracer);
    observer.observe(zone);
    zone.querySelectorAll('.match-bloc').forEach((bloc) => observer.observe(bloc));
    window.addEventListener('resize', retracer);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', retracer);
    };
  }, [retracer]);

  const reliéÀ = (rightKey) =>
    Object.entries(links).find(([, valeur]) => valeur === rightKey)?.[0] ?? null;

  function choisirGauche(clé) {
    if (readOnly) return;
    // Recliquer un élément déjà relié défait le trait : c'est la gomme.
    if (links[clé] !== undefined && armé !== clé) {
      const suite = { ...links };
      delete suite[clé];
      onLink?.(suite);
      setArmé(null);
      return;
    }
    setArmé(armé === clé ? null : clé);
  }

  function choisirDroite(clé) {
    if (readOnly) return;
    if (armé === null) {
      // Le trait part aussi de la droite : on décroche l'élément déjà relié.
      const source = reliéÀ(clé);
      if (source !== null) {
        const suite = { ...links };
        delete suite[source];
        onLink?.(suite);
      }
      return;
    }
    const suite = { ...links };
    // Un élément de droite ne sert qu'une fois : le relier ailleurs le libère.
    Object.keys(suite).forEach((k) => {
      if (suite[k] === clé) delete suite[k];
    });
    suite[armé] = clé;
    onLink?.(suite);
    setArmé(null);
  }

  const colonne = (items, côté) => (
    <ul className={`match-bloc match-bloc--${côté}`}>
      {items.map((item) => {
        const relié =
          côté === 'gauche' ? links[item.key] !== undefined : reliéÀ(item.key) !== null;
        const marque = côté === 'gauche' && tone ? tone(item.key) : null;
        return (
          <li key={item.key}>
            <button
              type="button"
              className={[
                'match-item',
                relié ? 'match-item--relie' : '',
                armé === item.key ? 'match-item--arme' : '',
                marque ? `match-item--${marque}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              disabled={readOnly}
              aria-pressed={armé === item.key}
              onClick={() =>
                côté === 'gauche' ? choisirGauche(item.key) : choisirDroite(item.key)
              }
            >
              <span className="match-texte">{item.text}</span>
              <span
                className="match-point"
                aria-hidden="true"
                ref={(node) => noter(`${côté === 'gauche' ? 'g' : 'd'}:${item.key}`, node)}
              />
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="match-plateau" ref={board} role="group" aria-label={ariaLabel}>
      {colonne(left, 'gauche')}
      <svg
        className="match-traits"
        aria-hidden="true"
        width={taille.width}
        height={taille.height}
        viewBox={`0 0 ${Math.max(1, taille.width)} ${Math.max(1, taille.height)}`}
      >
        {traits.map((trait) => (
          <line
            key={trait.key}
            className={`match-trait ${trait.tone ? `match-trait--${trait.tone}` : ''}`.trim()}
            x1={trait.x1}
            y1={trait.y1}
            x2={trait.x2}
            y2={trait.y2}
          />
        ))}
      </svg>
      {colonne(right, 'droite')}
      {!readOnly && (
        <p className="match-aide sub">
          {armé === null
            ? 'Cliquez un élément de gauche, puis son correspondant à droite. Recliquez un élément relié pour effacer le trait.'
            : 'Cliquez maintenant l’élément de droite qui lui correspond.'}
        </p>
      )}
    </div>
  );
}
