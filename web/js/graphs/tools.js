// Motores de HERRAMIENTAS: mejorar a HD ('upscale'), más fluidez ('fps') y recortar sujeto ('segment').
//
// Opciones (o):
//   upscale: { file:{kind:'img'|'vid', ref, abs, w?, h?, secs?}, scale?:2|4 (4 solo imagen con SeedVR2) }
//   fps:     { video:{abs, fps?, w?, h?, secs?}, factor:2|4 }   fps = cuadros/s del original (la página lo mide; si no, 30)
//   segment: { file:{kind:'img'|'vid', ref, abs, w?, h?, secs?, fps?}, prompt:'person', bg:'green'|'black'|'white'|'mask'|'alpha',
//              withMask?:bool (guarda también la máscara), grow?:px }
import { G, rnd, loadVideoPath, saveVideo, saveImage } from '../lib/graph.js';

const PX480 = 832 * 480;
const pxOf = f => (f && f.w && f.h ? f.w * f.h : PX480);
const secsOf = f => (f && f.secs > 0 ? f.secs : 5);
const isImg = f => !!f && (f.kind === 'img' || f.kind === 'image');
/** fps con los que se carga el video: se fuerzan para que la salida tenga fps exactos (original x factor). */
const rateOf = v => (v && v.fps > 0 ? Math.round(v.fps * 100) / 100 : 30);
/** Audio del video original SOLO si existe (con videos mudos, conectar la salida de audio de VHS hace fallar a ffmpeg). */
export const aud = (f, lv) => (f && f.hasAudio ? [lv, 2] : undefined);

/* ======================= Mejorar a HD ======================= */

/* Real-ESRGAN x2 (Ligero): puerto de hdGraph de estudio_simple. Video por lotes de 48 cuadros, conserva el audio. */
function esrgan(o) {
  const g = G(); const f = o.file;
  const up = g.add('UpscaleModelLoader', { model_name: 'RealESRGAN_x2plus.pth' }, 'Cargando mejorador…');
  if (isImg(f)) {
    const li = g.add('LoadImage', { image: f.ref });
    const u = g.add('ImageUpscaleWithModel', { upscale_model: [up, 0], image: [li, 0] }, 'Mejorando detalle…');
    saveImage(g, [u, 0], 'phane/hd_img');
  } else {
    const mb = g.add('VHS_BatchManager', { frames_per_batch: 48 });
    const lv = loadVideoPath(g, f.abs, { metaBatch: mb });
    const info = g.add('VHS_VideoInfoLoaded', { video_info: [lv, 3] });
    const u = g.add('ImageUpscaleWithModel', { upscale_model: [up, 0], image: [lv, 0] }, 'Mejorando detalle…');
    saveVideo(g, [u, 0], [info, 0], 'phane/hd_video', { audio: aud(f, lv), crf: 18, metaBatch: mb });
  }
  return g;
}

/* SeedVR2 (3B Ligero / 7B sharp High End): puerto de hdProGraph + plantillas utility_seedvr2_*. Reconstruye detalle real. */
/** Tramos de video (27-oct, hueco 20): a 1664×960 de salida caben ~160 cuadros en los 8 GB (5 s a 32 fps, 6.1 GB medido en el tráiler);
    14.6 s de golpe se fue a memoria compartida (53 min y 33 %). Los videos más largos se parten en tramos que se procesan uno por uno
    y se unen con SEEDVR_OV cuadros de traslape en fundido (sin salto visible). Devuelve [{skip, cap}] (cap 0 = hasta el final) o null. */
