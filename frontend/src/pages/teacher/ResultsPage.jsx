import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction, useEvaluation, useResults } from '../../api/hooks';
import { Alert, Button, EmptyState, Loading, PageHeader, Stat, Tag } from '../../components/ui';
import CopyDeck from '../../components/CopyDeck';
import { useAuth } from '../../auth';
import { RUN_LABELS, formatDateTime, formatDuration, formatScore } from '../../format';

const FILTERS = [
  { value: 'passed', label: 'Réussi' },
  { value: 'failed', label: 'Échoué' },
];

export default function ResultsPage() {
  const { evaluationId } = useParams();
  const navigate = useNavigate();
  const [runId, setRunId] = useState(null);
  const [filter, setFilter] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  /* Deux façons de reprendre un paquet : les feuilles, ou le relevé. */
  const [vue, setVue] = useState('copies');
  const { organization } = useAuth();
  const evaluation = useEvaluation(evaluationId);
  const results = useResults(evaluationId, runId);

  const relaunch = useAction(
    () => api(`/api/evaluations/${evaluationId}/corrections`, { method: 'POST' }),
    [['results', evaluationId], ['evaluation', evaluationId], ['evaluations']],
  );
  const validate = useAction(
    () => api(`/api/evaluations/${evaluationId}/validate`, { method: 'POST' }),
    [['results', evaluationId], ['evaluation', evaluationId], ['evaluations']],
  );

  /* Deux formats pour le même tableau : le CSV pour retraiter les notes, le
     classeur Excel pour l'archive : synthèse, détail par exercice, ajustements
     et incidents, chacun sur sa feuille. */
  async function exportResults(format) {
    try {
      const res = await api(`/api/evaluations/${evaluationId}/export.${format}`, { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `resultats-${evaluationId}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  if (evaluation.isPending || results.isPending) return <Loading />;
  if (results.error) return <div className="content"><Alert>{results.error.message}</Alert></div>;

  const { run, runs, participants, average, success_rate: successRate, best_score: best, total_points: total } = results.data;
  const rows = participants.filter((p) => {
    if (filter === 'passed' && p.status !== 'Réussi') return false;
    if (filter === 'failed' && p.status !== 'Échoué') return false;
    if (search && !`${p.full_name} ${p.matricule ?? ''}`.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });
  const busy = run && ['pending', 'running'].includes(run.status);
  const publiee = evaluation.data.status === 'validated';
  const annulee = evaluation.data.status === 'cancelled';

  function ouvrirCopie(participationId) {
    navigate(
      `/evaluations/${evaluationId}/resultats/${participationId}${runId ? `?run=${runId}` : ''}`,
    );
  }

  const copies = rows.map((p) => ({
    id: p.participation_id,
    heading: p.full_name,
    fields: [
      ['Matricule', p.matricule],
      ['Statut', p.status],
    ],
    score: p.final_score,
    total: p.max_score,
    lines: p.lines ?? [],
    meta: `${p.tests_passed}/${p.tests_total} tests · ${formatDuration(p.time_spent_seconds)}${
      p.adjusted ? ' · note ajustée' : ''
    }`,
  }));

  return (
    <>
      <PageHeader
        breadcrumb={`Évaluations / ${evaluation.data.title}`}
        title={`Résultats : ${evaluation.data.title}`}
      >
        <Button variant="secondary" onClick={() => exportResults('csv')} disabled={!run}>
          Exporter CSV
        </Button>
        <Button variant="secondary" onClick={() => exportResults('xlsx')} disabled={!run}>
          Exporter Excel
        </Button>
      </PageHeader>

      <div className="content">
        <Alert>{error ?? relaunch.error?.message ?? validate.error?.message}</Alert>
        {annulee && (
          <Alert tone="info">
            Épreuve annulée : les copies et les corrections restent consultables ici, mais elle
            ne compte plus dans les notes ni les moyennes des étudiants.
          </Alert>
        )}

        {!run && (
          <EmptyState
            title="Aucune correction lancée"
            action={
              <Button onClick={() => relaunch.mutateAsync().catch((e) => setError(e.message))}>
                Lancer la correction
              </Button>
            }
          >
            Les productions sont figées. Déclenchez la correction automatique pour obtenir les notes.
          </EmptyState>
        )}

        {run && (
          <>
            <div className="cards" style={{ marginBottom: 16 }}>
              <Stat label="Participants" value={participants.length} />
              <Stat label="Moyenne" value={average !== null ? formatScore(average, total) : '-'} />
              <Stat label="Taux de réussite" value={successRate !== null ? `${successRate} %` : '-'} />
              <Stat label="Meilleur score" value={best !== null ? formatScore(best, total) : '-'} />
            </div>

            <section className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Tag tone={busy ? 'purple' : 'success'}>{RUN_LABELS[run.status]}</Tag>
                <strong style={{ fontSize: 14 }}>
                  Campagne #{run.number} · lancée le {formatDateTime(run.created_at)}
                  {run.triggered_by_name ? ` par ${run.triggered_by_name}` : ''}
                </strong>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {runs.length > 1 && (
                    <select
                      aria-label="Campagne de correction"
                      value={runId ?? run.id}
                      onChange={(e) => setRunId(Number(e.target.value))}
                      style={{ height: 30, borderRadius: 8, border: '1px solid var(--border)', padding: '0 8px' }}
                    >
                      {runs.map((r) => (
                        <option key={r.id} value={r.id}>
                          Campagne #{r.number}
                        </option>
                      ))}
                    </select>
                  )}
                  <Button
                    variant="secondary"
                    size="small"
                    disabled={busy || annulee || relaunch.isPending}
                    onClick={() => relaunch.mutateAsync().catch((e) => setError(e.message))}
                  >
                    Relancer la correction
                  </Button>
                  <Button
                    size="small"
                    disabled={busy || annulee || evaluation.data.status === 'validated' || validate.isPending}
                    onClick={() => validate.mutateAsync().catch((e) => setError(e.message))}
                  >
                    {evaluation.data.status === 'validated'
                      ? 'Résultats publiés'
                      : 'Valider et publier les résultats'}
                  </Button>
                </div>
              </div>
              <p className="sub" style={{ marginTop: 8 }}>
                {evaluation.data.status === 'validated'
                  ? 'Les apprenants voient leur note et vos appréciations sur leur copie. '
                  : "Tant que les résultats ne sont pas publiés, les apprenants voient leur copie sans note ni appréciation. "}
                {run.processed} / {run.total} productions traitées ·{' '}
                {run.stats?.compile_errors ?? 0} erreurs de compilation ·{' '}
                {run.stats?.timeouts ?? 0} dépassements de temps ·{' '}
                {run.stats?.no_submission ?? 0} sans production
              </p>
            </section>
          </>
        )}
      </div>

      {run && (
        <>
          <div className="chip-bar">
            <span className="label">Vue :</span>
            <button
              type="button"
              className="chip"
              aria-pressed={vue === 'copies'}
              onClick={() => setVue('copies')}
            >
              Copies
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={vue === 'releve'}
              onClick={() => setVue('releve')}
            >
              Relevé
            </button>
            <span className="label" style={{ marginLeft: 8 }}>Filtrer :</span>
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className="chip"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(filter === f.value ? null : f.value)}
              >
                {f.label}
              </button>
            ))}
            <input
              aria-label="Rechercher un étudiant"
              placeholder="Rechercher un étudiant…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                marginLeft: 'auto',
                height: 30,
                borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border)',
                padding: '0 14px',
                fontSize: 13,
              }}
            />
          </div>

          {vue === 'copies' ? (
            <div className="content">
              {!publiee && (
                <p className="sub" style={{ marginBottom: 10 }}>
                  Les notes ci-dessous sont celles de la correction : elles n'apparaîtront sur la
                  copie de l'apprenant qu'une fois les résultats publiés.
                </p>
              )}
              <CopyDeck
                copies={copies}
                organization={`${organization ?? 'CodEval'} · ${evaluation.data.title}`}
                onOpen={(copie) => ouvrirCopie(copie.id)}
                emptyLabel="Aucune copie pour ce filtre."
              />
            </div>
          ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Étudiant</th>
                  <th>Matricule</th>
                  <th>Score</th>
                  <th>Tests</th>
                  <th>Temps passé</th>
                  <th>Statut</th>
                  <th>Détail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.participation_id}>
                    <td>{p.full_name}</td>
                    <td className="sub">{p.matricule ?? '-'}</td>
                    <td>
                      {formatScore(p.final_score, p.max_score)}
                      {p.adjusted && <span className="sub"> · ajustée</span>}
                    </td>
                    <td>
                      {p.tests_passed}/{p.tests_total}
                    </td>
                    <td>{formatDuration(p.time_spent_seconds)}</td>
                    <td>
                      <Tag tone={p.status === 'Réussi' ? 'success' : 'danger'}>{p.status}</Tag>
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() =>
                          navigate(
                            `/evaluations/${evaluationId}/resultats/${p.participation_id}${runId ? `?run=${runId}` : ''}`,
                          )
                        }
                      >
                        Ouvrir
                      </Button>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="sub" style={{ padding: 32, textAlign: 'center' }}>
                      Aucun résultat pour ce filtre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </>
      )}
    </>
  );
}
