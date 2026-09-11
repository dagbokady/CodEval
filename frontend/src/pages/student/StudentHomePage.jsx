import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { Alert, Button, EmptyState, Loading, Tag } from '../../components/ui';
import { formatSchedule, formatDuration } from '../../format';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function fmtDate(v) {
  if (!v) return '—';
  return dateFmt.format(new Date(v));
}
function fmtRange(evaluation) {
  if (!evaluation.scheduled_start) return '—';
  const s = new Date(evaluation.scheduled_start);
  const e = new Date(s.getTime() + evaluation.duration_minutes * 60000);
  return `${timeFmt.format(s)} – ${timeFmt.format(e)}`;
}

function useCountdown(targetDate, enabled = true) {
  const [remaining, setRemaining] = useState(() => {
    if (!targetDate) return null;
    return Math.max(0, Math.round((new Date(targetDate).getTime() - Date.now()) / 1000));
  });
  const reachedZero = useRef(false);

  useEffect(() => {
    if (!enabled || !targetDate) return undefined;
    reachedZero.current = false;

    const update = () => {
      const diff = Math.max(0, Math.round((new Date(targetDate).getTime() - Date.now()) / 1000));
      setRemaining(diff);
      if (diff === 0 && !reachedZero.current) {
        reachedZero.current = true;
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [targetDate, enabled]);

  return { remaining, reachedZero: remaining === 0 };
}

function formatCountdown(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.max(0, seconds);
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n) => String(n).padStart(2, '0');

  if (days > 0) return `${days}j ${pad(hours)}h ${pad(mins)}min`;
  if (hours > 0) return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}

function UpcomingCard({ evaluation, onReady }) {
  const navigate = useNavigate();
  const { remaining, reachedZero } = useCountdown(evaluation.scheduled_start);

  useEffect(() => {
    if (reachedZero) onReady();
  }, [reachedZero, onReady]);

  const isReady = reachedZero || evaluation.status === 'running';

  return (
    <article className={`stu-card ${isReady ? 'stu-card--ready' : ''}`}>
      <div className={`stu-card-icon ${isReady ? 'stu-card-icon--play' : 'stu-card-icon--upcoming'}`}>
        {isReady ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z"/></svg>
        )}
      </div>
      <div className="stu-card-body">
        <Tag tone={isReady ? 'solid' : 'purple'} style={{ marginBottom: 4, fontSize: 11 }}>
          {evaluation.classroom_name}
        </Tag>
        <h3>{evaluation.title}</h3>
        <div className="stu-card-meta">
          {evaluation.scheduled_start && fmtDate(evaluation.scheduled_start)} · {fmtRange(evaluation)} · {evaluation.duration_minutes} min
        </div>
      </div>
      <div className="stu-card-right">
        {isReady ? (
          <Button onClick={() => navigate(`/epreuve/${evaluation.id}`)}>
            Commencer l'épreuve
          </Button>
        ) : (
          <div className="stu-countdown">
            {/* Sans date programmée, il n'y a rien à décompter : l'épreuve
                s'ouvrira quand l'enseignant lancera la session. */}
            <div className="stu-countdown-label">
              {evaluation.scheduled_start ? 'Commence dans' : 'Ouverture'}
            </div>
            <div className="stu-countdown-value">
              {evaluation.scheduled_start ? formatCountdown(remaining) : 'à venir'}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

export default function StudentHomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const evaluations = useQuery({
    queryKey: ['my-evaluations'],
    queryFn: () => api('/api/me/evaluations'),
    refetchInterval: 30_000,
  });

  // Mémorisé : sans cela l'effet de `UpcomingCard` se redéclenche à chaque rendu
  // dès que le compte à rebours atteint zéro, et invalide la requête en boucle.
  const handleReady = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['my-evaluations'] });
  }, [queryClient]);

  if (evaluations.isPending) return <Loading />;

  const items = evaluations.data ?? [];
  const running = items.filter((e) => e.status === 'running' && !e.submitted_at);
  const upcoming = items.filter((e) => e.status === 'scheduled');
  const done = items.filter(
    (e) => e.submitted_at || ['closed', 'correcting', 'corrected', 'validated'].includes(e.status),
  );

  return (
    <div className="stu-home">
      <div className="stu-home-header">
        <h1>Mes évaluations</h1>
        <p className="sub">Retrouvez vos épreuves en cours, à venir et terminées.</p>
      </div>

      {evaluations.error && (
        <div className="content"><Alert>{evaluations.error.message}</Alert></div>
      )}

      {items.length === 0 && (
        <EmptyState title="Aucune évaluation prévue">
          Vos épreuves apparaîtront ici dès qu'un enseignant vous y aura inscrit.
        </EmptyState>
      )}

      {running.length > 0 && (
        <section className="stu-section">
          <h2 className="stu-section-title">Session en cours</h2>
          {running.map((evaluation) => (
            <RunningCard key={evaluation.id} evaluation={evaluation} />
          ))}
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="stu-section">
          <h2 className="stu-section-title">À venir</h2>
          {upcoming.map((evaluation) => (
            <UpcomingCard key={evaluation.id} evaluation={evaluation} onReady={handleReady} />
          ))}
        </section>
      )}

      {done.length > 0 && (
        <section className="stu-section">
          <h2 className="stu-section-title">Terminées</h2>
          {done.map((evaluation) => (
            <article key={evaluation.id} className="stu-card stu-card--done">
              <div className="stu-card-icon stu-card-icon--done">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              </div>
              <div className="stu-card-body">
                <h3>{evaluation.title}</h3>
                <div className="stu-card-meta">
                  {evaluation.scheduled_start ? fmtDate(evaluation.scheduled_start) : '—'}
                </div>
              </div>
              <div className="stu-card-right">
                <Tag tone={evaluation.status === 'validated' ? 'success' : 'neutral'}>
                  {evaluation.status === 'validated' ? 'Résultats publiés' : 'Travail soumis'}
                </Tag>
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => navigate(`/mes-resultats/${evaluation.id}`)}
                >
                  Voir ma copie
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

function RunningCard({ evaluation }) {
  const navigate = useNavigate();
  const { remaining } = useCountdown(evaluation.ends_at);

  return (
    <article className="stu-card stu-card--active">
      <div className="stu-card-icon stu-card-icon--play">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </div>
      <div className="stu-card-body">
        <Tag tone="solid" style={{ marginBottom: 4, fontSize: 11 }}>{evaluation.classroom_name}</Tag>
        <h3>{evaluation.title}</h3>
        <div className="stu-card-meta">
          Démarrée {formatSchedule(evaluation)} · {evaluation.duration_minutes} min
        </div>
      </div>
      <div className="stu-card-right">
        <div className="stu-card-timer">
          <div className="stu-card-timer-label">Temps restant</div>
          <div className="stu-card-timer-value">
            {remaining != null ? formatDuration(remaining) : (evaluation.seconds_left != null ? formatDuration(evaluation.seconds_left) : '—')}
          </div>
        </div>
        <Button onClick={() => navigate(`/epreuve/${evaluation.id}`)}>
          Continuer l'épreuve
        </Button>
        {evaluation.exercises_count > 0 && (
          <div className="stu-card-progress">
            <span>Questions répondues</span>
            <span>{evaluation.answered_count ?? 0} / {evaluation.exercises_count}</span>
            <div className="stu-progress-bar">
              <div
                className="stu-progress-fill"
                style={{ width: `${((evaluation.answered_count ?? 0) / evaluation.exercises_count) * 100}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
