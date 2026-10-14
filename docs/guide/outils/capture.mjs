// Captures du guide : ressaisit les trois sujets dans l'interface, geste par geste.
// Usage : node capture.mjs <dossier-sortie> [algo] [cdevoir] [cexamen]
import fs from 'node:fs';
import path from 'node:path';
import { login, apiCall, openBrowser, prepare, shot, WEB } from './lib.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const OUT = path.resolve(process.argv[2]);
const ONLY = new Set(process.argv.slice(3));
const want = (k) => ONLY.size === 0 || ONLY.has(k);
const STATE = path.join(HERE, 'state.json');
const data = (id) => JSON.parse(fs.readFileSync(path.join(HERE, `eval-${id}.json`), 'utf8'));

const token = await login();
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const { browser, page } = await openBrowser(token, { width: 1440, height: 1000 });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));

/* ---------- petits outils ---------- */
// Ce qu'on masque pour laisser de la place aux étiquettes, de part et d'autre de la zone.
const CARD = ['nav.sidebar', '.sheet-preview', '.wizard-nav', '.alert'];
const TESTS = ['nav.sidebar', '.tests-rail', '.wizard-nav', '.alert', '.step-intro'];
const publicationCard = () => page.locator('section.card', { has: page.locator('h2', { hasText: /^Publication$/ }) });
const SETUP_ONLY = (k) => ['nav.sidebar', '.setup-recap', '.wizard-nav', '.alert', '.setup-form > .disclosure',
  ...[1, 2, 3, 4].filter((n) => !k.includes(n)).map((n) => `.setup-form > .form-section:nth-child(${n})`)];
const sleep = (ms) => page.waitForTimeout(ms);
const btn = (name, opts = {}) => page.getByRole('button', { name, exact: opts.exact ?? false });
const field = (inputSel) => page.locator('.field', { has: page.locator(inputSel) }).last();
const card = (i) => page.locator('.exercises-editor > div > article.card').nth(i);
const headerRow = () => page.locator('section', { has: page.getByRole('heading', { name: 'Exercices & objectifs' }) }).locator(':scope > div').first();

async function cleanup(key) {
  for (const id of state[key] ?? []) {
    try { await apiCall(token, `/api/evaluations/${id}`, { method: 'DELETE' }); } catch (e) { console.log('  (déjà supprimée)', id); }
  }
  state[key] = [];
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
}
function remember(key, id) {
  state[key] = [...(state[key] ?? []), Number(id)];
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2));
}

async function goto(url) {
  await page.goto(WEB + url);
  await page.waitForLoadState('networkidle');
  await prepare(page);
}

function dir(name) {
  const d = path.join(OUT, name);
  fs.mkdirSync(d, { recursive: true });
  return (f) => path.join(d, `${f}.png`);
}

/* ---------- étape 1 : paramètres ---------- */
async function parametres(f, ev, { classe, matiere, withMenu, kindLabel }) {
  if (withMenu) {
    await goto('/evaluations');
    await shot(page, f('p0-menu'), {
      region: [page.locator('nav.sidebar .sidebar-brand, nav.sidebar a').first(), page.getByRole('link', { name: 'Statistiques' })],
      marks: [{ el: page.getByRole('link', { name: 'Créer une évaluation' }), n: null, label: 'Cliquez sur<br>« Créer une évaluation »', side: 'right', dist: 70 }],
      extend: { right: 30 },
    });
  }
  await goto('/evaluations/nouvelle');
  await page.locator('#title').fill(ev.title);
  await page.getByRole('radio', { name: new RegExp(kindLabel) }).click();
  await shot(page, f('p1-epreuve'), {
    region: page.locator('.form-section').nth(0),
    hide: SETUP_ONLY([1]),
    marks: [
      { el: page.locator('#title'), n: 1, label: 'Le titre<br>du sujet', side: 'left', dist: 44 },
      { el: page.getByRole('radio', { name: new RegExp(kindLabel) }), n: 2, label: `Le type :<br>${kindLabel}`, side: 'left', dist: 44 },
    ],
  });
  await page.locator('#classroom').selectOption({ label: classe });
  await page.locator('#subject').selectOption({ label: matiere });
  await shot(page, f('p2-pour-qui'), {
    region: page.locator('.form-section').nth(1),
    hide: SETUP_ONLY([2]),
    marks: [
      { el: page.locator('#classroom'), n: 3, label: 'La classe<br>qui compose', side: 'left', dist: 44 },
      { el: page.locator('#subject'), n: 4, label: 'La matière : elle fixe le langage', side: 'bottom', dist: 44, nowrap: true },
    ],
    extend: { bottom: 10 },
  });
  await page.locator('.duration-presets').getByRole('button', { name: '2h', exact: true }).click();
  await page.locator('#points').fill(String(ev.total_points));
  await page.locator('#instructions').fill(ev.instructions);
  await growTextarea('#instructions');
  const note = page.locator('.setup-form p.sub').filter({ hasText: /Épreuve algorithmique|Langage des exercices/ });
  await shot(page, f('p3-deroulement'), {
    region: [page.locator('.form-section').nth(2), page.locator('.form-section').nth(3)],
    hide: SETUP_ONLY([3, 4]),
    marks: [
      { el: page.locator('.duration-presets').getByRole('button', { name: '2h', exact: true }), n: 5, badge: 't', badgeDy: -12, boxPad: 4 },
      { el: page.locator('#points'), n: 6, label: 'Barème : 20', side: 'bottom', dist: 26, nowrap: true },
      { el: note, n: 7, tone: 'blue', badge: 'tl', label: 'Lu selon<br>la matière', side: 'left', dist: 44 },
      { el: page.locator('#instructions'), n: 8, label: "L'en-tête et<br>les consignes<br>du sujet", side: 'left', dist: 44 },
    ],
  });
  await shot(page, f('p4-enregistrer'), {
    region: page.locator('.wizard-nav'),
    marks: [{ el: btn('Enregistrer et continuer'), n: 9, label: 'Enregistrer et passer aux exercices', side: 'top', dist: 34, dx: -150, nowrap: true }],
    hide: ['.setup-layout', '.alert'],
    top: 600,
  });
  await btn('Enregistrer et continuer').click();
  await page.waitForURL(/\/evaluations\/\d+$/);
  await page.waitForLoadState('networkidle');
  await prepare(page);
  const id = page.url().match(/evaluations\/(\d+)/)[1];
  await page.getByRole('heading', { name: 'Exercices & objectifs' }).waitFor();
  return id;
}

