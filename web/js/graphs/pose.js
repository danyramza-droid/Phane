// POSE EXACTA (tool 'image'): copia la pose de una foto o cuadro de video.
//   1) SDPose (tpl utility_sdpose_ood_image_to_pose) saca el esqueleto de cuerpo/manos/cara de o.pose
//   2) Z-Image Turbo + Fun ControlNet Union (tpl image_z_image_turbo_fun_union_controlnet) pinta la escena EN esa pose
//   3) si hay refs: Qwen-Image 2.1 edición le pone el diseño exacto de tu personaje (y enemigo) sin mover la pose
// Por qué: los modelos con imágenes de referencia (Qwen 2.1, Klein) copian QUIÉN es, no CÓMO está parado; la pose solo se
// obedece de verdad con un ControlNet (esqueleto). Nano Banana lo "razona"; aquí se fuerza.
import { G, rnd, saveImage, IMG_SIZE, withHeroLora, heroPrompt } from '../lib/graph.js';
import { qwen21Edit } from './edit.js';
import { QWEN21_TURBO_SIGMAS } from './image.js';

/**
 * Opciones: { prompt:'escena (inglés)', pose:{ref,w,h} foto/cuadro con la pose, ar:'16:9'|…,
 *             refs?:[{ref,w,h}] personaje (y 2.º personaje/enemigo) para el pase de diseño, poseStrength?:0.4-1,
 *             charDesc?:'descripción del diseño del personaje (Personaje.desc)', poseMargin?:false, skeletonRef?:false, depth?:true, depthStrength?:0.5, hq?:true, hqDenoise?:0.5-0.9, hqPrompt?:'escena+expresión para el pase HQ',
 *             headRef?:{ref,w,h} foto de cabeza del Personaje (activa el retoque de cabeza/casco/pelo), headDesc?:'…' }
 */
const SAMPLE = { prompt: 'A female knight in silver armor leaps and strikes down with her sword at a goblin, dungeon, torches, sparks.',
  pose: { ref: 'example.png', w: 1344, h: 768 }, ar: '16:9', refs: [{ ref: 'example.png', w: 768, h: 1024 }],
  charDesc: 'silver winged helmet, long blonde hair with two braids, silver breastplate, blue cape', headRef: { ref: 'example.png', w: 660, h: 660 } };

/** ¿La imagen de pose YA es un esqueleto (fondo negro, estilo SDPose)? Los de Movimiento por texto (Kimodo) se llaman
 *  `*_esqueleto_*` (también sus cuadros capturados: `cuadro_<video>_…`) y los que guarda este motor `pose_mapa_*`.
 *  SDPose no lee esqueletos (busca personas): se usan tal cual. `isMap` explícito manda. */
export const isSkeleton = pose => !!pose && (pose.isMap ?? /esqueleto|pose_mapa/i.test(String(pose.ref || '')));

/** Ángulo del maniquí de Kimodo por su nombre (…_maniqui_f030_v105.png; sin _v = de frente) → 'side' | 'back' | null.
 *  18-oct: perfil sale bien con Qwen 2.1 + vista de perfil; de espaldas Qwen 2.1 voltea la cara y AnyPose no. */
export function maniquiView(f) {
  const m = String(f?.filename || f?.ref || '').match(/_v(-?\d+)\.png/i);
  const a = Math.abs((((m ? +m[1] : 0) % 360) + 540) % 360 - 180);
  return a >= 135 ? 'back' : a >= 60 ? 'side' : null;
}
/** Hoja de diseño de un Personaje para la pose con maniquí: fondo liso (estudio) > diseño > cuerpo > la primera. */
export function sheetOf(pj) {
  const ph = pj?.photos || [];
  return ph.find(x => /estudio|fondo_liso|plain/i.test(x.filename || '')) || ph.find(x => /diseno|design/i.test(x.filename || ''))
    || ph.find(x => /cuerpo|body|outfit/i.test(x.filename || '')) || ph[0] || null;
}

/** Esqueleto (fondo negro) de la pose de una imagen. Devuelve un link IMAGE. */
export function poseMap(g, ref) {
  const li = g.add('LoadImage', { image: ref });
  const sc = g.add('ImageScaleToMaxDimension', { image: [li, 0], upscale_method: 'lanczos', largest_size: 1024 });
  const ck = g.add('CheckpointLoaderSimple', { ckpt_name: 'sdpose_wholebody_fp16.safetensors' }, 'Cargando SDPose…');
  const kp = g.add('SDPoseKeypointExtractor', { model: [ck, 0], vae: [ck, 2], image: [sc, 0], batch_size: 16 }, 'Leyendo la pose…');
  const dr = g.add('SDPoseDrawKeypoints', { keypoints: [kp, 0], draw_body: true, draw_hands: true, draw_face: true, draw_feet: true,
    stick_width: 4, face_point_size: 2, score_threshold: 0.5, draw_head: true }, 'Dibujando el esqueleto…');
  return [dr, 0];
}

