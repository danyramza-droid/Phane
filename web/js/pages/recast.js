// Página "🎭 Recast" (estilo Recast/Genjutsu): tu personaje copia el movimiento de un video (Wan Animate 2).
import * as personajes from '../personajes.js';
import { RECAST_FPS } from '../graphs/recast.js';
import { probeVideo } from './mejorar.js';
import * as enhance from '../enhance_ui.js';

const IDEAS = [
  ['Mismo look', 'Character appearance description: the person from the reference image, same face, same hairstyle, same outfit.\nBackground description: a clean, softly lit photo studio.'],
  ['Calle neón', 'Character appearance description: the character from the reference image, same face and outfit.\nBackground description: a rainy neon-lit city street at night, wet asphalt reflecting purple and blue signs, light mist.'],
  ['Escenario', 'Character appearance description: the character from the reference image, same face and outfit.\nBackground description: a big concert stage with colorful spotlights, haze and a cheering crowd.'],
  ['Azotea', 'Character appearance description: the character from the reference image, same face and outfit.\nBackground description: a rooftop at golden hour over a big city skyline.'],
  ['Anime', 'Character appearance description: the character from the reference image as a 2D anime character, clean cel shading, same hair and outfit.\nBackground description: a colorful anime city street at sunset.'],
  ['Figura de acción', 'Character appearance description: the character from the reference image as a premium collectible action figure, matte vinyl, subtle articulated joints, same outfit.\nBackground description: a miniature diorama city street, shallow depth of field.'],
];
const QUALITY = { draft: ['draft', '⚡ Borrador 272p', 'Para probar rápido'], final: ['final', '🎬 480p'], hd: ['hd', '💎 720p', 'Mucho más lento en tu PC'] };

let ui = null;

function registerActions(ctx) {
  ctx.addAction({ id: 'recast.use', label: '🎭 Usar en Recast', title: 'Imagen = personaje · Video = movimiento a copiar',
    first: f => f.kind === 'vid' && /kimodo/i.test(f.subfolder || ''),   // maniquí de 🕺 Movimiento: el siguiente paso es Recast
    when: f => f.kind === 'img' || f.kind === 'vid', run: f => ctx.goto('recast', { file: f }) });
}
// Las acciones deben existir aunque esta página no se haya abierto todavía (app.js renderiza las páginas al visitarlas).
(function boot(n = 0) { const c = globalThis.HE?.ctx; if (c) registerActions(c); else if (n < 60) setTimeout(() => boot(n + 1), 500); })();

