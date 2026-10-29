// Página ✨ EFECTOS (estilo Effects): grilla grande con vista previa, filtros, Mix de 2,
// tu foto + "¿qué hay en la imagen?" para efectos (I2V) o solo texto para estilos de video (T2V).
// Usa el motor de video Wan (Ligero / High End) con las LoRAs Remade-AI en ambos expertos, fuerza 1.
import { EFFECTS, FX_GROUPS, effectById, fillEffect } from '../data/effects.js';
import { toggle, loraNameOf } from './video.js';
import { thumbOf } from '../data/fx_thumbs.js';

const SOUND_ID = 'sound.mmaudio';
const CSS = `
.pg[data-id="efectos"] .fx-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr));max-height:560px;overflow:auto;padding-right:4px}
.pg[data-id="efectos"] .fx-grid .card-lbl{font-size:12.5px;font-weight:600}
.pg[data-id="efectos"] .fx-grid .card-badge{color:var(--exp)}
.pg[data-id="efectos"] .fx-sel{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;font-size:12.5px;color:var(--mute)}
.pg[data-id="efectos"] .fx-sel .chip{padding:4px 10px;font-size:12px}
.pg[data-id="efectos"] .fx-img{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;align-items:start}
.pg[data-id="efectos"] .fx-img input[type=text]{width:100%;margin-top:4px}
.pg[data-id="efectos"] .fx-opts{display:grid;grid-template-columns:110px minmax(0,1fr);gap:8px 10px;align-items:center}
.pg[data-id="efectos"] .fx-opts > span{font-size:12.5px;color:var(--mute)}
@media (max-width:700px){.pg[data-id="efectos"] .fx-img{grid-template-columns:1fr}}
`;

