// Página "💎 Mejorar": HD (upscale), más fluidez (fps) y recortar sujeto (segment) sobre una imagen o un video.
// Exporta probeVideo() (duración, tamaño y fps de un video en el navegador) que también usan Recast y otras páginas.
import { engineById, pickDefault, missingFiles, RAM_CAP } from '../engines.js';

/* ---------------- utilidades de video (navegador) ---------------- */
const COMMON_FPS = [12, 15, 16, 23.976, 24, 25, 29.97, 30, 32, 48, 50, 59.94, 60];
const snapFps = f => (f > 0 ? COMMON_FPS.find(c => Math.abs(c - f) / c < 0.01) || Math.round(f * 100) / 100 : 0);

/** fps exactos de un MP4/MOV leyendo solo sus cabeceras (moov -> trak de video -> mdhd + stts) con peticiones Range. 0 si no se pudo. */
export async function mp4Fps(url) {
  const get = async (a, b) => {
    const r = await fetch(url, { headers: { Range: `bytes=${a}-${b}` } });
    if (!r.ok) throw new Error('range');
    const buf = await r.arrayBuffer();
    return r.status === 206 ? buf : buf.slice(a, b + 1);   // si el servidor ignora Range, recorta
  };
  const name = (dv, p) => String.fromCharCode(dv.getUint8(p), dv.getUint8(p + 1), dv.getUint8(p + 2), dv.getUint8(p + 3));
  try {
    // 1) caminar las cajas de primer nivel hasta encontrar 'moov'
    let pos = 0, moov = null;
    for (let guard = 0; guard < 32 && !moov; guard++) {
      const dv = new DataView(await get(pos, pos + 15));
      if (dv.byteLength < 8) break;
      let size = dv.getUint32(0); const type = name(dv, 4);
      if (size === 1) size = Number(dv.getBigUint64(8));
      if (type === 'moov') moov = new DataView(await get(pos, pos + size - 1));
      else if (size < 8) break;
      pos += size;
    }
    if (!moov) return 0;
    // 2) dentro de moov: trak con hdlr 'vide' -> mdhd (timescale) + stts (cuadros y duración)
    const kids = (s, e) => { const out = []; let p = s; while (p + 8 <= e) { let sz = moov.getUint32(p), hd = 8; if (sz === 1) { sz = Number(moov.getBigUint64(p + 8)); hd = 16; } if (sz < hd) break; out.push({ t: name(moov, p + 4), s: p + hd, e: Math.min(e, p + sz) }); p += sz; } return out; };
    const find = (s, e, path) => { let cur = [{ s, e }]; for (const t of path) { const n = cur.flatMap(b => kids(b.s, b.e)).filter(b => b.t === t); if (!n.length) return null; cur = n; } return cur; };
    for (const trak of find(0, moov.byteLength, ['moov', 'trak']) || []) {
      const hdlr = find(trak.s, trak.e, ['mdia', 'hdlr']);
      if (!hdlr || name(moov, hdlr[0].s + 8) !== 'vide') continue;
      const mdhd = find(trak.s, trak.e, ['mdia', 'mdhd'])[0];
      const ts = moov.getUint8(mdhd.s) === 1 ? moov.getUint32(mdhd.s + 20) : moov.getUint32(mdhd.s + 12);
      const stts = find(trak.s, trak.e, ['mdia', 'minf', 'stbl', 'stts'])[0];
      const n = moov.getUint32(stts.s + 4);
      let frames = 0, dur = 0;
      for (let i = 0; i < n; i++) { const c = moov.getUint32(stts.s + 8 + i * 8), d = moov.getUint32(stts.s + 12 + i * 8); frames += c; dur += c * d; }
      return dur ? snapFps(frames * ts / dur) : 0;
    }
  } catch { /* no es MP4/MOV o no se pudo leer */ }
  return 0;
}

