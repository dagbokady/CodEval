# CodEval — frontend

Interface web de la plateforme d'évaluation : React 19, Vite, React Router et TanStack
Query. Trois espaces distincts — enseignant, apprenant, établissement — servis par la
même application.

## Prérequis

- Node.js 20 ou plus
- L'API en fonctionnement (voir `../backend/README.md`)

## Installation et lancement

```bash
npm install
```

Si l'API n'écoute pas sur `http://localhost:8000`, créer un fichier `.env` à partir de
`.env.example` et y ajuster `VITE_API_URL` :

```bash
cp .env.example .env
```

```bash
npm run dev
```

L'interface est servie sur <http://localhost:5173>.

| Commande | Effet |
| --- | --- |
| `npm run dev` | serveur de développement avec rechargement à chaud |
| `npm run build` | build de production dans `dist/` |
| `npm run preview` | sert le build de production |
| `npm run lint` | ESLint (règles React et hooks) |

## Organisation du code

```
src/
  main.jsx              point d'entrée : QueryClient, AuthProvider, routeur
  routes.jsx            table de routage et rôles autorisés par écran
  format.js             formatage des dates, durées, notes et libellés de statut
  starterCode.js        squelettes de départ par langage (miroir du serveur)
  useNow.js             horloge partagée pour les décomptes
  api/
    client.js           appel HTTP unique : jeton, erreurs, déconnexion sur 401
    hooks.js            requêtes TanStack Query (listes, détails, mutations)
  auth/
    context.js          contexte, hook useAuth, écran d'accueil par rôle
    AuthProvider.jsx    session : restauration, connexion, inscription, déconnexion
  components/
    AppShell.jsx        gabarit : barre latérale par rôle, zone de contenu
    Protected.jsx       garde de route (authentification et rôle)
    ui.jsx              bibliothèque d'éléments : boutons, champs, tags, tableaux…
    SubjectSheet.jsx    feuille de sujet mise en page comme une épreuve officielle
    icons.jsx           icônes SVG reprises du système de design Figma
  pages/
    LoginPage, RegisterPage, SettingsPage
    teacher/            accueil, évaluations, éditeur en 4 étapes, suivi de
                        session, résultats, détail d'une soumission (avec
                        appréciations), classes, banque d'exercices
    student/            liste des évaluations, épreuve, résultats et copies
    admin/              tableau de bord établissement, utilisateurs
  styles/tokens.css     jetons de design (couleurs, rayons, typographie)
```

## Conventions

**Données.** Tout passe par `api/client.js` : il ajoute le jeton, normalise les
messages d'erreur de l'API et redirige vers la connexion sur une réponse 401. Les
écrans consomment des hooks de `api/hooks.js` plutôt que `fetch` directement, ce qui
donne gratuitement le cache, les états de chargement et l'invalidation après mutation.
Chaque écran traite explicitement les trois états : chargement, erreur, liste vide.

**Rafraîchissement.** Le suivi de session interroge l'API toutes les 5 secondes, la
page de résultats toutes les 3 secondes tant qu'une campagne est en cours, puis
s'arrête. Le navigateur suspend ces rafraîchissements quand l'onglet est en arrière-plan.

**État local.** Pas de synchronisation d'état serveur vers l'état local dans un effet :
les formulaires initialisent leur état à partir des données et sont remontés par une
`key` quand la ressource change ; les décomptes sont dérivés de l'échéance renvoyée par
le serveur via `useNow`.

**Styles.** CSS global unique (`index.css`) construit sur les jetons de
`styles/tokens.css`, extraits de la maquette Figma. Pas de framework CSS ni de styles
par composant : les écrans reprennent des classes partagées (`card`, `table-wrap`,
`chip-bar`, `page-header`…). La barre latérale se replie en barre d'icônes sous 900 px.

**Épreuve.** L'écran d'épreuve a son propre thème sombre et son propre gabarit. Il est
chargé à la demande (`pages/student/LazyExamPage.jsx`) : l'éditeur CodeMirror forme un
bundle séparé qui n'est jamais téléchargé par un enseignant. La sauvegarde automatique
part 3 secondes après la dernière frappe, au plus tard toutes les 20 secondes, et avant
toute fermeture ou passage en arrière-plan ; chaque enregistrement porte un numéro de
version qui empêche une réponse tardive d'écraser une saisie plus récente.

**Sujet.** `components/SubjectSheet.jsx` rend la feuille comme une épreuve imprimée :
en-tête établissement et session, cartouche « ÉPREUVE / Durée », filet, consignes en
italique, puis les questions regroupées par type (« QUESTIONS À CHOIX MULTIPLES (QCM) »,
« EXERCICES DE PROGRAMMATION »…), numérotées Q1, Q2… avec leurs propositions en
a) b) c) d). Les trois écrans qui montrent le sujet — aperçu de l'enseignant, « Sujet
complet » de l'apprenant, copie corrigée — passent par ce composant pour ne jamais
diverger ; les tailles étant en `em`, l'aperçu n'est que la même feuille en plus petit.

**Copies.** `/mes-resultats/:evaluationId` présente la copie de l'apprenant comme une
feuille : énoncés, production rendue, puis — une fois la correction validée et publiée
par l'enseignant — la note et les appréciations. Avant publication, la copie reste
consultable sans note ni corrigé.

## Rôles et navigation

| Rôle | Écran d'accueil | Accès |
| --- | --- | --- |
| Enseignant | `/accueil` | accueil (indicateurs, sessions en cours, corrections en attente), évaluations, sessions, résultats, classes, statistiques, banque d'exercices |
| Établissement | `/etablissement` | tableau de bord, utilisateurs, classes, évaluations |
| Apprenant | `/mes-evaluations` | épreuves ouvertes, épreuve en cours, copies rendues et résultats publiés |

Les gardes de route sont un confort d'interface : l'autorisation réelle est appliquée
par l'API sur chaque requête.

## Build

`npm run build` produit deux entrées principales : l'application (~378 ko, 114 ko
compressés) et l'éditeur de code chargé à la demande (~578 ko, 193 ko compressés).
