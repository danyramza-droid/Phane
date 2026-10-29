// MOVIMIENTO POR TEXTO (tool 'motion'): NVIDIA Kimodo, texto → animación 3D de cuerpo completo (30 fps, hasta 10 s por acción).
// Corre en su propio venv (custom_nodes/phane/kimodo) vía los nodos PhaneKimodo* de kimodo_node.py. Salidas en output/phane/kimodo/:
//   <nombre>_maniqui.mp4    maniquí 3D (malla SOMA) → 🎭 Recast lo usa como el video del movimiento
//   <nombre>_esqueleto.mp4  esqueleto estilo SDPose del clip completo (📸 Capturar / 🎯 Pose de este cuadro)
//   <nombre>_esqueleto_fNNN.png  poses clave → 🧍 Copiar su pose (image.pose las usa SIN SDPose: graphs/pose.js isSkeleton)
//   <nombre>.bvh (T-pose de reposo, para el juego) · <nombre>.npz (formato Kimodo) · <nombre>.json (tiempos, VRAM)
// Medido en una GPU de 8 GB: 5 s de movimiento en 6 s, 1.1 GB de VRAM; dibujar ~4 s por segundo de animación. La 1.ª vez que se usa un
// prompt, Llama-3-8B (LLM2Vec) lo lee en la CPU (~16 GB de RAM); después queda en caché.
import { G } from '../lib/graph.js';

/** Vistas de cámara (nombres del nodo). La cámara mira al personaje desde el frente de su dirección INICIAL. */
export const VISTAS = [
  ['frente', 'De frente'], ['tres_cuartos_izq', '¾ izquierda'], ['tres_cuartos_der', '¾ derecha'],
  ['lado_izq', 'De lado'], ['espalda', 'De espaldas'],
];
export const MOTION_FPS = 30;

/** Nombre del movimiento a partir de cualquiera de sus archivos (o null si no es de Kimodo). */
export function motionName(f) {
  if (!f || !/(^|\/)phane\/kimodo$/.test(String(f.subfolder || '').replace(/\\/g, '/'))) return null;
  const m = String(f.filename || '').match(/^(.+?)_(?:maniqui\.mp4|esqueleto\.mp4|esqueleto_f\d+(?:_v-?\d+)?\.png)$/);
  return m ? m[1] : null;
}

/**
 * Opciones: { prompt:'A person …' (inglés; varias líneas = acciones seguidas), secs:5, seed?, vista:'frente', steps?:100,
 *             cleanFeet?:true, poses?:6, newText?:true (el prompt no está en caché → Llama en CPU) }
 */
function buildMotion(o) {
  const g = G();
  const k = g.add('PhaneKimodo', { prompt: o.prompt, segundos: Math.max(1, Math.min(10, +o.secs || 5)), semilla: o.seed ?? Math.floor(Math.random() * 2147483647),
    vista: o.vista || 'frente', pasos: o.steps || 100, limpiar_pies: o.cleanFeet !== false, poses: o.poses || 6 }, 'Creando el movimiento (Kimodo)…');
  g.add('PhaneKimodoPoses', { info: [k, 0] }, 'Poses clave…');
  return g;
}

/** Opciones: { name:'<nombre del movimiento>', frame: cuadro a 30 fps, vista?:'igual_que_el_video', maniqui?:true (también el maniquí 3D en PNG) } */
function buildFrame(o) {
  const g = G();
  g.add('PhaneKimodoCuadro', { nombre: o.name, cuadro: Math.max(-3, Math.round(o.frame || 0)), vista: o.vista || 'igual_que_el_video', maniqui: !!o.maniqui },
    o.maniqui ? 'Dibujando el maniquí 3D…' : 'Dibujando el esqueleto…');
  return g;
}

const lines = o => Math.max(1, String(o.prompt || '').split(/\n|\|/).filter(s => s.trim()).length);
const KIMODO = 'kimodo/Kimodo-SOMA-RP-v1.2.safetensors', LLAMA = 'kimodo/Meta-Llama-3-8B-Instruct.safetensors';

export const ENGINES = [
  {
    id: 'motion.kimodo', tool: 'motion', tier: 'ligero',
    name: 'Kimodo (NVIDIA) · texto → movimiento 3D',
    desc: 'Escribe una acción en inglés y sale una animación 3D: maniquí (para Recast), esqueletos (para Pose exacta) y BVH (para tu juego).',
    files: [KIMODO, LLAMA],
    ramGB: 18,   // Llama-3-8B en la CPU (bf16) en otro proceso, solo con prompts nuevos; ComfyUI suelta sus modelos antes
    // arranque del venv + modelo ~10 s, 6 s por cada 5 s de movimiento, dibujar ~4 s/s; prompt nuevo: cargar y leer con Llama en CPU
    est: o => Math.round(12 + lines(o) * ((+o.secs || 5) * 5.2) + (o.newText === false ? 0 : 20 + 10 * lines(o))),
    build: buildMotion,
    sample: { prompt: 'A person does a cartwheel and lands in a crouch.', secs: 5, seed: 42, vista: 'frente' },
    caps: { maxSecs: 10, fps: MOTION_FPS, vistas: VISTAS.map(v => v[0]) },
  },
  {
    id: 'motion.kimodo_frame', tool: 'motion', tier: 'ligero',
    name: 'Kimodo · esqueleto de un cuadro', desc: 'Saca el esqueleto exacto (PNG) de cualquier cuadro de un movimiento ya creado.',
    files: [KIMODO], ramGB: 2, est: o => (o.maniqui ? 18 : 8),   // 28-oct: medido 18 s con maniquí (antes 12)
    build: buildFrame, sample: { name: 'cartwheel_lands_crouch_00001', frame: 45 },
    caps: { internal: true },
  },
];
