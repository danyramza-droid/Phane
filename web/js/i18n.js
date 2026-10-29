// Idioma de la interfaz (ES / EN). Capa de traducción en tiempo real: las páginas siguen escribiendo en español y,
// si el idioma es 'en', un MutationObserver traduce el texto visible y los atributos title/placeholder/aria-label/alt
// con el diccionario de data/i18n_en.js. No toca lo que escribe el usuario (textarea, inputs de texto, contenteditable)
// ni lo que está dentro de <code>/<pre> o de un elemento con data-noi18n.
// Elegir idioma: botón ES/EN de la barra de arriba (se guarda en localStorage) o ?lang=en|es en la URL (solo esa pestaña).
import { EN } from './data/i18n_en.js';

export const DEFAULT_LANG = 'en';   // la copia pública (build.py) lo cambia a 'en'
const LS_KEY = 'phane.lang';

function pickLang() {
  try { const q = new URLSearchParams(location.search).get('lang'); if (q === 'en' || q === 'es') return q; } catch { /* */ }
  try { const s = localStorage.getItem(LS_KEY); if (s === 'en' || s === 'es') return s; } catch { /* */ }
  return DEFAULT_LANG;
}
export const LANG = pickLang();

/** Cambia el idioma, lo recuerda y recarga la página (quita ?lang= para que mande lo elegido). */
export function setLang(l) {
  try { localStorage.setItem(LS_KEY, l); } catch { /* */ }
  const u = new URL(location.href); u.searchParams.delete('lang');
  location.href = u.toString();
}

/* ---------------- diccionario ---------------- */
const SEPS = [' · ', ' — ', ' – ', ' | ', '\n'];
const exact = new Map();
const pats = [];   // claves con {n}: regex + plantilla en inglés
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SEP0 = /^[·—–|]\s+/;   // "· faltan {0}…": al partir un texto por " · " el pedazo llega sin el separador
const entries = Object.entries(EN);
for (const [k, v] of Object.entries(EN)) if (v != null && SEP0.test(k) && !((k.replace(SEP0, '')) in EN)) entries.push([k.replace(SEP0, ''), v.replace(SEP0, '')]);
for (const [k, v] of entries) {
  if (v == null) continue;
  if (!/\{\d+\}/.test(k)) { exact.set(k, v); continue; }
  const bits = k.split(/\{(\d+)\}/);   // [txt, n, txt, n, txt…]
  let re = '^', g = 0; const map = {}; let lit = '', letters = 0;
  for (let i = 0; i < bits.length; i++) {
    if (i % 2) { map[bits[i]] = ++g; re += '([\\s\\S]*?)'; }
    else { re += esc(bits[i]); if (bits[i].length > lit.length) lit = bits[i]; letters += (bits[i].match(/\p{L}/gu) || []).length; }
  }
  pats.push({ re: new RegExp(re + '$'), map, out: v, lit, letters, sep: SEPS.some(x => k.includes(x)) });
}
pats.sort((a, b) => b.letters - a.letters);

/* ---------------- traducir un texto ---------------- */
const cache = new Map();
const PRE = /^([^\p{L}\p{N}¿¡"'(«]+)([\s\S]+)$/u;   // emoji / símbolos al inicio
const POST = /^([\s\S]+?)([\s.:;,…!?)»]+)$/;         // puntuación al final

function core(c, d, onlySep) {
  const ex = exact.get(c); if (ex != null) return ex;
  for (const p of pats) {
    if ((onlySep && !p.sep && p.letters < 12) || (p.lit && !c.includes(p.lit))) continue;
    const m = p.re.exec(c);
    if (m) return p.out.replace(/\{(\d+)\}/g, (_, i) => tr(m[p.map[i]] ?? '', d + 1));
  }
  return null;
}
function trCore(c, d) {
  if (!/\p{L}/u.test(c)) return c;
  const ex = exact.get(c); if (ex != null) return ex;
  // "a · b · c": primero los patrones que ya traen el separador (o mucho texto fijo), luego cada pedazo por separado
  // (si no, un patrón genérico como "{0} archivo(s)" se comería el texto entero)
  let r0 = SEPS.some(x => c.includes(x)) ? core(c, d, true) : null; if (r0 != null) return r0;
  if (d < 4) for (const sep of SEPS) if (c.includes(sep)) {
    const parts = c.split(sep), tp = parts.map(x => tr(x, d + 1));
    if (tp.some((x, i) => x !== parts[i])) return tp.join(sep);
  }
  let r = core(c, d); if (r != null) return r;
  const n = c.replace(/\s+/g, ' ');
  if (n !== c && (r = core(n, d)) != null) return r;
  let m = PRE.exec(n);
  if (m && (r = core(m[2].trim(), d)) != null) return m[1] + r;
  m = POST.exec(n);
  if (m && (r = core(m[1], d)) != null) return r + m[2];
  return c;
}
/** Traduce un texto ES -> EN (si el idioma es 'en'); conserva los espacios de los bordes. */
export function tr(s, d = 0) {
  if (LANG !== 'en' || !s || d > 6) return s;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(s), c = m[2];
  if (!c) return s;
  let r = cache.get(c);
  if (r === undefined) { r = trCore(c, d); if (cache.size > 20000) cache.clear(); cache.set(c, r); }
  return r === c ? s : m[1] + r + m[3];
}
export const t = tr;

/* ---------------- DOM ---------------- */
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE', 'NOSCRIPT']);
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const done = new WeakMap();   // nodo de texto -> último valor que pusimos (evita repetir trabajo)

function skipped(el, attr) {
  // attr: placeholder/title de un <textarea> sí se traducen (su contenido, lo que escribe el usuario, no)
  if (attr && el && SKIP_TAGS.has(el.tagName)) return el.hasAttribute('data-noi18n') || skipped(el.parentElement);
  for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName) || e.isContentEditable || e.hasAttribute('data-noi18n')) return true;
  }
  return false;
}
function doText(n) {
  const v = n.data;
  if (done.get(n) === v || !/\p{L}/u.test(v)) return;
  if (skipped(n.parentElement)) return;
  const r = tr(v);
  done.set(n, r);
  if (r !== v) n.data = r;
}
function doAttrs(el) {
  if (skipped(el, true)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v) { const r = tr(v); if (r !== v) el.setAttribute(a, r); }
  }
  if (el.tagName === 'INPUT' && /^(button|submit|reset)$/i.test(el.type) && el.value) { const r = tr(el.value); if (r !== el.value) el.value = r; }
}
function doTree(root) {
  if (root.nodeType === 3) return doText(root);
  if (root.nodeType !== 1 && root.nodeType !== 11) return;
  if (root.nodeType === 1) { doAttrs(root); if (SKIP_TAGS.has(root.tagName)) return; }
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) doText(n);
  root.querySelectorAll?.('[title],[placeholder],[aria-label],[alt],input[type=button],input[type=submit]').forEach(doAttrs);
}

if (LANG === 'en') {
  const obs = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(doTree);
      else if (m.type === 'characterData') doText(m.target);
      else if (m.type === 'attributes') doAttrs(m.target);
    }
  });
  const start = () => {
    doTree(document.body);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  document.title = tr(document.title);
  // diálogos nativos (p. ej. el nombre de un Personaje nuevo)
  for (const k of ['alert', 'confirm', 'prompt']) {
    const orig = window[k].bind(window);
    window[k] = (msg, ...rest) => orig(typeof msg === 'string' ? tr(msg) : msg, ...rest);
  }
}
try { document.documentElement.lang = LANG; } catch { /* */ }
