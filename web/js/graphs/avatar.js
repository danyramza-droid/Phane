// Motores de AVATAR (Lipsync Studio): una foto + guion (Chatterbox) o tu propio audio -> la persona habla con los labios sincronizados.
// o = { face:{ref,w,h}, text, lang, expr, voice?:{ref} (clonar), audio?:{ref} (usar este audio, sin TTS), secs? (duración del audio propio),
//       quality:'draft'|'final'|'hd720', prompt? (escena/actitud, en inglés) }
import { G, rnd, NEG_WAN, VID_SIZE, arOf, align4, loadImageFit, saveVideo } from '../lib/graph.js';
import { voiceNode, speechSecs, CHATTERBOX_FILES } from './audio.js';

const FPS = 25;

/** Segundos de habla a cubrir: audio propio (medido por la página) o estimado del guion con margen. */
export function talkSecs(o) {
  if (o.audio && o.audio.ref) return (+o.secs || 8) + 0.2;
  return (+o.secs || speechSecs(o.text, o.lang)) * 1.15;
}
const framesFor = o => Math.max(9, Math.ceil(talkSecs(o) * FPS));

/** Audio que mueve los labios: el propio (LoadAudio) o la voz de Chatterbox. Devuelve link AUDIO. */
function speech(g, o) {
  if (o.audio && o.audio.ref) return [g.add('LoadAudio', { audio: o.audio.ref }, 'Leyendo tu audio…'), 0];
  return [voiceNode(g, o), 0];
}

/** Prompt (inglés) según la emoción elegida + escena opcional del usuario. */
function talkPrompt(o) {
  const ex = +o.expr || 0.5;
  const base = ex >= 0.8 ? 'A person talking energetically and expressively to the camera, lively facial expressions, natural head movement and hand gestures, realistic.'
    : ex <= 0.35 ? 'A person talking calmly to the camera, subtle facial expressions, gentle head movement, realistic.'
      : 'A person talking naturally to the camera, natural head movement and facial expressions, realistic.';
  return o.prompt ? `${String(o.prompt).trim().replace(/\.?$/, '.')} ${base}` : base;
}

