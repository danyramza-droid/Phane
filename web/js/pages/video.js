// Página 🎬 VIDEO (estilo Create Video + Camera Controls).
// Imagen inicial/final (modo automático), prompt + ideas, motor (herramienta 'video'), presets de cámara (Mix de 2),
// efecto rápido, formato, duración, calidad, "Más acción", escenas para video largo (SVI) y sonido automático (MMAudio).
import { CAMERA, CAM_GROUPS, cameraById } from '../data/camera.js';
import { effectById, fillEffect } from '../data/effects.js';
import * as enhance from '../enhance_ui.js';
import * as personajes from '../personajes.js';
import { probeVideo } from './mejorar.js';
import { CONTROL_FPS } from '../graphs/video.js';
import { tr } from '../i18n.js';

const VID_IDEAS = [
  ['Sonríe y gira', 'She turns her head toward the camera and smiles, hair moving gently in the wind.'],
  ['Camina hacia cámara', 'The person walks confidently toward the camera, natural body movement.'],
  ['Viento y lluvia', 'Strong wind and rain, clothes and hair flutter, light reflections move on the wet ground.'],
  ['Producto gira', 'The product slowly rotates on a pedestal, light glints across its glossy surface.'],
  ['Cielo timelapse', 'Clouds race across the sky, light and shadows sweep over the landscape.'],
  ['Baile', 'The person dances energetically, joyful expression, dynamic movement.'],
  ['Ciudad de noche', 'A rainy neon-lit city street at night, cars pass by, reflections shimmer on the wet asphalt.'],
  ['Con diálogo', 'A woman looks into the camera and says in Spanish: "Hoy empieza todo." Soft city ambience and distant traffic.'],
];
const QUICK_FX = ['squish', 'cakeify', 'inflate', 'explode', 'electrify', 'deflate', 'crush', 'rotate', 'laughing', 'crying'];
const MODE_TXT = {
  t2v: ['Texto → Video', 'sin imagen, todo sale de tu descripción'],
  i2v: ['Animar imagen', 'tu imagen cobra vida'],
  flf: ['Inicio → Final', 'viaja de una imagen a la otra'],
  svi: ['Video largo', 'tramos de 5 s encadenados'],
  fun: ['Cámara exacta', 'movimiento de cámara controlado con precisión'],
  control: ['Seguir un video', 'tu imagen se mueve igual que el video guía (Wan Fun Control)'],
};
const SOUND_ID = 'sound.mmaudio';

const CSS = `
.pg[data-id="video"] .vid-sel{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;font-size:12.5px;color:var(--mute)}
.pg[data-id="video"] .vid-sel .chip{padding:4px 10px;font-size:12px}
.pg[data-id="video"] .vid-cams{grid-template-columns:repeat(auto-fill,minmax(98px,1fr));max-height:430px;overflow:auto;padding-right:4px}
.pg[data-id="video"] .vid-cams .card-ico{aspect-ratio:1.5;font-size:26px}
.pg[data-id="video"] .vid-scenes .sc{display:grid;grid-template-columns:130px minmax(0,1fr);gap:8px;align-items:start;margin-top:6px}
.pg[data-id="video"] .vid-scenes .sc span{font-size:12px;color:var(--mute);padding-top:8px}
.pg[data-id="video"] .vid-scenes textarea{min-height:52px;width:100%}
.pg[data-id="video"] .vid-opts{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 10px;align-items:center}
.pg[data-id="video"] .vid-opts > span{font-size:12.5px;color:var(--mute)}
.pg[data-id="video"] .vid-audio{color:var(--ok)}
.pg[data-id="video"] .vid-guide{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start;margin-top:10px}
.pg[data-id="video"] .vid-guide input[type=number]{width:64px}
@media (max-width:700px){.pg[data-id="video"] .vid-guide{grid-template-columns:1fr}}
`;

