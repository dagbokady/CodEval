import { useState } from 'react';
import { api } from '../../api/client';
import { useAction, useBankExercises, useLanguages, useSubjects } from '../../api/hooks';
import { useAuth } from '../../auth';
import { DEFAULT_ELEMENTS } from '../../algoVocabulary';
import { defaultStarter, isUntouchedStarter } from '../../starterCode';
import { exerciseType, hasQuestions, needsTests } from '../../exerciseTypes';
import BaremeEditor from '../../components/BaremeEditor';
import PointsEditor from '../../components/PointsEditor';
import ToolboxEditor from '../../components/ToolboxEditor';
import TestsEditor, { ComparisonEditor } from '../../components/TestsEditor';
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
  points: '',
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
 * Un exercice pratique se construit toujours dans le même ordre, quel que soit
 * ce qu'on y écrit : ce qu'est l'exercice, l'environnement qu'on donne à
 * l'apprenant, ce que sa copie doit contenir, sur quoi on l'exécute, comment on
 * compare, et enfin ce que tout cela vaut. Seule la deuxième étape diffère : un
 * exercice de code se donne avec son squelette de départ (que l'enseignant
 * écrit comme il veut) là où un exercice algorithmique a une structure imposée
 * et se règle par les outils qu'on y autorise.
 *
 * Les points viennent toujours en dernier : on ne pèse un test qu'une fois tous
 * les tests écrits. Les types sans exécution (QCM, correspondance…) traversent
 * les mêmes temps, en plus court.
 */
const CODE_STEPS = {
  1: 'configuration',
  2: 'code de départ',
  3: 'ce que le code doit contenir',
  4: 'jeux de tests',
  5: 'comparaison des résultats',
  6: 'points',
};

const ALGO_STEPS = {
  1: 'configuration',
  2: 'outils autorisés',
  3: "ce que l'algorithme doit contenir",
  4: 'jeux de tests',
  5: 'comparaison des résultats',
  6: 'points',
};

const QUESTION_STEPS = {
  1: 'configuration',
  2: 'questions et réponses attendues',
  3: 'points',
};

function stepsOf(kind) {
  if (!needsTests(kind)) return QUESTION_STEPS;
  return kind === 'algo' ? ALGO_STEPS : CODE_STEPS;
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
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [typeChoice, setTypeChoice] = useState(false);
  const [step, setStep] = useState(1);

  const subjects = useSubjects();
  const languages = useLanguages();
  const bank = useBankExercises({ q: search, scope: scope ?? 'all', page });

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
            {step === 1 && (
              <>
              <div className="row">
                <Field label="Intitulé" id="b-title">
                  <input
                    id="b-title"
                    required
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
              {hasQuestions(form.kind) ? (
                <p className="sub" style={{ margin: '4px 0 0' }}>
                  Cet exercice porte plusieurs questions, chacune avec son propre énoncé :
                  vous les écrirez à l'étape suivante.
                </p>
              ) : (
                <Field label="Description" id="b-statement" hint="l'énoncé lu par l'apprenant">
                  <textarea
                    id="b-statement"
                    value={form.statement}
                    onChange={(e) => setForm({ ...form, statement: e.target.value })}
                  />
                </Field>
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

            {/* Étape 2 : l'environnement de travail donné à l'apprenant.
                Un exercice de code se donne avec son squelette de départ, que
                l'enseignant écrit comme il l'entend ; un exercice algorithmique
                n'en a pas (sa structure est imposée par le cours) et se règle
                par les outils qu'on y autorise. Les types sans exécution y
                écrivent leurs questions. */}
            {step === 2 && (
              <>

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

              {form.kind === 'algo' && (
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
              )}

              {form.kind === 'code' && (
                <>
                  <p className="sub" style={{ margin: '0 0 12px' }}>
                    Le code déjà présent dans l'éditeur quand l'apprenant ouvre l'exercice :
                    les inclusions, un squelette de fonction, un commentaire. Laissez vide
                    pour une page blanche.
                  </p>
                  <Field label="Code de départ (facultatif)" id="b-starter">
                    <textarea
                      id="b-starter"
                      rows={12}
                      style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
                      value={form.starter_code}
                      onChange={(e) => setForm({ ...form, starter_code: e.target.value })}
                    />
                  </Field>
                </>
              )}

              <div style={{ marginTop: 14 }}>
                <SolutionEditor
                  kind={form.kind}
                  name="b-sol"
                  settings={form.settings}
                  onChange={(settings) => setForm({ ...form, settings })}
                />
              </div>

              {!needsTests(form.kind) && (
                <p className="sub" style={{ margin: '12px 0' }}>
                  {exerciseType(form.kind).gradingNote}
                </p>
              )}

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

            {/* Étape 3 : ce que la copie doit contenir : les déclarations exigées.
                Ce qu'elles valent se décidera à la dernière étape. */}
            {step === 3 && needsTests(form.kind) && (
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

              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                  ← Étape précédente
                </Button>
                <Button type="button" onClick={() => setStep(4)}>
                  Étape suivante →
                </Button>
              </div>
              </>
            )}

            {/* Les jeux de tests ont leur étape à eux : les écrire demande d'avoir
                l'énoncé et les déclarations attendues déjà posés. */}
            {step === 4 && needsTests(form.kind) && (
              <>
              <TestsEditor
                exercise={form}
                tests={form.tests}
                template={EMPTY_TEST}
                onChange={(tests) => setForm({ ...form, tests })}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <Button type="button" variant="secondary" onClick={() => setStep(3)}>
                  ← Étape précédente
                </Button>
                <Button type="button" onClick={() => setStep(5)}>
                  Étape suivante →
                </Button>
              </div>
              </>
            )}

            {step === 5 && needsTests(form.kind) && (
              <>
              <ComparisonEditor
                exercise={form}
                tests={form.tests}
                onChange={(tests) => setForm({ ...form, tests })}
              />

              <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
                <Button type="button" variant="secondary" onClick={() => setStep(4)}>
                  ← Étape précédente
                </Button>
                <Button type="button" onClick={() => setStep(6)}>
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
      </div>

      {/* Le formulaire remplace la liste : ouvert depuis « Modifier » en bas de tableau,
          il se retrouvait sinon hors écran, la liste occupant encore toute la page. */}
      {!form && !typeChoice && (
        <>
        {bank.isPending && <Loading />}
        {bank.data?.items.length === 0 && (
          search || scope ? (
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
