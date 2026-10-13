import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import {
  useAction,
  useBankExercises,
  useClassrooms,
  useDisciplines,
  useEvaluation,
  useLanguages,
  useSubjects,
} from '../../api/hooks';
import { Alert, Button, EmptyState, Loading, PageHeader, Segmented, Tag } from '../../components/ui';
import SheetEditor from '../../components/SheetEditor';
import SheetPanel from '../../components/SheetPanel';
import { SubjectSheet } from '../../components/SubjectSheet';
import { useAuth } from '../../auth';
import { KIND_LABELS, STATUS_LABELS, STATUS_TONES } from '../../format';
import { FACTORY_DEFAULTS, readEvaluationDefaults } from '../../evaluationDefaults';
import { evaluationUsesLanguage, exerciseType, needsTests } from '../../exerciseTypes';
import { autoDistribute, isSimpleScoring } from '../../bareme';
import { defaultStarter } from '../../starterCode';
import { exerciseIssues, newKey } from '../../sheetEditor';
import '../../styles/feuille.css';

/**
 * L'éditeur d'évaluation : le sujet se compose sur la feuille elle-même.
 *
 * Il n'y a plus d'étapes. L'en-tête de la feuille porte ce que demandait
 * l'ancienne étape « Paramètres » (titre, classe, matière, durée, barème) ;
 * chaque exercice se lit là où l'étudiant le lira, son corrigé écrit à l'encre
 * rouge au même endroit, ses points entre parenthèses. Ce qui n'a pas de place
 * sur une feuille passe dans le panneau voisin. « Vue étudiant » montre la
 * feuille exacte que recevra la classe.
 */

/**
 * Le total annoncé partagé à parts égales entre les exercices. Le dernier
 * absorbe les centièmes perdus à l'arrondi : le total affiché doit tomber juste.
 */
function spreadPoints(exercises, total) {
  if (exercises.length === 0) return exercises;
  const part = Math.round((total / exercises.length) * 100) / 100;
  const reste = Math.round((total - part * (exercises.length - 1)) * 100) / 100;
  return exercises.map((ex, i) => {
    const noté = { ...ex, points: i === exercises.length - 1 ? reste : part };
    return isSimpleScoring(noté) ? autoDistribute(noté) : noté;
  });
}

/**
 * Les points sont-ils encore ceux d'un partage à parts égales ? Le dernier
 * exercice absorbe l'arrondi (6,67 · 6,67 · 6,66) : on compare au partage
 * lui-même plutôt que d'exiger des valeurs identiques.
 */
function isEvenSpread(exercises, total) {
  const even = spreadPoints(exercises, total);
  return exercises.every((ex, i) => Math.abs(Number(ex.points) - Number(even[i].points)) < 0.011);
}

/**
 * Nouvel exercice du type demandé : le type décide de ce que la feuille montre
 * et des réglages pré-remplis (choix d'un QCM, affirmations d'un Vrai/Faux…).
 */
function newExercise(language, kind) {
  return {
    id: null,
    _key: newKey('e'),
    title: '',
    statement: '',
    language,
    points: 0,
    kind,
    settings: exerciseType(kind).defaults(),
    starter_code: defaultStarter(language, kind),
    tests: [],
  };
}

/** Un test copié perd son identité : il appartiendra à sa nouvelle destination. */
function stripIds(test) {
  const copy = { ...test };
  delete copy.id;
  delete copy.position;
  delete copy._key;
  return copy;
}

/** Ce que le serveur reçoit : ni clés d'affichage, ni nombres saisis en texte. */
function exercisePayload(exercises) {
  return exercises.map((exercise) => {
    const copy = { ...exercise };
    delete copy._key;
    return {
      ...copy,
      points: Number(exercise.points) || 0,
      tests: (exercise.tests ?? []).map((test) => {
        const t = { ...test };
        delete t._key;
        return { ...t, points: Number(t.points), timeout_ms: Number(t.timeout_ms) };
      }),
    };
  });
}

/**
 * Après l'enregistrement, chaque exercice et chaque test reprend l'identifiant
 * que le serveur lui a donné : le prochain enregistrement les met à jour au
 * lieu de les recréer. Les clés d'affichage restent : la feuille ne se redessine
 * pas.
 */
