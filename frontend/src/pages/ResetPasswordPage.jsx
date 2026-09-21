import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { Alert, Button, Field, PasswordInput } from '../components/ui';
import { useDocumentTitle } from '../useDocumentTitle';

export default function ResetPasswordPage() {
  useDocumentTitle('Nouveau mot de passe');
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (password.length < 8) { setError('Le mot de passe doit contenir au moins 8 caracteres.'); return; }
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    setError(null);
    setPending(true);
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: { token, password } });
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <div className="auth">
        <header className="auth-top">
          <Link to="/" className="brand" aria-label="CodEval, page d'accueil">
            <span className="brand-icon" aria-hidden="true">&lt;/&gt;</span>
            CodEval
          </Link>
        </header>
        <div className="auth-zone">
          <div className="auth-card">
            <h1>Lien invalide</h1>
            <p>Ce lien de reinitialisation est invalide ou a expire.</p>
            <div className="auth-footer">
              <Link to="/connexion">Retour a la connexion</Link>
            </div>
          </div>
        </div>
      </div>
    );
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
        {done ? (
          <div className="auth-card">
            <h1>Mot de passe modifie</h1>
            <p>Votre mot de passe a ete reinitialise avec succes.</p>
            <div className="auth-footer">
              <Link to="/connexion">Se connecter</Link>
            </div>
          </div>
        ) : (
          <form className="auth-card" onSubmit={onSubmit} noValidate>
            <h1>Nouveau mot de passe</h1>
            <p className="subtitle">Choisissez votre nouveau mot de passe.</p>
            <Alert>{error}</Alert>
            <Field label="Nouveau mot de passe" id="password">
              <PasswordInput
                id="password"
                autoComplete="new-password"
                autoFocus
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
            <Field label="Confirmer" id="confirm">
              <PasswordInput
                id="confirm"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <Button size="large" type="submit" disabled={pending}>
              {pending ? 'Modification...' : 'Modifier le mot de passe'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
