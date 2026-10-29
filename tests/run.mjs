// Prueba REAL en la GPU: arma cada motor (sample + entradas reales), lo encola, espera y mide
// tiempo, RAM pico, salidas, cuadros negros y errores. Uno a la vez (no satura la PC).
// Uso: node tests/run.mjs id1 id2 ... [--opts '{"quality":"draft"}']   (sin ids: todos los instalados)
//      Resultado acumulado en tests/out/run_results.json
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINES, missingFiles } from '../web/js/engines.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const U = process.env.PHANE_URL || 'http://127.0.0.1:8188';   // otro ComfyUI: PHANE_URL=http://127.0.0.1:8190
const OUT = 'ComfyUI\\output';
const args = process.argv.slice(2);
const oi = args.indexOf('--opts');
const optArg = oi >= 0 ? args.splice(oi, 2)[1] : null;            // JSON en línea, o @archivo.json
const extra = optArg ? JSON.parse(optArg.startsWith('@') ? readFileSync(optArg.slice(1), 'utf8') : optArg) : {};
const ids = args;

// Entradas reales para las pruebas
const IMG = { ref: 'ejemplo/start_00002_.png [output]', w: 1216, h: 832, kind: 'img', filename: 'start_00002_.png', subfolder: 'ejemplo', type: 'output', abs: OUT + '\\ejemplo\\start_00002_.png' };
const FACE = { ref: 'zimgtest/z_00004_.png [output]', w: 1024, h: 1024, kind: 'img', filename: 'z_00004_.png', subfolder: 'zimgtest', type: 'output', abs: OUT + '\\zimgtest\\z_00004_.png' };
const VID = { abs: OUT + '\\estudio\\video_00008.mp4', kind: 'vid', filename: 'video_00008.mp4', subfolder: 'estudio', type: 'output', ref: 'estudio/video_00008.mp4 [output]', fps: 32, frames: 97, secs: 3, w: 272, h: 480, hasAudio: false };
const AUD = { ref: 'estudio/voz_00001.mp3 [output]', abs: OUT + '\\estudio\\voz_00001.mp3', kind: 'aud', filename: 'voz_00001.mp3', subfolder: 'estudio', type: 'output' };

function realize(v, key = '') {
  if (Array.isArray(v)) return v.map((x, i) => realize(x, key));
  if (v && typeof v === 'object') {
    const isAud = /\.(mp3|wav|flac|ogg)/i.test(v.ref || v.abs || v.filename || '') || /voice|audio/i.test(key);
    const isVid = v.kind === 'vid' || /\.(mp4|webm|mov)/i.test(v.ref || v.abs || v.filename || '') || (/video/i.test(key) && !v.w);
    if ('ref' in v || 'abs' in v) {
      if (isAud) return { ...AUD };
      if (isVid) return { ...VID };
      return /face|character|person/i.test(key) ? { ...FACE } : { ...IMG };
    }
    const o = {}; for (const [k, x] of Object.entries(v)) o[k] = realize(x, k); return o;
  }
  return v;
}

async function j(url, init) { const r = await fetch(U + url, init); const t = await r.text(); try { return { ok: r.ok, body: JSON.parse(t) }; } catch { return { ok: r.ok, body: t }; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));

const installed = (await j('/phane/api/modelos')).body;
let list = ids.length ? ENGINES.filter(e => ids.includes(e.id)) : ENGINES.filter(e => !missingFiles(e, installed).length);
const resFile = join(HERE, 'out', 'run_results.json'); mkdirSync(join(HERE, 'out'), { recursive: true });
const results = existsSync(resFile) ? JSON.parse(readFileSync(resFile, 'utf8')) : {};

for (const e of list) {
  const miss = missingFiles(e, installed);
  if (miss.length) { console.log(`- ${e.id}: SALTADO, faltan ${miss.join(', ')}`); continue; }
  const o = { ...realize(e.sample || {}), ...extra };
  let g; try { g = e.build(o); } catch (err) { console.log(`✗ ${e.id}: build lanzó ${err.message}`); results[e.id] = { ok: false, error: 'build: ' + err.message }; continue; }
  if (e.tier !== 'ligero' || e.ramGB >= 28) { await j('/free', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ unload_models: true, free_memory: true }) }); await sleep(4000); }
  const sub = await j('/prompt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: g.n }) });
  if (!sub.ok) {
    const ne = sub.body.node_errors ? Object.values(sub.body.node_errors).map(x => `${x.class_type}: ${(x.errors || []).map(y => y.details || y.message).join('; ')}`).join(' | ') : JSON.stringify(sub.body.error);
    console.log(`✗ ${e.id}: RECHAZADO ${ne}`); results[e.id] = { ok: false, error: 'rechazado: ' + ne }; continue;
  }
  const pid = sub.body.prompt_id, t0 = Date.now(); let peak = 0, h = null;
  const s0 = (await j('/phane/api/sistema')).body; const base = s0 && s0.ram_total ? s0.ram_total - s0.ram_libre : 0;
  process.stdout.write(`… ${e.id} [${e.tier}] (est ${Math.round(e.est(o))} s) `);
  while (true) {
    await sleep(3000);
    const s = (await j('/phane/api/sistema')).body; if (s && s.ram_total) peak = Math.max(peak, s.ram_total - s.ram_libre);
    const hist = (await j('/history/' + pid)).body; if (hist && hist[pid]) { h = hist[pid]; break; }
  }
  const secs = (Date.now() - t0) / 1000, st = h.status || {};
  const err = (st.messages || []).find(m => m[0] === 'execution_error');
  const outs = [];
  for (const out of Object.values(h.outputs || {})) for (const k of ['images', 'gifs', 'videos', 'audio', 'text']) for (const f of (out[k] || [])) {
    if (typeof f === 'string') outs.push({ kind: 'text', text: f.slice(0, 300) }); else if (f.type !== 'temp') outs.push({ kind: k, file: `${f.subfolder ? f.subfolder + '/' : ''}${f.filename}` });
  }
  let black = null;
  const vid = outs.find(x => x.kind === 'gifs' || x.kind === 'videos');
  if (vid) black = (await j('/phane/api/negros?path=' + encodeURIComponent(vid.file))).body;
  const r = { ok: st.status_str === 'success', secs: Math.round(secs), est: Math.round(e.est(o)), peakRamGB: +peak.toFixed(1), addedRamGB: +(peak - base).toFixed(1), declaredRamGB: e.ramGB, outputs: outs, black,
    error: err ? `${err[1].node_type}: ${String(err[1].exception_message).slice(0, 400)}` : null };
  results[e.id] = r; writeFileSync(resFile, JSON.stringify(results, null, 1));
  console.log(`${r.ok ? '✓' : '✗'} ${Math.round(secs)} s · RAM pico ${r.peakRamGB} GB (+${r.addedRamGB} sobre la base; declarada ${e.ramGB})` +
    (black && black.cuadros ? ` · negros ${black.negros}/${black.cuadros}` : '') + (r.error ? ` · ERROR ${r.error}` : '') +
    (outs.length ? ` · ${outs.map(x => x.file || ('"' + x.text + '"')).join(', ')}` : ''));
}
console.log('FIN');
