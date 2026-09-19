/**
 * Ce qu'une enseignante veut savoir d'une classe d'un coup d'œil, tiré de ses
 * épreuves : ce qui tourne, ce qui vient, ce qui est fini, et comment la classe
 * s'en sort. Partagé par la liste des classes et la page d'une classe, pour
 * qu'elles ne se contredisent jamais.
 */

const UPCOMING_STATUSES = ['draft', 'scheduled'];
const DONE_STATUSES = ['closed', 'correcting', 'corrected', 'validated', 'cancelled'];

const time = (evaluation) =>
  evaluation.scheduled_start ? new Date(evaluation.scheduled_start).getTime() : null;

export function summarize(evaluations) {
  const running = evaluations.filter((e) => e.status === 'running');
  // La plus proche d'abord ; un brouillon sans date passe après les épreuves datées.
  const upcoming = evaluations
    .filter((e) => UPCOMING_STATUSES.includes(e.status))
    .sort((a, b) => (time(a) ?? Infinity) - (time(b) ?? Infinity));
  const done = evaluations
    .filter((e) => DONE_STATUSES.includes(e.status))
    .sort((a, b) => (time(b) ?? 0) - (time(a) ?? 0));
  const rated = done.filter((e) => e.success_rate !== null && e.success_rate !== undefined);
  const successRate = rated.length
    ? rated.reduce((sum, e) => sum + e.success_rate, 0) / rated.length
    : null;
  return { running, upcoming, done, rated, successRate };
}
