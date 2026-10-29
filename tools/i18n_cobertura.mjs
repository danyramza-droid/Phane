// Cobertura del inglés de Phane: lista el texto en español que se escapa del diccionario (web/js/data/i18n_en.js).
// Uso (desde la carpeta de Phane):
//   node tools/i18n_cobertura.mjs            análisis estático (no necesita ComfyUI)
//   node tools/i18n_cobertura.mjs --cdp      además abre /phane?lang=en en Edge headless (CDP) y revisa el texto
//                                            de cada página (solo hace clic en el menú; no genera nada)
//   node tools/i18n_cobertura.mjs --json out.json   guarda la lista completa
// Estático: saca los literales ('…', "…", `…`) de web/js/**/*.js, se queda con los que parecen español y los pasa
// por tr() (la misma lógica de js/i18n.js). Las partes ${…} de las plantillas se prueban como un número ("7").
// Lo que sale sin cambio es un texto que en EN se vería en español.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'web', 'js');
const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args[args.indexOf('--json') + 1] : null;

/* ---------- tr() de i18n.js sin la parte del DOM ---------- */
async function loadTr() {
  let src = fs.readFileSync(path.join(JS, 'i18n.js'), 'utf8');
  src = src.split('/* ---------------- DOM')[0].replace(/export const LANG = [^;]+;/, "export const LANG = 'en';");   // forzar EN (el vivo arranca en ES)
  src = src.replace("from './data/i18n_en.js'", `from '${pathToFileURL(path.join(JS, 'data', 'i18n_en.js')).href}?t=${Date.now()}'`);
  const tmp = path.join(os.tmpdir(), `phane_i18n_tr_${process.pid}.mjs`);
  fs.writeFileSync(tmp, src);
  const m = await import(pathToFileURL(tmp).href);
  try { fs.unlinkSync(tmp); } catch { /* */ }
  return m.tr;
}