/* ---------- étape 2 : ajouter un exercice d'un type ---------- */
async function ajouter(f, prefix, typeBadge, typeLabelForArrow, { first = false } = {}) {
  const addBtn = btn('+ Ajouter un exercice');
  await shot(page, f(`${prefix}-01-ajouter`), {
    region: first ? [headerRow(), page.locator('.exercises-editor .card').first()] : headerRow(),
    marks: [{ el: addBtn, n: 1, label: 'Cliquez ici', side: 'bottom', dist: 40, dx: -40, nowrap: true }],
    hide: CARD,
    extend: { bottom: 8 },
  });
  await addBtn.click();
  const picker = page.locator('.type-picker');
  await picker.waitFor();
  const cardBtn = picker.locator('.type-card', { hasText: typeBadge }).first();
  await shot(page, f(`${prefix}-02-type`), {
    region: picker,
    hide: CARD,
    marks: [{ el: cardBtn, n: 2, label: typeLabelForArrow, side: 'right', dist: 60, maxw: 280 }],
    extend: { right: 10 },
  });
  await cardBtn.click();
  await sleep(200);
}

async function remplirEntete(i, ex) {
  await page.locator(`#t-${i}`).fill(ex.title);
  if (await page.locator(`#s-${i}`).count()) await page.locator(`#s-${i}`).fill(ex.statement);
}

async function growTextarea(sel) {
  await page.locator(sel).evaluate((el) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 6}px`;
  });
}

/** La dernière ligne de texte d'une zone de saisie agrandie, en coordonnées de la fenêtre. */
function lastLine(sel) {
  return () => page.locator(sel).evaluate((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4;
    const bottom = r.top + parseFloat(cs.borderTopWidth) + el.scrollHeight - parseFloat(cs.paddingBottom);
    const last = el.value.split('\n').pop();
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const w = Math.min(ctx.measureText(last).width, r.width - 30);
    return { x: r.left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth), y: bottom - lh, w, h: lh };
  });
}

async function enteteShot(f, prefix, i, { statementLabel = "L'énoncé, recopié du sujet", extraMarks = [] } = {}) {
  const hasStatement = await page.locator(`#s-${i}`).count();
  if (hasStatement) await growTextarea(`#s-${i}`);
  await shot(page, f(`${prefix}-03-entete`), {
    region: [field(`#t-${i}`), field(`#k-${i}`), ...(hasStatement ? [field(`#s-${i}`)] : [])],
    hide: CARD,
    marks: [
      { el: page.locator(`#t-${i}`), n: 3, label: "L'intitulé", side: 'left', dist: 44, nowrap: true },
      { el: page.locator(`#k-${i}`), n: 4, label: 'Le type, déjà choisi', side: 'right', dist: 40, nowrap: true },
      ...(hasStatement ? [{ el: page.locator(`#s-${i}`), n: 5, label: statementLabel, side: 'right', dist: 40, maxw: 230 }] : []),
      ...extraMarks,
    ],
  });
}

