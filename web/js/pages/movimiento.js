// Página "🕺 Movimiento" (Movimiento por texto, NVIDIA Kimodo): escribes una acción y sale una animación 3D de cuerpo completo.
// De ahí: el maniquí va a 🎭 Recast (tu personaje hace ese movimiento), las poses clave a 🧍 Pose exacta (Imagen) y el BVH a tu juego.
import { VISTAS, MOTION_FPS, motionName } from '../graphs/motion.js';

const IDEAS = [
  ['Voltereta', 'A person does a cartwheel and lands in a crouch.'],
  ['Espadazo en salto', 'A person jumps forward and strikes down with a sword held in both hands.'],
  ['Corte horizontal', 'A person swings a sword horizontally from right to left with both hands.'],
  ['Hechizo', 'A person casts a spell, pushing both hands forward with force.'],
  ['Disparo con arco', 'A person draws a bow, aims forward and releases an arrow.'],
  ['Recibe un golpe', 'A person gets hit in the chest, staggers backward and falls to the ground.'],
  ['Sigiloso', 'A person sneaks forward slowly in a crouch, looking around.'],
  ['Victoria', 'A person raises both fists in the air in celebration and jumps.'],
  ['Zombi', 'A zombie with their left arm extended forward walks with an uneven gait at a slow pace.'],
];

let ui = null;
const bvhUrl = (core, name) => core.urlOf({ filename: `${name}.bvh`, subfolder: 'phane/kimodo', type: 'output' });

function registerActions(ctx) {
  // BVH del movimiento (T-pose de reposo) para el juego: desde el maniquí, el esqueleto o cualquier pose clave
  ctx.addAction({ id: 'motion.bvh', label: '🦴 BVH para tu juego', title: 'Descargar la animación 3D (BVH, T-pose de reposo, 30 fps) para Blender / tu motor de juego',
    when: f => !!motionName(f), run: (f, c) => {
      const a = document.createElement('a'); a.href = bvhUrl(c.core, motionName(f)); a.download = `${motionName(f)}.bvh`;
      document.body.append(a); a.click(); a.remove();
    } });
  // 🎮 la misma acción para tus héroes (ensayo 27-oct: había que volver a escribirla en Juego)
  ctx.addAction({ id: 'motion.juego', label: '🎮 Usar en Juego', title: 'Lleva esta acción a 🎮 Juego para sacar a tus héroes en esa pose',
    when: f => f.kind === 'vid' && !!motionName(f), run: (f, c) => c.goto('juego', { prompt: c.core.store.get('prompt.movimiento', '') }) });
  // esqueleto EXACTO de cualquier cuadro (sale del movimiento 3D, no de la imagen del video: sin compresión y bien encuadrado)
  ctx.addAction({ id: 'motion.frame', label: '🎯 Pose de este cuadro', title: 'Pausa el video donde quieras: saca el esqueleto exacto de ESE cuadro para 🧍 Pose exacta',
    when: f => f.kind === 'vid' && !!motionName(f), run: async (f, c) => {
      const v = document.querySelector('.view video');
      if (!v || v.readyState < 2) return c.kit.toast('Espera a que se vea el video y vuelve a intentar.', 'err');
      v.pause();
      const frame = Math.round(v.currentTime * MOTION_FPS);
      const e = c.engines.engineById('motion.kimodo_frame');
      await c.kit.generar(e, { name: motionName(f), frame }, `🎯 Pose del cuadro ${frame}`);
    } });
  // 🧍 maniquí 3D de ESE cuadro desde el ángulo elegido (18-oct): la mejor pose para Imagen (Qwen 2.1 + VNCCS, o AnyPose comercial)
  ctx.addAction({ id: 'motion.maniqui', label: '🧍 Maniquí de este cuadro', title: 'Pausa el video donde quieras: dibuja el maniquí 3D de ESE cuadro con el ángulo de "Ángulo del maniquí" y luego usa 🧍 Copiar su pose',
    when: f => f.kind === 'vid' && !!motionName(f), run: async (f, c) => {
      const v = document.querySelector('.view video');
      if (!v || v.readyState < 2) return c.kit.toast('Espera a que se vea el video y vuelve a intentar.', 'err');
      v.pause();
      const frame = Math.round(v.currentTime * MOTION_FPS);
      const vista = c.core.store.get('movimiento.maniquiVista', 'tres_cuartos_izq');
      const e = c.engines.engineById('motion.kimodo_frame');
      await c.kit.generar(e, { name: motionName(f), frame, vista, maniqui: true }, `🧍 Maniquí del cuadro ${frame}`);
    } });
}
(function boot(n = 0) { const c = globalThis.HE?.ctx; if (c) registerActions(c); else if (n < 60) setTimeout(() => boot(n + 1), 500); })();

