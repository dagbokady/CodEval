/**
 * Thème clair / sombre.
 *
 * Trois modes : « système », « clair », « sombre ». Le mode retenu est
 * conservé sur le poste ; c'est lui, et non le thème affiché, qui est
 * mémorisé : quelqu'un qui reste en « système » doit continuer à suivre son
 * système, y compris lorsque celui-ci bascule pendant que la page est ouverte.
 *
 * Le contrôleur résout le mode en un thème effectif et le pose sur <html>,
 * pour que la feuille de style n'ait qu'un seul jeu de valeurs sombres à tenir
 * et que l'écran d'épreuve, rendu hors de la coquille d'application, en hérite
 * comme le reste.
 */

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'codeval.theme';
export const THEME_MODES = ['system', 'light', 'dark'];

export const MODE_LABELS = {
  system: 'Thème du système',
  light: 'Thème clair',
  dark: 'Thème sombre',
};

const darkQuery = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function readMode() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return THEME_MODES.includes(stored) ? stored : 'system';
  } catch {
    return 'system'; // navigation privée ou stockage refusé
  }
}

function systemTheme() {
  return darkQuery()?.matches ? 'dark' : 'light';
}

function resolve(mode) {
  return mode === 'system' ? systemTheme() : mode;
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

/** Mode courant, thème effectif, et bascule. */
export function useTheme() {
  const [mode, setMode] = useState(readMode);
  const [theme, setTheme] = useState(() => resolve(readMode()));

  // Le système change pendant que la page est ouverte : on suit, mais
  // uniquement si l'utilisateur n'a pas fait de choix explicite.
  useEffect(() => {
    const query = darkQuery();
    if (!query) return undefined;
    const onChange = () => {
      if (mode === 'system') {
        const next = systemTheme();
        setTheme(next);
        applyTheme(next);
      }
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [mode]);

  const choose = useCallback((next) => {
    const chosen = THEME_MODES.includes(next) ? next : 'system';
    setMode(chosen);
    const resolved = resolve(chosen);
    setTheme(resolved);
    applyTheme(resolved);
    try {
      localStorage.setItem(STORAGE_KEY, chosen);
    } catch {
      /* le thème reste appliqué pour la session en cours */
    }
  }, []);

  /** Bouton : clair → sombre → système → clair. */
  const cycle = useCallback(() => {
    choose(mode === 'light' ? 'dark' : mode === 'dark' ? 'system' : 'light');
  }, [mode, choose]);

  return { mode, theme, choose, cycle };
}

/** Appliqué au démarrage, avant le premier rendu. */
export function initTheme() {
  applyTheme(resolve(readMode()));
}
