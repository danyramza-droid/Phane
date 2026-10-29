// Página EXPLORAR (inicio, estilo "Explore"): frase principal, herramientas, ideas rápidas,
// tus últimas creaciones y el estado de los modelos High End (para ver cómo va la descarga).

/** Herramientas del estudio (el título y el ícono reales se leen del módulo de cada página si cargó). */
const TOOLS_HOME = [
  { id: 'imagen', icon: '🖼️', title: 'Imagen', desc: 'Fotos realistas desde texto o con tus referencias.' },
  { id: 'video', icon: '🎬', title: 'Video', desc: 'Texto o foto a video, con movimientos de cámara.' },
  { id: 'editar', icon: '🪄', title: 'Editar', desc: 'Cambia ropa, luz o fondo sin perder a la persona.' },
  // 29-oct escondido: { id: 'efectos', icon: '✨', title: 'Efectos', desc: '40+ efectos virales: inflar, aplastar, explotar…' },
  { id: 'avatares', icon: '🗣️', title: 'Avatares', desc: 'Una foto + una voz = una persona que habla.' },
  { id: 'storyboard', icon: '🎞️', title: 'Storyboard', desc: 'Tu historia en 8 cuadros y luego en una película.' },
  { id: 'recast', icon: '🎭', title: 'Recast', desc: 'Pon a otra persona en un video o copia su movimiento.' },
  { id: 'dibujar', icon: '✏️', title: 'Dibujar movimiento', desc: 'Dibuja flechas y la imagen se mueve por ahí.' },
  { id: 'audio', icon: '🎵', title: 'Audio', desc: 'Música, voces y sonido para tus videos.' },
  { id: 'mejorar', icon: '💎', title: 'Mejorar', desc: 'Sube a HD y dale más fluidez a tus videos.' },
  { id: 'biblioteca', icon: '📚', title: 'Biblioteca', desc: 'Todo lo que has creado y tus Personajes.' },
];

/** Ideas rápidas: saltan a una página con el prompt ya escrito (prompts en inglés para los modelos). */
const QUICK = [
  { page: 'imagen', icon: '📸', label: 'Retrato de cine', prompt: 'Cinematic close-up portrait of an elderly fisherman with a weathered face and a wool cap, golden hour light, shallow depth of field, 85mm film photo' },
  { page: 'imagen', icon: '⌚', label: 'Foto de producto', prompt: 'Luxury wristwatch on wet black stone, dramatic rim light, water droplets, dark moody studio product photography, ultra detailed' },
  { page: 'video', icon: '🚁', label: 'Dron sobre montañas', prompt: 'Aerial drone shot flying over misty mountains at sunrise, golden light breaking through the clouds, epic scale' },
  { page: 'video', icon: '🌧️', label: 'Ciudad neón', prompt: 'A woman in a red raincoat walks through a neon-lit Tokyo street at night in the rain, the camera tracks alongside her, reflections on the wet ground' },
  { page: 'storyboard', icon: '🍿', label: 'Mini película', prompt: 'A young explorer stands at the edge of a misty jungle cliff at dawn. She climbs down thick vines toward a hidden temple. Inside, golden light pours onto ancient statues. She finds a glowing crystal on a stone altar. The temple starts to shake and rocks fall. She leaps out into the sunlight, triumphant.' },
  { page: 'avatares', icon: '🎙️', label: 'Presentador', prompt: '¡Hola! Hoy les voy a enseñar a crear videos increíbles con inteligencia artificial, todo desde mi propia computadora.' },
  { page: 'audio', icon: '🎻', label: 'Música épica', prompt: 'Epic orchestral trailer music with powerful taiko drums, soaring strings and choir, cinematic build-up' },
  { page: 'imagen', icon: '🐉', label: 'Fantasía', prompt: 'A colossal ancient dragon sleeping on a mountain of gold inside a cathedral-sized cave, shafts of light, volumetric dust, epic fantasy concept art' },
];

