// Motores de AUDIO: voz (Chatterbox), música (ACE-Step 1.5) y sonido/música para un video (MMAudio, ACE-Step).
// Puro (sin DOM). También exporta datos y helpers que usan graphs/avatar.js y las páginas Avatares / Audio.
import { G, rnd, rnd32, loadVideoPath, saveVideo } from '../lib/graph.js';

/* ======================= VOZ (Chatterbox multilingüe, 23 idiomas) ======================= */

/** Idiomas de Chatterbox MTL (códigos exactos del nodo) con su nombre en español. */
export const LANGS = [
  ['es', '🇲🇽 Español'], ['en', '🇺🇸 Inglés'], ['pt', '🇧🇷 Portugués'], ['fr', '🇫🇷 Francés'], ['it', '🇮🇹 Italiano'],
  ['de', '🇩🇪 Alemán'], ['ja', '🇯🇵 Japonés'], ['ko', '🇰🇷 Coreano'], ['zh', '🇨🇳 Chino'], ['ru', '🇷🇺 Ruso'],
  ['ar', '🇸🇦 Árabe'], ['hi', '🇮🇳 Hindi'], ['nl', '🇳🇱 Neerlandés'], ['pl', '🇵🇱 Polaco'], ['tr', '🇹🇷 Turco'],
  ['sv', '🇸🇪 Sueco'], ['da', '🇩🇰 Danés'], ['no', '🇳🇴 Noruego'], ['fi', '🇫🇮 Finlandés'], ['el', '🇬🇷 Griego'],
  ['he', '🇮🇱 Hebreo'], ['ms', '🇲🇾 Malayo'], ['sw', '🇰🇪 Suajili'],
];

/** Segundos aproximados que dura un texto hablado (japonés/chino se cuentan por caracteres). */
export function speechSecs(text, lang) {
  const t = String(text || '').trim();
  if (!t) return 0;
  if (lang === 'ja' || lang === 'zh') return Math.max(1.2, t.replace(/\s+/g, '').length / 6.5 + 0.6);
  return Math.max(1.2, t.split(/\s+/).filter(Boolean).length / 2.6 + 0.6);
}

/** Nodo de voz Chatterbox (probado en estudio_simple). o = {text, lang, expr, voice?:{ref}} -> id (salida 0 = AUDIO). */
export function voiceNode(g, { text, lang = 'es', expr = 0.5, voice } = {}) {
  const ex = Math.min(2, Math.max(0, +expr || 0.5));
  const kw = { model_pack_name: 'resembleai_default_voice', model_version: 't3_mtl23ls_v3.safetensors', language: lang || 'es', text: text || '',
    exaggeration: ex, temperature: 0.8, cfg_weight: ex > 0.7 ? 0.35 : 0.5, repetition_penalty: 1.2, min_p: 0.05, top_p: 1.0, seed: rnd32(),
    use_watermark: false, device: 'default', dtype: 'auto', attention_mode: 'sdpa', crash_protection_template: 'hmm ,, {seg} hmm ,,' };
  if (voice && voice.ref) kw.audio_prompt = [g.add('LoadAudio', { audio: voice.ref }), 0];
  return g.add('ChatterboxMTLTTS', kw, 'Creando la voz…');
}

export const CHATTERBOX_FILES = [
  'tts/chatterbox/resembleai_default_voice/t3_mtl23ls_v3.safetensors',
  'tts/chatterbox/resembleai_default_voice/s3gen.safetensors',
  'tts/chatterbox/resembleai_default_voice/ve.safetensors',
];

function chatterbox(o) {
  const g = G();
  const t = voiceNode(g, o);
  g.add('SaveAudioMP3', { audio: [t, 0], filename_prefix: 'phane/voz', quality: 'V0' }, 'Guardando audio…');
  return g;
}

/* ======================= DISEÑAR VOZ (Qwen3-TTS VoiceDesign) ======================= */
// Voz nueva a partir de una DESCRIPCIÓN (edad, tono, acento, emoción), sin audio de referencia. Nodos de ComfyUI-Qwen-TTS
// (FB_Qwen3TTSVoiceDesign; modelos en models/qwen-tts/). Medido en una GPU de 8 GB (28-oct, voces de Phany): ~45 s por frase.
// unload_model_after_generate SIEMPRE true: si no, deja ~4 GB en VRAM y lo que sigue en la cola va ~20× más lento.

