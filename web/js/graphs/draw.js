// Motor de DIBUJAR MOVIMIENTO (Draw-to-Video) con Wan-Move (Wan 2.1 I2V 14B fp8). Base: plantilla video_wanmove_480p.
//
// Opciones (o):
//   { start:{ref,w,h},                 imagen inicial (w,h = tamaño original: los trazos se dibujan sobre ella)
//     tracks:[[{x,y},…],…],            trazos en coordenadas NORMALIZADAS 0..1 de la imagen original (como se ve en el lienzo).
//                                      Un trazo de 1 solo punto = ancla ("esto no se mueve").
//     prompt, secs:3|5, quality:'draft'|'final',
//     timing?:'linear'|'ease_in_out'|'ease_in'|'ease_out'|'fast',   brush?:'s'|'m'|'l' (tamaño de lo que se mueve) }
//
// Formato que espera WanMoveTracksFromCoords.track_coords (comfy_extras/nodes_wanmove.py + parse_json_tracks en nodes_wan.py):
//   JSON string: lista de trazos; cada trazo = lista de {"x","y"} con UN punto POR CUADRO (todos del mismo largo),
//   en PÍXELES del video de salida (width x height de WanMoveTrackToVideo). Puntos fuera del cuadro se ignoran.
//   Aquí cada trazo se remuestrea por longitud de arco al largo del video y se convierte en un "haz" de pistas paralelas
//   (como GenerateTracks con num_tracks/track_spread) para que el modelo arrastre una zona y no un solo píxel.
import { G, rnd, NEG_WAN, VID_SIZE, arOf, align4, loadImageFit, saveVideo, rife2x } from '../lib/graph.js';

export const DRAW_FPS = 16;
export const MAX_TRACKS = 5;
const BRUSH = { s: { n: 5, spread: 0.008 }, m: { n: 5, spread: 0.014 }, l: { n: 7, spread: 0.022 } };

/** Curvas de tiempo: t (0..1 del clip) -> avance (0..1 del trazo). */
export const TIMING = {
  linear: t => t,
  ease_in_out: t => t * t * (3 - 2 * t),
  ease_in: t => t * t,
  ease_out: t => 1 - (1 - t) * (1 - t),
  fast: t => Math.min(1, t / 0.55),          // llega rápido y se queda quieto
};

/** Largo del video (4n+1, máx. 81 = 5 s). */
export const drawLength = secs => Math.min(81, align4(Math.round((secs || 5) * DRAW_FPS) + 1));

/** Tamaño del video y el mapeo normalizado -> píxel de salida (mismo recorte centrado que ImageResizeKJv2 'crop'). */
export function drawGeometry(o) {
  const [W, H] = VID_SIZE[o.quality === 'draft' ? 'draft' : 'final'][arOf(o.start)];
  const iw = o.start?.w || W, ih = o.start?.h || H;
  const s = Math.max(W / iw, H / ih), sw = iw * s, sh = ih * s;
  const ox = (sw - W) / 2, oy = (sh - H) / 2;
  return { W, H, map: p => ({ x: p.x * sw - ox, y: p.y * sh - oy }), crop: { x: ox / sw, y: oy / sh, w: W / sw, h: H / sh } };
}

/** Remuestrea una polilínea (píxeles) a N posiciones según la curva de tiempo. Devuelve [{x,y,tx,ty}] (tx,ty = tangente unitaria). */
function resample(pts, N, ease) {
  const seg = []; let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
  const out = [];
  let lastT = { tx: 1, ty: 0 };
  for (let k = 0; k < N; k++) {
    const target = ease(N === 1 ? 0 : k / (N - 1)) * total;
    let acc = 0, i = 0;
    while (i < seg.length - 1 && acc + seg[i] < target) { acc += seg[i]; i++; }
    const a = pts[i], b = pts[Math.min(i + 1, pts.length - 1)];
    const f = seg[i] ? Math.min(1, Math.max(0, (target - acc) / seg[i])) : 0;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    if (len > 1e-6) lastT = { tx: dx / len, ty: dy / len };
    out.push({ x: a.x + dx * f, y: a.y + dy * f, ...lastT });
  }
  return out;
}

/** Convierte los trazos de la página al JSON de WanMoveTracksFromCoords. */
export function tracksToCoords(o) {
  const { W, H, map } = drawGeometry(o);
  const N = drawLength(o.secs);
  const ease = TIMING[o.timing] || TIMING.linear;
  const br = BRUSH[o.brush] || BRUSH.m;
  const spread = br.spread * (W + H) / 2;
  const r1 = v => Math.round(v * 10) / 10;
  const out = [];
  let paths = 0;
  for (const tr of (o.tracks || [])) {
    const pts = (tr || []).filter(p => p && isFinite(p.x) && isFinite(p.y)).map(map);
    if (!pts.length) continue;
    const moving = pts.length > 1 && pts.some(p => Math.hypot(p.x - pts[0].x, p.y - pts[0].y) > 2);
    if (!moving) {
      // ancla: un pequeño racimo de 5 puntos quietos
      const c = pts[0], d = spread;
      for (const [dx, dy] of [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]]) {
        const p = { x: r1(c.x + dx), y: r1(c.y + dy) };
        out.push(Array.from({ length: N }, () => p));
      }
      continue;
    }
    if (paths >= MAX_TRACKS) continue;
    paths++;
    const path = resample(pts, N, ease);
    for (let j = 0; j < br.n; j++) {
      const off = (j - (br.n - 1) / 2) * spread;
      out.push(path.map(p => ({ x: r1(p.x - p.ty * off), y: r1(p.y + p.tx * off) })));
    }
  }
  return out;
}

