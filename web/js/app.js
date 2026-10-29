// Shell de Phane: navegación, switch de poder, medidor del sistema, visor de resultados, acciones y cola.
import { LANG, setLang } from './i18n.js';   // primero: instala la traducción antes de pintar nada
import * as core from './core.js';
import * as kit from './kit.js';
import * as engines from './engines.js';
const { h } = kit;

// Páginas (cada módulo exporta default {id,title,icon,order,render,receive?,wide?})
// 29-oct: ✨ Efectos escondido (casi todos explotaban en vez de transformarse; se escribe en el prompt). Para volver, regresar 'efectos' a la lista.
const PAGE_MODULES = ['explorar', 'imagen', 'editar', 'video', 'camara', 'recast', 'movimiento', 'juego','dibujar', 'avatares', 'storyboard', 'audio', 'apps', 'mejorar', 'biblioteca', 'diagnostico'];

const actions = [];   // acciones del visor registradas por las páginas
const pages = [];
const ctx = {
  core, kit, engines, pages,
  goto: (id, payload) => goto(id, payload),
  show: (f, all) => showResult(f, all),
  /** def: {id, label, cls?, title?, when(file)->bool, run(file, ctx)} */
  addAction: def => { if (!actions.some(a => a.id === def.id)) actions.push(def); },
  isActive: id => current?.id === id,
};

/* ---------------- layout ---------------- */
const nav = h('nav', { class: 'side' });
const main = h('main', { class: 'page' });
const view = h('div', { class: 'view' }, h('div', { class: 'empty', html: '👋 <b>Bienvenido a Phane</b><br>Elige una herramienta a la izquierda.<br>Lo que generes aparecerá aquí, con vista previa en vivo.' }));
const bar = h('div', { class: 'bar' }, h('i'));
const status = h('div', { class: 'status' }, h('span', { class: 'st' }, 'Listo.'), h('span', { class: 'eta' }));
const actBox = h('div', { class: 'actions' });
const queueBox = h('div', { class: 'queue hide' }, h('h3', {}, 'Cola'), h('div', { class: 'qlist' }));
const recent = h('div', { class: 'recent' });
const stage = h('aside', { class: 'stage' }, view, bar, status, actBox, queueBox, h('h3', { class: 'recent-h' }, 'Recientes'), recent);

const powerBtn = h('button', { class: 'power', title: 'Switch de poder: elige con qué tarjeta "actúa" el estudio' });
const meter = h('div', { class: 'meter' });
// 💼 Solo uso comercial (27-oct, punto 24): esconde de los menús los motores 🔴 (licencia no comercial) y los bloquea si algo los pide
const comBtn = h('button', { title: 'Esconde y bloquea los motores con licencia solo personal (🔴). Lo que generes podrás usarlo en trabajos comerciales.',
  style: { background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: '999px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', color: 'var(--mute)' },
  onclick: () => { core.setComercial(!core.state.comercial); kit.toast(core.state.comercial ? '💼 Solo uso comercial: los motores 🔴 quedan escondidos.' : 'Todos los motores visibles (los 🔴 son solo para uso personal).', 'info', 5000); } });
const drawCom = () => { const on = core.state.comercial; comBtn.textContent = on ? '💼 Solo uso comercial ✓' : '💼 Solo uso comercial';
  Object.assign(comBtn.style, on ? { background: 'var(--acc)', color: 'var(--acc-ink)', borderColor: 'var(--acc)' } : { background: 'var(--panel2)', color: 'var(--mute)', borderColor: 'var(--line)' }); };
