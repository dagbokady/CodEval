import { Suspense, lazy } from 'react';
import { Loading } from '../../components/ui';

// L'éditeur de code (CodeMirror) n'est téléchargé que sur l'écran d'épreuve.
const ExamPage = lazy(() => import('./ExamPage'));

export default function LazyExamPage() {
  return (
    <Suspense fallback={<Loading variant="screen" label="Ouverture de l'épreuve…" />}>
      <ExamPage />
    </Suspense>
  );
}
