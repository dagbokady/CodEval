import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../auth';
import { Alert, Button, Chips, EmptyState, Field, Loading, Paged, Tabs, Tag } from '../../components/ui';
import { cleanJoinCode, typeJoinCode } from '../../joinCode';
import { useDocumentTitle } from '../../useDocumentTitle';
import { EVAL_KIND_LABELS, formatDuration } from '../../format';

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

const CLOSED = ['closed', 'correcting', 'corrected', 'validated'];
const SANS_MATIERE = 'Sans matière';

function fmtDate(v) {
  if (!v) return '-';
  return dateFmt.format(new Date(v));
}

/** « Aujourd'hui », « Demain », sinon le jour en toutes lettres. */
function dayLabel(v) {
  if (!v) return null;
  const date = new Date(v);
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(new Date())) / 86_400_000);
  if (days === 0) return "Aujourd'hui";
  if (days === 1) return 'Demain';
  const text = dayFmt.format(date);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function fmtRange(evaluation) {
  if (!evaluation.scheduled_start) return null;
  const s = new Date(evaluation.scheduled_start);
  const e = new Date(s.getTime() + evaluation.duration_minutes * 60000);
  return `${timeFmt.format(s)} – ${timeFmt.format(e)}`;
}

/** Nombre à la française, au centième : 12.5 → « 12,5 ». */
function clean(n) {
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

function plural(count, word) {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

const dayMonthFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const dayOnlyFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric' });
const WEEK_MS = 7 * 86_400_000;

/** Le lundi 0 h de la semaine d'une date. */
function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** La date qui situe une copie rendue : le début de l'épreuve, sinon le rendu. */
function doneDate(evaluation) {
  const v = evaluation.scheduled_start || evaluation.submitted_at;
  return v ? new Date(v) : null;
}

/** « Cette semaine », « La semaine dernière », sinon « Semaine du 8 au 14 septembre ». */
function weekLabel(monday) {
  const weeks = Math.round((mondayOf(new Date()).getTime() - monday.getTime()) / WEEK_MS);
  if (weeks === 0) return 'Cette semaine';
  if (weeks === 1) return 'La semaine dernière';
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const from = monday.getMonth() === sunday.getMonth() ? dayOnlyFmt.format(monday) : dayMonthFmt.format(monday);
  const year = monday.getFullYear() !== new Date().getFullYear() ? ` ${sunday.getFullYear()}` : '';
  return `Semaine du ${from} au ${dayMonthFmt.format(sunday)}${year}`;
}

/**
 * Range les copies rendues par semaine, la plus récente d'abord, à la manière du
 * Finder. Les copies sans date ferment la liste.
 */
function groupByWeek(evaluations) {
  const groups = new Map();
  const undated = [];
  for (const evaluation of evaluations) {
    const date = doneDate(evaluation);
    if (!date) {
      undated.push(evaluation);
      continue;
    }
    const key = mondayOf(date).getTime();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(evaluation);
  }
  const weeks = [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([key, list]) => ({
      key: String(key),
      label: weekLabel(new Date(key)),
      items: list.sort((a, b) => doneDate(b) - doneDate(a)),
    }));
  if (undated.length) weeks.push({ key: 'sans-date', label: 'Sans date', items: undated });
  return weeks;
}

function startTime(evaluation) {
  return evaluation.scheduled_start ? new Date(evaluation.scheduled_start).getTime() : Infinity;
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
  if (seconds === null || seconds === undefined) return '-';
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

/** Où en est une copie rendue : l'apprenant attend surtout de savoir quand. */
function doneState(evaluation) {
  if (evaluation.published) return { tone: 'success', label: 'Résultats publiés' };
  if (evaluation.status === 'running') return { tone: 'neutral', label: 'Copie rendue' };
  if (evaluation.status === 'correcting') return { tone: 'purple', label: 'Correction en cours' };
  if (evaluation.status === 'corrected') return { tone: 'warning', label: 'En attente de publication' };
  return { tone: 'neutral', label: 'Correction à venir' };
}

function CardTags({ evaluation, extra }) {
  const subject = evaluation.subject_name || evaluation.classroom_name;
  return (
    <div className="stu-card-tags">
      {extra}
      {subject && <Tag tone="purple">{subject}</Tag>}
      {evaluation.kind && <Tag>{EVAL_KIND_LABELS[evaluation.kind] ?? evaluation.kind}</Tag>}
    </div>
  );
}

function SummaryTile({ label, value, hint, tone }) {
  return (
    <div className={`stu-summary-tile ${tone ? `stu-summary-tile--${tone}` : ''}`.trim()}>
      <span className="stu-summary-label">{label}</span>
      <span className="stu-summary-value">{value}</span>
      {hint && <span className="stu-summary-hint">{hint}</span>}
    </div>
  );
}

function UpcomingCard({ evaluation, onReady, next }) {
  const navigate = useNavigate();
  const { remaining, reachedZero } = useCountdown(evaluation.scheduled_start);

  useEffect(() => {
    if (reachedZero) onReady();
  }, [reachedZero, onReady]);

  const isReady = reachedZero || evaluation.status === 'running';
  const when = [
    dayLabel(evaluation.scheduled_start),
    fmtRange(evaluation),
    `${evaluation.duration_minutes} min`,
    evaluation.exercises_count ? plural(evaluation.exercises_count, 'exercice') : null,
  ].filter(Boolean);

  return (
    <article
      className={`stu-card ${isReady ? 'stu-card--ready' : ''} ${next && !isReady ? 'stu-card--next' : ''}`.trim()}
    >
      <div className={`stu-card-icon ${isReady ? 'stu-card-icon--play' : 'stu-card-icon--upcoming'}`}>
        {isReady ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/></svg>
        )}
      </div>
      <div className="stu-card-body">
        <CardTags
          evaluation={evaluation}
          extra={next && !isReady ? <Tag tone="solid">Prochaine épreuve</Tag> : null}
        />
        <h3>{evaluation.title}</h3>
        <div className="stu-card-meta">
          {evaluation.scheduled_start ? when.join(' · ') : `Date à fixer · ${when.join(' · ')}`}
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

function RunningCard({ evaluation }) {
  const navigate = useNavigate();
  const { remaining } = useCountdown(evaluation.ends_at);
  const total = evaluation.exercises_count ?? 0;
  const answered = Math.min(evaluation.answered_count ?? 0, total);

  return (
    <article className="stu-card stu-card--active">
      <div className="stu-card-icon stu-card-icon--play">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </div>
      <div className="stu-card-body">
        <CardTags evaluation={evaluation} extra={<Tag tone="solid">En cours</Tag>} />
        <h3>{evaluation.title}</h3>
        <div className="stu-card-meta">
          {[
            evaluation.scheduled_start ? `Ouverte à ${timeFmt.format(new Date(evaluation.scheduled_start))}` : 'Session ouverte',
            `${evaluation.duration_minutes} min`,
          ].join(' · ')}
        </div>
        {total > 0 && (
          <div className="stu-card-progress">
            <span>Exercices enregistrés</span>
            <span>{answered} / {total}</span>
            <div
              className="stu-progress-bar"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={answered}
              aria-label="Exercices enregistrés"
            >
              <div className="stu-progress-fill" style={{ width: `${(answered / total) * 100}%` }} />
            </div>
          </div>
        )}
      </div>
      <div className="stu-card-right">
        <div className="stu-card-timer">
          <div className="stu-card-timer-label">Temps restant</div>
          <div className="stu-card-timer-value">
            {remaining != null ? formatDuration(remaining) : '-'}
          </div>
        </div>
        <Button onClick={() => navigate(`/epreuve/${evaluation.id}`)}>
          {answered > 0 ? "Reprendre l'épreuve" : "Commencer l'épreuve"}
        </Button>
      </div>
    </article>
  );
}

function DoneCard({ evaluation }) {
  const navigate = useNavigate();
  const state = doneState(evaluation);
  // Rendue en avance, la copie n'est consultable qu'à la clôture de la session.
  const viewable = evaluation.status !== 'running';
  const scored =
    evaluation.published && evaluation.score != null && evaluation.total_points > 0;
  const low = scored && evaluation.score / evaluation.total_points < 0.5;

  return (
    <article className="stu-card stu-card--done">
      <div
        className={`stu-card-icon ${evaluation.published ? 'stu-card-icon--done' : 'stu-card-icon--pending'}`}
      >
        {evaluation.published ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm1 11h-5v-2h3V6h2v7z"/></svg>
        )}
      </div>
      <div className="stu-card-body">
        <CardTags evaluation={evaluation} />
        <h3>{evaluation.title}</h3>
        <div className="stu-card-meta">
          {[
            evaluation.scheduled_start ? fmtDate(evaluation.scheduled_start) : null,
            evaluation.exercises_count ? plural(evaluation.exercises_count, 'exercice') : null,
            scored ? state.label : null,
          ]
            .filter(Boolean)
            .join(' · ') || '-'}
        </div>
      </div>
      <div className="stu-card-right">
        {scored ? (
          <div
            className={`stu-card-score ${low ? 'stu-card-score--low' : ''}`.trim()}
            aria-label={`Note : ${clean(evaluation.score)} sur ${clean(evaluation.total_points)}`}
          >
            <span className="stu-card-score-value">{clean(evaluation.score)}</span>
            <span className="stu-card-score-total">/ {clean(evaluation.total_points)}</span>
          </div>
        ) : (
          <Tag tone={state.tone}>{state.label}</Tag>
        )}
        <Button
          variant={evaluation.solutions_available ? 'primary' : 'secondary'}
          size="small"
          disabled={!viewable}
          title={viewable ? undefined : "Consultable après la clôture de l'épreuve"}
          onClick={() => navigate(`/mes-resultats/${evaluation.id}`)}
        >
          {evaluation.solutions_available ? 'Copie et corrigé' : 'Voir ma copie'}
        </Button>
      </div>
    </article>
  );
}

/**
 * Apprenant sans classe (jamais inscrit, ou retiré par son enseignant) : il ne
 * verra aucune épreuve tant qu'il n'a pas saisi le code d'une classe.
 */
function NoClassroom() {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (cleanJoinCode(code).length < 8) {
      setError('Saisissez le code donné par votre enseignant.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await api('/api/me/classrooms/join', {
        method: 'POST',
        body: { code: cleanJoinCode(code) },
      });
      await queryClient.invalidateQueries({ queryKey: ['my-classrooms'] });
      await queryClient.invalidateQueries({ queryKey: ['my-evaluations'] });
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="no-classroom" aria-labelledby="no-classroom-title">
      <div className="no-classroom-text">
        <h2 id="no-classroom-title">Vous n'appartenez à aucune classe</h2>
        <p className="sub">
          Vous ne verrez aucune épreuve tant que vous n'aurez pas rejoint une classe. Saisissez
          le code que votre enseignant vous a donné.
        </p>
      </div>
      <form className="no-classroom-form" onSubmit={onSubmit} noValidate>
        <Alert>{error}</Alert>
        <Field label="Code de la classe" id="no-class-code" hint="Par exemple 9E5G-97CJ-34DD">
          <input
            id="no-class-code"
            className="join-code-input"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={14}
            placeholder="XXXX-XXXX-XXXX"
            value={code}
            onChange={(e) => setCode(typeJoinCode(e.target.value))}
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? 'Inscription…' : 'Rejoindre la classe'}
        </Button>
      </form>
    </section>
  );
}

export default function StudentHomePage() {
  useDocumentTitle('Mes évaluations');
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const evaluations = useQuery({
    queryKey: ['my-evaluations'],
    queryFn: () => api('/api/me/evaluations'),
    refetchInterval: 30_000,
  });
  const classrooms = useQuery({
    queryKey: ['my-classrooms'],
    queryFn: () => api('/api/me/classrooms'),
  });
  const noClassroom = classrooms.isSuccess && classrooms.data.length === 0;
  const [tab, setTab] = useState(null);
  const [subject, setSubject] = useState(null);

  // Mémorisé : sans cela l'effet de `UpcomingCard` se redéclenche à chaque rendu
  // dès que le compte à rebours atteint zéro, et invalide la requête en boucle.
  const handleReady = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['my-evaluations'] });
  }, [queryClient]);

  const items = useMemo(() => evaluations.data ?? [], [evaluations.data]);
  const { running, upcoming, done } = useMemo(() => {
    const byStart = (a, b) => {
      const [x, y] = [startTime(a), startTime(b)];
      return x === y ? 0 : x < y ? -1 : 1;
    };
    return {
      running: items.filter((e) => e.status === 'running' && !e.submitted_at),
      upcoming: items.filter((e) => e.status === 'scheduled').sort(byStart),
      done: items.filter((e) => e.submitted_at || CLOSED.includes(e.status)),
    };
  }, [items]);

  if (evaluations.isPending) return <Loading variant="page" />;

  const graded = done.filter((e) => e.published && e.score != null && e.total_points > 0);
  const average = graded.length
    ? graded.reduce((sum, e) => sum + (e.score / e.total_points) * 20, 0) / graded.length
    : null;

  const todo = running.length + upcoming.length;
  const activeTab = tab ?? (todo > 0 || done.length === 0 ? 'todo' : 'done');
  const nextUp = upcoming[0];

  const subjects = [...new Set(done.map((e) => e.subject_name || SANS_MATIERE))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
  const shownDone = subject ? done.filter((e) => (e.subject_name || SANS_MATIERE) === subject) : done;

  let lead = 'Retrouvez vos épreuves en cours, à venir et terminées.';
  if (running.length > 0) {
    lead =
      running.length > 1
        ? `${running.length} épreuves sont ouvertes en ce moment.`
        : `« ${running[0].title} » est ouverte en ce moment.`;
  } else if (nextUp?.scheduled_start) {
    lead = `Prochaine épreuve : « ${nextUp.title} », ${dayLabel(nextUp.scheduled_start).toLowerCase()} à ${timeFmt.format(new Date(nextUp.scheduled_start))}.`;
  } else if (graded.length > 0) {
    lead = 'Aucune épreuve à venir. Relisez vos copies corrigées et leurs corrigés.';
  }

  return (
    <div className="stu-home">
      <header className="stu-home-header">
        <div className="stu-home-overline">
          {user?.full_name ? `Bonjour, ${user.full_name}` : 'Espace apprenant'}
        </div>
        <h1>Mes évaluations</h1>
        {!noClassroom && (
          <>
            <p className="sub">{lead}</p>
            <Link className="cd-link" to="/rejoindre">Rejoindre une autre classe avec un code</Link>
          </>
        )}
      </header>

      {noClassroom && <NoClassroom />}
      {evaluations.error && <Alert>{evaluations.error.message}</Alert>}

      {noClassroom && items.length === 0 ? null : items.length === 0 ? (
        <EmptyState title="Aucune évaluation prévue">
          Vos épreuves apparaîtront ici dès qu'un enseignant vous y aura inscrit. Il vous a
          donné un code ? <Link to="/rejoindre">Rejoignez sa classe</Link>.
        </EmptyState>
      ) : (
        <>
          <div className="stu-summary">
            <SummaryTile
              label="En cours"
              value={running.length}
              tone={running.length ? 'live' : undefined}
              hint={running.length ? 'à terminer maintenant' : 'aucune session ouverte'}
            />
            <SummaryTile
              label="À venir"
              value={upcoming.length}
              hint={nextUp?.scheduled_start ? `prochaine : ${dayLabel(nextUp.scheduled_start).toLowerCase()}` : 'rien de programmé'}
            />
            <SummaryTile
              label="Terminées"
              value={done.length}
              hint={`${graded.length} note${graded.length > 1 ? 's' : ''} publiée${graded.length > 1 ? 's' : ''}`}
            />
            <SummaryTile
              label="Moyenne"
              value={average === null ? '-' : `${clean(average)}/20`}
              tone={average !== null && average < 10 ? 'low' : undefined}
              hint={average === null ? 'aucune note publiée' : `sur ${plural(graded.length, 'copie')}`}
            />
          </div>

          <Tabs
            tabs={[
              { value: 'todo', label: 'À faire', count: todo },
              { value: 'done', label: 'Terminées', count: done.length },
            ]}
            value={activeTab}
            onChange={setTab}
          />

          {activeTab === 'todo' &&
            (todo === 0 ? (
              <EmptyState variant="done" title="Rien à faire pour l'instant">
                Aucune épreuve n'est ouverte ni programmée. Vos copies rendues sont dans l'onglet
                « Terminées ».
              </EmptyState>
            ) : (
              <>
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
                    {upcoming.map((evaluation, index) => (
                      <UpcomingCard
                        key={evaluation.id}
                        evaluation={evaluation}
                        onReady={handleReady}
                        next={index === 0 && running.length === 0}
                      />
                    ))}
                  </section>
                )}
              </>
            ))}

          {activeTab === 'done' &&
            (done.length === 0 ? (
              <EmptyState title="Aucune copie rendue">
                Vos épreuves terminées apparaîtront ici, avec leur note et leur corrigé dès que
                votre enseignant aura publié les résultats.
              </EmptyState>
            ) : (
              <>
                {subjects.length > 1 && (
                  <Chips
                    label="Matière :"
                    allLabel={`Toutes (${done.length})`}
                    value={subject}
                    onChange={setSubject}
                    options={subjects.map((name) => ({
                      value: name,
                      label: `${name} (${done.filter((e) => (e.subject_name || SANS_MATIERE) === name).length})`,
                    }))}
                  />
                )}
                <Paged items={shownDone} pageSize={15} resetKey={subject}>
                  {(page) =>
                    groupByWeek(page).map((week) => (
                      <section key={week.key} className="stu-section">
                        <h2 className="stu-section-title stu-week-title">
                          <span>{week.label}</span>
                          <span className="stu-week-count">{week.items.length}</span>
                        </h2>
                        {week.items.map((evaluation) => (
                          <DoneCard key={evaluation.id} evaluation={evaluation} />
                        ))}
                      </section>
                    ))
                  }
                </Paged>
              </>
            ))}
        </>
      )}
    </div>
  );
}
