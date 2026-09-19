/**
 * L'écran « Outils autorisés » d'un exercice algorithmique.
 *
 * Un algorithme a toujours la forme du cours (un nom, une partie déclarative,
 * un corps entre Début et Fin) et cette forme n'est pas négociable : ni
 * l'enseignant ni l'apprenant ne la défont. Elle est donc rappelée ici comme un
 * fait, pas comme une option. Ce qui se règle, exercice par exercice, c'est
 * l'outillage : quels éléments l'apprenant aura le droit de poser dans ce
 * squelette. Un exercice sur les boucles n'ouvre pas les fonctions ; un exercice
 * de découverte n'ouvre que LIRE, ECRIRE et l'affectation.
 *
 * Cette étape est obligatoire pour tout exercice algorithmique : la palette de
 * l'apprenant en est la copie exacte (voir `AlgoEditor`), et le correcteur
 * refuse un élément non autorisé (`backend/app/grading/algo.py`).
 */

import { ALL_ELEMENT_KEYS, DEFAULT_ELEMENTS, toolGroups } from '../algoVocabulary';
import { Button } from './ui';

/** Le squelette imposé, tel qu'il est écrit au tableau. */
const SQUELETTE = [
  { texte: 'ALGORITHME', suite: ' <nom>' },
  { texte: '    CONSTANTES', suite: ' <définition de constantes>', rubrique: 'constante' },
  { texte: '    TYPES', suite: ' <définition de types>', rubrique: 'type' },
  { texte: '    VARIABLES', suite: ' <définition de variables>', rubrique: 'declaration' },
  { texte: 'DEBUT' },
  { texte: '    …', suite: ' <instructions>', gris: true },
  { texte: 'FIN' },
  { texte: '' },
  { texte: 'FONCTION / PROCEDURE', suite: ' <sous-programmes, après FIN>', rubrique: 'sousprog' },
];

export default function ToolboxEditor({
  value,
  onChange,
  ecritureCours = true,
  onEcritureCours,
  readOnly = false,
}) {
  const autorisés = value?.length ? value : DEFAULT_ELEMENTS;
  const permits = (key) =>
    key === 'sousprog' ? autorisés.includes('fonction') || autorisés.includes('procedure') : autorisés.includes(key);

  const toggle = (key, checked) =>
    onChange(
      checked
        ? [...new Set([...autorisés, key])]
        : autorisés.filter((item) => item !== key),
    );

  return (
    <section className="outils-editeur">
      <div className="outils-squelette" aria-label="Structure imposée d'un algorithme">
        <div className="outils-squelette-titre">La structure, elle, ne se règle pas</div>
        <pre>
          {SQUELETTE.map((ligne, i) => (
            <div key={i} className={ligne.gris ? 'sub' : undefined}>
              <strong>{ligne.texte}</strong>
              {ligne.suite && (
                <span className={ligne.rubrique && !permits(ligne.rubrique) ? 'barré' : 'sub'}>
                  {ligne.suite}
                </span>
              )}
            </div>
          ))}
        </pre>
        <p className="sub">
          Tout algorithme rendu sur CodEval a cette forme : l'éditeur la pose et l'apprenant ne
          peut pas la défaire. Une rubrique dont l'élément n'est pas autorisé ci-dessous ne lui
          sera simplement pas proposée.
        </p>
      </div>

      <header className="outils-tete">
        <div>
          <strong style={{ fontSize: 13 }}>Ce que l'apprenant aura le droit de poser</strong>
          <p className="sub" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {autorisés.length} élément{autorisés.length > 1 ? 's' : ''} proposé
            {autorisés.length > 1 ? 's' : ''} dans sa palette. Un élément décoché reste refusé à
            la correction.
          </p>
        </div>
        {!readOnly && (
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <Button variant="secondary" size="small" onClick={() => onChange([...DEFAULT_ELEMENTS])}>
              Vocabulaire de base
            </Button>
            <Button variant="secondary" size="small" onClick={() => onChange([...ALL_ELEMENT_KEYS])}>
              Tout autoriser
            </Button>
          </div>
        )}
      </header>

      {toolGroups().map(({ group, elements }) => (
        <div key={group} className="outils-groupe">
          <div className="outils-groupe-titre">{group}</div>
          <div className="outils-chips">
            {elements.map((element) => (
              <label
                key={element.key}
                className={`chip ${permits(element.key) ? 'chip-actif' : ''}`.trim()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={permits(element.key)}
                  disabled={readOnly}
                  onChange={(e) => toggle(element.key, e.target.checked)}
                />
                {element.label}
              </label>
            ))}
          </div>
        </div>
      ))}

      {onEcritureCours && (
        <label className="outils-ecriture">
          <input
            type="checkbox"
            checked={ecritureCours}
            disabled={readOnly}
            onChange={(e) => onEcritureCours(e.target.checked)}
          />
          <span>
            <strong>ECRIRE comme au cours</strong> : ECRIRE reste sur la même ligne, CRLF fait
            passer à la ligne suivante. Décoché : chaque ECRIRE passe à la ligne (comportement des
            exercices créés avant cette option ; leurs sorties attendues en dépendent).
          </span>
        </label>
      )}

      {autorisés.length === 0 && (
        <p className="sub" style={{ marginTop: 10 }}>
          Aucun outil autorisé : l'apprenant ne pourrait rien écrire. Cochez au moins de quoi lire,
          écrire et affecter.
        </p>
      )}
    </section>
  );
}
