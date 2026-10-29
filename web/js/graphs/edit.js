// Motores de EDICIÓN por instrucción (tool 'edit') y de QUITAR FONDO (tool 'bg').
import { G, rnd, saveImage, withHeroLora, heroPrompt } from '../lib/graph.js';
import { QWEN21_TURBO_SIGMAS } from './image.js';
import { samMask, applyMask } from './tools.js';
import { guardPE, lightTG, LIGHT_EDIT_SYS, SAMPLING_PE_FAST } from './pe_guard.js';

/**
 * Opciones de 'edit':
 *   { image:{ref,w,h}             imagen a editar (sale con su mismo formato)
 *     refs:[{ref,w,h}]            imágenes extra de referencia (outfit, producto, personaje…)
 *     prompt:'…'                  instrucción en inglés; {img1} = la imagen a editar, {img2}, {img3} = referencias
 *     prompts?:['…','…']          varias instrucciones = varias tomas en UN trabajo (Shots); los modelos se cargan una vez
 *     ar?:'16:9'|'9:16'|'1:1'|'4:3'|'3:4'|'21:9'|'zoom'   expandir: rellena con blanco hasta ese formato (necesita image.w/h)
 *     enhance?:bool }             mejorador de instrucción (solo Qwen-Image 2.1)
 * Opciones de 'bg': { image:{ref,w,h} }  -> PNG con transparencia.
 */
const IMG = { ref: 'example.png', w: 1024, h: 768 };
const REF = { ref: 'example.png', w: 768, h: 1024 };
const SAMPLE = { image: IMG, refs: [REF], prompt: 'Dress the person from {img1} in the exact outfit shown in {img2}. Keep the face, pose and background unchanged.' };

/** Cómo nombra cada modelo a sus imágenes de entrada. */
export const REF_NAMES = {
  klein: i => `image ${i}`,
  qwen21: i => `<image${i}>`,          // plantillas Qwen-Image 2.1: "Mention them in the prompt as <image1>, <image2>"
  qwen2511: i => `Picture ${i}`,       // TextEncodeQwenImageEditPlus etiqueta las imágenes como "Picture N"
};
/** Sustituye {img1}, {img2}… por el nombre que entiende el modelo. */
export const fillRefs = (text, style) => String(text || '').replace(/\{img(\d+)\}/g, (_, n) => REF_NAMES[style](+n));

const refsOf = (o, max) => (o.refs || []).filter(r => r && (r.ref || r.link)).slice(0, max);   // r.link: imagen del mismo grafo (pose.js)
/** Carga una referencia. Con r.isolate (ej. 'person') SAM 3 deja solo eso sobre blanco, y r.cut (ej. 'head') lo quita:
 *  así Cambiar outfit no copia a la persona de la foto (cara, identidad). Ambos aceptan texto o lista (se suman). */
const loadRef = (g, r) => {
  const im = [g.add('LoadImage', { image: r.ref }), 0];
  if (!r.isolate) return im;
  const join = (list, grow) => [].concat(list).map(t => samMask(g, im, t, { threshold: 0.4, grow }))
    .reduce((m, x) => [g.add('MaskComposite', { destination: m, source: x, x: 0, y: 0, operation: 'add' }), 0]);
  let mask = join(r.isolate, 4);
  if (r.cut) mask = [g.add('MaskComposite', { destination: mask, source: join(r.cut, 24), x: 0, y: 0, operation: 'subtract' }), 0];
  const out = applyMask(g, im, mask, 'white', true);
  g.add('PreviewImage', { images: out });
  return out;
};
const promptsOf = o => (Array.isArray(o.prompts) && o.prompts.length ? o.prompts : [o.prompt || '']);
const nP = o => promptsOf(o).length;
const shotLabel = (k, n) => (n > 1 ? `Pintando toma ${k + 1} de ${n}` : 'Pintando');