/* Wan-Move fp8 + lightx2v (6 pasos, cfg 1 = el "switch" de la plantilla encendido). Shift 5 por la regla de Turing (la plantilla usa 8). */
function wanmove(o) {
  const g = G();
  const { W, H } = drawGeometry(o);
  const L = drawLength(o.secs);
  const coords = tracksToCoords(o);
  let m = g.add('UNETLoader', { unet_name: 'Wan21-WanMove_fp8_scaled_e4m3fn_KJ.safetensors', weight_dtype: 'default' }, 'Cargando Wan-Move…');
  m = g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors', strength_model: 1 });
  m = g.add('ModelSamplingSD3', { model: [m, 0], shift: 5 });
  const clip = g.add('CLIPLoader', { clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors', type: 'wan', device: 'default' }, 'Cargando modelos…');
  const vae = g.add('VAELoader', { vae_name: 'wan_2.1_vae.safetensors' });
  const cv = g.add('CLIPVisionLoader', { clip_name: 'clip_vision_h.safetensors' });
  const pos = g.add('CLIPTextEncode', { clip: [clip, 0], text: (o.prompt || '').trim() || 'natural, smooth realistic motion following the drawn paths, cinematic' }, 'Leyendo tu idea…');
  const neg = g.add('CLIPTextEncode', { clip: [clip, 0], text: NEG_WAN });
  const img = loadImageFit(g, o.start.ref, W, H);
  const cve = g.add('CLIPVisionEncode', { clip_vision: [cv, 0], image: [img, 0], crop: 'center' });
  const tr = g.add('WanMoveTracksFromCoords', { track_coords: JSON.stringify(coords) });
  const wm = g.add('WanMoveTrackToVideo', { positive: [pos, 0], negative: [neg, 0], vae: [vae, 0], tracks: [tr, 0], strength: 1, width: W, height: H,
    length: L, batch_size: 1, start_image: [img, 0], clip_vision_output: [cve, 0] }, 'Preparando tus trazos…');
  const ks = g.add('KSampler', { model: [m, 0], seed: rnd(), steps: 6, cfg: 1, sampler_name: 'er_sde', scheduler: 'simple', denoise: 1,
    positive: [wm, 0], negative: [wm, 1], latent_image: [wm, 2] }, 'Moviendo tu dibujo');
  const d = g.add('VAEDecode', { samples: [ks, 0], vae: [vae, 0] }, 'Revelando fotogramas…');
  saveVideo(g, [rife2x(g, [d, 0]), 0], DRAW_FPS * 2, 'phane/dibujo');
  return g;
}

export const ENGINES = [
  {
    id: 'draw.wanmove', tool: 'draw', tier: 'highend',
    name: 'Wan-Move 14B', desc: 'Dibuja flechas sobre la imagen y las cosas siguen tu trazo. 480p, hasta 5 s.',
    files: ['diffusion_models/Wan21-WanMove_fp8_scaled_e4m3fn_KJ.safetensors', 'loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors',
      'text_encoders/umt5_xxl_fp8_e4m3fn_scaled.safetensors', 'vae/wan_2.1_vae.safetensors', 'clip_vision/clip_vision_h.safetensors'],
    ramGB: 30,
    // 6 pasos de un 14B fp8 (16.4 GB, se reparte con la RAM): ≈ 100 s/paso a 480p y ≈ 22 s/paso a 272p (81 cuadros)
    est: o => Math.round(70 + (o.quality === 'draft' ? 150 : 620) * drawLength(o.secs) / 81),
    build: wanmove,
    sample: { start: { ref: 'example.png', w: 1216, h: 832 }, prompt: 'a man snowboarding down the slope, snow spraying', secs: 5, quality: 'final', timing: 'ease_in_out', brush: 'm',
      tracks: [[{ x: 0.6, y: 0.27 }, { x: 0.46, y: 0.44 }, { x: 0.22, y: 0.45 }], [{ x: 0.48, y: 0.97 }, { x: 0.88, y: 0.72 }, { x: 0.96, y: 0.16 }], [{ x: 0.1, y: 0.1 }]] },
    caps: { maxTracks: MAX_TRACKS, durations: [3, 5], qualities: ['draft', 'final'], timings: Object.keys(TIMING), brushes: Object.keys(BRUSH) },
  },
];