/** Lee {secs, w, h, fps} de un video. fps = 0 si no se pudo medir (WebM, etc.). */
export function probeVideo(url, { fps = true } = {}) {
  return new Promise(res => {
    const out = { secs: 0, w: 0, h: 0, fps: 0 };
    if (!url) return res(out);
    const v = document.createElement('video');
    v.muted = true; v.preload = 'metadata';
    let done = false;
    const fin = async () => {
      if (done) return; done = true;
      try { v.removeAttribute('src'); v.load(); } catch { /* */ }
      if (fps) out.fps = await mp4Fps(url);
      res(out);
    };
    v.onloadedmetadata = () => { out.secs = isFinite(v.duration) ? v.duration : 0; out.w = v.videoWidth; out.h = v.videoHeight; fin(); };
    v.onerror = fin;
    setTimeout(fin, 8000);
    v.src = url;
  });
}
const kindOf = f => f.kind || (/\.(mp4|webm|mov|mkv|avi|m4v|gif)$/i.test(f.filename || '') ? 'vid' : 'img');
/** Completa un archivo (de casilla o galería ya pasado por asInput) con kind, abs, w, h, secs y fps. */
export async function describeFile(core, f) {
  const o = { ...f, kind: kindOf(f) };
  if (o.kind === 'vid') {
    o.abs = o.abs || core.inputAbs(o);
    const p = await probeVideo(o.url);
    Object.assign(o, { secs: p.secs, w: p.w, h: p.h, fps: p.fps });
    if (o.hasAudio == null) o.hasAudio = (await core.mediaInfo(o.abs)).hasAudio;   // 27-oct: HD/final conservan la pista de audio (antes se perdía)
  } else if (!o.w && o.url) Object.assign(o, await core.imageSize(o.url));
  return o;
}
const engineFile = f => f && { kind: f.kind, ref: f.ref, abs: f.abs, w: f.w, h: f.h, secs: f.secs, fps: f.fps, hasAudio: !!f.hasAudio };
const usable = (core, e) => e && !missingFiles(e, core.state.installed).length && e.ramGB <= RAM_CAP;
/** Mejor motor "HD Pro" para el switch de poder actual. */
function bestPro(core) {
  const ids = core.state.tier === 'highend' ? ['upscale.seedvr2_7b', 'upscale.seedvr2_3b'] : ['upscale.seedvr2_3b', 'upscale.seedvr2_7b'];   // 29-oct: en Ligero, si no está el 3B usa el 7B (antes fallaba con el starter)
  return ids.map(engineById).find(e => usable(core, e)) || engineById(ids[0]);
}
const isHD = f => /^(hd|hdpro|hdmax)_/i.test(f.filename || '');

/* ---------------- acciones del visor ---------------- */
function registerActions(ctx) {
  const run = async (f, engine, extra, label) => {
    const file = await describeFile(ctx.core, await ctx.core.asInput(f));
    const key = engine.tool === 'fps' ? 'video' : 'file';
    return ctx.kit.generar(engine, { [key]: engineFile(file), ...extra }, `${label} · ${f.filename}`);
  };
  ctx.addAction({ id: 'mejorar.hd', label: '✨ HD rápido', title: 'Real-ESRGAN x2: listo en segundos',
    when: f => (f.kind === 'img' || f.kind === 'vid') && !isHD(f),
    run: f => run(f, engineById('upscale.esrgan'), { scale: 2 }, '✨ HD') });
  ctx.addAction({ id: 'mejorar.hdpro', label: '💎 HD Pro', cls: 'pro', title: 'SeedVR2: reconstruye detalle real (tarda minutos)',
    when: f => (f.kind === 'img' || f.kind === 'vid') && !isHD(f),
    run: f => run(f, bestPro(ctx.core), { scale: 2 }, '💎 HD Pro') });
  ctx.addAction({ id: 'mejorar.fps', label: '🎞️ Más fluidez', title: 'Interpola cuadros: x2 más fluido',
    when: f => f.kind === 'vid' && !/fluido/i.test(f.filename || ''),
    run: f => run(f, pickDefault('fps', ctx.core.state.tier, ctx.core.state.installed), { factor: 2 }, '🎞️ Fluidez') });
  // borrador → final en un clic (25-oct): HD Pro y, si el video va a menos de 24 cuadros/s, x2 más fluido, encadenados
  ctx.addAction({ id: 'mejorar.final', label: '🎬 Pasar a final', cls: 'pro', first: true, title: 'Para el borrador que te gustó: HD Pro (SeedVR2 x2) y, si hace falta, más fluidez, todo seguido',
    when: f => f.kind === 'vid' && !isHD(f) && !/fluido/i.test(f.filename || '') && !/kimodo/i.test(f.subfolder || ''),   // un maniquí de 🕺 Movimiento no se pasa a final
    run: async f => {
      const file = await describeFile(ctx.core, await ctx.core.asInput(f));
      const dos = file.fps && file.fps < 24;   // ensayo 27-oct: a 24 fps o más no hay paso 2 y "1/2" confundía
      return ctx.kit.generar(bestPro(ctx.core), { file: engineFile(file), scale: 2 }, `🎬 Final${dos ? ' 1/2' : ''} (HD) · ${f.filename}`, { after: async out => {
        const hd = await describeFile(ctx.core, await ctx.core.asInput(out));
        const eF = pickDefault('fps', ctx.core.state.tier, ctx.core.state.installed);
        if (!eF || (hd.fps || file.fps || 0) >= 24) return;   // 24 fps o más ya se ve fluido: no inflar a 48-64
        await ctx.kit.generar(eF, { video: engineFile(hd), factor: 2 }, `🎬 Final 2/2 (fluidez) · ${f.filename}`, { confirmed: true });
      } });
    } });
  ctx.addAction({ id: 'mejorar.cut', label: '✂️ Recortar sujeto', title: 'Separar a la persona u objeto del fondo',
    when: f => f.kind === 'img' || f.kind === 'vid', run: f => ctx.goto('mejorar', { file: f, tab: 'cut' }) });
}
// Las acciones deben existir aunque el usuario no haya abierto esta página (app.js solo llama render al visitarla).
(function boot(n = 0) { const c = globalThis.HE?.ctx; if (c) registerActions(c); else if (n < 60) setTimeout(() => boot(n + 1), 500); })();

