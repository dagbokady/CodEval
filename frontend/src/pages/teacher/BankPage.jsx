import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAction, useBankExercises, useLanguages, useSubjects } from '../../api/hooks';
import { useAuth } from '../../auth';
import { defaultStarter, isUntouchedStarter } from '../../starterCode';
import { KIND_LABELS, exerciseType, needsTests, typeFamilies, usesLanguage } from '../../exerciseTypes';
import { autoDistribute, isSimpleScoring } from '../../bareme';
import { exerciseIssues } from '../../sheetEditor';
import { ExerciseOnSheet } from '../../components/SheetEditor';
import { ExerciseSettings } from '../../components/SheetPanel';
import { SheetExercise } from '../../components/SubjectSheet';
import {
  Alert,
  Button,
  Chips,
  EmptyState,
  Loading,
  PageHeader,
  Pagination,
  Segmented,
  Tag,
} from '../../components/ui';
import '../../styles/feuille.css';

/**
 * La banque d'exercices : des exercices prêts à reprendre dans une évaluation.
 *
 * Un exercice s'y écrit comme dans l'éditeur d'évaluation, sur la feuille et
 * d'un seul écran : l'énoncé à l'encre de la feuille, le corrigé à l'encre
 * rouge au même endroit, ce qui n'a pas de place sur un sujet dans le panneau
 * voisin. Il n'y a pas de points : ils se décident dans l'évaluation qui
 * importe l'exercice, où ils se répartissent avec ceux des autres.
 */

const SCOPES = [
  { value: 'mine', label: 'Mes exercices' },
  { value: 'shared', label: 'Partagés' },
];

/**
 * Un exercice neuf. Ses points restent ceux que le serveur donne par défaut :
 * ils ne s'affichent nulle part ici, mais le barème simplifié des tests s'en
 * sert pour se répartir.
 */
const EMPTY = {
  title: '',
  statement: '',
  language: 'c',
  points: 5,
  starter_code: defaultStarter('c', 'code'),
  kind: 'code',
  settings: {},
  subject_id: '',
  tags: '',
  is_shared: false,
  tests: [],
};

/**
 * Le squelette du langage suit le langage choisi, tant que l'enseignant ne l'a pas
 * réécrit : sinon on écraserait son propre code de départ.
 */
function withLanguage(form, language) {
  const starter = isUntouchedStarter(form.starter_code)
    ? defaultStarter(language, form.kind)
    : form.starter_code;
  return { ...form, language, starter_code: starter };
}

/**
 * Changer de type refait l'exercice à neuf : ses paramètres n'ont de sens que
 * pour le type qui les a créés. Un squelette resté intact suit le type (celui
 * du langage pour du code, rien pour un algorithme) ; un code de départ réécrit
 * par l'enseignant reste, tant que le type est pratique.
 */
function withKind(form, kind) {
  const starter = isUntouchedStarter(form.starter_code)
    ? defaultStarter(form.language, kind)
    : needsTests(kind)
      ? form.starter_code
      : '';
  return { ...form, kind, settings: exerciseType(kind).defaults(), starter_code: starter };
}

/** Ce que le serveur reçoit : ni clés d'affichage, ni nombres saisis en texte. */
function payloadOf(form) {
  const withTests = needsTests(form.kind);
  // Le barème simplifié se recalcule à l'enregistrement, comme dans l'éditeur
  // d'évaluation : un test ajouté pèse sa part.
  const noté = isSimpleScoring(form) ? autoDistribute({ ...form, tests: form.tests ?? [] }) : form;
  return {
    title: form.title.trim(),
    statement: form.statement,
    language: form.language,
    points: Number(form.points) || EMPTY.points,
    starter_code: withTests ? form.starter_code : '',
    kind: form.kind,
    settings: noté.settings,
    subject_id: form.subject_id === '' ? null : Number(form.subject_id),
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    is_shared: form.is_shared,
    tests: withTests
      ? (noté.tests ?? []).map((test) => {
          const copy = { ...test };
          delete copy._key;
          return { ...copy, points: Number(test.points), timeout_ms: Number(test.timeout_ms) };
        })
      : [],
  };
}

