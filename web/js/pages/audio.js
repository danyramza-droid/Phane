// Página 🎵 Audio: Música (ACE-Step), Sonido para video (MMAudio), Música para video (ACE-Step + mezcla) y Voz (Chatterbox).
import { GENRES, MOODS, INSTRUMENTS, LYRIC_LANGS, KEYS, musicTags, speechSecs } from '../graphs/audio.js';
import { langPicker, mediaSecs, hasAudioTrack, flash } from './avatares.js';

const TABS = [['music', '🎵 Música'], ['sfx', '🔊 Sonido para video'], ['mvid', '🎬 Música para video'], ['voice', '🎙️ Voz']];
const DURS = [[15, '15 s'], [30, '30 s'], [60, '1 min'], [120, '2 min'], [180, '3 min'], [240, '4 min']];

const LYRIC_IDEAS = [
  ['Estructura', '[Verse]\nEscribe aquí la primera estrofa\ncon cuatro líneas que rimen\n\n[Chorus]\nAquí va el coro\nel que todos van a cantar\n\n[Verse]\nSegunda estrofa\n\n[Chorus]\nAquí va el coro\nel que todos van a cantar'],
  ['Cumpleaños', '[Verse]\nHoy es un día para celebrar\nlas velas brillan, vamos a cantar\n\n[Chorus]\nFeliz, feliz cumpleaños\nque se cumplan todos tus sueños\nFeliz, feliz cumpleaños\nhoy la fiesta es para ti'],
  ['Verano', '[Verse]\nEl sol se esconde en el mar\ny la noche empieza a brillar\n\n[Chorus]\nVerano, no te vayas\nquédate en esta playa\nVerano, baila conmigo\nhasta que salga el sol'],
  ['En inglés', '[Verse]\nCity lights are calling out my name\nEvery night it never feels the same\n\n[Chorus]\nWe are young, we are free\nDancing under neon dreams\nWe are young, we are free\nNothing is what it seems'],
];
const SFX_IDEAS = [
  ['Lluvia', 'heavy rain falling, distant thunder rumbling'],
  ['Playa', 'ocean waves crashing on the shore, seagulls, light wind'],
  ['Ciudad', 'busy city street ambience, cars passing, distant horns, people chatter'],
  ['Bosque', 'forest ambience, birds chirping, leaves rustling in the wind'],
  ['Pasos', 'footsteps on gravel, clothes rustling'],
  ['Motor', 'powerful car engine revving and accelerating'],
  ['Fuego', 'crackling campfire, wood popping'],
  ['Explosión', 'big cinematic explosion, debris falling'],
  ['Espadas', 'swords clashing, metal impacts, fast whooshes'],
];
const VOICE_IDEAS = [
  ['Narración', 'En lo más profundo del bosque, donde la luz apenas llega, vive una criatura que nadie ha visto jamás.'],
  ['Anuncio', '¡Atención! Solo por esta semana, todo al cincuenta por ciento. No te lo puedes perder.'],
  ['Bienvenida', 'Hola y bienvenidos. Gracias por estar aquí, hoy vamos a aprender algo nuevo juntos.'],
  ['Podcast', 'Muy buenas a todos y bienvenidos a un nuevo episodio. Hoy tenemos un tema que me tiene muy emocionado.'],
  ['En inglés', 'Welcome back! Today we are going to build something amazing, step by step.'],
];
// 🎨 Diseñar voz (Qwen3-TTS VoiceDesign): descripciones en inglés (así las entiende mejor)
const VOICE_DESIGN_IDEAS = [
  ['Narradora cálida', 'A mature, warm female narrator around thirty, low-medium pitch, rich and velvety tone, cheerful and engaging, relaxed pace, clear diction.'],
  ['Tráiler épico', 'A deep, powerful male movie-trailer voice, slow and dramatic, resonant bass, intense and serious.'],
  ['Anciano sabio', 'An old wise man in his seventies, soft and slightly raspy voice, slow and calm, kind and thoughtful.'],
  ['Niña animada', 'A cheerful young girl around ten years old, high bright voice, energetic and playful, fast pace.'],
  ['Villano', 'A sinister male villain, low whispery voice, slow and menacing, cold and sarcastic.'],
  ['Robot', 'A robotic synthetic voice, flat monotone pitch, precise and mechanical pronunciation.'],
  ['Locutora de radio', 'An upbeat female radio host in her twenties, bright energetic voice, fast and friendly, big smile.'],
];

