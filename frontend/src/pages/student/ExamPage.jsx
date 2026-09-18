import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { api } from '../../api/client';
import AlgoEditor from '../../components/AlgoEditor';
import MatchingBoard from '../../components/MatchingBoard';
import { Alert, Button, Loading } from '../../components/ui';
import {
  SheetExercise,
  SheetHeader,
  SheetInstructions,
  SubjectSheet,
} from '../../components/SubjectSheet';
import { useAuth } from '../../auth';
import { formatDateTime, formatDuration, formatRelative } from '../../format';
import { evaluationUsesLanguage, exerciseType, hasQuestions } from '../../exerciseTypes';
import { answersOf, packAnswers, questionsOf } from '../../questions';
import { useServerCountdown } from '../../useNow';
import { useTheme } from '../../theme';
import {
  clearDrafts, restoreDrafts, writeDraft,
  pushOfflineIncident, readOfflineIncidents, clearOfflineIncidents,
  writeFinalSnapshot, readFinalSnapshot, clearFinalSnapshot,
} from '../../examStorage';

const EXTENSIONS = { c: [cpp()], cpp: [cpp()], python: [python()] };
const LOCAL_SAVE_MS = 400; // écriture dans le navigateur, sans appel réseau
const REPORT_THROTTLE_MS = 1500; // un même incident n'est compté qu'une fois
// Une sortie n'est retenue que si elle dure : un clic dans la barre d'adresse, une
// notification système ou une boîte de dialogue ne doivent pas pénaliser l'apprenant.
const LEAVE_GRACE_MS = 1500;

// Raccourcis neutralisés pendant l'épreuve (outils de développement, impression,
// enregistrement, recherche externe). Le blocage est dissuasif, pas infaillible.
const BLOCKED_KEYS = new Set(['c', 'v', 'x', 'p', 's', 'u', 'f', 'i', 'j']);

/**
 * La session n'est pas encore ouverte (l'enseignant ne l'a pas lancée, ou l'heure
 * programmée n'est pas atteinte) : c'est une attente, pas une fin d'épreuve.
 */
function isNotOpenYet(error) {
  return error?.status === 403 && /pas encore ouverte/i.test(error.message ?? '');
}

