/**
 * Saisie des jeux de tests d'un exercice de code.
 *
 * Un test tenait auparavant sur une ligne de tableau : six colonnes serrées où
 * le nom, la cible, les entrées, la sortie et les points se disputaient la
 * largeur. On ne voyait plus ce qu'un test *fait*. Les points n'y sont même
 * plus : ce qu'un test vaut se décide à la dernière étape, une fois tous les
 * tests écrits (voir `PointsEditor`). Chaque test est désormais une
 * carte qui se lit dans l'ordre où on la remplit — ce qui est exécuté, ce qu'on
 * lui donne, ce qu'on attend — et se conclut par la phrase que le correcteur
 * appliquera. Le choix de la cible reprend les cartes du choix de type, à
 * l'ouverture de l'éditeur : la même façon de choisir, au même endroit du geste.
 *
 * Composant partagé par la banque d'exercices et l'éditeur d'évaluation, qui
 * saisissaient jusqu'ici deux tableaux presque identiques.
 */

import { useState } from 'react';
import { Button } from './ui';
import { TestExpected, TestInputs } from './BaremeEditor';
import {
  COMPARISONS,
  callableCriteria,
  describeCriterion,
  expectedTypeOf,
  formatValue,
  inputTypesOf,
  valueType,
} from '../bareme';

/** Un test compare-t-il du texte affiché plutôt qu'une valeur de retour ? */
function comparesText(criterion) {
  return !criterion || valueType(criterion.returns).input === 'none';
}

/**
 * La phrase que le correcteur appliquera, en clair : c'est elle qui dit à
 * l'enseignant s'il a rempli le test comme il le croyait. Les valeurs y sont
 * écrites comme en C — {3, 1, 4}, 'A', "bonjour" — pour qu'on reconnaisse le
 * type d'un coup d'œil.
 */
function testSummary(test, criterion) {
  const args = Array.isArray(test.args) ? test.args : [];
  const entries = inputTypesOf(test, criterion);
  const valeurs = entries.map((entry, i) => formatValue(entry.type, args[i]));
  const attendu = formatValue(expectedTypeOf(test, criterion), test.expected_stdout);

  if (criterion) {
    const call = `${criterion.name}(${valeurs.join(', ')})`;
    return comparesText(criterion)
      ? `${call} doit afficher ${attendu}`
      : `${call} doit renvoyer ${attendu}`;
  }
  const given = valeurs.length ? `, avec ${valeurs.join(' puis ')} en entrée,` : '';
  return `le programme${given} doit afficher ${attendu}`;
}

/**
 * Le récapitulatif des jeux de tests : une ligne par test, quatre colonnes — le
 * type de ce qu'on donne et sa valeur, le type de ce qui doit sortir et sa
 * valeur.
 *
 * Les cartes ci-dessus se remplissent une à une ; ce tableau les relit d'un
 * bloc. Les types y sont écrits en toutes lettres parce qu'une valeur seule est
 * ambiguë : « 3 1 4 » ne dit pas si le programme reçoit un tableau ou trois
 * entiers, et « 1 » ne dit pas si l'on attend un entier ou un booléen.
 */
