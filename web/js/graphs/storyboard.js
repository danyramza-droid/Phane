// Motores de STORYBOARD (estilo "Popcorn").
//   storyboard.klein  (Ligero)   UN cuadro clave por trabajo: referencias (personajes/productos/estilo) + escena (+ cuadro anterior)
//   storyboard.qwen21 (High End) igual con Qwen-Image 2.1 + LoRA "Next Scene" encadenando el cuadro anterior
//   storyboard.concat (Ligero)   une N videos guardados en una sola película (sin IA)
import { G, rnd, saveImage, loadVideoPath, saveVideo, VID_SIZE, withHeroLora, heroPrompt } from '../lib/graph.js';

/**
 * Opciones de un cuadro:
 *   { prompt:'escena', camera:'The camera …' (dirección en inglés, opcional), ar:'16:9'|'9:16'|'1:1',
 *     refs:[{ref,w,h}] (≤4: personajes/productos/estilo), prev:{ref,w,h}|null (cuadro anterior para continuidad),
 *     heroLora:{name,trigger,cls,strength} (solo Klein: LoRA del personaje, ver lib/graph.js) }
 */
const SAMPLE_FRAME = {
  prompt: 'A young woman in a red raincoat walks into a neon-lit ramen shop on a rainy night in Tokyo.',
  camera: 'The camera pulls back to a wide establishing shot.',
  ar: '16:9',
  refs: [{ ref: 'example.png', w: 1024, h: 1024 }],
  prev: { ref: 'example.png', w: 1344, h: 768 },
};

/** Tamaños de cuadro (16:9 de verdad, múltiplos de 32: sirven para Klein (16) y Qwen (32)). */
export const STORY_SIZE = {
  ligero: { '16:9': [1344, 768], '9:16': [768, 1344], '1:1': [1024, 1024] },
  highend: { '16:9': [2048, 1152], '9:16': [1152, 2048], '1:1': [1536, 1536] },
};
const sizeOf = (tier, ar) => STORY_SIZE[tier][ar] || STORY_SIZE[tier]['16:9'];
const refsOf = o => (o.refs || []).filter(r => r && r.ref).slice(0, 4);
const clean = s => { const t = String(s || '').trim().replace(/\s+/g, ' ').replace(/([^.!?])$/, '$1.'); return t.charAt(0).toUpperCase() + t.slice(1); };

/* ---------- FLUX.2 Klein 4B (Ligero): ReferenceLatent por referencia; refs a 0.4 MP si hay más de una ---------- */
function kleinPrompt(o, nRefs) {
  const T = o.heroLora && o.heroLora.trigger;
  let s = clean(o.prompt);
  if (T && s.startsWith(T.charAt(0).toUpperCase() + T.slice(1))) s = T + s.slice(T.length);   // clean() la capitalizó
  const p = [heroPrompt(s, o)];   // la palabra clave va tal cual (minúsculas, como en el entrenamiento)
  if (o.camera) p.push(clean(o.camera));
  if (nRefs) p.push(o.heroLora && o.heroLora.name   // con LoRA de personaje su cara la pone la LoRA, no las referencias extra
    ? 'Keep the same places, objects and art style as in the reference images.'
    : 'Keep the exact same characters, faces, outfits, products and art style as in the reference images.');
  if (o.prev) p.push('This is the next shot of the same film: same location, lighting and color grade as the previous shot.');
  p.push('Cinematic film still, high detail, natural composition.');
  return p.join(' ');
}
function klein(o) {
  const g = G(); const [w, h] = sizeOf('ligero', o.ar || '16:9');
  const refs = refsOf(o);
  const all = [...refs, ...(o.prev && o.prev.ref ? [o.prev] : [])];
  const u = g.add('UNETLoader', { unet_name: 'flux-2-klein-4b-fp8.safetensors', weight_dtype: 'default' }, 'Cargando FLUX.2 Klein…');
  const model = withHeroLora(g, [u, 0], o);   // LoRA de personaje (opcional)
  const c = g.add('CLIPLoader', { clip_name: 'qwen_3_4b.safetensors', type: 'flux2', device: 'default' }, 'Cargando FLUX.2 Klein…');
  const vae = g.add('VAELoader', { vae_name: 'flux2-vae.safetensors' });
  let pos = g.add('CLIPTextEncode', { clip: [c, 0], text: kleinPrompt(o, refs.length) }, 'Leyendo la escena…');
  let neg = g.add('ConditioningZeroOut', { conditioning: [pos, 0] });
  all.forEach((r, i) => {
    let im = g.add('LoadImage', { image: r.ref });
    // con varias referencias, 0.4 MP cada una (si no, la atención se arrastra 10+ min en 8 GB)
    im = g.add('ImageScaleToTotalPixels', { image: [im, 0], upscale_method: 'lanczos', megapixels: all.length > 1 ? 0.4 : 0.8, resolution_steps: 1 });
    const lat = g.add('VAEEncode', { pixels: [im, 0], vae: [vae, 0] }, r === o.prev ? 'Estudiando el cuadro anterior…' : `Estudiando referencia ${i + 1}…`);
    pos = g.add('ReferenceLatent', { conditioning: [pos, 0], latent: [lat, 0] });
    neg = g.add('ReferenceLatent', { conditioning: [neg, 0], latent: [lat, 0] });
  });
  const l = g.add('EmptyFlux2LatentImage', { width: w, height: h, batch_size: 1 });
  const sch = g.add('Flux2Scheduler', { steps: 4, width: w, height: h });
  const gd = g.add('CFGGuider', { model, positive: [pos, 0], negative: [neg, 0], cfg: 1 });
  const smp = g.add('KSamplerSelect', { sampler_name: 'euler' });
  const nz = g.add('RandomNoise', { noise_seed: rnd() });
  const s = g.add('SamplerCustomAdvanced', { noise: [nz, 0], guider: [gd, 0], sampler: [smp, 0], sigmas: [sch, 0], latent_image: [l, 0] }, 'Pintando el cuadro');
  const d = g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…');
  saveImage(g, [d, 0], 'phane/storyboard/cuadro');
  return g;
}