export default function ExamPage() {
  const { evaluationId } = useParams();
  const navigate = useNavigate();
  const exam = useQuery({
    queryKey: ['exam', evaluationId],
    queryFn: () => api(`/api/me/evaluations/${evaluationId}`),
    retry: false,
    refetchOnMount: 'always',
    // La session s'ouvre à l'heure dite : on retente tant que l'accès est refusé
    // faute d'ouverture, plutôt que de renvoyer l'apprenant sur un écran d'erreur.
    refetchInterval: (query) => (isNotOpenYet(query.state.error) ? 5000 : false),
  });

  if (exam.isPending) return <Loading label="Ouverture de l'épreuve…" />;
  if (exam.error) {
    if (isNotOpenYet(exam.error)) {
      return (
        <div className="exam exam-done">
          <header className="exam-topbar">
            <div className="brand" style={{ padding: 0, fontSize: 16 }}>
              <span className="brand-dot" aria-hidden="true" />
              CodEval
            </div>
          </header>
          <div className="exam-done-body">
            <div className="exam-done-card">
              <div className="exam-waiting-spinner" aria-hidden="true" />
              <h1>En attente de l'ouverture</h1>
              <p>
                {exam.error.message}. Restez sur cette page : l'épreuve démarre automatiquement dès
                que la session est ouverte.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <Button onClick={() => exam.refetch()} disabled={exam.isFetching}>
                  {exam.isFetching ? 'Vérification…' : 'Réessayer maintenant'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate('/mes-evaluations', { replace: true })}
                >
                  Retour à mes évaluations
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    if ([403, 404, 409].includes(exam.error.status)) {
      return (
        <div className="exam exam-done">
          <header className="exam-topbar">
            <div className="brand" style={{ padding: 0, fontSize: 16 }}>
              <span className="brand-dot" aria-hidden="true" />
              CodEval
            </div>
          </header>
          <div className="exam-done-body">
            <div className="exam-done-card">
              <div className="exam-done-mark" aria-hidden="true">✓</div>
              <h1>Épreuve terminée</h1>
              <p>{exam.error.message}</p>
              <Button onClick={() => navigate('/mes-evaluations', { replace: true })}>
                Retour à mes évaluations
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="content" style={{ padding: 40 }}>
        <Alert>{exam.error.message}</Alert>
        <Button variant="secondary" onClick={() => navigate('/mes-evaluations')}>
          Retour à mes évaluations
        </Button>
      </div>
    );
  }
  return <Exam evaluationId={evaluationId} data={exam.data} />;
}

function Exam({ evaluationId, data }) {
  const navigate = useNavigate();
  const { organization } = useAuth();
  const [edits, setEdits] = useState(() =>
    restoreDrafts(evaluationId, data.exercises, data.drafts),
  );
  const [currentId, setCurrentId] = useState(null);
  const [localSavedAt, setLocalSavedAt] = useState(null);
  const [sentAt, setSentAt] = useState(null);
  const [sending, setSending] = useState(false);
  const [hasPending, setHasPending] = useState(false);
  const [submittedAt, setSubmittedAt] = useState(data.submitted_at);
  const [error, setError] = useState(null);
  const [incidents, setIncidents] = useState(data.incidents ?? 0);
  const [paused, setPaused] = useState(false);
  const [locked, setLocked] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  // Le navigateur refuse le plein écran sans geste de l'utilisateur : on le lui
  // demande explicitement, ce qui n'est pas un incident.
  const [awaitingFullscreen, setAwaitingFullscreen] = useState(Boolean(data.rules?.fullscreen));
  // Rouvrir une épreuve déjà rendue affiche la confirmation, pas un éditeur inerte.
  const [finished, setFinished] = useState(
    data.submitted_at ? { reason: 'submitted', at: data.submitted_at } : null,
  );

  // La confirmation de soumission s'affiche dans la page : une boîte native
  // (`window.confirm`) fait sortir le navigateur du plein écran et masque la
  // page un instant, ce que la surveillance comptait comme une sortie
  // d'épreuve : la copie était figée avant d'avoir été envoyée.
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const versions = useRef({});
  // Un brouillon restauré depuis le poste (page rechargée) n'a pas encore été
  // transmis : il part avec le prochain envoi, comme une frappe.
  const dirty = useRef(
    new Set(
      data.exercises
        .filter((item) => edits[item.id] !== undefined)
        .map((item) => item.id),
    ),
  );
  const localTimer = useRef(null);
  const lastReport = useRef(0);
  const leaveTimer = useRef(null);
  const guardSuspended = useRef(false);

  const rules = data.rules ?? {};
  const maxIncidents = data.max_incidents ?? 0;
  const guarded = Boolean(rules.fullscreen || rules.track_focus || maxIncidents);
  const blockPaste = Boolean(rules.block_paste);
  const allowSubmit = rules.allow_early_submit !== false;

  const current = currentId ?? data.exercises[0]?.id ?? null;
  const exercise = data.exercises.find((item) => item.id === current);
  const codeOf = useCallback(
    (exerciseId) => edits[exerciseId] ?? data.drafts[exerciseId] ?? '',
    [edits, data.drafts],
  );
  const answered = useCallback(
    (exerciseId) =>
      Boolean(edits[exerciseId]?.trim()) || data.saved_exercise_ids.includes(exerciseId),
    [edits, data.saved_exercise_ids],
  );

  // Le décompte vient du serveur et avance sur une horloge monotone : changer
  // l'heure du poste n'a aucun effet sur le temps restant.
  const { secondsLeft, resync } = useServerCountdown(data.seconds_left, !submittedAt && !locked);

  const send = useCallback(
    async (exerciseId, code, { quiet = false } = {}) => {
      try {
        const res = await api(`/api/me/evaluations/${evaluationId}/exercises/${exerciseId}`, {
          method: 'PUT',
          body: { code, version: versions.current[exerciseId] ?? 0 },
        });
        versions.current[exerciseId] = res.version;
        setSentAt(res.saved_at);
        resync(res.seconds_left);
        setError(null);
        return true;
      } catch (err) {
        // En resynchronisation, un refus définitif (exercice disparu, copie déjà
        // rendue, épreuve close) n'est pas une erreur à montrer ni à retenter.
        if (quiet && (err.status === 404 || err.status === 409)) return true;
        setError(err.message);
        return false;
      }
    },
    [evaluationId, resync],
  );

  /** Envoi de la production au serveur : soumission, fin du temps, ou départ de la page. */
  const flush = useCallback(async () => {
    if (dirty.current.size === 0) return true;
    const pending = [...dirty.current];
    dirty.current.clear();
    setSending(true);
    let complete = true;
    for (const exerciseId of pending) {
      const ok = await send(exerciseId, codeOf(exerciseId));
      if (!ok) {
        dirty.current.add(exerciseId);
        complete = false;
      }
    }
    setSending(false);
    setHasPending(dirty.current.size > 0);
    return complete;
  }, [codeOf, send]);

  // ── Synchronisation au retour en ligne ──────────────────────────────
  const syncPending = useCallback(async () => {
    // 1. Snapshot final (timer expiré hors ligne) : envoyer chaque exercice
    const snapshot = readFinalSnapshot(evaluationId);
    if (snapshot && submittedAt) {
      // Copie déjà rendue : le serveur refuserait chaque envoi.
      clearFinalSnapshot(evaluationId);
    } else if (snapshot) {
      let allSent = true;
      // Un instantané peut dater d'une version antérieure de l'épreuve : ses
      // exercices n'existent plus, et les renvoyer affichait « Exercice introuvable ».
      const known = new Set(data.exercises.map((item) => String(item.id)));
      for (const [exerciseId, code] of Object.entries(snapshot.edits ?? {})) {
        if (!known.has(String(exerciseId))) continue;
        if (code == null || !code.trim()) continue;
        const ok = await send(exerciseId, code, { quiet: true });
        if (!ok) allSent = false;
      }
      if (allSent) {
        clearFinalSnapshot(evaluationId);
        clearDrafts(evaluationId, data.exercises.map((item) => item.id));
      }
    }

    // 2. Incidents cumulés hors ligne
    const pending = readOfflineIncidents(evaluationId);
    if (pending.length > 0) {
      try {
        const res = await api(`/api/me/evaluations/${evaluationId}/incidents/batch`, {
          method: 'POST',
          body: { incidents: pending },
        });
        setIncidents(res.incidents);
        clearOfflineIncidents(evaluationId);
        if (res.locked) {
          setLocked(true);
          setPaused(false);
          if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        }
      } catch { /* sera retenté au prochain retour en ligne */ }
    }

  }, [evaluationId, data.exercises, send, submittedAt]);

  // Suivi de l'état de connexion et synchronisation au retour en ligne
  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      syncPending();
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Tenter une sync au montage si des données sont en attente
    if (navigator.onLine) syncPending();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [syncPending]);

  // Signalement au serveur : c'est lui qui compte les incidents et qui verrouille.
  const report = useCallback(
    async (type, { pause = false } = {}) => {
      if (!guarded || locked || submittedAt || guardSuspended.current) return;
      if (awaitingFullscreen) return;
      if (Date.now() - lastReport.current < REPORT_THROTTLE_MS) {
        if (pause) setPaused(true);
        return;
      }
      lastReport.current = Date.now();
      if (pause) setPaused(true);

      if (!navigator.onLine) {
        pushOfflineIncident(evaluationId, type);
        return;
      }

      try {
        const res = await api(`/api/me/evaluations/${evaluationId}/incidents`, {
          method: 'POST',
          body: { type },
        });
        setIncidents(res.incidents);
        if (res.locked) {
          // Verrouillage : envoyer tout le travail au serveur avant de figer
          await flush();
          setLocked(true);
          setPaused(false);
          if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        }
      } catch {
        pushOfflineIncident(evaluationId, type);
      }
    },
    [evaluationId, flush, guarded, locked, submittedAt, awaitingFullscreen],
  );

  // Filet de sécurité : si la page est quittée, on écrit un snapshot local.
  // L'envoi au serveur n'a lieu qu'à la soumission, fin de temps, ou verrouillage.
  useEffect(() => {
    const onLeave = () => {
      const allEdits = {};
      data.exercises.forEach((item) => {
        allEdits[item.id] = codeOf(item.id);
      });
      writeFinalSnapshot(evaluationId, allEdits);
    };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, [evaluationId, data.exercises, codeOf]);

  // Surveillance de l'environnement d'épreuve : plein écran, onglet, focus.
  useEffect(() => {
    if (!guarded || locked || submittedAt || awaitingFullscreen) return undefined;

    const cancelLeave = () => {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    };
    // La sortie n'est signalée qu'après le délai de grâce, et seulement si la
    // fenêtre est toujours quittée à ce moment-là.
    const scheduleLeave = (type) => {
      if (leaveTimer.current || guardSuspended.current) return;
      leaveTimer.current = setTimeout(() => {
        leaveTimer.current = null;
        if (document.hidden || !document.hasFocus()) report(type, { pause: true });
      }, LEAVE_GRACE_MS);
    };

    const onVisibility = () => {
      if (document.hidden) {
        scheduleLeave('tab_hidden');
      } else {
        cancelLeave();
      }
    };
    const onBlur = () => scheduleLeave('window_blur');
    const onFocus = () => cancelLeave();
    const onFullscreenChange = () => {
      if (rules.fullscreen && !document.fullscreenElement) {
        setAwaitingFullscreen(true);
        report('fullscreen_exit', { pause: true });
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      cancelLeave();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [guarded, locked, submittedAt, awaitingFullscreen, rules.fullscreen, report, flush]);

  // Avertissement du navigateur avant fermeture ou rechargement de l'épreuve.
  useEffect(() => {
    if (!guarded || locked || submittedAt) return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [guarded, locked, submittedAt]);

  // Neutralisation du copier-coller, du menu contextuel et des raccourcis.
  useEffect(() => {
    if (locked || submittedAt) return undefined;
    const stop = (type) => (event) => {
      event.preventDefault();
      report(type);
    };
    const onCopy = stop('copy_blocked');
    const onPaste = stop('paste_blocked');
    const onContext = (event) => event.preventDefault();
    const onKeyDown = (event) => {
      const combo = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (event.key === 'F12' || (combo && event.shiftKey && ['i', 'j', 'c'].includes(key))) {
        event.preventDefault();
        report('shortcut_blocked');
        return;
      }
      if (combo && BLOCKED_KEYS.has(key) && blockPaste) {
        event.preventDefault();
        report('shortcut_blocked');
      }
    };
    if (blockPaste) {
      document.addEventListener('copy', onCopy);
      document.addEventListener('cut', onCopy);
      document.addEventListener('paste', onPaste);
      document.addEventListener('dragstart', onContext);
    }
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('dragstart', onContext);
      document.removeEventListener('contextmenu', onContext);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [blockPaste, locked, submittedAt, report]);

  // Passage en plein écran à l'ouverture. Un échec n'est pas une sortie d'épreuve :
  // le navigateur exige simplement un geste de l'apprenant, qu'on lui demande.
  useEffect(() => {
    if (!rules.fullscreen || locked || submittedAt) return undefined;
    let cancelled = false;
    const settle = (entered) => {
      if (!cancelled) setAwaitingFullscreen(!entered);
    };
    if (document.fullscreenElement) {
      settle(true);
      return () => {
        cancelled = true;
      };
    }
    const request = document.documentElement.requestFullscreen?.();
    if (request) request.then(() => settle(true)).catch(() => settle(false));
    return () => {
      cancelled = true;
    };
  }, [rules.fullscreen, locked, submittedAt]);

  // Clôture automatique : le travail est poussé puis l'accès en écriture cesse.
  useEffect(() => {
    if (secondsLeft !== 0 || submittedAt || locked) return;

    // Sauvegarder le snapshot final en local dans tous les cas
    const allEdits = {};
    data.exercises.forEach((item) => {
      allEdits[item.id] = codeOf(item.id);
    });
    writeFinalSnapshot(evaluationId, allEdits);

    // L'écran de fin reste affiché : il confirme la remise et, hors ligne, il
    // demande de garder la page ouverte jusqu'à l'envoi.
    guardSuspended.current = true;
    if (navigator.onLine) {
      flush().then((complete) => {
        if (complete) {
          clearDrafts(evaluationId, data.exercises.map((item) => item.id));
          clearFinalSnapshot(evaluationId);
        }
        if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        setFinished({ reason: 'expired', at: new Date().toISOString() });
      });
    } else {
      // Hors ligne : le snapshot local est déjà écrit, il sera envoyé au retour
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      setFinished({ reason: 'expired', at: new Date().toISOString() });
    }
  }, [secondsLeft, submittedAt, locked, flush, evaluationId, data.exercises, codeOf]);

  const onChange = useCallback(
    (value) => {
      if (!current) return;
      setEdits((prev) => ({ ...prev, [current]: value }));
      dirty.current.add(current);
      setHasPending(true);
      // Aucune requête à la frappe : le brouillon reste sur le poste.
      clearTimeout(localTimer.current);
      localTimer.current = setTimeout(() => {
        writeDraft(evaluationId, current, value);
        setLocalSavedAt(new Date().toISOString());
      }, LOCAL_SAVE_MS);
    },
    [current, evaluationId],
  );

  useEffect(() => () => clearTimeout(localTimer.current), []);

  const extensions = useMemo(
    () => EXTENSIONS[exercise?.language] ?? EXTENSIONS.c,
    [exercise?.language],
  );
  /* L'éditeur suit le thème de l'application : figé en clair, il écrivait du
     texte sombre sur un fond sombre : l'apprenant ne voyait plus sa frappe. */
  const { theme } = useTheme();
  /* Le barème de l'épreuve ne change pas pendant qu'on compose : on le calcule
     une fois, sinon la feuille de gauche se refait à chaque frappe. */
  const barèmeTotal = useMemo(
    () => data.exercises.reduce((sum, item) => sum + Number(item.points || 0), 0),
    [data.exercises],
  );
  /* Une épreuve sans exercice de code n'annonce pas de langage sur sa feuille. */
  const langageAffiche = evaluationUsesLanguage(data.exercises)
    ? data.evaluation.language
    : null;

  async function resume() {
    if (rules.fullscreen && !document.fullscreenElement) {
      await document.documentElement
        .requestFullscreen?.()
        .then(() => setAwaitingFullscreen(false))
        .catch(() => {});
    } else {
      setAwaitingFullscreen(false);
    }
    setPaused(false);
  }

  async function start() {
    await document.documentElement.requestFullscreen?.().catch(() => {});
    setAwaitingFullscreen(false);
  }

  function leaveFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }

  async function submit() {
    // Pendant l'envoi, la surveillance se tait : la sortie du plein écran qui
    // suit la remise de la copie n'est pas une sortie d'épreuve.
    guardSuspended.current = true;
    setSubmitting(true);
    const resumeGuard = () => {
      guardSuspended.current = false;
      setSubmitting(false);
      setConfirmSubmit(false);
    };
    const complete = await flush();
    if (!complete) {
      // Le brouillon local reste en place : rien n'est effacé tant que le serveur n'a pas reçu.
      resumeGuard();
      setError("L'envoi de votre travail a échoué : vérifiez la connexion avant de soumettre.");
      return;
    }
    try {
      const res = await api(`/api/me/evaluations/${evaluationId}/submit`, { method: 'POST' });
      clearDrafts(evaluationId, data.exercises.map((item) => item.id));
      setSubmittedAt(res.submitted_at);
      setFinished({ reason: 'submitted', at: res.submitted_at });
      leaveFullscreen();
    } catch (err) {
      if (err.status === 409) {
        setFinished({ reason: 'submitted', at: new Date().toISOString() });
        leaveFullscreen();
        return;
      }
      resumeGuard();
      setError(err.message);
    }
  }

  const [showSubject, setShowSubject] = useState(false);

  const remaining = maxIncidents ? Math.max(0, maxIncidents - incidents) : null;
  const treatedCount = data.exercises.filter((item) => answered(item.id)).length;

  if (finished) {
    const treated = treatedCount;
    return (
      <div className="exam exam-done">
        <header className="exam-topbar">
          <div className="brand" style={{ padding: 0, fontSize: 16 }}>
            <span className="brand-dot" aria-hidden="true" />
            CodEval
          </div>
          <span className="title">{data.evaluation.title}</span>
        </header>
        <div className="exam-done-body">
          <div className="exam-done-card">
            <div className="exam-done-mark" aria-hidden="true">
              ✓
            </div>
            <h1>
              {finished.reason === 'expired' ? 'Temps écoulé' : 'Travail soumis'}
            </h1>
            <p>
              {finished.reason === 'expired'
                ? online
                  ? "Le temps imparti est écoulé. Votre travail a été enregistré et transmis ; il ne peut plus être modifié."
                  : "Le temps imparti est écoulé. Votre travail a été sauvegardé localement et sera transmis automatiquement dès le retour de la connexion. Ne fermez pas cette page."
                : 'Votre copie a été transmise à votre enseignant. Elle ne peut plus être modifiée.'}
            </p>
            <dl className="exam-done-facts">
              <div>
                <dt>Épreuve</dt>
                <dd>{data.evaluation.title}</dd>
              </div>
              <div>
                <dt>Questions traitées</dt>
                <dd>
                  {treated} / {data.exercises.length}
                </dd>
              </div>
              <div>
                <dt>{finished.reason === 'expired' ? 'Clôture' : 'Soumission'}</dt>
                <dd>{formatDateTime(finished.at)}</dd>
              </div>
            </dl>
            <p className="sub">
              Vos résultats seront visibles dans « Mes résultats » après la correction et la
              validation par votre enseignant.
            </p>
            <Button onClick={() => navigate('/mes-evaluations', { replace: true })}>
              Retour à mes évaluations
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="exam">
      <header className="exam-topbar">
        <div className="brand" style={{ padding: 0, fontSize: 16 }}>
          <span className="brand-dot" aria-hidden="true" />
          CodEval
        </div>
        <span className="title">{data.evaluation.title}</span>
        {guarded && incidents > 0 && (
          <span className="exam-incidents" title="Sorties d'épreuve détectées">
            {maxIncidents ? `Sorties : ${incidents} / ${maxIncidents}` : `Sorties : ${incidents}`}
          </span>
        )}
        <span
          className={`exam-timer ${secondsLeft <= 300 ? 'urgent' : ''}`}
          role="timer"
          title="Temps restant"
        >
          {formatDuration(secondsLeft)}
        </span>
        {allowSubmit && !submittedAt && !locked && (
          <Button onClick={() => setConfirmSubmit(true)} disabled={submitting}>
            Soumettre
          </Button>
        )}
      </header>

      {/* La navigation entre exercices tient sur une réglette : pendant
          l'épreuve, l'écran appartient au sujet et à la copie, rien d'autre. */}
      <nav className="exam-regle" aria-label="Exercices">
        <span className="exam-regle-avance">
          {data.exercises.filter((item) => answered(item.id)).length} / {data.exercises.length} traités
        </span>
        <div className="exam-regle-pastilles">
          {data.exercises.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`exam-pastille ${answered(item.id) ? 'done' : ''}`}
              aria-current={item.id === current && !showSubject}
              title={`Exercice ${index + 1} : ${item.points} pts`}
              onClick={() => { setCurrentId(item.id); setShowSubject(false); }}
            >
              {index + 1}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`exam-regle-sujet ${showSubject ? 'active' : ''}`}
          aria-pressed={showSubject}
          onClick={() => setShowSubject((s) => !s)}
        >
          Sujet complet
        </button>
      </nav>

      <div className="exam-body">
        <div className={`exam-main ${showSubject ? 'exam-main--subject' : ''}`}>
          {error && <Alert>{error}</Alert>}

          {showSubject ? (
            <div className="exam-subject-panel">
              <div className="sheet-paper">
                <SubjectSheet
                  organization={organization}
                  classroom={data.evaluation.classroom_name}
                  subject={data.evaluation.subject_name}
                  title={data.evaluation.title}
                  instructions={data.instructions}
                  durationMinutes={data.evaluation.duration_minutes}
                  language={langageAffiche}
                  date={data.evaluation.scheduled_start}
                  exercises={data.exercises}
                />
              </div>
            </div>
          ) : exercise && (
            <>
              <FeuilleDeComposition
                organization={organization}
                evaluation={data.evaluation}
                instructions={data.instructions}
                exercise={exercise}
                number={data.exercises.findIndex((e) => e.id === exercise.id) + 1}
                total={data.exercises.length}
                points={barèmeTotal}
                language={langageAffiche}
              />

              <div className="exam-right">
                <div className="exam-editor">
                  {hasQuestions(exercise.kind) ? (
                    <QuestionsStudent
                      exercise={exercise}
                      value={codeOf(exercise.id)}
                      onChange={onChange}
                      readOnly={Boolean(submittedAt) || locked}
                    />
                  ) : exercise.kind === 'truefalse' ? (
                    <TrueFalseStudent
                      exercise={exercise}
                      value={codeOf(exercise.id)}
                      onChange={onChange}
                      readOnly={Boolean(submittedAt) || locked}
                    />
                  ) : exercise.kind === 'algo' ? (
                    <AlgoEditor
                      value={codeOf(exercise.id)}
                      onChange={onChange}
                      allowed={exercise.settings?.allowed_elements}
                      readOnly={Boolean(submittedAt) || locked}
                    />
                  ) : (
                    <CodeMirror
                      value={codeOf(exercise.id)}
                      height="100%"
                      theme={theme === 'dark' ? 'dark' : 'light'}
                      extensions={extensions}
                      editable={!submittedAt && !locked}
                      onChange={onChange}
                      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
                    />
                  )}
                </div>

                <div className="exam-status">
                  <span>
                    {exercise.kind === 'code'
                      ? exercise.language.toUpperCase()
                      : exerciseType(exercise.kind).badge}
                  </span>
                  {!online && (
                    <span style={{ color: 'var(--exam-timer, #c0392b)', fontWeight: 600 }} aria-live="assertive">
                      Hors ligne : sauvegarde locale active
                    </span>
                  )}
                  <span aria-live="polite">
                    {sending
                      ? 'Envoi au serveur…'
                      : localSavedAt
                        ? `Sauvegardé localement · ${formatRelative(localSavedAt)}`
                        : 'Aucune modification'}
                  </span>
                  <span>
                    {sentAt ? `Transmis au serveur · ${formatRelative(sentAt)}` : 'Envoi à la soumission uniquement'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="exam-footer">
        Votre travail est enregistré localement. Il sera transmis au serveur à la soumission ou à la fin du temps.
        {blockPaste && ' Le copier-coller est désactivé.'}
      </footer>

      {locked && (
        <div className="exam-overlay" role="alertdialog" aria-modal="true">
          <div className="exam-overlay-card">
            <h2>Épreuve verrouillée</h2>
            <p>
              {incidents} sortie{incidents > 1 ? 's' : ''} de l'environnement d'épreuve
              {incidents > 1 ? ' ont' : ' a'} été détectée{incidents > 1 ? 's' : ''}. Votre copie a
              été figée et l'incident transmis à l'enseignant.
            </p>
            {hasPending ? (
              <p style={{ color: 'var(--exam-timer)' }}>
                Une partie de votre travail n'a pas pu être envoyée. Elle reste enregistrée sur ce
                poste : signalez-le à votre enseignant sans effacer les données du navigateur.
              </p>
            ) : (
              <p>Votre dernier état de travail a bien été transmis au serveur.</p>
            )}
            <Button onClick={() => navigate('/mes-evaluations', { replace: true })}>
              Retour à mes évaluations
            </Button>
          </div>
        </div>
      )}

      {confirmSubmit && !paused && !locked && !awaitingFullscreen && (
        <div
          className="exam-overlay"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-submit-title"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !submitting) setConfirmSubmit(false);
          }}
        >
          <div className="exam-overlay-card">
            <h2 id="confirm-submit-title">Soumettre votre copie ?</h2>
            <p>
              {treatedCount} exercice{treatedCount > 1 ? 's' : ''} traité
              {treatedCount > 1 ? 's' : ''} sur {data.exercises.length}. Une fois soumise, la
              copie ne peut plus être modifiée.
            </p>
            <div className="exam-overlay-actions">
              <Button
                variant="secondary"
                disabled={submitting}
                onClick={() => setConfirmSubmit(false)}
                autoFocus
              >
                Continuer l'épreuve
              </Button>
              <Button onClick={submit} disabled={submitting}>
                {submitting ? 'Envoi…' : 'Soumettre définitivement'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {awaitingFullscreen && !paused && !locked && (
        <div className="exam-overlay" role="dialog" aria-modal="true">
          <div className="exam-overlay-card">
            <h2>Épreuve en plein écran</h2>
            <p>
              Cette épreuve se déroule en plein écran. Cliquez pour commencer : le chronomètre a
              déjà démarré et votre travail est enregistré automatiquement.
            </p>
            <Button onClick={start}>Commencer l'épreuve</Button>
          </div>
        </div>
      )}

      {paused && !locked && (
        <div className="exam-overlay" role="alertdialog" aria-modal="true">
          <div className="exam-overlay-card">
            <h2>Sortie de l'épreuve détectée</h2>
            <p>
              Vous avez quitté la fenêtre d'épreuve. L'événement a été enregistré et transmis à
              l'enseignant.
              {remaining !== null && (
                <strong>
                  {' '}
                  Encore {remaining} sortie{remaining > 1 ? 's' : ''} avant le verrouillage
                  automatique de votre copie.
                </strong>
              )}
            </p>
            <Button onClick={resume}>Reprendre l'épreuve</Button>
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * La feuille de composition, à gauche de l'écran : le sujet tel qu'il est
 * distribué sur papier : en-tête de l'épreuve, énoncé de l'exercice en cours,
 * code de départ, exigences du barème.
 *
 * Elle est figée. L'apprenant écrit à droite, et rien de ce qu'il tape ne
 * touche à cette feuille : ni le code de départ, qui reste celui de l'énoncé,
 * ni sa position de lecture. D'où le `memo` : les props ne changent qu'en
 * changeant d'exercice, jamais à la frappe.
 */
const FeuilleDeComposition = memo(function FeuilleDeComposition({
  organization,
  evaluation,
  instructions,
  exercise,
  number,
  total,
  points,
  language,
}) {
  return (
    <section className="exam-feuille" aria-label="Feuille de composition">
      <div className="exam-feuille-tete">
        <span className="exam-feuille-onglet">Feuille de composition</span>
        <span className="exam-feuille-rang">
          Exercice {number} sur {total} · {exercise.points} pt{exercise.points > 1 ? 's' : ''}
        </span>
      </div>

      <div className="exam-feuille-papier sujet">
        <SheetHeader
          organization={organization}
          classroom={evaluation.classroom_name}
          subject={evaluation.subject_name}
          title={evaluation.title}
          durationMinutes={evaluation.duration_minutes}
          points={points}
          language={language}
          date={evaluation.scheduled_start}
        />
        <SheetInstructions>{instructions}</SheetInstructions>
        <SheetExercise exercise={exercise} number={number} showAnswerZone={false} />
        <p className="exam-feuille-pied">
          Ce sujet ne change pas pendant l'épreuve : votre travail s'écrit dans la zone de droite.
        </p>
      </div>
    </section>
  );
});

/**
 * Mélange stable : l'ordre dépend de l'exercice, jamais du hasard du moment.
 * Un tirage aléatoire réordonnait les propositions à chaque retour sur la
 * question, ce qui désoriente l'apprenant en pleine épreuve.
 */
function shuffleIndices(count, seed) {
  const indices = Array.from({ length: count }, (_, i) => i);
  let state = (Number(seed) || 1) * 2654435761 % 2147483647;
  for (let i = indices.length - 1; i > 0; i -= 1) {
    state = (state * 48271) % 2147483647;
    const j = state % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

function QcmQuestion({ question, rank, seed, value, onChange, readOnly }) {
  const choices = question.choices ?? [];
  const multiple = Boolean(question.multiple);
  const selected = value?.selected ?? [];

  const shuffled = useMemo(
    () => shuffleIndices(choices.length, seed),
    [choices.length, seed],
  );

  const toggle = (index) => {
    if (readOnly) return;
    const next = multiple
      ? (selected.includes(index) ? selected.filter((i) => i !== index) : [...selected, index])
      : [index];
    onChange({ selected: next });
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p className="sub">
        {multiple ? 'Cochez toutes les réponses correctes.' : 'Choisissez la bonne réponse.'}
      </p>
      {shuffled.map((originalIndex) => {
        const choice = choices[originalIndex];
        if (!choice) return null;
        const isSelected = selected.includes(originalIndex);
        return (
          <label
            key={originalIndex}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              borderRadius: 8, border: '1.5px solid',
              borderColor: isSelected ? 'var(--primary, #3b82f6)' : 'var(--border, #e2e8f0)',
              background: isSelected ? 'var(--primary-soft, #eff6ff)' : 'transparent',
              cursor: readOnly ? 'default' : 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={`qcm-${seed}-${rank}`}
              checked={isSelected}
              disabled={readOnly}
              onChange={() => toggle(originalIndex)}
            />
            <span style={{ fontSize: 14 }}>{choice.text}</span>
          </label>
        );
      })}
    </div>
  );
}

/** Vrai/Faux : deux boutons par affirmation, sans réponse pré-cochée. */
function TrueFalseStudent({ exercise, value, onChange, readOnly }) {
  const statements = exercise.settings?.statements ?? [];

  let answers = {};
  try {
    answers = JSON.parse(value || '{}').answers ?? {};
  } catch { /* ignore */ }

  const setAnswer = (index, choice) => {
    if (readOnly) return;
    onChange(JSON.stringify({ answers: { ...answers, [String(index)]: choice } }));
  };

  return (
    <div style={{ padding: 20, display: 'grid', gap: 10 }}>
      <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        Pour chaque affirmation, indiquez si elle est vraie ou fausse :
      </p>
      {statements.map((statement, index) => {
        const chosen = answers[String(index)];
        return (
          <div
            key={index}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              borderRadius: 8, border: '1px solid var(--border, #e2e8f0)',
            }}
          >
            <span style={{ flex: 1, fontSize: 14 }}>{statement.text}</span>
            {[true, false].map((option) => (
              <label
                key={String(option)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 14, cursor: readOnly ? 'default' : 'pointer',
                  fontWeight: chosen === option ? 600 : 400,
                }}
              >
                <input
                  type="radio"
                  name={`vf-${exercise.id}-${index}`}
                  checked={chosen === option}
                  disabled={readOnly}
                  onChange={() => setAnswer(index, option)}
                />
                {option ? 'Vrai' : 'Faux'}
              </label>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Question-réponse : une zone de rédaction. La réponse est enregistrée telle
 * quelle, comme le code d'un exercice pratique : pas de JSON à relire.
 */
function ShortAnswerQuestion({ value, onChange, readOnly }) {
  return (
    <textarea
      aria-label="Votre réponse"
      value={value?.text ?? ''}
      readOnly={readOnly}
      onChange={(e) => onChange({ text: e.target.value })}
      placeholder="Votre réponse…"
      style={{
        width: '100%', minHeight: 120, resize: 'vertical',
        padding: '12px 14px', fontSize: 14, lineHeight: 1.6,
        borderRadius: 8, border: '1px solid var(--border, #e2e8f0)',
      }}
    />
  );
}

function MatchingQuestion({ question, value, onChange, readOnly }) {
  const pairs = question.pairs ?? [];
  // Le serveur envoie les éléments de droite déjà mélangés, désignés par un jeton
  // opaque : la bonne association ne transite jamais par le navigateur.
  const options =
    question.right_options ?? pairs.map((pair, index) => ({ token: String(index), text: pair.right }));
  const matches = value?.matches ?? {};

  if (pairs.length === 0) {
    return <p className="sub">Aucune correspondance à établir dans cette question.</p>;
  }

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p className="sub">
        Reliez chaque élément du bloc de gauche à celui qui lui correspond dans le bloc de droite.
      </p>
      <MatchingBoard
        left={pairs.map((pair, index) => ({ key: String(index), text: pair.left }))}
        right={options.map((option, index) => ({
          key: option.token ?? String(index),
          text: option.text,
        }))}
        links={matches}
        readOnly={readOnly}
        onLink={(suite) => onChange({ matches: suite })}
      />
    </div>
  );
}

/**
 * Les questions d'un QCM, d'une correspondance ou d'une question-réponse.
 *
 * L'exercice porte plusieurs questions, chacune avec son énoncé et sa réponse ;
 * la production rendue les rassemble dans un seul objet, dans l'ordre du sujet.
 */
function QuestionsStudent({ exercise, value, onChange, readOnly }) {
  const kind = exercise.kind;
  const questions = questionsOf(kind, exercise.settings);
  const answers = answersOf(kind, value, questions.length);

  const answer = (rank, given) =>
    onChange(packAnswers(answers.map((previous, i) => (i === rank ? given : previous))));

  return (
    <div style={{ padding: 20, display: 'grid', gap: 18, overflowY: 'auto' }}>
      {questions.map((question, rank) => (
        <section key={rank} style={{ display: 'grid', gap: 10 }}>
          {/* pre-wrap : une question peut citer un programme, ses retours à la
              ligne et son indentation doivent survivre. */}
          <p style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'pre-wrap' }}>
            {questions.length > 1 && `${rank + 1}. `}
            {question.text || <em className="sub">(question sans énoncé)</em>}
          </p>
          {kind === 'qcm' && (
            <QcmQuestion
              question={question}
              rank={rank}
              seed={exercise.id * 31 + rank}
              value={answers[rank]}
              readOnly={readOnly}
              onChange={(given) => answer(rank, given)}
            />
          )}
          {kind === 'matching' && (
            <MatchingQuestion
              question={question}
              value={answers[rank]}
              readOnly={readOnly}
              onChange={(given) => answer(rank, given)}
            />
          )}
          {kind === 'short' && (
            <ShortAnswerQuestion
              value={answers[rank]}
              readOnly={readOnly}
              onChange={(given) => answer(rank, given)}
            />
          )}
        </section>
      ))}
    </div>
  );
}
