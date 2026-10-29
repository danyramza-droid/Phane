// MODO SIMPLE de Phane (/phane/simple, plan intensivo frente 7). Una pantalla, tres verbos (Imagen · Video · Movimiento),
// un prompt grande, un botón Generate con el tiempo en TU tarjeta y el resultado grande con 3 acciones.
// Maqueta aprobada (26-oct); se programó tal cual.
// No toca el modo completo: reusa kit.generar(), core (pcLevel, gpuInfo, estimados), engines, personajes, i18n y las
// acciones de pages/mejorar.js (🎬 Pasar a final, 💎 HD Pro). El motor lo elige Phane: el ROLE "⚡ Rápido" de cada herramienta.
// Textos: se escriben en español y T() los pasa a inglés con data/i18n_simple_en.js (la raíz lleva data-noi18n para que
// la capa de i18n.js no los toque dos veces; lo que viene de core/kit en español se traduce con tr()).
import { LANG, setLang, tr } from '../i18n.js';   // primero: instala la traducción antes de pintar nada
import * as core from '../core.js';
import * as kit from '../kit.js';
import * as engines from '../engines.js';
import * as personajes from '../personajes.js';
import { EN_SIMPLE } from '../data/i18n_simple_en.js';
import { motionName } from '../graphs/motion.js';
import { maniquiView, sheetOf } from '../graphs/pose.js';
import { REF_FALLBACK } from '../graphs/image.js';
import mejorar, { describeFile } from './mejorar.js';

const { h } = kit;
const T = (s, ...a) => {
  const r = LANG === 'en' ? (EN_SIMPLE[s] ?? tr(s)) : s;
  return a.length ? r.replace(/\{(\d+)\}/g, (_, i) => a[+i] ?? '') : r;
};
const API = '/phane/api';   // build.py lo pasa a /phane/api en la copia pública

/* ---------------- datos ---------------- */
const VERBS = [['image', '🖼️', 'Imagen'], ['video', '🎬', 'Video'], ['move', '🕺', 'Movimiento']];
const PH = {
  image: 'Describe tu imagen… ej. “con un impermeable amarillo bajo la lluvia”',
  video: 'Describe lo que pasa… ej. “salta y gira en patines”',
  move: 'Describe el movimiento… ej. “salta y da una vuelta en el aire”',
};
const ARS = ['9:16', '16:9', '1:1'];
const SECS = { video: [5, 3], move: [3, 5, 8] };
const ANG = [['frente', 'Frente'], ['tres_cuartos_izq', '¾'], ['lado_izq', 'Perfil'], ['espalda', 'Espalda']];
const EXAMPLES = [
  { verb: 'video', prompt: 'jumps and spins on roller skates', title: 'Saltar y girar', sub: 'Video · 5 s', tag: 'jump + spin', cls: 'sp-t1', secs: 5, media: '/phane/static/img/simple/ex1.mp4' },
  { verb: 'move', prompt: 'A person jumps and spins in the air, then lands.', title: 'El mismo movimiento, 4 ángulos', sub: 'Movimiento · para juegos', tag: '4 angles', cls: 'sp-t2', secs: 3, media: '/phane/static/img/simple/ex2.jpg' },
  { verb: 'image', prompt: 'wearing a brown cowboy hat, riding a horse across the desert at sunset, medium shot, face clearly visible', title: 'Cambiarle el outfit', sub: 'Imagen · editar', tag: 'new outfit', cls: 'sp-t3', media: '/phane/static/img/simple/ex3.jpg' },   // 29-oct: ejemplos con tomas reales de Phany
];
// Licencia del motor que eligió Phane (hasta que el frente 2 ponga engine.license en cada motor)
const LIC_OK = new Set(['video.wan', 'video.wan_he', 'image.zimage', 'image.klein', 'edit.klein', 'image.pose_anypose', 'image.pose_klein',
  'upscale.seedvr2_3b', 'upscale.seedvr2_7b', 'upscale.esrgan', 'fps.rife']);
// Motores que sí se pueden abrir en Comfy Cloud: solo nodos del core y modelos oficiales (intensivo_convergente.md §6.1)
const CLOUD_OK = new Set(['image.zimage', 'image.klein']);
const LIC_NC = new Set(['image.qwen21', 'edit.qwen21', 'edit.qwen21_full', 'image.pose_maniqui', 'image.pose']);
const MANIQUI_COMERCIAL = 'image.pose_anypose', MANIQUI_ENGINE = 'image.pose_maniqui';
const PLAIN = 'plain flat light grey studio background, no scenery';
const RECIBE = /\b(is|gets|being)\s+(violently\s+)?(hit|struck|punched|kicked|knocked|shot)\b|\bflies\s+back|\bknocked\s+(back|down)|\bfalls?\s+back/i;

