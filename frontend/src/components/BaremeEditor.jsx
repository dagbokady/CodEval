/**
 * Saisie du barème d'un exercice de code.
 *
 * L'enseignant déclare d'abord **ce que la copie doit contenir** (une variable,
 * une fonction, une structure, avec leurs types) puis **ce que le programme doit
 * produire**, sous forme de tests dont les entrées et la sortie sont typées.
 * Chaque champ de valeur connaît son type : un entier se saisit dans un champ
 * numérique, un booléen dans une liste, un tableau dans un champ de nombres
 * séparés par des espaces. Aucune zone de texte à mettre en forme soi-même.
 *
 * Ce qu'on écrit ici, c'est ce que la copie doit contenir : jamais ce que cela
 * vaut : les points de chaque ligne se posent à la dernière étape, dans
 * `PointsEditor`, quand tout le barème est connu.
 */

import { useState } from 'react';

import {
  ARRAY_TYPES,
  CRITERION_KINDS,
  DECLARATION_LANGUAGES,
  PARAM_TYPES,
  RETURN_TYPES,
  arrayOf,
  blankCriterion,
  criterionKind,
  describeCriterion,
  elementOf,
  expectedTypeOf,
  fieldsOf,
  inputTypesOf,
  isArrayType,
  paramsOf,
  valueType,
} from '../bareme';
import AlgoBaremeEditor from './AlgoBaremeEditor';
import { Button } from './ui';

const cellStyle = { display: 'grid', gap: 4 };
const legendStyle = { fontSize: 11 };

/**
 * Un tableau se saisit comme un tableau : une case par élément, numérotée de 0
 * comme en C, qu'on ajoute et qu'on retire au clic. La liste de nombres séparés
 * par des espaces qu'on tapait avant ne montrait ni la taille ni les indices :
 * or c'est exactement ce que l'exercice demande de compter.
 * La valeur reste stockée telle que le correcteur l'attend : les éléments
 * séparés par des espaces.
 */
