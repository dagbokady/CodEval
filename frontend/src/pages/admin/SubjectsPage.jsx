import { useState } from 'react';
import { api } from '../../api/client';
import { useAction } from '../../api/hooks';
import { useAdminSubjects } from '../../api/admin';
import { Alert, Button, Dialog, EmptyState, Field, Loading, Menu, PageHeader } from '../../components/ui';

const INVALIDATE = [['admin'], ['subjects']];

/** Les matières enseignées. Une matière déjà utilisée se renomme mais ne se supprime pas. */
export default function SubjectsPage() {
  const subjects = useAdminSubjects();
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState(null);

  const create = useAction((body) => api('/api/subjects', { method: 'POST', body }), INVALIDATE);
  const rename = useAction(
    ({ id, name: value }) => api(`/api/subjects/${id}`, { method: 'PATCH', body: { name: value } }),
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

  const list = subjects.data ?? [];

  return (
    <>
      <PageHeader breadcrumb="Administration" title="Matières" />
      <div className="content">
        <form
          className="admin-inline-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(create.mutateAsync({ name: name.trim() }))) setName('');
          }}
        >
          <div className="field" style={{ flex: '1 1 260px', maxWidth: 360 }}>
            <label htmlFor="s-name">Nouvelle matière</label>
            <input
              id="s-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Structures de données"
            />
          </div>
          <Button type="submit" disabled={!name.trim() || create.isPending}>Ajouter</Button>
        </form>

        {(subjects.error || error) && <Alert>{subjects.error?.message ?? error}</Alert>}

        {subjects.isPending ? (
          <Loading />
        ) : list.length === 0 ? (
          <EmptyState title="Aucune matière">
            Ajoutez les matières enseignées : les enseignants y rattachent leurs évaluations.
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Matière</th>
                  <th className="num">Enseignants</th>
                  <th className="num">Évaluations</th>
                  <th className="num">Exercices en banque</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((s) => {
                  const used = s.evaluations_count + s.bank_count > 0;
                  return (
                    <tr key={s.id}>
                      <td className="cell-title">{s.name}</td>
                      <td className="num">{s.teachers_count}</td>
                      <td className="num">{s.evaluations_count}</td>
                      <td className="num">{s.bank_count}</td>
                      <td className="actions">
                        <Menu
                          label={`Actions pour ${s.name}`}
                          items={[
                            {
                              label: 'Renommer',
                              onClick: () => {
                                setNewName(s.name);
                                setRenaming(s);
                              },
                            },
                            'separator',
                            {
                              label: used ? 'Supprimer (matière utilisée)' : 'Supprimer',
                              danger: true,
                              disabled: used,
                              onClick: () => run(remove.mutateAsync(s.id)),
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

      <Dialog open={Boolean(renaming)} onClose={() => setRenaming(null)} title="Renommer la matière">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (await run(rename.mutateAsync({ id: renaming.id, name: newName.trim() }))) {
              setRenaming(null);
            }
          }}
        >
          <Field label="Nom" id="s-rename" hint="Les évaluations déjà rattachées suivent le nouveau nom.">
            <input id="s-rename" required value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          </Field>
          <div className="dialog-foot">
            <Button variant="secondary" onClick={() => setRenaming(null)}>Annuler</Button>
            <Button type="submit" disabled={!newName.trim() || rename.isPending}>Enregistrer</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
