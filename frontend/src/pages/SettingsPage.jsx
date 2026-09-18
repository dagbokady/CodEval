import { useState } from 'react';
import { useAuth } from '../auth';
import { useLanguages } from '../api/hooks';
import { Button, Field, PageHeader } from '../components/ui';
import { formatExamDuration } from '../format';
import { MODE_LABELS, THEME_MODES, useTheme } from '../theme';
import {
  DURATION_PRESETS,
  EVALUATION_KINDS,
  FACTORY_DEFAULTS,
  RULE_SWITCHES,
  readEvaluationDefaults,
  resetEvaluationDefaults,
  saveEvaluationDefaults,
} from '../evaluationDefaults';

const ROLE_LABELS = { teacher: 'Enseignante', student: 'Étudiant' };

const THEME_HINTS = {
  system: "Suit le réglage de l'appareil",
  light: 'Fond clair, le jour',
  dark: 'Fond sombre, reposant le soir',
};

/** Une rubrique : son titre et son explication à gauche, ses réglages à droite. */
function Section({ title, description, children }) {
  return (
    <section className="card settings-section">
      <div className="settings-section-head">
        <h2>{title}</h2>
        {description && <p className="sub">{description}</p>}
      </div>
      <div className="settings-section-body">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { user, organization, signOut } = useAuth();
  const { mode, theme, choose } = useTheme();
  const initials = user.full_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  return (
    <>
      <PageHeader breadcrumb="Compte" title="Paramètres" />
      <div className="content settings">
        <section className="card profile-card">
          <span className="avatar avatar--xl" aria-hidden="true">{initials}</span>
          <div className="profile-card-id">
            <strong>{user.full_name}</strong>
            <span className="sub">
              {ROLE_LABELS[user.role]}
              {organization ? ` · ${organization}` : ''}
            </span>
          </div>
          <Button variant="secondary" onClick={signOut} style={{ marginLeft: 'auto' }}>
            Se déconnecter
          </Button>
        </section>

        <Section
          title="Profil"
          description="Ces informations viennent de votre établissement. Pour les corriger, adressez-vous à son administration."
        >
          <dl className="profile-list">
            {[
              ['Nom complet', user.full_name],
              ['Adresse e-mail', user.email],
              ['Rôle', ROLE_LABELS[user.role]],
              ['Établissement', organization ?? '-'],
              ...(user.matricule ? [['Matricule', user.matricule]] : []),
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section
          title="Apparence"
          description="Le thème s'applique à toute l'interface, épreuves comprises. Il est retenu sur cet appareil."
        >
          <div className="theme-cards" role="radiogroup" aria-label="Thème de l'interface">
            {THEME_MODES.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                className="theme-card"
                onClick={() => choose(value)}
              >
                <span className={`theme-swatch theme-swatch--${value}`} aria-hidden="true">
                  <span className="theme-swatch-bar" />
                  <span className="theme-swatch-line" />
                  <span className="theme-swatch-line theme-swatch-line--short" />
                </span>
                <strong>{MODE_LABELS[value]}</strong>
                <span className="sub">{THEME_HINTS[value]}</span>
              </button>
            ))}
          </div>
          {mode === 'system' && (
            <p className="sub" style={{ marginTop: 12 }}>
              Votre appareil est actuellement en thème {theme === 'dark' ? 'sombre' : 'clair'}.
            </p>
          )}
        </Section>

        {user.role === 'teacher' && <EvaluationDefaultsSection />}
      </div>
    </>
  );
}

/**
 * Les réglages qu'on refaisait à chaque nouvelle évaluation (même durée, même
 * barème, mêmes règles de surveillance) se posent une fois ici. L'assistant de
 * création part de ces valeurs ; chaque évaluation reste modifiable ensuite.
 */
function EvaluationDefaultsSection() {
  const languages = useLanguages();
  const [saved, setSaved] = useState(readEvaluationDefaults);
  const [draft, setDraft] = useState(saved);
  const [notice, setNotice] = useState(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const isFactory = JSON.stringify(saved) === JSON.stringify(FACTORY_DEFAULTS);
  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setNotice(null);
  };
  const setRule = (key, value) => set({ rules: { ...draft.rules, [key]: value } });

  function save() {
    const clean = {
      ...draft,
      duration_minutes: Math.max(5, Number(draft.duration_minutes) || FACTORY_DEFAULTS.duration_minutes),
      total_points: Math.max(1, Number(draft.total_points) || FACTORY_DEFAULTS.total_points),
    };
    if (saveEvaluationDefaults(clean)) {
      setSaved(clean);
      setDraft(clean);
      setNotice('Enregistré : vos prochaines évaluations partiront de ces valeurs.');
    } else {
      setNotice("Impossible d'enregistrer : le navigateur refuse le stockage local.");
    }
  }

  function reset() {
    const factory = resetEvaluationDefaults();
    setSaved(factory);
    setDraft(factory);
    setNotice('Valeurs d’origine rétablies.');
  }

  return (
    <Section
      title="Nouvelles évaluations"
      description="Les valeurs de départ de l'assistant de création. Elles ne changent rien aux évaluations déjà créées."
    >
      <div className="field">
        <span className="field-label" id="default-kind">Type proposé</span>
        <div className="choice-cards" role="radiogroup" aria-labelledby="default-kind">
          {EVALUATION_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={draft.kind === k.value}
              className="choice-card"
              onClick={() => set({ kind: k.value })}
            >
              <strong>{k.label}</strong>
              <span className="sub">{k.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="row">
        <Field label="Durée (minutes)" id="default-duration" hint={formatExamDuration(draft.duration_minutes)}>
          <input
            id="default-duration"
            type="number"
            min="5"
            max="600"
            value={draft.duration_minutes}
            onChange={(e) => set({ duration_minutes: e.target.value })}
          />
        </Field>
        <Field label="Barème total (points)" id="default-points">
          <input
            id="default-points"
            type="number"
            min="1"
            value={draft.total_points}
            onChange={(e) => set({ total_points: e.target.value })}
          />
        </Field>
        <Field label="Langage des exercices de code" id="default-language">
          <select
            id="default-language"
            value={draft.language}
            onChange={(e) => set({ language: e.target.value })}
          >
            {(languages.data ?? [{ key: draft.language, label: draft.language.toUpperCase() }]).map((l) => (
              <option key={l.key} value={l.key}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="duration-presets" role="group" aria-label="Durées courantes">
        {DURATION_PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            className="chip"
            aria-pressed={Number(draft.duration_minutes) === m}
            onClick={() => set({ duration_minutes: m })}
          >
            {formatExamDuration(m)}
          </button>
        ))}
      </div>

      <h3 className="settings-subtitle">Modalités de passage</h3>
      {RULE_SWITCHES.map(([key, title, hint]) => (
        <label className="switch" key={key}>
          <input
            type="checkbox"
            checked={Boolean(draft.rules[key])}
            onChange={(e) => setRule(key, e.target.checked)}
          />
          <span>
            <strong>{title}</strong>
            <span className="sub">{hint}</span>
          </span>
        </label>
      ))}
      <label className="switch">
        <input
          type="checkbox"
          checked={draft.rules.announce_to_students !== false}
          onChange={(e) => setRule('announce_to_students', e.target.checked)}
        />
        <span>
          <strong>Annoncer l’épreuve aux étudiants</strong>
          <span className="sub">Décochez pour préparer des interrogations surprises par défaut.</span>
        </span>
      </label>
      <Field
        label="Nombre de sorties autorisées"
        id="default-incidents"
        hint="Au-delà, la copie est verrouillée. 0 : les sorties sont seulement signalées."
      >
        <input
          id="default-incidents"
          type="number"
          min="0"
          max="20"
          style={{ maxWidth: 120 }}
          value={draft.rules.max_incidents ?? 1}
          onChange={(e) => setRule('max_incidents', Number(e.target.value))}
        />
      </Field>

      <div className="settings-actions">
        <Button disabled={!dirty} onClick={save}>
          Enregistrer
        </Button>
        {dirty && (
          <Button variant="secondary" onClick={() => { setDraft(saved); setNotice(null); }}>
            Annuler les modifications
          </Button>
        )}
        {!dirty && !isFactory && (
          <Button variant="ghost" onClick={reset}>
            Rétablir les valeurs d’origine
          </Button>
        )}
        {notice && (
          <span className="sub" role="status">
            {notice}
          </span>
        )}
      </div>
    </Section>
  );
}
