import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction, useClassrooms } from '../../api/hooks';
import {
  Alert,
  Button,
  Dialog,
  EmptyState,
  Field,
  Loading,
  Menu,
  PageHeader,
  Pagination,
} from '../../components/ui';
import { usePagination } from '../../usePagination';

const INVALIDATE = [['classrooms'], ['admin']];

/** Les classes de l'établissement : effectifs, équipes, épreuves. */
export default function ClassroomsAdminPage() {
  const navigate = useNavigate();
  const classrooms = useClassrooms();
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState(null);
  const remove = useAction((id) => api(`/api/classrooms/${id}`, { method: 'DELETE' }), INVALIDATE);

  const list = classrooms.data ?? [];
  const { pageItems, pager } = usePagination(list, 20);

  return (
    <>
      <>
        <PageHeader breadcrumb="Administration" title="Classes">
          <Button onClick={() => setEditing({})}>+ Nouvelle classe</Button>
        </PageHeader>

        <div className="content">
          {(classrooms.error || error) && <Alert>{classrooms.error?.message ?? error}</Alert>}
          {classrooms.isPending ? (
            <Loading />
          ) : list.length === 0 ? (
            <EmptyState
              title="Aucune classe"
              action={<Button onClick={() => setEditing({})}>Créer une classe</Button>}
            >
              Créez une classe, puis inscrivez-y les étudiants et attribuez-lui ses enseignants.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Classe</th>
                    <th className="num">Étudiants</th>
                    <th className="num">Enseignants</th>
                    <th className="num">Évaluations</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((c) => {
                    const to = `/admin/classes/${c.id}`;
                    return (
                      <tr key={c.id} className="row-link" onClick={() => navigate(to)}>
                        <td>
                          <Link className="cell-title" to={to} onClick={(e) => e.stopPropagation()}>
                            {c.name}
                          </Link>
                          <span className="sub">{c.level ?? 'Niveau non précisé'}</span>
                        </td>
                        <td className="num">{c.students_count}</td>
                        <td className="num">
                          {c.teachers_count || <span className="cell-warning" style={{ marginTop: 0 }}>0</span>}
                        </td>
                        <td className="num">{c.evaluations_count}</td>
                        <td className="actions" onClick={(e) => e.stopPropagation()}>
                          <Menu
                            label={`Actions pour ${c.name}`}
                            items={[
                              { label: 'Ouvrir', onClick: () => navigate(to) },
                              { label: 'Renommer', onClick: () => setEditing(c) },
                              'separator',
                              {
                                label: 'Supprimer',
                                danger: true,
                                disabled: c.evaluations_count > 0,
                                onClick: () => setConfirm(c),
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {editing && (
          <ClassroomDialog
            classroom={editing}
            onClose={() => setEditing(null)}
            onCreated={(c) => navigate(`/admin/classes/${c.id}`)}
          />
        )}

        <Dialog
          open={Boolean(confirm)}
          onClose={() => setConfirm(null)}
          title={`Supprimer ${confirm?.name ?? ''} ?`}
          description="Les inscriptions et les attributions d'enseignants de cette classe seront retirées. Les comptes eux-mêmes sont conservés."
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
                Supprimer la classe
              </Button>
            </>
          }
        />
      </>
      <Pagination {...pager} />
    </>
  );
}

/** Création (objet vide) ou modification d'une classe. */
export function ClassroomDialog({ classroom, onClose, onCreated }) {
  const creating = !classroom.id;
  const [name, setName] = useState(classroom.name ?? '');
  const [level, setLevel] = useState(classroom.level ?? '');
  const [error, setError] = useState(null);
  const save = useAction(
    (body) =>
      creating
        ? api('/api/classrooms', { method: 'POST', body })
        : api(`/api/classrooms/${classroom.id}`, { method: 'PATCH', body }),
    [...INVALIDATE, ['classroom']],
  );

  async function submit(event) {
    event.preventDefault();
    setError(null);
    try {
      const saved = await save.mutateAsync({ name: name.trim(), level: level.trim() || null });
      onClose();
      if (creating) onCreated?.(saved);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={creating ? 'Nouvelle classe' : `Modifier ${classroom.name}`}
    >
      <form onSubmit={submit}>
        <Alert>{error}</Alert>
        <div className="row">
          <Field label="Nom" id="c-name" hint="Par exemple « SRIT 2A ».">
            <input id="c-name" required value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Niveau" id="c-level" hint="Facultatif.">
            <input id="c-level" value={level} onChange={(e) => setLevel(e.target.value)} placeholder="2ᵉ année" />
          </Field>
        </div>
        <div className="dialog-foot">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={save.isPending}>
            {creating ? 'Créer la classe' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
