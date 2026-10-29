// Motores de VIDEO: Wan 2.2 (Ligero / High End), LTX-2.3 con audio nativo y MiniMax H3 (experimental).
//
// Opciones comunes `o` (las arman pages/video.js y pages/efectos.js):
//   mode     't2v' | 'i2v' | 'flf' (inicio→final) | 'svi' (video largo en tramos de 5 s) | 'fun' (cámara exacta)
//   prompts  [texto en inglés]  (en 'svi' uno por tramo de 5 s; en los demás se usa el primero)
//   secs     duración en segundos;  quality 'draft' | 'final' | 'hd720';  ar '16:9' | '9:16' | '1:1' (si no hay imagen)
//   start/end  imágenes {ref,w,h};  pose  movimiento de Fun Camera ('Zoom In', 'Pan Left', …)
//   loras    [{name, strength, target:'high'|'low'|'both'}]  (name = nombre EXACTO de /models/loras)
//   boost    "Más acción";  nag  (solo Wan High End) negativo real con cfg 1;  seed (opcional)
import { G, rnd, NEG_WAN, VID_SIZE, arOf, loadImageFit, loadVideoPath, saveVideo, rife2x } from '../lib/graph.js';

/* ============================== Wan 2.2 ============================== */
const LIGHTX = {
  T2V: ['wan2.2_t2v_lightx2v_4steps_lora_v1.1_high_noise.safetensors', 'wan2.2_t2v_lightx2v_4steps_lora_v1.1_low_noise.safetensors'],
  I2V: ['wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors', 'wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors'],
};
const SVI = ['SVI_v2_PRO_Wan2.2-I2V-A14B_HIGH_lora_rank_128_fp16.safetensors', 'SVI_v2_PRO_Wan2.2-I2V-A14B_LOW_lora_rank_128_fp16.safetensors'];
const EXPERT = ['HighNoise', 'LowNoise'];
const FUN = k => `Wan2.2-Fun-A14B-Control-Camera-${k}-Q4_K_M.gguf`;
/** Fun Control (27-oct): ojo, guion bajo antes de HighNoise/LowNoise (los de Camera llevan guion). QuantStack, Apache-2.0. */
const CTRL = k => `Wan2.2-Fun-A14B-Control_${k}-Q4_K_M.gguf`;
export const CONTROL_FPS = 16;
/** Cuadros (4n+1, máx. 81 = 5 s) que salen del video guía: nunca pedir más de los que tiene el tramo elegido (se metería el corte). */
export const controlLen = gd => Math.min(81, Math.max(5, 4 * Math.floor((((gd && gd.frames) || 81) - 1) / 4) + 1));
const VAE_WAN = 'wan_2.1_vae.safetensors';

/** Perfil Ligero (probado en una GPU de 8 GB): Q4 + umt5 fp8, 4 pasos (2 high + 2 low). */
const WAN_LIGERO = {
  unet: (T, k) => `Wan2.2-${T}-A14B-${k}-Q4_K_M.gguf`,
  te: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
  steps: 4, split: 2,
  boost: { steps: 6, raw: 2, high: 3 },     // high SIN lightx2v (cfg 3.5) 0-2 → high 2-3 → low 3-6
  qDefault: 'draft', prefix: 'phane/video',
};
/** Perfil High End: I2V Q8_0 / T2V Q6_K + umt5 fp16, 8 pasos (4 high + 4 low). Fun Camera sigue en Q4. */
const WAN_HE = {
  unet: (T, k) => T === 'I2V' ? `Wan2.2-I2V-A14B-${k}-Q8_0.gguf` : `Wan2.2-T2V-A14B-${k}-Q6_K.gguf`,
  te: 'umt5_xxl_fp16.safetensors',
  steps: 8, split: 4,
  boost: { steps: 8, raw: 3, high: 4 },     // high SIN lightx2v (cfg 3.5) 0-3 → high 3-4 → low 4-8
  qDefault: 'hd720', prefix: 'phane/video_he', nag: true,
};

function needImage(o) {
  if ((o.mode || 't2v') !== 't2v' && !o.start) throw new Error('Este modo necesita una imagen inicial.');
  if (o.mode === 'flf' && !o.end) throw new Error('Inicio→Final necesita la imagen final.');
  if (o.mode === 'fun' && !o.pose) throw new Error('Falta el movimiento de cámara exacta.');
  if (o.mode === 'control' && !(o.guide && o.guide.abs)) throw new Error('Falta el video guía.');
}