/* ---------- InfiniteTalk (Ligero): port de talkGraph de estudio_simple (probado en una GPU de 8 GB) ---------- */
// Wan 2.1 I2V 480p Q4 + InfiniteTalk single + lightx2v rank64, 25 fps, tramos de hasta 81 cuadros con 9 de movimiento, 4 pasos.
function infinitetalk(o) {
  const g = G(); const MOT = 9;
  const q = o.quality === 'final' ? 'final' : 'draft';
  const [w, h] = VID_SIZE[q][arOf(o.face)];
  const F = framesFor(o);
  const lens = [Math.min(81, align4(F))]; let covered = lens[0];
  while (covered < F) { const L = Math.min(81, align4(F - covered + MOT)); lens.push(L); covered += L - MOT; }
  const voice = speech(g, o);
  const ae = g.add('AudioEncoderLoader', { audio_encoder_name: 'wav2vec2-chinese-base_fp16.safetensors' });
  const aenc = g.add('AudioEncoderEncode', { audio_encoder: [ae, 0], audio: voice }, 'Escuchando la voz…');
  const clip = g.add('CLIPLoader', { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' }, 'Cargando modelos…');
  const vae = g.add('VAELoader', { vae_name: 'wan_2.1_vae.safetensors' });
  const pos = g.add('CLIPTextEncode', { clip: [clip, 0], text: talkPrompt(o) }, 'Leyendo la escena…');
  const neg = g.add('ConditioningZeroOut', { conditioning: [pos, 0] });
  const im = loadImageFit(g, o.face.ref, w, h, 16);
  let m = g.add('UnetLoaderGGUF', { unet_name: 'wan2.1-i2v-14b-480p-Q4_K_M.gguf' }, 'Cargando modelos…');
  m = g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', strength_model: 1 });
  const patch = g.add('ModelPatchLoader', { name: 'wan2.1_infiniteTalk_single_fp16.safetensors' }, 'Cargando InfiniteTalk…');
  let acc = null;
  lens.forEach((L, i) => {
    const tag = lens.length > 1 ? ` · tramo ${i + 1}/${lens.length}` : '';
    const kw = { mode: 'single_speaker', model: [m, 0], model_patch: [patch, 0], positive: [pos, 0], negative: [neg, 0], vae: [vae, 0], width: w, height: h, length: L,
      audio_encoder_output_1: [aenc, 0], start_image: [im, 0], motion_frame_count: MOT, audio_scale: 1 };
    if (acc) kw.previous_frames = [acc, 0];
    const it = g.add('WanInfiniteTalkToVideo', kw);
    const gd = g.add('CFGGuider', { model: [it, 0], positive: [it, 1], negative: [it, 2], cfg: 1 });
    const sch = g.add('BasicScheduler', { model: [it, 0], scheduler: 'normal', steps: 4, denoise: 1 });
    const smp = g.add('KSamplerSelect', { sampler_name: 'euler' });
    const nz = g.add('RandomNoise', { noise_seed: rnd() });
    const s = g.add('SamplerCustomAdvanced', { noise: [nz, 0], guider: [gd, 0], sampler: [smp, 0], sigmas: [sch, 0], latent_image: [it, 3] }, 'Moviendo labios' + tag);
    let d = g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando' + tag + '…');
    if (acc) { d = g.add('ImageFromBatch', { image: [d, 0], batch_index: MOT, length: 4096 }); acc = g.add('ImageBatch', { image1: [acc, 0], image2: [d, 0] }); }
    else acc = d;
  });
  saveVideo(g, [acc, 0], FPS, 'phane/habla', { audio: voice, trimToAudio: true });
  return g;
}

/* ---------- HuMo 17B (High End): texto + imagen + audio (copiado de tpl_video_humo) ---------- */
// HuMo genera 97 cuadros (3.9 s a 25 fps) y siempre lee el audio desde el cuadro 0, así que los discursos largos se arman en
// tramos: el audio se rellena con silencio, se corta en ventanas de 3.88 s y cada tramo se genera con la misma foto de referencia.
// Shift 5 (regla probada de Wan en fp16 en Turing) en vez del 8 de la plantilla.
const HUMO_SEG = 97;
function humo(o) {
  const g = G();
  const q = ['draft', 'final', 'hd720'].includes(o.quality) ? o.quality : 'final';
  const [w, h] = VID_SIZE[q][arOf(o.face)];
  const F = framesFor(o);
  const n = Math.max(1, Math.ceil(F / HUMO_SEG));
  const segSecs = HUMO_SEG / FPS;
  const voice = speech(g, o);
  const pad = g.add('EmptyAudio', { duration: n * segSecs + 0.5, sample_rate: 44100, channels: 2 });
  const full = g.add('AudioMerge', { audio1: [pad, 0], audio2: voice, merge_method: 'add' });
  const ae = g.add('AudioEncoderLoader', { audio_encoder_name: 'whisper_large_v3_fp16.safetensors' }, 'Cargando Whisper…');
  const clip = g.add('CLIPLoader', { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' }, 'Cargando modelos…');
  const vae = g.add('VAELoader', { vae_name: 'wan_2.1_vae.safetensors' });
  const pos = g.add('CLIPTextEncode', { clip: [clip, 0], text: talkPrompt(o) }, 'Leyendo la escena…');
  const neg = g.add('CLIPTextEncode', { clip: [clip, 0], text: NEG_WAN });
  let m = g.add('UNETLoader', { unet_name: 'humo_17B_fp8_e4m3fn.safetensors', weight_dtype: 'default' }, 'Cargando HuMo 17B…');
  m = g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', strength_model: 1 });
  m = g.add('ModelSamplingSD3', { model: [m, 0], shift: 5 });
  const face = loadImageFit(g, o.face.ref, w, h, 16);
  const seed = rnd();
  let acc = null;
  for (let i = 0; i < n; i++) {
    const L = i < n - 1 ? HUMO_SEG : Math.min(HUMO_SEG, align4(F - i * HUMO_SEG));
    const tag = n > 1 ? ` · tramo ${i + 1}/${n}` : '';
    const seg = g.add('TrimAudioDuration', { audio: [full, 0], start_index: +(i * segSecs).toFixed(2), duration: +(L / FPS).toFixed(2) });
    const enc = g.add('AudioEncoderEncode', { audio_encoder: [ae, 0], audio: [seg, 0] }, 'Escuchando la voz' + tag + '…');
    const hm = g.add('WanHuMoImageToVideo', { positive: [pos, 0], negative: [neg, 0], vae: [vae, 0], width: w, height: h, length: L, batch_size: 1,
      audio_encoder_output: [enc, 0], ref_image: [face, 0] });
    const s = g.add('KSampler', { model: [m, 0], seed, steps: 6, cfg: 1, sampler_name: 'uni_pc', scheduler: 'simple', denoise: 1,
      positive: [hm, 0], negative: [hm, 1], latent_image: [hm, 2] }, 'Animando' + tag);
    const d = g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando' + tag + '…');
    acc = acc ? g.add('ImageBatch', { image1: [acc, 0], image2: [d, 0] }) : d;
  }
  saveVideo(g, [acc, 0], FPS, 'phane/habla_he', { audio: voice, trimToAudio: true });
  return g;
}

const SAMPLE_FACE = { ref: 'example.png', w: 832, h: 1216 };
const TTS_SECS = o => (o.audio && o.audio.ref ? 3 : 15);

export const ENGINES = [
  {
    id: 'avatar.infinitetalk', tool: 'avatar', tier: 'ligero',
    name: 'InfiniteTalk (Wan 2.1)', desc: 'Labios sincronizados con movimiento natural de cabeza. Hasta 1 min (se arma en tramos). Probado en una GPU de 8 GB.',
    files: ['unet/wan2.1-i2v-14b-480p-Q4_K_M.gguf', 'model_patches/wan2.1_infiniteTalk_single_fp16.safetensors',
      'loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
      'vae/wan_2.1_vae.safetensors', 'audio_encoders/wav2vec2-chinese-base_fp16.safetensors', ...CHATTERBOX_FILES],
    ramGB: 30,
    // medido: borrador ≈ 45 s por segundo de voz (480×272); 28-oct: 480p con foto ¾ 1152×1536 (sale 480×832) ≈ 124-129 s por
    // segundo de voz. La foto se escala al tamaño del video, así que el costo sigue a los píxeles que salen (los decide la forma de la foto).
    est: o => {
      const q = o.quality === 'final' ? 'final' : 'draft', [w, h] = VID_SIZE[q][arOf(o.face)];
      const rate = q === 'final' ? 127 * (w * h) / (480 * 832) : 45 * (w * h) / (480 * 272);
      return Math.round(TTS_SECS(o) + 20 + rate * talkSecs(o));
    },
    build: infinitetalk,
    sample: { face: SAMPLE_FACE, text: 'Hola, ¿qué tal? Bienvenidos a mi canal. Hoy les traigo algo que les va a encantar, quédense hasta el final.',
      lang: 'es', expr: 0.5, quality: 'draft', voice: { ref: 'voz_referencia.mp3' } },
    caps: { qualities: [['draft', '⚡ Borrador (272p)'], ['final', '🎞️ 480p']], maxSecs: 60, clone: true, ownAudio: true, prompt: true },
  },
  {
    id: 'avatar.humo', tool: 'avatar', tier: 'highend',
    name: 'HuMo 17B (High End)', desc: 'Texto + foto + audio: actuación más rica y fiel a la foto, hasta 720p. Tramos de 3.9 s. Muy lento en tu PC.',
    files: ['diffusion_models/humo_17B_fp8_e4m3fn.safetensors', 'audio_encoders/whisper_large_v3_fp16.safetensors',
      'loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', 'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors',
      'vae/wan_2.1_vae.safetensors', ...CHATTERBOX_FILES],
    ramGB: 38,
    // 17B fp8 sin cómputo fp8 en Turing: se descarga a RAM. Por tramo de 97 cuadros, 6 pasos: ~210 s (272p), ~660 s (480p), ~2000 s (720p).
    est: o => {
      const n = Math.max(1, Math.ceil(framesFor(o) / HUMO_SEG));
      const per = { draft: 210, final: 660, hd720: 2000 }[o.quality] || 660;
      return Math.round(TTS_SECS(o) + 120 + n * per);
    },
    build: humo,
    sample: { face: SAMPLE_FACE, text: '', lang: 'es', expr: 0.6, quality: 'final', audio: { ref: 'mi_audio.wav' }, secs: 6,
      prompt: 'A young woman in a bright studio, smiling while she explains something' },
    caps: { qualities: [['draft', '⚡ Borrador (272p)'], ['final', '🎞️ 480p'], ['hd720', '💎 720p']], maxSecs: 24, clone: true, ownAudio: true, prompt: true },
  },
];
