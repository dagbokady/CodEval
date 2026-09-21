import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client';
import { AuthContext } from './context';

const ANONYMOUS = { status: 'anonymous', user: null, organization: null, organizationKind: null };

const session = (data) => ({
  status: 'authenticated',
  user: data.user,
  organization: data.organization,
  organizationKind: data.organization_kind,
});

export function AuthProvider({ children }) {
  // Pas de session à restaurer sans jeton : on évite un état « loading » inutile.
  const [state, setState] = useState(() =>
    getToken() ? { ...ANONYMOUS, status: 'loading' } : ANONYMOUS,
  );

  useEffect(() => {
    if (!getToken()) return undefined;
    let cancelled = false;
    api('/api/auth/me')
      .then((data) => {
        if (!cancelled) setState(session(data));
      })
      .catch(() => {
        if (!cancelled) setState(ANONYMOUS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Toute route qui ouvre une session : connexion, inscription, entrée par code. */
  const authenticate = useCallback(async (path, body) => {
    const data = await api(path, { method: 'POST', body });
    setToken(data.access_token);
    setState(session(data));
    return data.user;
  }, []);

  const signIn = useCallback(
    (credentials) => authenticate('/api/auth/login', credentials),
    [authenticate],
  );

  const signOut = useCallback(() => {
    setToken(null);
    setState(ANONYMOUS);
  }, []);

  /** Après une modification du profil : le serveur renvoie l'utilisateur à jour. */
  const updateUser = useCallback((user) => {
    setState((current) => ({ ...current, user }));
  }, []);

  const value = useMemo(
    () => ({ ...state, authenticate, signIn, signOut, updateUser }),
    [state, authenticate, signIn, signOut, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
