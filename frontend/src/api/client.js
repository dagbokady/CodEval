const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
const TOKEN_KEY = 'codeval.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body, signal, raw = false } = {}) {
  const token = getToken();
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      signal,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // Sans cela l'utilisateur lit « Failed to fetch », en anglais et sans piste.
    throw new ApiError('Serveur injoignable. Vérifiez votre connexion puis réessayez.', 0);
  }

  // Un 401 ne signifie « session expirée » que si l'on en avait une : sur
  // l'écran de connexion, c'est un mot de passe erroné, et le serveur le dit.
  if (res.status === 401 && token) {
    setToken(null);
    if (!location.pathname.startsWith('/connexion')) location.assign('/connexion');
    throw new ApiError('Session expirée, reconnectez-vous.', 401);
  }
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message = Array.isArray(detail?.detail)
      ? detail.detail.map((d) => d.msg).join(', ')
      : (detail?.detail ?? 'Une erreur est survenue');
    throw new ApiError(message, res.status);
  }
  if (raw) return res;
  if (res.status === 204) return null;
  return res.json();
}
