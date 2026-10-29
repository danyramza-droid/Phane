// Página "🎮 Juego" (18-oct): escribes acciones con verbos fuertes y de una vez sale, por cada acción, el movimiento 3D de Kimodo
// (BVH para el motor del juego), el maniquí 3D en cada ángulo y la imagen de cada héroe en esa pose.
// Cadena: motion.kimodo → motion.kimodo_frame (maniquí, cuadro más expresivo, un ángulo por trabajo) → pose con maniquí por héroe.
// Ruta de imagen igual que en 🖼️ Imagen: perfil = Qwen 2.1 + vista de perfil del héroe; espalda = AnyPose; 💼 = todo AnyPose.
import * as personajes from '../personajes.js';
import { motionName } from '../graphs/motion.js';
import { maniquiView, sheetOf } from '../graphs/pose.js';

const MANIQUI_ENGINE = 'image.pose_maniqui', MANIQUI_COMERCIAL = 'image.pose_anypose';
// ángulos del maniquí (nombres de VISTAS del nodo); "De lado" se sobregira a 105° en el nodo
const ANGULOS = [['frente', 'Frente'], ['tres_cuartos_izq', '¾'], ['lado_izq', 'Perfil'], ['espalda', 'Espalda']];
// verbos fuertes = más acción (probado 18-oct con las 16 acciones de Toy Attack)
const IDEAS = [
  ['Espadazo en salto', 'A person leaps high and slams a sword down with both hands.'],
  ['Embestida', 'A person charges forward and violently rams with the shoulder.'],
  ['Hechizo', 'A person thrusts both hands forward and blasts a powerful spell.'],
  ['Flechazo', 'A person draws a bow hard, aims and releases an arrow.'],
  ['Golpe recibido', 'A person is violently hit in the chest and flies backward.'],
  ['Esquiva', 'A person dives and rolls quickly to the side.'],
  ['Victoria', 'A person raises both fists high and jumps in celebration.'],
];
const SEP = '\n';

let ui = null;
// recibir golpe: el cuadro del golpe (-1) la deja parada; el "más distinto al cuadro 0" (-2) es cabeza atrás y pie arriba
// (tanda 2, 18-oct). Además el puente inclina y levanta el maniquí en estas acciones (kimodo_puente.py: inclina, 19-oct).
const RECIBE = /\b(is|gets|being)\s+(violently\s+)?(hit|struck|punched|kicked|knocked|shot)\b|\bflies\s+back|\bknocked\s+(back|down)|\bfalls?\s+back/i;
// el resto (27-oct): -3 = salto/despegue → pelvis más alta; baile, choque de manos, etc. → máxima extensión (cuadro_pico)
const framePara = a => (RECIBE.test(a) ? -2 : -3);
const actionText = a =>a.replace(/^\s*an?\s+(person|man|woman)\s+/i, '').replace(/\.\s*$/, '');

