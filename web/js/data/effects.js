// EFECTOS estilo Effects (LoRAs Remade-AI para Wan 2.1, aplicadas a AMBOS expertos de Wan 2.2, fuerza 1).
// PURO: lo usan pages/efectos.js y pages/video.js (selector rápido).
//   kind 'i2v' → efecto sobre TU FOTO (necesita imagen inicial). prompt con {subject} = "qué hay en la imagen" (inglés, sin artículo).
//   kind 't2v' → ESTILO de video (solo texto). prompt con {subject} = la escena que describes; dflt = escena de ejemplo.
// Disparadores (trigger) leidos de cada repo de Remade-AI. Miniaturas propias: fx_thumbs.js
import { thumbOf } from './fx_thumbs.js';
const fx = (id, repo, ext, group, icon, label, prompt, { alt, ...extra } = {}) => ({
  id, repo, group, icon, label, prompt, kind: group === 'estilo' ? 't2v' : 'i2v', preview: thumbOf(id),
  lora: { file: `remade/${repo}.safetensors`, strength: 1, target: 'both', ...(alt ? { alt } : {}) }, ...extra,
});

export const FX_GROUPS = [['all', 'Todos'], ['trans', 'Transformaciones'], ['accion', 'Acción'], ['emo', 'Emociones'], ['estilo', 'Estilos de video']];

