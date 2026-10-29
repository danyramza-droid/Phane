// Descargar con un clic (29-oct): habla con /phane/api/descargar (envuelve tools/download_models.py) e /instalar.
// Una descarga a la vez; el avance se mide en el disco (GB ya bajados / GB del paquete). Si algo falla, la caja sigue
// mostrando el comando para la terminal (plan B).
import * as core from './core.js';
// (sin importar kit.js: kit importa este módulo)
const h = (tag, props = {}, ...kids) => { const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k === 'class' ? (e.className = v) : e.setAttribute(k, v);
  for (const c of kids) e.append(c); return e; };
import { tr as T } from './i18n.js';

const API = '/phane/api/descargar';
export async function estado() { try { return await core.getJSON(API); } catch { return { available: false }; } }

async function post(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let j = {}; try { j = await r.json(); } catch { /* */ }
  return r.ok ? j : { error: j.error || `${r.status}` };
}
export const iniciar = body => post(API, body);
export const instalar = what => post('/phane/api/instalar', { what });

/** Barra de avance dentro de `el`; sigue la descarga en curso hasta que termina. Devuelve true si terminó bien. */
export function seguir(el) {
  const bar = h('div', { class: 'dl-bar' }, h('div', { class: 'dl-fill' }));
  const txt = h('div', { class: 'dl-txt muted' }, T('Empezando…'));
  el.innerHTML = ''; el.append(bar, txt);
  return new Promise(res => {
    const tick = async () => {
      const s = await estado();
      if (!s.available || (!s.running && s.code == null)) { txt.textContent = T('No hay descarga en curso.'); return res(false); }
      const pct = s.totalGB ? Math.min(100, 100 * s.haveGB / s.totalGB) : 0;
      bar.firstChild.style.width = pct.toFixed(1) + '%';
      const ult = (s.tail || []).slice(-1)[0] || '';
      txt.textContent = `${T('Descargando:')} ${s.what} · ${s.haveGB.toFixed(1)} / ${s.totalGB.toFixed(1)} GB` + (ult && !/GB$/.test(ult.trim()) ? ` · ${ult.trim().slice(0, 90)}` : '');
      if (s.running) return setTimeout(tick, 2000);
      await core.refreshModels();
      if (s.code === 0) {
        txt.textContent = '✅ ' + T('Listo: ya puedes usarlo.') + (s.manual?.length ? ' ' + T('Falta un paso aparte:') + ' ' + s.manual.join(' · ') : '');
        bar.firstChild.style.width = '100%';
        return res(true);
      }
      txt.innerHTML = '⚠️ ' + core.esc(T('Algo falló. Vuelve a intentar (sigue donde se quedó) o usa el comando de abajo.')) + '<br><code>' + core.esc((s.tail || []).slice(-3).join(' | ')) + '</code>';
      return res(false);
    };
    tick();
  });
}

const CSS = `.dl-bar{height:10px;border-radius:6px;background:var(--line,#333);overflow:hidden;margin:10px 0 6px}
.dl-fill{height:100%;width:0;background:var(--acc,#c6ff3d);transition:width .6s}
.dl-txt{font-size:12.5px;word-break:break-word}`;
export function css() { if (!document.getElementById('css-descargas')) document.head.append(h('style', { id: 'css-descargas' }, CSS)); }
