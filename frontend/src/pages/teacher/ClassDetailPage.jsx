import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAction, useClassroomEvaluations } from '../../api/hooks';
import { formatJoinCode, joinLink } from '../../joinCode';
import {
  Alert,
  Avatar,
  Button,
  Dialog,
  EmptyState,
  Loading,
  PageHeader,
  Pagination,
  Segmented,
  Stat,
  Status,
  Tabs,
} from '../../components/ui';
import { usePagination } from '../../usePagination';
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
const expiryFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' });
const linkExpiryFmt = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
});
// Durées proposées pour un lien d'invitation : il vit peu, par principe.
const LINK_DURATIONS = [
  { value: 2, label: '2 heures' },
  { value: 24, label: '24 heures' },
  { value: 72, label: '3 jours' },
  { value: 168, label: '7 jours' },
];

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
  const tab = ['apprenants', 'evaluations', 'enseignants'].includes(requested)
    ? requested
    : 'apercu';
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

  if (classroom.isPending) return <Loading variant="page" />;
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
            {cls.shared && ` · partagée par ${cls.owner_name ?? 'un collègue'} (${cls.organization_name})`}
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
          { value: 'enseignants', label: 'Enseignants' },
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
            classroom={cls}
            students={studentList}
            pending={students.isPending}
            error={students.error}
            canRemove={cls.can_manage}
          />
        )}

        {tab === 'enseignants' && <TeachersTab classroom={cls} />}

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
          <JoinCodePanel classroom={classroom} />
          <header className="section-head">
            <h2 className="section-title">Apprenants</h2>
            <span className="section-count">{classroom.students_count}</span>
          </header>
          {studentsPending && <Loading />}
          {!studentsPending && students.length === 0 && (
            <EmptyState compact title="Aucun apprenant inscrit">
              Donnez le code d'accès à vos apprenants : ils s'inscrivent eux-mêmes dans la
              classe.
            </EmptyState>
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

const TEAM_ROLES = { owner: 'Créateur', invited: 'Invité' };

/**
 * Les enseignants de la classe, chacun compris : celui qui l'a créée et ceux
 * qu'il a invités. Le créateur invite un collègue par son e-mail, même d'un
 * autre espace : la classe reste une, ses apprenants aussi, et l'invité y fait
 * passer ses propres épreuves.
 */
function TeachersTab({ classroom }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const key = ['classroom-team', String(classroom.id)];
  const team = useQuery({
    queryKey: key,
    queryFn: () => api(`/api/classrooms/${classroom.id}/team`),
  });
  const invite = useAction(
    (address) =>
      api(`/api/classrooms/${classroom.id}/shares`, { method: 'POST', body: { email: address } }),
    [key, ['classrooms']],
  );
  const remove = useAction(
    (shareId) => api(`/api/classrooms/${classroom.id}/shares/${shareId}`, { method: 'DELETE' }),
    [key, ['classrooms']],
  );

  async function submit(event) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    try {
      const share = await invite.mutateAsync(email.trim());
      setNotice(`${share.teacher_name} a maintenant accès à la classe.`);
      setEmail('');
    } catch (err) {
      setError(err.message);
    }
  }

  async function withdraw(member) {
    setError(null);
    setNotice(null);
    try {
      await remove.mutateAsync(member.share_id);
      if (member.is_self) navigate('/classes');
    } catch (err) {
      setError(err.message);
    }
  }

  const list = team.data ?? [];

  return (
    <section>
      <header className="section-head">
        <h2 className="section-title">Enseignants de la classe</h2>
        {!team.isPending && <span className="section-count">{list.length}</span>}
      </header>
      <p className="sub">
        Les enseignants invités font passer leurs épreuves à ces mêmes apprenants : personne
        n'a à s'inscrire dans une seconde classe.
      </p>

      {classroom.can_manage && (
        <form className="partage-form" onSubmit={submit}>
          <label htmlFor="partage-email" className="sr-only">
            E-mail de l'enseignant à inviter
          </label>
          <input
            id="partage-email"
            type="email"
            required
            autoComplete="off"
            placeholder="E-mail de l'enseignant à inviter"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" disabled={invite.isPending || !email.trim()}>
            Partager la classe
          </Button>
        </form>
      )}
      <Alert>{error}</Alert>
      {notice && <Alert tone="success">{notice}</Alert>}
      {team.error && <Alert>{team.error.message}</Alert>}
      {team.isPending && <Loading />}

      {!team.isPending && list.length === 0 && (
        <p className="sub classe-table-vide">
          Aucun enseignant n'est encore lié à cette classe.
        </p>
      )}
      {list.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Enseignant</th>
                <th>E-mail</th>
                <th>Rôle</th>
                <th>Espace</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.map((member) => (
                <tr key={member.teacher_id}>
                  <td className="cell-title">
                    {member.teacher_name}
                    {member.is_self && <span className="cell-muted"> (vous)</span>}
                  </td>
                  <td>{member.teacher_email}</td>
                  <td>{TEAM_ROLES[member.role] ?? member.role}</td>
                  <td className="cell-muted">{member.organization_name}</td>
                  <td className="actions">
                    {member.share_id && (classroom.can_manage || member.is_self) && (
                      <Button
                        variant="secondary"
                        size="small"
                        disabled={remove.isPending}
                        onClick={() => withdraw(member)}
                      >
                        {member.is_self ? 'Quitter la classe' : 'Retirer'}
                      </Button>
                    )}
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

/**
 * Le code que l'enseignant donne à sa classe. Il ne sert qu'à entrer : le
 * changer ou le fermer laisse les apprenants déjà inscrits à leur place.
 */
function JoinCodePanel({ classroom }) {
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const invalidate = [['classroom', String(classroom.id)]];
  const open = useAction(
    () => api(`/api/classrooms/${classroom.id}/join-code`, { method: 'POST', body: {} }),
    invalidate,
  );
  const close = useAction(
    () => api(`/api/classrooms/${classroom.id}/join-code`, { method: 'DELETE' }),
    invalidate,
  );
  const [hours, setHours] = useState(24);
  // Le lien créé : il n'est montré qu'ici, le serveur ne le garde pas.
  const [link, setLink] = useState(null);
  const createLink = useAction(() =>
    api(`/api/classrooms/${classroom.id}/join-link`, {
      method: 'POST',
      body: { expires_in_hours: hours },
    }),
  );
  const busy = open.isPending || close.isPending || createLink.isPending;
  const code = classroom.join_code;

  async function run(action) {
    setError(null);
    setCopied(null);
    try {
      const result = await action.mutateAsync();
      // Changer ou fermer le code rend caducs les liens déjà créés.
      if (action === createLink) setLink(result);
      else setLink(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function copy(what, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setError('Copie impossible : sélectionnez le texte à la main.');
    }
  }

  return (
    <section className="join-code-panel">
      <header className="section-head">
        <h2 className="section-title">Code d'accès</h2>
      </header>
      <Alert>{error}</Alert>
      {code ? (
        <>
          <span className="join-code-value">{formatJoinCode(code)}</span>
          <span className="sub">
            {classroom.join_code_expires_at
              ? `Valable jusqu'au ${expiryFmt.format(new Date(classroom.join_code_expires_at))}`
              : 'Valable jusqu’à ce que vous le fermiez'}
            {' · '}à saisir sur {location.host}/rejoindre
          </span>
          <div className="join-code-actions">
            <Button size="small" onClick={() => copy('code', formatJoinCode(code))}>
              {copied === 'code' ? 'Code copié' : 'Copier le code'}
            </Button>
            <Button size="small" variant="secondary" disabled={busy} onClick={() => run(open)}>
              Changer le code
            </Button>
            <Button size="small" variant="secondary" disabled={busy} onClick={() => run(close)}>
              Fermer
            </Button>
          </div>

          <div className="join-link">
            <div className="join-link-head">
              <strong>Lien d'invitation</strong>
              <span className="sub">
                Il ouvre l'inscription sans avoir à taper le code, et cesse de fonctionner à
                son échéance ou dès que vous changez le code.
              </span>
            </div>
            {link ? (
              <>
                <div className="join-link-row">
                  <input
                    className="join-link-url"
                    readOnly
                    aria-label="Lien d'invitation"
                    value={joinLink(link.token)}
                    onFocus={(e) => e.target.select()}
                  />
                  <Button size="small" onClick={() => copy('lien', joinLink(link.token))}>
                    {copied === 'lien' ? 'Lien copié' : 'Copier'}
                  </Button>
                </div>
                <span className="sub">
                  Expire le {linkExpiryFmt.format(new Date(link.expires_at))}
                  {' · '}
                  <button type="button" className="cd-link" onClick={() => setLink(null)}>
                    Créer un autre lien
                  </button>
                </span>
              </>
            ) : (
              <div className="join-link-row">
                <label className="join-link-duration">
                  <span>Valable</span>
                  <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                    {LINK_DURATIONS.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </label>
                <Button
                  size="small"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => run(createLink)}
                >
                  Créer le lien
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="sub">
            Aucun code ouvert : personne ne peut rejoindre la classe par soi-même.
          </p>
          <div className="join-code-actions">
            <Button size="small" disabled={busy} onClick={() => run(open)}>
              Créer un code d'accès
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

function StudentsTab({ classroom, students, pending, error, canRemove }) {
  const [search, setSearch] = useState('');
  const [removeError, setRemoveError] = useState(null);
  // L'apprenant qu'on s'apprête à retirer : la confirmation dit ce que ça change.
  const [removing, setRemoving] = useState(null);
  const remove = useAction(
    (studentId) =>
      api(`/api/classrooms/${classroom.id}/students/${studentId}`, { method: 'DELETE' }),
    [['classroom-students', String(classroom.id)], ['classroom', String(classroom.id)]],
  );

  async function confirmRemove() {
    setRemoveError(null);
    try {
      await remove.mutateAsync(removing.id);
      setRemoving(null);
    } catch (err) {
      setRemoveError(err.message);
      setRemoving(null);
    }
  }
  const query = search.trim().toLowerCase();
  const shown = query
    ? students.filter((s) =>
        `${s.full_name} ${s.matricule ?? ''} ${s.email}`.toLowerCase().includes(query),
      )
    : students;
  const { pageItems, pager } = usePagination(shown, 20, query);

  return (
    <>
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

        <JoinCodePanel classroom={classroom} />
        {error && <Alert>{error.message}</Alert>}
        <Alert>{removeError}</Alert>
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
                  {canRemove && <th aria-label="Actions" />}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <span className="student-cell">
                        <Avatar user={student} />
                        <span className="cell-title">{student.full_name}</span>
                      </span>
                    </td>
                    <td className="mono">{student.matricule ?? '-'}</td>
                    <td className="cell-muted">{student.email}</td>
                    <td>
                      <Status tone={student.is_active ? 'success' : 'neutral'}>
                        {student.is_active ? 'Actif' : 'Désactivé'}
                      </Status>
                    </td>
                    {canRemove && (
                      <td className="actions">
                        <Button
                          variant="secondary"
                          size="small"
                          disabled={remove.isPending}
                          onClick={() => setRemoving(student)}
                        >
                          Retirer
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {removing && (
          <Dialog
            open
            onClose={() => setRemoving(null)}
            title={`Retirer ${removing.full_name} ?`}
            description={`${removing.full_name} quittera la classe ${classroom.name}.`}
            footer={
              <>
                <Button variant="secondary" onClick={() => setRemoving(null)}>
                  Annuler
                </Button>
                <Button variant="danger" disabled={remove.isPending} onClick={confirmRemove}>
                  {remove.isPending ? 'Retrait…' : 'Retirer de la classe'}
                </Button>
              </>
            }
          >
            <p className="sub">
              Son compte et ses copies passées sont conservés. Il ne verra plus les épreuves de
              cette classe ; s'il n'appartient plus à aucune classe, on lui demandera un code à sa
              prochaine connexion.
            </p>
          </Dialog>
        )}
      </section>
      <Pagination {...pager} />
    </>
  );
}

function EvaluationsTab({ evaluations, summary, pending, onNew }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState(null);
  const groups = { upcoming: summary.upcoming, running: summary.running, done: summary.done };
  const rows = filter ? groups[filter] : evaluations;
  const { pageItems, pager } = usePagination(rows, 20, filter);

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
    <>
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
                {pageItems.map((evaluation) => {
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
      <Pagination {...pager} />
    </>
  );
}
