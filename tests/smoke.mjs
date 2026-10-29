// Prueba de humo (28-oct): cada motor del STARTER con entrada mínima (borrador, lo más corto), uno a la vez, usando la
// misma maquinaria de tests/run.mjs (encola, espera, mide tiempo/RAM/negros). ~25 min en una GPU de 8 GB.
// Uso (con la cola de ComfyUI VACÍA y nada más usando la GPU):  node tests/smoke.mjs [--dry]
//   --dry   solo imprime qué correría y con qué opciones (no encola nada)
// Resultado: tests/out/run_results.json (lo escribe run.mjs) + resumen al final.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DRY = process.argv.includes('--dry');

// Motores del starter (models.json "starter"; mismo orden que la ruta del demo) y su entrada mínima.
// Lo que no se pone aquí lo toma run.mjs del `sample` del motor (con imagen/video/audio reales de prueba).
const STARTER = [
  ['motion.kimodo', { secs: 2, newText: false }],
  ['motion.kimodo_frame', {}],
  ['pose.foto_maniqui', {}],
  ['image.klein', { count: 1 }],
  ['image.pose_klein', {}],
  ['image.pose_anypose', {}],
  ['image.pose_maniqui', { turbo: true }],   // 29-oct: entra al starter
  ['video.wan', { mode: 'i2v', secs: 2, quality: 'draft', boost: false, loras: [] }],
  ['recast.animate2_fast', { quality: 'draft' }],
  ['upscale.seedvr2_7b', {}],
];

const leer = () => { try { return JSON.parse(readFileSync(join(HERE, 'out', 'run_results.json'), 'utf8')); } catch { return {}; } };
const res = {};   // solo lo que corrió EN ESTA pasada (run_results.json acumula pasadas viejas)
for (const [id, opts] of STARTER) {
  const args = [join(HERE, 'run.mjs'), id, '--opts', JSON.stringify(opts)];
  if (DRY) { console.log(`(dry) node tests/run.mjs ${id} --opts '${JSON.stringify(opts)}'`); continue; }
  const antes = JSON.stringify(leer()[id] || null);
  spawnSync(process.execPath, args, { stdio: 'inherit' });
  const x = leer()[id];
  res[id] = x && JSON.stringify(x) !== antes ? x : { ok: false, error: 'no corrió (¿faltan modelos? ver arriba)' };
}
if (!DRY) {
  const bad = STARTER.filter(([id]) => !res[id].ok);
  console.log('\n— Humo del starter —');
  for (const [id] of STARTER) { const x = res[id]; console.log(`${x.ok ? '✓' : '✗'} ${id}${x.secs ? ` · ${x.secs} s (est ${x.est})` : ''}${x.error ? ' · ' + x.error : ''}`); }
  console.log(`${STARTER.length - bad.length}/${STARTER.length} bien`);
  process.exit(bad.length ? 1 : 0);
}