/** Botón-chip de encendido/apagado que recuerda su estado (también lo usa pages/efectos.js). */
export function toggle(kit, core, label, key, { title, value = false, onChange } = {}) {
  let on = !!core.store.get('video.t.' + key, value);
  const b = kit.h('button', { class: 'chip', title }, label);
  const draw = () => b.classList.toggle('on', on);
  b.onclick = () => { on = !on; core.store.set('video.t.' + key, on); draw(); onChange && onChange(on); };
  draw();
  Object.defineProperty(b, 'value', { get: () => on, set: v => { on = !!v; draw(); } });
  return b;
}
const baseName = p => String(p || '').replace(/\\/g, '/').split('/').pop();
/** Nombre exacto instalado de una LoRA de los presets ({file, alt?}) o null. */
export function loraNameOf(core, L) {
  if (!L) return null;
  return core.loraName(baseName(L.file)) || (L.alt ? core.loraName(baseName(L.alt)) : null) || null;
}

let ui = null;

function setup(ctx) {
  ctx.addAction({ id: 'video.animar', label: '🎬 Animar', cls: 'acc', title: 'Crear un video que empiece con esta imagen',
    when: f => f.kind === 'img', run: (f, c) => c.goto('video', { file: f }) });
  ctx.addAction({ id: 'video.final', label: '🏁 Usar como imagen final', title: 'El video terminará en esta imagen',
    when: f => f.kind === 'img', run: (f, c) => c.goto('video', { file: f, as: 'end' }) });
  ctx.addAction({ id: 'video.guia', label: '🎯 Usar como video guía', title: 'Otra imagen se moverá igual que este video (🎬 Video · Wan Fun Control)',
    when: f => f.kind === 'vid', run: (f, c) => c.goto('video', { guide: f }) });
}

