import { useCallback, useEffect, useRef, useState } from 'react';

/** Horloge partagée : évite de dupliquer un état de décompte par écran. */
export function useNow(intervalMs = 1000, enabled = true) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, enabled]);
  return now;
}

export function secondsUntil(deadline, now) {
  if (!deadline) return null;
  return Math.max(0, Math.round((new Date(deadline).getTime() - now) / 1000));
}

/**
 * Décompte fondé sur le temps restant annoncé par le serveur et sur une horloge
 * monotone (`performance.now()`), insensible aux changements d'heure du poste.
 * `resync` réaligne le décompte sur chaque réponse du serveur qui le renvoie.
 */
export function useServerCountdown(initialSecondsLeft, enabled = true) {
  const deadline = useRef(null);
  const [secondsLeft, setSecondsLeft] = useState(initialSecondsLeft ?? 0);

  // L'échéance est posée sur l'horloge monotone du navigateur, jamais sur l'heure
  // du système : modifier la date du poste ne change pas le temps restant.
  useEffect(() => {
    deadline.current = performance.now() + (initialSecondsLeft ?? 0) * 1000;
  }, [initialSecondsLeft]);

  useEffect(() => {
    if (!enabled) return undefined;
    const timer = setInterval(() => {
      if (deadline.current === null) return;
      setSecondsLeft(Math.max(0, Math.round((deadline.current - performance.now()) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [enabled]);

  const resync = useCallback((serverSecondsLeft) => {
    if (typeof serverSecondsLeft !== 'number') return;
    deadline.current = performance.now() + serverSecondsLeft * 1000;
    setSecondsLeft(serverSecondsLeft);
  }, []);

  return { secondsLeft, resync };
}
