// Presets de ESTILO (tipo Soul), PALETAS (tipo Soul HEX), luces para Relight, ángulos (Shots)
// y retoque de piel. PURO: sin DOM. Etiquetas en español; el texto que va al modelo, en inglés.

/** Estilos: se AÑADEN al prompt. {id, label, icon, group, text} */
export const STYLES = [
  { id: 'cinematic', label: 'Cinemático', icon: '🎬', group: 'Cine', text: 'cinematic film still, anamorphic lens, dramatic lighting, shallow depth of field, professional color grading' },
  { id: 'film35', label: 'Film 35mm', icon: '🎞️', group: 'Cámara', text: 'shot on 35mm film, Kodak Portra 400, natural film grain, soft highlights, analog photo' },
  { id: 'y2kflash', label: 'Y2K Flash', icon: '📸', group: 'Cámara', text: 'Y2K aesthetic, harsh direct on-camera flash, early 2000s digital point-and-shoot camera look, glossy, slightly overexposed, candid snapshot' },
  { id: 'subtleflash', label: 'Flash sutil', icon: '✨', group: 'Cámara', text: 'subtle fill flash, natural skin tones, soft shadows, candid lifestyle photo' },
  { id: 'editorial', label: 'Editorial', icon: '📰', group: 'Moda', text: 'high-fashion editorial photography, magazine cover quality, styled wardrobe, studio lighting, crisp details' },
  { id: 'street', label: 'Street', icon: '🏙️', group: 'Cámara', text: 'candid street photography, urban setting, natural light, documentary style, 28mm lens' },
  { id: 'studio', label: 'Retrato estudio', icon: '💡', group: 'Retrato', text: 'professional studio portrait, softbox key light, seamless backdrop, 85mm lens, sharp focus on the eyes' },
  { id: 'beauty', label: 'Beauty', icon: '💄', group: 'Retrato', text: 'beauty close-up, flawless lighting, glowing skin, clamshell lighting, high-end cosmetics campaign' },
  { id: 'insta', label: 'Instagram', icon: '📱', group: 'Redes', text: 'Instagram lifestyle aesthetic, warm natural light, airy and bright, influencer photo' },
  { id: 'tiktok', label: 'TikTok core', icon: '🤳', group: 'Redes', text: 'smartphone selfie aesthetic, vertical framing, casual authentic vibe, ring light glow' },
  { id: 'moody', label: 'Moody', icon: '🌧️', group: 'Mood', text: 'moody atmosphere, low key lighting, deep shadows, muted desaturated colors' },
  { id: 'golden', label: 'Hora dorada', icon: '🌅', group: 'Mood', text: 'golden hour sunlight, warm glow, long soft shadows, lens flare' },
  { id: 'noir', label: 'Noir', icon: '🕵️', group: 'Cine', text: 'film noir, black and white, high contrast, hard shadows, venetian blind light, 1940s mood' },
  { id: 'retro70', label: 'Retro 70s', icon: '🕺', group: 'Cine', text: '1970s vintage photo, warm faded colors, soft focus, retro wardrobe and grain' },
  { id: 'polaroid', label: 'Polaroid', icon: '🖼️', group: 'Cámara', text: 'instant Polaroid photo, washed out colors, soft vignette, nostalgic' },
  { id: 'band2000', label: 'Banda 2000s', icon: '🎸', group: 'Redes', text: '2000s indie band promo photo, flash, grungy backdrop, editorial attitude' },
  { id: 'anime', label: 'Anime', icon: '🌸', group: 'Arte', text: 'anime illustration, cel shading, clean line art, vibrant colors, detailed background' },
  { id: 'render3d', label: '3D Render', icon: '🧊', group: 'Arte', text: '3D render, stylized animated movie character style, soft global illumination, high detail' },
  { id: 'clay', label: 'Plastilina', icon: '🧸', group: 'Arte', text: 'claymation style, handmade plasticine figures, stop-motion look, soft studio light' },
  { id: 'watercolor', label: 'Acuarela', icon: '🎨', group: 'Arte', text: 'watercolor painting, soft washes, visible paper texture, delicate brush strokes' },
  { id: 'oil', label: 'Óleo', icon: '🖌️', group: 'Arte', text: 'oil painting, rich impasto brushwork, classical fine art lighting' },
  { id: 'comic', label: 'Cómic', icon: '💥', group: 'Arte', text: 'comic book art, bold ink outlines, halftone shading, dynamic composition' },
  { id: 'pixel', label: 'Pixel art', icon: '👾', group: 'Arte', text: '16-bit pixel art, limited palette, crisp pixels, retro video game style' },
  { id: 'product', label: 'Producto', icon: '📦', group: 'Comercial', text: 'professional product photography, clean background, softbox reflections, commercial advertising quality' },
];

