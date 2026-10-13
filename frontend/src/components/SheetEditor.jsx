/**
 * La feuille du sujet, modifiable sur place.
 *
 * L'enseignant compose son épreuve là où l'étudiant la lira : l'en-tête porte
 * le titre, la classe, la matière, la durée et le barème ; chaque exercice se
 * lit dans l'ordre du sujet imprimé. Ce que l'étudiant verra s'écrit à l'encre
 * de la feuille. Le corrigé, qu'il ne verra pas (bonnes réponses, jeux de tests,
 * cases attendues), s'écrit à l'encre rouge du correcteur, au même endroit.
 *
 * Les réglages qui n'ont pas de place sur une feuille (comparaison des sorties,
 * fichiers de départ, outils autorisés…) vivent dans le panneau voisin
 * (`SheetPanel`), qui suit l'exercice sélectionné.
 */

import { useState } from 'react';

import BaremeEditor from './BaremeEditor';
import CodeBlock from './CodeBlock';
import GradeMark from './GradeMark';
import TestsEditor from './TestsEditor';
import { Button } from './ui';
import { DEFAULT_ELEMENTS } from '../algoVocabulary';
import {
  CRITERION_PROMPTS,
  DECLARATION_LANGUAGES,
  callableCriteria,
  criteriaOf,
  describeCriterion,
  formatValue,
  inputTypesOf,
  valueType,
} from '../bareme';
import { parseDeclarations } from '../cDeclarations';
import {
  evaluationUsesLanguage,
  exerciseType,
  hasQuestions,
  subjectLanguage,
  typeFamilies,
} from '../exerciseTypes';
import { formatExamDate, formatExamDuration } from '../format';
import { isProject, projectFiles, starterText } from '../project';
import { blankQuestion, questionsOf } from '../questions';
import { EMPTY_TEST, newKey, newProgramTest, rowsFor, stdinOf, withQuestions } from '../sheetEditor';
import { MAX_COLUMNS, MAX_ROWS, traceColumns, traceRows } from '../trace';

const DURATIONS = [15, 20, 30, 45, 60, 90, 120, 150, 180, 240];

function letter(index) {
  return index < 26 ? String.fromCharCode(97 + index) : String(index + 1);
}

function sessionYear(date) {
  const value = date ? new Date(date) : new Date();
  return Number.isNaN(value.getTime()) ? new Date().getFullYear() : value.getFullYear();
}

/** Un champ de texte qui grandit avec ce qu'on y écrit. */
function AutoText({ value, width = 84, minRows = 1, ...props }) {
  return <textarea rows={Math.max(minRows, rowsFor(value, width))} value={value ?? ''} {...props} />;
}

/**
 * Une liste saisie sur une ligne (`40 3`, `LIFO | pile`). Le texte tapé reste
 * tel quel le temps de l'écrire : le découper à chaque frappe mangerait
 * l'espace ou le séparateur qu'on vient de taper. Le parent remonte le champ
 * (par sa `key`) quand la liste change d'ailleurs.
 */
function SplitInput({ value, split, join, onChange, ...props }) {
  const [text, setText] = useState(() => join(value ?? []));
  return (
    <input
      {...props}
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        onChange(split(event.target.value));
      }}
    />
  );
}

const words = (text) => text.trim().split(/\s+/).filter(Boolean);

export default function SheetEditor({
  form,
  onForm,
  exercises,
  onExercise,
  selected,
  onSelect,
  canEditSubject,
  canEditCorrection,
  classrooms,
  subjects,
  languages,
  openKeys,
  header,
  organization,
  sum,
  total,
  ui,
  onUi,
  onAdd,
  bank,
}) {
  /* Un clic hors de tout exercice, sur la feuille ou autour, rend le panneau
     aux réglages de l'épreuve. Les champs et les boutons gardent leur clic. */
  const onBlankClick = (event) => {
    if (event.target.closest('[data-exercise], button, input, select, textarea, a, label')) return;
    onSelect(null);
  };

  return (
    // Le clic dans le vide n'est qu'un raccourci : au clavier, le lien
    // « Réglages de l'épreuve » du panneau fait la même chose.
    <div className="feuille-plateau" onClick={onBlankClick}>
      <article className="feuille-papier sujet" aria-label="Feuille du sujet">
        <div className="feuille-note">
          <GradeMark
            score={sum}
            total={total}
            label={`Points répartis : ${sum} sur ${total}`}
          />
          <p className="note-marge note-marge--rouge">
            {Math.round((total - sum) * 100) === 0
              ? 'barème réparti'
              : total > sum
                ? `il manque ${Math.round((total - sum) * 100) / 100} pt${total - sum > 1 ? 's' : ''}`
                : `${Math.round((sum - total) * 100) / 100} pt${sum - total > 1 ? 's' : ''} de trop`}
          </p>
        </div>

        <EditableHeader
          form={form}
          onForm={onForm}
          exercises={exercises}
          canEdit={canEditSubject}
          classrooms={classrooms}
          subjects={subjects}
          languages={languages}
          openKeys={openKeys}
          header={header}
          organization={organization}
          onFocus={() => onSelect(null)}
        />

        {exercises.map((exercise, index) => {
          const kind = exercise.kind ?? 'code';
          const groupStart = index === 0 || (exercises[index - 1].kind ?? 'code') !== kind;
          const key = exercise._key ?? exercise.id ?? `e-${index}`;
          return (
            <div key={key}>
              {groupStart && <h2 className="sujet-bloc-titre">{exerciseType(kind).sheetTitle}</h2>}
              <ExerciseOnSheet
                exercise={exercise}
                index={index}
                selected={selected === index}
                onSelect={() => onSelect(index)}
                onChange={(patch) => onExercise(index, patch)}
                canEditSubject={canEditSubject}
                canEditCorrection={canEditCorrection}
                ui={ui[key] ?? {}}
                onUi={(patch) => onUi(key, patch)}
              />
            </div>
          );
        })}

        {canEditSubject && <AddExercise empty={exercises.length === 0} onAdd={onAdd} bank={bank} />}

        <div className="sujet-pied">
          Fin du sujet · {exercises.length} exercice{exercises.length !== 1 ? 's' : ''} · {sum} points
        </div>
      </article>
    </div>
  );
}

