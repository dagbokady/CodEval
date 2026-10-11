/**
 * Feuille de sujet, mise en page comme une épreuve officielle : en-tête
 * établissement / session, titre du concours ou du contrôle, cartouche
 * « ÉPREUVE / Durée », filet, puis les questions numérotées Q1, Q2… avec leurs
 * propositions en a) b) c) d).
 *
 * Un seul composant sert les trois écrans qui montrent le sujet (aperçu de
 * l'enseignant, « Sujet complet » de l'apprenant, copie corrigée) pour qu'ils ne
 * divergent jamais. Toutes les tailles sont en `em` : le contexte fixe la taille
 * de base sur `.sujet` (petite dans l'aperçu, pleine dans l'épreuve).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import CodeBlock from './CodeBlock';
import { isProject, projectFiles, starterText } from '../project';
import { exerciseLabel, formatExamDuration, formatExamDate } from '../format';
import {
  callableCriteria,
  criteriaOf,
  describeCriterion,
  formatValue,
  inputTypesOf,
  valueType,
} from '../bareme';
import { exerciseType, hasQuestions } from '../exerciseTypes';
import { answersOf, questionsOf } from '../questions';

function sessionYear(date) {
  const value = date ? new Date(date) : new Date();
  return Number.isNaN(value.getTime()) ? new Date().getFullYear() : value.getFullYear();
}

/** a) b) c) … au-delà de z, on repart sur des nombres plutôt que des symboles. */
function letter(index) {
  return index < 26 ? String.fromCharCode(97 + index) : String(index + 1);
}

/** Les dispositions proposées dans les paramètres de l'enseignant. */
export const SHEET_LAYOUTS = [
  { value: 'classique', label: 'Classique', hint: 'Établissement à gauche, session à droite' },
  { value: 'centre', label: 'Centrée', hint: 'Logo et établissement au centre' },
  { value: 'officiel', label: 'Officielle', hint: 'Deux blocs : établissement, République' },
];

/**
 * En-tête de la feuille. `header` est le réglage de l'enseignant (logo, lignes,
 * titre, disposition) : absent, la feuille garde l'en-tête d'origine.
 */
export function SheetHeader({
  organization,
  classroom,
  subject,
  title,
  durationMinutes,
  points,
  language,
  date,
  kindLabel = 'ÉVALUATION',
  header,
}) {
  const layout = header?.layout ?? 'classique';
  const leftLines = (header?.left_lines ?? []).filter((line) => line.trim());
  const rightLines = (header?.right_lines ?? []).filter((line) => line.trim());
  const showClassroom = header?.show_classroom !== false;
  const showSession = header?.show_session !== false;
  const heading = header?.title?.trim() || subject || kindLabel;

  const [main, ...rest] = leftLines.length > 0 ? leftLines : [organization ?? 'CodEval'];
  const session = showSession && (
    <div className="sujet-session">Session : {sessionYear(date)}</div>
  );

  return (
    <header className={`sujet-entete sujet-entete--${layout}`}>
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
            {showClassroom && classroom && (
              <div className="sujet-etablissement-sous">{classroom}</div>
            )}
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

      <div className="sujet-concours">{heading.toUpperCase()}</div>

      <div className="sujet-cartouche">
        <div className="sujet-cartouche-ligne">
          <span className="sujet-cartouche-cle">ÉPREUVE</span> : {title || 'Sans titre'}
        </div>
        <div className="sujet-cartouche-ligne">
          Durée : {formatExamDuration(durationMinutes)}
          {date ? ` · Date : ${formatExamDate(date)}` : ''}
        </div>
        <div className="sujet-cartouche-ligne sujet-cartouche-ligne--fine">
          Barème : {points} points{language ? ` · Langage : ${language.toUpperCase()}` : ''}
        </div>
      </div>

      <div className="sujet-filet" aria-hidden="true" />
    </header>
  );
}

/** Consignes de l'enseignant, présentées comme sur une épreuve imprimée. */
export function SheetInstructions({ children }) {
  if (!children) return null;
  return <div className="sujet-consignes">{children}</div>;
}

