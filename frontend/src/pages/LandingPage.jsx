import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../useDocumentTitle';
import '../styles/landing.css';

const STEPS = [
  {
    title: 'Préparer',
    text:
      "Vous rédigez les exercices, le code de départ et les jeux de tests. Le barème se pose en dernier, une fois les tests écrits.",
  },
  {
    title: 'Composer',
    text:
      "Vos étudiants écrivent leur programme dans un environnement contrôlé, sans pouvoir l'exécuter. Chaque frappe est sauvegardée.",
  },
  {
    title: 'Corriger',
    text:
      "À la clôture, les copies sont figées. CodEval compile, exécute les tests en bac à sable et note chaque exercice. Vous relisez, puis publiez.",
  },
];

const QUESTION_TYPES = [
  ['Exercice de code', 'compilé et exécuté sur vos tests'],
  ["Exercice d'algorithmique", 'pseudo-code en blocs, traduit puis exécuté'],
  ['QCM', 'une ou plusieurs bonnes réponses'],
  ['Correspondance', 'relier deux colonnes'],
  ['Vrai ou faux', 'avec pénalité facultative'],
  ['Réponse courte', 'comparée à une liste de réponses admises'],
];

const GUARANTEES = [
  ['Sauvegarde continue', 'Une coupure de courant ne coûte pas la copie : le brouillon repart du dernier état.'],
  ['Plein écran et collage bloqué', "Selon les règles que vous fixez pour l'épreuve."],
  ['Incidents journalisés', 'Sortie du plein écran, changement de fenêtre : vous les voyez en direct.'],
  ['Copies figées à la clôture', "Aucune écriture n'est acceptée une fois le temps écoulé."],
];

