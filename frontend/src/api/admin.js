import { useQuery } from '@tanstack/react-query';
import { api } from './client';

/** Requêtes du backoffice. Les écritures passent par `useAction` (hooks.js). */

function query(params) {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(name, String(value));
  }
  return search.toString();
}

export function useAdminOverview() {
  return useQuery({ queryKey: ['admin', 'overview'], queryFn: () => api('/api/stats/overview') });
}

export function useAdminUsers({ role, active, q, classroomId, withoutClass, page = 1, pageSize = 25 }) {
  const params = query({
    role,
    active,
    q,
    classroom_id: classroomId,
    without_class: withoutClass || undefined,
    page,
    page_size: pageSize,
  });
  return useQuery({
    queryKey: ['admin', 'users', params],
    queryFn: () => api(`/api/users?${params}`),
    placeholderData: (prev) => prev,
  });
}

export function useAdminSubjects() {
  return useQuery({ queryKey: ['admin', 'subjects'], queryFn: () => api('/api/admin/subjects') });
}

export function useClassroomStudents(classroomId) {
  return useQuery({
    queryKey: ['admin', 'classroom-students', classroomId],
    queryFn: () => api(`/api/classrooms/${classroomId}/students`),
    enabled: Boolean(classroomId),
  });
}

export function useClassroomTeachers(classroomId) {
  return useQuery({
    queryKey: ['admin', 'classroom-teachers', classroomId],
    queryFn: () => api(`/api/classrooms/${classroomId}/teachers`),
    enabled: Boolean(classroomId),
  });
}

export function useAdminEvaluations({ status, q, classroomId, page = 1, pageSize = 25 }) {
  const params = query({ status, q, classroom_id: classroomId, page, page_size: pageSize });
  return useQuery({
    queryKey: ['admin', 'evaluations', params],
    queryFn: () => api(`/api/admin/evaluations?${params}`),
    placeholderData: (prev) => prev,
  });
}

export function useAudit({ action, page = 1, pageSize = 50 }) {
  const params = query({ action, page, page_size: pageSize });
  return useQuery({
    queryKey: ['admin', 'audit', params],
    queryFn: () => api(`/api/admin/audit?${params}`),
    placeholderData: (prev) => prev,
  });
}

export function useAdminLanguages() {
  return useQuery({ queryKey: ['admin', 'languages'], queryFn: () => api('/api/admin/languages') });
}

export const ROLE_LABELS = { admin: 'Administrateur', teacher: 'Enseignant', student: 'Étudiant' };
export const ROLE_PLURALS = { admin: 'Administrateurs', teacher: 'Enseignants', student: 'Étudiants' };

/** Libellés du journal : une phrase courte par action journalisée. */
export const AUDIT_LABELS = {
  'auth.login': 'Connexion',
  'language.enabled': 'Langage ouvert',
  'language.disabled': 'Langage fermé',
  'user.created': 'Compte créé',
  'user.updated': 'Compte modifié',
  'user.password_reset': 'Mot de passe réinitialisé',
  'user.deleted': 'Compte supprimé',
  'user.deleted_self': 'Compte supprimé par son titulaire',
  'classroom.created': 'Classe créée',
  'classroom.updated': 'Classe modifiée',
  'classroom.deleted': 'Classe supprimée',
  'classroom.enrolled': 'Étudiants inscrits',
  'classroom.unenrolled': 'Étudiant désinscrit',
  'classroom.teacher_assigned': 'Enseignement attribué',
  'classroom.teacher_unassigned': 'Enseignement retiré',
  'subject.created': 'Matière créée',
  'subject.renamed': 'Matière renommée',
  'subject.deleted': 'Matière supprimée',
  'evaluation.created': 'Évaluation créée',
  'evaluation.updated': 'Évaluation modifiée',
  'evaluation.exercises_updated': 'Exercices modifiés',
  'evaluation.deleted': 'Évaluation supprimée',
  'evaluation.published': 'Évaluation publiée',
  'evaluation.cancelled': 'Évaluation annulée',
  'session.started': 'Session ouverte',
  'session.extended': 'Session prolongée',
  'session.closed': 'Session clôturée',
  'session.student_access': 'Entrée en épreuve',
  'submission.submitted': 'Copie rendue',
  'integrity.incident': "Incident d'intégrité",
  'integrity.locked': 'Copie verrouillée',
  'correction.launched': 'Correction lancée',
  'correction.params_updated': 'Paramètres de correction modifiés',
  'score.adjusted': 'Note ajustée',
  'appreciation.written': 'Appréciation rédigée',
  'results.validated': 'Résultats publiés',
  'results.exported': 'Résultats exportés',
  'bank.created': 'Exercice de banque créé',
  'bank.updated': 'Exercice de banque modifié',
  'bank.deleted': 'Exercice de banque supprimé',
  'template.saved': 'Modèle enregistré',
  'template.used': 'Modèle réutilisé',
};

/** Mot de passe provisoire lisible : sans 0/O ni 1/l qu'on confond à la dictée. */
export function generatePassword(length = 12) {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (v) => alphabet[v % alphabet.length]).join('');
}
