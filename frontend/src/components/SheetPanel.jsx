/**
 * Le panneau voisin de la feuille : ce qui n'a pas de place sur un sujet.
 *
 * Sans exercice sélectionné, il règle l'épreuve (ouverture, type, modalités de
 * passage) et dresse la liste des exercices avec ce qui leur manque. Un
 * exercice sélectionné, il montre ce qui lui manque, son barème détaillé, le
 * corrigé à montrer aux étudiants, et les gestes pour le déplacer, le copier ou
 * le retirer. La comparaison des sorties, le code de départ et les outils
 * autorisés se règlent sur la feuille, là où ils servent.
 */

import { useState } from 'react';

import PointsEditor from './PointsEditor';
import SolutionEditor from './SolutionEditor';
import { Button, Field, Segmented } from './ui';
import { EVALUATION_KINDS, RULE_SWITCHES } from '../evaluationDefaults';
import { exerciseType, needsTests } from '../exerciseTypes';
import { questionsOf } from '../questions';
import { exerciseIssues, parseQcmText, withQuestions } from '../sheetEditor';
import { traceColumns } from '../trace';

function fmt(value) {
  return String(Math.round((Number(value) || 0) * 100) / 100).replace('.', ',');
}

export default function SheetPanel(props) {
  const { index, exercises } = props;
  const exercise = index !== null ? exercises[index] : null;
  return (
    <aside className="feuille-panneau" aria-label="Réglages">
      <div className="feuille-panneau-corps">
        {exercise ? (
          <ExercisePanel {...props} exercise={exercise} />
        ) : (
          <EvaluationPanel {...props} />
        )}
      </div>
    </aside>
  );
}

function StateLine({ exercise }) {
  const issues = exerciseIssues(exercise);
  return (
    <span className={`panneau-etat ${issues.length ? 'panneau-etat--manque' : 'panneau-etat--pret'}`}>
      {issues.length ? issues[0] : 'Prêt'}
    </span>
  );
}

