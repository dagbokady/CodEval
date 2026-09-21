import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useClassrooms, useEvaluations, useTeacherStats } from '../../api/hooks';
import { Alert, Button, EmptyState, PageHeader, Skeleton, Stat, Status } from '../../components/ui';
import { EVAL_KIND_LABELS, formatPercent } from '../../format';

/*
 * L'accueil répond à une question : « qu'ai-je à faire maintenant ? ».
 * Une seule priorité en tête, celle qui presse le plus (une session en direct,
 * puis des copies qui attendent, puis la prochaine épreuve). Dessous, les files
 * de travail rangées par étape : corriger, publier, puis l'agenda et les
 * derniers résultats. Les raccourcis vers les rubriques ne sont pas répétés
 * ici : la barre latérale les porte déjà.
 */

const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);
const plural = (n, word, many = `${word}s`) => `${n} ${n > 1 ? many : word}`;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** « Aujourd'hui », « Demain », sinon « Jeu. 24 sept. ». */
function dayLabel(value) {
  const date = new Date(value);
  const days = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Demain';
  return capitalize(shortDayFmt.format(date));
}

function hourRange(evaluation) {
  const start = new Date(evaluation.scheduled_start);
  const end = new Date(start.getTime() + evaluation.duration_minutes * 60_000);
  return `${timeFmt.format(start)} - ${timeFmt.format(end)}`;
}

/** Classe · matière · nature : ce qui situe une épreuve d'un coup d'œil. */
function context(evaluation, ...extra) {
  return [
    evaluation.classroom_name,
    evaluation.subject_name,
    EVAL_KIND_LABELS[evaluation.kind],
    ...extra,
  ]
    .filter(Boolean)
    .join(' · ');
}

/* ─────────────── Priorité ─────────────── */

/**
 * La chose à faire maintenant, et une seule. L'enseignant n'a pas à lire la
 * page pour savoir par où commencer.
 */
function priorityOf({ live, toCorrect, toPublish, upcoming }) {
  if (live.length > 0) {
    const [first] = live;
    return {
      tone: 'live',
      eyebrow: live.length > 1 ? `${live.length} sessions en direct` : 'Session en direct',
      title: first.title,
      text: context(first, plural(first.participants_count, 'inscrit')),
      action: { label: 'Suivre la session', to: `/evaluations/${first.id}/session` },
    };
  }
  if (toCorrect.length > 0) {
    const [first] = toCorrect;
    return {
      tone: 'attention',
      eyebrow:
        toCorrect.length > 1 ? `${toCorrect.length} épreuves à corriger` : 'Une épreuve à corriger',
      title: first.title,
      text: `${context(first)}. Les copies sont figées : lancez la correction automatique.`,
      action: { label: 'Corriger', to: `/evaluations/${first.id}/resultats` },
    };
  }
  if (toPublish.length > 0) {
    const [first] = toPublish;
    return {
      tone: 'attention',
      eyebrow:
        toPublish.length > 1 ? `${toPublish.length} résultats à publier` : 'Des résultats à publier',
      title: first.title,
      text: `${context(first)}. La correction est faite : relisez les copies, puis publiez les notes.`,
      action: { label: 'Vérifier et publier', to: `/evaluations/${first.id}/resultats` },
    };
  }
  const next = upcoming.find((e) => e.scheduled_start);
  if (next) {
    return {
      tone: 'calm',
      eyebrow: 'Tout est à jour',
      title: `Prochaine épreuve : ${next.title}`,
      text: `${dayLabel(next.scheduled_start)}, ${hourRange(next)} · ${context(next)}`,
      action: { label: 'Relire le sujet', to: `/evaluations/${next.id}`, secondary: true },
    };
  }
  return {
    tone: 'calm',
    eyebrow: 'Tout est à jour',
    title: 'Aucune épreuve en attente',
    text: 'Préparez la prochaine évaluation : elle apparaîtra dans l’agenda de vos classes.',
    action: { label: 'Nouvelle évaluation', to: '/evaluations/nouvelle' },
  };
}

