// Componentes de interfaz reutilizables. Todas las páginas los usan para verse y comportarse igual.
import * as core from './core.js';
import * as descargas from './descargas.js';
import { enginesFor, engineById, pickDefault, missingFiles, TIER_INFO, RAM_CAP, ROLE, LICENSE_INFO } from './engines.js';

/** h('div', {class:'x', onclick:fn}, hijos…) */
export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

/** Título de paso numerado. */
export const step = (num, title, small) => h('div', { class: 'step' }, h('i', {}, num), title, small ? h('small', {}, ' ' + small) : null);

/** Chips de opción única. options: [[valor, etiqueta, tooltip?], …]. Guarda la elección si se da `key`. */
export function chips(options, { value, key, onChange } = {}) {
  let v = key ? core.store.get('chip.' + key, value ?? options[0][0]) : (value ?? options[0][0]);
  if (!options.some(o => String(o[0]) === String(v))) v = options[0][0];
  const el = h('div', { class: 'chips' });
  const draw = () => {
    el.innerHTML = '';
    for (const [val, label, title, disabled] of options) {
      el.append(h('button', { class: 'chip' + (String(val) === String(v) ? ' on' : ''), title, disabled: !!disabled,
        onclick: () => { v = val; if (key) core.store.set('chip.' + key, v); draw(); onChange && onChange(v); } }, label));
    }
  };
  draw();
  Object.defineProperty(el, 'value', { get: () => v, set: nv => { v = nv; draw(); } });
  el.setOptions = (opts) => { options = opts; if (!options.some(o => String(o[0]) === String(v))) v = options[0][0]; draw(); };
  return el;
}

/** Deslizador con etiquetas a los lados. */
export function range({ min, max, step: st = 0.05, value, left, right, key, onChange }) {
  const v0 = key ? core.store.get('range.' + key, value) : value;
  const inp = h('input', { type: 'range', min, max, step: st, value: v0 });
  inp.oninput = () => { if (key) core.store.set('range.' + key, +inp.value); onChange && onChange(+inp.value); };
  const el = h('div', { class: 'range' }, left, inp, right);
  Object.defineProperty(el, 'value', { get: () => +inp.value, set: nv => { inp.value = nv; } });
  return el;
}

/** Caja de prompt con ideas. */
export function promptBox({ placeholder = '', ideas = [], key, rows = 3, value = '' } = {}) {
  const ta = h('textarea', { placeholder, rows });
  ta.value = key ? core.store.get('prompt.' + key, value) : value;
  ta.oninput = () => key && core.store.set('prompt.' + key, ta.value);
  const box = h('div', { class: 'promptbox' }, ta);
  if (ideas.length) {
    const row = h('div', { class: 'ideas' });
    ideas.forEach(([n, t]) => row.append(h('button', { class: 'idea', onclick: () => { ta.value = t; ta.oninput(); ta.focus(); } }, '💡 ' + n)));
    row.append(h('button', { class: 'idea', onclick: () => { const t = ideas[Math.floor(Math.random() * ideas.length)][1]; ta.value = t; ta.oninput(); } }, '🎲 Sorpréndeme'));
    box.append(row);
  }
  Object.defineProperty(box, 'value', { get: () => ta.value.trim(), set: v => { ta.value = v; ta.oninput(); } });
  box.textarea = ta;
  return box;
}

/**
 * Casilla para subir/arrastrar/pegar un archivo. kind: 'image' | 'audio' | 'video'.
 * .value -> {ref,url,w,h,abs,filename,subfolder,type} o null ; .set(file) ; onChange(value)
 */