/* ---------- épreuve 1 : devoir d'algorithmique ---------- */
async function algo() {
  console.log('Devoir d’initiation algorithmique');
  await cleanup('algo');
  const ev = data(9);
  const f = dir('algo');
  const id = await parametres(f, ev, { classe: 'SRIT1 A (1 étudiant)', matiere: 'Initiation algorithmique', withMenu: true, kindLabel: 'Devoir' });
  remember('algo', id);

  /* --- Exercice 1 : simulation --- */
  const ex1 = ev.exercises[0];
  await ajouter(f, 'e1', 'Simulation', "Choisissez « Simulation » :<br>tableau de simulation à remplir", { first: true });
  await remplirEntete(0, ex1);
  await enteteShot(f, 'e1', 0);

  await page.locator('#tr-0-algo').fill(ex1.settings.algorithm);
  await growTextarea('#tr-0-algo');
  await shot(page, f('e1-04-algorithme'), {
    region: field('#tr-0-algo'),
    hide: CARD,
    marks: [{ el: page.locator('#tr-0-algo'), n: 6, label: "Collez l'algorithme du sujet,<br>avec ses numéros de ligne", side: 'right', dist: 40, dy: -100 }],
  });

  // Le tableau tel qu'il naît : trois colonnes, deux lignes.
  const table = card(0).locator('.trace-grid--edit');
  const traceBlock = [card(0).locator('strong', { hasText: 'Tableau de simulation attendu' }), card(0).locator('.trace-scroll'), btn('+ Ajouter une colonne')];
  await shot(page, f('e1-05-tableau-vide'), {
    region: traceBlock,
    hide: CARD,
    marks: [
      { el: table.locator('thead .trace-col-title').nth(2), n: 7, label: 'Le titre de la colonne :<br>cliquez et tapez', side: 'right', dist: 70, dy: -36 },
      { el: table.locator('thead .trace-given-toggle').nth(0), n: 8, label: '« fournie » :<br>remplie d’avance<br>sur la feuille<br>de l’étudiant', side: 'left', dist: 60, dy: 30 },
      { el: btn('+ Ajouter une ligne'), n: 9, badge: 'tl', label: 'Une ligne de plus', side: 'left', dist: 60, nowrap: true },
      { el: btn('+ Ajouter une colonne'), n: 10, label: 'Une colonne de plus', side: 'right', dist: 50, nowrap: true },
    ],
  });

  const { columns, rows } = ex1.settings;
  for (let k = 3; k < columns.length; k++) await btn('+ Ajouter une colonne').click();
  for (let k = 2; k < rows.length; k++) await btn('+ Ajouter une ligne').click();
  const titles = table.locator('thead .trace-col-title');
  for (let c = 0; c < columns.length; c++) await titles.nth(c).fill(columns[c].title);
  for (let r = 0; r < rows.length; r++) {
    const cells = table.locator('tbody tr').nth(r).locator('td input');
    for (let c = 0; c < columns.length; c++) {
      if ((await cells.nth(c).inputValue()) !== rows[r][c]) await cells.nth(c).fill(rows[r][c]);
    }
  }
  await sleep(200);
  const scroller = card(0).locator('.trace-scroll');
  const row = (r) => table.locator('tbody tr').nth(r);
  await scroller.evaluate((el) => { el.scrollLeft = 0; });
  await sleep(150);
  await shot(page, f('e1-06-tableau-gauche'), {
    region: [card(0).locator('strong', { hasText: 'Tableau de simulation attendu' }), scroller, btn('+ Ajouter une ligne')],
    hide: CARD,
    marks: [
      { el: [titles.nth(1), titles.nth(3)], n: 11, label: 'Une colonne<br>par variable', side: 'right', dist: 90, dy: -10, boxPad: 3 },
      { el: [row(0).locator('td').nth(1), row(19).locator('td').nth(1)], n: 12, label: 'Les numéros<br>d’instruction,<br>dans l’ordre<br>d’exécution', side: 'left', dist: 60, boxPad: 2 },
      { el: row(6).locator('td').nth(4), n: 13, label: 'La valeur<br>attendue', side: 'right', dist: 90, dy: -30, boxPad: 2 },
      { el: row(7).locator('td').nth(4), n: 14, label: 'Case vide :<br>non notée', side: 'right', dist: 90, dy: 50, boxPad: 2 },
    ],
  });
  await scroller.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await sleep(150);
  await shot(page, f('e1-07-tableau-droite'), {
    region: [card(0).locator('strong', { hasText: 'Tableau de simulation attendu' }), scroller, btn('+ Ajouter une ligne')],
    hide: CARD,
    marks: [
      { el: row(2).locator('td').nth(6), n: 15, label: 'Condition<br>du TANTQUE :<br>VRAI ou FAUX', side: 'left', dist: 70, boxPad: 2 },
      { el: row(3).locator('td').nth(7), n: 16, label: 'Ce qui s’affiche à l’écran', side: 'bottom', dist: 60, dx: 40, nowrap: true, boxPad: 2 },
      { el: row(19).locator('td').nth(7), n: 17, label: 'Deux réponses admises,<br>séparées par « | »', side: 'top', dist: 70, dx: 0, boxPad: 2 },
    ],
  });
  await scroller.evaluate((el) => { el.scrollLeft = 0; });

  const sol = card(0).getByRole('button', { name: /Corrigé proposé aux étudiants/ });
  await sol.click();
  await page.locator('#sol-0-notes').fill(ex1.settings.solution_notes);
  await shot(page, f('e1-08-corrige'), {
    region: card(0).locator('.disclosure', { has: page.getByRole('button', { name: /Corrigé proposé aux étudiants/ }) }),
    hide: CARD,
    marks: [{ el: page.locator('#sol-0-notes'), n: 18, label: 'Facultatif : montré aux<br>étudiants avec les notes', side: 'right', dist: 40 }],
  });
  await sol.click();

  const prevEx = page.locator('.sheet-preview article.sujet-question').nth(0);
  await prevEx.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await shot(page, f('e1-09-apercu'), {
    region: page.locator('.sheet-preview'),
    hide: ['.wizard-nav', '.exercises-editor', '.alert'],
    marks: [
      { el: prevEx.locator('.trace-scroll'), n: 19, label: 'L’étudiant reçoit<br>le tableau vide,<br>colonne N° remplie', side: 'left', dist: 50, tone: 'blue' },
    ],
    top: 40,
  });

  /* --- Exercices 2, 3, 4 : algorithmes à écrire --- */
  const extra = {
    1: { tag: 'e2' },
    2: { tag: 'e3' },
    3: { tag: 'e4' },
  };
  for (const i of [1, 2, 3]) {
    const ex = ev.exercises[i];
    const p = extra[i].tag;
    await ajouter(f, p, 'Algorithmique', 'Choisissez « Algorithmique » :<br>algorithme en blocs');
    await remplirEntete(i, ex);
    const marks = [];
    if (i === 2) {
      await growTextarea(`#s-${i}`);
      marks.push({ el: lastLine(`#s-${i}`), tone: 'blue', boxPad: 3, label: 'Phrase ajoutée :<br>l’ordre de saisie', side: 'right', dist: 60, dy: 40 });
    }
    await enteteShot(f, p, i, { extraMarks: marks });
    // Outils autorisés : le vocabulaire de base, plus SINONSI et REPETER.
    const outils = card(i).locator('.outils-editeur');
    for (const nom of ['SINONSI', 'REPETER']) {
      const chip = outils.locator('label.chip', { hasText: new RegExp(`^${nom}$`) });
      if (!(await chip.locator('input').isChecked())) await chip.locator('input').check();
    }
    await shot(page, f(`${p}-04-outils`), {
      region: [outils.locator('.outils-tete'), outils.locator('.outils-ecriture')],
      hide: CARD,
      marks: [
        { el: outils.locator('.outils-groupe').first(), n: 6, label: 'Les blocs que l’étudiant<br>pourra poser : cochez-les', side: 'right', dist: 40 },
        { el: outils.locator('label.chip', { hasText: /^SINONSI$/ }), n: 7, badge: 'tl', boxPad: 3 },
        { el: outils.locator('label.chip', { hasText: /^REPETER$/ }), boxPad: 3, label: 'SINONSI et REPETER :<br>cochez-les en plus', side: 'right', dist: 60 },
        { el: outils.locator('.outils-ecriture'), n: 8, label: 'Laissez coché', side: 'right', dist: 40, nowrap: true },
      ],
    });
  }

  await shot(page, f('x-etape-suivante'), {
    region: page.locator('.wizard-nav'),
    marks: [{ el: btn('Étape suivante'), n: 9, label: 'Enregistrer et passer à la correction', side: 'top', dist: 34, dx: -170, nowrap: true }],
    hide: ['.exercises-layout', '.alert', 'section > div:first-child'],
    top: 600,
  });
  await btn('Étape suivante').click();
  await page.locator('.tests-step').waitFor();
  await sleep(300);

  /* --- Étape 3 : jeux de tests --- */
  const rail = page.locator('.tests-rail');
  const panel = page.locator('.tests-panel');
  await shot(page, f('c0-vue'), {
    region: [page.locator('.step-intro'), rail, panel.locator('.tests-panel-head')],
    hide: ['.wizard-nav', 'nav.sidebar', '.alert'],
    marks: [
      { el: rail.locator('.tests-rail-item').nth(0), n: 1, label: 'Choisissez<br>l’exercice', side: 'left', dist: 50 },
      { el: page.locator('.step-intro-progress'), n: 2, tone: 'blue' },
    ],
    extend: { bottom: 10 },
  });

  const testsData = {
    1: { tag: 'c2' },
    2: { tag: 'c3' },
    3: { tag: 'c4' },
  };
  for (const i of [1, 2, 3]) {
    const ex = ev.exercises[i];
    const p = testsData[i].tag;
    await rail.locator('.tests-rail-item').nth(i - 1).click();
    await sleep(200);
    const b = i === 1 ? 3 : 2;
    if (i > 1) {
      await shot(page, f(`${p}-00-choisir`), {
        region: [rail, panel.locator('.tests-panel-head')],
        hide: ['.wizard-nav', 'nav.sidebar', '.alert', '.step-intro'],
        marks: [{ el: rail.locator('.tests-rail-item').nth(i - 1), n: 1, label: 'Cliquez sur<br>l’exercice', side: 'left', dist: 50 }],
      });
    }
    const tests = ex.tests;
    const first = tests[0];
    await shot(page, f(`${p}-01-ajouter-test`), {
      region: [panel.locator('.tests-panel-head'), panel.locator('.tests-editeur')],
      hide: TESTS,
      marks: [
        { el: panel.locator('.tests-vide').getByRole('button', { name: '+ Ajouter un premier test' }), n: b, label: 'Cliquez ici', side: 'right', dist: 60, nowrap: true },
      ],
    });
    await panel.locator('.tests-vide').getByRole('button', { name: '+ Ajouter un premier test' }).click();
    await remplirTest(first, { types: true });
    const carte = panel.locator('article.test-carte').nth(0);
    await shot(page, f(`${p}-02-test`), {
      region: carte,
      hide: TESTS,
      marks: testMarks(carte, first, b + 1),
    });
    // Les tests suivants : même forme, d'autres valeurs.
    for (let k = 1; k < tests.length; k++) {
      await panel.locator('article.test-carte').nth(k - 1).getByRole('button', { name: 'Dupliquer' }).click();
      await remplirTest(tests[k], { types: true, index: k });
      await panel.locator('article.test-carte').nth(k).getByRole('button', { name: 'Replier' }).click();
    }
    // Tout replier pour la vue d'ensemble.
    const ouvert = panel.locator('article.test-carte:not(.test-carte--repliee)');
    while (await ouvert.count()) { await ouvert.first().getByRole('button', { name: 'Replier' }).click(); }
    await panel.getByRole('button', { name: /Récapitulatif des tests/ }).click();
    await shot(page, f(`${p}-03-liste`), {
      region: panel.locator('.tests-editeur'),
      hide: [...TESTS, '.tests-panel-head', '.tests-panel > div.tests-panel-section:nth-of-type(1)'],
      marks: [
        { el: panel.locator('article.test-carte').nth(0).getByRole('button', { name: 'Dupliquer' }), n: b + 5, label: 'Même forme,<br>autres valeurs :<br>« Dupliquer »,<br>puis modifiez', side: 'top', dist: 30, dx: -40, badge: 'tl' },
        { el: panel.locator('.tests-recap-table'), n: b + 6, tone: 'blue', badge: 'tl', label: 'Le récapitulatif :<br>relisez tout<br>d’un coup d’œil', side: 'left', dist: 50 },
        { el: panel.locator('article.test-carte'), n: null, tone: 'blue', boxPad: 3, label: 'Un test<br>par ligne', side: 'left', dist: 50, arrowTo: [0, 0.5] },
      ],
    });
    await panel.getByRole('button', { name: /Récapitulatif des tests/ }).click();
  }

  await shot(page, f('c9-rail-pret'), {
    region: [page.locator('.step-intro'), rail],
    hide: ['.wizard-nav', '.tests-panel', '.alert'],
    marks: [
      { el: rail.locator('.tests-rail-etat'), n: 9, label: 'Coches vertes :<br>prêts à corriger', side: 'right', dist: 60, tone: 'green', badge: 'tl' },
    ],
  });
  await btn('Étape suivante').click();
  await page.getByRole('heading', { name: 'Points', exact: true }).waitFor();
  await sleep(200);

  /* --- Étape 4 : points --- */
  await pointsEtPublication(f, ev);
}

