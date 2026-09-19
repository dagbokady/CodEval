import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAction, useSubjects } from '../../api/hooks';
import { useAdminUsers, useClassroomStudents, useClassroomTeachers } from '../../api/admin';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Loading,
  PageHeader,
  Tabs,
} from '../../components/ui';
import { ClassroomDialog } from './ClassroomsAdminPage';

const INVALIDATE = [['admin'], ['classrooms']];

export default function ClassroomAdminDetailPage() {
  const { classroomId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('students');
  const [editing, setEditing] = useState(null);

  const classroom = useQuery({
    queryKey: ['admin', 'classroom', classroomId],
    queryFn: () => api(`/api/classrooms/${classroomId}`),
  });
  const students = useClassroomStudents(classroomId);
  const teachers = useClassroomTeachers(classroomId);

  if (classroom.isPending) return <Loading />;
  if (classroom.error) {
    return (
      <div className="content">
        <Alert>{classroom.error.message}</Alert>
      </div>
    );
  }
  const c = classroom.data;

  return (
    <>
      <PageHeader
        breadcrumb={<><Link to="/admin/classes">Classes</Link> / {c.name}</>}
        title={c.name}
      >
        <Button variant="secondary" onClick={() => setEditing(c)}>Renommer</Button>
        <Button
          variant="secondary"
          onClick={() => navigate(`/admin/evaluations?classe=${c.id}`)}
        >
          Évaluations
        </Button>
      </PageHeader>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'students', label: 'Étudiants', count: students.data?.length ?? 0 },
          { value: 'teachers', label: 'Enseignements', count: teachers.data?.length ?? 0 },
        ]}
      />
      <div className="content">
        {c.level && <p className="sub" style={{ marginBottom: 16 }}>Niveau : {c.level}</p>}
        {tab === 'students' ? (
          <StudentsTab classroomId={c.id} students={students} />
        ) : (
          <TeachersTab classroomId={c.id} teachers={teachers} />
        )}
      </div>
      {editing && <ClassroomDialog classroom={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function StudentsTab({ classroomId, students }) {
  const [picking, setPicking] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState(null);
  const remove = useAction(
    (studentId) => api(`/api/classrooms/${classroomId}/students/${studentId}`, { method: 'DELETE' }),
    INVALIDATE,
  );
  const list = students.data ?? [];

  return (
    <>
      <div className="section-head">
        <p className="sub">{list.length} inscrit{list.length > 1 ? 's' : ''}</p>
        <div className="admin-toolbar">
          <Link className="btn secondary small" to={`/admin/utilisateurs?nouveau=student&classe=${classroomId}`}>
            Créer un étudiant
          </Link>
          <Button size="small" onClick={() => setPicking(true)}>+ Inscrire des étudiants</Button>
        </div>
      </div>
      <Alert>{error ?? students.error?.message}</Alert>
      {students.isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title="Aucun étudiant inscrit">
          Inscrivez des étudiants existants, ou créez leur compte directement dans cette classe.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Étudiant</th>
                <th>Matricule</th>
                <th>État</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    <span className="cell-title">{s.full_name}</span>
                    <span className="sub">{s.email}</span>
                  </td>
                  <td className="mono">{s.matricule ?? '-'}</td>
                  <td className="sub">{s.is_active ? 'Actif' : 'Désactivé'}</td>
                  <td className="actions">
                    <Button variant="danger-ghost" size="small" onClick={() => setConfirm(s)}>
                      Désinscrire
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EnrollDialog
        open={picking}
        classroomId={classroomId}
        enrolled={list}
        onClose={() => setPicking(false)}
      />
      <Dialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={`Désinscrire ${confirm?.full_name ?? ''} ?`}
        description="L'étudiant ne verra plus les épreuves de cette classe. Ses copies déjà rendues sont conservées."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(null)}>Annuler</Button>
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await remove.mutateAsync(confirm.id);
                } catch (err) {
                  setError(err.message);
                }
                setConfirm(null);
              }}
            >
              Désinscrire
            </Button>
          </>
        }
      />
    </>
  );
}