core.on('comercial', drawCom); drawCom();
const top = h('header', { class: 'top' },
  h('div', { class: 'brand' }, h('b', {}, 'Phane')),
  powerBtn,
  h('button', { class: 'pw-lang', 'data-noi18n': '', title: LANG === 'en' ? 'Language: English · cambiar a español' : 'Idioma: español · switch to English',
    style: { background: 'var(--panel2)', border: '1px solid var(--line)', borderRadius: '999px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px', color: 'var(--mute)' },
    onclick: () => setLang(LANG === 'en' ? 'es' : 'en') },
    h('b', { style: { color: LANG === 'es' ? 'var(--text)' : '' } }, 'ES'), ' / ', h('b', { style: { color: LANG === 'en' ? 'var(--text)' : '' } }, 'EN')),
  // switch Simple / Completo (modo simple: pages/simple.js en /phane/simple; mientras ComfyUI no se reinicie, /phane/static/simple.html)
  h('span', { 'data-noi18n': '', style: { display: 'inline-flex', border: '1px solid var(--line)', borderRadius: '999px', padding: '2px', background: 'var(--panel2)', fontSize: '12px' } },
    h('a', { href: '/phane/simple', style: { padding: '3px 10px', borderRadius: '999px', color: 'var(--mute)', textDecoration: 'none' },
      onclick: e => { e.preventDefault(); fetch('/phane/simple', { method: 'HEAD' }).then(r => r.ok).catch(() => false).then(ok => { location.href = ok ? '/phane/simple' : '/phane/static/simple.html'; }); } }, 'Simple'),
    h('b', { style: { padding: '3px 10px', borderRadius: '999px', background: 'var(--panel3)', color: 'var(--text)' } }, LANG === 'en' ? 'Complete' : 'Completo')),
  comBtn,
  meter);   // 28-oct: se quitó el botón 'Versión simple ↗' (/estudio, Mi Estudio IA viejo); el modo simple es el switch Simple / Completo

document.body.append(top, h('div', { class: 'shell' }, nav, main, stage));

/* ---------------- switch de poder ---------------- */
function drawPower() {
  const he = core.state.tier === 'highend';
  powerBtn.className = 'power' + (he ? ' he' : '');
  document.body.classList.toggle('he', he);
  powerBtn.innerHTML = '';
  const g = core.gpuInfo(), big = g.vram >= 15;   // el nombre de TU tarjeta va bajo el modo que le toca
  powerBtn.append(h('span', { class: 'pw-opt' + (!he ? ' on' : '') }, '⚡ Ligero', h('small', {}, !big && g.name ? g.name : '8 GB')),
    h('span', { class: 'pw-opt' + (he ? ' on' : '') }, '🚀 High End', h('small', {}, big && g.name ? g.name : '4090 / 5090')));
}
powerBtn.onclick = async () => {
  const toHE = core.state.tier !== 'highend';
  if (toHE && core.gpuInfo().speed < 2 && !core.store.get('he.warned', false)) {   // con 16-24 GB+ no hace falta el aviso de lento
    const ok = await kit.confirmBox('Activar modo High End',
      '<p>Todas las herramientas usarán los modelos y ajustes de una <b>RTX 4090/5090</b> (más calidad, 720p, más pasos).</p><p>En ' + core.esc(core.gpuInfo().tu) + ' funcionan, pero <b>mucho más lento</b> (minutos a más de una hora por video). Antes de cada generación verás el tiempo estimado. Lo que no cabe en tu RAM queda bloqueado para no congelar la PC.</p>',
      { ok: 'Activar High End' });
    if (!ok) return;
    core.store.set('he.warned', true);
  }
  core.setTier(toHE ? 'highend' : 'ligero');   // redibuja vía core.on('tier')
  kit.toast(toHE ? '🚀 Modo High End: máxima calidad (más lento en tu PC).' : '⚡ Modo Ligero: optimizado para tarjetas de 8 GB.', 'info', 4000);
};
core.on('tier', drawPower);
// al saber qué tarjeta tiene esta PC: nombre en el switch y, si está bajo el mínimo, un aviso (una vez por sesión)
let pcChecked = false;
core.on('sys', () => {
  if (pcChecked) return; pcChecked = true; drawPower();
  const lv = core.pcLevel();
  if (lv.level !== 'ok') kit.toast('⚠️ ' + lv.msg, lv.level === 'img' ? 'info' : 'err', 20000);
});   // el switch siempre refleja el nivel, lo cambie quien lo cambie
drawPower();

