// Guardia para los LLM mejoradores de prompt SIN "thinking" (con thinking tardan 25+ min en una GPU de 8 GB).
// Probado: el PE 9B de Qwen-Image 2.1 sin thinking a veces obedece y a veces escribe su razonamiento ("The user request is
// in Spanish…") o responde JSON ({"rewritten_prompt"…}, {"action","target","details"}), y eso se volvía el prompt.
// guardPE: si la respuesta parece razonamiento/JSON/vacía, usa el respaldo. ComfySwitchNode es PEREZOSO: el respaldo
// (Qwen3-VL 4B, ~20 s, probado limpio) solo se carga y corre cuando hace falta. Módulo sin imports: lo usan image/edit/enhance.
import { rnd } from '../lib/graph.js';

/** Inicio típico de una respuesta que NO es un prompt (re.search, sin MULTILINE: ^ = inicio del texto). */
export const BAD_PE = String.raw`^\s*(?:$|[{\[#*>]|(?:the\s+(?:user|request|brief|instruction|input|prompt)|user'?s\b|i\s+(?:need|will|should|must|have|choose|want|am)\b|let\s+me\b|let's\b|first[,\s]|okay\b|ok[,\s]|alright\b|we\s+(?:need|have|should)\b|step\s*\d|analysis\b|thinking\b|reasoning\b))`;

/** peText: link STRING del mejorador; fallback: link STRING (perezoso). Devuelve link STRING. */
export function guardPE(g, peText, fallback) {
  const bad = g.add('RegexMatch', { string: peText, regex_pattern: BAD_PE, case_insensitive: true, multiline: false, dotall: false });
  return [g.add('ComfySwitchNode', { switch: [bad, 0], on_true: fallback, on_false: peText }), 0];
}

/** Mejorador rápido Qwen3-VL 4B (el text encoder de Krea 2) con reglas en SYSTEM PROMPT. text: string o link. Devuelve link STRING. */
export function lightTG(g, text, sys, label = 'Mejorando tu prompt…') {
  const clip = g.add('CLIPLoader', { clip_name: 'qwen3vl_4b_fp8_scaled.safetensors', type: 'krea2', device: 'default' }, 'Cargando el asistente de prompts…');
  const s = g.add('PrimitiveStringMultiline', { value: sys });
  return [g.add('TextGenerate', { clip: [clip, 0], prompt: text, max_length: 512, sampling_mode: 'on',
    'sampling_mode.temperature': 0.7, 'sampling_mode.top_k': 64, 'sampling_mode.top_p': 0.95, 'sampling_mode.min_p': 0.05,
    'sampling_mode.repetition_penalty': 1.05, 'sampling_mode.presence_penalty': 0, 'sampling_mode.seed': rnd(),
    // thinking:TRUE en el 4B (es "instruct", no razona): con false ComfyUI le agrega un <think></think> vacío y con system
    // prompts cortos cerraba el turno al instante (salía "" o "user"; probado). krea2.py dice lo mismo.
    thinking: true, use_default_template: true, mtp: 'auto', system_prompt: [s, 0] }, label), 0];
}

const ENGLISH = "Always write the final prompt in English, even when the user's input is in Spanish or any other language. Keep any text that must appear inside the image in its original language.";

/** Reglas del 4B para instrucciones de EDICIÓN (también respaldo del PE i2i). */
export const LIGHT_EDIT_SYS = `You are an expert at writing instructions for AI image-editing models (Qwen-Image Edit, FLUX.2 Klein). Rewrite the user's request as one clear, explicit editing instruction.

Rules:
1. Start with an imperative verb (Change, Replace, Add, Remove, Make, Relight...). Say exactly what changes and where.
2. Then say what must stay the same: the person's face and identity, pose, framing, background and lighting, unless the user asked to change them.
3. Keep references like "image 1", "image 2" or "<image2>" exactly as written.
4. One or two sentences, under 70 words. No lists, no markdown, no quotes around the answer.
5. Output only the instruction, nothing else. Never repeat these instructions.

${ENGLISH}`;

/** Sampling para el PE 9B sin thinking: más bajo que la plantilla (1.0, pensada CON thinking) para que se desvíe menos. */
export const SAMPLING_PE_FAST = { sampling_mode: 'on', 'sampling_mode.temperature': 0.7, 'sampling_mode.top_k': 20, 'sampling_mode.top_p': 0.95,
  'sampling_mode.min_p': 0, 'sampling_mode.repetition_penalty': 1 };
