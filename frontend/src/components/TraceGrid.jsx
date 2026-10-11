/**
 * Le tableau de simulation, tel qu'il se lit partout : sujet, épreuve, copie
 * corrigée, corrigé. Une colonne « fournie » montre le contenu de l'enseignant ;
 * les autres montrent `values` (la copie), en saisie quand `editable`.
 *
 * `verdicts` (voir `traceVerdicts`) colore les cases notées une fois la copie
 * corrigée ; `showExpected` ajoute la valeur attendue sous une case fausse.
 */

import { useRef } from 'react';
import { traceWidths } from '../trace';

export default function TraceGrid({
  columns,
  rows,
  values,
  editable = false,
  onCell,
  verdicts,
  showExpected = false,
  label = 'Tableau de simulation',
}) {
  const table = useRef(null);
  const widths = traceWidths(columns, [rows, values]);

  // Entrée descend d'une ligne dans la même colonne, comme sur un tableur :
  // c'est l'ordre dans lequel on remplit une simulation, variable par variable.
  const onKeyDown = (event, r, c) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const next = table.current?.querySelector(`[data-cell="${r + 1}:${c}"]`);
    next?.focus();
  };

  return (
    <div className="trace-scroll">
      <table className="trace-grid" ref={table} aria-label={label}>
        <thead>
          <tr>
            {columns.map((column, c) => (
              <th
                key={c}
                scope="col"
                className={column.given ? 'trace-given' : undefined}
                style={{ minWidth: widths[c] }}
              >
                {column.title || `Colonne ${c + 1}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {columns.map((column, c) => {
                if (column.given) {
                  return (
                    <td key={c} className="trace-given">
                      {row[c]}
                    </td>
                  );
                }
                const value = values?.[r]?.[c] ?? '';
                const verdict = verdicts?.get(`${r}:${c}`);
                const tone = verdict ? (verdict.passed ? 'trace-ok' : 'trace-ko') : '';
                return (
                  <td key={c} className={tone || undefined}>
                    {editable ? (
                      <input
                        data-cell={`${r}:${c}`}
                        aria-label={`Ligne ${r + 1}, ${column.title || `colonne ${c + 1}`}`}
                        value={value}
                        autoComplete="off"
                        spellCheck={false}
                        onChange={(e) => onCell?.(r, c, e.target.value)}
                        onKeyDown={(e) => onKeyDown(e, r, c)}
                      />
                    ) : (
                      <span className="trace-value">{value}</span>
                    )}
                    {showExpected && verdict && !verdict.passed && (
                      <span className="trace-expected">
                        attendu : {verdict.expected.split('|').map((v) => v.trim()).join(' ou ')}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
