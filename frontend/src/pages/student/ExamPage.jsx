import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import CodeMirror from '@uiw/react-codemirror';
import { cpp } from '@codemirror/lang-cpp';
import { python } from '@codemirror/lang-python';
import { api, sendOnLeave } from '../../api/client';
import AlgoEditor from '../../components/AlgoEditor';
import ProjectEditor from '../../components/ProjectEditor';
import { isProject, projectFiles } from '../../project';
import CodeBlock from '../../components/CodeBlock';
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
import { algorithmText, parseAlgorithm } from '../../algoVocabulary';
import { useServerCountdown } from '../../useNow';
import { useTheme } from '../../theme';
import {
  clearDrafts, markSynced, restoreDrafts, unsentDrafts, writeDraft,
  pushOfflineIncident, readOfflineIncidents, clearOfflineIncidents,
} from '../../examStorage';

const EXTENSIONS = { c: [cpp()], cpp: [cpp()], python: [python()] };
const LOCAL_SAVE_MS = 400; // écriture dans le navigateur, sans appel réseau
const SYNC_MS = 15000; // envoi en arrière-plan de ce qui a changé
const PULSE_MS = 20000; // état de l'épreuve : prolongation, clôture, verrouillage
const RETRY_MS = 5000; // nouvel essai d'un envoi final resté en attente
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

  if (exam.isPending) return <Loading variant="screen" label="Ouverture de l'épreuve…" />;
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
              <LeftoverUpload evaluationId={evaluationId} />
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

/**
 * L'épreuve est close alors que ce poste garde du travail jamais transmis (le
 * navigateur a planté, la page a été fermée avant l'envoi) : on le pousse tant
 * que le serveur l'accepte encore, et l'on dit franchement ce qu'il en est.
 */
