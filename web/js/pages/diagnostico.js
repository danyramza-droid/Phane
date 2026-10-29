// Página "🩺 Diagnóstico" (28-oct): todo lo que hace falta para que alguien te mande su error en un solo texto.
// Solo LEE (GET): /system_stats y /object_info de ComfyUI, /phane/api/* de Phane. Nada se encola ni se libera.
const KEY_ENGINES = ['motion.kimodo', 'motion.kimodo_frame'];

async function getJ(url) { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } }
const gb = x => (x == null ? '?' : (+x).toFixed(1) + ' GB');

/** Junta el informe: {secciones:[[título, [líneas]]], texto}. */
async function informe(ctx) {
  const { core, engines } = ctx;
  await Promise.all([core.refreshSys(), core.refreshModels()]);
  const [st, oi, listos, tiempos] = await Promise.all([getJ('/system_stats'), getJ('/object_info'), getJ('/phane/api/kimodo_listos'), getJ('/phane/api/tiempos')]);
  const s = core.state.sys || {}, sys = (st && st.system) || {}, dev = (st && st.devices && st.devices[0]) || {};
  const sec = [];

  sec.push(['🖥️ PC', [
    `GPU: ${s.gpu || dev.name || 'no encontré una NVIDIA'}`,
    `VRAM: ${s.vram_total ? `${gb(s.vram_total - s.vram_libre)} usada de ${gb(s.vram_total)}` : dev.vram_total ? gb(dev.vram_total / 2 ** 30) : '?'}`,
    `RAM: ${s.ram_total ? `${gb(s.ram_total - s.ram_libre)} usada de ${gb(s.ram_total)} (ComfyUI ocupa ${gb(s.proceso_ram)})` : '?'}`,
    `Disco de modelos: ${s.disco_libre != null ? `${gb(s.disco_libre)} libres de ${gb(s.disco_total)}` : '?'}`,
    `Sistema: ${sys.os || '?'} · navegador ${navigator.userAgent.match(/(Chrome|Firefox|Edg)\/[\d.]+/)?.[0] || navigator.userAgent.slice(0, 60)}`,
  ]]);

  const argv = (sys.argv || []).slice(1);
  sec.push(['⚙️ ComfyUI', [
    `Versión: ${sys.comfyui_version || '?'} · Python ${String(sys.python_version || '?').split(' ')[0]} · PyTorch ${sys.pytorch_version || '?'}${sys.embedded_python ? ' (Python embebido)' : ''}`,
    `Flags de arranque: ${argv.length ? argv.join(' ') : '(ninguno)'}`,
    `Modo de Phane: ${core.state.tier === 'highend' ? '🚀 High End' : '⚡ Ligero'}${core.state.comercial ? ' · 💼 Solo uso comercial' : ''} · idioma ${document.documentElement.lang || '?'}`,
  ]]);

  // motores: listos / faltan archivos / faltan nodos (clases del grafo de ejemplo que este ComfyUI no tiene)
  const inst = core.state.installed || {};
  const nInst = Object.keys(inst).length, totGB = Object.values(inst).reduce((a, b) => a + (+b || 0), 0);
  const listosE = [], faltan = [], sinNodos = [];
  const visibles = engines.ENGINES.filter(e => !engines.HIDDEN.has(e.id));
  for (const e of visibles) {
    const miss = engines.missingFiles(e, inst);
    let clases = [];
    if (oi) { try { clases = [...new Set(Object.values(e.build(e.sample || {}).n).map(n => n.class_type))].filter(c => !oi[c]); } catch { /* el ejemplo no arma sin entradas reales */ } }
    if (clases.length) sinNodos.push(`${e.id}: faltan nodos ${clases.join(', ')}`);
    if (miss.length) faltan.push(`${e.id}: faltan ${miss.length} archivo(s): ${miss.map(m => m.split('/').pop()).join(', ')}`);
    else if (!clases.length) listosE.push(e.id);
  }
  sec.push(['📦 Modelos y motores', [
    `Archivos de modelo instalados: ${nInst} (${totGB.toFixed(0)} GB)`,
    `Motores listos: ${listosE.length} de ${visibles.length}`,
    ...(faltan.length ? ['Con archivos faltantes:', ...faltan.map(x => '  - ' + x)] : ['Ningún motor visible tiene archivos faltantes.']),
    ...(oi ? (sinNodos.length ? ['Con nodos faltantes (custom nodes sin instalar o viejos):', ...sinNodos.map(x => '  - ' + x)] : ['Todos los nodos que usan los motores existen en este ComfyUI.']) : ['No pude leer /object_info (¿ComfyUI ocupado?).']),
  ]]);

  const kim = KEY_ENGINES.map(id => engines.engineById(id)).filter(Boolean);
  const llama = kim[0] ? engines.missingFiles(kim[0], inst).filter(m => /llama/i.test(m)) : [];
  const kimMiss = kim.flatMap(e => engines.missingFiles(e, inst)).filter(m => !/llama/i.test(m));
  sec.push(['🕺 Kimodo / Llama 3', [
    `Kimodo: ${kimMiss.length ? 'faltan ' + [...new Set(kimMiss)].map(m => m.split('/').pop()).join(', ') : 'instalado'}`,
    `Llama 3 8B (para leer prompts nuevos): ${llama.length ? 'FALTA (solo funcionan los movimientos ya leídos)' : 'instalado'}`,
    `Movimientos listos sin Llama: ${listos && Array.isArray(listos.prompts) ? listos.prompts.length : '?'}`,
    `Nodos de Phane: ${oi ? (['PhaneKimodo', 'PhaneKimodoCuadro'].filter(c => !oi[c]).join(', ') || 'cargados') + (oi.PhaneKimodo ? '' : ' (no cargados: revisa la consola de ComfyUI)') : '?'}`,
  ]]);

  const nT = tiempos && typeof tiempos === 'object' ? Object.keys(tiempos).length : 0;
  const ult = core.ultimoTrabajo();
  sec.push(['🧾 Trabajos', [
    `Tiempos aprendidos: ${tiempos ? nT + ' motor(es) con medidas' : 'ruta no disponible (reinicia ComfyUI para activarla)'}`,
    `Último trabajo enviado: ${ult ? `${ult.label} (${ult.engineId || 'sin motor'}, ${new Date(ult.t).toLocaleString()})` : 'ninguno'}`,
    ...core.jobs.filter(j => j.status === 'err').slice(-5).map(j => `Error: ${j.label}: ${j.error || '?'}`),
  ]]);

  const texto = `Informe de Phane · ${new Date().toLocaleString()}\n` + sec.map(([t, ls]) => `\n## ${t}\n` + ls.join('\n')).join('\n');
  return { sec, texto };
}