const CSS = `
.pg[data-id="explorar"] .ex-hero{position:relative;overflow:hidden;border-radius:16px;padding:26px 22px;margin:-4px 0 6px;
  background:radial-gradient(120% 140% at 0% 0%,#2a3410 0%,transparent 55%),radial-gradient(120% 140% at 100% 100%,#3a1a2a 0%,transparent 55%),var(--panel2);border:1px solid var(--line)}
.pg[data-id="explorar"] .ex-hero h1{font-size:28px;line-height:1.15;margin:0 0 8px;letter-spacing:-.3px}
.pg[data-id="explorar"] .ex-hero h1 em{font-style:normal;color:var(--acc)}
body.he .pg[data-id="explorar"] .ex-hero h1 em{background:linear-gradient(135deg,#ffb35c,#ff5c8a);-webkit-background-clip:text;background-clip:text;color:transparent}
.pg[data-id="explorar"] .ex-hero p{margin:0 0 14px;color:var(--mute);max-width:620px}
.pg[data-id="explorar"] .ex-pill{display:inline-block;font-size:12px;font-weight:700;border:1px solid var(--line);border-radius:99px;padding:3px 10px;margin-bottom:12px;background:#0008}
.pg[data-id="explorar"] .ex-tools{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
.pg[data-id="explorar"] .ex-tile{display:flex;flex-direction:column;gap:4px;text-align:left;border:1px solid var(--line);background:var(--panel2);border-radius:12px;padding:12px;cursor:pointer;min-height:96px}
.pg[data-id="explorar"] .ex-tile:hover{border-color:var(--acc)}
.pg[data-id="explorar"] .ex-tile .ic{font-size:24px}
.pg[data-id="explorar"] .ex-tile b{font-size:14px}
.pg[data-id="explorar"] .ex-tile span{font-size:12px;color:var(--mute);line-height:1.3}
.pg[data-id="explorar"] .ex-ideas{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.pg[data-id="explorar"] .ex-idea{text-align:left;border:1px dashed #3a3a4c;background:none;border-radius:12px;padding:10px;cursor:pointer}
.pg[data-id="explorar"] .ex-idea:hover{border-color:var(--acc);color:var(--acc)}
.pg[data-id="explorar"] .ex-idea small{display:block;color:var(--mute);font-size:11px;margin-top:2px}
.pg[data-id="explorar"] .ex-card{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:12px}
.pg[data-id="explorar"] .ex-prog{height:8px;background:var(--panel3);border-radius:99px;overflow:hidden;margin:8px 0 4px}
.pg[data-id="explorar"] .ex-prog i{display:block;height:100%;background:linear-gradient(90deg,#ffb35c,#ff5c8a);transition:width .4s}
.pg[data-id="explorar"] .ex-eng{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 0;border-top:1px solid var(--line);font-size:13px}
.pg[data-id="explorar"] .ex-eng:first-of-type{border-top:0}
.pg[data-id="explorar"] .ex-eng .tl{color:var(--mute);font-size:11.5px}
.pg[data-id="explorar"] .ex-eng .st{margin-left:auto}
.pg[data-id="explorar"] .ex-eng details{width:100%;font-size:11.5px;color:var(--mute)}
.pg[data-id="explorar"] .ex-eng details summary{cursor:pointer}
.pg[data-id="explorar"] .ok{color:var(--ok)}
.pg[data-id="explorar"] .ex-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
`;