/** Píxeles de relleno {left,right,top,bottom} para llevar una imagen w×h al formato ar ('zoom' = alejar 1.5×). */
export function padFor(w, h, ar) {
  if (!ar || !w || !h) return null;
  if (ar === 'zoom') { const x = Math.round(w * 0.25), y = Math.round(h * 0.25); return { left: x, right: x, top: y, bottom: y }; }
  const [a, b] = String(ar).split(':').map(Number);
  if (!a || !b) return null;
  const t = a / b, cur = w / h;
  if (Math.abs(cur / t - 1) < 0.03) { const x = Math.round(w * 0.15), y = Math.round(h * 0.15); return { left: x, right: x, top: y, bottom: y }; }
  if (cur < t) { const p = Math.round(h * t) - w; return { left: Math.floor(p / 2), right: Math.ceil(p / 2), top: 0, bottom: 0 }; }
  const p = Math.round(w / t) - h;
  return { left: 0, right: 0, top: Math.floor(p / 2), bottom: Math.ceil(p / 2) };
}

/** Carga la imagen a editar (y la rellena con blanco si hay que expandirla). Devuelve un link IMAGE. */
function loadMain(g, o) {
  if (o.image.link) return o.image.link;   // imagen generada en el MISMO grafo (pose.js encadena su pase de diseño así)
  const li = g.add('LoadImage', { image: o.image.ref });
  const pad = padFor(o.image.w, o.image.h, o.ar);
  if (!pad) return [li, 0];
  return [g.add('ImagePadKJ', { image: [li, 0], ...pad, extra_padding: 0, pad_mode: 'color', color: '255, 255, 255' }), 0];
}

