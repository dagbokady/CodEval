/**
 * L'attribution des points d'un exercice — toujours en dernier.
 *
 * Un test ne vaut rien tant qu'on ne sait pas quels tests existent : décider
 * qu'un test pèse 2 points au moment où on l'écrit, c'est noter à l'aveugle et
 * recommencer à chaque test ajouté. Les points ne se saisissent donc plus dans
 * l'éditeur de barème ni sur la carte d'un test : ils se posent ici, une fois
 * l'exercice entièrement écrit, avec sous les yeux tout ce qui note la copie et
 * le total de l'exercice.
 *
 * Deux régimes, comme dans le reste de l'application : le barème simplifié
 * partage le total à parts égales entre tout ce qui note ; le barème détaillé
 * laisse l'enseignant peser chaque ligne.
 */

import { Button } from './ui';
import {
  autoDistribute,
  baremeWeight,
  criteriaOf,
  criterionTitle,
  describeCriterion,
  isSimpleScoring,
} from '../bareme';
import { needsTests } from '../exerciseTypes';

/**
 * @param exercise  l'exercice, points et barème compris
 * @param onChange  reçoit l'exercice entier modifié
 * @param showTotal masqué quand le total se saisit ailleurs (liste des exercices)
 */
export default function PointsEditor({ exercise, onChange, readOnly = false, showTotal = true }) {
  const total = Number(exercise.points) || 0;
  const criteria = criteriaOf(exercise);
  const tests = exercise.tests ?? [];
  const official = tests.filter((t) => t.kind === 'official');
  const simple = isSimpleScoring(exercise);
  const détaillable = needsTests(exercise.kind) && criteria.length + official.length > 0;

  // Au barème simplifié, la part se recalcule à l'affichage : un test ajouté
  // après coup pèserait sinon la valeur héritée du modèle jusqu'au prochain
  // enregistrement, et la ligne affichée mentirait sur ce qui sera écrit.
  const weight = simple ? total : baremeWeight(criteria, tests);
  const écart = Math.round((weight - total) * 100) / 100;
  const part =
    criteria.length + official.length > 0
      ? Math.round((total / (criteria.length + official.length)) * 100) / 100
      : 0;

  const setTotal = (points) => {
    const next = { ...exercise, points };
    onChange(isSimpleScoring(next) ? autoDistribute(next) : next);
  };

  const setMode = (custom) => {
    const next = {
      ...exercise,
      settings: { ...exercise.settings, scoring_mode: custom ? 'custom' : 'simple' },
    };
    onChange(custom ? next : autoDistribute(next));
  };

  const setCriterionPoints = (id, points) =>
    onChange({
      ...exercise,
      settings: {
        ...exercise.settings,
        criteria: criteria.map((c) => (c.id === id ? { ...c, points } : c)),
      },
    });

  const setTestPoints = (index, points) =>
    onChange({
      ...exercise,
      tests: tests.map((t, i) => (i === index ? { ...t, points } : t)),
    });

  return (
    <section className="points-editeur">
      {showTotal && (
        <header className="points-editeur-tete">
          <div>
            <strong style={{ fontSize: 13 }}>Combien vaut cet exercice</strong>
            <p className="sub" style={{ margin: '2px 0 0', fontSize: 12 }}>
              Le total sur lequel la copie sera notée pour cet exercice.
            </p>
          </div>
          <label className="points-ligne-champ" style={{ marginLeft: 'auto' }}>
            <input
              type="number"
              min="0"
              step="0.5"
              aria-label="Points de l'exercice"
              value={exercise.points ?? ''}
              disabled={readOnly}
              onChange={(e) => setTotal(e.target.value)}
            />
            <span className="sub">pts</span>
          </label>
        </header>
      )}

      {!needsTests(exercise.kind) && (
        <p className="sub" style={{ margin: '8px 0 0' }}>
          Correction automatique : les {total} points se partagent entre les questions de
          l'exercice.
        </p>
      )}

      {détaillable && (
        <>
          <div className="points-mode">
            <label className="switch" style={{ fontSize: 13, gap: 6 }}>
              <input
                type="checkbox"
                checked={!simple}
                disabled={readOnly}
                onChange={(e) => setMode(e.target.checked)}
              />
              <span>Peser chaque ligne moi-même</span>
            </label>
            {simple ? (
              <span className="sub">
                {total} pts partagés à parts égales entre {criteria.length + official.length}{' '}
                ligne{criteria.length + official.length > 1 ? 's' : ''} → {part} pt
                {part > 1 ? 's' : ''} chacune
              </span>
            ) : (
              <span className="sub">
                Barème saisi : {weight} / {total} pts
                {écart !== 0 &&
                  (écart > 0
                    ? ` — ${écart} pt${écart > 1 ? 's' : ''} de trop`
                    : ` — ${-écart} pt${-écart > 1 ? 's' : ''} à placer`)}
              </span>
            )}
            {!simple && !readOnly && (
              <Button
                variant="secondary"
                size="small"
                style={{ marginLeft: 'auto' }}
                onClick={() => onChange(autoDistribute(exercise))}
              >
                Répartir les {total} pts
              </Button>
            )}
          </div>

          <div className="points-lignes">
            {criteria.map((criterion) => {
              const titre = criterionTitle(criterion);
              const détail = describeCriterion(criterion);
              return (
              <div className="points-ligne" key={criterion.id}>
                <span className="points-ligne-titre">
                  {titre || <em className="sub">(déclaration sans nom)</em>}
                  {détail !== titre && (
                    <span className="sub" style={{ marginLeft: 8, fontSize: 12 }}>
                      {détail}
                    </span>
                  )}
                </span>
                <label className="points-ligne-champ">
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    aria-label={`Points de la ligne ${titre}`}
                    value={simple ? part : (criterion.points ?? 0)}
                    disabled={readOnly || simple}
                    onChange={(e) => setCriterionPoints(criterion.id, e.target.value)}
                  />
                  <span className="sub">pts</span>
                </label>
              </div>
              );
            })}

            {tests.map((test, index) =>
              test.kind !== 'official' ? null : (
                <div className="points-ligne" key={test.id ?? `t-${index}`}>
                  <span className="points-ligne-titre">
                    {test.name?.trim() || `Test ${index + 1}`}
                    <span className="sub" style={{ marginLeft: 8, fontSize: 12 }}>
                      test d'exécution
                    </span>
                  </span>
                  <label className="points-ligne-champ">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      aria-label={`Points du test ${test.name || index + 1}`}
                      value={simple ? part : (test.points ?? 0)}
                      disabled={readOnly || simple}
                      onChange={(e) => setTestPoints(index, e.target.value)}
                    />
                    <span className="sub">pts</span>
                  </label>
                </div>
              ),
            )}

            <div className="points-total">
              <span>Barème de l'exercice</span>
              <strong>
                {weight} / {total} pts
              </strong>
            </div>
          </div>
        </>
      )}

      {needsTests(exercise.kind) && !détaillable && (
        <p className="sub" style={{ margin: '8px 0 0' }}>
          Rien à pondérer : cet exercice n'a encore ni déclaration exigée ni test officiel.
        </p>
      )}
    </section>
  );
}