/** Idiomas de Qwen3-TTS (códigos de LANGS → nombre exacto del nodo). Los demás van en 'Auto'. */
export const QWEN_TTS_LANGS = { es: 'Spanish', en: 'English', pt: 'Portuguese', fr: 'French', it: 'Italian', de: 'German',
  ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ru: 'Russian' };
export const QWEN_TTS_FILES = [
  'qwen-tts/Qwen3-TTS-12Hz-1.7B-VoiceDesign/model.safetensors',
  'qwen-tts/Qwen3-TTS-Tokenizer-12Hz/model.safetensors',
];
const DEFAULT_VOICE_DESIGN = 'A warm, friendly adult voice with medium pitch, natural and clear diction, relaxed pace.';

/** o = {text, lang (código de LANGS), instruct (descripción de la voz, mejor en inglés), seed?} */
function qwenVoiceDesign(o) {
  const g = G();
  const t = g.add('FB_Qwen3TTSVoiceDesign', { text: o.text || '', instruct: String(o.instruct || '').trim() || DEFAULT_VOICE_DESIGN,
    model_choice: '1.7B', device: 'auto', precision: 'bf16', language: QWEN_TTS_LANGS[o.lang] || 'Auto',
    seed: o.seed ?? rnd32(), max_new_tokens: 2048, top_p: 1, top_k: 50, temperature: 0.8, repetition_penalty: 1.05, attention: 'auto',
    unload_model_after_generate: true }, 'Diseñando la voz…');
  g.add('SaveAudioMP3', { audio: [t, 0], filename_prefix: 'phane/voz_diseno', quality: 'V0' }, 'Guardando audio…');
  return g;
}

/* ======================= MÚSICA (ACE-Step 1.5 XL Turbo) ======================= */

