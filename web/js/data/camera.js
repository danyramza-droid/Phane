// Presets de CÁMARA estilo "Camera Controls". PURO: lo usan pages/video.js (y quien quiera).
// Cada preset: { id, label, icon, group, prompt (frase de cámara en inglés), preview?, lora?, pose? }
//   lora: { file (relativo a models/loras, con '/'), strength, target:'high'|'both', only?:'i2v' }
//         - LoRAs Civitai Wan 2.2 (loras/camara/): solo experto HIGH.
//         - LoRAs Remade-AI (Wan 2.1 I2V, loras/remade/): AMBOS expertos; sin imagen (T2V) se usa solo el texto.
//   pose: movimiento EXACTO con Wan 2.2 Fun Camera (requiere imagen inicial, sin imagen final, ≤ 5 s).
const PV = f => null;  // copia publica: sin vistas previas de Remade-AI (sale el icono)
/** Miniaturas PROPIAS con Phany (27-oct, sesión GPU: cam_<id>.mp4) en vez de las de Remade-AI. PV se queda (build.py lo busca). */
const CAM = id => `/phane/static/previews/phane/cam_${id}.mp4`;
const civ = file => ({ file: 'camara/' + file, strength: 1, target: 'high' });
const rem = repo => ({ file: `remade/${repo}.safetensors`, strength: 1, target: 'both', only: 'i2v' });

export const CAM_GROUPS = [
  ['all', 'Todas'], ['basic', 'Básicos'], ['pan', 'Paneo'], ['dolly', 'Dolly'], ['zoom', 'Zoom'], ['crane', 'Grúa y dron'],
  ['orbit', 'Órbita'], ['pov', 'POV'], ['vehicle', 'Vehículo'], ['time', 'Tiempo'], ['style', 'Estilo'], ['exact', '🎯 Exacta'],
];