const SEEDVR_BUDGET = 160 * 1664 * 960, SEEDVR_OV = 8;
export function seedvrChunks(f, scale = 2) {
  if (!f || !(f.fps > 0) || !(f.secs > 0)) return null;   // sin fps medidos no se puede contar cuadros: va de una vez como antes
  const F = Math.round(f.secs * f.fps), L = Math.floor(SEEDVR_BUDGET / (pxOf(f) * scale * scale)), ov = SEEDVR_OV;
  if (F <= L || L <= ov * 3) return null;
  const n = Math.ceil((F - ov) / (L - ov)), S = Math.ceil((F - ov) / n);
  return Array.from({ length: n }, (_, i) => ({ skip: i * S, cap: i === n - 1 ? 0 : S + ov }));
}
function seedvr2(unetName, tag) {
  return o => {
    const g = G(); const f = o.file;
    const img = isImg(f);
    const scale = img && o.scale === 4 ? 4 : 2;
    const vae = g.add('VAELoader', { vae_name: 'seedvr2_ema_vae_fp16.safetensors' });
    const unet = g.add('UNETLoader', { unet_name: unetName, weight_dtype: 'default' }, 'Cargando SeedVR2…');
    const seed = rnd();
    const pass = (src, n) => {
      const sfx = n ? ` (tramo ${n})` : '';
      const rs = g.add('ImageScaleBy', { image: [src, 0], upscale_method: 'lanczos', scale_by: scale });
      const pre = g.add('SeedVR2Preprocess', { resized_images: [rs, 0] });
      const enc = g.add('VAEEncodeTiled', { pixels: [pre, 0], vae: [vae, 0], tile_size: 512, overlap: 128, temporal_size: 64, temporal_overlap: 8 }, 'Analizando…' + sfx);
      const ch = g.add('SeedVR2TemporalChunk', { latent: [enc, 0], temporal_overlap: 0, chunking_mode: 'auto' });
      const cond = g.add('SeedVR2Conditioning', { model: [unet, 0], vae_conditioning: [ch, 0] });
      const ks = g.add('KSampler', { model: [unet, 0], seed, steps: 1, cfg: 1, sampler_name: 'euler', scheduler: 'simple',
        positive: [cond, 0], negative: [cond, 1], latent_image: [ch, 0], denoise: 1 }, 'Reconstruyendo detalle…' + sfx);
      const mg = g.add('SeedVR2TemporalMerge', { latents: [ks, 0], temporal_overlap: [ch, 1] });
      const dec = g.add('VAEDecodeTiled', { samples: [mg, 0], vae: [vae, 0], tile_size: 512, overlap: 128, temporal_size: 64, temporal_overlap: 8 }, 'Revelando…' + sfx);
      return g.add('SeedVR2PostProcessing', { images: [dec, 0], original_resized_images: [rs, 0], color_correction_method: 'none' });
    };
    if (img) { saveImage(g, [pass(g.add('LoadImage', { image: f.ref })), 0], `phane/${tag}_img`); return g; }
    const parts = seedvrChunks(f, scale);
    if (!parts) {
      const lv = loadVideoPath(g, f.abs), info = g.add('VHS_VideoInfoLoaded', { video_info: [lv, 3] });
      saveVideo(g, [pass(lv), 0], [info, 0], `phane/${tag}_video`, { audio: aud(f, lv), crf: 17 });
      return g;
    }
    let acc = null, info = null;
    parts.forEach((p, i) => {
      const lv = loadVideoPath(g, f.abs, { skip: p.skip, cap: p.cap });
      if (!info) info = g.add('VHS_VideoInfoLoaded', { video_info: [lv, 3] });
      const out = pass(lv, i + 1);
      acc = !acc ? out : g.add('ImageBatchJoinWithTransition', { images_1: [acc, 0], images_2: [out, 0], start_index: -SEEDVR_OV, interpolation: 'ease_in_out',
        transition_type: 'fade', transitioning_frames: SEEDVR_OV, blur_radius: 0, reverse: false, device: 'CPU' }, `Uniendo tramos (${i + 1}/${parts.length})…`);
    });
    // el audio completo aparte (cada tramo solo trae su pedazo); VideoCombine lo corta al largo del video
    const audio = f.hasAudio ? [g.add('VHS_LoadAudio', { audio_file: f.abs, seek_seconds: 0, duration: 0 }), 0] : undefined;
    saveVideo(g, [acc, 0], [info, 0], `phane/${tag}_video`, { audio, crf: 17 });
    return g;
  };
}

/* ======================= Más fluidez (interpolación) ======================= */

/* RIFE 4.9 (Ligero): rápido, x2 o x4. */
function rife(o) {
  const g = G(); const rate = rateOf(o.video); const k = o.factor === 4 ? 4 : 2;
  const lv = loadVideoPath(g, o.video.abs, { rate });
  const r = g.add('RIFE VFI', { ckpt_name: 'rife49.pth', frames: [lv, 0], clear_cache_after_n_frames: 10, multiplier: k, fast_mode: true, ensemble: true,
    scale_factor: 1, dtype: 'float16', torch_compile: false, batch_size: 1 }, 'Creando cuadros intermedios…');
  saveVideo(g, [r, 0], rate * k, 'phane/fluido', { audio: aud(o.video, lv) });
  return g;
}

/* FILM (High End): plantilla utility_video_frame_interpolation. Mejor con movimientos grandes; más lento. */
function film(o) {
  const g = G(); const rate = rateOf(o.video); const k = o.factor === 4 ? 4 : 2;
  const lv = loadVideoPath(g, o.video.abs, { rate });
  const m = g.add('FrameInterpolationModelLoader', { model_name: 'film_net_fp16.safetensors' }, 'Cargando FILM…');
  const r = g.add('FrameInterpolate', { interp_model: [m, 0], images: [lv, 0], multiplier: k }, 'Creando cuadros intermedios…');
  saveVideo(g, [r, 0], rate * k, 'phane/fluido_film', { audio: aud(o.video, lv) });
  return g;
}