function TableauInput({ type, value, onChange, label }) {
  const texte = String(value ?? '').trim();
  const cases = texte === '' ? [] : texte.split(/\s+/);
  const écrire = (next) => onChange(next.join(' '));
  // Les cases suivent le type des éléments : un tableau de caractères se saisit
  // lettre par lettre, un tableau de décimaux au pas libre.
  const élément = valueType(elementOf(type));
  const texteLibre = élément.input === 'text';
  const step = élément.step ?? '1';
  const vide = texteLibre ? 'a' : '0';

  return (
    <div className="tableau-saisie" role="group" aria-label={label}>
      <div className="tableau-cases">
        {cases.map((valeur, index) => (
          <div className="tableau-case" key={index}>
            <span className="tableau-index">{index}</span>
            <input
              type={texteLibre ? 'text' : 'number'}
              step={texteLibre ? undefined : step}
              maxLength={texteLibre ? élément.maxLength : undefined}
              aria-label={`${label} : case ${index}`}
              value={valeur}
              onChange={(e) =>
                écrire(cases.map((v, i) => (i === index ? e.target.value : v)))
              }
            />
            <button
              type="button"
              className="tableau-retirer"
              aria-label={`Retirer la case ${index}`}
              title="Retirer cette case"
              onClick={() => écrire(cases.filter((_, i) => i !== index))}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          className="tableau-ajouter"
          onClick={() => écrire([...cases, vide])}
        >
          + case
        </button>
      </div>
      <span className="sub tableau-legende">
        {cases.length === 0
          ? `Tableau vide : ajoutez une case (${élément.label.toLowerCase()}).`
          : `${cases.length} ${élément.label.toLowerCase()}${cases.length > 1 ? 's' : ''} · le programme reçoit ${'{'}${cases.join(', ')}${'}'} et n = ${cases.length}`}
      </span>
    </div>
  );
}

/** Un champ de saisie accordé au type de la valeur attendue. */
function ValueInput({ type, value, onChange, label, placeholder }) {
  const kind = valueType(type);
  const common = {
    'aria-label': label,
    value: value ?? '',
    onChange: (e) => onChange(e.target.value),
    style: { width: '100%', minWidth: 0 },
  };

  if (kind.input === 'none') {
    return <span className="sub">-</span>;
  }
  if (kind.input === 'list') {
    return <TableauInput type={type} value={value} onChange={onChange} label={label} />;
  }
  // Deux valeurs possibles, deux pastilles : plus rapide à lire et à cliquer
  // qu'une liste déroulante qui cache la moitié du choix.
  if (kind.input === 'bool') {
    const vrai = String(value ?? '1') !== '0';
    return (
      <div className="test-cibles" role="group" aria-label={label}>
        <button
          type="button"
          className={`test-cible ${vrai ? 'active' : ''}`.trim()}
          onClick={() => onChange('1')}
        >
          vrai (1)
        </button>
        <button
          type="button"
          className={`test-cible ${vrai ? '' : 'active'}`.trim()}
          onClick={() => onChange('0')}
        >
          faux (0)
        </button>
      </div>
    );
  }
  if (kind.input === 'number') {
    return (
      <input
        {...common}
        type="number"
        step={kind.step ?? '1'}
        placeholder={placeholder ?? kind.example}
      />
    );
  }
  if (type === 'char') {
    return (
      <input
        {...common}
        type="text"
        maxLength={1}
        className="case-char"
        placeholder={placeholder ?? kind.example}
        style={{ ...common.style, width: 52 }}
      />
    );
  }
  return (
    <input
      {...common}
      type="text"
      maxLength={kind.maxLength}
      placeholder={placeholder ?? kind.example}
    />
  );
}

/**
 * Sélecteur de type, partagé par les critères et les tests.
 *
 * « Tableau » est un choix à part entière : la liste ne répète plus une entrée
 * par combinaison (tableau d'entiers, de décimaux, de caractères…). Choisir
 * « Tableau » fait apparaître le type de ses éléments, à côté : c'est la
 * question qu'on se pose ensuite, et la seule qui reste.
 */
function TypeSelect({ value, onChange, label, types = PARAM_TYPES, disabled = false }) {
  const tableau = isArrayType(value);
  const simples = types.filter((type) => type.input !== 'list');
  const éléments = ARRAY_TYPES.filter((type) => types.some((t) => t.key === type.key));
  const tableauPossible = éléments.length > 0;

  return (
    <span className="type-select">
      <select
        aria-label={label}
        value={tableau ? 'array' : (value ?? 'int')}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === 'array' ? arrayOf('int') : e.target.value)
        }
      >
        {simples.map((type) => (
          <option key={type.key} value={type.key}>
            {type.label}
          </option>
        ))}
        {tableauPossible && <option value="array">Tableau</option>}
      </select>
      {tableau && (
        <select
          aria-label={`${label} : type des éléments du tableau`}
          value={elementOf(value)}
          disabled={disabled}
          onChange={(e) => onChange(arrayOf(e.target.value))}
        >
          {éléments.map((type) => (
            <option key={type.key} value={elementOf(type.key)}>
              {type.label.replace(/^Tableau /, '')}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

/**
 * Les valeurs d'entrée d'un test.
 *
 * Un test qui appelle une fonction tient ses types du critère visé : l'enseignant
 * n'entre que des valeurs. Un test du programme entier déclare lui-même le type
 * de chaque valeur envoyée sur l'entrée standard.
 */
export function TestInputs({ test, criterion, onChange }) {
  const entries = inputTypesOf(test, criterion);
  const args = Array.isArray(test.args) ? test.args : [];

  const setArg = (index, value) => {
    const next = [...args];
    while (next.length <= index) next.push('');
    next[index] = value;
    onChange({ args: next });
  };

  const setType = (index, type) => {
    const types = entries.map((e, i) => (i === index ? type : e.type));
    onChange({ input_types: types });
  };

  const addEntry = () =>
    onChange({ input_types: [...entries.map((e) => e.type), 'int'], args: [...args, ''] });

  const removeEntry = (index) =>
    onChange({
      input_types: entries.filter((_, i) => i !== index).map((e) => e.type),
      args: args.filter((_, i) => i !== index),
    });

  if (criterion && entries.length === 0) {
    return <span className="sub">aucun argument</span>;
  }

  return (
    <div className="test-valeurs">
      {entries.map((entry, index) => (
        // Un tableau prend toute la largeur : ses cases ne tiennent pas dans la
        // colonne étroite qui suffit à un entier.
        <div
          key={index}
          className={`test-valeur ${
            valueType(entry.type).input === 'list' || !entry.locked ? 'test-valeur--large' : ''
          }`.trim()}
        >
          <label style={{ ...cellStyle, flex: 1 }}>
            <span className="sub" style={legendStyle}>
              {entry.locked
                ? `${entry.name} · ${valueType(entry.type).label.toLowerCase()}`
                : `valeur ${index + 1}`}
            </span>
            <ValueInput
              type={entry.type}
              value={args[index]}
              label={`Valeur de ${entry.name}`}
              onChange={(value) => setArg(index, value)}
            />
          </label>
          {!entry.locked && (
            <>
              <TypeSelect
                value={entry.type}
                label={`Type de la valeur ${index + 1}`}
                onChange={(type) => setType(index, type)}
              />
              <Button variant="secondary" size="small" onClick={() => removeEntry(index)}>
                −
              </Button>
            </>
          )}
        </div>
      ))}
      {!criterion && (
        <div className="test-valeur--large">
          <Button variant="secondary" size="small" onClick={addEntry}>
            + Valeur d'entrée
          </Button>
        </div>
      )}

    </div>
  );
}

/**
 * Le résultat attendu, saisi dans son type : celui du critère visé, ou le sien.
 *
 * Quand la copie est jugée sur ce qu'elle affiche, la saisie prend la forme d'un
 * écran : fond sombre, police à chasse fixe, plusieurs lignes. L'enseignant voit
 * ce que l'apprenant devra voir, au lieu de deviner ce qu'un champ d'une ligne
 * contient vraiment.
 */
export function TestExpected({ test, criterion, onChange }) {
  const type = expectedTypeOf(test, criterion);
  const kind = valueType(type);
  const ecran = kind.input === 'none' || (!criterion && type === 'string');

  if (ecran) {
    return (
      <div className="ecran-attendu-bloc">
        {!criterion && (
          <TypeSelect
            value={type}
            label="Type du résultat attendu"
            types={RETURN_TYPES}
            onChange={(next) => onChange({ expected_type: next })}
          />
        )}
        <div className="ecran-attendu">
          <span className="ecran-attendu-barre">écran</span>
          <textarea
            aria-label="Ce qui doit être affiché"
            rows={2}
            spellCheck={false}
            placeholder="7"
            value={test.expected_stdout ?? ''}
            onChange={(e) => onChange({ expected_stdout: e.target.value })}
          />
        </div>
        <span className="sub" style={{ fontSize: 11 }}>
          Tapez le texte exactement comme il doit sortir, retours à la ligne compris.
        </span>
      </div>
    );
  }

  return (
    <div style={cellStyle}>
      {criterion ? (
        <span className="sub" style={legendStyle}>
          retour · {kind.label.toLowerCase()}
        </span>
      ) : (
        <TypeSelect
          value={type}
          label="Type du résultat attendu"
          types={RETURN_TYPES}
          onChange={(next) => onChange({ expected_type: next })}
        />
      )}
      <ValueInput
        type={type}
        value={test.expected_stdout}
        label="Résultat attendu"
        onChange={(value) => onChange({ expected_stdout: value })}
      />
    </div>
  );
}

/** Le corps d'un critère « fonction attendue » : paramètres et type de retour. */
function FunctionFields({ criterion, update }) {
  const params = paramsOf(criterion);
  const setParams = (next) => update({ params: next });
  return (
    <>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={cellStyle}>
          <span className="sub" style={legendStyle}>Retourne</span>
          <TypeSelect
            value={criterion.returns}
            label="Type de retour"
            types={RETURN_TYPES}
            onChange={(returns) => update({ returns })}
          />
        </label>
        <Button
          variant="secondary"
          size="small"
          onClick={() => setParams([...params, { name: `a${params.length + 1}`, type: 'int' }])}
        >
          + Paramètre
        </Button>
      </div>
      {params.map((param, index) => (
        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="sub" style={{ ...legendStyle, width: 84 }}>Paramètre {index + 1}</span>
          <input
            aria-label={`Nom du paramètre ${index + 1}`}
            value={param.name ?? ''}
            placeholder="n"
            style={{ width: 120, fontFamily: 'var(--mono)' }}
            onChange={(e) =>
              setParams(params.map((p, i) => (i === index ? { ...p, name: e.target.value } : p)))
            }
          />
          <TypeSelect
            value={param.type}
            label={`Type du paramètre ${index + 1}`}
            onChange={(type) =>
              setParams(params.map((p, i) => (i === index ? { ...p, type } : p)))
            }
          />
          <Button
            variant="secondary"
            size="small"
            onClick={() => setParams(params.filter((_, i) => i !== index))}
          >
            Retirer
          </Button>
        </div>
      ))}
    </>
  );
}

/** Le corps d'un critère « structure attendue » : la liste de ses champs. */
function StructFields({ criterion, update }) {
  const fields = fieldsOf(criterion);
  const setFields = (next) => update({ fields: next });
  return (
    <>
      <Button
        variant="secondary"
        size="small"
        style={{ justifySelf: 'start' }}
        onClick={() => setFields([...fields, { name: '', type: 'int' }])}
      >
        + Champ
      </Button>
      {fields.map((field, index) => (
        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="sub" style={{ ...legendStyle, width: 84 }}>Champ {index + 1}</span>
          <input
            aria-label={`Nom du champ ${index + 1}`}
            value={field.name ?? ''}
            placeholder="x"
            style={{ width: 120, fontFamily: 'var(--mono)' }}
            onChange={(e) =>
              setFields(fields.map((f, i) => (i === index ? { ...f, name: e.target.value } : f)))
            }
          />
          <TypeSelect
            value={field.type}
            label={`Type du champ ${index + 1}`}
            onChange={(type) => setFields(fields.map((f, i) => (i === index ? { ...f, type } : f)))}
          />
          <Button
            variant="secondary"
            size="small"
            onClick={() => setFields(fields.filter((_, i) => i !== index))}
          >
            Retirer
          </Button>
        </div>
      ))}
    </>
  );
}

/** Le corps d'un critère « variable attendue » : son type et sa portée. */
function VariableFields({ criterion, update }) {
  const local = criterion.scope === 'local';
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <label style={cellStyle}>
        <span className="sub" style={legendStyle}>De type</span>
        <TypeSelect
          value={criterion.vtype}
          label="Type de la variable"
          onChange={(vtype) => update({ vtype })}
        />
      </label>
      <label style={cellStyle}>
        <span className="sub" style={legendStyle}>Déclarée</span>
        <select
          aria-label="Portée de la variable"
          value={criterion.scope ?? 'global'}
          onChange={(e) => update({ scope: e.target.value })}
        >
          <option value="global">hors de toute fonction (globale)</option>
          <option value="local">dans une fonction</option>
        </select>
      </label>
      {local && (
        <label style={cellStyle}>
          <span className="sub" style={legendStyle}>Dans la fonction</span>
          <input
            aria-label="Fonction où la variable est déclarée"
            value={criterion.in_function ?? ''}
            placeholder="main"
            style={{ width: 120, fontFamily: 'var(--mono)' }}
            onChange={(e) => update({ in_function: e.target.value })}
          />
        </label>
      )}
    </div>
  );
}

/**
 * La liste des déclarations attendues. Les tests d'exécution, second volet du
 * barème, se saisissent dans le tableau qui suit cette section.
 *
 * Un exercice algorithmique passe la main : ses exigences se disent dans les
 * mots du cours (une variable de type entier, une boucle POUR) et non dans
 * ceux du C, et c'est `AlgoBaremeEditor` qui les recueille.
 */
export default function BaremeEditor({ exercise, criteria, onCriteriaChange }) {
  if (exercise.kind === 'algo') {
    return <AlgoBaremeEditor criteria={criteria} onCriteriaChange={onCriteriaChange} />;
  }
  return <CodeBaremeEditor exercise={exercise} criteria={criteria} onCriteriaChange={onCriteriaChange} />;
}

function CodeBaremeEditor({ exercise, criteria, onCriteriaChange }) {
  const supported = DECLARATION_LANGUAGES.has(exercise.language);
  const [picking, setPicking] = useState(false);
  const update = (index, patch) =>
    onCriteriaChange(criteria.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  const add = (kind) => {
    onCriteriaChange([...criteria, blankCriterion(kind)]);
    setPicking(false);
  };

  return (
    <section className="bareme-editeur">
      <header className="tests-tete">
        <div>
          <strong className="tests-tete-titre">Ce que le code doit contenir</strong>
          <p className="sub" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {criteria.length === 0
              ? 'Rien d’exigé pour l’instant : seuls les tests noteront la copie.'
              : `${criteria.length} déclaration${criteria.length > 1 ? 's' : ''} contrôlée${
                  criteria.length > 1 ? 's' : ''
                } à la compilation.`}
          </p>
        </div>
        {!picking && (
          <Button
            variant="secondary"
            size="small"
            style={{ marginLeft: 'auto' }}
            onClick={() => setPicking(true)}
          >
            + Ajouter une déclaration
          </Button>
        )}
      </header>

      {/* Le même choix par cartes qu'au premier écran : on reconnaît la forme
          attendue sur l'exemple de code avant d'en lire le nom. */}
      {picking && (
        <div className="tests-choix">
          <strong style={{ fontSize: 13 }}>Qu’est-ce que la copie doit déclarer ?</strong>
          <div className="type-picker-grid" style={{ margin: '10px 0' }}>
            {CRITERION_KINDS.map((kind) => (
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

      {!supported && criteria.length > 0 && (
        <p className="sub" style={{ margin: 0 }}>
          Les déclarations ne se vérifient qu'en C et en C++ : dans ce langage, ces critères
          vous seront signalés pour une correction à la main.
        </p>
      )}

      {criteria.map((criterion, index) => (
        <article key={criterion.id} className="bareme-critere">
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={cellStyle}>
              <span className="sub" style={legendStyle}>Critère</span>
              <select
                aria-label="Nature du critère"
                value={criterion.kind}
                onChange={(e) =>
                  update(index, {
                    ...blankCriterion(e.target.value),
                    id: criterion.id,
                    points: criterion.points,
                    name: criterion.name,
                  })
                }
              >
                {CRITERION_KINDS.map((kind) => (
                  <option key={kind.key} value={kind.key}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={cellStyle}>
              <span className="sub" style={legendStyle}>Nommée</span>
              <input
                aria-label="Nom attendu"
                value={criterion.name ?? ''}
                placeholder={criterion.kind === 'struct' ? 'Point' : 'total'}
                style={{ width: 160, fontFamily: 'var(--mono)' }}
                onChange={(e) => update(index, { name: e.target.value })}
              />
            </label>
            <Button
              variant="secondary"
              size="small"
              style={{ marginLeft: 'auto' }}
              onClick={() => onCriteriaChange(criteria.filter((_, i) => i !== index))}
            >
              Retirer
            </Button>
          </div>

          {criterion.kind === 'variable' && (
            <VariableFields criterion={criterion} update={(patch) => update(index, patch)} />
          )}
          {criterion.kind === 'function' && (
            <FunctionFields criterion={criterion} update={(patch) => update(index, patch)} />
          )}
          {criterion.kind === 'struct' && (
            <StructFields criterion={criterion} update={(patch) => update(index, patch)} />
          )}

          {/* La déclaration telle qu'elle sera cherchée dans la copie : c'est la
              seule preuve que les champs ci-dessus disent ce qu'on croit. */}
          <p className="bareme-critere-code">
            {describeCriterion(criterion)}
            {criterion.kind === 'variable' && criterion.scope === 'local' &&
              ', cherchée dans le texte du programme'}
          </p>
          {criterion.kind === 'function' && !criterion.name?.trim() && (
            <p className="sub" style={{ margin: 0, fontSize: 12 }}>
              Nommez la fonction pour que les tests puissent l'appeler.
            </p>
          )}
          <span className="sub" style={{ fontSize: 11 }}>{criterionKind(criterion.kind).hint}</span>
        </article>
      ))}
    </section>
  );
}
