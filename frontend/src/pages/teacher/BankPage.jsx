import { useState } from 'react';
import { api } from '../../api/client';
import { useAction, useBankExercises, useLanguages, useSubjects } from '../../api/hooks';
import { useAuth } from '../../auth';
import { DEFAULT_ELEMENTS } from '../../algoVocabulary';
import { defaultStarter, isUntouchedStarter } from '../../starterCode';
import { KIND_LABELS, exerciseType, hasQuestions, needsTests } from '../../exerciseTypes';
import BaremeEditor from '../../components/BaremeEditor';
import PointsEditor from '../../components/PointsEditor';
import ToolboxEditor from '../../components/ToolboxEditor';
import TestsEditor from '../../components/TestsEditor';
import SolutionEditor from '../../components/SolutionEditor';
import { autoDistribute, criteriaOf, isSimpleScoring } from '../../bareme';
import { SheetExercise } from '../../components/SubjectSheet';
import {
  QuestionListEditor,
  TrueFalseEditor,
  TypePicker,
} from '../../components/QuestionEditors';
import {
  Alert,
  Button,
  Chips,
  Disclosure,
  EmptyState,
  Field,
  Loading,
  PageHeader,
  Pagination,
  Tag,
} from '../../components/ui';

const SCOPES = [
  { value: 'mine', label: 'Mes exercices' },
  { value: 'shared', label: 'Partagés' },
];

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
 * Le titre de chaque étape de l'assistant, dans l'ordre où on les traverse.
 *
 * Un exercice pratique se construit toujours dans le même ordre : ce qu'est
 * l'exercice et l'environnement donné à l'apprenant, puis la correction (ce que
 * la copie doit contenir, les tests, la comparaison), et enfin ce que tout cela
 * vaut. L'ordre ne change pas, mais il tient sur trois écrans au lieu de six :
 * chaque écran regroupe ce qui s'écrit d'un même geste. Seul le bloc
 * d'environnement diffère : un exercice de code se donne avec son squelette de
 * départ, un exercice algorithmique se règle par les outils qu'on y autorise.
 *
 * Les points viennent toujours en dernier, déjà répartis à parts égales : on ne
 * les touche que pour peser une ligne plus qu'une autre.
 */
const PRACTICAL_STEPS = {
  1: 'énoncé et environnement',
  2: 'correction',
  3: 'points',
};

const QUESTION_STEPS = {
  1: 'énoncé et questions',
  2: 'points',
};

function stepsOf(kind) {
  return needsTests(kind) ? PRACTICAL_STEPS : QUESTION_STEPS;
}

function stepLabel(kind, step) {
  return stepsOf(kind)[step];
}

/** La dernière étape (celle des points) dépend du type d'exercice. */
function lastStep(kind) {
  return Object.keys(stepsOf(kind)).length;
}