/* ---------------- medidor del sistema ---------------- */
core.on('sys', s => {
  const ramUsed = s.ram_total - s.ram_libre, ramPct = ramUsed / s.ram_total * 100;
  const vUsed = s.vram_total ? s.vram_total - s.vram_libre : 0;
  meter.innerHTML = '';
  const m = (lbl, txt, pct, title) => h('div', { class: 'm', title }, h('span', {}, lbl), h('div', { class: 'mbar' }, h('i', { style: { width: Math.min(100, pct) + '%', background: pct > 88 ? 'var(--err)' : pct > 70 ? 'var(--pro)' : 'var(--acc)' } })), h('small', {}, txt));
  meter.append(
    m('RAM', `${ramUsed.toFixed(0)}/${s.ram_total.toFixed(0)} GB`, ramPct, 'Memoria del sistema (los modelos High End viven aquí)'),
    s.vram_total ? m('VRAM', `${vUsed.toFixed(1)}/${s.vram_total.toFixed(0)} GB`, vUsed / s.vram_total * 100, s.gpu) : null,
    m('Disco', `${s.disco_libre.toFixed(0)} GB libres`, 100 - s.disco_libre / s.disco_total * 100, 'Disco G: (modelos y resultados)'));
});

/* ---------------- navegación ---------------- */
let current = null;
const loaded = {};
async function loadPages() {
  for (const name of PAGE_MODULES) {
    try {
      const mod = (await import(`./pages/${name}.js`)).default;
      if (mod && mod.id) pages.push(mod);
      // acciones del visor de TODAS las páginas desde el inicio (no solo las ya visitadas)
      if (mod && mod.setup) { try { mod.setup(ctx); } catch (e) { console.error('setup', name, e); } }
    } catch (e) { console.error('página', name, e); }
  }
  pages.sort((a, b) => (a.order || 99) - (b.order || 99));
  for (const p of pages) {
    nav.append(h('button', { class: 'nav-btn', 'data-id': p.id, onclick: () => goto(p.id) }, h('span', { class: 'ni' }, p.icon || '•'), h('span', {}, p.title)));
  }
}
function goto(id, payload) {
  const p = pages.find(x => x.id === id); if (!p) return;
  current = p;
  nav.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.id === id));
  if (!loaded[id]) {
    const root = h('section', { class: 'pg', 'data-id': id });
    loaded[id] = root; main.append(root);
    try { p.render(root, ctx); } catch (e) { console.error(e); root.append(h('div', { class: 'err' }, 'Error en la página: ' + e.message)); }
  }
  Object.entries(loaded).forEach(([k, el]) => el.classList.toggle('hide', k !== id));
  document.body.classList.toggle('wide', !!p.wide);
  core.store.set('page', id);
  if (payload && p.receive) p.receive(payload, ctx);
  window.scrollTo({ top: 0 });
}

/* ---------------- visor de resultados ---------------- */
function showResult(f, all) {
  const u = f.local ? f.url : core.urlOf(f);   // f.local: video abierto desde tu PC (blob:, sin subir; solo para sacar cuadros)
  view.innerHTML = '';
  view.dataset.keep = f.kind === 'vid' ? '1' : '';   // la vista previa de otro trabajo no borra un video que estás viendo
  view.dataset.file = f.filename ? core.qcKey(f) : '';
  if (f.kind === 'vid') view.append(h('video', { src: u, controls: true, autoplay: true, loop: true, playsinline: true }));
  else if (f.kind === 'aud') view.append(h('div', { class: 'aud-ico' }, '🎧'), h('audio', { src: u, controls: true, autoplay: true }));
  else view.append(h('img', { src: u }));
  if (f.filename) qcBanner(f);
  actBox.innerHTML = '';
  const isFirst = x => (typeof x.first === 'function' ? !!x.first(f) : !!x.first);
  for (const a of [...actions.filter(isFirst), ...actions.filter(x => !isFirst(x))]) {   // first: el siguiente paso obvio va primero (🎬 Pasar a final; en un maniquí, 🎭 Usar en Recast)
    if (f.local && a.id !== 'app.frame') continue;   // un video local no está en ComfyUI: solo sirve para capturar cuadros
    try { if (!a.when || a.when(f)) actBox.append(h('button', { class: 'btn ' + (a.cls || ''), title: a.title || '', onclick: () => a.run(f, ctx) }, a.label)); } catch { /* */ }
  }
  if (!f.local) actBox.append(h('a', { class: 'btn', href: u, download: f.filename }, '⬇️ Descargar'));
  if (all && all.length > 1) all.forEach((o, i) => { if (o !== f) actBox.append(h('button', { class: 'btn', onclick: () => showResult(o, all) }, `Ver ${i + 1}`)); });
}
core.on('output', ({ file, all }) => showResult(file, all));

