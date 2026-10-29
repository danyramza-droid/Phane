// Motores para MEJORAR PROMPT (herramienta 'enhance'): un LLM local con el nodo nativo TextGenerate.
// El texto mejorado sale por PreviewAny (nodo de salida): queda en /history/<id> -> outputs[<nodo>].text[0].
// Lo usa web/js/enhance_ui.js (botón "✍️ Mejorar prompt" junto a la caja de texto).
//
// Opciones: { prompt (lo que escribió el usuario, cualquier idioma), kind:'image'|'video'|'edit', image?:{ref,w,h} (solo edit) }
// Combinaciones LLM + loader copiadas de plantillas oficiales (no inventadas):
//   - Qwen3-VL 4B fp8, CLIPLoader type 'krea2', instrucción antes del texto
//   - Qwen3.5 9B PE t2i, CLIPLoader 'stable_diffusion', system_prompt, thinking -> tpl_image_qwen_image_2_1_turbo_t2i
//   - Qwen3.5 9B PE i2i, CLIPLoader 'qwen_image', BatchImagesNode, thinking     -> tpl_image_qwen_image_2_1_turbo_image_edit
import { G, rnd } from '../lib/graph.js';
import { KREA_SYS, PE_T2I_FAST } from './image.js';
import { PE_I2I_FAST, unwrapPE } from './edit.js';
import { guardPE, lightTG, LIGHT_EDIT_SYS, SAMPLING_PE_FAST } from './pe_guard.js';

const ENGLISH = "Always write the final prompt in English, even when the user's input is in Spanish or any other language. Keep any text that must appear inside the image in its original language.\n\n";

/** Instrucciones para el LLM ligero (van ANTES del texto del usuario, como en la plantilla de Krea 2). */
const LIGHT_PE = {
  image: KREA_SYS,   // reglas de Krea 2 + inglés + modo callado (sin "thinking" escribía su razonamiento)
  video: `You are an expert prompt engineer for AI video models (Wan 2.2, LTX). Rewrite the user's idea into one effective video-generation prompt.

Rules:
1. Faithfulness first: keep every subject, action, color, count and relationship the user asked for. Do not add new characters, animals or objects unless clearly implied.
2. Describe the subject briefly (age range, clothing, hair, key features), then the action in present progressive tense ("is walking", "turns her head"), in chronological order with connectors like "as", "then", "while".
3. Describe the setting, lighting and mood with plain, concrete words (no exaggerated adjectives).
4. Camera: only describe camera movement if the user asked for it; otherwise say nothing about the camera.
5. One continuous paragraph of 60 to 120 words. No titles, lists, markdown, quotes, timestamps or scene cuts.
6. Output only the final prompt, nothing else. Never repeat these instructions.

${ENGLISH}User's Input:
`,
  edit: LIGHT_EDIT_SYS,   // en pe_guard.js: también es el respaldo del PE de edición
};

const userText = o => String(o.prompt || '').trim() || 'a cinematic photo';

