import { Fragment, useId, useMemo, useRef, useState } from 'react';
import {
  DECLARATION_ELEMENTS,
  DECLARATION_SECTIONS,
  DEFAULT_ELEMENTS,
  ELEMENTS,
  OPERATEURS,
  SCALAR_TYPES,
  arrayElementType,
  arrayTypeDefinition,
  emptyAlgorithm,
  normalizeTypeText,
  parseAlgorithm,
  serializeAlgorithm,
  structDefinition,
  structFields,
} from '../algoVocabulary';

/**
 * Éditeur d'algorithme en blocs.
 *
 * L'algorithme a toujours la forme du cours : ALGORITHME, CONSTANTES, TYPES,
 * VARIABLES, le corps entre DEBUT et FIN, puis les fonctions et procédures
 * après FIN. Cette forme est posée par l'éditeur : elle n'est ni à composer ni
 * à défaire. Chaque élément s'écrit comme sur le polycopié : les mots-clés en
 * capitales sont fixes, le reste est à remplir.
 *
 * Les éléments se posent de deux façons : on les **glisse** depuis la palette
 * jusqu'à l'endroit voulu (et l'on glisse de même un bloc déjà posé, par sa
 * poignée, pour le déplacer, y compris dans un autre bloc) ; ou l'on choisit un
 * emplacement puis l'on clique l'élément, ce qui marche aussi au clavier et
 * sur écran tactile.
 *
 * Le document est un JSON, traduit en Python par le serveur à la correction
 * (`backend/app/grading/algo.py`). Un emplacement s'y désigne par son adresse :
 * la suite des clés qui y mènent, `['corps', 2, 'alors']`.
 *
 * Les morceaux de l'éditeur sont des fonctions de rendu, pas des composants :
 * un composant déclaré dans le rendu change d'identité à chaque frappe, React
 * démonte alors le champ en cours de saisie et le curseur est perdu.
 */

const SECTIONS = new Set(DECLARATION_SECTIONS.map((s) => s.key));
const MODES = [
  { key: 'E', label: '(E)' },
  { key: 'S', label: '(S)' },
  { key: 'ES', label: '(E/S)' },
];

function listAt(doc, addr) {
  let current = doc;
  for (const step of addr) current = current?.[step];
  return Array.isArray(current) ? current : null;
}

const sameAddr = (a, b) => a.length === b.length && a.every((step, i) => step === b[i]);
const isPrefix = (prefix, addr) =>
  prefix.length <= addr.length && prefix.every((step, i) => step === addr[i]);

/** La nature d'une liste : elle décide de ce qu'on peut y déposer. */
function listKind(addr) {
  const last = addr[addr.length - 1];
  if (addr.length === 1 && SECTIONS.has(last)) return `decl:${last}`;
  if (addr.length === 1 && last === 'sousProgrammes') return 'racine';
  if (last === 'variables') return 'decl:variables';
  return 'corps';
}

function makeNode(key) {
  return DECLARATION_ELEMENTS[key]?.make() ?? ELEMENTS[key].make();
}

function kindOfKey(key) {
  if (DECLARATION_ELEMENTS[key]) return `decl:${DECLARATION_ELEMENTS[key].section}`;
  return ELEMENTS[key]?.racine ? 'racine' : 'corps';
}

const Kw = ({ children }) => <b className="kw">{children}</b>;
/** Les mots de liaison du POUR (de, à, par pas de) : écrits, mais pas en capitales. */
const Mot = ({ children }) => <span className="mot">{children}</span>;

/** Un aperçu du cours : les mots en capitales sont les mots-clés. */
function Apercu({ texte }) {
  return (
    <span className="algo-apercu">
      {texte.split(/(\s+|[()[\],:]|…)/).map((morceau, i) =>
        /^[A-Z][A-Z']+$/.test(morceau) ? (
          <b key={i} className="kw">{morceau}</b>
        ) : (
          <span key={i}>{morceau}</span>
        ),
      )}
    </span>
  );
}

