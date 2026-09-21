import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { HOME_BY_ROLE, useAuth } from '../auth';
import { GenderField, PhotoPicker } from '../components/IdentityFields';
import { Alert, Button, Field, Loading, PasswordInput } from '../components/ui';
import { cleanJoinCode, typeJoinCode } from '../joinCode';
import { useDocumentTitle } from '../useDocumentTitle';

/**
 * Entrée d'un apprenant dans sa classe, avec le code donné par l'enseignant
 * ou le lien d'invitation qu'il a partagé. Deux temps : la classe, pour
 * vérifier qu'on est au bon endroit, puis le compte. Un apprenant déjà
 * connecté rejoint la classe directement.
 */
export default function JoinPage() {
  useDocumentTitle('Rejoindre une classe');
  const params = useParams();
  const { status, user } = useAuth();
  const token = params.token ?? null;
  const [code, setCode] = useState(typeJoinCode(params.code ?? ''));
  // Le code soumis à vérification. Arrivé par un lien, il l'est d'office.
  const [checked, setChecked] = useState(params.code ? cleanJoinCode(params.code) : null);
  const [error, setError] = useState(null);
  // Un lien expiré laisse la main au code : l'apprenant le demande à son enseignant.
  const [byCode, setByCode] = useState(!token);
  const via = token && !byCode ? { token } : { code: checked };
  const preview = useQuery({
    queryKey: ['join-preview', via.token ?? via.code],
    queryFn: () => api(via.token ? `/api/join/link/${via.token}` : `/api/join/${via.code}`),
    enabled: Boolean(via.token ?? via.code),
    retry: false,
  });
  const classroom = via.token || checked ? preview.data : null;
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
  } else if (via.token && preview.isPending) {
    card = <Loading variant="screen" />;
  } else if (via.token && preview.error) {
    card = (
      <div className="auth-card">
        <h1>Lien expiré</h1>
        <p className="subtitle">
          Ce lien d’invitation n’est plus valable. Demandez un nouveau lien à votre enseignant,
          ou saisissez le code de la classe.
        </p>
        <Button size="large" onClick={() => setByCode(true)}>Saisir le code</Button>
      </div>
    );
  } else if (status === 'authenticated') {
    card = <StudentJoin initialCode={code} token={via.token} classroom={classroom} />;
  } else if (classroom) {
    card = (
      <SignupForm
        via={via.token ? { token: via.token } : { code: cleanJoinCode(code) }}
        classroom={classroom}
        onBack={() => {
          setByCode(true);
          setChecked(null);
        }}
      />
    );
  } else {
    card = (
      <form
        className="auth-card"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (cleanJoinCode(code).length < 8) {
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
        <CodeField id="join-code" value={code} onChange={setCode} />
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

function CodeField({ id, value, onChange }) {
  return (
    <Field label="Code de la classe" id={id} hint="Douze caractères, par exemple 9E5G-97CJ-34DD">
      <input
        id={id}
        className="join-code-input"
        autoFocus
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        required
        maxLength={14}
        placeholder="XXXX-XXXX-XXXX"
        value={value}
        onChange={(e) => onChange(typeJoinCode(e.target.value))}
      />
    </Field>
  );
}

function ClassroomCard({ classroom, onBack }) {
  return (
    <div className="join-classroom">
      <strong>{classroom.classroom_name}</strong>
      <span className="sub">
        {[classroom.level, classroom.organization_name].filter(Boolean).join(' · ')}
      </span>
      {onBack && (
        <button type="button" className="cd-link" onClick={onBack}>
          Ce n’est pas ma classe
        </button>
      )}
    </div>
  );
}

function SignupForm({ via, classroom, onBack }) {
  const { authenticate } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    matricule: '',
    password: '',
    photo: '',
    gender: '',
  });
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function onSubmit(event) {
    event.preventDefault();
    const missing = !form.photo
      ? 'Ajoutez une photo de vous.'
      : !form.gender
        ? 'Indiquez votre sexe.'
        : !form.matricule.trim()
          ? 'Saisissez votre matricule.'
          : form.password.length < 8
            ? 'Le mot de passe doit contenir au moins 8 caractères.'
            : null;
    if (missing) {
      setError(missing);
      return;
    }
    setError(null);
    setPending(true);
    try {
      const account = await authenticate('/api/join', {
        ...form,
        ...via,
        matricule: form.matricule.trim(),
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
      <ClassroomCard classroom={classroom} onBack={onBack} />
      <Alert>{error}</Alert>
      <PhotoPicker
        value={form.photo}
        onChange={(photo) => setForm((current) => ({ ...current, photo }))}
        onError={setError}
        hint="Elle permet à votre enseignant de vous reconnaître."
      />
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
      <GenderField
        value={form.gender}
        onChange={(gender) => setForm((current) => ({ ...current, gender }))}
      />
      <Field label="Matricule" id="s-matricule" hint="Celui de votre carte d’étudiant.">
        <input
          id="s-matricule"
          required
          autoComplete="off"
          value={form.matricule}
          onChange={update('matricule')}
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

/** Apprenant déjà connecté : le code, ou le lien, suffit. */
function StudentJoin({ initialCode, token, classroom }) {
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    if (!token && cleanJoinCode(code).length < 8) {
      setError('Saisissez le code donné par votre enseignant.');
      return;
    }
    setError(null);
    setPending(true);
    try {
      await api('/api/me/classrooms/join', {
        method: 'POST',
        body: token ? { token } : { code: cleanJoinCode(code) },
      });
      navigate('/mes-evaluations', { replace: true });
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  return (
    <form className="auth-card" onSubmit={onSubmit} noValidate>
      <h1>Rejoindre une classe</h1>
      <p className="subtitle">
        {token
          ? 'Vous avez été invité à rejoindre cette classe.'
          : 'Saisissez le code que votre enseignant vous a donné.'}
      </p>
      {token && classroom && <ClassroomCard classroom={classroom} />}
      <Alert>{error}</Alert>
      {!token && <CodeField id="join-code-auth" value={code} onChange={setCode} />}
      <Button size="large" type="submit" disabled={pending}>
        {pending ? 'Inscription…' : 'Rejoindre la classe'}
      </Button>
      <div className="auth-footer">
        <Link to="/mes-evaluations">Retour à mes évaluations</Link>
      </div>
    </form>
  );
}