export default {
  id: 'juego', title: 'Juego', icon: '🎮', order: 63,
  render(root, ctx) {
    const { kit, core, engines } = ctx; const { h } = kit;
    root.append(h('style', {}, `
      .pg[data-id="juego"] .jg-sel{display:flex;flex-wrap:wrap;gap:6px}
      .pg[data-id="juego"] .jg-res{display:grid;gap:12px;margin-top:14px}
      .pg[data-id="juego"] .jg-card{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--panel2)}
      .pg[data-id="juego"] .jg-card h3{margin:0 0 6px;font-size:14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .pg[data-id="juego"] .jg-card h3 small{font-weight:400;color:var(--muted)}
      .pg[data-id="juego"] .jg-row{display:flex;gap:6px;flex-wrap:wrap;align-items:flex-start}
      .pg[data-id="juego"] .jg-row a{display:block;width:96px}
      .pg[data-id="juego"] .jg-row img{width:96px;height:128px;object-fit:cover;border-radius:6px;background:var(--line)}
      .pg[data-id="juego"] .jg-row span{font-size:11px;color:var(--muted);display:block;text-align:center}
      .pg[data-id="juego"] .jg-bvh{font-size:12px}`));

    const eMov = engines.engineById('motion.kimodo'), eCuadro = engines.engineById('motion.kimodo_frame');
    const prompt = kit.promptBox({ key: 'juego', ideas: IDEAS, rows: 4,
      placeholder: 'Una acción por línea, en inglés y con verbos fuertes. Ej.: "A person leaps high and slams a sword down with both hands."' });
    const secs = kit.chips([[2, '2 s'], [3, '3 s'], [4, '4 s'], [5, '5 s']], { key: 'juego.secs', value: 3, onChange: () => upd() });

    // selección múltiple con chips (héroes y ángulos)
    const multi = (key, def) => {
      let v = new Set(core.store.get(key, def));
      const el = h('div', { class: 'jg-sel' });
      el.draw = opts => {
        el.innerHTML = '';
        for (const [val, label] of opts) el.append(h('button', { class: 'chip' + (v.has(val) ? ' on' : ''),
          onclick: () => { v.has(val) ? v.delete(val) : v.add(val); core.store.set(key, [...v]); el.draw(opts); upd(); } }, label));
      };
      Object.defineProperty(el, 'value', { get: () => [...v], set: nv => { v = new Set(nv); } });
      return el;
    };
    const heroes = multi('juego.heroes', []);
    const angulos = multi('juego.angulos', ['frente', 'tres_cuartos_izq', 'lado_izq', 'espalda']); angulos.draw(ANGULOS);
    let all = [];
    const drawHeroes = async () => { all = (await personajes.list()).filter(p => (p.photos || []).length);
      // 29-oct: la primera vez (nunca eligió héroe) va Phany, la mascota de ejemplo, para que "Crear todo" funcione de una
      if (core.store.get('juego.heroes', undefined) === undefined) { const ph = all.find(p => /^(phany|lumi)$/i.test(p.name)); if (ph) heroes.value = [ph.id]; }
      heroes.draw(all.map(p => [p.id, p.name])); upd(); };
    core.on('personajes', drawHeroes);

    const mkCheck = (key, def, text, title) => { const i = h('input', { type: 'checkbox' }); i.checked = core.store.get(key, def);
      i.onchange = () => { core.store.set(key, i.checked); upd(); }; return { i, row: h('label', { class: 'img-check', title }, i, text) }; };
    const liso = mkCheck('juego.liso', true, '⬜ Fondo liso (para sprites y recortes)', 'Fondo gris plano: fácil de recortar para el juego.');
    const full = mkCheck('juego.full', false, '🐢 Calidad completa (~5 min por imagen; sin marcar: turbo ~1 min)', 'Solo para la ruta Qwen 2.1.');
    const comercial = mkCheck('juego.comercial', true, '💼 Uso comercial (todo con AnyPose, Apache)', 'Qwen-Image 2.1 es de licencia no comercial.');
    const escena = h('input', { type: 'text', class: 'mv-in', style: { width: '100%' }, placeholder: 'Escenario (opcional, en inglés). Ej.: in a torch-lit stone dungeon' });
    escena.value = core.store.get('juego.escena', ''); escena.oninput = () => { core.store.set('juego.escena', escena.value); upd(); };
    const note = h('div', { class: 'note' });
    const res = h('div', { class: 'jg-res' });

    const lines = () => prompt.value.split(SEP).map(s => s.trim()).filter(Boolean);
    const chosen = () => all.filter(p => heroes.value.includes(p.id));
    const missing = e => !e || engines.missingFiles(e, core.state.installed).length > 0;
    // 29-oct: si no está la ruta de Qwen 2.1 + VNCCS, frente y ¾ también van con AnyPose (antes fallaba en una instalación nueva)
    const imgEngine = view => engines.engineById(comercial.i.checked || view === 'back' || missing(engines.engineById(MANIQUI_ENGINE)) ? MANIQUI_COMERCIAL : MANIQUI_ENGINE);
    const views = () => angulos.value.map(a => (a === 'espalda' ? 'back' : a === 'lado_izq' ? 'side' : null));
    function totals() {
      const n = lines().length, hs = chosen().length, vs = views();
      let secsT = n * ((eMov && core.checkEngine(eMov, { secs: +secs.value }).secs) || 90) + n * vs.length * 10;
      for (const v of vs) { const e = imgEngine(v); if (e) secsT += n * hs * (core.checkEngine(e, { turbo: !full.i.checked }).secs || 120); }
      return { n, hs, imgs: n * hs * vs.length, secsT };
    }
    const upd = () => {
      const msgs = [], t = totals();
      if (missing(eMov) || missing(eCuadro)) msgs.push('⬇ Falta Kimodo o su lector de texto: revisa la página 🕺 Movimiento.');
      if (!t.hs) msgs.push('👤 Elige al menos un héroe (Personaje con fotos).');
      if (/[áéíóúñ¿¡]/i.test(prompt.value)) msgs.push('💬 Kimodo entiende mejor el <b>inglés</b> ("A person …").');
      if (comercial.i.checked && missing(engines.engineById(MANIQUI_COMERCIAL))) msgs.push('⬇ Falta AnyPose para la ruta comercial.');
      for (const p of chosen()) {
        if (views().includes('side') && !comercial.i.checked && !p.vistas?.side) msgs.push(`📐 ${core.esc(p.name)} no tiene vista de perfil guardada: el perfil sale menos fiel.`);
      }
      if (t.n && t.hs) msgs.push(`🎮 ${t.n} ${t.n > 1 ? 'acciones' : 'acción'} × ${t.hs} héroe${t.hs > 1 ? 's' : ''} × ${views().length} ángulo${views().length > 1 ? 's' : ''} = <b>${t.imgs} imágenes</b> + ${t.n} BVH · ≈ ${core.fmt(t.secsT)} en total. Los trabajos van uno por uno en la cola.`);
      note.innerHTML = msgs.join('<br>');
      gen.update();
    };
    const ta = prompt.textarea, saveTxt = ta.oninput; ta.oninput = () => { saveTxt(); upd(); };

    // ---- tarjeta de resultados por acción ----
    function card(action) {
      const st = h('small', {}, 'en cola…'), bvh = h('span', { class: 'jg-bvh' }), man = h('div', { class: 'jg-row' }), img = h('div', { class: 'jg-row' });
      const el = h('div', { class: 'jg-card' }, h('h3', {}, actionText(action), st, bvh), man, img);
      res.prepend(el);
      const thumb = (f, label) => h('a', { href: core.urlOf(f), target: '_blank', title: f.filename }, h('img', { src: core.urlOf(f), loading: 'lazy' }), h('span', {}, label));
      return { st: t => { st.textContent = t; }, bvh: name => { bvh.innerHTML = ''; bvh.append(h('a', { href: core.urlOf({ filename: `${name}.bvh`, subfolder: 'phane/kimodo', type: 'output' }), download: `${name}.bvh` }, '🦴 BVH')); },
        man: (f, l) => man.append(thumb(f, l)),
        img: (f, l) => { img.append(thumb(f, l)); const n = img.children.length;
          st.textContent = n >= (el.expect || 0) ? `✅ listo (${n} imágenes)` : `generando imágenes… ${n}/${el.expect}`; },
        expect: n => { el.expect = n; } };
    }

    async function lanzar(action, hs, angs, c) {
      const o = { prompt: action, secs: +secs.value || 3, vista: 'frente', cleanFeet: true };
      const scene = liso.i.checked ? 'plain flat light grey studio background, no scenery' : escena.value.trim();
      const job = await kit.generar(eMov, o, `🎮 ${actionText(action).slice(0, 40)}`, { confirmed: true, after: async (file, outs) => {
        const name = motionName((outs || []).find(f => motionName(f)) || file);
        if (!name) { c.st('⚠️ no encontré el movimiento'); return; }
        c.bvh(name); c.st('movimiento listo · sacando maniquíes…');
        for (const a of angs) {
          await kit.generar(eCuadro, { name, frame: framePara(action), vista: a, maniqui: true }, `🧍 ${name} · ${a}`, { confirmed: true, after: async (f2, outs2) => {
            const m = (outs2 || []).find(f => /_maniqui_f\d+/i.test(f.filename || '')) || f2;
            const view = maniquiView(m);
            c.man(m, ANGULOS.find(x => x[0] === a)?.[1] || a);
            for (const p of hs) {
              const e = imgEngine(view), sheet = sheetOf(p);
              if (!e || missing(e) || !sheet) { c.st(`⚠️ ${p.name}: falta motor o foto`); continue; }
              // recibir golpe: describir la consecuencia física (receta del handoff); el maniquí ya viene inclinado y en el aire
              const golpe = RECIBE.test(action) ? 'knocked off the feet and thrown backward through the air, body arched back, arms flung out, head snapped back, pained grimace' : '';
              const io = { prompt: [`The character ${actionText(action)}`, golpe, scene].filter(Boolean).join(', ') + '.', count: 1,
                refs: [{ ref: sheet.ref, w: sheet.w, h: sheet.h }], pose: { ref: m.ref || `${m.subfolder}/${m.filename} [output]`, w: m.w || 768, h: m.h || 1024 } };
              const cd = [p.desc, p.arma].filter(Boolean).join('; ');   // arma: campo aparte, solo rutas de maniquí
              if (cd) io.charDesc = cd;
              if (e.id === MANIQUI_ENGINE) io.turbo = !full.i.checked;
              if (view) { io.view = view; const vr = e.id === MANIQUI_ENGINE && p.vistas?.[view]; if (vr) io.viewRef = { ref: vr.ref, w: vr.w, h: vr.h }; }
              await kit.generar(e, io, `🎮 ${p.name.replace(/\s*\(.*\)/, '')} · ${actionText(action).slice(0, 24)} · ${a}`,
                { confirmed: true, after: f3 => c.img(f3, `${p.name.replace(/\s*\(.*\)/, '')} · ${ANGULOS.find(x => x[0] === a)?.[1] || a}`) });
            }
          } });
        }
      } });
      if (!job) c.st('⚠️ no se pudo encolar');
    }

    const gen = kit.genButton('🎮 Crear todo', async () => {
      const acts = lines(), hs = chosen(), angs = angulos.value, t = totals();
      if (!acts.length) return kit.toast('Escribe al menos una acción (en inglés, "A person ...").', 'err');
      if (!hs.length) return kit.toast('Elige al menos un héroe.', 'err');
      if (!angs.length) return kit.toast('Elige al menos un ángulo.', 'err');
      const ok = await kit.confirmBox('Crear todo para el juego', `<p>${t.n} acción(es) × ${t.hs} héroe(s) × ${angs.length} ángulo(s) = <b>${t.imgs} imágenes</b> y ${t.n} BVH.</p><p>≈ ${core.fmt(t.secsT)} en tu PC. Los trabajos se encadenan solos y van uno por uno.</p>`);
      if (!ok) return;
      try { await fetch('/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }); } catch { /* */ }
      for (const a of acts) { const c = card(a); c.expect(hs.length * angs.length); await lanzar(a, hs, angs, c); }
    }, () => { const t = totals(); return t.imgs ? `${t.imgs} imágenes + ${t.n} BVH · ≈ ${core.fmt(t.secsT)}` : ''; });

    root.append(
      h('h1', {}, '🎮 Juego'),
      h('p', { class: 'sub' }, 'Escribe las acciones de tus héroes y sale todo de una vez: la animación 3D (BVH para tu motor), el maniquí en cada ángulo y la imagen de cada héroe en esa pose, con su diseño.'),
      kit.step(1, '¿Qué acciones?', '(una por línea, en inglés, verbos fuertes)'), prompt,
      kit.step(2, 'Duración de cada acción'), secs,
      kit.step(3, 'Héroes'), heroes,
      kit.step(4, 'Ángulos'), angulos,
      kit.step(5, 'Imagen'), liso.row, escena, full.row, comercial.row,
      note, gen,
      h('div', { class: 'note', html: '<b>Cómo elige la ruta:</b> frente y ¾ con Qwen 2.1 + VNCCS; perfil igual pero con la vista de perfil del héroe (campo <code>vistas</code> del Personaje); espalda con AnyPose. El maniquí sale del cuadro más expresivo de cada acción.' }),
      res);
    ui = { prompt };
    drawHeroes();
  },
  receive(p) { if (ui && p?.prompt) ui.prompt.value = p.prompt; },
};