/**
 * L'en-tête de la feuille, celui de l'étudiant, avec ses champs : la classe à
 * la place du nom de classe, la matière à la place de l'intitulé du concours,
 * le titre, la durée et le barème dans le cartouche.
 */
function EditableHeader({
  form,
  onForm,
  exercises,
  canEdit,
  classrooms,
  subjects,
  languages,
  openKeys,
  header,
  organization,
  onFocus,
}) {
  const layout = header?.layout ?? 'classique';
  const leftLines = (header?.left_lines ?? []).filter((line) => line.trim());
  const rightLines = (header?.right_lines ?? []).filter((line) => line.trim());
  const [main, ...rest] = leftLines.length > 0 ? leftLines : [organization ?? 'CodEval'];
  const showSession = header?.show_session !== false;
  const session = showSession && (
    <div className="sujet-session">Session : {sessionYear(form.scheduled_start)}</div>
  );

  const subject = subjects.find((s) => String(s.id) === String(form.subject_id));
  const imposed = subjectLanguage(subject);
  const usesLanguage = evaluationUsesLanguage(exercises);
  // Une matière dont le langage est fermé ne reçoit plus de nouvelle épreuve,
  // mais celle déjà choisie reste proposée.
  const offered = (s) =>
    !openKeys || openKeys.has(s.language) || String(s.id) === String(form.subject_id);
  const chooseSubject = (subjectId) => {
    const language = subjectLanguage(subjects.find((s) => String(s.id) === String(subjectId)));
    onForm({ subject_id: subjectId, ...(language ? { language } : {}) });
  };
  const durations = DURATIONS.includes(Number(form.duration_minutes))
    ? DURATIONS
    : [...DURATIONS, Number(form.duration_minutes)].sort((a, b) => a - b);

  const subjectSelect = (className) => (
    <select
      className={`ink ${className}`}
      aria-label="Matière"
      value={form.subject_id}
      disabled={!canEdit}
      onChange={(e) => chooseSubject(e.target.value)}
    >
      <option value="">{header?.title ? 'Aucune matière' : 'MATIÈRE À CHOISIR'}</option>
      {subjects.filter(offered).map((s) => (
        <option key={s.id} value={s.id}>
          {header?.title ? s.name : s.name.toUpperCase()}
        </option>
      ))}
    </select>
  );

  let languageText = null;
  if (imposed !== null && usesLanguage) {
    languageText = imposed ? (
      <> · Langage : {(languages.find((l) => l.key === imposed)?.label ?? imposed).toUpperCase()}</>
    ) : (
      <>
        {' '}
        · Langage :{' '}
        <select
          className="ink"
          aria-label="Langage des exercices de code"
          value={form.language}
          disabled={!canEdit}
          onChange={(e) => onForm({ language: e.target.value })}
        >
          {languages.map((l) => (
            <option key={l.key} value={l.key}>
              {l.label.toUpperCase()}
            </option>
          ))}
        </select>
      </>
    );
  }

  return (
    <>
      <header className={`sujet-entete sujet-entete--${layout}`} onFocus={onFocus}>
        <div className="sujet-entete-haut">
          <div className="sujet-etablissement">
            {header?.logo && <img className="sujet-logo" src={header.logo} alt="" />}
            <div className="sujet-etablissement-texte">
              <div className="sujet-etablissement-nom">{main}</div>
              {rest.map((line, index) => (
                <div className="sujet-etablissement-ligne" key={index}>
                  {line}
                </div>
              ))}
              <select
                className="ink feuille-classe"
                aria-label="Classe"
                value={form.classroom_id}
                disabled={!canEdit}
                onChange={(e) => onForm({ classroom_id: e.target.value })}
              >
                <option value="">Classe à choisir</option>
                {classrooms.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <div className="feuille-aide-entete">En-tête réglé dans vos Paramètres</div>
            </div>
          </div>
          {layout === 'officiel' ? (
            <div className="sujet-republique">
              {rightLines.map((line, index) => (
                <div className="sujet-republique-ligne" key={index}>
                  {line}
                </div>
              ))}
              {session}
            </div>
          ) : (
            session
          )}
        </div>

        <div className="sujet-concours">
          {header?.title ? header.title.toUpperCase() : subjectSelect('feuille-concours')}
        </div>

        <div className="sujet-cartouche">
          <div className="sujet-cartouche-ligne">
            <span className="sujet-cartouche-cle">ÉPREUVE</span> :{' '}
            <input
              id="titre-epreuve"
              className="ink feuille-titre-epreuve"
              aria-label="Titre de l’épreuve"
              size={Math.max(14, (form.title ?? '').length + 1)}
              value={form.title}
              disabled={!canEdit}
              placeholder="Titre de l’épreuve"
              onChange={(e) => onForm({ title: e.target.value })}
            />
          </div>
          <div className="sujet-cartouche-ligne">
            Durée :{' '}
            <select
              className="ink"
              aria-label="Durée"
              value={Number(form.duration_minutes)}
              disabled={!canEdit}
              onChange={(e) => onForm({ duration_minutes: Number(e.target.value) })}
            >
              {durations.map((m) => (
                <option key={m} value={m}>
                  {formatExamDuration(m)}
                </option>
              ))}
            </select>
            {form.scheduled_start ? ` · Date : ${formatExamDate(form.scheduled_start)}` : ''}
          </div>
          <div className="sujet-cartouche-ligne sujet-cartouche-ligne--fine">
            {header?.title && <>Matière : {subjectSelect('')} · </>}
            Barème :{' '}
            <input
              className="ink ink-court"
              type="number"
              min="1"
              aria-label="Barème total"
              value={form.total_points}
              disabled={!canEdit}
              onChange={(e) => onForm({ total_points: e.target.value })}
            />{' '}
            points{languageText}
          </div>
        </div>

        <div className="sujet-filet" aria-hidden="true" />
      </header>

      <AutoText
        className="ink sujet-consignes feuille-consignes"
        aria-label="Consignes générales"
        value={form.instructions}
        width={70}
        disabled={!canEdit}
        placeholder="Ajouter des consignes : documents autorisés, calculatrice…"
        onFocus={onFocus}
        onChange={(e) => onForm({ instructions: e.target.value })}
      />
    </>
  );
}

function ExerciseOnSheet({
  exercise,
  index,
  selected,
  onSelect,
  onChange,
  canEditSubject,
  canEditCorrection,
  ui,
  onUi,
}) {
  const kind = exercise.kind ?? 'code';
  const number = index + 1;

  return (
    <section
      className={`feuille-ex ${selected ? 'est-choisi' : ''}`.trim()}
      aria-label={`Exercice ${number}`}
      data-exercise
      onFocus={onSelect}
    >
      <div className="feuille-ex-tete sujet-question-tete">
        <button type="button" className="feuille-ex-num" onClick={onSelect}>
          Exercice {number}
        </button>
        <span aria-hidden="true">:</span>
        <input
          className="ink feuille-ex-titre"
          aria-label={`Intitulé de l’exercice ${number}`}
          value={exercise.title}
          disabled={!canEditSubject}
          placeholder="Intitulé de l’exercice"
          onChange={(e) => onChange({ title: e.target.value })}
        />
        <label className="feuille-ex-pts">
          <input
            className="ink"
            type="number"
            min="0"
            step="0.5"
            aria-label={`Points de l’exercice ${number}`}
            value={exercise.points}
            disabled={!canEditCorrection}
            onChange={(e) => onChange({ points: e.target.value })}
          />{' '}
          pts
        </label>
      </div>

      {!hasQuestions(kind) && (
        <AutoText
          className="ink sujet-enonce"
          aria-label={`Énoncé de l’exercice ${number}`}
          value={exercise.statement}
          width={80}
          disabled={!canEditSubject}
          placeholder={
            kind === 'trace'
              ? 'Énoncé : « Faire la simulation de l’algorithme ci-dessous pour laquelle l’utilisateur a saisi… »'
              : kind === 'truefalse'
                ? 'Consigne (facultatif)'
                : 'Énoncé de l’exercice, avec un exemple d’exécution si besoin.'
          }
          onChange={(e) => onChange({ statement: e.target.value })}
        />
      )}

      {(kind === 'code' || kind === 'algo') && (
        <Criteria exercise={exercise} onChange={onChange} canEdit={canEditCorrection} ui={ui} onUi={onUi} />
      )}
      {kind === 'code' && <CodeEnvironment exercise={exercise} />}
      {kind === 'algo' && (
        <p className="feuille-ligne-info feuille-ligne-info--discrete">
          Outils autorisés : {(exercise.settings?.allowed_elements ?? DEFAULT_ELEMENTS).length}{' '}
          éléments du cours, réglés dans le panneau.
        </p>
      )}
      {(kind === 'code' || kind === 'algo') && (
        <TestsCorrige
          exercise={exercise}
          onChange={onChange}
          canEdit={canEditCorrection}
          ui={ui}
          onUi={onUi}
        />
      )}
      {kind === 'trace' && (
        <TraceOnSheet
          exercise={exercise}
          onChange={onChange}
          canEditSubject={canEditSubject}
          canEditCorrection={canEditCorrection}
        />
      )}
      {kind === 'qcm' && (
        <QcmOnSheet
          exercise={exercise}
          onChange={onChange}
          canEditSubject={canEditSubject}
          canEditCorrection={canEditCorrection}
        />
      )}
      {kind === 'matching' && (
        <MatchingOnSheet exercise={exercise} onChange={onChange} canEdit={canEditSubject} />
      )}
      {kind === 'short' && (
        <ShortOnSheet
          exercise={exercise}
          onChange={onChange}
          canEditSubject={canEditSubject}
          canEditCorrection={canEditCorrection}
        />
      )}
      {kind === 'truefalse' && (
        <TrueFalseOnSheet
          exercise={exercise}
          onChange={onChange}
          canEditSubject={canEditSubject}
          canEditCorrection={canEditCorrection}
        />
      )}
    </section>
  );
}

/**
 * Ce que la copie doit contenir. Ces lignes figurent sur le sujet de
 * l'étudiant (« Écrivez la fonction : … ») : elles s'écrivent à l'encre de la
 * feuille, pas en rouge. On les colle en C tel quel ; l'éditeur détaillé reste
 * là pour une variable locale ou un type que la lecture n'a pas compris.
 */
function Criteria({ exercise, onChange, canEdit, ui, onUi }) {
  const criteria = criteriaOf(exercise);
  const kind = exercise.kind ?? 'code';
  const pasteable = kind === 'code' && DECLARATION_LANGUAGES.has(exercise.language);
  const setCriteria = (next) =>
    onChange((ex) => ({ settings: { ...ex.settings, criteria: next } }));

  return (
    <>
      {criteria.length > 0 && (
        <ol className="feuille-criteres">
          {criteria.map((criterion) => (
            <li key={criterion.id}>
              <span>{CRITERION_PROMPTS[criterion.kind] ?? 'À écrire :'}</span>
              <code className="sujet-signature">{describeCriterion(criterion)}</code>
              {canEdit && (
                <button
                  type="button"
                  className="feuille-x"
                  aria-label={`Retirer ${describeCriterion(criterion)}`}
                  onClick={() => setCriteria(criteria.filter((c) => c.id !== criterion.id))}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ol>
      )}

      {canEdit && ui.paste && pasteable && (
        <PasteDeclarations
          onAdd={(found) => setCriteria([...criteriaOf(exercise), ...found])}
          onClose={() => onUi({ paste: false })}
        />
      )}

      {canEdit && !ui.paste && (
        <div className="feuille-gestes" style={{ margin: '0 0 0.6em 2.2em' }}>
          {pasteable && (
            <button type="button" className="feuille-ajout" onClick={() => onUi({ paste: true })}>
              + Déclarations exigées (coller du C)
            </button>
          )}
          <button
            type="button"
            className="feuille-ajout"
            onClick={() => onUi({ detailCriteria: !ui.detailCriteria })}
          >
            {ui.detailCriteria
              ? 'Fermer l’éditeur détaillé'
              : kind === 'algo'
                ? '+ Ce que l’algorithme doit contenir'
                : 'Éditeur détaillé'}
          </button>
        </div>
      )}

      {canEdit && ui.detailCriteria && (
        <div className="feuille-corrige feuille-corrige--detail">
          <BaremeEditor exercise={exercise} criteria={criteria} onCriteriaChange={setCriteria} />
        </div>
      )}
    </>
  );
}

function PasteDeclarations({ onAdd, onClose }) {
  const [text, setText] = useState('');
  const [unread, setUnread] = useState([]);

  const add = () => {
    const found = parseDeclarations(text);
    if (found.criteria.length) onAdd(found.criteria);
    if (found.unread.length === 0) {
      onClose();
      return;
    }
    // On laisse dans la boîte ce qui n'a pas été compris, à corriger sur place.
    setUnread(found.unread);
    setText(found.unread.map((line) => `${line};`).join('\n'));
  };

  return (
    <div className="feuille-coller">
      <textarea
        aria-label="Déclarations C à exiger"
        autoFocus
        spellCheck={false}
        value={text}
        placeholder={
          'typedef struct { float note; } Note;\nfloat MoyenneNotes(Etudiant *TabEtudiants, int n);\nint total;'
        }
        onChange={(e) => setText(e.target.value)}
      />
      {unread.length > 0 && (
        <p className="feuille-illisible" role="status">
          Non compris : corrigez la ligne, ou passez par l’éditeur détaillé.
        </p>
      )}
      <div className="feuille-gestes">
        <Button size="small" disabled={!text.trim()} onClick={add}>
          Ajouter
        </Button>
        <button type="button" className="feuille-ajout" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}

/** Le code de départ, tel que l'étudiant le trouvera : il se règle dans le panneau. */
function CodeEnvironment({ exercise }) {
  const starter = starterText(exercise);
  return (
    <>
      {isProject(exercise) && (
        <p className="feuille-ligne-info">
          Fichiers du projet : {projectFiles(exercise).map((f) => f.name).join(', ')}.
        </p>
      )}
      {starter.trim() && (
        <CodeBlock className="sujet-code" code={starter} language={exercise.language} />
      )}
    </>
  );
}

/** Le résumé d'un test qui appelle une fonction : `MoyenneNotes(…) renvoie 12.5`. */
function callLine(test, callable) {
  const criterion = callable.find((c) => c.id === test.target_id);
  if (!criterion) return `${test.name || 'Test'} : la fonction visée n’est plus déclarée`;
  const args = Array.isArray(test.args) ? test.args : [];
  const given = inputTypesOf(test, criterion).map((entry, i) => formatValue(entry.type, args[i]));
  const expected = String(test.expected_stdout ?? '').trim() || '…';
  return valueType(criterion.returns).input === 'none'
    ? `${criterion.name}(${given.join(', ')}) affiche ${expected}`
    : `${criterion.name}(${given.join(', ')}) renvoie ${expected}`;
}

/**
 * Le corrigé d'un exercice pratique : ses jeux de tests, à l'encre rouge. Un
 * test du programme entier tient sur une ligne (ce qu'on tape, ce qui doit
 * s'afficher) ; un test qui appelle une fonction, ou dont on veut régler les
 * types, passe par l'éditeur détaillé.
 */
function TestsCorrige({ exercise, onChange, canEdit, ui, onUi }) {
  const tests = exercise.tests ?? [];
  const callable = callableCriteria(exercise);
  const indexed = tests.map((test, index) => ({ test, index }));
  const program = indexed.filter(({ test }) => !test.target_id);
  const calls = indexed.filter(({ test }) => test.target_id);
  const showArgs =
    (exercise.kind ?? 'code') === 'code' &&
    (ui.args ?? tests.some((t) => (t.argv ?? []).length > 0));

  const setTest = (index, patch) =>
    onChange((ex) => ({ tests: ex.tests.map((t, j) => (j === index ? { ...t, ...patch } : t)) }));
  const removeTest = (index) => onChange((ex) => ({ tests: ex.tests.filter((_, j) => j !== index) }));
  const addTest = () => onChange((ex) => ({ tests: [...(ex.tests ?? []), newProgramTest(ex)] }));

  if (ui.detailTests && canEdit) {
    return (
      <div className="feuille-corrige feuille-corrige--detail">
        <div className="feuille-corrige-tete">
          <span className="feuille-main">Corrigé</span>
          <button type="button" className="feuille-ajout" onClick={() => onUi({ detailTests: false })}>
            Revenir à la saisie rapide
          </button>
        </div>
        <TestsEditor
          exercise={exercise}
          tests={tests}
          showComparison
          template={EMPTY_TEST}
          onChange={(next) => onChange({ tests: next })}
        />
      </div>
    );
  }

  return (
    <div className="feuille-corrige">
      <div className="feuille-corrige-tete">
        <span className="feuille-main">Corrigé</span>
        {canEdit && (
          <button type="button" className="feuille-ajout" onClick={() => onUi({ detailTests: true })}>
            Éditeur détaillé
          </button>
        )}
      </div>
      <span className="feuille-sous-titre">Tests</span>

      {program.length > 0 && (
        <div className={`feuille-tests ${showArgs ? 'avec-arguments' : ''}`.trim()}>
          <div className="feuille-test" aria-hidden="true">
            <span className="feuille-test-entete feuille-arg">Arguments</span>
            <span className="feuille-test-entete">
              {exercise.kind === 'algo' ? 'Valeurs saisies' : 'Saisies au clavier'}
            </span>
            <span className="feuille-test-entete">Doit afficher</span>
            <span />
          </div>
          {program.map(({ test, index }, n) => {
            const key = test._key ?? test.id ?? `t-${index}`;
            return (
              <div className="feuille-test" key={key}>
                <SplitInput
                  className="ink feuille-arg"
                  aria-label={`Arguments du test ${n + 1}`}
                  placeholder="ex. 40"
                  value={test.argv ?? []}
                  split={words}
                  join={(list) => list.join(' ')}
                  disabled={!canEdit}
                  onChange={(argv) => setTest(index, { argv })}
                />
                <AutoText
                  className="ink"
                  width={34}
                  spellCheck={false}
                  aria-label={`Entrées du test ${n + 1}`}
                  placeholder={exercise.kind === 'algo' ? 'ex. 12 5 15 10 0' : 'une ligne par saisie'}
                  value={stdinOf(test)}
                  disabled={!canEdit}
                  onChange={(e) => setTest(index, { stdin: e.target.value, input_types: [], args: [] })}
                />
                <AutoText
                  className="ink"
                  width={34}
                  spellCheck={false}
                  aria-label={`Sortie attendue du test ${n + 1}`}
                  placeholder={test.comparison === 'last_numbers' ? 'ex. 15 3' : 'le texte affiché'}
                  value={test.expected_stdout}
                  disabled={!canEdit}
                  onChange={(e) => setTest(index, { expected_stdout: e.target.value })}
                />
                {canEdit ? (
                  <button
                    type="button"
                    className="feuille-x"
                    aria-label={`Retirer le test ${n + 1}`}
                    onClick={() => removeTest(index)}
                  >
                    ×
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      )}

      {calls.length > 0 && (
        <>
          <ul className="feuille-appels">
            {calls.map(({ test, index }) => (
              <li key={test._key ?? test.id ?? `c-${index}`}>{callLine(test, callable)}</li>
            ))}
          </ul>
          <span className="feuille-indice">les appels de fonction se modifient dans l’éditeur détaillé</span>
        </>
      )}

      {tests.length === 0 && (
        <span className="feuille-indice">aucun test : écrivez ce que le programme doit afficher</span>
      )}

      {canEdit && (
        <div className="feuille-gestes">
          <button type="button" className="feuille-ajout" onClick={addTest}>
            + Ajouter un test
          </button>
        </div>
      )}
    </div>
  );
}

/** Simulation : l'algorithme, puis le tableau. Les cases attendues sont à l'encre rouge. */
function TraceOnSheet({ exercise, onChange, canEditSubject, canEditCorrection }) {
  const columns = traceColumns(exercise.settings);
  const rows = traceRows(exercise.settings);

  // Toujours relire l'exercice à jour : deux frappes rapides ne s'écrasent pas.
  const write = (make) =>
    onChange((ex) => {
      const settings = ex.settings ?? {};
      const current = { columns: traceColumns(settings), rows: traceRows(settings) };
      return { settings: { ...settings, ...current, ...make(current) } };
    });
  const setColumn = (c, title) =>
    write(({ columns: cols }) => ({ columns: cols.map((col, i) => (i === c ? { ...col, title } : col)) }));
  const setCell = (r, c, value) =>
    write(({ rows: rws }) => ({
      rows: rws.map((row, i) => (i === r ? row.map((v, j) => (j === c ? value : v)) : row)),
    }));

  return (
    <>
      <div className="feuille-algo">
        <AutoText
          className="ink"
          width={70}
          minRows={3}
          spellCheck={false}
          aria-label="Algorithme à simuler"
          value={exercise.settings?.algorithm}
          disabled={!canEditSubject}
          placeholder={'Collez l’algorithme, avec ses numéros de ligne.\nALGORITHME Nom\nDEBUT\n1  LIRE(x)\nFIN'}
          onChange={(e) =>
            onChange((ex) => ({ settings: { ...ex.settings, algorithm: e.target.value } }))
          }
        />
      </div>

      <div className="feuille-trace">
        <table>
          <thead>
            <tr>
              {columns.map((column, c) => (
                <th key={c} scope="col" className={column.given ? 'est-fournie' : undefined}>
                  <input
                    className="ink"
                    aria-label={`Titre de la colonne ${c + 1}`}
                    value={column.title}
                    placeholder={`Colonne ${c + 1}`}
                    disabled={!canEditSubject}
                    onChange={(e) => setColumn(c, e.target.value)}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => {
                  const given = columns[c]?.given;
                  return (
                    <td key={c} className={given ? 'est-fournie' : 'est-attendue'}>
                      <input
                        className="ink"
                        spellCheck={false}
                        aria-label={`Ligne ${r + 1}, ${columns[c]?.title || `colonne ${c + 1}`}`}
                        value={cell}
                        disabled={given ? !canEditSubject : !canEditCorrection}
                        onChange={(e) => setCell(r, c, e.target.value)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canEditSubject && (
        <div className="feuille-gestes" style={{ marginLeft: '1.2em' }}>
          <button
            type="button"
            className="feuille-ajout"
            disabled={rows.length >= MAX_ROWS}
            onClick={() =>
              write(({ columns: cols, rows: rws }) => ({
                rows: [...rws, cols.map((col, c) => (c === 0 && col.given ? String(rws.length + 1) : ''))],
              }))
            }
          >
            + Ligne
          </button>
          <button
            type="button"
            className="feuille-ajout"
            disabled={rows.length <= 1}
            onClick={() => write(({ rows: rws }) => ({ rows: rws.slice(0, -1) }))}
          >
            − Ligne
          </button>
          <button
            type="button"
            className="feuille-ajout"
            disabled={columns.length >= MAX_COLUMNS}
            onClick={() =>
              write(({ columns: cols, rows: rws }) => ({
                columns: [...cols, { title: '', given: false }],
                rows: rws.map((row) => [...row, '']),
              }))
            }
          >
            + Colonne
          </button>
          <button
            type="button"
            className="feuille-ajout"
            disabled={columns.length <= 1}
            onClick={() =>
              write(({ columns: cols, rows: rws }) => ({
                columns: cols.slice(0, -1),
                rows: rws.map((row) => row.slice(0, -1)),
              }))
            }
          >
            − Colonne
          </button>
          <span className="feuille-indice">
            en rouge, les cases à trouver · une case vide n’est pas notée · « | » sépare plusieurs réponses admises
          </span>
        </div>
      )}
    </>
  );
}

/** Les questions d'un exercice, à jour au moment où l'on écrit. */
function useQuestions(exercise, onChange) {
  const kind = exercise.kind;
  const questions = questionsOf(kind, exercise.settings);
  const write = (make) =>
    onChange((ex) => ({ settings: withQuestions(ex.settings, make(questionsOf(kind, ex.settings))) }));
  const setQuestion = (qi, patch) =>
    write((qs) => qs.map((q, i) => (i === qi ? { ...q, ...(typeof patch === 'function' ? patch(q) : patch) } : q)));
  return { questions, write, setQuestion };
}

function QuestionHead({ number, value, onChange, onRemove, canEdit, placeholder }) {
  return (
    <div className="feuille-question-tete">
      <span className="feuille-q-num">Q{number}.</span>
      <AutoText
        className="ink"
        width={74}
        aria-label={`Question ${number}`}
        value={value}
        disabled={!canEdit}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {canEdit && onRemove && (
        <button type="button" className="feuille-x" aria-label={`Retirer la question ${number}`} onClick={onRemove}>
          ×
        </button>
      )}
    </div>
  );
}

/** QCM : un clic sur la lettre de la bonne réponse l'entoure au stylo rouge. */
function QcmOnSheet({ exercise, onChange, canEditSubject, canEditCorrection }) {
  const { questions, write, setQuestion } = useQuestions(exercise, onChange);

  const toggleCorrect = (qi, ci) =>
    setQuestion(qi, (q) => ({
      choices: (q.choices ?? []).map((c, j) =>
        q.multiple ? (j === ci ? { ...c, correct: !c.correct } : c) : { ...c, correct: j === ci },
      ),
    }));
  const setChoices = (qi, make) => setQuestion(qi, (q) => ({ choices: make(q.choices ?? []) }));

  return (
    <>
      <ol className="feuille-questions">
        {questions.map((question, qi) => {
          const choices = question.choices ?? [];
          return (
            <li key={qi}>
              <QuestionHead
                number={qi + 1}
                value={question.text}
                canEdit={canEditSubject}
                placeholder="La question posée"
                onChange={(text) => setQuestion(qi, { text })}
                onRemove={questions.length > 1 ? () => write((qs) => qs.filter((_, i) => i !== qi)) : null}
              />
              <ol className="feuille-choix">
                {choices.map((choice, ci) => (
                  <li key={ci}>
                    <button
                      type="button"
                      className={`feuille-lettre ${choice.correct ? 'est-juste' : ''}`.trim()}
                      aria-pressed={Boolean(choice.correct)}
                      aria-label={`Proposition ${letter(ci)}) : ${choice.correct ? 'bonne réponse' : 'marquer comme bonne réponse'}`}
                      disabled={!canEditCorrection}
                      onClick={() => toggleCorrect(qi, ci)}
                    >
                      {letter(ci)})
                    </button>
                    <input
                      className="ink"
                      aria-label={`Question ${qi + 1}, proposition ${letter(ci)})`}
                      value={choice.text}
                      disabled={!canEditSubject}
                      placeholder="Proposition"
                      onChange={(e) =>
                        setChoices(qi, (cs) => cs.map((c, j) => (j === ci ? { ...c, text: e.target.value } : c)))
                      }
                    />
                    {canEditSubject && choices.length > 2 && (
                      <button
                        type="button"
                        className="feuille-x"
                        aria-label={`Retirer la proposition ${letter(ci)})`}
                        onClick={() => setChoices(qi, (cs) => cs.filter((_, j) => j !== ci))}
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ol>
              {canEditSubject && (
                <div className="feuille-options">
                  <button
                    type="button"
                    className="feuille-ajout"
                    onClick={() => setChoices(qi, (cs) => [...cs, { text: '', correct: false }])}
                  >
                    + proposition
                  </button>
                  <label className="feuille-option">
                    <input
                      type="checkbox"
                      checked={Boolean(question.multiple)}
                      onChange={(e) =>
                        setQuestion(qi, (q) => {
                          if (e.target.checked) return { multiple: true };
                          // Retour au choix unique : on garde la première bonne réponse.
                          const first = (q.choices ?? []).findIndex((c) => c.correct);
                          return {
                            multiple: false,
                            choices: (q.choices ?? []).map((c, j) => ({ ...c, correct: j === first })),
                          };
                        })
                      }
                    />
                    plusieurs bonnes réponses
                  </label>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {canEditCorrection && (
        <p className="feuille-indice" style={{ margin: '0.4em 0 0 1.2em' }}>
          cliquez sur la lettre de la bonne réponse pour l’entourer · l’ordre des propositions change pour chaque étudiant
        </p>
      )}
      {canEditSubject && (
        <div className="feuille-gestes" style={{ marginLeft: '1.2em' }}>
          <button type="button" className="feuille-ajout" onClick={() => write((qs) => [...qs, blankQuestion('qcm')])}>
            + Ajouter une question
          </button>
        </div>
      )}
    </>
  );
}

/** Correspondance : chaque élément et, en rouge, sa bonne correspondance. */
function MatchingOnSheet({ exercise, onChange, canEdit }) {
  const { questions, write, setQuestion } = useQuestions(exercise, onChange);
  const setPairs = (qi, make) => setQuestion(qi, (q) => ({ pairs: make(q.pairs ?? []) }));

  return (
    <>
      <ol className="feuille-questions">
        {questions.map((question, qi) => {
          const pairs = question.pairs ?? [];
          return (
            <li key={qi}>
              <QuestionHead
                number={qi + 1}
                value={question.text}
                canEdit={canEdit}
                placeholder="Consigne de la grille (facultatif)"
                onChange={(text) => setQuestion(qi, { text })}
                onRemove={questions.length > 1 ? () => write((qs) => qs.filter((_, i) => i !== qi)) : null}
              />
              <div className="feuille-paires">
                {pairs.map((pair, pi) => (
                  <div className="feuille-paire" key={pi}>
                    <input
                      className="ink"
                      aria-label={`Grille ${qi + 1}, élément ${pi + 1}`}
                      value={pair.left}
                      disabled={!canEdit}
                      placeholder="Élément"
                      onChange={(e) =>
                        setPairs(qi, (ps) => ps.map((p, j) => (j === pi ? { ...p, left: e.target.value } : p)))
                      }
                    />
                    <span className="feuille-paire-trait" aria-hidden="true">
                      • · · · •
                    </span>
                    <input
                      className="ink encre"
                      aria-label={`Grille ${qi + 1}, correspondance de l’élément ${pi + 1}`}
                      value={pair.right}
                      disabled={!canEdit}
                      placeholder="Sa correspondance"
                      onChange={(e) =>
                        setPairs(qi, (ps) => ps.map((p, j) => (j === pi ? { ...p, right: e.target.value } : p)))
                      }
                    />
                    {canEdit && pairs.length > 2 ? (
                      <button
                        type="button"
                        className="feuille-x"
                        aria-label={`Retirer la paire ${pi + 1}`}
                        onClick={() => setPairs(qi, (ps) => ps.filter((_, j) => j !== pi))}
                      >
                        ×
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
              </div>
              {canEdit && (
                <div className="feuille-options">
                  <button
                    type="button"
                    className="feuille-ajout"
                    onClick={() => setPairs(qi, (ps) => [...ps, { left: '', right: '' }])}
                  >
                    + paire
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {canEdit && (
        <>
          <p className="feuille-indice" style={{ margin: '0.4em 0 0 1.2em' }}>
            en rouge, la bonne correspondance · chaque étudiant verra les deux colonnes mélangées
          </p>
          <div className="feuille-gestes" style={{ marginLeft: '1.2em' }}>
            <button
              type="button"
              className="feuille-ajout"
              onClick={() => write((qs) => [...qs, blankQuestion('matching')])}
            >
              + Ajouter une grille
            </button>
          </div>
        </>
      )}
    </>
  );
}

/**
 * Question-réponse : les lignes laissées à l'étudiant, et sur la première, à la
 * main, ce qu'on attend. Rien d'écrit : la question sera corrigée à la main.
 */
function ShortOnSheet({ exercise, onChange, canEditSubject, canEditCorrection }) {
  const { questions, write, setQuestion } = useQuestions(exercise, onChange);
  const [keyBase] = useState(() => newKey('q'));

  return (
    <>
      <ol className="feuille-questions">
        {questions.map((question, qi) => {
          const keywords = Boolean(question.keywords_mode);
          const lines = Math.min(12, Math.max(1, Number(question.rows) || 4));
          const separator = keywords ? ',' : '|';
          return (
            <li key={qi}>
              <QuestionHead
                number={qi + 1}
                value={question.text}
                canEdit={canEditSubject}
                placeholder="La question posée"
                onChange={(text) => setQuestion(qi, { text })}
                onRemove={questions.length > 1 ? () => write((qs) => qs.filter((_, i) => i !== qi)) : null}
              />
              <div className="feuille-lignes" style={{ height: `${lines * 2.2}em` }}>
                <div className="feuille-reponse">
                  <span className="feuille-reponse-etiquette">{keywords ? 'mots-clés :' : 'réponses :'}</span>
                  <SplitInput
                    key={`${keyBase}-${qi}-${separator}`}
                    className="ink"
                    aria-label={`Réponse attendue à la question ${qi + 1}`}
                    value={question.accepted ?? []}
                    split={(text) => text.split(separator).map((s) => s.trim()).filter(Boolean)}
                    join={(list) => list.join(keywords ? ', ' : ' | ')}
                    disabled={!canEditCorrection}
                    placeholder={
                      keywords
                        ? 'séparés par des virgules'
                        : 'séparées par « | » · rien : corrigée à la main'
                    }
                    onChange={(accepted) => setQuestion(qi, { accepted })}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {canEditSubject && (
        <div className="feuille-gestes" style={{ marginLeft: '1.2em' }}>
          <button type="button" className="feuille-ajout" onClick={() => write((qs) => [...qs, blankQuestion('short')])}>
            + Ajouter une question
          </button>
        </div>
      )}
    </>
  );
}

/** Vrai/Faux : la bonne réponse s'entoure au stylo rouge. */
function TrueFalseOnSheet({ exercise, onChange, canEditSubject, canEditCorrection }) {
  const statements = exercise.settings?.statements ?? [];
  const write = (make) =>
    onChange((ex) => ({ settings: { ...ex.settings, statements: make(ex.settings?.statements ?? []) } }));
  const set = (index, patch) => write((list) => list.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  return (
    <>
      <ol className="feuille-choix" style={{ paddingLeft: '1.2em' }}>
        {statements.map((statement, index) => (
          <li key={index}>
            <span className="sujet-lettre">{index + 1}.</span>
            <input
              className="ink"
              aria-label={`Affirmation ${index + 1}`}
              value={statement.text}
              disabled={!canEditSubject}
              placeholder="Une affirmation"
              onChange={(e) => set(index, { text: e.target.value })}
            />
            <span className="feuille-vf" role="group" aria-label={`Réponse attendue à l’affirmation ${index + 1}`}>
              <button
                type="button"
                className={statement.answer ? 'est-juste' : undefined}
                aria-pressed={Boolean(statement.answer)}
                disabled={!canEditCorrection}
                onClick={() => set(index, { answer: true })}
              >
                V
              </button>
              <button
                type="button"
                className={statement.answer ? undefined : 'est-juste'}
                aria-pressed={!statement.answer}
                disabled={!canEditCorrection}
                onClick={() => set(index, { answer: false })}
              >
                F
              </button>
            </span>
            {canEditSubject && statements.length > 1 && (
              <button
                type="button"
                className="feuille-x"
                aria-label={`Retirer l’affirmation ${index + 1}`}
                onClick={() => write((list) => list.filter((_, i) => i !== index))}
              >
                ×
              </button>
            )}
          </li>
        ))}
      </ol>
      {canEditSubject && (
        <div className="feuille-gestes" style={{ marginLeft: '1.2em' }}>
          <button
            type="button"
            className="feuille-ajout"
            onClick={() => write((list) => [...list, { text: '', answer: true }])}
          >
            + Ajouter une affirmation
          </button>
        </div>
      )}
    </>
  );
}

/** Au bas de la feuille : le type du nouvel exercice, ou un exercice de la banque. */
function AddExercise({ empty, onAdd, bank }) {
  const [open, setOpen] = useState(false);
  const shown = open || empty;

  return (
    <div className="feuille-nouveau">
      {!shown && (
        <button type="button" className="feuille-nouveau-bouton" onClick={() => setOpen(true)}>
          + Ajouter un exercice
        </button>
      )}
      {shown && (
        <div className="feuille-choix-type">
          <div className="panneau-tete">
            <span className="panneau-sous-titre">Quel type d’exercice ?</span>
            <div className="panneau-actions">
              {bank.toggle}
              {!empty && (
                <Button variant="secondary" size="small" onClick={() => setOpen(false)}>
                  Fermer
                </Button>
              )}
            </div>
          </div>
          <div className="feuille-types">
            {typeFamilies().flatMap((family) =>
              family.types.map((type) => (
                <button
                  key={type.key}
                  type="button"
                  className="feuille-type"
                  data-kind={type.key}
                  onClick={() => {
                    onAdd(type.key);
                    setOpen(false);
                  }}
                >
                  <strong>{type.badge}</strong>
                  <span>{type.tagline}</span>
                </button>
              )),
            )}
          </div>
        </div>
      )}
      {bank.picker}
    </div>
  );
}
