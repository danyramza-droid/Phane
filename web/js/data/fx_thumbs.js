// Miniaturas PROPIAS de ✨ Efectos: un personaje ORIGINAL en vez de los ejemplos de terceros.
// Para generarlas: llena HEROES con tus personajes (foto en input/personajes/...), asigna efectos en FX_THUMBS
// y genera un video corto por efecto en web/previews/phane/<efecto>.mp4 (Wan ligero en borrador).
export const HEROES = {};
/** efecto -> personaje. Los efectos sin miniatura propia muestran la de su repo de LoRA (si existe). */
export const FX_THUMBS = {};
export const thumbOf = id => (FX_THUMBS[id] ? `/phane/static/previews/phane/${id}.mp4` : null);
