import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction, useEvaluation, useResults, useSubmissionDetail } from '../../api/hooks';
import { Alert, Button, Disclosure, Field, Loading, PageHeader, Tag } from '../../components/ui';
import { SheetHeader } from '../../components/SubjectSheet';
import GradeMark from '../../components/GradeMark';
import CodeBlock from '../../components/CodeBlock';
import AnswerBlock from '../../components/CopyAnswer';
import { useAuth } from '../../auth';
import { exerciseLabel, formatDateTime, formatScore } from '../../format';
import { evaluationUsesLanguage, exerciseType, needsTests } from '../../exerciseTypes';

const RESULT_TONES = {
  ok: 'success',
  compile_error: 'danger',
  runtime_error: 'warning',
  timeout: 'warning',
  no_submission: 'neutral',
};

const RESULT_LABELS = {
  ok: 'Exécutée',
  compile_error: 'Erreur de compilation',
  runtime_error: "Erreur d'exécution",
  timeout: 'Temps dépassé',
  no_submission: 'Aucune production',
};

/**
 * Détail d'une question corrigée automatiquement. Le cas qui compte : une
 * question-réponse sans corrigé n'est pas « échouée », elle attend la note de
 * l'enseignant — l'afficher en rouge lui ferait croire l'apprenant fautif.
 */
function AutoGradedDetail({ exercise }) {
  const rows = exercise.tests ?? [];
  const manual = rows.some((row) => row.manual);

  if (manual) {
    return (
      <Alert tone="warning">
        Question-réponse sans corrigé automatique : attribuez la note vous-même avec
        « Modifier la note de cet exercice » ci-dessous.
      </Alert>
    );
  }
  if (rows.length === 0) return null;

  return (
    <p className="sub" style={{ marginBottom: 12 }}>
      {exerciseType(exercise.kind).gradingNote} Note automatique :{' '}
      {formatScore(exercise.auto_score, exercise.max_score)}.
    </p>
  );
}

/**
 * Les jeux de tests d'un exercice, sous un bouton.
 *
 * Ce que la correction a exécuté est déjà su : ce bouton ne relance pas la
 * machine, il rejoue devant l'enseignant ce qui a été passé sur cette copie. On
 * le dit tel quel plutôt que de laisser croire à une exécution en direct — et on
 * garde le tableau replié, car une copie se lit d'abord, se vérifie ensuite.
 */
