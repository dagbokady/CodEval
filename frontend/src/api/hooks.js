import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

const key = (...parts) => parts.filter((p) => p !== undefined && p !== null);

export function useEvaluations({ group, subjectId, page = 1 }) {
  const params = new URLSearchParams({ page: String(page), page_size: '20' });
  if (group) params.set('group', group);
  if (subjectId) params.set('subject_id', String(subjectId));
  return useQuery({
    queryKey: key('evaluations', group, subjectId, page),
    queryFn: () => api(`/api/evaluations?${params}`),
    placeholderData: (prev) => prev,
  });
}

export function useEvaluation(id) {
  return useQuery({
    queryKey: key('evaluation', id),
    queryFn: () => api(`/api/evaluations/${id}`),
    enabled: Boolean(id),
  });
}

/** Les brouillons de l'enseignant : là où ajouter un exercice pris dans la banque. */
export function useDrafts() {
  return useQuery({
    queryKey: ['evaluations', 'brouillons'],
    queryFn: () => api('/api/evaluations?group=draft&page_size=8'),
  });
}

/** Une liste qui se charge au fil du défilement, page après page. */
function nextPage(last) {
  return last.page * last.page_size < last.total ? last.page + 1 : undefined;
}

/**
 * Ma banque : ses exercices et ses sujets (modèles d'épreuve) réunis, les
 * derniers retouchés d'abord. `kind` : un type d'exercice, ou « subject ».
 */
export function useLibrary({ q, kind, enabled = true } = {}) {
  const params = new URLSearchParams({ page_size: '30' });
  if (q) params.set('q', q);
  if (kind) params.set('kind', kind);
  return useInfiniteQuery({
    queryKey: key('library', kind, q),
    queryFn: ({ pageParam }) => api(`/api/bank/library?${params}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useSubjects() {
  return useQuery({ queryKey: ['subjects'], queryFn: () => api('/api/subjects'), staleTime: 300_000 });
}

/** Langages ouverts par l'administration, algorithmique comprise. */
export function useDisciplines() {
  return useQuery({ queryKey: ['disciplines'], queryFn: () => api('/api/disciplines'), staleTime: 60_000 });
}

export function useClassrooms() {
  return useQuery({
    queryKey: ['classrooms'],
    queryFn: () => api('/api/classrooms'),
    staleTime: 300_000,
  });
}

/**
 * Les épreuves de l'enseignant pour une classe : ou pour toutes, afin de
 * résumer chaque classe dans la liste. Cent suffisent largement à une année.
 */
/** Statistiques de l'enseignant, toutes classes ou pour une seule. */
export function useStats(classroomId) {
  const params = classroomId ? `?classroom_id=${classroomId}` : '';
  return useQuery({
    queryKey: key('stats', classroomId ?? 'toutes'),
    queryFn: () => api(`/api/stats${params}`),
    placeholderData: (prev) => prev,
  });
}

export function useClassroomEvaluations(classroomId) {
  const params = new URLSearchParams({ page: '1', page_size: '100' });
  if (classroomId) params.set('classroom_id', String(classroomId));
  return useQuery({
    queryKey: key('evaluations', 'classroom', classroomId ?? 'toutes'),
    queryFn: () => api(`/api/evaluations?${params}`),
  });
}

export function useLanguages() {
  return useQuery({
    queryKey: ['languages'],
    queryFn: () => api('/api/evaluations/languages'),
    staleTime: Infinity,
  });
}

export function useBankExercises({ q, language, kind, scope = 'all', subjectId, page = 1 }) {
  const params = new URLSearchParams({ page: String(page), page_size: '20', scope });
  if (q) params.set('q', q);
  if (kind) params.set('kind', kind);
  if (language) params.set('language', language);
  if (subjectId) params.set('subject_id', String(subjectId));
  return useQuery({
    queryKey: key('bank', scope, q, language, kind, subjectId, page),
    queryFn: () => api(`/api/bank/exercises?${params}`),
    placeholderData: (prev) => prev,
  });
}

/**
 * La communauté : exercices et sujets partagés par les enseignants, de tous les
 * établissements ou du sien. Elle se charge au fil du défilement.
 */
export function useCommunity({
  q,
  itemType,
  kind,
  language,
  scope = 'all',
  sort = 'popular',
  enabled = true,
} = {}) {
  const params = new URLSearchParams({ page_size: '30', scope, sort });
  if (q) params.set('q', q);
  if (kind) params.set('kind', kind);
  if (itemType) params.set('item_type', itemType);
  if (language) params.set('language', language);
  return useInfiniteQuery({
    queryKey: key('community', scope, sort, itemType, kind, language, q),
    queryFn: ({ pageParam }) => api(`/api/community?${params}&page=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: nextPage,
    placeholderData: (prev) => prev,
    enabled,
  });
}

export function useCommunityItem(id) {
  return useQuery({
    queryKey: key('community-item', id),
    queryFn: () => api(`/api/community/${id}`),
    enabled: Boolean(id),
  });
}

export function useSessionMonitor(id, enabled) {
  return useQuery({
    queryKey: key('session', id),
    queryFn: () => api(`/api/evaluations/${id}/session`),
    enabled: Boolean(id) && enabled,
    refetchInterval: 5000,
  });
}

export function useResults(id, runId) {
  return useQuery({
    queryKey: key('results', id, runId),
    queryFn: () => api(`/api/evaluations/${id}/results${runId ? `?run_id=${runId}` : ''}`),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return status === 'pending' || status === 'running' ? 3000 : false;
    },
  });
}

export function useSubmissionDetail(evaluationId, participationId, runId) {
  return useQuery({
    queryKey: key('submission', evaluationId, participationId, runId),
    queryFn: () =>
      api(
        `/api/evaluations/${evaluationId}/results/${participationId}${runId ? `?run_id=${runId}` : ''}`,
      ),
    enabled: Boolean(evaluationId && participationId),
  });
}

export function useMyResults() {
  return useQuery({ queryKey: ['my-results'], queryFn: () => api('/api/me/results') });
}

/** Copie de l'apprenant : énoncés, production, et notes une fois publiées. */
export function useMyCopy(evaluationId) {
  return useQuery({
    queryKey: key('my-copy', evaluationId),
    queryFn: () => api(`/api/me/results/${evaluationId}`),
    enabled: Boolean(evaluationId),
    retry: false,
  });
}

export function useTeacherStats() {
  return useQuery({
    queryKey: ['stats-teacher'],
    queryFn: () => api('/api/stats/teacher'),
    staleTime: 60_000,
  });
}

export function useAction(fn, invalidate = []) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      invalidate.forEach((k) => client.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] }));
    },
  });
}

/** L'offre de l'espace : ses limites (nulles si aucune) et ce qui en est consommé. */
export function usePlan() {
  return useQuery({ queryKey: ['plan'], queryFn: () => api('/api/plan') });
}