/** Remplit un test du programme entier à partir des données du modèle. */
async function remplirTest(t, { index = 0 } = {}) {
  const panel = page.locator('.tests-panel');
  const carte = panel.locator('article.test-carte').nth(index);
  await carte.locator('.test-carte-nom').fill(t.name);
  const valeurs = carte.locator('.test-valeurs');
  // Ajuste le nombre de valeurs d'entrée.
  let n = await valeurs.locator('.test-valeur').count();
  while (n < t.args.length) { await valeurs.getByRole('button', { name: "+ Valeur d'entrée" }).click(); n++; }
  while (n > t.args.length) { await valeurs.locator('.test-valeur').nth(n - 1).getByRole('button', { name: '−' }).click(); n--; }
  for (let k = 0; k < t.args.length; k++) {
    const v = valeurs.locator('.test-valeur').nth(k);
    const sel = v.locator('select').first();
    if ((await sel.inputValue()) !== t.input_types[k]) await sel.selectOption(t.input_types[k]);
    await v.locator('input').first().fill(t.args[k]);
  }
  if (t.argv?.length) await carte.getByLabel('Arguments de la ligne de commande').fill(t.argv.join(' '));
  await carte.getByLabel('Ce qui doit être affiché').fill(t.expected_stdout);
  await carte.getByLabel('Mode de comparaison').selectOption(t.comparison);
}

function testMarks(carte, t, b = 4) {
  const marks = [
    { el: carte.locator('.test-carte-nom'), n: b, badge: 'tl', label: 'Un nom pour<br>s’y retrouver', side: 'left', dist: 60 },
    { el: carte.locator('.test-valeurs'), n: b + 1, label: t.args.length > 1 ? '« + Valeur d’entrée »<br>pour chaque valeur<br>que l’étudiant tape,<br>dans l’ordre' : '« + Valeur d’entrée » :<br>la valeur que<br>l’étudiant tape', side: 'left', dist: 60 },
    { el: carte.locator('.ecran-attendu'), n: b + 2, label: 'Les nombres<br>attendus à la fin<br>de l’affichage', side: 'left', dist: 60 },
    { el: carte.getByLabel('Mode de comparaison'), n: b + 3, label: 'Comparaison :<br>« Nombres affichés »', side: 'left', dist: 60 },
  ];
  return marks;
}

/* ---------- étape 4 : points & publication ---------- */
async function pointsEtPublication(f, ev, { detail, pub = 3 } = {}) {
  const inputs = page.locator('.points-ligne-champ input');
  for (let k = 0; k < ev.exercises.length; k++) await inputs.nth(k).fill(String(ev.exercises[k].points));
  await sleep(150);
  const pointsCard = page.locator('section', { has: page.getByRole('heading', { name: 'Points', exact: true }) });
  await shot(page, f('p5-points'), {
    region: pointsCard,
    hide: ['.wizard-nav', '.alert', 'nav.sidebar', publicationCard()],
    gutter: 250,
    marks: [
      { el: page.locator('.points-ligne-champ'), n: 1, badge: 'tl', boxPad: 6, label: 'Les points de<br>chaque exercice', side: 'right', dist: 50 },
      { el: page.locator('.points-total'), n: 2, badge: 'tl', label: 'Le total doit<br>faire 20', side: 'right', dist: 50 },
    ],
    extend: { bottom: 20 },
  });
  if (detail) await detail();
  await shot(page, f('p6-publier'), {
    region: [publicationCard(), page.locator('.wizard-nav')],
    hide: ['nav.sidebar', '.alert'],
    gutter: 250,
    marks: [
      { el: btn('Enregistrer et publier'), n: pub, badge: 'tl', label: 'Rend l’épreuve<br>visible pour<br>la classe', side: 'right', dist: 50, badge: 'tr' },
      { el: btn('Lancer la session'), n: pub + 1, badge: 'tl', label: 'Ouvre l’épreuve<br>tout de suite', side: 'top', dist: 60, dx: -40, arrowTo: [0.4, 0] },
    ],
  });
}

