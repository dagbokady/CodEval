import { useMemo, useState } from 'react';
import {
  DATA_TYPES,
  DECLARATION_ELEMENTS,
  DECLARATION_SECTIONS,
  DEFAULT_ELEMENTS,
  ELEMENTS,
  SIZED_TYPES,
  emptyAlgorithm,
  parseAlgorithm,
  serializeAlgorithm,
} from '../algoVocabulary';

/**
 * Éditeur d'algorithme en blocs.
 *
 * L'algorithme a toujours la forme du cours — un nom, une partie déclarative,
 * un corps entre Début et Fin — et cette forme est posée par l'éditeur : elle
 * n'est ni à composer ni à défaire. L'apprenant remplit ce squelette avec les
 * seuls éléments que l'enseignant a autorisés. La production est un document
 * JSON, traduit en Python par le serveur au moment de la correction.
 */

const CONTAINERS = {
  si: ['alors', 'sinon'],
  pour: ['corps'],
  tantque: ['corps'],
  repeter: ['corps'],
  fonction: ['corps'],
};
const CONTAINER_LABELS = { alors: 'ALORS', sinon: 'SINON', corps: '' };

/** Renvoie le tableau d'accueil désigné par un chemin (suite de {index, key}). */
function containerAt(tree, path) {
  let list = tree;
  for (const step of path) {
    list = list[step.index][step.key];
  }
  return list;
}