const fmtSecs = s => (s >= 60 ? `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s` : `${Math.round(s)} s`);
const short = (t, n = 36) => (t.length > n ? t.slice(0, n) + '…' : t);

function injectCss() {
  if (document.getElementById('css-audio')) return;
  const st = document.createElement('style'); st.id = 'css-audio';
  st.textContent = `
.pg[data-id=audio] .au-tabs{margin-bottom:6px}
.pg[data-id=audio] .au-tabs .chip{font-size:14px;padding:9px 14px;font-weight:600}
.pg[data-id=audio] input[type=text]{width:100%}
.pg[data-id=audio] .au-info{font-size:12.5px;color:var(--mute);margin-top:6px}
.pg[data-id=audio] .au-info b{color:var(--acc)}
.pg[data-id=audio] details.adv{margin-top:14px;font-size:13px}
.pg[data-id=audio] details.adv summary{cursor:pointer;color:var(--mute)}
.pg[data-id=audio] details.adv .row{margin-top:8px}
.pg[data-id=audio] details.adv input[type=number]{width:90px}
.pg[data-id=audio] .chips + .slotwrap{margin-top:8px}`;
  document.head.append(st);
}

/** Chips de selección múltiple (instrumentos). .value -> [valores] */
function multiChips(ctx, options, { key, max = 4, onChange } = {}) {
  const { h } = ctx.kit;
  let sel = key ? ctx.core.store.get('multi.' + key, []) : [];
  const el = h('div', { class: 'chips' });
  const draw = () => {
    el.innerHTML = '';
    for (const [v, label] of options) {
      const on = sel.includes(v);
      el.append(h('button', { class: 'chip' + (on ? ' on' : ''), onclick: () => {
        sel = on ? sel.filter(x => x !== v) : [...sel, v].slice(-max);
        if (key) ctx.core.store.set('multi.' + key, sel);
        draw(); onChange && onChange(sel);
      } }, label));
    }
  };
  draw();
  Object.defineProperty(el, 'value', { get: () => sel });
  return el;
}

/** Casilla de video + análisis (duración y si trae audio). onInfo({secs, audio}) */
function videoSlot(ctx, { onInfo } = {}) {
  const s = ctx.kit.slot({ kind: 'video', tag: 'Video', empty: '🎬 Arrastra tu video (o uno de Recientes)<br><small>o haz clic para subirlo</small>',
    onChange: async v => {
      s.info = { secs: null, audio: null };
      onInfo && onInfo(s.info);
      if (!v) return;
      const [secs, audio] = await Promise.all([mediaSecs(v.url, 'video'), hasAudioTrack(v.url)]);
      if (s.value !== v) return;                    // cambiaron el video mientras analizábamos
      // el escáner del navegador solo entiende MP4/MOV y algunos MKV: si ffmpeg (core.mediaInfo) SÍ vio audio, gana
      // (con .avi/.ts/.mkv AC-3 decía "sin audio" y se perdía el sonido original). Un "no" de ffmpeg no se usa: también sale en errores.
      s.info = { secs: secs || v.secs || null, audio: audio === true || v.hasAudio === true ? true : (audio ?? null) };
      onInfo && onInfo(s.info);
    } });
  s.info = { secs: null, audio: null };
  return s;
}
const videoAbs = (ctx, v) => (v ? v.abs || ctx.core.inputAbs(v) : '');

