import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useClassroomEvaluations } from '../../api/hooks';
import {
  Alert,
  Button,
  EmptyState,
  Loading,
  PageHeader,
  Segmented,
  Stat,
  Status,
  Tabs,
} from '../../components/ui';
import {
  EVAL_KIND_LABELS,
  STATUS_LABELS,
  STATUS_TONES,
  formatPercent,
  formatSchedule,
  primaryAction,
} from '../../format';
import { summarize } from '../../classroomSummary';

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

const EVAL_FILTERS = [
  { value: 'upcoming', label: 'À venir' },
  { value: 'running', label: 'En cours' },
  { value: 'done', label: 'Terminées' },
];

/**
 * Une classe : ses chiffres, ses épreuves, ses apprenants. Tout ce qui s'affiche
 * vient des données : pas de statistique inventée ni de bouton sans effet.
 * L'onglet vit dans l'URL, pour que « Retour » y ramène.
 */
export default function ClassDetailPage() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('onglet');
  const tab = ['apprenants', 'evaluations'].includes(requested) ? requested : 'apercu';
  const setTab = (value) =>
    setSearchParams(value === 'apercu' ? {} : { onglet: value }, { replace: true });

  const classroom = useQuery({
    queryKey: ['classroom', classroomId],
    queryFn: () => api(`/api/classrooms/${classroomId}`),
    enabled: Boolean(classroomId),
  });
  const students = useQuery({
    queryKey: ['classroom-students', classroomId],
    queryFn: () => api(`/api/classrooms/${classroomId}/students`),
    enabled: Boolean(classroomId),
  });
  const evaluations = useClassroomEvaluations(classroomId);

  if (classroom.isPending) return <Loading />;
  if (classroom.error) {
    return (
      <div className="content">
        <Alert>{classroom.error.message}</Alert>
      </div>
    );
  }

  const cls = classroom.data;
  const studentList = students.data ?? [];
  const evalList = evaluations.data?.items ?? [];
  const summary = summarize(evalList);
  const newEvaluation = () => navigate(`/evaluations/nouvelle?classe=${cls.id}`);

  return (
    <>
      <PageHeader
        breadcrumb={
          <>
            <Link to="/classes">Mes classes</Link>
            {' · '}
            {[cls.level, cls.subject_name].filter(Boolean).join(' · ') || 'Classe'}
          </>
        }
        title={cls.name}
      >
        <Button onClick={newEvaluation}>+ Nouvelle évaluation</Button>
      </PageHeader>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'apercu', label: "Vue d'ensemble" },
          { value: 'apprenants', label: 'Apprenants', count: cls.students_count },
          { value: 'evaluations', label: 'Évaluations', count: evalList.length },
        ]}
      />

      <div className="content">
        {evaluations.error && <Alert>{evaluations.error.message}</Alert>}

        {tab === 'apercu' && (
          <Overview
            classroom={cls}
            students={studentList}
            studentsPending={students.isPending}
            summary={summary}
            evaluationsCount={evalList.length}
            evaluationsPending={evaluations.isPending}
            onTab={setTab}
            onNew={newEvaluation}
          />
        )}

        {tab === 'apprenants' && (
          <StudentsTab
            students={studentList}
            pending={students.isPending}
            error={students.error}
          />
        )}

        {tab === 'evaluations' && (
          <EvaluationsTab
            evaluations={evalList}
            summary={summary}
            pending={evaluations.isPending}
            onNew={newEvaluation}
          />
        )}
      </div>
    </>
  );
}

