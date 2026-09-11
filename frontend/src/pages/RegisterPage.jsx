import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HOME_BY_ROLE, useAuth } from '../auth';
import { Alert, Button, Field } from '../components/ui';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    organization_name: '',
    full_name: '',
    email: '',
    password: '',
  });
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
      const account = await register(form);
      navigate(HOME_BY_ROLE[account.role], { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">&lt;/&gt;</span>
          CodEval
        </div>
        <h2>Ouvrez l'espace de votre établissement</h2>
        <p>
          Les données de chaque établissement restent isolées. Ce compte enseignant pourra
          créer les enseignants, les apprenants et les classes.
        </p>
      </aside>
      <div className="auth-zone">
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <h1>Inscription</h1>
          <p className="subtitle">Créez votre établissement et son compte enseignant</p>
          <Alert>{error}</Alert>
          <Field label="Établissement" id="org">
            <input id="org" required value={form.organization_name} onChange={update('organization_name')} />
          </Field>
          <Field label="Nom complet" id="name">
            <input id="name" required value={form.full_name} onChange={update('full_name')} />
          </Field>
          <Field label="E-mail" id="email">
            <input id="email" type="email" required value={form.email} onChange={update('email')} />
          </Field>
          <Field label="Mot de passe" id="password" hint="8 caractères minimum">
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={form.password}
              onChange={update('password')}
            />
          </Field>
          <Button size="large" type="submit" disabled={pending}>
            {pending ? 'Création…' : 'Créer l’établissement'}
          </Button>
          <div className="auth-footer">
            Déjà un compte ? <Link to="/connexion">Se connecter</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