function update(tree, path, mutate) {
  const clone = structuredClone(tree);
  mutate(containerAt(clone, path), clone);
  return clone;
}

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

  const samePath = (a, b) =>
    a.length === b.length && a.every((step, i) => step.index === b[i].index && step.key === b[i].key);

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

  function DeclarationLine({ section, line, index }) {
    const set = (patch) => editDeclaration(section, index, patch);
    return (
      <div className="algo-decl-ligne">
        {section === 'constantes' && (
          <>
            <Field value={line.nom} onValue={(v) => set({ nom: v })} placeholder="NOM" width={120} />
            <span className="op">=</span>
            <Field
              value={line.valeur}
              onValue={(v) => set({ valeur: v })}
              placeholder="valeur"
              width={160}
            />
          </>
        )}
        {section === 'types' && (
          <>
            <Field value={line.nom} onValue={(v) => set({ nom: v })} placeholder="Nom" width={140} />
            <span className="op">=</span>
            <Field
              value={line.definition}
              onValue={(v) => set({ definition: v })}
              placeholder="champ : type, champ : type"
              width={280}
            />
          </>
        )}
        {section === 'variables' && (
          <>
            <Field value={line.nom} onValue={(v) => set({ nom: v })} placeholder="nom" width={120} />
            <span className="op">:</span>
            <select
              className="algo-field"
              aria-label="Type de la variable"
              value={line.type ?? 'entier'}
              disabled={readOnly}
              onChange={(e) => set({ type: e.target.value })}
              style={{ width: 160 }}
            >
              {DATA_TYPES.map((type) => (
                <option key={type.key} value={type.key}>
                  {type.label}
                </option>
              ))}
            </select>
            {SIZED_TYPES.has(line.type) && (
              <>
                <span className="kw">de taille</span>
                <Field
                  value={line.taille}
                  onValue={(v) => set({ taille: v })}
                  placeholder="taille"
                  width={90}
                />
              </>
            )}
          </>
        )}
        {!readOnly && (
          <span className="algo-actions">
            <button
              type="button"
              onClick={() => removeDeclaration(section, index)}
              title="Supprimer cette déclaration"
            >
              ×
            </button>
          </span>
        )}
      </div>
    );
  }

  function Slot({ path, index, label }) {
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

  function Field({ value: fieldValue, onValue, placeholder, width = 120 }) {
    return (
      <input
        className="algo-field"
        style={{ width }}
        value={fieldValue ?? ''}
        placeholder={placeholder}
        disabled={readOnly}
        onChange={(event) => onValue(event.target.value)}
      />
    );
  }

  function Block({ node, path, index }) {
    const set = (patch) => edit(path, index, patch);
    const childPath = (key) => [...path, { index, key }];

    const header = {
      lire: (
        <>
          <span className="kw">LIRE()</span> <span className="op">→</span>
          <Field value={node.cible} onValue={(v) => set({ cible: v })} placeholder="variable" width={110} />
        </>
      ),
      ecrire: (
        <>
          <span className="kw">ECRIRE(</span>
          <Field value={node.expression} onValue={(v) => set({ expression: v })} placeholder="expression" width={220} />
          <span className="kw">)</span>
        </>
      ),
      variable: (
        <>
          <span className="kw">VARIABLE</span>
          <Field value={node.nom} onValue={(v) => set({ nom: v })} placeholder="nom" width={100} />
          <span className="op">←</span>
          <Field value={node.valeur} onValue={(v) => set({ valeur: v })} placeholder="valeur" width={160} />
        </>
      ),
      tableau: (
        <>
          <span className="kw">TABLEAU</span>
          <Field value={node.nom} onValue={(v) => set({ nom: v })} placeholder="nom" width={100} />
          <span className="kw">DE TAILLE</span>
          <Field value={node.taille} onValue={(v) => set({ taille: v })} placeholder="taille" width={120} />
        </>
      ),
      affectation: (
        <>
          <Field value={node.cible} onValue={(v) => set({ cible: v })} placeholder="cible" width={130} />
          <span className="op">←</span>
          <Field value={node.expression} onValue={(v) => set({ expression: v })} placeholder="expression" width={220} />
        </>
      ),
      retour: (
        <>
          <span className="kw">RETOUR(</span>
          <Field value={node.expression} onValue={(v) => set({ expression: v })} placeholder="expression" width={180} />
          <span className="kw">)</span>
        </>
      ),
      si: (
        <>
          <span className="kw">SI</span>
          <Field value={node.condition} onValue={(v) => set({ condition: v })} placeholder="condition" width={240} />
          <span className="kw">ALORS</span>
        </>
      ),
      pour: (
        <>
          <span className="kw">POUR</span>
          <Field value={node.variable} onValue={(v) => set({ variable: v })} placeholder="i" width={70} />
          <span className="kw">DE</span>
          <Field value={node.debut} onValue={(v) => set({ debut: v })} placeholder="début" width={90} />
          <span className="kw">À</span>
          <Field value={node.fin} onValue={(v) => set({ fin: v })} placeholder="fin" width={120} />
          <span className="kw">FAIRE</span>
        </>
      ),
      tantque: (
        <>
          <span className="kw">TANT QUE</span>
          <Field value={node.condition} onValue={(v) => set({ condition: v })} placeholder="condition" width={240} />
          <span className="kw">FAIRE</span>
        </>
      ),
      repeter: <span className="kw">RÉPÉTER</span>,
      fonction: (
        <>
          <span className="kw">FONCTION</span>
          <Field value={node.nom} onValue={(v) => set({ nom: v })} placeholder="nom" width={120} />
          <span className="kw">(</span>
          <Field
            value={(node.parametres ?? []).join(', ')}
            onValue={(v) =>
              set({ parametres: v.split(',').map((p) => p.trim()).filter(Boolean) })
            }
            placeholder="paramètres"
            width={160}
          />
          <span className="kw">)</span>
        </>
      ),
    }[node.type];

    const containers = CONTAINERS[node.type] ?? [];

    return (
      <div className={`algo-block algo-${node.type}`}>
        <div className="algo-line">
          {header}
          {!readOnly && (
            <span className="algo-actions">
              <button type="button" onClick={() => move(path, index, -1)} title="Monter">
                ↑
              </button>
              <button type="button" onClick={() => move(path, index, 1)} title="Descendre">
                ↓
              </button>
              <button type="button" onClick={() => remove(path, index)} title="Supprimer">
                ×
              </button>
            </span>
          )}
        </div>

        {containers.map((key) => {
          if (key === 'sinon' && !permits('sinon')) return null;
          const children = node[key] ?? [];
          return (
            <div className="algo-children" key={key}>
              {CONTAINER_LABELS[key] && <div className="algo-sub">{CONTAINER_LABELS[key]}</div>}
              {children.map((child, childIndex) => (
                <Block
                  key={childIndex}
                  node={child}
                  path={childPath(key)}
                  index={childIndex}
                />
              ))}
              <Slot path={childPath(key)} index={null} label="+ ici" />
            </div>
          );
        })}

        {node.type === 'si' && <div className="algo-end">FIN SI</div>}
        {node.type === 'pour' && <div className="algo-end">FIN POUR</div>}
        {node.type === 'tantque' && <div className="algo-end">FIN TANT QUE</div>}
        {node.type === 'fonction' && <div className="algo-end">FIN FONCTION</div>}
        {node.type === 'repeter' && (
          <div className="algo-end algo-end-champ">
            {"JUSQU'À"}
            <Field
              value={node.condition}
              onValue={(v) => set({ condition: v })}
              placeholder="condition d'arrêt"
              width={220}
            />
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
            <span className="kw">Algorithme</span>
            <Field
              value={doc.nom}
              onValue={(nom) => write({ nom })}
              placeholder="Nom de l'algorithme"
              width={240}
            />
          </div>

          <div className="algo-cadre-ligne algo-cadre-mot">
            <span className="kw">Déclaration</span>
          </div>
          <div className="algo-cadre-section">
            {DECLARATION_SECTIONS.map((section) => {
              const lignes = doc[section.key] ?? [];
              if (lignes.length === 0 && !permits(section.element)) return null;
              return (
                <div className="algo-rubrique" key={section.key}>
                  <div className="algo-rubrique-titre">{section.label}</div>
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
                    {lignes.map((line, index) => (
                      <DeclarationLine
                        key={index}
                        section={section.key}
                        line={line}
                        index={index}
                      />
                    ))}
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
            <span className="kw">Début</span>
          </div>
          <div className="algo-cadre-corps">
            {tree.length === 0 && (
              <p className="sub algo-empty">
                Le corps est vide : choisissez un élément dans la palette pour commencer.
              </p>
            )}
            {tree.map((node, index) => (
              <Block key={index} node={node} path={[]} index={index} />
            ))}
            <Slot path={[]} index={null} label="+ Ajouter une instruction" />
          </div>

          <div className="algo-cadre-ligne algo-cadre-mot">
            <span className="kw">Fin</span>
          </div>
        </div>
      </div>
    </div>
  );
}