export default function AlgoEditor({ value, onChange, allowed, readOnly = false }) {
  const doc = useMemo(() => parseAlgorithm(value), [value]);
  const [target, setTarget] = useState({ addr: ['corps'] });
  // Ce qu'on est en train de glisser : un élément de la palette ou un bloc posé.
  const [drag, setDrag] = useState(null);
  const dragging = drag !== null;
  const [over, setOver] = useState(null);
  const focusRef = useRef(null);
  const listId = useId();
  const vocabulary = allowed?.length ? allowed : DEFAULT_ELEMENTS;
  const permits = (key) => vocabulary.includes(key);

  const declaredTypes = doc.types.map((t) => String(t.nom ?? '').trim()).filter(Boolean);

  /* ----- Écritures dans le document ----- */

  const mutate = (fn) => {
    const clone = structuredClone({ ...emptyAlgorithm(), ...doc });
    fn(clone);
    onChange(serializeAlgorithm(clone));
  };
  const setRoot = (patch) => mutate((d) => Object.assign(d, patch));
  const editAt = (addr, index, patch) =>
    mutate((d) => {
      const list = listAt(d, addr);
      if (list?.[index]) list[index] = { ...list[index], ...patch };
    });
  const removeAt = (addr, index) => mutate((d) => listAt(d, addr)?.splice(index, 1));
  const moveBy = (addr, index, delta) =>
    mutate((d) => {
      const list = listAt(d, addr);
      const next = index + delta;
      if (!list || next < 0 || next >= list.length) return;
      [list[index], list[next]] = [list[next], list[index]];
    });
  const insertAt = (addr, index, node) =>
    mutate((d) => {
      let list = listAt(d, addr);
      if (!list) {
        // Une liste encore absente (anciennes copies) : on la crée à la volée.
        let parent = d;
        addr.slice(0, -1).forEach((step) => (parent = parent?.[step]));
        if (!parent) return;
        parent[addr[addr.length - 1]] = [];
        list = parent[addr[addr.length - 1]];
      }
      list.splice(index ?? list.length, 0, node);
    });
  const moveTo = (from, addr, index) =>
    mutate((d) => {
      const source = listAt(d, from.addr);
      const dest = listAt(d, addr);
      if (!source || !dest) return;
      const [node] = source.splice(from.index, 1);
      let at = index ?? dest.length;
      if (source === dest && index !== null && index > from.index) at -= 1;
      dest.splice(at, 0, node);
    });

  /** Clic dans la palette : l'élément va à l'emplacement choisi, ou dans sa rubrique. */
  function place(key) {
    if (readOnly) return;
    const kind = kindOfKey(key);
    if (kind.startsWith('decl:')) {
      insertAt([kind.slice(5)], null, makeNode(key));
    } else if (kind === 'racine') {
      insertAt(['sousProgrammes'], null, makeNode(key));
    } else {
      const addr = listAt(doc, target.addr) ? target.addr : ['corps'];
      insertAt(addr, null, makeNode(key));
    }
  }

  /* ----- Glisser-déposer ----- */

  function startDrag(event, payload) {
    event.dataTransfer.effectAllowed = payload.origine === 'palette' ? 'copy' : 'move';
    event.dataTransfer.setData('text/plain', payload.key ?? 'bloc');
    // Laisser le navigateur prendre l'image du glisser avant de redessiner.
    requestAnimationFrame(() => setDrag(payload));
  }

  function endDrag() {
    setDrag(null);
    setOver(null);
  }

  function canDrop(addr) {
    const payload = drag;
    if (!payload) return false;
    const kind = payload.origine === 'palette' ? kindOfKey(payload.key) : listKind(payload.addr);
    if (kind !== listKind(addr)) return false;
    // Un bloc ne se dépose pas à l'intérieur de lui-même.
    if (payload.origine !== 'palette' && isPrefix([...payload.addr, payload.index], addr)) return false;
    return true;
  }

  function drop(addr, index) {
    const payload = drag;
    endDrag();
    if (!payload) return;
    if (payload.origine === 'palette') insertAt(addr, index, makeNode(payload.key));
    else moveTo(payload, addr, index);
    setTarget({ addr });
  }

  const dropHandlers = (addr, index) => ({
    onDragOver: (event) => {
      if (!canDrop(addr)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = drag?.origine === 'palette' ? 'copy' : 'move';
      if (!over || !sameAddr(over.addr, addr) || over.index !== index) setOver({ addr, index });
    },
    onDrop: (event) => {
      event.preventDefault();
      drop(addr, index);
    },
  });

  /** Une fente de dépôt entre deux lignes, visible seulement pendant un glisser. */
  function dropZone(addr, index) {
    if (readOnly || !dragging || !canDrop(addr)) return null;
    const active = over && sameAddr(over.addr, addr) && over.index === index;
    return <div className={`algo-drop ${active ? 'active' : ''}`.trim()} {...dropHandlers(addr, index)} />;
  }

  function handle(addr, index, label) {
    if (readOnly) return null;
    return (
      <span
        className="algo-handle"
        draggable
        title="Glisser pour déplacer"
        aria-label={`Déplacer ${label}`}
        onDragStart={(event) => {
          event.stopPropagation();
          const bloc = event.currentTarget.closest('.algo-block, .algo-decl-ligne, .algo-sp');
          if (bloc) event.dataTransfer.setDragImage(bloc, 12, 12);
          startDrag(event, { origine: 'bloc', addr, index });
        }}
        onDragEnd={endDrag}
      >
        ⠿
      </span>
    );
  }

  /* ----- Champs à remplir (en italique) ----- */

  function field(fieldValue, onValue, placeholder, label = placeholder, tone = '', extra = {}) {
    const text = fieldValue ?? '';
    // Le champ épouse ce qu'on y écrit ; vide, il laisse lire son indication.
    const size = Math.max(text.length || placeholder.length, 1) + 2;
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
        onFocus={(event) => (focusRef.current = { el: event.target, onValue })}
        onChange={(event) => {
          focusRef.current = { el: event.target, onValue };
          onValue(event.target.value);
        }}
        {...extra}
      />
    );
  }

  /** Un type écrit à la main (champ d'enregistrement, paramètre) : suggestions du cours. */
  function typeField(fieldValue, onValue, label) {
    return field(fieldValue, (v) => onValue(normalizeTypeText(v)), 'TYPE', label, 'algo-type', {
      list: `${listId}-types`,
    });
  }

  /** Insère un opérateur là où se trouve le curseur, dans le dernier champ touché. */
  function insertOperator(texte) {
    const cible = focusRef.current;
    if (!cible?.el || readOnly || !document.contains(cible.el)) return;
    const { el } = cible;
    const debut = el.selectionStart ?? el.value.length;
    const fin = el.selectionEnd ?? debut;
    const avant = el.value.slice(0, debut).replace(/\s+$/, '');
    const apres = el.value.slice(fin).replace(/^\s+/, '');
    const suivant = `${avant}${avant ? ' ' : ''}${texte} ${apres}`.replace(/\s+$/, apres ? '' : ' ');
    cible.onValue(suivant);
    const curseur = `${avant}${avant ? ' ' : ''}${texte} `.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(curseur, curseur);
    });
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
          <button type="button" onClick={onUp} title="Monter" aria-label="Monter">
            ↑
          </button>
        )}
        {onDown && (
          <button type="button" onClick={onDown} title="Descendre" aria-label="Descendre">
            ↓
          </button>
        )}
        <button type="button" className="algo-remove" onClick={onRemove} title="Supprimer" aria-label="Supprimer">
          ×
        </button>
      </span>
    );
  }

  function mini(label, onClick, title = label) {
    if (readOnly) return null;
    return (
      <button
        type="button"
        className={`algo-mini ${label === '×' ? 'algo-remove' : ''}`.trim()}
        onClick={onClick}
        title={title}
        aria-label={title}
      >
        {label}
      </button>
    );
  }

  /* ----- Partie déclarative ----- */

  function typeOptions() {
    return (
      <>
        {SCALAR_TYPES.map((type) => (
          <option key={type.key} value={type.key}>
            {type.label}
          </option>
        ))}
        {declaredTypes.map((nom) => (
          <option key={`t-${nom}`} value={`nomme:${nom}`}>
            {nom}
          </option>
        ))}
      </>
    );
  }

  /** Le type d'une variable : ENTIER, TABLEAU[1..MAX] DE REEL, Etudiant, ^Type. */
  function variableType(line, set) {
    const elements = arrayElementType(line.type);
    const base = elements ? 'tableau' : line.type === 'nomme' ? `nomme:${line.cible ?? ''}` : (line.type ?? 'entier');
    const elementValue = elements === 'nomme' ? `nomme:${line.cible ?? ''}` : (elements ?? 'entier');
    const choose = (value) => {
      if (value === 'tableau') set({ type: `tableau_${elements ?? 'entier'}`, debut: line.debut ?? '1' });
      else if (value.startsWith('nomme:')) set({ type: 'nomme', cible: value.slice(6) });
      else set({ type: value });
    };
    const chooseElement = (value) => {
      if (value.startsWith('nomme:')) set({ type: 'tableau_nomme', cible: value.slice(6) });
      else set({ type: `tableau_${value}` });
    };
    const deuxDims = String(line.taille2 ?? '').trim() !== '' || line.deuxDims;
    return (
      <span className="algo-colle">
        <Kw>:</Kw>&nbsp;
        <select
          className="algo-field algo-select kw"
          aria-label="Type de la variable"
          value={base}
          disabled={readOnly}
          onChange={(e) => choose(e.target.value)}
        >
          {typeOptions()}
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
            {deuxDims ? (
              <>
                <Kw>[</Kw>
                {field(line.debut2 ?? '1', (v) => set({ debut2: v }), '1', 'Premier indice (2e dimension)')}
                <Kw>..</Kw>
                {field(line.taille2, (v) => set({ taille2: v }), 'MAX', 'Dernier indice (2e dimension)')}
                <Kw>]</Kw>
                {mini('×', () => set({ taille2: '', debut2: '', deuxDims: false }), 'Retirer la seconde dimension')}
              </>
            ) : (
              mini('+[ ]', () => set({ deuxDims: true, debut2: '1' }), 'Ajouter une seconde dimension (tableau à deux dimensions)')
            )}
            <Kw>&nbsp;DE&nbsp;</Kw>
            <select
              className="algo-field algo-select kw"
              aria-label="Type des cases du tableau"
              value={elementValue}
              disabled={readOnly}
              onChange={(e) => chooseElement(e.target.value)}
            >
              {typeOptions()}
            </select>
          </>
        )}
        {base === 'pointeur' && field(line.cible, (v) => set({ cible: v }), 'NomDeType')}
      </span>
    );
  }

  function structure(addr, line, index, count) {
    const champs = structFields(line);
    const set = (patch) => editAt(addr, index, patch);
    const setChamps = (next) => set({ champs: next, definition: structDefinition(next) });
    const setChamp = (i, patch) => setChamps(champs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
    return (
      <div className="algo-decl-ligne algo-structure" key={index}>
        <div className="algo-line-text">
          {handle(addr, index, 'ce type')}
          {field(line.nom, (v) => set({ nom: v }), 'NomDeType', 'Nom du type')}
          <Kw>:</Kw>
          <Kw>STRUCTURE</Kw>
          {comment(line, set)}
          {actions(
            index > 0 ? () => moveBy(addr, index, -1) : null,
            index < count - 1 ? () => moveBy(addr, index, 1) : null,
            () => removeAt(addr, index),
          )}
        </div>
        <div className="algo-structure-champs">
          {champs.map((champ, i) => (
            <div className="algo-line-text" key={i}>
              {field(champ.nom, (v) => setChamp(i, { nom: v }), `champ${i + 1}`, 'Nom du champ')}
              <span className="algo-colle">
                <Kw>:</Kw>&nbsp;
                {typeField(champ.type, (v) => setChamp(i, { type: v }), 'Type du champ')}
              </span>
              {mini('×', () => setChamps(champs.filter((_, j) => j !== i)), 'Retirer ce champ')}
            </div>
          ))}
          {!readOnly && (
            <button
              type="button"
              className="algo-mini algo-mini-add"
              onClick={() => setChamps([...champs, { nom: '', type: 'ENTIER' }])}
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

  /** Un type tableau nommé : `t_ADN = TABLEAU[1..TAILLE_MAX] DE CARACTERE`. */
  function arrayType(addr, line, index, count) {
    const set = (patch) => {
      const next = { ...line, ...patch };
      editAt(addr, index, { ...patch, definition: arrayTypeDefinition(next) });
    };
    return (
      <div className="algo-decl-ligne" key={index}>
        <div className="algo-line-text">
          {handle(addr, index, 'ce type')}
          {field(line.nom, (v) => set({ nom: v }), 'NomDeType', 'Nom du type')}
          <span className="op">=</span>
          <Kw>TABLEAU</Kw>
          <span className="algo-colle">
            <Kw>[</Kw>
            {field(line.debut ?? '1', (v) => set({ debut: v }), '1', 'Premier indice')}
            <Kw>..</Kw>
            {field(line.taille, (v) => set({ taille: v }), 'MAX', 'Dernier indice')}
            <Kw>]</Kw>
          </span>
          <Kw>DE</Kw>
          {typeField(line.element ?? 'ENTIER', (v) => set({ element: v }), 'Type des cases')}
          {comment(line, set)}
          {actions(
            index > 0 ? () => moveBy(addr, index, -1) : null,
            index < count - 1 ? () => moveBy(addr, index, 1) : null,
            () => removeAt(addr, index),
          )}
        </div>
      </div>
    );
  }

  function declarationLine(section, addr, line, index, count) {
    if (section === 'types') {
      return line.genre === 'tableau' ? arrayType(addr, line, index, count) : structure(addr, line, index, count);
    }
    const set = (patch) => editAt(addr, index, patch);
    const hasInit = line.avecValeur || String(line.valeur ?? '') !== '';
    return (
      <div className="algo-decl-ligne" key={index}>
        <div className="algo-line-text">
          {handle(addr, index, 'cette déclaration')}
          {section === 'constantes' && (
            <>
              {field(line.nom, (v) => set({ nom: v }), 'NOM', 'Nom de la constante')}
              <span className="op">=</span>
              {field(line.valeur, (v) => set({ valeur: v }), 'valeur', 'Valeur de la constante')}
            </>
          )}
          {section === 'variables' && (
            <>
              {field(line.nom, (v) => set({ nom: v }), 'nom', 'Nom de la variable')}
              {variableType(line, set)}
              {hasInit ? (
                <>
                  <span className="op">=</span>
                  {field(
                    line.valeur,
                    (v) => set({ valeur: v }),
                    arrayElementType(line.type) ? '{1, 2, 3}' : 'valeur',
                    'Valeur initiale',
                  )}
                  {mini('×', () => set({ valeur: '', avecValeur: false }), 'Retirer la valeur initiale')}
                </>
              ) : (
                mini('= …', () => set({ valeur: '', avecValeur: true }), 'Donner une valeur initiale')
              )}
            </>
          )}
          {comment(line, set)}
          {actions(
            index > 0 ? () => moveBy(addr, index, -1) : null,
            index < count - 1 ? () => moveBy(addr, index, 1) : null,
            () => removeAt(addr, index),
          )}
        </div>
      </div>
    );
  }

  /** Une rubrique (CONSTANTES, TYPES, VARIABLES) et ses lignes. */
  function rubrique(section, addr, titre) {
    const lignes = listAt(doc, addr) ?? [];
    const element = DECLARATION_SECTIONS.find((s) => s.key === section).element;
    if (lignes.length === 0 && (readOnly || !permits(element))) return null;
    return (
      <div className="algo-rubrique" key={addr.join('.')}>
        <div className="algo-rubrique-titre">
          <Kw>{titre}</Kw>
        </div>
        <div className="algo-rubrique-lignes">
          {lignes.map((line, index) => (
            <Fragment key={index}>
              {dropZone(addr, index)}
              {declarationLine(section, addr, line, index, lignes.length)}
            </Fragment>
          ))}
          {!readOnly && permits(element) && (
            <div className="algo-slot-ligne" {...dropHandlers(addr, null)}>
              {dragging && canDrop(addr) && (
                <div className={`algo-drop ${over && sameAddr(over.addr, addr) && over.index === null ? 'active' : ''}`} />
              )}
              {section === 'types' ? (
                <>
                  <button
                    type="button"
                    className="algo-slot"
                    onClick={() => insertAt(addr, null, makeNode('type'))}
                  >
                    + STRUCTURE
                  </button>
                  <button
                    type="button"
                    className="algo-slot"
                    onClick={() =>
                      insertAt(addr, null, {
                        nom: '',
                        genre: 'tableau',
                        debut: '1',
                        taille: '',
                        element: 'ENTIER',
                        definition: 'TABLEAU DE ENTIER',
                      })
                    }
                  >
                    + type TABLEAU
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="algo-slot"
                  onClick={() => insertAt(addr, null, makeNode(element))}
                >
                  + {section === 'constantes' ? 'Constante' : 'Variable'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ----- Corps ----- */

  /** L'emplacement en fin de liste : on y clique pour y ajouter, on y dépose. */
  function slot(addr, label) {
    // Une copie rendue se relit : il n'y a plus d'emplacement à proposer.
    if (readOnly) return null;
    const active = sameAddr(addr, target.addr);
    const survol = dragging && over && sameAddr(over.addr, addr) && over.index === null;
    return (
      <button
        type="button"
        className={`algo-slot ${active ? 'active' : ''} ${survol ? 'survol' : ''}`.trim()}
        onClick={() => setTarget({ addr })}
        {...dropHandlers(addr, null)}
      >
        {dragging && canDrop(addr)
          ? 'Déposer ici'
          : active
            ? 'Les éléments cliqués arrivent ici'
            : label}
      </button>
    );
  }

  function blockList(addr, list, label = '+ ici') {
    return (
      <div className="algo-children">
        {(list ?? []).map((node, index, all) => (
          <Fragment key={index}>
            {dropZone(addr, index)}
            {block(node, addr, index, all.length)}
          </Fragment>
        ))}
        {slot(addr, label)}
      </div>
    );
  }

  function header(node, set) {
    switch (node.type) {
      case 'lire':
        return (
          <span className="algo-colle">
            <Kw>LIRE</Kw>(
            {field(node.cible, (v) => set({ cible: v }), 'variable', 'Variable à lire')})
          </span>
        );
      case 'ecrire':
        return (
          <span className="algo-colle">
            <Kw>ECRIRE</Kw>(
            {field(node.expression, (v) => set({ expression: v }), '"texte", valeur', 'Ce qu’il faut afficher')})
          </span>
        );
      case 'affectation':
        return (
          <>
            {field(node.cible, (v) => set({ cible: v }), 'variable', 'Variable qui reçoit la valeur')}
            <span className="op">←</span>
            {field(node.expression, (v) => set({ expression: v }), 'expression', 'Valeur à ranger')}
          </>
        );
      case 'retour':
        return (
          <span className="algo-colle">
            <Kw>RETOURNER</Kw>(
            {field(node.expression, (v) => set({ expression: v }), 'expression', 'Valeur retournée')})
          </span>
        );
      case 'appel':
        return (
          <span className="algo-colle">
            {field(node.nom, (v) => set({ nom: v }), 'nomProcedure', 'Procédure appelée', 'algo-appel', {
              list: `${listId}-sp`,
            })}
            (
            {field(node.arguments, (v) => set({ arguments: v }), 'arguments', 'Paramètres effectifs')})
          </span>
        );
      case 'si':
        return (
          <>
            <Kw>SI</Kw>
            {field(node.condition, (v) => set({ condition: v }), 'condition', 'Condition du SI')}
            <Kw>ALORS</Kw>
          </>
        );
      case 'selon':
        return (
          <>
            <Kw>SELON</Kw>
            {field(node.expression, (v) => set({ expression: v }), 'expression', 'Valeur examinée')}
            <Kw>DANS</Kw>
          </>
        );
      case 'pour': {
        const pas = String(node.pas ?? '1');
        return (
          <>
            <Kw>POUR</Kw>
            {field(node.variable, (v) => set({ variable: v }), 'i', 'Variable de boucle')}
            <Mot>de</Mot>
            {field(node.debut, (v) => set({ debut: v }), 'début', 'Valeur de départ')}
            <Mot>à</Mot>
            {field(node.fin, (v) => set({ fin: v }), 'fin', 'Valeur d’arrivée')}
            <Mot>par pas de</Mot>
            {field(pas, (v) => set({ pas: v }), '1', 'Pas')}
            <Kw>FAIRE</Kw>
          </>
        );
      }
      case 'tantque':
        return (
          <>
            <Kw>TANTQUE</Kw>
            {field(node.condition, (v) => set({ condition: v }), 'condition', 'Condition du TANTQUE')}
            <Kw>FAIRE</Kw>
          </>
        );
      case 'repeter':
        return <Kw>REPETER</Kw>;
      default:
        return null;
    }
  }

  function block(node, addr, index, count) {
    if (node.type === 'fonction' || node.type === 'procedure') {
      return subprogram(node, addr, index, count);
    }
    const set = (patch) => editAt(addr, index, patch);
    const here = [...addr, index];
    const isSource =
      dragging && drag?.origine === 'bloc' && sameAddr(drag.addr, addr) && drag.index === index;

    let body = null;
    if (node.type === 'si') {
      const avecSinon = (node.sinon ?? []).length > 0 || node.avecSinon;
      body = (
        <>
          {blockList([...here, 'alors'], node.alors)}
          {(node.sinonsi ?? []).map((branche, k) => (
            <Fragment key={`sinonsi-${k}`}>
              <div className="algo-sub algo-line-text">
                <Kw>SINONSI</Kw>
                {field(
                  branche.condition,
                  (v) =>
                    set({
                      sinonsi: node.sinonsi.map((b, j) => (j === k ? { ...b, condition: v } : b)),
                    }),
                  'condition',
                  'Condition du SINONSI',
                )}
                <Kw>ALORS</Kw>
                {mini('×', () => set({ sinonsi: node.sinonsi.filter((_, j) => j !== k) }), 'Retirer ce SINONSI')}
              </div>
              {blockList([...here, 'sinonsi', k, 'corps'], branche.corps)}
            </Fragment>
          ))}
          {avecSinon && (
            <>
              <div className="algo-sub algo-line-text">
                <Kw>SINON</Kw>
                {mini('×', () => set({ sinon: [], avecSinon: false }), 'Retirer le SINON')}
              </div>
              {blockList([...here, 'sinon'], node.sinon)}
            </>
          )}
          {!readOnly && (permits('sinonsi') || (permits('sinon') && !avecSinon)) && (
            <div className="algo-sub algo-branches">
              {permits('sinonsi') &&
                mini('+ SINONSI', () =>
                  set({ sinonsi: [...(node.sinonsi ?? []), { condition: '', corps: [] }] }),
                )}
              {permits('sinon') && !avecSinon && mini('+ SINON', () => set({ avecSinon: true, sinon: node.sinon ?? [] }))}
            </div>
          )}
          <div className="algo-end">
            <Kw>FINSI</Kw>
          </div>
        </>
      );
    } else if (node.type === 'selon') {
      const avecAutre = (node.autre ?? []).length > 0 || node.avecAutre;
      body = (
        <>
          {(node.cas ?? []).map((cas, k) => (
            <div className="algo-cas" key={`cas-${k}`}>
              <div className="algo-sub algo-line-text">
                {field(
                  cas.valeurs,
                  (v) => set({ cas: node.cas.map((c, j) => (j === k ? { ...c, valeurs: v } : c)) }),
                  "'A', 'B'",
                  'Valeurs de ce cas',
                )}
                <Kw>:</Kw>
                {mini('×', () => set({ cas: node.cas.filter((_, j) => j !== k) }), 'Retirer ce cas')}
              </div>
              {blockList([...here, 'cas', k, 'corps'], cas.corps)}
            </div>
          ))}
          {avecAutre && (
            <div className="algo-cas">
              <div className="algo-sub algo-line-text">
                <Kw>SINON</Kw>
                <Kw>:</Kw>
                {mini('×', () => set({ autre: [], avecAutre: false }), 'Retirer le SINON')}
              </div>
              {blockList([...here, 'autre'], node.autre)}
            </div>
          )}
          {!readOnly && (
            <div className="algo-sub algo-branches">
              {mini('+ cas', () => set({ cas: [...(node.cas ?? []), { valeurs: '', corps: [] }] }))}
              {!avecAutre && mini('+ SINON', () => set({ avecAutre: true, autre: node.autre ?? [] }))}
            </div>
          )}
          <div className="algo-end">
            <Kw>FINSELON</Kw>
          </div>
        </>
      );
    } else if (node.type === 'pour' || node.type === 'tantque') {
      body = (
        <>
          {blockList([...here, 'corps'], node.corps)}
          <div className="algo-end">
            <Kw>{node.type === 'pour' ? 'FINPOUR' : 'FINTANTQUE'}</Kw>
          </div>
        </>
      );
    } else if (node.type === 'repeter') {
      body = (
        <>
          {blockList([...here, 'corps'], node.corps)}
          <div className="algo-end algo-line-text">
            <Kw>JUSQU'A</Kw>
            {field(node.condition, (v) => set({ condition: v }), 'condition', 'Condition d’arrêt')}
          </div>
        </>
      );
    }

    return (
      <div className={`algo-block algo-${node.type} ${isSource ? 'algo-source' : ''}`.trim()} key={index}>
        <div className="algo-line">
          {handle(addr, index, 'ce bloc')}
          <div className="algo-line-text">{header(node, set)}</div>
          {actions(
            index > 0 ? () => moveBy(addr, index, -1) : null,
            index < count - 1 ? () => moveBy(addr, index, 1) : null,
            () => removeAt(addr, index),
          )}
        </div>
        {body}
      </div>
    );
  }

  /* ----- Sous-programmes ----- */

  function parameters(node, set) {
    const params = (node.parametres ?? []).map((p) =>
      typeof p === 'string' ? { nom: p, type: '', mode: 'E' } : p,
    );
    const setParams = (next) => set({ parametres: next });
    const setParam = (i, patch) => setParams(params.map((p, j) => (j === i ? { ...p, ...patch } : p)));
    return (
      <span className="algo-params">
        (
        {params.map((p, i) => (
          <span className="algo-param" key={i}>
            {node.type === 'procedure' && (
              <select
                className="algo-field algo-select algo-mode"
                aria-label="Statut du paramètre"
                title="(E) entrée, (S) sortie, (E/S) entrée-sortie"
                value={String(p.mode ?? 'E').replace('/', '')}
                disabled={readOnly}
                onChange={(e) => setParam(i, { mode: e.target.value })}
              >
                {MODES.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            )}
            {field(p.nom, (v) => setParam(i, { nom: v }), `p${i + 1}`, 'Nom du paramètre')}
            <Kw>:</Kw>&nbsp;
            {typeField(p.type, (v) => setParam(i, { type: v }), 'Type du paramètre')}
            {mini('×', () => setParams(params.filter((_, j) => j !== i)), 'Retirer ce paramètre')}
            {i < params.length - 1 && <span className="op">,</span>}
          </span>
        ))}
        {mini('+', () => setParams([...params, { nom: '', type: 'ENTIER', mode: 'E' }]), 'Ajouter un paramètre')}
        )
      </span>
    );
  }

  function subprogram(node, addr, index, count) {
    const set = (patch) => editAt(addr, index, patch);
    const here = [...addr, index];
    const variables = node.variables ?? [];
    const locales = [...here, 'variables'];
    return (
      <div className="algo-sp" key={index}>
        <div className="algo-line">
          {handle(addr, index, 'ce sous-programme')}
          <div className="algo-line-text">
            <Kw>{node.type === 'procedure' ? 'PROCEDURE' : 'FONCTION'}</Kw>
            {field(node.nom, (v) => set({ nom: v }), node.type === 'procedure' ? 'nomProcedure' : 'nomFonction', 'Nom')}
            {parameters(node, set)}
            {node.type === 'fonction' && (
              <span className="algo-colle">
                <Kw>:</Kw>&nbsp;
                {typeField(node.typeRetour, (v) => set({ typeRetour: v }), 'Type du résultat')}
              </span>
            )}
          </div>
          {actions(
            index > 0 ? () => moveBy(addr, index, -1) : null,
            index < count - 1 ? () => moveBy(addr, index, 1) : null,
            () => removeAt(addr, index),
          )}
        </div>
        {(variables.length > 0 || (!readOnly && permits('declaration'))) && (
          <div className="algo-cadre-section">
            <div className="algo-rubrique">
              <div className="algo-rubrique-titre">
                <Kw>VARIABLES</Kw> <span className="sub">locales</span>
              </div>
              <div className="algo-rubrique-lignes">
                {variables.map((line, i) => (
                  <Fragment key={i}>
                    {dropZone(locales, i)}
                    {declarationLine('variables', locales, line, i, variables.length)}
                  </Fragment>
                ))}
                {!readOnly && permits('declaration') && (
                  <button
                    type="button"
                    className="algo-slot"
                    onClick={() => insertAt(locales, null, makeNode('declaration'))}
                    {...dropHandlers(locales, null)}
                  >
                    + Variable locale
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="algo-cadre-ligne">
          <Kw>DEBUT</Kw>
        </div>
        <div className="algo-cadre-corps">{blockList([...here, 'corps'], node.corps, '+ Ajouter une instruction')}</div>
        <div className="algo-cadre-ligne">
          <Kw>FIN</Kw>
        </div>
      </div>
    );
  }

  /* ----- Palette ----- */

  const paletteGroups = useMemo(() => {
    const byGroup = new Map();
    const add = (key, element) => {
      if (!byGroup.has(element.group)) byGroup.set(element.group, []);
      byGroup.get(element.group).push({ key, ...element });
    };
    DECLARATION_SECTIONS.forEach((section) => {
      if (vocabulary.includes(section.element)) add(section.element, DECLARATION_ELEMENTS[section.element]);
    });
    Object.entries(ELEMENTS).forEach(([key, element]) => {
      if (element.herite || element.branche || !element.make) return;
      const visible = element.implicite
        ? vocabulary.includes('procedure') || vocabulary.includes('appel')
        : vocabulary.includes(key);
      if (visible) add(key, element);
    });
    return [...byGroup.entries()];
  }, [vocabulary]);

  const branchesPermises = ['sinonsi', 'sinon'].filter((key) => vocabulary.includes(key));
  const sousProgrammes = doc.sousProgrammes ?? [];
  const nomsSousProgrammes = sousProgrammes
    .filter((sp) => sp.type === 'procedure')
    .map((sp) => String(sp.nom ?? '').trim())
    .filter(Boolean);

  return (
    <div className={`algo-editor ${dragging ? 'algo-dragging' : ''}`.trim()}>
      <datalist id={`${listId}-types`}>
        {SCALAR_TYPES.map((t) => (
          <option key={t.key} value={t.label} />
        ))}
        {declaredTypes.map((nom) => (
          <option key={nom} value={nom} />
        ))}
        <option value="TABLEAU[1..N] DE ENTIER" />
      </datalist>
      <datalist id={`${listId}-sp`}>
        {nomsSousProgrammes.map((nom) => (
          <option key={nom} value={nom} />
        ))}
      </datalist>

      {!readOnly && (
        <aside className="algo-palette" aria-label="Éléments disponibles">
          <h3>Éléments disponibles</h3>
          <p className="sub">
            Glissez un élément à sa place dans l'algorithme, ou cliquez sur un emplacement puis sur
            l'élément.
          </p>

          {paletteGroups.map(([group, elements]) => (
            <div key={group} className="algo-group">
              <div className="algo-group-title">{group}</div>
              {elements.map((element) => (
                <button
                  key={element.key}
                  type="button"
                  className="algo-palette-item"
                  draggable
                  title={element.aide}
                  onDragStart={(event) => startDrag(event, { origine: 'palette', key: element.key })}
                  onDragEnd={endDrag}
                  onClick={() => place(element.key)}
                >
                  <Apercu texte={element.apercu} />
                </button>
              ))}
              {group === 'Conditions' && branchesPermises.length > 0 && (
                <p className="algo-palette-note">
                  {branchesPermises.map((k) => ELEMENTS[k].label).join(' et ')} : boutons dans un SI.
                </p>
              )}
            </div>
          ))}

          <div className="algo-group">
            <div className="algo-group-title">Opérateurs</div>
            <div className="algo-operateurs">
              {OPERATEURS.map((op) => (
                <button
                  key={op.texte}
                  type="button"
                  className="algo-op"
                  title={`${op.aide} : s'insère dans le champ en cours`}
                  // Garder le focus dans le champ : l'opérateur s'y insère.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertOperator(op.texte)}
                >
                  {op.texte}
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}

      {/* Le squelette du cours, toujours présent : l'apprenant le remplit, il ne
          le construit pas. */}
      <div className="algo-canvas">
        <div className="algo-cadre">
          <div className="algo-cadre-ligne">
            <Kw>ALGORITHME</Kw>
            {field(doc.nom, (nom) => setRoot({ nom }), 'NomAlgorithme', "Nom de l'algorithme")}
          </div>

          <div className="algo-cadre-section">
            {DECLARATION_SECTIONS.map((section) => rubrique(section.key, [section.key], section.titre))}
          </div>

          <div className="algo-cadre-ligne algo-cadre-mot">
            <Kw>DEBUT</Kw>
          </div>
          <div className="algo-cadre-corps">
            {doc.corps.length === 0 && !readOnly && (
              <p className="sub algo-empty">
                Le corps est vide : glissez un élément de la palette jusqu'ici.
              </p>
            )}
            {blockList(['corps'], doc.corps, '+ Ajouter une instruction')}
          </div>

          <div className="algo-cadre-ligne algo-cadre-mot">
            <Kw>FIN</Kw>
          </div>

          {(sousProgrammes.length > 0 || (!readOnly && (permits('fonction') || permits('procedure')))) && (
            <div className="algo-sous-programmes">
              {sousProgrammes.map((node, index) => (
                <Fragment key={index}>
                  {dropZone(['sousProgrammes'], index)}
                  {subprogram(node, ['sousProgrammes'], index, sousProgrammes.length)}
                </Fragment>
              ))}
              {!readOnly && (
                <div className="algo-sp-ajout" {...dropHandlers(['sousProgrammes'], null)}>
                  {dragging && canDrop(['sousProgrammes']) && (
                    <div
                      className={`algo-drop ${over && sameAddr(over.addr, ['sousProgrammes']) && over.index === null ? 'active' : ''}`}
                    />
                  )}
                  {permits('fonction') && (
                    <button type="button" className="algo-slot" onClick={() => place('fonction')}>
                      + FONCTION
                    </button>
                  )}
                  {permits('procedure') && (
                    <button type="button" className="algo-slot" onClick={() => place('procedure')}>
                      + PROCEDURE
                    </button>
                  )}
                  <span className="sub">Les sous-programmes se déclarent après le FIN de l'algorithme.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
