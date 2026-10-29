// Motores de RECAST (copiar movimiento / reemplazar personaje) con Wan Animate 2.
// Base: plantillas oficiales video_wan_animate2_distilled (distill, 10 pasos) y video_wan_animate2 (completo + lightx2v, 6 pasos).
//
// Opciones (o):
//   { character:{ref,w,h},                        foto del personaje
//     video:{abs, fps, frames, w?, h?},           video que manda el movimiento; frames = cuadros a 16 fps a usar (la página los calcula)
//     mode:'move'|'replace',                      move = el personaje hace el movimiento con el fondo del prompt
//                                                 replace (beta) = el personaje se pega encima de la persona del video original
//     prompt:'…',                                 apariencia + fondo (en inglés), SIN palabras de movimiento
//     motion?:'…',                                qué movimiento es (rama de pose), p. ej. 'a person dancing'
//     quality:'draft'|'final'|'hd',  skip?:cuadros a saltar al inicio (a 16 fps), steps?:pasos (pruebas; por defecto los del motor) }
//
// Notas de Wan Animate 2 (leídas de nodes_wan.py):
//  - No necesita esqueleto/pose: el video crudo es la "pose". El fondo de la salida lo decide el prompt.
//  - El nodo NO tiene modo "reemplazar" (no hay background_video/character_mask como en Animate v1). El modo replace aquí es
//    una aproximación: SAM 3.1 recorta al personaje generado y se compone sobre los cuadros originales.
//  - Videos largos: tramos de 81 cuadros encadenados con continue_motion (último cuadro) + video_frame_offset (salida 5);
//    se quita el 1er cuadro de los tramos 2+ (trim_image = 1). Es la misma cuenta del bucle de la plantilla, desenrollada.
//  - WanAnimate2Cache en CPU/int8 (la plantilla usa gpu: no cabe en 8 GB). Shift 5 (regla Turing).
import { G, rnd, NEG_WAN, VID_SIZE, arOf, align4, loadVideoPath, saveVideo, rife2x } from '../lib/graph.js';
import { samMask } from './tools.js';

export const RECAST_FPS = 16;
const SEG = 81;
/** Segundos máximos de video por motor (para no pasar de ~1 h en una GPU de 8 GB). */
export const RECAST_MAX_SECS = { 'recast.animate2_fast': 10, 'recast.animate2': 15 };

/** Largos de los tramos para F cuadros: cada tramo 2+ repite 1 cuadro del anterior. */
export function recastSegments(F) {
  const lens = [Math.min(SEG, align4(F))];
  let cov = lens[0];
  while (cov < F) { const L = Math.min(SEG, align4(F - cov + 1)); lens.push(L); cov += L - 1; }
  return lens;
}

const sizeOf = o => {
  const q = o.quality === 'hd' ? 'hd720' : o.quality === 'draft' ? 'draft' : 'final';
  const src = o.video && o.video.w ? o.video : o.character;     // el formato lo manda el video
  return VID_SIZE[q][arOf(src)];
};
// o.video.frames = cuadros a 16 fps (la página los calcula). Si llega el conteo NATIVO (fps ≠ 16, p. ej. de core.mediaInfo),
// se convierte: pedir más cuadros de los que hay rompe el tramo 2 ("pose_video has 49 frames but video_frame_offset is 80").
const framesOf = (o, maxSecs) => {
  const v = o.video || {};
  let f = v.frames || SEG;
  if (v.fps && v.fps !== RECAST_FPS) f = Math.floor((f - 1) * RECAST_FPS / v.fps) + 1 - Math.max(0, Math.round(o.skip || 0));
  return Math.max(5, Math.min(Math.round(f), maxSecs * RECAST_FPS));
};