/* ======================= Recortar sujeto (SAM 3.1) ======================= */

const BG_COLOR = { green: 0x00ff00, black: 0x000000, white: 0xffffff };

/** Aplica la máscara según el fondo elegido. Devuelve el link de la imagen resultante. */
export function applyMask(g, image, mask, bg, isImage) {
  if (bg === 'mask') return [g.add('MaskToImage', { mask }), 0];
  if (bg === 'alpha' && isImage) {
    const inv = g.add('InvertMask', { mask });   // JoinImageWithAlpha toma 1 = transparente
    return [g.add('JoinImageWithAlpha', { image, alpha: [inv, 0] }), 0];
  }
  const sz = g.add('GetImageSize', { image });
  const back = g.add('EmptyImage', { width: [sz, 0], height: [sz, 1], batch_size: [sz, 2], color: BG_COLOR[bg] ?? BG_COLOR.green });
  return [g.add('ImageCompositeMasked', { destination: [back, 0], source: image, x: 0, y: 0, resize_source: false, mask }), 0];
}

/** Recorta con SAM 3.1 un IMAGE ya cargado (lo usa también recast.js para el modo Reemplazar). Devuelve el link MASK. */
export function samMask(g, image, prompt, { threshold = 0.5, grow = 0 } = {}) {
  const ck = g._samCk || (g._samCk = g.add('CheckpointLoaderSimple', { ckpt_name: 'sam3.1_multiplex_fp16.safetensors' }, 'Cargando SAM 3…'));   // uno solo por grafo
  const te = g.add('CLIPTextEncode', { clip: [ck, 1], text: String(prompt || 'person').slice(0, 120) });
  const det = g.add('SAM3_Detect', { model: [ck, 0], image, conditioning: [te, 0], threshold, refine_iterations: 2, individual_masks: false }, 'Buscando el sujeto…');
  let mask = [det, 0];
  if (grow > 0) mask = [g.add('GrowMask', { mask, expand: Math.round(grow), tapered_corners: true }), 0];
  return mask;
}

/* SAM 3.1 (plantilla utility_video_segment_sam3): texto -> máscara por cuadro; recorte sobre verde/negro/blanco, máscara o PNG transparente. */
function sam3(o) {
  const g = G(); const f = o.file || o.video;
  const img = isImg(f);
  const bg = o.bg === 'alpha' && !img ? 'green' : (o.bg || (img ? 'alpha' : 'green'));
  let src, lv = null, mb = null;
  if (img) src = [g.add('LoadImage', { image: f.ref }), 0];
  else {
    mb = g.add('VHS_BatchManager', { frames_per_batch: 64 });   // por lotes: SAM 3 trabaja cuadro por cuadro
    lv = loadVideoPath(g, f.abs, { metaBatch: mb });
    src = [lv, 0];
  }
  const mask = samMask(g, src, o.prompt, { grow: o.grow || 0 });
  const out = applyMask(g, src, mask, bg, img);
  if (img) {
    saveImage(g, out, 'phane/recorte_img');
    if (o.withMask && bg !== 'mask') saveImage(g, [g.add('MaskToImage', { mask }), 0], 'phane/mascara_img');
  } else {
    const info = g.add('VHS_VideoInfoLoaded', { video_info: [lv, 3] });
    saveVideo(g, out, [info, 0], 'phane/recorte', { audio: bg === 'mask' ? undefined : aud(f, lv), metaBatch: mb });
    if (o.withMask && bg !== 'mask') saveVideo(g, [g.add('MaskToImage', { mask }), 0], [info, 0], 'phane/mascara', { metaBatch: mb });
  }
  return g;
}

/* ======================= estimaciones (una GPU de 8 GB) ======================= */
const vidFrames = f => secsOf(f) * (f && f.fps > 0 ? f.fps : 30);
/** SeedVR2: 3B ≈ 26 min por 10 s de video a 480p (x2); imagen ≈ 25 s + 12 s por MP de salida. k = factor del modelo (7B int8 ≈ x1.05 del 3B, medido 25-oct; RAM agrega +23 GB en video 576p). */
const estSeed = k => o => {
  const f = o.file || {};
  if (isImg(f)) { const outMP = pxOf(f) * (o.scale === 4 ? 16 : 4) / 1e6; return Math.round(k * (25 + 12 * outMP)); }
  const parts = seedvrChunks(f, 2);   // cada tramo extra: ~20 s más de analizar/revelar y unir
  return Math.round(k * (40 + secsOf(f) * 156 * pxOf(f) / PX480 + (parts ? 20 * (parts.length - 1) : 0)));
};

