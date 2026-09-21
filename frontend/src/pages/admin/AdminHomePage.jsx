import { Link, useNavigate } from 'react-router-dom';
import { AUDIT_LABELS, useAdminEvaluations, useAdminOverview, useAudit } from '../../api/admin';
import { Alert, Button, PageHeader, Skeleton, Stat, Status } from '../../components/ui';
import { formatPercent, formatRelative, formatSchedule } from '../../format';

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

/*
 * Le tableau de bord de l'administration : l'état de la plateforme en
 * chiffres, ce qui demande une intervention, puis ce qui se passe en ce
 * moment (sessions ouvertes, dernières opérations).
 */
export default function AdminHomePage() {
  const navigate = useNavigate();
  const overview = useAdminOverview();
  const running = useAdminEvaluations({ status: 'running', pageSize: 5 });
  const audit = useAudit({ pageSize: 8 });
  const data = overview.data;

  const value = (v) => (overview.isPending ? <Skeleton width={40} height={22} /> : v);

  const attention = [];
  if (data?.students_without_class > 0) {
    attention.push({
      text: `${plural(data.students_without_class, 'étudiant')} sans classe : ils ne voient aucune épreuve.`,
      action: 'Voir',
      to: '/admin/utilisateurs?sans-classe=1',
    });
  }
  if (data?.teachers === 0) {
    attention.push({
      text: "Aucun compte enseignant : personne ne peut encore préparer d'épreuve.",
      action: 'Créer un compte',
      to: '/admin/utilisateurs?nouveau=teacher',
    });
  }
  if (data && data.classrooms === 0) {
    attention.push({
      text: 'Aucune classe : créez-en une pour y inscrire les étudiants.',
      action: 'Créer une classe',
      to: '/admin/classes',
    });
  }

  return (
    <>
      <PageHeader breadcrumb="Administration" title="Tableau de bord">
        <Button variant="secondary" onClick={() => navigate('/admin/langages')}>
          Langages
        </Button>
        <Button onClick={() => navigate('/admin/utilisateurs?nouveau=student')}>+ Nouveau compte</Button>
      </PageHeader>

      <div className="content">
        {overview.error && <Alert>{overview.error.message}</Alert>}

        <div className="stats">
          <Stat
            label="Enseignants"
            value={value(data?.teachers)}
            hint="Gérer les comptes"
            onClick={() => navigate('/admin/utilisateurs?role=teacher')}
          />
          <Stat
            label="Étudiants"
            value={value(data?.students)}
            hint="Gérer les comptes"
            onClick={() => navigate('/admin/utilisateurs?role=student')}
          />
          <Stat
            label="Classes"
            value={value(data?.classrooms)}
            hint="Voir les classes"
            onClick={() => navigate('/admin/classes')}
          />
          <Stat
            label="Évaluations"
            value={value(data?.evaluations)}
            hint="Superviser"
            onClick={() => navigate('/admin/evaluations')}
          />
          <Stat
            label="Sessions en cours"
            value={value(data?.running_sessions)}
            tone={data?.running_sessions > 0 ? 'attention' : undefined}
          />
          <Stat label="Réussite moyenne" value={value(formatPercent(data?.average_success))} />
        </div>

        {attention.length > 0 && (
          <ul className="admin-attention" aria-label="À traiter">
            {attention.map((item) => (
              <li key={item.to}>
                <span>{item.text}</span>
                <Button variant="secondary" size="small" onClick={() => navigate(item.to)}>
                  {item.action}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <div className="admin-grid">
          <section aria-labelledby="sessions-title">
            <div className="section-head">
              <h2 className="section-title" id="sessions-title">Sessions en cours</h2>
              <Link to="/admin/evaluations" className="sub">Toutes les évaluations</Link>
            </div>
            {running.isPending ? (
              <Skeleton height={60} />
            ) : running.data?.items.length ? (
              <ul className="admin-feed">
                {running.data.items.map((ev) => (
                  <li key={ev.id}>
                    <span>
                      <strong>{ev.title}</strong>
                      <span className="sub" style={{ display: 'block' }}>
                        {[ev.teacher_name, ev.classroom_name, `${plural(ev.participants_count, 'participant')}`]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span>
                      <Status tone="live">En cours</Status>
                      <time className="sub" style={{ display: 'block' }}>{formatSchedule(ev)}</time>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sub">Aucune épreuve ne se déroule en ce moment.</p>
            )}
          </section>

          <section aria-labelledby="activity-title">
            <div className="section-head">
              <h2 className="section-title" id="activity-title">Activité récente</h2>
              <Link to="/admin/journal" className="sub">Journal complet</Link>
            </div>
            {audit.isPending ? (
              <Skeleton height={60} />
            ) : audit.data?.items.length ? (
              <ul className="admin-feed">
                {audit.data.items.map((entry) => (
                  <li key={entry.id}>
                    <span>
                      {AUDIT_LABELS[entry.action] ?? entry.action}
                      <span className="sub" style={{ display: 'block' }}>
                        {entry.actor_name ?? 'Système'}
                      </span>
                    </span>
                    <time dateTime={entry.created_at}>{formatRelative(entry.created_at)}</time>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="sub">Aucune opération enregistrée.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