const BG_DEFAULT = 'a clean, softly lit photo studio';
function positiveText(o) {
  let t = (o.prompt || '').trim() || 'the character from the reference image, same face, same outfit';
  if (o.mode === 'replace') {
    // en "reemplazar" el fondo SIEMPRE es gris liso (se compone luego sobre el video original): quitamos el que haya escrito
    // el usuario y no repetimos la etiqueta si ya venía (las ideas de la página la traen)
    const who = t.replace(/^\s*Background description:.*$/gim, '').replace(/^\s*Character (?:appearance )?description:\s*/i, '').trim()
      || 'the character from the reference image, same face, same outfit';
    return `Character appearance description: ${who}\nBackground description: plain flat light grey studio background, no objects`;
  }
  if (!/background/i.test(t)) t = `Character appearance description: ${t.replace(/^\s*Character (?:appearance )?description:\s*/i, '')}\nBackground description: ${o.background || BG_DEFAULT}`;
  return t;
}

function animate2({ unet, lora, steps, maxSecs, name }) {
  return o => {
    const g = G();
    const [w, h] = sizeOf(o);
    const F = framesOf(o, maxSecs);
    const lens = recastSegments(F);

    // modelo (plantilla): UNET int8 -> [lightx2v] -> WanAnimate2Cache -> ModelSamplingSD3 / BasicScheduler
    let m = g.add('UNETLoader', { unet_name: unet, weight_dtype: 'default' }, `Cargando ${name}…`);
    if (lora) m = g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: lora, strength_model: 1 });
    const cache = g.add('WanAnimate2Cache', { model: [m, 0], device: 'cpu', dtype: 'int8' });
    let ms = g.add('ModelSamplingSD3', { model: [cache, 0], shift: 5 });
    if (o.easycache) ms = g.add('EasyCache', { model: [ms, 0], reuse_threshold: +o.easycache || 0.2, start_percent: 0.15, end_percent: 0.95, verbose: false });   // prueba D14 (27-oct)
    const sch = g.add('BasicScheduler', { model: [cache, 0], scheduler: 'simple', steps: o.steps || steps, denoise: 1 });
    const smp = g.add('KSamplerSelect', { sampler_name: 'lcm' });

    const clip = g.add('CLIPLoader', { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' }, 'Cargando modelos…');
    const vae = g.add('VAELoader', { vae_name: 'wan_2.1_vae.safetensors' });
    const cv = g.add('CLIPVisionLoader', { clip_name: 'clip_vision_h.safetensors' });
    const pos = g.add('CLIPTextEncode', { clip: [clip, 0], text: positiveText(o) }, 'Leyendo tu idea…');
    const neg = g.add('CLIPTextEncode', { clip: [clip, 0], text: NEG_WAN });
    const posPose = g.add('CLIPTextEncode', { clip: [clip, 0], text: (o.motion || '').trim() || 'A person performing the exact movements, gestures and expressions of the reference video' });

    // personaje al tamaño del video. Animate copia TODO el encuadre de la referencia (barras grises incluidas, probado), así que:
    // foto más ancha que el video → recortar los lados (no se pierde cabeza ni pies); más alta → relleno gris (recortar cortaría cabeza/pies)
    // (5 % de tolerancia: una foto 9:16 en un video 9:16 se recorta ~1 % por lado en vez de llevar barras)
    const c = o.character, wider = !(c.w && c.h) || c.w / c.h >= (w / h) * 0.95;
    const li = g.add('LoadImage', { image: o.character.ref });
    // divisible_by 0: w×h ya son múltiplos de 16; con 16 KJ redondea la imagen interior y deja el sobrante como franja a la derecha
    const ref = g.add('ImageResizeKJv2', { image: [li, 0], width: w, height: h, upscale_method: 'lanczos', keep_proportion: wider ? 'crop' : 'pad',
      pad_color: '128, 128, 128', crop_position: 'center', divisible_by: 0 });
    const cvRef = g.add('CLIPVisionEncode', { clip_vision: [cv, 0], image: [ref, 0], crop: 'none' });

    // video del movimiento a 16 fps (Wan), recortado al formato de salida
    const lv = loadVideoPath(g, o.video.abs, { rate: RECAST_FPS, cap: F, skip: Math.max(0, Math.round(o.skip || 0)) });
    const pose = g.add('ImageResizeKJv2', { image: [lv, 0], width: w, height: h, upscale_method: 'lanczos', keep_proportion: 'crop',
      pad_color: '0, 0, 0', crop_position: 'center', divisible_by: 16 }, 'Leyendo el movimiento…');
    const first = g.add('ImageFromBatch', { image: [pose, 0], batch_index: 0, length: 1 });
    const cvPose = g.add('CLIPVisionEncode', { clip_vision: [cv, 0], image: [first, 0], crop: 'none' });

    let acc = null, prev = null, prevDec = null;
    lens.forEach((L, i) => {
      const tag = lens.length > 1 ? ` · tramo ${i + 1}/${lens.length}` : '';
      const kw = { positive: [pos, 0], negative: [neg, 0], vae: [vae, 0], width: w, height: h, length: L, batch_size: 1,
        video_frame_offset: prev ? [prev, 5] : 0, pose_strength: 1, pose_start_percent: 0, pose_end_percent: 1, reference_image_strength: 1,
        reference_image: [ref, 0], pose_video: [pose, 0], clip_vision_output: [cvRef, 0], positive_pose: [posPose, 0], clip_vision_output_pose: [cvPose, 0] };
      if (prevDec) kw.continue_motion = [prevDec, 0];
      const an = g.add('WanAnimate2ToVideo', kw, `Preparando movimiento${tag}…`);
      const s = g.add('SamplerCustom', { model: [ms, 0], add_noise: true, noise_seed: rnd(), cfg: 1, positive: [an, 0], negative: [an, 1],
        sampler: [smp, 0], sigmas: [sch, 0], latent_image: [an, 2] }, `Copiando el movimiento${tag}`);
      const tr = g.add('TrimVideoLatent', { samples: [s, 0], trim_amount: [an, 3] });
      const d = g.add('VAEDecode', { samples: [tr, 0], vae: [vae, 0] }, `Revelando${tag}…`);
      const piece = prevDec ? g.add('ImageFromBatch', { image: [d, 0], batch_index: 1, length: 4096 }) : d;
      acc = acc ? g.add('ImageBatch', { image1: [acc, 0], image2: [piece, 0] }) : piece;
      prev = an; prevDec = d;
    });
    let frames = [g.add('ImageFromBatch', { image: [acc, 0], batch_index: 0, length: F }), 0];

    if (o.mode === 'replace') {
      // aproximación de "reemplazar" (27-oct, fantasmas): antes solo se pegaba el personaje generado sobre el original y, donde la pose
      // no coincidía, se veía la persona original al lado. Ahora SAM marca TAMBIÉN a la persona original (o.target: a quién reemplazar,
      // para no borrar al orco/otro actor) y PhaneQuitarOriginal (montaje_node.py) la borra con inpaint antes de pegar al nuevo.
      // El fondo gris de Animate no se usa.
      const mGen = samMask(g, frames, 'person', { threshold: 0.4 });
      const mOrg = samMask(g, [pose, 0], (o.target || '').trim() || 'person', { threshold: 0.4 });
      frames = [g.add('PhaneQuitarOriginal', { original: [pose, 0], generado: frames, mascara_original: mOrg, mascara_generado: mGen,
        crecer: 10, borde: 5, radio: 6 }, 'Quitando a la persona original…'), 0];
    }
    const smooth = rife2x(g, frames);
    saveVideo(g, [smooth, 0], RECAST_FPS * 2, 'phane/recast', { audio: o.video && o.video.hasAudio ? [lv, 2] : undefined });   // video mudo: sin audio (si no, VHS falla)
    return g;
  };
}