export default {
  id: 'recast', title: 'Recast', icon: '🎭', order: 60,
  setup: registerActions,   // app.js puede llamarlo al cargar (acciones del visor sin visitar la página)
  render(root, ctx) {
    const { kit, core } = ctx; const { h } = kit;
    registerActions(ctx);
    root.append(h('style', {}, `
      .pg[data-id="recast"] .rc-in{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-top:8px}
      .pg[data-id="recast"] .rc-info{font-size:12.5px;color:var(--mute);margin-top:6px;min-height:1em}
      .pg[data-id="recast"] .rc-start{width:80px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:4px 8px}`));

    let vinfo = null, gen = null, quality = null, dur = null;
    const upd = () => { syncInfo(); gen && gen.update(); };
    // El sondeo del navegador falla con algunos formatos (.avi, .mkv…): sin duración se pedían más cuadros de los que hay
    // y el tramo 2 tronaba. Se completa con ffmpeg (core.mediaInfo); de paso se sabe si el video trae audio.
    async function probe(v) {
      let p = (await probeVideo(v.url, { fps: false })) || {};
      if (!p.secs || !p.w) {
        const abs = v.abs || core.inputAbs(v);
        const m = v.secs && v.w ? v : (abs ? await core.mediaInfo(abs) : {});
        p = { ...p, secs: p.secs || m.secs || 0, w: p.w || m.w || 0, h: p.h || m.h || 0 };
        if (v.hasAudio === undefined && m.hasAudio !== undefined) v.hasAudio = m.hasAudio;
      }
      return p;
    }

    const charSlot = kit.slot({ kind: 'image', tag: 'Personaje', onChange: upd,
      empty: '🧍 <b>Foto de tu personaje</b><br><small>Si el video es de cuerpo completo, usa una foto de cuerpo completo</small>' });
    let autoTxt = '';   // ensayo 27-oct: con un Personaje elegido, su descripción llena "Cómo se ve" (si no escribiste otra cosa)
    const pj = personajes.picker({ onPick: p => {
      const ph = p?.photos?.[0]; if (ph) charSlot.set(ph);
      if (p?.desc && (!prompt.value || prompt.value === autoTxt)) {
        autoTxt = `Character appearance description: ${p.desc.replace(/\.\s*$/, '')}.
Background description: a clean, softly lit photo studio.`;
        prompt.value = autoTxt; autoTxt = prompt.value;
      }
    } });
    const vidSlot = kit.slot({ kind: 'video', tag: 'Movimiento', empty: '🎬 <b>Video con el movimiento</b><br><small>Baile, gesto, actuación… súbelo o arrástralo de Recientes</small>',
      onChange: async v => {
        vinfo = null; upd();
        if (!v) return;
        const p = await probe(v);
        if (vidSlot.value === v) { vinfo = p; upd(); }
      } });
    kit.pasteInto([charSlot], () => ctx.isActive('recast'));
    const vInfo = h('div', { class: 'rc-info' });

    const mode = kit.chips([
      ['move', '🕺 Copiar movimiento', 'Tu personaje hace los movimientos del video, en el fondo que describas'],
      ['replace', '🔁 Reemplazar persona (beta)', 'Tu personaje aparece dentro del video original, encima de la persona'],
    ], { key: 'recast.mode', onChange: upd });
    const modeNote = h('div', { class: 'note' });

    const prompt = kit.promptBox({ key: 'recast', ideas: IDEAS, rows: 3,
      placeholder: 'Cómo se ve tu personaje y dónde está (mejor en inglés, sin describir el movimiento). Ej.: "a young woman with pink hair and a white jacket" + el fondo' });
    enhance.attach(prompt, 'image');   // ✍️ describe al personaje y el fondo
    const motion = h('input', { type: 'text', class: 'rc-in', placeholder: 'Qué movimiento es (opcional, en inglés): ej. "a person dancing hip hop", "a man waving and talking"' });
    motion.value = core.store.get('recast.motion', '');
    motion.oninput = () => core.store.set('recast.motion', motion.value);
    // 🔁 Reemplazar (27-oct): a quién borrar del video original (SAM). "person" agarraba también al orco / al otro actor.
    const target = h('input', { type: 'text', class: 'rc-in', placeholder: 'A quién reemplazo (en inglés): ej. "woman with a sword", "man in a red shirt". Vacío = cualquier persona' });
    target.value = core.store.get('recast.target', '');
    target.oninput = () => core.store.set('recast.target', target.value);

    dur = kit.chips([[5, '5 s'], [10, '10 s'], [15, '15 s'], [0, 'Todo lo que se pueda']], { key: 'recast.secs', value: 5, onChange: upd });
    const start = h('input', { type: 'number', class: 'rc-start', min: 0, step: 0.5, value: 0 });
    start.oninput = upd;
    quality = kit.chips([QUALITY.draft, QUALITY.final], { key: 'recast.quality', value: 'final', onChange: upd });   // 29-oct: 480p por defecto

    const eng = kit.engineMenu('recast', { onChange: e => { syncCaps(e); upd(); } });

    function syncCaps(e) {
      if (!quality || !dur) return;
      const caps = e?.caps || {};
      quality.setOptions((caps.qualities || ['draft', 'final']).map(q => QUALITY[q]));
      const max = caps.maxSecs || 10;
      dur.setOptions([5, 10, 15].map(s => [s, `${s} s`, s > max ? `Este motor llega hasta ${max} s` : '', s > max]).concat([[0, `Todo (hasta ${max} s)`]]));
    }
    syncCaps(eng.value);

    function secsPlan() {
      const max = eng.value?.caps?.maxSecs || 10;
      const want = +dur.value || max;
      const st = Math.max(0, +start.value || 0);
      const avail = vinfo?.secs ? Math.max(0, vinfo.secs - st) : Math.min(want, 5);   // largo desconocido: un solo tramo (seguro)
      return { st, secs: Math.max(0.5, Math.min(want, max, avail)), max };
    }
    function opts() {
      const c = charSlot.value, v = vidSlot.value;
      const { st, secs } = secsPlan();
      return {
        character: c ? { ref: c.ref, w: c.w, h: c.h } : null,
        video: v ? { abs: v.abs || core.inputAbs(v), fps: RECAST_FPS, frames: Math.max(5, Math.floor(secs * RECAST_FPS) - 1), w: vinfo?.w, h: vinfo?.h, hasAudio: v.hasAudio } : { frames: Math.floor(secs * RECAST_FPS) },
        skip: Math.round(st * RECAST_FPS), mode: mode.value, prompt: prompt.value, motion: motion.value.trim(), quality: quality.value,
        ...(mode.value === 'replace' && target.value.trim() && { target: target.value.trim() }),
      };
    }
    function syncInfo() {
      target.classList.toggle('hide', mode.value !== 'replace');
      modeNote.innerHTML = mode.value === 'replace'
        ? '🔁 <b>Beta:</b> se crea tu personaje con el mismo movimiento y se pega encima de la persona del video original, que se borra (escribe abajo a quién si hay más de una persona).'
        : '🕺 El fondo sale del texto que escribas (no del video). Describe cómo se ve tu personaje y el lugar; el movimiento lo pone el video.';
      if (!vidSlot.value) { vInfo.textContent = ''; return; }
      if (!vinfo) { vInfo.textContent = 'Leyendo el video…'; return; }
      const { st, secs, max } = secsPlan();
      if (!vinfo.secs) { vInfo.textContent = `⏱ No pude leer la duración: se usarán hasta ${secs.toFixed(1)} s desde el segundo ${st}`; return; }
      if (st > vinfo.secs - 0.5) { vInfo.textContent = `⏱ ${vinfo.secs.toFixed(1)} s · el segundo ${st} está después del final del video`; return; }
      const long = vinfo.secs - st > max + 0.05;
      vInfo.textContent = `⏱ ${vinfo.secs.toFixed(1)} s · ${vinfo.w}×${vinfo.h} → se usarán ${secs.toFixed(1)} s desde el segundo ${st}` +
        (long ? ` (este motor llega hasta ${max} s; usa "Empezar en" para elegir otra parte)` : '');
    }

    gen = kit.genButton('🎭 Crear Recast', async () => {
      if (!charSlot.value) return kit.toast('Pon la foto de tu personaje (paso 1).', 'err');
      if (!vidSlot.value) return kit.toast('Pon el video con el movimiento (paso 2).', 'err');
      if (!vinfo?.secs) vinfo = await probe(vidSlot.value);
      const { st } = secsPlan();
      if (vinfo?.secs && st > vinfo.secs - 0.5) return kit.toast(`El video dura ${vinfo.secs.toFixed(1)} s: elige un segundo de inicio menor.`, 'err');
      const vs = vidSlot.value;   // ¿trae pista de audio? (para conservar la música/voz original en el resultado)
      if (vs.hasAudio === undefined && (vs.abs || core.inputAbs(vs))) vs.hasAudio = (await core.mediaInfo(vs.abs || core.inputAbs(vs)))?.hasAudio;
      const o = opts();
      if (!o.video.abs) return kit.toast('No encuentro la ruta del video; vuelve a subirlo.', 'err');
      await kit.generar(eng.value, o, `🎭 Recast ${mode.value === 'replace' ? '(reemplazo) ' : ''}· ${secsPlan().secs.toFixed(0)} s`);
    }, () => kit.estimateText(eng.value, opts()));

    root.append(
      h('h1', {}, '🎭 Recast'),
      h('p', { class: 'sub' }, 'Tu personaje copia el movimiento de cualquier video: bailes, gestos, actuaciones. Sin esqueletos ni pasos raros.'),
      kit.step(1, 'Tu personaje'), pj, charSlot,
      kit.step(2, 'Video con el movimiento'), vidSlot, vInfo,
      h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'engine-lbl' }, 'Empezar en el segundo'), start),
      kit.step(3, 'Modo'), mode, modeNote, target,
      kit.step(4, 'Cómo se ve', 'apariencia y fondo, no el movimiento'), prompt, motion,
      kit.step(5, 'Duración y calidad'), dur, h('div', { style: { height: '8px' } }), quality,
      kit.step(6, 'Motor'), eng,
      gen);
    ui = { charSlot, vidSlot };
    upd();
  },
  async receive(p, ctx) {
    if (!ui) return;
    const f = p.file || p.character || p.video;
    if (!f) return;
    const isVid = f.kind === 'vid' || (!f.kind && /\.(mp4|webm|mov|mkv|gif)$/i.test(f.filename || ''));
    if (f.kind === 'aud') return ctx.kit.toast('Recast usa una imagen (personaje) o un video (movimiento).', 'err');
    const inp = f.ref ? f : await ctx.core.asInput(f);
    if (isVid || p.video) await ui.vidSlot.set(inp); else await ui.charSlot.set(inp);
    ctx.kit.toast(isVid ? '🎬 Video listo como movimiento. Ahora elige a tu personaje.' : '🧍 Imagen lista como personaje. Ahora pon el video con el movimiento.', 'info', 4000);
  },
};
