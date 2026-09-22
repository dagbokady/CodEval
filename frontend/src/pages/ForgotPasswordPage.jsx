import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Alert, Button, Field } from '../components/ui';
import { useDocumentTitle } from '../useDocumentTitle';

export default function ForgotPasswordPage() {
  useDocumentTitle('Mot de passe oublié');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (!email.trim()) { setError("Renseignez votre e-mail."); return; }
    setError(null);
    setPending(true);
    try {
      await api('/api/auth/forgot-password', { method: 'POST', body: { email } });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth">
      <header className="auth-top">
        <Link to="/" className="brand" aria-label="CodEval, page d'accueil">
          <span className="brand-icon" aria-hidden="true">&lt;/&gt;</span>
          CodEval
        </Link>
      </header>
      <div className="auth-zone">
        {sent ? (
          <div className="auth-card">
            <h1>E-mail envoyé</h1>
            <p>Si un compte correspond à cette adresse, vous recevrez un lien de réinitialisation.</p>
            <Alert tone="info">
              Rien reçu d'ici quelques minutes ? Regardez dans vos <strong>spams</strong> (courriers
              indésirables).
            </Alert>
            <div className="auth-footer">
              <Link to="/connexion">Retour à la connexion</Link>
            </div>
          </div>
        ) : (
          <form className="auth-card" onSubmit={onSubmit} noValidate>
            <h1>Mot de passe oublié</h1>
            <p className="subtitle">Entrez votre adresse e-mail pour recevoir un lien de réinitialisation.</p>
            <Alert>{error}</Alert>
            <Field label="E-mail" id="email">
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Button size="large" type="submit" disabled={pending}>
              {pending ? 'Envoi…' : 'Envoyer le lien'}
            </Button>
            <div className="auth-footer">
              <Link to="/connexion">Retour à la connexion</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
