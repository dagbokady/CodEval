import { useMemo, useState } from 'react';
import {
  DECLARATION_ELEMENTS,
  DECLARATION_SECTIONS,
  DEFAULT_ELEMENTS,
  ELEMENTS,
  SCALAR_TYPES,
  arrayElementType,
  emptyAlgorithm,
  parseAlgorithm,
  serializeAlgorithm,
  structDefinition,
  structFields,
} from '../algoVocabulary';

/**
 * Éditeur d'algorithme en blocs.
 *
 * L'algorithme a toujours la forme du cours (ALGORITHME, CONSTANTES, TYPES,
 * VARIABLES, puis le corps entre DEBUT et FIN) et cette forme est posée par
 * l'éditeur : elle n'est ni à composer ni à défaire. Chaque élément s'écrit
 * comme sur le polycopié : les mots-clés en capitales sont fixes, le reste est à
 * remplir.
 * La production est un document JSON, traduit en Python par le serveur au
 * moment de la correction.
 *
 * Les morceaux de l'éditeur sont des fonctions de rendu, pas des composants :
 * un composant déclaré dans le rendu change d'identité à chaque frappe, React
 * démonte alors le champ en cours de saisie et le curseur est perdu.
 */

const CONTAINERS = {
  si: ['alors', 'sinon'],
  pour: ['corps'],
  tantque: ['corps'],
  repeter: ['corps'],
  fonction: ['corps'],
};

const ENDINGS = {
  si: 'FINSI',
  pour: 'FINPOUR',
  tantque: 'FINTANTQUE',
  fonction: 'FINFONCTION',
};

const RUBRIQUES = { constantes: 'CONSTANTES', types: 'TYPES', variables: 'VARIABLES' };

/** Renvoie le tableau d'accueil désigné par un chemin (suite de {index, key}). */
function containerAt(tree, path) {
  let list = tree;
  for (const step of path) {
    list = list?.[step.index]?.[step.key];
  }
  // Chemin périmé (bloc supprimé, autre exercice) : on retombe sur la racine.
  return Array.isArray(list) ? list : tree;
}

function update(tree, path, mutate) {
  const clone = structuredClone(tree);
  mutate(containerAt(clone, path), clone);
  return clone;
}

const samePath = (a, b) =>
  a.length === b.length && a.every((step, i) => step.index === b[i].index && step.key === b[i].key);

const Kw = ({ children }) => <b className="kw">{children}</b>;
/** Les mots de liaison du POUR (de, à, par pas de) : écrits, mais pas en capitales. */
const Mot = ({ children }) => <span className="mot">{children}</span>;

