import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/Users/christ-phanuel/PycharmProjects/CodEval/frontend/package.json');
export const { chromium } = require('playwright');

export const API = 'http://localhost:8000';
export const WEB = 'http://localhost:5173';
const ENV_FILE = '/Users/christ-phanuel/PycharmProjects/CodEval/backend/.env';

function readEnv() {
  return Object.fromEntries(
    fs.readFileSync(ENV_FILE, 'utf8').split('\n').filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );
}

export async function login() {
  const env = readEnv();
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.CODEVAL_DEV_GUIDE_TEACHER_EMAIL, password: env.CODEVAL_DEV_GUIDE_TEACHER_PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${r.status}`);
  return (await r.json()).access_token;
}

export async function apiCall(token, path, { method = 'GET', body } = {}) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}

export async function openBrowser(token, { width = 1440, height = 900, scale = 2 } = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, locale: 'fr-FR', timezoneId: 'Africa/Abidjan', colorScheme: 'light' });
  await context.addInitScript((t) => {
    try { localStorage.setItem('codeval.token', t); } catch {}
  }, token);
  const page = await context.newPage();
  return { browser, context, page };
}

/* ------------------------------------------------------------------ */
/* Captures annotées : cadres, pastilles numérotées, flèches, étiquettes */
/* ------------------------------------------------------------------ */

const CLEAN_CSS = `
  *, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }
  .g-hide { visibility: hidden !important; }
