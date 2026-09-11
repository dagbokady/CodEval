import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useClassrooms, useEvaluations, useTeacherStats } from '../../api/hooks';
import { Alert, Button, EmptyState, Loading, PageHeader, Stat, Tag } from '../../components/ui';
import {
  IconClasses,
  IconCode,
  IconPlus,
  IconResults,
  IconSession,
} from '../../components/icons';
import { STATUS_LABELS, STATUS_TONES, formatSchedule } from '../../format';

const QUICK_ACTIONS = [
  {
    to: '/evaluations/nouvelle',
    label: 'Créer une évaluation',
    hint: 'Sujet, barème, jeux de tests et affectation',
    icon: <IconPlus />,
  },
  {
    to: '/evaluations',
    label: 'Mes évaluations',
    hint: 'Suivre, corriger, publier les résultats',
    icon: <IconResults />,
  },
  {
    to: '/banque',
    label: "Banque d'exercices",
    hint: 'Réutiliser et partager vos questions',
    icon: <IconCode />,
  },
  {
    to: '/classes',
    label: 'Mes classes',
    hint: 'Effectifs et inscriptions',
    icon: <IconClasses />,
  },
];

/** Liste courte d'évaluations, avec l'action qui a du sens pour leur état. */
function EvaluationList({ items, emptyLabel, action }) {
  const navigate = useNavigate();
  if (items.length === 0) return <p className="sub th-empty">{emptyLabel}</p>;
  return (
    <ul className="th-list">
      {items.slice(0, 5).map((evaluation) => (
        <li key={evaluation.id}>
          <div className="th-list-body">
            <strong>{evaluation.title}</strong>
            <span className="sub">
              {[evaluation.classroom_name, formatSchedule(evaluation)].filter(Boolean).join(' · ')}
            </span>
          </div>
          <Tag tone={STATUS_TONES[evaluation.status]}>{STATUS_LABELS[evaluation.status]}</Tag>
          <Button
            variant="secondary"
            size="small"
            onClick={() => navigate(action.to(evaluation))}
          >
            {action.label}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export default function TeacherHomePage() {
  const navigate = useNavigate();
  const { user, organization } = useAuth();
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

  return (
    <>
      <PageHeader breadcrumb={organization} title={`Bonjour ${user.full_name}`}>
        <Button onClick={() => navigate('/evaluations/nouvelle')}>+ Nouvelle évaluation</Button>
      </PageHeader>

      <div className="content" style={{ display: 'grid', gap: 20 }}>
        {stats.error && <Alert>{stats.error.message}</Alert>}

        {stats.isPending ? (
          <Loading />
        ) : (
          <div className="cards">
            <Stat label="Sessions en cours" value={stats.data?.running ?? 0} />
            <Stat label="À venir" value={stats.data?.scheduled ?? 0} />
            <Stat label="Copies à corriger" value={stats.data?.to_correct ?? 0} />
            <Stat label="Apprenants suivis" value={stats.data?.students ?? 0} />
            <Stat label="Classes" value={classrooms.data?.length ?? 0} />
            <Stat
              label="Réussite moyenne"
              value={
                stats.data?.average_success !== null && stats.data?.average_success !== undefined
                  ? `${stats.data.average_success} %`
                  : '—'
              }
            />
          </div>
        )}

        <section className="card">
          <div className="th-section-head">
            <h2>Sessions en cours</h2>
            {live.length > 0 && (
              <span className="th-live" aria-hidden="true">
                <IconSession />
              </span>
            )}
          </div>
          {running.isPending ? (
            <Loading />
          ) : (
            <EvaluationList
              items={live}
              emptyLabel="Aucune épreuve en cours pour l'instant."
              action={{ label: 'Suivi', to: (e) => `/evaluations/${e.id}/session` }}
            />
          )}
        </section>

        <section className="card">
          <div className="th-section-head">
            <h2>Prochaines épreuves</h2>
          </div>
          {scheduled.isPending ? (
            <Loading />
          ) : (
            <EvaluationList
              items={scheduled.data?.items ?? []}
              emptyLabel="Aucune évaluation programmée."
              action={{ label: 'Ouvrir', to: (e) => `/evaluations/${e.id}` }}
            />
          )}
        </section>

        <section className="card">
          <div className="th-section-head">
            <h2>Corrections en attente</h2>
          </div>
          {corrected.isPending ? (
            <Loading />
          ) : toCorrect.length === 0 ? (
            <EmptyState title="Rien à corriger">
              Les épreuves terminées apparaîtront ici pour lancer la correction puis publier les
              notes et vos appréciations.
            </EmptyState>
          ) : (
            <EvaluationList
              items={toCorrect}
              emptyLabel=""
              action={{ label: 'Corriger', to: (e) => `/evaluations/${e.id}/resultats` }}
            />
          )}
        </section>

        <section className="card">
          <div className="th-section-head">
            <h2>Accès rapides</h2>
          </div>
          <div className="th-actions">
            {QUICK_ACTIONS.map((item) => (
              <button
                key={item.to + item.label}
                type="button"
                className="th-action"
                onClick={() => navigate(item.to)}
              >
                <span className="th-action-icon">{item.icon}</span>
                <span>
                  <strong>{item.label}</strong>
                  <span className="sub">{item.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