let ui = null;
/** Las miniaturas .mp4 de la grilla salen negras hasta pasar el mouse: mostrar su primer cuadro. */
const posters = grid => grid.querySelectorAll('video').forEach(v => { v.preload = 'metadata'; if (!/#t=/.test(v.getAttribute('src'))) v.src = v.getAttribute('src') + '#t=0.1'; });

function setup(ctx) {
  ctx.addAction({ id: 'efectos.aplicar', label: '✨ Efectos', title: 'Aplicar un efecto (inflar, explotar, gigante verde, aura dorada…) a esta imagen',
    when: f => f.kind === 'img', run: (f, c) => c.goto('efectos', { file: f }) });
}

function render(root, ctx) {
  const { kit, core, engines } = ctx;
  const { h } = kit;
  setup(ctx);
  if (!document.getElementById('css-efectos')) document.head.append(h('style', { id: 'css-efectos' }, CSS));

  let ready = false;
  let sel = core.store.get('fx.sel', []).filter(id => effectById(id));
  const installed = fx => !!loraNameOf(core, fx.lora);
  const sndEngine = () => (engines.engineById ? engines.engineById(SOUND_ID) : null) || null;
  /** Motor efectivo: el del menú si usa LoRAs; si no, Wan según el switch de poder. */
  const eng = () => {
    const e = menu && menu.value;
    if (e && e.caps && e.caps.loras) return e;
    const he = engines.engineById('video.wan_he'), li = engines.engineById('video.wan');
    const ok = x => x && !engines.missingFiles(x, core.state.installed).length;
    return core.state.tier === 'highend' && ok(he) ? he : li || he || null;
  };

  /* ---------- 1. elegir efecto ---------- */
  const group = kit.chips(FX_GROUPS, { key: 'fx.group', onChange: () => draw() });
  const items = () => EFFECTS.filter(e => group.value === 'all' || e.group === group.value);
  const grid = kit.cardGrid([], { multi: 2, value: sel, onChange: v => {
    const visible = new Set(items().map(i => i.id));
    const added = v.find(id => !sel.includes(id));
    let next = [...sel.filter(id => !visible.has(id)), ...v];
    if (added) {
      const kind = effectById(added).kind;
      const before = next.length;
      next = next.filter(id => effectById(id).kind === kind);
      if (next.length < before) kit.toast('Los efectos de foto y los estilos de video no se mezclan: dejé el último que elegiste.', 'info', 5000);
    }
    sel = next.slice(-2);
    core.store.set('fx.sel', sel);
    draw();
  } });
  grid.classList.add('fx-grid');
  const selRow = h('div', { class: 'fx-sel' });

  /* ---------- 2a. tu imagen (efectos I2V) ---------- */
  const img = kit.slot({ kind: 'image', tag: 'Tu foto', empty: '📷 <b>Tu imagen</b><br>arrastra, pega<br>o haz clic', onChange: () => refresh() });
  kit.pasteInto([img], () => ctx.isActive('efectos'));
  const subject = h('input', { type: 'text', placeholder: 'ej. man in a blue suit · red sports car · cat' });
  subject.value = core.store.get('fx.subject', '');
  subject.oninput = () => { core.store.set('fx.subject', subject.value); gen.update(); };
  const imgBox = h('div', {},
    kit.step(2, 'Tu imagen', '(el efecto se aplica sobre ella)'),
    h('div', { class: 'fx-img' }, img,
      h('div', {}, h('b', {}, '¿Qué hay en la imagen?'), subject,
        h('div', { class: 'note' }, 'Pocas palabras en inglés y sin "a / the". Ayuda a que el efecto salga mejor. Si lo dejas vacío uso "person".'))));

  /* ---------- 2b. tu escena (estilos T2V) ---------- */
  const scene = kit.promptBox({ placeholder: 'Describe la escena (mejor en inglés). Vacío = la escena de ejemplo del estilo.', key: 'fx.scene', rows: 3 });
  scene.textarea.addEventListener('input', () => gen.update());
  const sceneBox = h('div', {}, kit.step(2, 'Tu escena', '(los estilos crean el video solo con texto)'), scene);
  const pickHint = h('div', { class: 'note' }, '👆 Elige un efecto arriba para empezar.');

  /* ---------- 3. motor y formato ---------- */
  const menu = kit.engineMenu('video', { key: 'efectos', filter: e => !!(e.caps && e.caps.loras), onChange: () => refresh(true) });
  const engNote = h('div', { class: 'note' });
  const qChips = kit.chips([['draft', 'Borrador']], { onChange: v => { const e = eng(); if (e) core.store.set('video.q.' + e.id, v); refresh(); } });
  const secsChips = kit.chips([[3, '3 s'], [5, '5 s']], { key: 'fx.secs', value: 5, onChange: () => refresh() });
  const arChips = kit.chips([['16:9', '▭ 16:9'], ['9:16', '▯ 9:16'], ['1:1', '◻ 1:1']], { key: 'fx.ar', onChange: () => refresh() });
  const arLbl = h('span', {}, 'Formato');
  const boostT = toggle(kit, core, '🔥 Más acción', 'fx.boost', { title: 'Movimientos más grandes y dinámicos (tarda ~2×)', onChange: () => refresh() });
  const soundT = toggle(kit, core, '🔊 Sonido automático', 'fx.sound', { title: 'Al terminar, crea el sonido del video con MMAudio', onChange: () => refresh() });
  const gen = kit.genButton('✨ Crear efecto', () => go(), () => estimate());

  root.append(
    h('h1', {}, '✨ Efectos'),
    h('p', { class: 'sub' }, 'Elige un efecto, pon tu foto y listo. Combina hasta 2 (Mix). Los estilos de video solo necesitan una idea.'),
    kit.step(1, 'Elige el efecto', '(hasta 2 para mezclar)'), group, h('div', { style: { height: '8px' } }), grid, selRow,
    pickHint, imgBox, sceneBox,
    kit.step(3, 'Motor y formato'), menu, engNote,
    h('div', { class: 'fx-opts', style: { marginTop: '10px' } },
      arLbl, arChips,
      h('span', {}, 'Duración'), secsChips,
      h('span', {}, 'Calidad'), qChips,
      h('span', {}, 'Extras'), h('div', { class: 'row' }, boostT, soundT)),
    gen,
  );

  /* ---------- lógica ---------- */
  function draw() {
    grid.setItems(items().map(fx => {
      const ok = installed(fx);
      return { id: fx.id, label: `${fx.icon} ${fx.label}`, preview: thumbOf(fx.id) || fx.preview, icon: fx.icon,
        badge: !ok ? '⬇' : fx.kind === 't2v' ? 'ESTILO' : '', disabled: !ok,
        title: !ok ? 'La LoRA aún se está descargando' : fx.kind === 't2v' ? 'Estilo de video: solo texto, sin foto' : 'Efecto sobre tu foto' };
    }));
    grid.value = sel;
    posters(grid);
    selRow.innerHTML = '';
    if (sel.length) {
      selRow.append(h('span', {}, sel.length > 1 ? 'Mix:' : 'Elegido:'));
      sel.forEach(id => { const fx = effectById(id); selRow.append(h('button', { class: 'chip on', title: 'Quitar', onclick: () => { sel = sel.filter(x => x !== id); core.store.set('fx.sel', sel); draw(); } }, `${fx.icon} ${fx.label} ✕`)); });
    }
    refresh();
  }

  function refresh(engineChanged) {
    if (!ready) return;
    const e = eng(), c = (e && e.caps) || {};
    if (engineChanged && e) {
      const qs = c.qualities || [['final', 'Normal']];
      qChips.setOptions(qs);
      const want = core.store.get('video.q.' + e.id, c.qDefault || qs[0][0]);
      qChips.value = qs.some(q => q[0] === want) ? want : qs[0][0];
    }
    const kind = sel.length ? effectById(sel[0]).kind : null;
    pickHint.classList.toggle('hide', !!kind);
    imgBox.classList.toggle('hide', kind !== 'i2v');
    sceneBox.classList.toggle('hide', kind !== 't2v');
    arLbl.classList.toggle('hide', kind !== 't2v');
    arChips.classList.toggle('hide', kind !== 't2v');
    boostT.classList.toggle('hide', !c.boost);
    soundT.classList.toggle('hide', !sndEngine());
    const m = menu.value;
    engNote.textContent = !e ? 'No hay motor Wan disponible todavía.'
      : m && m !== e ? `Los efectos usan LoRAs de Wan: se usará ${e.name}.` : (e.desc || '');
    gen.update();
  }

  function collect(strict) {
    const e = eng();
    if (!e) return { err: 'No hay motor Wan disponible todavía.' };
    const fxs = sel.map(effectById).filter(Boolean);
    if (!fxs.length) return { err: 'Elige un efecto 🙂' };
    const kind = fxs[0].kind;
    if (strict && kind === 'i2v' && !img.value) return { err: 'Pon tu imagen: el efecto se aplica sobre ella.', flash: img.el };
    const loras = [];
    for (const fx of fxs) {
      const name = loraNameOf(core, fx.lora);
      if (!name) return { err: `La LoRA de "${fx.label}" aún se está descargando.` };
      loras.push({ name, strength: fx.lora.strength ?? 1, target: fx.lora.target || 'both' });
    }
    const p = kind === 'i2v'
      ? fxs.map(fx => fillEffect(fx, subject.value)).join(' ')
      : fxs.reduceRight((acc, fx) => fillEffect(fx, acc), scene.value);
    const o = { mode: kind === 'i2v' ? 'i2v' : 't2v', prompts: [p], secs: +secsChips.value || 5, quality: qChips.value,
      ar: arChips.value, start: kind === 'i2v' ? img.value : null, loras, boost: !!(e.caps && e.caps.boost) && boostT.value };
    const label = `✨ ${fxs.map(fx => fx.label).join(' + ')}${o.boost ? ' · 🔥' : ''}`;
    const sound = soundT.value && sndEngine() ? sndEngine() : null;
    return { e, o, label, sound };
  }

  function estimate() {
    const r = collect(false);
    if (r.err) return r.err;
    let t = kit.estimateText(r.e, r.o);
    if (r.sound) { try { t += ` + 🔊 sonido ~${core.fmt(core.estimate(r.sound, { video: { secs: r.o.secs }, secs: r.o.secs, prompt: '' }))}`; } catch { /* */ } }
    return t;
  }

  async function go() {
    const r = collect(true);
    if (r.err) {
      kit.toast(r.err, 'err');
      if (r.flash) { r.flash.classList.add('over'); setTimeout(() => r.flash.classList.remove('over'), 1200); }
      return;
    }
    const after = r.sound ? async file => {
      const v = await core.asInput(file);
      await kit.generar(r.sound, { video: v, prompt: '', secs: r.o.secs }, `🔊 Sonido · ${r.label.replace(/^✨\s*/, '')}`);
    } : undefined;
    await kit.generar(r.e, r.o, r.label, { after });
  }

  core.on('loras', () => draw());
  core.on('models', () => refresh(true));
  core.on('tier', () => refresh(true));
  ready = true;
  draw();
  refresh(true);

  ui = {
    img, subject, scene, refresh,
    setEffect: ids => {
      const list = [].concat(ids).filter(id => effectById(id));
      if (!list.length) return;
      const kind = effectById(list[list.length - 1]).kind;
      sel = list.filter(id => effectById(id).kind === kind).slice(-2);
      core.store.set('fx.sel', sel);
      draw();
    },
  };
}

async function receive(p, ctx) {
  if (!ui || !p) return;
  const f = p.file || p.image || p.start;
  if (f) {
    if (f.kind && f.kind !== 'img') ctx.kit.toast('Los efectos se aplican sobre una imagen 🙂', 'err');
    else await ui.img.set(f);
  }
  if (p.effect) ui.setEffect(p.effect);
  if (p.subject) { ui.subject.value = p.subject; ui.subject.oninput(); }
  ui.refresh();
}

export default { id: 'efectos', title: 'Efectos', icon: '✨', order: 50, render, receive, setup };