/* Tiempos (una GPU de 8 GB, 81 cuadros = 5 s): Wan 14B ≈ 95 s/paso a 480p y ≈ 20 s/paso a 272p; + rama de pose y carga.
   Distill: 10 pasos (plantilla). Completo + lightx2v: 6 pasos. 720p ≈ 3x 480p. Modelos int8 de 16.7 GB: +30% por offload. */
const PER_STEP = { draft: 26, final: 120, hd: 360 };
/* loraStep: costo FIJO por paso de aplicar la LoRA lightx2v al modelo int8 (no cabe en 8 GB: se re-parchea en cada paso).
   Medido (completo, 480p, 3 s, reemplazo): 6 pasos de 336 s = 43.5 min en total. El distill no lleva LoRA. */
function estAnimate(steps, maxSecs, loraStep = 0) {
  return o => {
    const q = PER_STEP[o.quality] ? o.quality : 'final';
    const F = framesOf(o, maxSecs);
    const segs = recastSegments(F);
    const perSeg = segs.reduce((a, L) => a + (steps + 1.5) * PER_STEP[q] * L / SEG + steps * loraStep * (q === 'hd' ? 1.5 : 1), 0);
    const extra = o.mode === 'replace' ? 30 + F * 0.7 : 0;   // 27-oct: SAM también sobre el original + inpaint (~0.1 s/cuadro)
    return Math.round(60 + perSeg + extra + F * 0.15 + (loraStep ? 240 : 0));
  };
}

