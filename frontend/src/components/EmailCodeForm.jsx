import { useEffect, useState } from 'react';
import { requestEmailCode } from '../api/emailCode';
import { Alert, Button, Field } from './ui';

/**
 * Second temps : l'inscrit recopie le code reçu. Le compte n'est créé qu'à
 * cette étape, par `onConfirm(code)`, qui rejette avec le message à afficher.
 */
export default function EmailCodeForm({ email, resendIn, onConfirm, onBack, submitLabel }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(resendIn ?? 60);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function onSubmit(event) {
    event.preventDefault();
    if (code.length !== 6) {
      setError('Le code compte six chiffres.');
      return;
    }
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      await onConfirm(code);
    } catch (err) {
      setError(err.message);
      setPending(false);
    }
  }

  async function resend() {
    setError(null);
    setNotice(null);
    try {
      setWait(await requestEmailCode(email));
      setCode('');
      setNotice('Un nouveau code vient de partir.');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="auth-card" onSubmit={onSubmit} noValidate>
      <h1>Vérifiez votre e-mail</h1>
      <p className="subtitle">
        Nous avons envoyé un code à six chiffres à <strong>{email}</strong>.
      </p>
      <Alert tone="info">
        Rien reçu ? Regardez dans vos <strong>spams</strong> (courriers indésirables). Si le
        message y est, marquez-le « Non spam » : les suivants arriveront dans la boîte de réception.
      </Alert>
      <Alert>{error}</Alert>
      <Alert tone="success">{notice}</Alert>
      <Field label="Code de vérification" id="email-code">
        <input
          id="email-code"
          className="email-code-input"
          autoFocus
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </Field>
      <Button size="large" type="submit" disabled={pending}>
        {pending ? 'Vérification…' : submitLabel}
      </Button>
      <div className="auth-footer">
        {wait > 0 ? (
          <span>Renvoyer le code dans {wait} s</span>
        ) : (
          <button type="button" className="cd-link" onClick={resend}>
            Renvoyer le code
          </button>
        )}
        <br />
        <button type="button" className="cd-link" onClick={onBack}>
          Modifier mes informations
        </button>
      </div>
    </form>
  );
}
