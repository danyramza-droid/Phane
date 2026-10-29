// Página "Cámara": galería de Camera Controls. Eliges 1 movimiento (o Mix de 2) y te lleva a Video.
import { CAMERA, CAM_GROUPS } from '../data/camera.js';

export default {
  id: 'camara', title: 'Cámara', icon: '🎥', order: 45,
  render(root, ctx) {
    const { kit } = ctx; const { h } = kit;
    let group = 'all', sel = [];
    const items = () => CAMERA.filter(c => group === 'all' || c.group === group || (group === 'exact' && c.pose)).map(c => ({
      id: c.id, label: c.label, icon: c.icon, preview: c.preview,
      badge: c.pose ? 'EXACTA' : c.lora ? 'LoRA' : '', title: c.prompt,
    }));
    const info = h('div', { class: 'note' });
    const grid = kit.cardGrid(items(), { multi: 2, onChange: v => { sel = v; draw(); } });
    const go = h('button', { class: 'go', onclick: () => {
      if (!sel.length) return kit.toast('Elige al menos un movimiento de cámara.', 'err');
      ctx.goto('video', { camera: sel });
    } }, '🎬 Usar en Video');
    const draw = () => {
      const picked = sel.map(id => CAMERA.find(c => c.id === id)).filter(Boolean);
      info.innerHTML = picked.length
        ? `Elegido: <b>${picked.map(c => c.label).join(' + ')}</b>${picked.length > 1 ? ' (Mix)' : ''}. ` +
          (picked.some(c => c.pose) ? 'La cámara EXACTA necesita imagen inicial y hasta 5 s. ' : '') +
          (picked.some(c => c.lora) ? 'Los que dicen LoRA usan un modelo entrenado para ese movimiento.' : '')
        : 'Toca una tarjeta (puedes combinar 2 = Mix). Pasa el mouse por encima para ver el ejemplo.';
    };
    const groups = kit.chips(CAM_GROUPS, { value: 'all', onChange: v => { group = v; grid.setItems(items()); } });
    root.append(
      h('h1', {}, '🎥 Movimientos de cámara'),
      h('p', { class: 'sub' }, `${CAMERA.length} movimientos de cine: dolly, crash zoom, órbita 360, dron, bullet time… Elige uno o mezcla dos y anima cualquier imagen.`),
      groups, h('div', { style: { height: '10px' } }), grid, info, go,
    );
    draw();
  },
};
