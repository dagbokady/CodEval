/**
 * Le corrigé d'un exercice, sous la copie publiée.
 *
 * Replié par défaut : l'apprenant relit d'abord sa copie annotée, puis ouvre
 * le corrigé pour comparer. Une question fermée se corrige par ses réponses
 * attendues ; un exercice pratique par la solution type de l'enseignant et par
 * ce que chaque test officiel attendait : confronté à ce qu'a fait sa copie.
 */

import { useState } from 'react';
import CodeBlock from './CodeBlock';
import { questionsOf } from '../questions';

function acceptedText(value) {
  if (typeof value === 'string') return value;
  return value?.text ?? '';
}

/** Les réponses attendues d'une question fermée, question par question. */
function ClosedKey({ sheet }) {
  if (sheet.kind === 'truefalse') {
    const statements = sheet.settings?.statements ?? [];
    return (
      <ul className="solution-key solution-key--split">
        {statements.map((statement, index) => (
          <li key={index}>
            <span>{statement.text}</span>
            <strong>{statement.answer ? 'Vrai' : 'Faux'}</strong>
          </li>
        ))}
      </ul>
    );
  }

  const questions = questionsOf(sheet.kind, sheet.settings);
  return (
    <ol className="solution-questions">
      {questions.map((question, rank) => (
        <li key={rank}>
          <p className="copy-question-enonce">
            <span className="copy-question-num">Q{rank + 1}.</span>{' '}
            {question.text || <em className="sub">(question sans énoncé)</em>}
          </p>
          {sheet.kind === 'qcm' && <QcmKey question={question} />}
          {sheet.kind === 'matching' && (
            <ul className="solution-key">
              {(question.pairs ?? []).map((pair, index) => (
                <li key={index}>
                  <span>{pair.left}</span>
                  <span aria-hidden="true">→</span>
                  <strong>{pair.right}</strong>
                </li>
              ))}
            </ul>
          )}
          {sheet.kind === 'short' && <ShortKey question={question} />}
        </li>
      ))}
    </ol>
  );
}

function QcmKey({ question }) {
  const correct = (question.choices ?? []).filter((choice) => choice.correct);
  if (correct.length === 0) {
    return <p className="sub">Aucune bonne réponse n'était indiquée pour cette question.</p>;
  }
  return (
    <ul className="solution-key">
      {correct.map((choice, index) => (
        <li key={index}>
          <span className="solution-check" aria-hidden="true">✓</span>
          <strong>{choice.text}</strong>
        </li>
      ))}
    </ul>
  );
}

function ShortKey({ question }) {
  const accepted = (question.accepted ?? []).map(acceptedText).filter((text) => text.trim());
  if (accepted.length === 0) {
    return <p className="sub">Réponse rédigée : appréciée par votre enseignant.</p>;
  }
  return (
    <p className="solution-accepted">
      {question.keywords_mode ? 'Mots-clés attendus : ' : 'Réponses acceptées : '}
      {accepted.map((text, index) => (
        <span key={index}>
          {index > 0 && ', '}
          <strong>{text}</strong>
        </span>
      ))}
    </p>
  );
}

/** Ce que chaque test officiel attendait, et ce que la copie en a fait. */
function ExpectedTests({ tests, results }) {
  const passed = new Map(
    (results ?? []).filter((r) => r.test_id != null).map((r) => [r.test_id, r.passed]),
  );
  const calls = tests.some((test) => test.call);
  return (
    <div className="solution-tests">
      <table>
        <thead>
          <tr>
            <th scope="col">Test</th>
            <th scope="col">{calls ? 'Entrée ou appel' : 'Entrée'}</th>
            <th scope="col">Résultat attendu</th>
            <th scope="col">Votre copie</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test, index) => {
            const verdict = passed.get(test.test_id);
            return (
              <tr key={test.test_id ?? index}>
                <td>{test.name || `Test ${index + 1}`}</td>
                <td>
                  {test.input?.trim() ? <pre>{test.input}</pre> : <em className="sub">aucune</em>}
                </td>
                <td>
                  <pre>{test.expected}</pre>
                </td>
                <td className={verdict === undefined ? '' : verdict ? 'passed' : 'failed'}>
                  {verdict === undefined ? '-' : verdict ? '✓ réussi' : '✕ échoué'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function hasContent(sheet) {
  if (!['code', 'algo'].includes(sheet.kind)) return true;
  return Boolean(
    sheet.solution?.trim() || sheet.solution_notes?.trim() || sheet.expected_tests?.length,
  );
}

export default function SolutionBlock({ sheet, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!hasContent(sheet)) return null;

  const practical = ['code', 'algo'].includes(sheet.kind);
  const hint = practical
    ? sheet.solution?.trim()
      ? 'Solution type et résultats attendus'
      : 'Résultats attendus'
    : 'Réponses attendues';

  return (
    <section className={`copy-solution ${open ? 'open' : ''}`.trim()}>
      <button
        type="button"
        className="copy-solution-toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="copy-solution-icon" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 21h6v-1H9v1zm3-19C8.1 2 5 5.1 5 9c0 2.4 1.2 4.5 3 5.7V17c0 .6.4 1 1 1h6c.6 0 1-.4 1-1v-2.3c1.8-1.3 3-3.4 3-5.7 0-3.9-3.1-7-7-7z" />
          </svg>
        </span>
        <span className="copy-solution-title">
          <strong>Corrigé</strong>
          <span className="sub">{hint}</span>
        </span>
        <span className="copy-solution-action">{open ? 'Masquer' : 'Afficher'}</span>
      </button>

      {open && (
        <div className="copy-solution-body">
          {practical ? (
            <>
              {sheet.solution?.trim() ? (
                <>
                  <div className="copy-label">
                    {sheet.kind === 'algo' ? 'Algorithme corrigé' : 'Solution type'}
                  </div>
                  <CodeBlock
                    className="copy-code"
                    code={sheet.solution}
                    language={sheet.kind === 'algo' ? 'algo' : sheet.language}
                  />
                </>
              ) : (
                <p className="sub">
                  Votre enseignant n'a pas rédigé de solution type : voici ce que votre programme
                  devait produire.
                </p>
              )}
              {sheet.expected_tests?.length > 0 && (
                <>
                  <div className="copy-label">Résultats attendus</div>
                  <ExpectedTests tests={sheet.expected_tests} results={sheet.tests} />
                </>
              )}
            </>
          ) : (
            <ClosedKey sheet={sheet} />
          )}

          {sheet.solution_notes?.trim() && (
            <div className="copy-solution-notes">
              <div className="copy-appreciation-label">Explications</div>
              <p>{sheet.solution_notes}</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