/** Page d'accueil publique : ce qu'est CodEval, pour qui, et comment on y entre. */
export default function LandingPage() {
  useDocumentTitle('Évaluation pratique en programmation');
  return (
    <div className="landing">
      <header className="landing-top">
        <div className="landing-wrap landing-top-inner">
          <Link to="/" className="brand landing-brand">
            <span className="brand-icon" aria-hidden="true">&lt;/&gt;</span>
            CodEval
          </Link>
          <nav className="landing-nav" aria-label="Sections">
            <a href="#fonctionnement">Fonctionnement</a>
            <a href="#langages">Langages</a>
            <a href="#epreuve">L'épreuve</a>
          </nav>
          <div className="landing-top-actions">
            <Link to="/connexion" className="btn secondary">Se connecter</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-wrap landing-hero-grid">
            <div className="landing-hero-text">
              <h1>
                L'épreuve se passe sur machine.
                <br />
                La correction tombe à la clôture.
              </h1>
              <p className="landing-lead">
                Vous préparez l'évaluation et ses jeux de tests. Vos étudiants composent sans
                pouvoir exécuter leur code, comme sur papier. Dès que le temps est écoulé,
                chaque copie est compilée, testée et notée.
              </p>
              <div className="landing-cta">
                <Link to="/inscription" className="btn large">Créer mon espace enseignant</Link>
                <Link to="/rejoindre" className="btn secondary large">J'ai un code de classe</Link>
              </div>
            </div>
            <CopySheet />
          </div>
        </section>

        <section className="landing-section" id="fonctionnement">
          <div className="landing-wrap">
            <h2 className="landing-h2">Trois temps, dans cet ordre</h2>
            <ol className="landing-steps">
              {STEPS.map((step, index) => (
                <li key={step.title}>
                  <span className="landing-step-num">{String(index + 1).padStart(2, '0')}</span>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-section landing-section--tray" id="langages">
          <div className="landing-wrap landing-split">
            <div>
              <h2 className="landing-h2">Le langage du cours, pas un autre</h2>
              <p className="landing-body">
                Chaque matière porte son langage : l'enseignant le choisit en la créant, et il
                s'impose à toutes ses épreuves. L'administration décide des langages ouverts
                sur la plateforme.
              </p>
              <ul className="landing-langs">
                <li><b>Langage C</b><span>compilé avec gcc, exécuté sur vos tests</span></li>
                <li><b>Algorithmique</b><span>la notation de votre cours, mots-clés en rouge</span></li>
                <li><b>C++ et Python</b><span>Bientôt disponibles</span></li>
              </ul>
            </div>
            <AlgoSheet />
          </div>
        </section>

        <section className="landing-section">
          <div className="landing-wrap">
            <h2 className="landing-h2">Six types de questions dans une même épreuve</h2>
            <p className="landing-body landing-body--narrow">
              Les quatre derniers se corrigent par comparaison, sans exécution. Les deux premiers
              passent par le compilateur.
            </p>
            <dl className="landing-types">
              {QUESTION_TYPES.map(([name, detail]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="landing-section landing-section--tray" id="epreuve">
          <div className="landing-wrap landing-split landing-split--even">
            <div>
              <h2 className="landing-h2">Une salle d'examen, dans le navigateur</h2>
              <p className="landing-body">
                L'étudiant entre avec le code de sa classe ou le lien que vous lui envoyez. Il
                compose en plein écran, pendant que vous suivez la session : qui a commencé, qui a
                rendu, ce qui s'est passé.
              </p>
            </div>
            <ul className="landing-guarantees">
              {GUARANTEES.map(([title, text]) => (
                <li key={title}>
                  <b>{title}</b>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="landing-final">
          <div className="landing-wrap landing-final-inner">
            <h2>Votre prochain devoir sur machine commence ici.</h2>
            <div className="landing-cta">
              <Link to="/inscription" className="btn large">Créer mon espace enseignant</Link>
              <Link to="/connexion" className="btn secondary large">Se connecter</Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-foot">
        <div className="landing-wrap landing-foot-inner">
          <span className="brand landing-brand">
            <span className="brand-icon" aria-hidden="true">&lt;/&gt;</span>
            CodEval
          </span>
          <span>Évaluation pratique en programmation et en algorithmique.</span>
        </div>
      </footer>
    </div>
  );
}

/** Une copie corrigée : le programme de l'étudiant, et la note au stylo rouge. */
function CopySheet() {
  return (
    <figure className="landing-sheet" aria-label="Exemple de copie corrigée">
      <div className="landing-sheet-head">
        <span>Exercice 2 · Somme des n premiers entiers</span>
        <span className="landing-sheet-grade">
          4<small>/6</small>
        </span>
      </div>
      <pre className="landing-code">
        <code>
          <span className="tk-pre">#include</span> <span className="tk-str">&lt;stdio.h&gt;</span>{'\n\n'}
          <span className="tk-type">int</span> <span className="tk-fn">main</span>(<span className="tk-type">void</span>){'\n'}
          {'{\n'}
          {'    '}<span className="tk-type">int</span> n, i, s = <span className="tk-num">0</span>;{'\n'}
          {'    '}<span className="tk-fn">scanf</span>(<span className="tk-str">"%d"</span>, &amp;n);{'\n'}
          {'    '}<span className="tk-kw">for</span> (i = <span className="tk-num">1</span>; i &lt;= n; i++){'\n'}
          {'        '}s += i;{'\n'}
          {'    '}<span className="tk-fn">printf</span>(<span className="tk-str">"%d"</span>, s);{'\n'}
          {'    '}<span className="tk-kw">return</span> <span className="tk-num">0</span>;{'\n'}
          {'}'}
        </code>
      </pre>
      <ul className="landing-tests">
        <li className="ok"><span>n = 5</span><span>15</span></li>
        <li className="ok"><span>n = 1</span><span>1</span></li>
        <li className="ko"><span>n = 70000</span><span>attendu 2450035000</span></li>
      </ul>
      <p className="landing-pen" aria-hidden="true">Dépassement : prends un long long</p>
    </figure>
  );
}

/** Le même exercice, dans la notation du cours d'algorithmique. */
function AlgoSheet() {
  return (
    <figure className="landing-sheet landing-sheet--algo" aria-label="Exemple d'algorithme">
      <pre className="landing-code landing-code--algo">
        <code>
          <span className="kw">ALGORITHME</span> Somme{'\n'}
          <span className="kw">VARIABLES</span>{'\n'}
          {'    '}n, i, s : entier{'\n'}
          <span className="kw">DEBUT</span>{'\n'}
          {'    '}LIRE(n){'\n'}
          {'    '}s ← 0{'\n'}
          {'    '}POUR i ← 1 A n FAIRE{'\n'}
          {'        '}s ← s + i{'\n'}
          {'    '}FINPOUR{'\n'}
          {'    '}ECRIRE(s){'\n'}
          <span className="kw">FIN</span>
        </code>
      </pre>
    </figure>
  );
}