export function slot({ kind = 'image', tag = '', empty = 'Arrastra aquí o haz clic', onChange } = {}) {
  let val = null;
  const input = h('input', { type: 'file', accept: kind + '/*', class: 'hide' });
  const el = h('div', { class: 'drop', tabindex: 0 });
  const draw = () => {
    el.innerHTML = '';
    if (!val) { el.append(h('div', { html: empty })); return; }
    el.append(h('span', { class: 'tag' }, tag));
    if (kind === 'image') el.append(h('img', { src: val.url }));
    else if (kind === 'audio') el.append(h('audio', { controls: true, src: val.url }));
    else el.append(h('video', { src: val.url, muted: true, loop: true, autoplay: true, playsinline: true }));
    el.append(h('button', { class: 'x', title: 'Quitar', onclick: e => { e.stopPropagation(); set(null); } }, '✕'));
  };
  const set = v => { val = v; draw(); onChange && onChange(val); };
  input.onchange = async () => { if (input.files[0]) set(await core.upload(input.files[0])); input.value = ''; };
  el.onclick = e => { if (e.target.closest('audio,video,.x')) return; input.click(); };
  el.ondragover = e => { e.preventDefault(); el.classList.add('over'); };
  el.ondragleave = () => el.classList.remove('over');
  el.ondrop = async e => {
    e.preventDefault(); el.classList.remove('over');
    const gal = e.dataTransfer.getData('application/x-phane-file');
    if (gal) return set(await core.asInput(JSON.parse(gal)));
    const f = e.dataTransfer.files[0]; if (f) set(await core.upload(f));
  };
  el.append(input); draw();
  const wrap = h('div', { class: 'slotwrap' }, el, input);
  Object.defineProperty(wrap, 'value', { get: () => val });
  wrap.set = async f => set(f ? (f.ref ? f : await core.asInput(f)) : null);
  wrap.kind = kind;
  wrap.el = el;
  return wrap;
}

/** Pega con Ctrl+V la imagen del portapapeles en la primera casilla vacía de la lista (de la página visible). */
export function pasteInto(slots, isVisible) {
  document.addEventListener('paste', async e => {
    if (!isVisible()) return;
    const f = [...(e.clipboardData?.files || [])].find(x => x.type.startsWith('image/')); if (!f) return;
    const target = slots.find(s => s.kind === 'image' && !s.value) || slots.find(s => s.kind === 'image');
    if (target) target.set(await core.upload(f));
  });
}

/**
 * Menú de MOTOR para una herramienta. Sigue el switch de poder salvo que el usuario elija uno a mano.
 * .value -> motor ; onChange(motor)
 */
export function engineMenu(tool, { onChange, filter, key } = {}) {
  const pinKey = 'engine.' + tool + (key ? '.' + key : '');
  const okLic = e => !core.state.comercial || e.license !== '🔴';   // 27-oct: switch "💼 Solo uso comercial"
  const list = () => enginesFor(tool).filter(e => (!filter || filter(e)) && okLic(e));
  let pinned = core.store.get(pinKey, null);
  let cur = null;
  const btn = h('button', { class: 'engine-btn' });
  const menu = h('div', { class: 'engine-menu hide' });
  const el = h('div', { class: 'engine' }, h('span', { class: 'engine-lbl' }, 'Motor'), btn, menu);
  const badges = e => {
    const miss = missingFiles(e, core.state.installed);
    const t = TIER_INFO[e.tier] || {};
    const out = [h('span', { class: 'badge t-' + e.tier }, `${t.icon} ${t.label}`)];
    const li = LICENSE_INFO[e.license];
    if (li) out.push(h('span', { class: 'badge lic', title: li.hint + (e.licenseNote ? ' · ' + e.licenseNote : '') }, `${e.license} ${li.label}`));
    if (e.ramGB > RAM_CAP) out.push(h('span', { class: 'badge lock' }, '🔒 no cabe en tu RAM'));
    else if (miss.length) out.push(h('span', { class: 'badge miss' }, '⬇ descargando / falta'));
    return out;
  };
  const choose = (e, manual) => {
    cur = e; if (manual) { pinned = e.id; core.store.set(pinKey, pinned); }
    btn.innerHTML = ''; btn.append(h('b', {}, e ? ROLE[e.id] || e.name : '—'), ...(e && ROLE[e.id] ? [h('small', { class: 'eo-tech' }, e.name)] : []), ...(e ? badges(e) : []), h('span', { class: 'caret' }, '▾'));
    onChange && onChange(cur);
  };
  const pick = () => {
    const ls = list();
    const p = pinned && ls.find(e => e.id === pinned);
    choose(p || pickDefault(tool, core.state.tier, core.state.installed, e => (!filter || filter(e)) && okLic(e)) || ls[0] || null, false);
  };
  btn.onclick = () => {
    menu.innerHTML = '';
    for (const e of list()) {
      const miss = missingFiles(e, core.state.installed);
      menu.append(h('button', { class: 'engine-opt' + (e === cur ? ' on' : ''), onclick: () => { menu.classList.add('hide'); choose(e, true); } },
        h('div', { class: 'eo-top' }, h('b', {}, ROLE[e.id] || e.name), ...badges(e)),
        ROLE[e.id] ? h('div', { class: 'eo-tech' }, e.name) : null,
        h('div', { class: 'eo-desc' }, e.desc || ''),
        h('div', { class: 'eo-meta' }, `RAM ~${e.ramGB} GB${miss.length ? ` · faltan ${miss.length} archivo(s)` : ''}`,
          miss.length ? h('span', { class: 'eo-dl', role: 'button', tabindex: 0, style: { marginLeft: '8px', textDecoration: 'underline', cursor: 'pointer', color: 'var(--acc)' },
            onclick: ev => { ev.stopPropagation(); menu.classList.add('hide'); descargaBox(e); } }, descargaLabel(e)) : null)));
    }
    menu.append(h('button', { class: 'engine-opt auto', onclick: () => { pinned = null; core.store.set(pinKey, null); menu.classList.add('hide'); pick(); } },
      '↺ Automático (según el switch de poder)'));
    menu.classList.toggle('hide');
  };
  document.addEventListener('click', e => { if (!el.contains(e.target)) menu.classList.add('hide'); });
  core.on('tier', () => { pinned = null; core.store.set(pinKey, null); pick(); });
  core.on('comercial', () => pick());
  core.on('models', () => { if (cur) choose(cur, false); else pick(); });
  pick();
  Object.defineProperty(el, 'value', { get: () => cur });
  el.refresh = pick;
  return el;
}