function wanGraph(o, P) {
  needImage(o);
  const g = G();
  const mode = o.mode || 't2v';
  const t2v = mode === 't2v', fun = mode === 'fun', svi = mode === 'svi', control = mode === 'control';
  const ar = o.start ? arOf(o.start) : (o.ar || '16:9');
  const sizes = VID_SIZE[o.quality] || VID_SIZE[P.qDefault];
  const [w, h] = sizes[ar] || sizes['16:9'];
  const secs = Math.max(1, Math.min(5, Math.round(o.secs || 5)));
  const length = svi ? 81 : control ? controlLen(o.guide) : secs * 16 + 1;
  // 27-oct (punto 13): con 🔥 Más acción los últimos cuadros se ensucian (chispas de colores; en el tráiler se recortaban a mano).
  // Se generan BOOST_TAIL cuadros de más (3 latentes) y se cortan. No en Inicio→Final (debe terminar en la imagen final) ni en SVI.
  const tail = o.boost && !svi && !control && mode !== 'flf' ? BOOST_TAIL : 0;
  const genLen = length + tail;
  const T = t2v ? 'T2V' : 'I2V';
  const prompts = (o.prompts && o.prompts.length ? o.prompts : ['']).map(p => p || 'Cinematic, smooth natural motion, highly detailed.');

  const clip = g.add('CLIPLoader', { clip_name: P.te, type: 'wan', device: 'default' }, 'Cargando modelos de video…');
  const vae = g.add('VAELoader', { vae_name: VAE_WAN });
  const neg = g.add('CLIPTextEncode', { clip: [clip, 0], text: NEG_WAN });
  const encode = text => g.add('CLIPTextEncode', { clip: [clip, 0], text }, 'Leyendo tu idea…');
  const loadImg = im => loadImageFit(g, im.ref, w, h, 16);
  const unetFile = k => control ? CTRL(k) : fun ? FUN(k) : P.unet(T, k);
  const loras = o.loras || [];
  const useNag = !!(P.nag && o.nag !== false);
  const lora = (m, name, s = 1) => g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: name, strength_model: s });
  const userLoras = (m, j) => {
    for (const L of loras) {
      if (!L || !L.name) continue;
      if (L.target === 'high' && j !== 0) continue;
      if (L.target === 'low' && j !== 1) continue;
      m = lora(m, L.name, L.strength ?? 1);
    }
    return m;
  };

  // Expertos high (j=0) y low (j=1) con lightx2v (+ SVI) + LoRAs del usuario
  const models = EXPERT.map((k, j) => {
    let m = g.add('UnetLoaderGGUF', { unet_name: unetFile(k) }, 'Cargando modelos de video…');
    m = lora(m, LIGHTX[T][j]);
    if (svi) m = lora(m, SVI[j]);
    m = userLoras(m, j);
    // NAG (KJNodes): negativo real con cfg 1, sin duplicar el cálculo
    if (useNag) m = g.add('WanVideoNAG', { model: [m, 0], conditioning: [neg, 0], nag_scale: 11, nag_alpha: 0.25, nag_tau: 2.5, input_type: 'default', inplace: false });
    // shift 8 + Wan fp16 (Turing) = cuadros negros en video largo; solo los Fun (cámara exacta y control, ≤ 81 cuadros) usan 8 como su plantilla
    return g.add('ModelSamplingSD3', { model: [m, 0], shift: fun || control ? 8 : 5 });
  });

  // "Más acción": primeros pasos del experto high SIN LoRA de velocidad y con CFG real → movimientos más grandes
  let rawHigh = null;
  if (o.boost) {
    let m = g.add('UnetLoaderGGUF', { unet_name: unetFile('HighNoise') });
    if (svi) m = lora(m, SVI[0]);
    m = userLoras(m, 0);
    rawHigh = g.add('ModelSamplingSD3', { model: [m, 0], shift: 5 });
  }

  const KS = (model, add, seed, steps, cfg, Pc, Nc, L, a, b, leftover, label) => g.add('KSamplerAdvanced', {
    model: [model, 0], add_noise: add ? 'enable' : 'disable', noise_seed: seed, steps, cfg, sampler_name: 'euler', scheduler: 'simple',
    positive: Pc, negative: Nc, latent_image: L, start_at_step: a, end_at_step: b, return_with_leftover_noise: leftover ? 'enable' : 'disable' }, label);
  const sample = (Pc, Nc, L, seed, tag) => {
    if (rawHigh) {
      const B = P.boost;
      const s1 = KS(rawHigh, true, seed, B.steps, 3.5, Pc, Nc, L, 0, B.raw, true, `Planeando la acción${tag} (1/3)`);
      const s2 = KS(models[0], false, seed, B.steps, 1, Pc, Nc, [s1, 0], B.raw, B.high, true, `Creando movimiento${tag} (2/3)`);
      return KS(models[1], false, seed, B.steps, 1, Pc, Nc, [s2, 0], B.high, 10000, false, `Afinando detalles${tag} (3/3)`);
    }
    const s1 = KS(models[0], true, seed, P.steps, 1, Pc, Nc, L, 0, P.split, true, `Creando movimiento${tag} (1/2)`);
    return KS(models[1], false, seed, P.steps, 1, Pc, Nc, [s1, 0], P.split, 10000, false, `Afinando detalles${tag} (2/2)`);
  };
  const seed0 = o.seed ?? rnd();

  let frames;
  if (svi) {
    // SVI 2.0 Pro: tramos de 81 cuadros; se decodifica cada tramo y se quita el 1er cuadro de los tramos 2+
    const anchor = g.add('VAEEncode', { pixels: [loadImg(o.start), 0], vae: [vae, 0] }, 'Preparando imagen…');
    let prev = null, acc = null;
    const n = prompts.length;
    prompts.forEach((p, i) => {
      const kw = { positive: [encode(p), 0], negative: [neg, 0], length, anchor_samples: [anchor, 0], motion_latent_count: 1 };
      if (prev) kw.prev_samples = [prev, 0];
      const c = g.add('WanImageToVideoSVIPro', kw);
      const out = sample([c, 0], [c, 1], [c, 2], i ? rnd() : seed0, ` · tramo ${i + 1}/${n}`);
      let dec = g.add('VAEDecode', { samples: [out, 0], vae: [vae, 0] }, `Revelando tramo ${i + 1}/${n}…`);
      if (i > 0) dec = g.add('ImageFromBatch', { image: [dec, 0], batch_index: 1, length: 4096 });
      acc = acc ? g.add('ImageBatch', { image1: [acc, 0], image2: [dec, 0] }) : dec;
      prev = out;
    });
    frames = [acc, 0];
  } else {
    let Pc = [encode(prompts[0]), 0], Nc = [neg, 0], L;
    if (t2v) L = [g.add('EmptyHunyuanLatentVideo', { width: w, height: h, length: genLen, batch_size: 1 }), 0];
    else {
      const kw = { positive: Pc, negative: Nc, vae: [vae, 0], width: w, height: h, length: genLen, batch_size: 1, start_image: [loadImg(o.start), 0] };
      let c;
      if (mode === 'flf') { kw.end_image = [loadImg(o.end), 0]; c = g.add('WanFirstLastFrameToVideo', kw, 'Preparando imágenes…'); }
      else if (control) {
        // plantilla video_wan2_2_14B_fun_control: Wan22FunControlToVideo con ref_image (NO start_image). WanFunControlToVideo es de
        // Wan 2.1: con él la prueba del 27-oct salió casi negra y con fantasmas.
        const { start_image, ...k2 } = kw;
        c = g.add('Wan22FunControlToVideo', { ...k2, ref_image: start_image, control_video: controlVideo(g, o, w, h, length) }, 'Preparando el movimiento guía…');
      }
      else if (fun) {
        kw.camera_conditions = [g.add('WanCameraEmbedding', { camera_pose: o.pose, width: w, height: h, length: genLen, speed: 1, fx: 0.5, fy: 0.5, cx: 0.5, cy: 0.5 }), 0];
        c = g.add('WanCameraImageToVideo', kw, 'Preparando cámara…');
      } else c = g.add('WanImageToVideo', kw, 'Preparando imagen…');
      Pc = [c, 0]; Nc = [c, 1]; L = [c, 2];
    }
    frames = [g.add('VAEDecode', { samples: [sample(Pc, Nc, L, seed0, ''), 0], vae: [vae, 0] }, 'Revelando fotogramas…'), 0];
    if (tail) frames = [g.add('ImageFromBatch', { image: frames, batch_index: 0, length }), 0];   // fuera la cola sucia
  }
  // 16 fps → 32 fps
  saveVideo(g, [rife2x(g, frames), 0], 32, P.prefix);
  return g;
}

