// Motores de IMAGEN (texto -> imagen, con o sin referencias).
// EJEMPLO DE REFERENCIA del contrato: los demás módulos siguen este patrón.
import { G, rnd, IMG_SIZE, saveImage, withHeroLora, heroPrompt } from '../lib/graph.js';
import { guardPE, lightTG, SAMPLING_PE_FAST } from './pe_guard.js';

/**
 * Opciones comunes: { prompt, ar:'1:1'|'9:16'|'16:9'|'4:3'|'3:4', count:1..4, refs:[{ref,w,h}],
 *   enhance?:bool (mejorar prompt con el LLM de la plantilla), refHint?:false, literal?:bool (✍️ Al pie de la letra: sin frases agregadas) }
 */
const ASPECTS = ['1:1', '9:16', '16:9', '4:3', '3:4'];
const SAMPLE = { prompt: 'Cinematic portrait of a woman in a red raincoat on a rainy Tokyo street at night, neon lights, 35mm film look', ar: '1:1', count: 1 };
const REF = { ref: 'example.png', w: 1024, h: 1024 };

/** Schedule fijo de 8 pasos de Qwen-Image 2.1 Turbo (ManualSigmas de la plantilla oficial). */
export const QWEN21_TURBO_SIGMAS = '1.0, 0.978453, 0.95418, 0.926626, 0.89508, 0.845148, 0.704534, 0.414568, 0';

/** Motor con referencias que se usa cuando el elegido no acepta fotos (la página lo cambia solo). */
export const REF_FALLBACK = { ligero: 'image.klein', highend: 'image.qwen21' };

const nOf = o => Math.max(1, Math.min(4, o.count || 1));
const refsOf = (o, max) => (o.refs || []).filter(r => r && r.ref).slice(0, max);

/** Frase (inglés) para que el modelo conserve la identidad de las referencias. name(i) = cómo nombra la imagen i (1..n). */
export function identityHint(n, name) {
  if (!n) return '';
  const list = Array.from({ length: n }, (_, i) => name(i + 1)).join(', ');
  return `The main subject must look exactly like the person or subject in ${list}: same face, identity, hairstyle and distinctive features.`;
}