/* ---------- ¿parece español? ---------- */
const ES_WORDS = /(^|[^\p{L}])(de|del|la|las|los|el|que|para|con|una|uno|por|sin|tu|tus|más|mas|está|esta|este|esto|son|hay|ya|no se|se|al|lo|le|o sea|cuando|como|cómo|qué|aquí|elige|sube|usa|haz|abre|cierra|guarda|borra|espera|listo|nada|todo|todos|pero|también|sólo|solo|muy|cada|otra|otro|segundos|minutos|imagen|imágenes|video|videos|archivo|carpeta|motor|motores|falta|faltan|tarda|tardará|aprox)(?=$|[^\p{L}])/iu;
const ES_CHARS = /[áéíóúñ¿¡]/i;
function looksSpanish(s, strict = false) {
  const c = s.trim();
  if (c.length < 2 || !/\p{L}{2}/u.test(c)) return false;
  if (/^[\w.\-/\\]+\.(js|json|png|jpg|mp4|webp|safetensors|gguf|py|css|html|wav|mp3)$/i.test(c)) return false;   // archivos
  if (/^(https?:|\/|\.\/|data:)/.test(c)) return false;                                                       // URLs
  if (/^[a-z0-9_\-.:]+$/.test(c) && !ES_CHARS.test(c)) return false;                                          // ids, clases, claves
  if (/^[\w\-]+(\s+[\w\-]+)*$/.test(c) && /[-_]/.test(c) && !/\s/.test(c)) return false;
  if (ES_CHARS.test(c)) return true;
  if ((c.match(/(^|[^\p{L}])(the|and|with|of|is|to|in|on|a|an|it|its|then|from|into|style|shows|starts|begins)(?=$|[^\p{L}])/giu) || []).length >= 2) return false;   // inglés (prompts)
  const words = c.match(/\p{L}+/gu) || [];
  if (words.length < 2) return /^(Listo|Cerrar|Borrar|Guardar|Cancelar|Subir|Generar|Disco|Cola|Recientes|Personajes|Ninguno|Ninguna|Nuevo|Nueva|Otro|Otra|Ejemplo|Fondo|Rostro|Cuerpo|Calidad|Rápido|Ancho|Alto|Duración|Pasos|Semilla|Fuerza|Texto|Voz|Música|Ajustes|Opciones|Avanzado|Original|Cámara|Efecto|Efectos|Estilo|Estilos)$/.test(c);
  return ES_WORDS.test(strict ? c.replace(/(^|[^\p{L}])(videos?|motor|original|solo|a)(?=$|[^\p{L}])/giu, ' ') : c);
}
/** Prompts para el modelo (en inglés), CSS, selectores: no son texto de interfaz. */
function notUi(s) {
  const c = s.trim();
  if (/[{};]\s*$/.test(c) && /:\s*[^ ]/.test(c) && /(px|rem|%|var\(|#[0-9a-f]{3})/i.test(c)) return true;     // css
  if (/^[.#\[][\w\-]/.test(c) && !/\s\p{Ll}+\s/u.test(c)) return true;                                       // selector
  return false;
}

/** Contenido que el usuario edita (letras de ejemplo, guiones de voz) o que va al modelo: no es interfaz. */
const IGNORE = [/^\[Verse\]/, /^(phane|highend)\//, /^[A-Z]:\\/, /^página$/, /\{subject\}/, /^(Language: English|Idioma: español) · /,
  /^[\w\- ]+(, [\w\- ]+){3,}$/,   // listas de etiquetas en inglés para el modelo
  /^A cyclist rides/, /^(image|video|audio)\/[\w*]/, /,\.x$/,
  /^(Hola|¡Hola|¡Atención|En lo más profundo|Muy buenas|Había una vez|No importa cuántas|Este es el nuevo termo|Buenas noches\. Les)/,
  /^(una chica con impermeable|ponle un sombrero)/];

/* ---------- literales de los .js ---------- */
const SKIP_FILES = new Set(['i18n_en.js', 'i18n.js']);
function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name))
    : (e.name.endsWith('.js') && !SKIP_FILES.has(e.name) ? [path.join(d, e.name)] : []));
}
function literals(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '\n') { line++; i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { const j = src.indexOf('*/', i + 2); const blk = src.slice(i, j < 0 ? n : j + 2); line += (blk.match(/\n/g) || []).length; i = j < 0 ? n : j + 2; continue; }
    if (ch === "'" || ch === '"' || ch === '`') {
      const q = ch, l0 = line; let j = i + 1, s = '', depth = 0;
      while (j < n) {
        const c = src[j];
        if (c === '\\') { const nx = src[j + 1]; s += nx === 'n' ? '\n' : nx === 't' ? '\t' : nx; j += 2; continue; }
        if (c === '\n') line++;
        if (q === '`' && c === '$' && src[j + 1] === '{') {   // ${…} -> marcador
          let k = j + 2; depth = 1;
          while (k < n && depth) { if (src[k] === '{') depth++; else if (src[k] === '}') depth--; else if (src[k] === '\n') line++; k++; }
          s += '\u0000'; j = k; continue;
        }
        if (c === q) break;
        if (q !== '`' && c === '\n') break;
        s += c; j++;
      }
      out.push({ s, line: l0, tpl: s.includes('\u0000') });
      i = j + 1; continue;
    }
    i++;
  }
  return out;
}

const tr = await loadTr();
const miss = new Map();   // texto -> [archivo:línea]
let total = 0;
for (const f of walk(JS)) {
  const rel = path.relative(path.join(ROOT, 'web'), f).replace(/\\/g, '/');
  const src = fs.readFileSync(f, 'utf8');
  for (const { s, line } of literals(src)) {
    if (IGNORE.some(re => re.test(s))) continue;
    // HTML: en el DOM cada texto entre etiquetas es un nodo aparte, así lo traduce i18n.js
    const pieces = /<\/?[a-z][^>]*>/i.test(s) ? s.split(/<[^>]+>/).map(x => x.trim()).filter(Boolean) : [s];
    for (const p of pieces) {
      const shown = p.replace(/\u0000/g, '7');
      if (!looksSpanish(shown.replace(/7/g, '')) || notUi(shown)) continue;
      total++;
      // ¿quedó algo en español? (se traducen los pedazos por separado: miramos si cambió y si aún parece español)
      // Pedazos de 'a' + x + 'b': se prueban también con un valor pegado antes / después.
      const ok = v => { const out = tr(v); return out !== v && !looksSpanish(out, true); };
      if (ok(shown) || ok(shown + '7') || ok('7' + shown) || ok('7' + shown + '7') || ok(shown + 'x).') || ok(shown.trim())) continue;
      const key = p.replace(/\u0000/g, '{0}');
      if (!miss.has(key)) miss.set(key, []);
      miss.get(key).push(`${rel}:${line}`);
    }
  }
}

