import { Link } from 'react-router-dom';
import '../styles/landing.css';

const STEPS = [
  {

    title: 'Créer les évaluations',
    text:
      "Vous rédigez les exercices, le code de départ et les jeux de tests, puis vous ouvrez l'épreuve à votre classe.",
    Illustration: PrepareSheet,
  },
  {

    title: 'Composer',
    text:
      "L'étudiant écrit son programme en plein écran, sans pouvoir l'exécuter, comme sur papier. Chaque frappe est sauvegardée.",
    Illustration: ExamSheet,
  },
  {
    title: 'Corriger sans se fatiguer, puis publier',
    text:
      "Un clic lance la correction : CodEval compile, exécute les tests en bac à sable et note chaque copie. Vous relisez, puis publiez les résultats.",
    Illustration: ResultsSheet,
  },
  {
    title: 'Recevoir ses résultats',
    text:
      "Dès la publication, chaque étudiant voit sa note et le détail par exercice : les tests réussis et ceux qui ont échoué.",
    Illustration: StudentResultSheet,
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
              <p className="landing-kicker">CodEval, l'évaluation de code sur machine</p>
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
            <h2 className="landing-h2">Comment ça fonctionne</h2>
            <p className="landing-body landing-body--narrow">
              Quatre temps, dans cet ordre. De la création de l'épreuve aux résultats des étudiants, rien ne sort
              de la plateforme.
            </p>
            <ol className="landing-how">
              {STEPS.map(({  title, text, Illustration }, index) => (
                <li key={title} className="landing-how-step">
                  <div className="landing-how-text">
                    <h3>{String(index + 1).padStart(2, '0')} · {title}</h3>
                    <p>{text}</p>
                  </div>
                  <Illustration />
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

/** Étape 1 : les jeux de tests d'un exercice, le barème posé en dernier. */
function PrepareSheet() {
  return (
    <figure className="landing-sheet landing-sheet--small" aria-label="Exemple de jeux de tests">
      <div className="landing-sheet-head">
        <span>Exercice 2 · Jeux de tests</span>
      </div>
      <table className="landing-mini-table">
        <thead>
          <tr><th>Entrée</th><th>Sortie attendue</th><th>Points</th></tr>
        </thead>
        <tbody>
          <tr><td>5</td><td>15</td><td>2</td></tr>
          <tr><td>1</td><td>1</td><td>2</td></tr>
          <tr><td>70000</td><td>2450035000</td><td>2</td></tr>
        </tbody>
      </table>
      <p className="landing-pen landing-pen--inline" aria-hidden="true">Total : 6 points</p>
    </figure>
  );
}

/** Étape 2 : la salle d'examen, sans bouton pour exécuter. */
function ExamSheet() {
  return (
    <figure className="landing-sheet landing-sheet--small landing-sheet--tilt landing-exam" aria-label="Exemple d'écran d'épreuve">
      <div className="landing-exam-bar">
        <span>Exercice 2 sur 4</span>
        <span className="landing-exam-timer">00:42:15</span>
      </div>
      <pre className="landing-code">
        <code>
          {'    '}<span className="tk-kw">for</span> (i = <span className="tk-num">1</span>; i &lt;= n; i++){'\n'}
          {'        '}s += i;{'\n'}
          {'    '}<span className="tk-fn">printf</span>(<span className="tk-str">"%lld"</span>, s)<span className="landing-caret" />
        </code>
      </pre>
      <div className="landing-exam-foot">
        <span className="landing-exam-saved">Enregistré il y a 2 s</span>
        <span className="landing-exam-run">Exécution désactivée</span>
      </div>
    </figure>
  );
}

/** Étape 3 : la correction note les copies, vous relisez puis publiez. */
function ResultsSheet() {
  return (
    <figure className="landing-sheet landing-sheet--small" aria-label="Exemple de résultats">
      <div className="landing-sheet-head">
        <span>Devoir 3 · Boucles</span>
        <span className="landing-mini-muted">clos à 10 h 00</span>
      </div>
      <ul className="landing-grades">
        <li><span>Aya Koné</span><b>18<small>/20</small></b></li>
        <li><span>Yao Kouassi</span><b>14<small>/20</small></b></li>
        <li><span>Fatou Traoré</span><b>11,5<small>/20</small></b></li>
      </ul>
      <div className="landing-grades-foot">
        <span className="landing-mini-muted">32 copies notées</span>
        <span className="landing-mini-btn">Publier les notes</span>
      </div>
    </figure>
  );
}

/** Étape 4 : l'étudiant reçoit sa note et le détail par exercice. */
function StudentResultSheet() {
  return (
    <figure className="landing-sheet landing-sheet--small landing-sheet--tilt" aria-label="Exemple de résultat étudiant">
      <div className="landing-sheet-head">
        <span>Devoir 3 · Boucles<br /><span className="landing-mini-muted">Aya Koné</span></span>
        <span className="landing-sheet-grade">18<small>/20</small></span>
      </div>
      <ul className="landing-mini-list">
        <li>Exercice 1<span>5 / 5</span></li>
        <li>Exercice 2<span>6 / 6</span></li>
        <li>Exercice 3<span>4 / 6 · 1 test échoué</span></li>
        <li>Exercice 4<span>3 / 3</span></li>
      </ul>
    </figure>
  );
}