function TestsRecap({ tests, callable }) {
  if (tests.length === 0) return null;

  return (
    <div className="tests-recap">
      <span className="tests-recap-titre">Récapitulatif — ce qui entre, ce qui doit sortir</span>
      <table className="tests-recap-table">
        <thead>
          <tr>
            <th>Type d’entrée</th>
            <th>Valeur donnée</th>
            <th>Type de sortie</th>
            <th>Valeur attendue</th>
          </tr>
        </thead>
        <tbody>
          {tests.map((test, index) => {
            const criterion = callable.find((c) => c.id === test.target_id);
            const args = Array.isArray(test.args) ? test.args : [];
            const entrées = inputTypesOf(test, criterion);
            const typesEntrée = entrées.map((entry) => valueType(entry.type).label).join(', ');
            const valeursEntrée = entrées
              .map((entry, i) => formatValue(entry.type, args[i]))
              .join(', ');

            // Un test qui juge l'affichage compare du texte, quel que soit le
            // type de retour déclaré : c'est ce texte-là qu'on annonce.
            const retour = expectedTypeOf(test, criterion);
            const affiche = valueType(retour).input === 'none';
            const attendu = String(test.expected_stdout ?? '').trim();

            return (
              <tr key={test.id ?? `recap-${index}`}>
                <td className="tests-recap-type">
                  <span className="tests-recap-nom">{test.name || `Test ${index + 1}`}</span>
                  {typesEntrée || 'aucune entrée'}
                </td>
                <td>
                  <code>
                    {criterion
                      ? `${criterion.name}(${valeursEntrée})`
                      : valeursEntrée || '(rien)'}
                  </code>
                </td>
                <td className="tests-recap-type">
                  {affiche ? 'Affichage (texte)' : valueType(retour).label}
                </td>
                <td>
                  <code>{affiche ? attendu || '…' : formatValue(retour, attendu)}</code>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Choix de ce qu'un nouveau test exécute : le programme, ou une fonction. */
function CiblePicker({ callable, onPick, onCancel }) {
  return (
    <div className="tests-choix">
      <strong style={{ fontSize: 13 }}>Que doit exécuter ce test ?</strong>
      <div className="type-picker-grid" style={{ margin: '10px 0' }}>
        <button type="button" className="type-card" onClick={() => onPick(null)}>
          <span className="type-card-code">$ ./programme</span>
          <span className="type-card-titre">Le programme entier</span>
          <span className="type-card-tagline">
            On lui envoie des valeurs, on compare ce qu'il affiche.
          </span>
        </button>
        {callable.map((criterion) => (
          <button
            key={criterion.id}
            type="button"
            className="type-card"
            title={describeCriterion(criterion)}
            onClick={() => onPick(criterion.id)}
          >
            <span className="type-card-code">{describeCriterion(criterion)}</span>
            <span className="type-card-titre">{criterion.name}()</span>
            <span className="type-card-tagline">
              On appelle la fonction, on compare ce qu'elle renvoie.
            </span>
          </button>
        ))}
      </div>
      <Button variant="secondary" size="small" onClick={onCancel}>
        Annuler
      </Button>
    </div>
  );
}

/** Une étape numérotée dans la carte d'un test. */
function Etape({ numero, titre, aide, children }) {
  return (
    <div className="test-etape">
      <span className="test-etape-numero">{numero}</span>
      <div className="test-etape-corps">
        <span className="test-etape-titre">{titre}</span>
        {aide && <span className="test-etape-aide sub">{aide}</span>}
        <div className="test-etape-champs">{children}</div>
      </div>
    </div>
  );
}

function TestCard({ test, index, callable, showComparison, onChange, onRemove }) {
  const criterion = callable.find((c) => c.id === test.target_id);
  const texte = comparesText(criterion);

  return (
    <article className="test-carte">
      <header className="test-carte-tete">
        <span className="test-carte-numero">{index + 1}</span>
        <input
          className="test-carte-nom"
          aria-label="Nom du test"
          value={test.name ?? ''}
          placeholder={`Test ${index + 1}`}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        <Button variant="secondary" size="small" onClick={onRemove}>
          Retirer
        </Button>
      </header>

      <Etape numero="1" titre="Ce que le test exécute">
        {callable.length === 0 ? (
          <span className="sub">
            Le programme entier. Déclarez une fonction attendue ci-dessus pour pouvoir
            l'appeler directement.
          </span>
        ) : (
          <div className="test-cibles">
            <button
              type="button"
              className={`test-cible ${test.target_id ? '' : 'active'}`.trim()}
              onClick={() => onChange({ target_id: null, args: [], input_types: [] })}
            >
              Le programme entier
            </button>
            {callable.map((c) => (
              <button
                key={c.id}
                type="button"
                title={describeCriterion(c)}
                className={`test-cible ${test.target_id === c.id ? 'active' : ''}`.trim()}
                onClick={() => onChange({ target_id: c.id, args: [], input_types: [] })}
              >
                {c.name}()
              </button>
            ))}
          </div>
        )}
      </Etape>

      <Etape
        numero="2"
        titre={criterion ? 'Les arguments passés à la fonction' : 'Les valeurs envoyées au programme'}
        aide={
          criterion
            ? 'Les types viennent de la fonction déclarée : il ne reste que les valeurs.'
            : 'Envoyées sur l’entrée standard, une par ligne, dans cet ordre.'
        }
      >
        <TestInputs test={test} criterion={criterion} onChange={onChange} />
      </Etape>

      <Etape
        numero="3"
        titre={texte ? 'Ce qui doit être affiché' : 'La valeur qui doit être renvoyée'}
      >
        <TestExpected test={test} criterion={criterion} onChange={onChange} />
        {showComparison && (
          <label className="test-comparaison">
            <span className="sub">Comparaison</span>
            <select
              aria-label="Mode de comparaison"
              value={test.comparison ?? 'trim'}
              onChange={(e) => onChange({ comparison: e.target.value })}
            >
              {COMPARISONS.map((mode) => (
                <option key={mode.key} value={mode.key}>
                  {mode.label} — {mode.hint}
                </option>
              ))}
            </select>
          </label>
        )}
      </Etape>

      <p className="test-resume">{testSummary(test, criterion)}</p>
    </article>
  );
}

/**
 * L'étape des comparaisons : une ligne par test, où l'on choisit la sévérité de
 * la correction. Séparée de la saisie des tests parce qu'elle ne se règle
 * qu'une fois les sorties écrites — et qu'on la règle souvent d'un bloc.
 */
export function ComparisonEditor({ exercise, tests, onChange }) {
  const callable = callableCriteria(exercise);
  const set = (index, comparison) =>
    onChange(tests.map((t, i) => (i === index ? { ...t, comparison } : t)));
  const setAll = (comparison) => onChange(tests.map((t) => ({ ...t, comparison })));

  if (tests.length === 0) {
    return (
      <div className="tests-vide">
        <strong style={{ fontSize: 13 }}>Aucun test à comparer</strong>
        <p className="sub" style={{ margin: '4px 0 0' }}>
          Revenez à l'étape précédente pour ajouter au moins un jeu de tests.
        </p>
      </div>
    );
  }

  return (
    <section className="tests-editeur">
      <header className="tests-tete">
        <div>
          <strong style={{ fontSize: 13 }}>Comment comparer les résultats</strong>
          <p className="sub" style={{ margin: '2px 0 0', fontSize: 12 }}>
            Une sortie juste peut s'écrire de plusieurs façons : dites pour chaque test
            ce qui compte comme identique.
          </p>
        </div>
        <div className="comparaison-tout">
          <span className="sub" style={{ fontSize: 11 }}>Tout mettre en</span>
          <div className="test-cibles">
            {COMPARISONS.map((mode) => (
              <button
                key={mode.key}
                type="button"
                className="test-cible"
                title={mode.hint}
                onClick={() => setAll(mode.key)}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {tests.map((test, index) => {
        const criterion = callable.find((c) => c.id === test.target_id);
        const courant = test.comparison ?? 'trim';
        return (
          <article className="test-carte" key={test.id ?? `new-${index}`}>
            <header className="test-carte-tete">
              <span className="test-carte-numero">{index + 1}</span>
              <strong style={{ fontSize: 13 }}>{test.name || `Test ${index + 1}`}</strong>
            </header>
            <p className="test-resume">{testSummary(test, criterion)}</p>
            <div className="test-cibles">
              {COMPARISONS.map((mode) => (
                <button
                  key={mode.key}
                  type="button"
                  className={`test-cible ${courant === mode.key ? 'active' : ''}`.trim()}
                  onClick={() => set(index, mode.key)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <span className="sub" style={{ fontSize: 11.5 }}>
              {COMPARISONS.find((m) => m.key === courant)?.exemple}
            </span>
          </article>
        );
      })}
    </section>
  );
}

export default function TestsEditor({
  exercise,
  tests,
  template,
  onChange,
  showComparison = false,
}) {
  const callable = callableCriteria(exercise);
  const [picking, setPicking] = useState(false);

  const add = (target_id) => {
    onChange([
      ...tests,
      { ...template, name: `Test ${tests.length + 1}`, target_id, args: [], input_types: [] },
    ]);
    setPicking(false);
  };
  // Sans fonction déclarée, il n'y a rien à choisir : le test porte sur le programme.
  const startAdd = () => (callable.length > 0 ? setPicking(true) : add(null));

  return (
    <section className="tests-editeur">
      <header className="tests-tete">
        <div>
          <strong style={{ fontSize: 13 }}>Jeux de tests</strong>
          <p className="sub" style={{ margin: '2px 0 0', fontSize: 12 }}>
            Chaque test fait tourner la copie sur des valeurs choisies et compare le
            résultat obtenu à celui que vous attendez.
          </p>
        </div>
        {!picking && (
          <Button variant="secondary" size="small" style={{ marginLeft: 'auto' }} onClick={startAdd}>
            + Ajouter un test
          </Button>
        )}
      </header>

      {picking && (
        <CiblePicker callable={callable} onPick={add} onCancel={() => setPicking(false)} />
      )}

      {tests.length === 0 && !picking && (
        <div className="tests-vide">
          <strong style={{ fontSize: 13 }}>Aucun test pour l'instant</strong>
          <p className="sub" style={{ margin: '4px 0 12px' }}>
            Sans test, cet exercice ne pourra pas être corrigé automatiquement : seules
            les déclarations attendues seront vérifiées.
          </p>
          <Button onClick={startAdd}>+ Ajouter un premier test</Button>
        </div>
      )}

      {tests.map((test, index) => (
        <TestCard
          key={test.id ?? `new-${index}`}
          test={test}
          index={index}
          callable={callable}
          showComparison={showComparison}
          onChange={(patch) =>
            onChange(tests.map((t, i) => (i === index ? { ...t, ...patch } : t)))
          }
          onRemove={() => onChange(tests.filter((_, i) => i !== index))}
        />
      ))}

      <TestsRecap tests={tests} callable={callable} />
    </section>
  );
}
