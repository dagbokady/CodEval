import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction, useEvaluation, useSessionMonitor } from '../../api/hooks';
import { Alert, Button, Chips, Loading, Paged, PageHeader, Stat, Tag } from '../../components/ui';
import { SubjectSheet } from '../../components/SubjectSheet';
import { useAuth } from '../../auth';
import { evaluationUsesLanguage } from '../../exerciseTypes';
import { STATUS_LABELS, STATUS_TONES, formatDuration, formatRelative } from '../../format';
import { secondsUntil, useNow } from '../../useNow';

const FILTERS = [
  { value: 'connected', label: 'Connectés' },
  { value: 'disconnected', label: 'Déconnectés' },
  { value: 'submitted', label: 'Ont soumis' },
];

export default function SessionMonitorPage() {
  const { evaluationId } = useParams();
  const navigate = useNavigate();
  const evaluation = useEvaluation(evaluationId);
  const [filter, setFilter] = useState(null);
  const [error, setError] = useState(null);
  // Le sujet reste consultable pendant l'épreuve : l'enseignant répond aux
  // questions de la salle en ayant la feuille sous les yeux.
  const [showSubject, setShowSubject] = useState(false);
  const { organization } = useAuth();
  const running = evaluation.data?.status === 'running';
  const monitor = useSessionMonitor(evaluationId, true);
  // Décompte dérivé de l'échéance serveur : aucune horloge locale à resynchroniser.
  const now = useNow(1000, running);
  const countdown = running ? secondsUntil(monitor.data?.ends_at, now) : null;

  const extend = useAction(
    (minutes) =>
      api(`/api/evaluations/${evaluationId}/extend`, {
        method: 'POST',
        body: { extra_minutes: minutes },
      }),
    [['evaluation', evaluationId], ['session', evaluationId]],
  );
  const close = useAction(
    () => api(`/api/evaluations/${evaluationId}/close`, { method: 'POST' }),
    [['evaluation', evaluationId], ['session', evaluationId], ['evaluations']],
  );

  if (evaluation.isPending || monitor.isPending) return <Loading variant="page" />;
  if (evaluation.error) return <div className="content"><Alert>{evaluation.error.message}</Alert></div>;

  const data = monitor.data;
  const participants = (data?.participants ?? []).filter((p) => {
    if (filter === 'connected') return p.connected;
    if (filter === 'disconnected') return !p.connected;
    if (filter === 'submitted') return Boolean(p.submitted_at);
    return true;
  });

  return (
    <>
      <PageHeader
        breadcrumb={`Évaluations / ${evaluation.data.title}`}
        title="Suivi de session"
      >
        <Tag tone={STATUS_TONES[data.status]}>{STATUS_LABELS[data.status]}</Tag>
        <Button
          variant="secondary"
          aria-pressed={showSubject}
          onClick={() => setShowSubject((shown) => !shown)}
        >
          {showSubject ? 'Masquer le sujet' : 'Voir le sujet'}
        </Button>
        {running && (
          <>
            <Button
              variant="secondary"
              disabled={extend.isPending}
              onClick={() => extend.mutateAsync(15).catch((err) => setError(err.message))}
            >
              Prolonger de 15 min
            </Button>
            <Button
              variant="danger"
              disabled={close.isPending}
              onClick={() => close.mutateAsync().catch((err) => setError(err.message))}
            >
              Clôturer la session
            </Button>
          </>
        )}
        {!running && (
          <Button onClick={() => navigate(`/evaluations/${evaluationId}/resultats`)}>
            Voir les résultats
          </Button>
        )}
      </PageHeader>

      <div className="content">
        <Alert>{error}</Alert>
        {showSubject && (
          <div className="exam-subject-panel session-subject">
            <div className="sheet-paper">
              <SubjectSheet
                organization={organization}
                classroom={evaluation.data.classroom_name}
                subject={evaluation.data.subject_name}
                title={evaluation.data.title}
                instructions={evaluation.data.instructions}
                durationMinutes={evaluation.data.duration_minutes}
                language={
                  evaluationUsesLanguage(evaluation.data.exercises ?? [])
                    ? evaluation.data.language
                    : null
                }
                date={evaluation.data.scheduled_start}
                exercises={evaluation.data.exercises ?? []}
                header={evaluation.data.sheet_header}
                emptyLabel="Cette épreuve ne contient aucun exercice."
              />
            </div>
          </div>
        )}
        <div className="cards" style={{ marginBottom: 16 }}>
          <Stat label="Temps restant" value={running ? formatDuration(countdown) : '-'} />
          <Stat label="Connectés" value={`${data.connected} / ${data.total}`} />
          <Stat label="Ont soumis" value={data.submitted} />
          <Stat label="Dernière sauvegarde" value={formatRelative(data.last_save)} />
          <Stat label="Sorties détectées" value={data.incidents ?? 0} />
        </div>
      </div>

      <Chips label="Filtrer :" allLabel="Tous" value={filter} onChange={setFilter} options={FILTERS} />

      <Paged items={participants} pageSize={50} resetKey={filter}>
        {(page) => (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Apprenant</th>
                  <th>État</th>
                  <th>Exercices rédigés</th>
                  <th>Dernière sauvegarde</th>
                  <th>Sorties</th>
                  <th>Soumission</th>
                </tr>
              </thead>
              <tbody>
                {page.map((p) => (
                  <tr key={p.participation_id}>
                    <td>
                      <div>{p.full_name}</div>
                      <div className="sub">{p.matricule ?? '-'}</div>
                    </td>
                    <td>
                      <Tag tone={p.connected ? 'success' : 'neutral'}>
                        {p.connected ? 'Connecté' : 'Déconnecté'}
                      </Tag>
                    </td>
                    <td>{p.exercises_done} / {evaluation.data.exercises_count}</td>
                    <td>{formatRelative(p.last_saved_at)}</td>
                    <td>
                      {p.incidents > 0 ? <Tag tone="danger">{p.incidents}</Tag> : <span className="sub">-</span>}
                    </td>
                    <td>{p.submitted_at ? `Soumis · ${formatRelative(p.submitted_at)}` : '-'}</td>
                  </tr>
                ))}
                {participants.length === 0 && (
                  <tr>
                    <td colSpan={6} className="sub" style={{ padding: 32, textAlign: 'center' }}>
                      Aucun apprenant pour ce filtre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Paged>
    </>
  );
}
