// Página 🗣️ Avatares (estilo Lipsync Studio / Speak): foto + guion (o tu audio) -> la persona habla.
// También exporta helpers de UI que reutiliza pages/audio.js (selector de idioma, duración de medios, detectar audio en un video).
import { LANGS, speechSecs } from '../graphs/audio.js';
import * as personajes from '../personajes.js';

const MAIN_LANGS = LANGS.slice(0, 7).map(l => l[0]);   // es en pt fr it de ja

const TALK_IDEAS = [
  ['Saludo', 'Hola, ¿qué tal? Bienvenidos a mi canal. Hoy les traigo algo que les va a encantar, así que quédense hasta el final.'],
  ['Anuncio', '¡Atención! Solo por esta semana, todo al cincuenta por ciento. No te lo puedes perder, corre a la tienda.'],
  ['Historia', 'Había una vez, en un pueblo junto al mar, un pescador que conocía todos los secretos de la niebla.'],
  ['Motivación', 'No importa cuántas veces caigas. Lo importante es levantarte una vez más, y otra, y otra.'],
  ['Producto', 'Este es el nuevo termo que mantiene tu café caliente todo el día. Ligero, resistente y con tapa antiderrames.'],
  ['Noticias', 'Buenas noches. Les damos la bienvenida al noticiero. Estas son las noticias más importantes del día.'],
  ['En inglés', 'Hey everyone, welcome back to the channel! Today I am going to show you something really cool.'],
];

/* ---------------- helpers compartidos (los usa también pages/audio.js) ---------------- */

/** Selector de idioma de voz: 7 chips + "🌐 Otro…" con el resto de los 23 idiomas. .value -> código ISO. */
export function langPicker(ctx, { key, onChange } = {}) {
  const { h, chips } = ctx.kit;
  const others = LANGS.filter(([c]) => !MAIN_LANGS.includes(c));
  const sel = h('select', { title: 'Más idiomas' }, ...others.map(([c, l]) => h('option', { value: c }, l)));
  if (key) sel.value = ctx.core.store.get('lang.more.' + key, others[0][0]);
  const get = () => (ch.value === 'more' ? sel.value : ch.value);
  const draw = () => sel.classList.toggle('hide', ch.value !== 'more');
  const ch = chips([...LANGS.slice(0, 7), ['more', '🌐 Otro…']], { key: key ? 'lang.' + key : null, onChange: () => { draw(); onChange && onChange(get()); } });
  sel.onchange = () => { if (key) ctx.core.store.set('lang.more.' + key, sel.value); onChange && onChange(get()); };
  const el = h('div', { class: 'row' }, ch, sel);
  draw();
  Object.defineProperty(el, 'value', {
    get,
    set: v => { if (MAIN_LANGS.includes(v)) ch.value = v; else if (others.some(o => o[0] === v)) { ch.value = 'more'; sel.value = v; } draw(); },
  });
  return el;
}

/** Duración en segundos de un audio/video (por URL), o null. */
export function mediaSecs(url, kind = 'audio') {
  return new Promise(res => {
    if (!url) return res(null);
    const m = document.createElement(kind === 'video' ? 'video' : 'audio');
    m.preload = 'metadata'; m.muted = true;
    const done = v => { res(v); m.onloadedmetadata = m.onerror = null; };
    m.onloadedmetadata = () => done(Number.isFinite(m.duration) ? m.duration : null);
    m.onerror = () => done(null);
    setTimeout(() => done(null), 10000);
    m.src = url;
  });
}