/** Texto del pase de diseño. Ronda 2 de la batería (jueces, 17-oct): fijar la pose parte por parte, listar el diseño (o.charDesc),
 *  NO traer armas/objetos de la referencia (salían escudos al comer helado y hasta un tercer brazo) y pedir el estilo de la referencia.
 *  Tokens: {img1} = imagen base, {img2} = diseño, {img3} = 2.º personaje (si hay), {imgN} = esqueleto (skelIdx). */
export function designPrompt(o, nOther, skelIdx) {
  return ['Edit {img1}. Do not move anything: keep the exact position and angle of the head, eyes, torso, both arms, both hands, both legs and both feet,',
    'the objects the character holds and how they are held, the camera angle, framing, background and lighting of {img1}.',
    skelIdx ? `The body pose is also shown by the skeleton in {img${skelIdx}}.` : '',
    // ronda 2: Qwen giraba el cuerpo hacia la cámara (11/27), enderezaba inclinaciones y la mirada volvía a la cámara
    'Keep the body facing exactly the same direction as in {img1}: do not turn the body or the face toward the camera; keep the lean of the torso and where the eyes look.',
    `Change only the main character's costume and appearance to match the character in {img2}: same face and same design${o.charDesc ? ` (${o.charDesc})` : ''}.`,
    'Same rendering style as {img2}. The character has exactly two arms and two legs.',
    '{img2} is only a costume reference: ignore its pose, its facing direction, its gaze, its weapons and its held objects; do not add any weapon, shield or object that is not already in {img1}.',
    nOther ? 'Make the other figure look exactly like {img3}.' : '',
    o.prompt || ''].filter(Boolean).join(' ');
}

function zimagePose(o) {
  const g = G(); const [w, h] = IMG_SIZE.ligero[o.ar || '16:9'] || IMG_SIZE.ligero['16:9'];
  const skelIn = isSkeleton(o.pose);
  const map = skelIn ? [g.add('LoadImage', { image: o.pose.ref }), 0] : poseMap(g, o.pose.ref);
  // el esqueleto con márgenes (relleno negro = "sin pose"): arriba ~15 % para alas/cascos/peinados, abajo ~12 % porque la suela
  // queda por DEBAJO del punto del tobillo. Ronda 1: 6/27 cortados; ronda 2 (7 % abajo): 11/27 perdían las botas.
  // Con profundidad NO hay márgenes (18-oct): cualquier relleno, negro, de borde o difuminado, hacía que Z-Image pintara un marco.
  // Sin márgenes el marco desaparece, a cambio de que el casco/alas puedan quedar al ras de arriba. poseMargin:true los fuerza.
  const noMargin = o.poseMargin === false || (o.depth && !skelIn && o.poseMargin !== true);
  const mx = noMargin ? 0 : Math.round(w * 0.06 / 8) * 8, top = noMargin ? 0 : Math.round(h * 0.15 / 8) * 8,
    bot = noMargin ? 0 : Math.round(h * 0.12 / 8) * 8;
  const inner = g.add('ImageResizeKJv2', { image: map, width: w - 2 * mx, height: h - top - bot, upscale_method: 'lanczos', keep_proportion: 'pad',
    pad_color: '0, 0, 0', crop_position: 'center', divisible_by: 8 });
  const ctl = mx || top || bot ? g.add('ImagePadKJ', { image: [inner, 0], left: mx, right: mx, top, bottom: bot, extra_padding: 0, pad_mode: 'color', color: '0, 0, 0' }) : inner;
  const u = g.add('UnetLoaderGGUF', { unet_name: 'z_image_turbo-Q8_0.gguf' }, 'Cargando Z-Image…');
  const c = g.add('CLIPLoader', { clip_name: 'qwen_3_4b.safetensors', type: 'lumina2', device: 'default' }, 'Cargando Z-Image…');
  const vae = g.add('VAELoader', { vae_name: 'ae.safetensors' });
  const mp = g.add('ModelPatchLoader', { name: 'Z-Image-Turbo-Fun-Controlnet-Union.safetensors' }, 'Cargando el control de pose…');
  let m = g.add('QwenImageDiffsynthControlnet', { model: [u, 0], model_patch: [mp, 0], vae: [vae, 0], image: [ctl, 0], strength: o.poseStrength ?? 1 });
  // ronda 4: profundidad (Depth Anything V2 Small) como 2.º control. Arregla las poses de perfil que el esqueleto 2D deja salir
  // de frente. Solo con foto de pose (un esqueleto no tiene profundidad).
  // Marco: rellenar el MAPA de profundidad (negro o estirando el borde) hacía que Z-Image pintara un marco alrededor de la escena
  // (18-oct, 2 intentos). Ahora se rellena la FOTO al lienzo del esqueleto (borde difuminado) y la profundidad se mide sobre ella:
  // el mapa sale continuo, sin rectángulo.
  if (o.depth && !skelIn) {
    const pin = g.add('ImageResizeKJv2', { image: [g.add('LoadImage', { image: o.pose.ref }), 0], width: w - 2 * mx, height: h - top - bot,
      upscale_method: 'lanczos', keep_proportion: 'pillarbox_blur', pad_color: '0, 0, 0', crop_position: 'center', divisible_by: 8 });
    const pp = mx || top || bot ? g.add('ImagePadKJ', { image: [pin, 0], left: mx, right: mx, top, bottom: bot, extra_padding: 0, pad_mode: 'pillarbox_blur', color: '0, 0, 0' }) : pin;
    const dm = g.add('PhaneDepth', { image: [pp, 0] }, 'Midiendo la profundidad…');
    m = g.add('QwenImageDiffsynthControlnet', { model: [m, 0], model_patch: [mp, 0], vae: [vae, 0], image: [dm, 0], strength: o.depthStrength ?? 0.5 });
    if (o.saveDepth) saveImage(g, [dm, 0], 'phane/pose_profundidad');
  }
  m = g.add('ModelSamplingAuraFlow', { model: [m, 0], shift: 3 });
  // el diseño completo ya desde aquí: si no, Z-Image pinta "su" versión genérica (minifalda, una trenza, casco simple) y el pase
  // de diseño la conserva (ronda 1: fidelidad 5.8/10)
  const p = g.add('CLIPTextEncode', { clip: [c, 0], text: [o.prompt, o.charDesc ? `The main character: ${o.charDesc}.` : ''].filter(Boolean).join(' ') }, 'Leyendo tu idea…');
  const ng = g.add('ConditioningZeroOut', { conditioning: [p, 0] });
  const l = g.add('EmptySD3LatentImage', { width: w, height: h, batch_size: 1 });
  const s = g.add('KSampler', { model: [m, 0], seed: rnd(), steps: 8, cfg: 1, sampler_name: 'res_multistep', scheduler: 'simple',
    positive: [p, 0], negative: [ng, 0], latent_image: [l, 0], denoise: 1 }, 'Pintando en la pose');
  const d = g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…');
  const refs = (o.refs || []).filter(r => r && r.ref).slice(0, 2);
  // el esqueleto también entra al pase de diseño (como última imagen) para que Qwen no mueva la pose al redibujar
  const skel = o.skeletonRef === false ? [] : [{ link: [ctl, 0] }];
  // OJO: el visor muestra la salida del SaveImage con id MÁS BAJO → primero la imagen final, luego las de revisión
  if (refs.length) {
    qwen21Edit({ image: { link: [d, 0] }, refs: [...refs, ...skel], noSave: !!o.headRef || !!o.hq,
      prompt: designPrompt(o, refs.length - 1, skel.length ? refs.length + 2 : 0), savePrefix: 'phane/img' }, false, g);
    if (o.hq) {
      const designed = g.lastOut;
      saveImage(g, hqPass(g, designed, o, refs), 'phane/img');
      saveImage(g, designed, 'phane/pose_diseno');   // la del pase de diseño (~1 MP), para comparar
    } else if (o.headRef) saveImage(g, headRetouch(g, g.lastOut, o, w, h), 'phane/img');
  } else saveImage(g, [d, 0], 'phane/img');
  if (refs.length) saveImage(g, [d, 0], 'phane/pose_base');   // la de Z-Image antes del diseño (para comparar)
  if (!skelIn) saveImage(g, map, 'phane/pose_mapa');           // el esqueleto que leyó (para revisar)
  return g;
}

