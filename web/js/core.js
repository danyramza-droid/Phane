// Runtime del navegador: API de ComfyUI, cola, WebSocket, vista previa en vivo, estimaciones, seguridad y eventos.
import { RAM_CAP, missingFiles, TIER_INFO, engineById } from './engines.js';

const CID = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

/* ---------------- utilidades ---------------- */
export const fmt = s => { s = Math.max(0, Math.round(s)); return s >= 3600 ? `${Math.floor(s / 3600)}h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const store = {
  get(k, d) { try { const v = localStorage.getItem('phane.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('phane.' + k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
};
export async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); }

/* ---------------- eventos ---------------- */
const listeners = {};
export const on = (ev, fn) => (listeners[ev] ||= []).push(fn);
export const emit = (ev, data) => (listeners[ev] || []).forEach(fn => { try { fn(data); } catch (e) { console.error(e); } });

/* ---------------- estado global ---------------- */
export const state = {
  tier: store.get('tier', 'ligero'),     // switch de poder
  installed: null,                       // {ruta: GB} de /phane/api/modelos
  sys: null,                             // /phane/api/sistema
  outdir: '',
  gallery: [],
  loras: [],
  comercial: store.get('soloComercial', false),   // switch "💼 Solo uso comercial": esconde y bloquea motores 🔴 (no comercial)
};
export function setTier(t) { state.tier = t; store.set('tier', t); emit('tier', t); }
export function setComercial(v) { state.comercial = !!v; store.set('soloComercial', state.comercial); emit('comercial', state.comercial); }

export async function refreshModels() { try { state.installed = await getJSON('/phane/api/modelos'); emit('models', state.installed); } catch { /* servidor ocupado */ } }
export async function refreshSys() {
  try {
    const first = !state.sys;
    state.sys = await getJSON('/phane/api/sistema');
    // primera vez en esta PC (nadie ha tocado el switch): el modo por defecto lo decide la VRAM
    if (first && store.get('tier', null) == null) setTier((state.sys.vram_total || 0) >= 15 ? 'highend' : 'ligero');
    emit('sys', state.sys);
  } catch { /* */ }
}

/* ---------------- tarjeta de video de ESTA PC ---------------- */
// Los tiempos de cada motor (engine.est) se midieron en una una GPU de 8 GB de 8 GB. Otras tarjetas: factor de velocidad
// aproximado (más VRAM = menos ir y venir a la RAM). Si no la conocemos, por VRAM.
const GPU_SPEED = [[/5090/, 6], [/4090/, 4.5], [/5080/, 3.5], [/4080/, 3.2], [/3090/, 2.3], [/5070|4070/, 2.2], [/3080/, 2],
  [/5060|4060|3070/, 1.4], [/2080/, 1.2], [/3060|2070/, 1], [/2060/, 0.75], [/1660|1650|1080|1070|1060/, 0.4]];
export function gpuInfo() {
  const s = state.sys || {};
  const name = String(s.gpu || '').replace(/^NVIDIA\s+/i, '').replace(/^GeForce\s+/i, '').replace(/\s+GPU$/i, '').trim();
  const vram = s.vram_total || 0, ram = s.ram_total || 0;
  const hit = GPU_SPEED.find(([r]) => r.test(name));
  const speed = hit ? hit[1] : vram >= 24 ? 4 : vram >= 15 ? 2.5 : vram >= 11 ? 1.5 : 1;
  return { known: !!state.sys, nvidia: !!s.gpu, name, vram, ram, speed, tu: name ? 'tu ' + name : 'tu PC' };
}
/** ¿La PC llega al mínimo? Mínimo (26-oct): NVIDIA 8 GB + 64 GB de RAM para video; 8 GB + 32 GB para imagen y edición. */
export function pcLevel() {
  const g = gpuInfo();
  if (!g.known) return { level: 'ok' };
  const ram = Math.round(g.ram), vram = Math.round(g.vram);
  if (!g.nvidia) return { level: 'none', msg: 'No encontré una tarjeta NVIDIA. Phane necesita una NVIDIA de 8 GB o más (AMD y Mac todavía no): en esta PC casi nada va a funcionar.' };
  if (g.vram < 7.5 || g.ram < 30) return { level: 'min', msg: `Tu ${g.name} (${vram} GB) con ${ram} GB de RAM está bajo el mínimo (NVIDIA de 8 GB + 32 GB de RAM): casi nada va a funcionar.` };
  if (g.ram < 60) return { level: 'img', msg: `Con ${ram} GB de RAM puedes usar imágenes y edición, pero video casi no (pide 64 GB). Los motores que no caben quedan marcados 🔒.` };
  return { level: 'ok' };
}
export async function refreshGallery() { try { state.gallery = await getJSON('/phane/api/archivos'); emit('gallery', state.gallery); } catch { /* */ } }
export async function refreshLoras() { try { state.loras = await getJSON('/models/loras'); emit('loras', state.loras); } catch { /* */ } }
/** Nombre exacto (con subcarpeta y separador del SO) de una LoRA instalada, buscando por nombre de archivo. */
export const loraName = file => file && state.loras.find(n => n.replace(/\\/g, '/').split('/').pop().toLowerCase() === String(file).toLowerCase());
// 28-oct: ruta propia; /estudio/outdir (nodo viejo estudio_simple) queda solo de respaldo hasta reiniciar ComfyUI
fetch('/phane/api/outdir').then(r => r.ok ? r : fetch('/estudio/outdir')).then(r => r.json()).then(j => { state.outdir = j.output; }).catch(() => {});

/* ---------------- archivos ---------------- */
export const urlOf = f => `/view?filename=${encodeURIComponent(f.filename)}&subfolder=${encodeURIComponent(f.subfolder || '')}&type=${f.type || 'output'}`;
export const refOf = f => f.type === 'input' ? `${f.subfolder ? f.subfolder + '/' : ''}${f.filename}` : `${f.subfolder ? f.subfolder + '/' : ''}${f.filename} [output]`;
export const absOf = f => f.abs || [state.outdir, f.subfolder, f.filename].filter(Boolean).join('\\');
/** Sube un archivo (imagen, audio o video) a ComfyUI/input. Devuelve {ref, url, filename, subfolder, type:'input'} (+ w,h si es imagen). */
export async function upload(file) {
  const fd = new FormData(); fd.append('image', file); fd.append('overwrite', 'true');
  const res = await fetch('/upload/image', { method: 'POST', body: fd });
  if (!res.ok) throw new Error(res.status === 413 ? 'el archivo pasa el límite de subida de ComfyUI (100 MB)' : 'error ' + res.status + ' al subir');
  const r = await res.json();
  const f = { filename: r.name, subfolder: r.subfolder || '', type: 'input' };
  f.ref = refOf(f); f.url = urlOf(f);
  if (file.type.startsWith('image/')) { f.kind = 'img'; Object.assign(f, await imageSize(f.url)); }
  if (file.type.startsWith('video/')) { f.kind = 'vid'; f.abs = inputAbs(f); Object.assign(f, await mediaInfo(f.abs)); }
  if (file.type.startsWith('audio/')) { f.kind = 'aud'; f.abs = inputAbs(f); }
  return f;
}
/** {hasAudio, fps, frames, secs, w, h} de un video en disco (vía /phane/api/info). hasAudio=false si no se pudo saber. */
export async function mediaInfo(abs) {
  try {
    const r = await getJSON('/phane/api/info?path=' + encodeURIComponent(abs));
    const o = { hasAudio: !!r.has_audio };
    for (const k of ['fps', 'frames', 'secs', 'w', 'h']) if (r[k] != null) o[k] = r[k];
    return o;
  } catch { return { hasAudio: false }; }
}
export function imageSize(url) {
  return new Promise(res => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({}); im.src = url; });
}
/** Ruta absoluta de un archivo de input/ (para nodos que leen rutas, como VHS_LoadVideoPath). */
export const inputAbs = f => state.outdir ? state.outdir.replace(/output$/i, 'input') + '\\' + [f.subfolder, f.filename].filter(Boolean).join('\\') : '';
/** Convierte un archivo de galería/salida a la forma {ref,url,w,h,abs,kind} que reciben los motores. */
export async function asInput(f) {
  const o = { ...f, ref: refOf(f), url: urlOf(f), abs: f.type === 'input' ? inputAbs(f) : absOf(f) };
  if (f.kind === 'img' && !f.w) Object.assign(o, await imageSize(o.url));
  if (f.kind === 'vid' && f.hasAudio === undefined) Object.assign(o, await mediaInfo(o.abs));
  return o;
}

/* ---------------- estimaciones que aprenden ---------------- */
// 28-oct: cada trabajo terminado guarda {r: real/estimado, px, s, q} en user/high_end/tiempos.json (/phane/api/tiempos),
// así lo aprendido sirve en cualquier navegador y sobrevive a borrar el caché. La estimación = est(o) del motor (que ya escala
// con tamaño y duración) × la mediana de los últimos r de ESE motor (de la misma calidad si hay 2+). Sin datos del servidor
// (ruta nueva: hasta reiniciar ComfyUI) se usa el factor viejo de localStorage.
const learned = store.get('times', {});
let tiempos = {};
fetch('/phane/api/tiempos').then(r => (r.ok ? r.json() : {})).then(j => { if (j && typeof j === 'object' && !Array.isArray(j) && !j.error) tiempos = j; }).catch(() => {});
const mainMedia = o => (o && (o.face || o.image || o.start || o.video || o.file || o.guide)) || null;
const pxDe = o => { const m = mainMedia(o); return m && m.w && m.h ? m.w * m.h : 0; };
const segsDe = o => +(o && (o.secs || (o.video && o.video.secs) || (o.file && o.file.secs))) || 0;
function factorAprendido(id, o) {
  let xs = (tiempos[id] || []).filter(x => x && x.r > 0);
  const q = o && o.quality;
  if (q && xs.filter(x => x.q === q).length >= 2) xs = xs.filter(x => x.q === q);
  xs = xs.slice(-10).map(x => x.r).sort((a, b) => a - b);
  if (xs.length) { const m = xs.length >> 1; return Math.min(5, Math.max(0.2, xs.length % 2 ? xs[m] : (xs[m - 1] + xs[m]) / 2)); }
  return learned[id] || 1;
}
/** Estimación sin lo aprendido (segundos del est() del motor ajustados a la tarjeta de esta PC). */
export const estimateBase = (engine, o) => Math.max(1, engine.est ? engine.est(o) : 60) / gpuInfo().speed;   // est = segundos en una 2070 Super
export function estimate(engine, o) { return estimateBase(engine, o) * factorAprendido(engine.id, o); }
function learn(engineId, base, real, o) {
  if (!base || real < 3) return;
  const f = real / base, prev = learned[engineId];
  learned[engineId] = prev ? prev * 0.6 + f * 0.4 : f;
  store.set('times', learned);
  const x = { r: +f.toFixed(3), real: Math.round(real), px: pxDe(o), s: +segsDe(o).toFixed(2), q: (o && o.quality) || '', gpu: gpuInfo().name, t: Math.round(Date.now() / 1000) };
  (tiempos[engineId] ||= []).push(x); tiempos[engineId] = tiempos[engineId].slice(-30);
  fetch('/phane/api/tiempos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: engineId, ...x }) }).catch(() => {});
}

/* ---------------- memoria entre motores (28-oct) ---------------- */
// "Familia" = el archivo más pesado del motor: dos motores con el mismo modelo grande aprovechan lo que ComfyUI ya tiene cargado.
// Al pasar a OTRA familia, si alguna de las dos es pesada, se pide /free con unload_models antes de encolar: que nunca quede un
// modelo pegado en VRAM/RAM que haga todo 20× más lento (medido: Qwen3-TTS sin descarga, Wan Q8 + caché previa = 63 de 64 GB).
function familia(engine) {
  const inst = {}; for (const [k, v] of Object.entries(state.installed || {})) inst[k.toLowerCase()] = v;
  let key = null, gb = 0, total = 0;
  for (const f of engine.files || []) { const s = +inst[String(f).toLowerCase()] || 0; total += s; if (s > gb) { gb = s; key = f; } }
  if (!key && (engine.files || []).length) { key = engine.files[0]; gb = 1; }   // aún sin la lista de modelos: el primero
  return { key, gb, heavy: total >= 6 || engine.tier !== 'ligero' || engine.ramGB >= 20 };
}
async function liberarSiCambia(engine) {
  const fam = familia(engine);
  if (!fam.key || fam.gb < 0.5) return;   // montaje, títulos…: sin modelo, no cambia lo que está cargado
  const prev = store.get('familia', null);
  const cambia = prev ? prev.key !== fam.key && (prev.heavy || fam.heavy) : fam.heavy;   // sin dato (página nueva): solo si es pesado
  store.set('familia', { key: fam.key, heavy: fam.heavy });
  if (!cambia) return;
  // si hay algo corriendo, ComfyUI lo aplica al terminar ese trabajo
  try { await fetch('/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }); } catch { /* */ }
}

/* ---------------- seguridad ("no romper la compu") ---------------- */
/** {ok, block, reasons[], warn} para correr un motor ahora. */
export function checkEngine(engine, o) {
  const reasons = [];
  const miss = missingFiles(engine, state.installed);
  if (miss.length) reasons.push(`Faltan ${miss.length} archivo(s) de modelo (se están descargando o hay que bajarlos): ${miss.map(m => m.split('/').pop()).join(', ')}`);
  if (state.comercial && engine.license === '🔴') reasons.push(`Licencia solo para uso personal (${engine.licenseNote || 'no comercial'}) y tienes activo "💼 Solo uso comercial".`);
  if (state.sys && !state.sys.gpu) reasons.push('Necesita una tarjeta NVIDIA y no encontré ninguna en esta PC.');
  if (engine.ramGB > RAM_CAP) reasons.push(`Necesita ~${engine.ramGB} GB de RAM: podría congelar la PC. Bloqueado por seguridad.`);
  const ramTotal = state.sys?.ram_total || 63;
  if (engine.ramGB > ramTotal - 6) reasons.push(`Pide ~${engine.ramGB} GB de RAM; tu PC tiene ${ramTotal.toFixed(0)} GB.`);
  const secs = estimate(engine, o);
  // RAM que ComfyUI puede usar AHORA: lo libre + lo que él mismo suelta con /free (los demás programas no se tocan).
  // Si el motor pide más, Windows manda el modelo al disco y cada paso tarda 10-20x (medido con LTX-2.3: 25 s → 11 min por paso).
  const sys = state.sys || {};
  const avail = sys.ram_libre != null ? sys.ram_libre + Math.max(0, (sys.proceso_ram || 0) - 2) : null;
  const tight = !reasons.length && avail != null && engine.ramGB > avail;
  const ramTip = tight ? `Ahora hay ~${Math.floor(avail)} GB de RAM disponibles y este motor usa ~${engine.ramGB} GB: cierra juegos, editores de video u otros programas pesados (o espera a que termine lo que está en la cola), o tardará muchísimo más (usará el disco).` : '';
  const warn = engine.tier !== 'ligero' || secs > 600 || tight
    ? `${TIER_INFO[engine.tier]?.icon || ''} ${engine.name}: en ${gpuInfo().tu} tardará aprox. ${fmt(secs)}.` : '';
  return { ok: !reasons.length, block: reasons.length > 0, reasons, warn, tight, ramTip, secs };
}

/* ---------------- cola, progreso y vista previa ---------------- */
export const jobs = [];
let running = null;
export const runningJob = () => running;

/* ---------------- sobrevivir a caídas (28-oct) ---------------- */
// Cada trabajo enviado se guarda (grafo + opciones) en localStorage hasta que termina. Al reconectar (o al abrir la página)
// se compara con /queue y /history: lo que ya no está en ningún lado se perdió con el reinicio de ComfyUI → evento 'perdidos'
// para ofrecer 🔁 Reintentar con lo mismo. 'ultimoTrabajo' guarda siempre el último enviado.
const PEND = 'pendientes';
const pendientes = () => { const p = store.get(PEND, []); return Array.isArray(p) ? p : []; };
const quitarPendiente = id => store.set(PEND, pendientes().filter(x => x.id !== id));
function guardarPendiente(job, g, o) {
  let oo = null; try { oo = o ? JSON.parse(JSON.stringify(o)) : null; } catch { /* opciones no serializables: queda el grafo */ }
  let n = g.n; try { if (JSON.stringify(n).length > 400000) n = null; } catch { n = null; }   // grafos enormes: solo las opciones
  const x = { id: job.id, label: job.label, engineId: job.engine ? job.engine.id : null, o: oo, n, lab: g.lab || {}, t: Date.now() };
  store.set(PEND, [...pendientes().filter(p => p.id !== job.id), x].slice(-6));
  store.set('ultimoTrabajo', x);
}
function adoptar(x, status) {   // trabajo de antes de recargar la página que ComfyUI sigue teniendo: vuelve a la cola visible
  const engine = x.engineId ? engineById(x.engineId) : null;
  const job = { id: x.id, label: x.label, engine, o: x.o, base: engine ? estimateBase(engine, x.o || {}) : 60, predicted: engine ? estimate(engine, x.o || {}) : 60,
    status, lab: x.lab || {}, total: Object.keys(x.n || x.lab || {}).length || 1, done: 0, step: 0, stage: 'En cola…', adoptado: true };   // adoptado: su tiempo no es confiable, no se aprende
  if (status === 'run') { job.t0 = Date.now(); running = job; }
  jobs.push(job);
  return job;
}
let revisando = false;
async function revisarPerdidos() {
  if (revisando) return; revisando = true;
  try {
    const p = pendientes().filter(x => Date.now() - (x.t || 0) < 12 * 3600e3);   // más de 12 h: ya no cuenta
    if (!p.length) return;
    let q; try { q = await getJSON('/queue'); } catch { return; }
    const corre = new Set((q.queue_running || []).map(x => x[1])), espera = new Set((q.queue_pending || []).map(x => x[1]));
    const perdidos = [];
    for (const x of p) {
      const job = jobs.find(j => j.id === x.id);
      if (corre.has(x.id) || espera.has(x.id)) { if (!job) adoptar(x, corre.has(x.id) ? 'run' : 'wait'); continue; }
      let h; try { h = (await getJSON('/history/' + x.id))[x.id]; } catch { continue; }   // no se pudo preguntar: otra vez será
      if (h) {   // terminó mientras no estábamos conectados
        if (!job) quitarPendiente(x.id);
        else if (h.status && h.status.status_str === 'error') fail(job, 'falló mientras la página no estaba conectada');
        else { job.adoptado = true; finish(job); }
        continue;
      }
      quitarPendiente(x.id);
      if (job && (job.status === 'done' || job.status === 'err')) continue;
      if (job) { job.status = 'err'; job.ended = Date.now(); job.error = 'ComfyUI se reinició'; if (running === job) running = null; }
      perdidos.push(x);
    }
    emit('queue', jobs);
    if (perdidos.length) emit('perdidos', perdidos);
  } finally { revisando = false; }
}
/** 🔁 Reintentar un trabajo perdido: mismo grafo (mismas opciones y semilla); si no se guardó, se vuelve a armar con el motor. */
export async function reintentar(x) {
  const engine = x.engineId ? engineById(x.engineId) : null;
  let g = x.n ? { n: x.n, lab: x.lab || {} } : null;
  if (!g && engine && x.o) { try { g = engine.build(x.o); } catch (e) { emit('error', `No pude rearmar "${x.label}": ${e.message}`); return null; } }
  if (!g) { emit('error', `"${x.label}" no guardó sus opciones: hay que lanzarlo otra vez desde su página.`); return null; }
  return run(g, x.label, { engine, o: x.o || null });
}
export const ultimoTrabajo = () => store.get('ultimoTrabajo', null);

let conectado = null;
function connect() {
  const s = new WebSocket(`ws://${location.host}/ws?clientId=${CID}`);
  s.binaryType = 'arraybuffer';
  s.onopen = () => { const antes = conectado; conectado = true; if (antes === false) emit('conexion', true); revisarPerdidos(); };
  s.onmessage = e => {
    if (typeof e.data !== 'string') return onPreview(e.data);
    const m = JSON.parse(e.data), d = m.data || {};
    const job = jobs.find(j => j.id === d.prompt_id);
    if (!job) return;
    if (m.type === 'execution_start') { job.status = 'run'; job.t0 = Date.now(); running = job; emit('queue', jobs); }
    if (m.type === 'executing' && d.node) {
      if (job.status !== 'run') { job.status = 'run'; job.t0 ||= Date.now(); running = job; }
      job.done++; job.step = 0; const l = job.lab[d.node]; if (l) job.stage = l; emit('progress', job);
    }
    if (m.type === 'progress') { job.step = d.max ? d.value / d.max : 0; emit('progress', job); }
    if (m.type === 'execution_success' || (m.type === 'executing' && d.node === null)) finish(job);
    if (m.type === 'execution_error') fail(job, `${d.node_type || ''}: ${d.exception_message || 'Error'}`);
    if (m.type === 'execution_interrupted') fail(job, 'Detenido.');
  };
  s.onclose = () => { if (conectado) { conectado = false; emit('conexion', false); } setTimeout(connect, 2000); };
}
connect();