async function copiar(txt) {
  try { await navigator.clipboard.writeText(txt); return true; } catch { /* sin permiso: método viejo */ }
  try {
    const ta = document.createElement('textarea'); ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

export default {
  id: 'diagnostico', title: 'Diagnóstico', icon: '🩺', order: 130,
  render(root, ctx) {
    const { h } = ctx.kit;
    const out = h('div', {}, h('p', { class: 'muted' }, 'Revisando…'));
    let ultimo = '';
    const pintar = async () => {
      out.replaceChildren(h('p', { class: 'muted' }, 'Revisando…'));
      const r = await informe(ctx);
      ultimo = r.texto;
      out.replaceChildren(...r.sec.map(([t, ls]) => h('div', {}, h('div', { class: 'step' }, t), h('div', { class: 'diag-pre' }, ls.join('\n')))));
    };
    root.append(h('h1', {}, '🩺 Diagnóstico'),
      h('p', { class: 'sub' }, 'Tu tarjeta, memoria, versión de ComfyUI, modelos y nodos. Si algo falla, copia el informe y mándalo junto con tu error.'),
      h('div', { style: { display: 'flex', gap: '8px', margin: '8px 0 14px' } },
        h('button', { class: 'btn acc', onclick: async () => { if (!ultimo) await pintar(); ctx.kit.toast((await copiar(ultimo)) ? '📋 Informe copiado: pégalo en tu mensaje.' : 'No pude copiar; selecciona el texto a mano.', 'info', 5000); } }, '📋 Copiar informe'),
        h('button', { class: 'btn', onclick: pintar }, '🔄 Actualizar')),
      out);
    pintar();
  },
};