function EvaluationPanel({
  form,
  onForm,
  exercises,
  status,
  evaluationId,
  canEditSubject,
  sum,
  total,
  onSelect,
  onDistribute,
  onStart,
  startPending,
}) {
  const [dated, setDated] = useState(Boolean(form.scheduled_start));
  const rules = form.rules;
  const setRule = (key, value) => onForm({ rules: { ...rules, [key]: value } });
  const pointsOk = Math.round((sum - total) * 100) === 0;

  return (
    <>
      <section className="panneau-section">
        <span className="panneau-titre">L’épreuve</span>
        <p className="panneau-aide">
          Titre, classe, matière, durée et barème se modifient sur la feuille. Cliquez sur un
          exercice pour voir ses réglages.
        </p>
      </section>

      <section className="panneau-section">
        <span className="panneau-sous-titre">Ouverture</span>
        <Segmented
          label="Ouverture de la session"
          value={dated ? 'date' : 'manual'}
          options={[
            { value: 'manual', label: 'Je la lance' },
            { value: 'date', label: 'À une date' },
          ]}
          onChange={(value) => {
            if (!canEditSubject || value === null) return;
            setDated(value === 'date');
            if (value === 'manual') onForm({ scheduled_start: '' });
          }}
        />
        {dated && (
          <Field label="Date et heure d’ouverture" id="ouverture">
            <input
              id="ouverture"
              type="datetime-local"
              value={form.scheduled_start}
              disabled={!canEditSubject}
              onChange={(e) => onForm({ scheduled_start: e.target.value })}
            />
          </Field>
        )}
      </section>

      <section className="panneau-section">
        <span className="panneau-sous-titre">Type d’épreuve</span>
        <Segmented
          label="Type d’épreuve"
          value={form.kind}
          options={EVALUATION_KINDS.map((k) => ({ value: k.value, label: k.label }))}
          onChange={(value) => canEditSubject && value && onForm({ kind: value })}
        />
      </section>

      <section className="panneau-section">
        <span className="panneau-sous-titre">Surveillance et corrigé</span>
        <div>
          {RULE_SWITCHES.map(([key, title, hint]) => (
            <label className="switch" key={key}>
              <input
                type="checkbox"
                checked={Boolean(rules[key])}
                disabled={!canEditSubject}
                onChange={(e) => setRule(key, e.target.checked)}
              />
              <span>
                <strong>{title}</strong>
                <span className="sub">{hint}</span>
              </span>
            </label>
          ))}
          <label className="switch">
            <input
              type="checkbox"
              checked={rules.announce_to_students !== false}
              disabled={!canEditSubject}
              onChange={(e) => setRule('announce_to_students', e.target.checked)}
            />
            <span>
              <strong>Annoncer l’épreuve aux étudiants</strong>
              <span className="sub">
                {rules.announce_to_students !== false
                  ? 'La classe la voit dès la publication, avec sa date et sa durée.'
                  : 'Non annoncée : elle n’apparaît qu’au lancement de la session.'}
              </span>
            </span>
          </label>
          <label className="switch">
            <input
              type="checkbox"
              checked={rules.show_solutions !== false}
              disabled={!canEditSubject}
              onChange={(e) => setRule('show_solutions', e.target.checked)}
            />
            <span>
              <strong>Montrer le corrigé avec les notes</strong>
              <span className="sub">Réponses attendues, solution type et résultats des tests.</span>
            </span>
          </label>
        </div>
        <label className="panneau-coche">
          Sorties autorisées avant verrouillage
          <input
            className="panneau-nombre"
            type="number"
            min="0"
            max="20"
            value={rules.max_incidents ?? 1}
            disabled={!canEditSubject}
            onChange={(e) => setRule('max_incidents', Number(e.target.value))}
          />
        </label>
        <label className="panneau-coche">
          Entrée fermée après (min)
          <input
            className="panneau-nombre"
            type="number"
            min="0"
            max="600"
            value={rules.late_entry_minutes ?? 0}
            disabled={!canEditSubject}
            onChange={(e) => setRule('late_entry_minutes', Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <p className="panneau-aide">0 sortie : jamais de verrouillage. 0 minute : entrée possible jusqu’à la fin.</p>
      </section>

      <section className="panneau-section">
        <div className="panneau-tete">
          <span className="panneau-sous-titre">Exercices</span>
          <span className={`feuille-total ${pointsOk ? 'feuille-total--juste' : 'feuille-total--ecart'}`}>
            {fmt(sum)} / {fmt(total)} pts
          </span>
        </div>
        {exercises.length === 0 ? (
          <p className="panneau-aide">Aucun exercice : ajoutez-en un au bas de la feuille.</p>
        ) : (
          <div className="panneau-exercices">
            {exercises.map((exercise, i) => (
              <button
                key={exercise._key ?? exercise.id ?? i}
                type="button"
                className="panneau-exercice"
                onClick={() => onSelect(i)}
              >
                <span className="panneau-exercice-num">{i + 1}</span>
                <span className="panneau-exercice-corps">
                  <span className="panneau-exercice-titre">
                    {exercise.title?.trim() || 'Exercice sans intitulé'}
                  </span>
                  <span className="panneau-exercice-meta">
                    <span className="panneau-tag" data-kind={exercise.kind ?? 'code'}>
                      {exerciseType(exercise.kind).badge}
                    </span>
                    <StateLine exercise={exercise} />
                  </span>
                </span>
                <span className="panneau-exercice-pts">{fmt(exercise.points)} pts</span>
              </button>
            ))}
          </div>
        )}
        {!pointsOk && exercises.length > 0 && canEditSubject && (
          <div>
            <Button variant="secondary" size="small" onClick={onDistribute}>
              Répartir les {fmt(total)} points à parts égales
            </Button>
          </div>
        )}
      </section>

      {evaluationId && ['draft', 'scheduled'].includes(status) && (
        <section className="panneau-section">
          <Button variant="secondary" size="small" disabled={startPending} onClick={onStart}>
            Lancer la session maintenant
          </Button>
          <p className="panneau-aide">Enregistre le sujet, puis ouvre l’épreuve à la classe.</p>
        </section>
      )}
    </>
  );
}

function ExercisePanel({
  index,
  exercise,
  exercises,
  canEditSubject,
  canEditCorrection,
  onSelect,
  onExercise,
  onMove,
  onDuplicate,
  onRemove,
  onToBank,
  toBankPending,
}) {
  const kind = exercise.kind ?? 'code';
  const key = exercise._key ?? exercise.id ?? `e-${index}`;
  const issues = exerciseIssues(exercise);
  const change = (patch) => onExercise(index, patch);

  return (
    <>
      <section className="panneau-section">
        <div className="panneau-tete">
          <span className="panneau-titre">Exercice {index + 1}</span>
          <button type="button" className="panneau-lien" onClick={() => onSelect(null)}>
            Réglages de l’épreuve
          </button>
        </div>
        <div className="panneau-ligne">
          <span className="panneau-tag" data-kind={kind}>
            {exerciseType(kind).label}
          </span>
          <StateLine exercise={exercise} />
        </div>
        {issues.length > 1 && (
          <ul className="panneau-problemes">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        <p className="panneau-aide">{exerciseType(kind).gradingNote}</p>
      </section>

      <ExerciseSettings
        exercise={exercise}
        change={change}
        name={String(key)}
        canEditSubject={canEditSubject}
        canEditCorrection={canEditCorrection}
      />

      {canEditSubject && (
        <section className="panneau-section">
          <div className="panneau-actions">
            <Button variant="secondary" size="small" disabled={index === 0} onClick={() => onMove(index, -1)}>
              ↑ Monter
            </Button>
            <Button
              variant="secondary"
              size="small"
              disabled={index === exercises.length - 1}
              onClick={() => onMove(index, 1)}
            >
              ↓ Descendre
            </Button>
            <Button variant="secondary" size="small" onClick={() => onDuplicate(index)}>
              Dupliquer
            </Button>
          </div>
          <div className="panneau-actions">
            <Button
              variant="secondary"
              size="small"
              disabled={toBankPending || !exercise.title?.trim()}
              onClick={() => onToBank(index)}
            >
              Enregistrer dans la banque
            </Button>
            <Button variant="danger-ghost" size="small" onClick={() => onRemove(index)}>
              Supprimer
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

/**
 * Les réglages d'un exercice qui n'ont pas de place sur la feuille, selon son
 * type. Partagés par l'éditeur d'évaluation et la banque d'exercices ; la
 * banque n'a pas de points (`showPoints`), ils se décident dans l'évaluation.
 */
export function ExerciseSettings({
  exercise,
  change,
  name,
  canEditSubject,
  canEditCorrection,
  showPoints = true,
}) {
  const kind = exercise.kind ?? 'code';
  return (
    <>
      {showPoints && needsTests(kind) && (
        <section className="panneau-section">
          <span className="panneau-sous-titre">Barème de l’exercice</span>
          <PointsEditor
            exercise={exercise}
            readOnly={!canEditCorrection}
            showTotal={false}
            onChange={(next) => change(() => next)}
          />
        </section>
      )}

      {kind === 'trace' && <TraceColumnsSection exercise={exercise} change={change} canEdit={canEditSubject} />}
      {kind === 'qcm' && <QcmPasteSection change={change} canEdit={canEditSubject} />}
      {kind === 'short' && (
        <ShortSection
          exercise={exercise}
          change={change}
          canEditSubject={canEditSubject}
          canEditCorrection={canEditCorrection}
        />
      )}
      {(kind === 'truefalse' || kind === 'matching') && (
        <section className="panneau-section">
          <p className="panneau-aide">
            {kind === 'truefalse'
              ? 'Tout se règle sur la feuille : entourez V ou F en face de chaque affirmation.'
              : 'Tout se règle sur la feuille : écrivez en rouge la bonne correspondance de chaque élément. Chaque étudiant voit les deux colonnes mélangées, dans un ordre qui lui est propre.'}
          </p>
        </section>
      )}

      <section className="panneau-section">
        <SolutionEditor
          kind={kind}
          name={`corrige-${name}`}
          settings={exercise.settings ?? {}}
          readOnly={!canEditCorrection}
          onChange={(settings) => change({ settings })}
        />
      </section>
    </>
  );
}

function TraceColumnsSection({ exercise, change, canEdit }) {
  const columns = traceColumns(exercise.settings);
  return (
    <section className="panneau-section">
      <span className="panneau-sous-titre">Colonnes fournies à l’étudiant</span>
      <p className="panneau-aide">
        Une colonne fournie est recopiée sur sa feuille, le numéro d’instruction par exemple. Les
        autres lui arrivent vides et sont notées case par case.
      </p>
      <div>
        {columns.map((column, c) => (
          <label className="panneau-coche" key={c}>
            <input
              type="checkbox"
              checked={column.given}
              disabled={!canEdit}
              onChange={(e) =>
                change((ex) => ({
                  settings: {
                    ...ex.settings,
                    columns: traceColumns(ex.settings).map((col, i) =>
                      i === c ? { ...col, given: e.target.checked } : col,
                    ),
                  },
                }))
              }
            />
            {column.title || `Colonne ${c + 1}`}
          </label>
        ))}
      </div>
    </section>
  );
}

function QcmPasteSection({ change, canEdit }) {
  const [text, setText] = useState('');
  const parsed = parseQcmText(text);
  if (!canEdit) return null;

  const add = () => {
    if (parsed.length === 0) return;
    change((ex) => {
      const kept = questionsOf('qcm', ex.settings).filter(
        (q) => q.text?.trim() || (q.choices ?? []).some((c) => c.text?.trim()),
      );
      return { settings: withQuestions(ex.settings, [...kept, ...parsed]) };
    });
    setText('');
  };

  return (
    <section className="panneau-section">
      <label className="panneau-sous-titre" htmlFor="coller-qcm">
        Coller des questions
      </label>
      <p className="panneau-aide">
        Depuis Word ou le PDF du sujet : une question par paragraphe, « - » devant chaque
        proposition, « * » devant la bonne.
      </p>
      <textarea
        id="coller-qcm"
        className="panneau-coller"
        value={text}
        placeholder={'Quelle étape vient en premier ?\n- L’édition de liens\n* Le prétraitement\n- L’exécution'}
        onChange={(e) => setText(e.target.value)}
      />
      <div>
        <Button size="small" disabled={parsed.length === 0} onClick={add}>
          {parsed.length > 1
            ? `Ajouter ${parsed.length} questions`
            : parsed.length === 1
              ? 'Ajouter 1 question'
              : 'Ajouter au QCM'}
        </Button>
      </div>
    </section>
  );
}

function ShortSection({ exercise, change, canEditSubject, canEditCorrection }) {
  const questions = questionsOf('short', exercise.settings);
  const setQuestion = (qi, patch) =>
    change((ex) => ({
      settings: withQuestions(
        ex.settings,
        questionsOf('short', ex.settings).map((q, i) => (i === qi ? { ...q, ...patch } : q)),
      ),
    }));

  return (
    <section className="panneau-section">
      <span className="panneau-sous-titre">Correction des questions</span>
      <p className="panneau-aide">
        Écrite à la main sur la feuille, la réponse attendue corrige automatiquement. Laissée vide,
        la question vous est signalée pour une correction à la main.
      </p>
      {questions.map((question, qi) => (
        <div key={qi} style={{ display: 'grid', gap: 4 }}>
          <span className="panneau-sous-titre">Q{qi + 1}</span>
          <label className="panneau-coche">
            <input
              type="checkbox"
              checked={Boolean(question.keywords_mode)}
              disabled={!canEditCorrection}
              onChange={(e) => setQuestion(qi, { keywords_mode: e.target.checked })}
            />
            Noter sur les mots-clés présents
          </label>
          <label className="panneau-coche">
            Lignes de réponse sur la feuille
            <input
              className="panneau-nombre"
              type="number"
              min="1"
              max="12"
              value={question.rows ?? 4}
              disabled={!canEditSubject}
              onChange={(e) => setQuestion(qi, { rows: Number(e.target.value) })}
            />
          </label>
        </div>
      ))}
    </section>
  );
}