/* ---------- Ligero: Qwen3-VL 4B fp8 (el text encoder de Krea 2, ~5 GB: cabe completo en 8 GB) ---------- */
// Las reglas van como SYSTEM PROMPT (probado: pegadas al mensaje del usuario, el 4B las repetía en vez de obedecerlas).
const lightSys = kind => LIGHT_PE[kind].replace(/User's Input:\s*$/, '').trim();
function light(o) {
  const g = G();
  const kind = LIGHT_PE[o.kind] ? o.kind : 'image';
  g.add('PreviewAny', { source: lightTG(g, userText(o), lightSys(kind)) });
  return g;
}

/* ---------- High End: Qwen3.5 9B PE t2i de Qwen-Image 2.1 (con razonamiento, como pide la plantilla) ---------- */
function peT2I(o) {
  const g = G();
  const pe = g.add('CLIPLoader', { clip_name: 'qwen3.5_9b_qwen_image_2.1_pe_t2i.int8_convrot.safetensors', type: 'stable_diffusion', device: 'default' }, 'Cargando el mejorador de prompt…');
  // sin "thinking" (25+ min en una GPU de 8 GB) + modo callado; si aun así razona/JSON, guardPE usa el 4B rápido (perezoso)
  const sys = g.add('PrimitiveStringMultiline', { value: PE_T2I_FAST });
  const tg = g.add('TextGenerate', { clip: [pe, 0], prompt: userText(o), max_length: 800, ...SAMPLING_PE_FAST,
    'sampling_mode.seed': rnd(), 'sampling_mode.presence_penalty': 1.5, thinking: false, use_default_template: true, mtp: 'auto',
    system_prompt: [sys, 0] }, 'Pensando y mejorando tu prompt…');
  g.add('PreviewAny', { source: guardPE(g, [tg, 0], lightTG(g, userText(o), lightSys('image'))) });
  return g;
}

/* ---------- High End: Qwen3.5 9B PE i2i (instrucciones de edición; mira la imagen si se da) ---------- */
function peI2I(o) {
  const g = G();
  const pe = g.add('CLIPLoader', { clip_name: 'qwen3.5_9b_qwen_image_2.1_pe_i2i.int8_convrot.safetensors', type: 'qwen_image', device: 'default' }, 'Cargando el mejorador de instrucciones…');
  const sys = g.add('PrimitiveStringMultiline', { value: PE_I2I_FAST });   // modo callado
  const kw = { clip: [pe, 0], prompt: userText(o), max_length: 800, ...SAMPLING_PE_FAST, 'sampling_mode.seed': rnd(),
    'sampling_mode.presence_penalty': 0, thinking: false, use_default_template: true, mtp: 'auto', system_prompt: [sys, 0] };
  if (o.image && o.image.ref) {
    const li = g.add('LoadImage', { image: o.image.ref });
    kw.image = [g.add('BatchImagesNode', { 'images.image0': [li, 0] }), 0];
  }
  const tg = g.add('TextGenerate', kw, 'Pensando y mejorando la instrucción…');
  // a veces responde JSON {"rewritten_prompt": …} (se desenvuelve) u otro formato/razonamiento (→ 4B rápido, perezoso)
  g.add('PreviewAny', { source: guardPE(g, unwrapPE(g, [tg, 0]), lightTG(g, userText(o), LIGHT_EDIT_SYS, 'Mejorando la instrucción…')) });
  return g;
}

const SAMPLE = { prompt: 'una chica con impermeable rojo caminando bajo la lluvia en Tokio de noche', kind: 'image' };

export const ENGINES = [
  {
    id: 'enhance.qwen3vl4b', tool: 'enhance', tier: 'ligero',
    name: 'Asistente rápido (Qwen3-VL 4B)', desc: 'Convierte tu idea (en español) en un prompt detallado en inglés. Sirve para imagen, video y edición.',
    files: ['text_encoders/qwen3vl_4b_fp8_scaled.safetensors'],
    ramGB: 9,     // 4.9 + 4
    est: o => (o.kind === 'video' ? 35 : 30), build: light, sample: { ...SAMPLE, kind: 'video' },
    caps: { kinds: ['image', 'video', 'edit'], internal: true },
  },
  {
    id: 'enhance.qwen_pe_t2i', tool: 'enhance', tier: 'highend',
    name: 'Mejorador de Qwen-Image 2.1 (imagen)', desc: 'El LLM entrenado para escribir prompts de imagen: piensa antes de escribir. Lento pero muy bueno.',
    files: ['text_encoders/qwen3.5_9b_qwen_image_2.1_pe_t2i.int8_convrot.safetensors'],
    ramGB: 13,    // 8.8 + 4
    est: () => 240, build: peT2I, sample: SAMPLE,   // medido con modo callado: 239 s
    caps: { kinds: ['image'], internal: true },
  },
  {
    id: 'enhance.qwen_pe_i2i', tool: 'enhance', tier: 'highend',
    name: 'Mejorador de Qwen-Image 2.1 (edición)', desc: 'Reescribe instrucciones de edición mirando tu imagen. Lento pero muy preciso.',
    files: ['text_encoders/qwen3.5_9b_qwen_image_2.1_pe_i2i.int8_convrot.safetensors'],
    ramGB: 13,
    est: o => 150 + (o.image ? 20 : 0), build: peI2I,   // medido con modo callado: 166 s con imagen
    sample: { prompt: 'ponle un sombrero vaquero y que sea de noche', kind: 'edit', image: { ref: 'example.png', w: 1024, h: 1024 } },
    caps: { kinds: ['edit'], internal: true },
  },
];

/** Motor de mejora para un tipo de texto según el switch de poder (prefiere instalados y que quepan en RAM). */
export function enhanceEngineFor(kind, tier, installedMissing) {
  const list = ENGINES.filter(e => e.caps.kinds.includes(kind));
  const ok = e => !installedMissing || !installedMissing(e).length;
  const order = tier === 'highend' ? ['highend', 'ligero'] : ['ligero', 'highend'];
  for (const t of order) { const e = list.find(x => x.tier === t && ok(x)); if (e) return e; }
  return list.find(x => x.tier === 'ligero') || list[0] || ENGINES[0];
}

/** Saca el texto de una entrada de /history (outputs de PreviewAny). */
export function textOfHistory(h) {
  for (const o of Object.values(h?.outputs || {})) {
    const t = o && o.text;
    if (Array.isArray(t) && t.length && typeof t[0] === 'string') return t[0];
    if (typeof t === 'string') return t;
  }
  return '';
}