/* ---------- CDP: texto visible de cada página en EN ---------- */
const live = new Map();
if (args.includes('--cdp')) {
  const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const PORT = 9334, U = 'http://127.0.0.1:8188';
  const proc = spawn(edge, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${PORT}`, '--user-data-dir=' + path.join(os.tmpdir(), 'edge_cdp_i18n'), '--remote-allow-origins=*', 'about:blank'], { stdio: 'ignore', detached: false });
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let tgt;
  for (let i = 0; i < 40 && !tgt; i++) { await sleep(500); try { tgt = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(t => t.type === 'page'); } catch { /* */ } }
  if (!tgt) { console.error('No pude abrir Edge por CDP'); process.exit(1); }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const wait = {};
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait[m.id]) { wait[m.id](m); delete wait[m.id]; } };
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; wait[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => (await cmd('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
  await cmd('Runtime.enable'); await cmd('Page.enable');
  // bloquear /prompt por si acaso: esta revisión nunca manda nada a la cola
  await cmd('Fetch.enable', { patterns: [{ urlPattern: '*/prompt*' }] });
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.method === 'Fetch.requestPaused') cmd('Fetch.failRequest', { requestId: m.params.requestId, errorReason: 'BlockedByClient' }); });
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: `${U}/phane?lang=en` });
  await sleep(8000);
  const ids = await ev(`[...document.querySelectorAll('.nav-btn')].map(b => b.dataset.id)`) || [];
  // todo el texto (también el oculto: otros motores, pestañas) + title/placeholder/aria-label/alt + <option>
  const grab = `(() => { const out = []; const skip = e => { for (; e && e.nodeType === 1; e = e.parentElement) if (/^(SCRIPT|STYLE|TEXTAREA|CODE|PRE)$/.test(e.tagName) || e.isContentEditable || e.hasAttribute('data-noi18n')) return true; return false; };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) { const v = n.data.trim(); if (v && !skip(n.parentElement)) out.push(v); }
    document.querySelectorAll('[title],[placeholder],[aria-label],[alt]').forEach(el => { if (skip(el.parentElement)) return; for (const a of ['title','placeholder','aria-label','alt']) { const v = el.getAttribute(a); if (v) out.push(v.trim()); } });
    return out; })()`;
  for (const pid of ids) {
    await ev(`document.querySelector('.nav-btn[data-id="${pid}"]').click()`);
    await sleep(2500);
    for (const v of await ev(grab) || []) {
      if (!looksSpanish(v, true) || notUi(v) || IGNORE.some(re => re.test(v))) continue;
      if (!live.has(v)) live.set(v, new Set());
      live.get(v).add(pid);
    }
    console.log('ok', pid);
  }
  await cmd('Page.navigate', { url: 'about:blank' }); await sleep(1500);
  ws.send(JSON.stringify({ id: 99999, method: 'Browser.close' }));   // cerrar sin matar (matar Edge tumba el socket de ComfyUI)
  await sleep(1000);
}

/* ---------- reporte ---------- */
const rows = [...miss.entries()].sort((a, b) => a[1][0].localeCompare(b[1][0]));
console.log(`\nEstático: ${total} literales en español revisados, ${rows.length} sin traducción.`);
for (const [k, where] of rows) console.log(`  ${where[0]}${where.length > 1 ? ` (+${where.length - 1})` : ''}  ${JSON.stringify(k).slice(0, 160)}`);
if (live.size) {
  console.log(`\nEn pantalla (EN): ${live.size} textos siguen en español.`);
  for (const [k, p] of live) console.log(`  [${[...p].join(',')}]  ${JSON.stringify(k).slice(0, 160)}`);
}
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ estatico: Object.fromEntries(rows), pantalla: Object.fromEntries([...live].map(([k, v]) => [k, [...v]])) }, null, 1));
