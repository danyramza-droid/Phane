// Página STORYBOARD (estilo "Popcorn"):
// hasta 4 referencias + historia → 8 cuadros consistentes (encadenados) → rehacer el que no guste → animar todo → una película.
import * as personajes from '../personajes.js';
import { probeVideo } from './mejorar.js';
import { tr } from '../i18n.js';   // 28-oct: aviso de caras (texto armado con el número de clip)
import { metalTitlePrompt, METAL_SHINE } from '../graphs/storyboard.js';

const N = 8;
const KEY = 'storyboard';

/** Encuadre del cuadro clave: [valor, etiqueta, tooltip, frase en inglés para el modelo]. */
const SHOTS = [
  ['auto', '🎬 Auto', 'Que el modelo elija el ángulo', ''],
  ['wide', '🏞️ General', 'Plano general: se ve todo el lugar', 'The camera pulls back to a wide establishing shot.'],
  ['medium', '🧍 Medio', 'Plano medio, de la cintura para arriba', 'The camera frames a medium shot.'],
  ['close', '🙂 Primer plano', 'Primer plano de la cara', 'The camera moves in to a close-up.'],
  ['ots', '👥 Sobre el hombro', 'Sobre el hombro, ideal para diálogos', 'The camera cuts to an over-the-shoulder shot.'],
  ['low', '⬆️ Contrapicado', 'Cámara baja mirando hacia arriba (se ve heroico)', 'The camera drops to a low angle looking up.'],
  ['high', '⬇️ Picado', 'Cámara alta mirando hacia abajo', 'The camera rises to a high angle looking down.'],
  ['pov', '👁️ POV', 'Lo que ve el personaje', 'The camera switches to a first-person point of view.'],
];
/** Movimiento de cámara al animar el cuadro. */
const MOVES = [
  ['none', '🎯 Natural', 'Sin movimiento especial', ''],
  ['in', '➡️ Acercarse', 'La cámara avanza hacia el sujeto', 'The camera slowly dollies in toward the subject.'],
  ['out', '⬅️ Alejarse', 'La cámara se aleja y revela la escena', 'The camera slowly pulls back, revealing the whole scene.'],
  ['arc', '↪️ Arco', 'La cámara gira alrededor del sujeto', 'The camera arcs smoothly around the subject.'],
  ['crane', '⬆️ Grúa', 'La cámara sube por encima de la escena', 'The camera cranes up, rising above the scene.'],
  ['hand', '🤳 En mano', 'Cámara en mano, estilo documental', 'Handheld camera following the subject, documentary style.'],
  ['pan', '👉 Paneo', 'La cámara gira hacia un lado', 'The camera pans slowly to the right.'],
];
const IDEAS = [
  ['Cine negro', 'A tired detective in a trench coat lights a cigarette under a flickering street lamp. He enters a smoky jazz bar and scans the room. A mysterious woman in red looks up from her table. They share a tense conversation over whiskey. Suddenly the lights go out. He chases a shadow down a rainy alley. He finds a torn photograph on the wet ground. He looks up at the city skyline, determined.'],
  ['Comercial de producto', 'A sleek perfume bottle rests on black marble with soft rim light. Water drops slide down the glass in slow motion. A woman in a silk dress walks through a sunlit garden. She sprays the perfume on her wrist and smiles. Petals swirl around her in a warm breeze. The bottle stands on a stone pedestal surrounded by flowers. Close-up of the glowing logo on the bottle. Final hero shot of the bottle at golden hour.'],
  ['Aventura', 'A young explorer stands at the edge of a misty jungle cliff at dawn. She climbs down thick vines toward a hidden temple. Inside, golden light pours through cracks onto ancient statues. She finds a glowing crystal on a stone altar. The temple starts to shake and rocks fall. She sprints through collapsing corridors. She leaps out into the sunlight as the entrance caves in. She raises the crystal on the cliff, triumphant.'],
  ['Día de ciudad', 'A cyclist rides through an empty city street at sunrise. She stops at a small corner café and orders coffee. She sketches the busy street from a window seat. Rain starts and people open colorful umbrellas. She runs through the rain laughing. She shelters under a bridge with a street musician. The rain stops and a rainbow appears over the rooftops. She rides away into the golden evening light.'],
];

/** Divide una historia en hasta n escenas: por renglones si hay varios; si no, por oraciones. Junta las que sobren. */
export function splitStory(text, n = N) {
  const t = String(text || '').trim();
  if (!t) return [];
  let parts = t.split(/\n+/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) parts = t.replace(/\s+/g, ' ').split(/(?<=[.!?…])\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length <= n) return parts;
  const out = [];
  for (let k = 0; k < n; k++) out.push(parts.slice(Math.floor(k * parts.length / n), Math.floor((k + 1) * parts.length / n)).join(' '));
  return out;
}