function EnrollDialog({ open, classroomId, enrolled, onClose }) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [error, setError] = useState(null);
  const candidates = useAdminUsers({ role: 'student', active: true, q: search.trim(), pageSize: 100 });
  const enroll = useAction(
    (ids) => api(`/api/classrooms/${classroomId}/students`, { method: 'POST', body: { student_ids: ids } }),
    INVALIDATE,
  );
  const enrolledIds = useMemo(() => new Set(enrolled.map((s) => s.id)), [enrolled]);
  const available = (candidates.data?.items ?? []).filter((s) => !enrolledIds.has(s.id));

  function close() {
    setSelected(new Set());
    setSearch('');
    setError(null);
    onClose();
  }

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="wide"
      title="Inscrire des étudiants"
      description="Les étudiants déjà inscrits dans cette classe n'apparaissent pas."
      footer={
        <>
          <Button variant="secondary" onClick={close}>Annuler</Button>
          <Button
            disabled={selected.size === 0 || enroll.isPending}
            onClick={async () => {
              setError(null);
              try {
                await enroll.mutateAsync([...selected]);
                close();
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            Inscrire {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </>
      }
    >
      <Alert>{error}</Alert>
      <input
        type="search"
        className="search-input"
        style={{ width: '100%', marginBottom: 10 }}
        aria-label="Rechercher un étudiant"
        placeholder="Nom, e-mail ou matricule"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {candidates.isPending ? (
        <Loading />
      ) : available.length === 0 ? (
        <p className="sub" style={{ marginBottom: 12 }}>Aucun étudiant disponible.</p>
      ) : (
        <div className="admin-pick">
          {available.map((s) => (
            <label key={s.id}>
              <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
              {s.full_name}
              <span className="sub">
                {s.classrooms.length ? s.classrooms.join(', ') : 'Sans classe'}
              </span>
            </label>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function TeachersTab({ classroomId, teachers }) {
  const subjects = useSubjects();
  const teacherAccounts = useAdminUsers({ role: 'teacher', active: true, pageSize: 100 });
  const [teacherId, setTeacherId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [error, setError] = useState(null);
  const assign = useAction(
    (body) => api(`/api/classrooms/${classroomId}/teachers`, { method: 'POST', body }),
    INVALIDATE,
  );
  const unassign = useAction(
    (id) => api(`/api/classrooms/${classroomId}/teachers/${id}`, { method: 'DELETE' }),
    INVALIDATE,
  );
  const list = teachers.data ?? [];

  async function submit(event) {
    event.preventDefault();
    setError(null);
    try {
      await assign.mutateAsync({ teacher_id: Number(teacherId), subject_id: Number(subjectId) });
      setSubjectId('');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <form className="admin-inline-form" onSubmit={submit} aria-label="Attribuer un enseignement">
        <div className="field">
          <label htmlFor="t-teacher">Enseignant</label>
          <select id="t-teacher" required value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
            <option value="">Choisir…</option>
            {(teacherAccounts.data?.items ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.full_name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="t-subject">Matière</label>
          <select id="t-subject" required value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Choisir…</option>
            {(subjects.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={!teacherId || !subjectId || assign.isPending}>Attribuer</Button>
      </form>
      <Alert>{error ?? teachers.error?.message}</Alert>

      {teachers.isPending ? (
        <Loading />
      ) : list.length === 0 ? (
        <EmptyState title="Aucun enseignement attribué">
          Attribuez à cette classe un enseignant et la matière qu'il y enseigne.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Enseignant</th>
                <th>Matière</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td>
                    <span className="cell-title">{a.teacher_name}</span>
                    <span className="sub">{a.teacher_email}</span>
                  </td>
                  <td>{a.subject_name}</td>
                  <td className="actions">
                    <Button
                      variant="danger-ghost"
                      size="small"
                      disabled={unassign.isPending}
                      onClick={async () => {
                        setError(null);
                        try {
                          await unassign.mutateAsync(a.id);
                        } catch (err) {
                          setError(err.message);
                        }
                      }}
                    >
                      Retirer
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
