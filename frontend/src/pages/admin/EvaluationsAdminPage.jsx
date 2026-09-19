import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useClassrooms } from '../../api/hooks';
import { useAdminEvaluations } from '../../api/admin';
import { Alert, Chips, EmptyState, Loading, PageHeader, Pagination, Status } from '../../components/ui';
import { EVAL_KIND_LABELS, STATUS_LABELS, STATUS_TONES, formatSchedule } from '../../format';

const STATUSES = ['draft', 'scheduled', 'running', 'corrected', 'validated', 'cancelled'];

/**
 * Toutes les épreuves de l'établissement, en lecture seule : l'administration
 * voit qui prépare quoi et pour quelle classe, sans entrer dans les copies.
 */
export default function EvaluationsAdminPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get('etat');
  const classroomId = params.get('classe');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const classrooms = useClassrooms();

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  const evaluations = useAdminEvaluations({ status, classroomId, q: debounced, page });

  function setParam(name, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
    setPage(1);
  }

  const items = evaluations.data?.items ?? [];

  return (
    <>
      <PageHeader breadcrumb="Supervision" title="Évaluations" />
      <Chips
        label="État"
        allLabel="Toutes"
        value={status}
        onChange={(value) => setParam('etat', value)}
        options={STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
      >
        <select
          className="select-inline"
          aria-label="Classe"
          value={classroomId ?? ''}
          onChange={(e) => setParam('classe', e.target.value)}
        >
          <option value="">Toutes les classes</option>
          {(classrooms.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <input
          type="search"
          className="search-input toolbar-end"
          aria-label="Rechercher une évaluation"
          placeholder="Titre"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </Chips>

      <div className="content">
        {evaluations.error && <Alert>{evaluations.error.message}</Alert>}
        {evaluations.isPending ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState title="Aucune évaluation">
            {status || classroomId || debounced
              ? 'Aucune évaluation ne correspond à ces filtres.'
              : 'Les épreuves préparées par les enseignants apparaîtront ici.'}
          </EmptyState>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Évaluation</th>
                    <th>Enseignant</th>
                    <th>Classe</th>
                    <th>Programmation</th>
                    <th className="num">Participants</th>
                    <th>État</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((ev) => (
                    <tr key={ev.id}>
                      <td>
                        <span className="cell-title">{ev.title}</span>
                        <span className="sub">
                          {[EVAL_KIND_LABELS[ev.kind], ev.subject_name].filter(Boolean).join(' · ')}
                        </span>
                      </td>
                      <td>{ev.teacher_name}</td>
                      <td>{ev.classroom_name ?? <span className="cell-muted">-</span>}</td>
                      <td className="sub">{formatSchedule(ev)}</td>
                      <td className="num">{ev.participants_count}</td>
                      <td>
                        <Status tone={STATUS_TONES[ev.status]}>{STATUS_LABELS[ev.status]}</Status>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={evaluations.data.page_size}
              total={evaluations.data.total}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
