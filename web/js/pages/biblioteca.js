// Página BIBLIOTECA: toda tu galería (filtros, búsqueda, agrupada por día) + administrador de Personajes (estilo Soul ID).
import * as personajes from '../personajes.js';

const PAGE = 60;   // cuántos archivos se dibujan por tanda (los videos pesan)

const CSS = `
.pg[data-id="biblioteca"] .bb-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pg[data-id="biblioteca"] .bb-bar input[type=text]{flex:1;min-width:180px}
.pg[data-id="biblioteca"] .bb-day{font-size:12px;font-weight:700;color:var(--mute);text-transform:uppercase;letter-spacing:.7px;margin:16px 0 6px;display:flex;gap:8px;align-items:center}
.pg[data-id="biblioteca"] .bb-day small{font-weight:500;text-transform:none;letter-spacing:0}
.pg[data-id="biblioteca"] .gal{grid-template-columns:repeat(auto-fill,minmax(130px,1fr))}
.pg[data-id="biblioteca"] .bb-name{font-size:10.5px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}
.pg[data-id="biblioteca"] .bb-tabs{display:flex;gap:6px;margin:0 0 12px}
.pg[data-id="biblioteca"] .bb-pjs{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.pg[data-id="biblioteca"] .bb-pj{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px}
.pg[data-id="biblioteca"] .bb-pj .ph{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}
.pg[data-id="biblioteca"] .bb-pj .ph img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:7px;background:#000;display:block}
.pg[data-id="biblioteca"] .bb-form{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px}
.pg[data-id="biblioteca"] .bb-form .drop{min-height:110px;background:var(--panel)}
.pg[data-id="biblioteca"] .bb-slots{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}
@media (max-width:700px){.pg[data-id="biblioteca"] .bb-slots{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;

const dayKey = t => { const d = new Date(t * 1000); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function dayLabel(t) {
  const d = new Date(t * 1000), now = new Date();
  const start = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  const s = d.toLocaleDateString(document.documentElement.lang === 'en' ? 'en-US' : 'es-MX', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default {
  id: 'biblioteca', title: 'Biblioteca', icon: '📚', order: 120, wide: false,
  render(root, ctx) {
    const { core, kit } = ctx; const { h } = kit;
    if (!document.getElementById('bb-style')) document.head.append(h('style', { id: 'bb-style' }, CSS));

    /* ---------- pestañas ---------- */
    let tab = core.store.get('bib.tab', 'gal');
    const galBox = h('div', {}), pjBox = h('div', {});
    const tabs = kit.chips([['gal', '🖼️ Mis creaciones'], ['pj', '👤 Personajes']], { value: tab, onChange: v => { tab = v; core.store.set('bib.tab', v); showTab(); } });
    const showTab = () => { galBox.classList.toggle('hide', tab !== 'gal'); pjBox.classList.toggle('hide', tab !== 'pj'); };

    /* ---------- galería ---------- */
    let limit = PAGE;
    const filter = kit.chips([['all', 'Todo'], ['img', '🖼️ Imágenes'], ['vid', '🎬 Videos'], ['aud', '🎧 Audios']],
      { key: 'bib.filter', onChange: () => { limit = PAGE; drawGal(); } });
    const search = h('input', { type: 'text', placeholder: '🔍 Buscar por nombre (ej. storyboard, video_000…)' });
    let tmr = null;
    search.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { limit = PAGE; drawGal(); }, 200); };
    const count = h('span', { class: 'note', style: { marginTop: 0 } });
    const list = h('div', {});
    const more = h('button', { class: 'go alt', onclick: () => { limit += PAGE; drawGal(); } }, 'Ver más');

    function drawGal() {
      const q = search.value.trim().toLowerCase();
      const k = filter.value;
      const items = (core.state.gallery || []).filter(f => (k === 'all' || f.kind === k) &&
        (!q || `${f.subfolder || ''}/${f.filename}`.toLowerCase().includes(q)));
      count.textContent = `${items.length} archivo${items.length === 1 ? '' : 's'}`;
      list.innerHTML = '';
      if (!items.length) {
        list.append(h('div', { class: 'note', style: { padding: '20px 0' } }, (core.state.gallery || []).length
          ? 'Nada coincide con tu búsqueda.' : 'Todavía no has creado nada. ¡Ve a Explorar y empieza con una idea! ✨'));
        more.classList.add('hide');
        return;
      }
      let curKey = null, grid = null;
      for (const f of items.slice(0, limit)) {
        const kk = f.t ? dayKey(f.t) : 'sin-fecha';
        if (kk !== curKey) {
          curKey = kk;
          const n = items.filter(x => (x.t ? dayKey(x.t) : 'sin-fecha') === kk).length;
          list.append(h('div', { class: 'bb-day' }, f.t ? dayLabel(f.t) : 'Sin fecha', h('small', {}, `· ${n}`)));
          grid = h('div', { class: 'gal' }); list.append(grid);
        }
        grid.append(h('div', {}, ctx.galleryTile(f, { onclick: () => ctx.show(f) }),
          h('div', { class: 'bb-name', title: `${f.subfolder ? f.subfolder + '/' : ''}${f.filename}` }, f.filename)));
      }
      more.classList.toggle('hide', items.length <= limit);
      more.textContent = `Ver más (${items.length - limit} restantes)`;
    }
    // abrir cualquier video (descargas, celular…) en el visor para sacarle cuadros con "📸 Capturar este cuadro"
    const vidIn = h('input', { type: 'file', accept: 'video/*', class: 'hide' });
    vidIn.onchange = async () => {
      const file = vidIn.files[0]; vidIn.value = ''; if (!file) return;
      // se reproduce desde tu PC (blob:) sin subirlo: rápido y sin el límite de 100 MB de ComfyUI; solo se sube cada cuadro capturado
      ctx.show({ kind: 'vid', local: true, url: URL.createObjectURL(file), filename: file.name });
      kit.toast('🎞️ Pausa el video donde quieras y pulsa "📸 Capturar este cuadro". Repite para sacar varias referencias.', 'info', 9000);
    };
    galBox.append(
      h('div', { class: 'bb-bar' }, filter, h('button', { class: 'btn sm', title: 'Volver a leer la carpeta de resultados', onclick: () => core.refreshGallery() }, '🔄 Actualizar'),
        h('button', { class: 'btn sm acc', title: 'Abre un video de tu PC para sacarle cuadros y usarlos de referencia', onclick: () => vidIn.click() }, '🎞️ Abrir un video tuyo (sacar cuadros)'), vidIn),
      h('div', { class: 'bb-bar', style: { marginTop: '8px' } }, search, count),
      h('div', { class: 'note' }, 'Clic para ver en grande · arrastra cualquier archivo a una casilla de otra página para reutilizarlo.'),
      list, more);

    /* ---------- personajes ---------- */
    const nameIn = h('input', { type: 'text', placeholder: 'Nombre (ej. "Ana", "Guerrera del bosque")', maxlength: 60 });
    const slots = [0, 1, 2, 3].map(i => kit.slot({ kind: 'image', tag: `Foto ${i + 1}`,
      empty: i === 0 ? '📷 Foto de la cara<br><small>clara y de frente</small>' : i === 1 ? 'Otro ángulo<br><small>opcional</small>' : 'Cuerpo / outfit<br><small>opcional</small>' }));
    kit.pasteInto(slots, () => ctx.isActive('biblioteca') && tab === 'pj');
    const formTitle = h('b', {}, '➕ Nuevo personaje');
    const clearForm = () => { nameIn.value = ''; slots.forEach(s => s.set(null)); formTitle.textContent = '➕ Nuevo personaje'; };
    const saveBtn = h('button', { class: 'btn acc', onclick: async () => {
      const name = nameIn.value.trim();
      const photos = slots.map(s => s.value).filter(Boolean)
        .map(({ ref, url, w, h: hh, filename, subfolder, type }) => ({ ref, url, w, h: hh, filename, subfolder, type }));
      if (!name) return kit.toast('Ponle un nombre a tu personaje.', 'err');
      if (!photos.length) return kit.toast('Agrega al menos una foto (la de la cara es la más importante).', 'err');
      const exists = (await personajes.list()).some(p => p.name.toLowerCase() === name.toLowerCase());
      if (exists && !(await kit.confirmBox('Ya existe un personaje con ese nombre', `<p>¿Reemplazar las fotos de <b>${core.esc(name)}</b>?</p>`, { ok: 'Sí, reemplazar' }))) return;
      await personajes.upsert({ name, photos });
      kit.toast(`👤 "${name}" guardado. Ya lo puedes elegir en Imagen, Editar, Avatares y Storyboard.`, 'info', 5000);
      clearForm();
    } }, '💾 Guardar personaje');
    const form = h('div', { class: 'bb-form' }, formTitle,
      h('div', { class: 'note' }, 'Un personaje es un nombre + 1 a 4 fotos de la misma persona (o producto). Así sale igualito en todas las herramientas.'),
      h('div', { class: 'row', style: { marginTop: '8px' } }, nameIn),
      h('div', { class: 'bb-slots' }, slots),
      h('div', { class: 'row', style: { marginTop: '10px' } }, saveBtn, h('button', { class: 'btn', onclick: clearForm }, 'Limpiar')));
    const pjList = h('div', { class: 'bb-pjs' });

    async function drawPjs() {
      const all = await personajes.list();
      pjList.innerHTML = '';
      if (!all.length) { pjList.append(h('div', { class: 'note' }, 'Aún no tienes personajes. Crea el primero arriba 👆')); return; }
      for (const p of all) {
        const photos = p.photos || [];
        pjList.append(h('div', { class: 'bb-pj' },
          h('div', { class: 'row', style: { justifyContent: 'space-between' } }, h('b', {}, '👤 ' + p.name), h('span', { class: 'note', style: { marginTop: 0 } }, `${photos.length} foto${photos.length === 1 ? '' : 's'}`)),
          h('div', { class: 'ph' }, photos.slice(0, 4).map(ph => h('img', { src: ph.url || core.urlOf(ph), loading: 'lazy', title: ph.filename || '' }))),
          p.lora && h('div', { class: 'note', style: { marginTop: 0 }, title: p.lora.file },
            personajes.loraMissing(p) ? `⚠️ Su LoRA (${p.lora.file}) no está en models/loras: se usan sus fotos.`
              : `🧬 Tiene LoRA propia (palabra clave "${p.lora.trigger}"): en Imagen, Editar y Storyboard con FLUX.2 Klein sale desde su LoRA.`),
          h('div', { class: 'row' },
            h('button', { class: 'btn sm', title: 'Usar sus fotos como referencias del Storyboard', onclick: () => ctx.goto('storyboard', { files: photos, pj: p.id }) }, '🎞️ Storyboard'),
            h('button', { class: 'btn sm', title: 'Cargar en el formulario para cambiar nombre o fotos', onclick: () => {
              nameIn.value = p.name; formTitle.textContent = `✏️ Editando "${p.name}"`;
              slots.forEach((s, i) => s.set(photos[i] || null));
              form.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } }, '✏️ Editar'),
            h('button', { class: 'btn sm', title: 'Borrar este personaje (las fotos siguen en tu carpeta)', onclick: async () => {
              const ok = await kit.confirmBox('¿Borrar personaje?', `<p>Se borra <b>${core.esc(p.name)}</b> de tu lista de personajes. Las fotos no se borran de tu PC.</p>`, { ok: 'Sí, borrar' });
              if (!ok) return;
              await personajes.remove(p.id);
              kit.toast(`🗑️ "${p.name}" borrado.`, 'info', 3000);
            } }, '🗑️'))));
      }
    }
    pjBox.append(form, kit.step('👥', 'Tus personajes'), pjList);

    root.append(
      h('h1', {}, '📚 Biblioteca'),
      h('p', { class: 'sub' }, 'Todo lo que has creado y tus Personajes reutilizables.'),
      h('div', { class: 'bb-tabs' }, tabs),
      galBox, pjBox);
    showTab(); drawGal(); drawPjs();
    core.on('gallery', drawGal);
    core.on('personajes', drawPjs);
    core.on('loras', drawPjs);
  },
  receive(payload, ctx) {
    // otra página puede mandar {tab:'pj'} para abrir directo los Personajes
    if (payload && payload.tab) {
      ctx.core.store.set('bib.tab', payload.tab);
      const sec = document.querySelector('.pg[data-id="biblioteca"] .bb-tabs .chips');
      const btn = sec && [...sec.querySelectorAll('.chip')].find(b => (payload.tab === 'pj' ? /Personajes|Characters/ : /creaciones|creations/).test(b.textContent));
      if (btn) btn.click();
    }
  },
};