const EMPTY_TEST = {
  name: 'Test',
  kind: 'official',
  target_id: null,
  input_types: [],
  expected_type: 'string',
  args: [],
  stdin: '',
  expected_stdout: '',
  comparison: 'trim',
  points: 1,
  timeout_ms: 2000,
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
 * pour le type qui les a créés, et le code de départ qu'en mode « code ».
 */
function withKind(form, kind) {
  const starter =
    kind === 'code' && isUntouchedStarter(form.starter_code)
      ? defaultStarter(form.language, 'code')
      : kind === 'algo'
        ? form.starter_code
        : '';
  return { ...form, kind, settings: exerciseType(kind).defaults(), starter_code: starter };
}

/**
 * Aperçu du sujet, à droite de l'éditeur : la feuille telle que l'apprenant la
 * recevra, mise à jour à chaque frappe. Elle ne montre que ce qui est déjà
 * saisi : c'est le seul moyen de voir la mise en page d'un exercice avant de
 * l'enregistrer.
 */
function ExercisePreview({ form }) {
  const exercise = {
    ...form,
    points: Number(form.points) || 0,
    settings: form.settings ?? {},
    starter_code: form.starter_code ?? '',
    tests: form.tests ?? [],
  };
  return (
    <aside className="editeur-apercu" aria-label="Aperçu du sujet">
      <div className="editeur-apercu-titre">Aperçu du sujet</div>
      <div className="editeur-apercu-feuille">
        <div className="sujet">
          {/* Sans rang : un exercice de la banque n'a pas encore de place dans un sujet. */}
          {/* showTests : l'enseignant doit voir ses jeux de tests prendre place
              sur la feuille pendant qu'il les écrit. */}
          <SheetExercise exercise={exercise} showAnswerZone={false} showTests />
        </div>
      </div>
    </aside>
  );
}

export default function BankPage() {
  const { user } = useAuth();
  const [scope, setScope] = useState(null);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [typeChoice, setTypeChoice] = useState(false);
  const [step, setStep] = useState(1);

  const subjects = useSubjects();
  const languages = useLanguages();
  const bank = useBankExercises({ q: search, kind: kindFilter, scope: scope ?? 'all', page });

  const save = useAction(
    ({ id, body }) =>
      id
        ? api(`/api/bank/exercises/${id}`, { method: 'PUT', body })
        : api('/api/bank/exercises', { method: 'POST', body }),
    [['bank']],
  );
  const remove = useAction((id) => api(`/api/bank/exercises/${id}`, { method: 'DELETE' }), [['bank']]);

  /** Le formulaire s'ouvre en haut de page : sans cela on reste sur la ligne cliquée. */
  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  /** Créer un exercice commence par choisir son type ; modifier ouvre le formulaire. */
  function startCreation() {
    setNotice(null);
    setError(null);
    setForm(null);
    setStep(1);
    setTypeChoice(true);
    toTop();
  }

  function edit(exercise) {
    setNotice(null);
    setError(null);
    setTypeChoice(false);
    setStep(1);
    setForm(
      exercise
        ? {
            ...exercise,
            kind: exercise.kind ?? 'code',
            settings: exercise.settings ?? {},
            subject_id: exercise.subject_id ?? '',
            tags: (exercise.tags ?? []).join(', '),
            tests: exercise.tests ?? [],
          }
        : { ...EMPTY },
    );
    toTop();
  }

  async function submit(event) {
    event.preventDefault();
    setError(null);
    try {
      const withTests = needsTests(form.kind);
      // Le barème simplifié se recalcule à l'enregistrement, comme dans l'éditeur
      // d'évaluation : ce qui est écrit vaut ce que l'écran des points affichait.
      const noté = isSimpleScoring(form) ? autoDistribute({ ...form, tests: form.tests ?? [] }) : form;
      const body = {
        title: form.title,
        statement: form.statement,
        language: form.language,
        points: form.points === '' || form.points === null ? undefined : Number(form.points),
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
          ? noté.tests.map((test) => ({
              ...test,
              points: Number(test.points),
              timeout_ms: Number(test.timeout_ms),
            }))
          : [],
      };
      await save.mutateAsync({ id: form.id, body });
      setNotice(form.id ? 'Exercice mis à jour.' : 'Exercice ajouté à la banque.');
      setForm(null);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <PageHeader breadcrumb="Espace enseignant" title="Banque d'exercices">
        <Button onClick={startCreation}>+ Nouvel exercice</Button>
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

        {typeChoice && (
          <TypePicker
            title="Quel type d'exercice voulez-vous ajouter à la banque ?"
            onPick={(kind) => {
              setTypeChoice(false);
              setStep(1);
              setForm(withKind({ ...EMPTY }, kind));
            }}
          />
        )}

        {form && (
          <form className="card" onSubmit={submit}>
            <h2 style={{ fontSize: 15, marginBottom: 4 }}>
              {form.id ? "Modifier l'exercice" : 'Nouvel exercice'}
            </h2>
            <p className="sub" style={{ margin: '0 0 14px' }}>
              {`Étape ${step} sur ${lastStep(form.kind)} · ${stepLabel(form.kind, step)}`}
            </p>
            <div className="editeur-apercu-duo">
              <div className="editeur-apercu-champs">
            {/* Étape 1 : l'exercice et ce que l'apprenant trouve en l'ouvrant.
                Le classement (matière, étiquettes) ne sert qu'à retrouver
                l'exercice dans la banque : il reste replié. */}
            {step === 1 && (
              <>
              <div className="row">
                <Field label="Intitulé" id="b-title">
                  <input
                    id="b-title"
                    required
                    autoFocus={!form.title}
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                  />
                </Field>
                {exerciseType(form.kind).usesLanguage && (
                  <Field label="Langage" id="b-lang">
                    <select
                      id="b-lang"
                      value={form.language}
                      onChange={(e) => setForm(withLanguage(form, e.target.value))}
                    >
                      {(languages.data ?? []).map((l) => (
                        <option key={l.key} value={l.key}>
                          {l.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </div>

              {!hasQuestions(form.kind) && (
                <Field label="Énoncé" id="b-statement" hint="ce que lit l'apprenant">
                  <textarea
                    id="b-statement"
                    value={form.statement}
                    onChange={(e) => setForm({ ...form, statement: e.target.value })}
                  />
                </Field>
              )}

              {hasQuestions(form.kind) && (
                <QuestionListEditor
                  kind={form.kind}
                  name="b"
                  settings={form.settings}
                  onChange={(settings) => setForm({ ...form, settings })}
                />
              )}

              {form.kind === 'truefalse' && (
                <TrueFalseEditor
                  settings={form.settings}
                  onChange={(patch) => setForm({ ...form, settings: { ...form.settings, ...patch } })}
                />
              )}

              {/* Les outils autorisés gardent leur bloc à eux, ouvert : c'est le
                  seul réglage qu'un exercice algorithmique ne peut pas taire. */}
              {form.kind === 'algo' && (
                <div className="form-section">
                  <h3 className="form-section-title">Outils autorisés</h3>
                  <ToolboxEditor
                    value={form.settings.allowed_elements || DEFAULT_ELEMENTS}
                    onChange={(allowed_elements) =>
                      setForm({ ...form, settings: { ...form.settings, allowed_elements } })
                    }
                    ecritureCours={Boolean(form.settings.ecriture_cours)}
                    onEcritureCours={(ecriture_cours) =>
                      setForm({ ...form, settings: { ...form.settings, ecriture_cours } })
                    }
                  />
                </div>
              )}

              {/* Le squelette du langage est déjà posé : on ne l'ouvre que pour
                  le réécrire. */}
              {form.kind === 'code' && (
                <Disclosure
                  summary="Code de départ"
                  hint="Déjà rempli avec le squelette du langage. Ouvrez pour le modifier."
                >
                  <Field label="Code présent dans l'éditeur à l'ouverture" id="b-starter">
                    <textarea
                      id="b-starter"
                      rows={12}
                      style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
                      value={form.starter_code}
                      onChange={(e) => setForm({ ...form, starter_code: e.target.value })}
                    />
                  </Field>
                </Disclosure>
              )}

              <div style={{ marginTop: 14 }}>
                <SolutionEditor
                  kind={form.kind}
                  name="b-sol"
                  settings={form.settings}
                  onChange={(settings) => setForm({ ...form, settings })}
                />
              </div>

              <Disclosure
                summary="Classement dans la banque"
                hint="Facultatif : matière et étiquettes, pour retrouver l'exercice."
              >
                <div className="row">
                  <Field label="Matière" id="b-subject">
                    <select
                      id="b-subject"
                      value={form.subject_id}
                      onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
                    >
                      <option value="">-</option>
                      {(subjects.data ?? []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Étiquettes" id="b-tags" hint="séparées par des virgules">
                    <input
                      id="b-tags"
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    />
                  </Field>
                </div>
              </Disclosure>

              {!needsTests(form.kind) && (
                <p className="sub" style={{ margin: '12px 0' }}>
                  {exerciseType(form.kind).gradingNote}
                </p>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                  Annuler
                </Button>
                <Button type="button" disabled={!form.title.trim()} onClick={() => setStep(2)}>
                  Étape suivante →
                </Button>
              </div>
              </>
            )}

            {/* Étape 2 : la correction d'un bloc. Ce que la copie doit déclarer,
                puis les tests, chacun avec sa comparaison (« trim » par défaut,
                qui convient presque toujours). Ce que tout cela vaut se décide
                à l'étape suivante. */}
            {step === 2 && needsTests(form.kind) && (
              <>
              <div style={{ margin: '0 0 16px' }}>
                <BaremeEditor
                  exercise={form}
                  criteria={criteriaOf(form)}
                  onCriteriaChange={(criteria) =>
                    setForm({ ...form, settings: { ...form.settings, criteria } })
                  }
                />
              </div>

              <TestsEditor
                exercise={form}
                tests={form.tests}
                template={EMPTY_TEST}
                showComparison
                onChange={(tests) => setForm({ ...form, tests })}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                  ← Étape précédente
                </Button>
                <Button type="button" onClick={() => setStep(3)}>
                  Étape suivante →
                </Button>
              </div>
              </>
            )}

            {/* La dernière étape, et elle seule : les points. Tout ce qui note la
                copie est écrit, on peut enfin dire ce que chaque ligne vaut. */}
            {step === lastStep(form.kind) && (
              <>
              <PointsEditor
                exercise={{ ...form, tests: form.tests ?? [] }}
                onChange={(next) => setForm({ ...form, ...next })}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setStep(lastStep(form.kind) - 1)}
                >
                  ← Étape précédente
                </Button>
                <Button type="submit" disabled={save.isPending}>
                  {form.id ? 'Enregistrer' : 'Ajouter à la banque'}
                </Button>
              </div>
              </>
            )}
                </div>

                <ExercisePreview form={form} />
              </div>
          </form>
        )}

        {!form && !typeChoice && (
        <input
          aria-label="Rechercher un exercice"
          placeholder="Rechercher un exercice…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{
            height: 34,
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--border)',
            padding: '0 14px',
            fontSize: 13,
            width: 300,
            maxWidth: '100%',
          }}
        />
        )}
        {!form && !typeChoice && (
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
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Le formulaire remplace la liste : ouvert depuis « Modifier » en bas de tableau,
          il se retrouvait sinon hors écran, la liste occupant encore toute la page. */}
      {!form && !typeChoice && (
        <>
        {bank.isPending && <Loading />}
        {bank.data?.items.length === 0 && (
          search || scope || kindFilter ? (
            <EmptyState variant="search" title="Aucun résultat">
              Aucun exercice ne correspond à cette recherche.
            </EmptyState>
          ) : (
            <EmptyState
              title="Aucun exercice dans la banque"
              action={<Button onClick={startCreation}>Créer un exercice</Button>}
            >
              Créez un exercice réutilisable, ou enregistrez-en un depuis l'éditeur d'évaluation.
            </EmptyState>
          )
        )}

        {bank.data?.items.length > 0 && (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Exercice</th>
                    <th>Points</th>
                    <th>Tests</th>
                    <th>Auteur</th>
                    <th>Utilisé</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bank.data.items.map((exercise) => (
                    <tr key={exercise.id}>
                      <td>
                        <div>{exercise.title}</div>
                        <div className="sub">
                          {[
                            exerciseType(exercise.kind).badge,
                            exerciseType(exercise.kind).usesLanguage
                              ? exercise.language.toUpperCase()
                              : null,
                            ...(exercise.tags ?? []),
                            exercise.is_shared ? 'partagé' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </td>
                      <td>{exercise.points}</td>
                      <td>
                        {!needsTests(exercise.kind) ? (
                          <Tag tone="info">auto</Tag>
                        ) : exercise.tests.length > 0 ? (
                          exercise.tests.length
                        ) : (
                          <Tag tone="warning">aucun</Tag>
                        )}
                      </td>
                      <td className="sub">{exercise.author_name}</td>
                      <td>{exercise.uses > 0 ? `${exercise.uses}×` : '-'}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button variant="secondary" size="small" onClick={() => edit(exercise)}>
                            {exercise.author_id === user.id
                              ? 'Modifier'
                              : 'Voir'}
                          </Button>
                          {(exercise.author_id === user.id) && (
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
                  ))}
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
        </>
      )}
    </>
  );
}
