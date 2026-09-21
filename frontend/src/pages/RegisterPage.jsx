import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HOME_BY_ROLE, useAuth } from '../auth';
import { GenderField, PhotoPicker } from '../components/IdentityFields';
import { Alert, Button, Field, PasswordInput } from '../components/ui';
import { useDocumentTitle } from '../useDocumentTitle';

/**
 * Inscription d'un enseignant. Il n'a besoin de personne : un espace personnel
 * est créé pour lui, où il ouvre ses classes. Les apprenants, eux, ne
 * s'inscrivent pas ici : ils entrent par le code de leur classe. La photo est
 * demandée : c'est elle que les apprenants voient à côté de son nom.
 */
export default function RegisterPage() {
  useDocumentTitle('Inscription');
  const { authenticate } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    photo: '',
    gender: '',
  });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function onSubmit(event) {
    event.preventDefault();
    if (!form.photo) {
      setError('Ajoutez une photo de vous.');
      return;
    }
    if (!form.gender) {
      setError('Indiquez votre sexe.');
      return;
    }
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
        <Link to="/" className="brand" aria-label="CodEval, page d'accueil">
          <span className="brand-icon" aria-hidden="true">&lt;/&gt;</span>
          CodEval
        </Link>
      </header>
      <div className="auth-zone">
        <form className="auth-card" onSubmit={onSubmit} noValidate>
          <h1>Inscription enseignant</h1>
          <p className="subtitle">
            Créez votre espace gratuitement et ouvrez jusqu’à 2 classes.
          </p>
          <Alert>{error}</Alert>
          <PhotoPicker
            value={form.photo}
            onChange={(photo) => setForm((current) => ({ ...current, photo }))}
            onError={setError}
            hint="Vos apprenants la verront à côté de votre nom."
          />
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
          <GenderField
            value={form.gender}
            onChange={(gender) => setForm((current) => ({ ...current, gender }))}
          />
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
