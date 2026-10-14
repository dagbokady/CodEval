// Assemble le guide (docs/guide/guide.html) puis l'imprime en PDF.
// Usage : node docs/guide/outils/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { parts, table } from './contenu.mjs';

const GUIDE = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const require = createRequire(path.join(GUIDE, '../../frontend/package.json'));
const { chromium } = require('playwright');

const badge = (n, tone = '') => `<span class="b ${tone}">${n}</span>`;

function renderStep(s, cls = '') {
  const items = s.items.map(([n, txt, tone]) => `<li>${badge(n, tone)}<span>${txt}</span></li>`).join('');
  const size = s.small ? 'small' : s.medium ? 'medium' : '';
  return `<section class="step ${cls}">
    <h4>${s.titre}</h4>
    ${s.lead ? `<p class="lead">${s.lead}</p>` : ''}
    <figure class="shot ${size}"><img src="${s.img}" alt=""></figure>
    ${items ? `<ol class="marks">${items}</ol>` : ''}
    ${s.after ? `<p class="after">${s.after}</p>` : ''}
  </section>`;
}

function renderBloc(x) {
  switch (x.t) {
    case 'h': return `<h2 id="${x.id}">${x.titre}</h2>${x.intro ? `<p>${x.intro}</p>` : ''}`;
    case 'fiche': return `<header class="fiche" id="${x.id}">
        <div class="fiche-num">${x.num} · ${String(x.pts).replace('.', ',')} points</div>
        <h2>${x.titre}</h2>
        <div class="fiche-meta"><span class="pill">Type : ${x.type}</span><span class="pill pill-soft">Correction : ${x.correction}</span></div>
      </header>`;
    case 'paper': return `<div class="paper"><div class="paper-label">Sur le sujet papier</div>${x.imgs.map((i) => `<img src="${i}" alt="">`).join('')}</div>`;
    case 'note': return `<aside class="note note-${x.tone}"><strong>${x.titre}</strong><div>${x.html}</div></aside>`;
    case 'raw': return x.html;
    case 'pair': return `<div class="pair">${renderStep(x.a, 'half')}${renderStep(x.b, 'half')}</div>`;
    default: return renderStep(x);
  }
}

const sommaire = parts.map((p) => `<li><b>${p.lettre}. ${p.titre}</b><ul>${p.blocs
  .filter((x) => x.t === 'h' || x.t === 'fiche')
  .map((x) => `<li><a href="#${x.id}">${x.t === 'fiche' ? `${x.id.replace(/(\D)(\d)/, '$1.$2')} ${x.num} — ${x.titre}` : x.titre}</a></li>`).join('')}</ul></li>`).join('');

const correspondance = table(['Exercice du sujet', 'Type à choisir', 'Correction', 'Fiche'], [
  ['Algo, ex. 1 : simulation de CalculDeMoyenne', '<b>Simulation</b>', 'automatique, case par case', 'A.1'],
  ['Algo, ex. 2, 3, 4 : écrire un algorithme', '<b>Algorithmique</b>', 'automatique, jeux de tests', 'A.2 à A.5'],
  ['C devoir, ex. 1 : questions de cours', '<b>Question-réponse</b>', 'mots-clés ou à la main', 'B.1'],
  ['C devoir, ex. 2 : gestion d’un stock', '<b>Question-réponse</b>', 'à la main', 'B.2'],
  ['C examen, ex. 1 et 2.1 : les 5 fichiers', '<b>Code</b>, plusieurs fichiers', 'déclarations et tests', 'C.1, C.4'],
  ['C examen, ex. 2.2 : commandes de compilation', '<b>Question-réponse</b>', 'mots-clés', 'C.2'],
  ['C examen, ex. 3 : QCM', '<b>QCM</b>', 'automatique', 'C.3'],
]);

