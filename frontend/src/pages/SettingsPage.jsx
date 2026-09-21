import { useRef, useState } from 'react';
import { useAuth } from '../auth';
import { api } from '../api/client';
import { useLanguages } from '../api/hooks';
import { PhotoPicker } from '../components/IdentityFields';
import { SHEET_LAYOUTS, SheetHeader } from '../components/SubjectSheet';
import { Alert, Avatar, Button, Field, PageHeader } from '../components/ui';
import { roleLabel } from '../roles';
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

  return (
    <>
      <PageHeader breadcrumb="Compte" title="Paramètres" />
      <div className="content settings">
        <section className="card profile-card">
          <Avatar user={user} className="avatar--xl" />
          <div className="profile-card-id">
            <strong>{user.full_name}</strong>
            <span className="sub">
              {roleLabel(user.role, user.gender)}
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
              ['Rôle', roleLabel(user.role, user.gender)],
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

        {(user.role === 'teacher' || user.role === 'student') && <PhotoSection />}

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

        {user.role === 'teacher' && <SheetHeaderSection />}

        {user.role === 'teacher' && <EvaluationDefaultsSection />}
      </div>
    </>
  );
}

/** La photo de profil : on la choisit, elle est enregistrée aussitôt. */
function PhotoSection() {
  const { user, updateUser } = useAuth();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);

  async function save(photo) {
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      updateUser(await api('/api/auth/me/photo', { method: 'PUT', body: { photo } }));
      setNotice('Photo enregistrée.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="Photo de profil"
      description="Elle vous identifie auprès de vos enseignants et de vos apprenants. Recadrée au carré, au centre."
    >
      <PhotoPicker
        value={user.photo}
        onChange={save}
        onError={setError}
        hint={saving ? 'Enregistrement…' : 'JPEG, PNG ou WebP'}
      />
      {error && <Alert>{error}</Alert>}
      {notice && !error && (
        <p className="sub" role="status">
          {notice}
        </p>
      )}
    </Section>
  );
}

const EMPTY_HEADER = {
  layout: 'classique',
  logo: null,
  left_lines: [],
  right_lines: [],
  title: '',
  show_classroom: true,
  show_session: true,
};
const HEADER_LINES = 4;
const LOGO_MAX_SIDE = 320;

/** Complète une liste de lignes jusqu'au nombre de champs affichés. */
function padLines(lines) {
  return [...(lines ?? []), ...Array(HEADER_LINES).fill('')].slice(0, HEADER_LINES);
}

/**
 * Réduit le logo à 320 px sur son plus grand côté, sans le recadrer. En PNG
 * pour garder la transparence ; en WebP s'il reste trop lourd.
 */
function toSheetLogo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, LOGO_MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth * scale);
      canvas.height = Math.round(image.naturalHeight * scale);
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const png = canvas.toDataURL('image/png');
      resolve(png.length < 380_000 ? png : canvas.toDataURL('image/webp', 0.9));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Ce logo ne peut pas être lu. Choisissez une image JPEG, PNG ou WebP.'));
    };
    image.src = url;
  });
}

/**
 * L'en-tête posé sur toutes les feuilles de l'enseignant : sujet, feuille de
 * composition, copie corrigée. Il est enregistré sur le compte, et les
 * apprenants voient le même.
 */
