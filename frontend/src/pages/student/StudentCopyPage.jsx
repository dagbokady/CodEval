import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMyCopy } from '../../api/hooks';
import { Alert, Button, Loading, Tag } from '../../components/ui';
import { SheetHeader, SheetInstructions } from '../../components/SubjectSheet';
import GradeMark, { MarginNote } from '../../components/GradeMark';
import CodeBlock from '../../components/CodeBlock';
import AnswerBlock from '../../components/CopyAnswer';
import SolutionBlock from '../../components/SolutionBlock';
import { useAuth } from '../../auth';
import { exerciseLabel, formatDateTime, formatScore } from '../../format';

const RESULT_LABELS = {
  ok: 'Exécutée',
  compile_error: 'Erreur de compilation',
  runtime_error: "Erreur d'exécution",
  timeout: 'Temps dépassé',
  no_submission: 'Aucune production',
};

const RESULT_TONES = {
  ok: 'success',
  compile_error: 'danger',
  runtime_error: 'warning',
  timeout: 'warning',
  no_submission: 'neutral',
};

/**
 * Le détail de correction en deux volets : les déclarations exigées par le
 * barème, puis les tests d'exécution. Chacun garde l'ordre du barème.
 */
const DETAIL_SECTIONS = [
  ['declaration', 'Ce que le code devait contenir'],
  ['test', 'Jeux de tests'],
];

function groupByCategory(tests) {
  return DETAIL_SECTIONS.map(([category, label]) => [
    label,
    tests.filter((test) => (test.category ?? 'test') === category),
  ]).filter(([, items]) => items.length > 0);
}