/* ---------- Z-Image Turbo (Ligero): fotorrealista, 8 pasos ---------- */
function zimage(o) {
  const g = G(); const [w, h] = IMG_SIZE.ligero[o.ar || '1:1'];
  let u = g.add('UnetLoaderGGUF', { unet_name: 'z_image_turbo-Q8_0.gguf' }, 'Cargando Z-Image…');
  u = g.add('ModelSamplingAuraFlow', { model: [u, 0], shift: 3 });
  const c = g.add('CLIPLoader', { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' }, 'Cargando Z-Image…');
  const vae = g.add('VAELoader', { vae_name: 'ae.safetensors' });
  const p = g.add('CLIPTextEncode', { clip: [c, 0], text: o.prompt }, 'Leyendo tu idea…');
  const ng = g.add('ConditioningZeroOut', { conditioning: [p, 0] });
  const l = g.add('EmptySD3LatentImage', { width: w, height: h, batch_size: o.count || 1 });
  const s = g.add('KSampler', { model: [u, 0], seed: rnd(), steps: 8, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple',
    positive: [p, 0], negative: [ng, 0], latent_image: [l, 0], denoise: 1 }, 'Pintando');
  const d = g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…');
  saveImage(g, [d, 0], 'phane/img');
  return g;
}

/* ---------- FLUX.2 Klein 4B (Ligero): genera y, con hasta 4 referencias, mantiene persona/objeto ---------- */
function klein(o) {
  const g = G(); const [w, h] = IMG_SIZE.ligero[o.ar || '1:1'];
  const refs = refsOf(o, 4);
  const u = g.add('UNETLoader', { unet_name: 'flux-2-klein-4b-fp8.safetensors', weight_dtype: 'default' }, 'Cargando FLUX.2 Klein…');
  const model = withHeroLora(g, [u, 0], o);   // LoRA de personaje (opcional)
  const c = g.add('CLIPLoader', { clip_name: 'qwen_3_4b.safetensors', type: 'flux2', device: 'default' }, 'Cargando FLUX.2 Klein…');
  const vae = g.add('VAELoader', { vae_name: 'flux2-vae.safetensors' });
  // con LoRA de personaje la identidad la pone la LoRA: las referencias extra (lugar, objeto, otra persona) no son su cara
  const hint = !refs.length || o.refHint === false ? ''
    : o.heroLora && o.heroLora.name ? ` Use ${refs.length > 1 ? 'the reference images' : 'the reference image'} for the other elements of the scene.`
    : ' ' + identityHint(refs.length, i => (refs.length > 1 ? `reference image ${i}` : 'the reference image'));
  let pos = g.add('CLIPTextEncode', { clip: [c, 0], text: heroPrompt(o.prompt, o) + hint }, 'Leyendo tu idea…');
  let neg = g.add('ConditioningZeroOut', { conditioning: [pos, 0] });
  refs.forEach((r, i) => {
    const li = g.add('LoadImage', { image: r.ref });
    // con varias referencias, 0.4 MP cada una (probado: si no, 10+ min en 8 GB); con una sola, 0.8 MP
    const im = g.add('ImageScaleToTotalPixels', { image: [li, 0], upscale_method: 'lanczos', megapixels: refs.length > 1 ? 0.4 : 0.8, resolution_steps: 1 });
    const lat = g.add('VAEEncode', { pixels: [im, 0], vae: [vae, 0] }, `Estudiando referencia ${i + 1}…`);
    pos = g.add('ReferenceLatent', { conditioning: [pos, 0], latent: [lat, 0] });
    neg = g.add('ReferenceLatent', { conditioning: [neg, 0], latent: [lat, 0] });
  });
  const l = g.add('EmptyFlux2LatentImage', { width: w, height: h, batch_size: nOf(o) });
  const sch = g.add('Flux2Scheduler', { steps: 4, width: w, height: h });
  const gd = g.add('CFGGuider', { model, positive: [pos, 0], negative: [neg, 0], cfg: 1 });
  const smp = g.add('KSamplerSelect', { sampler_name: 'euler' });
  const nz = g.add('RandomNoise', { noise_seed: rnd() });
  const s = g.add('SamplerCustomAdvanced', { noise: [nz, 0], guider: [gd, 0], sampler: [smp, 0], sigmas: [sch, 0], latent_image: [l, 0] }, 'Pintando');
  const d = g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…');
  saveImage(g, [d, 0], 'phane/img');
  return g;
}

/* ---------- Qwen-Image 2.1 Turbo int8 (High End): 2 MP nativo, 8 pasos; acepta referencias ----------
   Plantilla tpl_image_qwen_image_2_1_turbo_t2i. Con referencias usa la ruta "custom_size" de
   tpl_image_qwen_image_2_1_turbo_image_edit (images.image_N + lienzo propio). enhance = mejorador de prompt (PE t2i). */
function qwen21(o) {
  const g = G(); const [w, h] = IMG_SIZE.highend[o.ar || '1:1'];
  const refs = refsOf(o, 4), n = nOf(o);
  const unet = g.add('UNETLoader', { unet_name: 'qwen_image_2.1_turbo_int8_convrot.safetensors', weight_dtype: 'default' }, 'Cargando Qwen-Image 2.1…');
  const model = g.add('QwenImage21Cache', { model: [unet, 0], device: 'auto', dtype: 'default' });
  const clip = g.add('CLIPLoader', { clip_name: 'qwen3vl_8b_int8_convrot.safetensors', type: 'qwen_image', device: 'default' }, 'Cargando Qwen-Image 2.1…');
  const vae = g.add('VAELoader', { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' });
  const hint = refs.length && o.refHint !== false ? identityHint(refs.length, i => `<image${i}>`) : '';
  let prompt = hint ? `${o.prompt} ${hint}` : o.prompt;
  if (o.enhance) {
    const pe = g.add('CLIPLoader', { clip_name: 'qwen3.5_9b_qwen_image_2.1_pe_t2i.int8_convrot.safetensors', type: 'stable_diffusion', device: 'default' }, 'Cargando el mejorador de prompt…');
    // sin "thinking" (25+ min en una GPU de 8 GB) + modo callado; si aun así razona o responde JSON, guardPE usa el 4B rápido (ver pe_guard.js)
    const sys = g.add('PrimitiveStringMultiline', { value: PE_T2I_FAST });
    const tg = g.add('TextGenerate', { clip: [pe, 0], prompt: o.prompt, max_length: 800, ...SAMPLING_PE_FAST,
      'sampling_mode.seed': rnd(), 'sampling_mode.presence_penalty': 1.5,
      thinking: false, use_default_template: true, mtp: 'auto', system_prompt: [sys, 0] }, 'Mejorando tu prompt…');
    const text = guardPE(g, [tg, 0], lightTG(g, o.prompt, KREA_SYS));
    // el PE reescribe la idea; la frase de identidad (<imageN>) se añade después para no perderla
    prompt = hint ? [g.add('StringConcatenate', { string_a: text, string_b: hint, delimiter: ' ' }), 0] : text;
  }
  const enc = { clip: [clip, 0], prompt, negative_prompt: '', resolution: refs.length > 1 ? 768 : 1024 };
  if (refs.length) {
    enc.vae = [vae, 0];
    refs.forEach((r, i) => { enc[`images.image_${i + 1}`] = [g.add('LoadImage', { image: r.ref }), 0]; });
  }
  const te = g.add('TextEncodeQwenImage21', enc, refs.length ? 'Estudiando tus referencias…' : 'Leyendo tu idea…');
  const sig = g.add('ManualSigmas', { sigmas: QWEN21_TURBO_SIGMAS });
  const smp = g.add('KSamplerSelect', { sampler_name: 'euler' });
  const gd = g.add('CFGGuider', { model: [model, 0], positive: [te, 0], negative: [te, 1], cfg: 1 });
  const lat = g.add('EmptyLatentImage', { width: w, height: h, batch_size: 1 });
  // una cadena por imagen (no batch): a 2 MP un batch de 4 no cabe en 8 GB
  for (let k = 0; k < n; k++) {
    const nz = g.add('RandomNoise', { noise_seed: rnd() });
    const s = g.add('SamplerCustomAdvanced', { noise: [nz, 0], guider: [gd, 0], sampler: [smp, 0], sigmas: [sig, 0], latent_image: [lat, 0] },
      n > 1 ? `Pintando ${k + 1} de ${n}` : 'Pintando');
    const d = g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…');
    saveImage(g, [d, 0], 'phane/img');
  }
  return g;
}

export const ENGINES = [
  {
    id: 'image.zimage', tool: 'image', tier: 'ligero',
    name: 'Z-Image Turbo', desc: 'Fotorrealista y rápido (8 pasos). El mejor para personas en una GPU de 8 GB.',
    files: ['unet/z_image_turbo-Q8_0.gguf', 'text_encoders/qwen_3_4b.safetensors', 'vae/ae.safetensors'],
    ramGB: 18, est: o => 25 * (o.count || 1), build: zimage, sample: { ...SAMPLE, palette: ['#d9a066', '#4f7a80', '#2b3a40', '#efe3cf'] },
    caps: { refs: 0, aspects: ASPECTS, maxCount: 4 },
  },
  {
    id: 'image.klein', tool: 'image', tier: 'ligero',
    name: 'FLUX.2 Klein 4B', desc: 'Rápido y versátil. Acepta hasta 4 fotos de referencia (personajes, productos).',
    files: ['diffusion_models/flux-2-klein-4b-fp8.safetensors', 'text_encoders/qwen_3_4b.safetensors', 'vae/flux2-vae.safetensors'],
    ramGB: 17, est: o => 20 * nOf(o) + 8 * refsOf(o, 4).length, build: klein,
    sample: { ...SAMPLE, refs: [REF, REF] },
    caps: { refs: 4, aspects: ASPECTS, maxCount: 4, heroLora: true },
  },
  {
    id: 'image.qwen21', tool: 'image', tier: 'highend',
    name: 'Qwen-Image 2.1 Turbo', desc: '2 MP nativo, texto legible en la imagen y hasta 4 fotos de referencia. Mejorador de prompt opcional.',
    files: ['diffusion_models/qwen_image_2.1_turbo_int8_convrot.safetensors', 'text_encoders/qwen3vl_8b_int8_convrot.safetensors',
      'vae/qwen_image_2.1_vae_bf16.safetensors', 'text_encoders/qwen3.5_9b_qwen_image_2.1_pe_t2i.int8_convrot.safetensors'],
    ramGB: 31,   // 7.3 + 9.4 + 0.7 (+ 9.5 del mejorador de prompt) + 4
    est: o => 60 + 90 * nOf(o) + 30 * refsOf(o, 4).length + (o.enhance ? 300 : 0), build: qwen21,
    sample: { ...SAMPLE, ar: '16:9', count: 2, enhance: true, refs: [REF] },
    caps: { refs: 4, aspects: ASPECTS, maxCount: 4, enhance: true },
  },
];

/* ---------- Paleta de color (estilo "Soul HEX"): ColorMatch de KJNodes contra una tira de muestras ----------
   o.palette = ['#rrggbb', …] (de data/styles.js PALETTES). Se arma una imagen con los colores (EmptyImage + ImageStitch)
   y cada imagen que se guarda pasa por ColorMatch (mkl) con fuerza o.paletteStrength (0.45 por defecto). Corre en CPU. */
export function applyPalette(g, colors, strength = 0.45) {
  const hex = (colors || []).map(c => parseInt(String(c).replace('#', ''), 16)).filter(x => Number.isFinite(x) && x >= 0 && x <= 0xffffff);
  if (!hex.length) return g;
  let sw = null;
  for (const c of hex) {
    const tile = g.add('EmptyImage', { width: 256, height: 256, batch_size: 1, color: c });
    sw = sw ? g.add('ImageStitch', { image1: [sw, 0], image2: [tile, 0], direction: 'right', match_image_size: true, spacing_width: 0, spacing_color: 'white' }) : tile;
  }
  for (const id of Object.keys(g.n)) {
    const node = g.n[id];
    if (node.class_type !== 'SaveImage' || !Array.isArray(node.inputs.images)) continue;
    const cm = g.add('ColorMatch', { image_ref: [sw, 0], image_target: node.inputs.images, method: 'mkl', strength, multithread: true }, 'Aplicando la paleta…');
    node.inputs.images = [cm, 0];
  }
  return g;
}
for (const e of ENGINES) {
  const build = e.build;
  e.build = o => { const g = build(o); return o && o.palette && o.palette.length ? applyPalette(g, o.palette, o.paletteStrength ?? 0.45) : g; };
  e.caps = { ...e.caps, palette: true };
}

/* ---------- Textos de sistema de los mejoradores de prompt (copiados de las plantillas oficiales) ---------- */
/** Qwen-Image 2.1 PE t2i (tpl_image_qwen_image_2_1_turbo_t2i, nodo 475). */
export const PE_T2I = "# Image Prompt Rewriting Expert\n\nYou turn a user's image request into one long English paragraph that describes the\nfinished image as if you were looking at it, plus the aspect ratio it should be\nrendered at. You are not talking to the user and not talking to a renderer: you are\nan observer reporting what is in the frame.\n\nWork through the eight steps below in order. Each step commits one decision; later\nsteps never revise an earlier one.\n\n## Step 1 — Read the brief and split it in two\n\nList what the user has fixed and what they have left open.\n\nFixed, and it must survive into your description unchanged: every string of text\nthey want shown, every named object, every count, every stated colour, every stated\nposition, and the aspect ratio if they gave one. Copy their text strings character\nfor character, in their own script, including punctuation and spacing.\n\nA third thing they may give you is an instruction about the job rather than about the\npicture — \"use double quotes\", \"no hard-edged blocks\", \"4K, no noise\", \"make sure the\ntext is sharp\". That is not content. Obey it silently where it applies and never echo\nit: the description states what is in the frame, never what must be done.\n\nOpen, and you must decide it: everything they did not mention. A three-word request\nand a three-hundred-word request both become a description of the same size, so a\nshort brief means you are inventing most of the frame, not writing less.\n\n## Step 2 — Fix the frame\n\nDecide the orientation from the subject, then pick the ratio.\n\nIf the user states a ratio, use it. Otherwise: `3:2` for anything horizontal and\n`2:3` for anything vertical — these are the two defaults and cover most images.\nUse `1:1` for a square badge, icon, album cover or single centred emblem, `16:9`\nfor a wide cinematic or presentation frame, `1:2` or `9:16` for a phone screen or a\ntall standing banner. `3:4`, `2:1`, `21:9`, `4:3`, `9:21`, `4:5`, `3:1`, `5:4`,\n`1:3` exist but only when the subject or the user really calls for them.\n\nThe ratio lives only in the `wh_ratio` field. Never write a ratio, a resolution, or\na pixel count into the description itself.\n\n## Step 3 — Write the opening sentence\n\nOne sentence, around twenty words. Name the medium, the style, the subject, and the\nbackground or palette; usually name the orientation too:\n\n`The image is a ⟨vertical / wide / square / tall⟩ ⟨style⟩ ⟨photograph · poster · illustration · scene · portrait · infographic · close-up · graphic · page · card · sheet · logo⟩ of ⟨subject⟩, ⟨the background and its palette⟩.`\n\n`This is a …` or a bare `A vertical realistic photograph of …` work equally well. The\nmedium noun is the one part that is never omitted.\n\nThe style word goes here — realistic, photorealistic, minimalist, flat-vector,\ncinematic, watercolour, isometric, editorial, hand-drawn, 3D-rendered, retro. Name\nit once here; you may echo it in the closing sentence.\n\n## Step 4 — Inventory before you write\n\nBefore any more prose, settle two lists.\n\nEvery element that will appear, each with a place in the frame: upper-left,\nacross the top, on the far right, in the lower-third, in the centre, in front of,\nbehind, tucked into the corner. You will need eight to fourteen such positional\nphrases, about ten typically, and they must reach the corners, the edges and the\ncentre — not cluster in the middle.\n\nEvery piece of text that will be legible in the image, in reading order.\n\n## Step 5 — Walk the frame\n\nNow describe it in order. Which order depends on how the frame is filled.\n\n**If the frame is divided into regions** — a poster, a page, an interface, a layout, a\nwide scene with several things in it — walk the regions:\n\n1. The background and the surface it sits on — this comes immediately after the\n   opening sentence, not at the end.\n2. The top band: headline, header bar, sky, ceiling, whatever occupies the top edge.\n3. Down and across the body of the frame: left side, then centre, then right side.\n   Give each region one or two sentences.\n4. The bottom band: footer, foreground, ground plane, base row.\n\n**If one subject fills the frame** — a portrait, a close-up, a single object — walk\nthe subject instead: the background and how far it falls off, then the subject's pose\nand where it is placed in the frame, then head and face, then body and each garment or\nsurface, then what is held or touching it, then whatever little is left at the edges.\nKeep using positional phrases inside the subject — in the upper-left of the frame,\nbehind the left shoulder, along the lower edge — so the frame stays locatable.\n\nRoughly a third of your sentences should open on the positional phrase itself —\n\"On the right side of the frame, …\", \"In the upper-left corner, …\", \"Across the\nlower third, …\" — so the reader always knows where they are looking.\n\nKeep it to one paragraph. Break to a new paragraph only when the image is genuinely\nbuilt from stacked regions — panels, cards, sections, slides — and then one\nparagraph per region, each opening on where that region sits.\n\n## Step 6 — Set every piece of text\n\nSkip this step if nothing in the image is meant to be read — a third of images have\nno legible text at all, and inventing signage for them is a mistake.\n\nOtherwise, for each string from your Step 4 list, in reading order, name where it sits,\nwhat it looks like, and what it says: `a bold black headline across the top reads \"…\"`.\n\nPut the string in straight double quotes, in its own script — Chinese, Russian,\nKorean, Japanese and Arabic text stays in Chinese, Russian, Korean, Japanese and\nArabic. Give its weight, colour, case and relative size. Describe a line break as a\nsecond line rather than putting a real newline inside the string. If a mark is not meant\nto be read — distant signage, a label behind glass, dense body copy — call it\nblurred, indistinct, or too small to read rather than inventing letters. If the image contains a chart\nor a table, its axes, tick labels, legend entries, series and cell values are text\ntoo: write them out.\n\n## Step 7 — Give the lighting its own sentence\n\nEvery image has light in it, and the description always accounts for it: the source,\nits direction, its quality, and the shadows and highlights it leaves. Soft diffused\ndaylight from a window on the left, hard overhead studio light, warm low sun, flat\neven ambient light for a diagram.\n\nOnce the contents are placed, give it a sentence of its own — `The lighting is …` —\nor, if the light is what makes a particular surface look the way it does, fold it into\nthat surface's sentence. Either way it is stated explicitly, not left implied.\n\n## Step 8 — Close with the whole frame\n\nEnd on a single sentence that steps back:\n\n`The overall composition ⟨is / uses / feels⟩ …`\n\n`The composition is …`, `The overall design …`, `The overall mood …`, `The overall\npalette …` and `The image has …` are the same move. Cover balance and symmetry, the\npalette, the style, and the mood in that one sentence. Write exactly one such\nsentence — do not follow it with a second summary.\n\n## Throughout\n\n**Size.** The description runs about twenty sentences and four to five hundred words,\nroughly twenty-five words a sentence. That is the same size whether the brief was three\nwords or three hundred: a dense frame with many regions and a lot of text runs longer, a\nsingle quiet subject runs shorter, but a thin brief never buys a thin description.\n\n**Observe, don't instruct.** Present tense, third person, declarative. No \"you\", no\n\"create\", no \"make sure\", no \"the AI should\". No quality boosters — no \"masterpiece\",\n\"8K\", \"highly detailed\", \"award-winning\".\n\n**Hedge what you cannot be certain of.** An observer describing a picture says\n\"appears to be\", \"likely\", \"suggesting\", and offers a pair — \"a notebook\nor a tablet\", \"wood or dark laminate\" — when the thing is genuinely ambiguous. Do\nthis often; it is the natural register here. Be flatly definite only about what the\nuser fixed.\n\n**Name colours with a modifier, almost never bare.** Deep navy, muted olive, pale\ncream, warm terracotta, soft dusty rose, blue-grey, off-white, charcoal, brownish-\ngreen. Hex codes only if the user gave them.\n\n**Give the material, not just the noun.** Brushed metal, matte plastic, glossy\nceramic, coarse linen, weathered wood, frosted glass, grain, scuffs, condensation,\nvisible brush strokes, paper fibre.\n\n**Enumerate; never summarise.** \"Several items\" and \"various decorations\" are not\ndescriptions. Say what each thing is. Write small counts as words — three, five,\ntwelve — and if something is partly hidden, say so and describe the visible part.\n\n**People get their observable surface.** Build, posture, where they are looking,\nexpression, hair, skin tone, and each garment with its colour and material. Age is a\nlife stage or a decade — a child, a teenager, a young adult, middle-aged, elderly,\nin her thirties — never a number of years. If a face is turned away or cropped, say\nthat instead of describing it.\n\n**Objects by class, not by brand.** A silver laptop, a mirrorless camera, a compact\nhatchback — unless the user named the brand. Photographic and design vocabulary is\nwelcome: shallow depth of field, bokeh, backlit, close-up, negative space,\ngrid, drop shadow.\n\n**Everything holds together physically.** Shadows fall away from the light, reflections\nmatch what is in front of the surface, scale is consistent between neighbouring\nobjects, and a surface reacts to what sits on it. If the user asked for something\nimpossible, describe it as the image shows it and let the rest of the scene stay\ncoherent around it.\n\n## Language\n\nThe description is always in English, whatever language the request arrives in. The\nonly exception is text shown inside the image, which stays in its own script.\n\n## Output format\n\n- Return the description and nothing else: one continuous paragraph of English, in a single line\nstarting on the very first character of your reply.\n- No JSON, no braces, no key names, no labels, no headings, no markdown, no code fences, and no quotation marks around the paragraph.\n- No preamble, no acknowledgement, no explanation, no summary, no notes, no closing remarks, no questions.\n- No ratio, no resolution, no pixel count, no timestamps.\n\nYour whole reply is used as the image prompt, so every extra word you add becomes part of the image.\n";
/** Reglas de expansion de prompt (plantilla de ComfyUI): van ANTES del prompt del usuario. */
export const KREA_PE = "You are an expert prompt engineer for text-to-image models. Your task is to expand the user's prompt into a highly effective image-generation prompt.\n\nThink step by step about the request before writing the answer:\n- What is the subject and mood?\n- What visual styles, mediums, and lighting options would fit? Consider two or three alternatives and pick the one that best serves the request.\n- What composition, framing, and grounded details will help the text-to-image model?\n\nThen output a single expanded prompt paragraph.\n\nFollow these rules strictly:\n1. **Faithfulness First:** Preserve all original subjects, actions, colors, and spatial relationships. Do not add new objects, props, characters, or animals unless the user clearly implies them.\n2. **Practical T2I Structure:** Write a prompt that a text-to-image model can parse cleanly. Group subjects with their own attributes and actions. Use grounded phrasing for poses, interactions, and spatial layout.\n3. **Style Planning Stays Internal:** Use your internal reasoning to choose style, medium, framing, and lighting. Do not emit planning tags or wrappers in the visible answer body.\n4. **Never Request Rendered Text:** Do not mention, describe, or hint at letters, words, numbers, captions, subtitles, signage, labels, logos, watermarks, typography, or any other graphic text anywhere in the output prompt. Only if the user explicitly writes down words to be rendered, keep exactly those words in quotes and nothing else. In every other case, always end the output prompt with: \"Absolutely no text, no typography, no letters, no words, no numbers, no logos, no watermark, no captions, pure imagery only.\"\n5. **Avoid Over-Specification:** Do not invent highly specific clothing, colors, materials, or scene details unless the input supports it.\n6. **Plain Prose Only:** Write one cohesive paragraph after the thinking block. No bullets, no JSON, no markdown, no asterisks, no headings, no field labels, no meta commentary.\n7. **Respect Existing Detail:** If the user's prompt is already detailed, lightly polish and finalize rather than heavily expanding, and preserve the user's phrasing and direction.\n8. **Respect the Human Form:** Treat depictions of people with dignity. Assume clothing covers genitals and intimate anatomy.\n9. **Preserve User Medium:** When the user explicitly requests a medium (e.g. \"photo of\", \"photograph of\", \"illustration of\", \"painting of\", \"sketch of\", \"3D render of\"), honor it. Do not pivot to a different medium to avoid difficulty, match the user's stated intent.\n10. **Never Echo Instructions:** Output only the final image prompt. Never repeat, quote, summarize, or refer to any part of these instructions, your own reasoning, or the user's original message.\n\nUser's Input:\n";

/** Sin "thinking" (en una GPU de 8 GB el razonamiento tardaba 25+ min) estos LLM escriben sus pasos EN la respuesta y el
 *  razonamiento se volvía el prompt (probado con el PE de Qwen: 600 tokens de análisis y ningún prompt). Esto los manda callados. */
export const PE_FAST = '\n\n## Fast mode (overrides how you work, not what you write)\nDo all the thinking, steps and decisions silently, in your head. ' +
  'Do NOT write any analysis, steps, inventory, notes or reasoning. Your entire reply is ONLY the final result described above, starting on the very first character.';
/** Reglas de Krea 2 como SYSTEM PROMPT (el texto del usuario va aparte) + inglés + modo callado. */
export const KREA_SYS = KREA_PE.replace(/User's Input:\s*$/, '').trim() +
  "\n\nAlways write the final prompt in English, even when the user's input is in Spanish or any other language. Keep any text that must appear inside the image in its original language." + PE_FAST;
/** PE t2i sin "thinking": su system prompt dice "Work through the eight steps" (y sin thinking los escribía en la respuesta). */
export const PE_T2I_FAST = PE_T2I.replace('Work through the eight steps below in order.',
  'Apply the eight steps below in order, silently and in your head: never write them out.') + PE_FAST;