export default {
  id: 'movimiento', title: 'Movimiento', icon: '🕺', order: 62,
  setup: registerActions,
  render(root, ctx) {
    const { kit, core, engines } = ctx; const { h } = kit;
    registerActions(ctx);
    root.append(h('style', {}, `
      .pg[data-id="movimiento"] .mv-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:8px}
      .pg[data-id="movimiento"] .mv-in{width:110px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:5px 8px}
      .pg[data-id="movimiento"] .mv-how{font-size:13px;line-height:1.5}
      .pg[data-id="movimiento"] .mv-how li{margin:2px 0}
      .pg[data-id="movimiento"] .mv-chips{margin-top:8px}
      .pg[data-id="movimiento"] .mv-chips .chip{font-size:12.5px}`));

    const e = engines.engineById('motion.kimodo');
    // 28-oct: sin Llama-3-8B (16 GB) los prompts YA leídos (cache_textos) salen igual: chips con esos movimientos y el motor
    // corre sin pedir Llama si el prompt es uno de ellos. Lista: /phane/api/kimodo_listos (sin rutas; vacía si aún no hay).
    const norm = t => String(t || '').split(/\n|\|/).map(s => s.trim()).filter(Boolean).join('\n');
    let listos = null, falloLlama = false;
    const llamaFalta = () => engines.missingFiles(e, core.state.installed).some(m => /Llama/i.test(m));
    const esListo = t => !!listos && listos.includes(norm(t));
    const engFor = () => (llamaFalta() && esListo(prompt.value) ? { ...e, files: (e.files || []).filter(f => !/Llama/i.test(f)) } : e);
    const cargarListos = async () => {
      if (listos) return listos;
      try { const r = await fetch('/phane/api/kimodo_listos'); listos = r.ok ? ((await r.json()).prompts || []).map(norm).filter(Boolean) : []; } catch { listos = []; }
      return listos;
    };
    const listosBox = h('div', { class: 'note mv-listos hide' });
    const drawListos = async () => {
      const show = llamaFalta() || falloLlama;
      listosBox.classList.toggle('hide', !show);
      if (!show) return;
      await cargarListos();
      listosBox.innerHTML = '';
      listosBox.append(
        h('div', {}, h('b', {}, falloLlama ? '⚠️ Ese prompt es nuevo y Kimodo necesita Llama-3-8B para leerlo.' : '🕺 Sin Llama-3-8B también puedes crear movimientos.'),
          ' ', 'Los que ya se leyeron antes salen sin Llama: elige uno (puedes cambiar duración, cámara y semilla).'));
      if (!listos.length) { listosBox.append(h('div', { class: 'muted' }, 'Todavía no hay movimientos listos en esta PC.')); return; }
      listosBox.append(h('div', { class: 'chips mv-chips', 'data-noi18n': '' }, ...listos.map(t => h('button', { class: 'chip', title: t, onclick: () => {
        prompt.value = t; falloLlama = false; upd(); prompt.textarea.focus();
      } }, t.replace(/^\s*a\s+person\s+/i, '').replace(/\n/g, ' → ').slice(0, 60)))));
    };
    core.on('error', m => { if (/FALTA_LLAMA/.test(String(m))) { falloLlama = true; drawListos(); listosBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } });
    const prompt = kit.promptBox({ key: 'movimiento', ideas: IDEAS, rows: 3,
      placeholder: 'Qué hace (en inglés, empezando con "A person ..."). Ej.: "A person jumps forward and strikes down with a sword". Varias líneas = varias acciones seguidas.' });
    const secs = kit.chips([[2, '2 s'], [3, '3 s'], [5, '5 s'], [8, '8 s'], [10, '10 s']], { key: 'movimiento.secs', value: 5, onChange: () => upd() });
    const vista = kit.chips(VISTAS.map(([v, l]) => [v, l]), { key: 'movimiento.vista', value: 'frente', onChange: () => upd() });
    const maniquiVista = kit.chips(VISTAS.map(([v, l]) => [v, l]), { key: 'movimiento.maniquiVista', value: 'tres_cuartos_izq' });
    const seed = h('input', { type: 'number', class: 'mv-in', min: 0, placeholder: 'al azar' });
    const feet = h('input', { type: 'checkbox' }); feet.checked = core.store.get('movimiento.feet', true);
    feet.onchange = () => core.store.set('movimiento.feet', feet.checked);
    const note = h('div', { class: 'note' });

    const opts = () => ({ prompt: prompt.value.trim(), secs: +secs.value || 5, vista: vista.value, cleanFeet: feet.checked,
      seed: seed.value === '' ? undefined : Math.max(0, Math.round(+seed.value)) });
    const upd = () => {
      const miss = engines.missingFiles(e, core.state.installed);
      const msgs = [];
      if (miss.some(m => /Llama/i.test(m))) msgs.push('⬇ Falta <b>Llama-3-8B</b> (16 GB), el lector de texto de Kimodo (solo para prompts nuevos). '
        + 'Dale doble clic a <code>custom_nodes\\phane\\kimodo\\download_llama.bat</code>: lo baja sin token ni cuenta, desde un espejo abierto con los mismos archivos que el de Meta.'
        + (esListo(prompt.value) ? '<br>✅ Este prompt ya está leído: sale sin Llama.' : ''));
      if (miss.some(m => /Kimodo-SOMA/i.test(m))) msgs.push('⬇ Falta Kimodo (custom_nodes\\phane\\kimodo). Ver el README de Phane.');
      if (/[áéíóúñ¿¡]/i.test(prompt.value)) msgs.push('💬 Kimodo entiende mejor el <b>inglés</b> ("A person …"): las acciones en español salen menos fieles.');
      note.innerHTML = msgs.join('<br>');
      gen.update();
      drawListos();
    };
    const ta = prompt.textarea, saveTxt = ta.oninput;   // las ideas llaman a oninput directo (no disparan el evento)
    ta.oninput = () => { saveTxt(); upd(); };

    const gen = kit.genButton('🕺 Crear movimiento', async () => {
      const o = opts();
      if (!o.prompt) { kit.toast('Escribe qué movimiento quieres (en inglés, "A person ...").', 'err'); return; }
      // un prompt nuevo carga Llama-3-8B en la CPU (~16 GB de RAM, en otro proceso): que ComfyUI suelte su caché de modelos antes
      try { await fetch('/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }); } catch { /* */ }
      if (esListo(o.prompt)) o.newText = false;   // ya leído: sin Llama y más rápido
      await kit.generar(engFor(), o, `🕺 ${o.prompt.replace(/^\s*a\s+person\s+/i, '').slice(0, 40)} · ${o.secs} s`);
    }, () => kit.estimateText(engFor(), { ...opts(), ...(esListo(prompt.value) && { newText: false }) }));
    core.on('models', () => upd());
    cargarListos().then(() => upd());

    root.append(
      h('h1', {}, '🕺 Movimiento por texto'),
      h('p', { class: 'sub' }, 'Escribe una acción y NVIDIA Kimodo crea la animación 3D de cuerpo completo: un maniquí para Recast, esqueletos para la pose exacta y un BVH para tu juego. Sin fotos ni videos de referencia.'),
      kit.step(1, '¿Qué movimiento?', '(en inglés, una o dos acciones)'), prompt,
      kit.step(2, 'Duración', '(por acción; máx. 10 s)'), secs,
      kit.step(3, 'Cámara'), vista,
      h('div', { class: 'mv-row' }, h('span', { class: 'engine-lbl' }, 'Semilla'), seed,
        h('label', { class: 'img-check', title: 'Post-proceso oficial de Kimodo: quita el patinado de pies' }, feet, '🦶 Limpiar pies')),
      note, listosBox, gen,
      kit.step(4, 'Ángulo del maniquí', '(para 🧍 Maniquí de este cuadro)'), maniquiVista,
      h('div', { class: 'note mv-how', html: '<b>Qué sale y cómo usarlo</b><ul>'
        + '<li><b>Ver 1 · maniquí</b> → <b>🎭 Usar en Recast</b>: tu personaje hace ese movimiento (pon su foto de cuerpo completo).</li>'
        + '<li><b>Ver 2 · esqueleto</b> → pausa y <b>🎯 Pose de este cuadro</b> para sacar el esqueleto exacto de ese instante.</li>'
        + '<li><b>Lo mejor para imágenes:</b> pausa el maniquí o el esqueleto donde quieras → <b>🧍 Maniquí de este cuadro</b> (con el ángulo de arriba) → en el visor <b>🧍 Copiar su pose</b>. En Imagen elige tu Personaje (hoja de cuerpo completo con <b>fondo liso</b>) y describe la expresión y el escenario: sale en ~1 min con calidad de estudio.</li>'
        + '<li><b>Ver 3+ · poses clave</b> → <b>🧍 Copiar su pose</b>: el esqueleto va a la pose exacta vieja (Z-Image).</li>'
        + '<li><b>🦴 BVH para tu juego</b>: animación 3D a 30 fps con T-pose de reposo (Blender → retarget a tu rig / Mixamo).</li>'
        + '<li>Kimodo sabe de caminar, correr, pelear, bailar, gestos y estilos (cansado, sigiloso, zombi…). No ve objetos: la espada o el arco los pones luego con el prompt de Imagen/Recast.</li></ul>' }));
    ui = { prompt };
    upd();
  },
  receive(p) {
    if (ui && p?.prompt) ui.prompt.value = p.prompt;
  },
};