export default function StudentCopyPage() {
  const { evaluationId } = useParams();
  const navigate = useNavigate();
  const { organization } = useAuth();
  const copy = useMyCopy(evaluationId);
  // Déplier tous les corrigés d'un geste, pour relire la copie avec eux.
  const [allOpen, setAllOpen] = useState(false);

  if (copy.isPending) return <Loading variant="page" label="Ouverture de votre copie…" />;
  if (copy.error) {
    return (
      <div className="content" style={{ display: 'grid', gap: 12 }}>
        <Alert>{copy.error.message}</Alert>
        <Button variant="secondary" onClick={() => navigate('/mes-resultats')}>
          Retour à mes résultats
        </Button>
      </div>
    );
  }

  const data = copy.data;

  return (
    <div className="copy-page">
      <div className="copy-toolbar">
        <Button variant="secondary" size="small" onClick={() => navigate('/mes-resultats')}>
          ← Mes résultats
        </Button>
        <Tag tone={data.published ? 'success' : 'warning'}>{data.status_label}</Tag>
        {data.published && data.score !== null && (
          <strong className="copy-toolbar-score">
            {formatScore(data.score, data.total_points)}
          </strong>
        )}
        {data.solutions_available && (
          <Button variant="secondary" size="small" onClick={() => setAllOpen((v) => !v)}>
            {allOpen ? 'Masquer les corrigés' : 'Afficher tous les corrigés'}
          </Button>
        )}
        <Button variant="secondary" size="small" onClick={() => window.print()}>
          Imprimer
        </Button>
      </div>

      {data.solutions_available && (
        <Alert tone="info">
          Le corrigé de chaque exercice est disponible sous votre travail. Comparez-le à votre
          copie : c'est la meilleure façon de comprendre où les points se sont perdus.
        </Alert>
      )}

      {!data.published && (
        <Alert tone="info">
          Votre copie est consultable. La note et les appréciations apparaîtront ici dès que votre
          enseignant aura validé et publié la correction.
        </Alert>
      )}

      <article className="copy-sheet sujet">
        {!data.published && (
          <MarginNote tone="sobre">En attente de publication de la correction.</MarginNote>
        )}
        <div className="copy-sheet-head">
          <SheetHeader
            organization={organization}
            classroom={data.classroom_name}
            subject={data.subject_name}
            title={data.title}
            durationMinutes={data.duration_minutes}
            points={data.total_points}
            date={data.date}
          />
          {/* La note est écrite sur la copie, au stylo rouge, comme sur papier. */}
          <div className="copie-note-posee">
            <GradeMark
              score={data.score}
              total={data.total_points}
              size="lg"
              pending={!data.published || data.score === null}
            />
            {data.published && data.score !== null && (
              <span className="copie-note-mention">Vu et corrigé</span>
            )}
          </div>
        </div>

        <SheetInstructions>{data.instructions}</SheetInstructions>

        {data.published && data.appreciation && (
          <section className="copy-appreciation copy-appreciation--global">
            <div className="copy-appreciation-label">Appréciation générale</div>
            <p>{data.appreciation}</p>
          </section>
        )}

        {data.exercises.map((sheet, index) => (
          <section className="copy-exercise" key={sheet.exercise_id}>
            <div className="copy-exercise-head">
              <span className="copy-exercise-num">{exerciseLabel(index + 1)}</span>
              {data.published && sheet.score !== null ? (
                <span className="copy-exercise-score">
                  <GradeMark
                    score={sheet.score}
                    total={sheet.max_score ?? sheet.points}
                    size="sm"
                  />
                </span>
              ) : (
                <span className="copy-exercise-score copy-exercise-score--pending">
                  {sheet.points} pts
                </span>
              )}
            </div>
            <h2 className="copy-exercise-title">{sheet.title}</h2>
            {sheet.statement && <p className="copy-statement">{sheet.statement}</p>}

            {/* Le squelette fourni par l'enseignant n'est pas le travail de
                l'apprenant : replié, il ne prend pas la place de sa copie,
                mais reste consultable pour comprendre l'énoncé. */}
            {sheet.kind === 'code' && sheet.starter_code && (
              <details className="copy-starter">
                <summary className="copy-label">Code de départ fourni</summary>
                <CodeBlock
                  className="copy-code copy-code--starter"
                  code={sheet.starter_code}
                  language={sheet.language}
                />
              </details>
            )}

            <div className="copy-label">Votre travail</div>
            <AnswerBlock sheet={sheet} published={data.published} />

            {data.published && sheet.status && (
              <div className="copy-verdict">
                <Tag tone={RESULT_TONES[sheet.status]}>{RESULT_LABELS[sheet.status]}</Tag>
              </div>
            )}

            {data.published && sheet.compile_log && (
              <pre className="copy-compile-log">{sheet.compile_log}</pre>
            )}

            {/* Un QCM ou une correspondance n'a pas de jeu de tests : le détail
                de correction est déjà lisible dans les réponses ci-dessus. */}
            {data.published && sheet.tests.length > 0 && !['qcm', 'matching', 'truefalse', 'short'].includes(sheet.kind) && (
              <div className="copy-tests">
                {groupByCategory(sheet.tests).map(([label, tests]) => (
                  <div key={label}>
                    <div className="copy-label">{label}</div>
                    <ul>
                      {tests.map((test, i) => (
                        <li key={test.test_id ?? i} className={test.passed ? 'passed' : 'failed'}>
                          <span aria-hidden="true">{test.passed ? '✓' : '✕'}</span>
                          <span>{test.name ?? `Test ${i + 1}`}</span>
                          <span className="sub">
                            {test.passed
                              ? 'réussi'
                              : test.timed_out
                                ? 'temps dépassé'
                                : test.category === 'declaration'
                                  ? 'absent'
                                  : 'échoué'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {data.published && sheet.appreciation && (
              <div className="copy-appreciation">
                <div className="copy-appreciation-label">Appréciation de l'enseignant</div>
                <p>{sheet.appreciation}</p>
              </div>
            )}

            {data.solutions_available && (
              <SolutionBlock
                key={`${sheet.exercise_id}-${allOpen}`}
                sheet={sheet}
                defaultOpen={allOpen}
              />
            )}
          </section>
        ))}

        <footer className="copy-sheet-footer">
          Fin de la copie · {data.exercises.length} exercice
          {data.exercises.length !== 1 ? 's' : ''}
          {data.submitted_at ? ` · rendue le ${formatDateTime(data.submitted_at)}` : ''}
        </footer>
      </article>
    </div>
  );
}
