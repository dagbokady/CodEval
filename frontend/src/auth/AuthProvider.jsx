import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from '../api/client';
import { AuthContext } from './context';

const ANONYMOUS = { status: 'anonymous', user: null, organization: null };

export function AuthProvider({ children }) {
  // Pas de session à restaurer sans jeton : on évite un état « loading » inutile.
  const [state, setState] = useState(() =>
    getToken() ? { status: 'loading', user: null, organization: null } : ANONYMOUS,
  );

  useEffect(() => {
    if (!getToken()) return undefined;
    let cancelled = false;
    api('/api/auth/me')
      .then((data) => {
        if (!cancelled) {
          setState({ status: 'authenticated', user: data.user, organization: data.organization });
        }
      })
      .catch(() => {
        if (!cancelled) setState(ANONYMOUS);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (credentials) => {
    const data = await api('/api/auth/login', { method: 'POST', body: credentials });
    setToken(data.access_token);
    setState({ status: 'authenticated', user: data.user, organization: data.organization });
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await api('/api/auth/register', { method: 'POST', body: payload });
    setToken(data.access_token);
    setState({ status: 'authenticated', user: data.user, organization: data.organization });
    return data.user;
  }, []);

  const signOut = useCallback(() => {
    setToken(null);
    setState(ANONYMOUS);
  }, []);

  const value = useMemo(
    () => ({ ...state, signIn, register, signOut }),
    [state, signIn, register, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
