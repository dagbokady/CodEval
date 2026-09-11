import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/** La banque d'évaluations : les épreuves complètes mises de côté pour resservir. */
export function useEvaluationTemplates({ subjectId, page = 1 } = {}) {
  const params = new URLSearchParams({ page: String(page), page_size: '20' });
  if (subjectId) params.set('subject_id', String(subjectId));
  return useQuery({
    queryKey: key('evaluation-templates', subjectId, page),
    queryFn: () => api(`/api/evaluations/templates?${params}`),
    placeholderData: (prev) => prev,
  });
}

export function useSubjects() {
  return useQuery({ queryKey: ['subjects'], queryFn: () => api('/api/subjects'), staleTime: 300_000 });
}

export function useClassrooms() {
  return useQuery({
    queryKey: ['classrooms'],
    queryFn: () => api('/api/classrooms'),
    staleTime: 300_000,
  });
}

export function useLanguages() {
  return useQuery({
    queryKey: ['languages'],
    queryFn: () => api('/api/evaluations/languages'),
    staleTime: Infinity,
  });
}

export function useBankExercises({ q, language, scope = 'all', subjectId, page = 1 }) {
  const params = new URLSearchParams({ page: String(page), page_size: '20', scope });
  if (q) params.set('q', q);
  if (language) params.set('language', language);
  if (subjectId) params.set('subject_id', String(subjectId));
  return useQuery({
    queryKey: key('bank', scope, q, language, subjectId, page),
    queryFn: () => api(`/api/bank/exercises?${params}`),
    placeholderData: (prev) => prev,
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
