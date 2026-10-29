// Biblioteca PURA para armar workflows de ComfyUI en formato API.
// Sin DOM ni fetch: se usa igual en el navegador y en Node (tests/validate.mjs).

/** Constructor de grafos. g.add(clase, inputs, etiqueta?) -> id. Un link es [id, indiceDeSalida]. */
export function G() {
  const n = {}, lab = {};
  let i = 0;
  return {
    n, lab,
    add(cls, inputs, label) {
      const id = String(++i);
      n[id] = { class_type: cls, inputs: inputs || {} };
      if (label) lab[id] = label;
      return id;
    },
  };
}

export const rnd = () => Math.floor(Math.random() * 1e15);
export const rnd32 = () => Math.floor(Math.random() * 2147483647);

/** Negativo estándar de Wan (chino, el que usan las plantillas oficiales). */
export const NEG_WAN = '色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走';

/** Tamaños de imagen por formato (≈1 MP Ligero, ≈2 MP High End). */
export const IMG_SIZE = {
  // 16:9 / 9:16 de verdad (antes 1216×832 = 3:2: al animar en Wan 832×480 se recortaba arriba y abajo)
  ligero: { '1:1': [1024, 1024], '9:16': [768, 1344], '16:9': [1344, 768], '4:3': [1152, 864], '3:4': [864, 1152] },
  highend: { '1:1': [1536, 1536], '9:16': [1152, 2048], '16:9': [2048, 1152], '4:3': [1664, 1248], '3:4': [1248, 1664] },
};
/** Tamaños de video: borrador / 480p / 720p. */
export const VID_SIZE = {
  draft: { '16:9': [480, 272], '9:16': [272, 480], '1:1': [368, 368] },
  final: { '16:9': [832, 480], '9:16': [480, 832], '1:1': [640, 640] },
  hd720: { '16:9': [1280, 720], '9:16': [720, 1280], '1:1': [960, 960] },
};
/** Formato de una imagen {w,h}. */
export const arOf = im => (!im || !im.w) ? '16:9' : Math.abs(im.w / im.h - 1) < 0.15 ? '1:1' : (im.w > im.h ? '16:9' : '9:16');
/** Largo de video válido para Wan (4n+1). */
export const align4 = x => Math.max(5, 4 * Math.ceil((x - 1) / 4) + 1);
/** Nombre de archivo sin carpeta. */
export const baseName = p => String(p).replace(/\\/g, '/').split('/').pop();
/** Referencia para LoadImage de un archivo de la carpeta output. */
export const outRef = f => `${f.subfolder ? f.subfolder + '/' : ''}${f.filename} [output]`;

/** LoadImage + recorte/escala al tamaño exacto (KJNodes). Devuelve el id del nodo IMAGE. */
export function loadImageFit(g, ref, w, h, divisible = 16) {
  const li = g.add('LoadImage', { image: ref });
  return g.add('ImageResizeKJv2', { image: [li, 0], width: w, height: h, upscale_method: 'lanczos', keep_proportion: 'crop',
    pad_color: '0, 0, 0', crop_position: 'center', divisible_by: divisible });
}

/** Carga un video (ruta absoluta) con VideoHelperSuite. Salidas: 0 IMAGE, 1 frame_count, 2 AUDIO, 3 VHS_VIDEOINFO. */
export function loadVideoPath(g, path, { rate = 0, cap = 0, skip = 0, w = 0, h = 0, metaBatch } = {}) {
  const kw = { video: path, force_rate: rate, custom_width: w, custom_height: h, frame_load_cap: cap, skip_first_frames: skip,
    select_every_nth: 1, format: 'None' };
  if (metaBatch) kw.meta_batch = [metaBatch, 0];
  return g.add('VHS_LoadVideoPath', kw, 'Leyendo video…');
}

/** Guarda un video mp4 (h264). audio opcional [id, idx]. fps número o link [id, idx]. */
export function saveVideo(g, images, fps, prefix, { audio, crf = 19, trimToAudio = false, metaBatch } = {}) {
  const kw = { images, frame_rate: fps, loop_count: 0, filename_prefix: prefix, format: 'video/h264-mp4', pix_fmt: 'yuv420p', crf,
    save_metadata: true, trim_to_audio: trimToAudio, pingpong: false, save_output: true };
  if (audio) kw.audio = audio;
  if (metaBatch) kw.meta_batch = [metaBatch, 0];
  return g.add('VHS_VideoCombine', kw, 'Guardando video…');
}

/** Interpolación RIFE x2 (16 fps -> 32 fps). */
export function rife2x(g, frames) {
  return g.add('RIFE VFI', { ckpt_name: 'rife49.pth', frames, clear_cache_after_n_frames: 10, multiplier: 2, fast_mode: true, ensemble: true,
    scale_factor: 1, dtype: 'float16', torch_compile: false, batch_size: 1 }, 'Suavizando movimiento…');
}

/* ---------- LoRA de personaje (entrenada para FLUX.2 Klein 4B, ver HIGH_END_LEEME "LoRAs de los héroes") ----------
   o.heroLora = { name: nombre EXACTO de ComfyUI (core.loraName), trigger: 'sks', cls: 'a person', strength: 0.9 }
   Probado: con la LoRA v2 basta "trigger, clase, escena" para que salga el personaje completo; fuerza 0.8-1.0. */
export function withHeroLora(g, model, o) {
  const L = o && o.heroLora;
  if (!L || !L.name) return model;
  return [g.add('LoraLoaderModelOnly', { model, lora_name: L.name, strength_model: L.strength ?? 0.9 }, 'Cargando la LoRA del personaje…'), 0];
}
/** Antepone "trigger, clase," al prompt (si hay LoRA de personaje y el prompt no trae ya la palabra clave EXACTA:
 *  el tokenizador distingue mayúsculas, "Sks" no es el token entrenado). */
export function heroPrompt(text, o) {
  const L = o && o.heroLora;
  const t = String(text || '').trim();
  if (!L || !L.trigger || t.includes(L.trigger)) return t;
  return [L.trigger, L.cls, t].filter(Boolean).join(', ');
}

/** Guarda imagen(es) en output/phane. */
export function saveImage(g, images, prefix = 'phane/img') {
  return g.add('SaveImage', { images, filename_prefix: prefix }, 'Guardando…');
}
