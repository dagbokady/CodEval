/**
 * Ce que l'apprenant trouve en ouvrant un exercice de code : un fichier unique
 * avec son code de départ, ou un projet découpé en fichiers (`Etudiant.h`,
 * `Fonctions.c`, `main.c`…), chacun avec le sien.
 *
 * Partagé par l'éditeur d'évaluation et la banque d'exercices. `onChange`
 * reçoit un morceau d'exercice : passer d'un mode à l'autre touche à la fois
 * `settings.files` et `starter_code`.
 */

import { Button, Field } from './ui';
import {
  MAX_FILES,
  PROJECT_LANGUAGES,
  defaultProjectFiles,
  fileNameIssue,
  isSource,
} from '../project';

export default function ProjectFilesEditor({ exercise, name, readOnly = false, onChange }) {
  const language = exercise.language ?? 'c';
  const settings = exercise.settings ?? {};
  // La liste brute : un fichier tout juste ajouté n'a pas encore de nom, il
  // doit pourtant rester à l'écran le temps qu'on le lui donne.
  const files = (exercise.kind ?? 'code') === 'code' && Array.isArray(settings.files) ? settings.files : [];
  const projet = files.length > 0;

  const setFiles = (next) => onChange({ settings: { ...settings, files: next } });

  function toProject() {
    onChange({
      settings: { ...settings, files: defaultProjectFiles(language, exercise.starter_code ?? '') },
      starter_code: '',
    });
  }

  function toSingleFile() {
    // Le code de départ du fichier principal redevient celui de l'exercice.
    const main = files.find((f) => /^main\./.test(f.name)) ?? files.find((f) => isSource(f.name, language));
    const rest = { ...settings };
    delete rest.files;
    onChange({ settings: rest, starter_code: main?.starter ?? '' });
  }

  const mode = PROJECT_LANGUAGES.has(language) && (
    <div className="project-mode" role="radiogroup" aria-label="Organisation du code">
      <label>
        <input
          type="radio"
          name={`${name}-mode`}
          checked={!projet}
          disabled={readOnly}
          onChange={toSingleFile}
        />
        Un seul fichier
      </label>
      <label>
        <input
          type="radio"
          name={`${name}-mode`}
          checked={projet}
          disabled={readOnly}
          onChange={toProject}
        />
        Plusieurs fichiers (projet : .h et .c)
      </label>
    </div>
  );

  if (!projet) {
    return (
      <>
        {mode}
        <Field label="Code présent dans l'éditeur à l'ouverture" id={`${name}-starter`}>
          <textarea
            id={`${name}-starter`}
            rows={10}
            style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
            value={exercise.starter_code ?? ''}
            disabled={readOnly}
            onChange={(e) => onChange({ starter_code: e.target.value })}
          />
        </Field>
      </>
    );
  }

  // Le langage a changé depuis le découpage : seuls le C et le C++ en ont un.
  if (!PROJECT_LANGUAGES.has(language)) {
    return (
      <div className="project-mode">
        <span className="sub">
          Le découpage en fichiers ne vaut qu'en C et en C++. Repassez en fichier unique pour
          ce langage.
        </span>
        {!readOnly && (
          <Button variant="secondary" size="small" onClick={toSingleFile}>
            Revenir à un seul fichier
          </Button>
        )}
      </div>
    );
  }

  const names = files.map((f) => f.name);
  const sources = files.filter((f) => isSource(f.name, language)).length;

  return (
    <>
      {mode}
      <p className="sub" style={{ margin: '4px 0 10px' }}>
        L'apprenant reçoit un onglet par fichier, dans cet ordre. La correction compile tous
        les fichiers sources ensemble, comme <code>gcc {names.filter((n) => isSource(n, language)).join(' ')}</code>.
      </p>
      <div className="project-files">
        {files.map((file, index) => {
          const issue = fileNameIssue(
            file.name,
            language,
            names.filter((_, i) => i !== index),
          );
          const update = (patch) =>
            setFiles(files.map((f, i) => (i === index ? { ...f, ...patch } : f)));
          const lastSource = isSource(file.name, language) && sources === 1;
          return (
            <div className="project-file-card" key={index}>
              <div className="project-file-head">
                <input
                  aria-label={`Nom du fichier ${index + 1}`}
                  aria-invalid={Boolean(issue)}
                  value={file.name}
                  disabled={readOnly}
                  spellCheck={false}
                  placeholder="Fonctions.c"
                  onChange={(e) => update({ name: e.target.value })}
                />
                {issue && <span className="project-file-issue">{issue}</span>}
                {!readOnly && (
                  <span className="project-file-actions">
                    <Button
                      variant="ghost"
                      size="small"
                      disabled={index === 0}
                      title="Monter cet onglet"
                      onClick={() =>
                        setFiles(files.map((f, i) => (i === index - 1 ? file : i === index ? files[index - 1] : f)))
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      variant="danger-ghost"
                      size="small"
                      disabled={lastSource}
                      title={lastSource ? 'Le projet garde au moins un fichier source' : undefined}
                      onClick={() => setFiles(files.filter((_, i) => i !== index))}
                    >
                      Retirer
                    </Button>
                  </span>
                )}
              </div>
              <textarea
                aria-label={`Code de départ de ${file.name || `fichier ${index + 1}`}`}
                rows={Math.min(14, Math.max(4, (file.starter ?? '').split('\n').length + 1))}
                spellCheck={false}
                style={{ fontFamily: 'var(--mono)', fontSize: 13 }}
                value={file.starter ?? ''}
                disabled={readOnly}
                placeholder="Code de départ (facultatif) : laissez vide pour un fichier à écrire entièrement."
                onChange={(e) => update({ starter: e.target.value })}
              />
            </div>
          );
        })}
      </div>
      {!readOnly && files.length < MAX_FILES && (
        <Button
          variant="secondary"
          size="small"
          style={{ marginTop: 8 }}
          onClick={() => setFiles([...files, { name: '', starter: '' }])}
        >
          + Fichier
        </Button>
      )}
    </>
  );
}