function onPreview(buf) {
  if (!running) return;
  const dv = new DataView(buf), type = dv.getUint32(0);
  let off;
  if (type === 1) off = 8;
  else if (type === 4) {
    const ml = dv.getUint32(4);
    try { const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, ml))); if (meta.prompt_id && meta.prompt_id !== running.id) return; } catch { /* */ }
    off = 8 + ml;
  } else return;
  emit('preview', URL.createObjectURL(new Blob([buf.slice(off)])));
}

/**
 * Encola un workflow.
 * @param g       grafo de lib/graph.js
 * @param label   texto para la cola
 * @param opts    { engine, o, after(outputFile, allOutputs) }
 */
export async function run(g, label, { engine = null, o = null, after = null } = {}) {
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch { /* */ }
  // Seguridad de RAM/VRAM: al cambiar de familia pesada, que ComfyUI suelte los modelos en caché (ver liberarSiCambia).
  // Antes (hasta 28-oct) se liberaba antes de CADA motor pesado, aunque fuera el mismo modelo: se perdía el caché sin ganar nada.
  if (engine) await liberarSiCambia(engine);
  // referencias usadas (ropa, objeto, estilo; no la imagen principal): van al PNG de la salida para que 🗑️ Borrar pueda ofrecer borrarlas
  const refs = [...(Array.isArray(o?.refs) ? o.refs : []), o?.styleRef].map(r => r && r.ref).filter(Boolean);
  const body = { prompt: g.n, client_id: CID, ...(refs.length && { extra_data: { extra_pnginfo: { phane_refs: refs } } }) };
  const r = await fetch('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) {
    const msg = Object.entries(j.node_errors || {}).map(([id, ne]) => `${ne.class_type}: ${(ne.errors || []).map(x => x.details || x.message).join('; ')}`).join('\n') || JSON.stringify(j.error);
    emit('error', `No se pudo enviar "${label}":\n${msg}`);
    return null;
  }
  const job = { id: j.prompt_id, label, engine, o, base: engine ? estimateBase(engine, o || {}) : 60, predicted: engine ? estimate(engine, o || {}) : 60, after, status: 'wait', lab: g.lab,
    total: Object.keys(g.n).length, done: 0, step: 0, stage: 'En cola…' };
  jobs.push(job); guardarPendiente(job, g, o); emit('queue', jobs);
  return job;
}