/* 📂 Mostrar en el Explorador: abre la carpeta con el archivo seleccionado. */
ctx.addAction({ id: 'app.mostrar', label: '📂 Mostrar en carpeta', title: 'Abre el Explorador de Windows con este archivo seleccionado',
  when: f => (f.type || 'output') === 'output', run: async f => {
    const r = await fetch('/phane/api/mostrar', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subfolder: f.subfolder || '', filename: f.filename }) }).then(x => x.json()).catch(e => ({ error: e.message }));
    if (r.error) kit.toast('No pude abrir la carpeta: ' + r.error, 'err');
  } });

/* 🧩 Abrir en ComfyUI: descarga el grafo de ESTA salida como .json (formato API; ComfyUI lo abre al arrastrarlo al lienzo).
   1) /history/<prompt_id> (resultado recién hecho)  2) metadatos del archivo: chunk tEXt/iTXt "prompt"/"workflow" del PNG,
   o el comentario JSON que VHS mete en el MP4  3) para un video, el PNG hermano que guarda VHS con el mismo nombre. */
function jsonDesde(s, i) {   // objeto JSON que empieza en s[i] === '{' (respeta strings y escapes)
  let d = 0, q = false;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (q) { if (c === '\\') k++; else if (c === '"') q = false; continue; }
    if (c === '"') q = true; else if (c === '{') d++; else if (c === '}' && --d === 0) { try { return JSON.parse(s.slice(i, k + 1)); } catch { return null; } }
  }
  return null;
}
const comoObj = v => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } } return v && typeof v === 'object' ? v : null; };
function metaDeBytes(buf) {
  const b = new Uint8Array(buf), out = {};
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) {   // PNG: recorrer chunks
    const dv = new DataView(buf), lat = new TextDecoder('latin1'), utf = new TextDecoder();
    for (let p = 8; p + 8 <= b.length;) {
      const len = dv.getUint32(p), type = lat.decode(b.subarray(p + 4, p + 8)), data = b.subarray(p + 8, p + 8 + len);
      if (type === 'tEXt' || type === 'iTXt') {
        const z = data.indexOf(0), key = lat.decode(data.subarray(0, z));
        let txt = null;
        if (type === 'tEXt') txt = lat.decode(data.subarray(z + 1));
        else if (data[z + 1] === 0) {   // iTXt sin comprimir: key\0 flag método idioma\0 clave-traducida\0 texto
          let q = data.indexOf(0, z + 3); q = data.indexOf(0, q + 1); txt = utf.decode(data.subarray(q + 1));
        }
        if (txt && (key === 'prompt' || key === 'workflow')) out[key] = comoObj(txt);
      }
      if (type === 'IEND') break;
      p += 12 + len;
    }
    return out;
  }
  const s = new TextDecoder('latin1').decode(b);   // MP4/otros: VHS guarda {"prompt": "...", "workflow": ...} como comentario
  for (const pat of ['{"prompt"', '{"workflow"']) {
    for (let i = s.indexOf(pat); i >= 0 && !out.prompt; i = s.indexOf(pat, i + 1)) {
      const o = jsonDesde(s, i);
      if (o) { out.prompt = comoObj(o.prompt); if (!out.workflow) out.workflow = comoObj(o.workflow); }
    }
  }
  // VHS reciente: el comentario del MP4 es el grafo API tal cual: {"1": {"class_type": ...}, ...}
  const esApi = o => o && Object.values(o).length && Object.values(o).every(n => n && typeof n === 'object' && n.class_type);
  for (let i = s.indexOf('{"class_type"'); i > 0 && !out.prompt; i = s.indexOf('{"class_type"', i + 1)) {
    const o = jsonDesde(s, s.lastIndexOf('{', i - 1));
    if (esApi(o)) out.prompt = o;
  }
  return out;
}
async function grafoDe(f) {
  if (f.prompt_id) {
    try { const h = (await core.getJSON('/history/' + f.prompt_id))[f.prompt_id]; const g = h && h.prompt && h.prompt[2]; if (g && Object.keys(g).length) return { g, api: true }; } catch { /* */ }
  }
  const leer = async x => { const r = await fetch(core.urlOf(x)); if (!r.ok) throw new Error(r.status); return metaDeBytes(await r.arrayBuffer()); };
  const cands = [f];
  if (f.kind === 'vid') cands.push({ ...f, filename: String(f.filename).replace(/\.[^.]+$/, '.png') });
  for (const x of cands) {
    let m; try { m = await leer(x); } catch { continue; }
    if (m.workflow && Array.isArray(m.workflow.nodes)) return { g: m.workflow, api: false };   // formato de lienzo: mejor todavía
    if (m.prompt && Object.keys(m.prompt).length) return { g: m.prompt, api: true };
  }
  return null;
}
ctx.addAction({ id: 'app.comfy', label: '🧩 Abrir en ComfyUI', title: 'Descarga el grafo de este resultado (.json) para arrastrarlo al lienzo de ComfyUI',
  when: f => !f.local && (f.type || 'output') === 'output', run: async f => {
    const r = await grafoDe(f);
    if (!r) return kit.toast('Este archivo no trae el grafo guardado (se hizo fuera de Phane o sin metadatos).', 'err');
    const name = String(f.filename || 'phane').replace(/\.[^.]+$/, '') + (r.api ? '_api' : '_workflow') + '.json';
    const url = URL.createObjectURL(new Blob([JSON.stringify(r.g, null, 2)], { type: 'application/json' }));
    const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    const ok = await kit.confirmBox('🧩 Grafo listo para ComfyUI',
      `<p class="muted">${core.esc(name)}</p><p>Se descargó el grafo de este resultado. Abre ComfyUI y arrastra el archivo al lienzo: aparecen todos sus nodos con los mismos ajustes.</p>`,
      { ok: 'Abrir ComfyUI ↗', cancel: 'Cerrar' });
    if (ok) window.open('/', '_blank');
  } });

