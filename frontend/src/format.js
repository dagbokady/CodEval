
const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return `${dateFmt.format(date)} · ${timeFmt.format(date)}`;
}

export function formatSchedule(evaluation) {
  if (!evaluation.scheduled_start) return '—';
  const start = new Date(evaluation.scheduled_start);
  const end = new Date(start.getTime() + evaluation.duration_minutes * 60000);
  return `${dateFmt.format(start)} · ${timeFmt.format(start)} — ${timeFmt.format(end)}`;
}

export function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '—';
  const s = Math.max(0, Math.floor(seconds));
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function formatRelative(value) {
  if (!value) return '—';
  const diff = Math.round((Date.now() - new Date(value).getTime()) / 1000);
  if (diff < 60) return `il y a ${Math.max(1, diff)} s`;
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
  return formatDateTime(value);
}

export function formatScore(score, total) {
  if (score === null || score === undefined) return '—';
  const clean = (n) => String(Math.round(n * 100) / 100).replace('.', ',');
  return `${clean(score)} / ${clean(total)}`;
}

/** Nature d'une évaluation : ce que l'enseignante annonce à sa classe. */
export const EVAL_KIND_LABELS = {
  devoir: 'Devoir',
  interro: 'Interrogation',
  examen: 'Examen',
};

export const STATUS_LABELS = {
  draft: 'Brouillon',
  scheduled: 'Programmée',
  running: 'En cours',
  closed: 'Terminée',
  correcting: 'En correction',
  corrected: 'Corrigée',
  validated: 'Validée',
};

export const STATUS_TONES = {
  draft: 'neutral',
  scheduled: 'warning',
  running: 'solid',
  closed: 'neutral',
  correcting: 'purple',
  corrected: 'success',
  validated: 'success',
};

export const RUN_LABELS = {
  pending: 'En attente',
  running: 'En cours',
  done: 'Terminée',
  partial: 'Partiellement échouée',
  failed: 'Échouée',
};

/** Types de question : le catalogue fait foi, on ne le duplique pas ici. */
export { KIND_LABELS } from './exerciseTypes';

/** Durée d'épreuve à la manière d'un sujet imprimé : 90 → « 1h30mn ». */
const examDateFmt = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

/** La date portée au cartouche d'une feuille : « 12 mars 2026 · 08:00 ». */
export function formatExamDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return `${examDateFmt.format(date)} · ${timeFmt.format(date)}`;
}

export function formatExamDuration(minutes) {
  const total = Number(minutes) || 0;
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest}mn`;
  if (!rest) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, '0')}mn`;
}

/**
 * Numérotation du sujet : ce qu'on crée est un exercice, et ce sont ses
 * questions qui portent les « Q1 », « Q2 ». Sans rang — un exercice regardé
 * seul, hors d'un sujet — il ne reste que le mot.
 */
export function exerciseLabel(number) {
  return number ? `Exercice ${number}` : 'Exercice';
}
