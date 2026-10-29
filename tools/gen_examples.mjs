// Generates example_workflows/*.json (ComfyUI canvas format) from Phane engines, so ComfyUI lists them in its
// template browser (Workflow > Browse Templates > phane). Pure Node, no GPU: it only builds the API graph with
// lib/graph.js (engine.build(engine.sample)) and lays it out using the node definitions from a running ComfyUI.
//
// Usage (from custom_nodes/phane):
//   node tools/gen_examples.mjs                       # starter-pack engines (models.json -> starter.engines)
//   node tools/gen_examples.mjs --ids image.klein video.wan
//   node tools/gen_examples.mjs --server http://127.0.0.1:8188 --out example_workflows
//   node tools/gen_examples.mjs --object-info object_info.json   # offline, from a saved /object_info dump
//   --engines <path to engines.js>   --rename Phane=Other  (look up node classes under another prefix)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };
const list = k => { const i = args.indexOf('--' + k); if (i < 0) return null; const out = []; for (let j = i + 1; j < args.length && !args[j].startsWith('--'); j++) out.push(args[j]); return out; };

const SERVER = opt('server') || 'http://127.0.0.1:8188';
const OUT = resolve(opt('out') || join(ROOT, 'example_workflows'));
const ENGINES_JS = resolve(opt('engines') || join(ROOT, 'web', 'js', 'engines.js'));
const [renFrom, renTo] = (opt('rename') || '').split('=');

const { ENGINES } = await import(pathToFileURL(ENGINES_JS).href);
let EN = {};   // English names for the note (the UI source is Spanish; i18n_en.js maps them)
try { EN = (await import(pathToFileURL(join(dirname(ENGINES_JS), 'data', 'i18n_en.js')).href)).EN || {}; } catch { /* optional */ }
const ids = list('ids') || JSON.parse(readFileSync(join(dirname(dirname(dirname(ENGINES_JS))), 'models.json'), 'utf8')).starter.engines;
const OI = opt('object-info') ? JSON.parse(readFileSync(opt('object-info'), 'utf8')) : await (await fetch(SERVER + '/object_info')).json();

