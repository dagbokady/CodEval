import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStats } from '../../api/hooks';
import { Alert, EmptyState, Loading, PageHeader, Pagination, Segmented, Stat } from '../../components/ui';
import { usePagination } from '../../usePagination';

const PASS = 10;
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const grade = (n) => (n == null ? '-' : n.toLocaleString('fr-FR', { maximumFractionDigits: 1 }));
const percent = (n) => (n == null ? '-' : `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} %`);
const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** Largeur réelle du conteneur : les graphiques se dessinent à la bonne taille. */
function useWidth() {
  // Une ref-callback : le conteneur peut n'apparaître qu'après coup (filtre).
  const [node, setNode] = useState(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width];
}

/**
 * Statistiques de l'enseignant. D'abord la réponse à « où en sont mes
 * apprenants ? » (quatre chiffres), puis le pourquoi : l'évolution des
 * moyennes, la répartition des notes, et les apprenants à accompagner. Le
 * détail par classe et par épreuve vient en dernier, pour qui veut creuser.
 */
export default function StatsPage() {
  const [classroom, setClassroom] = useState(null);
  const stats = useStats(classroom);
  const data = stats.data;

  const options = data?.classroom_options ?? [];
  const filter = options.length > 1 && (
    <Segmented
      label="Classe"
      allLabel="Toutes les classes"
      options={options.map((c) => ({ value: c.id, label: c.name }))}
      value={classroom}
      onChange={setClassroom}
    />
  );

  return (
    <>
      <PageHeader breadcrumb="Espace enseignant" title="Statistiques" />
      <div className="content stats-page">
        {stats.isPending && <Loading variant="page" />}
        {stats.error && <Alert>{stats.error.message}</Alert>}
        {data && data.copies_count === 0 && !classroom && (
          <EmptyState title="Pas encore de copie corrigée">
            Les statistiques apparaîtront dès qu'une première épreuve aura été corrigée.
          </EmptyState>
        )}
        {data && (data.copies_count > 0 || classroom) && (
          <>
            {filter && <div className="stats-filter">{filter}</div>}

            <div className="stats stats-kpis">
              <Stat
                label="Moyenne générale"
                value={<>{grade(data.average)}<small> / 20</small></>}
                hint={`Médiane ${grade(data.median)}`}
                tone={data.average != null && data.average < PASS ? 'low' : undefined}
              />
              <Stat
                label="Taux de réussite"
                value={percent(data.success_rate)}
                hint="Copies à 10 ou plus"
              />
              <Stat
                label="Copies corrigées"
                value={data.copies_count}
                hint={`${plural(data.evaluations_count, 'épreuve')} · ${plural(data.students_count, 'apprenant')}`}
              />
              <Stat
                label="À accompagner"
                value={data.at_risk.length}
                hint="Moyenne sous 10"
                tone={data.at_risk.length ? 'attention' : undefined}
              />
            </div>

            <div className="stats-charts">
              <section className="card stats-card">
                <header className="stats-card-head">
                  <h2>Évolution des moyennes</h2>
                  <span className="sub">Moyenne de chaque épreuve, dans l'ordre où elles ont eu lieu</span>
                </header>
                <TrendChart evaluations={data.evaluations} />
              </section>
              <section className="card stats-card">
                <header className="stats-card-head">
                  <h2>Répartition des notes</h2>
                  <span className="sub">Nombre de copies par tranche de deux points</span>
                </header>
                <Histogram distribution={data.distribution} />
              </section>
            </div>

            <div className="stats-split">
              <section className="card stats-card">
                <header className="stats-card-head">
                  <h2>À accompagner</h2>
                  <span className="sub">Les moyennes les plus basses, sous 10</span>
                </header>
                <AtRisk students={data.at_risk} />
              </section>
              {data.classrooms.length > 1 && (
                <section className="card stats-card">
                  <header className="stats-card-head">
                    <h2>Par classe</h2>
                    <span className="sub">Moyenne sur 20 et part des copies réussies</span>
                  </header>
                  <ClassroomBars classrooms={data.classrooms} onPick={setClassroom} />
                </section>
              )}
            </div>

            <section className="stats-section">
              <header className="section-head">
                <h2 className="section-title">Détail des épreuves</h2>
                <span className="section-count">{data.evaluations.length}</span>
              </header>
              <EvaluationsTable evaluations={data.evaluations} />
            </section>
          </>
        )}
      </div>
    </>
  );
}

