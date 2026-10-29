// Página 'Editar' (Edit + Apps de imagen): editar libre, Relight, Quitar fondo, Expandir,
// Cambiar outfit, Producto en escena, Ángulos/Shots y Retoque de piel. Todo con instrucciones (tool 'edit') salvo el
// recorte transparente (tool 'bg'). En las instrucciones {img1} = imagen a editar, {img2}/{img3} = referencias.
import * as personajes from '../personajes.js';
import { RELIGHT, LIGHT_DIR, LIGHT_POWER, ANGLES, ANGLE_KEEP, SKIN, SKIN_KEEP } from '../data/styles.js';
import * as enhance from '../enhance_ui.js';

const ID = 'editar';
const TABS = [
  ['libre', '✏️ Editar libre'], ['relight', '💡 Relight'], ['bg', '✂️ Quitar fondo'], ['expand', '↔️ Expandir'],
  ['outfit', '👗 Cambiar outfit'], ['producto', '📦 Producto en escena'], ['shots', '🎥 Ángulos / Shots'], ['piel', '✨ Retoque de piel'],
];
const IDEAS = [
  ['De noche', 'Turn the scene into night time with moonlight and warm city lights.'],
  ['Playa', 'Change the background to a tropical beach at sunset. Keep the person exactly the same.'],
  ['Quitar gente', 'Remove the people in the background and fill the area naturally.'],
  ['Pelo cobre', 'Change the hair color to a vibrant copper red.'],
  ['Invierno', 'Make it winter: add gently falling snow and snow on the ground.'],
  ['Anime', 'Convert this image to an anime illustration style.'],
  ['Sonrisa', 'Make the person smile naturally.'],
  ['Texto', 'Add the text "HIGH END" in bold white letters at the top.'],
];
const BG_IDEAS = [
  ['Estudio blanco', 'a clean seamless white studio backdrop with a soft floor shadow'],
  ['Ciudad de noche', 'a blurred city street at night with colorful bokeh lights'],
  ['Naturaleza', 'a lush green forest with soft sunlight filtering through the trees'],
  ['Oficina', 'a modern bright office with large windows'],
];
const KEEP_ID = "Keep the person's face, identity, hairstyle, body shape, pose, background and lighting unchanged.";
/** "la imagen 2" / "image 2" / "foto 3" -> {img2}… (cada motor lo traduce a su forma). */
const toTokens = t => String(t || '').replace(/\b(?:la\s+|el\s+)?(?:imagen|foto|image|picture)\s*([1-3])\b/gi, '{img$1}');

