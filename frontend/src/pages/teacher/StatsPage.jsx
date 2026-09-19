import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useEvaluations } from '../../api/hooks';
import { EmptyState, Loading, PageHeader, Tag } from '../../components/ui';
import { STATUS_LABELS, STATUS_TONES, formatSchedule } from '../../format';

function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function SuccessBar({ rate, label }) {
  const color = rate >= 60 ? 'var(--green)' : rate >= 40 ? 'var(--amber)' : 'var(--red)';
  return (
    <div className="success-bar-row">
      <span className="success-bar-label">{label}</span>
      <div className="success-bar-track">
        <div className="success-bar-fill" style={{ width: `${Math.min(rate, 100)}%`, background: color }} />
      </div>
      <span className="success-bar-value">{rate} %</span>
    </div>
  );
}

export default function StatsPage() {
  const evaluations = useEvaluations({ group: 'corrected', page: 1 });
  const items = evaluations.data?.items ?? [];

  const stats = useMemo(() => {
    if (!items.length) return null;
    const withRate = items.filter((e) => e.success_rate !== null && e.success_rate !== undefined);
    const totalParticipants = items.reduce((s, e) => s + (e.participants_count ?? 0), 0);
    const avgRate = withRate.length
      ? Math.round(withRate.reduce((s, e) => s + e.success_rate, 0) / withRate.length * 10) / 10
      : null;
    const bestEval = withRate.length
      ? withRate.reduce((best, e) => (e.success_rate > best.success_rate ? e : best))
      : null;
    const worstEval = withRate.length
      ? withRate.reduce((worst, e) => (e.success_rate < worst.success_rate ? e : worst))
      : null;
    return { count: items.length, totalParticipants, avgRate, bestEval, worstEval, withRate };
  }, [items]);

  return (
    <>
      <PageHeader breadcrumb="Espace enseignant" title="Statistiques" />
      <div className="content">
        {evaluations.isPending && <Loading />}
        {!evaluations.isPending && !items.length && (
          <EmptyState title="Aucune évaluation corrigée">
            Les indicateurs apparaitront des la premiere campagne de correction terminee.
          </EmptyState>
        )}
        {stats && (
          <>
            <div className="stats-grid">
              <StatCard label="Evaluations corrigees" value={stats.count} />
              <StatCard label="Participants total" value={stats.totalParticipants} />
              <StatCard
                label="Taux de reussite moyen"
                value={stats.avgRate !== null ? `${stats.avgRate} %` : '-'}
              />
              <StatCard
                label="Meilleure reussite"
                value={stats.bestEval ? `${stats.bestEval.success_rate} %` : '-'}
                sub={stats.bestEval?.title}
              />
            </div>

            {stats.withRate.length > 0 && (
              <section style={{ marginTop: 24 }}>
                <h2 style={{ fontSize: 15, marginBottom: 12 }}>Taux de reussite par evaluation</h2>
                <div className="success-bars">
                  {stats.withRate
                    .sort((a, b) => b.success_rate - a.success_rate)
                    .map((e) => (
                      <SuccessBar key={e.id} rate={e.success_rate} label={e.title} />
                    ))}
                </div>
              </section>
            )}

            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 15, marginBottom: 10 }}>Detail des evaluations</h2>
              <div className="table-wrap" style={{ borderRadius: 12, border: '1px solid var(--border-soft)' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Evaluation</th>
                      <th>Classe</th>
                      <th>Participants</th>
                      <th>Programmation</th>
                      <th>Reussite</th>
                      <th>Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((evaluation) => (
                      <tr key={evaluation.id}>
                        <td>
                          <Link to={`/evaluations/${evaluation.id}/resultats`} className="text-link">
                            {evaluation.title}
                          </Link>
                        </td>
                        <td className="sub">{evaluation.classroom_name ?? '-'}</td>
                        <td>{evaluation.participants_count}</td>
                        <td className="sub">{formatSchedule(evaluation)}</td>
                        <td>{evaluation.success_rate !== null ? `${evaluation.success_rate} %` : '-'}</td>
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
            </section>
          </>
        )}
      </div>
    </>
  );
}
