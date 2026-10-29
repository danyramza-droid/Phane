// Registro de MOTORES de Phane (puro: sin DOM; lo usan la UI y tests/validate.mjs).
//
// Contrato de un motor (ver CONTRATO.md):
//   id      'herramienta.nombre' único, p. ej. 'image.qwen21'
//   tool    herramienta a la que pertenece (ver TOOLS)
//   tier    'ligero' (cabe bien en una GPU de 8 GB) | 'highend' (pensado para 4090/5090) | 'experimental'
//   name    nombre corto para el menú;  desc  una línea
//   files   archivos requeridos, relativos a ComfyUI/models con '/', p. ej. 'unet/Wan2.2-I2V-A14B-HighNoise-Q8_0.gguf'
//   ramGB   RAM de sistema pico estimada (para el bloqueo de seguridad)
//   est(o)  segundos estimados en una GPU de 8 GB para las opciones o
//   build(o) -> G()   arma el workflow (formato API)
//   sample  opciones de ejemplo para la prueba automática
//   caps    (opcional) capacidades para la UI: { refs, durations, aspects, audio, ... }
import { ENGINES as IMAGE } from './graphs/image.js';
import { ENGINES as EDIT } from './graphs/edit.js';
import { ENGINES as VIDEO } from './graphs/video.js';
import { ENGINES as AVATAR } from './graphs/avatar.js';
import { ENGINES as AUDIO } from './graphs/audio.js';
import { ENGINES as TOOLS_E } from './graphs/tools.js';
import { ENGINES as RECAST } from './graphs/recast.js';
import { ENGINES as DRAW } from './graphs/draw.js';
import { ENGINES as STORY } from './graphs/storyboard.js';
import { ENGINES as ENHANCE } from './graphs/enhance.js';
import { ENGINES as POSE } from './graphs/pose.js';
import { ENGINES as MOTION } from './graphs/motion.js';

export const ENGINES = [...IMAGE, ...EDIT, ...VIDEO, ...AVATAR, ...AUDIO, ...TOOLS_E, ...RECAST, ...DRAW, ...STORY, ...ENHANCE, ...POSE, ...MOTION];

/** Herramientas (una por tipo de tarea; una página puede usar varias). */
export const TOOLS = {
  image: 'Imagen', edit: 'Editar imagen', video: 'Video', avatar: 'Avatar que habla', voice: 'Voz', music: 'Música',
  sound: 'Sonido para video', upscale: 'Mejorar a HD', fps: 'Más fluidez (FPS)', bg: 'Quitar fondo', segment: 'Segmentar video',
  recast: 'Recast / copiar movimiento', draw: 'Dibujar movimiento', storyboard: 'Storyboard', enhance: 'Mejorar prompt', motion: 'Movimiento por texto',
};

export const TIER_INFO = {
  ligero: { icon: '⚡', label: 'Ligero', hint: 'Pensado para tarjetas de 8 GB' },
  highend: { icon: '🚀', label: 'High End', hint: 'Calidad 4090/5090 (en 8 GB tarda más)' },
  experimental: { icon: '🧪', label: 'Experimental', hint: 'Muy pesado; puede tardar mucho' },
};

/** RAM máxima que permitimos usar (64 GB físicos; dejamos margen para Windows). */
export const RAM_CAP = 55;

/* Hoja de motores. Los marcados QUITAR solo se ESCONDEN del menú: los archivos
   siguen en disco y engineById() los sigue encontrando. Para volver a mostrar uno, sácalo de esta lista. Borrar archivos: solo con OK del dueño. */