function PriorityCard({ priority, loading }) {
  const navigate = useNavigate();
  if (loading) {
    return (
      <section className="th-priority" aria-busy="true">
        <div className="th-priority-body">
          <Skeleton width={140} height={12} />
          <Skeleton width="55%" height={20} />
          <Skeleton width="70%" height={13} />
        </div>
      </section>
    );
  }
  const { tone, eyebrow, title, text, action } = priority;
  return (
    <section className={`th-priority th-priority--${tone}`} aria-labelledby="th-priority-title">
      <span className="th-priority-mark" aria-hidden="true">
        {tone === 'live' ? <span className="th-live-dot" /> : <PriorityIcon tone={tone} />}
      </span>
      <div className="th-priority-body">
        <span className="th-priority-eyebrow">{eyebrow}</span>
        <h2 id="th-priority-title">{title}</h2>
        <p>{text}</p>
      </div>
      <Button
        variant={action.secondary ? 'secondary' : 'primary'}
        onClick={() => navigate(action.to)}
      >
        {action.label}
      </Button>
    </section>
  );
}

function PriorityIcon({ tone }) {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {tone === 'attention' ? (
        <>
          <path d="M4 4h12v12H4z" />
          <path d="M7 10l2 2 4-4" />
        </>
      ) : (
        <path d="M5 10.5l3 3 7-7" />
      )}
    </svg>
  );
}

/* ─────────────── Listes ─────────────── */

/** Une ligne cliquable en entier : le titre mène là où l'action mène. */
function Row({ evaluation, to, lead, meta, aside, action }) {
  const navigate = useNavigate();
  return (
    <li className="th-row">
      {lead}
      <div className="th-row-body">
        <Link className="th-row-title" to={to}>
          {evaluation.title}
        </Link>
        <span className="th-row-meta">{meta}</span>
      </div>
      {aside}
      {action && (
        <Button
          variant={action.primary ? 'primary' : 'secondary'}
          size="small"
          onClick={() => navigate(to)}
          aria-label={`${action.label} : ${evaluation.title}`}
        >
          {action.label}
        </Button>
      )}
    </li>
  );
}

function RowsSkeleton({ rows = 3 }) {
  return (
    <ul className="th-rows" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="th-row">
          <div className="th-row-body">
            <Skeleton width="60%" height={14} />
            <Skeleton width="40%" height={12} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, count, hint, moreTo, moreLabel = 'Tout voir', children }) {
  return (
    <section className="th-panel">
      <header className="th-panel-head">
        <h2>{title}</h2>
        {count > 0 && <span className="th-count">{count}</span>}
        {moreTo && (
          <Link className="th-panel-more" to={moreTo}>
            {moreLabel}
          </Link>
        )}
      </header>
      {hint && <p className="th-panel-hint">{hint}</p>}
      {children}
    </section>
  );
}

/** Le travail de correction, par étape : chaque file a son propre geste. */
function WorkPanel({ loading, toCorrect, toPublish, correcting }) {
  const total = toCorrect.length + toPublish.length + correcting.length;
  return (
    <Panel title="À traiter" count={total} moreTo="/evaluations?onglet=corrected">
      {loading ? (
        <RowsSkeleton />
      ) : total === 0 ? (
        <EmptyState compact variant="done" title="Rien en attente">
          Les épreuves terminées apparaîtront ici, le temps de lancer la correction puis de publier
          les notes.
        </EmptyState>
      ) : (
        <div className="th-queues">
          {toCorrect.length > 0 && (
            <Queue step="1" title="À corriger" hint="Copies figées, correction à lancer">
              {toCorrect.slice(0, 4).map((e) => (
                <Row
                  key={e.id}
                  evaluation={e}
                  to={`/evaluations/${e.id}/resultats`}
                  meta={context(e, plural(e.participants_count, 'copie'))}
                  action={{ label: 'Corriger', primary: true }}
                />
              ))}
            </Queue>
          )}
          {correcting.length > 0 && (
            <Queue step="2" title="Correction en cours" hint="Les notes arrivent d'elles-mêmes">
              {correcting.slice(0, 4).map((e) => (
                <Row
                  key={e.id}
                  evaluation={e}
                  to={`/evaluations/${e.id}/resultats`}
                  meta={context(e)}
                  aside={<Status tone="warning">En cours</Status>}
                />
              ))}
            </Queue>
          )}
          {toPublish.length > 0 && (
            <Queue step="3" title="À publier" hint="Notes prêtes, invisibles des apprenants">
              {toPublish.slice(0, 4).map((e) => (
                <Row
                  key={e.id}
                  evaluation={e}
                  to={`/evaluations/${e.id}/resultats`}
                  meta={context(e, e.success_rate != null ? `${formatPercent(e.success_rate)} de réussite` : null)}
                  action={{ label: 'Vérifier' }}
                />
              ))}
            </Queue>
          )}
        </div>
      )}
    </Panel>
  );
}

