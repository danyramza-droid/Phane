// Botón "✍️ Mejorar prompt": manda el texto de una caja (kit.promptBox) a un LLM local (graphs/enhance.js,
// nodo nativo TextGenerate) y escribe el resultado (en inglés) de vuelta en la caja, con "↩️ Deshacer".
// Uso en una página:
//   import * as enhance from '../enhance_ui.js';
//   enhance.attach(prompt, 'video');                                  // kind: 'image' | 'video' | 'edit'
//   enhance.attach(pr, 'edit', { getImage: () => mainSlot.value });  // edición: el LLM ve tu imagen (High End)
import * as core from './core.js';
import * as kit from './kit.js';
import { missingFiles, RAM_CAP } from './engines.js';
import { enhanceEngineFor, textOfHistory } from './graphs/enhance.js';

const { h } = kit;
const waiting = new Map();   // job.id -> resolve(ok)
core.on('done', job => { const r = waiting.get(job.id); if (r) { waiting.delete(job.id); r(true); } });
core.on('queue', jobs => { for (const j of jobs) if (j.status === 'err' && waiting.has(j.id)) { const r = waiting.get(j.id); waiting.delete(j.id); r(false); } });

/** Limpia lo que devuelve el LLM: comillas, etiquetas tipo "Prompt:", markdown. */
export function cleanText(t) {
  let s = String(t || '').trim();
  s = s.replace(/^```[a-z]*\s*|\s*```$/gi, '').trim();
  s = s.replace(/^(?:\*\*)?(?:final\s+)?(?:enhanced\s+|expanded\s+|improved\s+)?(?:prompt|instruction|output)(?:\*\*)?\s*:\s*/i, '').trim();
  if (/^["“'].*["”']$/s.test(s)) s = s.slice(1, -1).trim();
  return s;
}

/** Motor que se usará para un tipo de texto (según el switch de poder y lo instalado). */
export function engineFor(kind) {
  return enhanceEngineFor(kind, core.state.tier, e => (e.ramGB > RAM_CAP ? ['ram'] : missingFiles(e, core.state.installed)));
}

/**
 * Crea el botón. promptBox = el elemento que devuelve kit.promptBox (o cualquier cosa con .value get/set).
 * opts: { getImage?: () => {ref,w,h}|null|Promise, label?, onDone?(newText, oldText) }
 */
export function button(promptBox, kind = 'image', { getImage, label = '✍️ Mejorar prompt', onDone } = {}) {
  let busy = false, undoText = null;
  const btn = h('button', { class: 'idea enh-btn', type: 'button' }, label);
  const undo = h('button', { class: 'idea enh-undo hide', type: 'button', title: 'Volver a tu texto original' }, '↩️ Deshacer');
  const wrap = h('span', { class: 'enh-wrap' }, btn, undo);
  const tip = () => {
    const e = engineFor(kind);
    btn.title = e ? `Convierte tu idea (en español está bien) en un prompt detallado en inglés con ${e.name}. ${kit.estimateText(e, { prompt: 'x', kind })}` : '';
  };
  btn.onmouseenter = tip;

  btn.onclick = async () => {
    if (busy) return;
    const text = promptBox.value;
    if (!text) { kit.toast('Escribe primero una idea corta y luego pulsa ✍️ Mejorar prompt.', 'err', 4000); promptBox.textarea?.focus(); return; }
    const e = engineFor(kind);
    const o = { prompt: text, kind };
    if (kind === 'edit' && getImage) { try { const im = await getImage(); if (im && im.ref) o.image = { ref: im.ref, w: im.w, h: im.h }; } catch { /* sin imagen */ } }
    busy = true; btn.disabled = true; btn.textContent = '⏳ Mejorando…';
    try {
      const job = await kit.generar(e, o, '✍️ Mejorar prompt');
      if (!job) return;
      const ok = await new Promise(res => waiting.set(job.id, res));
      if (!ok) return;
      let out = '';
      try { out = cleanText(textOfHistory((await core.getJSON('/history/' + job.id))[job.id])); } catch { /* */ }
      if (!out) { kit.toast('El asistente no devolvió texto. Intenta otra vez.', 'err'); return; }
      undoText = promptBox.value;
      promptBox.value = out;
      undo.classList.remove('hide');
      kit.toast('✍️ Prompt mejorado. Puedes editarlo o pulsar ↩️ Deshacer.', 'info', 4000);
      promptBox.textarea?.dispatchEvent(new Event('input', { bubbles: true }));
      onDone && onDone(out, undoText);
    } finally {
      busy = false; btn.disabled = false; btn.textContent = label;
    }
  };
  undo.onclick = () => {
    if (undoText == null) return;
    promptBox.value = undoText; undoText = null; undo.classList.add('hide');
    promptBox.textarea?.dispatchEvent(new Event('input', { bubbles: true }));
  };
  wrap.button = btn;
  return wrap;
}

/** Pone el botón dentro de la caja: en la fila de ideas si existe, si no en una fila nueva debajo del texto. */
export function attach(promptBox, kind = 'image', opts = {}) {
  const el = button(promptBox, kind, opts);
  let row = promptBox.querySelector && promptBox.querySelector('.ideas');
  if (!row) { row = h('div', { class: 'ideas' }); promptBox.append(row); }
  row.prepend(el);
  return el;
}
