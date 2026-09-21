import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction, useEvaluation, useResults } from '../../api/hooks';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Loading,
  Menu,
  PageHeader,
  Segmented,
  Stat,
  Status,
} from '../../components/ui';
import CopyDeck from '../../components/CopyDeck';
import { useAuth } from '../../auth';
import {
  EVAL_KIND_LABELS,
  RUN_LABELS,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatScore,
} from '../../format';

/*
 * Les résultats d'une épreuve se lisent comme un parcours : l'épreuve est
 * terminée, la machine corrige, l'enseignant vérifie, puis publie. Le fil
 * d'étapes dit où l'on en est, le bouton principal fait l'étape suivante, et
 * le reste de la page sert la vérification : la répartition des notes, puis
 * les copies.
 */

const SORTS = [
  { value: 'name', label: 'Nom (A → Z)' },
  { value: 'score-desc', label: 'Note décroissante' },
  { value: 'score-asc', label: 'Note croissante' },
];

const num = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
const ratio = (p) => (p.max_score > 0 ? p.final_score / p.max_score : 0);

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/* ─────────────── Fil d'étapes ─────────────── */

function stepsOf({ run, busy, published, adjusted }) {
  const corrected = Boolean(run) && !busy;
  return [
    { key: 'closed', label: 'Épreuve terminée', state: 'done' },
    {
      key: 'run',
      label: 'Correction automatique',
      state: corrected ? 'done' : 'current',
      detail: !run ? 'À lancer' : busy ? `${run.processed} / ${run.total} copies` : RUN_LABELS[run.status],
    },
    {
      key: 'review',
      label: 'Vérification',
      state: published ? 'done' : corrected ? 'current' : 'todo',
      detail: adjusted > 0 ? `${adjusted} note${adjusted > 1 ? 's' : ''} ajustée${adjusted > 1 ? 's' : ''}` : 'Relire, ajuster',
    },
    {
      key: 'publish',
      label: 'Publication',
      state: published ? 'done' : 'todo',
      detail: published ? 'Visible des apprenants' : 'Notes masquées',
    },
  ];
}

