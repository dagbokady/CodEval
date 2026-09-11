import { Navigate, useLocation } from 'react-router-dom';
import { HOME_BY_ROLE, useAuth } from '../auth';
import { Loading } from './ui';

export function Protected({ roles, children }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading label="Vérification de la session…" />;
  if (status !== 'authenticated') {
    return <Navigate to="/connexion" state={{ from: location }} replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return children;
}

export function Landing() {
  const { status, user } = useAuth();
  if (status === 'loading') return <Loading />;
  return (
    <Navigate to={status === 'authenticated' ? HOME_BY_ROLE[user.role] : '/connexion'} replace />
  );
}
