// Valida los motores de Phane contra el ComfyUI en marcha (sin ejecutarlos).
// Uso:  node tests/validate.mjs [--tool video] [--id video.wan_he] [--file graphs/video.js] [--dump]
//   --dump   escribe el grafo API de cada motor en tests/out/<id>.json
// Revisa: clases existentes, inputs requeridos, links (nodo, índice y tipo), opciones de combos, rangos INT/FLOAT,
//         archivos de modelo declarados en `files` y nombres de modelo usados en el grafo.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const URL0 = process.env.PHANE_URL || 'http://127.0.0.1:8188';   // otro ComfyUI: PHANE_URL=http://127.0.0.1:8190
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true) : null; };

const mod = opt('file') ? await import('../web/js/' + opt('file')) : await import('../web/js/engines.js');
let engines = mod.ENGINES;
if (opt('tool')) engines = engines.filter(e => e.tool === opt('tool'));
if (opt('id')) engines = engines.filter(e => e.id === opt('id'));

const oi = await (await fetch(URL0 + '/object_info')).json();
const installed = await (await fetch(URL0 + '/phane/api/modelos')).json();
const instLower = Object.keys(installed).map(p => p.toLowerCase());
const MODEL_RE = /\.(safetensors|gguf|pth|pt|ckpt|bin)$/i;
const SKIP_ENUM = new Set(['LoadImage.image', 'LoadAudio.audio', 'LoadVideo.file', 'VHS_LoadVideo.video']);

function specOf(cls, name) {
  const s = oi[cls]?.input || {};
  return s.required?.[name] || s.optional?.[name] || s.hidden?.[name] || null;
}
function optionsOf(def) {
  if (!def) return null;
  if (Array.isArray(def[0])) return def[0];
  if (def[0] === 'COMBO' && def[1]?.options) return def[1].options.map(o => (typeof o === 'object' ? o.key ?? o : o));
  return null;
}
const isLink = v => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && Number.isInteger(v[1]);

function validate(n) {
  const errors = [], warns = [], missing = new Set();
  for (const [id, node] of Object.entries(n)) {
    const cls = node.class_type, spec = oi[cls];
    if (!spec) { errors.push(`#${id} clase inexistente: ${cls}`); continue; }
    const inputs = node.inputs || {};
    for (const [name, def] of Object.entries(spec.input?.required || {})) {
      if (def[0] === 'COMFY_AUTOGROW_V3') continue;            // lista que crece (images.image_N): 0 elementos es válido
      if (!(name in inputs)) errors.push(`#${id} ${cls}: falta input requerido "${name}"`);
    }
    for (const [name, v] of Object.entries(inputs)) {
      const base = name.split('.')[0];
      let def = specOf(cls, name) || specOf(cls, base);
      if (def && def[0] === 'COMFY_AUTOGROW_V3') { const t = def[1]?.template?.input?.required; def = t ? Object.values(t)[0] : def; }
      if (!def) {
        const vhsFmt = cls === 'VHS_VideoCombine' && ['pix_fmt', 'crf', 'save_metadata', 'trim_to_audio'].includes(name);
        if (!name.includes('.') && !vhsFmt) warns.push(`#${id} ${cls}: input desconocido "${name}"`);
        continue;
      }
      if (isLink(v)) {
        const src = n[v[0]];
        if (!src) { errors.push(`#${id} ${cls}.${name}: link a nodo inexistente #${v[0]}`); continue; }
        const outs = oi[src.class_type]?.output || [];
        if (v[1] >= outs.length) { errors.push(`#${id} ${cls}.${name}: salida ${v[1]} no existe en ${src.class_type} (tiene ${outs.length})`); continue; }
        // COMFY_MATCHTYPE_V3 (ComfySwitchNode…): toma el tipo de lo que le conectan → comodín en ambos lados
        const MATCH = 'COMFY_MATCHTYPE_V3';
        const outT = outs[v[1]] === MATCH ? '*' : outs[v[1]], inT = Array.isArray(def[0]) ? 'COMBO' : def[0] === MATCH ? '*' : def[0];
        // tipos pueden venir como lista "A,B" en la salida o en la entrada (p. ej. BBOX,BOUNDING_BOX de KJNodes)
        if (typeof inT === 'string' && inT !== '*' && outT !== '*' && !String(outT).split(',').some(t => inT.split(',').includes(t))
            && !(['INT', 'FLOAT'].includes(inT) && ['INT', 'FLOAT'].includes(outT)) && !(inT === 'COMBO')) {
          errors.push(`#${id} ${cls}.${name}: tipo ${outT} (de ${src.class_type}) no encaja con ${inT}`);
        }
        continue;
      }
      const opts = optionsOf(def);
      if (opts && opts.length && !SKIP_ENUM.has(`${cls}.${name}`)) {
        if (!opts.map(String).includes(String(v))) {
          if (typeof v === 'string' && MODEL_RE.test(v)) {
            const leaf = v.replace(/\\/g, '/').toLowerCase();
            if (instLower.some(p => p.endsWith('/' + leaf) || p === leaf)) warns.push(`#${id} ${cls}.${name}: "${v}" existe en disco pero el servidor no lo lista (¿reiniciar ComfyUI?)`);
            else missing.add(v);
          } else errors.push(`#${id} ${cls}.${name}: valor "${v}" no está en las opciones (${opts.slice(0, 8).join(', ')}${opts.length > 8 ? '…' : ''})`);
        }
      } else if (opts && !opts.length && typeof v === 'string' && MODEL_RE.test(v)) {
        const leaf = v.replace(/\\/g, '/').toLowerCase();
        if (!instLower.some(p => p.endsWith('/' + leaf) || p === leaf)) missing.add(v);
      }
      if ((def[0] === 'INT' || def[0] === 'FLOAT') && typeof v === 'number' && def[1]) {
        if (def[1].min != null && v < def[1].min) errors.push(`#${id} ${cls}.${name}: ${v} < min ${def[1].min}`);
        if (def[1].max != null && v > def[1].max) errors.push(`#${id} ${cls}.${name}: ${v} > max ${def[1].max}`);
      }
    }
  }
  return { errors, warns, missing: [...missing] };
}