`;

export async function prepare(page) {
  await page.addStyleTag({ content: CLEAN_CSS });
}

async function rectOf(page, target) {
  if (!target) return null;
  if (typeof target === 'function') return target();
  if (typeof target.boundingBox === 'function') {
    const n = await target.count();
    if (n > 1) return union(await Promise.all([...Array(n)].map((_, k) => rectOf(page, target.nth(k)))));
    await target.waitFor({ state: 'visible', timeout: 10000 });
    const b = await target.boundingBox();
    return b && { x: b.x, y: b.y, w: b.width, h: b.height };
  }
  if (Array.isArray(target)) {
    const rs = (await Promise.all(target.map((t) => rectOf(page, t)))).filter(Boolean);
    return union(rs);
  }
  return target; // déjà {x,y,w,h}
}

function union(rs) {
  if (!rs.length) return null;
  const x1 = Math.min(...rs.map((r) => r.x)), y1 = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.w)), y2 = Math.max(...rs.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function drawOverlay({ marks, region }) {
  const RED = '#E0353B', BLUE = '#1F5BD8', GREEN = '#15803D';
  const tone = (t) => (t === 'blue' ? BLUE : t === 'green' ? GREEN : RED);
  document.getElementById('g-ov')?.remove();
  const root = document.createElement('div');
  root.id = 'g-ov';
  Object.assign(root.style, { position: 'fixed', inset: '0', zIndex: 2147483647, pointerEvents: 'none', fontFamily: 'Inter, system-ui, sans-serif' });
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', innerWidth); svg.setAttribute('height', innerHeight);
  Object.assign(svg.style, { position: 'absolute', left: 0, top: 0, overflow: 'visible' });
  svg.innerHTML = ['red', 'blue', 'green'].map((t) => `<marker id="g-head-${t}" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.2" markerHeight="5.2" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${tone(t)}"/></marker>`).join('');
  root.appendChild(svg);
  document.body.appendChild(root);
  const placed = [];
  const labels = [];

  for (const m of marks) {
    const c = tone(m.tone);
    const p = m.boxPad ?? 5;
    const r = { x: m.box.x - p, y: m.box.y - p, w: m.box.w + 2 * p, h: m.box.h + 2 * p };
    if (!m.noBox) {
      const d = document.createElement('div');
      Object.assign(d.style, {
        position: 'absolute', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px`,
        border: `3px solid ${c}`, borderRadius: '9px', boxShadow: '0 0 0 2px rgba(255,255,255,.85), 0 0 0 5px rgba(224,53,59,.10)',
        boxSizing: 'border-box', background: m.fill ? 'rgba(224,53,59,.06)' : 'transparent',
      });
      root.appendChild(d);
      placed.push(r);
    }
    if (m.n != null) {
      const b = document.createElement('div');
      const size = 28;
      const corner = m.badge ?? 'tr';
      let bx = r.x - size / 2, by = r.y - size / 2;
      if (corner.includes('r')) bx = r.x + r.w - size / 2;
      if (corner.includes('b')) by = r.y + r.h - size / 2;
      if (corner === 't') { bx = r.x + r.w / 2 - size / 2; }
      if (corner === 'l') { bx = r.x - size - 6; by = r.y + r.h / 2 - size / 2; }
      if (corner === 'r') { bx = r.x + r.w + 6; by = r.y + r.h / 2 - size / 2; }
      bx += m.badgeDx ?? 0; by += m.badgeDy ?? 0;
      Object.assign(b.style, {
        position: 'absolute', left: `${bx}px`, top: `${by}px`, width: `${size}px`, height: `${size}px`,
        borderRadius: '50%', background: c, color: '#fff', font: '700 15px/28px Inter, system-ui, sans-serif',
        textAlign: 'center', boxShadow: '0 0 0 2.5px #fff, 0 2px 6px rgba(0,0,0,.25)',
      });
      b.textContent = m.n;
      root.appendChild(b);
      placed.push({ x: bx - 3, y: by - 3, w: size + 6, h: size + 6 });
    }
    if (m.label) {
      const l = document.createElement('div');
      Object.assign(l.style, {
        position: 'absolute', left: '0px', top: '0px', maxWidth: m.nowrap ? 'none' : `${m.maxw ?? 260}px`,
        background: '#fff', color: '#16181D', border: `2.5px solid ${c}`, borderRadius: '10px',
        padding: '7px 13px', font: '600 15.5px/1.32 Inter, system-ui, sans-serif',
        boxShadow: '0 3px 10px rgba(0,0,0,.14)', whiteSpace: m.nowrap ? 'nowrap' : 'normal',
      });
      l.innerHTML = m.label;
      root.appendChild(l);
      const lw = l.offsetWidth, lh = l.offsetHeight;
      const side = m.side ?? 'right';
      const dist = m.dist ?? 56;
      let lx, ly;
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (side === 'right') { lx = r.x + r.w + dist; ly = cy - lh / 2; }
      if (side === 'left') { lx = r.x - dist - lw; ly = cy - lh / 2; }
      if (side === 'top') { lx = cx - lw / 2; ly = r.y - dist - lh; }
      if (side === 'bottom') { lx = cx - lw / 2; ly = r.y + r.h + dist; }
      // Dans la marge, à droite ou à gauche de toute la zone capturée.
      if (side === 'gutter') { lx = region.x + region.w + (m.dist ?? 36); ly = cy - lh / 2; }
      if (side === 'gutterLeft') { lx = region.x - (m.dist ?? 36) - lw; ly = cy - lh / 2; }
      lx += m.dx ?? 0; ly += m.dy ?? 0;
      // Deux étiquettes ne se chevauchent pas : la seconde descend.
      const hit = (a) => !(lx + lw + 6 < a.x || a.x + a.w + 6 < lx || ly + lh + 6 < a.y || a.y + a.h + 6 < ly);
      for (let guard = 0; guard < 10; guard++) {
        const other = labels.find(hit);
        if (!other) break;
        ly = other.y + other.h + 8;
      }
      l.style.left = `${lx}px`; l.style.top = `${ly}px`;
      const L = { x: lx, y: ly, w: lw, h: lh };
      placed.push(L);
      labels.push(L);
      if (m.arrow === false) continue;
      // Flèche : du bord de l'étiquette vers le bord du cadre, légèrement courbée.
      const lc = { x: L.x + L.w / 2, y: L.y + L.h / 2 };
      const edge = (R, toward, gap) => {
        const cxR = R.x + R.w / 2, cyR = R.y + R.h / 2;
        const dx = toward.x - cxR, dy = toward.y - cyR;
        if (dx === 0 && dy === 0) return { x: cxR, y: cyR };
        const sx = (R.w / 2 + gap) / Math.abs(dx || 1e-9), sy = (R.h / 2 + gap) / Math.abs(dy || 1e-9);
        const s = Math.min(sx, sy);
        return { x: cxR + dx * s, y: cyR + dy * s };
      };
      const tgt = m.arrowTo ? { x: r.x + r.w * m.arrowTo[0], y: r.y + r.h * m.arrowTo[1], w: 0, h: 0 } : r;
      const tc = { x: tgt.x + tgt.w / 2, y: tgt.y + tgt.h / 2 };
      const a = edge(L, tc, 2);
      const z = m.arrowTo ? tc : edge(r, lc, 4);
      const mx = (a.x + z.x) / 2, my = (a.y + z.y) / 2;
      const len = Math.hypot(z.x - a.x, z.y - a.y);
      const bend = (m.bend ?? 0.12) * len;
      const nx = -(z.y - a.y) / (len || 1), ny = (z.x - a.x) / (len || 1);
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', `M${a.x},${a.y} Q${mx + nx * bend},${my + ny * bend} ${z.x},${z.y}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', c);
      path.setAttribute('stroke-width', '3');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('marker-end', `url(#g-head-${m.tone ?? 'red'})`);
      const halo = path.cloneNode();
      halo.setAttribute('stroke', '#fff'); halo.setAttribute('stroke-width', '7'); halo.removeAttribute('marker-end');
      svg.appendChild(halo);
      svg.appendChild(path);
    }
  }
  return placed;
}

