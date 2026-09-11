/**
 * La note portée sur la copie, à la main, au stylo rouge — comme une copie
 * corrigée sur papier : le numérateur en haut, la barre en travers, le total en
 * bas. C'est la première chose qu'on cherche en ouvrant sa copie ; elle ne se
 * lit pas dans un bandeau gris parmi d'autres champs.
 *
 * Tant que la correction n'est pas publiée, rien n'est écrit : on affiche le
 * barème en attente, à l'encre pâle, pour que la place de la note soit visible
 * sans qu'une note inexistante soit suggérée.
 */

/** 12.5 → « 12,5 » : la copie est en français, la virgule aussi. */
function inked(value) {
  return String(Math.round(value * 100) / 100).replace('.', ',');
}

export default function GradeMark({ score, total, size = 'md', pending = false, label }) {
  const written = score !== null && score !== undefined && !pending;
  const text = written ? `Note : ${inked(score)} sur ${inked(total)}` : `Non notée, barème sur ${inked(total)}`;

  return (
    <div
      className={`note-main note-main--${size} ${written ? '' : 'note-main--attente'}`.trim()}
      role="img"
      aria-label={label ?? text}
    >
      <span className="note-main-num" aria-hidden="true">
        {written ? inked(score) : '—'}
      </span>
      <span className="note-main-barre" aria-hidden="true" />
      <span className="note-main-den" aria-hidden="true">
        {inked(total)}
      </span>
    </div>
  );
}

/**
 * Le même stylo, pour une mention courte écrite en marge : « ajustée »,
 * « copie non rendue »… Elle accompagne la note, elle ne la remplace pas.
 */
export function MarginNote({ children, tone = 'rouge' }) {
  if (!children) return null;
  return <p className={`note-marge note-marge--${tone}`}>{children}</p>;
}