function render(root, ctx) {
  const { kit, core, engines } = ctx;
  const { h } = kit;
  setup(ctx);
  if (!document.getElementById('css-video')) document.head.append(h('style', { id: 'css-video' }, CSS));

  let ready = false;
  const st = { cams: core.store.get('video.cams', ['dolly_in']).filter(id => cameraById(id)), fx: null };
  const caps = () => (menu && menu.value && menu.value.caps) || {};
  const sndEngine = () => (engines.engineById ? engines.engineById(SOUND_ID) : null) || null;

  /* ---------- 1. imágenes ---------- */
  const start = kit.slot({ kind: 'image', tag: 'Inicio', empty: '🎬 <b>Imagen inicial</b><br>(opcional) arrastra, pega<br>o haz clic', onChange: v => { forgetCams(v); refresh(); } });
  /** 27-oct (hueco 22): la cámara usada en la toma anterior NO se queda al animar OTRA imagen (se quitaba a mano con ✕).
      Solo si ya se generó con ella: elegir cámara y luego poner la foto la respeta. */
  function forgetCams(v) {
    const ref = v && (v.ref || v.filename), used = core.store.get('video.camsUsedWith', null);
    if (!ref || !used || used === ref) return;
    core.store.set('video.camsUsedWith', null);
    if (!st.cams.length) return;
    st.cams = []; core.store.set('video.cams', []);
    kit.toast('Imagen nueva: quité la cámara de la toma anterior.', 'info', 5000);
  }
  const end = kit.slot({ kind: 'image', tag: 'Final', empty: '🏁 <b>Imagen final</b><br>(opcional) el video<br>terminará aquí', onChange: () => refresh() });
  kit.pasteInto([start, end], () => ctx.isActive('video'));

  /* ---------- 🎯 video guía (27-oct, Wan Fun Control) ---------- */
  // el movimiento sale de un video real (p. ej. la toma del tráiler original): profundidad o esqueleto de cada cuadro
  let guideInfo = null;
  const ctlEngine = () => engines.engineById('video.wan_control');
  const guide = kit.slot({ kind: 'video', tag: 'Guía', empty: '🎯 <b>Seguir el movimiento de un video</b><br><small>(opcional) tu imagen se moverá igual</small>',
    onChange: async v => { guideInfo = null; refresh(); if (v) { const p = await probeVideo(v.url || core.urlOf(v)); if (guide.value === v) { guideInfo = p; gDur.value = Math.min(5, Math.max(0.5, (p.secs || 5) - (+gFrom.value || 0))).toFixed(1); refresh(); } } } });
  const gFrom = h('input', { type: 'number', min: 0, step: 0.1, value: 0, oninput: () => refresh() });
  const gDur = h('input', { type: 'number', min: 0.5, max: 5, step: 0.1, value: 3, oninput: () => refresh() });
  const ctlChips = kit.chips([['depth', '🏔️ Profundidad', 'Sigue formas y distancias: copia también el cuerpo del video'], ['pose', '🦴 Esqueleto', 'Solo la pose (SDPose): tu personaje conserva su forma (recomendado)']], { key: 'video.ctl', value: 'pose',   /* 29-oct: con personaje, profundidad le copiaba el cuerpo del maniquí */ onChange: () => refresh() });
  const guideNote = h('div', { class: 'note' });
  const guideBox = h('div', { class: 'vid-guide' }, guide,
    h('div', {}, h('div', { class: 'row' }, h('span', {}, 'Desde el segundo'), gFrom, h('span', {}, 'dura'), gDur, h('span', {}, 's (máx. 5)')),
      h('div', { style: { height: '8px' } }), ctlChips, guideNote));
  const guideOpts = () => {
    const v = guide.value; if (!v) return null;
    const from = Math.max(0, +gFrom.value || 0), dur = Math.min(5, Math.max(0.5, +gDur.value || 3));
    return { abs: v.abs || core.inputAbs(v), skip: Math.round(from * CONTROL_FPS), frames: Math.floor(dur * CONTROL_FPS) + 1, from, dur };
  };
  const modeNote = h('div', { class: 'mode' });

  /* ---------- 2. prompt ---------- */
  const promptTitle = h('div');
  const prompt = kit.promptBox({ placeholder: 'Describe lo que pasa: quién, qué hace, cómo se mueve… (mejor en inglés)', ideas: VID_IDEAS, key: 'video', rows: 3 });
  enhance.attach(prompt, 'video');   // ✍️ Mejorar prompt (LLM local)
  prompt.textarea.addEventListener('input', () => gen.update());
  const promptNote = h('div', { class: 'note' });

  /* ---------- 3. motor ---------- */
  const engNote = h('div', { class: 'note' });
  const menu = kit.engineMenu('video', { onChange: () => refresh(true) });

  /* ---------- 4. cámara ---------- */
  const camGroup = kit.chips(CAM_GROUPS, { key: 'video.camgroup', onChange: () => refresh() });
  const camGrid = kit.cardGrid([], { multi: 2, value: st.cams, onChange: v => {
    const visible = new Set(camItems().map(i => i.id));
    let next = [...st.cams.filter(id => !visible.has(id)), ...v];
    // solo una cámara EXACTA a la vez
    const ex = next.filter(id => cameraById(id)?.pose);
    if (ex.length > 1) next = next.filter(id => !cameraById(id)?.pose || id === ex[ex.length - 1]);
    st.cams = next.slice(-2);
    core.store.set('video.cams', st.cams);
    refresh();
  } });
  camGrid.classList.add('vid-cams');
  const camSel = h('div', { class: 'vid-sel' });

  /* ---------- 5. efecto rápido ---------- */
  const fxChips = kit.chips([['none', 'Ninguno']], { onChange: v => { st.fx = v === 'none' ? null : v; refresh(); } });
  const fxMore = h('button', { class: 'chip', title: 'Todos los efectos con vista previa', onclick: () => ctx.goto('efectos', start.value ? { file: start.value } : null) }, '✨ Ver todos los efectos');
  const fxNote = h('div', { class: 'note' });

  /* ---------- 6. formato ---------- */
  const arChips = kit.chips([['16:9', '▭ 16:9'], ['9:16', '▯ 9:16'], ['1:1', '◻ 1:1']], { key: 'video.ar', onChange: () => refresh() });
  const arRow = h('div', { class: 'row' }, arChips);
  const secsChips = kit.chips([3, 5, 10, 15, 20, 30].map(x => [x, x + ' s']), { key: 'video.secs', value: 5, onChange: () => refresh() });
  const qChips = kit.chips([['draft', 'Borrador']], { onChange: v => { if (menu.value) core.store.set('video.q.' + menu.value.id, v); refresh(); } });
  const boostT = toggle(kit, core, '🔥 Más acción', 'boost', { title: 'Movimientos más grandes y dinámicos (tarda ~2×)', onChange: () => refresh() });
  const nagT = toggle(kit, core, '🧲 Negativo real (NAG)', 'nag', { value: true, title: 'Evita mejor lo que no quieres (cuadros estáticos, deformaciones) sin perder velocidad', onChange: () => refresh() });
  const soundT = toggle(kit, core, '🔊 Sonido automático', 'sound', { title: 'Al terminar, crea el sonido del video con MMAudio', onChange: () => refresh() });
  const audioNote = h('span', { class: 'note vid-audio' }, '🔊 Este motor crea el sonido junto con el video');
  const extras = h('div', { class: 'row' }, boostT, nagT, soundT, audioNote);
  const qNote = h('div', { class: 'note' });

  /* ---------- escenas (video largo) ---------- */
  const sceneList = h('div');
  const scenes = h('div', { class: 'vid-scenes hide' },
    kit.step('✚', 'Escenas', '(opcional: qué pasa en cada tramo de 5 s; vacío = continúa la idea principal)'), sceneList);
  const sceneVals = () => [...sceneList.querySelectorAll('textarea')].map(t => t.value.trim());

  /* ---------- generar ---------- */
  const gen = kit.genButton('🎬 Crear video', () => go(), () => estimate());

  root.append(
    h('h1', {}, '🎬 Video'),
    h('p', { class: 'sub' }, 'Crea videos desde texto o anima tus imágenes, con movimientos de cámara de cine y efectos.'),
    kit.step(1, 'Imágenes', '(opcional)'), h('div', { class: 'cols2' }, start, end), guideBox,
    personajes.picker({ label: '👤 Animar a un personaje', onPick: p => { const ph = p?.photos?.[0]; if (ph) start.set(ph); } }), modeNote,
    kit.step(2, promptTitle), prompt, promptNote,
    kit.step(3, 'Motor'), menu, h('div', { class: 'note' }, '¿Cuál uso? Empieza con ⚡ Rápido en borrador; si te gusta, 🎬 Pasar a final.'), engNote,
    kit.step(4, 'Cámara', '(elige hasta 2 para mezclar · Mix)'), camGroup, h('div', { style: { height: '8px' } }), camGrid, camSel,
    kit.step(5, 'Efecto', '(opcional, sobre tu imagen)'), h('div', { class: 'row' }, fxChips), fxNote,   // 29-oct: sin fxMore (página ✨ Efectos escondida)
    kit.step(6, 'Formato'),
    h('div', { class: 'vid-opts' },
      h('span', { class: 'ar-lbl' }, 'Formato'), arRow,
      h('span', {}, 'Duración'), secsChips,
      h('span', {}, 'Calidad'), h('div', {}, qChips, qNote),
      h('span', {}, 'Extras'), extras),
    scenes,
    gen,
  );

  /* ---------- lógica ---------- */
  function camItems() {
    const grp = camGroup.value;
    return CAMERA.filter(c => grp === 'all' || c.group === grp);
  }
  /** Estado derivado (puro, no toca el DOM). */
  function computeState() {
    const c = caps();
    const hasStart = !!start.value, hasEnd = !!end.value;
    const secs = +secsChips.value || 5;
    const native = c.nativeSecs || 5;
    const exactOK = !!c.exact && hasStart && !hasEnd && secs <= native;
    const exactSel = st.cams.some(id => cameraById(id)?.pose);
    const modes = c.modes || ['t2v', 'i2v'];
    let mode;
    if (!hasStart) mode = 't2v';
    else if (guide.value && !hasEnd) mode = 'control';
    else if (hasEnd && modes.includes('flf')) mode = 'flf';
    else if (exactSel && exactOK && modes.includes('fun')) mode = 'fun';
    else if (secs > native && c.svi) mode = 'svi';
    else mode = 'i2v';
    return { c, hasStart, hasEnd, secs, native, exactOK, exactSel, mode, modes };
  }

  function refresh(engineChanged) {
    if (!ready) return;
    const e = menu.value;
    let c = caps();
    if (engineChanged && e) {
      const qs = c.qualities || [['final', 'Normal']];
      qChips.setOptions(qs);
      const want = core.store.get('video.q.' + e.id, qs.some(q => q[0] === 'final') ? 'final' : (c.qDefault || qs[0][0]));   /* 29-oct: 480p por defecto (el borrador agrandado deforma caras); el borrador sigue a un clic */   // borrador por defecto (flujo borrador -> final)
      qChips.value = qs.some(q => q[0] === want) ? want : (qs.some(q => q[0] === c.qDefault) ? c.qDefault : qs[0][0]);
    }
    // 1) la cámara exacta solo si se puede
    let S = computeState();
    if (!S.exactOK && S.exactSel) { st.cams = st.cams.filter(id => !cameraById(id)?.pose); core.store.set('video.cams', st.cams); }
    S = computeState();
    // 2) duraciones permitidas
    const maxQ = (c.maxSecsByQuality && c.maxSecsByQuality[qChips.value]) || c.maxSecs || 5;
    const longOK = !!c.svi && S.hasStart && !S.hasEnd && !S.exactSel;
    const durs = (c.durations || [3, 5]).map(s => {
      const dis = s > maxQ || (s > S.native && !longOK);
      const why = s > maxQ ? 'Muy largo para este motor/calidad' : (s > S.native && !longOK) ? (S.exactSel ? 'La cámara exacta es de hasta 5 s' : S.hasEnd ? 'Inicio→Final es de hasta 5 s' : 'Para más de 5 s pon una imagen inicial') : (s > S.native ? 'Se arma en tramos de 5 s' : '');
      return [s, s + ' s', why, dis];
    });
    secsChips.setOptions(durs);
    const ok = durs.filter(d => !d[3]).map(d => d[0]);
    if (!ok.includes(+secsChips.value)) secsChips.value = ok.filter(s => s <= +secsChips.value).pop() || ok.find(s => s === 5) || ok[0] || 5;
    S = computeState();

    // 3) modo
    const mt = MODE_TXT[S.mode];
    modeNote.innerHTML = `Modo: <b>${mt[0]}</b> · ${mt[1]}` + (S.hasEnd && !S.modes.includes('flf') ? ' · ⚠️ este motor no usa la imagen final' : '');

    // 4) cámaras
    const loraOn = !!c.loras;
    camGrid.setItems(camItems().map(cm => {
      const name = cm.lora ? loraNameOf(core, cm.lora) : null;
      const usesLora = cm.lora && loraOn && name && !(cm.lora.only === 'i2v' && S.mode === 't2v');
      return {
        id: cm.id, label: cm.label, icon: cm.icon, preview: cm.preview,
        badge: cm.pose ? 'EXACTA' : usesLora ? 'LoRA' : '',
        disabled: !!cm.pose && !S.exactOK,
        title: cm.pose ? (S.exactOK ? 'Movimiento exacto (Wan Fun Camera)' : 'Cámara exacta: necesita imagen inicial, sin imagen final, hasta 5 s y motor Wan')
          : cm.lora && !loraOn ? 'Este motor no usa LoRAs: se aplica como texto'
          : cm.lora && !name ? 'La LoRA aún no está descargada: se aplica como texto' : cm.prompt,
      };
    }));
    camGrid.value = st.cams;
    camGrid.querySelectorAll('video').forEach(v => { v.preload = 'metadata'; if (!/#t=/.test(v.getAttribute('src'))) v.src = v.getAttribute('src') + '#t=0.1'; });
    camSel.innerHTML = '';
    if (st.cams.length) {
      camSel.append(h('span', {}, st.cams.length > 1 ? 'Mix:' : 'Elegida:'));
      st.cams.forEach(id => { const cm = cameraById(id); camSel.append(h('button', { class: 'chip on', title: 'Quitar', onclick: () => { st.cams = st.cams.filter(x => x !== id); core.store.set('video.cams', st.cams); refresh(); } }, `${cm.icon} ${tr(cm.label)} ✕`)); });
    } else camSel.append(h('span', {}, 'Sin movimiento especial: el modelo decide.'));

    // 5) efecto rápido
    const fxOK = S.hasStart && loraOn && S.mode !== 'fun' && S.mode !== 'control';
    const fxOpts = [['none', 'Ninguno']];
    for (const id of QUICK_FX) {
      const fx = effectById(id); if (!fx) continue;
      const inst = !!loraNameOf(core, fx.lora);
      fxOpts.push([id, `${fx.icon} ${fx.label}`, !inst ? 'Descargando…' : '', !fxOK || !inst]);
    }
    if (st.fx && !QUICK_FX.includes(st.fx)) { const fx = effectById(st.fx); if (fx) fxOpts.push([fx.id, `${fx.icon} ${fx.label}`, '', !fxOK]); }
    if (st.fx && !fxOK) st.fx = null;
    fxChips.setOptions(fxOpts);
    fxChips.value = st.fx || 'none';
    fxNote.textContent = !loraOn ? 'Los efectos usan LoRAs de Wan: elige un motor Wan para usarlos.'
      : !S.hasStart ? 'Los efectos se aplican sobre una imagen: pon una imagen inicial.'
      : S.mode === 'fun' ? 'Con cámara exacta no se pueden usar efectos.' : S.mode === 'control' ? 'Siguiendo un video no se usan efectos ni LoRAs de cámara.' : '';
    // 🎯 video guía
    const gd = guideOpts(), ce = ctlEngine();
    guideNote.textContent = !gd ? '' : !S.hasStart ? '⚠️ Pon también la imagen de inicio (tu personaje en la escena).'
      : S.hasEnd ? '⚠️ Con imagen final no se usa el video guía.'
      : !ce ? 'Falta el motor Wan Fun Control.'
      : `${guideInfo?.secs ? `El video dura ${guideInfo.secs.toFixed(1)} s · ` : ''}uso ${gd.dur.toFixed(1)} s desde el ${gd.from.toFixed(1)}. Elige un tramo SIN cortes de cámara.`;

    // 6) prompt
    const fx = st.fx ? effectById(st.fx) : null;
    promptTitle.innerHTML = fx ? '¿Qué hay en la imagen? <small>(en inglés, sin artículo: ej. red sports car)</small>' : '¿Qué pasa en la escena?';
    prompt.textarea.placeholder = fx ? 'red sports car / man in a blue suit / cat…' : 'Describe lo que pasa: quién, qué hace, cómo se mueve… (mejor en inglés)';
    promptNote.textContent = c.audio ? '🔊 Describe también los sonidos y diálogos (ej. "she says: …", "rain and thunder").' : '';

    // 7) formato y extras
    arRow.classList.toggle('hide', S.hasStart);
    root.querySelector('.ar-lbl').classList.toggle('hide', S.hasStart);
    if (c.aspects) arChips.setOptions([['16:9', '▭ 16:9'], ['9:16', '▯ 9:16'], ['1:1', '◻ 1:1']].filter(a => c.aspects.includes(a[0])));
    boostT.classList.toggle('hide', !c.boost);
    nagT.classList.toggle('hide', !c.nag);
    soundT.classList.toggle('hide', !!c.audio || !sndEngine());
    audioNote.classList.toggle('hide', !c.audio);
    qNote.textContent = qChips.value === 'draft' ? 'Rápido para probar el movimiento. Si sale una persona o personaje, genera en Final desde el inicio: el borrador agrandado deforma las caras.' : '';
    engNote.textContent = e ? (e.desc || '') : 'No hay motor de video disponible todavía.';

    // 8) escenas (video largo)
    const n = S.mode === 'svi' ? Math.ceil(S.secs / 5) : 0;
    scenes.classList.toggle('hide', n < 2);
    const old = sceneVals();
    sceneList.innerHTML = '';
    for (let i = 1; i < n; i++) {
      const ta = h('textarea', { class: 'sm', rows: 2, placeholder: 'Opcional: qué pasa después…' });
      ta.value = old[i - 1] || '';
      ta.oninput = () => gen.update();
      sceneList.append(h('div', { class: 'sc' }, h('span', {}, `Tramo ${i + 1} (${i * 5}–${i * 5 + 5} s)`), ta));
    }
    gen.update();
  }

  /** Arma las opciones del motor. strict = validar para generar. */
  function collect(strict) {
    const S0 = computeState();
    const e = S0.mode === 'control' ? ctlEngine() : menu.value;
    if (!e) return { err: S0.mode === 'control' ? 'Falta el motor Wan Fun Control.' : 'No hay motor de video disponible todavía.' };
    if (S0.mode === 'control') {   // 🎯 el movimiento lo pone el video guía: sin cámaras, efectos ni Más acción
      const gd = guideOpts(), main = prompt.value;
      if (strict && !main) return { err: 'Describe la escena y a tu personaje (en inglés).', focus: prompt.textarea };
      const o = { mode: 'control', control: ctlChips.value, prompts: [[main, 'Cinematic, smooth natural motion, highly detailed.'].filter(Boolean).join(' ')],
        quality: qChips.value === 'draft' ? 'draft' : 'final', start: start.value, guide: { abs: gd.abs, skip: gd.skip, frames: gd.frames }, secs: gd.dur };
      const sound = soundT.value && sndEngine() ? sndEngine() : null;
      return { e, o, label: `🎯 Seguir video ${gd.dur.toFixed(1)}s · ${ctlChips.value === 'pose' ? 'esqueleto' : 'profundidad'}`, skipped: [], sound, soundPrompt: main };
    }
    const S = S0, c = S.c;
    const cams = st.cams.map(cameraById).filter(Boolean);
    const fx = st.fx ? effectById(st.fx) : null;
    const main = prompt.value;
    const skipped = [];
    const loras = [];
    const addL = (L, who) => {
      if (!L || !c.loras) return;
      if (L.only === 'i2v' && S.mode === 't2v') return;          // LoRA de imagen→video sin imagen: solo el texto
      const name = loraNameOf(core, L);
      if (!name) { skipped.push(who); return; }
      if (!loras.some(x => x.name === name)) loras.push({ name, strength: L.strength ?? 1, target: L.target || 'both' });
    };
    if (S.mode !== 'fun') cams.forEach(cm => addL(cm.lora, cm.label));
    if (fx) addL(fx.lora, fx.label);
    const pose = S.mode === 'fun' ? (cams.find(cm => cm.pose) || {}).pose : undefined;
    const camText = cams.filter(cm => !cm.pose).map(cm => cm.prompt).join(' ');
    const tail = c.audio ? '' : 'Cinematic, smooth natural motion, highly detailed.';
    const build = what => fx ? [fillEffect(fx, what), camText].filter(Boolean).join(' ') : [camText, what, tail].filter(Boolean).join(' ');
    if (strict && !main && !camText && !fx && S.mode !== 'fun') return { err: 'Escribe qué pasa en la escena (o elige una cámara o un efecto).', focus: prompt.textarea };
    let prompts = [build(main)];
    if (S.mode === 'svi') prompts = prompts.concat(sceneVals().slice(0, Math.ceil(S.secs / 5) - 1).map(t => build(t || main)));
    const secs = S.mode === 'svi' ? prompts.length * 5 : S.secs;
    const o = { mode: S.mode, prompts, secs, quality: qChips.value, ar: arChips.value, start: start.value || null,
      end: S.mode === 'flf' ? end.value : null, loras, pose, boost: !!c.boost && boostT.value };
    if (c.nag) o.nag = nagT.value;
    const camNames = cams.map(x => x.label).join(' + ');
    const label = `🎬 ${MODE_TXT[S.mode][0]} ${secs}s${camNames ? ' · ' + camNames : ''}${fx ? ' · ' + fx.label : ''}${o.boost ? ' · 🔥' : ''}`;
    const sound = !c.audio && soundT.value && sndEngine() ? sndEngine() : null;
    return { e, o, label, skipped, sound, soundPrompt: fx ? '' : main };
  }

  function estimate() {
    const r = collect(false);
    if (r.err) return r.err;
    let t = kit.estimateText(r.e, r.o);
    if (r.sound) { try { t += ` + 🔊 sonido ~${core.fmt(core.estimate(r.sound, { video: { secs: r.o.secs }, secs: r.o.secs, prompt: r.soundPrompt }))}`; } catch { /* */ } }
    return t;
  }

  async function go() {
    const r = collect(true);
    if (r.err) { kit.toast(r.err, 'err'); if (r.focus) r.focus.focus(); return; }
    if (r.skipped.length) kit.toast(`La LoRA de ${r.skipped.join(', ')} aún no está descargada: usaré solo el texto.`, 'info', 7000);
    if (st.cams.length && start.value) core.store.set('video.camsUsedWith', start.value.ref || start.value.filename);
    const draft = r.o.quality === 'draft';
    const after = r.sound || draft ? async file => {
      if (draft) kit.toast('✅ Borrador listo. ¿Te gusta? Pulsa 🎬 Pasar a final (debajo del video) para la versión HD.', 'info', 12000);
      if (!r.sound) return;
      const v = await core.asInput(file);
      await kit.generar(r.sound, { video: v, prompt: r.soundPrompt, secs: r.o.secs }, `🔊 Sonido · ${r.label.replace(/^🎬\s*/, '')}`);
    } : undefined;
    await kit.generar(r.e, r.o, r.label, { after });
  }

  core.on('loras', () => refresh());
  core.on('models', () => refresh());
  ready = true;
  refresh(true);

  ui = {
    start, end, guide, prompt, refresh,
    setCams: ids => { st.cams = ids.filter(id => cameraById(id)).slice(-2); core.store.set('video.cams', st.cams); refresh(); },
    setFx: id => { st.fx = effectById(id) ? id : null; refresh(); },
  };
}

async function receive(p, ctx) {
  if (!ui || !p) return;
  if (p.end) await ui.end.set(p.end);
  if (p.guide) await ui.guide.set(p.guide);
  const f = p.start || p.file || p.image;
  if (f) {
    if (f.kind && f.kind !== 'img') ctx.kit.toast('Para animar necesito una imagen 🙂 (este archivo es ' + (f.kind === 'vid' ? 'un video' : 'audio') + ').', 'err');
    else if (p.as === 'end') await ui.end.set(f);
    else await ui.start.set(f);
  }
  if (p.prompt) ui.prompt.value = p.prompt;
  if (p.camera) ui.setCams([].concat(p.camera));
  if (p.effect) ui.setFx(p.effect);
  ui.refresh();
  if (f && f.kind === 'img') ui.prompt.textarea.focus();
}

export default { id: 'video', title: 'Video', icon: '🎬', order: 40, render, receive, setup };