/** Paletas (tipo Soul HEX): se AÑADEN al prompt como descripción de color. colors = muestras para la UI. */
export const PALETTES = [
  { id: 'film', label: 'Film colors', colors: ['#d9a066', '#4f7a80', '#2b3a40', '#efe3cf'], text: 'color palette of classic film tones: warm amber highlights, teal shadows, faded cream whites' },
  { id: 'limejam', label: 'Lime Jam', colors: ['#c6ff3d', '#ff4fa3', '#4b1d6b', '#fff6d6'], text: 'bold color palette of lime green, hot pink and deep purple accents' },
  { id: 'candypink', label: 'Candy pink', colors: ['#ffc2d9', '#ff7eb6', '#fff0f5', '#c9a7ff'], text: 'sweet candy pink color palette, pastel pinks and soft lilac, glossy' },
  { id: 'nostalgic', label: 'Azul nostálgico', colors: ['#7aa5c9', '#2f4f6f', '#d8e4ec', '#a4b8a0'], text: 'nostalgic blue color palette, dusty blues and soft desaturated greens, faded' },
  { id: 'soft', label: 'Suave', colors: ['#f3e9dc', '#d6c3b0', '#b7a99a', '#8e8a85'], text: 'soft neutral color palette, beige, sand and warm greys, low contrast' },
  { id: 'blackgloss', label: 'Black gloss', colors: ['#0b0b0b', '#2a2a2a', '#c0c0c0', '#ffffff'], text: 'black gloss color palette, deep blacks, glossy reflections, silver highlights' },
  { id: 'neon', label: 'Neón', colors: ['#ff2fd1', '#00e5ff', '#6a00ff', '#0a0a1f'], text: 'neon color palette, electric magenta and cyan glow against dark blue night' },
  { id: 'earth', label: 'Tierra', colors: ['#8c5a3c', '#c49a6c', '#5e6b3a', '#e8dcc2'], text: 'earthy color palette, terracotta, ochre, olive green and sand' },
  { id: 'ocean', label: 'Océano', colors: ['#0e4d64', '#137c8b', '#7fd1c7', '#f2f7f5'], text: 'ocean color palette, deep teal, turquoise and sea foam white' },
  { id: 'mono', label: 'Monocromo', colors: ['#111111', '#555555', '#aaaaaa', '#eeeeee'], text: 'monochrome black and white palette' },
  { id: 'sunset', label: 'Atardecer', colors: ['#ff7a3d', '#ff3d6e', '#7b2cbf', '#ffd166'], text: 'sunset color palette, orange, coral pink, violet and golden yellow' },
  { id: 'pastel', label: 'Pastel', colors: ['#bde0fe', '#ffc8dd', '#cdeac0', '#fff1b6'], text: 'pastel color palette, baby blue, blush pink, mint and butter yellow' },
];

