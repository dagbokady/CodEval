import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import AppShell from './components/AppShell';
import { Landing, Protected } from './components/Protected';
import { Loading } from './components/ui';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const JoinPage = lazy(() => import('./pages/JoinPage'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const TeacherHomePage = lazy(() => import('./pages/teacher/TeacherHomePage'));
const DashboardPage = lazy(() => import('./pages/teacher/DashboardPage'));
const EvaluationEditorPage = lazy(() => import('./pages/teacher/EvaluationEditorPage'));
const SessionMonitorPage = lazy(() => import('./pages/teacher/SessionMonitorPage'));
const ResultsPage = lazy(() => import('./pages/teacher/ResultsPage'));
const SubmissionDetailPage = lazy(() => import('./pages/teacher/SubmissionDetailPage'));
const ClassesPage = lazy(() => import('./pages/teacher/ClassesPage'));
const ClassDetailPage = lazy(() => import('./pages/teacher/ClassDetailPage'));
const BankPage = lazy(() => import('./pages/teacher/BankPage'));
const BankEvaluationsPage = lazy(() => import('./pages/teacher/BankEvaluationsPage'));
const CommunityPage = lazy(() => import('./pages/CommunityPage'));
const StatsPage = lazy(() => import('./pages/teacher/StatsPage'));

const StudentHomePage = lazy(() => import('./pages/student/StudentHomePage'));
const StudentResultsPage = lazy(() => import('./pages/student/StudentResultsPage'));
const StudentCopyPage = lazy(() => import('./pages/student/StudentCopyPage'));
const LazyExamPage = lazy(() => import('./pages/student/LazyExamPage'));

const AdminHomePage = lazy(() => import('./pages/admin/AdminHomePage'));
const UsersPage = lazy(() => import('./pages/admin/UsersPage'));
const ClassroomsAdminPage = lazy(() => import('./pages/admin/ClassroomsAdminPage'));
const ClassroomAdminDetailPage = lazy(() => import('./pages/admin/ClassroomAdminDetailPage'));
const SubjectsPage = lazy(() => import('./pages/admin/SubjectsPage'));
const EvaluationsAdminPage = lazy(() => import('./pages/admin/EvaluationsAdminPage'));
const AuditPage = lazy(() => import('./pages/admin/AuditPage'));
const OrganizationPage = lazy(() => import('./pages/admin/OrganizationPage'));

// Hors de la coquille (connexion, épreuve), l'attente occupe tout l'écran ;
// dedans, elle prend la forme d'une page.
function Lazy({ children, screen = false }) {
  return (
    <Suspense fallback={<Loading variant={screen ? 'screen' : 'page'} />}>{children}</Suspense>
  );
}

const teacher = ['teacher'];
const admin = ['admin'];

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/connexion', element: <Lazy screen><LoginPage /></Lazy> },
  { path: '/inscription', element: <Lazy screen><RegisterPage /></Lazy> },
  { path: '/rejoindre', element: <Lazy screen><JoinPage /></Lazy> },
  { path: '/rejoindre/lien/:token', element: <Lazy screen><JoinPage /></Lazy> },
  { path: '/rejoindre/:code', element: <Lazy screen><JoinPage /></Lazy> },
  { path: '/mot-de-passe-oublie', element: <Lazy screen><ForgotPasswordPage /></Lazy> },
  { path: '/reset-password', element: <Lazy screen><ResetPasswordPage /></Lazy> },
  {
    path: '/epreuve/:evaluationId',
    element: (
      <Protected roles={['student']}>
        <Lazy screen><LazyExamPage /></Lazy>
      </Protected>
    ),
  },
  {
    element: (
      <Protected>
        <AppShell />
      </Protected>
    ),
    children: [
      { path: '/admin', element: <Protected roles={admin}><Lazy><AdminHomePage /></Lazy></Protected> },
      { path: '/admin/utilisateurs', element: <Protected roles={admin}><Lazy><UsersPage /></Lazy></Protected> },
      { path: '/admin/classes', element: <Protected roles={admin}><Lazy><ClassroomsAdminPage /></Lazy></Protected> },
      { path: '/admin/classes/:classroomId', element: <Protected roles={admin}><Lazy><ClassroomAdminDetailPage /></Lazy></Protected> },
      { path: '/admin/matieres', element: <Protected roles={admin}><Lazy><SubjectsPage /></Lazy></Protected> },
      { path: '/admin/evaluations', element: <Protected roles={admin}><Lazy><EvaluationsAdminPage /></Lazy></Protected> },
      { path: '/admin/journal', element: <Protected roles={admin}><Lazy><AuditPage /></Lazy></Protected> },
      { path: '/admin/etablissement', element: <Protected roles={admin}><Lazy><OrganizationPage /></Lazy></Protected> },
      { path: '/accueil', element: <Protected roles={teacher}><Lazy><TeacherHomePage /></Lazy></Protected> },
      { path: '/evaluations', element: <Protected roles={teacher}><Lazy><DashboardPage /></Lazy></Protected> },
      { path: '/evaluations/nouvelle', element: <Protected roles={teacher}><Lazy><EvaluationEditorPage /></Lazy></Protected> },
      { path: '/evaluations/:evaluationId', element: <Protected roles={teacher}><Lazy><EvaluationEditorPage /></Lazy></Protected> },
      { path: '/evaluations/:evaluationId/session', element: <Protected roles={teacher}><Lazy><SessionMonitorPage /></Lazy></Protected> },
      { path: '/evaluations/:evaluationId/resultats', element: <Protected roles={teacher}><Lazy><ResultsPage /></Lazy></Protected> },
      {
        path: '/evaluations/:evaluationId/resultats/:participationId',
        element: <Protected roles={teacher}><Lazy><SubmissionDetailPage /></Lazy></Protected>,
      },
      { path: '/classes', element: <Protected roles={teacher}><Lazy><ClassesPage /></Lazy></Protected> },
      { path: '/classes/:classroomId', element: <Protected roles={teacher}><Lazy><ClassDetailPage /></Lazy></Protected> },
      { path: '/banque', element: <Protected roles={teacher}><Lazy><BankPage /></Lazy></Protected> },
      { path: '/banque/evaluations', element: <Protected roles={teacher}><Lazy><BankEvaluationsPage /></Lazy></Protected> },
      {
        path: '/communaute',
        element: <Protected roles={['teacher', 'admin']}><Lazy><CommunityPage /></Lazy></Protected>,
      },
      { path: '/statistiques', element: <Protected roles={teacher}><Lazy><StatsPage /></Lazy></Protected> },
      { path: '/mes-evaluations', element: <Protected roles={['student']}><Lazy><StudentHomePage /></Lazy></Protected> },
      { path: '/mes-resultats', element: <Protected roles={['student']}><Lazy><StudentResultsPage /></Lazy></Protected> },
      {
        path: '/mes-resultats/:evaluationId',
        element: <Protected roles={['student']}><Lazy><StudentCopyPage /></Lazy></Protected>,
      },
      { path: '/parametres', element: <Lazy><SettingsPage /></Lazy> },
    ],
  },
  { path: '*', element: <Landing /> },
]);
