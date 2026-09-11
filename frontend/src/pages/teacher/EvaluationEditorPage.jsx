import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import {
  useAction,
  useBankExercises,
  useClassrooms,
  useEvaluation,
  useLanguages,
  useSubjects,
} from '../../api/hooks';
import { Alert, Button, Field, Loading, PageHeader, Tag } from '../../components/ui';
import { SubjectSheet } from '../../components/SubjectSheet';
import { useAuth } from '../../auth';
import { DEFAULT_ELEMENTS } from '../../algoVocabulary';
import { KIND_LABELS, STATUS_LABELS, STATUS_TONES } from '../../format';
import {
  evaluationUsesLanguage,
  exerciseType,
  hasQuestions,
  needsTests,
  typeFamilies,
} from '../../exerciseTypes';
import BaremeEditor from '../../components/BaremeEditor';
import PointsEditor from '../../components/PointsEditor';
import ToolboxEditor from '../../components/ToolboxEditor';
import TestsEditor from '../../components/TestsEditor';
import { autoDistribute, criteriaOf, isSimpleScoring } from '../../bareme';
import {
  QuestionListEditor,
  TrueFalseEditor,
  TypePicker,
} from '../../components/QuestionEditors';
import { defaultStarter, isUntouchedStarter } from '../../starterCode';

/**
 * Les étapes de l'assistant, dans l'ordre où on les traverse.
 *
 * Elles suivent la même ligne que la banque d'exercices : on dit d'abord ce
 * qu'est l'évaluation, puis ce qu'elle demande, puis avec quoi l'apprenant y
 * répondra — sa boîte à outils s'il compose un algorithme, son code de départ
 * s'il programme —, puis comment la copie est vérifiée, et seulement à la fin ce
 * que tout cela vaut.
 */
const STEPS = [
  'Paramètres',
  'Exercices',
  'Outils & code de départ',
  'Barème & tests',
  'Points',
  'Modalités de passage',
  'Affectation & publication',
];

const EMPTY_EXERCISE = {
  id: null,
  title: '',
  statement: '',
  language: 'c',
  points: 5,
  starter_code: '',
  kind: 'code',
  settings: {},
  tests: [],
};

/**
 * Nouvel exercice du type demandé. Le type est choisi avant tout le reste :
 * il détermine l'éditeur affiché et les paramètres pré-remplis (choix d'un QCM,
 * paires d'une correspondance, affirmations d'un Vrai/Faux…).
 */
function newExercise(language, kind = 'code') {
  return {
    ...EMPTY_EXERCISE,
    kind,
    language,
    settings: exerciseType(kind).defaults(),
    starter_code: defaultStarter(language, kind),
  };
}

/** Un test copié perd son identité : il appartiendra à sa nouvelle destination. */
function stripIds(test) {
  const copy = { ...test };
  delete copy.id;
  delete copy.position;
  return copy;
}