/** Géneros: etiquetas para ACE-Step (en inglés) + tempo y tonalidad sugeridos. */
export const GENRES = [
  { id: 'pop', label: '🎤 Pop', tags: 'modern pop, catchy hooks, polished production', bpm: 112, key: 'C major' },
  { id: 'reggaeton', label: '🔥 Reggaetón', tags: 'reggaeton, dembow rhythm, latin urban, deep bass', bpm: 95, key: 'A minor' },
  { id: 'regional', label: '🤠 Regional mexicano', tags: 'regional mexican, banda, tuba, brass section, festive', bpm: 120, key: 'G major' },
  { id: 'cumbia', label: '💃 Cumbia', tags: 'cumbia, latin percussion, guiro, accordion, danceable', bpm: 100, key: 'D major' },
  { id: 'rock', label: '🎸 Rock', tags: 'rock, distorted electric guitars, live drums, energetic', bpm: 130, key: 'E minor' },
  { id: 'electronic', label: '🎛️ Electrónica', tags: 'electronic dance music, synth leads, four on the floor kick, club', bpm: 124, key: 'F minor' },
  { id: 'hiphop', label: '🎧 Hip-hop', tags: 'hip hop, boom bap drums, deep bass, sampled keys', bpm: 90, key: 'C minor' },
  { id: 'trap', label: '💎 Trap', tags: 'trap, 808 bass, crisp hi-hats, dark synths', bpm: 140, key: 'C# minor' },
  { id: 'lofi', label: '☕ Lo-fi', tags: 'lo-fi hip hop, chill, vinyl crackle, mellow piano, soft drums', bpm: 80, key: 'F major' },
  { id: 'cinematic', label: '🎬 Cinemático', tags: 'cinematic orchestral score, epic strings, brass, timpani, trailer music', bpm: 90, key: 'D minor' },
  { id: 'acoustic', label: '🪕 Acústica', tags: 'acoustic folk, fingerpicked acoustic guitar, warm, intimate', bpm: 96, key: 'G major' },
  { id: 'jazz', label: '🎷 Jazz', tags: 'smooth jazz, saxophone, upright bass, brushed drums, piano', bpm: 100, key: 'Bb major' },
  { id: 'classical', label: '🎻 Clásica', tags: 'classical, piano and string quartet, elegant', bpm: 80, key: 'D major' },
  { id: 'ambient', label: '🌌 Ambiental', tags: 'ambient, atmospheric pads, slow evolving textures, calm', bpm: 70, key: 'C major' },
];
/** Estados de ánimo: [etiquetas en inglés, etiqueta UI, tonalidad que lo refuerza (opcional)]. */
export const MOODS = [
  ['', '🙂 Neutral'],
  ['happy, uplifting, bright', '😄 Alegre', 'G major'],
  ['energetic, powerful, driving', '⚡ Con energía'],
  ['sad, melancholic, emotional', '😢 Triste', 'A minor'],
  ['epic, heroic, triumphant', '🏆 Épico', 'D minor'],
  ['romantic, tender, warm', '❤️ Romántico', 'F major'],
  ['relaxed, chill, peaceful', '😌 Relajado'],
  ['dark, tense, mysterious', '🌑 Oscuro', 'C minor'],
];
export const INSTRUMENTS = [
  ['piano', '🎹 Piano'], ['acoustic guitar', '🪕 Guitarra acústica'], ['electric guitar', '🎸 Guitarra eléctrica'], ['bass guitar', '🎚️ Bajo'],
  ['drums', '🥁 Batería'], ['synthesizers', '🎛️ Sintetizadores'], ['strings', '🎻 Cuerdas'], ['brass', '🎺 Metales'],
  ['accordion', '🪗 Acordeón'], ['saxophone', '🎷 Saxofón'], ['808 bass', '🔊 808'], ['choir', '👥 Coro'],
];
/** Idiomas de letra que ofrece la UI (todos existen en TextEncodeAceStepAudio1.5). */
export const LYRIC_LANGS = [['es', 'Español'], ['en', 'Inglés'], ['pt', 'Portugués'], ['fr', 'Francés'], ['it', 'Italiano'], ['de', 'Alemán'],
  ['ja', 'Japonés'], ['ko', 'Coreano'], ['zh', 'Chino'], ['ru', 'Ruso'], ['ar', 'Árabe'], ['hi', 'Hindi'], ['nl', 'Neerlandés'], ['pl', 'Polaco'], ['tr', 'Turco']];
export const KEYS = ['C major', 'C# major', 'Db major', 'D major', 'D# major', 'Eb major', 'E major', 'F major', 'F# major', 'Gb major', 'G major', 'G# major',
  'Ab major', 'A major', 'A# major', 'Bb major', 'B major', 'C minor', 'C# minor', 'Db minor', 'D minor', 'D# minor', 'Eb minor', 'E minor', 'F minor',
  'F# minor', 'Gb minor', 'G minor', 'G# minor', 'Ab minor', 'A minor', 'A# minor', 'Bb minor', 'B minor'];