/** ¿El video trae pista de audio? true/false, o null si no se pudo saber. Busca 'hdlr…soun' (MP4/MOV) o códecs A_* (WebM/MKV). */
export async function hasAudioTrack(url) {
  if (!url) return null;
  try {
    const r = await fetch(url);
    if (!r.ok || +(r.headers.get('content-length') || 0) > 400e6) return null;
    const b = new Uint8Array(await r.arrayBuffer());
    const at = (i, s) => { for (let j = 0; j < s.length; j++) if (b[i + j] !== s.charCodeAt(j)) return false; return true; };
    for (let i = 0, n = b.length - 16; i < n; i++) {
      if (b[i] === 0x68 && at(i, 'hdlr') && at(i + 12, 'soun')) return true;
      if (b[i] === 0x41 && b[i + 1] === 0x5f && (at(i, 'A_OPUS') || at(i, 'A_VORBIS') || at(i, 'A_AAC') || at(i, 'A_MPEG') || at(i, 'A_PCM'))) return true;
    }
    return false;
  } catch { return null; }
}

/** Resalta un momento una casilla (cuando falta algo). */
export function flash(slot) {
  const el = slot && (slot.el || slot);
  if (!el || !el.classList) return;
  el.classList.add('over'); setTimeout(() => el.classList.remove('over'), 1400);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

const fmtSecs = s => (s >= 60 ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s` : `${Math.round(s)} s`);
const short = (t, n = 36) => (t.length > n ? t.slice(0, n) + '…' : t);

function injectCss() {
  if (document.getElementById('css-avatares')) return;
  const st = document.createElement('style'); st.id = 'css-avatares';
  st.textContent = `
.pg[data-id=avatares] .av-info{font-size:12.5px;color:var(--mute);margin-top:6px}
.pg[data-id=avatares] .av-info b{color:var(--acc)}
.pg[data-id=avatares] .av-info .warn{color:var(--pro)}
.pg[data-id=avatares] .av-face{display:grid;grid-template-columns:minmax(0,1fr);gap:8px}
.pg[data-id=avatares] .pj select{flex:1;min-width:0}
.pg[data-id=avatares] input[type=text]{width:100%}
.pg[data-id=avatares] .chips + .slotwrap{margin-top:8px}`;
  document.head.append(st);
}

/* ---------------- página ---------------- */
const S = {};   // estado (render se llama una sola vez por sesión)

/** Registra las acciones del visor (idempotente). */
function setup(ctx) {
  ctx.addAction({ id: 'avatar.face', label: '🗣️ Que hable', title: 'Usar esta imagen como la cara de un avatar que habla',
    when: f => f.kind === 'img', run: (f, c) => c.goto('avatares', { file: f }) });
  ctx.addAction({ id: 'avatar.voice', label: '🎙️ Usar esta voz', title: 'Clonar esta voz para tu avatar',
    when: f => f.kind === 'aud', run: (f, c) => c.goto('avatares', { file: f, as: 'voice' }) });
  ctx.addAction({ id: 'avatar.audio', label: '🗣️ Ponerle cara', title: 'Hacer que un avatar diga exactamente este audio',
    when: f => f.kind === 'aud', run: (f, c) => c.goto('avatares', { file: f, as: 'audio' }) });
}

function render(root, ctx) {
  const { kit, core } = ctx; const { h } = kit;
  setup(ctx); injectCss();
  let ready = false;

  const menu = kit.engineMenu('avatar', { onChange: () => { if (ready) { syncQuality(); refresh(); } } });

  /* 1 · cara */
  const face = kit.slot({ kind: 'image', tag: 'Cara', empty: '📷 Arrastra la foto de quien habla<br><small>o haz clic · Ctrl+V para pegar</small>', onChange: () => refresh() });
  const pj = personajes.picker({ onPick: p => { if (p && p.photos && p.photos[0]) face.set(p.photos[0]); } });
  kit.pasteInto([face], () => ctx.isActive('avatares'));

  /* 2 · qué dice */
  const src = kit.chips([['tts', '✍️ Escribir el guion'], ['own', '🎙️ Usar mi propio audio']], { key: 'av.src', onChange: () => { drawSrc(); refresh(); } });
  const script = kit.promptBox({ placeholder: 'Escribe lo que va a decir. Ej: Hola, bienvenidos a mi canal…', ideas: TALK_IDEAS, key: 'av.script', rows: 4 });
  const prevInput = script.textarea.oninput;
  script.textarea.oninput = () => { prevInput && prevInput(); refresh(); };
  const own = kit.slot({ kind: 'audio', tag: 'Tu audio', empty: '🎙️ Arrastra tu audio (mp3, wav…)<br><small>la boca seguirá exactamente este audio</small>',
    onChange: async v => { S.ownSecs = v ? await mediaSecs(v.url, 'audio') : null; refresh(); } });

  /* 3 · idioma, 4 · voz, 5 · emoción */
  const lang = langPicker(ctx, { key: 'av', onChange: () => refresh() });
  const vmode = kit.chips([['default', '🔈 Voz por defecto'], ['clone', '🧬 Clonar una voz']], { key: 'av.vmode', onChange: () => { drawSrc(); refresh(); } });
  const clone = kit.slot({ kind: 'audio', tag: 'Voz a clonar', empty: '🧬 Arrastra 5–10 s de la voz a clonar<br><small>limpia, sin música de fondo</small>', onChange: () => refresh() });
  const expr = kit.range({ min: 0.25, max: 1.2, step: 0.05, value: 0.5, left: '😐 Calmado', right: '🤩 Expresivo', key: 'av.expr', onChange: () => refresh() });

  /* 6 · escena (opcional) */
  const scene = h('input', { type: 'text', placeholder: 'Ej: in a cozy home office, warm light, smiling (mejor en inglés)' });
  scene.value = core.store.get('av.scene', '');
  scene.oninput = () => core.store.set('av.scene', scene.value);

  /* 7 · calidad */
  const quality = kit.chips([['draft', '⚡ Borrador'], ['final', '🎞️ 480p']], { key: 'av.q', onChange: () => refresh() });
  const syncQuality = () => { const e = menu.value; quality.setOptions((e && e.caps && e.caps.qualities) || [['draft', '⚡ Borrador'], ['final', '🎞️ 480p']]); };

  const info = h('div', { class: 'av-info' });
  const gen = kit.genButton('Generar video hablando', () => go(), () => kit.estimateText(menu.value, opts()));
  const listenBtn = h('button', { class: 'go alt', onclick: () => listen() }, '🎧 Solo escuchar la voz (rápido)');

  const blkScript = h('div', {}, script);
  const blkOwn = h('div', {}, own, h('div', { class: 'note' }, 'Funciona con voz hablada o cantada. Si tiene música fuerte, los labios se sincronizan peor.'));
  const blkTts = h('div', {},
    kit.step(3, 'Idioma'), lang,
    kit.step(4, 'Voz'), vmode, clone,
    kit.step(5, 'Emoción', '(voz y cara)'), expr);

  root.append(
    h('h1', {}, '🗣️ Avatares'),
    h('p', { class: 'sub' }, 'Lipsync Studio: una foto + tu guion (o tu audio) y la persona habla con los labios sincronizados.'),
    menu,
    kit.step(1, '¿Quién habla?', '(cara visible, de frente y cerca)'), h('div', { class: 'av-face' }, pj, face),
    kit.step(2, '¿Qué dice?'), src, blkScript, blkOwn,
    blkTts,
    kit.step(6, 'Escena', '(opcional)'), scene,
    kit.step(7, 'Calidad'), quality,
    gen, info, listenBtn,
    h('div', { class: 'note' }, '💡 Tip: prueba primero en ⚡ Borrador; si te gusta, repite en 480p. Los resultados aparecen a la derecha.'));

  function drawSrc() {
    const ownMode = src.value === 'own';
    blkScript.classList.toggle('hide', ownMode);
    blkOwn.classList.toggle('hide', !ownMode);
    blkTts.classList.toggle('hide', ownMode);
    listenBtn.classList.toggle('hide', ownMode);
    clone.classList.toggle('hide', vmode.value !== 'clone');
  }
  function secsNow() { return src.value === 'own' ? (S.ownSecs || 0) : speechSecs(script.value, lang.value); }
  function opts() {
    const ownMode = src.value === 'own';
    const f = face.value;
    return {
      face: f ? { ref: f.ref, w: f.w, h: f.h } : null,
      text: ownMode ? '' : script.value,
      lang: lang.value, expr: expr.value,
      voice: !ownMode && vmode.value === 'clone' && clone.value ? { ref: clone.value.ref } : null,
      audio: ownMode && own.value ? { ref: own.value.ref } : null,
      secs: ownMode ? (S.ownSecs || 8) : undefined,
      quality: quality.value,
      prompt: scene.value.trim(),
    };
  }
  function refresh() {
    if (!ready) return;
    gen.update();
    const e = menu.value, s = secsNow(), max = e && e.caps && e.caps.maxSecs;
    info.innerHTML = '';
    if (s > 0) {
      info.append('🗣️ Unos ', h('b', {}, fmtSecs(s)), src.value === 'own' ? ' de audio' : ' de voz');
      if (max && s > max) info.append(' · ', h('span', { class: 'warn' }, `⚠️ ${e.name} llega hasta ${max} s: recórtalo o usa otro motor`));
      else if (e && e.id === 'avatar.humo' && s > 3.9) info.append(' · se arma en tramos de 3.9 s');
    }
  }
  async function go() {
    const e = menu.value, o = opts(), ownMode = src.value === 'own';
    if (!o.face) { flash(face); return kit.toast('Primero pon la foto de quien habla 📷', 'err'); }
    if (!ownMode && !o.text) { script.textarea.focus(); return kit.toast('Escribe lo que va a decir ✍️', 'err'); }
    if (ownMode && !o.audio) { flash(own); return kit.toast('Sube o arrastra tu audio 🎙️', 'err'); }
    if (!ownMode && vmode.value === 'clone' && !clone.value) { flash(clone); return kit.toast('Arrastra la voz a clonar, o elige "Voz por defecto".', 'err'); }
    const s = secsNow(), max = e && e.caps && e.caps.maxSecs;
    if (max && s > max) return kit.toast(`Dura ~${fmtSecs(s)} y ${e.name} llega hasta ${max} s. Recórtalo o usa otro motor.`, 'err', 9000);
    const label = ownMode ? '🗣️ Avatar · tu audio' : `🗣️ Hablando · "${short(o.text)}"`;
    await kit.generar(e, o, label);
  }
  async function listen() {
    const o = opts();
    if (!o.text) { script.textarea.focus(); return kit.toast('Escribe lo que va a decir ✍️', 'err'); }
    if (vmode.value === 'clone' && !clone.value) { flash(clone); return kit.toast('Arrastra la voz a clonar, o elige "Voz por defecto".', 'err'); }
    const ve = kit.engineById('voice.chatterbox') || ctx.engines.enginesFor('voice')[0];
    await kit.generar(ve, { text: o.text, lang: o.lang, expr: o.expr, voice: o.voice }, `🎧 Voz · "${short(o.text)}"`);
  }

  Object.assign(S, { face, own, clone, src, vmode, script, lang, drawSrc, refresh });
  syncQuality(); drawSrc();
  ready = true; refresh();
}

async function receive(p, ctx) {
  if (!p || !S.face) return;
  if (p.text || p.prompt) S.script.value = p.text || p.prompt;   // {prompt} llega de las ideas de Explorar
  const f = p.file;
  if (f) {
    const v = f.ref ? f : await ctx.core.asInput(f);
    if (f.kind === 'aud' || (!f.kind && /\.(mp3|wav|flac|ogg|opus|m4a)$/i.test(f.filename || ''))) {
      if (p.as === 'audio') { S.src.value = 'own'; await S.own.set(v); ctx.kit.toast('🎙️ Audio listo: ahora elige la cara y genera.'); }
      else { S.src.value = 'tts'; S.vmode.value = 'clone'; await S.clone.set(v); ctx.kit.toast('🧬 Voz lista para clonar: escribe el guion.'); }
    } else {
      await S.face.set(v);
    }
  }
  S.drawSrc(); S.refresh();
}

export default { id: 'avatares', title: 'Avatares', icon: '🗣️', order: 80, setup, render, receive };