const BOOST_TAIL = 12;
const wanUnits = o => o.mode === 'svi' ? Math.max(1, (o.prompts || []).length)
  : Math.max(0.7, (o.secs || 5) / 5) * (o.boost && o.mode !== 'flf' ? 1 + BOOST_TAIL / (16 * Math.max(1, o.secs || 5)) : 1);

const WAN_FILES_COMMON = [
  'vae/wan_2.1_vae.safetensors',
  ...LIGHTX.T2V.map(f => 'loras/' + f), ...LIGHTX.I2V.map(f => 'loras/' + f), ...SVI.map(f => 'loras/' + f),
  ...EXPERT.map(k => 'unet/' + FUN(k)),
];

const WAN_CAPS = {
  modes: ['t2v', 'i2v', 'flf', 'svi', 'fun'],
  durations: [3, 5, 10, 15, 20, 30], nativeSecs: 5, maxSecs: 30, svi: true,
  aspects: ['16:9', '9:16', '1:1'], exact: true, loras: true, boost: true, audio: false, fps: 32,
};

/* ============================== LTX-2.3 (video + audio) ============================== */
const LTX_CK = 'ltx-2.3-22b-distilled-fp8.safetensors';
const LTX_TE = 'gemma_3_12B_it_fp4_mixed.safetensors';
const LTX_UP = 'ltx-2.3-spatial-upscaler-x2-1.1.safetensors';
// Son los sigmas "distilled" de las plantillas oficiales (dev + LoRA distilled ≈ checkpoint distilled; aquí sin LoRA)
const LTX_S1 = '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0';
const LTX_S2 = '0.85, 0.7250, 0.4219, 0.0';
const LTX_NEG = 'pc game, console game, video game, cartoon, childish, ugly';
// Tamaño FINAL (la etapa 1 va a la mitad): múltiplos de 64 para que la mitad sea múltiplo de 32
const LTX_SIZE = {
  draft: { '16:9': [768, 448], '9:16': [448, 768], '1:1': [576, 576] },
  final: { '16:9': [1024, 576], '9:16': [576, 1024], '1:1': [768, 768] },
  hd720: { '16:9': [1280, 704], '9:16': [704, 1280], '1:1': [960, 960] },
};