/** Arma las etiquetas de ACE-Step. {genre:id, mood:tags, instruments:[], extra, vocals:'female vocals'|'male vocals'|'', instrumental:bool, bpm} */
export function musicTags({ genre, mood = '', instruments = [], extra = '', vocals = '', instrumental = false, bpm } = {}) {
  const gn = GENRES.find(x => x.id === genre) || GENRES[0];
  return [gn.tags, mood, instruments.join(', '), instrumental ? 'instrumental, no vocals' : vocals, bpm ? `${bpm} BPM` : '', extra]
    .map(s => String(s || '').trim()).filter(Boolean).join(', ');
}

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Nodos de ACE-Step 1.5 XL Turbo (copiados de tpl_audio_ace_step1_5_xl_turbo). secs: número o link FLOAT. Devuelve id de VAEDecodeAudio. */
export function aceMusic(g, { tags, lyrics = '', lang = 'en', bpm = 110, key = 'C major', timesig = '4', secs = 30 } = {}) {
  const seed = rnd();
  let m = g.add('UNETLoader', { unet_name: 'acestep_v1.5_xl_turbo_bf16.safetensors', weight_dtype: 'default' }, 'Cargando ACE-Step…');
  // Turing no tiene bf16 y con --force-fp16 el DiT se desborda: TODO el audio sale NaN (el MP3 lo disfraza de ruido a 0 dB,
  // el AAC del video falla). Probado: DiT en fp32 → música normal (-17 dB); VAE en fp32 no ayuda.
  m = g.add('ModelComputeDtype', { model: [m, 0], dtype: 'fp32' });
  m = g.add('ModelSamplingAuraFlow', { model: [m, 0], shift: 3, sampling: 'flow' });
  const clip = g.add('DualCLIPLoader', { clip_name1: 'qwen_0.6b_ace15.safetensors', clip_name2: 'qwen_4b_ace15.safetensors', type: 'ace', device: 'default' }, 'Cargando ACE-Step…');
  const vae = g.add('VAELoader', { vae_name: 'ace_1.5_vae.safetensors' });
  const dur = Array.isArray(secs) ? secs : clamp(+secs || 30, 5, 600);
  const pos = g.add('TextEncodeAceStepAudio1.5', { clip: [clip, 0], tags: tags || 'instrumental', lyrics: String(lyrics || '').trim() || '[Instrumental]',
    seed, bpm: clamp(Math.round(+bpm || 110), 10, 300), duration: dur, timesignature: String(timesig || '4'), language: lang || 'en',
    keyscale: KEYS.includes(key) ? key : 'C major', generate_audio_codes: true, cfg_scale: 2, temperature: 0.85, top_p: 0.9, top_k: 0, min_p: 0 },
    'Escribiendo la canción…');
  const neg = g.add('ConditioningZeroOut', { conditioning: [pos, 0] });
  const lat = g.add('EmptyAceStep1.5LatentAudio', { seconds: dur, batch_size: 1 });
  const s = g.add('KSampler', { model: [m, 0], seed, steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
    positive: [pos, 0], negative: [neg, 0], latent_image: [lat, 0] }, 'Componiendo');
  return g.add('VAEDecodeAudio', { samples: [s, 0], vae: [vae, 0] }, 'Mezclando…');
}

export const ACE_FILES = [
  'diffusion_models/acestep_v1.5_xl_turbo_bf16.safetensors',
  'text_encoders/qwen_0.6b_ace15.safetensors',
  'text_encoders/qwen_4b_ace15.safetensors',
  'vae/ace_1.5_vae.safetensors',
];
/** Segundos estimados de ACE-Step en una GPU de 8 GB (carga ~45 s + LM de códigos + DiT 8 pasos). */
// Con el DiT en fp32 (medido en una GPU de 8 GB: 12 s de música = 61 s, 30 s = 279 s; crece más que lineal con la duración)
const aceSecs = secs => { const s = +secs || 30; return 30 + 2.5 * s + 0.2 * s * s; };

/** o = {tags, lyrics?, lang?, secs, bpm, key, timesig?, format:'mp3'|'flac'} */
function acestep(o) {
  const g = G();
  const a = aceMusic(g, o);
  const kw = { audio: [a, 0], filename_prefix: 'phane/musica', format: o.format === 'flac' ? 'flac' : 'mp3' };
  if (kw.format === 'mp3') kw['format.quality'] = 'V0';
  g.add('SaveAudioAdvanced', kw, 'Guardando…');
  return g;
}

/* ======================= SONIDO / MÚSICA PARA UN VIDEO ======================= */

/** Mezcla el audio original del video (link) con uno nuevo bajado `db` decibeles. Devuelve link AUDIO. */
function mixWithOriginal(g, original, added, db) {
  const quiet = db ? [g.add('AudioAdjustVolume', { audio: added, volume: db }), 0] : added;
  return [g.add('AudioMerge', { audio1: original, audio2: quiet, merge_method: 'add' }, 'Mezclando audio…'), 0];
}