const EMPTY_TEST = {
  id: null,
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

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

const DEFAULT_FORM = {
  title: '',
  kind: 'devoir',
  description: '',
  instructions: '',
  language: 'c',
  duration_minutes: 90,
  scheduled_start: '',
  classroom_id: '',
  subject_id: '',
  total_points: 20,
  rules: {
    fullscreen: true,
    block_paste: true,
    allow_early_submit: true,
    track_focus: true,
    // Une sortie d'épreuve, et la copie se ferme : c'est la règle par défaut,
    // celle qu'un surveillant applique en salle. L'enseignant peut l'assouplir.
    max_incidents: 1,
    // La classe voit qu'une épreuve l'attend. L'enseignant peut préparer une
    // interrogation sans l'annoncer : elle n'apparaîtra qu'à son ouverture.
    announce_to_students: true,
  },
};

function formFrom(data) {
  if (!data) return DEFAULT_FORM;
  return {
    title: data.title,
    kind: data.kind ?? 'devoir',
    description: data.description,
    instructions: data.instructions,
    language: data.language,
    duration_minutes: data.duration_minutes,
    scheduled_start: toLocalInput(data.scheduled_start),
    classroom_id: data.classroom_id ?? '',
    subject_id: data.subject_id ?? '',
    total_points: data.total_points,
    rules: { ...DEFAULT_FORM.rules, ...data.rules },
  };
}

export default function EvaluationEditorPage() {
  const { evaluationId } = useParams();
  const evaluation = useEvaluation(evaluationId);

  if (evaluationId && evaluation.isPending) return <Loading />;
  if (evaluation.error) {
    return (
      <div className="content">
        <Alert>{evaluation.error.message}</Alert>
      </div>
    );
  }
  // Remontage sur changement d'évaluation : l'état du formulaire suit la donnée serveur.
  return (
    <Editor
      key={evaluationId ?? 'nouvelle'}
      evaluationId={evaluationId}
      evaluation={evaluation.data}
    />
  );
}

function Editor({ evaluationId, evaluation }) {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const classrooms = useClassrooms();
  const subjects = useSubjects();
  const languages = useLanguages();

  const [form, setForm] = useState(() => formFrom(evaluation));
  const [exercises, setExercises] = useState(() =>
    (evaluation?.exercises ?? []).map((e) => ({ ...e, tests: e.tests ?? [] })),
  );

  const readOnly = evaluation && !['draft', 'scheduled'].includes(evaluation.status);
  const barème = useMemo(
    () => exercises.reduce((sum, ex) => sum + Number(ex.points || 0), 0),
    [exercises],
  );
  /* Une épreuve entièrement algorithmique ne se compose dans aucun langage :
     la question disparaît plutôt que d'appeler une réponse sans objet. */
  const langageUtile = useMemo(() => evaluationUsesLanguage(exercises), [exercises]);

  const saveParams = useAction(
    (payload) =>
      evaluationId
        ? api(`/api/evaluations/${evaluationId}`, { method: 'PATCH', body: payload })
        : api('/api/evaluations', { method: 'POST', body: payload }),
    [['evaluations'], ['evaluation', evaluationId]],
  );
  const saveExercises = useAction(
    (payload) => api(`/api/evaluations/${evaluationId}/exercises`, { method: 'PUT', body: payload }),
    [['evaluation', evaluationId]],
  );
  const publish = useAction(
    () => api(`/api/evaluations/${evaluationId}/publish`, { method: 'POST' }),
    [['evaluations'], ['evaluation', evaluationId]],
  );
  const start = useAction(
    () => api(`/api/evaluations/${evaluationId}/start`, { method: 'POST' }),
    [['evaluations'], ['evaluation', evaluationId]],
  );

  function payloadFromForm() {
    return {
      ...form,
      duration_minutes: Number(form.duration_minutes),
      total_points: Number(form.total_points),
      classroom_id: form.classroom_id === '' ? null : Number(form.classroom_id),
      subject_id: form.subject_id === '' ? null : Number(form.subject_id),
      scheduled_start: form.scheduled_start ? new Date(form.scheduled_start).toISOString() : null,
    };
  }

  async function handleSaveStep1(next = true) {
    setError(null);
    if (form.title.trim().length < 2) {
      setError('Le titre est obligatoire.');
      return;
    }
    try {
      const saved = await saveParams.mutateAsync(payloadFromForm());
      setNotice('Paramètres enregistrés.');
      if (!evaluationId) navigate(`/evaluations/${saved.id}`, { replace: true });
      if (next) setStep(1);
    } catch (err) {
      setError(err.message);
    }
  }

  /* Le récapitulatif est le point d'arrivée de l'assistant : on y publie
     l'évaluation sans attendre un clic de plus. Sans cela, un devoir daté
     restait en brouillon — invisible pour les étudiants, et jamais ouvert par
     le planificateur, qui ne réveille que les évaluations publiées. */
  async function publishIfReady() {
    if (!evaluationId) return;
    if (status !== 'draft') return;
    if (!form.classroom_id || exercises.length === 0) return;
    try {
      await publish.mutateAsync();
      setNotice(
        form.scheduled_start
          ? 'Évaluation programmée : les étudiants la voient et elle s’ouvrira toute seule à l’heure dite.'
          : 'Évaluation publiée : lancez la session quand vous voulez.',
      );
    } catch (err) {
      setError(err.message);
    }
  }

  /* Les modalités vivent dans les paramètres de l'épreuve, pas dans ses
     exercices : elles s'enregistrent par le même appel que l'étape 1, puis on
     passe à la publication — c'est le dernier réglage avant que la classe voie
     quoi que ce soit. */
  async function handleSaveModalities() {
    setError(null);
    try {
      await saveParams.mutateAsync(payloadFromForm());
      setNotice('Modalités de passage enregistrées.');
      setStep(6);
      await publishIfReady();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleSaveExercises(next) {
    setError(null);
    if (exercises.some((ex) => !ex.title.trim())) {
      setError('Chaque exercice doit avoir un intitulé.');
      return;
    }
    // Le barème simplifié se recalcule ici : un test ajouté à l'étape précédente
    // doit peser sa part avant qu'on l'envoie — et l'écran des points doit
    // montrer cette part, pas la valeur héritée du modèle de test.
    const prepared = exercises.map((ex) => (isSimpleScoring(ex) ? autoDistribute(ex) : ex));
    setExercises(prepared);
    try {
      await saveExercises.mutateAsync(
        prepared.map((exercise) => ({
          ...exercise,
          points: Number(exercise.points),
          tests: exercise.tests.map((t) => ({
            ...t,
            points: Number(t.points),
            timeout_ms: Number(t.timeout_ms),
          })),
        })),
      );
      setNotice('Exercices et jeux de tests enregistrés.');
      if (next !== undefined) setStep(next);
    } catch (err) {
      setError(err.message);
    }
  }

  const status = evaluation?.status;

  return (
    <>
      <PageHeader
        breadcrumb="Évaluations · Nouvelle"
        title={form.title || 'Nouvelle évaluation'}
      >
        {status && <Tag tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Tag>}
      </PageHeader>

      <div className="stepper">
        {STEPS.map((label, index) => (
          <button
            key={label}
            type="button"
            className="step"
            aria-current={step === index ? 'step' : undefined}
            onClick={() => (evaluationId || index === 0) && setStep(index)}
          >
            <span className="num">{index + 1}</span>
            Étape {index + 1} · {label}
            {index < STEPS.length - 1 && <span className="sep">———</span>}
          </button>
        ))}
      </div>

      <div className="content">
        <Alert>{error}</Alert>
        {notice && !error && <Alert tone="success">{notice}</Alert>}
        {readOnly && (
          <Alert tone="info">
            L'évaluation est {STATUS_LABELS[status].toLowerCase()} : seuls les jeux de tests et les
            barèmes restent modifiables (étapes 4 et 5), les productions ne sont jamais altérées.
          </Alert>
        )}

        {step === 0 && (
          <section className="card">
            <h2 style={{ fontSize: 15, marginBottom: 16 }}>Informations générales</h2>
            <div className="row">
              <Field label="Titre de l'évaluation" id="title">
                <input
                  id="title"
                  value={form.title}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>
              <Field label="Type" id="kind">
                <select
                  id="kind"
                  value={form.kind}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, kind: e.target.value })}
                >
                  <option value="devoir">Devoir</option>
                  <option value="interro">Interrogation</option>
                  <option value="examen">Examen</option>
                </select>
              </Field>
            </div>
            <div className="row">
              <Field label="Classe" id="classroom">
                <select
                  id="classroom"
                  value={form.classroom_id}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, classroom_id: e.target.value })}
                >
                  <option value="">—</option>
                  {(classrooms.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.students_count})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Matière" id="subject">
                <select
                  id="subject"
                  value={form.subject_id}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
                >
                  <option value="">—</option>
                  {(subjects.data ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="row">
              {langageUtile ? (
                <Field
                  label="Langage autorisé"
                  id="language"
                  hint="S'applique aux exercices de code. Les exercices algorithmiques s'écrivent en blocs."
                >
                  <select
                    id="language"
                    value={form.language}
                    disabled={readOnly}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                  >
                    {(languages.data ?? []).map((l) => (
                      <option key={l.key} value={l.key}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : (
                <Field label="Langage autorisé">
                  <p className="sub" style={{ margin: 0 }}>
                    Épreuve algorithmique : la copie se compose en blocs de pseudo-code, aucun
                    langage de programmation n'est à choisir.
                  </p>
                </Field>
              )}
              <Field label="Durée (minutes)" id="duration">
                <input
                  id="duration"
                  type="number"
                  min="5"
                  max="600"
                  value={form.duration_minutes}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                />
              </Field>
              <Field label="Date de début" id="start">
                <input
                  id="start"
                  type="datetime-local"
                  value={form.scheduled_start}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, scheduled_start: e.target.value })}
                />
              </Field>
              <Field label="Barème total (points)" id="points">
                <input
                  id="points"
                  type="number"
                  min="1"
                  value={form.total_points}
                  disabled={readOnly}
                  onChange={(e) => setForm({ ...form, total_points: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Consignes affichées à l'apprenant" id="instructions">
              <textarea
                id="instructions"
                value={form.instructions}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, instructions: e.target.value })}
              />
            </Field>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <Button variant="secondary" onClick={() => navigate('/evaluations')}>
                Annuler
              </Button>
              <Button disabled={readOnly || saveParams.isPending} onClick={() => handleSaveStep1(true)}>
                Continuer → Exercices
              </Button>
            </div>
          </section>
        )}

        {step === 1 && (
          <ExercisesStep
            exercises={exercises}
            setExercises={setExercises}
            readOnly={readOnly}
            language={form.language}
            onError={setError}
            onNotice={setNotice}
            barème={barème}
            onBack={() => setStep(0)}
            onNext={() => handleSaveExercises(2)}
            classrooms={classrooms.data}
            subjects={subjects.data}
            pending={saveExercises.isPending}
            form={form}
          />
        )}

        {step === 2 && (
          <EnvironmentStep
            exercises={exercises}
            setExercises={setExercises}
            readOnly={readOnly}
            onBack={() => setStep(1)}
            onNext={() => handleSaveExercises(3)}
            pending={saveExercises.isPending}
          />
        )}

        {step === 3 && (
          <TestsStep
            exercises={exercises}
            setExercises={setExercises}
            barème={barème}
            onBack={() => setStep(2)}
            onNext={() => handleSaveExercises(4)}
            pending={saveExercises.isPending}
          />
        )}

        {step === 4 && (
          <PointsStep
            exercises={exercises}
            setExercises={setExercises}
            barème={barème}
            total={Number(form.total_points) || 0}
            readOnly={readOnly}
            onBack={() => setStep(3)}
            onNext={() => handleSaveExercises(5)}
            pending={saveExercises.isPending}
          />
        )}

        {step === 5 && (
          <ModalitiesStep
            form={form}
            setForm={setForm}
            readOnly={readOnly}
            pending={saveParams.isPending}
            onBack={() => setStep(4)}
            onNext={async () => {
              await handleSaveModalities();
            }}
          />
        )}

        {step === 6 && (
          <section className="card">
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>Affectation & publication</h2>
            <ul style={{ display: 'grid', gap: 8, marginBottom: 20 }}>
              <li className="sub">
                Classe :{' '}
                {(classrooms.data ?? []).find((c) => String(c.id) === String(form.classroom_id))
                  ?.name ?? 'non affectée'}
              </li>
              <li className="sub">Exercices : {exercises.length}</li>
              <li className="sub">Barème cumulé : {barème} points</li>
              <li className="sub">Participants inscrits : {evaluation?.participants_count ?? 0}</li>
              <li className="sub">
                Programmation :{' '}
                {form.scheduled_start
                  ? new Date(form.scheduled_start).toLocaleString('fr-FR')
                  : 'aucune date — lancement manuel'}
              </li>
              <li className="sub">
                Annonce :{' '}
                {form.rules.announce_to_students !== false
                  ? 'les étudiants voient l’épreuve dès la publication'
                  : 'non annoncée — visible seulement au lancement de la session'}
              </li>
              <li className="sub">
                Sorties autorisées : {form.rules.max_incidents ?? 1}
                {form.rules.max_incidents ? ' avant verrouillage' : ' — aucun verrouillage'}
              </li>
            </ul>

            {status === 'scheduled' ? (
              <Alert tone="success">
                {form.scheduled_start
                  ? "Épreuve programmée : elle apparaît dès maintenant chez les étudiants et s’ouvrira automatiquement à l’heure prévue. Le bouton ci-dessous ne sert qu’à démarrer plus tôt."
                  : 'Épreuve publiée : les étudiants la voient mais ne pourront composer qu’une fois la session lancée.'}
              </Alert>
            ) : (
              <Alert tone="info">
                Épreuve encore en brouillon : affectez une classe et au moins un exercice pour
                qu’elle parvienne aux étudiants.
              </Alert>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <Button variant="secondary" onClick={() => setStep(5)}>
                Étape précédente
              </Button>
              <Button
                variant="secondary"
                disabled={status !== 'draft' || publish.isPending}
                onClick={publishIfReady}
              >
                Programmer maintenant
              </Button>
              <Button
                disabled={!['draft', 'scheduled'].includes(status) || start.isPending}
                onClick={() =>
                  start.mutateAsync().then(
                    () => navigate(`/evaluations/${evaluationId}/session`),
                    (err) => setError(err.message),
                  )
                }
              >
                Lancer la session
              </Button>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

/**
 * Les modalités de passage : la surveillance, ce qui est permis pendant
 * l'épreuve, et si la classe sait qu'elle est attendue.
 *
 * Elles ont leur propre étape parce qu'on ne les règle pas au moment où l'on
 * saisit un titre : on les règle une fois le sujet écrit, juste avant de le
 * publier — c'est là qu'on décide comment il sera composé.
 */
function ModalitiesStep({ form, setForm, readOnly, onBack, onNext, pending }) {
  const rules = form.rules;
  const setRule = (key, value) => setForm({ ...form, rules: { ...rules, [key]: value } });

  return (
    <section className="card">
      <h2 style={{ fontSize: 15, marginBottom: 6 }}>Modalités de passage</h2>
      <p className="sub" style={{ marginBottom: 16 }}>
        Ce que l'apprenant peut faire pendant l'épreuve, et ce que la surveillance retient.
      </p>

      {[
        ['fullscreen', 'Mode plein écran obligatoire', "L'apprenant ne peut pas quitter l'onglet pendant l'épreuve."],
        ['block_paste', 'Bloquer le copier-coller', 'Désactive le collage de code externe dans l’éditeur.'],
        ['allow_early_submit', 'Autoriser la soumission anticipée', 'L’apprenant peut rendre sa copie avant la fin.'],
        ['track_focus', 'Détecter les sorties d’épreuve', 'Changement d’onglet, perte de focus et sortie du plein écran sont journalisés.'],
      ].map(([key, title, hint]) => (
        <label className="switch" key={key}>
          <input
            type="checkbox"
            checked={Boolean(rules[key])}
            disabled={readOnly}
            onChange={(e) => setRule(key, e.target.checked)}
          />
          <span>
            <strong>{title}</strong>
            <span className="sub">{hint}</span>
          </span>
        </label>
      ))}

      {/* Prévenir ou non : une interrogation surprise se prépare comme les
          autres, mais ne doit pas s'afficher dans l'espace des étudiants avant
          d'être ouverte. */}
      <label className="switch">
        <input
          type="checkbox"
          checked={rules.announce_to_students !== false}
          disabled={readOnly}
          onChange={(e) => setRule('announce_to_students', e.target.checked)}
        />
        <span>
          <strong>Annoncer l’épreuve aux étudiants</strong>
          <span className="sub">
            {rules.announce_to_students !== false
              ? 'La classe voit dès la publication qu’une épreuve est programmée, avec sa date et sa durée.'
              : 'Épreuve non annoncée : elle n’apparaîtra dans l’espace des étudiants qu’au lancement de la session.'}
          </span>
        </span>
      </label>

      <Field
        label="Nombre de sorties autorisées"
        id="max-incidents"
        hint="Au-delà, la copie est verrouillée automatiquement. 0 pour ne jamais verrouiller : les sorties restent seulement signalées."
      >
        <input
          id="max-incidents"
          type="number"
          min="0"
          max="20"
          value={rules.max_incidents ?? 1}
          disabled={readOnly}
          onChange={(e) => setRule('max_incidents', Number(e.target.value))}
        />
      </Field>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <Button variant="secondary" onClick={onBack}>
          Étape précédente
        </Button>
        <Button disabled={pending} onClick={onNext}>
          Continuer → Affectation & publication
        </Button>
      </div>
    </section>
  );
}

function SheetPreview({ form, exercises, classrooms, subjects }) {
  const { organization } = useAuth();
  const classroom = (classrooms ?? []).find((c) => String(c.id) === String(form.classroom_id));
  const subject = (subjects ?? []).find((s) => String(s.id) === String(form.subject_id));

  return (
    <div className="sheet-preview">
      <div className="sheet-paper">
        <SubjectSheet
          organization={organization}
          classroom={classroom?.name}
          subject={subject?.name}
          title={form.title}
          instructions={form.instructions}
          durationMinutes={form.duration_minutes}
          language={evaluationUsesLanguage(exercises) ? form.language : null}
          date={form.scheduled_start}
          exercises={exercises}
          emptyLabel="Ajoutez des exercices pour voir l'aperçu de votre sujet ici."
        />
      </div>
    </div>
  );
}

function ExercisesStep({
  exercises,
  setExercises,
  readOnly,
  language,
  barème,
  onBack,
  onNext,
  pending,
  onError,
  onNotice,
  form,
  classrooms,
  subjects,
}) {
  const [picker, setPicker] = useState(false);
  // Créer un exercice commence par choisir son type : le formulaire n'apparaît
  // qu'ensuite, déjà réglé pour ce type.
  const [typePicker, setTypePicker] = useState(false);
  const update = (index, patch) =>
    setExercises(exercises.map((ex, i) => (i === index ? { ...ex, ...patch } : ex)));

  /**
   * Changer de type refait l'exercice à neuf : ses paramètres (choix, paires,
   * affirmations…) n'ont de sens que pour le type qui les a créés, et le code de
   * départ qu'en mode « code ». Seul le barème par tests, propre à l'enseignant,
   * est conservé.
   */
  function changeKind(index, exercise, kind) {
    if (kind === (exercise.kind ?? 'code')) return;
    const patch = { kind, settings: exerciseType(kind).defaults() };
    if (exercise.settings?.scoring_mode) {
      patch.settings.scoring_mode = exercise.settings.scoring_mode;
    }
    if (kind === 'code') {
      if (isUntouchedStarter(exercise.starter_code)) {
        patch.starter_code = defaultStarter(exercise.language ?? 'c', 'code');
      }
    } else {
      patch.starter_code = kind === 'algo' ? exercise.starter_code : '';
    }
    update(index, patch);
  }

  const saveToBank = useAction((body) => api('/api/bank/exercises', { method: 'POST', body }), [
    ['bank'],
  ]);

  /**
   * Import : copie complète de l'exercice, type et paramètres compris. Sans le
   * `kind` ni les `settings`, un QCM ou une correspondance repartait en « code »
   * et s'affichait vide dans l'évaluation.
   */
  function importFromBank(item) {
    const kind = item.kind ?? 'code';
    setExercises((current) => [
      ...current,
      {
        id: null,
        title: item.title,
        statement: item.statement,
        language: item.language,
        points: item.points,
        kind,
        settings: item.settings ?? {},
        starter_code:
          kind === 'code' && !item.starter_code?.trim()
            ? defaultStarter(item.language, 'code')
            : (item.starter_code ?? ''),
        tests: (item.tests ?? []).map(stripIds),
      },
    ]);
    api(`/api/bank/exercises/${item.id}/used`, { method: 'POST' }).catch(() => {});
    onNotice(`« ${item.title} » importé depuis la banque.`);
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 8 }}>
        <h2 style={{ fontSize: 15 }}>Exercices & objectifs</h2>
        <span className="sub" style={{ marginLeft: 4 }}>{barème} points</span>
        {!readOnly && (
          <>
            <Button
              variant="secondary"
              size="small"
              style={{ marginLeft: 'auto' }}
              onClick={() => setPicker((open) => !open)}
            >
              {picker ? 'Fermer la banque' : 'Importer depuis la banque'}
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() => { setTypePicker((open) => !open); setPicker(false); }}
            >
              {typePicker ? 'Fermer' : '+ Ajouter un exercice'}
            </Button>
          </>
        )}
      </div>

      <div className="exercises-layout">
        <div className="exercises-editor">
          {picker && <BankPicker language={language} onPick={importFromBank} />}

          {typePicker && !readOnly && (
            <TypePicker
              onPick={(kind) => {
                setExercises([...exercises, newExercise(language, kind)]);
                setTypePicker(false);
              }}
            />
          )}

          {exercises.length === 0 && !typePicker && (
            <div className="card">
              <p className="sub">Aucun exercice. Ajoutez-en au moins un pour pouvoir lancer la session.</p>
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            {exercises.map((exercise, index) => (
              <article className="card" key={exercise.id ?? `new-${index}`}>
                <div className="row">
                  <Field label={`Exercice ${index + 1} — intitulé`} id={`t-${index}`}>
                    <input
                      id={`t-${index}`}
                      value={exercise.title}
                      disabled={readOnly}
                      onChange={(e) => update(index, { title: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="row">
                  <Field label="Type d'exercice" id={`k-${index}`}>
                    <select
                      id={`k-${index}`}
                      value={exercise.kind ?? 'code'}
                      disabled={readOnly}
                      onChange={(e) => changeKind(index, exercise, e.target.value)}
                    >
                      {typeFamilies().map((family) => (
                        <optgroup key={family.name} label={family.name}>
                          {family.types.map((type) => (
                            <option key={type.key} value={type.key}>
                              {type.label} — {type.tagline}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </Field>
                </div>

                {!hasQuestions(exercise.kind) && (
                  <Field label="Énoncé" id={`s-${index}`}>
                    <textarea
                      id={`s-${index}`}
                      value={exercise.statement}
                      disabled={readOnly}
                      onChange={(e) => update(index, { statement: e.target.value })}
                    />
                  </Field>
                )}

                {hasQuestions(exercise.kind) && (
                  <QuestionListEditor
                    kind={exercise.kind}
                    name={`q-${index}`}
                    settings={exercise.settings ?? {}}
                    readOnly={readOnly}
                    onChange={(settings) => update(index, { settings })}
                  />
                )}

                {exercise.kind === 'truefalse' && (
                  <TrueFalseEditor
                    settings={exercise.settings ?? {}}
                    readOnly={readOnly}
                    onChange={(s) => update(index, { settings: { ...exercise.settings, ...s } })}
                  />
                )}

                {!readOnly && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setExercises(exercises.filter((_, i) => i !== index))}
                    >
                      Supprimer l'exercice
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      disabled={saveToBank.isPending || !exercise.title.trim()}
                      onClick={() =>
                        saveToBank
                          .mutateAsync({
                            title: exercise.title,
                            statement: exercise.statement,
                            language: exercise.language,
                            points: Number(exercise.points),
                            kind: exercise.kind ?? 'code',
                            settings: exercise.settings ?? {},
                            starter_code: exercise.starter_code ?? '',
                            is_shared: false,
                            tests: (exercise.tests ?? []).map(stripIds),
                          })
                          .then(
                            () => onNotice(`« ${exercise.title} » enregistré dans la banque.`),
                            (err) => onError(err.message),
                          )
                      }
                    >
                      Enregistrer dans la banque
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>

        <SheetPreview
          form={form}
          exercises={exercises}
          classrooms={classrooms}
          subjects={subjects}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <Button variant="secondary" onClick={onBack}>
          Étape précédente
        </Button>
        <Button disabled={pending} onClick={onNext}>
          Étape suivante →
        </Button>
      </div>
    </section>
  );
}

/**
 * L'étape « Outils & code de départ » : avec quoi l'apprenant compose sa copie.
 *
 * Les deux exercices pratiques se règlent au même endroit, parce que c'est la
 * même question posée deux fois — que trouve l'apprenant devant lui en ouvrant
 * l'exercice ? Un exercice algorithmique répond par sa boîte à outils : la
 * structure de l'algorithme, elle, est celle du cours et ne se discute pas. Un
 * exercice de code répond par son squelette de départ, que l'enseignant écrit
 * comme il l'entend. Les questions fermées ne traversent pas cette étape.
 */
function EnvironmentStep({ exercises, setExercises, readOnly, onBack, onNext, pending }) {
  const update = (index, patch) =>
    setExercises(exercises.map((ex, i) => (i === index ? { ...ex, ...patch } : ex)));

  const pratiques = exercises
    .map((exercise, index) => ({ exercise, index }))
    .filter(({ exercise }) => needsTests(exercise.kind));

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 10 }}>
        <h2 style={{ fontSize: 15 }}>Outils & code de départ</h2>
        <span className="sub">
          {pratiques.length} exercice{pratiques.length > 1 ? 's' : ''} pratique
          {pratiques.length > 1 ? 's' : ''}
        </span>
      </div>

      {pratiques.length === 0 ? (
        <div className="card">
          <p className="sub">
            Aucun exercice pratique : les questions fermées se corrigent sur les réponses
            attendues, il n'y a pas d'environnement à régler.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {pratiques.map(({ exercise, index }) => (
            <article className="card" key={exercise.id ?? `new-${index}`}>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 10 }}>
                <strong style={{ fontSize: 14 }}>
                  Exercice {index + 1} · {exercise.title || 'sans titre'}
                </strong>
                <span className="sub">{exerciseType(exercise.kind).label}</span>
              </div>

              {exercise.kind === 'algo' ? (
                <ToolboxEditor
                  value={exercise.settings?.allowed_elements ?? DEFAULT_ELEMENTS}
                  readOnly={readOnly}
                  onChange={(allowed) =>
                    update(index, {
                      settings: { ...exercise.settings, allowed_elements: allowed },
                    })
                  }
                />
              ) : (
                <>
                  <p className="sub" style={{ margin: '0 0 10px' }}>
                    Le code déjà présent dans l'éditeur quand l'apprenant ouvre l'exercice :
                    les inclusions, un squelette de fonction, un commentaire. Laissez vide pour
                    une page blanche.
                  </p>
                  <Field label="Code de départ (facultatif)" id={`c-${index}`}>
                    <textarea
                      id={`c-${index}`}
                      rows={10}
                      style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
                      value={exercise.starter_code ?? ''}
                      disabled={readOnly}
                      onChange={(e) => update(index, { starter_code: e.target.value })}
                    />
                  </Field>
                </>
              )}
            </article>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <Button variant="secondary" onClick={onBack}>
          Étape précédente
        </Button>
        <Button disabled={pending} onClick={onNext}>
          Étape suivante →
        </Button>
      </div>
    </section>
  );
}

function BankPicker({ language, onPick }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Un QCM ou une correspondance ne dépend d'aucun langage : filtrer sur celui de
  // l'évaluation les rendait introuvables. Le filtre reste proposé, jamais imposé.
  const [langFilter, setLangFilter] = useState(language);
  const bank = useBankExercises({ q: search, language: langFilter || undefined, page });
  const totalPages = bank.data ? Math.ceil((bank.data.total ?? 0) / 20) : 1;

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>Banque d'exercices</strong>
        <select
          aria-label="Filtrer par langage"
          value={langFilter}
          onChange={(e) => { setLangFilter(e.target.value); setPage(1); }}
          style={{ marginLeft: 'auto', height: 30, fontSize: 13, width: 'auto' }}
        >
          <option value={language}>{language.toUpperCase()} (langage de l'évaluation)</option>
          <option value="">Tous les langages et QCM</option>
        </select>
        <input
          aria-label="Rechercher dans la banque"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{
            height: 30,
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--border)',
            padding: '0 14px',
            fontSize: 13,
          }}
        />
      </div>
      {bank.isPending && <Loading />}
      {bank.data?.items.length === 0 && (
        <p className="sub">
          {langFilter
            ? `Aucun exercice ${langFilter.toUpperCase()} disponible dans la banque.`
            : "Aucun exercice disponible dans la banque."}
        </p>
      )}
      <div style={{ display: 'grid', gap: 8 }}>
        {(bank.data?.items ?? []).map((item) => (
          <div
            key={item.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 0',
              borderTop: '1px solid var(--border-soft)',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div>{item.title}</div>
              <div className="sub">
                {[
                  KIND_LABELS[item.kind ?? 'code'],
                  `${item.points} pts`,
                  needsTests(item.kind)
                    ? `${item.tests.length} test${item.tests.length > 1 ? 's' : ''}`
                    : 'correction auto',
                  item.author_name,
                  item.is_shared ? 'partagé' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            <Button
              variant="secondary"
              size="small"
              style={{ marginLeft: 'auto' }}
              onClick={() => onPick(item)}
            >
              Importer
            </Button>
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="pagination" style={{ justifyContent: 'center', padding: '10px 0 0' }}>
          <Button
            variant="secondary"
            size="small"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            ← Précédent
          </Button>
          <span className="sub">Page {page} / {totalPages}</span>
          <Button
            variant="secondary"
            size="small"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Suivant →
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * L'étape des points — la dernière avant la publication, et la seule où l'on
 * parle de notes.
 *
 * Les points ne se saisissent nulle part ailleurs : ni à côté de l'intitulé, où
 * ils étaient décidés avant même de savoir ce que l'exercice demanderait, ni sur
 * la carte d'un test, où l'on pesait un test sans connaître les suivants. On les
 * alloue ici, une fois les énoncés écrits et les barèmes posés — d'abord ce que
 * vaut chaque exercice, puis, si l'enseignant le veut, ce que vaut chaque ligne
 * de son barème — avec sous les yeux le total annoncé de l'évaluation et l'écart
 * qui reste à combler.
 */
function PointsStep({ exercises, setExercises, barème, total, readOnly, onBack, onNext, pending }) {
  const [ouvert, setOuvert] = useState(null);

  const replace = (index, exercise) =>
    setExercises(exercises.map((ex, i) => (i === index ? exercise : ex)));

  const update = (index, points) => {
    const next = { ...exercises[index], points };
    replace(index, isSimpleScoring(next) ? autoDistribute(next) : next);
  };

  const écart = Math.round((barème - total) * 100) / 100;
  const répartir = () => {
    if (exercises.length === 0) return;
    const part = Math.round((total / exercises.length) * 100) / 100;
    // Le dernier exercice absorbe les centièmes perdus à l'arrondi : le total
    // affiché doit tomber juste, sinon l'écart signalé ne partirait jamais.
    const reste = Math.round((total - part * (exercises.length - 1)) * 100) / 100;
    setExercises(
      exercises.map((ex, i) => {
        const noté = { ...ex, points: i === exercises.length - 1 ? reste : part };
        return isSimpleScoring(noté) ? autoDistribute(noté) : noté;
      }),
    );
  };

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 10 }}>
        <h2 style={{ fontSize: 15 }}>Points</h2>
        <span className="sub">
          {barème} / {total} points alloués
        </span>
        {!readOnly && exercises.length > 0 && (
          <Button
            variant="secondary"
            size="small"
            style={{ marginLeft: 'auto' }}
            onClick={répartir}
          >
            Répartir les {total} points
          </Button>
        )}
      </div>

      {exercises.length === 0 ? (
        <div className="card">
          <p className="sub">
            Aucun exercice à noter. Revenez à l'étape 2 pour en ajouter au moins un.
          </p>
        </div>
      ) : (
        <>
          {écart !== 0 && (
            <Alert tone="info">
              {écart > 0
                ? `Le barème dépasse de ${écart} point${écart > 1 ? 's' : ''} le total annoncé (${total}).`
                : `Il reste ${-écart} point${-écart > 1 ? 's' : ''} à allouer pour atteindre le total annoncé (${total}).`}
            </Alert>
          )}

          <div className="card" style={{ display: 'grid', gap: 10 }}>
            {exercises.map((exercise, index) => (
              <div key={exercise.id ?? `new-${index}`}>
                <div className="points-ligne">
                  <span className="points-ligne-num">{index + 1}</span>
                  <span className="points-ligne-titre">
                    {exercise.title || <em className="sub">(sans intitulé)</em>}
                    <span className="sub" style={{ marginLeft: 8, fontSize: 12 }}>
                      {exerciseType(exercise.kind ?? 'code').label}
                    </span>
                  </span>
                  {needsTests(exercise.kind) && (
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => setOuvert(ouvert === index ? null : index)}
                    >
                      {ouvert === index ? 'Masquer le détail' : 'Détail du barème'}
                    </Button>
                  )}
                  <label className="points-ligne-champ">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      aria-label={`Points de l'exercice ${index + 1}`}
                      value={exercise.points}
                      disabled={readOnly}
                      onChange={(e) => update(index, e.target.value)}
                    />
                    <span className="sub">pts</span>
                  </label>
                </div>

                {/* Le détail ligne à ligne ne s'ouvre que sur demande : la plupart
                    des exercices se notent au barème simplifié, sans qu'on ait à
                    voir chaque test. */}
                {ouvert === index && needsTests(exercise.kind) && (
                  <PointsEditor
                    exercise={exercise}
                    readOnly={readOnly}
                    showTotal={false}
                    onChange={(next) => replace(index, next)}
                  />
                )}
              </div>
            ))}
            <div className="points-total">
              <span>Total du sujet</span>
              <strong>
                {barème} / {total} pts
              </strong>
            </div>
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <Button variant="secondary" onClick={onBack}>
          Étape précédente
        </Button>
        <Button disabled={pending} onClick={onNext}>
          Étape suivante →
        </Button>
      </div>
    </section>
  );
}

/**
 * L'étape « Barème & tests » : ce que la copie doit contenir et sur quoi elle
 * est exécutée. Ce que chaque ligne vaut se décide à l'étape suivante.
 */
function TestsStep({ exercises, setExercises, barème, onBack, onNext, pending }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ fontSize: 15 }}>Barème & jeux de tests</h2>
        <span className="sub" style={{ marginLeft: 12 }}>{barème} points répartis à l'étape suivante</span>
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        {exercises.map((exercise, exIndex) => {
          const withTests = needsTests(exercise.kind);

          return (
          <article className="card" key={exercise.id ?? `new-${exIndex}`}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 10 }}>
              <strong style={{ fontSize: 14 }}>
                Exercice {exIndex + 1} · {exercise.title || 'sans titre'}
              </strong>
              <span className="sub">{exerciseType(exercise.kind ?? 'code').label}</span>
            </div>

            {!withTests && (
              <p className="sub" style={{ marginBottom: 8 }}>
                {exerciseType(exercise.kind).gradingNote}
              </p>
            )}

            {withTests && (
              <div style={{ marginBottom: 12 }}>
                <BaremeEditor
                  exercise={exercise}
                  criteria={criteriaOf(exercise)}
                  onCriteriaChange={(next) =>
                    setExercises(
                      exercises.map((ex, i) =>
                        i === exIndex
                          ? { ...ex, settings: { ...ex.settings, criteria: next } }
                          : ex,
                      ),
                    )
                  }
                />
              </div>
            )}

            {withTests && (
              <TestsEditor
                exercise={exercise}
                tests={exercise.tests}
                showComparison
                template={EMPTY_TEST}
                onChange={(tests) =>
                  setExercises(exercises.map((ex, i) => (i === exIndex ? { ...ex, tests } : ex)))
                }
              />
            )}
          </article>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <Button variant="secondary" onClick={onBack}>
          Étape précédente
        </Button>
        <Button disabled={pending} onClick={onNext}>
          Étape suivante →
        </Button>
      </div>
    </section>
  );
}