/** Découpe la liste en blocs de même type, sans jamais réordonner les exercices. */
function groupExercises(exercises) {
  const groups = [];
  exercises.forEach((exercise, index) => {
    const kind = exercise.kind ?? 'code';
    const last = groups[groups.length - 1];
    const entry = { exercise, number: index + 1 };
    if (last && last.kind === kind) last.items.push(entry);
    else groups.push({ kind, title: exerciseType(kind).sheetTitle, items: [entry] });
  });
  return groups;
}

/**
 * La réponse de l'apprenant, reportée sur la feuille pendant l'épreuve : les
 * choix cochés sont entourés à l'encre, les correspondances tracées. Absente,
 * la feuille reste le sujet vierge.
 */
function QcmChoices({ question, answer }) {
  const choices = question.choices ?? [];
  const selected = answer?.selected ?? [];
  if (choices.length === 0) return null;
  return (
    <ol className="sujet-choix">
      {choices.map((choice, index) => (
        <li key={index} className={selected.includes(index) ? 'sujet-choisi' : undefined}>
          <span className="sujet-lettre">{letter(index)})</span>
          <span>{choice.text || <em className="sujet-vide">(choix vide)</em>}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Correspondance : deux colonnes que l'apprenant relie au crayon. Pas de numéro
 * ni de lettre : un point derrière chaque élément de gauche, un point devant
 * chaque élément de droite : les attaches se font face, le trait passe entre elles.
 * Pendant l'épreuve le serveur n'envoie que `right_options`, déjà mélangée : la
 * disposition des colonnes ne révèle donc rien.
 */
function MatchingColumns({ question, answer }) {
  const pairs = question.pairs ?? [];
  const options =
    question.right_options ??
    pairs.map((pair, index) => ({ token: `p${index}`, text: pair.right }));
  // Les traits sont mesurés sur le rendu réel : la feuille change de largeur
  // et de taille de texte, et les attaches bougent avec.
  const zone = useRef(null);
  const [traits, setTraits] = useState([]);
  const clé = JSON.stringify(
    Object.entries(answer?.matches ?? {}).filter(([, droite]) => droite != null),
  );

  const retracer = useCallback(() => {
    const cadre = zone.current?.getBoundingClientRect();
    if (!cadre) return;
    const centre = (attache) => {
      const node = zone.current.querySelector(`[data-attache="${attache}"]`);
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2 - cadre.left, y: r.top + r.height / 2 - cadre.top };
    };
    const tracés = [];
    JSON.parse(clé).forEach(([gauche, droite]) => {
      const a = centre(`g:${gauche}`);
      const b = centre(`d:${droite}`);
      if (a && b) tracés.push({ key: gauche, x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    });
    setTraits(tracés);
  }, [clé]);

  useLayoutEffect(retracer, [retracer]);
  useEffect(() => {
    const node = zone.current;
    if (!node || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(retracer);
    observer.observe(node);
    return () => observer.disconnect();
  }, [retracer]);

  if (pairs.length === 0) return null;
  return (
    <div className="sujet-correspondance" ref={zone}>
      {traits.length > 0 && (
        <svg className="sujet-traits" aria-hidden="true">
          {traits.map((t) => (
            <line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} />
          ))}
        </svg>
      )}
      <ul className="sujet-colonne sujet-colonne--gauche">
        {pairs.map((pair, index) => (
          <li key={index}>
            <span>{pair.left || <em className="sujet-vide">(élément vide)</em>}</span>
            <span className="sujet-attache" data-attache={`g:${index}`} aria-hidden="true" />
          </li>
        ))}
      </ul>
      <ul className="sujet-colonne sujet-colonne--droite">
        {options.map((option, index) => (
          <li key={option.token ?? index}>
            <span
              className="sujet-attache"
              data-attache={`d:${option.token ?? `p${index}`}`}
              aria-hidden="true"
            />
            <span>{option.text || <em className="sujet-vide">(élément vide)</em>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Vrai/Faux : les affirmations numérotées, avec leurs deux cases à cocher. */
function TrueFalseStatements({ exercise, answer }) {
  const statements = exercise.settings?.statements ?? [];
  if (statements.length === 0) return null;
  const choix = answer?.answers ?? {};
  return (
    <ol className="sujet-choix">
      {statements.map((statement, index) => {
        const coché = choix[String(index)];
        return (
          <li key={index}>
            <span className="sujet-lettre">{index + 1}.</span>
            <span>{statement.text || <em className="sujet-vide">(affirmation vide)</em>}</span>
            <span className="sujet-vf" aria-hidden="true">
              <span className={coché === true ? 'sujet-vf-choisi' : undefined}>V</span>
              &nbsp;/&nbsp;
              <span className={coché === false ? 'sujet-vf-choisi' : undefined}>F</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Question-réponse : des lignes vierges, comme sur une épreuve imprimée. */
function ShortAnswerLines({ question }) {
  const rows = Math.min(12, Math.max(1, Number(question.rows) || 4));
  return (
    <div className="sujet-lignes" aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <span className="sujet-ligne" key={index} />
      ))}
    </div>
  );
}

/**
 * Les questions d'un QCM, d'une correspondance ou d'une question-réponse : chacune
 * porte son énoncé, puis la forme de réponse de son type.
 */
/** Le barème d'un exercice de code : ce que la copie doit contenir. */
function SheetCriteria({ exercise }) {
  const criteria = criteriaOf(exercise);
  if (criteria.length === 0) return null;
  return (
    <ol className="sujet-parts">
      {criteria.map((criterion) => (
        <li key={criterion.id}>
          <span>{DEMANDE[criterion.kind] ?? 'À écrire :'}</span>
          <code className="sujet-signature">{describeCriterion(criterion)}</code>
          <span className="sujet-question-pts">
            {criterion.points} pt{criterion.points > 1 ? 's' : ''}
          </span>
        </li>
      ))}
    </ol>
  );
}

const DEMANDE = {
  variable: 'Déclarez la variable :',
  function: 'Écrivez la fonction :',
  struct: 'Définissez la structure :',
  // Les exigences d'un exercice algorithmique se lisent dans les mots du cours.
  algo_variable: 'Déclarez la variable :',
  algo_constante: 'Déclarez la constante :',
  algo_type: 'Définissez le type :',
  algo_fonction: 'Écrivez la fonction :',
  algo_structure: 'Employez la structure :',
};

/**
 * Les jeux de tests montrés comme des exemples d'exécution : « on entre ceci,
 * il doit sortir cela ». C'est la forme sous laquelle l'enseignant relit son
 * barème pendant qu'il le saisit : et celle qu'un énoncé de TD donne toujours.
 */
function SheetExamples({ exercise }) {
  const tests = exercise.tests ?? [];
  if (tests.length === 0) return null;
  const callable = callableCriteria(exercise);

  return (
    <div className="sujet-exemples">
      <span className="sujet-exemples-titre">Exemples attendus</span>
      <table className="sujet-exemples-table">
        <thead>
          <tr>
            <th>On donne</th>
            <th>Il doit produire</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test, index) => {
            const criterion = callable.find((c) => c.id === test.target_id);
            const args = Array.isArray(test.args) ? test.args : [];
            const entrées = inputTypesOf(test, criterion).map((entry, i) =>
              formatValue(entry.type, args[i]),
            );
            const donné = criterion
              ? `${criterion.name}(${entrées.join(', ')})`
              : entrées.join(' ⏎ ') || '(rien)';
            const attendu = String(test.expected_stdout ?? '').trim();
            const rendu =
              criterion && valueType(criterion.returns).input !== 'none'
                ? `renvoie ${attendu || '…'}`
                : attendu || '…';
            return (
              <tr key={test.id ?? `t-${index}`}>
                <td><code>{donné}</code></td>
                <td><code>{rendu}</code></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SheetSubQuestions({ exercise, showAnswerZone, answer }) {
  const kind = exercise.kind ?? 'code';
  const questions = questionsOf(kind, exercise.settings);
  const answers = answersOf(kind, answer, questions.length);
  if (questions.length === 0) return null;
  return (
    <ol className="sujet-parts">
      {questions.map((question, index) => (
        <li key={index}>
          <p className="sujet-enonce">
            <span className="sujet-question-num">Q{index + 1}.</span>{' '}
            {question.text || <em className="sujet-vide">(question sans énoncé)</em>}
          </p>
          {kind === 'qcm' && <QcmChoices question={question} answer={answers[index]} />}
          {kind === 'matching' && (
            <MatchingColumns question={question} answer={answers[index]} />
          )}
          {kind === 'short' && showAnswerZone && <ShortAnswerLines question={question} />}
        </li>
      ))}
    </ol>
  );
}

/** `answer` : la production de l'apprenant, reportée sur la feuille (épreuve en cours). */
export function SheetExercise({
  exercise,
  number,
  showAnswerZone = true,
  showTests = false,
  answer,
}) {
  const kind = exercise.kind ?? 'code';
  const label = exerciseLabel(number);

  return (
    <article className="sujet-question">
      <div className="sujet-question-tete">
        <span className="sujet-question-num">
          {label} : {exercise.title || <em className="sujet-vide">(sans intitulé)</em>}
        </span>
        <span className="sujet-question-pts">
          {exercise.points} pt{exercise.points > 1 ? 's' : ''}
        </span>
      </div>

      {exercise.statement && <p className="sujet-enonce">{exercise.statement}</p>}

      <SheetCriteria exercise={exercise} />

      {hasQuestions(kind) && (
        <SheetSubQuestions exercise={exercise} showAnswerZone={showAnswerZone} answer={answer} />
      )}
      {kind === 'truefalse' && (
        <TrueFalseStatements exercise={exercise} answer={parseAnswer(answer)} />
      )}
      {kind === 'code' && isProject(exercise) && (
        <p className="sujet-enonce">
          Fichiers du projet : {projectFiles(exercise).map((f) => f.name).join(', ')}.
        </p>
      )}
      {kind === 'code' && starterText(exercise).trim() && (
        <CodeBlock
          className="sujet-code"
          code={starterText(exercise)}
          language={exercise.language}
        />
      )}
      {/* Réservé à l'aperçu de l'enseignant : sur la feuille de l'apprenant, les
          sorties attendues donneraient la réponse. */}
      {showTests && <SheetExamples exercise={exercise} />}
    </article>
  );
}

function parseAnswer(value) {
  try {
    return JSON.parse(value || 'null');
  } catch {
    return null;
  }
}

/** Sujet complet : en-tête officiel, consignes, puis les questions par blocs. */
export function SubjectSheet({
  organization,
  classroom,
  subject,
  title,
  instructions,
  durationMinutes,
  language,
  date,
  exercises,
  showAnswerZone = true,
  emptyLabel,
  header,
}) {
  const points = exercises.reduce((sum, item) => sum + Number(item.points || 0), 0);
  const groups = groupExercises(exercises);

  return (
    <div className="sujet">
      <SheetHeader
        organization={organization}
        classroom={classroom}
        subject={subject}
        title={title}
        durationMinutes={durationMinutes}
        points={points}
        language={language}
        date={date}
        header={header}
      />

      <SheetInstructions>{instructions}</SheetInstructions>

      {exercises.length === 0 ? (
        <div className="sujet-vide-bloc">{emptyLabel}</div>
      ) : (
        groups.map((group, index) => (
          <section className="sujet-bloc" key={`${group.kind}-${index}`}>
            <h2 className="sujet-bloc-titre">{group.title}</h2>
            {group.items.map((item) => (
              <SheetExercise
                key={item.exercise.id ?? `q-${item.number}`}
                exercise={item.exercise}
                number={item.number}
                showAnswerZone={showAnswerZone}
              />
            ))}
          </section>
        ))
      )}

      <div className="sujet-pied">
        Fin du sujet · {exercises.length} exercice{exercises.length !== 1 ? 's' : ''} · {points}{' '}
        points
      </div>
    </div>
  );
}
