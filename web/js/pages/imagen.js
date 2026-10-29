// Página 'Imagen' (estilo Soul): idea + estilo + paleta + personaje/referencias + formato + motor.
import * as personajes from '../personajes.js';
import { STYLES, PALETTES } from '../data/styles.js';
import { REF_FALLBACK } from '../graphs/image.js';
import { isSkeleton, maniquiView } from '../graphs/pose.js';
import * as enhance from '../enhance_ui.js';

const ID = 'imagen';
const POSE_ENGINE = 'image.pose';    // pose exacta: SDPose + Z-Image ControlNet → diseño con Qwen 2.1 (graphs/pose.js)
// pose con maniquí 3D (Kimodo → 🧍 Maniquí de este cuadro): Qwen 2.1 + LoRA VNCCS (calidad casi estudios en la nube) o 2511 + AnyPose (comercial)
const MANIQUI_ENGINE = 'image.pose_maniqui', MANIQUI_COMERCIAL = 'image.pose_anypose', MANIQUI_LIGERO = 'image.pose_klein';
const isManiqui = f => !!f && /maniqui|mannequin/i.test(String(f.ref || f.filename || ''));
const VIEW_NAME = { side: 'de perfil', back: 'de espaldas' };
const IDEAS = [
  ['Retrato', 'Close-up portrait of a young woman with freckles next to a window, soft natural light, shallow depth of field'],
  ['Producto', 'A perfume bottle on wet black stone with water droplets, dramatic rim light, luxury advertising photo'],
  ['Paisaje', 'Misty mountain lake at sunrise with a wooden boat, golden light, epic landscape photography'],
  ['Comida', 'Overhead shot of tacos al pastor on a rustic wooden table, fresh cilantro and lime, food photography'],
  ['Moda', 'Fashion editorial photo of an elderly man with a white beard in a yellow raincoat on a foggy pier'],
  ['Fantasía', 'A giant glowing jellyfish floating over a neon city at night, cinematic, highly detailed'],
  ['Póster', 'Minimalist movie poster with the title "HIGH END" in bold white letters, astronaut silhouette against a huge red sun'],
  ['Mascota', 'A golden retriever puppy wearing tiny sunglasses at the beach, sunny and playful, 50mm photo'],
];

let P = null;          // estado de la página (para receive)
let inited = false;

/** Acciones del visor de resultados (se registran una sola vez). */
function init(ctx) {
  if (inited) return;
  inited = true;
  ctx.addAction({ id: 'imagen.editar', label: '🪄 Editar esta imagen', title: 'Abrir en Editar', when: f => f.kind === 'img',
    run: (f, c) => c.goto('editar', { file: f }) });
  ctx.addAction({ id: 'imagen.ref', label: '👤 Usar de referencia', title: 'Ponerla como foto de referencia en Imagen', when: f => f.kind === 'img',
    run: (f, c) => c.goto('imagen', { file: f }) });
  ctx.addAction({ id: 'imagen.pose', label: '🧍 Copiar su pose', title: 'Usar la POSE de esta imagen en Imagen (pose exacta con tu personaje)', when: f => f.kind === 'img',
    run: (f, c) => c.goto('imagen', { pose: f }) });
  // foto o cuadro de video → maniquí 3D (SAM 3D Body). Luego 🧍 Copiar su pose sobre el maniquí = pose con calidad Qwen 2.1
  ctx.addAction({ id: 'imagen.maniqui', label: '🧍 Convertir en maniquí', title: 'Saca el cuerpo 3D de la persona (SAM 3D Body) y lo dibuja como maniquí gris: luego usa 🧍 Copiar su pose sobre el maniquí',
    when: f => f.kind === 'img' && !isManiqui(f) && !isSkeleton(f), run: async (f, c) => {
      const e = c.engines.engineById('pose.foto_maniqui');
      if (!e || c.engines.missingFiles(e, c.core.state.installed).length) return c.kit.toast('Falta SAM 3D Body (models/detection/sam_3d_body_dinov3_int8_convrot.safetensors).', 'err');
      const inp = f.ref ? f : await c.core.asInput(f);   // los resultados recién generados llegan sin ref ni w/h
      await c.kit.generar(e, { image: { ref: inp.ref, w: inp.w, h: inp.h } }, '🧍 Maniquí de la foto');
    } });
}
// app.js solo llama render() al visitar la página: registramos las acciones en cuanto exista window.HE (ver reporte al lead).
(function waitHE(t = 0) {
  if (typeof window === 'undefined') return;
  if (window.HE?.ctx) return init(window.HE.ctx);
  if (t < 240) setTimeout(() => waitHE(t + 1), 250);
})();