const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Guide enseignant · CodEval</title>
<style>
@page { size: A4; margin: 14mm 15mm 17mm; }
:root { --red:#E0353B; --blue:#1F5BD8; --green:#15803D; --ink:#16181D; --muted:#5B6270; --line:#E3E6EB; --soft:#F5F7FA; --brand:#2357D9; }
* { box-sizing: border-box; }
body { margin:0; color:var(--ink); font: 10pt/1.45 -apple-system, "SF Pro Text", "Helvetica Neue", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font-size: 30pt; line-height:1.1; margin:0 0 10px; letter-spacing:-.5px; }
h2 { font-size: 15pt; margin: 18px 0 8px; color: var(--ink); break-after: avoid; }
h3.sub-h { font-size: 12.5pt; margin: 18px 0 6px; padding-top: 8px; border-top: 2px solid var(--line); break-after: avoid; }
h4 { font-size: 10.5pt; margin: 0 0 6px; break-after: avoid; }
p { margin: 0 0 8px; }
code { font: 8.8pt/1.3 "SF Mono", Menlo, monospace; background: var(--soft); padding: 0 3px; border-radius: 3px; }
a { color: var(--brand); text-decoration: none; }
.break { break-before: page; }
.cover { height: 262mm; display:flex; flex-direction:column; }
.cover-band { background: linear-gradient(135deg, #2357D9, #1B3FA8); color:#fff; border-radius: 14px; padding: 34px 32px 30px; }
.cover-band .brand { font: 600 11pt/1 "SF Mono", Menlo, monospace; opacity:.9; margin-bottom: 26px; }
.cover-band p { font-size: 12pt; opacity:.93; max-width: 135mm; }
.cards { display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 18px; }
.card { border:1px solid var(--line); border-radius: 10px; padding: 12px; font-size: 9pt; }
.card .k { font-size: 7.5pt; text-transform: uppercase; letter-spacing: .08em; color: var(--brand); font-weight:700; }
.card b.t { display:block; font-size: 11pt; margin: 4px 0 6px; }
.card ul { margin: 6px 0 0; padding-left: 14px; }
.cover-foot { margin-top:auto; font-size: 8.5pt; color: var(--muted); }
.part-title { background: var(--ink); color:#fff; border-radius: 12px; padding: 22px 24px; margin-bottom: 14px; }
.part-title .l { font: 700 34pt/1 -apple-system, sans-serif; opacity:.35; float:right; }
.part-title h1 { font-size: 20pt; margin: 0 0 4px; }
.part-title p { margin:0; opacity:.8; }
.fiche { break-before: page; border-left: 6px solid var(--brand); background: var(--soft); border-radius: 0 10px 10px 0; padding: 12px 16px; margin: 0 0 10px; }
.fiche h2 { margin: 2px 0 6px; font-size: 16pt; }
.fiche-num { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; color: var(--brand); }
.pill { display:inline-block; font-size: 8.5pt; font-weight:600; background: var(--brand); color:#fff; border-radius: 99px; padding: 2px 9px; margin-right: 6px; }
.pill-soft { background:#fff; color: var(--ink); border:1px solid var(--line); font-weight: 500; }
.paper { border: 1px solid #D9D6CC; background: #FBFAF6; border-radius: 8px; padding: 8px 10px 10px; margin: 8px 0 12px; break-inside: avoid; }
.paper-label { font-size: 7.5pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: #8A8370; margin-bottom: 4px; }
.paper img { display:block; max-width: 100%; margin: 4px auto 0; }
.step { break-inside: avoid; margin: 12px 0 14px; }
.shot { margin: 0; }
.shot img { display:block; border:1px solid var(--line); border-radius: 6px; max-width: 100%; }
.lead, .after { font-size: 9.3pt; color: #333; }
.after { margin-top: 4px; }
ol.marks { list-style:none; padding:0; margin: 7px 0 0; }
ol.marks li { display:flex; gap:8px; margin: 3px 0; align-items: flex-start; }
.b { flex:none; display:inline-block; width:18px; height:18px; border-radius:50%; background: var(--red); color:#fff; font: 700 9.5px/18px -apple-system, sans-serif; text-align:center; margin-top: 1px; }
.b.blue { background: var(--blue); } .b.green { background: var(--green); }
.pair { display:grid; grid-template-columns: 1.45fr 1fr; gap: 14px; align-items: start; break-inside: avoid; }
.pair .step { margin: 8px 0; }
.note { border-radius: 8px; padding: 9px 12px; margin: 10px 0 12px; font-size: 9.3pt; break-inside: avoid; background: #EEF3FF; border: 1px solid #C9D7FB; }
.note strong { display:block; margin-bottom: 3px; color: var(--blue); }
.note-warn { background: #FFF7E8; border-color: #F2D8A2; } .note-warn strong { color: #9A5B00; }
table.data { width:100%; border-collapse: collapse; font-size: 8.8pt; margin: 8px 0 14px; break-inside: avoid; }
table.data th { text-align:left; background: var(--soft); font-weight:600; }
table.data th, table.data td { border-bottom: 1px solid var(--line); padding: 5px 7px; vertical-align: top; }
.legend { display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 6px 0 12px; }
.legend div { border:1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 9pt; display:flex; gap:8px; }
.flow { display:grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0 12px; }
.flow div { border:1px solid var(--line); border-radius: 8px; padding: 8px 10px; font-size: 8.8pt; }
.flow b { display:block; color: var(--brand); }
.toc ul { padding-left: 16px; margin: 3px 0 8px; } .toc > ul { padding-left: 0; list-style: none; } .toc li { margin: 2px 0; font-size: 9.5pt; }
</style></head><body>

<section class="cover">
  <div class="cover-band">
    <div class="brand">&lt;/&gt; CodEval</div>
    <h1>Saisir vos sujets<br>dans CodEval</h1>
    <p>Guide enseignant, exercice par exercice. Chaque exercice a sa fiche : l’extrait du sujet papier, puis une capture annotée pour chaque geste, du bouton « Ajouter un exercice » jusqu’à la publication.</p>
  </div>
  <div class="cards">
    <div class="card"><span class="k">A · Devoir commun · SRIT1</span><b class="t">Initiation algorithmique</b>30/11/2024 · 2 h · 20 pts<ul><li>Ex. 1 Simulation (5)</li><li>Ex. 2 Dix nombres suivants (5)</li><li>Ex. 3 Tarif plein ou réduit (4)</li><li>Ex. 4 Le plus grand et sa position (6)</li></ul></div>
    <div class="card"><span class="k">B · Devoir surveillé · M1 MBDS</span><b class="t">C avancé</b>27/02/2024 · 2 h · 20 pts<ul><li>Ex. 1 Questions de cours (10)</li><li>Ex. 2 Gestion d’un stock (10)</li></ul></div>
    <div class="card"><span class="k">C · Examen 2e session · M1</span><b class="t">C avancé</b>mars 2025 · 2 h · 20 pts<ul><li>Ex. 1 et 2.1 Programme en 5 fichiers (12)</li><li>Ex. 2.2 Commandes de compilation (3)</li><li>Ex. 3 QCM (5)</li></ul></div>
  </div>
  <p class="cover-foot">Captures réalisées sur CodEval en octobre 2026, avec le compte de démonstration « Prof Démo ».</p>
</section>

<section class="break">
  <h2 style="margin-top:0">Avant de commencer</h2>
  <p><b>Lire les captures.</b> Les numéros des pastilles renvoient à la liste sous chaque capture.</p>
  <div class="legend">
    <div>${badge(1)}<span><b>Rouge</b> : ce que vous faites (cliquer, taper, cocher).</span></div>
    <div>${badge(2, 'blue')}<span><b>Bleu</b> : ce qu’il faut lire ou vérifier.</span></div>
    <div>${badge(3, 'green')}<span><b>Vert</b> : tout est prêt.</span></div>
  </div>
  <p><b>Les quatre étapes d’une épreuve.</b> On les parcourt avec les boutons du bas de l’écran. Une fois l’épreuve enregistrée, le fil des étapes en haut de page permet de revenir en arrière.</p>
  <div class="flow">
    <div><b>1 · Paramètres</b>Titre, type, classe, matière, durée, consignes.</div>
    <div><b>2 · Exercices</b>Le type, l’énoncé, les réponses attendues de chaque exercice.</div>
    <div><b>3 · Correction</b>Les jeux de tests des exercices pratiques.</div>
    <div><b>4 · Points & publication</b>Ce que vaut chaque exercice, puis publier.</div>
  </div>
  <p><b>Il vous faut d’abord</b> une <b>matière</b> (menu <i>Mes matières</i>) — elle fixe le langage : Algorithmique pour <i>Initiation algorithmique</i>, C pour <i>C avancé</i> — et une <b>classe</b> (menu <i>Mes classes</i>), que les étudiants rejoignent avec son code.</p>
  <h2>Quel type pour quel exercice</h2>
  ${correspondance}
  <h2>Sommaire</h2>
  <div class="toc"><ul>${sommaire}<li><b><a href="#M">Aide-mémoire</a></b></li></ul></div>
</section>

${parts.map((p) => `<section class="break">
  <div class="part-title"><span class="l">${p.lettre}</span><h1>${p.titre}</h1><p>${p.sous}</p></div>
  ${p.blocs.map(renderBloc).join('\n')}
</section>`).join('\n')}

<section class="break" id="M">
  <h2 style="margin-top:0">Aide-mémoire</h2>
  ${table(['Type', 'Ce que vous saisissez', 'Comment c’est corrigé'], [
    ['Simulation', 'L’algorithme, le tableau attendu (colonnes, lignes), les colonnes fournies', 'Case par case ; case vide non notée ; « | » pour plusieurs réponses'],
    ['Algorithmique', 'L’énoncé, les blocs autorisés, puis les tests à l’étape 3', 'Exécution sur les tests ; « Nombres affichés » ignore les messages'],
    ['Code', 'L’énoncé, les fichiers du projet, puis déclarations et tests à l’étape 3', 'Déclarations cherchées dans tous les fichiers ; programme compilé et lancé'],
    ['Question-réponse', 'Une question par point du sujet ; mots-clés ou formulations, ou rien', 'Mots-clés : une part par mot présent ; rien : correction à la main'],
    ['QCM', 'Les questions, leurs propositions, la bonne réponse cochée', 'Automatique ; propositions mélangées pour l’étudiant'],
  ])}
  <h2>Avant de publier</h2>
  <ul>
    <li>La classe est choisie à l’étape 1, sinon l’épreuve reste un brouillon invisible.</li>
    <li>Chaque exercice pratique est coché en vert à l’étape 3.</li>
    <li>L’ordre de saisie des données est écrit dans l’énoncé quand il y en a plusieurs.</li>
    <li>Le total des points fait 20 à l’étape 4.</li>
    <li>L’aperçu, à droite de l’étape 2, montre le sujet tel que l’étudiant le recevra.</li>
  </ul>
  <h2>Après l’épreuve</h2>
  <p>À la clôture, lancez la correction. Les questions sans réponse listée vous sont signalées pour une correction à la main. Sur chaque copie, <b>Modifier la note de cet exercice</b> permet un ajustement (le point de propreté, par exemple), enregistré avec son motif. Publiez ensuite les résultats : les étudiants voient leur copie annotée et, si l’épreuve le propose, le corrigé.</p>
  <p><b>Réutiliser un exercice.</b> « Enregistrer dans la banque », sous chaque exercice, le range dans votre banque. Il se retrouve ensuite avec « Importer depuis la banque » dans une autre épreuve.</p>
</section>

<script>
  // Toutes les captures à la même échelle (prises en 2x) : 0,64 de la taille écran, sans déborder.
  for (const img of document.querySelectorAll('.shot img')) {
    const fig = img.closest('.shot');
    const k = fig.classList.contains('small') ? 0.5 : fig.classList.contains('medium') ? 0.5 : 0.64;
    img.style.width = Math.min(img.naturalWidth / 2 * k, fig.clientWidth) + 'px';
  }
  for (const img of document.querySelectorAll('.paper img')) img.style.width = Math.min(img.naturalWidth / 2.6 * 1.15, img.parentElement.clientWidth - 4) + 'px';
</script>
</body></html>`;

fs.writeFileSync(path.join(GUIDE, 'guide.html'), html);
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto('file://' + path.join(GUIDE, 'guide.html'));
await page.waitForLoadState('load');
await page.evaluate(() => Promise.all([...document.images].map((i) => i.complete || new Promise((r) => (i.onload = i.onerror = r)))));
await page.evaluate(() => {
  for (const img of document.querySelectorAll('.shot img')) {
    const fig = img.closest('.shot');
    const k = fig.classList.contains('small') || fig.classList.contains('medium') ? 0.5 : 0.64;
    img.style.width = Math.min(img.naturalWidth / 2 * k, fig.clientWidth) + 'px';
  }
  for (const img of document.querySelectorAll('.paper img')) img.style.width = Math.min(img.naturalWidth / 2.6 * 1.15, img.parentElement.clientWidth - 4) + 'px';
});
await page.pdf({
  path: path.join(GUIDE, 'Guide-enseignant-CodEval.pdf'),
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<div></div>',
  footerTemplate: '<div style="font:8px Helvetica,Arial,sans-serif;color:#8A8F99;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>CodEval · Saisir vos sujets, exercice par exercice</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
  margin: { top: '14mm', bottom: '17mm', left: '15mm', right: '15mm' },
});
await browser.close();
console.log('PDF écrit.');