/* 🗑️ Borrar: manda el archivo (y la miniatura / versión con o sin audio de un video) a la Papelera de Windows. */
ctx.addAction({ id: 'app.borrar', label: '🗑️ Borrar', title: 'Lo manda a la Papelera de Windows (se puede recuperar)',
  when: f => (f.type || 'output') === 'output', run: async f => {
    // referencias de input que usó (ropa, objeto…): casilla marcada para borrarlas también, salvo que otra cosa las use
    const who = { subfolder: f.subfolder || '', filename: f.filename };
    const post = (url, b) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(x => x.json()).catch(e => ({ error: e.message }));
    const refs = (await post('/phane/api/refs_de', who)).refs || [];
    const libres = refs.filter(r => !r.uso);
    const extra = (libres.length ? `<label class="del-refs"><input type="checkbox" id="del-refs" checked> También borrar la foto de ropa/referencia que usó (${libres.map(r => core.esc(r.filename)).join(', ')})</label>` : '')
      + refs.filter(r => r.uso).map(r => `<p class="muted">📎 ${core.esc(r.filename)} se queda: ${core.esc(r.uso)}.</p>`).join('');
    const box = kit.confirmBox('¿Borrar este archivo?', `<p><b>${core.esc(f.filename)}</b> se va a la Papelera de Windows; de ahí lo puedes recuperar.</p>` + extra, { ok: '🗑️ Sí, borrar' });
    const chk = document.getElementById('del-refs');   // el aviso ya está en pantalla; al cerrarse se quita del DOM
    if (!(await box)) return;
    const r = await post('/phane/api/borrar', { ...who, ...(chk?.checked && { refs: libres.map(x => x.ref) }) });
    if (r.error) return kit.toast('No se pudo borrar: ' + r.error, 'err');
    kit.toast('🗑️ Enviado a la Papelera.', 'info');
    view.replaceChildren(); actBox.replaceChildren();
    core.refreshGallery();
  } });

/* 📸 Capturar el cuadro actual de un video del visor → imagen en ComfyUI/input, lista para usarse de referencia, personaje,
   inicio de otro video… (sirve con videos tuyos: Biblioteca → "🎞️ Abrir un video tuyo"). Mismo origen → el canvas no se "ensucia". */