async function finish(job) {
  if (job.status === 'done' || job.status === 'err') return;
  job.status = 'done'; job.ended = Date.now(); quitarPendiente(job.id);
  const secs = (job.ended - (job.t0 || job.ended)) / 1000;
  if (job.engine && !job.adoptado) learn(job.engine.id, job.base, secs, job.o);
  if (running === job) running = null;
  let outs = [];
  try { const h = (await getJSON('/history/' + job.id))[job.id]; outs = h ? outputsOf(h) : []; } catch { /* */ }
  // Con procesamiento por lotes (VHS meta_batch) ComfyUI no reporta las salidas en el historial:
  // en ese caso se toman los archivos creados durante el trabajo.
  if (!outs.length) {
    try {
      const since = (job.t0 || job.ended) / 1000 - 2;
      outs = (await getJSON('/phane/api/archivos')).filter(f => f.t >= since && /^phane/.test(f.subfolder || ''));
    } catch { /* */ }
  }
  for (const f of outs) f.prompt_id = job.id;   // "Abrir en ComfyUI" saca el grafo exacto de /history/<prompt_id>
  job.outputs = outs; job.secs = secs;
  emit('done', job);
  if (outs.length) emit('output', { file: outs[0], all: outs, job });
  if (job.after && outs.length) { try { await job.after(outs[0], outs); } catch (e) { emit('error', String(e)); } }
  notify(job.label);
  emit('queue', jobs);
  refreshGallery();
  qcSalidas(job, outs);
}
/* ---------------- QC de lo que sale (28-oct) ---------------- */
// Video: cuadros negros (NaN en fp16). Audio (música, sonido, voz, avatar): NaN o silencio con volumedetect (la trampa de
// ACE-Step en fp16). Cada aviso va al visor (evento 'qc', se guarda por archivo en qcAvisos) y como aviso flotante.
export const qcAvisos = new Map();   // 'subcarpeta/archivo' -> texto del aviso
export const qcKey = f => `${f.subfolder || ''}/${f.filename}`;
const AUDIO_TOOLS = new Set(['music', 'sound', 'voice', 'avatar']);
function avisoQC(job, f, msg) {
  qcAvisos.set(qcKey(f), msg);
  emit('qc', { file: f, msg, job });
  emit('error', `⚠️ "${job.label}": ${msg}`);
}
function qcSalidas(job, outs) {
  // 27-oct: el título del montaje entra desde negro a propósito: ahí no se revisan negros
  const v = outs.find(f => f.kind === 'vid');
  if (v && !/montaje/i.test(v.subfolder || '')) checkBlack(v).then(r => {
    if (r && r.negros > 0) avisoQC(job, v, `${r.negros} de ${r.cuadros} cuadros salieron negros (desde el cuadro ${r.primer_negro}). Prueba de nuevo con otra semilla o en modo Ligero.`);
  });
  const tool = job.engine && job.engine.tool;
  for (const f of outs) {
    if (!(f.kind === 'aud' || (f.kind === 'vid' && AUDIO_TOOLS.has(tool)))) continue;
    checkAudio(f).then(r => {
      if (!r || r.error) return;
      if (r.nan) avisoQC(job, f, 'el audio salió dañado (NaN): se oye mudo o con ruido. Vuelve a generarlo (en ACE-Step, con la opción fp32).');
      else if (r.silencio) avisoQC(job, f, `el audio salió en silencio (pico ${r.max != null ? r.max.toFixed(0) + ' dB' : '-∞'}). Revisa el prompt o vuelve a generarlo.`);
      else if (r.sin_audio && (f.kind === 'aud' || outs.filter(x => x.kind === 'vid').length === 1)) avisoQC(job, f, 'salió sin pista de audio.');
    });
  }
}
function fail(job, msg) {
  job.status = 'err'; job.ended = Date.now(); job.error = msg; quitarPendiente(job.id);
  if (running === job) running = null;
  emit('error', `"${job.label}": ${msg}`); emit('queue', jobs);
}
export async function cancel(job) {
  quitarPendiente(job.id);   // detenido a propósito: no es un trabajo perdido
  if (job.status === 'run') await fetch('/interrupt', { method: 'POST' });
  else { await fetch('/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete: [job.id] }) }); job.status = 'err'; job.ended = Date.now(); emit('queue', jobs); }
}
export async function checkBlack(f) {
  try { return await getJSON('/phane/api/negros?path=' + encodeURIComponent(absOf(f))); } catch { return null; }
}
/** {mean, max, nan, silencio, sin_audio} del audio de un archivo de output (vía /phane/api/audio_qc), o null. */
export async function checkAudio(f) {
  try { return await getJSON('/phane/api/audio_qc?path=' + encodeURIComponent(absOf(f))); } catch { return null; }
}

export function outputsOf(h) {
  const r = [];
  for (const o of Object.values(h.outputs || {})) {
    for (const f of (o.images || [])) if (f.type === 'output') r.push({ kind: 'img', ...f });
    for (const f of (o.gifs || [])) r.push({ kind: 'vid', ...f });
    for (const f of (o.videos || [])) r.push({ kind: 'vid', ...f });
    for (const f of (o.audio || [])) if (f.type === 'output') r.push({ kind: 'aud', ...f });
  }
  return r;
}

function notify(label) {
  try {
    const a = new AudioContext(), osc = a.createOscillator(), gn = a.createGain();
    osc.frequency.value = 880; gn.gain.setValueAtTime(0.08, a.currentTime); gn.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.5);
    osc.connect(gn).connect(a.destination); osc.start(); osc.stop(a.currentTime + 0.5);
  } catch { /* */ }
  try { if (document.hidden && Notification.permission === 'granted') new Notification('Phane', { body: '✓ Listo: ' + label }); } catch { /* */ }
}

/* ---------------- arranque ---------------- */
refreshModels(); refreshSys(); refreshGallery(); refreshLoras();
setInterval(refreshSys, 4000);
setInterval(refreshModels, 60000);
setInterval(refreshLoras, 60000);
