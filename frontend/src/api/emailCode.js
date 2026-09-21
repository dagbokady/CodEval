import { api } from './client';

/**
 * Premier temps de l'inscription : le serveur envoie un code à l'adresse.
 * Rend le délai, en secondes, avant de pouvoir en redemander un.
 */
export async function requestEmailCode(email) {
  const res = await api('/api/auth/email-code', { method: 'POST', body: { email } });
  return res.resend_in;
}