ctx.addAction({ id: 'app.frame', label: '📸 Capturar este cuadro', title: 'Pausa el video donde quieras y guarda ESE cuadro como imagen (a resolución completa)',
  when: f => f.kind === 'vid', run: async f => {
    const v = view.querySelector('video');
    if (v?.error) return kit.toast('Tu navegador no puede reproducir este formato; conviértelo a MP4 (H.264).', 'err');
    if (!v || !v.videoWidth || v.readyState < 2 || v.seeking) return kit.toast('Espera a que se vea el cuadro y vuelve a intentar.', 'err');
    v.pause();
    const t = v.currentTime;
    const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const blob = await new Promise(res => c.toBlob(res, 'image/png'));
    const base = String(f.filename || 'video').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '_').slice(0, 40);
    let img;   // nombre único: core.upload sobrescribe y un cuadro anterior puede estar en uso (casilla, Personaje)
    try { img = await core.upload(new File([blob], `cuadro_${base}_${t.toFixed(2).replace('.', '-')}s_${Date.now().toString(36)}.png`, { type: 'image/png' })); }
    catch (e) { return kit.toast('No pude guardar el cuadro: ' + e.message, 'err'); }
    img.kind = 'img';
    kit.toast(`📸 Cuadro del segundo ${t.toFixed(1)} guardado (${c.width}×${c.height}). Úsalo con los botones de abajo; "Ver 1" regresa al video.`, 'info', 7000);
    showResult(img, [f, img]);
  } });
/* ⏱️ Ir a un segundo exacto del video (ej. 4.25) y pausarlo ahí: para sacar cuadros por tiempo con "📸 Capturar este cuadro". */
ctx.addAction({ id: 'app.goto', label: '⏱️ Ir al segundo…', title: 'Salta a un tiempo exacto del video (ej. 4.25) y lo pausa ahí',
  when: f => f.kind === 'vid', run: async () => {
    const v = view.querySelector('video');
    if (!v) return;
    const box = kit.confirmBox('⏱️ Ir al segundo', `<p><input type="number" id="goto-s" aria-label="Segundos" min="0" step="0.05" value="${v.currentTime.toFixed(2)}"> s${v.duration ? ` <span class="muted">(dura ${v.duration.toFixed(2)} s)</span>` : ''}</p>`, { ok: 'Ir', cancel: 'Cancelar' });
    const inp = document.getElementById('goto-s');   // el aviso ya está en pantalla; al cerrarse se quita del DOM
    if (!(await box)) return;
    const t = parseFloat(String(inp?.value).replace(',', '.'));
    if (!isFinite(t) || t < 0) return kit.toast('Escribe un número de segundos, ej. 4.25', 'err');
    v.pause(); v.currentTime = v.duration ? Math.min(t, v.duration - 0.01) : t;
  } });
core.on('preview', url => {
  let im = view.querySelector('img.prev');
  if (!im && view.dataset.keep && view.querySelector('video')) return;   // no tapar el video que el usuario abrió
  if (!im) { view.innerHTML = ''; view.dataset.file = ''; view.append(h('span', { class: 'live' }, '● vista previa'), im = h('img', { class: 'prev' })); }
  const old = im.src; im.src = url; if (old.startsWith('blob:')) URL.revokeObjectURL(old);
});
core.on('error', msg => kit.toast(msg, 'err', 15000));

/* ---------------- QC en el visor (28-oct): negros en video, audio NaN/silencio ---------------- */
function qcBanner(f) {
  const msg = core.qcAvisos.get(core.qcKey(f));
  view.querySelector('.qc-warn')?.remove();
  if (msg) view.append(h('div', { class: 'qc-warn', role: 'alert' }, '⚠️ ' + msg));
}
core.on('qc', ({ file }) => { if (view.dataset.file === core.qcKey(file)) qcBanner(file); });

/* ---------------- caídas de ComfyUI (28-oct) ---------------- */
// core.js reconecta solo; aquí se avisa y, si un trabajo se perdió con el reinicio, se ofrece 🔁 Reintentar con lo mismo.
core.on('conexion', ok => {
  if (!ok) { status.querySelector('.st').textContent = '⚠️ Sin conexión con ComfyUI: reconectando…'; kit.toast('⚠️ Se perdió la conexión con ComfyUI. Reconectando solo…', 'err', 8000); }
  else { status.querySelector('.st').textContent = 'Conectado de nuevo.'; kit.toast('✓ ComfyUI está de vuelta.', 'info', 4000); }
});
core.on('perdidos', async lista => {
  const nombres = lista.map(x => `<li>${core.esc(x.label)}</li>`).join('');
  const ok = await kit.confirmBox('ComfyUI se reinició',
    `<p>${lista.length === 1 ? `Tu trabajo <b>${core.esc(lista[0].label)}</b> se perdió.` : 'Estos trabajos se perdieron:'}</p>${lista.length > 1 ? `<ul>${nombres}</ul>` : ''}` +
    '<p class="muted">Lo que ya estaba terminado sigue en tu Biblioteca. Puedes lanzarlo otra vez con las mismas opciones.</p>',
    { ok: '🔁 Reintentar', cancel: 'Ahora no' });
  if (!ok) return;
  let n = 0;
  for (const x of lista) if (await core.reintentar(x)) n++;
  if (n) kit.toast(`🔁 ${n === 1 ? 'Trabajo enviado' : n + ' trabajos enviados'} de nuevo a la cola.`, 'info', 5000);
});

