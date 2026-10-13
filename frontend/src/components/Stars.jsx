import { useState } from 'react';
import { formatRating } from '../format';

/** Étoiles de lecture : la moyenne, arrondie à la demi-étoile, et le nombre de notes. */
export function StarsSummary({ avg, count }) {
  if (!count) return <span className="stars-empty">Pas encore notée</span>;
  const rounded = Math.round(avg * 2) / 2;
  const label = `${formatRating(avg)} sur 5, ${count} note${count > 1 ? 's' : ''}`;
  return (
    <span className="stars-summary" title={label}>
      <span className="stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} fill={rounded >= n ? 1 : rounded >= n - 0.5 ? 0.5 : 0} />
        ))}
      </span>
      <span className="visually-hidden">{label}</span>
      <span aria-hidden="true">
        <b>{formatRating(avg)}</b> · {count} note{count > 1 ? 's' : ''}
      </span>
    </span>
  );
}

export function Star({ fill = 0, size = 14 }) {
  const id = `star-half-${fill}`;
  return (
    <svg className="star" viewBox="0 0 20 20" width={size} height={size} aria-hidden="true">
      {fill === 0.5 && (
        <defs>
          <linearGradient id={id}>
            <stop offset="50%" stopColor="var(--star-on)" />
            <stop offset="50%" stopColor="var(--star-off)" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M10 1.6l2.6 5.3 5.8.8-4.2 4.1 1 5.8L10 14.9l-5.2 2.7 1-5.8L1.6 7.7l5.8-.8z"
        fill={fill === 1 ? 'var(--star-on)' : fill === 0.5 ? `url(#${id})` : 'var(--star-off)'}
      />
    </svg>
  );
}

const WORDS = ['', 'Faible', 'Passable', 'Correct', 'Bon', 'Excellent'];

/** Donner sa note : cinq étoiles cliquables, recliquer la sienne la retire. */
export function StarInput({ value, disabled, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;
  return (
    <div className="star-input" role="radiogroup" aria-label="Votre note" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} étoile${n > 1 ? 's' : ''} : ${WORDS[n]}`}
          title={value === n ? 'Retirer ma note' : WORDS[n]}
          disabled={disabled}
          onMouseEnter={() => setHover(n)}
          onFocus={() => setHover(n)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(value === n ? null : n)}
        >
          <Star fill={shown >= n ? 1 : 0} />
        </button>
      ))}
      <span className="star-input-word" aria-hidden="true">
        {shown ? WORDS[shown] : ''}
      </span>
    </div>
  );
}
