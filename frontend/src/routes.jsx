import { createBrowserRouter } from 'react-router-dom';
import AppShell from './components/AppShell';
import { Landing, Protected } from './components/Protected';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SettingsPage from './pages/SettingsPage';
import TeacherHomePage from './pages/teacher/TeacherHomePage';
import DashboardPage from './pages/teacher/DashboardPage';
import EvaluationEditorPage from './pages/teacher/EvaluationEditorPage';
import SessionMonitorPage from './pages/teacher/SessionMonitorPage';
import ResultsPage from './pages/teacher/ResultsPage';
import SubmissionDetailPage from './pages/teacher/SubmissionDetailPage';
import ClassesPage from './pages/teacher/ClassesPage';
import ClassDetailPage from './pages/teacher/ClassDetailPage';
import BankPage from './pages/teacher/BankPage';
import BankEvaluationsPage from './pages/teacher/BankEvaluationsPage';
import StatsPage from './pages/teacher/StatsPage';
import StudentHomePage from './pages/student/StudentHomePage';
import StudentResultsPage from './pages/student/StudentResultsPage';
import StudentCopyPage from './pages/student/StudentCopyPage';
import LazyExamPage from './pages/student/LazyExamPage';

const teacher = ['teacher'];

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/connexion', element: <LoginPage /> },
  { path: '/inscription', element: <RegisterPage /> },
  {
    path: '/epreuve/:evaluationId',
    element: (
      <Protected roles={['student']}>
        <LazyExamPage />
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
      { path: '/accueil', element: <Protected roles={teacher}><TeacherHomePage /></Protected> },
      { path: '/evaluations', element: <Protected roles={teacher}><DashboardPage /></Protected> },
      { path: '/evaluations/nouvelle', element: <Protected roles={teacher}><EvaluationEditorPage /></Protected> },
      { path: '/evaluations/:evaluationId', element: <Protected roles={teacher}><EvaluationEditorPage /></Protected> },
      { path: '/evaluations/:evaluationId/session', element: <Protected roles={teacher}><SessionMonitorPage /></Protected> },
      { path: '/evaluations/:evaluationId/resultats', element: <Protected roles={teacher}><ResultsPage /></Protected> },
      {
        path: '/evaluations/:evaluationId/resultats/:participationId',
        element: <Protected roles={teacher}><SubmissionDetailPage /></Protected>,
      },
      { path: '/classes', element: <Protected roles={teacher}><ClassesPage /></Protected> },
      { path: '/classes/:classroomId', element: <Protected roles={teacher}><ClassDetailPage /></Protected> },
      { path: '/banque', element: <Protected roles={teacher}><BankPage /></Protected> },
      { path: '/banque/evaluations', element: <Protected roles={teacher}><BankEvaluationsPage /></Protected> },
      { path: '/statistiques', element: <Protected roles={teacher}><StatsPage /></Protected> },
      { path: '/mes-evaluations', element: <Protected roles={['student']}><StudentHomePage /></Protected> },
      { path: '/mes-resultats', element: <Protected roles={['student']}><StudentResultsPage /></Protected> },
      {
        path: '/mes-resultats/:evaluationId',
        element: <Protected roles={['student']}><StudentCopyPage /></Protected>,
      },
      { path: '/parametres', element: <SettingsPage /> },
    ],
  },
  { path: '*', element: <Landing /> },
]);
