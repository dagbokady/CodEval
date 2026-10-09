/**
 * L'éditeur d'un exercice-projet : un onglet par fichier déclaré par
 * l'enseignant (`Etudiant.h`, `Fonctions.c`, `main.c`…).
 *
 * La copie reste une seule valeur : le document JSON `{"files": {…}}`, envoyé
 * et sauvegardé comme le texte d'un exercice à fichier unique. Changer
 * d'onglet ne perd rien : chaque fichier garde ce qu'on y a tapé.
 */

import { useMemo, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { packProject, readProject } from '../project';

export default function ProjectEditor({ files, language, value, onChange, readOnly, theme, extensions }) {
  const contents = useMemo(() => readProject(value, files, language), [value, files, language]);
  const names = files.map((f) => f.name);
  const [active, setActive] = useState(() => names.find((n) => /^main\./.test(n)) ?? names[0]);
  const current = names.includes(active) ? active : names[0];

  return (
    <div className="project-editor">
      <div className="project-tabs" role="tablist" aria-label="Fichiers du projet">
        {names.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={name === current}
            className={`project-tab ${name === current ? 'active' : ''}`.trim()}
            onClick={() => setActive(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="project-file" role="tabpanel" aria-label={current}>
        <CodeMirror
          key={current}
          value={contents[current] ?? ''}
          height="100%"
          theme={theme === 'dark' ? 'dark' : 'light'}
          extensions={extensions}
          editable={!readOnly}
          onChange={(text) => onChange(packProject({ ...contents, [current]: text }))}
          basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: true }}
        />
      </div>
    </div>
  );
}