function Stepper({ steps }) {
  return (
    <ol className="rs-steps" aria-label="Avancement">
      {steps.map((step, index) => (
        <li key={step.key} className={`rs-step rs-step--${step.state}`} aria-current={step.state === 'current' ? 'step' : undefined}>
          <span className="rs-step-mark" aria-hidden="true">
            {step.state === 'done' ? (
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 8.5l3 3 6-6.5" />
              </svg>
            ) : (
              index + 1
            )}
          </span>
          <span className="rs-step-text">
            <strong>{step.label}</strong>
            {step.detail && <small>{step.detail}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ─────────────── Répartition des notes ─────────────── */

/**
 * Dix tranches de 10 % de la note maximale. Sous la moitié, la barre prend la
 * teinte de l'échec : on voit d'un coup d'œil de quel côté penche la classe.
 */
function Distribution({ participants, total, onPick, picked }) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ index: i, items: [] }));
  for (const p of participants) {
    const i = Math.min(9, Math.floor(ratio(p) * 10));
    bins[i].items.push(p);
  }
  const peak = Math.max(1, ...bins.map((b) => b.items.length));
  const step = total / 10;

  return (
    <figure className="rs-dist">
      <figcaption>
        <span>Répartition des notes</span>
        {picked !== null && (
          <button type="button" className="rs-dist-reset" onClick={() => onPick(null)}>
            Toutes les tranches
          </button>
        )}
      </figcaption>
      <div className="rs-dist-bars">
        {bins.map((bin) => {
          const count = bin.items.length;
          const from = num(bin.index * step);
          const to = num((bin.index + 1) * step);
          return (
            <button
              key={bin.index}
              type="button"
              className={`rs-dist-bar ${bin.index < 5 ? 'is-low' : ''} ${picked === bin.index ? 'is-picked' : ''}`.trim()}
              disabled={count === 0}
              aria-pressed={picked === bin.index}
              aria-label={`De ${from} à ${to} : ${count} copie${count > 1 ? 's' : ''}`}
              title={`${from} à ${to} : ${count} copie${count > 1 ? 's' : ''}`}
              onClick={() => onPick(picked === bin.index ? null : bin.index)}
            >
              <span className="rs-dist-count">{count > 0 ? count : ''}</span>
              <span className="rs-dist-fill" style={{ height: `${(count / peak) * 100}%` }} />
            </button>
          );
        })}
      </div>
      <div className="rs-dist-axis" aria-hidden="true">
        <span>0</span>
        <span>{num(total / 2)}</span>
        <span>{num(total)}</span>
      </div>
    </figure>
  );
}

/* ─────────────── Relevé ─────────────── */

function ScoreCell({ p }) {
  const r = ratio(p);
  return (
    <span className={`rs-score ${r < 0.5 ? 'is-low' : ''}`.trim()}>
      <span className="rs-score-track" aria-hidden="true">
        <span style={{ width: `${Math.round(r * 100)}%` }} />
      </span>
      <span className="rs-score-value">
        {formatScore(p.final_score, p.max_score)}
        {p.adjusted && <span className="rs-adjusted" title="Note ajustée à la main">ajustée</span>}
      </span>
    </span>
  );
}

function Releve({ rows, onOpen, sort, onSort }) {
  const scoreSort = sort === 'score-desc' ? 'descending' : sort === 'score-asc' ? 'ascending' : 'none';
  return (
    <div className="table-wrap rs-table">
      <table>
        <thead>
          <tr>
            <th aria-sort={sort === 'name' ? 'ascending' : 'none'}>
              <button type="button" className="rs-th-sort" onClick={() => onSort('name')}>
                Étudiant
              </button>
            </th>
            <th aria-sort={scoreSort}>
              <button
                type="button"
                className="rs-th-sort"
                onClick={() => onSort(sort === 'score-desc' ? 'score-asc' : 'score-desc')}
              >
                Note {scoreSort === 'descending' ? '↓' : scoreSort === 'ascending' ? '↑' : ''}
              </button>
            </th>
            <th className="num">Tests</th>
            <th className="num">Temps passé</th>
            <th>Statut</th>
            <th aria-label="Ouvrir" />
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.participation_id} className="rs-row" onClick={() => onOpen(p.participation_id)}>
              <td>
                <button
                  type="button"
                  className="rs-name"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpen(p.participation_id);
                  }}
                >
                  {p.full_name}
                </button>
                <span className="sub">{p.matricule ?? 'Sans matricule'}</span>
              </td>
              <td>
                <ScoreCell p={p} />
              </td>
              <td className="num">
                {p.tests_passed}/{p.tests_total}
              </td>
              <td className="num">{formatDuration(p.time_spent_seconds)}</td>
              <td>
                <Status tone={p.status === 'Réussi' ? 'success' : 'danger'}>{p.status}</Status>
              </td>
              <td className="actions">
                <span className="rs-chevron" aria-hidden="true">›</span>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="sub" style={{ padding: 32, textAlign: 'center' }}>
                Aucune copie pour ce filtre.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────── Page ─────────────── */

export default function ResultsPage() {
  const { evaluationId } = useParams();
  const navigate = useNavigate();
  const [runId, setRunId] = useState(null);
  const [filter, setFilter] = useState(null);
  const [bin, setBin] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const [error, setError] = useState(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
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

  const participants = useMemo(() => results.data?.participants ?? [], [results.data]);

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = participants.filter((p) => {
      if (filter === 'passed' && p.status !== 'Réussi') return false;
      if (filter === 'failed' && p.status !== 'Échoué') return false;
      if (filter === 'adjusted' && !p.adjusted) return false;
      if (bin !== null && Math.min(9, Math.floor(ratio(p) * 10)) !== bin) return false;
      if (query && !`${p.full_name} ${p.matricule ?? ''}`.toLowerCase().includes(query)) return false;
      return true;
    });
    const byName = (a, b) => a.full_name.localeCompare(b.full_name, 'fr');
    if (sort === 'score-desc') return list.sort((a, b) => ratio(b) - ratio(a) || byName(a, b));
    if (sort === 'score-asc') return list.sort((a, b) => ratio(a) - ratio(b) || byName(a, b));
    return list.sort(byName);
  }, [participants, filter, bin, search, sort]);

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

  if (evaluation.isPending || results.isPending) return <Loading variant="page" />;
  if (results.error) return <div className="content"><Alert>{results.error.message}</Alert></div>;

  const { run, runs, average, success_rate: successRate, best_score: best, total_points: total } = results.data;
  const ev = evaluation.data;
  const busy = run && ['pending', 'running'].includes(run.status);
  const publiee = ev.status === 'validated';
  const annulee = ev.status === 'cancelled';
  const passed = participants.filter((p) => p.status === 'Réussi').length;
  const failed = participants.filter((p) => p.status === 'Échoué').length;
  const adjusted = participants.filter((p) => p.adjusted).length;
  const scores = participants.map((p) => p.final_score);
  const lowest = scores.length ? Math.min(...scores) : null;
  const med = median(scores);

  const lancer = () => relaunch.mutateAsync().catch((e) => setError(e.message));
  const publier = () =>
    validate
      .mutateAsync()
      .then(() => setConfirmPublish(false))
      .catch((e) => {
        setConfirmPublish(false);
        setError(e.message);
      });

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

  /* Le bouton principal fait l'étape suivante du parcours, et rien d'autre. */
  let primary = null;
  if (annulee) {
    // Une épreuve annulée se consulte, elle ne se corrige ni ne se publie.
  } else if (!run) primary = <Button onClick={lancer} disabled={relaunch.isPending}>Lancer la correction</Button>;
  else if (busy) primary = <Button disabled>Correction en cours…</Button>;
  else if (!publiee)
    primary = (
      <Button onClick={() => setConfirmPublish(true)} disabled={validate.isPending}>
        Publier les résultats
      </Button>
    );

  const meta = [
    ev.classroom_name,
    ev.subject_name,
    EVAL_KIND_LABELS[ev.kind],
    ev.scheduled_start ? formatDateTime(ev.scheduled_start) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <PageHeader
        breadcrumb={
          <>
            <Link to="/evaluations?onglet=corrected">Évaluations</Link> / Résultats
          </>
        }
        title={ev.title}
        meta={
          <>
            {meta}
            {publiee && (
              <Status tone="success" className="rs-published">
                Publiés{ev.validated_at ? ` le ${formatDateTime(ev.validated_at)}` : ''}
              </Status>
            )}
          </>
        }
      >
        <Menu
          trigger="Exporter"
          items={[
            { label: 'Tableur CSV', onClick: () => exportResults('csv'), disabled: !run },
            { label: 'Classeur Excel (détaillé)', onClick: () => exportResults('xlsx'), disabled: !run },
          ]}
        />
        {primary}
        {run && !annulee && (
          <Menu
            label="Correction"
            items={[
              { label: 'Relancer la correction', onClick: lancer, disabled: busy || relaunch.isPending },
              ...(runs.length > 1
                ? [
                    'separator',
                    ...runs.map((r) => ({
                      label: `${r.id === run.id ? '✓ ' : ''}Campagne n° ${r.number}`,
                      onClick: () => setRunId(r.id),
                    })),
                  ]
                : []),
            ]}
          />
        )}
      </PageHeader>

      <div className="content rs-page">
        <Alert>{error ?? relaunch.error?.message ?? validate.error?.message}</Alert>
        {annulee && (
          <Alert tone="info">
            Épreuve annulée : les copies et les corrections restent consultables ici, mais elle
            ne compte plus dans les notes ni les moyennes des étudiants.
          </Alert>
        )}

        {!annulee && <Stepper steps={stepsOf({ run, busy, published: publiee, adjusted })} />}

        {!run && (
          <EmptyState
            title="Aucune correction lancée"
            action={
              annulee ? null : (
                <Button onClick={lancer} disabled={relaunch.isPending}>
                  Lancer la correction
                </Button>
              )
            }
          >
            Les productions sont figées. Déclenchez la correction automatique pour obtenir les
            notes : vous pourrez les relire et les ajuster avant de les publier.
          </EmptyState>
        )}

        {run && (
          <>
            <div className="rs-summary">
              <div className="stats rs-stats">
                <Stat
                  label="Moyenne"
                  value={average !== null ? formatScore(average, total) : '-'}
                  tone={average !== null && total > 0 && average / total < 0.5 ? 'low' : undefined}
                  hint={med !== null ? `médiane ${num(med)}` : undefined}
                />
                <Stat
                  label="Réussite"
                  value={successRate !== null ? formatPercent(successRate) : '-'}
                  hint={`${passed} réussie${passed > 1 ? 's' : ''} sur ${participants.length}`}
                />
                <Stat
                  label="Meilleure note"
                  value={best !== null ? formatScore(best, total) : '-'}
                  hint={lowest !== null ? `plus basse ${num(lowest)}` : undefined}
                />
                <Stat
                  label="Copies"
                  value={participants.length}
                  hint={adjusted > 0 ? `${adjusted} ajustée${adjusted > 1 ? 's' : ''}` : 'aucune ajustée'}
                />
              </div>
              {participants.length > 0 && (
                <Distribution participants={participants} total={total} picked={bin} onPick={setBin} />
              )}
            </div>
          </>
        )}
      </div>

      {run && (
        <>
          <div className="chip-bar rs-toolbar">
            <Segmented
              label="Affichage"
              value={vue}
              onChange={(v) => setVue(v ?? vue)}
              options={[
                { value: 'copies', label: 'Copies' },
                { value: 'releve', label: 'Relevé' },
              ]}
            />
            <Segmented
              label="Filtrer"
              value={filter}
              onChange={setFilter}
              allLabel={`Toutes ${participants.length}`}
              options={[
                { value: 'passed', label: 'Réussies', count: passed },
                { value: 'failed', label: 'Échouées', count: failed },
                ...(adjusted > 0 ? [{ value: 'adjusted', label: 'Ajustées', count: adjusted }] : []),
              ]}
            />
            <div className="toolbar-end rs-toolbar-end">
              <select
                className="select-inline"
                aria-label="Trier"
                value={sort}
                onChange={(e) => setSort(e.target.value)}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="search"
                className="search-input"
                aria-label="Rechercher un étudiant"
                placeholder="Nom ou matricule…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {(bin !== null || filter || search) && (
            <p className="rs-filter-note">
              {rows.length} copie{rows.length > 1 ? 's' : ''} sur {participants.length}
              <button
                type="button"
                className="rs-dist-reset"
                onClick={() => {
                  setBin(null);
                  setFilter(null);
                  setSearch('');
                }}
              >
                Tout afficher
              </button>
            </p>
          )}

          {vue === 'copies' ? (
            <div className="content">
              <CopyDeck
                copies={copies}
                organization={`${organization ?? 'CodEval'} · ${ev.title}`}
                onOpen={(copie) => ouvrirCopie(copie.id)}
                emptyLabel="Aucune copie pour ce filtre."
              />
            </div>
          ) : (
            <Releve
              rows={rows}
              onOpen={ouvrirCopie}
              sort={sort}
              onSort={setSort}
            />
          )}
        </>
      )}

      <Dialog
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        title="Publier les résultats ?"
        description="Chaque apprenant verra sa note et vos appréciations sur sa copie."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmPublish(false)}>
              Continuer la vérification
            </Button>
            <Button onClick={publier} disabled={validate.isPending}>
              {validate.isPending ? 'Publication…' : 'Publier'}
            </Button>
          </>
        }
      >
        <ul className="rs-confirm">
          <li>
            <span>Copies</span>
            <strong>{participants.length}</strong>
          </li>
          <li>
            <span>Moyenne</span>
            <strong>{average !== null ? formatScore(average, total) : '-'}</strong>
          </li>
          <li>
            <span>Réussite</span>
            <strong>{successRate !== null ? formatPercent(successRate) : '-'}</strong>
          </li>
          <li>
            <span>Notes ajustées</span>
            <strong>{adjusted}</strong>
          </li>
        </ul>
      </Dialog>
    </>
  );
}
