import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { Alert, Button, Loading, Tag } from '../../components/ui';
import { STATUS_LABELS, STATUS_TONES, formatSchedule } from '../../format';
import {
  IconBook,
  IconCalendar,
  IconChevronRight,
  IconClasses,
  IconCode,
  IconEvaluations,
  IconGraduation,
  IconPlus,
  IconResults,
  IconStats,
  IconTarget,
  IconTrophy,
  IconUsers,
} from '../../components/icons';

const TABS = [
  { value: 'overview', label: "Vue d'ensemble" },
  { value: 'students', label: 'Apprenants' },
  { value: 'evaluations', label: 'Évaluations' },
  { value: 'stats', label: 'Statistiques' },
];

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

function fmtDateRange(evaluation) {
  if (!evaluation.scheduled_start) return '—';
  const s = new Date(evaluation.scheduled_start);
  const e = new Date(s.getTime() + (evaluation.duration_minutes ?? 60) * 60000);
  return `${dateFmt.format(s)}\n${timeFmt.format(s)} – ${timeFmt.format(e)}`;
}

function ProgressBar({ value }) {
  return (
    <div className="cd-progress">
      <div className="cd-progress-fill" style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

function StatCard({ icon, color, label, value, sub, onClick }) {
  return (
    <button type="button" className="cd-stat" onClick={onClick} disabled={!onClick}>
      <div className="cd-stat-icon" style={{ background: `${color}14`, color }}>
        {icon}
      </div>
      <div className="cd-stat-body">
        <div className="cd-stat-label">{label}</div>
        <div className="cd-stat-value">{value}</div>
        {sub && <div className="cd-stat-sub">{sub}</div>}
      </div>
      {onClick && <span className="cd-stat-arrow">›</span>}
    </button>
  );
}

function QuickAction({ icon, label, onClick }) {
  return (
    <button type="button" className="cd-quick-action" onClick={onClick}>
      <span className="cd-quick-action-icon">{icon}</span>
      <span>{label}</span>
      <span className="cd-quick-action-arrow">›</span>
    </button>
  );
}

function EvalIcon({ status }) {
  const colors = {
    draft: 'var(--text-muted)',
    scheduled: 'var(--warning)',
    running: 'var(--primary)',
    closed: 'var(--text-muted)',
    correcting: 'var(--primary)',
    corrected: 'var(--success)',
    validated: 'var(--success)',
  };
  return (
    <div className="cd-eval-icon" style={{ background: `${colors[status] ?? 'var(--primary)'}14`, color: colors[status] ?? 'var(--primary)' }}>
      <IconCode />
    </div>
  );
}

export default function ClassDetailPage() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');

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

  const evaluations = useQuery({
    queryKey: ['classroom-evaluations', classroomId],
    queryFn: () => api(`/api/classrooms/${classroomId}/evaluations`),
    enabled: Boolean(classroomId),
  });

  if (classroom.isPending) return <Loading />;
  if (classroom.error) return <div className="content"><Alert>{classroom.error.message}</Alert></div>;

  const cls = classroom.data ?? {};
  const studentList = students.data ?? [];
  const evalList = (evaluations.data?.items ?? evaluations.data) ?? [];
  const recentEvals = evalList.slice(0, 5);

  const upcoming = evalList.filter((e) => e.status === 'scheduled').length;
  const avgScore = evalList.length > 0
    ? evalList.reduce((sum, e) => sum + (e.success_rate ?? 0), 0) / Math.max(1, evalList.filter((e) => e.success_rate != null).length)
    : null;

  return (
    <>
      {/* Class header */}
      <div className="cd-header">
        <div className="cd-header-left">
          <div className="cd-header-icon">
            <IconGraduation />
          </div>
          <div>
            <div className="cd-header-title-row">
              <h1>{cls.name ?? 'Classe'}</h1>
              <Tag tone="success">Active</Tag>
            </div>
            <div className="cd-header-meta">
              {[cls.subject_name, cls.level, `${cls.students_count ?? studentList.length} apprenants`].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
        <div className="cd-header-actions">
          <Button variant="secondary">
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Actions <IconChevronRight /></span>
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.value}
            className="tab"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content area with right sidebar */}
      <div className="cd-layout">
        <div className="cd-main">
          {tab === 'overview' && (
            <>
              {/* Stat cards */}
              <div className="cd-stats">
                <StatCard
                  icon={<IconUsers />}
                  color="#0075de"
                  label="Apprenants"
                  value={cls.students_count ?? studentList.length}
                  sub={`/ ${cls.students_count ?? studentList.length} inscrits`}
                  onClick={() => setTab('students')}
                />
                <StatCard
                  icon={<IconCalendar />}
                  color="#16a34a"
                  label="Prochaines évaluations"
                  value={upcoming}
                  sub="dans les 7 prochains jours"
                />
                <StatCard
                  icon={<IconTarget />}
                  color="#e5a100"
                  label="Moyenne de la classe"
                  value={avgScore != null ? `${Math.round(avgScore * 10) / 10} / 20` : '—'}
                  sub={avgScore != null ? 'depuis le début' : ''}
                />
                <StatCard
                  icon={<IconTrophy />}
                  color="#8145b5"
                  label="Taux de réussite"
                  value={avgScore != null ? `${Math.round(avgScore)}%` : '—'}
                  sub="des apprenants"
                />
              </div>

              {/* Recent evaluations */}
              <div className="cd-section">
                <div className="cd-section-header">
                  <h2>Évaluations récentes</h2>
                  <button type="button" className="cd-link" onClick={() => setTab('evaluations')}>
                    Voir toutes les évaluations →
                  </button>
                </div>

                {evaluations.isPending && <Loading />}

                {recentEvals.length > 0 && (
                  <div className="table-wrap" style={{ margin: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Titre</th>
                          <th>Matière</th>
                          <th>Date</th>
                          <th>Statut</th>
                          <th>Taux de réussite</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentEvals.map((ev) => (
                          <tr key={ev.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <EvalIcon status={ev.status} />
                                <div>
                                  <div style={{ fontWeight: 500 }}>{ev.title}</div>
                                  <div className="sub">{cls.name}</div>
                                </div>
                              </div>
                            </td>
                            <td>{ev.subject_name ?? '—'}</td>
                            <td style={{ whiteSpace: 'pre-line', fontSize: 13 }}>
                              {fmtDateRange(ev)}
                            </td>
                            <td>
                              <Tag tone={STATUS_TONES[ev.status]}>{STATUS_LABELS[ev.status]}</Tag>
                            </td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <ProgressBar value={ev.success_rate ?? 0} />
                                <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                                  {ev.success_rate != null ? `${ev.success_rate}%` : '—'}
                                </span>
                              </div>
                            </td>
                            <td>
                              <button
                                className="cd-more-btn"
                                aria-label="Actions"
                                onClick={() => navigate(`/evaluations/${ev.id}/resultats`)}
                              >
                                ⋮
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {!evaluations.isPending && recentEvals.length === 0 && (
                  <div className="cd-empty">Aucune évaluation pour cette classe.</div>
                )}
              </div>
            </>
          )}

          {tab === 'students' && (
            <div className="cd-section">
              <h2 style={{ marginBottom: 16 }}>Apprenants inscrits</h2>
              {students.isPending && <Loading />}
              {studentList.length > 0 && (
                <div className="table-wrap" style={{ margin: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Apprenant</th>
                        <th>Matricule</th>
                        <th>E-mail</th>
                        <th>État</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentList.map((s) => {
                        const ini = s.full_name.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();
                        return (
                          <tr key={s.id}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span className="avatar avatar--sm">{ini}</span>
                                {s.full_name}
                              </div>
                            </td>
                            <td className="sub">{s.matricule ?? '—'}</td>
                            <td className="sub">{s.email}</td>
                            <td>
                              <Tag tone={s.is_active ? 'success' : 'neutral'}>
                                {s.is_active ? 'Actif' : 'Inactif'}
                              </Tag>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {!students.isPending && studentList.length === 0 && (
                <div className="cd-empty">Aucun apprenant inscrit dans cette classe.</div>
              )}
            </div>
          )}

          {tab === 'evaluations' && (
            <div className="cd-section">
              <h2 style={{ marginBottom: 16 }}>Toutes les évaluations</h2>
              {evaluations.isPending && <Loading />}
              {evalList.length > 0 && (
                <div className="table-wrap" style={{ margin: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Titre</th>
                        <th>Matière</th>
                        <th>Date</th>
                        <th>Statut</th>
                        <th>Taux de réussite</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evalList.map((ev) => (
                        <tr key={ev.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/evaluations/${ev.id}`)}>
                          <td style={{ fontWeight: 500 }}>{ev.title}</td>
                          <td>{ev.subject_name ?? '—'}</td>
                          <td style={{ whiteSpace: 'pre-line', fontSize: 13 }}>{fmtDateRange(ev)}</td>
                          <td><Tag tone={STATUS_TONES[ev.status]}>{STATUS_LABELS[ev.status]}</Tag></td>
                          <td>{ev.success_rate != null ? `${ev.success_rate}%` : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'stats' && (
            <div className="cd-section">
              <h2 style={{ marginBottom: 16 }}>Statistiques</h2>
              <div className="cd-empty">Les statistiques détaillées de cette classe seront bientôt disponibles.</div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="cd-aside">
          <div className="cd-aside-card cd-aside-info">
            <div className="cd-aside-illustration">
              <IconGraduation />
            </div>
            <h3>{cls.name}</h3>
            <div className="cd-aside-subtitle">{cls.subject_name ?? 'Informatique'}</div>
            <p className="cd-aside-desc">
              {cls.description ?? `Cette classe regroupe les étudiants de ${cls.name}. Vous pouvez gérer les apprenants, les évaluations et suivre leur progression.`}
            </p>
            <div className="cd-aside-details">
              <div><IconUsers /> {cls.students_count ?? studentList.length} apprenants</div>
              <div><IconClasses /> Niveau {cls.level ?? '—'}</div>
              <div><IconBook /> Matière {cls.subject_name ?? '—'}</div>
              <div><IconCalendar /> Créée le {cls.created_at ? dateFmt.format(new Date(cls.created_at)) : '—'}</div>
            </div>
            <Button variant="secondary" size="large" onClick={() => setTab('students')}>
              Gérer la classe
            </Button>
          </div>

          <div className="cd-aside-card">
            <h3 className="cd-aside-card-title">Actions rapides</h3>
            <QuickAction
              icon={<IconPlus />}
              label="Créer une évaluation"
              onClick={() => navigate('/evaluations/nouvelle')}
            />
            <QuickAction
              icon={<IconUsers />}
              label="Voir les apprenants"
              onClick={() => setTab('students')}
            />
            <QuickAction
              icon={<IconStats />}
              label="Voir les statistiques"
              onClick={() => setTab('stats')}
            />
          </div>
        </aside>
      </div>
    </>
  );
}