export default function BankPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const bank = useBankExercises({ q: search, kind: kindFilter, scope: scope ?? 'all', page });
  const remove = useAction((id) => api(`/api/bank/exercises/${id}`, { method: 'DELETE' }), [['bank']]);

  /** L'éditeur s'ouvre en haut de page : sans cela on reste sur la ligne cliquée. */
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  function create(kind) {
    setNotice(null);
    setError(null);
    setEditing({ form: withKind({ ...EMPTY }, kind), readOnly: false });
    toTop();
  }

  function open(exercise) {
    setNotice(null);
    setError(null);
    setEditing({
      form: {
        ...exercise,
        kind: exercise.kind ?? 'code',
        settings: exercise.settings ?? {},
        subject_id: exercise.subject_id ?? '',
        tags: (exercise.tags ?? []).join(', '),
        tests: exercise.tests ?? [],
      },
      readOnly: exercise.author_id !== user.id,
    });
    toTop();
  }

  // L'éditeur remplace la liste : ouvert depuis le bas du tableau, il se
  // retrouvait sinon hors écran.
  if (editing) {
    return (
      <BankEditor
        key={editing.form.id ?? 'nouveau'}
        initial={editing.form}
        readOnly={editing.readOnly}
        onClose={(message) => {
          setEditing(null);
          setNotice(message ?? null);
          toTop();
        }}
      />
    );
  }

  const filtered = Boolean(search || scope || kindFilter);

  return (
    <>
      <PageHeader breadcrumb="Espace enseignant" title="Banque d'exercices">
        <NewExerciseMenu onPick={create} />
      </PageHeader>

      <Chips
        label="Portée :"
        allLabel="Tous"
        value={scope}
        onChange={(value) => {
          setScope(value);
          setPage(1);
        }}
        options={SCOPES}
      />

      <div className="content" style={{ display: 'grid', gap: 16 }}>
        <Alert>{error}</Alert>
        {notice && !error && <Alert tone="success">{notice}</Alert>}

        <div className="banque-filtres">
          <input
            className="search-input"
            type="search"
            aria-label="Rechercher un exercice"
            placeholder="Rechercher un exercice…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="select-inline"
            aria-label="Type d'exercice"
            value={kindFilter}
            onChange={(e) => {
              setKindFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tous les types</option>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {bank.isPending && <Loading />}
        {bank.data?.items.length === 0 &&
          (filtered ? (
            <EmptyState variant="search" title="Aucun résultat">
              Aucun exercice ne correspond à cette recherche.
            </EmptyState>
          ) : (
            <div className="banque-vide">
              <EmptyState title="Aucun exercice dans la banque">
                Créez un exercice réutilisable, ou enregistrez-en un depuis le panneau d'une
                évaluation.
              </EmptyState>
              <TypeGrid onPick={create} />
            </div>
          ))}

        {bank.data?.items.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Exercice</th>
                    <th>Correction</th>
                    <th>Utilisé</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bank.data.items.map((exercise) => {
                    const mine = exercise.author_id === user.id;
                    const kind = exercise.kind ?? 'code';
                    return (
                      <tr key={exercise.id}>
                        <td>
                          <div>{exercise.title}</div>
                          <div className="banque-meta">
                            <span className="panneau-tag" data-kind={kind}>
                              {exerciseType(kind).badge}
                            </span>
                            <span className="sub">
                              {[
                                usesLanguage(kind) ? exercise.language.toUpperCase() : null,
                                exercise.subject_name,
                                ...(exercise.tags ?? []),
                                exercise.is_shared ? 'partagé' : null,
                                mine ? null : `par ${exercise.author_name ?? 'un collègue'}`,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </div>
                        </td>
                        <td>
                          {!needsTests(kind) ? (
                            <Tag tone="info">automatique</Tag>
                          ) : exercise.tests.length > 0 ? (
                            `${exercise.tests.length} test${exercise.tests.length > 1 ? 's' : ''}`
                          ) : (
                            <Tag tone="warning">aucun test</Tag>
                          )}
                        </td>
                        <td>{exercise.uses > 0 ? `${exercise.uses}×` : '-'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Button variant="secondary" size="small" onClick={() => open(exercise)}>
                              {mine ? 'Modifier' : 'Voir'}
                            </Button>
                            {mine && (
                              <Button
                                variant="secondary"
                                size="small"
                                onClick={() => {
                                  if (window.confirm(`Supprimer « ${exercise.title} » ?`)) {
                                    remove.mutateAsync(exercise.id).catch((e) => setError(e.message));
                                  }
                                }}
                              >
                                Supprimer
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={bank.data.page}
              pageSize={bank.data.page_size}
              total={bank.data.total}
              onChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}

/** Les types d'exercice, par famille : un clic ouvre l'exercice déjà réglé pour ce type. */
function TypeGrid({ onPick, autoFocus = false }) {
  return (
    <div className="banque-types">
      {typeFamilies().map((family, f) => (
        <div key={family.name} className="banque-famille">
          <span className="banque-famille-nom">{family.name}</span>
          <div className="feuille-types">
            {family.types.map((type, t) => (
              <button
                key={type.key}
                type="button"
                className="feuille-type"
                data-kind={type.key}
                autoFocus={autoFocus && f === 0 && t === 0}
                onClick={() => onPick(type.key)}
              >
                <strong>{type.badge}</strong>
                <span>{type.tagline}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** « + Nouvel exercice » : le type se choisit dans un menu, sans écran intermédiaire. */
function NewExerciseMenu({ onPick }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="banque-menu" onKeyDown={(e) => e.key === 'Escape' && close()}>
      <Button aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        + Nouvel exercice
      </Button>
      {open && (
        <>
          <button
            type="button"
            className="banque-menu-voile"
            aria-label="Fermer le menu"
            tabIndex={-1}
            onClick={close}
          />
          <div className="banque-menu-panneau" role="dialog" aria-label="Type du nouvel exercice">
            <span className="panneau-sous-titre">Quel type d’exercice ?</span>
            <TypeGrid
              autoFocus
              onPick={(kind) => {
                close();
                onPick(kind);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Un exercice de la banque, sur la feuille. `readOnly` : l'exercice d'un
 * collègue, partagé, se consulte sans se modifier.
 */
function BankEditor({ initial, readOnly, onClose }) {
  const [form, setForm] = useState(initial);
  const [view, setView] = useState('teacher');
  const [ui, setUi] = useState({});
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState(null);

  const subjects = useSubjects();
  const languages = useLanguages();
  const save = useAction(
    ({ id, body }) =>
      id
        ? api(`/api/bank/exercises/${id}`, { method: 'PUT', body })
        : api('/api/bank/exercises', { method: 'POST', body }),
    [['bank']],
  );

  // Quitter la page avec des changements non enregistrés : le navigateur prévient.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = (next) => {
    setForm(next);
    setDirty(true);
  };
  const change = (patch) => {
    setForm((current) => ({ ...current, ...(typeof patch === 'function' ? patch(current) : patch) }));
    setDirty(true);
  };
  const onUi = (patch) => setUi((current) => ({ ...current, ...patch }));

  const type = exerciseType(form.kind);
  const issues = exerciseIssues(form, { points: false });
  const titled = form.title.trim().length >= 2;
  const canEdit = !readOnly;

  function cancel() {
    if (dirty && !window.confirm('Abandonner les modifications de cet exercice ?')) return;
    onClose();
  }

  async function submit() {
    setError(null);
    try {
      await save.mutateAsync({ id: form.id, body: payloadOf(form) });
      setDirty(false);
      onClose(form.id ? `« ${form.title.trim()} » mis à jour.` : `« ${form.title.trim()} » ajouté à la banque.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumb={`Banque d'exercices · ${readOnly ? 'Consulter' : form.id ? 'Modifier' : 'Nouvel exercice'}`}
        title={form.title.trim() || 'Nouvel exercice'}
      />

      <div className="feuille-barre">
        <Segmented
          label="Affichage de la feuille"
          value={view}
          options={[
            { value: 'teacher', label: 'Avec le corrigé' },
            { value: 'student', label: 'Vue étudiant' },
          ]}
          onChange={(value) => value && setView(value)}
        />
        <div className="feuille-barre-fin">
          {canEdit && !titled && <span className="sub">Donnez un intitulé pour enregistrer.</span>}
          {canEdit && titled && dirty && <span className="sub">Modifications non enregistrées</span>}
          <Button variant="secondary" onClick={cancel}>
            {canEdit ? 'Annuler' : 'Fermer'}
          </Button>
          {canEdit && (
            <Button disabled={!titled || save.isPending} onClick={submit}>
              {save.isPending ? 'Enregistrement…' : form.id ? 'Enregistrer' : 'Ajouter à la banque'}
            </Button>
          )}
        </div>
      </div>

      {(error || readOnly) && (
        <div className="feuille-alertes">
          <Alert>{error}</Alert>
          {readOnly && (
            <Alert tone="info">
              Exercice partagé par un collègue : il se consulte ici et s’importe tel quel dans vos
              évaluations.
            </Alert>
          )}
        </div>
      )}

      <div className="feuille-atelier">
        <div className="feuille-plateau">
          <article className="feuille-papier sujet" aria-label="Feuille de l’exercice">
            <h2 className="sujet-bloc-titre">{type.sheetTitle}</h2>
            {view === 'student' ? (
              <SheetExercise exercise={form} showPoints={false} />
            ) : (
              <ExerciseOnSheet
                exercise={form}
                onChange={change}
                canEditSubject={canEdit}
                canEditCorrection={canEdit}
                ui={ui}
                onUi={onUi}
              />
            )}
          </article>
        </div>

        <aside className="feuille-panneau" aria-label="Réglages de l’exercice">
          <div className="feuille-panneau-corps">
            <section className="panneau-section">
              <span className="panneau-titre">Exercice</span>
              <label className="panneau-sous-titre" htmlFor="banque-type">
                Type
              </label>
              <select
                id="banque-type"
                className="panneau-select"
                value={form.kind}
                disabled={!canEdit}
                onChange={(e) => {
                  edit(withKind(form, e.target.value));
                  setUi({});
                }}
              >
                {typeFamilies().map((family) => (
                  <optgroup key={family.name} label={family.name}>
                    {family.types.map((t) => (
                      <option key={t.key} value={t.key}>
                        {t.badge}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {usesLanguage(form.kind) && (
                <>
                  <label className="panneau-sous-titre" htmlFor="banque-langage">
                    Langage
                  </label>
                  <select
                    id="banque-langage"
                    className="panneau-select"
                    value={form.language}
                    disabled={!canEdit}
                    onChange={(e) => edit(withLanguage(form, e.target.value))}
                  >
                    {(languages.data ?? []).map((l) => (
                      <option key={l.key} value={l.key}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <p className="panneau-aide">{type.gradingNote}</p>
            </section>

            {canEdit && (
              <section className="panneau-section">
                <span className="panneau-sous-titre">À vérifier</span>
                {issues.length === 0 ? (
                  <span className="panneau-etat panneau-etat--pret">Prêt : rien ne manque.</span>
                ) : (
                  <ul className="panneau-problemes">
                    {issues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            <ExerciseSettings
              exercise={form}
              change={change}
              name="banque"
              canEditSubject={canEdit}
              canEditCorrection={canEdit}
              showPoints={false}
            />

            <section className="panneau-section">
              <span className="panneau-sous-titre">Classement</span>
              <label className="panneau-aide" htmlFor="banque-matiere">
                Matière
              </label>
              <select
                id="banque-matiere"
                className="panneau-select"
                value={form.subject_id}
                disabled={!canEdit}
                onChange={(e) => edit({ ...form, subject_id: e.target.value })}
              >
                <option value="">Aucune</option>
                {(subjects.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <label className="panneau-aide" htmlFor="banque-etiquettes">
                Étiquettes, séparées par des virgules
              </label>
              <input
                id="banque-etiquettes"
                className="panneau-select"
                value={form.tags}
                disabled={!canEdit}
                placeholder="boucles, tableaux…"
                onChange={(e) => edit({ ...form, tags: e.target.value })}
              />
              <label className="switch">
                <input
                  type="checkbox"
                  checked={Boolean(form.is_shared)}
                  disabled={!canEdit}
                  onChange={(e) => edit({ ...form, is_shared: e.target.checked })}
                />
                <span>
                  <strong>Partager avec mes collègues</strong>
                  <span className="sub">Ils pourront l’importer dans leurs évaluations.</span>
                </span>
              </label>
            </section>

            <p className="panneau-aide">
              Pas de points ici : ils se fixent dans l’évaluation, quand vous y importez
              l’exercice.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