export default {
  id: 'explorar', title: 'Explorar', icon: '🏠', order: 10,
  render(root, ctx) {
    const { core, kit, engines } = ctx; const { h } = kit;
    if (!document.getElementById('ex-style')) document.head.append(h('style', { id: 'ex-style' }, CSS));

    /* ---------- portada ---------- */
    const pill = h('span', { class: 'ex-pill' });
    const drawPill = () => {
      const t = engines.TIER_INFO[core.state.tier] || engines.TIER_INFO.ligero;
      pill.textContent = `${t.icon} Modo ${t.label} · ${t.hint}`;
    };
    const hero = h('div', { class: 'ex-hero' }, pill,
      h('h1', { html: 'Crea como si tuvieras <em>una 4090</em>.' }),
      h('p', {}, 'Imagen, video, avatares, efectos y storyboards con IA que corre en tu propia PC. Usa ⚡ Ligero para ir rápido en tarjetas de 8 GB o 🚀 High End para la máxima calidad (tarda más, pero no rompe nada).'),
      h('div', { class: 'row' },
        h('button', { class: 'btn acc', onclick: () => ctx.goto('imagen') }, '🖼️ Crear una imagen'),
        h('button', { class: 'btn', onclick: () => ctx.goto('video') }, '🎬 Crear un video'),
        h('button', { class: 'btn', onclick: () => ctx.goto('storyboard') }, '🎞️ Hacer un storyboard')));

    /* ---------- herramientas ---------- */
    const tools = h('div', { class: 'ex-tools' });
    const drawTools = () => {
      tools.innerHTML = '';
      for (const t of TOOLS_HOME) {
        tools.append(h('button', { class: 'ex-tile', onclick: () => ctx.goto(t.id) },
          h('span', { class: 'ic' }, t.icon), h('b', {}, t.title), h('span', {}, t.desc)));
      }
    };
    // usa el título/ícono reales de cada página (el módulo ya está en caché: no se vuelve a dibujar nada)
    Promise.all(TOOLS_HOME.map(t => import(`./${t.id}.js`).then(m => {
      if (m.default?.title) t.title = m.default.title;
      if (m.default?.icon) t.icon = m.default.icon;
    }).catch(() => {}))).then(drawTools);

    /* ---------- ideas rápidas ---------- */
    const ideas = h('div', { class: 'ex-ideas' }, QUICK.map(q => h('button', { class: 'ex-idea', title: q.prompt,
      onclick: () => ctx.goto(q.page, { prompt: q.prompt }) }, `${q.icon} ${q.label}`,
    h('small', {}, '→ ' + (TOOLS_HOME.find(t => t.id === q.page)?.title || q.page)))));

    /* ---------- últimas creaciones ---------- */
    const recent = h('div', { class: 'gal' });
    const drawRecent = () => {
      recent.innerHTML = '';
      const items = (core.state.gallery || []).slice(0, 12);
      if (!items.length) { recent.append(h('div', { class: 'note' }, 'Aquí aparecerá lo que crees. ¡Empieza con una idea de arriba! 👆')); return; }
      items.forEach(f => recent.append(ctx.galleryTile(f, { onclick: () => ctx.show(f) })));
    };

    /* ---------- modelos High End ---------- */
    const models = h('div', { class: 'ex-card' });
    const drawModels = () => {
      models.innerHTML = '';
      const inst = core.state.installed;
      const head = h('div', { class: 'ex-head' }, h('b', {}, '🚀 Modelos High End'),
        h('button', { class: 'btn sm', onclick: () => { core.refreshModels(); kit.toast('Revisando modelos…', 'info', 2000); } }, '🔄 Revisar'));
      models.append(head);
      if (!inst) { models.append(h('div', { class: 'note' }, 'Revisando qué modelos tienes…')); return; }
      const sizes = Object.fromEntries(Object.entries(inst).map(([k, v]) => [k.toLowerCase(), v]));
      const he = engines.ENGINES.filter(e => e.tier === 'highend' || e.tier === 'experimental');
      const allFiles = [...new Set(he.flatMap(e => e.files || []).map(f => f.toLowerCase()))];
      const have = allFiles.filter(f => f in sizes);
      const gb = have.reduce((s, f) => s + (+sizes[f] || 0), 0);
      const pct = allFiles.length ? Math.round(have.length / allFiles.length * 100) : 100;
      const ready = he.filter(e => !engines.missingFiles(e, inst).length && e.ramGB <= engines.RAM_CAP).length;
      models.append(
        h('div', { class: 'ex-prog' }, h('i', { style: { width: pct + '%' } })),
        h('div', { class: 'note' }, `${have.length} de ${allFiles.length} archivos (${gb.toFixed(0)} GB) · ${ready} de ${he.length} motores listos` +
          (pct < 100 ? ' · la descarga sigue en segundo plano; esto se actualiza solo.' : ' · ¡todo listo! 🎉')));
      const lig = engines.ENGINES.filter(e => e.tier === 'ligero');
      const ligReady = lig.filter(e => !engines.missingFiles(e, inst).length).length;
      models.append(h('div', { class: 'note' }, `⚡ Ligero: ${ligReady} de ${lig.length} motores listos.`));
      const list = h('div', { style: { marginTop: '8px' } });
      // primero lo que falta (para ver el avance), luego lo listo
      const rows = he.map(e => ({ e, miss: engines.missingFiles(e, inst) }))
        .sort((a, b) => (b.miss.length > 0) - (a.miss.length > 0) || (engines.TOOLS[a.e.tool] || '').localeCompare(engines.TOOLS[b.e.tool] || ''));
      for (const { e, miss } of rows) {
        const t = engines.TIER_INFO[e.tier] || {};
        const st = e.ramGB > engines.RAM_CAP ? h('span', { class: 'badge lock st' }, `🔒 no cabe (${e.ramGB} GB RAM)`)
          : miss.length ? h('span', { class: 'badge miss st' }, `⬇ faltan ${miss.length} de ${(e.files || []).length}`)
            : h('span', { class: 'badge st ok' }, '✓ listo');
        list.append(h('div', { class: 'ex-eng' },
          h('span', {}, t.icon || '•'), h('b', {}, e.name), h('span', { class: 'tl' }, engines.TOOLS[e.tool] || e.tool), st,
          miss.length ? h('details', {}, h('summary', {}, 'Ver archivos que faltan'),
            h('div', {}, miss.map(f => h('div', {}, '⬇ ' + f)))) : null));
      }
      if (!he.length) list.append(h('div', { class: 'note' }, 'Todavía no hay motores High End registrados.'));
      models.append(list);
    };

    root.append(
      hero,
      kit.step('✦', 'Herramientas'), tools,
      kit.step('💡', 'Empieza con una idea', '(te lleva a la herramienta con el prompt listo)'), ideas,
      h('div', { class: 'ex-head' }, kit.step('🕘', 'Tus últimas creaciones'),
        h('button', { class: 'btn sm', onclick: () => ctx.goto('biblioteca') }, 'Ver todo en la Biblioteca →')),
      recent,
      kit.step('⬇', 'Estado de los modelos'), models,
    );
    drawPill(); drawTools(); drawRecent(); drawModels();
    core.on('tier', drawPill);
    core.on('gallery', drawRecent);
    core.on('models', drawModels);
  },
};