export default function AlgoEditor({ value, onChange, allowed, readOnly = false }) {
  const doc = useMemo(() => parseAlgorithm(value), [value]);
  const tree = doc.corps;
  const [target, setTarget] = useState({ path: [], index: null });
  const vocabulary = allowed?.length ? allowed : DEFAULT_ELEMENTS;
  const permits = (key) => vocabulary.includes(key);

  const write = (patch) => onChange(serializeAlgorithm({ ...emptyAlgorithm(), ...doc, ...patch }));
  const writeCorps = (corps) => write({ corps });

  const groups = useMemo(() => {
    const byGroup = new Map();
    vocabulary.forEach((key) => {
      const element = ELEMENTS[key];
      if (!element?.make) return;
      if (!byGroup.has(element.group)) byGroup.set(element.group, []);
      byGroup.get(element.group).push({ key, ...element });
    });
    return [...byGroup.entries()];
  }, [vocabulary]);

  function insert(key) {
    if (readOnly) return;
    const node = ELEMENTS[key].make();
    writeCorps(
      update(tree, target.path, (list) => {
        const at = target.index === null ? list.length : target.index;
        list.splice(at, 0, node);
      }),
    );
    setTarget((current) => ({
      ...current,
      index: current.index === null ? null : current.index + 1,
    }));
  }

  const edit = (path, index, patch) =>
    writeCorps(
      update(tree, path, (list) => {
        list[index] = { ...list[index], ...patch };
      }),
    );

  const remove = (path, index) =>
    writeCorps(update(tree, path, (list) => list.splice(index, 1)));

  const move = (path, index, delta) =>
    writeCorps(
      update(tree, path, (list) => {
        const next = index + delta;
        if (next < 0 || next >= list.length) return;
        [list[index], list[next]] = [list[next], list[index]];
      }),
    );

  /* ----- Champs à remplir (en italique) ----- */

  function field(fieldValue, onValue, placeholder, label = placeholder, tone = '') {
    const text = fieldValue ?? '';
    // Le champ épouse ce qu'on y écrit ; vide, il laisse lire son indication.
    const size = Math.max(text.length || placeholder.length, 1) + 1;
    return (
      <input
        className={`algo-field ${text ? 'rempli' : ''} ${tone}`.trim()}
        style={{ width: `${size}ch` }}
        value={text}
        placeholder={placeholder}
        aria-label={label}
        disabled={readOnly}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onValue(event.target.value)}
      />
    );
  }

  /** Un commentaire de déclaration, entre les délimiteurs du cours. */
  function comment(line, set) {
    if (readOnly && !String(line.commentaire ?? '').trim()) return null;
    return (
      <span className="algo-comment">
        {'/*'}
        {field(line.commentaire, (v) => set({ commentaire: v }), 'commentaire')}
        {'*/'}
      </span>
    );
  }

  function actions(onUp, onDown, onRemove) {
    if (readOnly) return null;
    return (
      <span className="algo-actions">
        {onUp && (
          <button type="button" onClick={onUp} title="Monter">
            ↑
          </button>
        )}
        {onDown && (
          <button type="button" onClick={onDown} title="Descendre">
            ↓
          </button>
        )}
        <button type="button" onClick={onRemove} title="Supprimer">
          ×
        </button>
      </span>
    );
  }

  /* ----- Partie déclarative ----- */

  const addDeclaration = (elementKey) => {
    const element = DECLARATION_ELEMENTS[elementKey];
    write({ [element.section]: [...(doc[element.section] ?? []), element.make()] });
  };

  const editDeclaration = (section, index, patch) =>
    write({
      [section]: doc[section].map((line, i) => (i === index ? { ...line, ...patch } : line)),
    });

  const removeDeclaration = (section, index) =>
    write({ [section]: doc[section].filter((_, i) => i !== index) });

  function structure(line, index) {
    const champs = structFields(line);
    const set = (patch) => editDeclaration('types', index, patch);
    const setChamps = (next) => set({ champs: next, definition: structDefinition(next) });
    const setChamp = (i, patch) => setChamps(champs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    return (
      <div className="algo-decl-ligne algo-structure" key={index}>
        <div className="algo-line-text">
          {field(line.nom, (v) => set({ nom: v }), 'NomDeType')}
          <span className="op">=</span>
          <Kw>STRUCTURE</Kw>
          {comment(line, set)}
          {actions(null, null, () => removeDeclaration('types', index))}
        </div>
        <div className="algo-structure-champs">
          {champs.map((champ, i) => (
            <div className="algo-line-text" key={i}>
              {field(champ.nom, (v) => setChamp(i, { nom: v }), `champ${i + 1}`)}
              <span className="algo-colle">
                <Kw>:</Kw>
                {field(champ.type, (v) => setChamp(i, { type: v.toUpperCase() }), 'TYPE', 'Type du champ', 'kw')}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  className="algo-mini"
                  onClick={() => setChamps(champs.filter((_, j) => j !== i))}
                  title="Retirer ce champ"
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              className="algo-mini algo-mini-add"
              onClick={() => setChamps([...champs, { nom: '', type: '' }])}
            >
              + champ
            </button>
          )}
        </div>
        <div className="algo-line-text">
          <Kw>FINSTRUCTURE</Kw>
        </div>
      </div>
    );
  }

  /** Le type d'une variable : ENTIER, TABLEAU[1..MAX] DE REEL, ^Type. */
  function variableType(line, set) {
    const elements = arrayElementType(line.type);
    const base = elements ? 'tableau' : (line.type ?? 'entier');
    const choose = (value) => {
      if (value === 'tableau') set({ type: `tableau_${elements ?? 'entier'}`, debut: line.debut ?? '1' });
      else set({ type: value });
    };
    return (
      <span className="algo-colle">
        <Kw>:</Kw>
        <select
          className="algo-field algo-select kw"
          aria-label="Type de la variable"
          value={base}
          disabled={readOnly}
          onChange={(e) => choose(e.target.value)}
        >
          {SCALAR_TYPES.map((type) => (
            <option key={type.key} value={type.key}>
              {type.label}
            </option>
          ))}
          <option value="tableau">TABLEAU</option>
          <option value="pointeur">^ (pointeur)</option>
        </select>
        {elements && (
          <>
            <Kw>[</Kw>
            {field(line.debut ?? '1', (v) => set({ debut: v }), '1', 'Premier indice')}
            <Kw>..</Kw>
            {field(line.taille, (v) => set({ taille: v }), 'MAX', 'Dernier indice')}
            <Kw>]</Kw>
            <Kw>&nbsp;DE&nbsp;</Kw>
            <select
              className="algo-field algo-select kw"
              aria-label="Type des cases du tableau"
              value={elements}
              disabled={readOnly}
              onChange={(e) => set({ type: `tableau_${e.target.value}` })}
            >
              {SCALAR_TYPES.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
          </>
        )}
        {base === 'pointeur' && field(line.cible, (v) => set({ cible: v }), 'NomDeType')}
      </span>
    );
  }

  function declarationLine(section, line, index) {
    if (section === 'types') return structure(line, index);
    const set = (patch) => editDeclaration(section, index, patch);
    return (
      <div className="algo-decl-ligne" key={index}>
        <div className="algo-line-text">
          {section === 'constantes' && (
            <>
              {field(line.nom, (v) => set({ nom: v }), 'NOM')}
              <span className="op">=</span>
              {field(line.valeur, (v) => set({ valeur: v }), 'valeur')}
            </>
          )}
          {section === 'variables' && (
            <>
              {field(line.nom, (v) => set({ nom: v }), 'nom')}
              {variableType(line, set)}
            </>
          )}
          {comment(line, set)}
          {actions(null, null, () => removeDeclaration(section, index))}
        </div>
      </div>
    );
  }

  /* ----- Corps ----- */

  function slot(path, index, label) {
    // Une copie rendue se relit : il n'y a plus d'emplacement à proposer.
    if (readOnly) return null;
    const active = samePath(path, target.path) && target.index === index;
    return (
      <button
        type="button"
        className={`algo-slot ${active ? 'active' : ''}`.trim()}
        disabled={readOnly}
        onClick={() => setTarget({ path, index })}
      >
        {active ? 'Choisissez un élément dans la palette' : label}
      </button>
    );
  }

  function header(node, set) {
    switch (node.type) {
      case 'lire':
        return (
          <span className="algo-colle">
            <Kw>LIRE</Kw>(
            {field(node.cible, (v) => set({ cible: v }), 'variable')})
          </span>
        );
      case 'ecrire':
        return (
          <span className="algo-colle">
            <Kw>ECRIRE</Kw>(
            {field(node.expression, (v) => set({ expression: v }), 'expression')})
          </span>
        );
      case 'variable':
        return (
          <>
            {field(node.nom, (v) => set({ nom: v }), 'variable')}
            <span className="op">←</span>
            {field(node.valeur, (v) => set({ valeur: v }), 'valeur')}
          </>
        );
      case 'tableau':
        return (
          <>
            <Kw>TABLEAU</Kw>
            {field(node.nom, (v) => set({ nom: v }), 'nom')}
            <Kw>DE TAILLE</Kw>
            {field(node.taille, (v) => set({ taille: v }), 'taille')}
          </>
        );
      case 'affectation':
        return (
          <>
            {field(node.cible, (v) => set({ cible: v }), 'variable')}
            <span className="op">←</span>
            {field(node.expression, (v) => set({ expression: v }), 'expression')}
          </>
        );
      case 'retour':
        return (
          <span className="algo-colle">
            <Kw>RETOURNE</Kw>(
            {field(node.expression, (v) => set({ expression: v }), 'expression')})
          </span>
        );
      case 'si':
        return (
          <>
            <Kw>SI</Kw>
            {field(node.condition, (v) => set({ condition: v }), 'condition')}
            <Kw>ALORS</Kw>
          </>
        );
      case 'pour':
        return (
          <>
            <Kw>POUR</Kw>
            {field(node.variable, (v) => set({ variable: v }), 'i')}
            <Mot>de</Mot>
            {field(node.debut, (v) => set({ debut: v }), 'début')}
            <Mot>à</Mot>
            {field(node.fin, (v) => set({ fin: v }), 'fin')}
            <Mot>par pas de</Mot>
            {field(node.pas ?? '1', (v) => set({ pas: v }), 'pas')}
          </>
        );
      case 'tantque':
        return (
          <>
            <Kw>TANTQUE</Kw>
            {field(node.condition, (v) => set({ condition: v }), 'condition')}
            <Kw>FAIRE</Kw>
          </>
        );
      case 'repeter':
        return <Kw>REPETER</Kw>;
      case 'fonction':
        return (
          <>
            <Kw>FONCTION</Kw>
            {field(node.nom, (v) => set({ nom: v }), 'NomDeFonction')}(
            {field(
              node.parametresTexte ?? (node.parametres ?? []).join(', '),
              (v) =>
                set({
                  parametresTexte: v,
                  parametres: v.split(',').map((p) => p.trim()).filter(Boolean),
                }),
              'paramètres',
            )}
            )
            <span className="algo-colle">
              <Kw>:</Kw>
              {field(node.typeRetour, (v) => set({ typeRetour: v.toUpperCase() }), 'TYPE', 'Type du résultat', 'kw')}
            </span>
          </>
        );
      default:
        return null;
    }
  }

  function block(node, path, index, siblings) {
    const set = (patch) => edit(path, index, patch);
    const childPath = (key) => [...path, { index, key }];
    const containers = CONTAINERS[node.type] ?? [];

    const children = (key) => (
      <div className="algo-children">
        {(node[key] ?? []).map((child, childIndex, list) =>
          block(child, childPath(key), childIndex, list.length),
        )}
        {slot(childPath(key), null, '+ ici')}
      </div>
    );

    return (
      <div className={`algo-block algo-${node.type}`} key={index}>
        <div className="algo-line">
          <div className="algo-line-text">{header(node, set)}</div>
          {actions(
            index > 0 ? () => move(path, index, -1) : null,
            index < siblings - 1 ? () => move(path, index, 1) : null,
            () => remove(path, index),
          )}
        </div>

        {node.type === 'fonction' ? (
          <>
            <div className="algo-sub">
              <Kw>DEBUT</Kw>
            </div>
            {children('corps')}
            <div className="algo-sub">
              <Kw>FIN</Kw>
            </div>
          </>
        ) : (
          containers.map((key) => {
            if (key === 'sinon' && !permits('sinon')) return null;
            return (
              <div key={key}>
                {key === 'sinon' && (
                  <div className="algo-sub">
                    <Kw>SINON</Kw>
                  </div>
                )}
                {children(key)}
              </div>
            );
          })
        )}

        {ENDINGS[node.type] && (
          <div className="algo-end">
            <Kw>{ENDINGS[node.type]}</Kw>
          </div>
        )}
        {node.type === 'repeter' && (
          <div className="algo-end algo-line-text">
            <Kw>JUSQU'A</Kw>
            {field(node.condition, (v) => set({ condition: v }), 'condition')}
          </div>
        )}
      </div>
    );
  }

  const declarationKeys = DECLARATION_SECTIONS.filter((s) => permits(s.element));

  return (
    <div className="algo-editor">
      <aside className="algo-palette">
        <h3>Éléments disponibles</h3>
        <p className="sub">Définis par votre enseignant</p>

        {declarationKeys.length > 0 && (
          <div className="algo-group">
            <div className="algo-group-title">Déclaration</div>
            {declarationKeys.map((section) => (
              <button
                key={section.element}
                type="button"
                className="algo-palette-item"
                disabled={readOnly}
                onClick={() => addDeclaration(section.element)}
              >
                <span aria-hidden="true">+</span> {DECLARATION_ELEMENTS[section.element].label}
              </button>
            ))}
          </div>
        )}

        {groups.map(([group, elements]) => (
          <div key={group} className="algo-group">
            <div className="algo-group-title">{group}</div>
            {elements.map((element) => (
              <button
                key={element.key}
                type="button"
                className="algo-palette-item"
                disabled={readOnly}
                onClick={() => insert(element.key)}
              >
                <span aria-hidden="true">+</span> {element.label}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* Le squelette du cours, toujours présent : l'apprenant le remplit, il ne
          le construit pas. */}
      <div className="algo-canvas">
        <div className="algo-cadre">
          <div className="algo-cadre-ligne">
            <Kw>ALGORITHME</Kw>
            {field(doc.nom, (nom) => write({ nom }), 'NomAlgorithme', "Nom de l'algorithme")}
          </div>

          <div className="algo-cadre-section">
            {DECLARATION_SECTIONS.map((section) => {
              const lignes = doc[section.key] ?? [];
              if (lignes.length === 0 && (readOnly || !permits(section.element))) return null;
              return (
                <div className="algo-rubrique" key={section.key}>
                  <div className="algo-rubrique-titre">
                    <Kw>{RUBRIQUES[section.key]}</Kw>
                  </div>
                  <div className="algo-rubrique-lignes">
                    {lignes.length === 0 && (
                      <span className="sub algo-rubrique-vide">
                        {section.key === 'constantes'
                          ? 'aucune constante'
                          : section.key === 'types'
                            ? 'aucun type'
                            : 'aucune variable'}
                      </span>
                    )}
                    {lignes.map((line, index) => declarationLine(section.key, line, index))}
                    {!readOnly && permits(section.element) && (
                      <button
                        type="button"
                        className="algo-slot"
                        onClick={() => addDeclaration(section.element)}
                      >
                        + {section.label}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="algo-cadre-ligne algo-cadre-mot">
            <Kw>DEBUT</Kw>
          </div>
          <div className="algo-cadre-corps">
            {tree.length === 0 && (
              <p className="sub algo-empty">
                Le corps est vide : choisissez un élément dans la palette pour commencer.
              </p>
            )}
            {tree.map((node, index) => block(node, [], index, tree.length))}
            {slot([], null, '+ Ajouter une instruction')}
          </div>

          <div className="algo-cadre-ligne algo-cadre-mot">
            <Kw>FIN</Kw>
          </div>
        </div>
      </div>
    </div>
  );
}