/* ---------------- casilla genérica (imagen o video) ---------------- */
function anySlot(ctx, { onChange } = {}) {
  const { core, kit } = ctx; const { h } = kit;
  let val = null, busy = false;
  const input = h('input', { type: 'file', accept: 'image/*,video/*', class: 'hide' });
  const el = h('div', { class: 'drop', tabindex: 0 });
  const draw = () => {
    el.innerHTML = '';
    if (busy) { el.append(h('div', {}, '⏳ Cargando…')); return; }
    if (!val) { el.append(h('div', { html: '📥 <b>Arrastra una imagen o un video</b><br><small>o haz clic para elegirlo · también desde Recientes</small>' })); return; }
    el.append(h('span', { class: 'tag' }, val.kind === 'vid' ? '🎬 Video' : '🖼️ Imagen'));
    el.append(val.kind === 'vid' ? h('video', { src: val.url, muted: true, loop: true, autoplay: true, playsinline: true }) : h('img', { src: val.url }));
    el.append(h('button', { class: 'x', title: 'Quitar', onclick: e => { e.stopPropagation(); set(null); } }, '✕'));
  };
  const set = async v => {
    if (v && kindOf(v) === 'aud') { kit.toast('Aquí van imágenes o videos (no audio).', 'err'); return; }
    if (v) { busy = true; draw(); try { v = await describeFile(core, v); } finally { busy = false; } }
    val = v; draw(); onChange && onChange(val);
  };
  const fromFile = async file => {
    if (!/^(image|video)\//.test(file.type)) return kit.toast('Formato no soportado: usa una imagen o un video.', 'err');
    busy = true; draw();
    let up; try { up = await core.upload(file); } finally { busy = false; }
    up.kind = file.type.startsWith('video/') ? 'vid' : 'img';
    await set(up);
  };
  input.onchange = async () => { if (input.files[0]) await fromFile(input.files[0]); input.value = ''; };
  el.onclick = e => { if (e.target.closest('video,.x')) return; input.click(); };
  el.ondragover = e => { e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = async e => {
    e.preventDefault(); el.classList.remove('over');
    const gal = e.dataTransfer.getData('application/x-phane-file');
    if (gal) return set(await core.asInput(JSON.parse(gal)));
    const f = e.dataTransfer.files[0]; if (f) await fromFile(f);
  };
  draw();
  const wrap = h('div', { class: 'slotwrap' }, el, input);
  Object.defineProperty(wrap, 'value', { get: () => val });
  wrap.set = async f => set(f ? (f.ref ? f : await core.asInput(f)) : null);
  wrap.kind = 'image';   // para kit.pasteInto (pegar imágenes con Ctrl+V)
  return wrap;
}

/* ---------------- página ---------------- */
const SUBJECTS = [['person', '🧍 Persona'], ['face', '🙂 Cara'], ['dog', '🐶 Perro'], ['cat', '🐱 Gato'], ['car', '🚗 Auto'], ['product', '📦 Producto']];
const ES_EN = { persona: 'person', personas: 'person', gente: 'person', hombre: 'man', mujer: 'woman', 'niño': 'child', 'niña': 'child', cara: 'face', rostro: 'face',
  perro: 'dog', gato: 'cat', auto: 'car', coche: 'car', carro: 'car', moto: 'motorcycle', producto: 'product', botella: 'bottle', pelota: 'ball', pájaro: 'bird', caballo: 'horse', cabello: 'hair', pelo: 'hair' };
const toEnglish = t => t.split(',').map(s => s.trim()).filter(Boolean).map(s => { const [w, n] = s.split(':'); const k = w.trim().toLowerCase(); return (ES_EN[k] || w.trim()) + (n ? ':' + n.trim() : ''); }).join(', ');

let ui = null;

export default {
  id: 'mejorar', title: 'Mejorar', icon: '💎', order: 110,
  setup: registerActions,   // app.js puede llamarlo al cargar (acciones del visor sin visitar la página)
  render(root, ctx) {
    const { kit, core } = ctx; const { h } = kit;
    registerActions(ctx);
    const style = h('style', {}, `
      .pg[data-id="mejorar"] .mj-panel{margin-top:4px}
      .pg[data-id="mejorar"] .mj-info{font-size:12.5px;color:var(--mute);margin-top:6px}
      .pg[data-id="mejorar"] .mj-subj{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:8px}
      .pg[data-id="mejorar"] .mj-chk{display:flex;gap:8px;align-items:center;font-size:13px;margin-top:8px;color:var(--mute)}`);

    let gens = {}, ready = false;   // los menús llaman onChange al crearse: no tocar nada hasta terminar de armar la página
    const refresh = () => { if (!ready) return; Object.values(gens).forEach(g => g && g.update()); syncPanels(); };
    const slot = anySlot(ctx, { onChange: () => refresh() });
    kit.pasteInto([slot], () => ctx.isActive('mejorar'));
    const info = h('div', { class: 'mj-info' });
    const file = () => slot.value;
    const fileO = () => engineFile(file()) || { kind: 'img' };

    // --- HD ---
    const engHD = kit.engineMenu('upscale', { onChange: () => refresh() });
    const scale = kit.chips([[2, 'x2'], [4, 'x4 (solo imagen)', 'Con SeedVR2: 4 veces más grande (tarda bastante más)']], { key: 'mejorar.scale', onChange: () => refresh() });
    const scaleRow = h('div', {}, kit.step('·', 'Tamaño'), scale);
    const oHD = () => ({ file: fileO(), scale: +scale.value });
    gens.hd = kit.genButton('💎 Mejorar a HD', async () => {
      const f = file(); if (!f) return kit.toast('Primero pon una imagen o un video.', 'err');
      await kit.generar(engHD.value, oHD(), `💎 HD · ${f.filename}`);
    }, () => kit.estimateText(engHD.value, oHD()));
    const pHD = h('div', { class: 'mj-panel' }, engHD, scaleRow, h('p', { class: 'note' },
      '✨ Real-ESRGAN: rápido, solo agranda. 💎 SeedVR2: reconstruye detalle real (piel, texto, telas). Los videos conservan su audio.'), gens.hd);

    // --- FPS ---
    const engF = kit.engineMenu('fps', { onChange: () => refresh() });
    const factor = kit.chips([[2, 'x2 más fluido'], [4, 'x4 (cámara lenta suave)']], { key: 'mejorar.factor', onChange: () => refresh() });
    const fpsInfo = h('div', { class: 'mj-info' });
    const oF = () => ({ video: fileO(), factor: +factor.value });
    gens.fps = kit.genButton('🎞️ Hacerlo más fluido', async () => {
      const f = file(); if (!f) return kit.toast('Primero pon un video.', 'err');
      if (f.kind !== 'vid') return kit.toast('Más fluidez es solo para videos.', 'err');
      await kit.generar(engF.value, oF(), `🎞️ Fluidez x${factor.value} · ${f.filename}`);
    }, () => kit.estimateText(engF.value, oF()));
    const pF = h('div', { class: 'mj-panel' }, engF, kit.step('·', 'Cuánto'), factor, fpsInfo, gens.fps);

    // --- Recortar sujeto ---
    const engS = kit.engineMenu('segment', { onChange: () => refresh() });
    const subj = h('input', { type: 'text', class: 'mj-subj', placeholder: 'Qué recortar (ej. person, dog, red car · varios: "person, dog")' });
    subj.value = core.store.get('mejorar.subj', 'person');
    subj.oninput = () => core.store.set('mejorar.subj', subj.value);
    const subjChips = h('div', { class: 'ideas' }, SUBJECTS.map(([en, lbl]) => h('button', { class: 'idea', onclick: () => { subj.value = en; subj.oninput(); } }, lbl)));
    const bg = kit.chips([['green', '🟩 Fondo verde'], ['black', '⬛ Fondo negro'], ['white', '⬜ Fondo blanco'], ['mask', '🎭 Solo máscara'], ['alpha', '🫥 Transparente (PNG)', 'Solo para imágenes']],
      { key: 'mejorar.bg', onChange: () => refresh() });
    const withMask = h('input', { type: 'checkbox' });
    withMask.checked = core.store.get('mejorar.withMask', false);
    withMask.onchange = () => core.store.set('mejorar.withMask', withMask.checked);
    const oS = () => ({ file: fileO(), prompt: toEnglish(subj.value || 'person'), bg: bg.value, withMask: withMask.checked });
    gens.cut = kit.genButton('✂️ Recortar', async () => {
      const f = file(); if (!f) return kit.toast('Primero pon una imagen o un video.', 'err');
      if (!subj.value.trim()) return kit.toast('Escribe qué quieres recortar.', 'err');
      await kit.generar(engS.value, oS(), `✂️ Recorte "${subj.value.trim()}" · ${f.filename}`);
    }, () => kit.estimateText(engS.value, oS()));
    const pS = h('div', { class: 'mj-panel' }, engS, kit.step('·', 'Qué recortar', 'en inglés funciona mejor'), subj, subjChips,
      kit.step('·', 'Fondo'), bg, h('label', { class: 'mj-chk' }, withMask, 'Guardar también la máscara (blanco y negro) para editar después'), gens.cut);

    const panels = { hd: pHD, fps: pF, cut: pS };
    const tabs = kit.chips([['hd', '💎 Mejorar a HD'], ['fps', '🎞️ Más fluidez'], ['cut', '✂️ Recortar sujeto']], { key: 'mejorar.tab', onChange: () => refresh() });

    function syncPanels() {
      Object.entries(panels).forEach(([k, p]) => p.classList.toggle('hide', k !== tabs.value));
      const f = file();
      const isVid = f && f.kind === 'vid';
      const caps = engHD.value?.caps || {};
      scaleRow.classList.toggle('hide', !(caps.scales || []).includes(4) || isVid);
      gens.fps.button.disabled = !!f && !isVid;
      fpsInfo.textContent = !f ? 'Funciona con videos (los de Wan salen a 16 o 32 cuadros por segundo).'
        : !isVid ? '⚠️ Más fluidez es solo para videos.'
        : f.fps ? `Tu video: ${f.fps} cuadros/s → quedará en ${Math.round(f.fps * factor.value * 100) / 100} cuadros/s.`
        : 'No pude medir los cuadros/s de tu video: se tomará como 30.';
      info.textContent = !f ? '' : isVid ? `🎬 ${f.w || '?'}×${f.h || '?'} · ${f.secs ? f.secs.toFixed(1) + ' s' : '¿? s'}${f.fps ? ' · ' + f.fps + ' cuadros/s' : ''}`
        : `🖼️ ${f.w || '?'}×${f.h || '?'}`;
    }

    root.append(style,
      h('h1', {}, '💎 Mejorar'),
      h('p', { class: 'sub' }, 'Sube de calidad tus fotos y videos, hazlos más fluidos o recorta a la persona del fondo.'),
      kit.step(1, 'Tu imagen o video'), slot, info,
      kit.step(2, 'Qué quieres hacer'), tabs,
      pHD, pF, pS);
    ui = { slot, tabs, refresh };
    ready = true;
    refresh();
    core.on('models', refresh);
    core.on('tier', () => setTimeout(refresh));
  },
  async receive(p, ctx) {
    if (!ui) return;
    if (p.tab) ui.tabs.value = p.tab;
    const f = p.file || p.video || p.image;
    if (f) await ui.slot.set(f);
    ui.refresh();
  },
};