/* Salto brusco al final (26-oct): con "the camera pushes in" + varias acciones, LTX-2.3 se queda quieto ~2.5 s y luego CORTA
   a primer plano. Con cfg 1 (destilado) el negativo no sirve: se arregla en el positivo. Se suaviza el empuje de cámara
   y se pide una sola toma continua. ✍️ Al pie de la letra (o.literal) lo apaga. */
const LTX_ONE_SHOT = ' One continuous shot with no cuts: the motion starts right away and the camera moves smoothly and steadily, keeping the same framing distance.';
export function ltxOneShot(t) {
  const s = String(t).replace(/\b(?:the\s+)?camera\s+(?:slowly\s+|quickly\s+)?(?:pushes|push|dollies|dolly|zooms|zoom)\s+in\b/gi, 'the camera drifts slightly closer');
  return /no cuts/i.test(s) ? s : s.trim().replace(/[.;,]?$/, '.') + LTX_ONE_SHOT;
}
function ltxGraph(o) {
  const g = G();
  const i2v = !!o.start && o.mode !== 't2v';
  const ar = o.start ? arOf(o.start) : (o.ar || '16:9');
  const S = LTX_SIZE[o.quality] || LTX_SIZE.hd720;
  const [W, H] = S[ar] || S['16:9'];
  const fps = 25;
  const secs = Math.max(1, Math.min(20, o.secs || 5));
  const len = 8 * Math.round(secs * fps / 8) + 1;        // 8n+1 cuadros a 25 fps
  const user = (o.prompts && o.prompts[0]) || 'Cinematic shot, natural motion, ambient sound.';
  const text = o.literal ? user : ltxOneShot(user);

  const ck = g.add('CheckpointLoaderSimple', { ckpt_name: LTX_CK }, 'Cargando LTX-2.3…');
  const avae = g.add('LTXVAudioVAELoader', { ckpt_name: LTX_CK });
  const te = g.add('LTXAVTextEncoderLoader', { text_encoder: LTX_TE, ckpt_name: LTX_CK, device: 'default' }, 'Cargando Gemma 3…');
  const pos = g.add('CLIPTextEncode', { clip: [te, 0], text }, 'Leyendo tu idea…');
  const neg = g.add('CLIPTextEncode', { clip: [te, 0], text: LTX_NEG });
  const cond = g.add('LTXVConditioning', { positive: [pos, 0], negative: [neg, 0], frame_rate: fps });

  const img = i2v ? loadImageFit(g, o.start.ref, W, H, 64) : g.add('EmptyImage', { width: 512, height: 512, batch_size: 1, color: 0 });
  const pre = g.add('LTXVPreprocess', { image: [img, 0], img_compression: o.imgComp ?? 18 });

  // Etapa 1: mitad de resolución, video + audio juntos (8 pasos distilled)
  const lat = g.add('EmptyLTXVLatentVideo', { width: W / 2, height: H / 2, length: len, batch_size: 1 });
  const lat1 = g.add('LTXVImgToVideoInplace', { vae: [ck, 2], image: [pre, 0], latent: [lat, 0], strength: 0.7, bypass: !i2v });
  const alat = g.add('LTXVEmptyLatentAudio', { frames_number: len, frame_rate: fps, batch_size: 1, audio_vae: [avae, 0] });
  const av1 = g.add('LTXVConcatAVLatent', { video_latent: [lat1, 0], audio_latent: [alat, 0] });
  const gd1 = g.add('CFGGuider', { model: [ck, 0], positive: [cond, 0], negative: [cond, 1], cfg: 1 });
  const s1 = g.add('SamplerCustomAdvanced', { noise: [g.add('RandomNoise', { noise_seed: o.seed ?? rnd() }), 0], guider: [gd1, 0],
    sampler: [g.add('KSamplerSelect', { sampler_name: 'euler' }), 0], sigmas: [g.add('ManualSigmas', { sigmas: LTX_S1 }), 0],
    latent_image: [av1, 0] }, 'Creando video y sonido (1/2)');
  const sep1 = g.add('LTXVSeparateAVLatent', { av_latent: [s1, 0] });

  // Etapa 2: subir x2 y afinar (3 pasos)
  const upm = g.add('LatentUpscaleModelLoader', { model_name: LTX_UP });
  const up = g.add('LTXVLatentUpsampler', { samples: [sep1, 0], upscale_model: [upm, 0], vae: [ck, 2] }, 'Subiendo resolución…');
  const lat2 = g.add('LTXVImgToVideoInplace', { vae: [ck, 2], image: [pre, 0], latent: [up, 0], strength: 1, bypass: !i2v });
  const av2 = g.add('LTXVConcatAVLatent', { video_latent: [lat2, 0], audio_latent: [sep1, 1] });
  const crop = g.add('LTXVCropGuides', { positive: [cond, 0], negative: [cond, 1], latent: [sep1, 0] });
  const gd2 = g.add('CFGGuider', { model: [ck, 0], positive: [crop, 0], negative: [crop, 1], cfg: 1 });
  const s2 = g.add('SamplerCustomAdvanced', { noise: [g.add('RandomNoise', { noise_seed: 42 }), 0], guider: [gd2, 0],
    sampler: [g.add('KSamplerSelect', { sampler_name: 'euler' }), 0], sigmas: [g.add('ManualSigmas', { sigmas: LTX_S2 }), 0],
    latent_image: [av2, 0] }, 'Afinando detalles (2/2)');
  const sep2 = g.add('LTXVSeparateAVLatent', { av_latent: [s2, 0] });

  // 8 GB: decodificar en mosaicos y por bloques de cuadros
  const dec = g.add('VAEDecodeTiled', { samples: [sep2, 0], vae: [ck, 2], tile_size: 512, overlap: 64, temporal_size: 64, temporal_overlap: 8 }, 'Revelando fotogramas…');
  const aud = g.add('LTXVAudioVAEDecode', { samples: [sep2, 1], audio_vae: [avae, 0] }, 'Mezclando el sonido…');
  saveVideo(g, [dec, 0], fps, 'phane/video_ltx', { audio: [aud, 0] });
  return g;
}

