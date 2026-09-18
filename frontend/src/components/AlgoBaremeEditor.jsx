/**
 * Saisie du barème déclaratif d'un exercice **algorithmique**.
 *
 * Le pendant de `BaremeEditor` pour les exercices en blocs. L'enseignant y dit
 * ce que l'algorithme doit contenir avec les mots du cours : une variable
 * `moyenne` de type réel, une constante `MAX`, un enregistrement `Etudiant`, une
 * fonction à deux paramètres, une boucle POUR : et non avec ceux du C. Chaque
 * ligne se vérifie sur le document de l'apprenant : sa partie déclarative pour
 * les trois premières familles, son corps pour les deux autres.
 *
 * Comme partout ailleurs, on n'écrit ici que ce qui est exigé, jamais ce que
 * cela vaut : les points se posent à la dernière étape, dans `PointsEditor`.
 */

import { useState } from 'react';

import {
  ALGO_CRITERION_KINDS,
  ALGO_STRUCTURES,
  algoCriterionKind,
  algoFieldsOf,
  blankAlgoCriterion,
  describeAlgoCriterion,
  isSizedType,
} from '../algoBareme';
import { DATA_TYPES, TOOL_GROUPS } from '../algoVocabulary';
import { Button } from './ui';

const cellStyle = { display: 'grid', gap: 4 };
const legendStyle = { fontSize: 11 };

