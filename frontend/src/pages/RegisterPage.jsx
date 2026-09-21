import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HOME_BY_ROLE, useAuth } from '../auth';
import { Alert, Button, Field, PasswordInput } from '../components/ui';
import { useDocumentTitle } from '../useDocumentTitle';

/**
 * Inscription d'un enseignant. Il n'a besoin de personne : un espace personnel
 * est créé pour lui, où il ouvre ses classes. Les apprenants, eux, ne
 * s'inscrivent pas ici : ils entrent par le code de leur classe.
 */
export default function RegisterPage() {
  useDocumentTitle('Inscription');
  const { authenticate } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function onSubmit(event) {
    event.preventDefault();
    if (form.password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      const account = await authenticate('/api/auth/register-teacher', form);
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
          <h1>Inscription enseignant</h1>
          <p className="subtitle">
            Créez votre espace gratuitement et ouvrez jusqu’à 2 classes.
          </p>
          <Alert>{error}</Alert>
          <Field label="Nom complet" id="name">
            <input
              id="name"
              autoComplete="name"
              autoFocus
              required
              value={form.full_name}
              onChange={update('full_name')}
            />
          </Field>
          <Field label="E-mail" id="email">
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={form.email}
              onChange={update('email')}
            />
          </Field>
          <Field
            label="Mot de passe"
            id="password"
            hint={
              form.password && form.password.length < 8
                ? `Encore ${8 - form.password.length} caractère${8 - form.password.length > 1 ? 's' : ''}`
                : '8 caractères minimum'
            }
          >
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              value={form.password}
              onChange={update('password')}
            />
          </Field>
          <Button size="large" type="submit" disabled={pending}>
            {pending ? 'Création…' : 'Créer mon espace'}
          </Button>
          <div className="auth-footer">
            Déjà un compte ? <Link to="/connexion">Se connecter</Link>
            <br />
            Étudiant avec un code ? <Link to="/rejoindre">Rejoindre votre classe</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