function injectCSS() {
  if (document.getElementById('css-' + ID)) return;
  const s = document.createElement('style');
  s.id = 'css-' + ID;
  const P0 = `.pg[data-id="${ID}"]`;
  s.textContent = `
${P0} .img-styles .cards{grid-auto-flow:column;grid-auto-columns:96px;grid-template-columns:none!important;overflow-x:auto;padding-bottom:6px;scrollbar-width:thin}
${P0} .img-styles .card-ico{font-size:28px;padding:14px 0 4px}
${P0} .img-styles .card-lbl{font-size:12px;padding:2px 4px 8px}
${P0} .img-pals{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-top:8px;scrollbar-width:thin}
${P0} .img-pal{display:flex;flex-direction:column;align-items:center;gap:4px;flex:none;min-width:82px;border:1px solid var(--line);background:var(--panel2);border-radius:10px;padding:6px 8px;cursor:pointer;font-size:11.5px;color:var(--mute)}
${P0} .img-pal.on{border-color:var(--acc);color:var(--acc)}
${P0} .img-pal .sw{display:flex;height:16px;width:64px;border-radius:5px;overflow:hidden;background:var(--panel3)}
${P0} .img-pal .sw i{flex:1}
${P0} .img-pj{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
${P0} .img-pjthumbs{display:flex;gap:6px}
${P0} .img-pjthumbs img{width:44px;height:44px;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
${P0} .img-refs .drop{min-height:104px}
${P0} .img-refs .drop img{max-height:150px}
${P0} .img-check{display:flex;gap:8px;align-items:center;font-size:13px;margin-top:8px;cursor:pointer}
${P0} .img-style-ref{margin-top:10px;max-width:260px}
${P0} .img-note{margin-top:8px}
${P0} .img-note:empty{display:none}
${P0} .img-row{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
${P0} .img-row > div{min-width:0}
`;
  document.head.append(s);
}

