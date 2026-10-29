// Página "Apps": directorio de herramientas de un clic, como la sección Apps.
const APPS = [
  ['Imagen', [
    ['🖼️', 'Crear imagen', 'Texto a imagen con estilos y paletas', 'imagen', {}],
    ['👤', 'Personaje consistente', 'La misma persona en cualquier escena', 'imagen', {}],
    ['✏️', 'Editar con texto', 'Pide cambios y la IA los hace', 'editar', { tab: 'libre' }],
    ['💡', 'Relight', 'Cambia la luz: golden hour, neón, estudio…', 'editar', { tab: 'relight' }],
    ['✂️', 'Quitar fondo', 'PNG transparente o fondo nuevo', 'editar', { tab: 'bg' }],
    ['↔️', 'Expandir imagen', 'Cambia el formato rellenando con IA', 'editar', { tab: 'expand' }],
    ['👗', 'Cambiar outfit', 'Ponle otra ropa a la persona', 'editar', { tab: 'outfit' }],
    ['📦', 'Producto en escena', 'Coloca un producto en una foto', 'editar', { tab: 'producto' }],
    ['🎥', 'Ángulos / Shots', 'La misma escena desde varios ángulos', 'editar', { tab: 'shots' }],
    ['✨', 'Retoque de piel', 'Piel natural, pulida o glam', 'editar', { tab: 'piel' }],
  ]],
  ['Video', [
    ['🎬', 'Animar imagen', 'Da vida a cualquier foto', 'video', {}],
    ['🎥', 'Movimientos de cámara', 'Dolly, crash zoom, órbita, dron…', 'camara', {}],
    // ['✨', 'Efectos VFX',   // 29-oct: página escondida
    // 'Inflar, explotar, electrizar…', 'efectos', {}],
    ['🎭', 'Recast', 'Copia el movimiento de un video a tu personaje', 'recast', {}],
    ['✏️', 'Dibujar movimiento', 'Traza flechas y el video las sigue', 'dibujar', {}],
    ['🎞️', 'Storyboard', '8 escenas consistentes → película', 'storyboard', {}],
  ]],
  ['Voz y audio', [
    ['🗣️', 'Foto que habla', 'Lipsync con tu texto o tu audio', 'avatares', {}],
    ['🎵', 'Música', 'Canciones e instrumentales con IA', 'audio', { tab: 'music' }],
    ['🔊', 'Sonido para video', 'Efectos de sonido que siguen la imagen', 'audio', { tab: 'sfx' }],
    ['🎙️', 'Voz', 'Texto a voz en 23 idiomas, clona voces', 'audio', { tab: 'voice' }],
  ]],
  ['Mejorar', [
    ['💎', 'Mejorar a HD', 'Real-ESRGAN o SeedVR2 3B/7B', 'mejorar', { tab: 'hd' }],
    ['🎞️', 'Más fluidez', 'Duplica o cuadruplica los FPS', 'mejorar', { tab: 'fps' }],
    ['🧍', 'Recortar sujeto', 'Separa a la persona del video', 'mejorar', { tab: 'cut' }],
  ]],
];

export default {
  id: 'apps', title: 'Apps', icon: '🧩', order: 105,
  render(root, ctx) {
    const { h } = ctx.kit;
    root.append(h('h1', {}, '🧩 Apps'), h('p', { class: 'sub' }, 'Todas las herramientas a un clic. En modo 🚀 High End usan los modelos más grandes.'));
    for (const [sec, list] of APPS) {
      root.append(h('div', { class: 'step' }, sec));
      const tiles = h('div', { class: 'tiles' });
      for (const [ico, name, desc, page, payload] of list) {
        tiles.append(h('button', { class: 'tile', onclick: () => ctx.goto(page, payload) }, h('div', { class: 'ti' }, ico), h('b', {}, name), h('span', {}, desc)));
      }
      root.append(tiles);
    }
  },
};
