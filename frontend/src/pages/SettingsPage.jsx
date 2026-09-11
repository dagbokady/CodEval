import { useAuth } from '../auth';
import { PageHeader } from '../components/ui';
import { MODE_LABELS, THEME_MODES, useTheme } from '../theme';

const ROLE_LABELS = { teacher: 'Enseignante', student: 'Étudiant' };

export default function SettingsPage() {
  const { user, organization, signOut } = useAuth();
  const { mode, theme, choose } = useTheme();

  return (
    <>
      <PageHeader breadcrumb={organization} title="Paramètres du compte" />
      <div className="content">
        <section className="card" style={{ maxWidth: 520 }}>
          <dl style={{ display: 'grid', gap: 12, margin: 0 }}>
            {[
              ['Nom', user.full_name],
              ['E-mail', user.email],
              ['Rôle', ROLE_LABELS[user.role]],
              ['Établissement', organization],
              ...(user.matricule ? [['Matricule', user.matricule]] : []),
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', gap: 12 }}>
                <dt className="sub" style={{ width: 140 }}>
                  {label}
                </dt>
                <dd style={{ margin: 0 }}>{value}</dd>
              </div>
            ))}
          </dl>
          <button className="btn secondary" style={{ marginTop: 20 }} onClick={signOut}>
            Se déconnecter
          </button>
        </section>

        <section className="card" style={{ maxWidth: 520, marginTop: 16 }}>
          <h2 style={{ fontSize: 15, marginBottom: 4 }}>Apparence</h2>
          <p className="sub" style={{ marginBottom: 14 }}>
            En mode « système », l'interface suit le réglage de votre appareil et
            bascule avec lui, même page ouverte.
          </p>
          <div className="theme-choices" role="radiogroup" aria-label="Thème de l'interface">
            {THEME_MODES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                className={`theme-choice ${mode === value ? 'theme-choice--on' : ''}`}
                onClick={() => choose(value)}
              >
                {MODE_LABELS[value]}
              </button>
            ))}
          </div>
          {mode === 'system' && (
            <p className="sub" style={{ marginTop: 10 }}>
              Actuellement : thème {theme === 'dark' ? 'sombre' : 'clair'}.
            </p>
          )}
        </section>
      </div>
    </>
  );
}