export const HIDDEN = new Set(['edit.qwen2511', 'video.h3', 'fps.film', 'edit.qwen21_full']);
/* Nombre por lo que hace (lo que se ve grande en el menú); el nombre técnico va chico debajo. */
export const ROLE = {
  'image.zimage': '⚡ Rápido', 'image.klein': '🎯 Más fiel', 'image.qwen21': '💎 Mejor calidad',
  'edit.klein': '⚡ Rápido', 'edit.qwen21': '💎 Mejor calidad', 'edit.qwen21_full': '💎 Máxima calidad (lento)',
  'bg.birefnet': '⚡ Rápido', 'bg.qwen21': '🎯 Más fino',
  'video.wan': '⚡ Rápido', 'video.wan_he': '💪 Más acción', 'video.ltx23': '🔊 Con sonido',
  'avatar.infinitetalk': '⚡ Rápido', 'avatar.humo': '💎 Mejor calidad',
  'upscale.esrgan': '⚡ Rápido', 'upscale.seedvr2_3b': '💎 HD (poca RAM)', 'upscale.seedvr2_7b': '💎 Mejor calidad',
  'fps.rife': '⚡ Rápido', 'recast.animate2_fast': '⚡ Rápido', 'recast.animate2': '🎯 Más fiel',
  'storyboard.klein': '⚡ Rápido', 'storyboard.qwen21': '💎 Mejor calidad', 'draw.wanmove': '🎯 Sigue tu trazo',
};
/* Licencia de los PESOS de cada motor (resumen de THIRD_PARTY_MODELS.md; si cambias uno, cambia los dos).
   ✅ comercial (Apache/MIT/BSD) · 🟡 pesos abiertos con condiciones · 🔴 solo uso personal (no comercial).
   Un motor toma la licencia más restrictiva de sus archivos. Una línea por motor (build.py quita líneas por id). */
export const LICENSE_INFO = {
  '✅': { label: 'Comercial', hint: 'Licencia permisiva (Apache/MIT/BSD): puedes usar lo que generes en trabajos comerciales.' },
  '🟡': { label: 'Con condiciones', hint: 'Pesos abiertos con licencia propia: revisa sus condiciones antes de un uso comercial.' },
  '🔴': { label: 'Solo personal', hint: 'Licencia no comercial: úsalo solo para pruebas y proyectos personales.' },
};
const LICENSES = {
  'image.zimage': ['✅', 'Z-Image Turbo: Apache-2.0'],
  'image.klein': ['✅', 'FLUX.2 Klein 4B: Apache-2.0'],
  'image.qwen21': ['🔴', 'Qwen-Image 2.1: Qwen Research License (no comercial)'],
  'edit.klein': ['✅', 'FLUX.2 Klein 4B: Apache-2.0'],
  'edit.qwen21': ['🔴', 'Qwen-Image 2.1: Qwen Research License (no comercial)'],
  'edit.qwen2511': ['✅', 'Qwen-Image-Edit-2511 + Lightning: Apache-2.0'],
  'edit.qwen21_full': ['🔴', 'Qwen-Image 2.1: Qwen Research License (no comercial)'],
  'bg.birefnet': ['✅', 'BiRefNet: MIT'],
  'bg.qwen21': ['🔴', 'Qwen-Image 2.1: Qwen Research License (no comercial)'],
  'video.wan': ['✅', 'Wan 2.2 + lightx2v: Apache-2.0; LoRAs SVI: MIT (las de cámara: ver THIRD_PARTY_MODELS.md)'],
  'video.wan_he': ['✅', 'Wan 2.2 + lightx2v: Apache-2.0; LoRAs SVI: MIT (las de cámara: ver THIRD_PARTY_MODELS.md)'],
  'video.wan_control': ['✅', 'Wan 2.2 Fun Control (QuantStack GGUF) + lightx2v + Depth Anything V2 Small: Apache-2.0'],
  'video.ltx23': ['🟡', 'LTX-2 Community License + Gemma Terms of Use'],
  'video.h3': ['🟡', 'MiniMax Community License (restricciones regionales)'],
  'avatar.infinitetalk': ['✅', 'InfiniteTalk + Wan 2.1: Apache-2.0; Chatterbox: MIT'],
  'avatar.humo': ['✅', 'HuMo: Apache-2.0; Whisper: MIT; Chatterbox: MIT'],
  'voice.chatterbox': ['✅', 'Chatterbox Multilingual: MIT'],
  'voice.qwen3tts': ['✅', 'Qwen3-TTS VoiceDesign + Tokenizer: Apache-2.0'],
  'music.acestep': ['✅', 'ACE-Step 1.5: MIT'],
  'sound.mmaudio': ['🔴', 'MMAudio (pesos CC-BY-NC-4.0) + Apple DFN5B-CLIP (solo investigación): no comercial'],
  'sound.music_on_video': ['✅', 'ACE-Step 1.5: MIT'],
  'upscale.esrgan': ['✅', 'Real-ESRGAN: BSD-3'],
  'upscale.seedvr2_3b': ['✅', 'SeedVR2: Apache-2.0'],
  'upscale.seedvr2_7b': ['✅', 'SeedVR2: Apache-2.0'],
  'fps.rife': ['✅', 'RIFE: MIT'],
  'fps.film': ['✅', 'FILM: Apache-2.0'],
  'segment.sam3': ['🟡', 'SAM 3.1: SAM License'],
  'recast.animate2_fast': ['🟡', 'Wan Animate 2: Apache-2.0; SAM 3.1 (máscaras): SAM License'],
  'recast.animate2': ['🟡', 'Wan Animate 2: Apache-2.0; SAM 3.1 (máscaras): SAM License'],
  'draw.wanmove': ['✅', 'Wan-Move: Apache-2.0'],
  'storyboard.klein': ['✅', 'FLUX.2 Klein 4B: Apache-2.0'],
  'storyboard.qwen21': ['🔴', 'Qwen-Image 2.1: Qwen Research License (no comercial)'],
  'storyboard.concat': ['✅', 'Sin modelo'],
  'montaje.impactos': ['✅', 'Sin modelo'],
  'montaje.titulo': ['✅', 'Sin modelo'],
  'montaje.audio': ['✅', 'Sin modelo'],
  'enhance.qwen3vl4b': ['✅', 'Qwen3-VL 4B: Apache-2.0'],
  'enhance.qwen_pe_t2i': ['🔴', 'Mejorador de Qwen-Image 2.1: Qwen Research License (no comercial)'],
  'enhance.qwen_pe_i2i': ['🔴', 'Mejorador de Qwen-Image 2.1: Qwen Research License (no comercial)'],
  'image.pose': ['🔴', 'Z-Image + SDPose: Apache/MIT; el pase de diseño usa Qwen-Image 2.1 (no comercial)'],
  'image.pose_maniqui': ['🔴', 'Qwen-Image 2.1 (no comercial) + VNCCS PoseStudio (Apache-2.0)'],
  'image.pose_anypose': ['✅', 'Qwen-Image-Edit-2511 + AnyPose: Apache-2.0'],
  'image.pose_klein': ['✅', 'FLUX.2 Klein base 4B + RefControl + Depth Anything V2 Small: Apache-2.0'],
  'pose.foto_maniqui': ['🟡', 'SAM 3D Body: SAM License'],
  'motion.kimodo': ['🟡', 'Kimodo: NVIDIA Open Model License; Llama 3: Meta Llama 3 Community License'],
  'motion.kimodo_frame': ['🟡', 'Kimodo: NVIDIA Open Model License'],
};
for (const e of ENGINES) if (!e.license && LICENSES[e.id]) [e.license, e.licenseNote] = LICENSES[e.id];