/** Chips "reemplazar / mezclar" que se desactivan si el video no tiene audio. */
function mixChips(ctx, key, onChange) {
  const base = [['replace', '🔁 Reemplazar el audio'], ['mix', '🎚️ Mezclar con el audio original']];
  const ch = ctx.kit.chips(base, { key, onChange });
  ch.sync = info => {
    if (info.audio === false) { ch.setOptions([base[0], [...base[1], 'Este video no tiene audio', true]]); ch.value = 'replace'; }
    else { ch.setOptions(base); if (info.audio === true) ch.value = 'mix'; }
  };
  return ch;
}
// 🎚️ volumen de la pista nueva al mezclar (27-oct, tráiler: música de fondo + golpes encima). Valor en dB.
function volChips(ctx, key, def) {
  return ctx.kit.chips([[0, '🔊 Igual que el original'], [-3, '-3 dB'], [-9, '-9 dB (de fondo)'], [-15, '-15 dB (muy bajito)']], { key, value: def });
}

/* ---------------- página ---------------- */
const S = {};

function setup(ctx) {
  ctx.addAction({ id: 'audio.sfx', label: '🔊 Agregar sonido', title: 'Crear efectos y ambiente para este video (MMAudio)',
    when: f => f.kind === 'vid', run: (f, c) => c.goto('audio', { file: f, tab: 'sfx' }) });
  ctx.addAction({ id: 'audio.music', label: '🎵 Agregar música', title: 'Componer música del largo exacto de este video',
    when: f => f.kind === 'vid', run: (f, c) => c.goto('audio', { file: f, tab: 'mvid' }) });
}