/** MMAudio (port de soundGraph): carga el video a 25 fps para MMAudio y a fps nativos para guardar. o = {video:{abs}, prompt, mix?} */
function mmaudio(o) {
  const g = G();
  const path = o.video.abs;
  // 27-oct (hueco 20): MMAudio solo ve 384 px (CLIP) y 224 (sync); leerlo a 1664×960 llenaba los 8 GB → se lee chico (lado corto 384)
  const tall = o.video.w > 0 && o.video.h > o.video.w;
  const v25 = loadVideoPath(g, path, { rate: 25, w: tall ? 384 : 0, h: tall ? 0 : 384 }), vN = loadVideoPath(g, path);
  const info = g.add('VHS_VideoInfoLoaded', { video_info: [vN, 3] });
  const m = g.add('MMAudioModelLoader', { mmaudio_model: 'mmaudio_large_44k_v2_fp16.safetensors', base_precision: 'fp16' }, 'Cargando sonido…');
  const fu = g.add('MMAudioFeatureUtilsLoader', { vae_model: 'mmaudio_vae_44k_fp16.safetensors', synchformer_model: 'mmaudio_synchformer_fp16.safetensors',
    clip_model: 'apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors', mode: '44k', precision: 'fp16' }, 'Cargando sonido…');
  const p = o.prompt || '';
  const a = g.add('MMAudioSampler', { mmaudio_model: [m, 0], feature_utils: [fu, 0], duration: [info, 2], steps: 25, cfg: 4.5, seed: rnd(), prompt: p,
    negative_prompt: /music|song|m[uú]sica|canci[oó]n/i.test(p) ? 'speech' : 'music, speech, talking', mask_away_clip: false, force_offload: true,
    images: [v25, 0] }, 'Creando sonido…');
  const audio = o.mix && o.video && o.video.hasAudio !== false ? mixWithOriginal(g, [vN, 2], [a, 0], o.db ?? -3) : [a, 0];   // mezclar solo si el video tiene audio
  saveVideo(g, [vN, 0], [info, 0], 'phane/sonido', { audio });
  return g;
}

/** Música ACE-Step con la duración exacta del video, montada sobre él. o = {video:{abs}, tags, bpm, key, mix?} */
function musicOnVideo(o) {
  const g = G();
  const v = loadVideoPath(g, o.video.abs);
  const info = g.add('VHS_VideoInfoLoaded', { video_info: [v, 3] });
  // Compone ≥ 12 s (una frase musical completa; ACE-Step pide mínimo 5 s) y luego recorta al largo exacto del video.
  // Largo conocido → ese + 1 s (mín. 12); desconocido → el largo EXACTO que mide VHS (link FLOAT), nunca el 8 s de relleno de la página.
  const known = o.video && +o.video.secs;
  const composeSecs = known > 0 ? Math.max(12, Math.ceil(known) + 1) : [info, 2];
  const raw = aceMusic(g, { tags: o.tags, lyrics: '', lang: 'en', bpm: o.bpm, key: o.key, secs: composeSecs });
  const music = g.add('TrimAudioDuration', { audio: [raw, 0], start_index: 0, duration: [info, 2] });
  const audio = o.mix && o.video && o.video.hasAudio !== false ? mixWithOriginal(g, [v, 2], [music, 0], o.db ?? -9) : [music, 0];
  saveVideo(g, [v, 0], [info, 0], 'phane/musica_video', { audio });
  return g;
}

const MMAUDIO_FILES = [
  'mmaudio/mmaudio_large_44k_v2_fp16.safetensors', 'mmaudio/mmaudio_vae_44k_fp16.safetensors',
  'mmaudio/mmaudio_synchformer_fp16.safetensors', 'mmaudio/apple_DFN5B-CLIP-ViT-H-14-384_fp16.safetensors',
];

const SAMPLE_VIDEO = { abs: 'ComfyUI\\output\\phane\\prueba-audio.mp4' };

