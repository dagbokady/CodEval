import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useAction, useClassrooms } from '../../api/hooks';
import {
  ROLE_LABELS,
  ROLE_PLURALS,
  generatePassword,
  useAdminUsers,
} from '../../api/admin';
import { useAuth } from '../../auth';
import { roleLabel } from '../../roles';
import {
  Alert,
  Button,
  Chips,
  Dialog,
  EmptyState,
  Field,
  Loading,
  Menu,
  PageHeader,
  Pagination,
  PasswordInput,
  Status,
} from '../../components/ui';
import { formatRelative } from '../../format';

const ROLES = ['admin', 'teacher', 'student'];
const INVALIDATE = [['admin'], ['classrooms']];

/**
 * Les comptes de l'établissement. Les filtres vivent dans l'adresse : le
 * tableau de bord y mène directement (« étudiants sans classe », « nouveau
 * compte enseignant ») et la page se partage telle quelle.
 */
export default function UsersPage() {
  const { user: me } = useAuth();
  const [params, setParams] = useSearchParams();
  const role = params.get('role');
  const activeParam = params.get('etat');
  const withoutClass = params.get('sans-classe') === '1';
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  // « ?nouveau=teacher » ouvre directement le formulaire de création.
  const createRole = params.get('nouveau');
  const [editing, setEditing] = useState(() =>
    ROLES.includes(createRole) ? { role: createRole, classroom_id: params.get('classe') ?? '' } : null,
  );
  const [secret, setSecret] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  // Le formulaire ouvert, le paramètre n'a plus lieu d'être dans l'adresse.
  useEffect(() => {
    if (createRole) {
      const next = new URLSearchParams(params);
      next.delete('nouveau');
      next.delete('classe');
      setParams(next, { replace: true });
    }
  }, [createRole, params, setParams]);

  const users = useAdminUsers({
    role,
    active: activeParam === 'actifs' ? true : activeParam === 'desactives' ? false : undefined,
    q: debounced,
    withoutClass,
    page,
  });

  const toggle = useAction(
    ({ id, is_active }) => api(`/api/users/${id}`, { method: 'PATCH', body: { is_active } }),
    INVALIDATE,
  );
  const reset = useAction((id) => api(`/api/users/${id}/reset-password`, { method: 'POST' }));
  const remove = useAction((id) => api(`/api/users/${id}`, { method: 'DELETE' }), INVALIDATE);

  function setParam(name, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    setParams(next, { replace: true });
    setPage(1);
  }

  async function run(promise) {
    setError(null);
    try {
      return await promise;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  const items = users.data?.items ?? [];

  return (
    <>
      <PageHeader breadcrumb="Administration" title="Utilisateurs">
        <Button onClick={() => setEditing({ role: role ?? 'student' })}>+ Nouveau compte</Button>
      </PageHeader>

      <Chips
        label="Rôle"
        allLabel="Tous"
        value={role}
        onChange={(value) => setParam('role', value)}
        options={ROLES.map((r) => ({ value: r, label: ROLE_PLURALS[r] }))}
      >
        <select
          className="select-inline"
          aria-label="État du compte"
          value={activeParam ?? ''}
          onChange={(e) => setParam('etat', e.target.value)}
        >
          <option value="">Tous les états</option>
          <option value="actifs">Actifs</option>
          <option value="desactives">Désactivés</option>
        </select>
        {withoutClass && (
          <Button variant="secondary" size="small" onClick={() => setParam('sans-classe', null)}>
            Sans classe ✕
          </Button>
        )}
        <input
          type="search"
          className="search-input toolbar-end"
          aria-label="Rechercher un compte"
          placeholder="Nom, e-mail ou matricule"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </Chips>

      <div className="content">
        {(users.error || error) && <Alert>{users.error?.message ?? error}</Alert>}

        {users.isPending ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState
            variant={debounced || role || activeParam || withoutClass ? 'search' : 'empty'}
            title={debounced || role || activeParam || withoutClass ? 'Aucun résultat' : 'Aucun compte'}
            action={<Button onClick={() => setEditing({ role: role ?? 'student' })}>Créer un compte</Button>}
          >
            {debounced || role || activeParam || withoutClass
              ? 'Aucun compte ne correspond à ces filtres.'
              : "L'établissement n'a encore aucun compte."}
          </EmptyState>
        ) : (
          <>
            <div className="section-head">
              <p className="sub">
                {users.data.total} compte{users.data.total > 1 ? 's' : ''}
              </p>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Nom</th>
                    <th>Rôle</th>
                    <th>Matricule</th>
                    <th>Classes</th>
                    <th>Dernière connexion</th>
                    <th>État</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <span className="cell-title">
                          {u.full_name}
                          {u.id === me.id && <span className="sub" style={{ display: 'inline' }}> (vous)</span>}
                        </span>
                        <span className="sub">{u.email}</span>
                        {u.space && <span className="sub">{u.space}</span>}
                      </td>
                      <td>{roleLabel(u.role, u.gender)}</td>
                      <td className="mono">{u.matricule ?? <span className="cell-muted">-</span>}</td>
                      <td>
                        {u.classrooms.length ? (
                          u.classrooms.join(', ')
                        ) : u.role === 'student' ? (
                          <span className="cell-warning" style={{ marginTop: 0 }}>Aucune</span>
                        ) : (
                          <span className="cell-muted">-</span>
                        )}
                      </td>
                      <td className="sub">
                        {u.last_login_at ? formatRelative(u.last_login_at) : 'Jamais'}
                      </td>
                      <td>
                        {u.is_active ? (
                          <Status tone="success">Actif</Status>
                        ) : (
                          <Status tone="neutral">Désactivé</Status>
                        )}
                      </td>
                      <td className="actions">
                        <Menu
                          label={`Actions pour ${u.full_name}`}
                          items={[
                            { label: 'Modifier', onClick: () => setEditing(u) },
                            {
                              label: 'Réinitialiser le mot de passe',
                              onClick: async () => {
                                const res = await run(reset.mutateAsync(u.id));
                                if (res) setSecret({ user: u, password: res.password });
                              },
                            },
                            u.id !== me.id && 'separator',
                            u.id !== me.id && {
                              label: u.is_active ? 'Désactiver le compte' : 'Réactiver le compte',
                              danger: u.is_active,
                              onClick: () => run(toggle.mutateAsync({ id: u.id, is_active: !u.is_active })),
                            },
                            u.id !== me.id && {
                              label: 'Supprimer le compte…',
                              danger: true,
                              onClick: () => setRemoving(u),
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              pageSize={users.data.page_size}
              total={users.data.total}
              onChange={setPage}
            />
          </>
        )}
      </div>

      {editing && (
        <UserDialog
          key={editing.id ?? 'nouveau'}
          user={editing}
          isSelf={editing.id === me.id}
          onClose={() => setEditing(null)}
        />
      )}

      <Dialog
        open={Boolean(removing)}
        onClose={() => !remove.isPending && setRemoving(null)}
        title="Supprimer ce compte ?"
        description={
          removing &&
          `${removing.full_name} (${removing.email}) ne pourra plus se connecter. Son nom, son adresse et sa photo sont effacés ; les copies et épreuves déjà passées restent, sans son nom. La suppression est définitive.`
        }
        footer={
          <>
            <Button variant="secondary" disabled={remove.isPending} onClick={() => setRemoving(null)}>
              Annuler
            </Button>
            <Button
              variant="danger"
              disabled={remove.isPending}
              onClick={async () => {
                await run(remove.mutateAsync(removing.id));
                setRemoving(null);
              }}
            >
              {remove.isPending ? 'Suppression…' : 'Supprimer définitivement'}
            </Button>
          </>
        }
      />

      <Dialog
        open={Boolean(secret)}
        onClose={() => setSecret(null)}
        title="Mot de passe provisoire"
        description={
          secret &&
          `Transmettez-le à ${secret.user.full_name}. Il ne sera plus affiché une fois cette fenêtre fermée.`
        }
        footer={<Button onClick={() => setSecret(null)}>Terminé</Button>}
      >
        {secret && <SecretValue value={secret.password} />}
      </Dialog>
    </>
  );
}

function SecretValue({ value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="admin-secret">
      <code>{value}</code>
      <Button
        variant="secondary"
        size="small"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Copié' : 'Copier'}
      </Button>
    </div>
  );
}

/** Création (sans `id`) ou modification d'un compte. */
function UserDialog({ user, isSelf, onClose }) {
  const creating = !user.id;
  const classrooms = useClassrooms();
  const [form, setForm] = useState(() => ({
    full_name: user.full_name ?? '',
    email: user.email ?? '',
    role: user.role ?? 'student',
    matricule: user.matricule ?? '',
    gender: user.gender ?? '',
    classroom_id: user.classroom_id ?? '',
    password: creating ? generatePassword() : '',
  }));
  const [error, setError] = useState(null);
  const [created, setCreated] = useState(null);

  const save = useAction(
    (body) =>
      creating
        ? api('/api/users', { method: 'POST', body })
        : api(`/api/users/${user.id}`, { method: 'PATCH', body }),
    INVALIDATE,
  );

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (form.role === 'student' && !form.matricule.trim()) {
      setError('Le matricule est obligatoire pour un étudiant.');
      return;
    }
    const body = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      role: form.role,
      matricule: form.role === 'student' ? form.matricule.trim() || null : null,
      gender: form.gender || null,
    };
    if (creating) {
      body.password = form.password;
      if (form.role === 'student' && form.classroom_id) body.classroom_id = Number(form.classroom_id);
    }
    try {
      await save.mutateAsync(body);
      if (creating) setCreated({ name: body.full_name, email: body.email, password: form.password });
      else onClose();
    } catch (err) {
      setError(err.message);
    }
  }

  if (created) {
    return (
      <Dialog
        open
        onClose={onClose}
        title="Compte créé"
        description={`Transmettez ces identifiants à ${created.name}. Le mot de passe ne sera plus affiché.`}
        footer={<Button onClick={onClose}>Terminé</Button>}
      >
        <p className="sub" style={{ marginBottom: 6 }}>{created.email}</p>
        <SecretValue value={created.password} />
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={creating ? 'Nouveau compte' : `Modifier ${user.full_name}`}
    >
      <form onSubmit={submit}>
        <Alert>{error}</Alert>
        <Field label="Nom complet" id="u-name">
          <input id="u-name" required minLength={2} value={form.full_name} onChange={set('full_name')} autoFocus />
        </Field>
        <Field label="E-mail" id="u-email" hint="Sert d'identifiant de connexion.">
          <input id="u-email" type="email" required value={form.email} onChange={set('email')} />
        </Field>
        <div className="row">
          <Field
            label="Rôle"
            id="u-role"
            hint={
              user.space
                ? "Compte d'un espace personnel : son rôle ne se change pas."
                : !creating && form.role !== user.role
                  ? 'Changer de rôle retire les inscriptions et attributions actuelles.'
                  : undefined
            }
          >
            <select id="u-role" value={form.role} onChange={set('role')} disabled={isSelf || Boolean(user.space)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </Field>
          {form.role === 'student' && (
            <Field label="Matricule" id="u-mat">
              <input id="u-mat" required value={form.matricule} onChange={set('matricule')} />
            </Field>
          )}
        </div>
        <Field label="Sexe" id="u-gender">
          <select id="u-gender" value={form.gender} onChange={set('gender')}>
            <option value="">Non renseigné</option>
            <option value="F">Femme</option>
            <option value="M">Homme</option>
          </select>
        </Field>
        {creating && form.role === 'student' && (
          <Field label="Classe" id="u-class" hint="Un étudiant sans classe ne voit aucune épreuve.">
            <select id="u-class" value={form.classroom_id} onChange={set('classroom_id')}>
              <option value="">Aucune pour l'instant</option>
              {(classrooms.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.level ? ` · ${c.level}` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}
        {creating && (
          <Field label="Mot de passe initial" id="u-pass" hint="8 caractères minimum. Généré automatiquement, modifiable.">
            <PasswordInput id="u-pass" required minLength={8} value={form.password} onChange={set('password')} />
          </Field>
        )}
        <div className="dialog-foot">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Enregistrement…' : creating ? 'Créer le compte' : 'Enregistrer'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