/* ---------- FLUX.2 Klein 4B (Ligero) — tpl_image_flux2_klein_image_edit_4b_distilled ---------- */
function editKlein(o) {
  const g = G(); const refs = refsOf(o, 3); const P = promptsOf(o);
  const u = g.add('UNETLoader', { unet_name: 'flux-2-klein-4b-fp8.safetensors', weight_dtype: 'default' }, 'Cargando FLUX.2 Klein…');
  const model = withHeroLora(g, [u, 0], o);   // LoRA de personaje (opcional)
  const c = g.add('CLIPLoader', { clip_name: 'qwen_3_4b.safetensors', type: 'flux2', device: 'default' }, 'Cargando FLUX.2 Klein…');
  const vae = g.add('VAELoader', { vae_name: 'flux2-vae.safetensors' });
  const main = loadMain(g, o);
  // el lienzo sale del tamaño de la imagen a editar (1 MP), como en la plantilla
  const canvas = g.add('ImageScaleToTotalPixels', { image: main, upscale_method: 'lanczos', megapixels: 1, resolution_steps: 1 });
  const size = g.add('GetImageSize', { image: [canvas, 0] });
  // con varias imágenes, todas las referencias a 0.4 MP (regla probada en una GPU de 8 GB: si no, 10+ min)
  const imgs = refs.length
    ? [main, ...refs.map(r => loadRef(g, r))]
      .map(im => [g.add('ImageScaleToTotalPixels', { image: im, upscale_method: 'lanczos', megapixels: 0.4, resolution_steps: 1 }), 0])
    : [[canvas, 0]];
  const lats = imgs.map((im, i) => g.add('VAEEncode', { pixels: im, vae: [vae, 0] }, i ? `Estudiando referencia ${i}…` : 'Estudiando tu imagen…'));
  const lat = g.add('EmptyFlux2LatentImage', { width: [size, 0], height: [size, 1], batch_size: 1 });
  const sch = g.add('Flux2Scheduler', { steps: 4, width: [size, 0], height: [size, 1] });
  const smp = g.add('KSamplerSelect', { sampler_name: 'euler' });
  P.forEach((p, k) => {
    let pos = g.add('CLIPTextEncode', { clip: [c, 0], text: heroPrompt(fillRefs(p, 'klein'), o) }, 'Leyendo la instrucción…');
    let neg = g.add('ConditioningZeroOut', { conditioning: [pos, 0] });
    for (const l of lats) {
      pos = g.add('ReferenceLatent', { conditioning: [pos, 0], latent: [l, 0] });
      neg = g.add('ReferenceLatent', { conditioning: [neg, 0], latent: [l, 0] });
    }
    const gd = g.add('CFGGuider', { model, positive: [pos, 0], negative: [neg, 0], cfg: 1 });
    const nz = g.add('RandomNoise', { noise_seed: rnd() });
    const s = g.add('SamplerCustomAdvanced', { noise: [nz, 0], guider: [gd, 0], sampler: [smp, 0], sigmas: [sch, 0], latent_image: [lat, 0] }, shotLabel(k, P.length));
    saveImage(g, [g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…'), 0], 'phane/edit');
  });
  return g;
}

/* ---------- Qwen-Image 2.1 (High End) ----------
   Turbo: tpl_image_qwen_image_2_1_turbo_image_edit (8 pasos, ManualSigmas).
   Completo: tpl_image_qwen_image_2_1_image_edit (KSampler 25 pasos).  El lienzo sigue a image_1 (salida 2 del encoder). */
export function qwen21Edit(o, full, into) {   // into: grafo existente al que se agregan los nodos (si no, uno nuevo)
  const g = into || G(); const refs = refsOf(o, 3); const P = promptsOf(o);
  const unet = g.add('UNETLoader', { unet_name: full ? 'qwen_image_2.1_int8_convrot.safetensors' : 'qwen_image_2.1_turbo_int8_convrot.safetensors', weight_dtype: 'default' }, 'Cargando Qwen-Image 2.1…');
  const model = g.add('QwenImage21Cache', { model: [unet, 0], device: 'auto', dtype: 'default' });
  const clip = g.add('CLIPLoader', { clip_name: 'qwen3vl_8b_int8_convrot.safetensors', type: 'qwen_image', device: 'default' }, 'Cargando Qwen-Image 2.1…');
  const vae = g.add('VAELoader', { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' });
  const imgs = [loadMain(g, o), ...refs.map(r => r.link || loadRef(g, r))];
  const imgIn = {};
  imgs.forEach((im, i) => { imgIn[`images.image_${i + 1}`] = im; });
  // presupuesto de píxeles por imagen (la plantilla usa 0 = tamaño original; lo acotamos para fotos grandes)
  const res = imgs.length > 1 ? 1024 : 1536;
  let pe, sys, batch;
  if (o.enhance) {
    pe = g.add('CLIPLoader', { clip_name: 'qwen3.5_9b_qwen_image_2.1_pe_i2i.int8_convrot.safetensors', type: 'qwen_image', device: 'default' }, 'Cargando el mejorador de instrucciones…');
    sys = g.add('PrimitiveStringMultiline', { value: PE_I2I_FAST });
    const bi = {};
    imgs.forEach((im, i) => { bi[`images.image${i}`] = im; });
    batch = g.add('BatchImagesNode', bi);
  }
  let sig, smp;
  if (!full) { sig = g.add('ManualSigmas', { sigmas: QWEN21_TURBO_SIGMAS }); smp = g.add('KSamplerSelect', { sampler_name: 'euler' }); }
  g.q21 = { model, clip, vae };   // pose.js (pase HQ) reutiliza los mismos cargadores: no cargar Qwen dos veces
  P.forEach((p, k) => {
    let prompt = fillRefs(p, 'qwen21');
    if (o.enhance) {
      // sin "thinking" (25+ min en una GPU de 8 GB) + modo callado (PE_I2I_FAST) + desenvolver el JSON que a veces devuelve
      const tg = g.add('TextGenerate', { clip: [pe, 0], prompt, max_length: 800, ...SAMPLING_PE_FAST,
        'sampling_mode.seed': rnd(), 'sampling_mode.presence_penalty': 0,
        thinking: false, use_default_template: true, mtp: 'auto', image: [batch, 0], system_prompt: [sys, 0] }, 'Mejorando la instrucción…');
      // si aun desenvuelto parece razonamiento/JSON → el 4B rápido con reglas de edición (perezoso: solo corre si hace falta)
      prompt = guardPE(g, unwrapPE(g, [tg, 0]), lightTG(g, prompt, LIGHT_EDIT_SYS, 'Mejorando la instrucción…'));
    }
    const te = g.add('TextEncodeQwenImage21', { clip: [clip, 0], prompt, negative_prompt: '', resolution: res, vae: [vae, 0], ...imgIn }, 'Estudiando tu imagen…');
    let s;
    if (full) {
      s = g.add('KSampler', { model: [model, 0], seed: rnd(), steps: 25, cfg: 1, sampler_name: 'euler', scheduler: 'simple',
        positive: [te, 0], negative: [te, 1], latent_image: [te, 2], denoise: 1 }, shotLabel(k, P.length));
    } else {
      const gd = g.add('CFGGuider', { model: [model, 0], positive: [te, 0], negative: [te, 1], cfg: 1 });
      const nz = g.add('RandomNoise', { noise_seed: rnd() });
      s = g.add('SamplerCustomAdvanced', { noise: [nz, 0], guider: [gd, 0], sampler: [smp, 0], sigmas: [sig, 0], latent_image: [te, 2] }, shotLabel(k, P.length));
    }
    const dec = g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…');
    if (!o.noSave) saveImage(g, [dec, 0], o.savePrefix || 'phane/edit');
    g.lastOut = [dec, 0];   // pose.js encadena otro paso sobre esta imagen
  });
  return g;
}

/* ---------- Qwen-Image-Edit 2511 int8 + Lightning 4 pasos (High End) — tpl_image_qwen_image_edit_2511_int8 ----------
   La plantilla trae Lightning apagado (40 pasos, CFG 4); aquí va encendido (4 pasos, CFG 1). Hasta 3 imágenes. */
function qwen2511(o) {
  const g = G(); const refs = refsOf(o, 2); const P = promptsOf(o);
  const unet = g.add('UNETLoader', { unet_name: 'qwen_image_edit_2511_int8_convrot.safetensors', weight_dtype: 'default' }, 'Cargando Qwen-Image-Edit 2511…');
  const clip = g.add('CLIPLoader', { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' }, 'Cargando Qwen-Image-Edit 2511…');
  const vae = g.add('VAELoader', { vae_name: 'qwen_image_vae.safetensors' });
  let m = g.add('ModelSamplingAuraFlow', { model: [unet, 0], shift: 3.1, sampling: 'flow' });
  m = g.add('CFGNorm', { model: [m, 0], strength: 1, pre_cfg: false });
  m = g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', strength_model: 1 });
  const img1 = g.add('FluxKontextImageScale', { image: loadMain(g, o) });
  const imgIn = { image1: [img1, 0] };
  refs.forEach((r, i) => { imgIn['image' + (i + 2)] = loadRef(g, r); });
  const negTe = g.add('TextEncodeQwenImageEditPlus', { clip: [clip, 0], prompt: '', vae: [vae, 0], ...imgIn });
  const neg = g.add('FluxKontextMultiReferenceLatentMethod', { conditioning: [negTe, 0], reference_latents_method: 'index_timestep_zero' });
  const lat = g.add('VAEEncode', { pixels: [img1, 0], vae: [vae, 0] }, 'Estudiando tu imagen…');
  P.forEach((p, k) => {
    const te = g.add('TextEncodeQwenImageEditPlus', { clip: [clip, 0], prompt: fillRefs(p, 'qwen2511'), vae: [vae, 0], ...imgIn }, 'Leyendo la instrucción…');
    const pos = g.add('FluxKontextMultiReferenceLatentMethod', { conditioning: [te, 0], reference_latents_method: 'index_timestep_zero' });
    const s = g.add('KSampler', { model: [m, 0], seed: rnd(), steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple',
      positive: [pos, 0], negative: [neg, 0], latent_image: [lat, 0], denoise: 1 }, shotLabel(k, P.length));
    saveImage(g, [g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…'), 0], 'phane/edit');
  });
  return g;
}

/* ---------- Quitar fondo: BiRefNet (Ligero) — tpl_utility_birefnet_remove_background ---------- */
function birefnet(o) {
  const g = G();
  const li = g.add('LoadImage', { image: o.image.ref });
  const m = g.add('LoadBackgroundRemovalModel', { bg_removal_name: 'birefnet.safetensors' }, 'Cargando BiRefNet…');
  const mask = g.add('RemoveBackground', { bg_removal_model: [m, 0], image: [li, 0] }, 'Recortando…');
  const inv = g.add('InvertMask', { mask: [mask, 0] });
  const out = g.add('JoinImageWithAlpha', { image: [li, 0], alpha: [inv, 0] });
  saveImage(g, [out, 0], 'phane/sinfondo');   // PNG RGBA
  return g;
}

/* ---------- Quitar fondo: Qwen-Image 2.1 (High End) — tpl_image_qwen_image_2_1_background_removal ----------
   El VAE de Qwen-Image 2.1 decodifica RGBA: se guarda como PNG con transparencia. */
function bgQwen21(o) {
  const g = G();
  const unet = g.add('UNETLoader', { unet_name: 'qwen_image_2.1_int8_convrot.safetensors', weight_dtype: 'default' }, 'Cargando Qwen-Image 2.1…');
  const model = g.add('QwenImage21Cache', { model: [unet, 0], device: 'auto', dtype: 'default' });
  const clip = g.add('CLIPLoader', { clip_name: 'qwen3vl_8b_int8_convrot.safetensors', type: 'qwen_image', device: 'default' }, 'Cargando Qwen-Image 2.1…');
  const vae = g.add('VAELoader', { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' });
  const li = g.add('LoadImage', { image: o.image.ref });
  // la plantilla usa resolution 0 (tamaño original); 1024 (default oficial) evita que una foto de 12 MP tarde horas
  const te = g.add('TextEncodeQwenImage21', { clip: [clip, 0], prompt: 'Remove the background, and output a PNG image', negative_prompt: '',
    resolution: 1024, vae: [vae, 0], 'images.image_1': [li, 0] }, 'Estudiando tu imagen…');
  const s = g.add('KSampler', { model: [model, 0], seed: rnd(), steps: 25, cfg: 1, sampler_name: 'euler', scheduler: 'simple',
    positive: [te, 0], negative: [te, 1], latent_image: [te, 2], denoise: 1 }, 'Recortando');
  saveImage(g, [g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…'), 0], 'phane/sinfondo');
  return g;
}

const QWEN21_FILES = ['text_encoders/qwen3vl_8b_int8_convrot.safetensors', 'vae/qwen_image_2.1_vae_bf16.safetensors'];
const PE_I2I_FILE = 'text_encoders/qwen3.5_9b_qwen_image_2.1_pe_i2i.int8_convrot.safetensors';

export const ENGINES = [
  {
    id: 'edit.klein', tool: 'edit', tier: 'ligero',
    name: 'FLUX.2 Klein 4B', desc: 'Edita con una instrucción en ~30 s. Hasta 3 imágenes extra de referencia.',
    files: ['diffusion_models/flux-2-klein-4b-fp8.safetensors', 'text_encoders/qwen_3_4b.safetensors', 'vae/flux2-vae.safetensors'],
    // 28-oct: medido 18 s (1 toma, sin refs; antes estimaba 35)
    ramGB: 17, est: o => 6 + nP(o) * (12 + 5 * refsOf(o, 3).length), build: editKlein, sample: { ...SAMPLE, refs: [REF, REF] },
    caps: { refs: 3, multi: true, expand: true, heroLora: true },
  },
  {
    id: 'edit.qwen21', tool: 'edit', tier: 'highend',
    name: 'Qwen-Image 2.1 Turbo (edición)', desc: 'Edición precisa a ~2 MP en 8 pasos; entiende varias imágenes (<image1>, <image2>…). Mejorador opcional.',
    files: ['diffusion_models/qwen_image_2.1_turbo_int8_convrot.safetensors', ...QWEN21_FILES, PE_I2I_FILE],
    ramGB: 31,   // 7.3 + 9.4 + 0.7 (+ 9.5 del mejorador) + 4
    // 28-oct: medido 161-179 s por 2 tomas sin refs ni mejorador (antes estimaba 420)
    est: o => 45 + nP(o) * (60 + 25 * refsOf(o, 3).length + (o.enhance ? 300 : 0)), build: o => qwen21Edit(o, false),
    sample: { ...SAMPLE, enhance: true, prompts: [SAMPLE.prompt, 'Turn the camera to a close-up of {img1}.'] },
    caps: { refs: 3, multi: true, expand: true, enhance: true },
  },
  {
    id: 'edit.qwen2511', tool: 'edit', tier: 'highend',
    name: 'Qwen-Image-Edit 2511', desc: 'El editor más fiel con personas y multi-imagen (Lightning 4 pasos). Muy pesado: tarda.',
    files: ['diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors', 'text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors',
      'vae/qwen_image_vae.safetensors', 'loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors'],
    ramGB: 35,   // 20.5 + 9.4 + 0.3 + 0.8 + 4
    est: o => 150 + nP(o) * (120 + 30 * refsOf(o, 2).length), build: qwen2511, sample: { ...SAMPLE, ar: '16:9' },
    caps: { refs: 2, multi: true, expand: true },
  },
  {
    id: 'edit.qwen21_full', tool: 'edit', tier: 'highend',
    name: 'Qwen-Image 2.1 completo (25 pasos)', desc: 'Máxima calidad de Qwen-Image 2.1 sin destilar. El más lento.',
    files: ['diffusion_models/qwen_image_2.1_int8_convrot.safetensors', ...QWEN21_FILES, PE_I2I_FILE],
    ramGB: 31,
    est: o => 60 + nP(o) * (500 + 60 * refsOf(o, 3).length + (o.enhance ? 300 : 0)), build: o => qwen21Edit(o, true),
    sample: { ...SAMPLE, ar: 'zoom' },
    caps: { refs: 3, multi: true, expand: true, enhance: true },
  },
  {
    id: 'bg.birefnet', tool: 'bg', tier: 'ligero',
    name: 'BiRefNet', desc: 'Recorte limpio en segundos (PNG transparente).',
    files: ['background_removal/birefnet.safetensors'],
    ramGB: 5, est: () => 6, build: birefnet, sample: { image: IMG },
    caps: {},
  },
  {
    id: 'bg.qwen21', tool: 'bg', tier: 'highend',
    name: 'Qwen-Image 2.1 (recorte IA)', desc: 'Recorta con IA generativa: mejor en pelo, vidrio y bordes difíciles. Lento.',
    files: ['diffusion_models/qwen_image_2.1_int8_convrot.safetensors', ...QWEN21_FILES],
    ramGB: 21, est: () => 220, build: bgQwen21, sample: { image: IMG },
    caps: {},
  },
];

/* ---------- Texto de sistema del mejorador de instrucciones (plantilla oficial) ---------- */
/** Qwen-Image 2.1 PE i2i (tpl_image_qwen_image_2_1_turbo_image_edit, nodo 479). */
export const PE_I2I = "# Edit Prompt Enhancer — General (v2, 精简版)\n\n**FIRST — there are TWO separate language decisions. Do NOT conflate them.**\n\n**(A) Language of the rewritten prompt's DESCRIPTIVE prose — every word OUTSIDE double quotes (the description you write for the diffusion model, NOT the text painted into the image). This decision is final and non-negotiable:**\n- User instruction is in Chinese → write the description in Chinese.\n- User instruction is in English → write the description in English.\n- User instruction is in ANY other language (Japanese, Korean, French, Spanish, Thai, etc.) → write the description in English.\n\n**(B) Language of the TEXT THAT WILL BE RENDERED INTO THE OUTPUT IMAGE — the content INSIDE double quotes. Decide it in this strict priority order:**\n1. If the user's instruction gives the exact text to write, OR names a target language for the text (e.g. \"改成'夏日特惠'\", \"把标题写成英文\", \"add a Japanese title\", \"write the caption in Thai\") → render exactly that text / in exactly that specified language.\n2. Otherwise, if the input image already contains text → render in the DOMINANT language of the image's existing text — even when the instruction is written in a different language.\n3. Otherwise (the image contains no text AND the instruction names no target language) → render in the language of the user's instruction itself — including Japanese, Korean, Thai, Arabic, French, etc. Do NOT force it to English.\nWorked example: image is mostly Thai, instruction is in English asking to add/redesign a title without giving the exact words or a language → the rendered (quoted) text must be **Thai** (the image's dominant language), while the surrounding description (A) is still written in English.\n\nTwo reinforcements on decision (B): all rendered (quoted) text must be **monolingual** — do not mix Chinese and English inside the quotes and do not emit a bilingual pair unless the user explicitly asks for one. And **genre never overrides input language**: a \"spec sheet / cinematic data-document / storyboard / technical parameter\" look is achieved through layout and typography, NOT by switching rendered labels to English — every header, label, and caption stays in the decided language (standardized units and user-given proper nouns may remain Latin).\n\nYou are an expert at clarifying image editing instructions. Given a user's vague or ambiguous edit instruction and the input image(s), rewrite it into a precise, unambiguous, actionable editing directive. An input image is ALWAYS present — this is always an image-editing task, never text-to-image from nothing.\n\n## Core Objective\n\nRewrite the instruction so a downstream image-editing model can execute it without guessing — anchored on what the input image(s) actually show, faithful to the user's intent, inventing nothing.\n\n**How much you build is intent-branched.** When the user wants *this picture changed* (a local object/attribute/background edit, a text or UI edit, a quality or style change, a viewpoint/canvas transform), clarify and constrain: say exactly what changes, and let everything else stand. When the user wants *a new picture of this subject* (placing a subject in a new scene, compositing across images, a photo-shoot or poster or infographic built from a reference), construct actively: design the scene, lighting, composition and layout to a professional standard. Scale the elaboration to what was asked — a plain placement stays restrained, a styled shoot or a publication-grade poster is built out fully.\n\n## The Governing Principle — Attribute Disentanglement at Full Strength\n\n**Edit exactly the attribute(s) the user named, push each to a strong and unmistakable degree, and hold everything else at input fidelity.**\n\nBoth halves matter, and the two failure modes are symmetric:\n\n- **Leakage** — touching what the user did not name (a sharpen that re-grades color, an upscale that reframes, a style change that drifts a face, an outfit swap that drops an accessory, a background change that \"helpfully\" cleans up something unmentioned).\n- **Under-editing** — an output a viewer could mistake for the unedited input, because the requested change was applied faintly.\n\nPreservation locks **content, never edit strength**. Recognizability is bought by naming what stays fixed, not by holding the effect back.\n\n## What to Anchor, What to Decide\n\n**Anchor on the image.** Every spatial, tonal and contextual claim comes from what is visibly there. If you are unsure a detail exists, leave it out — a preserved element described at a higher level of abstraction is always safer than an invented specific.\n\n**Say what stays, without repainting it.** Name the untargeted content by type, position and role rather than describing its appearance, and prefer one blanket preservation clause over walking the frame. A preservation description reads to the model as a generation instruction: the more concretely you describe something you meant to keep, the more likely it drifts. Describe appearance concretely only for what you are actually changing, or when it is the only way to disambiguate between similar objects.\n\n**Identity is the hardest invariant.** A person's facial identity and the personal accessories that make them recognizable; a product's exact design, markings and count; and the input's rendering medium (photograph, anime, illustration, sketch, 3D render, painting) all survive every edit unless the user explicitly targets them. When identity comes from a reference image, point at that image rather than describing features in words — verbal descriptions make the model regenerate and degrade the likeness.\n\n**Resolve ambiguity, then commit.** Turn vague intent, imprecise spatial reference and unparameterized style words into something concrete and observable. Translate abstract quality language into the visual properties it implies. Where the instruction offers alternatives or contradicts itself, pick the most reasonable reading and state it as a decision. Keep the user's own action verb, spatial relations and described state intact, and treat anything they asked to preserve as absolute. Preserve creative or physically impossible intent rather than correcting it.\n\n**Only what was asked.** Do not add operations the user did not request, and do not clean up unmentioned defects, overlays or clutter however prominent they look. When an edit removes, moves or reveals something, say enough about the newly exposed region that the result stays physically coherent.\n\n**Text in the image is literal.** Whenever readable text will appear in the output, commit to the exact characters — every element, quoted, nothing summarized or abbreviated away. Text you cannot commit to should not be added at all. Match the typography and language the input establishes unless the user asks otherwise. When the operation extends the canvas outward, name it as outpainting explicitly.\n\n**Write it as an instruction.** Lead with the operation, not a description of the finished picture, and write from the perspective of someone holding only the input image(s).\n\n## Thinking Process\n\nBefore emitting the final prompt, reason through: what the image(s) actually contain (including a complete reading of any text present); what the user is asking for and which attributes that names; what must therefore stay fixed; and finally the composed directive. Close with a check that every visible element is either the target of the edit or covered by what stays fixed, that the requested change is unmistakable, that nothing outside the target was touched, and that every quoted string obeys language decision (B).\n\n## Image Reference Rules\n\nFor Multi-Image Input (N >= 2), the rewritten instruction MUST use `<image1>`, `<image2>`, ... to refer to each input image. Do not use natural language references like \"图1\", \"第一张图\", \"the first image\", or \"image A\". This tagging format is mandatory and non-negotiable. For single-image input (N = 1), do NOT use tags — refer to the image naturally (\"图像\", \"图片中\", \"the image\").\n\nState each image's role explicitly — which one is the canvas whose composition and untargeted content survive, and which supply material to transfer — and say what is taken from each. For scene generation with no canvas (合影/合照 and the like), all images serve as identity sources. Describe every referenced image individually; never compress several into a range or a group to avoid describing them one by one.\n\n## Output Format\nOutput ONLY the rewritten editing instruction itself: one single continuous paragraph of plain text.\n\nFormatting rules:\n- The entire rewritten prompt must be a single continuous paragraph with NO line breaks or newline characters.\n- The response must contain nothing except the instruction itself: no object or array wrapper, no field names or key-value pairs, no headings, labels, or prefaces, no greetings, explanations, or commentary, no markdown, and no code fences. Begin with the first word of the instruction and end with its last word.\n- Do not wrap the whole instruction in quotes: double quotes are reserved for text that will be RENDERED in the image (next rule).\n- All text that should appear as visible, readable content in the output image must be enclosed in double quotes (\"\"). Descriptive or structural language that does not appear as rendered text should NOT be quoted.\n- **Never include any resolution or aspect ratio information** (e.g., \"2:3\", \"16:9\", \"1920x1080\", \"2K\", \"4K\"). Output size is decided downstream, not by you.\n- Write it out in full — no ellipsis, no truncation.\n- State requirements affirmatively (\"保持背景与输入图完全一致\") rather than as prohibitions (\"禁止改变背景\"). Standard preservation phrasing \"保持/保留[X]不变\" is fine.\n- Be precise and decisive: no hedging, no unresolved alternatives, no vague degree words left unresolved.\n- The descriptive prose (outside double quotes) follows language decision (A); the text rendered inside the image (inside double quotes) follows language decision (B). Retain proper nouns and domain-specific terms in their original language, placed in English double quotes.\n- **Language-purge self-check (do this last)**: re-scan every double-quoted string — the text that will be RENDERED in the image — and enforce language decision (B). No quoted string may mix Chinese and English, form a bilingual pair, or carry a parenthetical translation gloss unless the user explicitly asked. Standardized units and user-given proper nouns may remain Latin.\n\nThe user's edit instruction to rewrite is:";

/** Modo callado para el PE de edición: sin "thinking" escribía su análisis o respondía JSON. Se quita el conflicto de raíz
 *  ("Before emitting the final prompt, reason through:") y se pide solo la instrucción; guardPE cubre lo que se escape. */
export const PE_I2I_FAST = PE_I2I.replace('Before emitting the final prompt, reason through:',
  'Silently, in your head (never in the reply), reason through:').replace(/The user's edit instruction to rewrite is:\s*$/, m =>
  '## Fast mode (overrides how you work, not what you write)\nDo all the reasoning from "Thinking Process" silently, in your head. ' +
  'Do NOT write the analysis, notes or any reasoning. Your entire reply is ONLY the final rewritten editing instruction as plain text ' +
  '(no JSON, no field names), starting on the very first character.\n\n' + m);

/** El PE de edición sin "thinking" a veces responde {"rewritten_prompt": "…", "language": "…"} (su formato de entrenamiento)
 *  aunque el system prompt lo prohíbe: se desenvuelve. Sin JSON el texto pasa igual (re.sub sin coincidencia). Devuelve link STRING. */
export function unwrapPE(g, text) {
  const r = g.add('RegexReplace', { string: text, regex_pattern: String.raw`^\s*\{\s*"rewritten_prompt"\s*:\s*"(.*?)"\s*(?:,\s*"language"\s*:\s*"[^"]*"\s*)?\}\s*$`,
    replace: '\\1', case_insensitive: true, multiline: false, dotall: true, count: 1 });
  return [g.add('StringReplace', { string: [r, 0], find: '\\"', replace: '"' }), 0];
}