/** Grilla de tarjetas (presets de cámara, efectos…). items: [{id,label,icon,preview,badge,disabled,title}]. multi=N permite elegir hasta N (Mix). */
export function cardGrid(items, { multi = 1, value = [], onChange, cols } = {}) {
  let sel = [...value];
  const el = h('div', { class: 'cards', style: cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` } : null });
  const draw = () => {
    el.innerHTML = '';
    for (const it of items) {
      const on = sel.includes(it.id);
      const media = it.preview
        ? (/\.(mp4|webm)$/i.test(it.preview) ? h('video', { src: it.preview + '#t=0.1', muted: true, loop: true, playsinline: true, preload: 'metadata' }) : h('img', { src: it.preview, loading: 'lazy' }))
        : h('div', { class: 'card-ico' }, it.icon || '✨');
      const card = h('button', { class: 'card' + (on ? ' on' : ''), disabled: !!it.disabled, title: it.title || '',
        onclick: () => {
          if (on) sel = sel.filter(x => x !== it.id);
          else sel = multi > 1 ? [...sel, it.id].slice(-multi) : [it.id];
          draw(); onChange && onChange(sel);
        } }, media, h('span', { class: 'card-lbl' }, it.label), it.badge ? h('span', { class: 'card-badge' }, it.badge) : null);
      const v = card.querySelector('video');
      if (v) { card.onmouseenter = () => v.play().catch(() => {}); card.onmouseleave = () => v.pause(); }
      el.append(card);
    }
  };
  draw();
  Object.defineProperty(el, 'value', { get: () => sel, set: v => { sel = [...v]; draw(); } });
  el.setItems = its => { items = its; sel = sel.filter(id => items.some(i => i.id === id)); draw(); };
  return el;
}

/** Ventana de confirmación propia (no bloquea el navegador). Devuelve Promise<boolean>. */
export function confirmBox(title, body, { ok = 'Sí, generar', cancel = 'Cancelar', danger = false } = {}) {
  return new Promise(res => {
    const close = v => { bg.remove(); res(v); };
    const bg = h('div', { class: 'modal-bg', onclick: e => { if (e.target === bg) close(false); } },
      h('div', { class: 'modal' }, h('h3', {}, title), h('div', { class: 'modal-body', html: body }),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onclick: () => close(false) }, cancel),
          danger ? null : h('button', { class: 'btn acc', onclick: () => close(true) }, ok))));
    document.body.append(bg);
  });
}

/** Aviso flotante. */
export function toast(msg, kind = 'info', ms = 6000) {
  let box = document.querySelector('.toasts'); if (!box) { box = h('div', { class: 'toasts' }); document.body.append(box); }
  const t = h('div', { class: 'toast ' + kind, onclick: () => t.remove() }, msg);
  box.append(t); setTimeout(() => t.remove(), ms);
}

/** Botón grande de generar + línea de estimación. estimateFn() -> texto. */
export function genButton(label, onClick, estimateFn) {
  const hint = h('div', { class: 'hint' });
  const b = h('button', { class: 'go', onclick: onClick }, label);
  const el = h('div', { class: 'gen' }, b, hint);
  el.update = () => { const t = estimateFn ? estimateFn() : ''; if (hint.textContent !== t) hint.textContent = t; };
  el.button = b;
  setTimeout(el.update);
  core.on('sys', () => el.update());   // el aviso de "poca RAM libre" sigue a la RAM real (refreshSys cada 4 s)
  return el;
}

/**
 * Punto ÚNICO para generar con un motor: revisa seguridad (archivos/RAM), avisa el tiempo en High End,
 * arma el grafo y lo encola. Devuelve el job o null.
 */
export async function generar(engine, o, label, { after, confirmed = false } = {}) {
  if (!engine) { toast('No hay motor disponible para esto todavía.', 'err'); return null; }
  const chk = core.checkEngine(engine, o);
  if (chk.block) {
    // faltan modelos: "Descargar este motor (X GB)" con la lista y el comando, en vez de solo fallar
    if (missingFiles(engine, core.state.installed).length) { await descargaBox(engine, chk.reasons.slice(1)); return null; }
    await confirmBox('No se puede correr todavía', `<p><b>${core.esc(engine.name)}</b></p><ul>${chk.reasons.map(r => `<li>${core.esc(r)}</li>`).join('')}</ul>`, { danger: true, cancel: 'Entendido' });
    return null;
  }
  if (chk.warn && (engine.tier !== 'ligero' || chk.tight) && !confirmed) {   // confirmed: trabajos encadenados ya aprobados (storyboard)
    const ok = await confirmBox(chk.tight ? 'Poca RAM libre ahora' : 'Modo High End en tu PC',
      `<p>${core.esc(chk.warn)}</p>` + (chk.ramTip ? `<p><b>⚠️ ${core.esc(chk.ramTip)}</b></p>` : '') +
      (engine.tier !== 'ligero' && core.gpuInfo().speed < 2   // el texto de 4090/5090 solo aplica a High End en tarjetas chicas; con poca RAM no decimos "sigue usando la PC"
        ? `<p class="muted">Funciona como en una 4090/5090 pero mucho más lento${chk.tight ? '.' : ': puedes seguir usando la PC (sin juegos pesados) mientras termina.'}</p>` : ''));
    if (!ok) return null;
  }
  let g;
  try { g = engine.build(o); } catch (e) { console.error(e); toast('Error armando el workflow: ' + e.message, 'err', 12000); return null; }
  return core.run(g, label, { engine, o, after });
}

/* ---------------- ⬇️ Descargar este motor (28-oct) ---------------- */
// Versión mínima y honesta: la página todavía NO descarga sola (haría falta una ruta de servidor con progreso, reanudar y
// tokens de HF). Aquí se dice qué archivos faltan, cuánto pesan (models.json vía /phane/api/manifiesto) y el comando exacto
// de tools/download_models.py que los baja (salta lo que ya tienes y reanuda lo cortado).
let manifiesto = null;
async function getManifiesto() {
  if (manifiesto) return manifiesto;
  try { const r = await fetch('/phane/api/manifiesto'); manifiesto = r.ok ? await r.json() : {}; } catch { manifiesto = {}; }
  return manifiesto;
}
getManifiesto();
/** GB que faltan de un motor según models.json (0 si no se sabe todavía). */
export function faltaGB(engine) {
  const files = (manifiesto && manifiesto.files) || {};
  return missingFiles(engine, core.state.installed).reduce((a, f) => a + (+(files[f] && files[f].sizeGB) || 0), 0);
}
export const descargaLabel = engine => { const g = faltaGB(engine); return `⬇️ Descargar este motor${g ? ` (${g.toFixed(1)} GB)` : ''}`; };
/** Ventana con lo que falta de un motor y cómo bajarlo. otras = otros motivos de bloqueo (RAM, licencia…). */
export async function descargaBox(engine, otras = []) {
  const man = await getManifiesto(), files = (man && man.files) || {};
  const miss = missingFiles(engine, core.state.installed);
  const total = faltaGB(engine), sinTam = miss.some(f => !(files[f] && files[f].sizeGB));
  const fila = f => { const x = files[f] || {}; return `<li><code>${core.esc(f)}</code>${x.sizeGB ? ` · ${x.sizeGB} GB` : ''}${x.url ? '' : x.howto ? ` · <span class="muted">${core.esc(x.howto)}</span>` : ''}</li>`; };
  const cmd = `python_embeded\\python.exe -I custom_nodes\\phane\\tools\\download_models.py ${engine.id}`;
  // 29-oct: descargar con un clic (si esta copia trae tools/download_models.py); la terminal queda como plan B
  const st = await descargas.estado(), uno = st.available && Object.keys(files).length;
  const soloInstalador = miss.length && miss.every(f => files[f] && !files[f].url && /install_kimodo|download_llama/.test(files[f].howto || ''));
  const packs = ['voice', 'sound', 'music'].includes(engine.tool);
  descargas.css();
  const body = `<p><b>${core.esc(engine.name)}</b> necesita ${miss.length} archivo(s) que no están en <code>ComfyUI/models</code>${total ? ` (~${total.toFixed(1)} GB${sinTam ? ' + los que no tienen tamaño' : ''})` : ''}:</p>` +
    `<ul>${miss.map(fila).join('')}</ul>` +
    (uno ? `<div id="dl-now-box"><p>${soloInstalador ? '' : `<button class="btn acc" id="dl-now">⬇️ Descargar ahora${total ? ` (${total.toFixed(1)} GB)` : ''}</button> `}` +
      `${/^motion\.kimodo/.test(engine.id) ? '<button class="btn" id="dl-kimodo">🧰 Instalar Kimodo</button> ' : ''}${packs ? '<button class="btn" id="dl-nodos">🧩 Instalar packs de nodos</button>' : ''}</p>` +
      `<div id="dl-prog"></div></div>` : '') +
    (Object.keys(files).length
      ? `<p>${uno ? 'O con la terminal, en la carpeta de ComfyUI portable:' : 'Todavía no se puede bajar desde aquí. Abre una terminal en la carpeta de ComfyUI portable (no hace falta cerrar Phane) y corre:'}</p><p><code id="dl-cmd">${core.esc(cmd)}</code> <button class="btn sm" id="dl-copy">📋 Copiar</button></p>` +
        '<p class="muted">Se salta lo que ya tienes y reanuda descargas cortadas. Los repos con permiso piden HF_TOKEN. Cuando termine, recarga esta página.</p>'
      : '<p class="muted">Esta copia no trae la lista de descargas (models.json). Bájalos con el instalador de Phane o desde la lista de modelos del README, y recarga la página.</p>') +
    (otras.length ? `<p>Además:</p><ul>${otras.map(r => `<li>${core.esc(r)}</li>`).join('')}</ul>` : '');
  const box = confirmBox(descargaLabel(engine), body, { danger: true, cancel: 'Entendido' });
  const b = document.getElementById('dl-copy');   // el aviso ya está en pantalla; al cerrarse se quita del DOM
  if (b) b.onclick = async () => { try { await navigator.clipboard.writeText(cmd); b.textContent = '✓ Copiado'; } catch { b.textContent = 'Selecciónalo a mano'; } };
  const prog = document.getElementById('dl-prog'), now = document.getElementById('dl-now');
  if (prog && st.running) { if (now) now.disabled = true; descargas.seguir(prog); }   // ya hay una descarga: se ve su avance
  if (now) now.onclick = async () => {
    now.disabled = true;
    const r = await descargas.iniciar({ ids: [engine.id] });
    if (r.error) { prog.innerHTML = `<p class="muted">⚠️ ${core.esc(r.error)}</p>`; now.disabled = false; return; }
    const ok = await descargas.seguir(prog);
    now.disabled = false; if (ok) now.textContent = '✅ Descargado';
  };
  for (const [id, what] of [['dl-kimodo', 'kimodo'], ['dl-nodos', 'nodos']]) {
    const x = document.getElementById(id);
    if (x) x.onclick = async () => { x.disabled = true; const r = await descargas.instalar(what); prog.innerHTML = `<p class="muted">${core.esc(r.error ? '⚠️ ' + r.error : r.msg)}</p>`; x.disabled = !!r.ok; };
  }
  return box;
}

/** Texto de estimación para un motor y opciones. */
export function estimateText(engine, o) {
  if (!engine) return '';
  const chk = core.checkEngine(engine, o);
  if (chk.block) return '🔒 ' + chk.reasons[0];
  return `≈ ${core.fmt(chk.secs)} en tu PC` + (engine.tier !== 'ligero' ? ' · ' + (TIER_INFO[engine.tier]?.hint || '') : '') +
    (chk.tight ? ' · ⚠️ poca RAM libre: cierra programas' : '');
}

export { engineById };