/* ============================== MiniMax H3 (experimental) ============================== */
const H3_UNET = 'minimax_h3_fl2va_pruned_int8_convrot.safetensors';
const H3_TE = 'qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors';
const H3_VAE = 'minimax_h3_video_vae_int8_convrot.safetensors';
const H3_AVAE = 'minimax_h3_audio_vae_fp32.safetensors';
const H3_TURBO = 'minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors';
// tabla de la plantilla (múltiplos de 32): ~0.2 MP / ~0.4 MP
const H3_SIZE = {
  draft: { '16:9': [608, 352], '9:16': [352, 608], '1:1': [448, 448] },
  final: { '16:9': [864, 480], '9:16': [480, 864], '1:1': [640, 640] },
};
/** Cuadros a 24 fps ajustados a la rejilla 17k+5 del modelo (misma expresión que la plantilla). */
export const h3Length = secs => { const f = Math.max(5, Math.round(secs * 24)); return f + ((5 - (f % 17)) % 17 + 17) % 17; };

function h3Graph(o) {
  const g = G();
  const ar = o.start ? arOf(o.start) : (o.ar || '16:9');
  const S = H3_SIZE[o.quality] || H3_SIZE.final;
  const [W, H] = S[ar] || S['16:9'];
  const secs = Math.max(1, Math.min(15, o.secs || 5));
  const text = (o.prompts && o.prompts[0]) || 'Cinematic shot, natural motion, ambient sound.';

  let m = g.add('UNETLoader', { unet_name: H3_UNET, weight_dtype: 'default' }, 'Cargando MiniMax H3…');
  m = g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: H3_TURBO, strength_model: 1 });
  const clip = g.add('CLIPLoader', { clip_name: H3_TE, type: 'minimax', device: 'default' }, 'Cargando Qwen3-VL 32B…');
  const vae = g.add('VAELoader', { vae_name: H3_VAE });
  const avae = g.add('VAELoader', { vae_name: H3_AVAE });
  const kw = { clip: [clip, 0], vae: [vae, 0], prompt: text, width: W, height: H, length: h3Length(secs) };
  if (o.start && o.mode !== 't2v') kw.first_frame = [loadImageFit(g, o.start.ref, W, H, 32), 0];
  if (o.end && o.mode === 'flf') kw.last_frame = [loadImageFit(g, o.end.ref, W, H, 32), 0];
  const c = g.add('MiniMaxH3ImageToVideo', kw, 'Leyendo tu idea…');
  const sch = g.add('BasicScheduler', { model: [m, 0], scheduler: 'simple', steps: 8, denoise: 1 });
  const gd = g.add('BasicGuider', { model: [m, 0], conditioning: [c, 0] });
  const s = g.add('SamplerCustomAdvanced', { noise: [g.add('RandomNoise', { noise_seed: o.seed ?? rnd() }), 0], guider: [gd, 0],
    sampler: [g.add('KSamplerSelect', { sampler_name: 'res_multistep' }), 0], sigmas: [sch, 0], latent_image: [c, 1] }, 'Creando video y sonido');
  const dec = g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando fotogramas…');
  const aud = g.add('VAEDecodeAudio', { samples: [s, 0], vae: [avae, 0] }, 'Mezclando el sonido…');
  saveVideo(g, [dec, 0], 24, 'phane/video_h3', { audio: [aud, 0] });
  return g;
}

