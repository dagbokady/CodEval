import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { HOME_BY_ROLE, useAuth } from '../auth';
import { Alert, Button, Field, PasswordInput } from '../components/ui';
import { useDocumentTitle } from '../useDocumentTitle';

export default function LoginPage() {
  useDocumentTitle('Connexion');
  const { status, user, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  if (status === 'authenticated') {
    return <Navigate to={location.state?.from?.pathname ?? HOME_BY_ROLE[user.role]} replace />;
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!form.email.trim() || !form.password) {
      setError('Renseignez votre e-mail et votre mot de passe.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const account = await signIn(form);
      navigate(HOME_BY_ROLE[account.role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth">
      <header className="auth-top">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">&lt;/&gt;</span>
          CodEval
        </div>
      </header>
      <div className="auth-zone">
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <h1>Connexion</h1>
          <p className="subtitle">Accédez à votre espace CodEval</p>
          <Alert>{error}</Alert>
          <Field label="E-mail" id="email">
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoFocus
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Mot de passe" id="password">
            <PasswordInput
              id="password"
              autoComplete="current-password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
          <Button size="large" type="submit" disabled={pending}>
            {pending ? 'Connexion…' : 'Se connecter'}
          </Button>
          <div className="auth-links">
            <Link to="/mot-de-passe-oublie">Mot de passe oublié ?</Link>
          </div>
          <div className="auth-footer">
            Pas encore d'établissement ? <Link to="/inscription">Créer un compte</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