function TestsPanel({ exercise, runNumber }) {
  const [ouvert, setOuvert] = useState(false);
  const tests = exercise.tests ?? [];
  const reussis = tests.filter((t) => t.passed).length;

  if (tests.length === 0) {
    return <p className="sub">Aucun jeu de tests n'a été exécuté sur cet exercice.</p>;
  }

  return (
    <div className="copie-tests">
      <div className="copie-tests-barre">
        <Button size="small" variant={ouvert ? 'secondary' : 'primary'} onClick={() => setOuvert(!ouvert)}>
          {ouvert ? '▾ Masquer les jeux de tests' : `▶ Lancer les jeux de tests (${tests.length})`}
        </Button>
        <span className="sub">
          {reussis} / {tests.length} réussi{reussis > 1 ? 's' : ''}
          {runNumber ? ` · correction n° ${runNumber}` : ''}
        </span>
      </div>

      {ouvert && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={{ minWidth: 560 }}>
            <thead>
              <tr>
                <th style={{ paddingLeft: 0 }}>Critère</th>
                <th>Nature</th>
                <th>Entrée</th>
                <th>Attendu</th>
                <th>Obtenu</th>
                <th style={{ paddingRight: 0 }}>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {tests.map((test, index) => (
                <tr key={test.test_id ?? index}>
                  <td style={{ paddingLeft: 0 }}>{test.name}</td>
                  <td className="sub">
                    {test.category === 'declaration' ? 'Déclaration' : 'Test'}
                  </td>
                  <td>
                    <code style={{ fontSize: 12 }}>{test.input || '—'}</code>
                  </td>
                  <td>
                    <code style={{ fontSize: 12 }}>{test.expected || '—'}</code>
                  </td>
                  <td>
                    <code style={{ fontSize: 12 }}>
                      {test.timed_out ? 'temps dépassé' : test.actual || '—'}
                    </code>
                  </td>
                  <td style={{ paddingRight: 0 }}>
                    <Tag tone={test.passed ? 'success' : 'danger'}>
                      {test.passed
                        ? test.category === 'declaration' ? 'Présent' : 'Réussi'
                        : test.category === 'declaration' ? 'Absent' : 'Échoué'}
                    </Tag>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SubmissionDetailPage() {
  const { evaluationId, participationId } = useParams();
  const [params] = useSearchParams();
  const runId = params.get('run');
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const { organization } = useAuth();
  const evaluation = useEvaluation(evaluationId);
  const results = useResults(evaluationId, runId ? Number(runId) : null);
  const detail = useSubmissionDetail(evaluationId, participationId, runId);
  const writeAppreciation = useAction(
    (body) =>
      api(`/api/evaluations/${evaluationId}/results/${participationId}/appreciation`, {
        method: 'POST',
        body,
      }),
    [
      ['submission', evaluationId, participationId],
    ],
  );
  const adjust = useAction(
    (body) =>
      api(`/api/evaluations/${evaluationId}/results/${participationId}/adjust`, {
        method: 'POST',
        body,
      }),
    [
      ['submission', evaluationId, participationId],
      ['results', evaluationId],
    ],
  );

  if (detail.isPending) return <Loading />;
  if (detail.error)
    return (
      <div className="content">
        <Alert>{detail.error.message}</Alert>
      </div>
    );

  const data = detail.data;
  const evalData = evaluation.data;
  /* Une fois les résultats validés, la note est publiée : elle ne se retouche plus. */
  const publiee = evalData?.status === 'validated';
  const runNumber = results.data?.run?.number;
  /* Le paquet de copies, pour passer à la suivante sans repasser par la liste. */
  const paquet = results.data?.participants ?? [];
  const rang = paquet.findIndex((p) => String(p.participation_id) === String(participationId));
  const voisine = (pas) => paquet[rang + pas];
  const ouvrir = (copie) =>
    navigate(
      `/evaluations/${evaluationId}/resultats/${copie.participation_id}${runId ? `?run=${runId}` : ''}`,
    );

  const noter = (body) =>
    adjust.mutateAsync(body).then(
      () => { setError(null); setNotice('Note enregistrée.'); },
      (err) => { setNotice(null); setError(err.message); },
    );

  const commenter = (body) =>
    writeAppreciation.mutateAsync(body).then(
      () => { setError(null); setNotice('Appréciation enregistrée.'); },
      (err) => { setNotice(null); setError(err.message); },
    );

  return (
    <>
      <PageHeader breadcrumb="Résultats / Copie corrigée" title={data.full_name}>
        {rang > 0 && (
          <Button variant="secondary" onClick={() => ouvrir(voisine(-1))}>
            ‹ Copie précédente
          </Button>
        )}
        {rang >= 0 && rang < paquet.length - 1 && (
          <Button variant="secondary" onClick={() => ouvrir(voisine(1))}>
            Copie suivante ›
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigate(-1)}>
          Retour au paquet
        </Button>
      </PageHeader>

      <div className="content copie-corrigee">
        <Alert>{error}</Alert>
        {notice && !error && <Alert tone="success">{notice}</Alert>}
        {publiee && (
          <Alert tone="info">
            Résultats validés et publiés : les notes de cette copie ne sont plus modifiables.
          </Alert>
        )}

        {/* Ce qu'on corrige d'abord se pose d'abord : la note de la copie et le
            mot qui l'accompagne. Les deux tiennent côte à côte, en tête de
            page — on ne les cherche pas après trois exercices. */}
        <section className="card copie-correction">
          <h2 className="copie-correction-titre">Correction de la copie</h2>
          <div className="copie-outils copie-outils--global">
            <div className="copie-outil">
              <h3 className="copie-outil-titre">Appréciation générale</h3>
              <p className="sub" style={{ marginBottom: 10 }}>
                Visible par l'apprenant sur sa copie une fois les résultats validés et publiés.
              </p>
              <AppreciationForm
                key={data.appreciation ?? ''}
                value={data.appreciation ?? ''}
                pending={writeAppreciation.isPending}
                onSave={(text) => commenter({ exercise_id: null, text })}
              />
            </div>

            <div className="copie-outil">
              <h3 className="copie-outil-titre">
                Note globale · {formatScore(data.final_score, data.max_score)}
              </h3>
              <p className="sub" style={{ marginBottom: 10 }}>
                Poser une note globale remplace la somme des exercices. Réajuster un exercice
                ensuite reprend le calcul détaillé. La production de l'apprenant n'est jamais
                modifiée, et chaque ajustement est historisé.
              </p>
              <ScoreForm
                idPrefix="copie"
                max={data.max_score}
                current={data.final_score}
                disabled={publiee}
                pending={adjust.isPending}
                onSubmit={(body) => noter({ ...body, exercise_id: null })}
              />

              {data.adjustments.length > 0 && (
                <ul className="copie-historique">
                  {data.adjustments.map((a) => (
                    <li key={a.id} className="sub">
                      {formatDateTime(a.created_at)} · {a.teacher} ·{' '}
                      {a.exercise_title ? `« ${a.exercise_title} »` : 'copie entière'} :{' '}
                      {a.previous_score} → {a.new_score} ({a.reason})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Une copie, une feuille : l'en-tête de l'épreuve, l'identité du
            candidat, puis les exercices à la suite — comme le paquet de papier
            qu'on annote, et exactement ce que l'apprenant recevra. */}
        <article className="card copie-feuille-corrigee sujet">
          <div className="copy-sheet-head">
            <SheetHeader
              organization={organization}
              classroom={evalData?.classroom_name}
              subject={evalData?.subject_name}
              title={evalData?.title ?? 'Épreuve'}
              durationMinutes={evalData?.duration_minutes ?? 0}
              points={data.max_score}
              language={
                evaluationUsesLanguage(data.exercises) ? evalData?.language : null
              }
              date={evalData?.scheduled_start}
            />
            <div className="copie-note-posee">
              <GradeMark score={data.final_score} total={data.max_score} size="lg" />
              <span className="copie-note-mention">vu et corrigé</span>
            </div>
          </div>

          <dl className="copie-identite">
            <dt>Candidat</dt>
            <dd>{data.full_name}</dd>
            <dt>Matricule</dt>
            <dd>{data.matricule ?? '—'}</dd>
            <dt>Note retenue</dt>
            <dd>{formatScore(data.final_score, data.max_score)}</dd>
          </dl>

          {data.exercises.map((exercise, index) => (
            <section className="copie-exercice" key={exercise.exercise_id}>
              <div className="copie-exercice-tete">
                <span className="copy-exercise-num">{exerciseLabel(index + 1)}</span>
                <strong style={{ fontSize: 14 }}>{exercise.exercise_title}</strong>
                <Tag tone={RESULT_TONES[exercise.status]}>{RESULT_LABELS[exercise.status]}</Tag>
                <span className="copy-exercise-score" style={{ marginLeft: 'auto' }}>
                  <GradeMark score={exercise.final_score} total={exercise.max_score} size="sm" />
                </span>
              </div>

              {/* On corrige ce qui a été demandé : l'énoncé d'abord, la production
                  de l'apprenant juste en dessous, comme sur une copie papier. */}
              {exercise.statement && (
                <>
                  <div className="copy-label">Énoncé</div>
                  <p className="copy-statement">{exercise.statement}</p>
                </>
              )}

              {/* Le code de départ, l'enseignant l'a écrit lui-même : il le
                  reconnaît d'un mot et n'a pas à le relire sur chaque copie.
                  Replié, il laisse la production de l'apprenant en pleine vue. */}
              {exercise.kind === 'code' && exercise.starter_code && (
                <Disclosure summary="Code de départ fourni" hint="rappel de l'énoncé">
                  <CodeBlock
                    className="copy-code copy-code--starter"
                    code={exercise.starter_code}
                    language={exercise.language}
                  />
                </Disclosure>
              )}

              <div className="copy-label">Ce que l'apprenant a produit</div>
              <AnswerBlock
                sheet={{
                  kind: exercise.kind,
                  settings: exercise.settings ?? {},
                  answer: exercise.code,
                  language: exercise.language || evalData?.language,
                  matches: exercise.matches ?? [],
                }}
                published
              />

              {exercise.compile_log && (
                <pre className="copy-compile-log">{exercise.compile_log}</pre>
              )}

              {/* Le tableau des jeux de tests ne vaut que pour les exercices pratiques ;
                  les autres types ont leur propre lecture. */}
              {needsTests(exercise.kind) ? (
                <TestsPanel exercise={exercise} runNumber={runNumber} />
              ) : (
                <AutoGradedDetail exercise={exercise} />
              )}

              <div className="copie-outils">
                <Disclosure
                  summary="Appréciation sur cet exercice"
                  hint={exercise.appreciation ? 'rédigée' : 'aucune'}
                >
                  <AppreciationForm
                    key={exercise.appreciation ?? ''}
                    label={`Appréciation — ${exercise.exercise_title}`}
                    value={exercise.appreciation ?? ''}
                    pending={writeAppreciation.isPending}
                    onSave={(text) => commenter({ exercise_id: exercise.exercise_id, text })}
                  />
                </Disclosure>

                <Disclosure
                  summary="Modifier la note de cet exercice"
                  hint={`${formatScore(exercise.final_score, exercise.max_score)}${
                    exercise.adjusted ? ' · ajustée' : ''
                  }`}
                >
                  <ScoreForm
                    idPrefix={`ex-${exercise.exercise_id}`}
                    max={exercise.max_score}
                    current={exercise.final_score}
                    disabled={publiee}
                    pending={adjust.isPending}
                    onSubmit={(body) => noter({ ...body, exercise_id: exercise.exercise_id })}
                  />
                </Disclosure>
              </div>
            </section>
          ))}

          <footer className="copy-sheet-footer">
            — Fin de la copie — {data.exercises.length} exercice
            {data.exercises.length !== 1 ? 's' : ''}
          </footer>
        </article>
      </div>
    </>
  );
}

/**
 * Poser une note à la main. Le motif est exigé par le serveur : un ajustement
 * sans raison ne se justifie pas devant l'apprenant.
 */
function ScoreForm({ max, current, onSubmit, pending, disabled, idPrefix }) {
  const [score, setScore] = useState('');
  const [reason, setReason] = useState('');
  const [erreur, setErreur] = useState(null);

  function envoyer(event) {
    event.preventDefault();
    const valeur = Number(score);
    if (score === '' || Number.isNaN(valeur) || valeur < 0 || valeur > max) {
      setErreur(`Indiquez une note comprise entre 0 et ${max}.`);
      return;
    }
    if (reason.trim().length < 3) {
      setErreur('Indiquez un motif (3 caractères minimum).');
      return;
    }
    setErreur(null);
    onSubmit({ new_score: valeur, reason: reason.trim() });
    setScore('');
    setReason('');
  }

  if (disabled) {
    return <p className="sub">Note retenue : {formatScore(current, max)} — résultats publiés.</p>;
  }

  return (
    <form onSubmit={envoyer}>
      <Alert>{erreur}</Alert>
      <div className="row">
        <Field label={`Nouvelle note (sur ${max})`} id={`${idPrefix}-note`}>
          <input
            id={`${idPrefix}-note`}
            type="number"
            step="0.5"
            min="0"
            max={max}
            placeholder={String(current)}
            value={score}
            onChange={(e) => setScore(e.target.value)}
          />
        </Field>
        <Field label="Motif" id={`${idPrefix}-motif`}>
          <input
            id={`${idPrefix}-motif`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
      <Button type="submit" size="small" disabled={pending}>
        Enregistrer la note
      </Button>
    </form>
  );
}

/**
 * Champ d'appréciation autonome : il garde sa propre saisie et ne la renvoie au
 * serveur que sur validation explicite, pour ne pas écrire à chaque frappe.
 */
function AppreciationForm({ label, value, onSave, pending }) {
  const [text, setText] = useState(value);
  const dirty = text !== value;

  return (
    <div>
      <Field label={label} id={`appr-${label ?? 'globale'}`}>
        <textarea
          id={`appr-${label ?? 'globale'}`}
          rows={3}
          placeholder="Commentaire adressé à l'apprenant…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </Field>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button size="small" disabled={!dirty || pending} onClick={() => onSave(text.trim())}>
          Enregistrer
        </Button>
        {dirty && (
          <Button variant="secondary" size="small" onClick={() => setText(value)}>
            Annuler
          </Button>
        )}
      </div>
    </div>
  );
}