/** Sigmas del pase HQ: la cola del schedule turbo desde `d` (0.5-0.9). Más alto = más libertad (más calidad, menos fiel a la pose). */
export function hqSigmas(d = 0.75) {
  const tail = QWEN21_TURBO_SIGMAS.split(',').map(Number).filter(s => s < d - 0.02);
  return [d, ...tail].join(', ');
}

/** Pase HQ (noche del 18-oct): la imagen del pase de diseño sale a ~1 MP con la calidad de Z-Image debajo. La receta de máxima
 *  calidad (Qwen 2.1 a 2 MP con refs, ver hdmax_img_00009) no copia poses. Aquí se juntan: la imagen posada se sube a 2 MP,
 *  se codifica como latente de partida y Qwen 2.1 la vuelve a pintar con denoise parcial (o.hqDenoise), con el diseño como
 *  referencia y la imagen posada como última referencia. Después: SeedVR2 7B x2 aparte (upscale.seedvr2_7b). */
function hqPass(g, img, o, refs) {
  const { model, clip, vae } = g.q21;
  const [W, H] = IMG_SIZE.highend[o.ar || '16:9'] || IMG_SIZE.highend['16:9'];
  const up = g.add('ImageScale', { image: img, upscale_method: 'lanczos', width: W, height: H, crop: 'center' });
  const lat = g.add('VAEEncode', { pixels: [up, 0], vae: [vae, 0] }, 'Preparando el pase HQ…');
  const ims = [...refs.map(r => [g.add('LoadImage', { image: r.ref }), 0]), [up, 0]];
  const n = ims.length;
  const prompt = [`Recreate image ${n} as a high-detail cinematic 3D animated film frame.`,
    `Keep exactly the same pose of every limb, the same body position, the same camera angle, framing and composition as image ${n}.`,
    `The main character looks exactly like the character in image 1 (same face, same design${o.charDesc ? `: ${o.charDesc}` : ''}).`,
    refs.length > 1 ? 'The other figure looks exactly like image 2.' : '',
    o.hqPrompt || o.prompt || '',
    'Ultra-detailed, sharp focus, rich lighting, expressive face.'].filter(Boolean).join(' ');
  const enc = { clip: [clip, 0], prompt, negative_prompt: '', resolution: 768, vae: [vae, 0] };
  ims.forEach((im, i) => { enc[`images.image_${i + 1}`] = im; });
  const te = g.add('TextEncodeQwenImage21', enc, 'Estudiando para el pase HQ…');
  const gd = g.add('CFGGuider', { model: [model, 0], positive: [te, 0], negative: [te, 1], cfg: 1 });
  const s = g.add('SamplerCustomAdvanced', { noise: [g.add('RandomNoise', { noise_seed: rnd() }), 0], guider: [gd, 0],
    sampler: [g.add('KSamplerSelect', { sampler_name: 'euler' }), 0], sigmas: [g.add('ManualSigmas', { sigmas: hqSigmas(o.hqDenoise) }), 0],
    latent_image: [lat, 0] }, 'Pase HQ (2 MP)…');
  return [g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…'), 0];
}

/** Retoque de cabeza/casco/pelo (ronda 3): en cuerpo completo la cabeza mide ~70-90 px y el pase de diseño no alcanza a copiar
 *  casco, pelo ni cara (18/27 con casco equivocado). SDPose vuelve a leer la cara EN la imagen final → máscara crecida →
 *  recorte ampliado → Qwen 2.1 edición con la foto de cabeza del Personaje → se pega de vuelta. Sin cara detectada
 *  (de espaldas) la máscara queda vacía y la imagen no cambia. */
function headRetouch(g, img, o, w, h) {
  const sc = g.add('ImageScaleToMaxDimension', { image: img, upscale_method: 'lanczos', largest_size: 1024 });
  const ck = g.add('CheckpointLoaderSimple', { ckpt_name: 'sdpose_wholebody_fp16.safetensors' });
  const kp = g.add('SDPoseKeypointExtractor', { model: [ck, 0], vae: [ck, 2], image: [sc, 0], batch_size: 16 }, 'Buscando la cara…');
  const face = g.add('SDPoseDrawKeypoints', { keypoints: [kp, 0], draw_body: false, draw_hands: false, draw_face: true, draw_feet: false,
    stick_width: 4, face_point_size: 6, score_threshold: 0.3, draw_head: true });
  const full = g.add('ImageScale', { image: [face, 0], upscale_method: 'bilinear', width: w, height: h, crop: 'disabled' });
  const m = g.add('ImageToMask', { image: [full, 0], channel: 'red' });
  // crecida ~ media cabeza hacia todos lados (casco, alas, pelo) con borde suave
  const grow = Math.round(h * 0.055);
  const mk = g.add('GrowMaskWithBlur', { mask: [m, 0], expand: grow, incremental_expandrate: 0, tapered_corners: true, flip_input: false,
    blur_radius: 6, lerp_alpha: 1, decay_factor: 1 });
  const cr = g.add('ImageCropByMaskAndResize', { image: img, mask: [mk, 0], base_resolution: 768, padding: Math.round(h * 0.06),
    min_crop_resolution: 128, max_crop_resolution: 1024 }, 'Recortando la cabeza…');
  qwen21Edit({ image: { link: [cr, 0] }, refs: [o.headRef], noSave: true,
    prompt: 'Change only the helmet, the hair and the face of the character in {img1} so they look exactly like {img2}'
      + (o.headDesc ? ` (${o.headDesc})` : '') + '. Keep the head angle, the direction of the gaze, the expression, the body, the armor, '
      + 'the background and the lighting of {img1} exactly the same.' }, false, g);
  return [g.add('ImageUncropByMask', { destination: img, source: g.lastOut, mask: [cr, 1], bbox: [cr, 2] }, 'Pegando la cabeza…'), 0];
}

/* ---------- Pose con maniquí 3D (Qwen-Image 2.1 + LoRA VNCCS PoseStudio, noche del 18-oct) ----------
   Receta del workflow oficial (MIUProject/VNCCS_PoseStudio_QI2.1): Qwen 2.1 COMPLETO int8 + LoRA a 1.0, 25 pasos, CFG 1,
   euler/simple; image_1 = maniquí 3D (sin identidad), image_2 = personaje; lienzo = tamaño del maniquí.
   El maniquí sale de Kimodo (kimodo_puente.py cuadro --maniqui, cualquier ángulo) → la orientación 3D ya va en la imagen:
   sin ControlNet, sin padding, sin Z-Image. o.turbo = Qwen 2.1 Turbo 8 pasos (más rápido; la LoRA es para el completo). */
function vnccsPose(o) {
  const g = G();
  const unet = g.add('UNETLoader', { unet_name: o.turbo ? 'qwen_image_2.1_turbo_int8_convrot.safetensors' : 'qwen_image_2.1_int8_convrot.safetensors', weight_dtype: 'default' }, 'Cargando Qwen-Image 2.1…');
  const lora = g.add('LoraLoaderModelOnly', { model: [unet, 0], lora_name: o.lora || 'vnccs\\VNCCS_QI2_PoseStudioV2.safetensors', strength_model: o.loraStrength ?? 1 }, 'Cargando la LoRA de pose…');
  const model = g.add('QwenImage21Cache', { model: [lora, 0], device: 'auto', dtype: 'default' });
  const clip = g.add('CLIPLoader', { clip_name: 'qwen3vl_8b_int8_convrot.safetensors', type: 'qwen_image', device: 'default' }, 'Cargando Qwen-Image 2.1…');
  const vae = g.add('VAELoader', { vae_name: 'qwen_image_2.1_vae_bf16.safetensors' });
  const man = g.add('LoadImage', { image: o.pose.ref });
  const refs = (o.refs || []).filter(r => r && r.ref).slice(0, 2);
  const enc = { clip: [clip, 0], negative_prompt: o.negative || '', resolution: 1024, vae: [vae, 0], 'images.image_1': [man, 0] };   // negative solo cuenta con cfg > 1
  refs.forEach((r, i) => { enc[`images.image_${i + 2}`] = [g.add('LoadImage', { image: r.ref }), 0]; });
  // o.view = 'side' | 'back' (18-oct tarde): vista del personaje desde ese ángulo (o.viewRef, fondo liso) como imagen extra
  // + frase de dirección, para que no gire hacia la cámara en perfil ni invente la espalda.
  const vi = refs.length + 2;
  if (o.viewRef && o.viewRef.ref) enc[`images.image_${vi}`] = [g.add('LoadImage', { image: o.viewRef.ref }), 0];
  const VIEW_TXT = {
    side: 'Strict side profile view: only one eye visible, nose pointing to the side, shoulders perpendicular to the camera, the body is not turned toward the viewer.',
    back: 'Seen from behind: we see her back, cape and hair; the face is not visible.',
  };
  const viewTxt = o.view && VIEW_TXT[o.view] ? [o.viewRef && o.viewRef.ref ? `<image ${vi}> shows the same character seen from the ${o.view}; use it for the parts visible from this angle.` : '', VIEW_TXT[o.view]].filter(Boolean).join(' ') : '';
  // o.rawPrompt reemplaza la instrucción de VNCCS (p. ej. LoRA AnyAngle: 'Change the camera angle from <image2> to <image1>.')
  enc.prompt = o.rawPrompt || ['replace the pose of <image 2> with the pose of <image 1>. keep the character of <image 2>.',
    refs.length > 1 ? 'The other figure looks like <image 3>.' : '', viewTxt, o.prompt || '', o.charDesc ? `The character is: ${o.charDesc}.` : ''].filter(Boolean).join(' ');
  const te = g.add('TextEncodeQwenImage21', enc, 'Estudiando el maniquí y tu personaje…');
  const lat = g.add('EmptyLatentImage', { width: o.pose.w, height: o.pose.h, batch_size: 1 });
  let s;
  if (o.turbo) {
    const gd = g.add('CFGGuider', { model: [model, 0], positive: [te, 0], negative: [te, 1], cfg: 1 });
    s = g.add('SamplerCustomAdvanced', { noise: [g.add('RandomNoise', { noise_seed: rnd() }), 0], guider: [gd, 0],
      sampler: [g.add('KSamplerSelect', { sampler_name: 'euler' }), 0], sigmas: [g.add('ManualSigmas', { sigmas: QWEN21_TURBO_SIGMAS }), 0], latent_image: [lat, 0] }, 'Pintando en la pose');
  } else {
    s = g.add('KSampler', { model: [model, 0], seed: rnd(), steps: o.steps || 25, cfg: o.cfg || 1, sampler_name: 'euler', scheduler: 'simple',
      positive: [te, 0], negative: [te, 1], latent_image: [lat, 0], denoise: 1 }, 'Pintando en la pose');
  }
  saveImage(g, [g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…'), 0], 'phane/img');
  return g;
}

/* ---------- Pose con maniquí, ruta COMERCIAL (Qwen-Image-Edit 2511 + LoRAs AnyPose, todo Apache-2.0) ----------
   Receta del autor (lilylilith/AnyPose): Lightning 4 pasos + AnyPose base y helper a 0.7, imagen 1 = personaje, imagen 2 = pose,
   prompt largo fijo. Entrenada con poses 3D de Blender: el maniquí de Kimodo le queda natural. Lienzo = tamaño del maniquí. */
const ANYPOSE_PROMPT = 'Make the person in image 1 do the exact same pose of the person in image 2. Changing the style and background of the image of the person in image 1 is undesirable, so don\'t do it. The new pose should be pixel accurate to the pose we are trying to copy. The position of the arms and head and legs should be the same as the pose we are trying to copy. Change the field of view and angle to match exactly image 2. Head tilt and eye gaze pose should match the person in image 2.';
function anyPose(o) {
  const g = G();
  const unet = g.add('UNETLoader', { unet_name: 'qwen_image_edit_2511_int8_convrot.safetensors', weight_dtype: 'default' }, 'Cargando Qwen-Image-Edit 2511…');
  const clip = g.add('CLIPLoader', { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' }, 'Cargando Qwen-Image-Edit 2511…');
  const vae = g.add('VAELoader', { vae_name: 'qwen_image_vae.safetensors' });
  let m = g.add('ModelSamplingAuraFlow', { model: [unet, 0], shift: 3.1, sampling: 'flow' });
  m = g.add('CFGNorm', { model: [m, 0], strength: 1, pre_cfg: false });
  m = g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', strength_model: 1 });
  const sep = String.fromCharCode(92);
  for (const f of ['2511-AnyPose-base-000006250.safetensors', '2511-AnyPose-helper-00006000.safetensors'])
    m = g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: 'anypose' + sep + f, strength_model: o.loraStrength ?? 0.7 }, 'Cargando AnyPose…');
  const refs = (o.refs || []).filter(r => r && r.ref);
  const imgIn = { image1: [g.add('FluxKontextImageScale', { image: [g.add('LoadImage', { image: refs[0].ref }), 0] }), 0],
    image2: [g.add('LoadImage', { image: o.pose.ref }), 0] };
  if (refs[1]) imgIn.image3 = [g.add('LoadImage', { image: refs[1].ref }), 0];
  const backTxt = o.view === 'back' ? 'The camera is behind the character: back view, we see the back and the cape, the face is not visible.' : '';   // probado 18-oct (img_00344)
  const prompt = [ANYPOSE_PROMPT, 'Remove the background of image 2.', refs[1] ? 'Also include the creature from image 3 in the scene.' : '', backTxt, o.prompt || '',
    o.charDesc ? `Keep her design: ${o.charDesc}.` : ''].filter(Boolean).join(' ');
  const negTe = g.add('TextEncodeQwenImageEditPlus', { clip: [clip, 0], prompt: '', vae: [vae, 0], ...imgIn });
  const neg = g.add('FluxKontextMultiReferenceLatentMethod', { conditioning: [negTe, 0], reference_latents_method: 'index_timestep_zero' });
  const te = g.add('TextEncodeQwenImageEditPlus', { clip: [clip, 0], prompt, vae: [vae, 0], ...imgIn }, 'Leyendo la instrucción…');
  const pos = g.add('FluxKontextMultiReferenceLatentMethod', { conditioning: [te, 0], reference_latents_method: 'index_timestep_zero' });
  const lat = g.add('EmptySD3LatentImage', { width: o.pose.w, height: o.pose.h, batch_size: 1 });
  const s = g.add('KSampler', { model: [m, 0], seed: rnd(), steps: o.steps || 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple',
    positive: [pos, 0], negative: [neg, 0], latent_image: [lat, 0], denoise: 1 }, 'Pintando en la pose');
  saveImage(g, [g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…'), 0], 'phane/img');
  return g;
}

/* ---------- Pose con maniquí, tercera ruta (FLUX.2 Klein 4B base + LoRA RefControl Depth, todo Apache-2.0) ----------
   Receta del workflow oficial (thedeoxen/refcontrol-FLUX.2-klein-4B-reference-depth-lora): Klein 4B BASE fp8, CFG 5, 20 pasos,
   Flux2Scheduler, prompt "refcontrol"; ReferenceLatent 1 = mapa de profundidad de la pose, ReferenceLatent 2 = el personaje;
   lienzo = tamaño del mapa (1 MP). La profundidad sale del maniquí con Depth Anything V2 Small (PhaneDepth): trae la
   orientación 3D. o.heroLora (LoRA del personaje de Klein) se puede apilar. */
function kleinPose(o) {
  const g = G();
  let m = g.add('UNETLoader', { unet_name: 'flux-2-klein-base-4b-fp8.safetensors', weight_dtype: 'default' }, 'Cargando FLUX.2 Klein 4B…');
  const sep = String.fromCharCode(92);
  m = g.add('LoraLoaderModelOnly', { model: [m, 0], lora_name: 'refcontrol' + sep + 'flux2_klein_4b_refcontrol_depth.safetensors', strength_model: o.loraStrength ?? 1 }, 'Cargando RefControl…');
  { const hl = withHeroLora(g, [m, 0], o); m = hl[0]; }
  const clip = g.add('CLIPLoader', { clip_name: 'qwen_3_4b.safetensors', type: 'flux2', device: 'default' }, 'Cargando el lector de texto…');
  const vae = g.add('VAELoader', { vae_name: 'flux2-vae.safetensors' });
  const depth = g.add('ImageScaleToTotalPixels', { image: [g.add('PhaneDepth', { image: [g.add('LoadImage', { image: o.pose.ref }), 0] }, 'Midiendo la profundidad del maniquí…'), 0],
    upscale_method: 'lanczos', megapixels: o.mp || 1, resolution_steps: 16 });
  const refs = (o.refs || []).filter(r => r && r.ref);
  const ref = g.add('ImageScaleToTotalPixels', { image: [g.add('LoadImage', { image: refs[0].ref }), 0], upscale_method: 'lanczos', megapixels: 1, resolution_steps: 16 });
  let pos = g.add('CLIPTextEncode', { clip: [clip, 0], text: heroPrompt(['refcontrol', o.prompt || '', o.charDesc ? `The character: ${o.charDesc}.` : ''].filter(Boolean).join(', '), o) }, 'Leyendo tu idea…');
  let neg = g.add('CLIPTextEncode', { clip: [clip, 0], text: '' });
  for (const im of [depth, ref]) {   // primero la profundidad, luego el personaje (orden del workflow oficial)
    const lat = g.add('VAEEncode', { pixels: [im, 0], vae: [vae, 0] });
    pos = g.add('ReferenceLatent', { conditioning: [pos, 0], latent: [lat, 0] });
    neg = g.add('ReferenceLatent', { conditioning: [neg, 0], latent: [lat, 0] });
  }
  const sz = g.add('GetImageSize', { image: [depth, 0] });
  const gd = g.add('CFGGuider', { model: [m, 0], positive: [pos, 0], negative: [neg, 0], cfg: o.cfg || 5 });
  const s = g.add('SamplerCustomAdvanced', { noise: [g.add('RandomNoise', { noise_seed: rnd() }), 0], guider: [gd, 0],
    sampler: [g.add('KSamplerSelect', { sampler_name: 'euler' }), 0], sigmas: [g.add('Flux2Scheduler', { steps: o.steps || 20, width: [sz, 0], height: [sz, 1] }), 0],
    latent_image: [g.add('EmptyFlux2LatentImage', { width: [sz, 0], height: [sz, 1], batch_size: 1 }), 0] }, 'Pintando en la pose');
  saveImage(g, [g.add('VAEDecode', { samples: [s, 0], vae: [vae, 0] }, 'Revelando…'), 0], 'phane/img');
  return g;
}

/* ---------- Foto → maniquí 3D (SAM 3D Body, nativo de ComfyUI ≥0.34, modelo int8 de Comfy-Org en models/detection) ----------
   Saca el cuerpo 3D de la persona de una foto o cuadro de video y lo dibuja como malla gris sobre fondo gris: el mismo tipo de
   imagen que el maniquí de Kimodo, así que va directo a image.pose_maniqui / image.pose_anypose (la foto nunca entra como persona).
   OJO: la función de foto de VNCCS Pose Studio baja un .ckpt (pickle) de un espejo de terceros: no usarla. */
function fotoManiqui(o) {
  const g = G();
  const W0 = o.image.w || 1024, H0 = o.image.h || 1024, s = 1344 / Math.max(W0, H0);
  const w = Math.round(W0 * s / 16) * 16, h = Math.round(H0 * s / 16) * 16;
  const img = g.add('ImageScale', { image: [g.add('LoadImage', { image: o.image.ref }), 0], upscale_method: 'lanczos', width: w, height: h, crop: 'disabled' });
  const m = g.add('SAM3DBody_Loader', { model_file: 'sam_3d_body_dinov3_int8_convrot.safetensors' }, 'Cargando SAM 3D Body…');
  const pd = g.add('SAM3DBody_Predict', { sam3d_body_model: [m, 0], image: [img, 0], run_hand_refinement: true, fov: 0, batch_size: 8 }, 'Leyendo el cuerpo en 3D…');
  const bg = g.add('EmptyImage', { width: w, height: h, batch_size: 1, color: 0x2a2d33 });
  const r = g.add('SAM3DBody_Render', { pose_data: [pd, 0], width: w, height: h, background: [bg, 0], render_style: 'mesh',
    'render_style.shader': 'default', 'render_style.opacity': 1, 'render_style.person_palette_falloff': 0.6, 'render_style.region': 'full_body' }, 'Dibujando el maniquí…');
  // recorte alrededor del cuerpo (silueta como máscara): en fotos donde la persona es chica, el maniquí salía diminuto y el
  // personaje también (el lienzo de la pose = el del maniquí). 3:4 vertical, o.ancho = 4:3 horizontal.
  const sil = g.add('SAM3DBody_Render', { pose_data: [pd, 0], width: w, height: h, render_style: 'silhouette' });
  const mk = g.add('ImageToMask', { image: [sil, 0], channel: 'red' });
  const crop = g.add('ImageCropToMask', { images: [r, 0], masks: [mk, 0], width: o.ancho ? 1344 : 1008, height: o.ancho ? 1008 : 1344, pad_factor: 1.3, grow_mask: 0, background: '#2a2d33' }, 'Encuadrando…');
  saveImage(g, [crop, 0], 'phane/kimodo/foto_maniqui');
  return g;
}

const POSE_FILES = ['checkpoints/sdpose_wholebody_fp16.safetensors', 'model_patches/Z-Image-Turbo-Fun-Controlnet-Union.safetensors',
  'unet/z_image_turbo-Q8_0.gguf', 'text_encoders/qwen_3_4b.safetensors', 'vae/ae.safetensors'];
const QWEN_FILES = ['diffusion_models/qwen_image_2.1_turbo_int8_convrot.safetensors', 'text_encoders/qwen3vl_8b_int8_convrot.safetensors',
  'vae/qwen_image_2.1_vae_bf16.safetensors'];

export const ENGINES = [
  {
    id: 'image.pose', tool: 'image', tier: 'ligero',
    name: 'Pose exacta (SDPose + Z-Image ControlNet → Qwen 2.1)',
    desc: 'Copia la pose EXACTA de una foto o cuadro de video; con fotos de tu personaje le pone su diseño encima (Qwen 2.1).',
    files: [...POSE_FILES, ...QWEN_FILES],
    ramGB: 40,   // todos los cargadores viven en el mismo prompt: SDPose 1.9 + Z-Image Q8 ~7 + qwen_3_4b ~8 + ControlNet 3.1 + Qwen 2.1 7.3 + 8B 9.4 + VAEs + margen
    est: o => (isSkeleton(o.pose) ? 35 : 45) + ((o.refs || []).length ? 75 : 0) + (o.headRef ? 45 : 0),
    build: zimagePose, sample: SAMPLE,
    caps: { refs: 2, aspects: ['16:9', '9:16', '1:1', '4:3', '3:4'], maxCount: 1, pose: true, internal: true },
  },
  {
    id: 'image.pose_maniqui', tool: 'image', tier: 'highend',
    name: 'Pose con maniquí 3D (Qwen 2.1 + VNCCS PoseStudio)',
    desc: 'Tu personaje en la pose de un maniquí 3D (de Kimodo, cualquier ángulo). Calidad Qwen 2.1, orientación 3D real.',
    files: ['diffusion_models/qwen_image_2.1_int8_convrot.safetensors', 'loras/vnccs/VNCCS_QI2_PoseStudioV2.safetensors', ...QWEN_FILES.slice(1)],
    ramGB: 24,
    est: o => (o.turbo ? 60 : 330),   // medido 18-oct: turbo 49-75 s, completo 4-8 min
    build: vnccsPose, sample: SAMPLE,
    caps: { refs: 2, aspects: ['16:9', '9:16', '1:1', '4:3', '3:4'], maxCount: 1, pose: true, internal: true },
  },
  {
    id: 'image.pose_anypose', tool: 'image', tier: 'highend',
    name: 'Pose con maniquí, uso comercial (Qwen-Edit 2511 + AnyPose)',
    desc: 'Igual que la pose con maniquí, pero con modelos Apache-2.0 (se pueden usar para vender). 4 pasos.',
    files: ['diffusion_models/qwen_image_edit_2511_int8_convrot.safetensors', 'text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors', 'vae/qwen_image_vae.safetensors',
      'loras/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', 'loras/anypose/2511-AnyPose-base-000006250.safetensors', 'loras/anypose/2511-AnyPose-helper-00006000.safetensors'],
    ramGB: 36,
    est: () => 170,   // medido 18-oct: 138-195 s
    build: anyPose, sample: SAMPLE,
    caps: { refs: 2, aspects: ['16:9', '9:16', '1:1', '4:3', '3:4'], maxCount: 1, pose: true, internal: true },
  },
  {
    id: 'image.pose_klein', tool: 'image', tier: 'ligero',
    name: 'Pose con maniquí, Klein 4B + RefControl (Apache)',
    desc: 'Tercera ruta: FLUX.2 Klein 4B base con la profundidad del maniquí. Ligera y comercial; acepta la LoRA del personaje.',
    files: ['diffusion_models/flux-2-klein-base-4b-fp8.safetensors', 'loras/refcontrol/flux2_klein_4b_refcontrol_depth.safetensors',
      'text_encoders/qwen_3_4b.safetensors', 'vae/flux2-vae.safetensors', 'depth_anything/Depth-Anything-V2-Small-hf/model.safetensors'],
    ramGB: 16,
    est: () => 230,   // medido 18-oct: 228-231 s (20 pasos, CFG 5)
    build: kleinPose, sample: SAMPLE,
    caps: { refs: 1, aspects: ['16:9', '9:16', '1:1', '4:3', '3:4'], maxCount: 1, pose: true, heroLora: true, internal: true },
  },
  {
    id: 'pose.foto_maniqui', tool: 'image', tier: 'ligero',
    name: 'Foto → maniquí 3D (SAM 3D Body)',
    desc: 'Convierte la pose de una foto o cuadro de video en un maniquí 3D gris, listo para 🧍 Copiar su pose.',
    files: ['detection/sam_3d_body_dinov3_int8_convrot.safetensors'],
    ramGB: 6,
    est: () => 25,
    build: fotoManiqui, sample: { image: { ref: 'ejemplo.png', w: 2688, h: 1520 } },
    caps: { internal: true },
  },
];
