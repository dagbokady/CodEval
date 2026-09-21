import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { HOME_BY_ROLE, useAuth } from '../auth';
import { Alert, Button, Field, Loading, PasswordInput } from '../components/ui';
import { cleanJoinCode, formatJoinCode } from '../joinCode';
import { useDocumentTitle } from '../useDocumentTitle';

/**
 * Entrée d'un apprenant dans sa classe, avec le code donné par l'enseignant.
 * Deux temps : le code, pour vérifier la classe, puis le compte. Un apprenant
 * déjà connecté rejoint la classe directement.
 */
export default function JoinPage() {
  useDocumentTitle('Rejoindre une classe');
  const params = useParams();
  const { status, user } = useAuth();
  const [code, setCode] = useState(formatJoinCode(cleanJoinCode(params.code ?? '')));
  // Le code soumis à vérification. Arrivé par le lien partagé, il l'est d'office.
  const [checked, setChecked] = useState(params.code ? cleanJoinCode(params.code) : null);
  const [error, setError] = useState(null);
  const preview = useQuery({
    queryKey: ['join-preview', checked],
    queryFn: () => api(`/api/join/${checked}`),
    enabled: Boolean(checked) && status === 'anonymous',
    retry: false,
  });
  const classroom = checked ? preview.data : null;
  const shownError = error ?? (checked ? preview.error?.message : null);

  if (status === 'loading') return <Loading variant="screen" />;

  let card;
  if (status === 'authenticated' && user.role !== 'student') {
    card = (
      <div className="auth-card">
        <h1>Rejoindre une classe</h1>
        <p className="subtitle">
          Vous êtes connecté avec un compte enseignant. Le code de classe sert aux apprenants.
        </p>
        <Link className="btn primary large" to={HOME_BY_ROLE[user.role]}>Retour à mon espace</Link>
      </div>
    );
  } else if (status === 'authenticated') {
    card = <StudentJoin initialCode={code} />;
  } else if (classroom) {
    card = (
      <SignupForm
        code={code}
        classroom={classroom}
        onBack={() => setChecked(null)}
      />
    );
  } else {
    card = (
      <form
        className="auth-card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (cleanJoinCode(code).length < 4) {
            setError('Saisissez le code donné par votre enseignant.');
            return;
          }
          setError(null);
          setChecked(cleanJoinCode(code));
        }}
      >
        <h1>Rejoindre une classe</h1>
        <p className="subtitle">Saisissez le code que votre enseignant vous a donné.</p>
        <Alert>{shownError}</Alert>
        <Field label="Code de la classe" id="join-code" hint="Par exemple ABCD-2345">
          <input
            id="join-code"
            className="join-code-input"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
        </Field>
        <Button size="large" type="submit" disabled={preview.isFetching}>
          {preview.isFetching ? 'Vérification…' : 'Continuer'}
        </Button>
        <div className="auth-footer">
          Déjà un compte ? <Link to="/connexion">Se connecter</Link>
        </div>
      </form>
    );
  }

  return (
    <div className="auth">
      <header className="auth-top">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">&lt;/&gt;</span>
          CodEval
        </div>
      </header>
      <div className="auth-zone">{card}</div>
    </div>
  );
}

function SignupForm({ code, classroom, onBack }) {
  const { authenticate } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', matricule: '', password: '' });
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
      const account = await authenticate('/api/join', {
        ...form,
        code: cleanJoinCode(code),
        matricule: form.matricule.trim() || null,
      });
      navigate(HOME_BY_ROLE[account.role], { replace: true });
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={onSubmit} noValidate>
      <h1>Créer votre compte</h1>
      <div className="join-classroom">
        <strong>{classroom.classroom_name}</strong>
        <span className="sub">
          {[classroom.level, classroom.organization_name].filter(Boolean).join(' · ')}
        </span>
        <button type="button" className="cd-link" onClick={onBack}>
          Ce n’est pas ma classe
        </button>
      </div>
      <Alert>{error}</Alert>
      <Field label="Nom complet" id="s-name">
        <input
          id="s-name"
          autoComplete="name"
          autoFocus
          required
          value={form.full_name}
          onChange={update('full_name')}
        />
      </Field>
      <Field label="E-mail" id="s-email">
        <input
          id="s-email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          value={form.email}
          onChange={update('email')}
        />
      </Field>
      <Field label="Matricule" id="s-matricule" hint="Facultatif.">
        <input id="s-matricule" value={form.matricule} onChange={update('matricule')} />
      </Field>
      <Field label="Mot de passe" id="s-password" hint="8 caractères minimum">
        <PasswordInput
          id="s-password"
          autoComplete="new-password"
          required
          value={form.password}
          onChange={update('password')}
        />
      </Field>
      <Button size="large" type="submit" disabled={pending}>
        {pending ? 'Inscription…' : 'Rejoindre la classe'}
      </Button>
      <div className="auth-footer">
        Déjà un compte ? <Link to="/connexion">Se connecter</Link>, puis saisissez le code
        depuis votre espace.
      </div>
    </form>
  );
}

/** Apprenant déjà connecté : le code suffit. */
function StudentJoin({ initialCode }) {
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await api('/api/me/classrooms/join', { method: 'POST', body: { code: cleanJoinCode(code) } });
      navigate('/mes-evaluations', { replace: true });
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={onSubmit} noValidate>
      <h1>Rejoindre une classe</h1>
      <p className="subtitle">Saisissez le code que votre enseignant vous a donné.</p>
      <Alert>{error}</Alert>
      <Field label="Code de la classe" id="join-code-auth">
        <input
          id="join-code-auth"
          className="join-code-input"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
        />
      </Field>
      <Button size="large" type="submit" disabled={pending}>
        {pending ? 'Inscription…' : 'Rejoindre la classe'}
      </Button>
      <div className="auth-footer">
        <Link to="/mes-evaluations">Retour à mes évaluations</Link>
      </div>
    </form>
  );
}