/* ---------- questions rédigées (question-réponse) ---------- */
const qPrompt = (i, k) => page.locator(`#q-${i}-prompt-${k}`);
const qCard = (i, k) => card(i).locator('div.card', { has: page.locator(`#q-${i}-prompt-${k}`) });

async function ajouterQuestion(i, k) {
  if (k > 0) await card(i).getByRole('button', { name: /^\+ Ajouter une question$/ }).click();
  await qPrompt(i, k).waitFor();
}

async function remplirShort(i, k, q) {
  await ajouterQuestion(i, k);
  await qPrompt(i, k).fill(q.text);
  const qc = qCard(i, k);
  if (q.keywords_mode) await qc.getByLabel('Noter sur les mots-clés présents').check();
  for (let a = 0; a < q.accepted.length; a++) {
    await qc.getByRole('button', { name: q.keywords_mode ? '+ Ajouter un mot-clé' : '+ Ajouter une formulation' }).click();
    await qc.locator('input:not([type])').nth(a).fill(q.accepted[a]);
  }
  await page.locator(`#q-${i}-${k}-rows`).fill(String(q.rows ?? 4));
}

async function remplirQcm(i, k, q) {
  await ajouterQuestion(i, k);
  await qPrompt(i, k).fill(q.text);
  const qc = qCard(i, k);
  for (let c = 2; c < q.choices.length; c++) await qc.getByRole('button', { name: '+ Ajouter un choix' }).click();
  for (let c = 0; c < q.choices.length; c++) {
    await qc.getByPlaceholder(`Choix ${c + 1}`, { exact: true }).fill(q.choices[c].text);
    if (q.choices[c].correct) await qc.locator(`input[name="q-${i}-${k}-correct"]`).nth(c).check();
  }
}

async function toutReplier(i) {
  await card(i).getByRole('button', { name: 'Tout replier' }).click();
  await sleep(100);
}

const questionsHeader = (i) => card(i).locator('strong', { hasText: /^\d+ questions$|^Question$/ });
const addQuestionBtn = (i) => card(i).getByRole('button', { name: /^\+ Ajouter une question$/ });

async function corrige(f, name, i, { notes, solution, n, label = 'Facultatif : montré aux<br>étudiants avec les notes' }) {
  const sol = card(i).getByRole('button', { name: /Corrigé proposé aux étudiants/ });
  await sol.click();
  if (solution) {
    await page.locator(`#sol-${i}-solution`).fill(solution);
    await page.locator(`#sol-${i}-solution`).evaluate((el) => { el.scrollTop = 0; el.setSelectionRange(0, 0); });
  }
  if (notes) await page.locator(`#sol-${i}-notes`).fill(notes);
  await shot(page, f(name), {
    region: card(i).locator('.disclosure', { has: page.locator(`#sol-${i}-notes`) }),
    hide: CARD,
    marks: [
      ...(solution ? [{ el: page.locator(`#sol-${i}-solution`), n, badge: 'tr', label: 'La solution type', side: 'right', dist: 40, nowrap: true }] : []),
      { el: page.locator(`#sol-${i}-notes`), n: solution ? null : n, badge: 'tr', label, side: 'right', dist: 40 },
    ],
  });
  await sol.click();
}

/* ---------- épreuve 2 : devoir surveillé de C avancé ---------- */
async function cdevoir() {
  console.log('Devoir surveillé de C avancé');
  await cleanup('cdevoir');
  const ev = data(10);
  const f = dir('cdevoir');
  const id = await parametres(f, ev, { classe: 'M1 MBDS (2 étudiants)', matiere: 'C avancé', kindLabel: 'Devoir' });
  remember('cdevoir', id);

  /* --- Exercice 1 : questions de cours --- */
  const ex1 = ev.exercises[0];
  await ajouter(f, 'e1', 'Question-réponse', 'Choisissez<br>« Question-réponse » :<br>réponses rédigées', { first: true });
  await remplirEntete(0, ex1);
  await enteteShot(f, 'e1', 0);
  const qs = ex1.settings.questions;
  await remplirShort(0, 0, qs[0]);
  const q0 = qCard(0, 0);
  await shot(page, f('e1-04-question1'), {
    region: [questionsHeader(0), q0],
    hide: CARD,
    marks: [
      { el: qPrompt(0, 0), n: 5, label: 'La question,<br>recopiée du sujet', side: 'left', dist: 50 },
      { el: q0.getByLabel('Noter sur les mots-clés présents').locator('xpath=..'), n: 6, badge: 'tl', label: 'Cochez : noter<br>sur les mots-clés', side: 'right', dist: 40 },
      { el: q0.locator('input:not([type])'), n: 7, badge: 'tl', label: 'Un mot-clé<br>par case', side: 'left', dist: 50 },
      { el: q0.getByRole('button', { name: '+ Ajouter un mot-clé' }), n: 8, badge: 'tl', label: 'Un mot-clé de plus', side: 'left', dist: 50, nowrap: true },
      { el: page.locator('#q-0-0-rows'), n: 9, label: 'Place laissée<br>sur le sujet imprimé', side: 'right', dist: 40 },
    ],
  });
  await remplirShort(0, 1, qs[1]);
  const q1 = qCard(0, 1);
  await shot(page, f('e1-05-question2'), {
    region: [q1, addQuestionBtn(0)],
    hide: CARD,
    marks: [
      { el: addQuestionBtn(0), n: 10, badge: 'tl', label: 'Une question de plus<br>(elle s’ajoute en dessous)', side: 'right', dist: 50 },
      { el: qPrompt(0, 1), n: 11, label: 'Le texte de<br>la question', side: 'left', dist: 50 },
      { el: q1.getByText('Aucune réponse listée : cette question vous sera signalée pour une correction manuelle.'), n: 12, tone: 'blue', badge: 'tl', label: 'Rien listé :<br>correction à la main', side: 'right', dist: 40, dy: 20 },
    ],
  });
  for (let k = 2; k < qs.length; k++) await remplirShort(0, k, qs[k]);
  await toutReplier(0);
  const summary = (k) => card(0).locator('button[aria-expanded]', { hasText: `Question ${k + 1}` });
  await shot(page, f('e1-06-liste'), {
    region: [questionsHeader(0), addQuestionBtn(0)],
    hide: CARD,
    marks: [
      { el: questionsHeader(0), n: 13, badge: 'tl', boxPad: 4, label: 'Six questions : le barème<br>se partage entre elles', side: 'left', dist: 40, dy: -10 },
      { el: [summary(1), summary(2)], n: 14, badge: 'tl', label: '2.a et 2.b :<br>deux questions', side: 'left', dist: 40 },
      { el: card(0).getByRole('button', { name: 'Tout déplier' }), n: 15, badge: 'tl', label: 'Tout ouvrir<br>pour relire', side: 'right', dist: 40 },
      { el: summary(0), n: null, tone: 'blue', label: '« 2 mots-clés » :<br>corrigée seule', side: 'right', dist: 110, dy: 30 },
    ],
  });
  await corrige(f, 'e1-07-corrige', 0, { notes: ex1.settings.solution_notes, n: 16 });

  /* --- Exercice 2 : gestion d'un stock --- */
  const ex2 = ev.exercises[1];
  await ajouter(f, 'e2', 'Question-réponse', 'Choisissez<br>« Question-réponse »');
  await remplirEntete(1, ex2);
  await enteteShot(f, 'e2', 1);
  await remplirShort(1, 0, ex2.settings.questions[0]);
  const s0 = qCard(1, 0);
  await shot(page, f('e2-04-question'), {
    region: [questionsHeader(1), s0, addQuestionBtn(1)],
    hide: CARD,
    marks: [
      { el: qPrompt(1, 0), n: 5, label: 'La consigne<br>du sujet', side: 'left', dist: 50 },
      { el: s0.getByText('Aucune réponse listée : cette question vous sera signalée pour une correction manuelle.'), n: 6, tone: 'blue', badge: 'tl', label: 'Aucune réponse :<br>correction à la main', side: 'left', dist: 50 },
      { el: page.locator('#q-1-0-rows'), n: 7, label: '12 lignes :<br>une réponse longue', side: 'right', dist: 40 },
    ],
  });
  await corrige(f, 'e2-05-corrige', 1, { notes: ex2.settings.solution_notes, n: 8, label: 'La démarche attendue,<br>montrée avec les notes' });

  await btn('Étape suivante').click();
  await page.locator('.step-intro').waitFor();
  await sleep(300);
  await shot(page, f('c0-rien'), {
    region: [page.locator('.step-intro'), page.locator('.content > section > .card').last()],
    hide: ['nav.sidebar', '.wizard-nav', '.alert'],
    marks: [
      { el: page.locator('.content > section > .card').last(), n: 1, badge: 'tl', tone: 'blue', label: 'Rien à régler ici :<br>passez à l’étape suivante', side: 'bottom', dist: 30, dx: 200 },
    ],
  });
  await btn('Étape suivante').click();
  await page.getByRole('heading', { name: 'Points', exact: true }).waitFor();
  await sleep(200);
  await pointsEtPublication(f, ev);
}