/* ---------- Qwen-Image 2.1 Turbo (High End) + LoRA Next-Scene ----------
   Copia de tpl_image_qwen_image_2_1_turbo_image_edit (sin el "prompt enhancer", que la plantilla trae apagado):
   UNETLoader → QwenImage21Cache → CFGGuider(cfg 1) · TextEncodeQwenImage21(images.image_N) · ManualSigmas turbo (8 pasos).
   Lienzo propio (EmptyLatentImage = "custom_size on" de la plantilla) para forzar el formato del storyboard.
   Con cuadro anterior: es <image1> (la plantilla dice que la salida sigue a image_1) y el prompt empieza con
   "Next Scene: <dirección de cámara>" + LoRA a 0.75. Las referencias son <image2>…<image5>. */
const QWEN_SIGMAS_TURBO = '1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0';
export const NEXT_SCENE_LORA = 'next_scene_step2500.safetensors';
const qwenRes = n => (n <= 1 ? 1024 : n === 2 ? 896 : 640);      // presupuesto de píxeles por referencia (lado ≈ res)
function qwenPrompt(o, nRefs) {
  const off = o.prev ? 2 : 1;
  const tags = Array.from({ length: nRefs }, (_, i) => `<image${i + off}>`).join(', ');
  let p = o.prev
    ? `Next Scene: ${clean(o.camera || 'The camera cuts to a new angle of the same scene.')} ${clean(o.prompt)}`
    : `${o.camera ? clean(o.camera) + ' ' : ''}${clean(o.prompt)}`;
  if (nRefs) p += ` The characters, faces, outfits, products and art style match ${tags} exactly.`;
  if (o.prev) p += ' Same film as <image1>: keep its location, lighting and color grade consistent.';
  return p + ' Cinematic film still, high detail.';
}
function qwen21(o) {
  const g = G(); const [w, h] = sizeOf('highend', o.ar || '16:9');
  const refs = refsOf(o);
  const imgs = [...(o.prev && o.prev.ref ? [o.prev] : []), ...refs];
  let m = g.add('UNETLoader', { unet_name: 'qwen_image_2.1_turbo_int8_convrot.safetensors', weight_dtype: 'default' }, 'Cargando Qwen-Image 2.1…');
  if (o.prev) m = g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: NEXT_SCENE_LORA, strength_model: o.loraStrength ?? 0.75 });
  m = g.add('QwenImage21Cache', { model: [m, 0], device: 'auto', dtype: 'default' });
  const clip = g.add('CLIPLoader', { clip_name: 'qwen3vl_8b_int8_convrot.safetensors', type: 'qwen_image', device: 'default' }, 'Cargando Qwen-Image 2.1…');
  const vae = g.add('VAELoader', { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' });
  const enc = { clip: [clip, 0], prompt: qwenPrompt(o, refs.length), negative_prompt: '', resolution: qwenRes(imgs.length), vae: [vae, 0] };
  imgs.forEach((im, i) => { enc['images.image_' + (i + 1)] = [g.add('LoadImage', { image: im.ref }), 0]; });
  const te = g.add('TextEncodeQwenImage21', enc, imgs.length ? 'Estudiando referencias…' : 'Leyendo la escena…');
  const lat = g.add('EmptyLatentImage', { width: w, height: h, batch_size: 1 });
  const sig = g.add('ManualSigmas', { sigmas: QWEN_SIGMAS_TURBO });
  const smp = g.add('KSamplerSelect', { sampler_name: 'euler' });
  const nz = g.add('RandomNoise', { noise_seed: rnd() });
  const gd = g.add('CFGGuider', { model: [m, 0], positive: [te, 0], negative: [te, 1], cfg: 1 });
  const s = g.add('SamplerCustomAdvanced', { noise: [nz, 0], guider: [gd, 0], sampler: [smp, 0], sigmas: [sig, 0], latent_image: [lat, 0] }, 'Pintando el cuadro (High End)');
  const d = g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…');
  saveImage(g, [d, 0], 'phane/storyboard/cuadro');
  return g;
}
/** Estimación honesta en una GPU de 8 GB: tokens de imagen (salida + referencias) → seg/paso, con atención cuadrática y offload. */
function qwenEst(o) {
  const [w, h] = sizeOf('highend', o.ar || '16:9');
  const n = refsOf(o).length + (o.prev ? 1 : 0);
  const r = (w * h / 256 + n * qwenRes(n) ** 2 / 256) / 4600;      // relativo a FLUX dev 1 MP (≈3.3 s/paso medidos)
  return Math.round(70 + 8 * 3.3 * 1.3 * (0.42 * r + 0.25 * r * r));
}

/* ---------- Unir videos (sin IA) ----------
   o = { videos:[{abs, secs?, from?, dur?, speed?}|'C:\\ruta.mp4', …], ar:'16:9', quality:'draft'|'final'|'hd720' (o w,h), fps:32, fade:8 (cuadros; 0 = corte seco), audio:true (false = muda) }
   Por clip (27-oct, tráiler): from = segundo de inicio, dur = segundos del original a usar, speed = 2 → el doble de rápido (0.5 = cámara lenta). */
function concat(o) {
  const g = G();
  const vids = (o.videos || []).map(v => (typeof v === 'string' ? { abs: v } : v)).filter(v => v && v.abs);
  if (!vids.length) throw new Error('No hay videos para unir.');
  const [w, h] = o.w && o.h ? [o.w, o.h] : ((VID_SIZE[o.quality] || VID_SIZE.final)[o.ar || '16:9'] || VID_SIZE.final['16:9']);
  const fps = o.fps || 32, fade = Math.max(0, Math.round(o.fade ?? 8));
  let acc = null;
  vids.forEach((v, i) => {
    // recorte y velocidad: se lee el clip a fps/speed cuadros por segundo y se guarda a fps → speed veces más rápido
    const sp = Math.min(8, Math.max(0.25, +v.speed || 1)), rate = fps / sp;
    const lv = loadVideoPath(g, v.abs, { rate, skip: Math.max(0, Math.round((+v.from || 0) * rate)), cap: v.dur > 0 ? Math.max(1, Math.round(v.dur * rate)) : 0 });
    g.lab[lv] = `Leyendo clip ${i + 1} de ${vids.length}…`;
    const im = g.add('ImageResizeKJv2', { image: [lv, 0], width: w, height: h, upscale_method: 'lanczos', keep_proportion: 'crop',
      pad_color: '0, 0, 0', crop_position: 'center', divisible_by: 2 });
    if (!acc) { acc = im; return; }
    acc = fade > 0
      ? g.add('ImageBatchJoinWithTransition', { images_1: [acc, 0], images_2: [im, 0], start_index: -fade, interpolation: 'ease_in_out',
        transition_type: 'fade', transitioning_frames: fade, blur_radius: 0, reverse: false, device: 'CPU' }, 'Uniendo escenas…')
      : g.add('ImageBatch', { image1: [acc, 0], image2: [im, 0] }, 'Uniendo escenas…');
  });
  // audio de cada clip en su lugar (28-oct); audio:false → película muda como antes
  const au = o.audio === false ? null : g.add('PhaneAudioClips', { clips: JSON.stringify(vids.map(v => ({ abs: v.abs, from: +v.from || 0, dur: +v.dur || 0, speed: +v.speed || 1 }))),
    fps, fade }, 'Juntando el audio de los clips…');
  saveVideo(g, [acc, 0], fps, 'phane/storyboard/pelicula', { audio: au ? [au, 0] : undefined });
  return g;
}

/* ---------- Montaje para tráilers (27-oct, montaje_node.py; sin IA, CPU) ----------
   impactos: { video:{abs, fps?}, golpes:'0.8, 1.6', fuerza:1, flash:true }  → mismo video con flash + zoom de golpe + temblor (conserva el audio)
   titulo:   { texto:'LUMI', w:1280, h:720, secs:2.5, fps:32, color:'#4aa8ff' } → clip de título metálico sobre negro */
function impactos(o) {
  const g = G();
  const v = o.video || {}, fps = v.fps || 32;
  const lv = loadVideoPath(g, v.abs, { rate: fps });
  const im = g.add('PhaneImpactos', { images: [lv, 0], fps, golpes: String(o.golpes || '1.0'), fuerza: o.fuerza ?? 1, flash: o.flash !== false, seed: rnd() % 100000 }, 'Metiendo los golpes…');
  saveVideo(g, [im, 0], fps, 'phane/montaje/impactos', { audio: v.hasAudio ? [lv, 2] : undefined });
  return g;
}
/* 🔤 Título ✨ metálico (27-oct, hueco 21): la tarjeta plana de arriba se ve como texto azul; el logo de un tráiler es metal con relieve.
   La página lo hace en dos trabajos: Qwen-Image (o Z-Image) pinta el logo con este prompt → Wan i2v con METAL_SHINE le da el destello. */
const METAL_TONES = [[20, 'fiery red-orange'], [50, 'gold'], [80, 'yellow-gold'], [160, 'emerald green'], [200, 'teal'], [250, 'icy blue'], [290, 'violet'], [340, 'magenta'], [361, 'crimson']];
export function metalTone(hex) {
  const c = String(hex || '').replace('#', ''), [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  if ([r, g, b].some(isNaN)) return 'steel blue';
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx - mn < 0.12) return mx > 0.6 ? 'polished silver chrome' : 'dark gunmetal';
  const hue = (mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4) * 60;
  return METAL_TONES.find(([lim]) => hue < lim)[1];
}
export const metalTitlePrompt = (texto, color) => {
  const t = String(texto || 'TITLE').replace(/"/g, '').trim() || 'TITLE';
  return `A cinematic movie title logo centered on a pure black background. The word "${t}" in huge bold chiseled ${metalTone(color)} metallic letters `
    + 'with beveled edges, brushed metal texture, sharp specular highlights and a soft glow around the letters, like an epic fantasy film trailer title. '
    + 'Only this word, no other text, no extra symbols, the black background is empty.';
};
export const METAL_SHINE = 'A metallic movie title logo on a black background. A bright beam of light sweeps across the letters from left to right, '
  + 'glinting on the beveled metal edges with small sparkles, while the camera slowly pushes in. The letters stay perfectly still, sharp and readable, '
  + 'they do not change shape. Dark cinematic trailer atmosphere.';
/* 🔁 audio de otro video (27-oct, hueco 19): { video:{abs, fps}, from:{abs}, desde:0 } → el video con la pista de audio del otro
   (VHS_LoadAudio lee el audio de un mp4; VideoCombine lo rellena con silencio o lo corta al largo del video). */
function audioOtro(o) {
  const g = G();
  const v = o.video || {}, fps = v.fps || 32;
  const lv = loadVideoPath(g, v.abs, { rate: fps });
  const la = g.add('VHS_LoadAudio', { audio_file: (o.from || {}).abs || '', seek_seconds: Math.max(0, +o.desde || 0), duration: 0 }, 'Leyendo el audio del otro video…');
  saveVideo(g, [lv, 0], fps, 'phane/montaje/audio', { audio: [la, 0] });
  return g;
}
function titulo(o) {
  const g = G();
  const fps = o.fps || 32;
  const t = g.add('PhaneTitulo', { texto: o.texto || 'TITLE', width: o.w || 1280, height: o.h || 720, segundos: o.secs || 2.5, fps, color: o.color || '#4aa8ff' }, 'Dibujando el título…');
  saveVideo(g, [t, 0], fps, 'phane/montaje/titulo');
  return g;
}

const FRAME_CAPS = { refs: 4, chain: true, aspects: ['16:9', '9:16', '1:1'], frame: true };

export const ENGINES = [
  {
    id: 'storyboard.klein', tool: 'storyboard', tier: 'ligero',
    name: 'FLUX.2 Klein 4B', desc: 'Cuadros consistentes con tus referencias en ~25 s cada uno. Encadena el cuadro anterior para dar continuidad.',
    files: ['diffusion_models/flux-2-klein-4b-fp8.safetensors', 'text_encoders/qwen_3_4b.safetensors', 'vae/flux2-vae.safetensors'],
    ramGB: 16,
    est: o => 18 + 4 * (refsOf(o).length + (o.prev ? 1 : 0)),
    build: klein, sample: SAMPLE_FRAME, caps: { ...FRAME_CAPS, heroLora: true },
  },
  {
    id: 'storyboard.qwen21', tool: 'storyboard', tier: 'highend',
    name: 'Qwen-Image 2.1 + Next Scene', desc: 'Calidad 2K y continuidad de cine: la LoRA "Next Scene" mueve la cámara desde el cuadro anterior.',
    files: ['diffusion_models/qwen_image_2.1_turbo_int8_convrot.safetensors', 'text_encoders/qwen3vl_8b_int8_convrot.safetensors',
      'vae/qwen_image_2.1_vae_bf16.safetensors', 'loras/' + NEXT_SCENE_LORA],
    ramGB: 26,   // 26-oct: +23.5 GB medido
    est: qwenEst,
    build: qwen21, sample: SAMPLE_FRAME, caps: { ...FRAME_CAPS, nextScene: true },
  },
  {
    id: 'storyboard.concat', tool: 'storyboard', tier: 'ligero',
    name: 'Unir videos', desc: 'Junta los clips de cada escena en una sola película (32 fps, fundido corto).',
    files: [], ramGB: 12,
    est: o => Math.round(15 + 3 * (o.videos || []).reduce((s, v) => s + ((v && (v.dur || v.secs)) || 5) / ((v && +v.speed) || 1), 0)),
    build: concat,
    sample: { videos: ['ComfyUI\\output\\phane\\video_00001.mp4', 'ComfyUI\\output\\phane\\video_00002.mp4'], ar: '16:9', quality: 'final', fade: 8 },
    caps: { internal: true, join: true },
  },
  {
    id: 'montaje.impactos', tool: 'storyboard', tier: 'ligero',
    name: 'Impactos de golpe', desc: 'Flash, zoom de golpe y temblor de cámara en los segundos que digas (sin IA).',
    files: [], ramGB: 6,
    est: o => Math.round(8 + 2 * ((o.video && o.video.secs) || 5)),
    build: impactos,
    sample: { video: { abs: 'ComfyUI\\output\\phane\\video_00001.mp4', fps: 32 }, golpes: '0.8, 1.6', fuerza: 1 },
    caps: { internal: true },
  },
  {
    id: 'montaje.audio', tool: 'storyboard', tier: 'ligero',
    name: 'Audio de otro video', desc: 'Pone la pista de audio de otro video sobre este (sin IA).',
    files: [], ramGB: 6,
    est: o => Math.round(6 + 1.5 * ((o.video && o.video.secs) || 5)),
    build: audioOtro,
    sample: { video: { abs: 'ComfyUI\\output\\phane\\video_00001.mp4', fps: 32 }, from: { abs: 'ComfyUI\\output\\phane\\video_00002.mp4' }, desde: 0 },
    caps: { internal: true },
  },
  {
    id: 'montaje.titulo', tool: 'storyboard', tier: 'ligero',
    name: 'Tarjeta de título', desc: 'Texto metálico sobre negro que aparece con un destello (sin IA).',
    files: [], ramGB: 2,
    est: o => Math.round(5 + 2 * (o.secs || 2.5)),
    build: titulo,
    sample: { texto: 'LUMI', w: 1280, h: 720, secs: 2.5 },
    caps: { internal: true },
  },
];