/** Luces para Relight. text = estilo de luz (inglés); se arma la instrucción en la página. */
export const RELIGHT = [
  { id: 'golden', label: 'Hora dorada', icon: '🌅', text: 'warm golden hour sunlight, low sun, long soft shadows, warm color temperature' },
  { id: 'sunsetback', label: 'Contraluz atardecer', icon: '🌇', text: 'sunset backlight, strong warm rim light from behind, glowing hair edges, soft lens flare' },
  { id: 'softbox', label: 'Softbox de estudio', icon: '💡', text: 'soft studio softbox key light at 45 degrees, gentle fill, clean even skin tones' },
  { id: 'rim', label: 'Luz de borde', icon: '✴️', text: 'dual rim backlight, twin hard lights from behind left and right, glowing edge separation, dark dramatic fill' },
  { id: 'rembrandt', label: 'Rembrandt', icon: '🎭', text: 'Rembrandt lighting, side key slightly above, triangle of light on the cheek, deep falloff, subtle rim separation' },
  { id: 'split', label: 'Split', icon: '🌓', text: 'split lighting, hard side key at 90 degrees, one half of the face lit and the other half in deep shadow, minimal fill' },
  { id: 'neon', label: 'Noche de neón', icon: '🌃', text: 'neon night lighting, magenta and cyan neon signs casting colored light, wet reflections, dark surroundings' },
  { id: 'cyberpunk', label: 'Cyberpunk', icon: '🤖', text: 'cyberpunk lighting, intense teal and hot pink light, holographic glow, high contrast' },
  { id: 'candle', label: 'Velas', icon: '🕯️', text: 'warm candlelight, flickering orange glow from below, intimate dark room, soft falloff' },
  { id: 'overcast', label: 'Nublado', icon: '☁️', text: 'soft overcast daylight, diffused shadowless light, neutral cool tones' },
  { id: 'moon', label: 'Luz de luna', icon: '🌙', text: 'cool blue moonlight at night, soft silver highlights, deep blue shadows' },
  { id: 'twilight', label: 'Crepúsculo', icon: '🌆', text: 'twilight light with a warm color temperature, soft light and blurred shadows' },
  { id: 'topdown', label: 'Cenital dura', icon: '⬇️', text: 'hard top-down overhead key light, harsh light directly above, deep under-eye and jaw shadows, theatrical' },
  { id: 'window', label: 'Ventana', icon: '🪟', text: 'soft natural window light from the side, gentle gradient shadows, airy indoor mood' },
  { id: 'fire', label: 'Fogata', icon: '🔥', text: 'warm flickering firelight from below and the side, orange glow, dark night background' },
  { id: 'club', label: 'Antro / club', icon: '🪩', text: 'nightclub lighting, colorful stage spotlights, purple and blue haze, light beams' },
];
/** Dirección e intensidad de la luz para Relight. */
export const LIGHT_DIR = [
  ['', 'Automática'], ['from the left', '⬅️ Izquierda'], ['from the right', '➡️ Derecha'], ['from the front', '⬆️ Frente'],
  ['from behind the subject', '🔙 Atrás'], ['from above', '🔝 Arriba'], ['from below', '🔻 Abajo'],
];
export const LIGHT_POWER = [
  ['soft', 'Suave', 'soft, subtle and natural'], ['normal', 'Normal', 'balanced, natural intensity'], ['strong', 'Dramática', 'strong, dramatic and high contrast'],
];

/** Ángulos de cámara para Shots (formulación de las plantillas Qwen multi-angle). */
export const ANGLES = [
  { id: 'closeup', label: 'Primer plano', icon: '🔍', text: 'Turn the camera to a close-up.' },
  { id: 'xcu', label: 'Detalle', icon: '👁️', text: 'Turn the camera to an extreme close-up of the face.' },
  { id: 'wide', label: 'Plano abierto', icon: '🏞️', text: 'Turn the camera to a wide shot that shows the full body and the surroundings.' },
  { id: 'wideangle', label: 'Gran angular', icon: '📐', text: 'Turn the camera to a wide-angle lens.' },
  { id: 'low', label: 'Contrapicado', icon: '⤴️', text: 'Turn the camera to a low-angle view.' },
  { id: 'high', label: 'Picado', icon: '⤵️', text: 'Turn the camera to a high-angle view looking down at the subject.' },
  { id: 'aerial', label: 'Aéreo', icon: '🚁', text: 'Turn the camera to an aerial view.' },
  { id: 'left45', label: '3/4 izquierda', icon: '↖️', text: 'Rotate the camera 45 degrees to the left.' },
  { id: 'right45', label: '3/4 derecha', icon: '↗️', text: 'Rotate the camera 45 degrees to the right.' },
  { id: 'profileL', label: 'Perfil izq.', icon: '⬅️', text: 'Rotate the camera 90 degrees to the left.' },
  { id: 'profileR', label: 'Perfil der.', icon: '➡️', text: 'Rotate the camera 90 degrees to the right.' },
  { id: 'back', label: 'De espaldas', icon: '🔙', text: 'Rotate the camera 180 degrees to show the subject from behind.' },
  { id: 'ots', label: 'Sobre el hombro', icon: '🧍', text: 'Turn the camera to an over-the-shoulder shot from behind the subject.' },
  { id: 'dutch', label: 'Holandés', icon: '📐', text: 'Tilt the camera to a dutch angle.' },
];
/** Frase que se añade a cada toma para mantener la continuidad. */
export const ANGLE_KEEP = 'Keep the same person, face, outfit, scene and lighting.';

/** Retoque de piel (tipo Skin Enhancer). */
export const SKIN = [
  ['natural', '🌿 Natural', 'Retouch the skin very subtly: reduce temporary blemishes, acne and redness, keep natural skin texture, pores and freckles.'],
  ['pulido', '✨ Pulido', 'Retouch the skin: remove blemishes, acne, redness and dark circles, even out the skin tone, keep realistic skin texture and pores.'],
  ['glam', '💎 Glam', 'Apply high-end beauty retouching: flawless even skin, soft glow, reduced shine and wrinkles, while keeping realistic skin texture.'],
];
export const SKIN_KEEP = 'Do not change the face shape, identity, expression, eyes, makeup, hair, clothing, lighting or background.';
