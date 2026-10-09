import { api } from './client';

/**
 * Premier temps de l'inscription : le serveur envoie un code à l'adresse.
 * Rend `required` (faux quand la vérification est coupée, en développement :
 * le compte se crée sans code) et le délai, en secondes, avant de pouvoir en
 * redemander un.
 */
export async function requestEmailCode(email) {
  const res = await api('/api/auth/email-code', { method: 'POST', body: { email } });
  return { required: res.required !== false, resendIn: res.resend_in };
}