/** Une ligne, un point par épreuve, et le seuil de 10 en pointillés. */
function TrendChart({ evaluations }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const height = 220;
  const pad = { top: 16, right: 16, bottom: 28, left: 32 };
  const inner = { w: Math.max(width - pad.left - pad.right, 0), h: height - pad.top - pad.bottom };
  const n = evaluations.length;
  const x = (i) => pad.left + (n === 1 ? inner.w / 2 : (i / (n - 1)) * inner.w);
  const y = (v) => pad.top + inner.h - (v / 20) * inner.h;
  const points = evaluations.map((e, i) => [x(i), y(e.average)]);
  const path = points.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
  const shown = hover != null ? evaluations[hover] : null;

  if (n === 0) return <p className="sub stats-empty">Aucune épreuve corrigée.</p>;

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Moyenne de chaque épreuve sur 20">
          {[0, 5, 10, 15, 20].map((t) => (
            <g key={t}>
              <line
                className={t === PASS ? 'chart-threshold' : 'chart-grid'}
                x1={pad.left}
                x2={pad.left + inner.w}
                y1={y(t)}
                y2={y(t)}
              />
              <text className="chart-tick" x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
                {t}
              </text>
            </g>
          ))}
          <path className="chart-line" d={path} />
          {points.map(([px, py], i) => (
            <g key={evaluations[i].id}>
              <circle className="chart-dot" cx={px} cy={py} r={hover === i ? 6 : 4.5} />
              <rect
                className="chart-hit"
                x={px - Math.max(inner.w / n / 2, 12)}
                y={pad.top}
                width={Math.max(inner.w / n, 24)}
                height={inner.h}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            </g>
          ))}
          {inner.w / Math.max(n - 1, 1) >= 60 &&
            evaluations.map((e, i) =>
              e.date ? (
                <text key={e.id} className="chart-tick" x={x(i)} y={height - 8} textAnchor="middle">
                  {dateFmt.format(new Date(e.date))}
                </text>
              ) : null,
            )}
        </svg>
      )}
      {shown && (
        <div
          className="chart-tooltip"
          style={{
            left: Math.min(Math.max(points[hover][0], 90), width - 90),
            top: points[hover][1] - 12,
          }}
        >
          <strong>{shown.title}</strong>
          <span>Moyenne {grade(shown.average)} / 20</span>
          <span className="sub">
            {plural(shown.copies, 'copie')}
            {shown.classroom_name ? ` · ${shown.classroom_name}` : ''}
          </span>
        </div>
      )}
      <p className="chart-legend">
        <span className="chart-key chart-key--line" /> Moyenne de l'épreuve
        <span className="chart-key chart-key--threshold" /> Seuil de 10
      </p>
    </div>
  );
}

/** Dix colonnes, de 0 à 20 : sous 10 en gris, 10 et plus en couleur. */
function Histogram({ distribution }) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState(null);
  const height = 220;
  const pad = { top: 16, right: 8, bottom: 28, left: 8 };
  const inner = { w: Math.max(width - pad.left - pad.right, 0), h: height - pad.top - pad.bottom };
  const max = Math.max(...distribution, 1);
  const slot = inner.w / distribution.length;
  const barW = Math.max(slot - 6, 4);
  const total = distribution.reduce((a, b) => a + b, 0);

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Nombre de copies par tranche de notes">
          <line
            className="chart-grid"
            x1={pad.left}
            x2={pad.left + inner.w}
            y1={pad.top + inner.h}
            y2={pad.top + inner.h}
          />
          {distribution.map((count, i) => {
            const h = (count / max) * inner.h;
            const bx = pad.left + i * slot + (slot - barW) / 2;
            const by = pad.top + inner.h - h;
            return (
              <g
                key={i}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                <rect className="chart-hit" x={pad.left + i * slot} y={pad.top} width={slot} height={inner.h} />
                {count > 0 && (
                  <path
                    className={i * 2 >= PASS ? 'chart-bar' : 'chart-bar chart-bar--low'}
                    d={`M${bx},${by + h} V${by + Math.min(4, h)} Q${bx},${by} ${bx + Math.min(4, barW / 2)},${by} H${bx + barW - Math.min(4, barW / 2)} Q${bx + barW},${by} ${bx + barW},${by + Math.min(4, h)} V${by + h} Z`}
                    opacity={hover == null || hover === i ? 1 : 0.55}
                  />
                )}
                {count > 0 && (
                  <text className="chart-value" x={bx + barW / 2} y={by - 6} textAnchor="middle">
                    {count}
                  </text>
                )}
                <text className="chart-tick" x={pad.left + i * slot} y={height - 8} textAnchor="middle">
                  {i * 2}
                </text>
              </g>
            );
          })}
          <text className="chart-tick" x={pad.left + inner.w} y={height - 8} textAnchor="end">
            20
          </text>
        </svg>
      )}
      {hover != null && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(Math.max(pad.left + (hover + 0.5) * slot, 80), width - 80), top: 24 }}
        >
          <strong>
            De {hover * 2} à {hover === 9 ? '20' : `moins de ${hover * 2 + 2}`}
          </strong>
          <span>
            {plural(distribution[hover], 'copie')}
            {total ? ` · ${percent((distribution[hover] / total) * 100)}` : ''}
          </span>
        </div>
      )}
      <p className="chart-legend">
        <span className="chart-key chart-key--low" /> Sous 10
        <span className="chart-key chart-key--bar" /> 10 et plus
      </p>
    </div>
  );
}