const FILES_COMMON = ['text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'vae/wan_2.1_vae.safetensors', 'clip_vision/clip_vision_h.safetensors'];
const SAM_FILE = 'checkpoints/sam3.1_multiplex_fp16.safetensors';
const SAMPLE = {
  character: { ref: 'example.png', w: 832, h: 1216 },
  video: { abs: 'ComfyUI\\input\\ejemplo.mp4', fps: 16, frames: 150, w: 720, h: 1280 },
  mode: 'move', quality: 'draft',
  prompt: 'Character appearance description: a young woman with short pink hair, white crop top, black cargo pants, white sneakers.\nBackground description: a rooftop at sunset over a big city.',
  motion: 'A person doing an energetic street dance',
};

export const ENGINES = [
  {
    id: 'recast.animate2_fast', tool: 'recast', tier: 'ligero',
    name: 'Wan Animate 2 Distill', desc: 'Tu personaje copia el movimiento del video. Hasta 10 s; empieza en borrador 272p.',
    files: ['diffusion_models/wan_animate_2_distill_int8_convrot.safetensors', ...FILES_COMMON, SAM_FILE],
    ramGB: 38,   // medido 27-oct: +31 GB sobre la base (cabe); +2 por el reemplazo con SAM doble
    // 27-oct (prueba D13, salto 3 s): 10 pasos 422 s · 6 pasos 286 s, igual a la vista · 4 pasos 204 s, con estela en brazos rápidos
    est: estAnimate(6, RECAST_MAX_SECS['recast.animate2_fast']),
    build: animate2({ unet: 'wan_animate_2_distill_int8_convrot.safetensors', lora: null, steps: 6, maxSecs: RECAST_MAX_SECS['recast.animate2_fast'], name: 'Animate 2' }),
    sample: SAMPLE,
    caps: { modes: ['move', 'replace'], qualities: ['draft', 'final'], maxSecs: RECAST_MAX_SECS['recast.animate2_fast'], fps: RECAST_FPS },
  },
  {
    id: 'recast.animate2', tool: 'recast', tier: 'highend',
    name: 'Wan Animate 2 (completo)', desc: 'Modelo completo + lightx2v: más fiel al personaje. 480p o 720p, hasta 15 s. En una GPU de 8 GB: ~45 min por cada 3-5 s (el Distill tarda ~2 min).',
    // 26-oct: lightx2v HORNEADA en el int8 (tools/bake_lightx2v.py, 47 s en CPU): ya no se re-parchea en cada paso.
    files: ['diffusion_models/wan_animate_2_lightx2v_int8_convrot.safetensors', ...FILES_COMMON, SAM_FILE],
    ramGB: 40,   // medido: +34 GB sobre la base con reemplazo (SAM 3.1 incluido); 27-oct: +2 por SAM sobre el original e inpaint
    est: estAnimate(6, RECAST_MAX_SECS['recast.animate2']),
    build: animate2({ unet: 'wan_animate_2_lightx2v_int8_convrot.safetensors', lora: null, steps: 6,
      maxSecs: RECAST_MAX_SECS['recast.animate2'], name: 'Animate 2' }),
    sample: { ...SAMPLE, mode: 'replace', quality: 'final', video: { ...SAMPLE.video, frames: 230 } },
    caps: { modes: ['move', 'replace'], qualities: ['final', 'hd'], maxSecs: RECAST_MAX_SECS['recast.animate2'], fps: RECAST_FPS },
  },
];
