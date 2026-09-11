import { useAuth } from '../../auth';
import { useEvaluations } from '../../api/hooks';
import { EmptyState, Loading, PageHeader, Tag } from '../../components/ui';
import { STATUS_LABELS, STATUS_TONES, formatSchedule } from '../../format';

export default function StatsPage() {
  const { organization } = useAuth();
  const evaluations = useEvaluations({ group: 'corrected', page: 1 });

  return (
    <>
      <PageHeader breadcrumb={organization} title="Statistiques" />
      <div className="content">
        <h2 style={{ fontSize: 15, marginBottom: 10 }}>Évaluations corrigées</h2>
        {evaluations.isPending && <Loading />}
        {evaluations.data?.items.length === 0 && (
          <EmptyState title="Aucune évaluation corrigée">
            Les indicateurs apparaîtront dès la première campagne de correction terminée.
          </EmptyState>
        )}
        {evaluations.data?.items.length > 0 && (
          <div className="table-wrap" style={{ borderRadius: 12, border: '1px solid var(--border-soft)' }}>
            <table>
              <thead>
                <tr>
                  <th>Évaluation</th>
                  <th>Classe</th>
                  <th>Participants</th>
                  <th>Programmation</th>
                  <th>Réussite</th>
                  <th>Statut</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.data.items.map((evaluation) => (
                  <tr key={evaluation.id}>
                    <td>{evaluation.title}</td>
                    <td className="sub">{evaluation.classroom_name ?? '—'}</td>
                    <td>{evaluation.participants_count}</td>
                    <td className="sub">{formatSchedule(evaluation)}</td>
                    <td>{evaluation.success_rate !== null ? `${evaluation.success_rate} %` : '—'}</td>
                    <td>
                      <Tag tone={STATUS_TONES[evaluation.status]}>
                        {STATUS_LABELS[evaluation.status]}
                      </Tag>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
