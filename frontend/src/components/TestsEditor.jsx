/**
 * Saisie des jeux de tests d'un exercice de code.
 *
 * Un test tenait auparavant sur une ligne de tableau : six colonnes serrées où
 * le nom, la cible, les entrées, la sortie et les points se disputaient la
 * largeur. On ne voyait plus ce qu'un test *fait*. Les points n'y sont même
 * plus : ce qu'un test vaut se décide à la dernière étape, une fois tous les
 * tests écrits (voir `PointsEditor`). Chaque test est désormais une
 * carte qui se lit dans l'ordre où on la remplit (ce qui est exécuté, ce qu'on
 * lui donne, ce qu'on attend) et se conclut par la phrase que le correcteur
 * appliquera. Le choix de la cible reprend les cartes du choix de type, à
 * l'ouverture de l'éditeur : la même façon de choisir, au même endroit du geste.
 *
 * Composant partagé par la banque d'exercices et l'éditeur d'évaluation, qui
 * saisissaient jusqu'ici deux tableaux presque identiques.
 */

import { useState } from 'react';
import { Button, Disclosure, Tag } from './ui';
import { TestExpected, TestInputs } from './BaremeEditor';
import {
  COMPARISONS,
  callableCriteria,
  describeCriterion,
  expectedTypeOf,
  formatValue,
  inputTypesOf,
  testIssues,
  valueType,
} from '../bareme';

/** Un test compare-t-il du texte affiché plutôt qu'une valeur de retour ? */
function comparesText(criterion) {
  return !criterion || valueType(criterion.returns).input === 'none';
}

/**
 * La phrase que le correcteur appliquera, en clair : c'est elle qui dit à
 * l'enseignant s'il a rempli le test comme il le croyait. Les valeurs y sont
 * écrites comme en C : {3, 1, 4}, 'A', "bonjour" : pour qu'on reconnaisse le
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
  const lancé = argvOf(test).length ? ` lancé par ${commandLine(test)}` : '';
  return `le programme${lancé}${given} doit afficher ${attendu}`;
}

/** Les arguments de la ligne de commande d'un test du programme entier. */
function argvOf(test) {
  return Array.isArray(test?.argv) ? test.argv.map(String) : [];
}

function commandLine(test) {
  return ['./programme', ...argvOf(test)].join(' ');
}

/**
 * Les arguments, saisis sur une ligne comme dans un terminal. Le texte reste
 * tel qu'on le tape : le découper à chaque frappe avalerait l'espace qui
 * sépare deux arguments avant qu'on ait écrit le second.
 */
function ArgvInput({ test, onChange }) {
  const [text, setText] = useState(() => argvOf(test).join(' '));
  return (
    <label className="test-argv">
      <code className="test-argv-invite">./programme</code>
      <input
        aria-label="Arguments de la ligne de commande"
        value={text}
        placeholder="(aucun argument)"
        spellCheck={false}
        onChange={(e) => {
          setText(e.target.value);
          const words = e.target.value.trim();
          onChange({ argv: words ? words.split(/\s+/) : [] });
        }}
      />
    </label>
  );
}

/**
 * Le récapitulatif des jeux de tests : une ligne par test, quatre colonnes : le
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
                      : [argvOf(test).length ? commandLine(test) : '', valeursEntrée]
                          .filter(Boolean)
                          .join(' · ') || '(rien)'}
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

/**
 * Un test, ouvert ou replié. Replié, il se réduit à sa phrase de correction :
 * dix tests se relisent d'un coup d'œil, et l'on ouvre celui qu'on veut
 * reprendre au lieu de faire défiler dix formulaires.
 */