const SAMPLE_IMG = { file: { kind: 'img', ref: 'example.png', w: 1024, h: 1024 }, scale: 2 };
const SAMPLE_VID = { file: { kind: 'vid', abs: 'ComfyUI\\input\\ejemplo.mp4', w: 832, h: 480, secs: 5, fps: 16 } };

export const ENGINES = [
  {
    id: 'upscale.esrgan', tool: 'upscale', tier: 'ligero',
    name: 'HD rápido (Real-ESRGAN x2)', desc: 'Duplica la resolución en segundos. Ideal para videos largos.',
    files: ['upscale_models/RealESRGAN_x2plus.pth'],
    ramGB: 8, est: o => (isImg(o.file) ? 6 : Math.round(10 + 6 * secsOf(o.file) * pxOf(o.file) / PX480)),
    build: esrgan, sample: SAMPLE_VID, caps: { kinds: ['img', 'vid'], scales: [2] },
  },
  {
    id: 'upscale.seedvr2_3b', tool: 'upscale', tier: 'ligero',
    name: 'HD Pro (SeedVR2 3B)', desc: 'Reconstruye detalle real (piel, texto, texturas). En video tarda varios minutos.',
    files: ['diffusion_models/seedvr2_3b_int8_convrot.safetensors', 'vae/seedvr2_ema_vae_fp16.safetensors'],
    ramGB: 16, est: estSeed(1), build: seedvr2('seedvr2_3b_int8_convrot.safetensors', 'hdpro'), sample: SAMPLE_IMG,   // 27-oct: 12 → 16 (tramos + unión en RAM)
    caps: { kinds: ['img', 'vid'], scales: [2, 4] },
  },
  {
    id: 'upscale.seedvr2_7b', tool: 'upscale', tier: 'highend',
    name: 'HD Pro Max (SeedVR2 7B sharp)', desc: 'El restaurador más fino (7B, nitidez extra). Muy lento en una GPU de 8 GB.',
    files: ['diffusion_models/seedvr2_7b_sharp_int8_convrot.safetensors', 'vae/seedvr2_ema_vae_fp16.safetensors'],
    // 28-oct: medido 832 s para 7 s de 480×832 (≈ 115 s por segundo); con 1.1 estimaba 1267
    ramGB: 24, est: estSeed(0.75), build: seedvr2('seedvr2_7b_sharp_int8_convrot.safetensors', 'hdmax'),
    sample: { file: { ...SAMPLE_VID.file, secs: 12, fps: 32, hasAudio: true } },   // largo: valida el camino por tramos (+ audio aparte)
    caps: { kinds: ['img', 'vid'], scales: [2, 4] },
  },
  {
    id: 'fps.rife', tool: 'fps', tier: 'ligero',
    name: 'RIFE 4.9', desc: 'Cuadros intermedios rápidos: x2 o x4 más fluido.',
    files: [],   // rife49.pth vive en custom_nodes/ComfyUI-Frame-Interpolation (no en models/)
    ramGB: 10, est: o => Math.round(10 + vidFrames(o.video) * ((o.factor || 2) - 1) * 0.06 * pxOf(o.video) / PX480),
    build: rife, sample: { video: SAMPLE_VID.file, factor: 2 }, caps: { factors: [2, 4] },
  },
  {
    id: 'fps.film', tool: 'fps', tier: 'highend',
    name: 'FILM', desc: 'Interpolación de Google: mejor con movimientos grandes, más lenta.',
    files: ['frame_interpolation/film_net_fp16.safetensors'],
    ramGB: 12, est: o => Math.round(15 + vidFrames(o.video) * ((o.factor || 2) - 1) * 0.25 * pxOf(o.video) / PX480),
    build: film, sample: { video: SAMPLE_VID.file, factor: 4 }, caps: { factors: [2, 4] },
  },
  {
    id: 'segment.sam3', tool: 'segment', tier: 'ligero',
    name: 'SAM 3.1', desc: 'Escribe qué recortar (person, dog, red car…) y lo separa en todo el video.',
    files: ['checkpoints/sam3.1_multiplex_fp16.safetensors'],
    ramGB: 8, est: o => (isImg(o.file) ? 15 : Math.round(20 + vidFrames(o.file) * 0.35 * pxOf(o.file) / PX480)),
    build: sam3, sample: { file: SAMPLE_VID.file, prompt: 'person', bg: 'green', withMask: true },
    caps: { kinds: ['img', 'vid'], bgs: ['green', 'black', 'white', 'mask', 'alpha'] },
  },
];