function Queue({ step, title, hint, children }) {
  return (
    <div className="th-queue">
      <div className="th-queue-head">
        <span className="th-queue-step" aria-hidden="true">{step}</span>
        <h3>{title}</h3>
        <span className="th-queue-hint">{hint}</span>
      </div>
      <ul className="th-rows">{children}</ul>
    </div>
  );
}

/** L'agenda, jour par jour : l'heure en tête de ligne, comme dans un carnet. */
function AgendaPanel({ loading, upcoming, drafts }) {
  const navigate = useNavigate();
  const dated = upcoming.filter((e) => e.scheduled_start);
  const days = [];
  for (const evaluation of dated) {
    const label = dayLabel(evaluation.scheduled_start);
    const last = days[days.length - 1];
    if (last?.label === label) last.items.push(evaluation);
    else days.push({ label, items: [evaluation] });
  }

  return (
    <Panel title="Agenda" count={dated.length} moreTo="/evaluations?onglet=scheduled">
      {loading ? (
        <RowsSkeleton />
      ) : dated.length === 0 ? (
        <EmptyState
          compact
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
        <div className="th-agenda">
          {days.slice(0, 4).map((day) => (
            <div key={day.label} className="th-agenda-day">
              <h3 className={day.label === "Aujourd'hui" ? 'is-today' : undefined}>{day.label}</h3>
              <ul className="th-rows">
                {day.items.map((e) => (
                  <Row
                    key={e.id}
                    evaluation={e}
                    to={`/evaluations/${e.id}`}
                    lead={
                      <span className="th-time">
                        {timeFmt.format(new Date(e.scheduled_start))}
                        <small>{e.duration_minutes} min</small>
                      </span>
                    }
                    meta={context(e, plural(e.participants_count, 'inscrit'))}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {!loading && drafts.length > 0 && (
        <Link className="th-drafts" to="/evaluations?onglet=scheduled">
          <span>
            {plural(drafts.length, 'brouillon')} à terminer
            <small>{drafts.slice(0, 2).map((d) => d.title).join(', ')}{drafts.length > 2 ? '…' : ''}</small>
          </span>
          <span aria-hidden="true">→</span>
        </Link>
      )}
    </Panel>
  );
}

/** Les derniers résultats publiés, avec leur taux de réussite en jauge. */
function RecentPanel({ loading, published }) {
  if (!loading && published.length === 0) return null;
  return (
    <Panel title="Derniers résultats publiés" moreTo="/evaluations?onglet=corrected" moreLabel="Historique">
      {loading ? (
        <RowsSkeleton rows={2} />
      ) : (
        <ul className="th-rows">
          {published.slice(0, 5).map((e) => {
            const rate = e.success_rate;
            return (
              <Row
                key={e.id}
                evaluation={e}
                to={`/evaluations/${e.id}/resultats`}
                meta={context(e, plural(e.participants_count, 'copie'))}
                aside={
                  <span
                    className={`th-meter ${rate != null && rate < 50 ? 'th-meter--low' : ''}`.trim()}
                    title="Taux de réussite"
                  >
                    <span className="th-meter-track" aria-hidden="true">
                      <span style={{ width: `${Math.max(0, Math.min(100, rate ?? 0))}%` }} />
                    </span>
                    <span className="th-meter-value">{rate != null ? formatPercent(rate) : '-'}</span>
                  </span>
                }
              />
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/* ─────────────── Page ─────────────── */

export default function TeacherHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const stats = useTeacherStats();
  const classrooms = useClassrooms();
  const running = useEvaluations({ group: 'running', page: 1 });
  const scheduled = useEvaluations({ group: 'scheduled', page: 1 });
  const corrected = useEvaluations({ group: 'corrected', page: 1 });

  // Une évaluation dont le temps vient d'expirer est clôturée par le serveur au
  // moment de la lecture : on ne la laisse pas sous « En direct ».
  const live = (running.data?.items ?? []).filter((e) => e.status === 'running');
  const finished = corrected.data?.items ?? [];
  const toCorrect = finished.filter((e) => e.status === 'closed');
  const correcting = finished.filter((e) => e.status === 'correcting');
  const toPublish = finished.filter((e) => e.status === 'corrected');
  const published = finished.filter((e) => e.status === 'validated');
  const planned = scheduled.data?.items ?? [];
  const upcoming = planned
    .filter((e) => e.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduled_start ?? 8.64e15) - new Date(b.scheduled_start ?? 8.64e15));
  const drafts = planned.filter((e) => e.status === 'draft');

  const loadingLists = running.isPending || scheduled.isPending || corrected.isPending;
  const priority = priorityOf({ live, toCorrect, toPublish, upcoming });

  const value = (n) => (stats.isPending ? <Skeleton width={40} height={26} /> : (n ?? 0));
  const toCorrectCount = stats.data?.to_correct ?? 0;
  const classCount = classrooms.data?.length ?? 0;
  const success = stats.data?.average_success;
  const firstName = user.full_name?.split(' ')[0] ?? '';

  return (
    <>
      <PageHeader
        breadcrumb={capitalize(dayFmt.format(new Date()))}
        title={`Bonjour ${firstName}`}
      >
        <Button onClick={() => navigate('/evaluations/nouvelle')}>+ Nouvelle évaluation</Button>
      </PageHeader>

      <div className="content th-home">
        {stats.error && <Alert>{stats.error.message}</Alert>}

        <PriorityCard priority={priority} loading={loadingLists} />

        <div className="stats th-stats">
          <Stat
            label="Copies à traiter"
            value={value(toCorrectCount)}
            tone={toCorrectCount > 0 ? 'attention' : undefined}
            hint={toCorrectCount > 0 ? 'Corriger →' : 'Rien en attente'}
            onClick={toCorrectCount > 0 ? () => navigate('/evaluations?onglet=corrected') : undefined}
          />
          <Stat
            label="En direct"
            value={value(stats.data?.running)}
            hint={stats.data?.running ? 'Suivre →' : 'Aucune session'}
            onClick={() => navigate('/evaluations?onglet=running')}
          />
          <Stat
            label="À venir"
            value={value(stats.data?.scheduled)}
            hint="Planning →"
            onClick={() => navigate('/evaluations?onglet=scheduled')}
          />
          <Stat
            label="Apprenants"
            value={value(stats.data?.students)}
            hint={`${plural(classCount, 'classe')} →`}
            onClick={() => navigate('/classes')}
          />
          <Stat
            label="Réussite moyenne"
            value={stats.isPending ? value() : success != null ? formatPercent(success) : '-'}
            tone={success != null && success < 50 ? 'low' : undefined}
            hint="Statistiques →"
            onClick={() => navigate('/statistiques')}
          />
        </div>

        {/* Une seconde session en direct ne tient pas dans la carte de priorité. */}
        {live.length > 1 && (
          <Panel title="En direct" count={live.length} moreTo="/evaluations?onglet=running">
            <ul className="th-rows">
              {live.map((e) => (
                <Row
                  key={e.id}
                  evaluation={e}
                  to={`/evaluations/${e.id}/session`}
                  lead={<span className="th-live-dot" aria-hidden="true" />}
                  meta={context(e, plural(e.participants_count, 'inscrit'))}
                  action={{ label: 'Suivre', primary: true }}
                />
              ))}
            </ul>
          </Panel>
        )}

        <div className="th-grid">
          <WorkPanel
            loading={corrected.isPending}
            toCorrect={toCorrect}
            toPublish={toPublish}
            correcting={correcting}
          />
          <AgendaPanel loading={scheduled.isPending} upcoming={upcoming} drafts={drafts} />
        </div>

        <RecentPanel loading={corrected.isPending} published={published} />
      </div>
    </>
  );
}
