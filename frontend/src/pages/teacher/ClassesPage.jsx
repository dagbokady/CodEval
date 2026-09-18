import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useClassroomEvaluations, useClassrooms } from '../../api/hooks';
import { Alert, Button, EmptyState, Loading, PageHeader, Status } from '../../components/ui';
import { STATUS_LABELS, formatPercent, formatSchedule, primaryAction } from '../../format';
import { summarize } from '../../classroomSummary';

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/**
 * Les classes de l'enseignant, en tableau : une ligne par classe, qui répond
 * aux questions qu'on se pose en arrivant (combien d'apprenants, où en sont
 * les épreuves, quelle est la prochaine). La ligne ouvre la classe ; le seul
 * autre geste courant, lui préparer une évaluation, reste au bout de la ligne.
 */
export default function ClassesPage() {
  const navigate = useNavigate();
  const classrooms = useClassrooms();
  const evaluations = useClassroomEvaluations();
  const [search, setSearch] = useState('');

  const byClassroom = useMemo(() => {
    const map = new Map();
    for (const evaluation of evaluations.data?.items ?? []) {
      if (!evaluation.classroom_id) continue;
      map.set(evaluation.classroom_id, [...(map.get(evaluation.classroom_id) ?? []), evaluation]);
    }
    return map;
  }, [evaluations.data]);

  if (classrooms.isPending) return <Loading />;

  const list = classrooms.data ?? [];
  const query = search.trim().toLowerCase();
  const shown = query
    ? list.filter((c) => `${c.name} ${c.level ?? ''}`.toLowerCase().includes(query))
    : list;
  const students = list.reduce((sum, c) => sum + (c.students_count ?? 0), 0);

  return (
    <>
      <PageHeader breadcrumb="Espace enseignant" title="Mes classes">
        {list.length > 0 && (
          <Button onClick={() => navigate('/evaluations/nouvelle')}>+ Nouvelle évaluation</Button>
        )}
      </PageHeader>

      <div className="content">
        {classrooms.error && <Alert>{classrooms.error.message}</Alert>}

        {!classrooms.error && list.length === 0 ? (
          <EmptyState title="Aucune classe">
            Les classes et leurs effectifs sont préparés à l'ouverture de l'année. Elles
            apparaîtront ici dès qu'on vous en aura confié une.
          </EmptyState>
        ) : (
          <>
            <div className="section-head">
              <p className="sub">
                {plural(list.length, 'classe')} · {plural(students, 'apprenant')}
              </p>
              {list.length > 6 && (
                <input
                  type="search"
                  className="search-input"
                  aria-label="Rechercher une classe"
                  placeholder="Rechercher une classe"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              )}
            </div>

            {shown.length === 0 ? (
              <p className="sub">Aucune classe ne correspond à « {search} ».</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Classe</th>
                      <th className="num">Apprenants</th>
                      <th className="num">Épreuves</th>
                      <th className="num">Réussite moy.</th>
                      <th>Prochaine épreuve</th>
                      <th aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((classroom) => (
                      <ClassRow
                        key={classroom.id}
                        classroom={classroom}
                        evaluations={byClassroom.get(classroom.id) ?? []}
                        loading={evaluations.isPending}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function ClassRow({ classroom, evaluations, loading }) {
  const navigate = useNavigate();
  const { running, upcoming, done, successRate } = summarize(evaluations);
  const next = running[0] ?? upcoming[0];
  const to = `/classes/${classroom.id}`;

  let prochaine;
  if (next) {
    prochaine = (
      <>
        <Link className="cell-title" to={primaryAction(next).to} onClick={(e) => e.stopPropagation()}>
          {next.title}
        </Link>
        {next.status === 'running' ? (
          <Status tone="live">En cours</Status>
        ) : (
          <span className="sub">
            {next.scheduled_start
              ? formatSchedule(next)
              : `${STATUS_LABELS[next.status]} · sans date`}
          </span>
        )}
      </>
    );
  } else {
    prochaine = (
      <span className="cell-muted">
        {loading
          ? 'Chargement…'
          : done.length
            ? `Rien de prévu · ${plural(done.length, 'épreuve')} terminée${done.length > 1 ? 's' : ''}`
            : 'Aucune épreuve'}
      </span>
    );
  }

  return (
    <tr className="row-link" onClick={() => navigate(to)}>
      <td>
        <Link className="cell-title" to={to} onClick={(e) => e.stopPropagation()}>
          {classroom.name}
        </Link>
        <span className="sub">{classroom.level ?? 'Classe'}</span>
      </td>
      <td className="num">{classroom.students_count}</td>
      <td className="num">{loading ? '…' : evaluations.length}</td>
      <td className="num">{formatPercent(successRate)}</td>
      <td>{prochaine}</td>
      <td className="actions">
        <Button
          variant="secondary"
          size="small"
          onClick={(event) => {
            event.stopPropagation();
            navigate(`/evaluations/nouvelle?classe=${classroom.id}`);
          }}
        >
          Nouvelle évaluation
        </Button>
      </td>
    </tr>
  );
}