export default {
  id: ID, title: 'Imagen', icon: '🖼️', order: 20,
  init,
  setup: init,

  render(root, ctx) {
    init(ctx);
    injectCSS();
    const { kit, core, engines } = ctx;
    const { h } = kit;
    let upd = () => {};

    /* ---------- 1. idea ---------- */
    const prompt = kit.promptBox({ placeholder: 'Describe tu imagen: quién, dónde, luz, cámara… (mejor en inglés, pero entiende español)', ideas: IDEAS, key: ID, rows: 3 });
    enhance.attach(prompt, 'image');   // ✍️ Mejorar prompt (LLM local)
    prompt.textarea.addEventListener('input', () => upd());

    /* ---------- 2. estilo + paleta ---------- */
    const styleGrid = kit.cardGrid(STYLES.map(s => ({ id: s.id, label: s.label, icon: s.icon, title: s.text })),
      { value: core.store.get(ID + '.style', []), onChange: v => { core.store.set(ID + '.style', v); upd(); } });
    let palette = core.store.get(ID + '.palette', '');
    const palRow = h('div', { class: 'img-pals' });
    const drawPal = () => {
      palRow.innerHTML = '';
      for (const p of [{ id: '', label: 'Sin paleta', colors: [] }, ...PALETTES]) {
        palRow.append(h('button', { class: 'img-pal' + (p.id === palette ? ' on' : ''), title: p.text || 'Colores libres',
          onclick: () => { palette = p.id; core.store.set(ID + '.palette', palette); drawPal(); upd(); } },
        h('span', { class: 'sw' }, ...p.colors.map(c => h('i', { style: { background: c } }))), p.label));
      }
    };
    drawPal();

    /* ---------- 3. personaje + referencias ---------- */
    let pj = null;
    const pjThumbs = h('div', { class: 'img-pjthumbs' });
    const drawPj = () => { pjThumbs.innerHTML = ''; (pj?.photos || []).forEach(f => pjThumbs.append(h('img', { src: f.url, title: pj.name }))); };
    const picker = personajes.picker({ onPick: p => { pj = p; drawPj(); upd(); } });
    const refSlots = [1, 2, 3].map(i => kit.slot({ kind: 'image', tag: `Ref ${i}`, empty: '📷 Foto de referencia<br><small>arrastra, pega o clic</small>', onChange: () => upd() }));
    kit.pasteInto(refSlots, () => ctx.isActive(ID));
    // 🧍 pose exacta: foto o cuadro de video cuya POSE se copia; el diseño sale del personaje / las referencias
    const poseSlot = kit.slot({ kind: 'image', tag: 'Pose', empty: '🧍 Pose a copiar (opcional)<br><small>maniquí 3D (🕺 Movimiento), foto o cuadro de video</small>', onChange: () => upd() });
    const saveBtn = h('button', { class: 'btn sm', title: 'Guarda estas fotos con un nombre para reutilizarlas en todo el estudio',
      onclick: () => personajes.saveFromPhotos(refSlots.map(s => s.value)) }, '💾 Guardar como personaje');

    /* ---------- 4. formato + cantidad ---------- */
    const ar = kit.chips([['1:1', '⬜ 1:1'], ['9:16', '📱 9:16'], ['16:9', '🖥️ 16:9'], ['4:3', '4:3'], ['3:4', '3:4']], { key: ID + '.ar', onChange: () => upd() });
    const count = kit.chips([[1, '1'], [2, '2'], [4, '4']], { key: ID + '.count', onChange: () => upd() });

    /* ---------- 5. motor + extras ---------- */
    const menu = kit.engineMenu('image', { filter: e => !e.caps?.internal, onChange: () => upd() });
    const enhInp = h('input', { type: 'checkbox' });
    enhInp.checked = core.store.get(ID + '.enhance', false);
    enhInp.onchange = () => { core.store.set(ID + '.enhance', enhInp.checked); upd(); };
    const enhRow = h('label', { class: 'img-check', title: 'Un modelo de lenguaje reescribe tu idea con más detalle antes de pintar' },
      enhInp, '✍️ Mejorar mi prompt con IA (más detalle, tarda más)');
    const litInp = h('input', { type: 'checkbox' });
    litInp.checked = core.store.get(ID + '.literal', false);
    litInp.onchange = () => { core.store.set(ID + '.literal', litInp.checked); upd(); };
    const litRow = h('label', { class: 'img-check', title: 'Apaga el mejorador y las frases que Phane agrega solo (mantener identidad, usar referencia…): el motor recibe exactamente tu texto' }, litInp, '✍️ Al pie de la letra');
    const mkCheck = (key, def, text, title) => { const i = h('input', { type: 'checkbox' }); i.checked = core.store.get(key, def);
      i.onchange = () => { core.store.set(key, i.checked); upd(); }; return { i, row: h('label', { class: 'img-check hide', title }, i, text) }; };
    const fullQ = mkCheck(ID + '.maniquiFull', false, '🐢 Calidad completa (25 pasos, ~5 min; sin marcar: turbo ~1 min)', 'El turbo sale casi igual: úsalo para explorar y el completo para la imagen final.');
    const comercial = mkCheck(ID + '.maniquiComercial', true, '💼 Uso comercial (Qwen-Edit 2511 + AnyPose, licencia Apache)', 'Qwen-Image 2.1 es de licencia no comercial. Esta ruta usa solo modelos Apache-2.0.');
    const ligero = mkCheck(ID + '.maniquiLigero', false, '🪶 Versión ligera (FLUX.2 Klein 4B + RefControl, ~16 GB de RAM)', 'También Apache. Útil si la RAM está ocupada; AnyPose pide ~36 GB.');
    const styleRef = kit.slot({ kind: 'image', tag: 'Estilo', empty: '🎨 Imagen de estilo (opcional)<br><small>copia el look, no la persona</small>', onChange: () => upd() });
    const styleRefBox = h('div', { class: 'img-style-ref' }, styleRef);
    const note = h('div', { class: 'note img-note' });

    const refsNow = () => [...(pj?.photos || []), ...refSlots.map(s => s.value).filter(Boolean)];
    const missing = e => !e || engines.missingFiles(e, core.state.installed).length > 0;

    /** Motor efectivo: personaje con LoRA y motor Klein → su LoRA (sus fotos no van de referencia); si hay referencias y el elegido
     *  no las acepta, cambia al mejor con referencias del mismo nivel. */
    function pick() {
      let e = menu.value; const msgs = [];
      if (poseSlot.value && isManiqui(poseSlot.value)) {
        const view = maniquiView(poseSlot.value), extraRefs = refSlots.filter(x => x.value).length;
        let meId = comercial.i.checked ? (ligero.i.checked ? MANIQUI_LIGERO : MANIQUI_COMERCIAL) : MANIQUI_ENGINE;
        // de espaldas → AnyPose (salvo escena de dos: AnyPose no mete al segundo personaje)
        if (meId === MANIQUI_ENGINE && view === 'back' && !extraRefs && !missing(engines.engineById(MANIQUI_COMERCIAL))) {
          meId = MANIQUI_COMERCIAL;
          msgs.push('↩️ El maniquí está <b>de espaldas</b>: uso AnyPose, que sí deja la cara fuera de cámara (Qwen 2.1 la voltea).');
        }
        const me = engines.engineById(meId);
        if (me && !missing(me)) {
          if (meId === MANIQUI_ENGINE && view) msgs.push(pj?.vistas?.[view]
            ? `📐 Maniquí ${VIEW_NAME[view]}: agrego la vista ${VIEW_NAME[view]} de <b>${core.esc(pj.name)}</b> como referencia.`
            : `📐 Maniquí ${VIEW_NAME[view]}: ${core.esc(pj?.name || 'este personaje')} no tiene vista ${VIEW_NAME[view]} guardada; uso solo su hoja de frente.`);
          // hoja de diseño: la de fondo liso (estudio) > diseño > cuerpo > la más vertical. Con fondo de escenario, ese fondo se cuela.
          const ph = pj?.photos || [];
          const sheet = ph.find(x => /estudio|fondo_liso|plain/i.test(x.filename || '')) || ph.find(x => /diseno|design/i.test(x.filename || ''))
            || ph.find(x => /cuerpo|body|outfit/i.test(x.filename || '')) || ph[0];
          const all = [sheet, ...refSlots.map(x => x.value).filter(Boolean)].filter(Boolean).slice(0, me.caps.refs);
          msgs.push(all.length
            ? `🧍 Pongo a <b>${core.esc(pj?.name || 'Ref 1')}</b> en la pose del <b>maniquí 3D</b> (${core.esc(me.name)}${meId !== MANIQUI_ENGINE ? '' : fullQ.i.checked ? ', calidad completa' : ', turbo'}).`
              + `${all.length > 1 ? ' La otra referencia entra como segundo personaje.' : ''} Describe la expresión y el escenario. Mejor con una hoja de cuerpo completo y fondo liso.`
            : '🧍 Elige un Personaje (o pon su foto en Ref 1): el maniquí solo trae la pose.');
          if (meId === MANIQUI_LIGERO && all.length > 1) msgs.push('⚠️ La versión ligera (Klein) usa solo una referencia: el segundo personaje se ignora.');
          if (meId === MANIQUI_COMERCIAL && all.length > 1) msgs.push('⚠️ AnyPose no mete al segundo personaje (lo probé con el goblin). Para escenas de dos, desmarca 💼 Uso comercial.');
          return { e: me, refs: all, msgs, pose: poseSlot.value, maniqui: true };
        }
        msgs.push(`⬇ Falta el motor de pose con maniquí (${core.esc(meId)}): uso la pose exacta vieja.`);
      }
      if (poseSlot.value) {   // la pose manda: es lo único que los modelos con referencias no saben copiar
        const pe = engines.engineById(POSE_ENGINE);
        if (pe && !missing(pe)) {
          // diseño: 1.ª = personaje principal (foto de cuerpo del Personaje, o Ref 1), 2.ª = el otro personaje (siguiente Ref)
          const extra = refSlots.map(x => x.value).filter(Boolean), max = pe.caps.refs;
          // foto de diseño (sin armas, cuerpo completo) > de cuerpo > la más vertical; en Biblioteca la 1.ª suele ser la cara
          const ph = pj?.photos || [];
          const body = ph.find(x => /diseno|design/i.test(x.filename || '')) || ph.find(x => /cuerpo|body|outfit/i.test(x.filename || ''))
            || ph.reduce((a, b) => (b.w && b.h && a && a.w && a.h && b.h / b.w > a.h / a.w ? b : a), ph[0]);
          const all = [body, ...extra].filter(Boolean);
          const who = all.length ? ` y le pongo el diseño de <b>${core.esc(pj?.name || 'Ref 1')}</b>${all.length > 1 ? ' (el otro personaje como tu ' + (pj ? 'Ref 1' : 'Ref 2') + ')' : ''} con Qwen 2.1` : '';
          msgs.push(isSkeleton(poseSlot.value)
            ? `🧍 Uso tu <b>esqueleto</b> tal cual (ControlNet de Z-Image, sin SDPose)${who}. Describe la escena: quién, qué hace, qué agarra cada mano y dónde.`
            : `🧍 Copio la <b>pose exacta</b> de tu imagen (SDPose + ControlNet de Z-Image)${who}. Describe la escena: quién, qué hace y dónde.`);
          if (all.length > max) msgs.push(`Para el diseño uso ${max} imágenes: el personaje principal y el otro personaje.`);
          return { e: pe, refs: all.slice(0, max), msgs, pose: poseSlot.value };
        }
        msgs.push('⬇ Falta el control de pose (SDPose / ControlNet de Z-Image): por ahora ignoro la imagen de pose.');
      }
      const refs = refsNow();
      if (e && refs.length && !(e.caps?.refs > 0)) {
        const tier = e.tier === 'ligero' ? 'ligero' : 'highend';
        let alt = engines.engineById(REF_FALLBACK[tier]);
        if (tier === 'highend' && missing(alt)) alt = engines.engineById(REF_FALLBACK.ligero);
        if (alt) { msgs.push(`📸 <b>${core.esc(e.name)}</b> no usa fotos de referencia: con tus referencias usaré <b>${core.esc(alt.name)}</b>.`); e = alt; }
      }
      // personaje con LoRA propia: solo si el motor (elegido o el de arriba) la acepta (Klein). Con cualquier otro van sus fotos
      // de referencia y se respeta el motor (antes una casilla cambiaba a Klein 1 MP por debajo y salía en baja resolución).
      const hero = e?.caps?.heroLora ? personajes.heroLora(pj) : null;
      if (hero) {
        msgs.push(`👤 <b>${core.esc(pj.name)}</b> sale con su diseño exacto. Basta con describir la escena.`);
        const extra = refSlots.map(s => s.value).filter(Boolean), max = e.caps?.refs || 0;
        if (extra.length > max) msgs.push(`Solo caben ${max} referencias en ${core.esc(e.name)}: uso las primeras ${max}.`);
        return { e, refs: extra.slice(0, max), msgs, hero };
      }
      const max = e?.caps?.refs || 0;
      if (max && refs.length > max) msgs.push(`Solo caben ${max} referencias en ${core.esc(e.name)}: uso las primeras ${max} (primero las del personaje).`);
      return { e, refs: refs.slice(0, max), msgs };
    }
    const styleLoraOk = e => !e?.caps?.styleRef || !core.state.installed || !engines.missingFiles({ files: [e.caps.styleRef] }, core.state.installed).length;

    function opts(e, refs, hero, pose) {
      const st = STYLES.find(s => s.id === styleGrid.value[0]);
      const pal = PALETTES.find(p => p.id === palette);
      const extra = [st?.text, pal?.text].filter(Boolean).join(', ');
      let base = prompt.value;
      // 28-oct: con personaje, si el prompt no dice el encuadre, plano medio con la cara visible (de lejos sale chica y se deforma al animar)
      if (pj && !pose && !litInp.checked && base.trim() && !/shot|close-?up|full[ -]body|portrait|wide|from the (knees|waist)|plano|cuerpo (entero|completo)|retrato|primer plano/i.test(base))
        base = base.replace(/[\s.]+$/, '') + ', medium shot, face clearly visible';
      const o = { prompt: base && extra ? `${base}. ${extra}` : (base || extra), ar: ar.value, count: Math.min(+count.value || 1, e?.caps?.maxCount || 4),
        refs: refs.map(({ ref, w, h: hh }) => ({ ref, w, h: hh })) };
      if (pal && pal.colors?.length && e?.caps?.palette) o.palette = pal.colors;   // ColorMatch real además del texto
      if (litInp.checked) { o.literal = true; o.refHint = false; }
      else if (e?.caps?.enhance && enhInp.checked) o.enhance = true;
      if (e?.caps?.styleRef && styleRef.value && styleLoraOk(e)) o.styleRef = { ref: styleRef.value.ref, w: styleRef.value.w, h: styleRef.value.h };
      if (hero && e?.caps?.heroLora) o.heroLora = hero;   // el grafo agrega la LoRA y antepone "palabra clave, clase," al prompt
      if (pose && e?.caps?.pose && [MANIQUI_ENGINE, MANIQUI_COMERCIAL, MANIQUI_LIGERO].includes(e.id)) {
        o.pose = { ref: pose.ref, w: pose.w, h: pose.h }; o.count = 1;   // el lienzo es el del maniquí
        // pj.arma (18-oct): solo en las rutas de maniquí; en la pose exacta vieja la palabra del arma metía brazos extra
        const cd = [pj?.desc, pj?.arma].filter(Boolean).join('; ');
        if (cd && !o.literal) o.charDesc = cd;
        if (e.id === MANIQUI_ENGINE) o.turbo = !fullQ.i.checked;
        const view = maniquiView(pose);
        if (view && e.id !== MANIQUI_LIGERO) {
          o.view = view;
          const vr = e.id === MANIQUI_ENGINE && pj?.vistas?.[view];
          if (vr) o.viewRef = { ref: vr.ref, w: vr.w, h: vr.h };
        }
        return o;
      }
      if (pose && e?.caps?.pose) {
        o.pose = { ref: pose.ref, w: pose.w, h: pose.h }; o.count = 1;
        if (pj?.desc && !o.literal) o.charDesc = pj.desc;   // descripción del diseño: Z-Image lo pinta bien desde el inicio y Qwen sabe qué copiar
        // El retoque de cabeza (o.headRef, pose.js) queda APAGADO: en la batería (ronda 3, 27 actividades) bajó la calificación
        // (máscara corta → crestas flotando y alas a medias). Se reactiva cuando la máscara cubra casco y alas completos.
        // el lienzo toma el formato de la imagen de pose (si no, el esqueleto queda chiquito entre franjas negras)
        if (pose.w && pose.h) { const r = pose.w / pose.h; o.ar = r > 1.5 ? '16:9' : r > 1.15 ? '4:3' : r > 0.87 ? '1:1' : r > 0.66 ? '3:4' : '9:16'; }
      }
      return o;
    }

    const gen = kit.genButton('✨ Generar', go, () => { const { e, refs, hero, pose } = pick(); return kit.estimateText(e, opts(e, refs, hero, pose)); });
    upd = () => {
      const { e, refs, msgs } = pick();
      const man = isManiqui(poseSlot.value);
      fullQ.row.classList.toggle('hide', !man || comercial.i.checked); comercial.row.classList.toggle('hide', !man);
      ligero.row.classList.toggle('hide', !man || !comercial.i.checked);
      enhRow.classList.toggle('hide', !e?.caps?.enhance || litInp.checked);
      styleRefBox.classList.toggle('hide', !e?.caps?.styleRef);
      if (e?.caps?.styleRef && styleRef.value && !styleLoraOk(e)) msgs.push('⬇ Falta la LoRA de estilo de Krea 2: por ahora se ignora la imagen de estilo.');
      if (!refs.length && refsNow().length === 0 && styleGrid.value.length === 0 && !palette && !prompt.value) msgs.push('💡 Tip: elige un estilo o una paleta para darle personalidad.');
      note.innerHTML = msgs.join('<br>');
      gen.update();
    };

    async function go() {
      const { e, refs, hero, pose } = pick();
      const o = opts(e, refs, hero, pose);
      if (!o.prompt) { kit.toast('Escribe primero qué imagen quieres (o elige un estilo) 🙂', 'err'); prompt.textarea.focus(); return; }
      const label = `🖼️ ${(prompt.value || STYLES.find(s => s.id === styleGrid.value[0])?.label || 'Imagen').slice(0, 42)}${o.count > 1 ? ' ×' + o.count : ''}`;
      await kit.generar(e, o, label);
    }

    root.append(
      h('h1', {}, '🖼️ Imagen'),
      h('p', { class: 'sub' }, 'Escribe tu idea, dale un estilo y genera. Con un personaje o fotos de referencia mantiene a la misma persona.'),
      kit.step(1, '¿Qué quieres crear?'), prompt,
      kit.step(2, 'Estilo', '(opcional)'), h('div', { class: 'img-styles' }, styleGrid), palRow,
      kit.step(3, 'Personaje y referencias', '(opcional · hasta 4 fotos)'),
      h('div', { class: 'img-pj' }, picker, pjThumbs),
      h('div', { class: 'cols3 img-refs', style: { marginTop: '8px' } }, ...refSlots),
      h('div', { class: 'img-pose', style: { marginTop: '8px', maxWidth: '260px' } }, poseSlot), fullQ.row, comercial.row, ligero.row,
      h('div', { class: 'row', style: { marginTop: '8px' } }, saveBtn, h('span', { class: 'note', style: { marginTop: 0 } }, 'Tip: arrastra imágenes de Recientes a las casillas.')),
      kit.step(4, 'Formato y cantidad'),
      h('div', { class: 'img-row' }, h('div', {}, ar), h('div', {}, count)),
      kit.step(5, 'Motor'), menu, litRow, enhRow, styleRefBox,
      note, gen,
    );

    core.on('models', () => upd());
    core.on('loras', () => upd());
    core.on('tier', () => setTimeout(upd));
    P = { prompt, styleGrid, refSlots, poseSlot, kit, upd };
    upd();
  },

  /** payload: { file } -> foto de referencia ; { pose } -> imagen cuya pose se copia ; { prompt } ; { style } */
  async receive(payload, ctx) {
    if (!payload || !P) return;
    if (payload.prompt) P.prompt.value = payload.prompt;
    if (payload.style) P.styleGrid.value = [payload.style];
    if (payload.file) {
      if (payload.file.kind && payload.file.kind !== 'img') { ctx.kit.toast('Eso no es una imagen.', 'err'); return; }
      const s = P.refSlots.find(x => !x.value) || P.refSlots[P.refSlots.length - 1];
      await s.set(payload.file);
      ctx.kit.toast('👤 Lista como foto de referencia.', 'info', 3000);
    }
    if (payload.pose) {
      if (payload.pose.kind && payload.pose.kind !== 'img') { ctx.kit.toast('La pose tiene que venir de una imagen.', 'err'); return; }
      await P.poseSlot.set(payload.pose);
      ctx.kit.toast('🧍 Lista como pose a copiar. Elige tu personaje y describe la escena.', 'info', 4000);
    }
    P.upd();
  },
};