/* ---------------- progreso y cola ---------------- */
function drawProgress() {
  const job = core.runningJob();
  if (!job || !job.t0) return;
  const el = (Date.now() - job.t0) / 1000, eta = job.predicted || 60;
  const pct = Math.min(99, Math.max((job.done + (job.step || 0)) / job.total, el / eta * 0.95) * 100);
  bar.firstChild.style.width = pct + '%';
  status.querySelector('.st').textContent = `${job.stage || 'Empezando…'}${job.step ? ' · ' + Math.round(job.step * 100) + '%' : ''}`;
  status.querySelector('.eta').textContent = `${core.fmt(el)}${eta > el ? ' · faltan ~' + core.fmt(eta - el) : ''}`;
}
setInterval(drawProgress, 1000);
core.on('progress', drawProgress);
core.on('done', job => {
  if (!core.jobs.some(j => j.status === 'run' || j.status === 'wait')) {
    bar.firstChild.style.width = '100%';
    status.querySelector('.st').textContent = `¡Listo! "${job.label}" en ${core.fmt(job.secs || 0)}`;
    status.querySelector('.eta').textContent = '';
  }
});
function drawQueue() {
  const vis = core.jobs.filter(j => (j.status !== 'done' && j.status !== 'err') || Date.now() - j.ended < 30000).slice(-8);
  queueBox.classList.toggle('hide', !vis.length);
  const ql = queueBox.querySelector('.qlist'); ql.innerHTML = '';
  for (const j of vis) {
    ql.append(h('div', { class: 'job ' + ({ run: 'run', done: 'ok', err: 'bad' }[j.status] || '') },
      h('span', { class: 'd' }), h('span', { class: 'l', title: j.error || '' }, j.label),
      h('span', { class: 's' }, { wait: 'en cola', run: 'creando…', done: '✓ listo', err: '✕ error' }[j.status]),
      (j.status === 'wait' || j.status === 'run') ? h('button', { class: 'btn sm', onclick: () => core.cancel(j) }, j.status === 'run' ? 'Detener' : 'Quitar') : null));
  }
}
core.on('queue', drawQueue);
setInterval(drawQueue, 5000);

/* ---------------- recientes (arrastrables a las casillas) ---------------- */
export function galleryTile(f, { onclick } = {}) {
  const u = core.urlOf(f);
  const media = f.kind === 'vid' ? h('video', { src: u + '#t=0.5', muted: true, loop: true, preload: 'metadata' })
    : f.kind === 'aud' ? h('div', { class: 'aud' }, '🎧') : h('img', { src: u, loading: 'lazy' });
  const t = h('div', { class: 'it', draggable: 'true', title: f.filename, onclick: onclick || (() => showResult(f)) }, media,
    h('span', { class: 't' }, f.kind === 'vid' ? '🎬' : f.kind === 'aud' ? '🎧' : '🖼️'));
  t.ondragstart = e => e.dataTransfer.setData('application/x-phane-file', JSON.stringify(f));
  if (f.kind === 'vid') { t.onmouseenter = () => media.play().catch(() => {}); t.onmouseleave = () => media.pause(); }
  return t;
}
core.on('gallery', items => { recent.innerHTML = ''; items.slice(0, 12).forEach(f => recent.append(galleryTile(f))); });
ctx.galleryTile = galleryTile;

/* ---------------- arranque ---------------- */
await loadPages();
goto(core.store.get('page', 'explorar'));
window.HE = { core, kit, engines, ctx, goto };   // para depurar desde la consola