export const CAMERA = [
  /* ---------- básicos ---------- */
  { id: 'static', group: 'basic', icon: '🎯', label: 'Fija', prompt: 'Static locked-off camera on a tripod, no camera movement.' },
  { id: 'handheld', group: 'basic', icon: '🤳', label: 'En mano', prompt: 'Handheld shaky camera following the subject, documentary style, natural micro-movements.' },

  /* ---------- paneo / inclinación ---------- */
  { id: 'pan_left', group: 'pan', icon: '👈', label: 'Paneo izq.', prompt: 'The camera pans smoothly to the left across the scene.' },
  { id: 'pan_right', group: 'pan', icon: '👉', label: 'Paneo der.', prompt: 'The camera pans smoothly to the right across the scene.' },
  { id: 'tilt_up', group: 'pan', icon: '⤴️', label: 'Inclinar arriba', prompt: 'The camera tilts up slowly, revealing what is above the subject.' },
  { id: 'tilt_down', group: 'pan', icon: '⤵️', label: 'Inclinar abajo', prompt: 'The camera tilts down slowly toward the ground.' },
  { id: 'whip_pan', group: 'pan', icon: '💨', label: 'Whip pan', prompt: 'A sudden whip pan: the camera swings very fast to the side with strong motion blur, then settles on the subject.' },
  { id: 'dutch', group: 'pan', icon: '📐', label: 'Ángulo holandés', prompt: 'Dutch angle shot: the camera is tilted sideways, the horizon is slanted, creating tension.' },

  /* ---------- dolly ---------- */
  { id: 'dolly_in', group: 'dolly', icon: '➡️', label: 'Acercarse', prompt: 'The camera slowly dollies in toward the subject.' },
  { id: 'dolly_out', group: 'dolly', icon: '⬅️', label: 'Alejarse', prompt: 'The camera slowly pulls back, revealing the whole scene.' },
  { id: 'dolly_left', group: 'dolly', icon: '⏪', label: 'Dolly izq.', prompt: 'The camera tracks sideways to the left on a dolly, parallel to the subject.' },
  { id: 'dolly_right', group: 'dolly', icon: '⏩', label: 'Dolly der.', prompt: 'The camera tracks sideways to the right on a dolly, parallel to the subject.' },
  { id: 'super_dolly_in', group: 'dolly', icon: '🚀', label: 'Super dolly in', prompt: 'A fast, dramatic dolly in: the camera rushes forward from a wide shot to a close-up of the subject.' },
  { id: 'super_dolly_out', group: 'dolly', icon: '🛸', label: 'Super dolly out', prompt: 'A fast, dramatic dolly out: the camera rushes backward from a close-up to a very wide shot.' },
  { id: 'dolly_zoom_in', group: 'dolly', icon: '🌀', label: 'Vértigo', prompt: 'Dolly-zoom shot, the subject of the shot maintains the same size in the frame while the background appears to stretch.' },
  { id: 'dolly_zoom_out', group: 'dolly', icon: '🎞️', label: 'Vértigo reverso', preview: CAM('dolly_zoom_out'),
    prompt: "d011Ye33ect dolly effect. The camera slowly zooms out, keeping the subject's face centered while the background stretches.",
    lora: rem('Dolly-Effect') },

  /* ---------- zoom ---------- */
  { id: 'zoom_in', group: 'zoom', icon: '🔍', label: 'Zoom in', prompt: 'The camera zooms in smoothly on the subject.' },
  { id: 'zoom_out', group: 'zoom', icon: '🔭', label: 'Zoom out', prompt: 'The camera zooms out smoothly, revealing the surroundings.' },
  { id: 'crash_zoom_in', group: 'zoom', icon: '💥', label: 'Crash zoom',
    prompt: "Rapid zoom in effect, zoom in on face. Sudden fast crash zoom into the subject's face." },
  { id: 'rapid_zoom_in', group: 'zoom', icon: '⚡', label: 'Zoom rápido in', preview: CAM('rapid_zoom_in'),
    prompt: "The camera performs a cr34sh crash zoom in effect, rapidly zooming closer to the subject's face.", lora: rem('Crash-zoom-in') },
  { id: 'crash_zoom_out', group: 'zoom', icon: '💫', label: 'Crash zoom out', preview: CAM('crash_zoom_out'),
    prompt: 'A cr34sh crash zoom out effect rapidly pulls the camera back, revealing the whole scene around the subject.', lora: rem('Crash-zoom-out') },
  { id: 'yoyo_zoom', group: 'zoom', icon: '🪀', label: 'Zoom yoyo', prompt: 'YoYo zoom: the camera zooms in quickly on the subject, then zooms back out, then in again, rhythmic and playful.' },

  /* ---------- grúa / aérea ---------- */
  { id: 'crane_up', group: 'crane', icon: '⬆️', label: 'Grúa arriba', preview: CAM('crane_up'),
    prompt: "The cr4n3 crane up effect is applied, smoothly lifting the camera's viewpoint higher and revealing more of the surrounding landscape.",
    lora: rem('Crane_up') },
  { id: 'crane_down', group: 'crane', icon: '⬇️', label: 'Grúa abajo', preview: CAM('crane_down'),
    prompt: 'The cr4n3 crane down camera motion begins high above the subject and slowly lowers the view closer to them.', lora: rem('Crane-down') },
  { id: 'crane_over', group: 'crane', icon: '🙆', label: 'Sobre la cabeza', preview: CAM('crane_over'),
    prompt: 'The camera begins a cr4n3 crane over the head movement, rising smoothly upwards over the subject and ending in a high-angle shot looking down.',
    lora: rem('Crane_over_the_head') },
  { id: 'jib_up', group: 'crane', icon: '🏗️', label: 'Jib arriba', prompt: 'Jib up shot: the camera rises vertically on a jib arm while staying pointed at the subject.' },
  { id: 'jib_down', group: 'crane', icon: '🪝', label: 'Jib abajo', prompt: 'Jib down shot: the camera descends vertically on a jib arm while staying pointed at the subject.' },
  { id: 'aerial_pullback', group: 'crane', icon: '🛫', label: 'Retirada aérea', prompt: 'Aerial pullback: the camera flies backward and upward, revealing a vast landscape around the tiny subject.' },
  { id: 'overhead', group: 'crane', icon: '🔽', label: 'Cenital', prompt: "Overhead top-down bird's-eye view shot, the camera looks straight down at the subject and slowly rotates." },
  { id: 'fpv_drone', group: 'crane', icon: '🚁', label: 'Dron FPV', prompt: 'Drone shot. Fast FPV drone shot swooping dynamically around the subject.' },
  { id: 'robo_arm', group: 'crane', icon: '🦾', label: 'Brazo robótico', prompt: 'Robotic camera arm move: an ultra-precise, fast and smooth sweeping motion around the subject, commercial style.' },

  /* ---------- órbita ---------- */
  { id: 'arc_left', group: 'orbit', icon: '↩️', label: 'Arco izq.', preview: CAM('arc_left'),
    prompt: 'The 34Ar2c arc the camera moves in a smooth curve around the subject from right to left, shifting the perspective around them.', lora: rem('Arc_shot') },
  { id: 'arc_right', group: 'orbit', icon: '↪️', label: 'Arco der.', preview: CAM('arc_right'),
    prompt: 'The 34Ar2c arc the camera moves in a smooth curve around the subject from left to right, shifting the perspective around them.', lora: rem('Arc_shot') },
  { id: 'orbit_360', group: 'orbit', icon: '🔁', label: 'Órbita 360°', preview: CAM('orbit_360'),
    prompt: 'The camera performs an 0rb4it 360 degree orbit, circling all the way around the subject before returning to the front view.', lora: rem('360-Orbit') },
  { id: 'orbit', group: 'orbit', icon: '🔄', label: 'Órbita suave', prompt: 'ORBITCAM, the viewer orbit around the subject. The camera orbits smoothly around the subject.',
    lora: civ('wan2.2orbitcamv2_high_noise.safetensors') },
  { id: 'rot3d', group: 'orbit', icon: '💫', label: 'Rotación 3D', prompt: '360 Rotation. The camera rotates 360 degrees around the subject.',
    lora: civ('[WAN2.2]360Rotation_Redmond_high_noise.safetensors') },
  { id: 'lazy_susan', group: 'orbit', icon: '🍽️', label: 'Plato giratorio', preview: CAM('lazy_susan'),
    prompt: 'The subject performs a r0t4tion 360 degrees rotation, as if on a turntable, while the camera stays still.', lora: rem('Rotate') },
  { id: 'bullet_time', group: 'orbit', icon: '⏱️', label: 'Tiempo congelado', prompt: 'Bullet time effect: time freezes and the camera rotates around the frozen subject.',
    lora: civ('wan2.2bullet_time_high_noise.safetensors') },
  { id: 'matrix', group: 'orbit', icon: '🕶️', label: 'Tiempo bala', preview: CAM('matrix'),
    prompt: 'b4ll3t t1m3 bullet time shot: the action is dramatically slowed down, freezing the subject in a dynamic pose while the camera sweeps around them.',
    lora: rem('matrix-shot') },

  /* ---------- POV ---------- */
  { id: 'through_object', group: 'pov', icon: '🚪', label: 'A través de objeto', prompt: 'The camera moves forward through a doorway and a narrow gap, passing through objects toward the subject.' },
  { id: 'eyes_in', group: 'pov', icon: '👁️', label: 'Hacia los ojos', prompt: "The camera pushes in extremely close into the subject's eye, ending in an extreme close-up of the iris." },
  { id: 'snorricam', group: 'pov', icon: '🎥', label: 'Snorricam', prompt: "Snorricam shot: the camera is rigged to the subject's body, their face stays fixed in frame while the background moves wildly." },
  { id: 'head_tracking', group: 'pov', icon: '🧑‍💻', label: 'Seguir cabeza', prompt: "The camera follows closely behind the subject's head as they walk, tracking their movement." },
  { id: 'hero_cam', group: 'pov', icon: '🦸', label: 'Cámara héroe', prompt: 'Low-angle hero shot: the camera slowly rises and pushes in from below, making the subject look powerful and epic.' },

  /* ---------- vehículo ---------- */
  { id: 'car_chase', group: 'vehicle', icon: '🏎️', label: 'Persecución', preview: CAM('car_chase'),
    prompt: 'A dramatic c4r ch4s3 car chase: the camera follows low and close behind the speeding vehicle.', lora: rem('Car-chase') },
  { id: 'car_grip', group: 'vehicle', icon: '🚗', label: 'Montada en auto', prompt: 'Car grip shot: the camera is mounted on the side of a moving car, the road and scenery rush past in motion blur.' },

  /* ---------- tiempo ---------- */
  { id: 'timelapse', group: 'time', icon: '⏳', label: 'Timelapse', prompt: 'Timelapse: clouds race across the sky, light and shadows change quickly while the camera stays still.' },
  { id: 'hyperlapse', group: 'time', icon: '🏙️', label: 'Hyperlapse', prompt: 'Hyperlapse: the camera moves forward quickly through the scene in a fast-forward timelapse with smooth motion.' },

  /* ---------- estilo ---------- */
  { id: 'fisheye', group: 'style', icon: '🐟', label: 'Ojo de pez', prompt: 'Fisheye lens shot with strong barrel distortion, the camera moves close to the subject.' },
  { id: 'focus_change', group: 'style', icon: '🎚️', label: 'Cambio de foco', prompt: 'Rack focus: the focus shifts smoothly from the foreground to the subject in the background, shallow depth of field.' },
  { id: 'low_shutter', group: 'style', icon: '🌠', label: 'Obturación lenta', prompt: 'Low shutter speed look: dreamy motion blur trails and streaks of light as the subject moves.' },
  { id: 'wiggle', group: 'style', icon: '〰️', label: 'Wiggle', prompt: 'Wiggle camera: the camera gently wobbles left and right in a playful rhythmic motion.' },

  /* ---------- EXACTA (Wan 2.2 Fun Camera) ---------- */
  { id: 'x_zoom_in', group: 'exact', icon: '🔍', label: 'Zoom in', badge: 'EXACTA', pose: 'Zoom In', prompt: 'The camera zooms in.' },
  { id: 'x_zoom_out', group: 'exact', icon: '🔭', label: 'Zoom out', badge: 'EXACTA', pose: 'Zoom Out', prompt: 'The camera zooms out.' },
  { id: 'x_pan_left', group: 'exact', icon: '👈', label: 'Paneo izq.', badge: 'EXACTA', pose: 'Pan Left', prompt: 'The camera pans left.' },
  { id: 'x_pan_right', group: 'exact', icon: '👉', label: 'Paneo der.', badge: 'EXACTA', pose: 'Pan Right', prompt: 'The camera pans right.' },
  { id: 'x_pan_up', group: 'exact', icon: '☝️', label: 'Paneo arriba', badge: 'EXACTA', pose: 'Pan Up', prompt: 'The camera pans up.' },
  { id: 'x_pan_down', group: 'exact', icon: '👇', label: 'Paneo abajo', badge: 'EXACTA', pose: 'Pan Down', prompt: 'The camera pans down.' },
  { id: 'x_cw', group: 'exact', icon: '🔃', label: 'Rotar ↻', badge: 'EXACTA', pose: 'ClockWise (CW)', prompt: 'The camera rolls clockwise.' },
  { id: 'x_acw', group: 'exact', icon: '🔄', label: 'Rotar ↺', badge: 'EXACTA', pose: 'Anti Clockwise (ACW)', prompt: 'The camera rolls anti-clockwise.' },
];

export const cameraById = id => CAMERA.find(c => c.id === id) || null;
