// Página "✏️ Dibujar movimiento" (Draw-to-Video): dibuja flechas sobre la imagen y Wan-Move mueve las cosas por tu trazo.
// Los trazos se guardan normalizados (0..1 de la imagen original); graphs/draw.js los convierte al formato de WanMoveTracksFromCoords.
import { drawGeometry, MAX_TRACKS } from '../graphs/draw.js';
import * as enhance from '../enhance_ui.js';

const COLORS = ['#c6ff3d', '#7cc4ff', '#ffb35c', '#ff5c8a', '#c79bff'];
const IDEAS = [
  ['Auto', 'the car drives smoothly along the road, realistic motion, slight motion blur'],
  ['Persona camina', 'the person walks forward naturally, realistic body motion, natural lighting'],
  ['Animal', 'the animal runs naturally, realistic fur and muscles moving'],
  ['Agua', 'water flowing and splashing, realistic fluid motion'],
  ['Objeto vuela', 'the object flies through the air smoothly, cinematic'],
  ['Brazo', 'the person raises and moves their arm naturally, realistic motion'],
];
const MAX_PINS = 8;

let ui = null;

function registerActions(ctx) {
  ctx.addAction({ id: 'dibujar.use', label: '✏️ Dibujar movimiento', title: 'Dibuja flechas para decidir cómo se mueve esta imagen',
    when: f => f.kind === 'img', run: f => ctx.goto('dibujar', { file: f }) });
}
(function boot(n = 0) { const c = globalThis.HE?.ctx; if (c) registerActions(c); else if (n < 60) setTimeout(() => boot(n + 1), 500); })();

