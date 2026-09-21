import { Navigate, useLocation } from 'react-router-dom';
import { HOME_BY_ROLE, useAuth } from '../auth';
import { Loading } from './ui';

export function Protected({ roles, children }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <Loading variant="screen" label="Vérification de la session…" />;
  if (status !== 'authenticated') {
    return <Navigate to="/connexion" state={{ from: location }} replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return children;
}

/** Une personne connectée va droit à son espace ; les autres voient `children`
 * (la page d'accueil publique) ou, à défaut, la connexion. */
export function Landing({ children }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <Loading variant="screen" />;
  if (status === 'authenticated') return <Navigate to={HOME_BY_ROLE[user.role]} replace />;
  return children ?? <Navigate to="/connexion" replace />;
}