export const ENGINES = [
  {
    id: 'voice.chatterbox', tool: 'voice', tier: 'ligero',
    name: 'Chatterbox (23 idiomas)', desc: 'Voz natural en 23 idiomas. Puede clonar una voz con 5–10 s de audio limpio.',
    files: CHATTERBOX_FILES, ramGB: 7,
    est: o => Math.round(8 + 1.5 * speechSecs(o.text, o.lang)),
    build: chatterbox,
    sample: { text: 'Hola, bienvenidos a Phane. Hoy vamos a crear algo increíble juntos.', lang: 'es', expr: 0.5 },
    caps: { langs: LANGS.map(l => l[0]), clone: true, expr: [0.25, 1.2] },
  },
  {
    // Va después de Chatterbox: pickDefault('voice') y Avatares siguen eligiendo Chatterbox (clona y habla 23 idiomas).
    id: 'voice.qwen3tts', tool: 'voice', tier: 'ligero',
    name: 'Diseñar voz (Qwen3-TTS)', desc: 'Describe cómo suena la voz (edad, tono, acento, emoción) y la crea desde cero, sin audio de referencia. 10 idiomas.',
    files: QWEN_TTS_FILES, ramGB: 8,   // 1.7B bf16 (3.6 GB) + tokenizer (0.6 GB); se descarga al terminar cada frase
    est: o => Math.round(15 + 2 * speechSecs(o.text, o.lang)),   // ~45 s por frase de ~15 s
    build: qwenVoiceDesign,
    sample: { text: 'Hi! Welcome to the studio. Today we are going to build something amazing, step by step.', lang: 'en',
      instruct: 'A mature, warm female narrator around thirty, low-medium pitch, cheerful and engaging, relaxed pace, clear American English.' },
    caps: { langs: Object.keys(QWEN_TTS_LANGS), design: true },
  },
  {
    // Cabe bien en una GPU de 8 GB: ~18.5 GB de archivos (DiT 9.3 + LM 4B 7.8 + 0.6B 1.1 + VAE 0.3); lo que no entra en VRAM vive en RAM.
    // Es el único motor de música: sirve igual en modo Ligero y High End.
    id: 'music.acestep', tool: 'music', tier: 'ligero',
    name: 'ACE-Step 1.5 XL Turbo', desc: 'Canciones completas con letra o instrumentales (hasta 4 min), en muchos idiomas. 8 pasos.',
    files: ACE_FILES, ramGB: 23,
    est: o => Math.round(aceSecs(o.secs)),
    build: acestep,
    sample: { tags: musicTags({ genre: 'pop', mood: 'happy, uplifting, bright', instruments: ['piano'], bpm: 112 }), lyrics: '', lang: 'en', secs: 30, bpm: 112, key: 'C major', format: 'mp3' },
    caps: { maxSecs: 240, formats: ['mp3', 'flac'], lyrics: true },
  },
  {
    id: 'sound.mmaudio', tool: 'sound', tier: 'ligero',
    name: 'MMAudio (efectos y ambiente)', desc: 'Crea el sonido que corresponde a lo que pasa en el video (pasos, lluvia, motores…).',
    files: MMAUDIO_FILES, ramGB: 14,   // 27-oct: 10 → 14 (modelos ~6 GB + cuadros nativos del video para guardarlo; 10 s a 1664×960 ≈ 6 GB)
    est: o => Math.round(15 + 4.5 * (o.secs || 5)),
    build: mmaudio,
    sample: { video: SAMPLE_VIDEO, prompt: 'waves crashing on a beach, seagulls in the distance', secs: 5, mix: true },
    caps: { kind: 'sfx', mix: true },
  },
  {
    id: 'sound.music_on_video', tool: 'sound', tier: 'ligero',
    name: 'Música para video (ACE-Step)', desc: 'Compone música del largo exacto del video y la monta encima (o la mezcla con su audio).',
    files: ACE_FILES, ramGB: 26,
    est: o => { const v = (o.video && +o.video.secs) || 30; return Math.round(10 + aceSecs(Math.max(12, Math.ceil(v) + 1)) + 0.6 * v); },   // compone ≥ 12 s; largo desconocido → supone 30 s
    build: musicOnVideo,
    sample: { video: SAMPLE_VIDEO, tags: musicTags({ genre: 'cinematic', mood: 'epic, heroic, triumphant', instrumental: true }), bpm: 90, key: 'D minor', mix: true, secs: 8 },
    caps: { kind: 'music', mix: true },
  },
];