export default {
  id: 'dibujar', title: 'Dibujar movimiento', icon: '✏️', order: 70,
  setup: registerActions,   // app.js puede llamarlo al cargar (acciones del visor sin visitar la página)
  render(root, ctx) {
    const { kit, core } = ctx; const { h } = kit;
    registerActions(ctx);
    root.append(h('style', {}, `
      .pg[data-id="dibujar"] .dw-wrap{position:relative;background:#000;border-radius:10px;padding:0;display:flex;justify-content:center}
      .pg[data-id="dibujar"] canvas.draw{width:auto;max-width:100%;max-height:62vh;display:block}
      .pg[data-id="dibujar"] .dw-empty{padding:36px 12px;text-align:center;color:var(--mute);font-size:13px}
      .pg[data-id="dibujar"] .dw-tools{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:8px 0}
      .pg[data-id="dibujar"] .dw-count{margin-left:auto;font-size:12.5px;color:var(--mute)}
      .pg[data-id="dibujar"] .dw-sw{display:inline-block;width:10px;height:10px;border-radius:99px;margin-right:3px;vertical-align:middle}`));

    let img = null, imgFile = null, gen = null;
    const items = [];            // [{pts:[{x,y}], pin:bool}]
    let cur = null;
    const canvas = h('canvas', { class: 'draw hide' });
    const g2d = canvas.getContext('2d');
    const empty = h('div', { class: 'dw-empty' }, '☝️ Primero elige la imagen de arriba. Luego arrastra sobre lo que quieres mover.');
    const count = h('span', { class: 'dw-count' });

    const slot = kit.slot({ kind: 'image', tag: 'Inicio', empty: '🖼️ <b>Imagen inicial</b><br><small>arrastra, pega o haz clic</small>',
      onChange: v => {
        items.length = 0; img = null; imgFile = v;
        if (!v) return redraw();
        const im = new Image();
        im.onload = () => { if (imgFile !== v) return; img = im; if (!v.w) { v.w = im.naturalWidth; v.h = im.naturalHeight; } sizeCanvas(); redraw(); };
        im.src = v.url;
      } });
    kit.pasteInto([slot], () => ctx.isActive('dibujar'));

    const tool = kit.chips([['path', '✏️ Trazar movimiento', 'Arrastra desde lo que quieres mover hacia donde debe ir'],
      ['pin', '📌 Fijar punto', 'Haz clic en lo que NO se debe mover']], { key: 'dibujar.tool' });
    const undo = h('button', { class: 'btn sm', onclick: () => { items.pop(); redraw(); } }, '↶ Deshacer');
    const clear = h('button', { class: 'btn sm', onclick: () => { items.length = 0; redraw(); } }, '🗑️ Borrar todo');

    const timing = kit.chips([['linear', '➡️ Constante'], ['ease_in_out', '〰️ Suave'], ['ease_in', '🚀 Acelera'], ['ease_out', '🛬 Frena'],
      ['fast', '⚡ Rápido y se queda', 'Llega al final del trazo a la mitad del video y se detiene']], { key: 'dibujar.timing', value: 'ease_in_out', onChange: () => upd() });
    const brush = kit.chips([['s', '🤏 Pequeño'], ['m', '✋ Mediano'], ['l', '🙌 Grande']], { key: 'dibujar.brush', value: 'm', onChange: () => upd() });
    const secs = kit.chips([[3, '3 s'], [5, '5 s']], { key: 'dibujar.secs', value: 5, onChange: () => upd() });
    const quality = kit.chips([['draft', '⚡ Borrador 272p', 'Para probar el movimiento rápido'], ['final', '🎬 480p']], { key: 'dibujar.quality', value: 'final', onChange: () => { redraw(); } });
    const prompt = kit.promptBox({ key: 'dibujar', ideas: IDEAS, rows: 2, placeholder: 'Qué pasa en la escena (mejor en inglés). Ej.: "the red car drives down the road"' });
    enhance.attach(prompt, 'video');   // ✍️ Mejorar prompt (LLM local)
    const eng = kit.engineMenu('draw', { onChange: () => upd() });

    /* ---------- lienzo ---------- */
    function sizeCanvas() {
      const iw = img.naturalWidth, ih = img.naturalHeight, M = 1100;
      const k = Math.min(1, M / Math.max(iw, ih));
      canvas.width = Math.round(iw * k); canvas.height = Math.round(ih * k);
    }
    const pathsOf = () => items.filter(i => !i.pin);
    function arrow(pts, color, n) {
      const W = canvas.width, H = canvas.height, lw = Math.max(3, W / 220);
      const P = pts.map(p => [p.x * W, p.y * H]);
      g2d.lineCap = 'round'; g2d.lineJoin = 'round';
      g2d.strokeStyle = '#000a'; g2d.lineWidth = lw + 3; g2d.beginPath(); P.forEach(([x, y], i) => i ? g2d.lineTo(x, y) : g2d.moveTo(x, y)); g2d.stroke();
      g2d.strokeStyle = color; g2d.lineWidth = lw; g2d.beginPath(); P.forEach(([x, y], i) => i ? g2d.lineTo(x, y) : g2d.moveTo(x, y)); g2d.stroke();
      // punta de flecha (dirección de los últimos ~12 px)
      const [ex, ey] = P[P.length - 1];
      let j = P.length - 2; while (j > 0 && Math.hypot(ex - P[j][0], ey - P[j][1]) < 12) j--;
      const [bx, by] = P[Math.max(0, j)], a = Math.atan2(ey - by, ex - bx), s = lw * 4;
      g2d.fillStyle = color; g2d.beginPath(); g2d.moveTo(ex, ey);
      g2d.lineTo(ex - s * Math.cos(a - 0.45), ey - s * Math.sin(a - 0.45)); g2d.lineTo(ex - s * Math.cos(a + 0.45), ey - s * Math.sin(a + 0.45)); g2d.closePath(); g2d.fill();
      // número en el inicio
      const [sx, sy] = P[0], r = lw * 2.6;
      g2d.fillStyle = color; g2d.beginPath(); g2d.arc(sx, sy, r, 0, 7); g2d.fill();
      g2d.fillStyle = '#111'; g2d.font = `bold ${Math.round(r * 1.2)}px system-ui`; g2d.textAlign = 'center'; g2d.textBaseline = 'middle'; g2d.fillText(String(n), sx, sy + 1);
    }
    function pin(p) {
      const W = canvas.width, H = canvas.height, r = Math.max(6, W / 110);
      g2d.fillStyle = '#fff'; g2d.beginPath(); g2d.arc(p.x * W, p.y * H, r + 2, 0, 7); g2d.fill();
      g2d.fillStyle = '#ff4d4d'; g2d.beginPath(); g2d.arc(p.x * W, p.y * H, r, 0, 7); g2d.fill();
      g2d.strokeStyle = '#fff'; g2d.lineWidth = 2; g2d.beginPath();
      g2d.moveTo(p.x * W - r * 0.5, p.y * H); g2d.lineTo(p.x * W + r * 0.5, p.y * H); g2d.moveTo(p.x * W, p.y * H - r * 0.5); g2d.lineTo(p.x * W, p.y * H + r * 0.5); g2d.stroke();
    }
    function redraw() {
      canvas.classList.toggle('hide', !img); empty.classList.toggle('hide', !!img);
      if (img) {
        const W = canvas.width, H = canvas.height;
        g2d.clearRect(0, 0, W, H); g2d.drawImage(img, 0, 0, W, H);
        // zona que entra en el video (el resto se recorta)
        const c = drawGeometry({ start: { w: img.naturalWidth, h: img.naturalHeight }, quality: quality.value }).crop;
        g2d.fillStyle = '#000a';
        g2d.fillRect(0, 0, W, c.y * H); g2d.fillRect(0, (c.y + c.h) * H, W, H); g2d.fillRect(0, c.y * H, c.x * W, c.h * H); g2d.fillRect((c.x + c.w) * W, c.y * H, W, c.h * H);
        if (c.x > 0.002 || c.y > 0.002) { g2d.setLineDash([8, 6]); g2d.strokeStyle = '#fff8'; g2d.lineWidth = 1.5; g2d.strokeRect(c.x * W, c.y * H, c.w * W, c.h * H); g2d.setLineDash([]); }
        let n = 0;
        for (const it of items) { if (it.pin) pin(it.pts[0]); else { arrow(it.pts, COLORS[n % COLORS.length], n + 1); n++; } }
        if (cur && cur.pts.length > 1) arrow(cur.pts, COLORS[n % COLORS.length] + 'cc', n + 1);
      }
      const np = pathsOf().length, nf = items.length - np;
      count.innerHTML = '';
      count.append(...pathsOf().map((_, i) => h('span', { class: 'dw-sw', style: { background: COLORS[i % COLORS.length] } })),
        ` ${np}/${MAX_TRACKS} trazos` + (nf ? ` · ${nf} punto${nf > 1 ? 's' : ''} fijo${nf > 1 ? 's' : ''}` : ''));
      upd();
    }
    const clamp = v => Math.min(1, Math.max(0, v));
    const toN = e => { const r = canvas.getBoundingClientRect(); return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) }; };
    canvas.addEventListener('pointerdown', e => {
      if (!img) return;
      e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch { /* puntero sintético */ }
      cur = { pts: [toN(e)], x0: e.clientX, y0: e.clientY, moved: 0 };
    });
    canvas.addEventListener('pointermove', e => {
      if (!cur) return;
      const p = toN(e), last = cur.pts[cur.pts.length - 1], r = canvas.getBoundingClientRect();
      cur.moved = Math.max(cur.moved, Math.hypot(e.clientX - cur.x0, e.clientY - cur.y0));
      if (tool.value === 'pin') return;
      if (Math.hypot((p.x - last.x) * r.width, (p.y - last.y) * r.height) >= 4) { cur.pts.push(p); redraw(); }
    });
    const finish = () => {
      if (!cur) return;
      const c = cur; cur = null;
      if (tool.value === 'pin' || c.moved < 8 || c.pts.length < 2) {
        if (items.filter(i => i.pin).length >= MAX_PINS) kit.toast(`Máximo ${MAX_PINS} puntos fijos.`, 'err', 3000);
        else items.push({ pts: [c.pts[0]], pin: true });
      } else if (pathsOf().length >= MAX_TRACKS) kit.toast(`Máximo ${MAX_TRACKS} trazos. Usa ↶ Deshacer para cambiar uno.`, 'err', 4000);
      else items.push({ pts: c.pts, pin: false });
      redraw();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', () => { cur = null; redraw(); });

    /* ---------- opciones y generar ---------- */
    function opts() {
      const v = slot.value;
      return { start: v ? { ref: v.ref, w: v.w || img?.naturalWidth, h: v.h || img?.naturalHeight } : { w: 832, h: 480 },
        tracks: items.map(i => i.pts.map(p => ({ x: +p.x.toFixed(4), y: +p.y.toFixed(4) }))),
        prompt: prompt.value, secs: +secs.value, quality: quality.value, timing: timing.value, brush: brush.value };
    }
    function upd() { gen && gen.update(); }

    gen = kit.genButton('✏️ Dar vida a mi dibujo', async () => {
      if (!slot.value) return kit.toast('Primero elige la imagen inicial.', 'err');
      if (!pathsOf().length) return kit.toast('Dibuja al menos un trazo: arrastra desde lo que quieres mover hacia donde debe ir.', 'err');
      await kit.generar(eng.value, opts(), `✏️ Dibujo animado · ${pathsOf().length} trazo${pathsOf().length > 1 ? 's' : ''}`);
    }, () => kit.estimateText(eng.value, opts()));

    root.append(
      h('h1', {}, '✏️ Dibujar movimiento'),
      h('p', { class: 'sub' }, 'Dibuja flechas sobre la imagen: lo que está debajo de cada flecha se moverá siguiendo tu trazo. Usa 📌 para lo que debe quedarse quieto.'),
      kit.step(1, 'Imagen inicial'), slot,
      kit.step(2, 'Dibuja el movimiento', `hasta ${MAX_TRACKS} flechas`),
      h('div', { class: 'dw-tools' }, tool, undo, clear, count),
      h('div', { class: 'dw-wrap' }, canvas, empty),
      h('p', { class: 'note' }, '💡 Empieza el trazo justo encima de lo que quieres mover. Trazos largos = movimiento grande. Lo oscurecido queda fuera del video.'),
      kit.step(3, 'Cómo se mueve'), timing,
      kit.step('·', 'Tamaño de lo que se mueve'), brush,
      kit.step(4, 'Qué pasa en la escena'), prompt,
      kit.step(5, 'Duración y calidad'), secs, h('div', { style: { height: '8px' } }), quality,
      kit.step(6, 'Motor'), eng,
      gen);
    ui = { slot };
    redraw();
  },
  async receive(p, ctx) {
    if (!ui) return;
    const f = p.file || p.start || p.image;
    if (!f) return;
    if (f.kind && f.kind !== 'img') return ctx.kit.toast('Dibujar movimiento usa una imagen como inicio.', 'err');
    await ui.slot.set(f.ref ? f : await ctx.core.asInput(f));
  },
};