export const enginesFor = tool => ENGINES.filter(e => e.tool === tool && !HIDDEN.has(e.id));
export const engineById = id => ENGINES.find(e => e.id === id);

/** Archivos que faltan de un motor, dado el mapa {rutaRelativa: GB} de /phane/api/modelos. */
export function missingFiles(engine, installed) {
  if (!installed) return [];
  const have = new Set(Object.keys(installed).map(p => p.toLowerCase()));
  return (engine.files || []).filter(f => !have.has(f.toLowerCase()));
}

/** Motor por defecto para una herramienta según el switch de poder. Prefiere instalados.
 *  filter opcional (el mismo del menú); los motores con caps.internal nunca se eligen solos. */
export function pickDefault(tool, tier, installed, filter) {
  const list = enginesFor(tool).filter(e => !e.caps?.internal && (!filter || filter(e)));
  const ok = e => !missingFiles(e, installed).length && e.ramGB <= RAM_CAP;
  const order = tier === 'highend' ? ['highend', 'ligero', 'experimental'] : ['ligero', 'highend', 'experimental'];
  for (const t of order) {
    const e = list.find(x => x.tier === t && ok(x));
    if (e) return e;
  }
  return list.find(x => x.tier === (tier === 'highend' ? 'highend' : 'ligero')) || list[0] || null;
}