const CSS = `
.pg[data-id="storyboard"] .sb-refs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.pg[data-id="storyboard"] .sb-refs .drop{min-height:112px}
.pg[data-id="storyboard"] .sb-tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center}
.pg[data-id="storyboard"] .sb-scenes{display:grid;gap:8px}
.pg[data-id="storyboard"] .sb-scene{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px}
.pg[data-id="storyboard"] .sb-scene textarea{min-height:54px;background:var(--panel)}
.pg[data-id="storyboard"] .sb-scene .chip{padding:3px 9px;font-size:12px}
.pg[data-id="storyboard"] .sb-sh{display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:12.5px;color:var(--mute)}
.pg[data-id="storyboard"] .sb-sh b{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:99px;background:var(--acc);color:var(--acc-ink);font-size:12px;flex:none}
.pg[data-id="storyboard"] .sb-cut{display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12.5px;color:var(--mute)}
.pg[data-id="storyboard"] .sb-num{width:62px;background:var(--panel);border:1px solid var(--line);border-radius:7px;padding:3px 6px}
.pg[data-id="storyboard"] .sb-lbl{font-size:10.5px;color:var(--mute);margin:7px 0 4px;text-transform:uppercase;letter-spacing:.6px;font-weight:700}
.pg[data-id="storyboard"] .sb-strip{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
.pg[data-id="storyboard"] .sb-cell{position:relative;background:var(--panel2);border:1px solid var(--line);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
.pg[data-id="storyboard"] .sb-cell .it{aspect-ratio:var(--sb-ar,16/9);border:0;border-radius:0}
.pg[data-id="storyboard"] .sb-empty{aspect-ratio:var(--sb-ar,16/9);display:grid;place-items:center;color:var(--mute);font-size:11.5px;padding:6px;text-align:center;background:#0b0b10}
.pg[data-id="storyboard"] .sb-n{position:absolute;top:5px;left:5px;z-index:3;background:#000c;color:#fff;font-size:11px;font-weight:800;padding:0 7px;border-radius:99px}
.pg[data-id="storyboard"] .sb-v{position:absolute;top:5px;right:5px;z-index:3;background:#000c;font-size:11px;padding:0 6px;border-radius:99px}
.pg[data-id="storyboard"] .sb-ov{position:absolute;left:0;right:0;top:0;aspect-ratio:var(--sb-ar,16/9);display:grid;place-items:center;background:#000b;font-size:12px;z-index:2;pointer-events:none;color:var(--acc)}
.pg[data-id="storyboard"] .sb-ov.err{color:var(--err)}
.pg[data-id="storyboard"] .sb-act{display:flex;gap:4px;padding:5px;justify-content:center}
.pg[data-id="storyboard"] .sb-act .btn{flex:1;text-align:center;padding:3px 4px}
.pg[data-id="storyboard"] .sb-final{margin-top:10px}
.pg[data-id="storyboard"] .sb-final video{width:100%;border-radius:10px;background:#000;display:block}
.pg[data-id="storyboard"] .sb-sec{margin-top:20px;padding-top:4px;border-top:1px solid var(--line)}
@media (max-width:760px){.pg[data-id="storyboard"] .sb-refs,.pg[data-id="storyboard"] .sb-strip{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

let page = null;

function setup(ctx) {
  ctx.addAction({ id: 'storyboard.ref', label: '🎞️ Al Storyboard', title: 'Usar como referencia (personaje, producto o estilo) del storyboard',
    when: f => f.kind === 'img', run: (f, c) => c.goto('storyboard', { file: f }) });
  ctx.addAction({ id: 'storyboard.clip', label: '🎞️ Al Storyboard', title: 'Agregar este video como clip de la película (luego ✂️ recortar/acelerar y Unir)',
    when: f => f.kind === 'vid' && (f.type || 'output') === 'output', run: (f, c) => c.goto('storyboard', { video: f }) });
  // 💥 Impactos (27-oct, tráiler): flash + zoom de golpe + temblor en los segundos que digas (montaje_node.py, sin IA)
  ctx.addAction({ id: 'montaje.impactos', label: '💥 Impactos', title: 'Flash, zoom de golpe y temblor de cámara en cada golpe (pausa en el golpe para ver el segundo)',
    when: f => f.kind === 'vid' && !f.local, run: async (f, c) => {
      const e = c.engines.engineById('montaje.impactos'); if (!e) return;
      const v = document.querySelector('.view video'), t = v ? (Math.round(v.currentTime * 10) / 10) : 1;
      const ok = c.kit.confirmBox('💥 Impactos de golpe', '<p>Segundos de cada golpe, separados por coma (el video está en el segundo ' + t + ').</p>'
        + '<input id="he-golpes" style="width:100%;padding:6px 8px" value="' + t + '"><p style="margin-top:8px">Fuerza <input id="he-fuerza" type="number" min="0.2" max="3" step="0.1" value="1" style="width:70px"> '
        + '<label><input id="he-flash" type="checkbox" checked> flash blanco</label></p>', { ok: '💥 Aplicar' });
      const gi = document.getElementById('he-golpes'), fi = document.getElementById('he-fuerza'), fl = document.getElementById('he-flash');
      if (!(await ok)) return;
      const p = await probeVideo(c.core.urlOf(f));
      const info = await c.core.mediaInfo(c.core.absOf(f)).catch(() => null);
      await c.kit.generar(e, { video: { abs: c.core.absOf(f), fps: Math.round(p.fps || 32), secs: p.secs, hasAudio: !!info?.hasAudio },
        golpes: gi.value, fuerza: +fi.value || 1, flash: fl.checked }, `💥 Impactos · ${f.filename}`);
    } });
  // 🔁 Audio de otro video (27-oct, hueco 19): elige otro video de Recientes y su pista de audio va sobre este (montaje.audio, sin IA)
  ctx.addAction({ id: 'montaje.audio', label: '🔁 Usar el audio de otro video', title: 'Pon sobre este video la pista de audio de otro (p. ej. el borrador con sonido sobre el final)',
    when: f => f.kind === 'vid', run: async (f, c) => {
      const e = c.engines.engineById('montaje.audio'); if (!e) return;
      const me = c.core.absOf(f);
      const vids = (c.core.state.gallery || []).filter(g => g.kind === 'vid' && c.core.absOf(g) !== me).slice(0, 24);
      if (!vids.length) return c.kit.toast('No hay otros videos en Recientes.', 'err');
      let src = null;
      const ok = c.kit.confirmBox('🔁 Usar el audio de otro video', '<p>Elige el video que tiene el audio (se corta o rellena con silencio al largo de este).</p>'
        + '<div id="he-aud-pick" class="recent" style="max-height:300px;overflow:auto;margin:8px 0"></div><p id="he-aud-sel" class="muted">Ninguno elegido.</p>'
        + '<p style="margin-top:8px">Empezar el audio en el segundo <input id="he-aud-desde" type="number" min="0" step="0.1" value="0" style="width:70px"></p>', { ok: '🔁 Poner el audio' });
      const pick = document.getElementById('he-aud-pick'), selP = document.getElementById('he-aud-sel'), di = document.getElementById('he-aud-desde');
      vids.forEach(v => { const t = c.galleryTile(v, { onclick: () => {
        src = v; pick.querySelectorAll('.it').forEach(x => { x.style.outline = ''; }); t.style.outline = '2px solid var(--acc)'; selP.textContent = '✔ ' + v.filename;
      } }); pick.append(t); });
      if (!(await ok)) return;
      if (!src) return c.kit.toast('No elegiste ningún video.', 'err');
      const [info, from] = await Promise.all([c.core.mediaInfo(me), c.core.mediaInfo(c.core.absOf(src))]);
      if (!from.hasAudio) return c.kit.toast(`${src.filename} no tiene pista de audio.`, 'err', 8000);
      const p = info.fps ? info : await probeVideo(c.core.urlOf(f));
      await c.kit.generar(e, { video: { abs: me, fps: +(p.fps || 32).toFixed(3), secs: p.secs }, from: { abs: c.core.absOf(src) }, desde: Math.max(0, +di.value || 0) },
        `🔁 Audio de ${src.filename} · ${f.filename}`);
    } });
}

export default {
  id: 'storyboard', title: 'Storyboard', icon: '🎞️', order: 90,
  setup,   // app.js puede llamarlo al cargar
  render(root, ctx) { page = build(root, ctx); },
  receive(payload, ctx) { if (!page) return; page.receive(payload).catch(e => ctx.kit.toast(String(e), 'err')); },
};

function load(store) {
  const d = store.get(KEY, null) || {};
  const scenes = Array.from({ length: N }, (_, i) => ({ text: '', shot: 'auto', move: 'none', frame: null, video: null, ...((d.scenes || [])[i] || {}) }));
  return { refs: [0, 1, 2, 3].map(i => (d.refs || [])[i] || null), chain: d.chain !== false, ar: d.ar || '16:9', vq: d.vq || 'draft',
    secs: d.secs || 5, fade: d.fade ?? 8, final: d.final || null, hero: d.hero || null, scenes };
}
/** Copia ligera de un archivo (lo que hace falta para mostrarlo y volver a usarlo). */
const slim = f => f ? Object.fromEntries(Object.entries({ kind: f.kind, filename: f.filename, subfolder: f.subfolder || '', type: f.type || 'output',
  abs: f.abs, ref: f.ref, url: f.url, w: f.w, h: f.h }).filter(([, v]) => v != null)) : null;
const videoSize = url => new Promise(res => {
  const v = document.createElement('video'); const t = setTimeout(() => res(null), 5000);
  v.preload = 'metadata'; v.muted = true;
  v.onloadedmetadata = () => { clearTimeout(t); res(v.videoWidth ? { w: v.videoWidth, h: v.videoHeight } : null); };
  v.onerror = () => { clearTimeout(t); res(null); };
  v.src = url;
});

function build(root, ctx) {
  const { core, kit, engines } = ctx; const { h } = kit;
  if (!document.getElementById('sb-style')) document.head.append(h('style', { id: 'sb-style' }, CSS));
  const S = load(core.store);
  const st = Array.from({ length: N }, () => ({ frame: null, video: null }));   // transitorio: 'pend' | 'wait' | 'run' | 'err'
  const tracked = new Map();                                                      // job.id -> { i, kind }
  let batch = null;                                                               // lote de "Animar todo" (para unir al final)
  let ready = false;
  const save = () => core.store.set(KEY, S);
  const hasText = i => !!(S.scenes[i].text || '').trim();
  const phrase = (list, v) => (list.find(x => x[0] === v) || list[0])[3];

  /* ---------- 1. referencias ---------- */
  const slots = [0, 1, 2, 3].map(i => kit.slot({ kind: 'image', tag: `Ref ${i + 1}`,
    empty: i === 0 ? '👤 Personaje o producto<br><small>arrastra, pega (Ctrl+V) o haz clic</small>' : i === 3 ? '🎨 Estilo / lugar<br><small>opcional</small>' : `Referencia ${i + 1}<br><small>opcional</small>`,
    onChange: v => { S.refs[i] = slim(v); save(); update(); } }));
  kit.pasteInto(slots, () => ctx.isActive('storyboard'));
  // personaje con LoRA propia (🧬): con un motor caps.heroLora (Klein) cada cuadro sale desde su LoRA y sus fotos NO van de
  // referencia (se quedan en las casillas para los motores que no usan LoRA, p. ej. Qwen 2.1)
  let hero = null;
  const heroNote = h('div', { class: 'note' });
  const setHero = p => { hero = p && p.lora ? p : null; S.hero = hero ? hero.id : null; save(); update(); };
  const pj = personajes.picker({ value: S.hero, onPick: p => {
    if (!p) return setHero(null);
    const ph = (p.photos || []).slice(0, 4);
    slots.forEach((s, i) => s.set(ph[i] || null));
    kit.toast(`👤 ${p.name}: ${ph.length} foto(s) puestas como referencia.`, 'info', 4000);
    setHero(p);
  } });
  const syncHero = all => { hero = all.find(p => p.id === S.hero && p.lora) || null; update(); };   // borrado/editado en Biblioteca
  personajes.list().then(syncHero);
  core.on('personajes', syncHero);
  const refsNow = () => slots.map(s => s.value).filter(Boolean).map(v => ({ ref: v.ref, w: v.w, h: v.h }));
  // el personaje cuenta mientras alguna de sus fotos siga en las casillas (si las cambias por otro, se deja de usar su LoRA)
  const heroOn = () => !!hero && slots.some(s => s.value && (hero.photos || []).some(f => f.ref === s.value.ref));
  const heroOf = e => (heroOn() && e?.caps?.heroLora ? personajes.heroLora(hero) : null);
  /** Referencias para el motor e: sin las fotos del personaje si va con su LoRA. */
  const refsFor = e => {
    if (!heroOf(e)) return refsNow();
    const mine = new Set((hero.photos || []).map(f => f.ref));
    return refsNow().filter(r => !mine.has(r.ref));
  };

  /* ---------- 2. historia ---------- */
  const story = kit.promptBox({ key: 'storyboard.historia', rows: 4, ideas: IDEAS,
    placeholder: 'Cuenta tu historia (mejor en inglés). Cada oración o renglón será una escena; máximo 8.\nEj.: A knight finds a dragon egg in a cave. He carries it home through a storm. …' });
  const doSplit = () => {
    const parts = splitStory(story.value);
    if (!parts.length) return kit.toast('Primero escribe la historia (o usa una 💡 idea).', 'err');
    S.scenes.forEach((sc, i) => { sc.text = parts[i] || ''; sceneEls[i].ta.value = sc.text; });
    save(); update();
    kit.toast(`✂️ ${parts.length} escena(s) listas. Revisa el encuadre de cada una.`, 'info', 4000);
  };

  /* ---------- 3. escenas ---------- */
  let shown = Math.max(3, S.scenes.reduce((m, s, i) => (s.text || s.frame ? i + 1 : m), 0));
  const sceneEls = S.scenes.map((sc, i) => {
    const ta = h('textarea', { rows: 2, placeholder: i === 0 ? 'Escena 1: dónde estamos, quién aparece y qué pasa…' : `Escena ${i + 1}…` });
    ta.value = sc.text || '';
    ta.oninput = () => { S.scenes[i].text = ta.value; save(); update(); };
    const shot = kit.chips(SHOTS.map(([v, l, t]) => [v, l, t]), { value: sc.shot, onChange: v => { S.scenes[i].shot = v; save(); } });
    const move = kit.chips(MOVES.map(([v, l, t]) => [v, l, t]), { value: sc.move, onChange: v => { S.scenes[i].move = v; save(); } });
    const stat = h('span', {});
    // ✂️ al unir (27-oct, tráiler): usar solo un tramo del clip y acelerarlo (golpes de ~1 s) o ponerlo en cámara lenta
    const num = (key, ph, title) => { const x = h('input', { type: 'number', min: 0, step: 0.1, placeholder: ph, title, class: 'sb-num' });
      x.value = sc[key] ?? ''; x.oninput = () => { S.scenes[i][key] = x.value === '' ? undefined : Math.max(0, +x.value); save(); }; return x; };
    const speed = kit.chips([[1, '1×'], [1.5, '1.5×', 'Más rápido'], [2, '2×', 'El doble de rápido'], [0.5, '½×', 'Cámara lenta']],
      { value: sc.speed || 1, onChange: v => { S.scenes[i].speed = +v; save(); } });
    const cut = h('div', { class: 'sb-cut' }, '✂️ desde', num('from', '0', 'Segundo del clip donde empieza'), 's · dura', num('dur', 'todo', 'Segundos del clip a usar (vacío = hasta el final)'), 's', speed);
    const box = h('div', { class: 'sb-scene' }, h('div', { class: 'sb-sh' }, h('b', {}, String(i + 1)), stat), ta,
      h('div', { class: 'sb-lbl' }, '📷 Encuadre del cuadro'), shot, h('div', { class: 'sb-lbl' }, '🎥 Movimiento al animar'), move,
      h('div', { class: 'sb-lbl' }, '🎞️ Al unir la película'), cut);
    return { box, ta, shot, move, stat };
  });
  const moreBtn = h('button', { class: 'btn', onclick: () => { shown = Math.min(N, shown + 1); update(); sceneEls[shown - 1].ta.focus(); } }, '➕ Agregar escena');

  /* ---------- 4. cuadros ---------- */
  const menu = kit.engineMenu('storyboard', { filter: e => !e.caps?.internal, onChange: () => ready && update() });
  const frameEngine = () => { const e = menu.value; return e && !e.caps?.internal ? e : engines.engineById('storyboard.klein'); };
  const arChips = kit.chips([['16:9', '▭ 16:9 cine'], ['9:16', '▯ 9:16 vertical'], ['1:1', '◻ 1:1']],
    { value: S.ar, onChange: v => { S.ar = v; save(); update(); } });
  const chainChips = kit.chips([[true, '🔗 Encadenar', 'Cada cuadro mira el anterior: mismo lugar, luz y personajes (se hacen uno tras otro)'],
    [false, '🔀 Independientes', 'Cada cuadro solo usa tus referencias (se encolan todos de golpe)']],
  { value: S.chain, onChange: v => { S.chain = v === true || v === 'true'; save(); update(); } });
  const prevOf = i => (i > 0 && hasText(i - 1) && S.scenes[i - 1].frame) ? S.scenes[i - 1].frame : null;
  const sampleFrameO = () => ({ prompt: 'x', ar: S.ar, refs: refsFor(frameEngine()), prev: S.chain ? { ref: 'x' } : null });
  const frameEst = () => {
    const e = frameEngine(); if (!e) return '';
    const n = S.scenes.filter((_, i) => hasText(i)).length || 1, o = sampleFrameO();
    if (core.checkEngine(e, o).block) return kit.estimateText(e, o);
    return `${n} cuadro${n > 1 ? 's' : ''} · ${kit.estimateText(e, o)}${n > 1 ? ` cada uno · total ≈ ${core.fmt(core.estimate(e, o) * n)}` : ''}`;
  };
  const gen = kit.genButton('🎞️ Generar cuadros', () => genFrames('all'), frameEst);
  const genMissing = h('button', { class: 'go alt', onclick: () => genFrames('missing') }, '➕ Generar solo los que faltan');
  const strip = h('div', { class: 'sb-strip' });

  /* ---------- 5. animar ---------- */
  const videoEngine = () => engines.pickDefault('video', core.state.tier, core.state.installed);
  /** 🔤 Título ✨ metálico: {img, vid, imgO(texto, color), vidO(imagen, segundos)} o null si no hay motores que quepan. */
  function metalEngines() {
    const fits = (e, o) => e && !core.checkEngine(e, o).block;
    const imgO = (texto, color) => ({ prompt: metalTitlePrompt(texto, color), ar: S.ar, count: 1, enhance: false });
    const img = ['image.qwen21', 'image.zimage'].map(engines.engineById).find(e => fits(e, imgO('TITLE', '#4aa8ff')));
    const vid = videoEngine();
    const vidO = (start, secs) => ({ mode: 'i2v', prompts: [METAL_SHINE], secs: Math.max(2, Math.min(5, Math.round(secs))), quality: 'final', ar: S.ar, start, loras: [] });
    return img && fits(vid, vidO({ ref: 'x', w: 1344, h: 768 }, 3)) ? { img, vid, imgO, vidO } : null;
  }
  const vInfo = h('div', { class: 'note' });
  const VQ = [['draft', '⚡ Borrador 272p', 'Rápido, para revisar el ritmo'], ['final', '🎬 480p', 'Buena calidad en 8 GB'], ['hd720', '🚀 720p', 'High End: muy lento en tu PC']];
  const vqChips = kit.chips(VQ, { value: S.vq, onChange: v => { S.vq = v; save(); update(); } });
  const secsChips = kit.chips([[3, '3 s'], [5, '5 s']], { value: S.secs, onChange: v => { S.secs = +v; save(); update(); } });
  const fadeChips = kit.chips([[8, '🌫️ Fundido corto'], [0, '✂️ Corte seco']], { value: S.fade, onChange: v => { S.fade = +v; save(); } });
  const videoO = (i, start) => {
    const sc = S.scenes[i];
    const prompt = [String(sc.text || '').trim(), phrase(MOVES, sc.move)].filter(Boolean).join(' ');
    return { mode: 'i2v', prompts: [prompt], secs: S.secs, quality: S.vq, ar: S.ar, start };
  };
  const animEst = () => {
    const ve = videoEngine(); if (!ve) return '⏳ El motor de video aún no está disponible.';
    const n = S.scenes.filter((s, i) => hasText(i) && s.frame).length;
    const o = videoO(0, { ref: 'x', w: 1344, h: 768 });
    if (core.checkEngine(ve, o).block) return kit.estimateText(ve, o);
    if (!n) return 'Primero genera los cuadros. ' + kit.estimateText(ve, o) + ' por clip';
    const ce = engines.engineById('storyboard.concat');
    const tot = core.estimate(ve, o) * n + (ce && n > 1 ? core.estimate(ce, { videos: Array(n).fill({ secs: S.secs }) }) : 0);
    return `${n} clip${n > 1 ? 's' : ''} · ${kit.estimateText(ve, o)} cada uno · total con la unión ≈ ${core.fmt(tot)}`;
  };
  const anim = kit.genButton('🎬 Animar todo', () => animate(null), animEst);
  const joinBtn = h('button', { class: 'go alt', onclick: () => join(false) }, '🎞️ Unir los clips en una película');
  // 🔤 Tarjeta de título (27-oct, tráiler): clip de texto metálico sobre negro → entra como la siguiente escena
  const titleBtn = h('button', { class: 'btn', onclick: async () => {
    const e = engines.engineById('montaje.titulo'); if (!e) return;
    // ✨ Metálico (27-oct, hueco 21): logo con Qwen-Image (Z-Image si no cabe) y luego Wan le da el brillo. Dos trabajos seguidos:
    // en un solo grafo pedirían ~31 + 43 GB de RAM a la vez.
    const metal = metalEngines();
    const metalEst = metal ? core.fmt(core.estimate(metal.img, metal.imgO('TITLE', '#4aa8ff')) + core.estimate(metal.vid, metal.vidO({ ref: 'x', w: 1344, h: 768 }, 3))) : '';
    const ok = kit.confirmBox('🔤 Tarjeta de título', '<p>Texto (corto, en mayúsculas se ve mejor)</p><input id="he-tit" style="width:100%;padding:6px 8px" value="TITLE">'
      + '<p style="margin-top:8px">Dura <input id="he-tits" type="number" min="1" max="10" step="0.5" value="2.5" style="width:60px"> s · color <input id="he-titc" type="color" value="#4aa8ff"></p>'
      + '<p style="margin-top:8px">Estilo <select id="he-tite"><option value="plano">Plano (sin IA, segundos)</option>'
      + (metal ? `<option value="metal">✨ Metálico con IA (~${metalEst})</option>` : '') + '</select></p>', { ok: '🔤 Crear' });
    const ti = document.getElementById('he-tit'), ts = document.getElementById('he-tits'), tc = document.getElementById('he-titc'), te = document.getElementById('he-tite');
    if (!(await ok)) return;
    if (te.value === 'metal' && metal) {
      const toSb = (file, all) => { const v = (all || []).find(f => f.kind === 'vid') || file; if (v) ctx.goto('storyboard', { video: v }); };
      return kit.generar(metal.img, metal.imgO(ti.value, tc.value), `🔤 Título ✨ 1/2 (logo) · ${ti.value}`, { after: async out => {
        const img = await core.asInput({ ...out, kind: 'img' });
        await kit.generar(metal.vid, metal.vidO(img, +ts.value || 2.5), `🔤 Título ✨ 2/2 (brillo) · ${ti.value}`, { confirmed: true, after: toSb });
      } });
    }
    const first = S.scenes.find(s => s.video);
    const dim = first ? await videoSize(core.urlOf(first.video)) : null;
    const [w, h2] = dim ? [dim.w - (dim.w % 2), dim.h - (dim.h % 2)] : S.ar === '9:16' ? [720, 1280] : S.ar === '1:1' ? [960, 960] : [1280, 720];
    await kit.generar(e, { texto: ti.value, w, h: h2, secs: +ts.value || 2.5, fps: 32, color: tc.value }, `🔤 Título · ${ti.value}`,
      { after: (file, all) => { const v = (all || []).find(f => f.kind === 'vid') || file; if (v) ctx.goto('storyboard', { video: v }); } });
  } }, '🔤 Tarjeta de título');
  const finalBox = h('div', { class: 'sb-final' });

  /* ---------- seguimiento de trabajos ---------- */
  const busy = kind => [...tracked.values()].some(t => t.kind === kind);
  function sync() {
    let changed = false;
    for (const [id, t] of tracked) {
      const j = core.jobs.find(x => x.id === id); if (!j) continue;
      const cur = st[t.i][t.kind];
      if (j.status === 'wait' || j.status === 'run') { if (cur !== j.status) { st[t.i][t.kind] = j.status; changed = true; } }
      else if (j.status === 'err') {
        tracked.delete(id); st[t.i][t.kind] = 'err'; changed = true;
        if (t.kind === 'frame') st.forEach(s => { if (s.frame === 'pend') s.frame = null; });
        if (t.kind === 'video' && batch) { batch.failed = true; kit.toast(`El clip ${t.i + 1} falló. Rehazlo con 🎬 y luego pulsa "Unir los clips".`, 'err', 10000); }
      } else if (j.status === 'done') {
        tracked.delete(id);
        if (!(j.outputs || []).length) { st[t.i][t.kind] = 'err'; changed = true; }
      }
    }
    if (changed) draw();
  }
  core.on('queue', sync);
  core.on('progress', sync);
  core.on('done', sync);

  /* ---------- generar cuadros ---------- */
  async function runFrame(i, { engine, refs, heroL = null, chain, confirmed = false, then } = {}) {
    const sc = S.scenes[i];
    const p = chain ? prevOf(i) : null;
    const o = { prompt: String(sc.text || '').trim(), camera: phrase(SHOTS, sc.shot), ar: S.ar, refs, prev: p ? await core.asInput(p) : null };
    if (heroL) o.heroLora = heroL;   // el grafo agrega la LoRA y antepone "palabra clave, clase," a la escena
    st[i].frame = 'wait'; draw();
    const job = await kit.generar(engine, o, `Storyboard · cuadro ${i + 1}`, {
      confirmed,
      after: async (file, all) => {
        const img = (all || []).find(f => f.kind === 'img') || file;
        S.scenes[i].frame = slim(img); S.scenes[i].video = null; save();
        st[i].frame = null; draw();
        if (then) await then(img);
      },
    });
    if (!job) { st[i].frame = null; draw(); return null; }
    tracked.set(job.id, { i, kind: 'frame' });
    return job;
  }
  async function genFrames(mode) {
    const e = frameEngine();
    const all = S.scenes.map((_, i) => i).filter(hasText);
    const idxs = mode === 'missing' ? all.filter(i => !S.scenes[i].frame) : all;
    if (!all.length) return kit.toast('Escribe al menos una escena (o usa ✂️ Dividir en escenas).', 'err');
    if (!idxs.length) return kit.toast('Todos los cuadros ya están listos. Usa 🔁 para rehacer uno.');
    if (busy('frame')) return kit.toast('Ya hay cuadros en proceso; espera a que terminen.', 'err');
    const refs = refsFor(e), heroL = heroOf(e);   // fijos para todo el lote (aunque cambies el personaje a medio encadenado)
    if (!refs.length && !heroL && !core.store.get('sb.norefs', false)) {
      core.store.set('sb.norefs', true);
      kit.toast('Tip: con una foto de tu personaje en "Referencias" todos los cuadros se ven como la misma persona.', 'info', 7000);
    }
    const chain = S.chain && !!e?.caps?.chain;
    if (chain) {
      // uno tras otro: cada cuadro espera al anterior para usarlo como continuidad
      idxs.forEach(i => { st[i].frame = 'pend'; }); draw();
      const step = async (k, confirmed) => {
        if (k >= idxs.length) return;
        const job = await runFrame(idxs[k], { engine: e, refs, heroL, chain, confirmed, then: () => step(k + 1, true) });
        if (!job) { idxs.slice(k).forEach(i => { if (st[i].frame === 'pend') st[i].frame = null; }); draw(); }
      };
      await step(0, false);
    } else {
      for (let k = 0; k < idxs.length; k++) {
        const job = await runFrame(idxs[k], { engine: e, refs, heroL, chain: false, confirmed: k > 0 });
        if (!job && k === 0) return;
      }
    }
  }
  async function redoFrame(i) {
    if (!hasText(i)) return kit.toast(`La escena ${i + 1} está vacía.`, 'err');
    if (st[i].frame === 'wait' || st[i].frame === 'run' || st[i].frame === 'pend') return kit.toast('Ese cuadro ya está en proceso.');
    const e = frameEngine();
    await runFrame(i, { engine: e, refs: refsFor(e), heroL: heroOf(e), chain: S.chain && !!e?.caps?.chain });
  }

  /* ---------- animar y unir ---------- */
  async function animate(only) {
    const ve = videoEngine();
    if (!ve) return kit.toast('Todavía no hay un motor de video disponible.', 'err');
    const idxs = (only || S.scenes.map((_, i) => i)).filter(i => hasText(i) && S.scenes[i].frame);
    if (!idxs.length) return kit.toast('Primero genera los cuadros (paso 4).', 'err');
    if (idxs.some(i => st[i].video === 'wait' || st[i].video === 'run')) return kit.toast('Ya hay clips en proceso; espera a que terminen.', 'err');
    const auto = !only;                                  // "Animar todo" une al final
    if (auto) batch = { queued: [], fresh: new Set(), failed: false, joined: false };
    let first = true;
    for (const i of idxs) {
      const start = await core.asInput(S.scenes[i].frame);
      st[i].video = 'wait'; draw();
      const job = await kit.generar(ve, videoO(i, start), `Storyboard · clip ${i + 1}`, {
        confirmed: !first,
        after: (file, all) => {
          const v = (all || []).find(f => f.kind === 'vid') || file;
          S.scenes[i].video = slim(v); save();
          st[i].video = null; draw();
          if (auto && batch) { batch.fresh.add(i); maybeJoin(); }
        },
      });
      if (!job) { st[i].video = null; draw(); if (first) { if (auto) batch = null; return; } continue; }
      first = false;
      tracked.set(job.id, { i, kind: 'video' });
      if (auto && batch) batch.queued.push(i);
    }
  }
  function maybeJoin() {
    if (!batch || batch.joined || batch.failed) return;
    if (batch.queued.length && batch.queued.every(i => batch.fresh.has(i))) { batch.joined = true; join(true); }
  }
  async function join(confirmed) {
    const ce = engines.engineById('storyboard.concat');
    const list = S.scenes.filter((s, i) => hasText(i) && s.video);
    if (list.length < 2) return kit.toast(list.length ? 'Solo hay 1 clip: no hay nada que unir 🙂' : 'Primero anima los cuadros (🎬 Animar todo).', list.length ? 'info' : 'err');
    const videos = list.map(s => ({ abs: core.absOf(s.video), secs: s.dur || S.secs, from: s.from || 0, dur: s.dur || 0, speed: s.speed || 1 }));
    if (videos.some(v => !/^([a-z]:[\\/]|\\\\|\/)/i.test(v.abs))) return kit.toast('No encuentro la carpeta de salida de ComfyUI; recarga la página e intenta de nuevo.', 'err');
    const dim = await videoSize(core.urlOf(list[0].video));
    const o = { videos, ar: S.ar, quality: S.vq, fps: 32, fade: S.fade };
    if (dim) { o.w = dim.w - (dim.w % 2); o.h = dim.h - (dim.h % 2); }
    // 28-oct: aviso de caras. Un clip que hay que agrandar más de 2× o recortar a otra forma (272p, 16:9 → 9:16) deforma la cara
    if (dim) (await Promise.all(list.map(s => videoSize(core.urlOf(s.video))))).forEach((d, k) => {
      if (!d) return; const big = Math.max(dim.w / d.w, dim.h / d.h), crop = Math.abs(d.w / d.h - dim.w / dim.h) / (dim.w / dim.h);
      if (big > 2 || crop > 0.15) kit.toast(tr('⚠️ Clip ') + (S.scenes.indexOf(list[k]) + 1) + tr(': se agranda o se recorta mucho para la película; la cara puede salir deformada. Mejor hazlo en esta forma y en Final desde el inicio.'), 'info', 12000);
    });
    const job = await kit.generar(ce, o, 'Storyboard · película', {
      confirmed,
      after: (file, all) => { const v = (all || []).find(f => f.kind === 'vid') || file; S.final = slim(v); save(); drawFinal(); },
    });
    if (job) kit.toast(`🎞️ Uniendo ${videos.length} clips en una película…`, 'info', 4000);
  }

  /* ---------- dibujo ---------- */
  const STAT = { pend: '⏳ esperando al anterior', wait: '⏳ en cola', run: '✨ creando…', err: '✕ falló' };
  function drawStrip() {
    strip.style.setProperty('--sb-ar', S.ar === '9:16' ? '9/16' : S.ar === '1:1' ? '1/1' : '16/9');
    strip.innerHTML = '';
    for (let i = 0; i < N; i++) {
      const sc = S.scenes[i], s = st[i];
      const media = sc.frame
        ? ctx.galleryTile(sc.frame, { onclick: () => ctx.show(sc.video || sc.frame) })
        : h('div', { class: 'sb-empty' }, hasText(i) ? 'Sin cuadro todavía' : '—');
      const busyTxt = STAT[s.video] ? '🎬 ' + STAT[s.video] : STAT[s.frame];
      const isErr = s.frame === 'err' || s.video === 'err';
      strip.append(h('div', { class: 'sb-cell' },
        h('span', { class: 'sb-n' }, String(i + 1)),
        sc.video ? h('span', { class: 'sb-v', title: 'Ya tiene clip animado' }, '🎬') : null,
        media,
        busyTxt ? h('div', { class: 'sb-ov' + (isErr ? ' err' : '') }, busyTxt) : null,
        h('div', { class: 'sb-act' },
          h('button', { class: 'btn sm', title: 'Rehacer este cuadro', disabled: !hasText(i), onclick: () => redoFrame(i) }, '🔁'),
          h('button', { class: 'btn sm', title: 'Animar solo este cuadro', disabled: !sc.frame, onclick: () => animate([i]) }, '🎬'),
          sc.video ? h('button', { class: 'btn sm', title: 'Ver el clip', onclick: () => ctx.show(sc.video) }, '▶') : null)));
    }
  }
  function drawFinal() {
    finalBox.innerHTML = '';
    if (!S.final) return;
    finalBox.append(h('div', { class: 'sb-lbl' }, '🍿 Tu película'),
      h('video', { src: core.urlOf(S.final), controls: true, playsinline: true, preload: 'metadata' }),
      h('div', { class: 'sb-tools' }, h('button', { class: 'btn', onclick: () => ctx.show(S.final) }, '▶ Ver en el visor'),
        h('button', { class: 'btn', onclick: () => ctx.goto('mejorar', { file: S.final }) }, '✨ Mejorar a HD'),
        h('button', { class: 'btn', onclick: () => ctx.goto('audio', { file: S.final }) }, '🔊 Ponerle sonido')));
  }
  function draw() {
    if (!ready) return;
    sceneEls.forEach((el, i) => {
      const sc = S.scenes[i], s = st[i];
      el.stat.textContent = STAT[s.frame] || (s.video && STAT[s.video] ? '🎬 ' + STAT[s.video] : '') ||
        (sc.video ? '🎬 clip listo' : sc.frame ? '✓ cuadro listo' : hasText(i) ? '' : 'vacía');
    });
    drawStrip();
    const missing = S.scenes.some((s, i) => hasText(i) && !s.frame), anyFrame = S.scenes.some((s, i) => hasText(i) && s.frame);
    genMissing.classList.toggle('hide', !(missing && anyFrame));
    joinBtn.classList.toggle('hide', S.scenes.filter((s, i) => hasText(i) && s.video).length < 2);
  }
  function update() {
    if (!ready) return;
    sceneEls.forEach((el, i) => el.box.classList.toggle('hide', i >= shown));
    moreBtn.classList.toggle('hide', shown >= N);
    const ve = videoEngine();
    const t = ve ? engines.TIER_INFO[ve.tier] : null;
    vInfo.textContent = ve ? `Motor de video: ${ve.name} (${t ? t.icon + ' ' + t.label : ve.tier}) · lo elige el switch de poder; cámbialo en la página Video.`
      : 'El motor de video todavía no está listo (se están instalando las herramientas de video).';
    // caps.qualities del motor de video: ['draft', …] o [['draft','Borrador 272p','…'], …]
    const qs = Array.isArray(ve?.caps?.qualities) ? ve.caps.qualities.map(q => (Array.isArray(q) ? q[0] : q)) : VQ.map(q => q[0]);
    vqChips.setOptions(VQ.map(([v, l, ti]) => [v, l, ti, !qs.includes(v)]));
    if (!qs.includes(S.vq) && qs.length) { S.vq = VQ.find(q => qs.includes(q[0]))?.[0] || qs[0]; vqChips.value = S.vq; save(); }
    const ds = Array.isArray(ve?.caps?.durations) ? ve.caps.durations : [3, 5];
    secsChips.setOptions([3, 5].map(v => [v, v + ' s', '', !ds.includes(v)]));
    if (!ds.includes(S.secs) && ds.some(d => d <= 5)) { S.secs = Math.max(...ds.filter(d => d <= 5)); secsChips.value = S.secs; save(); }
    const fe = frameEngine();
    heroNote.innerHTML = !heroOn() ? ''
      : personajes.loraMissing(hero) ? `⚠️ No encuentro la LoRA de <b>${core.esc(hero.name)}</b> (${core.esc(hero.lora.file)}): los cuadros usan sus fotos.`
      : heroOf(fe) ? `🧬 <b>${core.esc(hero.name)}</b> sale en cada cuadro desde su LoRA (la palabra clave "${core.esc(hero.lora.trigger)}" se agrega sola): describe solo la escena. Sus fotos no se usan como referencia.`
      : `🧬 <b>${core.esc(hero.name)}</b> tiene LoRA propia, pero <b>${core.esc(fe?.name || '')}</b> no la usa: con este motor se copian sus fotos. Elige FLUX.2 Klein en el paso 4 para usar su LoRA.`;
    heroNote.classList.toggle('hide', !heroOn());
    if (heroOn()) heroNote.append(' ', h('button', { class: 'btn sm', title: 'Dejar de usar su LoRA (las fotos siguen en las casillas)',
      onclick: () => { const s = pj.querySelector('select'); if (s) s.value = ''; setHero(null); } }, 'Quitar LoRA'));
    gen.update(); anim.update();
    draw();
  }

  /* ---------- armado ---------- */
  const newBtn = h('button', { class: 'btn sm', onclick: async () => {
    if (busy('frame') || busy('video')) return kit.toast('Espera a que terminen los trabajos en proceso.', 'err');
    const ok = await kit.confirmBox('¿Empezar un storyboard nuevo?', '<p>Se vacían las escenas y los cuadros de esta página. Tus imágenes y videos siguen en la Biblioteca.</p>', { ok: 'Sí, empezar de nuevo' });
    if (!ok) return;
    S.scenes.forEach((sc, i) => { Object.assign(sc, { text: '', shot: 'auto', move: 'none', frame: null, video: null }); sceneEls[i].ta.value = ''; sceneEls[i].shot.value = 'auto'; sceneEls[i].move.value = 'none'; });
    S.final = null; story.value = ''; shown = 3; batch = null; st.forEach(s => { s.frame = null; s.video = null; });
    save(); drawFinal(); update();
  } }, '🗑️ Empezar de nuevo');

  root.append(
    h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('h1', {}, '🎞️ Storyboard'), newBtn),
    h('p', { class: 'sub' }, 'Tus referencias + tu historia → hasta 8 cuadros con los mismos personajes. Rehaz los que no te gusten y anima todo en una sola película.'),
    kit.step(1, 'Referencias', '(hasta 4: personaje, producto, estilo)'),
    h('div', { class: 'sb-refs' }, slots),
    h('div', { class: 'sb-tools' }, pj, h('button', { class: 'btn sm', title: 'Guarda estas fotos como Personaje para usarlo en otras páginas', onclick: () => personajes.saveFromPhotos(slots.map(s => s.value)) }, '💾 Guardar como personaje')),
    heroNote,
    kit.step(2, 'Historia', '(opcional: la divido en escenas por ti)'),
    story,
    h('div', { class: 'sb-tools' }, h('button', { class: 'btn acc', onclick: doSplit }, '✂️ Dividir en escenas')),
    kit.step(3, 'Escenas', '(una por cuadro; escribe qué pasa y elige el encuadre)'),
    h('div', { class: 'sb-scenes' }, sceneEls.map(x => x.box)),
    h('div', { class: 'sb-tools' }, moreBtn),
    kit.step(4, 'Cuadros'),
    menu,
    h('div', { class: 'row' }, arChips, chainChips),
    gen, genMissing,
    h('div', { class: 'sb-lbl', style: { marginTop: '14px' } }, '🎞️ Tira del storyboard · clic para ver · arrastra un cuadro a cualquier casilla'),
    strip,
    h('div', { class: 'sb-sec' }, kit.step(5, 'Animar y unir', '(un clip por cuadro → una película)')),
    vInfo,
    h('div', { class: 'sb-lbl' }, 'Calidad'), vqChips,
    h('div', { class: 'sb-lbl' }, 'Duración de cada clip'), secsChips,
    h('div', { class: 'sb-lbl' }, 'Entre escenas'), fadeChips,
    anim, h('div', { class: 'row', style: { marginTop: '8px', gap: '8px' } }, titleBtn), joinBtn, finalBox,
  );
  ready = true;
  S.refs.forEach((f, i) => { if (f) slots[i].set(f); });
  core.on('tier', update);
  core.on('models', update);
  core.on('loras', update);
  drawFinal(); update();

  setup(ctx);

  return {
    async receive(p) {
      if (!p) return;
      if (p.prompt) { story.value = p.prompt; doSplit(); }
      if (p.video) {   // 🎞️ Al Storyboard desde un video: entra como clip de la siguiente escena libre (para unir tomas hechas en otras páginas)
        let i = S.scenes.findIndex(s => !s.video && !(s.text || '').trim());
        if (i < 0) i = N - 1;
        const sc = S.scenes[i];
        sc.video = slim(p.video); if (!(sc.text || '').trim()) sc.text = `🎬 ${p.video.filename}`;
        sceneEls[i].ta.value = sc.text; shown = Math.max(shown, i + 1); save(); update(); draw();
        kit.toast(`🎞️ Clip en la escena ${i + 1}. Recórtalo o acelera con ✂️ y luego "Unir los clips".`, 'info', 4500);
      }
      const files = [...(Array.isArray(p.files) ? p.files : []), p.file || p.start || p.image].filter(f => f && f.kind !== 'vid' && f.kind !== 'aud');
      for (const f of files) {
        const target = slots.find(s => !s.value) || slots[slots.length - 1];
        await target.set(f.ref ? f : await core.asInput(f));
      }
      if (files.length) kit.toast(`🖼️ ${files.length > 1 ? files.length + ' imágenes agregadas' : 'Imagen agregada'} como referencia del storyboard.`, 'info', 3500);
      if (p.pj) {   // desde Biblioteca: ese personaje queda elegido (y su LoRA 🧬, si tiene)
        const x = (await personajes.list()).find(q => q.id === p.pj);
        if (x) { const s = pj.querySelector('select'); if (s) s.value = x.id; setHero(x); }
      }
    },
  };
}