function LeftoverUpload({ evaluationId }) {
  const [state, setState] = useState(() =>
    unsentDrafts(evaluationId).length ? 'sending' : 'none',
  );

  useEffect(() => {
    const drafts = unsentDrafts(evaluationId);
    if (!drafts.length) return undefined;
    let cancelled = false;
    (async () => {
      const refused = [];
      let failed = false;
      for (const { exerciseId, code } of drafts) {
        try {
          await api(`/api/me/evaluations/${evaluationId}/exercises/${exerciseId}`, {
            method: 'PUT',
            body: { code, version: 0 },
          });
          markSynced(evaluationId, exerciseId, code);
        } catch (err) {
          if (err.status === 404) markSynced(evaluationId, exerciseId, code);
          else if (err.status === 409) refused.push({ exerciseId, code });
          else failed = true;
        }
      }
      // Un refus ne dit pas que le travail manque : l'envoi de départ de la page
      // a pu arriver. La copie déposée fait foi.
      if (refused.length) {
        try {
          const copy = await api(`/api/me/results/${evaluationId}`);
          const answers = Object.fromEntries(
            copy.exercises.map((item) => [item.exercise_id, item.answer]),
          );
          refused
            .filter(({ exerciseId, code }) => answers[exerciseId] === code)
            .forEach(({ exerciseId, code }) => markSynced(evaluationId, exerciseId, code));
        } catch {
          /* copie illisible : on s'en tient aux brouillons restants */
        }
      }
      if (cancelled) return;
      if (failed) setState('failed');
      else setState(unsentDrafts(evaluationId).length ? 'refused' : 'sent');
    })();
    return () => {
      cancelled = true;
    };
  }, [evaluationId]);

  if (state === 'none') return null;
  if (state === 'sending') return <p aria-live="polite">Envoi du travail resté sur ce poste…</p>;
  if (state === 'sent') return <p>Le travail resté sur ce poste vient d'être transmis au serveur.</p>;
  return (
    <p style={{ color: 'var(--exam-timer)' }} role="alert">
      {state === 'failed'
        ? "Du travail resté sur ce poste n'a pas pu être envoyé : vérifiez la connexion puis rechargez la page."
        : "Du travail resté sur ce poste n'a pas été transmis avant la fermeture de l'épreuve."}{' '}
      Prévenez votre enseignant, sans effacer les données du navigateur.
    </p>
  );
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
  // Le serveur a définitivement refusé une partie du travail (épreuve close
  // depuis trop longtemps) : elle reste sur le poste, l'apprenant doit le savoir.
  const [refused, setRefused] = useState(false);
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
  // Les envois lisent toujours la dernière frappe, même lancés par une minuterie.
  const editsRef = useRef(edits);
  const inflight = useRef(Promise.resolve(true));
  const ending = useRef(false);
  // La copie reste à rendre après la clôture (voir `handIn`).
  const handInDue = useRef(false);
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
  const currentIndex = data.exercises.findIndex((item) => item.id === current);
  const nextExercise = currentIndex >= 0 ? data.exercises[currentIndex + 1] : undefined;
  const codeOf = useCallback(
    (exerciseId) => edits[exerciseId] ?? data.drafts[exerciseId] ?? '',
    [edits, data.drafts],
  );
  const latestCode = useCallback(
    (exerciseId) => editsRef.current[exerciseId] ?? data.drafts[exerciseId] ?? '',
    [data.drafts],
  );
  const answered = useCallback(
    (exerciseId) =>
      Boolean(edits[exerciseId]?.trim()) || data.saved_exercise_ids.includes(exerciseId),
    [edits, data.saved_exercise_ids],
  );

  // Le décompte vient du serveur et avance sur une horloge monotone : changer
  // l'heure du poste n'a aucun effet sur le temps restant.
  const { secondsLeft, resync } = useServerCountdown(
    data.seconds_left,
    !submittedAt && !locked && !finished,
  );

  /** Un envoi : « ok », « stale » (à renvoyer), « refused » (définitif), « failed » (à retenter). */
  const send = useCallback(
    async (exerciseId, code) => {
      try {
        const res = await api(`/api/me/evaluations/${evaluationId}/exercises/${exerciseId}`, {
          method: 'PUT',
          body: { code, version: versions.current[exerciseId] ?? 0 },
        });
        versions.current[exerciseId] = res.version;
        // Une version plus récente existe (autre onglet) : le code n'a pas été
        // enregistré. On le renvoie avec la bonne version au prochain passage.
        if (res.stale) return 'stale';
        markSynced(evaluationId, exerciseId, code);
        setSentAt(res.saved_at);
        if (!res.closed) resync(res.seconds_left);
        return 'ok';
      } catch (err) {
        if (err.status === 404) return 'ok'; // exercice retiré de l'épreuve : rien à garder
        if (err.status === 409) return 'refused';
        return 'failed';
      }
    },
    [evaluationId, resync],
  );

  /**
   * Transmet au serveur tout ce qui n'y est pas encore. Les envois sont mis en
   * file : une minuterie et une soumission ne se croisent jamais.
   */
  const flush = useCallback(() => {
    const run = async () => {
      if (dirty.current.size === 0) {
        setHasPending(false);
        return true;
      }
      const pending = [...dirty.current];
      dirty.current.clear();
      setSending(true);
      let complete = true;
      for (const exerciseId of pending) {
        const outcome = await send(exerciseId, latestCode(exerciseId));
        if (outcome === 'ok') continue;
        complete = false;
        if (outcome === 'refused') setRefused(true);
        else dirty.current.add(exerciseId);
      }
      setSending(false);
      setHasPending(dirty.current.size > 0);
      return complete;
    };
    inflight.current = inflight.current.then(run, run);
    return inflight.current;
  }, [latestCode, send]);

  /**
   * Fin de l'épreuve pour ce poste (temps écoulé, clôture par l'enseignant,
   * annulation) : l'écran de fin s'affiche et le dernier état part au serveur.
   */
  /**
   * Épreuve close ou temps écoulé : une fois le dernier état transmis, la copie
   * est rendue. L'enseignant n'attend alors plus que les postes coupés du
   * réseau pour lancer la correction. Un échec est sans gravité : le serveur
   * garde la copie telle que reçue, la remise sera retentée au retour en ligne.
   */
  const handIn = useCallback(async () => {
    if (!handInDue.current) return;
    try {
      await api(`/api/me/evaluations/${evaluationId}/submit`, { method: 'POST' });
      handInDue.current = false;
    } catch { /* retenté à la prochaine synchronisation */ }
  }, [evaluationId]);

  const finish = useCallback(
    async (reason) => {
      if (ending.current) return;
      ending.current = true;
      guardSuspended.current = true;
      setConfirmSubmit(false);
      setPaused(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
      setFinished({ reason, at: new Date().toISOString() });
      handInDue.current = reason === 'closed' || reason === 'expired';
      const complete = await flush();
      if (complete) {
        clearDrafts(evaluationId, data.exercises.map((item) => item.id));
        await handIn();
      }
    },
    [evaluationId, data.exercises, flush, handIn],
  );

  /**
   * Interroge le serveur sur l'état de l'épreuve : une prolongation, une
   * clôture anticipée ou un verrouillage se voient sans attendre le décompte.
   */
  const checkPulse = useCallback(async () => {
    let pulse;
    try {
      pulse = await api(`/api/me/evaluations/${evaluationId}/status`);
    } catch {
      return null; // hors ligne : on garde l'état connu
    }
    if (pulse.submitted_at) {
      setSubmittedAt(pulse.submitted_at);
      if (!ending.current) {
        ending.current = true;
        setFinished({ reason: 'submitted', at: pulse.submitted_at });
      }
    } else if (pulse.status === 'running' && !pulse.frozen) {
      resync(pulse.seconds_left);
    } else if (pulse.status === 'running') {
      // Verrouillée ailleurs (autre onglet, incidents hors ligne) : on pousse le travail.
      await flush();
      setLocked(true);
      setPaused(false);
    } else if (pulse.status === 'cancelled') {
      finish('cancelled');
    } else {
      finish(pulse.seconds_left > 0 ? 'closed' : 'expired');
    }
    return pulse;
  }, [evaluationId, finish, flush, resync]);

  // ── Synchronisation au retour en ligne ──────────────────────────────
  const syncPending = useCallback(async () => {
    // 1. Travail resté sur le poste (coupure réseau, page rechargée)
    const complete = await flush();
    if (complete && ending.current) {
      clearDrafts(evaluationId, data.exercises.map((item) => item.id));
      await handIn();
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
          // Verrouillage : envoyer tout le travail au serveur avant de figer
          await flush();
          setLocked(true);
          setPaused(false);
          if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
        }
      } catch { /* sera retenté au prochain retour en ligne */ }
    }

    // 3. L'épreuve a pu être prolongée ou close pendant la coupure
    if (!ending.current) await checkPulse();
  }, [evaluationId, data.exercises, flush, checkPulse, handIn]);

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
    if (navigator.onLine) queueMicrotask(syncPending);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [syncPending]);

  // Envoi en arrière-plan : un poste qui s'éteint, un navigateur qui plante ou
  // une page fermée ne font perdre que les dernières secondes de frappe.
  useEffect(() => {
    if (submittedAt || finished || locked) return undefined;
    const timer = setInterval(async () => {
      if (dirty.current.size === 0 || !navigator.onLine) return;
      const complete = await flush();
      if (!complete) checkPulse();
    }, SYNC_MS);
    return () => clearInterval(timer);
  }, [submittedAt, finished, locked, flush, checkPulse]);

  // Pouls de l'épreuve, même sans frappe : prolongation, clôture, présence.
  useEffect(() => {
    if (submittedAt || finished) return undefined;
    const timer = setInterval(() => {
      if (navigator.onLine) checkPulse();
    }, PULSE_MS);
    return () => clearInterval(timer);
  }, [submittedAt, finished, checkPulse]);

  // Travail non transmis après la fin ou le verrouillage : on retente jusqu'à
  // réussite ou refus définitif du serveur, sans que l'apprenant ait à agir.
  useEffect(() => {
    if (!(finished || locked) || !hasPending || refused || submittedAt) return undefined;
    const timer = setInterval(() => {
      if (navigator.onLine) syncPending();
    }, RETRY_MS);
    return () => clearInterval(timer);
  }, [finished, locked, hasPending, refused, submittedAt, syncPending]);

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

  // Départ de la page (fermeture, rechargement, navigation) : le travail non
  // transmis est écrit sur le poste et envoyé une dernière fois au serveur.
  useEffect(() => {
    const onLeave = () => {
      if (submittedAt) return;
      clearTimeout(localTimer.current);
      dirty.current.forEach((exerciseId) => {
        const code = latestCode(exerciseId);
        writeDraft(evaluationId, exerciseId, code);
        sendOnLeave(`/api/me/evaluations/${evaluationId}/exercises/${exerciseId}`, {
          body: { code, version: versions.current[exerciseId] ?? 0 },
        });
      });
    };
    window.addEventListener('pagehide', onLeave);
    return () => window.removeEventListener('pagehide', onLeave);
  }, [evaluationId, latestCode, submittedAt]);

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
    // Seul le glisser de texte est bloqué : les blocs de l'éditeur d'algorithme
    // (palette et poignées) doivent rester déplaçables.
    const onDragStart = (event) => {
      if (event.target.closest?.('.algo-editor [draggable="true"]')) return;
      event.preventDefault();
    };
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
      document.addEventListener('dragstart', onDragStart);
    }
    document.addEventListener('contextmenu', onContext);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCopy);
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('dragstart', onDragStart);
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

  // Fin du décompte : on vérifie d'abord auprès du serveur (une prolongation a
  // pu être accordée), puis le travail est poussé et l'accès en écriture cesse.
  useEffect(() => {
    if (secondsLeft !== 0 || submittedAt || locked || ending.current) return;
    let cancelled = false;
    (async () => {
      const pulse = navigator.onLine ? await checkPulse() : null;
      if (cancelled || ending.current) return;
      if (pulse?.status === 'running' && !pulse.frozen && pulse.seconds_left > 0) return;
      finish('expired');
    })();
    return () => {
      cancelled = true;
    };
  }, [secondsLeft, submittedAt, locked, checkPulse, finish]);

  const onChange = useCallback(
    (value) => {
      if (!current) return;
      editsRef.current = { ...editsRef.current, [current]: value };
      setEdits((prev) => ({ ...prev, [current]: value }));
      dirty.current.add(current);
      setHasPending(true);
      // Aucune requête à la frappe : le brouillon est écrit sur le poste, l'envoi
      // au serveur suit en arrière-plan.
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
      // Refus du serveur : l'épreuve a été close entre-temps, le pouls l'affiche.
      resumeGuard();
      const pulse = await checkPulse();
      if (pulse && pulse.status !== 'running') return;
      // Le brouillon local reste en place : rien n'est effacé tant que le serveur n'a pas reçu.
      setError(
        "L'envoi de votre travail a échoué : vérifiez la connexion avant de soumettre. " +
          'Votre travail reste enregistré sur ce poste.',
      );
      return;
    }
    try {
      const res = await api(`/api/me/evaluations/${evaluationId}/submit`, { method: 'POST' });
      clearDrafts(evaluationId, data.exercises.map((item) => item.id));
      ending.current = true;
      setSubmittedAt(res.submitted_at);
      setFinished({ reason: 'submitted', at: res.submitted_at });
      leaveFullscreen();
    } catch (err) {
      resumeGuard();
      if (err.status === 409) {
        // Session close pendant la soumission : le travail vient d'être transmis.
        await checkPulse();
        return;
      }
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
            <h1>{FINISHED_TITLES[finished.reason] ?? 'Épreuve terminée'}</h1>
            <p>{FINISHED_LEADS[finished.reason]}</p>
            {finished.reason !== 'submitted' && (
              <DeliveryNotice
                sending={sending}
                pending={hasPending}
                refused={refused}
                online={online}
                onRetry={syncPending}
              />
            )}
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
                <dt>{finished.reason === 'submitted' ? 'Soumission' : 'Clôture'}</dt>
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
          nextExercise ? (
            /* Tant qu'il reste une feuille, le bouton mène à la suivante : un
               « Soumettre » dès la première laisserait croire que tout est fini. */
            <Button
              onClick={() => {
                setCurrentId(nextExercise.id);
                setShowSubject(false);
              }}
            >
              Continuer →
            </Button>
          ) : (
            <Button onClick={() => setConfirmSubmit(true)} disabled={submitting}>
              Soumettre
            </Button>
          )
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
                  header={data.evaluation.sheet_header}
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
                copie={COPIE_SUR_FEUILLE.has(exercise.kind) ? codeOf(exercise.id) : undefined}
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
                      key={exercise.id}
                      value={codeOf(exercise.id)}
                      onChange={onChange}
                      allowed={exercise.settings?.allowed_elements}
                      readOnly={Boolean(submittedAt) || locked}
                    />
                  ) : isProject(exercise) ? (
                    <ProjectEditor
                      key={exercise.id}
                      files={projectFiles(exercise)}
                      language={exercise.language}
                      value={codeOf(exercise.id)}
                      onChange={onChange}
                      readOnly={Boolean(submittedAt) || locked}
                      theme={theme}
                      extensions={extensions}
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
                    {hasPending
                      ? 'Modifications en attente d’envoi'
                      : sentAt
                        ? `Transmis au serveur · ${formatRelative(sentAt)}`
                        : data.saved_exercise_ids.length
                          ? 'Travail déjà transmis au serveur'
                          : 'Rien à transmettre pour l’instant'}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <footer className="exam-footer">
        Votre travail est enregistré sur ce poste et transmis automatiquement au serveur, même si
        vous ne soumettez pas avant la fin du temps.
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
            <DeliveryNotice
              sending={sending}
              pending={hasPending}
              refused={refused}
              online={online}
              onRetry={syncPending}
            />
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

const FINISHED_TITLES = {
  submitted: 'Travail soumis',
  expired: 'Temps écoulé',
  closed: 'Épreuve close',
  cancelled: 'Épreuve annulée',
};

const FINISHED_LEADS = {
  submitted: 'Votre copie a été transmise à votre enseignant. Elle ne peut plus être modifiée.',
  expired: 'Le temps imparti est écoulé : votre copie ne peut plus être modifiée.',
  closed: "Votre enseignant a clos l'épreuve : votre copie ne peut plus être modifiée.",
  cancelled: "Votre enseignant a annulé l'épreuve : elle ne compte pas dans vos résultats.",
};

/**
 * Où en est l'envoi du dernier état de la copie. L'apprenant qui n'a pas
 * soumis doit savoir, sans ambiguïté, si son travail est arrivé au serveur.
 */
function DeliveryNotice({ sending, pending, refused, online, onRetry }) {
  if (refused) {
    return (
      <p style={{ color: 'var(--exam-timer)' }} role="alert">
        Une partie de votre travail n'a pas pu être transmise avant la fermeture de l'épreuve. Elle
        reste enregistrée sur ce poste : prévenez votre enseignant, sans effacer les données du
        navigateur.
      </p>
    );
  }
  if (sending) return <p aria-live="polite">Envoi de votre travail au serveur…</p>;
  if (pending) {
    return (
      <div role="alert">
        <p style={{ color: 'var(--exam-timer)' }}>
          {online
            ? "Votre travail n'est pas encore arrivé au serveur : nouvel essai automatique dans quelques secondes."
            : 'Connexion perdue : votre travail est gardé sur ce poste et sera transmis dès le retour du réseau.'}{' '}
          Ne fermez pas cette page.
        </p>
        <Button variant="secondary" onClick={onRetry}>
          Réessayer maintenant
        </Button>
      </div>
    );
  }
  return <p>Votre travail a bien été transmis au serveur.</p>;
}

/**
 * La feuille de composition, à gauche de l'écran : le sujet tel qu'il est
 * distribué sur papier : en-tête de l'épreuve, énoncé de l'exercice en cours,
 * code de départ, exigences du barème.
 *
 * Le sujet est figé. L'apprenant écrit à droite, et rien de ce qu'il tape ne
 * touche à l'énoncé : ni le code de départ, qui reste celui de l'énoncé, ni sa
 * position de lecture. D'où le `memo` : les props ne changent qu'en changeant
 * d'exercice, jamais à la frappe.
 *
 * Exception, les exercices dont la réponse se reporte sur la feuille (voir
 * `COPIE_SUR_FEUILLE`) : `copie` porte alors la production de l'apprenant.
 * L'algorithme se relit sous l'énoncé en pseudo-code, tel qu'il figurera sur
 * sa copie ; les V/F et QCM cochés s'entourent, les correspondances se tracent.
 */
/** Les types dont la réponse se reporte en direct sur la feuille de gauche. */
const COPIE_SUR_FEUILLE = new Set(['algo', 'truefalse', 'qcm', 'matching']);

const FeuilleDeComposition = memo(function FeuilleDeComposition({
  organization,
  evaluation,
  instructions,
  exercise,
  number,
  total,
  points,
  language,
  copie,
}) {
  const algo = exercise.kind === 'algo';
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
          header={evaluation.sheet_header}
        />
        <SheetInstructions>{instructions}</SheetInstructions>
        <SheetExercise
          exercise={exercise}
          number={number}
          showAnswerZone={false}
          answer={algo ? undefined : copie}
        />
        {algo && <ApercuAlgorithme copie={copie} />}
        <p className="exam-feuille-pied">
          {algo
            ? 'Le sujet ne change pas pendant l\'épreuve. Votre algorithme se compose à droite et se relit ici, tel qu\'il figurera sur votre copie.'
            : 'Ce sujet ne change pas pendant l\'épreuve : votre travail s\'écrit dans la zone de droite.'}
        </p>
      </div>
    </section>
  );
});

/** L'algorithme en cours, relu en pseudo-code sous l'énoncé. */
function ApercuAlgorithme({ copie }) {
  const texte = useMemo(() => algorithmText(parseAlgorithm(copie)), [copie]);
  return (
    <div className="exam-feuille-copie" aria-live="off">
      <span className="exam-feuille-copie-titre">Votre algorithme</span>
      <CodeBlock className="exam-feuille-copie-code" code={texte} language="algo" />
    </div>
  );
}

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