function Overview({
  classroom,
  students,
  studentsPending,
  summary,
  evaluationsCount,
  evaluationsPending,
  onTab,
  onNew,
}) {
  const { running, upcoming, done, rated, successRate } = summary;
  const drafts = upcoming.filter((e) => e.status === 'draft').length;
  const roster = students.slice(0, 8);

  let upcomingHint = 'rien de prévu';
  if (drafts) upcomingHint = `dont ${plural(drafts, 'brouillon')} non publié${drafts > 1 ? 's' : ''}`;
  else if (upcoming.length) upcomingHint = 'toutes publiées';

  return (
    <div className="classe-apercu">
      <div className="stats">
        <Stat
          label="Apprenants"
          value={classroom.students_count}
          hint="Voir la liste"
          onClick={() => onTab('apprenants')}
        />
        <Stat
          label="Épreuves"
          value={evaluationsPending ? '…' : evaluationsCount}
          hint="Voir toutes les épreuves"
          onClick={() => onTab('evaluations')}
        />
        <Stat
          label="À venir"
          value={upcoming.length}
          hint={upcomingHint}
          tone={drafts ? 'attention' : undefined}
        />
        <Stat
          label="Réussite moyenne"
          value={formatPercent(successRate)}
          hint={
            rated.length
              ? `sur ${plural(rated.length, 'épreuve')} corrigée${rated.length > 1 ? 's' : ''}`
              : 'aucune épreuve corrigée'
          }
        />
      </div>

      <div className="classe-grille">
        <div className="classe-colonne">
          {running.length > 0 && (
            <section>
              <header className="section-head">
                <h2 className="section-title">En cours maintenant</h2>
              </header>
              <EvaluationList items={running} />
            </section>
          )}

          <section>
            <header className="section-head">
              <h2 className="section-title">À venir</h2>
              <button type="button" className="cd-link" onClick={onNew}>
                Préparer une épreuve
              </button>
            </header>
            {evaluationsPending ? (
              <Loading />
            ) : upcoming.length ? (
              <EvaluationList items={upcoming.slice(0, 5)} />
            ) : (
              <p className="sub classe-vide">Aucune épreuve prévue pour cette classe.</p>
            )}
          </section>

          <section>
            <header className="section-head">
              <h2 className="section-title">Derniers résultats</h2>
              {done.length > 4 && (
                <button type="button" className="cd-link" onClick={() => onTab('evaluations')}>
                  Tout voir
                </button>
              )}
            </header>
            {evaluationsPending ? (
              <Loading />
            ) : done.length ? (
              <EvaluationList items={done.slice(0, 4)} showRate />
            ) : (
              <p className="sub classe-vide">
                Les résultats apparaîtront ici après la première épreuve terminée.
              </p>
            )}
          </section>
        </div>

        <aside className="classe-aside">
          <header className="section-head">
            <h2 className="section-title">Apprenants</h2>
            <span className="section-count">{classroom.students_count}</span>
          </header>
          {studentsPending && <Loading />}
          {!studentsPending && students.length === 0 && (
            <p className="sub classe-vide">Aucun apprenant inscrit.</p>
          )}
          <ul className="classe-roster">
            {roster.map((student) => (
              <li key={student.id}>
                <span className="classe-roster-nom">{student.full_name}</span>
                <span className="sub mono">{student.matricule ?? student.email}</span>
              </li>
            ))}
          </ul>
          {students.length > 0 && (
            <button type="button" className="cd-link" onClick={() => onTab('apprenants')}>
              {students.length > roster.length
                ? `Voir les ${students.length} apprenants`
                : 'Voir la liste détaillée'}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

function SuccessMeter({ value }) {
  if (value === null || value === undefined) return <span className="sub">-</span>;
  return (
    <span className="classe-meter" title={`${formatPercent(value)} des points obtenus`}>
      <span className="classe-meter-barre" aria-hidden="true">
        <span style={{ width: `${Math.min(100, value)}%` }} />
      </span>
      <span className="classe-meter-valeur">{formatPercent(value)}</span>
    </span>
  );
}

function EvaluationList({ items, showRate = false }) {
  const navigate = useNavigate();
  return (
    <ul className="classe-evals">
      {items.map((evaluation) => {
        const action = primaryAction(evaluation);
        const rated = evaluation.success_rate !== null && evaluation.success_rate !== undefined;
        return (
          <li key={evaluation.id}>
            <div className="classe-evals-corps">
              <Link to={action.to} className="classe-evals-titre">
                {evaluation.title}
              </Link>
              <span className="sub">
                {[
                  EVAL_KIND_LABELS[evaluation.kind],
                  evaluation.scheduled_start ? formatSchedule(evaluation) : 'sans date',
                  evaluation.exercises_count
                    ? plural(evaluation.exercises_count, 'exercice')
                    : 'aucun exercice',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
            {showRate && rated ? (
              <SuccessMeter value={evaluation.success_rate} />
            ) : (
              <Status tone={STATUS_TONES[evaluation.status]}>
                {STATUS_LABELS[evaluation.status]}
              </Status>
            )}
            <Button variant="secondary" size="small" onClick={() => navigate(action.to)}>
              {action.label}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

function StudentsTab({ students, pending, error }) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const shown = query
    ? students.filter((s) =>
        `${s.full_name} ${s.matricule ?? ''} ${s.email}`.toLowerCase().includes(query),
      )
    : students;

  return (
    <section>
      <header className="section-head">
        <h2 className="section-title">Apprenants inscrits</h2>
        <span className="section-count">{students.length}</span>
        {students.length > 0 && (
          <input
            type="search"
            className="search-input"
            aria-label="Rechercher un apprenant"
            placeholder="Nom, matricule ou e-mail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </header>

      {error && <Alert>{error.message}</Alert>}
      {pending && <Loading />}

      {!pending && students.length === 0 && (
        <p className="sub classe-table-vide">Aucun apprenant inscrit dans cette classe.</p>
      )}
      {!pending && students.length > 0 && shown.length === 0 && (
        <p className="sub classe-table-vide">Aucun apprenant ne correspond à « {search} ».</p>
      )}

      {shown.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nom</th>
                <th>Matricule</th>
                <th>E-mail</th>
                <th>Compte</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((student) => (
                <tr key={student.id}>
                  <td>
                    <span className="cell-title">{student.full_name}</span>
                  </td>
                  <td className="mono">{student.matricule ?? '-'}</td>
                  <td className="cell-muted">{student.email}</td>
                  <td>
                    <Status tone={student.is_active ? 'success' : 'neutral'}>
                      {student.is_active ? 'Actif' : 'Désactivé'}
                    </Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EvaluationsTab({ evaluations, summary, pending, onNew }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState(null);
  const groups = { upcoming: summary.upcoming, running: summary.running, done: summary.done };
  const rows = filter ? groups[filter] : evaluations;

  if (pending) return <Loading />;

  if (evaluations.length === 0) {
    return (
      <EmptyState
        title="Aucune épreuve pour cette classe"
        action={<Button onClick={onNew}>+ Nouvelle évaluation</Button>}
      >
        Préparez une évaluation : elle sera affectée d'office à cette classe.
      </EmptyState>
    );
  }

  return (
    <section>
      <header className="section-head">
        <h2 className="section-title">Épreuves de la classe</h2>
        <Segmented
          label="Filtrer les épreuves"
          allLabel="Toutes"
          value={filter}
          onChange={setFilter}
          options={EVAL_FILTERS.map((option) => ({
            ...option,
            count: groups[option.value].length,
          }))}
        />
      </header>

      {rows.length === 0 ? (
        <p className="sub classe-table-vide">Aucune épreuve dans cette catégorie.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Épreuve</th>
                <th>Date</th>
                <th>Statut</th>
                <th className="num">Participants</th>
                <th>Réussite</th>
                <th aria-label="Action" />
              </tr>
            </thead>
            <tbody>
              {rows.map((evaluation) => {
                const action = primaryAction(evaluation);
                return (
                  <tr
                    key={evaluation.id}
                    className="row-link"
                    onClick={() => navigate(action.to)}
                  >
                    <td>
                      <span className="cell-title">{evaluation.title}</span>
                      <span className="sub">
                        {EVAL_KIND_LABELS[evaluation.kind]} ·{' '}
                        {plural(evaluation.exercises_count, 'exercice')}
                      </span>
                    </td>
                    <td className="cell-muted">
                      {evaluation.scheduled_start ? formatSchedule(evaluation) : 'sans date'}
                    </td>
                    <td>
                      <Status tone={STATUS_TONES[evaluation.status]}>
                        {STATUS_LABELS[evaluation.status]}
                      </Status>
                    </td>
                    <td className="num">{evaluation.participants_count}</td>
                    <td>
                      <SuccessMeter value={evaluation.success_rate} />
                    </td>
                    <td className="actions">
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(action.to);
                        }}
                      >
                        {action.label}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