function SheetHeaderSection() {
  const { user, organization, updateUser } = useAuth();
  const initial = { ...EMPTY_HEADER, ...(user.sheet_header ?? {}) };
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const logoInput = useRef(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const isEmpty = JSON.stringify(saved) === JSON.stringify(EMPTY_HEADER);
  const set = (patch) => {
    setDraft((d) => ({ ...d, ...patch }));
    setNotice(null);
  };
  const setLine = (key, index, value) => {
    const lines = padLines(draft[key]);
    lines[index] = value;
    set({ [key]: lines });
  };

  async function onLogo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Choisissez une image (JPEG, PNG ou WebP).');
      return;
    }
    try {
      set({ logo: await toSheetLogo(file) });
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function save(value = draft) {
    setSaving(true);
    setError(null);
    try {
      const next = await api('/api/auth/me/sheet-header', { method: 'PUT', body: value });
      updateUser(next);
      const clean = { ...EMPTY_HEADER, ...next.sheet_header };
      setSaved(clean);
      setDraft(clean);
      setNotice('Enregistré : vos feuilles portent désormais cet en-tête.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section
      title="En-tête des feuilles"
      description="Logo, titres et disposition du haut de vos sujets et copies. Vos apprenants voient le même en-tête, sur toutes vos épreuves."
    >
      <div className="field">
        <span className="field-label" id="sheet-layout">Disposition</span>
        <div className="choice-cards" role="radiogroup" aria-labelledby="sheet-layout">
          {SHEET_LAYOUTS.map((l) => (
            <button
              key={l.value}
              type="button"
              role="radio"
              aria-checked={draft.layout === l.value}
              className="choice-card"
              onClick={() => set({ layout: l.value })}
            >
              <strong>{l.label}</strong>
              <span className="sub">{l.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="photo-picker sheet-logo-picker">
        <button
          type="button"
          className="photo-picker-preview sheet-logo-preview"
          onClick={() => logoInput.current?.click()}
          aria-label={draft.logo ? 'Changer de logo' : 'Ajouter un logo'}
        >
          {draft.logo ? <img src={draft.logo} alt="" /> : <span aria-hidden="true">+</span>}
        </button>
        <div className="photo-picker-text">
          <strong>Logo</strong>
          <span>JPEG, PNG ou WebP, gardé dans ses proportions</span>
          <div className="settings-inline-actions">
            <Button variant="secondary" size="small" onClick={() => logoInput.current?.click()}>
              {draft.logo ? 'Changer' : 'Choisir un logo'}
            </Button>
            {draft.logo && (
              <Button variant="ghost" size="small" onClick={() => set({ logo: null })}>
                Retirer
              </Button>
            )}
          </div>
        </div>
        <input
          ref={logoInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          onChange={onLogo}
        />
      </div>

      <div className={`sheet-header-lines ${draft.layout === 'officiel' ? 'sheet-header-lines--deux' : ''}`.trim()}>
        <fieldset className="field sheet-header-block">
          <legend className="field-label">Bloc établissement</legend>
          {padLines(draft.left_lines).map((line, index) => (
            <input
              key={index}
              aria-label={`Établissement, ligne ${index + 1}`}
              value={line}
              maxLength={160}
              placeholder={
                index === 0
                  ? organization ?? 'Nom de l’établissement'
                  : ['Département ou UFR', 'Filière', 'Autre mention'][index - 1]
              }
              onChange={(e) => setLine('left_lines', index, e.target.value)}
            />
          ))}
        </fieldset>
        {draft.layout === 'officiel' && (
          <fieldset className="field sheet-header-block">
            <legend className="field-label">Bloc de droite</legend>
            {padLines(draft.right_lines).map((line, index) => (
              <input
                key={index}
                aria-label={`Bloc de droite, ligne ${index + 1}`}
                value={line}
                maxLength={160}
                placeholder={
                  ['République de Côte d’Ivoire', 'Union - Discipline - Travail', '', ''][index]
                }
                onChange={(e) => setLine('right_lines', index, e.target.value)}
              />
            ))}
          </fieldset>
        )}
      </div>

      <Field
        label="Titre de l’épreuve"
        id="sheet-title"
        hint="Centré au-dessus du cartouche. Vide : le nom de la matière."
      >
        <input
          id="sheet-title"
          value={draft.title}
          maxLength={160}
          placeholder="Examen de fin de semestre"
          onChange={(e) => set({ title: e.target.value })}
        />
      </Field>

      <label className="switch">
        <input
          type="checkbox"
          checked={draft.show_classroom}
          onChange={(e) => set({ show_classroom: e.target.checked })}
        />
        <span>
          <strong>Afficher la classe</strong>
          <span className="sub">Sous le bloc établissement.</span>
        </span>
      </label>
      <label className="switch">
        <input
          type="checkbox"
          checked={draft.show_session}
          onChange={(e) => set({ show_session: e.target.checked })}
        />
        <span>
          <strong>Afficher la session</strong>
          <span className="sub">L’année de l’épreuve, en haut à droite.</span>
        </span>
      </label>

      <div className="field">
        <span className="field-label">Aperçu</span>
        <div className="sheet-header-apercu">
          <div className="sheet-paper sujet">
            <SheetHeader
              organization={organization}
              classroom="Licence 1 - Groupe A"
              subject="Algorithmique"
              title="Structures conditionnelles"
              durationMinutes={120}
              points={20}
              date={new Date().toISOString()}
              header={draft}
            />
          </div>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="settings-actions">
        <Button disabled={!dirty || saving} onClick={() => save()}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        {dirty && (
          <Button variant="secondary" onClick={() => { setDraft(saved); setNotice(null); }}>
            Annuler les modifications
          </Button>
        )}
        {!dirty && !isEmpty && (
          <Button variant="ghost" disabled={saving} onClick={() => save(EMPTY_HEADER)}>
            Revenir à l’en-tête d’origine
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