function TestCard({
  test,
  index,
  callable,
  showComparison,
  open,
  onToggle,
  onChange,
  onDuplicate,
  onRemove,
}) {
  const criterion = callable.find((c) => c.id === test.target_id);
  const texte = comparesText(criterion);
  const issues = testIssues(test, callable);
  const incomplet = issues.length > 0 ? 'test-carte--incomplet' : '';

  const actions = (
    <div className="test-carte-actions">
      <Button
        variant="ghost"
        size="small"
        title="Même forme, d'autres valeurs : copiez le test puis changez-les"
        onClick={onDuplicate}
      >
        Dupliquer
      </Button>
      <Button variant="danger-ghost" size="small" onClick={onRemove}>
        Retirer
      </Button>
    </div>
  );

  if (!open) {
    return (
      <article className={`test-carte test-carte--repliee ${incomplet}`.trim()}>
        <button
          type="button"
          className="test-carte-ligne"
          aria-expanded="false"
          title="Modifier ce test"
          onClick={onToggle}
        >
          <span className="test-carte-numero">{index + 1}</span>
          <span className="test-carte-ligne-nom">{test.name || `Test ${index + 1}`}</span>
          <code className="test-carte-ligne-resume">{testSummary(test, criterion)}</code>
          {issues.length > 0 && <Tag tone="warning">À compléter</Tag>}
        </button>
        {actions}
      </article>
    );
  }

  return (
    <article className={`test-carte ${incomplet}`.trim()}>
      <header className="test-carte-tete">
        <span className="test-carte-numero">{index + 1}</span>
        <input
          className="test-carte-nom"
          aria-label="Nom du test"
          value={test.name ?? ''}
          placeholder={`Test ${index + 1}`}
          onChange={(e) => onChange({ name: e.target.value })}
        />
        {actions}
        <Button variant="secondary" size="small" aria-expanded="true" onClick={onToggle}>
          Replier
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

      {!criterion && (
        <Etape
          numero="2 bis"
          titre="Les arguments de la ligne de commande"
          aide="Facultatif. Séparés par des espaces : « 40 » lance ./programme 40, que main lit dans argv."
        >
          <ArgvInput test={test} onChange={onChange} />
        </Etape>
      )}

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
                  {mode.label} : {mode.hint}
                </option>
              ))}
            </select>
          </label>
        )}
      </Etape>

      <p className="test-resume">{testSummary(test, criterion)}</p>
      {issues.length > 0 && <p className="test-alerte">À compléter : {issues.join(' · ')}.</p>}
    </article>
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
  // Où s'ouvre le choix de la cible : en haut, ou sous le dernier test quand on
  // a cliqué le bouton du bas : pas à l'autre bout d'une longue liste.
  const [picking, setPicking] = useState(null);
  // Un seul test ouvert à la fois. On ouvre d'emblée le premier qui reste à
  // compléter : c'est là que l'enseignant a quelque chose à faire.
  const [open, setOpen] = useState(() => {
    const incomplet = tests.findIndex((t) => testIssues(t, callable).length > 0);
    if (incomplet !== -1) return incomplet;
    return tests.length === 1 ? 0 : null;
  });

  const add = (target_id) => {
    onChange([
      ...tests,
      { ...template, name: `Test ${tests.length + 1}`, target_id, args: [], input_types: [] },
    ]);
    setOpen(tests.length);
    setPicking(null);
  };
  // Sans fonction déclarée, il n'y a rien à choisir : le test porte sur le programme.
  const startAdd = (where) => (callable.length > 0 ? setPicking(where) : add(null));

  /* La copie perd son identité serveur : c'est un nouveau test, rangé juste
     après son modèle et ouvert pour qu'on en change les valeurs. */
  const duplicate = (index) => {
    const source = tests[index];
    const copy = { ...source, name: `${source.name || `Test ${index + 1}`} (copie)` };
    delete copy.id;
    delete copy.position;
    onChange([...tests.slice(0, index + 1), copy, ...tests.slice(index + 1)]);
    setOpen(index + 1);
  };

  const remove = (index) => {
    onChange(tests.filter((_, i) => i !== index));
    setOpen((o) => (o === null || o === index ? null : o > index ? o - 1 : o));
  };

  const picker = (
    <CiblePicker callable={callable} onPick={add} onCancel={() => setPicking(null)} />
  );
  const incomplets = tests.filter((t) => testIssues(t, callable).length > 0).length;

  return (
    <section className="tests-editeur">
      <header className="tests-tete">
        <div>
          <strong className="tests-tete-titre">
            Jeux de tests{tests.length > 0 ? ` · ${tests.length}` : ''}
          </strong>
          <p className="sub" style={{ margin: '2px 0 0', fontSize: 12 }}>
            {tests.length > 1
              ? `Cliquez sur un test pour le modifier.${
                  incomplets ? ` ${incomplets} reste${incomplets > 1 ? 'nt' : ''} à compléter.` : ''
                }`
              : 'Chaque test fait tourner la copie sur des valeurs choisies et compare le résultat obtenu à celui que vous attendez.'}
          </p>
        </div>
        {!picking && (
          <Button
            variant="secondary"
            size="small"
            style={{ marginLeft: 'auto' }}
            onClick={() => startAdd('haut')}
          >
            + Ajouter un test
          </Button>
        )}
      </header>

      {picking === 'haut' && picker}

      {tests.length === 0 && !picking && (
        <div className="tests-vide">
          <strong style={{ fontSize: 13 }}>Aucun test pour l'instant</strong>
          <p className="sub" style={{ margin: '4px 0 12px' }}>
            Sans test, cet exercice ne pourra pas être corrigé automatiquement : seules
            les déclarations attendues seront vérifiées.
          </p>
          <Button onClick={() => startAdd('haut')}>+ Ajouter un premier test</Button>
        </div>
      )}

      {tests.map((test, index) => (
        <TestCard
          key={test.id ?? `new-${index}`}
          test={test}
          index={index}
          callable={callable}
          showComparison={showComparison}
          open={open === index}
          onToggle={() => setOpen(open === index ? null : index)}
          onChange={(patch) =>
            onChange(tests.map((t, i) => (i === index ? { ...t, ...patch } : t)))
          }
          onDuplicate={() => duplicate(index)}
          onRemove={() => remove(index)}
        />
      ))}

      {picking === 'bas' && picker}
      {tests.length >= 3 && !picking && (
        <Button
          variant="secondary"
          size="small"
          style={{ justifySelf: 'start' }}
          onClick={() => startAdd('bas')}
        >
          + Ajouter un test
        </Button>
      )}

      {/* Replié par défaut : les tests repliés se lisent déjà ligne à ligne ;
          le tableau sert à relire les types d'un bloc, quand on le demande. */}
      {tests.length > 1 && (
        <Disclosure
          summary="Récapitulatif des tests"
          hint="Ce qui entre et ce qui doit sortir, test par test, avec les types."
        >
          <TestsRecap tests={tests} callable={callable} />
        </Disclosure>
      )}
    </section>
  );
}
