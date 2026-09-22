import { useState } from 'react';
import { api } from '../../api/client';
import { useAction, useDisciplines, useSubjects } from '../../api/hooks';
import { useAuth } from '../../auth';
import { Alert, Button, Dialog, EmptyState, Field, Loading, Menu, PageHeader, Pagination, Tag } from '../../components/ui';
import { usePagination } from '../../usePagination';
import { useDocumentTitle } from '../../useDocumentTitle';

const INVALIDATE = [['subjects'], ['admin']];

/**
 * Les matières de l'enseignant. Chacune porte un langage, choisi parmi ceux que
 * l'administration a ouverts : il s'impose ensuite aux épreuves de la matière.
 */
export default function SubjectsPage() {
  useDocumentTitle('Mes matières');
  const { user } = useAuth();
  const subjects = useSubjects();
  const disciplines = useDisciplines();
  const [form, setForm] = useState({ name: '', language: '' });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);

  const create = useAction((body) => api('/api/subjects', { method: 'POST', body }), INVALIDATE);
  const update = useAction(
    ({ id, ...body }) => api(`/api/subjects/${id}`, { method: 'PATCH', body }),
    INVALIDATE,
  );
  const remove = useAction((id) => api(`/api/subjects/${id}`, { method: 'DELETE' }), INVALIDATE);

  async function run(promise) {
    setError(null);
    try {
      await promise;
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }

  const open = disciplines.data ?? [];
  const labels = Object.fromEntries(open.map((d) => [d.key, d.label]));
  const language = form.language || open[0]?.key || '';
  const list = subjects.data ?? [];
  const mine = list.filter((s) => s.author_id === user.id);
  const others = list.filter((s) => s.author_id !== user.id);

  return (
    <>
      <PageHeader breadcrumb="Gestion" title="Mes matières" />
      <div className="content">
        {open.length === 0 && !disciplines.isPending ? (
          <Alert tone="info">
            Aucun langage n'est ouvert pour le moment : l'administration doit en activer au
            moins un avant que vous puissiez créer une matière.
          </Alert>
        ) : (
          <form
            className="admin-inline-form"
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await run(create.mutateAsync({ name: form.name.trim(), language }));
              if (ok) setForm({ name: '', language });
            }}
          >
            <div className="field" style={{ flex: '1 1 260px', maxWidth: 360 }}>
              <label htmlFor="s-name">Nouvelle matière</label>
              <input
                id="s-name"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Programmation en C"
              />
            </div>
            <div className="field" style={{ flex: '0 1 220px' }}>
              <label htmlFor="s-language">Langage</label>
              <select
                id="s-language"
                value={language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                {open.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={!form.name.trim() || !language || create.isPending}>
              Ajouter
            </Button>
          </form>
        )}

        {(subjects.error || error) && <Alert>{subjects.error?.message ?? error}</Alert>}

        {subjects.isPending ? (
          <Loading />
        ) : mine.length === 0 ? (
          <EmptyState title="Aucune matière">
            Créez une matière et choisissez son langage : vos évaluations s'y rattachent et en
            reprennent le langage.
          </EmptyState>
        ) : (
          <SubjectTable
            subjects={mine}
            labels={labels}
            actions={(s) => [
              {
                label: 'Modifier',
                onClick: () => setEditing({ id: s.id, name: s.name, language: s.language }),
              },
              'separator',
              { label: 'Supprimer', danger: true, onClick: () => run(remove.mutateAsync(s.id)) },
            ]}
          />
        )}

        {others.length > 0 && (
          <>
            <h2 className="form-section-title" style={{ marginTop: 28 }}>
              Matières de vos collègues
            </h2>
            <p className="sub" style={{ margin: '0 0 12px' }}>
              Vous pouvez y rattacher vos évaluations ; seul leur auteur les modifie.
            </p>
            <SubjectTable subjects={others} labels={labels} />
          </>
        )}
      </div>

      <Dialog open={Boolean(editing)} onClose={() => setEditing(null)} title="Modifier la matière">
        {editing && (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const ok = await run(
                update.mutateAsync({ id: editing.id, name: editing.name.trim(), language: editing.language }),
              );
              if (ok) setEditing(null);
            }}
          >
            <Field label="Nom" id="s-edit-name">
              <input
                id="s-edit-name"
                required
                autoFocus
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field
              label="Langage"
              id="s-edit-language"
              hint="Il ne change plus dès qu'une évaluation ou un exercice utilise la matière."
            >
              <select
                id="s-edit-language"
                value={editing.language}
                onChange={(e) => setEditing({ ...editing, language: e.target.value })}
              >
                {!labels[editing.language] && (
                  <option value={editing.language}>{editing.language} (fermé)</option>
                )}
                {open.map((d) => (
                  <option key={d.key} value={d.key}>{d.label}</option>
                ))}
              </select>
            </Field>
            <div className="dialog-foot">
              <Button variant="secondary" onClick={() => setEditing(null)}>Annuler</Button>
              <Button type="submit" disabled={!editing.name.trim() || update.isPending}>
                Enregistrer
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}

function SubjectTable({ subjects, labels, actions }) {
  const { pageItems, pager } = usePagination(subjects);
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Matière</th>
              <th>Langage</th>
              {actions && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {pageItems.map((s) => (
              <tr key={s.id}>
                <td className="cell-title">{s.name}</td>
                <td>
                  {labels[s.language] ?? (
                    <>
                      {s.language} <Tag tone="warning">fermé</Tag>
                    </>
                  )}
                </td>
                {actions && (
                  <td className="actions">
                    <Menu label={`Actions pour ${s.name}`} items={actions(s)} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination {...pager} />
    </>
  );
}