const ALL_EFFECTS = [
  /* ---------- Acción / VFX ---------- */
  fx('squish', 'Squish', 'gif', 'accion', '🤏', 'Aplastar',
    "In the video, a miniature {subject} is presented. The {subject} is held in a person's hands. The person then presses on the {subject}, causing a sq41sh squish effect. The person keeps pressing down on the {subject}, further showing the sq41sh squish effect.",
    { alt: 'efectos/squish_18.safetensors', dflt: 'object' }),
  fx('cakeify', 'Cakeify', 'gif', 'accion', '🎂', 'Es un pastel',
    'The video opens on a {subject}. A knife, held by a hand, is coming into frame and hovering over the {subject}. The knife then begins cutting into the {subject} to c4k3 cakeify it. As the knife slices the {subject} open, the inside of the {subject} is revealed to be cake with chocolate layers.',
    { alt: 'efectos/cakeify_16_epochs.safetensors', dflt: 'object' }),
  fx('inflate', 'Inflate', 'mp4', 'accion', '🎈', 'Inflar',
    'The video opens on a {subject}. Then the {subject} infl4t3 inflates it, expanding into a giant, inflated balloon-like version of itself.',
    { alt: 'efectos/inflate_20_epochs.safetensors' }),
  fx('deflate', 'Deflate', 'mp4', 'accion', '🫠', 'Desinflar',
    'The video opens with a {subject}. As the video progresses, the {subject} begins to d3d1at3 deflate it, gradually shrinking and losing shape, eventually flattening completely into a lifeless, deflated mass on the ground.'),
  fx('crush', 'Crush', 'mp4', 'accion', '🗜️', 'Prensa hidráulica',
    'The video begins with a {subject}. A hydraulic press positioned above slowly descends towards the {subject}. Upon contact, the hydraulic press c5us4 crushes it, deforming and flattening the {subject}, causing it to collapse inward until it is no longer recognizable.',
    { dflt: 'object' }),
  fx('rotate', 'Rotate', 'gif', 'accion', '🔄', 'Girar 360°',
    'The video shows a {subject}. The {subject} performs a r0t4tion 360 degrees rotation.'),
  fx('explode', 'Explode', 'mp4', 'accion', '💥', 'Explotar',
    'The video opens with a close-up of a {subject}. Then the {subject} 3xp105ion huge explosion that engulfs the entire screen with a bright light, obscuring the {subject} and its surroundings.'),
  fx('electrify', 'Electrify', 'mp4', 'accion', '⚡', 'Electrizar',
    'E13c7r1c electricity effect: bright electric arcs and lightning streak around the {subject}, crackling and illuminating it with flashes of blue light.'),
  fx('hero_run', 'Hero-run', 'gif', 'accion', '🏃', 'Carrera épica',
    'The {subject} is poised in a starting position, facing the camera. Then the {subject} explodes forward, beginning the 4ct3ion Action Run directly towards the camera, dynamic and powerful.'),
  fx('jumpscare', 'Jumpscare', 'mp4', 'accion', '😱', 'Susto',
    'The video shows a {subject} with a slight smile, then the j432mpscare jumpscare occurs, revealing a distorted and monstrous face with glowing red eyes, filling the frame.'),

  /* ---------- Transformaciones ---------- */
  fx('bride', 'Bride', 'gif', 'trans', '👰', 'Novia',
    'The video starts with a close-up of a smiling {subject}, then the 8r1d3 bride effect happens. The {subject} is now in a white lace wedding dress, smiling, holding a bouquet of white flowers.'),
  fx('baby', 'Baby', 'gif', 'trans', '👶', 'Bebé',
    'The video starts with a portrait of a {subject}. Then the image shifts to the 848y baby effect: the {subject} is a baby in front of a crib, surrounded by toys, excited and amused.'),
  fx('puppy', 'Puppy', 'mp4', 'trans', '🐶', 'Lluvia de cachorros',
    'The video begins with a close-up portrait of a {subject}. The background changes and then the pu11y puppy effect begins. The {subject} is now surrounded by many puppies and pets them.'),
  fx('princess', 'Princess', 'mp4', 'trans', '👸', 'Princesa',
    'The video begins with an image of a {subject}. A pr1nc355 princess transformation then happens as white sparkling light appears around the shoulders and chest. The {subject} is now wearing a tiara and a long, silver beaded gown.'),
  fx('samurai', 'Samurai', 'gif', 'trans', '⚔️', 'Samurái',
    'The video begins with a {subject}. The {subject} begins the 54mur41 samurai transformation and becomes a samurai, wearing a traditional samurai outfit and holding a katana, in front of a misty mountainous landscape.'),
  fx('warrior', 'Warrior', 'gif', 'trans', '🪓', 'Guerrero',
    'The video starts with a {subject}. The effect seen is warr10r warrior it. The {subject} now appears as a warrior with an axe, in front of a mountain range.'),
  fx('jungle', 'Jungle', 'gif', 'trans', '🌴', 'Selva',
    'The video begins with a portrait of a {subject}. Next, the 1ung13 jungle transformation occurs. The {subject} is now in a sunlit jungle with tribal markings, swinging from a vine in a dynamic pose.'),
  fx('vip', 'VIP', 'gif', 'trans', '🌟', 'Alfombra roja',
    "The video begins with an image of a {subject}. Then the v1p red carpet transformation appears: the {subject} is wearing elegant black clothes and gold jewelry, posing on the red carpet among photographers' flashes."),
  fx('zen', 'Zen', 'gif', 'trans', '🧘', 'Zen',
    'The video starts with a portrait of a {subject}. The scene then transitions to the z3n1fy zen transformation: the {subject} wears a pink robe in a zen garden, calm and serene.'),
  fx('classy', 'Classy', 'mp4', 'trans', '🎩', 'Elegante',
    'The video starts with a {subject}. The c1455y classy transformation occurs and the {subject} is now elegantly dressed, smiling at the camera, seated at a wooden table with a gold and brown background.'),
  fx('painting', 'Painting', 'mp4', 'trans', '🎨', 'Cuadro clásico',
    'The video starts with a {subject}. Next, the {subject} transforms into a p41nt1ng painting frame it, dressed in classical clothing inside an old style painting with a gold frame.'),
  fx('robot', 'Robot-Face-Reveal', 'mp4', 'trans', '🤖', 'Cara de robot',
    "The {subject}'s face, with the r8b8t1c robotic face reveal starting with subtle movements, then lines appear on the face as the robot face is revealed."),

  /* ---------- Emociones ---------- */
  fx('crying', 'crying', 'mp4', 'emo', '😢', 'Llorar',
    'The video starts with a {subject}, appearing with a sad expression. Then a tear rolls down the cheek, as the {subject} is cr471ng crying.'),
  fx('laughing', 'Laughing', 'mp4', 'emo', '😂', 'Carcajada',
    'The {subject} starts by looking into the camera and smiling and then starts l4a6ing laughing. The {subject} is still l4a6ing laughing at the end.'),
  fx('angry', 'angry-face', 'mp4', 'emo', '😡', 'Enojo',
    'The {subject} begins with a neutral expression. The expression changes to 4ngr23 angry face, and the {subject} starts yelling, throwing their arms up while making the 4ngr23 angry face.'),
  fx('selfie_younger', 'Selfie-With-Younger-Self', 'mp4', 'emo', '🤳', 'Selfie con tu yo joven',
    'The video starts with a {subject} smiling at the camera, then s31lf13 taking a selfie with their younger self, and the younger self appears next to them with similar facial features and eye color, smiling.'),

  /* ---------- Estilos de video (texto → video) ---------- */
  fx('vhs', 'Vintage-VHS', 'mp4', 'estilo', '📼', 'VHS vintage', 'vh5_c4m3r4 old VHS style, {subject}',
    { dflt: 'the video starts with a close-up of a wall covered in graffiti, then the camera slowly pans to reveal a man walking through a doorway.' }),
  fx('noir', 'Film-Noir', 'mp4', 'estilo', '🎞️', 'Cine negro', 'f11m_n01r film noir, black and white video, {subject}',
    { dflt: 'a man in a dark trench coat and fedora stands under a flickering streetlamp in a deserted alley, rain slicks the pavement.' }),
  fx('fire', 'Fire', 'mp4', 'estilo', '🔥', 'Fuego real', '[r3al_f1re] {subject}',
    { dflt: 'A lone tree stands silhouetted against a wildfire consuming a vast forest, the sky filled with smoke.' }),
  fx('tornado', 'Tornado', 'mp4', 'estilo', '🌪️', 'Tornado', '{subject}, a giant t0r54d0 tornado swirls through the scene, sending debris flying in all directions.',
    { dflt: 'An empty city street' }),
  fx('tsunami', 'Tsunami', 'mp4', 'estilo', '🌊', 'Tsunami', 'The video shows {subject} hit by a t5un@m1 realistic tsunami, buildings are flooded and debris litters the streets.',
    { dflt: 'a coastal village' }),
  fx('tiny_planet', 'Tiny-Planet-Fisheye', 'mp4', 'estilo', '🪐', 'Planeta mini', 'Little planet view fisheye lens {subject}',
    { dflt: 'The video depicts a desert with towering red rock formations, rendered into a miniature spinning planet under a dusky sky.' }),
  fx('ultra_wide', 'Ultra-Wide', 'mp4', 'estilo', '📐', 'Ultra gran angular', 'u1tr4_w1d3, ultra wide angle shot {subject}',
    { dflt: 'A lone figure walks across a desolate, rocky landscape under a swirling orange and purple sky.' }),
  fx('pov_driving', 'POV-Driving', 'mp4', 'estilo', '🚗', 'Manejando POV',
    'p0v_dr1v1n6, video shows a person driving a car through {subject}. The driver is holding the steering wheel with both hands, looking straight ahead.',
    { dflt: 'a neon-lit city at night' }),
  fx('animal_doc', 'Animal-Documentary', 'mp4', 'estilo', '🦁', 'Documental animal', '4n1m4l animal documentary {subject}',
    { dflt: 'The video shows a close-up of a chimpanzee grooming its infant in a lush green jungle.' }),
  fx('cats', 'Cats', 'mp4', 'estilo', '🐱', 'Gatos', 'ca45t cat video {subject}',
    { dflt: 'A tabby cat sits on a wooden fence watching a butterfly, slowly lifting a paw to swipe at it.' }),
  fx('dogs', 'Dogs', 'mp4', 'estilo', '🐕', 'Perros', 'd48g dog video {subject}',
    { dflt: 'A beagle puppy sits in a basket on a bicycle, ears flapping in the wind as the bike moves forward.' }),
  fx('boxing', 'Boxing', 'mp4', 'estilo', '🥊', 'Box', 'B0x13ng Boxing video {subject}',
    { dflt: 'two boxers in the ring, the shorter one throwing fast punches while the taller one keeps her at a distance.' }),
  fx('abandoned', 'Abandoned-Places', 'mp4', 'estilo', '🏚️', 'Lugares abandonados', 'abandoned places {subject}',
    { dflt: 'A steady zoom-out of a tall abandoned building covered in vines in the middle of a foggy, abandoned city.' }),
  fx('eye', 'Eye-Close-Up', 'mp4', 'estilo', '👁️', 'Ojo extremo', '3y3_cl053 eye extreme close up, {subject}',
    { dflt: 'The video shows a close up of a green cat-like eye with a shimmering emerald iris.' }),
  fx('fantasy', 'Fantasy-Landscapes', 'mp4', 'estilo', '🏞️', 'Paisaje fantástico', 'f4nt4sy_sc3n3 fantasy landscape, {subject}',
    { dflt: 'A winding river flows through a lush valley with towering mountains, a floating island hovers in an orange and blue sky.' }),
];

// Ocultos tras la prueba con Phany (noche 28-oct): cambian la identidad o no muestran nada. Para volver a mostrar uno, quítalo de aquí.
export const HIDDEN_FX = ['classy', 'samurai', 'painting', 'robot',
  'abandoned', 'animal_doc', 'boxing', 'cats', 'dogs', 'fantasy', 'fire', 'tiny_planet', 'ultra_wide', 'vhs'];
export const EFFECTS = ALL_EFFECTS.filter(e => !HIDDEN_FX.includes(e.id));

export const effectById = id => EFFECTS.find(e => e.id === id) || null;

/** Prompt final de un efecto. subject = "qué hay en la imagen" (i2v) o la escena (t2v). */
export function fillEffect(e, subject) {
  const s = String(subject || '').trim().replace(/\.$/, '') || e.dflt || (e.kind === 'i2v' ? 'person' : 'a cinematic scene');
  return e.prompt.split('{subject}').join(s);
}