/* 🎯 Seguir el movimiento de un video (27-oct): el video guía (o.guide = {abs, skip, frames} a 16 fps, como Recast) se recorta al
   formato de salida y se vuelve PROFUNDIDAD (Depth Anything V2 Small, depth_node.py) o ESQUELETO (SDPose). Wan Fun Control
   lo sigue cuadro a cuadro desde tu imagen de inicio: el movimiento real del original con tu personaje y tu escena. */
function controlVideo(g, o, w, h, length) {
  const gd = o.guide;
  const lv = loadVideoPath(g, gd.abs, { rate: CONTROL_FPS, cap: length, skip: Math.max(0, Math.round(gd.skip || 0)) });
  const fit = g.add('ImageResizeKJv2', { image: [lv, 0], width: w, height: h, upscale_method: 'lanczos', keep_proportion: 'crop',
    pad_color: '0, 0, 0', crop_position: 'center', divisible_by: 16 }, 'Leyendo el video guía…');
  if (o.control === 'pose') {
    const ck = g.add('CheckpointLoaderSimple', { ckpt_name: 'sdpose_wholebody_fp16.safetensors' }, 'Cargando SDPose…');
    const kp = g.add('SDPoseKeypointExtractor', { model: [ck, 0], vae: [ck, 2], image: [fit, 0], batch_size: 16 }, 'Leyendo la pose de cada cuadro…');
    return [g.add('SDPoseDrawKeypoints', { keypoints: [kp, 0], draw_body: true, draw_hands: true, draw_face: true, draw_feet: true,
      stick_width: 4, face_point_size: 2, score_threshold: 0.4, draw_head: true }, 'Dibujando los esqueletos…'), 0];
  }
  return [g.add('PhaneDepth', { image: [fit, 0] }, 'Midiendo la profundidad de cada cuadro…'), 0];
}