/* ---------- épreuve 3 : examen de C avancé ---------- */
async function cexamen() {
  console.log('Examen de C avancé');
  await cleanup('cexamen');
  const ev = data(11);
  const f = dir('cexamen');
  const id = await parametres(f, ev, { classe: 'M1 MBDS (2 étudiants)', matiere: 'C avancé', kindLabel: 'Examen' });
  remember('cexamen', id);

  /* --- Exercices 1 et 2.1 : le programme en cinq fichiers --- */
  const ex1 = ev.exercises[0];
  await ajouter(f, 'e1', 'Code', 'Choisissez « Code » :<br>programme à écrire', { first: true });
  await remplirEntete(0, ex1);
  await enteteShot(f, 'e1', 0, { statementLabel: 'Le texte commun<br>et les questions<br>1, 2 et 2.1' });
  const depart = card(0).getByRole('button', { name: /Code de départ|Fichiers du projet/ });
  await depart.click();
  await shot(page, f('e1-04-code-depart'), {
    region: card(0).locator('.disclosure', { has: page.locator('.project-mode') }),
    hide: CARD,
    marks: [
      { el: depart, n: 6, badge: 'tl', label: 'Ouvrez<br>« Code de départ »', side: 'left', dist: 50 },
      { el: card(0).getByLabel('Plusieurs fichiers (projet : .h et .c)').locator('xpath=..'), n: 7, badge: 'br', label: 'Choisissez<br>« Plusieurs fichiers »', side: 'right', dist: 90, dy: 60 },
    ],
  });
  await card(0).getByLabel('Plusieurs fichiers (projet : .h et .c)').check();
  const files = ex1.settings.files;
  const fileCards = card(0).locator('.project-file-card');
  while ((await fileCards.count()) < files.length) await card(0).getByRole('button', { name: '+ Fichier' }).click();
  for (let k = 0; k < files.length; k++) {
    await fileCards.nth(k).getByLabel(`Nom du fichier ${k + 1}`).fill(files[k].name);
    await fileCards.nth(k).locator('textarea').fill(files[k].starter);
  }
  await sleep(150);
  await shot(page, f('e1-05-fichiers'), {
    region: card(0).locator('.disclosure', { has: page.locator('.project-mode') }),
    hide: CARD,
    marks: [
      ...[0, 1, 2, 3, 4].map((k) => ({ el: card(0).locator('.project-file-head input').nth(k), n: k === 0 ? 8 : null, badge: 'tl', boxPad: 3 })),
      { el: card(0).locator('.project-file-head input').nth(2), noBox: true, label: 'Les 5 fichiers du sujet,<br>dans l’ordre des onglets', side: 'right', dist: 60, dy: -30 },
      { el: fileCards.nth(3).locator('textarea'), n: 9, badge: 'tl', label: 'Code de départ :<br>vide, l’étudiant<br>écrit tout', side: 'left', dist: 50 },
      { el: card(0).getByRole('button', { name: '+ Fichier' }), n: 10, badge: 'tl', label: 'Un fichier de plus', side: 'right', dist: 40, nowrap: true },
      { el: card(0).locator('.disclosure-body > p.sub').first(), n: 11, tone: 'blue', badge: 'tl', label: 'La compilation<br>de la correction', side: 'left', dist: 50 },
    ],
  });
  await depart.click();
  await corrige(f, 'e1-06-corrige', 0, { solution: ex1.settings.solution, notes: '', n: 12 });

  /* --- Exercice 2.2 : les commandes de compilation --- */
  const ex2 = ev.exercises[1];
  await ajouter(f, 'e2', 'Question-réponse', 'Choisissez<br>« Question-réponse »');
  await remplirEntete(1, ex2);
  await enteteShot(f, 'e2', 1);
  await remplirShort(1, 0, ex2.settings.questions[0]);
  await growTextarea('#q-1-prompt-0');
  const k0 = qCard(1, 0);
  await shot(page, f('e2-04-question'), {
    region: [questionsHeader(1), k0],
    hide: CARD,
    marks: [
      { el: qPrompt(1, 0), n: 5, label: 'La question,<br>avec la commande<br>du sujet', side: 'left', dist: 50 },
      { el: k0.getByLabel('Noter sur les mots-clés présents').locator('xpath=..'), n: 6, badge: 'tl', label: 'Noter sur<br>les mots-clés', side: 'right', dist: 40 },
      { el: k0.locator('input:not([type])'), n: 7, badge: 'tl', label: 'Les 4 éléments<br>attendus dans<br>les commandes', side: 'left', dist: 50 },
    ],
  });

  /* --- Exercice 3 : QCM --- */
  const ex3 = ev.exercises[2];
  await ajouter(f, 'e3', 'QCM', 'Choisissez « QCM »');
  await remplirEntete(2, ex3);
  await enteteShot(f, 'e3', 2);
  const qq = ex3.settings.questions;
  await remplirQcm(2, 0, qq[0]);
  const m0 = qCard(2, 0);
  await shot(page, f('e3-04-question1'), {
    region: [questionsHeader(2), m0],
    hide: CARD,
    marks: [
      { el: qPrompt(2, 0), n: 5, label: 'La question', side: 'left', dist: 50, nowrap: true },
      { el: m0.locator('input:not([type])'), n: 6, badge: 'tr', label: 'Les quatre<br>propositions<br>a), b), c), d)', side: 'right', dist: 40 },
      { el: m0.locator('input[type=radio]').nth(0), n: 7, badge: 'tl', boxPad: 5, label: 'Cochez la<br>bonne réponse', side: 'left', dist: 50 },
      { el: m0.getByRole('button', { name: '+ Ajouter un choix' }), n: 8, badge: 'tl', label: '2 choix au départ :<br>ajoutez-en deux', side: 'left', dist: 50 },
      { el: m0.getByLabel('Plusieurs réponses possibles').locator('xpath=..'), n: 9, badge: 'tl', label: 'Laissez décoché :<br>une seule bonne réponse', side: 'right', dist: 40, dy: -20 },
    ],
  });
  for (let k = 1; k < qq.length; k++) await remplirQcm(2, k, qq[k]);
  const m4 = qCard(2, 4);
  await shot(page, f('e3-05-question5'), {
    region: [m4, addQuestionBtn(2)],
    hide: CARD,
    marks: [
      { el: addQuestionBtn(2), n: 10, badge: 'tl', label: 'Question suivante', side: 'right', dist: 40, nowrap: true },
      { el: [m4.locator('input:not([type])').nth(1), m4.locator('input:not([type])').nth(2)], n: 11, badge: 'tr', label: 'b) et c) collées dans<br>le PDF : deux choix', side: 'right', dist: 40 },
    ],
  });
  await toutReplier(2);
  await shot(page, f('e3-06-liste'), {
    region: [questionsHeader(2), card(2).locator('div.card'), addQuestionBtn(2)],
    hide: CARD,
    marks: [
      { el: questionsHeader(2), n: 12, badge: 'tl', boxPad: 4, label: '5 questions :<br>1 point chacune', side: 'left', dist: 40 },
    ],
  });

  await btn('Étape suivante').click();
  await page.locator('.tests-step').waitFor();
  await sleep(300);

  /* --- Étape 3 : déclarations et tests de l'exercice de code --- */
  const panel = page.locator('.tests-panel');
  const rail = page.locator('.tests-rail');
  await shot(page, f('c0-vue'), {
    region: [page.locator('.step-intro'), rail, panel.locator('.tests-panel-head')],
    hide: ['.wizard-nav', 'nav.sidebar', '.alert'],
    marks: [
      { el: rail.locator('.tests-rail-item').nth(0), n: 1, label: 'Le seul exercice<br>pratique', side: 'left', dist: 50 },
      { el: rail.locator('.tests-rail-note'), n: 2, tone: 'blue', badge: 'tl', label: 'Questions et QCM :<br>rien à régler ici', side: 'left', dist: 50 },
    ],
  });
  const addDecl = panel.getByRole('button', { name: '+ Ajouter une déclaration' });
  await addDecl.click();
  const choix = panel.locator('.tests-choix');
  await shot(page, f('c1-01-choix'), {
    region: [panel.locator('.bareme-editeur')],
    hide: [...TESTS, '.tests-panel > div.tests-panel-section:nth-of-type(2)'],
    marks: [
      { el: choix.locator('.type-card', { hasText: 'Structure attendue' }), n: 3, badge: 'tl', label: '« Structure attendue »<br>pour Note et Etudiant', side: 'bottom', dist: 40, dx: 60 },
      { el: choix.locator('.type-card', { hasText: 'Fonction attendue' }), n: 4, badge: 'tl', label: '« Fonction attendue »<br>pour les 3 fonctions', side: 'bottom', dist: 40, dx: -170 },
    ],
  });
  const crits = ex1.settings.criteria;
  const crit = (k) => panel.locator('.bareme-critere').nth(k);
  for (let k = 0; k < crits.length; k++) {
    const c = crits[k];
    if (k > 0) await addDecl.click();
    await choix.locator('.type-card', { hasText: c.kind === 'struct' ? 'Structure attendue' : 'Fonction attendue' }).click();
    const el = crit(k);
    await el.getByLabel('Nom attendu').fill(c.name);
    if (c.kind === 'struct') {
      for (let j = 0; j < c.fields.length; j++) {
        if ((await el.getByLabel(/^Nom du champ \d+$/).count()) <= j) await el.getByRole('button', { name: '+ Champ' }).click();
        await el.getByLabel(`Nom du champ ${j + 1}`).fill(c.fields[j].name);
        await el.getByLabel(`Type du champ ${j + 1}`, { exact: true }).selectOption(c.fields[j].type);
        if (c.fields[j].ctype) await el.getByLabel(`Type du champ ${j + 1} : type C`).fill(c.fields[j].ctype);
      }
    } else {
      await el.getByLabel('Type de retour', { exact: true }).selectOption(c.returns);
      for (let j = 0; j < c.params.length; j++) {
        if ((await el.getByLabel(/^Nom du paramètre \d+$/).count()) <= j) await el.getByRole('button', { name: '+ Paramètre' }).click();
        await el.getByLabel(`Nom du paramètre ${j + 1}`).fill(c.params[j].name);
        await el.getByLabel(`Type du paramètre ${j + 1}`, { exact: true }).selectOption(c.params[j].type);
        if (c.params[j].ctype) await el.getByLabel(`Type du paramètre ${j + 1} : type C`).fill(c.params[j].ctype);
      }
    }
    if (k === 1) {
      await shot(page, f('c1-02-structures'), {
        region: [crit(0), crit(1)],
        hide: TESTS,
        gutter: 240,
        marks: [
          { el: crit(0).getByLabel('Nom attendu'), n: 5, badge: 'tl', label: 'Le nom de<br>la structure', side: 'right', dist: 60 },
          { el: [crit(0).getByRole('button', { name: '+ Champ' }), crit(0).getByLabel('Type du champ 1', { exact: true })], n: 6, badge: 'tl', label: '« + Champ »,<br>puis son nom<br>et son type', side: 'left', dist: 50 },
          { el: crit(1).getByLabel('Type du champ 1 : type C'), n: 7, badge: 'tl', label: '« Autre type » :<br>écrit comme en C', side: 'right', dist: 60 },
          { el: crit(1).locator('.bareme-critere-code'), n: 8, tone: 'blue', badge: 'tl', label: 'Ce qui sera<br>cherché dans<br>la copie', side: 'left', dist: 50 },
        ],
      });
    }
    if (k === 2) {
      await shot(page, f('c1-03-fonction'), {
        region: crit(2),
        hide: TESTS,
        gutter: 240,
        marks: [
          { el: crit(2).getByLabel('Nom attendu'), n: 9, badge: 'tl', label: 'Le nom exact<br>de la fonction', side: 'gutterLeft', dy: -50 },
          { el: crit(2).getByLabel('Type de retour', { exact: true }), n: 10, badge: 'tl', label: 'void :<br>« Rien (affiche<br>seulement) »', side: 'gutterLeft' },
          { el: crit(2).getByRole('button', { name: '+ Paramètre' }), n: 11, badge: 'tr', label: 'Un paramètre<br>de plus', side: 'gutter', dy: -10 },
          { el: crit(2).getByLabel('Type du paramètre 2 : type C'), n: 12, badge: 'tl', label: 'Etudiant * :<br>un pointeur', side: 'gutter', dy: 10 },
          { el: crit(2).locator('.bareme-critere-code'), n: 13, tone: 'blue', badge: 'tl', label: 'La signature<br>vérifiée', side: 'gutterLeft' },
        ],
      });
    }
  }
  await shot(page, f('c1-04-declarations'), {
    region: [crit(3), crit(4)],
    hide: TESTS,
    gutter: 240,
    marks: [
      { el: crit(3).locator('.bareme-critere-code'), n: 14, tone: 'blue', badge: 'tl', label: 'MoyenneNotes<br>renvoie un float', side: 'right', dist: 60 },
      { el: crit(4).locator('.bareme-critere-code'), n: 15, tone: 'blue', badge: 'tl', label: 'AfficherTout<br>affiche seulement', side: 'right', dist: 60 },
    ],
  });

  const tests = ex1.tests;
  const addTest = panel.locator('.tests-vide').getByRole('button', { name: '+ Ajouter un premier test' });
  await shot(page, f('c1-05-ajouter-test'), {
    region: panel.locator('.tests-editeur'),
    hide: [...TESTS, '.tests-panel-head', '.tests-panel > div.tests-panel-section:nth-of-type(1)'],
    marks: [{ el: addTest, n: 16, badge: 'tl', label: 'Cliquez ici', side: 'left', dist: 50, nowrap: true }],
  });
  await addTest.click();
  await remplirTest(tests[0]);
  const carte = panel.locator('article.test-carte').nth(0);
  await shot(page, f('c1-06-test'), {
    region: carte,
    hide: [...TESTS, '.tests-panel-head', '.tests-panel > div.tests-panel-section:nth-of-type(1)'],
    marks: [
      { el: carte.getByText(/^Le programme entier\. Déclarez/), n: 17, badge: 'tl', label: 'Le test lance<br>le programme entier', side: 'left', dist: 50 },
      { el: carte.locator('.test-valeurs'), n: 18, badge: 'tl', label: 'Une ligne par<br>étudiant :<br>matricule nom note', side: 'left', dist: 50 },
      { el: carte.getByLabel('Arguments de la ligne de commande').locator('xpath=..'), n: 19, badge: 'tl', label: 'Remplace le 40 de<br>ProgrammeMoyenne.exe 40', side: 'left', dist: 50 },
      { el: carte.locator('.ecran-attendu'), n: 20, badge: 'tl', label: 'La moyenne :<br>(12+16+11)/3 = 13', side: 'left', dist: 50 },
      { el: carte.getByLabel('Mode de comparaison'), n: 21, badge: 'tl', label: '« Nombres affichés »', side: 'left', dist: 50, nowrap: true },
    ],
  });
  for (let k = 1; k < tests.length; k++) {
    await panel.locator('article.test-carte').nth(k - 1).getByRole('button', { name: 'Dupliquer' }).click();
    await remplirTest(tests[k], { index: k });
  }
  const ouvert = panel.locator('article.test-carte:not(.test-carte--repliee)');
  while (await ouvert.count()) { await ouvert.first().getByRole('button', { name: 'Replier' }).click(); }
  await shot(page, f('c1-07-tests'), {
    region: panel.locator('.tests-editeur'),
    hide: [...TESTS, '.tests-panel-head', '.tests-panel > div.tests-panel-section:nth-of-type(1)'],
    marks: [
      { el: panel.locator('article.test-carte'), n: 22, badge: 'tl', tone: 'blue', label: 'Deux tests :<br>3 étudiants,<br>puis 1 seul', side: 'left', dist: 50 },
    ],
  });
  await btn('Étape suivante').click();
  await page.getByRole('heading', { name: 'Points', exact: true }).waitFor();
  await sleep(200);
  await pointsEtPublication(f, ev, {
    pub: 7,
    detail: async () => {
      await page.getByRole('button', { name: 'Détail du barème' }).first().click();
      const ed = page.locator('.points-editeur');
      await ed.getByLabel('Peser chaque ligne moi-même').check();
      const lines = ed.locator('.points-lignes input');
      const values = [...crits.map((c) => c.points), ...tests.map((t) => t.points)];
      for (let k = 0; k < values.length; k++) await lines.nth(k).fill(String(values[k]));
      await sleep(150);
      await shot(page, f('p5b-detail'), {
        region: [page.locator('.points-ligne').first(), ed],
        hide: ['.wizard-nav', '.alert', 'nav.sidebar', publicationCard()],
        gutter: 250,
        marks: [
          { el: page.getByRole('button', { name: 'Masquer le détail' }), n: 3, badge: 'tl', label: '« Détail du barème »', side: 'top', dist: 30, dx: -60, nowrap: true },
          { el: ed.getByLabel('Peser chaque ligne moi-même').locator('xpath=..'), n: 4, badge: 'tl', label: 'Cochez pour<br>peser chaque ligne', side: 'left', dist: 50 },
          { el: lines, n: 5, badge: 'tl', boxPad: 5, label: '6 pts de<br>déclarations,<br>6 pts de tests', side: 'right', dist: 50 },
          { el: ed.locator('.points-total'), n: 6, badge: 'tl', label: '12 / 12', side: 'right', dist: 50, nowrap: true },
        ],
      });
      await page.getByRole('button', { name: 'Masquer le détail' }).click();
    },
  });
}

try {
  if (want('algo')) await algo();
  if (want('cdevoir')) await cdevoir();
  if (want('cexamen')) await cexamen();
} catch (e) {
  await page.evaluate(() => document.getElementById('g-ov')?.remove()).catch(() => {});
  await page.screenshot({ path: path.join(OUT, 'debug.png'), fullPage: true, scale: 'css' }).catch(() => {});
  throw e;
} finally {
  await browser.close();
}