function render(root, ctx) {
  const { kit, core } = ctx; const { h } = kit;
  setup(ctx); injectCss();
  let ready = false;
  const upd = fn => () => { if (ready) fn(); };

  /* ======== Música ======== */
  const mMenu = kit.engineMenu('music', { onChange: upd(() => refreshM()) });
  const genre = kit.chips(GENRES.map(g => [g.id, g.label]), { key: 'mus.genre', onChange: upd(() => refreshM()) });
  const mood = kit.chips(MOODS.map(m => [m[0], m[1]]), { key: 'mus.mood', onChange: upd(() => refreshM()) });
  const instr = multiChips(ctx, INSTRUMENTS, { key: 'mus.instr', onChange: upd(() => refreshM()) });
  const extra = h('input', { type: 'text', placeholder: 'Detalles extra (opcional, en inglés). Ej: guitar solo, female whisper intro, 80s vibe' });
  extra.value = core.store.get('mus.extra', ''); extra.oninput = () => core.store.set('mus.extra', extra.value);
  const lyMode = kit.chips([['inst', '🎼 Instrumental'], ['lyrics', '✍️ Con letra']], { key: 'mus.ly', onChange: upd(() => { drawM(); refreshM(); }) });
  const lyrics = kit.promptBox({ placeholder: '[Verse]\nTu primera estrofa…\n\n[Chorus]\nTu coro…', ideas: LYRIC_IDEAS, key: 'mus.lyrics', rows: 7 });
  const lyLang = h('select', {}, ...LYRIC_LANGS.map(([c, l]) => h('option', { value: c }, l)));
  lyLang.value = core.store.get('mus.lylang', 'es'); lyLang.onchange = () => core.store.set('mus.lylang', lyLang.value);
  const vocals = kit.chips([['', '🎤 Voz automática'], ['female vocals', '👩 Voz femenina'], ['male vocals', '👨 Voz masculina']], { key: 'mus.vocals' });
  const blkLyrics = h('div', {}, lyrics, h('div', { class: 'row', style: { marginTop: '8px' } }, h('span', { class: 'engine-lbl' }, 'Idioma de la letra'), lyLang), h('div', { style: { marginTop: '8px' } }, vocals));
  const dur = kit.chips(DURS, { key: 'mus.secs', value: 30, onChange: upd(() => refreshM()) });
  const bpmIn = h('input', { type: 'number', min: 40, max: 220, placeholder: 'auto' });
  bpmIn.value = core.store.get('mus.bpm', ''); bpmIn.oninput = () => { core.store.set('mus.bpm', bpmIn.value); refreshM(); };
  const keySel = h('select', {}, h('option', { value: '' }, 'Automática'), ...KEYS.map(k => h('option', { value: k }, k)));
  keySel.value = core.store.get('mus.key', ''); keySel.onchange = () => core.store.set('mus.key', keySel.value);
  const fmt = kit.chips([['mp3', 'MP3'], ['flac', 'FLAC (sin pérdida)']], { key: 'mus.fmt' });
  const adv = h('details', { class: 'adv' }, h('summary', {}, '⚙️ Ajustes avanzados (tempo, tonalidad, formato)'),
    h('div', { class: 'row' }, h('span', { class: 'engine-lbl' }, 'Tempo (BPM)'), bpmIn, h('span', { class: 'engine-lbl' }, 'Tonalidad'), keySel),
    h('div', { class: 'row' }, h('span', { class: 'engine-lbl' }, 'Formato'), fmt));
  const mGen = kit.genButton('Crear música', () => goM(), () => kit.estimateText(mMenu.value, musicOpts()));

  const secMusic = h('div', {},
    mMenu,
    kit.step(1, 'Género'), genre,
    kit.step(2, 'Ánimo'), mood,
    kit.step(3, 'Instrumentos', '(opcional, hasta 4)'), instr, h('div', { style: { marginTop: '8px' } }, extra),
    kit.step(4, 'Letra'), lyMode, blkLyrics,
    kit.step(5, 'Duración'), dur,
    adv, mGen);

  function musicOpts() {
    const gn = GENRES.find(x => x.id === genre.value) || GENRES[0];
    const md = MOODS.find(x => x[0] === mood.value) || MOODS[0];
    const withLyrics = lyMode.value === 'lyrics' && !!lyrics.value;
    const bpm = Math.round(+bpmIn.value) || gn.bpm;
    return {
      tags: musicTags({ genre: gn.id, mood: md[0], instruments: instr.value, extra: extra.value, vocals: withLyrics ? vocals.value : '', instrumental: !withLyrics, bpm }),
      lyrics: withLyrics ? lyrics.value : '', lang: withLyrics ? lyLang.value : 'en',
      secs: +dur.value || 30, bpm, key: keySel.value || md[2] || gn.key, format: fmt.value,
    };
  }
  function drawM() { blkLyrics.classList.toggle('hide', lyMode.value !== 'lyrics'); }
  function refreshM() { mGen.update(); }
  async function goM() {
    const e = mMenu.value, o = musicOpts();
    if (lyMode.value === 'lyrics' && !o.lyrics) { lyrics.textarea.focus(); return kit.toast('Escribe la letra, o elige 🎼 Instrumental.', 'err'); }
    const gn = GENRES.find(x => x.id === genre.value) || GENRES[0];
    await kit.generar(e, o, `🎵 ${gn.label}${o.lyrics ? ' con letra' : ''} · ${fmtSecs(o.secs)}`);
  }

  /* ======== Sonido para video (MMAudio) ======== */
  const sMenu = kit.engineMenu('sound', { filter: e => !(e.caps && e.caps.kind === 'music'), onChange: upd(() => refreshS()) });
  const sfxEngine = () => { const e = sMenu.value; return e && e.caps && e.caps.kind === 'music' ? kit.engineById('sound.mmaudio') : e; };
  const sMix = mixChips(ctx, 'sfx.mix', upd(() => refreshS()));
  const sVol = volChips(ctx, 'sfx.db', -3);
  const sVid = videoSlot(ctx, { onInfo: info => { sMix.sync(info); refreshS(); } });
  const sPrompt = kit.promptBox({ placeholder: 'Describe el sonido (mejor en inglés). Ej: footsteps on gravel, wind, distant birds', ideas: SFX_IDEAS, key: 'sfx.prompt', rows: 2 });
  const sInfo = h('div', { class: 'au-info' });
  const sGen = kit.genButton('🔊 Agregar sonido', () => goS(), () => kit.estimateText(sfxEngine(), sfxOpts()));
  const secSfx = h('div', {},
    sMenu,
    kit.step(1, 'Video'), sVid, sInfo,
    kit.step(2, '¿Qué se escucha?', '(opcional: si lo dejas vacío, lo adivina del video)'), sPrompt,
    kit.step(3, 'Audio original'), sMix, h('div', { style: { height: '6px' } }), sVol,
    sGen,
    h('div', { class: 'note' }, 'MMAudio crea efectos y ambiente sincronizados con lo que pasa en el video. Para música usa la pestaña 🎬 Música para video.'));
  const vidOpt = s => ({ abs: videoAbs(ctx, s.value), hasAudio: s.info.audio ?? s.value?.hasAudio, secs: s.info.secs || s.value?.secs });
  const sfxOpts = () => ({ video: vidOpt(sVid), prompt: sPrompt.value, mix: sMix.value === 'mix', db: +sVol.value, secs: sVid.info.secs || 5 });
  function refreshS() { sGen.update(); drawInfo(sInfo, sVid); }
  async function goS() {
    const v = sVid.value;
    if (!v) { flash(sVid); return kit.toast('Primero pon el video 🎬', 'err'); }
    const o = sfxOpts();
    if (!o.video.abs) return kit.toast('No pude ubicar el archivo del video; vuelve a subirlo.', 'err');
    await kit.generar(sfxEngine(), o, `🔊 Sonido · ${o.prompt ? short(o.prompt, 30) : v.filename}`);
  }

  /* ======== Música para video (ACE-Step + mezcla) ======== */
  const mvEngine = () => kit.engineById('sound.music_on_video');
  const mvGenre = kit.chips(GENRES.map(g => [g.id, g.label]), { key: 'mv.genre', value: 'cinematic', onChange: upd(() => refreshMV()) });
  const mvMood = kit.chips(MOODS.map(m => [m[0], m[1]]), { key: 'mv.mood', onChange: upd(() => refreshMV()) });
  const mvExtra = h('input', { type: 'text', placeholder: 'Detalles extra (opcional, en inglés). Ej: soft piano intro, builds up at the end' });
  mvExtra.value = core.store.get('mv.extra', ''); mvExtra.oninput = () => core.store.set('mv.extra', mvExtra.value);
  const mvMix = mixChips(ctx, 'mv.mix', upd(() => refreshMV()));
  const mvVol = volChips(ctx, 'mv.db', -9);
  const mvVid = videoSlot(ctx, { onInfo: info => { mvMix.sync(info); refreshMV(); } });
  const mvInfo = h('div', { class: 'au-info' });
  const mvMotor = h('div', { class: 'mode' });
  const mvGen = kit.genButton('🎵 Agregar música', () => goMV(), () => kit.estimateText(mvEngine(), mvOpts()));
  const secMv = h('div', {},
    mvMotor,
    kit.step(1, 'Video'), mvVid, mvInfo,
    kit.step(2, 'Género'), mvGenre,
    kit.step(3, 'Ánimo'), mvMood, h('div', { style: { marginTop: '8px' } }, mvExtra),
    kit.step(4, 'Audio original'), mvMix, h('div', { style: { height: '6px' } }), mvVol,
    mvGen,
    h('div', { class: 'note' }, 'La música dura exactamente lo mismo que el video. Si mezclas, la música queda de fondo, más bajita que las voces.'));
  function mvOpts() {
    const gn = GENRES.find(x => x.id === mvGenre.value) || GENRES[0];
    const md = MOODS.find(x => x[0] === mvMood.value) || MOODS[0];
    return { video: vidOpt(mvVid), tags: musicTags({ genre: gn.id, mood: md[0], extra: mvExtra.value, instrumental: true, bpm: gn.bpm }),
      bpm: gn.bpm, key: md[2] || gn.key, mix: mvMix.value === 'mix', db: +mvVol.value, secs: mvVid.info.secs || 8 };
  }
  function refreshMV() {
    const e = mvEngine();
    mvMotor.innerHTML = ''; mvMotor.append('Motor: ', h('b', {}, e ? e.name : '—'));
    mvGen.update(); drawInfo(mvInfo, mvVid);
  }
  async function goMV() {
    const v = mvVid.value;
    if (!v) { flash(mvVid); return kit.toast('Primero pon el video 🎬', 'err'); }
    const o = mvOpts();
    if (!o.video.abs) return kit.toast('No pude ubicar el archivo del video; vuelve a subirlo.', 'err');
    const gn = GENRES.find(x => x.id === mvGenre.value) || GENRES[0];
    await kit.generar(mvEngine(), o, `🎵 Música para video · ${gn.label}`);
  }

  /* ======== Voz (Chatterbox) · Diseñar voz (Qwen3-TTS VoiceDesign: caps.design) ======== */
  const vMenu = kit.engineMenu('voice', { onChange: upd(() => { drawV(); refreshV(); }) });
  const isDesign = () => !!vMenu.value?.caps?.design;
  const vText = kit.promptBox({ placeholder: 'Escribe lo que quieres que diga…', ideas: VOICE_IDEAS, key: 'voz.text', rows: 4 });
  const prevIn = vText.textarea.oninput;
  vText.textarea.oninput = () => { prevIn && prevIn(); refreshV(); };
  const vLang = langPicker(ctx, { key: 'voz', onChange: () => refreshV() });
  const vMode = kit.chips([['default', '🔈 Voz por defecto'], ['clone', '🧬 Clonar una voz']], { key: 'voz.mode', onChange: upd(() => { drawV(); refreshV(); }) });
  const vClone = kit.slot({ kind: 'audio', tag: 'Voz a clonar', empty: '🧬 Arrastra 5–10 s de la voz a clonar<br><small>limpia, sin música de fondo</small>', onChange: () => refreshV() });
  const vExpr = kit.range({ min: 0.25, max: 1.2, step: 0.05, value: 0.5, left: '😐 Calmado', right: '🤩 Expresivo', key: 'voz.expr', onChange: () => refreshV() });
  const vInfo = h('div', { class: 'au-info' });
  const vDesc = kit.promptBox({ placeholder: 'Describe la voz (mejor en inglés): edad, tono, acento, emoción. Ej.: A warm female narrator around thirty, low-medium pitch, cheerful, clear American English.',
    ideas: VOICE_DESIGN_IDEAS, key: 'voz.desc', rows: 3 });
  const prevDesc = vDesc.textarea.oninput;
  vDesc.textarea.oninput = () => { prevDesc && prevDesc(); refreshV(); };
  const vGen = kit.genButton('🎙️ Crear voz', () => goV(), () => kit.estimateText(vMenu.value, voiceOpts()));
  const blkVoiceDefault = h('div', {}, kit.step(3, 'Voz'), vMode, vClone, kit.step(4, 'Emoción'), vExpr);
  const blkVoiceDesign = h('div', {}, kit.step(3, 'Describe la voz', '(la crea desde cero, sin audio de referencia)'), vDesc);
  const secVoice = h('div', {},
    vMenu,
    kit.step(1, 'Texto'), vText, vInfo,
    kit.step(2, 'Idioma'), vLang,
    blkVoiceDefault, blkVoiceDesign,
    vGen,
    h('div', { class: 'note' }, '💡 En el resultado pulsa 🗣️ Ponerle cara para que un avatar diga este audio, o 🎙️ Usar esta voz para clonarla.'));
  const voiceOpts = () => (isDesign()
    ? { text: vText.value, lang: vLang.value, instruct: vDesc.value }
    : { text: vText.value, lang: vLang.value, expr: vExpr.value, voice: vMode.value === 'clone' && vClone.value ? { ref: vClone.value.ref } : null });
  function drawV() {
    const d = isDesign();
    blkVoiceDefault.classList.toggle('hide', d); blkVoiceDesign.classList.toggle('hide', !d);
    vClone.classList.toggle('hide', vMode.value !== 'clone');
  }
  function refreshV() {
    if (!ready) return;
    vGen.update();
    const s = speechSecs(vText.value, vLang.value);
    vInfo.innerHTML = ''; if (s) vInfo.append('🗣️ Unos ', h('b', {}, fmtSecs(s)), ' de voz');
    const langs = vMenu.value?.caps?.langs;
    if (isDesign() && langs && !langs.includes(vLang.value)) vInfo.append(s ? ' · ' : '', '⚠️ Diseñar voz habla 10 idiomas (español, inglés, portugués, francés, italiano, alemán, japonés, coreano, chino y ruso): este idioma va en automático.');
  }
  async function goV() {
    const o = voiceOpts();
    if (!o.text) { vText.textarea.focus(); return kit.toast('Escribe lo que quieres que diga ✍️', 'err'); }
    if (isDesign()) {
      if (!String(o.instruct || '').trim()) { vDesc.textarea.focus(); return kit.toast('Describe cómo quieres que suene la voz ✍️', 'err'); }
      return kit.generar(vMenu.value, o, `🎨 Voz diseñada · "${short(o.text)}"`);
    }
    if (vMode.value === 'clone' && !vClone.value) { flash(vClone); return kit.toast('Arrastra la voz a clonar, o elige "Voz por defecto".', 'err'); }
    await kit.generar(vMenu.value, o, `🎙️ Voz · "${short(o.text)}"`);
  }

  /* ======== pestañas ======== */
  function drawInfo(el, slot) {
    el.innerHTML = '';
    if (!slot.value) return;
    const i = slot.info || {};
    if (i.secs) el.append('🎬 ', h('b', {}, fmtSecs(i.secs)));
    if (i.audio === true) el.append(i.secs ? ' · ' : '', '🔊 trae audio');
    else if (i.audio === false) el.append(i.secs ? ' · ' : '', '🔇 sin audio');
  }
  const sections = { music: secMusic, sfx: secSfx, mvid: secMv, voice: secVoice };
  const tabs = kit.chips(TABS, { key: 'audio.tab', onChange: () => drawTab() });
  tabs.classList.add('au-tabs');
  function drawTab() { for (const [k, el] of Object.entries(sections)) el.classList.toggle('hide', k !== tabs.value); }

  root.append(
    h('h1', {}, '🎵 Audio'),
    h('p', { class: 'sub' }, 'Música con o sin letra, sonido y música para tus videos, y voces en 23 idiomas.'),
    tabs, secMusic, secSfx, secMv, secVoice);

  Object.assign(S, { tabs, drawTab, sVid, mvVid, vText, vMode, vClone, drawV, refreshV, extra, refreshM });
  drawM(); drawV(); drawTab();
  ready = true;
  refreshM(); refreshS(); refreshMV(); refreshV();
}