/* ============================== registro ============================== */
const SAMPLE_WAN = {
  mode: 'svi', secs: 10, quality: 'draft', ar: '16:9', boost: true,
  prompts: ['The camera slowly dollies in. A woman in a red raincoat walks down a rainy neon street at night.',
    'She stops, turns toward the camera and smiles as the rain keeps falling.'],
  start: { ref: 'example.png', w: 832, h: 480 },
  loras: [{ name: 'remade\\Squish.safetensors', strength: 1, target: 'both' }],
};

/** Costo extra de las LoRAs (cámara/efectos) sobre Wan GGUF: medido ~x4-5 con 2 LoRAs + Más acción. */
// 28-oct: en borrador 272p la LoRA pesa mucho menos (medido: 3 s i2v + 1 LoRA de efecto = 64-106 s; antes estimaba 166)
const loraCost = o => 1 + (o.quality === 'draft' ? 0.35 : 1.5) * Math.min(2, (o.loras || []).length) * (o.boost ? 1.3 : 1);

export const ENGINES = [
  {
    id: 'video.wan', tool: 'video', tier: 'ligero',
    name: 'Wan 2.2 (Ligero)', desc: 'Texto o imagen → video, inicio→final, video largo (SVI), cámara exacta y efectos. Borrador 272p o 480p.',
    files: [
      ...['T2V', 'I2V'].flatMap(T => EXPERT.map(k => `unet/${WAN_LIGERO.unet(T, k)}`)),
      'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', ...WAN_FILES_COMMON,
    ],
    ramGB: 43,   // medido 25-oct: +40.4 GB sobre la base (i2v 480p 5 s)
    // medido en una GPU de 8 GB: 10 s borrador + Más acción + 2 LoRAs = 26 min (cada LoRA en GGUF se aplica en cada paso: muy caro)
    est: o => ((o.mode === 'fun' ? { draft: 120, final: 450 } : { draft: 95, final: 450 })[o.quality] ?? 450) * wanUnits(o) * (o.boost ? 2 : 1) * loraCost(o),
    build: o => wanGraph(o, WAN_LIGERO),
    sample: SAMPLE_WAN,
    caps: { ...WAN_CAPS, qDefault: 'draft', qualities: [['draft', 'Borrador 272p', 'Rápido: para probar la idea'], ['final', '480p', 'Calidad final']] },
  },
  {
    // 🎯 modo "control" del Wan ligero en motor aparte: si faltan sus GGUF no se bloquea el Wan normal. La página lo usa cuando hay video guía.
    id: 'video.wan_control', tool: 'video', tier: 'ligero',
    name: 'Wan 2.2 Fun Control', desc: 'Tu imagen se mueve igual que el video guía (profundidad o esqueleto de cada cuadro). Hasta 5 s.',
    files: [...EXPERT.map(k => 'unet/' + CTRL(k)), 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'vae/wan_2.1_vae.safetensors',
      ...LIGHTX.I2V.map(f => 'loras/' + f), 'depth_anything/Depth-Anything-V2-Small-hf/model.safetensors'],
    ramGB: 45,   // como Fun Camera (43) + profundidad/SDPose y cuadros del video guía
    est: o => ({ draft: 130, final: 480 }[o.quality] ?? 480) * Math.max(0.5, controlLen(o.guide) / 81) + 3 * controlLen(o.guide) * (o.control === 'pose' ? 2 : 1),
    build: o => wanGraph({ ...o, mode: 'control', boost: false, loras: [] }, WAN_LIGERO),
    sample: { mode: 'control', control: 'depth', prompts: ['A cheerful girl on roller skates spins and waves in a sunny street. Cinematic, smooth natural motion.'], quality: 'final',
      start: { ref: 'example.png', w: 1376, h: 768 }, guide: { abs: 'ComfyUI\\input\\ejemplo.mp4', skip: 80, frames: 41 } },
    caps: { internal: true, control: true, qualities: [['draft', 'Borrador 272p'], ['final', '480p']], qDefault: 'draft', fps: 32 },
  },
  {
    id: 'video.wan_he', tool: 'video', tier: 'highend',
    name: 'Wan 2.2 High End (720p, Q8)', desc: 'Wan 2.2 I2V Q8 / T2V Q6 + umt5 fp16, 8 pasos, 720p y negativo real (NAG). Mismos modos que el Ligero.',
    files: [
      ...['T2V', 'I2V'].flatMap(T => EXPERT.map(k => `unet/${WAN_HE.unet(T, k)}`)),
      'text_encoders/umt5_xxl_fp16.safetensors', ...WAN_FILES_COMMON,
    ],
    ramGB: 52,   // medido 25-oct: +48.4 GB sobre la base (i2v 480p 5 s; pico total 63.1 de 64)
    est: o => ({ draft: 165, final: 470, hd720: 5400 }[o.quality] ?? 470) * wanUnits(o)   /* 26-oct: 720p 5 s pasó de 84 min sin terminar (2 intentos, cortado); medido en una GPU de 8 GB: 480p 3 s + 2 LoRAs = 22 min (base sin LoRAs; loraCost suma el resto) */ * (o.boost ? 1.5 : 1) * (o.mode === 'fun' ? 1.1 : 1) * loraCost(o),
    build: o => wanGraph(o, WAN_HE),
    sample: { ...SAMPLE_WAN, mode: 'i2v', secs: 5, quality: 'final', nag: true, prompts: [SAMPLE_WAN.prompts[0]] },
    caps: { ...WAN_CAPS, nag: true, maxSecsByQuality: { hd720: 15 }, qDefault: 'final',
      qualities: [['final', '480p', 'Más rápido'], ['hd720', '720p', 'Máxima calidad (más de 1.5 h en 8 GB)']] },
  },
  {
    id: 'video.ltx23', tool: 'video', tier: 'highend',
    name: 'LTX-2.3 con sonido (22B)', desc: 'Video CON audio nativo (voces, efectos, ambiente) hasta 20 s. Texto o imagen → video.',
    files: [`checkpoints/${LTX_CK}`, `text_encoders/${LTX_TE}`, `latent_upscale_models/${LTX_UP}`],
    ramGB: 48,   // medido: LTXAV 32.6 + Gemma 11.2 + VAE 2.8 + upscaler 1.9 GB en RAM
    est: o => { const s = o.secs || 5; return 200 + ({ draft: 35, final: 30, hd720: 70 }[o.quality] ?? 100) * s * (1 + s / 20); },   // medido: 720p 5 s = 13 min (con --disable-fast-disk); 26-oct: 576p 350 s, 720p 626 s (+46.7 GB)
    build: ltxGraph,
    sample: { mode: 'i2v', secs: 5, quality: 'hd720', prompts: ['A street musician plays the violin under a bridge at dusk, people pass by, the melody echoes with city ambience.'],
      start: { ref: 'example.png', w: 1280, h: 720 } },
    caps: { modes: ['t2v', 'i2v'], durations: [3, 5, 10, 15, 20], nativeSecs: 20, maxSecs: 20, aspects: ['16:9', '9:16', '1:1'],
      audio: true, loras: false, exact: false, boost: false, fps: 25, qDefault: 'hd720',
      qualities: [['draft', 'Borrador 448p', 'Rápido: para probar'], ['final', '576p', 'Buena calidad'], ['hd720', '720p', 'Máxima calidad']] },
  },
  {
    id: 'video.h3', tool: 'video', tier: 'experimental',
    name: 'MiniMax H3 (experimental)', desc: 'Video + audio estéreo hasta 15 s, con imagen inicial y/o final. Muy pesado: puede tardar más de media hora.',
    files: [`diffusion_models/${H3_UNET}`, `text_encoders/${H3_TE}`, `vae/${H3_VAE}`, `vae/${H3_AVAE}`, `loras/${H3_TURBO}`],
    ramGB: 50,   // medido 25-oct: +47.4 GB sobre la base (i2v 480p 5 s)
    est: o => { const s = o.secs || 5; return 240 + ({ draft: 45, final: 90 }[o.quality] ?? 90) * s * (1 + s / 15); },   // medido: 480p 3 s = 9 min
    build: h3Graph,
    sample: { mode: 'flf', secs: 5, quality: 'final', prompts: ['A paper boat sails across a puddle in the rain, then lifts off and flies into the sky; soft rain and playful music.'],
      start: { ref: 'example.png', w: 864, h: 480 }, end: { ref: 'example2.png', w: 864, h: 480 } },
    caps: { modes: ['t2v', 'i2v', 'flf'], durations: [3, 5, 10, 15], nativeSecs: 15, maxSecs: 15, aspects: ['16:9', '9:16', '1:1'],
      audio: true, loras: false, exact: false, boost: false, fps: 24, qDefault: 'final',
      qualities: [['draft', 'Borrador 352p', '≈0.2 MP'], ['final', '480p', '≈0.4 MP']] },
  },
];