/**
 * Prend une capture d'une zone de l'écran, avec ses annotations.
 * region : Locator | Locator[] | {x,y,w,h} (coordonnées de la fenêtre)
 * marks  : [{ el, n, label, side, dist, dx, dy, tone, boxPad, noBox, badge, maxw, arrowTo }]
 */
export async function shot(page, file, { region, marks = [], pad = 16, top = 90, hide = [], minWidth = 0, extend = {}, gutter = 0 } = {}) {
  const vp = page.viewportSize();
  // Une marge à droite du contenu : de la place pour les étiquettes.
  const g = gutter ? await page.addStyleTag({ content: `.content { margin-right: ${gutter}px !important; }` }) : null;
  if (g) await page.waitForTimeout(100);
  await page.evaluate(() => document.activeElement?.blur?.());
  const loc = (sel) => (typeof sel === 'string' ? page.locator(sel) : sel);
  for (const sel of hide) await loc(sel).evaluateAll((els) => els.forEach((e) => e.classList.add('g-hide')));
  // Amener la zone en haut de l'écran, et agrandir la fenêtre si elle ne tient pas.
  let reg = await rectOf(page, region);
  let grown = false;
  if (reg.h + top + 60 > vp.height) {
    await page.setViewportSize({ width: vp.width, height: Math.ceil(reg.h + top + 160) });
    grown = true;
  }
  await page.evaluate((dy) => window.scrollBy(0, dy), reg.y - top);
  await page.waitForTimeout(150);
  reg = await rectOf(page, region);
  const resolved = [];
  for (const m of marks) resolved.push({ ...m, el: undefined, box: await rectOf(page, m.el) });
  const placed = await page.evaluate(drawOverlay, { marks: resolved, region: reg });
  const all = union([reg, ...placed]);
  const cur = page.viewportSize();
  let x1 = Math.max(0, all.x - pad - (extend.left ?? 0));
  let x2 = Math.min(cur.width, all.x + all.w + pad + (extend.right ?? 0));
  if (x2 - x1 < minWidth) x2 = Math.min(cur.width, x1 + minWidth);
  const y1 = Math.max(0, all.y - pad - (extend.top ?? 0));
  const y2 = Math.min(cur.height, all.y + all.h + pad + (extend.bottom ?? 0));
  const clip = { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
  await page.screenshot({ path: file, clip, animations: 'disabled', caret: 'hide' });
  await page.evaluate(() => document.getElementById('g-ov')?.remove());
  for (const sel of hide) await loc(sel).evaluateAll((els) => els.forEach((e) => e.classList.remove('g-hide')));
  if (grown) await page.setViewportSize(vp);
  if (g) await g.evaluate((el) => el.remove());
  console.log('  ✓', file.split('/').pop(), `${Math.round(clip.width)}×${Math.round(clip.height)}`);
  return { file, w: clip.width, h: clip.height, marks: marks.filter((m) => m.n != null).map((m) => ({ n: m.n })) };
}