/* ---------------- utilidades ---------------- */
const usable = e => !!e && !engines.missingFiles(e, core.state.installed).length && e.ramGB <= engines.RAM_CAP;
/** Motor que elige Phane: el "⚡ Rápido" de la herramienta; si no está listo, el que toca según el switch de poder. */
function fastEngine(tool, filter) {
  const list = engines.enginesFor(tool).filter(e => !e.caps?.internal && (!filter || filter(e)));
  return list.find(e => /Rápido/.test(engines.ROLE[e.id] || '') && usable(e))
    || engines.pickDefault(tool, core.state.tier, core.state.installed, filter) || list[0] || null;
}
/** Imagen con el personaje (necesita referencias): FLUX.2 Klein (Apache) y, si no está, el que toque. */
function refImageEngine() {
  const k = engines.engineById(REF_FALLBACK.ligero);
  return usable(k) ? k : fastEngine('image', e => e.caps?.refs > 0);
}
const poseEngine = () => [MANIQUI_COMERCIAL, MANIQUI_ENGINE].map(engines.engineById).find(usable) || engines.engineById(MANIQUI_COMERCIAL);
const qualityOf = e => { const q = (e?.caps?.qualities || []).map(x => x[0]); return q.includes('final') ? 'final' : (e?.caps?.qDefault || q[0] || 'final'); };
const roleOf = e => T((engines.ROLE[e.id] || '').replace(/^\S+\s+/, '') || 'Automático');
const shortName = e => String(e.name || e.id).replace(/\s*[(·].*$/, '').trim();
const pjName = p => String(p?.name || '').replace(/\s*\(.*\)\s*$/, '');
const pick = f => f && (({ ref, url, w, h: hh, filename, subfolder, type }) => ({ ref, url, w, h: hh, filename, subfolder, type }))(f);
const refWH = f => f && { ref: f.ref, w: f.w, h: f.h };
const human = s => (s < 90 ? T('~{0} s', Math.max(5, Math.round(s / 5) * 5)) : s < 3600 ? T('~{0} min', Math.round(s / 60))
  : T('~{0} h {1} min', Math.floor(s / 3600), Math.round(s % 3600 / 60)));
const cap1 = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
/** "salta y gira" → "The character jumps…" (con personaje); si ya empieza con mayúscula se deja igual. */
const withChar = (text, pj) => (pj && /^[a-z]/.test(text) ? `The character ${text}` : text);
/** Kimodo entiende "A person …" */
const personify = t => { t = String(t || '').trim(); if (!/^(an?|the)\s+(person|man|woman|character)\b/i.test(t)) t = 'A person ' + t.charAt(0).toLowerCase() + t.slice(1); return /[.!?]$/.test(t) ? t : t + '.'; };
const actionText = a => a.replace(/^\s*an?\s+(person|man|woman|character)\s+/i, '').replace(/\.\s*$/, '');
const post = (url, b) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(x => x.json()).catch(e => ({ error: e.message }));

/* ---------------- acciones reusadas del modo completo ---------------- */
const actions = [];
let task = null;               // trabajo (cadena de pasos) que se sigue en pantalla
const ctx = {
  core, engines, pages: [],
  kit: { ...kit, generar: (e, o, l, opts) => gen(e, o, l, opts) },   // las acciones de mejorar.js cuentan como pasos del trabajo
  goto: () => { location.href = '/phane'; },
  show: f => showResult({ file: f, all: [f] }),
  addAction: d => { if (!actions.some(a => a.id === d.id)) actions.push(d); },
  isActive: () => true,
};
try { mejorar.setup(ctx); } catch (e) { console.error('mejorar.setup', e); }
const action = id => actions.find(a => a.id === id);

/* ---------------- seguimiento de trabajos ---------------- */
function newTask(meta) {
  task = { steps: [], expect: 1, stepOf: d => Math.min(task.steps.length - 1, d), est: 60, ...meta,
    jobs: [], inflight: 0, done: 0, errors: 0, t0: Date.now(), last: null, finished: false };
  return task;
}
function dec(t, err) { t.inflight--; if (err) t.errors++; else t.done++; checkTask(t); }
/** kit.generar() que cuenta el paso en el trabajo actual (también lo que encadenan las acciones de mejorar.js). */
let chainT = null;   // trabajo dueño del after que está corriendo (mejorar.js encadena "Más fluidez" ahí)
async function gen(e, o, label, opts = {}, t = chainT || task) {
  if (!t) return kit.generar(e, o, label, opts);
  t.inflight++;
  const orig = opts.after;
  let j = null;
  j = await kit.generar(e, o, label, { ...opts, after: async (f, outs) => {
    try { t.last = { file: f, all: outs, engine: e, o }; chainT = t; if (orig) await orig(f, outs); }
    catch (err) { console.error(err); }
    finally { chainT = null; if (j) j._counted = true; dec(t); }
  } });
  if (!j) { t.inflight--; t.errors++; checkTask(t); return null; }
  j._t = t; t.jobs.push(j);
  return j;
}
core.on('done', job => { const t = job._t; if (t && !job._counted && !(job.outputs || []).length) { job._counted = true; dec(t, true); } });
core.on('queue', jobs => jobs.forEach(j => { if (j._t && j.status === 'err' && !j._counted) { j._counted = true; dec(j._t, true); } }));
function checkTask(t) {
  if (t.inflight > 0 || t.finished) return;
  t.finished = true;
  const r = t.result ? t.result() : t.last && { file: t.last.file, all: t.last.all, engine: t.last.engine };
  if (r && r.file) {
    const full = { verb: t.verb, title: t.title, ...r };
    if (t === task && view === 'b') showResult(full);
    else kit.toast(T('✅ Listo: {0}. Está en “Tu trabajo”.', t.title), 'info', 9000);
  } else if (t === task && view === 'b') showFailed(t);
  core.refreshGallery();
}

/* ---------------- estado de la pantalla ---------------- */
const st = {
  verb: core.store.get('simple.verb', 'video'),
  ar: core.store.get('simple.ar', '9:16'),
  secs: { video: core.store.get('simple.secs.video', 5), move: core.store.get('simple.secs.move', 3) },
  pjId: core.store.get('simple.pj', null),
};
let pjs = [];
let view = 'a';
const curPj = () => pjs.find(p => p.id === st.pjId) || null;

/* ---------------- planes: qué pasos corre cada verbo ---------------- */
function plan() {
  const text = prompt.value.trim(), pj = curPj(), ar = st.ar;
  if (st.verb === 'image') {
    const e = pj ? refImageEngine() : fastEngine('image');
    const o = imageOpts(e, withChar(text, pj), pj, ar);
    return { steps: [T('Imagen')], expect: 1, engines: [[e, o]], run: () => gen(e, o, `🖼️ ${text.slice(0, 42)}`) };
  }
  if (st.verb === 'video') {
    const ve = fastEngine('video'), secs = st.secs.video;
    const vo = start => ({ mode: start ? 'i2v' : 't2v', prompts: [`${withChar(text, pj)} Cinematic, smooth natural motion, highly detailed.`], secs, quality: qualityOf(ve),
      ar, start: start || null, end: null, loras: [], boost: false, ...(ve?.caps?.nag && { nag: true }) });
    if (!pj) return { steps: [T('Video')], expect: 1, engines: [[ve, vo(null)]], run: () => gen(ve, vo(null), `🎬 ${text.slice(0, 40)} · ${secs}s`) };
    const ie = refImageEngine();
    const io = imageOpts(ie, `${withChar(text, pj)}, full body, dynamic pose, cinematic lighting`, pj, ar);
    return { steps: [T('{0} en la pose', pjName(pj)), T('Video')], expect: 2, engines: [[ie, io], [ve, vo({ ref: 'x', w: 768, h: 1344 })]],
      run: () => { const t = task; return gen(ie, io, `🖼️ ${pjName(pj)} · ${text.slice(0, 32)}`, { after: async f => {
        const start = await core.asInput(f);
        await gen(ve, vo(start), `🎬 ${pjName(pj)} · ${text.slice(0, 32)} · ${secs}s`, { confirmed: true }, t);
      } }, t); } };
  }
  // 🕺 Movimiento: Kimodo → maniquí 3D en 4 ángulos → (con personaje) el personaje en cada pose
  const eMov = engines.engineById('motion.kimodo'), eCuadro = engines.engineById('motion.kimodo_frame'), pe = poseEngine();
  const act = personify(text), mo = { prompt: act, secs: st.secs.move, vista: 'frente', cleanFeet: true };
  const steps = [T('Movimiento'), T('Maniquí')].concat(pj ? [T('{0} en la pose', pjName(pj))] : []);
  const list = [[eMov, mo], ...ANG.map(() => [eCuadro, { maniqui: true }]), ...(pj ? ANG.map(() => [pe, { turbo: true }]) : [])];
  return { steps, expect: list.length, engines: list, stepOf: d => (d < 1 ? 0 : d < 5 || !pj ? 1 : 2), run: () => runMove(act, mo, pj, eMov, eCuadro, pe) };
}
function imageOpts(e, text, pj, ar) {
  const hero = pj && e?.caps?.heroLora ? personajes.heroLora(pj) : null;
  const sheet = pj ? sheetOf(pj) : null;
  return { prompt: text, ar, count: 1, refs: !hero && sheet && e?.caps?.refs ? [refWH(sheet)] : [], ...(hero && { heroLora: hero }) };
}
async function runMove(act, mo, pj, eMov, eCuadro, pe) {
  const t = task, res = { name: null, video: null, man: {}, img: {} };
  t.result = () => {
    const src = pj ? res.img : res.man;
    const all = ANG.map(([a, l]) => src[a] && { ...src[a], _ang: l }).filter(Boolean);
    return all.length ? { file: all[0], all, video: res.video, motion: res.name, engine: pj ? pe : eMov } : (res.video ? { file: res.video, all: [res.video], motion: res.name, engine: eMov } : null);
  };
  // un prompt nuevo carga Llama-3-8B en la CPU (~16 GB): que ComfyUI suelte su caché antes (igual que 🕺 Movimiento)
  try { await fetch('/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }); } catch { /* */ }
  const sheet = pj ? sheetOf(pj) : null;
  return gen(eMov, mo, `🕺 ${actionText(act).slice(0, 40)} · ${mo.secs} s`, { after: async (file, outs) => {
    res.name = motionName((outs || []).find(f => motionName(f)) || file);
    res.video = (outs || []).find(f => /_maniqui\.mp4$/i.test(f.filename || '')) || null;
    if (!res.name) return;
    for (const [a] of ANG) {
      await gen(eCuadro, { name: res.name, frame: RECIBE.test(act) ? -2 : -3, vista: a, maniqui: true }, `🧍 ${res.name} · ${a}`, { confirmed: true, after: async (f2, outs2) => {
        const m = (outs2 || []).find(f => /_maniqui_f\d+/i.test(f.filename || '')) || f2;
        res.man[a] = m;
        if (!pj || !sheet || !pe) return;
        const view = maniquiView(m);
        const io = { prompt: `The character ${actionText(act)}, ${PLAIN}.`, count: 1, refs: [refWH(sheet)],
          pose: { ref: m.ref || `${m.subfolder}/${m.filename} [output]`, w: m.w || 768, h: m.h || 1024 } };
        const cd = [pj.desc, pj.arma].filter(Boolean).join('; ');
        if (cd) io.charDesc = cd;
        if (pe.id === MANIQUI_ENGINE) io.turbo = true;
        if (view) { io.view = view; const vr = pe.id === MANIQUI_ENGINE && pj.vistas?.[view]; if (vr) io.viewRef = refWH(vr); }
        await gen(pe, io, `🕺 ${pjName(pj)} · ${actionText(act).slice(0, 24)} · ${a}`, { confirmed: true, after: f3 => { res.img[a] = f3; } }, t);
      } }, t);
    }
  } }, t);
}
/** Tiempo total y bloqueo (archivos que faltan, RAM) de un plan. */
function planCheck(p) {
  let secs = 0, block = null;
  for (const [e, o] of p.engines) {
    if (!e) { block = block || T('No hay motor disponible para esto todavía.'); continue; }
    const c = core.checkEngine(e, o);
    if (c.block && !block) block = tr(c.reasons[0]);
    secs += c.secs || 0;
  }
  return { secs, block };
}

/* ---------------- interfaz ---------------- */
const root = h('div', { class: 'sp-app', 'data-noi18n': '' });
document.body.append(root);

// barra
const gpuChip = h('span', { class: 'sp-chip', title: T('Tu tarjeta y el modo de poder. Para cambiarlo, pasa a Completo.') });
const drawGpu = () => { const g = core.gpuInfo(); gpuChip.textContent = `${g.name || 'PC'} · ${T(core.state.tier === 'highend' ? 'High End' : 'Ligero')}`; };
const bar = h('div', { class: 'sp-bar' },
  h('span', { class: 'sp-logo' }, h('i'), 'Phane'), gpuChip, h('span', { class: 'sp-sp' }),
  h('span', { class: 'sp-seg', role: 'group', 'aria-label': T('Modo') },
    h('button', { class: 'on', type: 'button', 'aria-pressed': 'true' }, T('Simple')),
    h('a', { href: '/phane', title: T('Todas las herramientas, motores y ajustes') }, T('Completo'))),
  h('span', { class: 'sp-seg', role: 'group', 'aria-label': T('Idioma') },
    h('button', { type: 'button', class: LANG === 'en' ? 'on' : '', onclick: () => LANG !== 'en' && setLang('en') }, 'EN'),
    h('button', { type: 'button', class: LANG === 'es' ? 'on' : '', onclick: () => LANG !== 'es' && setLang('es') }, 'ES')));

/* ---- vista A: inicio ---- */
const verbsEl = h('div', { class: 'sp-verbs', role: 'tablist' });
const prompt = h('textarea', { class: 'sp-txt', rows: 2, 'aria-label': T('Prompt') });
prompt.value = core.store.get('simple.prompt', '');
let estTimer = null;
prompt.oninput = () => { core.store.set('simple.prompt', prompt.value); clearTimeout(estTimer); estTimer = setTimeout(updEstimate, 250); };
prompt.onkeydown = e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate(); };
const whoWrap = h('span', { class: 'sp-pop' });
const newPjChip = h('button', { class: 'sp-chip', type: 'button', onclick: () => newCharacter() }, T('＋ Personaje nuevo'));
const arChip = h('button', { class: 'sp-chip', type: 'button', title: T('Formato'), onclick: () => { st.ar = ARS[(ARS.indexOf(st.ar) + 1) % ARS.length]; core.store.set('simple.ar', st.ar); drawChips(); } });
const secsChip = h('button', { class: 'sp-chip', type: 'button', title: T('Duración'), onclick: () => {
  const l = SECS[st.verb]; st.secs[st.verb] = l[(l.indexOf(st.secs[st.verb]) + 1) % l.length]; core.store.set('simple.secs.' + st.verb, st.secs[st.verb]); drawChips(); } });
const goBtn = h('button', { type: 'button', onclick: () => generate() }, T('Generar'));
const goHint = h('small');
const composer = h('div', { class: 'sp-composer' }, prompt,
  h('div', { class: 'sp-crow' }, whoWrap, newPjChip, arChip, secsChip, h('div', { class: 'sp-go' }, goBtn, goHint)));
const exEl = h('div', { class: 'sp-examples' });
const strip = h('div', { class: 'sp-strip' });
let seeAll = false;
const seeAllBtn = h('button', { type: 'button', onclick: () => { seeAll = !seeAll; drawGallery(); } }, T('Ver todo'));
const viewA = h('div', { class: 'sp-stage' }, verbsEl, composer,
  h('div', { class: 'sp-gallery-h' }, h('span', {}, T('Prueba uno')), h('span', {}, T('Ejemplos'))), exEl,
  h('div', { class: 'sp-gallery-h' }, h('span', {}, T('Tu trabajo')), seeAllBtn), strip);

/* ---- vista B: generando ---- */
const ringTxt = h('span', {}, '0%');
const ring = h('div', { class: 'sp-ring' }, ringTxt);
const bTitle = h('h3');
const bSteps = h('div', { class: 'sp-steps' });
const bNote = h('p', { class: 'sp-note' });
const bCloud = h('div', { class: 'sp-cloud' }, T('¿Tarda mucho? '), h('button', { type: 'button', onclick: () => cloudFromTask() }, T('Descarga el grafo para Comfy Cloud')), T(' con el mismo prompt y ajustes.'));
const bBack = h('button', { class: 'sp-link', type: 'button', onclick: () => go('a') }, T('← Seguir trabajando'));
const viewB = h('div', { class: 'sp-stage', hidden: true }, h('div', { class: 'sp-progress' }, ring, bTitle, bSteps, bNote, bCloud, bBack));

/* ---- vista C: resultado ---- */
const viewC = h('div', { class: 'sp-stage', hidden: true });
root.append(bar, viewA, viewB, viewC);

function go(v) {
  view = v;
  viewA.hidden = v !== 'a'; viewB.hidden = v !== 'b'; viewC.hidden = v !== 'c';
  viewC.querySelectorAll('video').forEach(x => { if (v !== 'c') x.pause(); });
  if (v === 'a') updEstimate();
  window.scrollTo({ top: 0 });
}

function drawVerbs() {
  verbsEl.innerHTML = '';
  for (const [id, ico, lbl] of VERBS) {
    verbsEl.append(h('button', { class: 'sp-verb' + (st.verb === id ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': String(st.verb === id),
      onclick: () => { st.verb = id; core.store.set('simple.verb', id); drawVerbs(); drawChips(); } }, `${ico} ${T(lbl)}`));
  }
  prompt.placeholder = T(PH[st.verb]);
}
function drawChips() {
  arChip.textContent = st.ar;
  arChip.classList.toggle('hide', st.verb === 'move');
  secsChip.classList.toggle('hide', st.verb === 'image');
  if (SECS[st.verb]) { if (!SECS[st.verb].includes(st.secs[st.verb])) st.secs[st.verb] = SECS[st.verb][0]; secsChip.textContent = `${st.secs[st.verb]} s`; }
  updEstimate();
}
function avatar(p) {
  const ph = p?.photos?.[0];
  return h('span', { class: 'sp-av' }, ph ? h('img', { src: ph.url || core.urlOf(ph), alt: '' }) : null);
}
function drawWho() {
  const p = curPj();
  whoWrap.innerHTML = '';
  const menu = h('div', { class: 'sp-popmenu hide', role: 'menu' });
  const btn = h('button', { class: 'sp-who' + (p ? '' : ' none'), type: 'button', 'aria-haspopup': 'menu', title: T('Personaje'),
    onclick: e => { e.stopPropagation(); menu.classList.toggle('hide'); } }, p ? avatar(p) : null, p ? pjName(p) : T('Sin personaje'), ' ▾');
  for (const x of pjs) {
    menu.append(h('button', { type: 'button', role: 'menuitem', class: x.id === st.pjId ? 'on' : '', onclick: () => setPj(x.id) }, avatar(x), pjName(x)));
  }
  menu.append(h('button', { type: 'button', role: 'menuitem', class: !p ? 'on' : '', onclick: () => setPj(null) }, T('Sin personaje')),
    h('button', { type: 'button', role: 'menuitem', onclick: () => newCharacter() }, T('＋ Personaje nuevo')));
  whoWrap.append(btn, menu);
}
document.addEventListener('click', e => { if (!whoWrap.contains(e.target)) whoWrap.querySelector('.sp-popmenu')?.classList.add('hide'); });
function setPj(id) { st.pjId = id; core.store.set('simple.pj', id); drawWho(); updEstimate(); }
async function loadPjs() {
  pjs = (await personajes.list()).filter(p => (p.photos || []).length);
  if (st.pjId === null && core.store.get('simple.pj', undefined) === undefined) st.pjId = (pjs.find(p => /^(phany|lumi)$/i.test(pjName(p))) || {}).id || null;   // Phany por defecto
  if (st.pjId && !pjs.some(p => p.id === st.pjId)) st.pjId = null;
  drawWho(); drawExamples(); updEstimate();
}
core.on('personajes', loadPjs);

function updEstimate() {
  if (view !== 'a') return;
  let p, c;
  try { p = plan(); c = planCheck(p); } catch (e) { console.error(e); goHint.textContent = ''; return; }
  const g = core.gpuInfo();
  goHint.textContent = c.block ? '🔒 ' + c.block : T('{0} en tu {1}', human(c.secs), g.name || 'PC');
  goHint.title = c.block || '';
}

/* ejemplos: toma real si el ejemplo trae media ('/phane/static/img/simple/ex1.mp4', pendiente: tomas de Phany con GPU);
   si no, la foto de Phany; si no, el color de la maqueta */
const exMedia = Object.fromEntries(EXAMPLES.map((x, i) => [i, x.media || null]));
function drawExamples() {
  exEl.innerHTML = '';
  const phany = pjs.find(p => /^(phany|lumi)$/i.test(pjName(p)));
  EXAMPLES.forEach((x, i) => {
    const u = exMedia[i], ph = phany?.photos?.[i % phany.photos.length];
    const media = u ? (/\.mp4$/.test(u) ? h('video', { src: u, muted: true, loop: true, autoplay: true, playsinline: true }) : h('img', { src: u, alt: '' }))
      : ph ? h('img', { src: ph.url || core.urlOf(ph), alt: '' }) : null;
    exEl.append(h('button', { class: 'sp-ex', type: 'button', onclick: () => useExample(x) },
      h('div', { class: 'sp-thumb ' + x.cls }, media, h('span', {}, x.tag)),
      h('p', {}, h('b', {}, T(x.title)), h('br'), T(x.sub))));
  });
}
function useExample(x) {
  st.verb = x.verb; core.store.set('simple.verb', x.verb);
  if (x.secs) { st.secs[x.verb] = x.secs; core.store.set('simple.secs.' + x.verb, x.secs); }
  const phany = pjs.find(p => /^(phany|lumi)$/i.test(pjName(p)));
  if (phany) setPj(phany.id);
  prompt.value = x.prompt; prompt.oninput();
  drawVerbs(); drawChips(); prompt.focus();
}

/* galería */
function tile(f) {
  const u = core.urlOf(f);
  const media = f.kind === 'vid' ? h('video', { src: u + '#t=0.5', muted: true, preload: 'metadata' }) : h('img', { src: u, loading: 'lazy', alt: '' });
  const t = h('button', { class: 'sp-tile', type: 'button', title: f.filename, onclick: () => showResult({ file: f, all: [f], title: f.filename }) }, media, h('i', {}, f.kind === 'vid' ? '🎬' : '🖼️'));
  if (f.kind === 'vid') { t.onmouseenter = () => media.play().catch(() => {}); t.onmouseleave = () => media.pause(); }
  return t;
}
function drawGallery() {
  const items = (core.state.gallery || []).filter(f => f.kind === 'img' || f.kind === 'vid');
  strip.innerHTML = '';
  strip.classList.toggle('all', seeAll);
  const n = seeAll ? 40 : 5;
  items.slice(0, n).forEach(f => strip.append(tile(f)));
  if (!seeAll) for (let i = items.length; i < 5; i++) strip.append(h('span', { class: 'sp-tile empty' }));
  seeAllBtn.textContent = seeAll ? T('Ver menos') : T('Ver todo');
  seeAllBtn.classList.toggle('hide', items.length <= 5 && !seeAll);
}
core.on('gallery', drawGallery);

/* ---------------- generar ---------------- */
async function generate() {
  const text = prompt.value.trim();
  if (!text) { kit.toast(T('Escribe primero qué quieres crear 🙂'), 'err'); prompt.focus(); return; }
  let p;
  try { p = plan(); } catch (e) { console.error(e); kit.toast(T('No pude armar el trabajo: {0}', e.message), 'err'); return; }
  const c = planCheck(p);
  const pj = curPj();
  newTask({ verb: st.verb, title: cap1(text), who: pj ? pjName(pj) : '', steps: p.steps, expect: p.expect, est: c.secs,
    ...(p.stepOf && { stepOf: p.stepOf }), graph: p.engines[0] });
  goBtn.disabled = true;
  try {
    const t = task, j = await p.run();
    if (!j && t.inflight <= 0 && !t.jobs.length) { task = null; return; }   // bloqueado o cancelado en el aviso: se queda en Inicio
    go('b'); drawProgress();
  } finally { goBtn.disabled = false; }
}
function drawProgress() {
  const t = task; if (!t || view !== 'b') return;
  const run = core.runningJob();
  let part = 0;
  const mine = run && run._t === t && run.t0;
  if (mine) { const el = (Date.now() - run.t0) / 1000, eta = run.predicted || 60; part = Math.min(0.99, Math.max((run.done + (run.step || 0)) / (run.total || 1), el / eta * 0.95)); }
  const total = Math.max(t.expect, t.done + t.inflight);
  const pct = t.finished ? 100 : Math.min(99, Math.round((t.done + t.errors + part) / total * 100));
  ring.style.setProperty('--p', pct + '%');
  if (!ringTxt.querySelector('img')) ringTxt.textContent = pct + '%';
  bTitle.textContent = (t.who ? t.who + ' · ' : '') + t.title;
  const idx = t.stepOf(t.done);
  bSteps.innerHTML = '';
  t.steps.forEach((s, i) => bSteps.append(h('span', { class: i < idx ? 'd' : i === idx ? (t.errors && !t.inflight ? 'bad' : 'now') : '' }, s)));
  const left = Math.max(0, t.est * (1 - pct / 100));
  const waiting = !mine && run && !t.finished;
  bNote.textContent = waiting ? T('En la fila: empieza cuando termine lo que ya estaba corriendo.')
    : cap1(T('Faltan {0}. Puedes seguir trabajando: quedará en “Tu trabajo” cuando termine.', human(left).replace(/^~/, T('unos '))));
  bCloud.classList.toggle('hide', t.est < 20 * 60 || !CLOUD_OK.has(t.graph?.[0]?.id));
}
setInterval(drawProgress, 1000);
core.on('progress', drawProgress);
core.on('preview', url => {   // vista previa en vivo dentro del anillo
  const run = core.runningJob();
  if (!task || !run || run._t !== task) { URL.revokeObjectURL(url); return; }
  let im = ringTxt.querySelector('img');
  if (!im) { ringTxt.textContent = ''; im = h('img', { alt: '' }); ringTxt.append(im); }
  const old = im.src; im.src = url; if (old.startsWith('blob:')) URL.revokeObjectURL(old);
});
function showFailed(t) {
  drawProgress();
  bNote.textContent = T('No salió. Revisa el aviso de error (abajo a la derecha) y vuelve a intentar.');
  bCloud.classList.add('hide');
}

/* ---------------- resultado ---------------- */
let cur = null;
async function showResult(r) {
  const f = r.file; if (!f) return;
  cur = { ...r, sel: f };
  const verb = r.verb || (r.motion ? 'move' : f.kind === 'vid' ? 'video' : 'image');
  viewC.innerHTML = '';
  const isHD = /^(hd|hdpro|hdmax)_/i.test(f.filename || '');
  const cap = h('span', { class: 'sp-cap' });
  let player;
  if (r.all && r.all.length > 1 && verb === 'move') {
    player = h('div', { class: 'sp-player has sp-grid4' });
    r.all.forEach((x, i) => {
      const fig = h('figure', { class: i === 0 ? 'on' : '', onclick: () => { cur.sel = x; player.querySelectorAll('figure').forEach(z => z.classList.toggle('on', z === fig)); dl.href = core.urlOf(x); dl.download = x.filename; } },
        h('img', { src: core.urlOf(x), alt: x._ang || '' }), h('figcaption', {}, T(x._ang || '')));
      player.append(fig);
    });
  } else {
    const u = core.urlOf(f);
    player = h('div', { class: 'sp-player has' },
      f.kind === 'vid' ? h('video', { src: u, controls: true, autoplay: true, loop: true, playsinline: true }) : h('img', { src: u, alt: '' }), cap);
  }
  const side = h('div', { class: 'sp-side' }, h('h3', {}, cap1(r.title && r.title !== f.filename ? r.title : (f.filename || ''))));
  const act = h('div', { class: 'sp-act' });
  // 1) acción principal
  if (verb === 'move' && r.motion) {
    act.append(h('a', { class: 'pri', href: core.urlOf({ filename: `${r.motion}.bvh`, subfolder: 'phane/kimodo', type: 'output' }), download: `${r.motion}.bvh` },
      T('🦴 BVH para tu juego'), h('small', {}, T('animación 3D'))));
  } else if (!isHD) {
    const a = action(f.kind === 'vid' ? 'mejorar.final' : 'mejorar.hdpro');
    if (a && (!a.when || a.when(f))) {
      const small = h('small', {}, f.kind === 'vid' ? '' : '2×');
      act.append(h('button', { type: 'button', class: 'pri', onclick: () => makeFinal(f, a) }, T('🎬 Hacerlo final'), small));
      finalHint(f, small);
    }
  }
  // 2) editar
  const editBox = h('div', { class: 'sp-edit hide' });
  act.append(h('button', { type: 'button', onclick: () => {
    if (f.kind === 'img' && verb === 'image') { editBox.classList.toggle('hide'); editBox.querySelector('input')?.focus(); return; }
    if (r.title && r.title !== f.filename) { prompt.value = r.title; prompt.oninput(); }
    if (verb !== st.verb && VERBS.some(v => v[0] === verb)) { st.verb = verb; drawVerbs(); drawChips(); }
    go('a'); prompt.focus(); kit.toast(T('Cambia lo que quieras en el texto y dale Generar otra vez.'), 'info', 5000);
  } }, T('✏️ Editar'), h('small', {}, T('cambiar algo'))));
  if (f.kind === 'img' && verb === 'image') {
    const inp = h('input', { type: 'text', placeholder: T('¿Qué cambio? ej. “pelo rojo”') });
    const run = () => editImage(f, inp.value.trim());
    inp.onkeydown = e => { if (e.key === 'Enter') run(); };
    editBox.append(inp, h('button', { type: 'button', onclick: run }, T('Aplicar')));
  }
  // 3) descargar
  const dl = h('a', { href: core.urlOf(f), download: f.filename }, T('⬇️ Descargar'));
  act.append(dl);
  side.append(act, editBox);
  // ⋯ Más
  const more = h('div', { class: 'sp-menu', 'aria-label': T('Más') });
  const items = h('div', { class: 'hide', style: { display: 'contents' } });
  const it = (label, fn, cls) => h('button', { type: 'button', class: cls || '', onclick: () => fn(cur.sel) }, label);
  more.append(h('button', { type: 'button', 'aria-expanded': 'false', onclick: e => { const hid = items.classList.toggle('hide'); e.currentTarget.setAttribute('aria-expanded', String(!hid)); } }, T('⋯ Más')),
    items);
  items.append(it(T('Abrir en ComfyUI'), openInComfy));
  if (CLOUD_OK.has(r.engine?.id)) items.append(it(T('Abrir en Comfy Cloud'), openInCloud));
  items.append(it(T('Mostrar en carpeta'), showInFolder), it(T('Borrar'), del, 'danger'));
  if (r.video && verb === 'move') items.prepend(it(T('Ver el maniquí 3D'), () => showResult({ file: r.video, all: [r.video], title: r.title, verb: 'video', engine: r.engine })));
  side.append(more);
  // meta: motor y licencia
  const meta = h('div', { class: 'sp-meta' });
  const e = r.engine;
  if (e) {
    meta.append(h('span', {}, T('Motor: {0} ({1}) · elegido para tu tarjeta', roleOf(e), shortName(e))));
    const lic = e.license || (LIC_OK.has(e.id) ? T('✅ uso comercial OK') : LIC_NC.has(e.id) ? T('⚠️ solo uso no comercial') : '');
    if (lic) meta.append(h('span', {}, T('Licencia: {0}', lic)));
  }
  side.append(meta, h('button', { class: 'sp-link', type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => go('a') }, T('＋ Crear otra cosa')));
  viewC.append(h('div', { class: 'sp-result' }, player, side));
  go('c');
  // pie del reproductor: borrador · 480p · 5 s
  if (cap.isConnected) {
    try {
      const d = await describeFile(core, await core.asInput(f));
      cap.textContent = f.kind === 'vid' ? `${isHD ? T('final') : T('borrador')} · ${d.h || '?'}p${d.secs ? ' · ' + Math.round(d.secs) + ' s' : ''}` : `${d.w || '?'}×${d.h || '?'}`;
    } catch { cap.remove(); }
  }
}
async function finalHint(f, small) {
  try {
    const d = await describeFile(core, await core.asInput(f));
    const e = [core.state.tier === 'highend' ? 'upscale.seedvr2_7b' : null, 'upscale.seedvr2_3b'].filter(Boolean).map(engines.engineById).find(usable) || engines.engineById('upscale.seedvr2_3b');
    const secs = e ? core.estimate(e, { file: { kind: d.kind, w: d.w, h: d.h, secs: d.secs, fps: d.fps }, scale: 2 }) : 0;
    small.textContent = [secs ? human(secs) : '', d.h ? (f.kind === 'vid' ? `${d.h * 2}p` : `${d.w * 2}×${d.h * 2}`) : '2×'].filter(Boolean).join(' · ');
  } catch { /* */ }
}
async function makeFinal(f, a) {
  newTask({ verb: f.kind === 'vid' ? 'video' : 'image', title: cur?.title || f.filename, steps: [T('Final en HD')].concat(f.kind === 'vid' ? [T('Más fluidez')] : []),
    expect: 1, est: 600, stepOf: d => Math.min(f.kind === 'vid' ? 1 : 0, d) });
  const t = task;
  try { await a.run(f, ctx); } catch (e) { kit.toast(String(e.message || e), 'err'); }
  if (!t.jobs.length && t.inflight <= 0) { task = null; return; }
  try { t.est = t.jobs[0]?.predicted || t.est; } catch { /* */ }
  go('b'); drawProgress();
}
async function editImage(f, text) {
  if (!text) { kit.toast(T('Escribe qué quieres cambiar.'), 'err'); return; }
  const e = fastEngine('edit');
  const inp = await core.asInput(f);
  const o = { image: refWH(inp), refs: [], prompt: `${text}. Keep everything else in {img1} unchanged.` };
  newTask({ verb: 'image', title: cap1(text), steps: [T('Editar')], expect: 1, est: e ? core.checkEngine(e, o).secs : 60 });
  const t = task;
  await gen(e, o, `✏️ ${text.slice(0, 40)}`);
  if (!t.jobs.length && t.inflight <= 0) { task = null; return; }
  go('b'); drawProgress();
}

/* ---- ⋯ Más ---- */
function readPngMeta(buf) {   // chunk tEXt/iTXt "prompt"/"workflow" de un PNG de ComfyUI
  const b = new Uint8Array(buf), out = {};
  if (!(b[0] === 0x89 && b[1] === 0x50)) return out;
  const dv = new DataView(buf), lat = new TextDecoder('latin1'), utf = new TextDecoder();
  for (let p = 8; p + 8 <= b.length;) {
    const len = dv.getUint32(p), type = lat.decode(b.subarray(p + 4, p + 8)), data = b.subarray(p + 8, p + 8 + len);
    if (type === 'tEXt' || type === 'iTXt') {
      const z = data.indexOf(0), key = lat.decode(data.subarray(0, z));
      let txt = null;
      if (type === 'tEXt') txt = lat.decode(data.subarray(z + 1));
      else if (data[z + 1] === 0) { let q = data.indexOf(0, z + 3); q = data.indexOf(0, q + 1); txt = utf.decode(data.subarray(q + 1)); }
      if (txt && (key === 'prompt' || key === 'workflow')) { try { out[key] = JSON.parse(txt); } catch { /* */ } }
    }
    if (type === 'IEND') break;
    p += 12 + len;
  }
  return out;
}
async function graphOf(f) {
  if (f.prompt_id) {
    try { const hh = (await core.getJSON('/history/' + f.prompt_id))[f.prompt_id]; const g = hh?.prompt?.[2]; if (g && Object.keys(g).length) return { g, api: true }; } catch { /* */ }
  }
  const cands = [f]; if (f.kind === 'vid') cands.push({ ...f, filename: String(f.filename).replace(/\.[^.]+$/, '.png') });
  for (const x of cands) {
    try {
      const r = await fetch(core.urlOf(x)); if (!r.ok) continue;
      const m = readPngMeta(await r.arrayBuffer());
      if (m.workflow?.nodes) return { g: m.workflow, api: false };
      if (m.prompt && Object.keys(m.prompt).length) return { g: m.prompt, api: true };
    } catch { /* */ }
  }
  return null;
}
function downloadJSON(obj, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }));
  const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
async function openInComfy(f) {
  const r = await graphOf(f);
  if (!r) return kit.toast(T('Este archivo no trae el grafo guardado.'), 'err');
  const name = String(f.filename || 'phane').replace(/\.[^.]+$/, '') + (r.api ? '_api' : '_workflow') + '.json';
  downloadJSON(r.g, name);
  const ok = await kit.confirmBox(T('🧩 Grafo listo para ComfyUI'), `<p>${core.esc(name)}</p><p>${core.esc(T('Abre ComfyUI y arrastra el archivo al lienzo: aparecen todos sus nodos con los mismos ajustes.'))}</p>`,
    { ok: T('Abrir ComfyUI ↗'), cancel: T('Cerrar') });
  if (ok) window.open('/', '_blank');
}
async function toCloud(g, name) {
  downloadJSON(g, name);
  const ok = await kit.confirmBox(T('☁️ Abrir en Comfy Cloud'), `<p>${core.esc(name)}</p><p>${core.esc(T('Se descargó el grafo. Abre Comfy Cloud y arrastra el archivo al lienzo. Nada se sube hasta que tú lo hagas.'))}</p>`,
    { ok: T('Abrir Comfy Cloud ↗'), cancel: T('Cerrar') });
  if (ok) window.open('https://cloud.comfy.org', '_blank', 'noopener');
}
async function openInCloud(f) {
  const r = await graphOf(f);
  if (!r) return kit.toast(T('Este archivo no trae el grafo guardado.'), 'err');
  toCloud(r.g, String(f.filename || 'phane').replace(/\.[^.]+$/, '') + '_cloud.json');
}
function cloudFromTask() {
  const [e, o] = task?.graph || [];
  if (!e) return;
  try { toCloud(e.build(o).n, `phane_${e.id}_cloud.json`); } catch (err) { kit.toast(String(err.message || err), 'err'); }
}
async function showInFolder(f) {
  const r = await post(API + '/mostrar', { subfolder: f.subfolder || '', filename: f.filename });
  if (r.error) kit.toast(T('No pude abrir la carpeta: {0}', r.error), 'err');
}
async function del(f) {
  const ok = await kit.confirmBox(T('¿Borrar este archivo?'), `<p><b>${core.esc(f.filename)}</b> ${core.esc(T('se va a la Papelera de Windows; de ahí lo puedes recuperar.'))}</p>`, { ok: T('🗑️ Sí, borrar') });
  if (!ok) return;
  const r = await post(API + '/borrar', { subfolder: f.subfolder || '', filename: f.filename });
  if (r.error) return kit.toast(T('No se pudo borrar: {0}', r.error), 'err');
  kit.toast(T('🗑️ Enviado a la Papelera.'), 'info');
  core.refreshGallery(); go('a');
}

/* ---------------- crear personaje en 3 pasos ---------------- */
function newCharacter() {
  whoWrap.querySelector('.sp-popmenu')?.classList.add('hide');
  const editE = fastEngine('edit'), imgE = fastEngine('image');
  const W = { step: 1, desc: '', views: {}, status: { front: '', side: '', back: '' }, jobs: {} };
  const box = h('div', { class: 'sp-wiz', role: 'dialog', 'aria-modal': 'true', 'aria-label': T('Personaje nuevo') });
  const bg = h('div', { class: 'sp-wiz-bg', onclick: e => { if (e.target === bg) close(); } }, box);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  const slot = kit.slot({ kind: 'image', tag: T('Foto'), empty: T('📷 <b>Sube una foto</b><br><small>arrastra, pega o haz clic</small>') });
  const descIn = h('textarea', { rows: 5, placeholder: T('…o descríbelo: “una niña robot pequeña con bufanda amarilla y ojos grandes y redondos”') });
  const nameIn = h('input', { type: 'text', placeholder: T('Nombre, ej. “Phany”') });
  const figs = {};
  const VIEWS = [['front', 'Frente'], ['side', 'Perfil'], ['back', 'Espalda']];
  const PROMPTS = {
    side: `Turn {img1} to a side profile view facing left, full body, the exact same character with the same design, colors and outfit, ${PLAIN}.`,
    back: `Turn {img1} to a back view, seen from behind, full body, the exact same character with the same design, colors and outfit, ${PLAIN}.`,
  };
  const track = (key, j) => { if (!j) { W.status[key] = 'err'; draw(); return; } W.jobs[key] = j; W.status[key] = 'run'; draw(); };
  core.on('queue', () => { for (const [k, j] of Object.entries(W.jobs)) if (j.status === 'err' && W.status[k] === 'run') { W.status[k] = 'err'; draw(); } });
  async function start() {
    const photo = slot.value; W.desc = descIn.value.trim();
    let j;
    const afterFront = async f => {
      W.views.front = await core.asInput(f); W.status.front = 'ok'; draw();
      for (const k of ['side', 'back']) {
        track(k, await kit.generar(editE, { image: refWH(W.views.front), refs: [], prompt: PROMPTS[k] }, `👤 ${T('Personaje nuevo')} · ${T(k === 'side' ? 'Perfil' : 'Espalda')}`,
          { confirmed: true, after: async f2 => { W.views[k] = await core.asInput(f2); W.status[k] = 'ok'; draw(); } }));
      }
    };
    if (photo) j = await kit.generar(editE, { image: refWH(photo), refs: [], prompt: `Full body front view of the character from {img1}, facing the camera, standing in a relaxed neutral pose, the exact same design, colors and outfit, ${PLAIN}.` },
      `👤 ${T('Personaje nuevo')} · ${T('Frente')}`, { after: afterFront });
    else j = await kit.generar(imgE, { prompt: `Character design, full body front view of ${W.desc}, facing the camera, standing in a relaxed neutral pose, ${PLAIN}`, ar: '3:4', count: 1, refs: [] },
      `👤 ${T('Personaje nuevo')} · ${T('Frente')}`, { after: afterFront });
    track('front', j);
  }
  async function save() {
    const name = nameIn.value.trim();
    if (!name) { kit.toast(T('Ponle un nombre.'), 'err'); nameIn.focus(); return; }
    const vistas = {}; for (const k of ['side', 'back']) if (W.views[k]) vistas[k] = pick(W.views[k]);
    const all = await personajes.upsert({ name, photos: [pick(W.views.front)], vistas, ...(W.desc && { desc: W.desc }) });
    const p = all.find(x => x.name.toLowerCase() === name.toLowerCase());
    await loadPjs(); if (p) setPj(p.id);
    kit.toast(T('👤 “{0}” listo. Ya sale en tus imágenes, videos y movimientos.', name), 'info', 6000);
    close();
  }
  function draw() {
    box.innerHTML = '';
    const stepsEl = h('div', { class: 'sp-wiz-steps' });
    [T('1 · Foto o descripción'), T('2 · Frente, perfil y espalda'), T('3 · Nombre')].forEach((s, i) => stepsEl.append(h('span', { class: W.step === i + 1 ? 'on' : '' }, s)));
    box.append(h('h3', {}, T('Crear personaje')), stepsEl);
    const actionsEl = h('div', { class: 'sp-wiz-actions' }, h('button', { class: 'btn', type: 'button', onclick: close }, T('Cerrar')));
    if (W.step === 1) {
      box.append(h('div', { class: 'sp-wiz-or' }, slot, h('span', {}, T('o')), descIn));
      const est = (() => { try { const e = slot.value ? editE : imgE; return human(core.checkEngine(e, {}).secs + 2 * core.checkEngine(editE, {}).secs); } catch { return ''; } })();
      box.append(h('p', { class: 'sp-note' }, T('Phane hace su frente, perfil y espalda ({0}).', est)));
      actionsEl.append(h('button', { class: 'btn acc', type: 'button', onclick: () => {
        if (!slot.value && descIn.value.trim().length < 3) { kit.toast(T('Sube una foto o escribe cómo es.'), 'err'); return; }
        if (!editE) { kit.toast(T('No hay motor de edición disponible todavía.'), 'err'); return; }
        W.step = 2; draw(); start();
      } }, T('Siguiente')));
    } else if (W.step === 2) {
      const grid = h('div', { class: 'sp-views' });
      for (const [k, l] of VIEWS) {
        const v = W.views[k], s = W.status[k];
        figs[k] = h('figure', {}, v ? h('img', { src: v.url || core.urlOf(v), alt: T(l) }) : (s === 'err' ? '✕' : s === 'run' ? T('creando…') : T('en espera…')), h('figcaption', {}, T(l)));
        grid.append(figs[k]);
      }
      box.append(grid, h('p', { class: 'sp-note' }, T('Puedes cerrar esta ventana: los trabajos siguen en la cola. Para guardarlo, espera aquí.')));
      const pending = Object.values(W.status).some(s => s === 'run' || s === '');
      const nextB = h('button', { class: 'btn acc', type: 'button', disabled: !W.views.front || (pending && W.status.front === 'ok' && (W.status.side === 'run' || W.status.back === 'run')), onclick: () => { W.step = 3; draw(); nameIn.focus(); } }, T('Siguiente'));
      actionsEl.append(nextB);
    } else {
      box.append(h('div', { class: 'sp-views' }, ...VIEWS.filter(([k]) => W.views[k]).map(([k, l]) => h('figure', {}, h('img', { src: W.views[k].url || core.urlOf(W.views[k]), alt: T(l) }), h('figcaption', {}, T(l))))), nameIn);
      nameIn.onkeydown = e => { if (e.key === 'Enter') save(); };
      actionsEl.append(h('button', { class: 'btn acc', type: 'button', onclick: save }, T('Guardar')));
    }
    box.append(actionsEl);
  }
  draw();
  root.append(bg);
}

/* ---------------- arranque ---------------- */
core.on('error', msg => kit.toast(tr(msg), 'err', 15000));
let pcChecked = false;
core.on('sys', () => {
  drawGpu();
  if (!pcChecked) { pcChecked = true; const lv = core.pcLevel(); if (lv.level !== 'ok') kit.toast('⚠️ ' + tr(lv.msg), lv.level === 'img' ? 'info' : 'err', 20000); updEstimate(); }
});
core.on('tier', () => { drawGpu(); updEstimate(); });
core.on('models', updEstimate);
document.title = 'Phane · ' + T('Simple');
drawGpu(); drawVerbs(); drawWho(); drawChips(); drawExamples(); drawGallery();
loadPjs();
window.PHANE_SIMPLE = { core, kit, engines, ctx, actions, plan: () => plan(), get task() { return task; },
  demo: () => { newTask({ verb: 'video', title: 'Demo', who: 'Phany', steps: [T('Movimiento'), T('Maniquí'), T('{0} en la pose', 'Phany'), T('Video')], expect: 4, est: 1800 }); task.done = 1; go('b'); drawProgress(); } };   // solo para revisar la vista Generando sin GPU   // para depurar desde la consola