/** Une variable de la partie déclarative : un nom, un type, une taille si tableau. */
function VariableFields({ criterion, update }) {
  const dimensionné = isSizedType(criterion.vtype);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <label style={cellStyle}>
        <span className="sub" style={legendStyle}>De type</span>
        <select
          aria-label="Type de la variable attendue"
          value={criterion.vtype ?? 'entier'}
          onChange={(e) => update({ vtype: e.target.value })}
        >
          {DATA_TYPES.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
        </select>
      </label>
      {dimensionné && (
        <label style={cellStyle}>
          <span className="sub" style={legendStyle}>De taille</span>
          <input
            aria-label="Taille attendue du tableau"
            value={criterion.taille ?? ''}
            placeholder="peu importe"
            style={{ width: 120, fontFamily: 'var(--mono)' }}
            onChange={(e) => update({ taille: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}

/** Une constante : son nom suffit, sa valeur se demande si elle est imposée. */
function ConstanteFields({ criterion, update }) {
  return (
    <label style={cellStyle}>
      <span className="sub" style={legendStyle}>De valeur</span>
      <input
        aria-label="Valeur attendue de la constante"
        value={criterion.valeur ?? ''}
        placeholder="peu importe"
        style={{ width: 160, fontFamily: 'var(--mono)' }}
        onChange={(e) => update({ valeur: e.target.value })}
      />
    </label>
  );
}

/**
 * Un enregistrement. Sa définition est écrite librement par l'apprenant : on ne
 * contrôle donc pas des types champ par champ, mais la présence des champs
 * demandés : ce que l'énoncé exige réellement.
 */
function TypeFields({ criterion, update }) {
  const champs = algoFieldsOf(criterion);
  const écrire = (next) => update({ fields: next });
  return (
    <div style={cellStyle}>
      <span className="sub" style={legendStyle}>Avec les champs</span>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {champs.map((champ, index) => (
          <span key={index} style={{ display: 'inline-flex', gap: 2, alignItems: 'center' }}>
            <input
              aria-label={`Champ ${index + 1} attendu`}
              value={champ ?? ''}
              placeholder="nom"
              style={{ width: 110, fontFamily: 'var(--mono)' }}
              onChange={(e) => écrire(champs.map((c, i) => (i === index ? e.target.value : c)))}
            />
            <button
              type="button"
              className="tableau-retirer"
              aria-label={`Retirer le champ ${index + 1}`}
              title="Retirer ce champ"
              onClick={() => écrire(champs.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </span>
        ))}
        <button type="button" className="tableau-ajouter" onClick={() => écrire([...champs, ''])}>
          + champ
        </button>
      </div>
      {champs.length === 0 && (
        <span className="sub" style={{ fontSize: 11 }}>
          Aucun champ exigé : seul le nom du type sera cherché.
        </span>
      )}
    </div>
  );
}

/** Une fonction : son nom, et le nombre de paramètres s'il est imposé. */
function FonctionFields({ criterion, update }) {
  return (
    <label style={cellStyle}>
      <span className="sub" style={legendStyle}>Nombre de paramètres</span>
      <input
        type="number"
        min="0"
        aria-label="Nombre de paramètres attendu"
        value={criterion.arity ?? ''}
        placeholder="peu importe"
        style={{ width: 140 }}
        onChange={(e) => update({ arity: e.target.value })}
      />
    </label>
  );
}

/**
 * Une structure du corps. On la choisit dans le vocabulaire même de l'éditeur (
 * ce sont les blocs que l'apprenant a sous la main) et l'on dit combien de fois
 * elle doit apparaître : « deux boucles imbriquées » se demande ainsi.
 */
function StructureFields({ criterion, update }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <label style={cellStyle}>
        <span className="sub" style={legendStyle}>Structure</span>
        <select
          aria-label="Structure attendue"
          value={criterion.element ?? 'pour'}
          onChange={(e) => update({ element: e.target.value })}
        >
          {TOOL_GROUPS.filter((group) =>
            ALGO_STRUCTURES.some((s) => s.group === group),
          ).map((group) => (
            <optgroup key={group} label={group}>
              {ALGO_STRUCTURES.filter((s) => s.group === group).map((structure) => (
                <option key={structure.key} value={structure.key}>
                  {structure.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label style={cellStyle}>
        <span className="sub" style={legendStyle}>Au moins</span>
        <input
          type="number"
          min="1"
          aria-label="Nombre d'occurrences attendu"
          value={criterion.min ?? 1}
          style={{ width: 90 }}
          onChange={(e) => update({ min: e.target.value })}
        />
      </label>
    </div>
  );
}

/** Les familles qui portent un nom : la structure attendue, elle, n'en a pas. */
const NAMED = new Set(['algo_variable', 'algo_constante', 'algo_type', 'algo_fonction']);

const PLACEHOLDERS = {
  algo_variable: 'moyenne',
  algo_constante: 'MAX',
  algo_type: 'Etudiant',
  algo_fonction: 'moyenne',
};

export default function AlgoBaremeEditor({ criteria, onCriteriaChange }) {
  const [picking, setPicking] = useState(false);
  const update = (index, patch) =>
    onCriteriaChange(criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const add = (kind) => {
    onCriteriaChange([...criteria, blankAlgoCriterion(kind)]);
    setPicking(false);
  };

  return (
    <section className="bareme-editeur">
      <header className="tests-tete">
        <div>
          <strong className="tests-tete-titre">Ce que l'algorithme doit contenir</strong>
          <p className="sub" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {criteria.length === 0
              ? 'Rien d’exigé pour l’instant : seuls les tests noteront la copie.'
              : `${criteria.length} exigence${criteria.length > 1 ? 's' : ''} lue${
                  criteria.length > 1 ? 's' : ''
                } sur l’algorithme rendu.`}
          </p>
        </div>
        {!picking && (
          <Button
            variant="secondary"
            size="small"
            style={{ marginLeft: 'auto' }}
            onClick={() => setPicking(true)}
          >
            + Ajouter une exigence
          </Button>
        )}
      </header>

      {/* Le même choix par cartes qu'aux écrans précédents : on reconnaît la
          forme attendue sur son exemple avant d'en lire le nom. */}
      {picking && (
        <div className="tests-choix">
          <strong style={{ fontSize: 13 }}>Qu’est-ce que l’algorithme doit contenir ?</strong>
          <div className="type-picker-grid" style={{ margin: '10px 0' }}>
            {ALGO_CRITERION_KINDS.map((kind) => (
              <button
                key={kind.key}
                type="button"
                className="type-card"
                onClick={() => add(kind.key)}
              >
                <span className="type-card-code">{kind.sample}</span>
                <span className="type-card-titre">{kind.label}</span>
                <span className="type-card-tagline">{kind.hint}</span>
              </button>
            ))}
          </div>
          <Button variant="secondary" size="small" onClick={() => setPicking(false)}>
            Annuler
          </Button>
        </div>
      )}

      {criteria.map((criterion, index) => (
        <article key={criterion.id} className="bareme-critere">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={cellStyle}>
              <span className="sub" style={legendStyle}>Exigence</span>
              <select
                aria-label="Nature de l'exigence"
                value={criterion.kind}
                onChange={(e) =>
                  update(index, {
                    ...blankAlgoCriterion(e.target.value),
                    id: criterion.id,
                    points: criterion.points,
                  })
                }
              >
                {ALGO_CRITERION_KINDS.map((kind) => (
                  <option key={kind.key} value={kind.key}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
            {NAMED.has(criterion.kind) && (
              <label style={cellStyle}>
                <span className="sub" style={legendStyle}>Nommée</span>
                <input
                  aria-label="Nom attendu"
                  value={criterion.name ?? ''}
                  placeholder={PLACEHOLDERS[criterion.kind]}
                  style={{ width: 160, fontFamily: 'var(--mono)' }}
                  onChange={(e) => update(index, { name: e.target.value })}
                />
              </label>
            )}
            <Button
              variant="secondary"
              size="small"
              style={{ marginLeft: 'auto' }}
              onClick={() => onCriteriaChange(criteria.filter((_, i) => i !== index))}
            >
              Retirer
            </Button>
          </div>

          {criterion.kind === 'algo_variable' && (
            <VariableFields criterion={criterion} update={(patch) => update(index, patch)} />
          )}
          {criterion.kind === 'algo_constante' && (
            <ConstanteFields criterion={criterion} update={(patch) => update(index, patch)} />
          )}
          {criterion.kind === 'algo_type' && (
            <TypeFields criterion={criterion} update={(patch) => update(index, patch)} />
          )}
          {criterion.kind === 'algo_fonction' && (
            <FonctionFields criterion={criterion} update={(patch) => update(index, patch)} />
          )}
          {criterion.kind === 'algo_structure' && (
            <StructureFields criterion={criterion} update={(patch) => update(index, patch)} />
          )}

          {/* L'exigence telle qu'elle sera cherchée dans la copie : c'est la
              seule preuve que les champs ci-dessus disent ce qu'on croit. */}
          <p className="bareme-critere-code">{describeAlgoCriterion(criterion)}</p>
          {NAMED.has(criterion.kind) && !criterion.name?.trim() && (
            <p className="sub" style={{ margin: 0, fontSize: 12 }}>
              Donnez un nom : sans lui, l’exigence ne peut pas être cherchée.
            </p>
          )}
          <span className="sub" style={{ fontSize: 11 }}>
            {algoCriterionKind(criterion.kind).hint}
          </span>
        </article>
      ))}
    </section>
  );
}