const WIDGET_T = new Set(['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'COMBO']);
const defOf = cls => OI[cls] || (renFrom && cls.startsWith(renFrom) ? OI[renTo + cls.slice(renFrom.length)] : null);
const isLink = v => Array.isArray(v) && v.length === 2 && typeof v[0] === 'string' && Number.isInteger(v[1]);

/** Ordered list of [name, spec] (required, then optional), using input_order when the server gives it. */
function inputsOf(d) {
  const out = [];
  for (const sec of ['required', 'optional']) {
    const specs = d.input?.[sec] || {};
    const order = d.input_order?.[sec] || Object.keys(specs);
    for (const name of order) if (specs[name]) out.push([name, specs[name]]);
  }
  return out;
}
const typeOf = spec => (Array.isArray(spec[0]) ? 'COMBO' : spec[0]);
const isWidget = spec => (WIDGET_T.has(typeOf(spec)) || spec[1]?.socketless) && !spec[1]?.forceInput || typeOf(spec) === 'COMFY_DYNAMICCOMBO_V3';
function defaultOf(spec) {
  const t = typeOf(spec), o = spec[1] || {};
  if (o.default !== undefined) return o.default;
  if (t === 'COMBO') return (Array.isArray(spec[0]) ? spec[0] : o.options || [])[0] ?? '';
  return { INT: 0, FLOAT: 0, BOOLEAN: false }[t] ?? '';
}

function convert(api, note) {
  const nodes = [], links = [];
  const ids = Object.keys(api);
  const num = id => Number(id);
  // depth = longest path from a source node -> column
  const depth = {};
  const dep = (id, seen = new Set()) => {
    if (depth[id] != null) return depth[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    let d = 0;
    for (const v of Object.values(api[id].inputs || {})) if (isLink(v) && api[v[0]]) d = Math.max(d, dep(v[0], seen) + 1);
    return (depth[id] = d);
  };
  ids.forEach(id => dep(id));
  const order = [...ids].sort((a, b) => depth[a] - depth[b] || num(a) - num(b));

  const outSlots = {};   // id -> outputs[] (filled with links later)
  const colY = {};
  let linkId = 0;
  const pending = [];    // [toId, inputName, fromId, fromSlot]

  for (const [i, id] of order.entries()) {
    const n = api[id], d = defOf(n.class_type);
    if (!d) throw new Error(`node class not found on the server: ${n.class_type}`);
    const inputs = [], wv = [], wvDict = {};
    let widgets = 0;
    const pushW = (name, val) => { wv.push(val); wvDict[name] = val; widgets++; };
    const all = inputsOf(d);
    for (const [k, [name, spec]] of all.entries()) {
      const v = n.inputs?.[name];
      if (typeOf(spec) === 'COMFY_DYNAMICCOMBO_V3') {
        // value = chosen option key; then that option's own widgets, named "<combo>.<child>" (nested combos recurse)
        const dyn = (full, sp) => {
          const key = n.inputs?.[full] ?? sp[1]?.default ?? sp[1]?.options?.[0]?.key;
          pushW(full, key);
          const optDef = (sp[1]?.options || []).find(o => o.key === key);
          for (const [cn, cs] of inputsOf({ input: optDef?.inputs || {} })) {
            const sub = `${full}.${cn}`, cv = n.inputs?.[sub];
            if (typeOf(cs) === 'COMFY_DYNAMICCOMBO_V3') { dyn(sub, cs); continue; }
            if (isLink(cv)) { inputs.push({ name: sub, type: typeOf(cs), link: null, widget: { name: sub } }); pending.push([id, sub, cv[0], cv[1], inputs.length - 1]); }
            else if (!isWidget(cs)) { inputs.push({ name: sub, type: typeOf(cs), link: null }); continue; }
            if (isWidget(cs)) pushW(sub, isLink(cv) || cv === undefined ? defaultOf(cs) : cv);
          }
        };
        dyn(name, spec);
        continue;
      }
      if (isWidget(spec)) {
        const linked = isLink(v);
        if (linked) { inputs.push({ name, type: typeOf(spec), link: null, widget: { name } }); pending.push([id, name, v[0], v[1], inputs.length - 1]); }
        pushW(name, linked || v === undefined ? defaultOf(spec) : v);
        const cag = spec[1]?.control_after_generate ?? (typeOf(spec) === 'INT' && ['seed', 'noise_seed'].includes(name));
        if (cag) { wv.push('fixed'); wvDict.control_after_generate = 'fixed'; }
        if (spec[1]?.image_upload && k === all.length - 1) wv.push('image');
      } else {
        inputs.push({ name, type: typeOf(spec), link: null });
        if (isLink(v)) pending.push([id, name, v[0], v[1], inputs.length - 1]);
      }
    }
    const outTypes = d.output || [], outNames = d.output_name || outTypes;
    outSlots[id] = outTypes.map((t, s) => ({ name: outNames[s] || t, type: Array.isArray(t) ? 'COMBO' : t, links: [], slot_index: s }));
    const col = depth[id], h = 46 + 24 * (widgets + Math.max(inputs.filter(x => !x.widget).length, outTypes.length));
    const y = colY[col] ?? 80;
    colY[col] = y + h + 40;
    const node = {
      id: num(id), type: n.class_type, pos: [40 + col * 400, y], size: [340, h], flags: {}, order: i, mode: 0,
      inputs, outputs: outSlots[id], properties: { 'Node name for S&R': n.class_type },
      // VideoHelperSuite stores widget values by name
      widgets_values: n.class_type.startsWith('VHS_') ? wvDict : wv,
    };
    nodes.push(node);
  }
  for (const [to, name, from, slot, idx] of pending) {
    const src = outSlots[from]?.[slot];
    if (!src) throw new Error(`#${to}.${name}: link to missing output ${from}:${slot}`);
    const lid = ++linkId;
    src.links.push(lid);
    nodes.find(x => x.id === num(to)).inputs[idx].link = lid;
    links.push([lid, num(from), slot, num(to), idx, src.type]);
  }
  const lastId = Math.max(...nodes.map(x => x.id));
  nodes.push({ id: lastId + 1, type: 'Note', pos: [40, -260], size: [520, 220], flags: {}, order: nodes.length, mode: 0,
    inputs: [], outputs: [], properties: { text: '' }, widgets_values: [note], color: '#432', bgcolor: '#653' });
  return { last_node_id: lastId + 1, last_link_id: linkId, nodes, links, groups: [], config: {},
    extra: { ds: { scale: 0.75, offset: [0, 300] } }, version: 0.4 };
}

mkdirSync(OUT, { recursive: true });
let bad = 0;
for (const id of ids) {
  const e = ENGINES.find(x => x.id === id);
  if (!e) { console.log(`x ${id}: engine not found`); bad++; continue; }
  try {
    const g = e.build(e.sample || {});
    // stable files: fixed seeds instead of random ones
    for (const n of Object.values(g.n)) for (const k of ['seed', 'noise_seed']) if (typeof n.inputs?.[k] === 'number') n.inputs[k] = 42;
    const note = [`Phane example: ${e.id} (${EN[e.name] || e.name})`, '',
      'Built by Phane (custom_nodes/phane) from the same graph its web UI queues.',
      'Pick your own input image / video in the Load nodes, then Queue.', '',
      'Models (relative to ComfyUI/models):', ...(e.files || []).map(f => '  ' + f), '',
      'Download them with: python tools/download_models.py ' + e.id].join('\n');
    const wf = convert(g.n, note);
    const file = join(OUT, 'phane_' + e.id.replace(/\./g, '_') + '.json');
    writeFileSync(file, JSON.stringify(wf, null, 1) + '\n');
    console.log(`ok ${e.id}: ${wf.nodes.length - 1} nodes, ${wf.links.length} links -> ${file}`);
  } catch (err) { bad++; console.log(`x ${e.id}: ${err.message}`); }
}
process.exit(bad ? 1 : 0);