function AtRisk({ students }) {
  const { pageItems, pager } = usePagination(students, 10);
  if (!students.length) {
    return (
      <p className="sub stats-empty">
        Aucun apprenant n'a une moyenne sous 10. Tout le monde suit.
      </p>
    );
  }
  return (
    <>
      <ul className="at-risk">
        {pageItems.map((s) => (
          <li key={s.student_id}>
            <div className="at-risk-id">
              <strong>{s.full_name}</strong>
              <span className="sub">
                {[s.matricule, s.classroom_name, plural(s.copies, 'copie')].filter(Boolean).join(' · ')}
              </span>
            </div>
            <div className="at-risk-grades">
              <span className="at-risk-avg">{grade(s.average)}</span>
              <span className="sub">dernière : {grade(s.last)}</span>
            </div>
          </li>
        ))}
      </ul>
      <Pagination {...pager} />
    </>
  );
}

function ClassroomBars({ classrooms, onPick }) {
  return (
    <ul className="class-bars">
      {classrooms.map((c) => (
        <li key={c.id}>
          <button type="button" className="class-bars-name" onClick={() => onPick(c.id)}>
            {c.name}
          </button>
          <div className="meter" aria-hidden="true">
            <span className="meter-fill" style={{ width: `${(c.average / 20) * 100}%` }} />
            <span className="meter-mark" style={{ left: '50%' }} />
          </div>
          <span className="class-bars-value">{grade(c.average)}</span>
          <span className="sub class-bars-rate">{percent(c.success_rate)}</span>
        </li>
      ))}
    </ul>
  );
}

/** L'étendue des notes d'une épreuve : de la plus basse à la plus haute, la moyenne marquée. */
function Range({ worst, average, best }) {
  return (
    <span
      className="range"
      title={`De ${grade(worst)} à ${grade(best)}, moyenne ${grade(average)}`}
      aria-hidden="true"
    >
      <span className="range-track" />
      <span className="range-span" style={{ left: `${(worst / 20) * 100}%`, width: `${((best - worst) / 20) * 100}%` }} />
      <span className="range-pass" />
      <span className="range-avg" style={{ left: `${(average / 20) * 100}%` }} />
    </span>
  );
}

function EvaluationsTable({ evaluations }) {
  const { pageItems, pager } = usePagination([...evaluations].reverse(), 15);
  if (!evaluations.length) return <p className="sub">Aucune épreuve corrigée pour cette classe.</p>;
  return (
    <>
      <div className="table-wrap stats-table">
        <table>
          <thead>
            <tr>
              <th>Épreuve</th>
              <th>Date</th>
              <th className="num">Copies</th>
              <th className="num">Moyenne</th>
              <th>Étendue (0 à 20)</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link className="cell-title" to={`/evaluations/${e.id}/resultats`}>
                    {e.title}
                  </Link>
                  <span className="sub">{e.classroom_name ?? 'Sans classe'}</span>
                </td>
                <td className="cell-muted nowrap">{e.date ? dateFmt.format(new Date(e.date)) : '-'}</td>
                <td className="num">{e.copies}</td>
                <td className={`num strong ${e.average < PASS ? 'is-low' : ''}`}>{grade(e.average)}</td>
                <td>
                  <Range worst={e.worst} average={e.average} best={e.best} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...pager} />
    </>
  );
}