let P = null;
let inited = false;
function init(ctx) {
  if (inited) return;
  inited = true;
  ctx.addAction({ id: 'editar.bg', label: '✂️ Quitar fondo', title: 'Recortar el fondo (PNG transparente)', when: f => f.kind === 'img',
    run: (f, c) => c.goto(ID, { file: f, tab: 'bg', auto: true }) });
}
// app.js solo llama render() al visitar la página: registramos la acción en cuanto exista window.HE (ver reporte al lead).
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
${P0} .ed-tabs{margin-bottom:6px}
${P0} .ed-main{max-width:420px}
${P0} .ed-main .drop{min-height:150px}
${P0} .ed-main .drop img{max-height:280px}
${P0} .ed-refs .drop{min-height:110px}
${P0} .ed-refs .drop img{max-height:170px}
${P0} .ed-in{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:9px 11px}
${P0} .ed-check{display:flex;gap:8px;align-items:center;font-size:13px;margin-top:8px;cursor:pointer}
${P0} .ed-note:empty{display:none}
${P0} .ed-sub{margin-top:10px}
${P0} .ed-relight .card-ico,${P0} .ed-shots .card-ico{font-size:26px;padding:12px 0 4px}
${P0} .ed-relight .card-lbl,${P0} .ed-shots .card-lbl{font-size:12px;padding:2px 4px 8px}
`;
  document.head.append(s);
}

export default {
  id: ID, title: 'Editar', icon: '🪄', order: 30,
  init,
  setup: init,

  render(root, ctx) {
    init(ctx);
    injectCSS();
    const { kit, core, engines } = ctx;
    const { h } = kit;
    let upd = () => {};
    const U = () => upd();
    const input = (placeholder, key) => {
      const el = h('input', { type: 'text', class: 'ed-in', placeholder });
      el.value = core.store.get('editar.in.' + key, '');
      el.oninput = () => { core.store.set('editar.in.' + key, el.value); U(); };
      return el;
    };
    const imgSlot = (tag, empty) => kit.slot({ kind: 'image', tag, empty, onChange: U });

    /* ---------- imagen principal (compartida por todas las pestañas) ---------- */
    const main = imgSlot('Tu imagen', '🖼️ Arrastra tu imagen aquí<br><small>o haz clic · Ctrl+V · desde Recientes</small>');
    const mainTitle = h('span', {}, 'Tu imagen');

    /* ---------- pestañas ---------- */
    const T = {};

    // Editar libre
    {
      const pr = kit.promptBox({ placeholder: 'Di qué cambiar. Ej. "Cambia el fondo a una playa al atardecer". Puedes decir "la imagen 2" para usar una referencia.', ideas: IDEAS, key: 'editar.libre', rows: 3 });
      enhance.attach(pr, 'edit', { getImage: () => main.value });   // ✍️ Mejorar instrucción (ve tu imagen en High End)
      const r2 = imgSlot('Ref 2', '➕ Referencia (opcional)<br><small>persona, objeto, estilo…</small>');
      const r3 = imgSlot('Ref 3', '➕ Referencia (opcional)');
      let pjSel = null;   // personaje elegido (si tiene LoRA 🧬 y el motor la acepta, se suma a sus fotos)
      const pick = personajes.picker({ label: '👤 Personaje como referencia', onPick: p => { pjSel = p; const ph = p?.photos || []; r2.set(ph[0] || null); r3.set(ph[1] || null); } });
      T.libre = {
        tool: 'edit', go: '🪄 Editar', main: 'Tu imagen', slots: [r2, r3],
        el: h('div', {}, kit.step(2, '¿Qué quieres cambiar?'), pr, kit.step(3, 'Referencias', '(opcional)'), pick,
          h('div', { class: 'cols2 ed-refs ed-sub' }, r2, r3)),
        build() {
          if (!pr.value) return 'Escribe qué quieres cambiar 🙂';
          const refs = [r2.value, r3.value].filter(Boolean);
          let p = toTokens(pr.value);
          if (refs.length && !core.store.get('editar.literal', false) && !/\{img[23]\}/.test(p)) p += ` Use ${refs.map((_, i) => `{img${i + 2}}`).join(' and ')} as reference.`;
          // su LoRA solo cuenta si alguna de sus fotos sigue en las casillas
          const hero = pjSel?.lora && refs.some(v => (pjSel.photos || []).some(f => f.ref === v.ref)) ? pjSel : null;
          return { o: { prompt: p, refs }, label: pr.value, hero };
        },
      };
    }

    // Relight
    {
      const grid = kit.cardGrid(RELIGHT.map(r => ({ id: r.id, label: r.label, icon: r.icon, title: r.text })),
        { value: [core.store.get('editar.relight', 'golden')], onChange: v => { core.store.set('editar.relight', v[0] || ''); U(); } });
      const dir = kit.chips(LIGHT_DIR, { key: 'editar.lightdir', onChange: U });
      const pow = kit.chips(LIGHT_POWER.map(([v, l]) => [v, l]), { key: 'editar.lightpow', value: 'normal', onChange: U });
      const extra = input('Detalles extra (opcional), ej. "light coming through a window"', 'relight');
      T.relight = {
        tool: 'edit', go: '💡 Reiluminar', main: 'Tu imagen',
        el: h('div', { class: 'ed-relight' }, kit.step(2, 'Elige la luz'), grid,
          kit.step(3, 'Dirección e intensidad'), dir, h('div', { class: 'ed-sub' }, pow), h('div', { class: 'ed-sub' }, extra)),
        build() {
          const r = RELIGHT.find(x => x.id === grid.value[0]);
          if (!r) return 'Elige una luz 💡';
          const pw = LIGHT_POWER.find(x => x[0] === pow.value)?.[2] || '';
          const p = `Relight {img1} using ${r.text}${dir.value ? `, with the main light coming ${dir.value}` : ''}. The lighting should be ${pw}.`
            + (extra.value ? ` ${extra.value}.` : '')
            + " Keep the subject's identity, face, pose, expression, clothing, composition and background content exactly the same; only change the lighting, shadows, highlights and color temperature.";
          return { o: { prompt: p }, label: 'Relight · ' + r.label };
        },
      };
    }

    // Quitar fondo (transparente con 'bg' o fondo nuevo con 'edit')
    {
      const mode = kit.chips([['transp', '🫥 Transparente (PNG)'], ['nuevo', '🏞️ Fondo nuevo']], { key: 'editar.bgmode', onChange: U });
      const desc = kit.promptBox({ placeholder: 'Describe el fondo nuevo… (o pon una foto del fondo)', ideas: BG_IDEAS, key: 'editar.bgdesc', rows: 2 });
      const bgRef = imgSlot('Fondo', '🏞️ Foto del fondo (opcional)');
      const nuevo = h('div', { class: 'ed-sub' }, desc, h('div', { class: 'ed-refs ed-sub', style: { maxWidth: '260px' } }, bgRef));
      T.bg = {
        get tool() { return mode.value === 'transp' ? 'bg' : 'edit'; },
        go: '✂️ Quitar fondo', main: 'Tu imagen', slots: [bgRef], mode,
        el: h('div', {}, kit.step(2, '¿Qué fondo quieres?'), mode, nuevo),
        show() { nuevo.classList.toggle('hide', mode.value === 'transp'); this.go = mode.value === 'transp' ? '✂️ Quitar fondo' : '🏞️ Cambiar fondo'; },
        build() {
          if (mode.value === 'transp') return { o: {}, label: 'Quitar fondo' };
          if (!desc.value && !bgRef.value) return 'Describe el fondo nuevo o pon una foto del fondo 🙂';
          const what = desc.value ? desc.value : 'the background shown in {img2}';
          return { o: { prompt: `Replace the background of {img1} with ${what}. Keep the subject exactly the same, with natural edges and lighting that matches the new background.`,
            refs: bgRef.value ? [bgRef.value] : [] }, label: 'Fondo nuevo' };
        },
      };
    }

    // Expandir (rellena con blanco hasta el formato y pide completar la escena)
    {
      const fmt = kit.chips([['16:9', '🖥️ 16:9'], ['9:16', '📱 9:16'], ['1:1', '⬜ 1:1'], ['4:3', '4:3'], ['3:4', '3:4'], ['21:9', '🎬 21:9'], ['zoom', '🔍 Alejar']],
        { key: 'editar.expand', onChange: U });
      const desc = input('¿Qué hay alrededor? (opcional), ej. "a crowded market street"', 'expand');
      T.expand = {
        tool: 'edit', go: '↔️ Expandir', main: 'Tu imagen',
        el: h('div', {}, kit.step(2, 'Nuevo formato'), fmt, h('div', { class: 'ed-sub' }, desc),
          h('div', { class: 'note' }, 'Se agrega un borde blanco hasta el formato y la IA completa la escena. Queda mejor con Qwen (High End).')),
        build() {
          if (main.value && !main.value.w) return 'No pude leer el tamaño de tu imagen; vuelve a ponerla.';
          const p = `{img1} has empty white borders. Fill the white border areas with a seamless, natural continuation of the scene${desc.value ? ': ' + desc.value : ''}.`
            + ' Match the perspective, lighting, colors and textures, and keep the original content exactly unchanged.';
          return { o: { prompt: p, ar: fmt.value }, label: 'Expandir · ' + (fmt.value === 'zoom' ? 'alejar' : fmt.value) };
        },
      };
    }

    // Cambiar outfit
    {
      const outfit = imgSlot('Outfit', '👗 Foto de la ropa<br><small>prenda sola o puesta en otra persona</small>');
      const extra = input('Detalles (opcional), ej. "add matching sneakers"', 'outfit');
      // qué se toma de la foto (SAM 3, 26-oct): solo las prendas (respeta tu pose) o todo menos la cabeza (agarra todo, pero copia la pose)
      const take = kit.chips([['ropa', '👗 Solo la ropa'], ['cuerpo', '🧍 Todo menos la cara']], { key: 'editar.outfittake', onChange: U });
      T.outfit = {
        tool: 'edit', go: '👗 Cambiar outfit', main: 'La persona', slots: [outfit],
        el: h('div', {}, kit.step(2, 'La ropa'), h('div', { class: 'ed-refs', style: { maxWidth: '300px' } }, outfit), h('div', { class: 'ed-sub' }, take), h('div', { class: 'ed-sub' }, extra)),
        build() {
          if (!outfit.value) return 'Pon la foto de la ropa 👗';
          const p = "Dress the person from {img1} in the exact outfit shown in {img2}. Reproduce the clothing's design, colors, fabric, pattern and details accurately."
            + (extra.value ? ` ${extra.value}.` : '') + (core.store.get('editar.literal', false) ? '' : ' ' + KEEP_ID);
          return { o: { prompt: p, refs: [{ ...outfit.value, ...(take.value === 'cuerpo' ? { isolate: 'person', cut: 'head' } : { isolate: ['clothing', 'dress', 'boots', 'shoes'] }) }] }, label: 'Cambiar outfit' };
        },
      };
    }

    // Producto en escena
    {
      const mode = kit.chips([['escena', '🏞️ Ponerlo en la escena'], ['mano', '🤳 Persona lo sostiene']], { key: 'editar.prodmode', onChange: U });
      const prod = imgSlot('Producto', '📦 Foto del producto<br><small>mejor con fondo limpio</small>');
      const desc = input('Describe el producto o dónde ponerlo (opcional), ej. "on the wooden table"', 'producto');
      T.producto = {
        tool: 'edit', go: '📦 Poner producto', slots: [prod], mode,
        get main() { return mode.value === 'mano' ? 'La persona' : 'La escena'; },
        el: h('div', {}, kit.step(2, 'Tipo de toma'), mode, kit.step(3, 'El producto'), h('div', { class: 'ed-refs', style: { maxWidth: '300px' } }, prod),
          h('div', { class: 'ed-sub' }, desc)),
        build() {
          if (!prod.value) return 'Pon la foto del producto 📦';
          const keepProd = "Keep the product's shape, proportions, colors, logo and label text exactly the same.";
          const p = mode.value === 'mano'
            ? `The person from {img1} is holding the product from {img2}, the product logo is visible${desc.value ? ' (' + desc.value + ')' : ''}. ${keepProd} Keep the person's face, identity, outfit and background unchanged.`
            : `Insert the product from {img2} into the scene from {img1}${desc.value ? ', ' + desc.value : ''}. Place it naturally on a logical surface, scale it realistically and relight it to match the scene's light direction, shadows and reflections according to its material. ${keepProd} Keep the rest of the scene unchanged.`;
          return { o: { prompt: p, refs: [prod.value] }, label: mode.value === 'mano' ? 'Producto en mano' : 'Producto en escena' };
        },
      };
    }

    // Ángulos / Shots (una toma por ángulo, en un solo trabajo)
    {
      const grid = kit.cardGrid(ANGLES.map(a => ({ id: a.id, label: a.label, icon: a.icon, title: a.text })),
        { multi: 9, value: core.store.get('editar.angles', ['closeup', 'low', 'left45', 'wide']), onChange: v => { core.store.set('editar.angles', v); U(); } });
      T.shots = {
        tool: 'edit', main: 'Tu imagen',
        get go() { const n = grid.value.length; return `🎥 Generar ${n || ''} toma${n === 1 ? '' : 's'}`; },
        el: h('div', { class: 'ed-shots' }, kit.step(2, 'Elige los ángulos', '(hasta 9)'), grid,
          h('div', { class: 'note' }, 'Cada ángulo sale como una imagen aparte, todas en un solo trabajo (los modelos se cargan una vez).')),
        build() {
          const sel = ANGLES.filter(a => grid.value.includes(a.id));
          if (!sel.length) return 'Elige al menos un ángulo 🎥';
          return { o: { prompts: sel.map(a => `${a.text} ${ANGLE_KEEP}`) }, label: `Shots · ${sel.length} ángulo${sel.length > 1 ? 's' : ''}` };
        },
      };
    }

    // Retoque de piel
    {
      const lvl = kit.chips(SKIN.map(([v, l]) => [v, l]), { key: 'editar.skin', value: 'natural', onChange: U });
      T.piel = {
        tool: 'edit', go: '✨ Retocar piel', main: 'El retrato',
        el: h('div', {}, kit.step(2, 'Nivel de retoque'), lvl, h('div', { class: 'note' }, 'Quita granitos y rojeces sin dejar la piel de plástico. Para más nitidez usa 🔎 Mejorar.')),
        build() {
          const s = SKIN.find(x => x[0] === lvl.value) || SKIN[0];
          return { o: { prompt: `${s[2]} ${SKIN_KEEP}` }, label: 'Retoque de piel · ' + s[1].replace(/^\S+\s/, '') };
        },
      };
    }

    /* ---------- motor ---------- */
    const editMenu = kit.engineMenu('edit', { onChange: U });
    const bgMenu = kit.engineMenu('bg', { onChange: U });
    const enhInp = h('input', { type: 'checkbox' });
    enhInp.checked = core.store.get('editar.enhance', false);
    enhInp.onchange = () => { core.store.set('editar.enhance', enhInp.checked); U(); };
    const enhRow = h('label', { class: 'ed-check', title: 'Un modelo de lenguaje mira tus imágenes y detalla la instrucción antes de editar' },
      enhInp, '✍️ Mejorar la instrucción con IA (más preciso, tarda más)');
    const litInp = h('input', { type: 'checkbox' });
    litInp.checked = core.store.get('editar.literal', false);
    litInp.onchange = () => { core.store.set('editar.literal', litInp.checked); U(); };
    const litRow = h('label', { class: 'ed-check', title: 'Apaga el mejorador y las frases que Phane agrega solo (mantener identidad, usar referencia…): el motor recibe exactamente tu texto' }, litInp, '✍️ Al pie de la letra');
    const note = h('div', { class: 'note ed-note' });

    const tabs = kit.chips(TABS, { key: 'editar.tab', onChange: () => showTab() });
    const panel = h('div', {});
    const cur = () => T[tabs.value] || T.libre;
    const engine = () => (cur().tool === 'bg' ? bgMenu.value : editMenu.value);

    /** Opciones finales para el motor + avisos. Devuelve {e, o, label, msgs} o {error}. */
    function compute() {
      const t = cur(), e = engine(), msgs = [];
      if (!main.value) return { e, error: `Primero pon ${t.main === 'Tu imagen' ? 'tu imagen' : t.main.toLowerCase()} arriba 🖼️`, msgs };
      const r = t.build();
      if (typeof r === 'string') return { e, error: r, msgs };
      const o = { ...r.o, image: { ref: main.value.ref, w: main.value.w, h: main.value.h } };
      if (t.tool === 'edit') {
        const max = e?.caps?.refs ?? 0;
        const refs = (o.refs || []).filter(Boolean);
        if (refs.length > max) msgs.push(`${core.esc(e?.name || 'Este motor')} acepta ${max} referencia(s): uso solo las primeras.`);
        o.refs = refs.slice(0, max).map(({ ref, w, h: hh, isolate, cut }) => ({ ref, w, h: hh, ...(isolate && { isolate, cut }) }));
        if (litInp.checked) { o.literal = true; o.refHint = false; }
        else if (e?.caps?.enhance && enhInp.checked) o.enhance = true;
        if (o.prompts && !e?.caps?.multi) { msgs.push('Este motor hace una toma por trabajo: uso solo el primer ángulo.'); o.prompt = o.prompts[0]; delete o.prompts; }
        const L = r.hero && e?.caps?.heroLora ? personajes.heroLora(r.hero) : null;
        if (L) { o.heroLora = L; msgs.push(`🧬 Uso también la LoRA de <b>${core.esc(r.hero.name)}</b> para que salga con su diseño exacto.`); }
        else if (r.hero && personajes.loraMissing(r.hero)) msgs.push(`⚠️ No encuentro la LoRA de <b>${core.esc(r.hero.name)}</b>: uso solo sus fotos.`);
        else if (r.hero) msgs.push(`🧬 ${core.esc(r.hero.name)} tiene LoRA propia, pero ${core.esc(e?.name || 'este motor')} no la usa (solo FLUX.2 Klein): uso sus fotos.`);
      } else { delete o.refs; delete o.prompt; }
      return { e, o, label: r.label, msgs };
    }

    const gen = kit.genButton('🪄 Editar', go, () => { const c = compute(); return c.error ? '' : kit.estimateText(c.e, c.o); });

    upd = () => {
      const t = cur();
      t.show && t.show();
      mainTitle.textContent = t.main;
      editMenu.classList.toggle('hide', t.tool !== 'edit');
      bgMenu.classList.toggle('hide', t.tool !== 'bg');
      const c = compute();
      enhRow.classList.toggle('hide', !(t.tool === 'edit' && c.e?.caps?.enhance) || litInp.checked);
      litRow.classList.toggle('hide', t.tool !== 'edit');
      gen.button.textContent = t.go;
      note.innerHTML = (c.error ? [`<span class="muted">${core.esc(c.error)}</span>`] : c.msgs).join('<br>');
      gen.update();
    };
    function showTab() {
      panel.innerHTML = '';
      panel.append(cur().el);
      U();
    }

    async function go() {
      const c = compute();
      if (c.error) { kit.toast(c.error, 'err'); return; }
      const t = cur();
      await kit.generar(c.e, c.o, `🪄 ${String(c.label || 'Editar').slice(0, 44)}`);
      return t;
    }

    // Ctrl+V: a la imagen principal o a la primera casilla vacía de la pestaña visible
    document.addEventListener('paste', async ev => {
      if (!ctx.isActive(ID)) return;
      const f = [...(ev.clipboardData?.files || [])].find(x => x.type.startsWith('image/'));
      if (!f) return;
      const target = [main, ...(cur().slots || [])].find(s => !s.value) || main;
      target.set(await core.upload(f));
    });
    root.append(
      h('h1', {}, '🪄 Editar'),
      h('p', { class: 'sub' }, 'Edita con palabras: luz, fondo, ropa, ángulos, piel… Arrastra una imagen de Recientes o súbela.'),
      h('div', { class: 'ed-tabs' }, tabs),
      kit.step(1, mainTitle), h('div', { class: 'ed-main' }, main),
      panel,
      kit.step('⚙', 'Motor'), editMenu, bgMenu, litRow, enhRow,
      note, gen,
    );
    core.on('models', U);
    core.on('loras', U);
    P = { tabs, main, T, showTab, go, U };
    showTab();
  },

  /** payload: { file, tab?, auto?, prompt? } — file = imagen de galería/salida. auto = generar al llegar. */
  async receive(payload, ctx) {
    if (!payload || !P) return;
    if (payload.tab && P.T[payload.tab]) { P.tabs.value = payload.tab; P.showTab(); }
    if (payload.tab === 'bg' && P.T.bg.mode) { P.T.bg.mode.value = 'transp'; }
    if (payload.file) {
      if (payload.file.kind && payload.file.kind !== 'img') { ctx.kit.toast('Eso no es una imagen.', 'err'); return; }
      await P.main.set(payload.file);
    }
    if (payload.prompt && P.T.libre) {
      const box = P.T.libre.el.querySelector('textarea');
      if (box) { box.value = payload.prompt; box.dispatchEvent(new Event('input')); }
    }
    P.U();
    if (payload.auto && payload.file) await P.go();
  },
};
