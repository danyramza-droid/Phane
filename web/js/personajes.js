// Personajes (estilo Soul ID): un nombre + 1..4 fotos de referencia que se reutilizan en
// Imagen, Editar, Avatares y Storyboard. Se guardan en ComfyUI/user/high_end/personajes.json.
// Cada foto: { ref, url, w, h, filename, subfolder, type }  (lo que devuelve core.upload / core.asInput)
// Opcional: desc = 'descripción del diseño en inglés' (la usa la pose exacta) y una foto llamada *diseno* (cuerpo completo, sin armas).
// Opcional: lora = { file, trigger, cls, strength } — LoRA entrenada del personaje (FLUX.2 Klein 4B). Con ella los motores
// con caps.heroLora lo pintan desde su LoRA (prompt corto "trigger, clase, escena") en vez de copiarlo de las fotos.
import * as core from './core.js';
import { h, toast } from './kit.js';

let cache = null;
export async function list() {
  if (!cache) { try { cache = await core.getJSON('/phane/api/personajes'); } catch { cache = []; } }
  return cache;
}
export async function save(all) {
  cache = all;
  await fetch('/phane/api/personajes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(all) });
  core.emit('personajes', all);
}
/** Crea o reemplaza un personaje por nombre. */
export async function upsert(p) {
  const all = await list();
  const i = all.findIndex(x => x.name.toLowerCase() === p.name.toLowerCase());
  if (i >= 0) all[i] = { ...all[i], ...p }; else all.push({ id: 'p' + Date.now(), ...p });
  await save(all);
  return all;
}
export async function remove(id) { await save((await list()).filter(p => p.id !== id)); }

/** o.heroLora listo para el grafo, o null si el personaje no tiene LoRA o su archivo no está instalado. */
export function heroLora(p) {
  const L = p && p.lora;
  const name = L && L.file && core.loraName(L.file);
  return name ? { name, trigger: L.trigger, cls: L.cls || '', strength: L.strength ?? 0.9 } : null;
}
/** true si el personaje declara LoRA pero su archivo no aparece en models/loras. */
export const loraMissing = p => !!(p && p.lora && p.lora.file && !heroLora(p));

/**
 * Selector compacto de personaje para cualquier página.
 * onPick(personaje|null) se llama al elegir. El personaje trae .photos (array de fotos).
 */
export function picker({ onPick, label = '👤 Personaje', value = null } = {}) {
  const sel = h('select', { class: 'pj-select' });
  const el = h('div', { class: 'row pj' }, h('span', { class: 'engine-lbl' }, label), sel);
  const draw = async () => {
    const all = await list();
    const cur = value || sel.value; value = null;   // value: id a preseleccionar la primera vez
    sel.innerHTML = '';
    sel.append(h('option', { value: '' }, '— ninguno —'));
    for (const p of all) {
      const n = (p.photos || []).length;
      sel.append(h('option', { value: p.id }, `${p.name} (${n} foto${n === 1 ? '' : 's'})`));
    }
    sel.value = all.some(p => p.id === cur) ? cur : '';
  };
  sel.onchange = async () => { const p = (await list()).find(x => x.id === sel.value) || null; onPick && onPick(p); };
  core.on('personajes', draw);
  draw();
  Object.defineProperty(el, 'value', { get: () => (cache || []).find(x => x.id === sel.value) || null });
  return el;
}

/** Diálogo rápido para guardar fotos (de casillas) como personaje. photos: array de fotos. */
export async function saveFromPhotos(photos) {
  photos = photos.filter(Boolean);
  if (!photos.length) return toast('Primero pon al menos una foto de la persona.', 'err');
  const name = prompt('Nombre del personaje (ej. "Ana", "Mi personaje"):');
  if (!name) return;
  await upsert({ name: name.trim(), photos: photos.map(({ ref, url, w, h: hh, filename, subfolder, type }) => ({ ref, url, w, h: hh, filename, subfolder, type })) });
  toast(`👤 Personaje "${name}" guardado. Ya puedes elegirlo en Imagen, Editar, Avatares y Storyboard.`);
}