function adopt(local, saved) {
  return local.map((exercise, i) => {
    const server = saved?.[i];
    if (!server) return exercise;
    return {
      ...exercise,
      id: server.id,
      tests: (exercise.tests ?? []).map((test, j) => ({ ...test, id: server.tests?.[j]?.id ?? test.id })),
    };
  });
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

/**
 * Une nouvelle évaluation part des valeurs réglées dans les paramètres : et de
 * la classe d'où l'on vient, quand on la crée depuis la page d'une classe.
 */
function defaultForm(classroomId) {
  const defaults = readEvaluationDefaults();
  return {
    title: '',
    kind: defaults.kind,
    description: '',
    instructions: '',
    language: defaults.language,
    duration_minutes: defaults.duration_minutes,
    scheduled_start: '',
    classroom_id: classroomId ?? '',
    subject_id: '',
    total_points: defaults.total_points,
    rules: { ...defaults.rules },
  };
}

function formFrom(data, classroomId) {
  if (!data) return defaultForm(classroomId);
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
    rules: { ...FACTORY_DEFAULTS.rules, ...data.rules },
  };
}

function fmt(value) {
  return String(Math.round((Number(value) || 0) * 100) / 100).replace('.', ',');
}

export default function EvaluationEditorPage() {
  const { evaluationId } = useParams();
  const evaluation = useEvaluation(evaluationId);

  if (evaluationId && evaluation.isPending) return <Loading variant="page" />;
  if (evaluation.error) {
    return (
      <div className="content">
        <Alert>{evaluation.error.message}</Alert>
      </div>
    );
  }
  // Remontage sur changement d'évaluation : l'état de la feuille suit la donnée serveur.
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
  const [searchParams] = useSearchParams();
  // À la création, l'enregistrement change l'URL et remonte l'éditeur : le
  // message voyage dans l'état de navigation pour ne pas être perdu.
  const { state: arrival } = useLocation();
  const { organization, user } = useAuth();

  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(arrival?.notice ?? null);
  const [view, setView] = useState('teacher');
  const [selected, setSelected] = useState(null);
  const [ui, setUi] = useState({});
  const [dirty, setDirty] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  const classrooms = useClassrooms();
  const subjects = useSubjects();
  const languages = useLanguages();
  const disciplines = useDisciplines();

  const [form, setForm] = useState(() => formFrom(evaluation, searchParams.get('classe')));
  const [exercises, setExercises] = useState(() =>
    (evaluation?.exercises ?? []).map((e) => ({ ...e, tests: e.tests ?? [] })),
  );

  const status = evaluation?.status;
  /* Avant l'ouverture, tout se modifie. Après la clôture, seul le corrigé
     (l'encre rouge) et les points : les copies rendues ne sont jamais altérées.
     Pendant la session ou la publication des notes, rien. */
  const canEditSubject = !status || ['draft', 'scheduled'].includes(status);
  const canEditCorrection = canEditSubject || ['closed', 'corrected'].includes(status);

  const sum = useMemo(
    () => Math.round(exercises.reduce((acc, ex) => acc + Number(ex.points || 0), 0) * 100) / 100,
    [exercises],
  );
  const total = Number(form.total_points) || 0;
  const gap = Math.round((total - sum) * 100) / 100;

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

  const saveParams = useAction(
    (payload) =>
      evaluationId
        ? api(`/api/evaluations/${evaluationId}`, { method: 'PATCH', body: payload })
        : api('/api/evaluations', { method: 'POST', body: payload }),
    [['evaluations'], ['evaluation', evaluationId]],
  );
  const saveExercises = useAction(
    ({ id, payload }) => api(`/api/evaluations/${id}/exercises`, { method: 'PUT', body: payload }),
    [['evaluation', evaluationId]],
  );
  const publish = useAction(
    (id) => api(`/api/evaluations/${id}/publish`, { method: 'POST' }),
    [['evaluations'], ['evaluation', evaluationId]],
  );
  const start = useAction(
    (id) => api(`/api/evaluations/${id}/start`, { method: 'POST' }),
    [['evaluations'], ['evaluation', evaluationId]],
  );
  const saveToBank = useAction((body) => api('/api/bank/exercises', { method: 'POST', body }), [
    ['bank'],
  ]);
  const pending = saveParams.isPending || saveExercises.isPending || publish.isPending || start.isPending;

  const onForm = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setDirty(true);
  };
  const changeExercises = (make) => {
    setExercises(make);
    setDirty(true);
  };
  const onExercise = (index, patch) =>
    changeExercises((list) =>
      list.map((ex, i) =>
        i === index ? { ...ex, ...(typeof patch === 'function' ? patch(ex) : patch) } : ex,
      ),
    );
  const onUi = (key, patch) => setUi((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

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

  /** Enregistre la feuille ; renvoie l'identifiant de l'évaluation, ou rien en cas d'échec. */
  async function save() {
    setError(null);
    if (form.title.trim().length < 2) {
      setError('Donnez un titre d’au moins deux caractères à l’épreuve : il figure en tête du sujet.');
      setView('teacher');
      setSelected(null);
      document.getElementById('titre-epreuve')?.focus();
      return null;
    }
    const untitled = exercises.findIndex((ex) => !ex.title.trim());
    if (untitled !== -1) {
      setError(`L’exercice ${untitled + 1} n’a pas d’intitulé.`);
      setView('teacher');
      setSelected(untitled);
      return null;
    }
    try {
      let id = evaluationId;
      if (canEditSubject) {
        const saved = await saveParams.mutateAsync(payloadFromForm());
        id = saved.id;
      }
      if (canEditCorrection) {
        // Le barème simplifié se recalcule à l'enregistrement : un test ajouté
        // doit peser sa part avant de partir au serveur.
        const prepared = exercises.map((ex) => (isSimpleScoring(ex) ? autoDistribute(ex) : ex));
        const saved = await saveExercises.mutateAsync({ id, payload: exercisePayload(prepared) });
        setExercises(adopt(prepared, saved.exercises));
      }
      setDirty(false);
      return id;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }

  /** Ce qui empêche de publier, le premier trouvé : avec l'exercice à reprendre. */
  function blocker() {
    if (!form.classroom_id) {
      return { message: 'Choisissez la classe, dans l’en-tête de la feuille, avant de publier.', at: null };
    }
    if (exercises.length === 0) return { message: 'Ajoutez au moins un exercice avant de publier.', at: null };
    for (let i = 0; i < exercises.length; i += 1) {
      const issues = exerciseIssues(exercises[i]);
      if (issues.length) return { message: `Exercice ${i + 1} : ${issues[0]}.`, at: i };
    }
    if (gap !== 0) {
      return {
        message: `Les exercices totalisent ${fmt(sum)} points sur ${fmt(total)} : ajustez-les, ou répartissez les points depuis les réglages de l’épreuve.`,
        at: null,
      };
    }
    return null;
  }

  function stopOn(found) {
    setError(found.message);
    setNotice(null);
    setView('teacher');
    setSelected(found.at);
  }

  async function handleSave() {
    const id = await save();
    if (!id) return;
    if (!evaluationId) {
      navigate(`/evaluations/${id}`, { replace: true, state: { notice: 'Brouillon enregistré.' } });
      return;
    }
    setNotice(canEditSubject ? 'Enregistré.' : 'Corrigé et points enregistrés.');
  }

  /* Publier enregistre la feuille et la rend visible d'un même geste : un
     devoir daté resté en brouillon ne serait jamais ouvert par le
     planificateur, qui ne réveille que les évaluations publiées. */
  async function handlePublish() {
    const found = blocker();
    if (found) {
      stopOn(found);
      return;
    }
    const id = await save();
    if (!id) return;
    try {
      if (!status || status === 'draft') await publish.mutateAsync(id);
      const message = form.scheduled_start
        ? 'Épreuve programmée : la classe la voit, et elle s’ouvrira toute seule à l’heure dite.'
        : 'Épreuve publiée : la classe la voit. Lancez la session quand vous voulez.';
      if (!evaluationId) navigate(`/evaluations/${id}`, { replace: true, state: { notice: message } });
      else setNotice(message);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleStart() {
    const found = blocker();
    if (found) {
      stopOn(found);
      return;
    }
    const id = await save();
    if (!id) return;
    try {
      await start.mutateAsync(id);
      navigate(`/evaluations/${id}/session`);
    } catch (err) {
      setError(err.message);
    }
  }

  /**
   * Un nouvel exercice. Tant que l'enseignant n'a pesé aucun exercice plus
   * qu'un autre, le total se repartage à parts égales, nouveau venu compris ;
   * sinon le nouveau part de zéro et la note en haut de la feuille dit ce qui
   * manque.
   */
  function addExercise(kind) {
    changeExercises((list) => {
      const fresh = newExercise(form.language, kind);
      return isEvenSpread(list, total) ? spreadPoints([...list, fresh], total) : [...list, fresh];
    });
    setSelected(exercises.length);
  }

  /**
   * Import : copie complète de l'exercice, type et paramètres compris. Sans le
   * `kind` ni les `settings`, un QCM ou une correspondance repartait en « code ».
   *
   * La banque ne fixe pas de points : l'exercice importé prend sa part du total
   * comme un exercice nouveau (parts égales tant que personne n'a pesé un
   * exercice plus qu'un autre, zéro sinon).
   */
  function importFromBank(item) {
    const kind = item.kind ?? 'code';
    changeExercises((list) => {
      const imported = {
        id: null,
        _key: newKey('e'),
        title: item.title,
        statement: item.statement,
        language: item.language,
        points: 0,
        kind,
        settings: item.settings ?? {},
        starter_code:
          kind === 'code' && !item.starter_code?.trim()
            ? defaultStarter(item.language, 'code')
            : (item.starter_code ?? ''),
        tests: (item.tests ?? []).map(stripIds),
      };
      return isEvenSpread(list, total) ? spreadPoints([...list, imported], total) : [...list, imported];
    });
    setSelected(exercises.length);
    setBankOpen(false);
    api(`/api/bank/exercises/${item.id}/used`, { method: 'POST' }).catch(() => {});
    setNotice(`« ${item.title} » importé depuis la banque.`);
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= exercises.length) return;
    changeExercises((list) => {
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setSelected(target);
  }

  function duplicate(index) {
    changeExercises((list) => {
      const copy = JSON.parse(JSON.stringify(list[index]));
      copy.id = null;
      copy._key = newKey('e');
      copy.title = `${copy.title} (copie)`.trim();
      copy.tests = (copy.tests ?? []).map(stripIds);
      return [...list.slice(0, index + 1), copy, ...list.slice(index + 1)];
    });
    setSelected(index + 1);
  }

  function remove(index) {
    changeExercises((list) => list.filter((_, i) => i !== index));
    setSelected(null);
    setNotice(`Exercice ${index + 1} retiré de la feuille : il disparaîtra à l’enregistrement.`);
  }

  function toBank(index) {
    const exercise = exercises[index];
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
        () => setNotice(`« ${exercise.title} » enregistré dans la banque.`),
        (err) => setError(err.message),
      );
  }

  const classroom = (classrooms.data ?? []).find((c) => String(c.id) === String(form.classroom_id));
  const subject = (subjects.data ?? []).find((s) => String(s.id) === String(form.subject_id));
  const header = evaluation?.sheet_header ?? user?.sheet_header;

  let primary = null;
  if (!status || status === 'draft') {
    primary = { label: form.scheduled_start ? 'Programmer' : 'Publier', onClick: handlePublish };
  } else if (status === 'scheduled') {
    primary = { label: 'Enregistrer', onClick: handleSave };
  } else if (canEditCorrection) {
    primary = { label: 'Enregistrer le corrigé', onClick: handleSave };
  }

  return (
    <>
      <PageHeader
        breadcrumb={evaluationId ? 'Évaluations · Modifier' : 'Évaluations · Nouvelle'}
        title={form.title || 'Nouvelle évaluation'}
      >
        {status && <Tag tone={STATUS_TONES[status]}>{STATUS_LABELS[status]}</Tag>}
      </PageHeader>

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
        <span className={`feuille-total ${gap === 0 ? 'feuille-total--juste' : 'feuille-total--ecart'}`}>
          {fmt(sum)} / {fmt(total)} pts
          {gap > 0 && ` · il manque ${fmt(gap)}`}
          {gap < 0 && ` · ${fmt(-gap)} de trop`}
        </span>
        <div className="feuille-barre-fin">
          {dirty && <span className="sub">Modifications non enregistrées</span>}
          {(!status || status === 'draft') && (
            <Button variant="secondary" disabled={pending} onClick={handleSave}>
              Enregistrer
            </Button>
          )}
          {primary && (
            <Button disabled={pending} onClick={primary.onClick}>
              {pending ? 'Enregistrement…' : primary.label}
            </Button>
          )}
        </div>
      </div>

      {(error || notice || !canEditSubject) && (
        <div className="feuille-alertes">
          <Alert>{error}</Alert>
          {notice && !error && <Alert tone="success">{notice}</Alert>}
          {!canEditSubject && (
            <Alert tone="info">
              {canEditCorrection
                ? `L’évaluation est ${STATUS_LABELS[status].toLowerCase()} : le sujet est figé. Le corrigé (à l’encre rouge) et les points restent modifiables ; les copies rendues ne sont jamais altérées.`
                : `L’évaluation est ${STATUS_LABELS[status].toLowerCase()} : la feuille n’est plus modifiable.`}
            </Alert>
          )}
        </div>
      )}

      <div className="feuille-atelier">
        {view === 'student' ? (
          <div className="feuille-plateau">
            <article className="feuille-papier" aria-label="Feuille de l’étudiant">
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
                header={header}
                emptyLabel="Aucun exercice pour l’instant."
              />
            </article>
          </div>
        ) : (
          <>
            <SheetEditor
              form={form}
              onForm={onForm}
              exercises={exercises}
              onExercise={onExercise}
              selected={selected}
              onSelect={setSelected}
              canEditSubject={canEditSubject}
              canEditCorrection={canEditCorrection}
              classrooms={classrooms.data ?? []}
              subjects={subjects.data ?? []}
              languages={languages.data ?? []}
              openKeys={disciplines.data ? new Set(disciplines.data.map((d) => d.key)) : null}
              header={header}
              organization={organization}
              sum={sum}
              total={total}
              ui={ui}
              onUi={onUi}
              onAdd={addExercise}
              bank={{
                toggle: (
                  <Button variant="secondary" size="small" onClick={() => setBankOpen((open) => !open)}>
                    {bankOpen ? 'Fermer la banque' : 'Reprendre de la banque'}
                  </Button>
                ),
                picker: bankOpen ? (
                  <BankPicker
                    language={form.language}
                    onPick={importFromBank}
                    onClose={() => setBankOpen(false)}
                  />
                ) : null,
              }}
            />
            <SheetPanel
              index={selected !== null && selected < exercises.length ? selected : null}
              exercises={exercises}
              form={form}
              onForm={onForm}
              status={status}
              evaluationId={evaluationId}
              canEditSubject={canEditSubject}
              canEditCorrection={canEditCorrection}
              sum={sum}
              total={total}
              onSelect={setSelected}
              onExercise={onExercise}
              onMove={move}
              onDuplicate={duplicate}
              onRemove={remove}
              onToBank={toBank}
              toBankPending={saveToBank.isPending}
              onDistribute={() => changeExercises((list) => spreadPoints(list, total))}
              onStart={handleStart}
              startPending={pending}
            />
          </>
        )}
      </div>
    </>
  );
}

function BankPicker({ language, onPick, onClose }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  // Un QCM ou une correspondance ne dépend d'aucun langage : filtrer sur celui de
  // l'évaluation les rendait introuvables. Le filtre reste proposé, jamais imposé.
  const [langFilter, setLangFilter] = useState(language);
  const bank = useBankExercises({ q: search, language: langFilter || undefined, page });
  const totalPages = bank.data ? Math.ceil((bank.data.total ?? 0) / 20) : 1;

  return (
    <div className="card" style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 14 }}>Banque d'exercices</strong>
        <select
          aria-label="Filtrer par langage"
          value={langFilter}
          onChange={(e) => {
            setLangFilter(e.target.value);
            setPage(1);
          }}
          style={{ marginLeft: 'auto', height: 30, fontSize: 13, width: 'auto' }}
        >
          <option value={language}>{language.toUpperCase()} (langage de l'évaluation)</option>
          <option value="">Tous les langages et QCM</option>
        </select>
        <input
          aria-label="Rechercher dans la banque"
          placeholder="Rechercher…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{
            height: 30,
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--border)',
            padding: '0 14px',
            fontSize: 13,
          }}
        />
        <Button variant="secondary" size="small" onClick={onClose}>
          Fermer
        </Button>
      </div>
      {bank.isPending && <Loading />}
      {bank.data?.items.length === 0 && (
        <EmptyState
          compact
          variant={search || langFilter ? 'search' : 'empty'}
          title="Aucun exercice disponible"
        >
          {search
            ? 'Aucun exercice de la banque ne correspond à cette recherche.'
            : langFilter
              ? `La banque ne contient aucun exercice ${langFilter.toUpperCase()}.`
              : 'La banque est vide : enregistrez-y un exercice depuis le panneau de la feuille.'}
        </EmptyState>
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
          <span className="sub">
            Page {page} / {totalPages}
          </span>
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