async function receive(p, ctx) {
  if (!p || !S.tabs) return;
  const f = p.file;
  let tab = p.tab;
  if (f) {
    const v = f.ref ? f : await ctx.core.asInput(f);
    if (f.kind === 'vid' || (!f.kind && /\.(mp4|webm|mov|mkv)$/i.test(f.filename || ''))) {
      tab = tab === 'mvid' ? 'mvid' : 'sfx';
      await (tab === 'mvid' ? S.mvVid : S.sVid).set(v);
    } else if (f.kind === 'aud') {
      tab = 'voice'; S.vMode.value = 'clone'; await S.vClone.set(v); S.drawV();
      ctx.kit.toast('🧬 Voz lista para clonar: escribe el texto.');
    }
  }
  if (p.text) { S.vText.value = p.text; tab = tab || 'voice'; }
  // {prompt} (p. ej. ideas de Explorar) = descripción de MÚSICA: va a los detalles extra de la pestaña Música
  if (p.prompt && !p.text) { S.extra.value = p.prompt; S.extra.oninput(); tab = tab || 'music'; S.refreshM(); }
  if (tab && TABS.some(t => t[0] === tab)) { S.tabs.value = tab; S.drawTab(); }
  S.refreshV();
}

export default { id: 'audio', title: 'Audio', icon: '🎵', order: 100, setup, render, receive };