let bad = 0;
if (opt('dump')) mkdirSync(join(HERE, 'out'), { recursive: true });
for (const e of engines) {
  let g;
  try { g = e.build(e.sample || {}); } catch (err) { bad++; console.log(`✗ ${e.id}: build() lanzó: ${err.stack || err}`); continue; }
  const r = validate(g.n);
  const declMissing = (e.files || []).filter(f => !(f.toLowerCase() in Object.fromEntries(instLower.map(x => [x, 1]))));
  const missAll = [...new Set([...r.missing, ...declMissing.map(f => f.split('/').pop())])];
  const undeclared = r.missing.filter(m => !(e.files || []).some(f => f.toLowerCase().endsWith(m.toLowerCase().replace(/\\/g, '/'))));
  if (opt('dump')) writeFileSync(join(HERE, 'out', e.id + '.json'), JSON.stringify(g.n, null, 1));
  const ok = !r.errors.length;
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${e.id} [${e.tier}] ${Object.keys(g.n).length} nodos` +
    (missAll.length ? ` · modelos faltantes (descarga en curso?): ${missAll.join(', ')}` : '') +
    (undeclared.length ? ` · ⚠ modelos usados pero NO declarados en files: ${undeclared.join(', ')}` : ''));
  for (const x of r.errors) console.log('    ERROR ' + x);
  for (const x of r.warns) console.log('    aviso ' + x);
  if (!e.files || !e.files.length) console.log('    aviso: el motor no declara files');
  if (typeof e.ramGB !== 'number') console.log('    ERROR: falta ramGB'), bad++;
  if (typeof e.est !== 'function') console.log('    ERROR: falta est(o)'), bad++;
  // variante con LoRA de personaje (caps.heroLora): usa una LoRA instalada de verdad (una LoRA de personaje si existe)
  if (e.caps?.heroLora) {
    const loras = optionsOf(oi.LoraLoaderModelOnly?.input?.required?.lora_name || []) || [];
    const name = loras.find(x => /_v2_|hero/.test(x)) || loras[0];
    if (!name) { console.log('    aviso: sin LoRAs instaladas para probar heroLora'); continue; }
    const gh = e.build({ ...(e.sample || {}), heroLora: { name, trigger: 'skstest', cls: 'a test hero', strength: 0.9 } });
    const rh = validate(gh.n);
    const txt = Object.values(gh.n).filter(n => n.class_type === 'CLIPTextEncode').map(n => n.inputs.text).filter(t => String(t).trim());   // negativos vacíos no cuentan
    const errs = [...rh.errors];
    if (!Object.values(gh.n).some(n => n.class_type === 'LoraLoaderModelOnly')) errs.push('no agregó LoraLoaderModelOnly');
    if (!txt.length || !txt.every(t => String(t).startsWith('skstest, a test hero, '))) errs.push('el prompt no empieza con "trigger, clase,"');
    if (errs.length) bad++;
    console.log(`  ${errs.length ? '✗' : '✓'} + heroLora (${name})`);
    for (const x of errs) console.log('    ERROR ' + x);
  }
}
console.log(`\n${engines.length} motores · ${bad} con errores`);
process.exit(bad ? 1 : 0);
