import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useClassrooms, useEvaluations, useTeacherStats } from '../../api/hooks';
import { Alert, Button, EmptyState, PageHeader, Skeleton, Stat, Tag } from '../../components/ui';
import { STATUS_LABELS, STATUS_TONES, formatSchedule } from '../../format';

/*
 * L'accueil répond à une question : « qu'ai-je à faire maintenant ? ».
 * D'abord ce qui se passe en direct, puis ce qui attend une action (copies à
 * corriger), puis ce qui arrive. Les raccourcis vers les rubriques ne sont pas
 * répétés ici : la barre latérale les porte déjà.
 */

/** Liste courte d'évaluations, avec l'action qui a du sens pour leur état. */
function EvaluationList({ items, action }) {
  const navigate = useNavigate();
  return (
    <ul className="th-list">
      {items.slice(0, 5).map((evaluation) => (
        <li key={evaluation.id}>
          <div className="th-list-body">
            <strong>
              <Link to={action.to(evaluation)}>{evaluation.title}</Link>
            </strong>
            <span className="sub">
              {[evaluation.classroom_name, formatSchedule(evaluation)].filter(Boolean).join(' · ')}
            </span>
          </div>
          <Tag tone={STATUS_TONES[evaluation.status]}>{STATUS_LABELS[evaluation.status]}</Tag>
          <Button
            variant={action.primary ? 'primary' : 'secondary'}
            size="small"
            onClick={() => navigate(action.to(evaluation))}
            aria-label={`${action.label} : ${evaluation.title}`}
          >
            {action.label}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <ul className="th-list" aria-busy="true" aria-label="Chargement">
      {[0, 1, 2].map((i) => (
        <li key={i}>
          <div className="th-list-body" style={{ flex: 1 }}>
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Section({ title, count, moreTo, children }) {
  return (
    <section className="card">
      <div className="th-section-head">
        <h2>{title}</h2>
        {count > 0 && <span className="th-count">{count}</span>}
        {moreTo && count > 0 && (
          <Link className="cd-link" to={moreTo}>
            Tout voir
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export default function TeacherHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const stats = useTeacherStats();
  const classrooms = useClassrooms();
  const running = useEvaluations({ group: 'running', page: 1 });
  const scheduled = useEvaluations({ group: 'scheduled', page: 1 });
  const corrected = useEvaluations({ group: 'corrected', page: 1 });

  // Une évaluation dont le temps vient d'expirer est clôturée par le serveur au
  // moment de la lecture : on ne la laisse pas sous « Sessions en cours ».
  const live = (running.data?.items ?? []).filter((e) => e.status === 'running');
  const toCorrect = (corrected.data?.items ?? []).filter((e) =>
    ['closed', 'corrected'].includes(e.status),
  );
  const upcoming = scheduled.data?.items ?? [];

  const value = (n) => (stats.isPending ? <Skeleton width={40} height={28} /> : (n ?? 0));
  const toCorrectCount = stats.data?.to_correct ?? 0;
  const classCount = classrooms.data?.length ?? 0;
  const success = stats.data?.average_success;

  return (
    <>
      <PageHeader breadcrumb="Espace enseignant" title={`Bonjour ${user.full_name}`}>
        <Button onClick={() => navigate('/evaluations/nouvelle')}>+ Nouvelle évaluation</Button>
      </PageHeader>

      <div className="content" style={{ display: 'grid', gap: 20 }}>
        {stats.error && <Alert>{stats.error.message}</Alert>}

        <div className="cards">
          <Stat
            label="Copies à corriger"
            value={value(toCorrectCount)}
            tone={toCorrectCount > 0 ? 'attention' : undefined}
            hint={toCorrectCount > 0 ? 'Corriger →' : 'Rien en attente'}
            onClick={toCorrectCount > 0 ? () => navigate('/evaluations?onglet=corrected') : undefined}
          />
          <Stat
            label="Sessions en cours"
            value={value(stats.data?.running)}
            hint="Suivre →"
            onClick={() => navigate('/evaluations?onglet=running')}
          />
          <Stat
            label="À venir"
            value={value(stats.data?.scheduled)}
            hint="Voir le planning →"
            onClick={() => navigate('/evaluations?onglet=scheduled')}
          />
          <Stat
            label="Apprenants suivis"
            value={value(stats.data?.students)}
            hint={`${classCount} classe${classCount > 1 ? 's' : ''} →`}
            onClick={() => navigate('/classes')}
          />
          <Stat
            label="Réussite moyenne"
            value={stats.isPending ? value() : success !== null && success !== undefined ? `${success} %` : '-'}
            hint="Statistiques →"
            onClick={() => navigate('/statistiques')}
          />
        </div>

        {/* Une session en direct passe avant tout le reste, et seulement s'il y en a une. */}
        {live.length > 0 && (
          <section className="card">
            <div className="th-section-head">
              <span className="th-live-dot" aria-hidden="true" />
              <h2>En direct</h2>
              <span className="th-count">{live.length}</span>
            </div>
            <EvaluationList
              items={live}
              action={{ label: 'Suivre', primary: true, to: (e) => `/evaluations/${e.id}/session` }}
            />
          </section>
        )}

        <div className="th-grid">
          <Section
            title="À corriger"
            count={toCorrect.length}
            moreTo="/evaluations?onglet=corrected"
          >
            {corrected.isPending ? (
              <ListSkeleton />
            ) : toCorrect.length === 0 ? (
              <EmptyState title="Rien à corriger">
                Les épreuves terminées apparaîtront ici pour lancer la correction puis publier
                les notes.
              </EmptyState>
            ) : (
              <EvaluationList
                items={toCorrect}
                action={{ label: 'Corriger', primary: true, to: (e) => `/evaluations/${e.id}/resultats` }}
              />
            )}
          </Section>

          <Section
            title="Prochaines épreuves"
            count={upcoming.length}
            moreTo="/evaluations?onglet=scheduled"
          >
            {scheduled.isPending ? (
              <ListSkeleton />
            ) : upcoming.length === 0 ? (
              <EmptyState
                title="Aucune épreuve programmée"
                action={
                  <Button variant="secondary" onClick={() => navigate('/evaluations/nouvelle')}>
                    Préparer une évaluation
                  </Button>
                }
              >
                Programmez une épreuve pour qu'elle apparaisse dans l'agenda de vos classes.
              </EmptyState>
            ) : (
              <EvaluationList
                items={upcoming}
                action={{ label: 'Ouvrir', to: (e) => `/evaluations/${e.id}` }}
              />
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
