"""Puente Kimodo (NVIDIA, texto -> movimiento 3D) -> Phane.

Corre con el venv de Kimodo (<PHANE_KIMODO_DIR>\\venv), nunca con el Python de ComfyUI:
  python -I kimodo_puente.py todo   --prompt "A person ..." --dur 5 --seed 42 --out <carpeta> --name <nombre>
  python -I kimodo_puente.py gen    (igual que todo, sin dibujar)
  python -I kimodo_puente.py render --npz <motion.npz> --out <carpeta> --name <nombre> [--yaw 0] [--elev 6]
  python -I kimodo_puente.py cuadro --npz <motion.npz> --frame 45 --out <carpeta> --name <nombre>
  python -I kimodo_puente.py llama  (baja Llama-3-8B-Instruct SIN token desde el espejo abierto NousResearch; ver LLAMA_*)

Salidas (en --out):  <name>_maniqui.mp4 (maniquí 3D, para Recast), <name>_esqueleto.mp4 (esqueleto estilo SDPose),
  <name>_esqueleto_fNNN.png (poses clave, listas para "🧍 Pose a copiar"), <name>.bvh (T-pose de reposo, para el juego),
  <name>.npz (formato Kimodo), <name>.json (prompt, tiempos, VRAM).  La última línea impresa es  RESULT {json}.

Notas:
- El texto lo lee LLM2Vec (Llama-3-8B, 16 GB en bf16). En una tarjeta de 8 GB va en CPU (TEXT_ENCODER_DEVICE=cpu, ~16 GB
  de RAM). Cada prompt leído se guarda en cache_textos/ (es determinista: batch 1), así que repetirlo no vuelve a cargar Llama.
- Kimodo: y arriba, +z al frente del personaje, x a su izquierda, metros, 30 fps.
- El esqueleto se dibuja con el MISMO código de dibujo de SDPose de ComfyUI (comfy_extras/pose/keypoint_draw.py), así el
  ControlNet de Z-Image recibe lo que ya conoce. La cara (68 puntos), ojos, orejas, pies y dedos salen del esqueleto de 77
  articulaciones de Kimodo, así que el esqueleto SÍ dice hacia dónde mira (a diferencia de una foto de espaldas).
"""
import argparse
import gc
import hashlib
import importlib.util
import json
import re
import os
import shutil
import subprocess
import sys
import time

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))          # <PHANE_KIMODO_DIR> (custom_nodes/phane/kimodo)
os.environ.setdefault("HF_HUB_CACHE", os.path.join(ROOT, "hf_cache"))
os.environ.setdefault("TEXT_ENCODER_DEVICE", "cpu")                          # 8 GB de VRAM: Llama-3-8B no cabe
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
COMFY = os.environ.get("COMFY_DIR", os.path.abspath(os.path.join(ROOT, "..", "..", "..")))
CACHE_TXT = os.path.join(ROOT, "cache_textos")
MODEL = os.environ.get("KIMODO_MODEL", "Kimodo-SOMA-RP-v1.2")
FPS = 30
# Llama 3 (lector de texto de LLM2Vec). LLM2Vec y transformers lo piden SIEMPRE con el nombre oficial (los adapter_config de
# McGill-NLP dicen meta-llama/…, y LLM2Vec arma el prompt de chat solo si config._name_or_path es ese nombre exacto).
# Sin token (28-oct): el repo abierto NousResearch/Meta-Llama-3-8B-Instruct tiene los MISMOS archivos (sha256 de los 4
# safetensors y git-sha1 de config/tokenizer idénticos a los de Meta). `kimodo_puente.py llama` lo baja directo a la carpeta
# de caché de meta-llama (snapshot + refs/main), así todo lo encuentra con el nombre oficial. Si ya está el de Meta, no hace nada.
LLAMA_REPO = "meta-llama/Meta-Llama-3-8B-Instruct"
LLAMA_ESPEJO = "NousResearch/Meta-Llama-3-8B-Instruct"
LLAMA_ESPEJO_REV = "53346005fb0ef11d3b6a83b12c895cca40156b6c"                 # commit fijo del espejo (revisado el 28-oct)
LLAMA_ARCHIVOS = {                                                           # nombre -> bytes (los de Meta y los del espejo)
    "config.json": 654, "generation_config.json": 187, "special_tokens_map.json": 73,
    "tokenizer.json": 9085698, "tokenizer_config.json": 50977, "model.safetensors.index.json": 23950,
    "model-00001-of-00004.safetensors": 4976698672, "model-00002-of-00004.safetensors": 4999802720,
    "model-00003-of-00004.safetensors": 4915916176, "model-00004-of-00004.safetensors": 1168138808,
}
LLAMA_MARCA = "phane_espejo.txt"     # en models--meta-llama--…: el snapshot salió del espejo abierto


def _repo_dir(repo):
    return os.path.join(os.environ["HF_HUB_CACHE"], "models--" + repo.replace("/", "--"))


# Con el espejo (sin token) todo va desde la caché: sin red, transformers no le pregunta al repo cerrado de Meta (daría 401).
# Se decide ANTES de importar huggingface_hub/transformers (leen HF_HUB_OFFLINE al importarse). Con el de Meta no cambia nada.
_OFFLINE_AUTO = os.path.isfile(os.path.join(_repo_dir(LLAMA_REPO), LLAMA_MARCA)) and "HF_HUB_OFFLINE" not in os.environ
if _OFFLINE_AUTO:
    os.environ["HF_HUB_OFFLINE"] = "1"


def log(*a):
    print(*a, flush=True)


# ------------------------------------------------------------------ texto (LLM2Vec con caché en disco)
class TextoCache:
    """Codificador de texto compatible con Kimodo (devuelve [B,1,4096], longitudes) que lee de cache_textos/.
    Los prompts nuevos se leen con LLM2Vec en `prefetch` y luego se suelta Llama (16 GB de RAM)."""

    def __init__(self):
        os.makedirs(CACHE_TXT, exist_ok=True)
        self.secs = 0.0
        self.nuevos = 0

    @staticmethod
    def _path(t):
        return os.path.join(CACHE_TXT, hashlib.sha1(t.strip().encode("utf-8")).hexdigest() + ".npy")

    def faltan(self, texts):
        return [t for t in dict.fromkeys(texts) if t.strip() and not os.path.exists(self._path(t))]

    def prefetch(self, texts):
        miss = self.faltan(texts)
        if not miss:
            return
        t0 = time.time()
        log(f"Leyendo {len(miss)} prompt(s) nuevo(s) con Llama-3-8B en {os.environ['TEXT_ENCODER_DEVICE']} (la 1.ª vez tarda)…")
        from kimodo.model.load_model import TEXT_ENCODER_PRESETS
        from kimodo.model.llm2vec.llm2vec_wrapper import LLM2VecEncoder
        kw = dict(TEXT_ENCODER_PRESETS["llm2vec"]["kwargs"])
        enc = LLM2VecEncoder(**kw)
        for t in miss:
            feat, _ = enc([t])
            np.save(self._path(t), feat.float().cpu().numpy()[0].astype(np.float32))   # [1, 4096]
        del enc
        gc.collect()
        self.secs += time.time() - t0
        self.nuevos += len(miss)
        log(f"Texto listo en {time.time() - t0:.0f} s (Llama soltado).")

    def __call__(self, texts):
        single = isinstance(texts, str)
        texts = [texts] if single else list(texts)
        self.prefetch(texts)
        import torch
        feats = [np.load(self._path(t)) if t.strip() else np.zeros((1, 4096), np.float32) for t in texts]
        out = torch.from_numpy(np.stack(feats))                                     # [B, 1, 4096]
        lengths = [1] * len(texts)
        return (out[0], lengths[0]) if single else (out, lengths)

    def to(self, *a, **k):
        return self

    def eval(self):
        return self


def _snapshot_completo(repo):
    """Carpeta del snapshot de `repo` en la caché si tiene config, tokenizer y TODOS los safetensors del índice (solo disco)."""
    d = _repo_dir(repo)
    try:
        with open(os.path.join(d, "refs", "main"), encoding="utf-8") as f:
            rev = f.read().strip()
        s = os.path.join(d, "snapshots", rev)
        with open(os.path.join(s, "model.safetensors.index.json"), encoding="utf-8") as f:
            shards = set(json.load(f).get("weight_map", {}).values())
    except (OSError, ValueError):
        return None
    need = {"config.json", "tokenizer.json", "tokenizer_config.json", *shards}
    return s if shards and all(os.path.isfile(os.path.join(s, n)) for n in need) else None


def _snapshot_desde(src, rev):
    """Arma el snapshot de meta-llama con los archivos de otra carpeta (p. ej. un `hf download NousResearch/…` normal):
    enlaces duros (mismo disco, sin ocupar más) o, si no se puede, copia. -> carpeta del snapshot o None."""
    d = _repo_dir(LLAMA_REPO)
    s = os.path.join(d, "snapshots", rev)
    os.makedirs(s, exist_ok=True)
    for n in LLAMA_ARCHIVOS:
        a, b = os.path.join(src, n), os.path.join(s, n)
        if not os.path.isfile(a) or (os.path.isfile(b) and os.path.getsize(b) == os.path.getsize(a)):
            continue
        try:
            os.link(os.path.realpath(a), b)
        except OSError:
            shutil.copy2(a, b)
    return _fijar_ref(rev)


def _fijar_ref(rev):
    """refs/main -> rev (sin salto de línea, como lo escribe huggingface_hub) + marca del espejo. -> snapshot o None."""
    d = _repo_dir(LLAMA_REPO)
    os.makedirs(os.path.join(d, "refs"), exist_ok=True)
    with open(os.path.join(d, "refs", "main"), "w", encoding="utf-8", newline="") as f:
        f.write(rev)
    s = _snapshot_completo(LLAMA_REPO)
    if s:
        with open(os.path.join(d, LLAMA_MARCA), "w", encoding="utf-8") as f:
            f.write(f"{LLAMA_ESPEJO}@{rev}\nMismos archivos que {LLAMA_REPO} (Meta Llama 3 Community License).\n")
    return s


def llama_instalado():
    """¿Está Llama-3-8B-Instruct? Vale el oficial de Meta (con token) o el espejo abierto NousResearch (sin token), ya sea
    bajado con `kimodo_puente.py llama` o con un `hf download NousResearch/Meta-Llama-3-8B-Instruct` normal a esta caché
    (en ese caso arma aquí mismo el snapshot de meta-llama con enlaces duros). Solo mira el disco: sin red ni torch."""
    if _snapshot_completo(LLAMA_REPO):
        return True
    nous = _snapshot_completo(LLAMA_ESPEJO)
    if nous:
        try:
            return bool(_snapshot_desde(nous, os.path.basename(nous)))
        except OSError:
            return False
    return False


def bajar_llama():
    """Baja Llama-3-8B-Instruct SIN token desde el espejo abierto, directo al snapshot de meta-llama en la caché (16 GB;
    si se corta, al repetirlo sigue donde iba). Si ya está (oficial o espejo), no baja nada."""
    if llama_instalado():
        log("Llama-3-8B-Instruct ya está instalado.")
        return {"llama": True, "bajado": False}
    if _OFFLINE_AUTO:                     # snapshot del espejo incompleto: esta vez sí hace falta la red
        os.environ.pop("HF_HUB_OFFLINE", None)
    from huggingface_hub import snapshot_download
    s = os.path.join(_repo_dir(LLAMA_REPO), "snapshots", LLAMA_ESPEJO_REV)
    log(f"Bajando {LLAMA_ESPEJO} (espejo abierto, mismos archivos que {LLAMA_REPO}; 16 GB)…")
    snapshot_download(LLAMA_ESPEJO, revision=LLAMA_ESPEJO_REV, allow_patterns=list(LLAMA_ARCHIVOS), local_dir=s)
    mal = [n for n, b in LLAMA_ARCHIVOS.items() if not os.path.isfile(os.path.join(s, n)) or os.path.getsize(os.path.join(s, n)) != b]
    if mal:
        raise SystemExit("La descarga quedó incompleta (" + ", ".join(mal) + "). Vuelve a correrla: sigue donde iba.")
    ok = _fijar_ref(LLAMA_ESPEJO_REV)
    log("Llama-3-8B-Instruct listo." if ok else "No pude armar el snapshot de meta-llama en la caché.")
    return {"llama": bool(ok), "bajado": True}


# ------------------------------------------------------------------ generar
def generar(a):
    import torch
    from kimodo import load_model
    from kimodo.exports.bvh import save_motion_bvh
    from kimodo.exports.motion_io import save_kimodo_npz
    from kimodo.skeleton import SOMASkeleton30, global_rots_to_local_rots
    from kimodo.tools import seed_everything

    prompts = [p.strip() for p in a.prompt.replace("|", "\n").split("\n") if p.strip()]
    if not prompts:
        raise SystemExit("Falta el prompt")
    durs = [float(x) for x in str(a.dur).split(",")]
    durs = (durs * len(prompts))[:len(prompts)] if len(durs) < len(prompts) else durs[:len(prompts)]
    frames = [max(30, min(300, int(round(d * FPS)))) for d in durs]

    enc = TextoCache()
    if enc.faltan(prompts) and not llama_instalado():
        raise SystemExit("FALTA_LLAMA: el prompt es nuevo y Llama-3-8B-Instruct no está descargado (ni el oficial "
                         f"{LLAMA_REPO} ni el espejo abierto {LLAMA_ESPEJO}). Corre descargar_llama.bat (download_llama.bat): "
                         "baja el espejo sin token ni login (16 GB). Mientras, usa un movimiento ya listo.")
    enc.prefetch(prompts)                       # antes de tocar la GPU: Llama se carga, lee y se suelta

    # limpieza de pies: necesita la extensión C++ motion_correction; si no se pudo compilar (install_kimodo.bat), va sin ella
    POST = not a.no_post and importlib.util.find_spec("motion_correction") is not None
    t0 = time.time()
    torch.cuda.reset_peak_memory_stats()
    model = load_model(MODEL, device="cuda", text_encoder=enc)
    t_load = time.time() - t0
    seed = a.seed if a.seed is not None else int(time.time()) % 100000
    seed_everything(seed)
    t1 = time.time()
    out = model(prompts, frames, constraint_lst=[], num_denoising_steps=a.steps, num_samples=1, multi_prompt=True,
                post_processing=POST, return_numpy=True, cfg_weight=[a.cfg, 2.0])
    t_gen = time.time() - t1
    vram = torch.cuda.max_memory_allocated() / 2**30
    single = {k: (v[0] if hasattr(v, "shape") and len(v.shape) > 0 and v.shape[0] == 1 else v) for k, v in out.items()}
    os.makedirs(a.out, exist_ok=True)
    npz = os.path.join(a.out, a.name + ".npz")
    save_kimodo_npz(npz, single)

    skel = model.skeleton
    if isinstance(skel, SOMASkeleton30):
        skel = skel.somaskel77.to("cuda")
    jp = torch.from_numpy(single["posed_joints"]).to("cuda")
    jr = torch.from_numpy(single["global_rot_mats"]).to("cuda")
    bvh = os.path.join(a.out, a.name + ".bvh")
    save_motion_bvh(bvh, global_rots_to_local_rots(jr, skel), jp[:, skel.root_idx, :], skeleton=skel, fps=FPS, standard_tpose=True)
    info = {"prompts": prompts, "frames": frames, "seed": seed, "steps": a.steps, "post": POST, "model": MODEL,
            "secs_texto": round(enc.secs, 1), "prompts_nuevos": enc.nuevos, "secs_carga": round(t_load, 1),
            "secs_movimiento": round(t_gen, 1), "vram_pico_gb": round(vram, 2), "npz": npz, "bvh": bvh}
    del model
    gc.collect()
    torch.cuda.empty_cache()
    log(f"Movimiento listo: {sum(frames)} cuadros en {t_gen:.1f} s (carga {t_load:.1f} s, VRAM pico {vram:.2f} GB).")
    return info


# ------------------------------------------------------------------ cargar movimiento (30 o 77 articulaciones)
_SKEL = {}


def skel77():
    if "77" not in _SKEL:
        from kimodo.skeleton import SOMASkeleton77
        _SKEL["77"] = SOMASkeleton77()
    return _SKEL["77"]


def cargar(npz):
    """-> (posed_joints [T,77,3], global_rot_mats [T,77,3,3]) en numpy."""
    d = np.load(npz, allow_pickle=False)
    pj, gr = d["posed_joints"], d["global_rot_mats"]
    if pj.shape[1] == 77:
        return pj.astype(np.float32), gr.astype(np.float32)
    import torch
    from kimodo.skeleton import SOMASkeleton30, global_rots_to_local_rots
    s30 = SOMASkeleton30()
    g = torch.from_numpy(gr).float()
    local = global_rots_to_local_rots(g, s30)
    o = s30.output_to_SOMASkeleton77({"local_rot_mats": local, "root_positions": torch.from_numpy(pj[:, s30.root_idx]).float()})
    return o["posed_joints"].numpy(), o["global_rot_mats"].numpy()


# ------------------------------------------------------------------ puntos estilo OpenPose / COCO-WholeBody
def _n(v):
    return v / (np.linalg.norm(v, axis=-1, keepdims=True) + 1e-8)


def _face_template():
    """68 puntos de cara (orden dlib/OpenPose) en el marco de la cabeza: x = izquierda del personaje, y = arriba, z = al frente,
    origen = punto medio de los ojos, metros. El punto 0 está del lado DERECHO del personaje (izquierda de la imagen)."""
    P = []
    for i in range(17):                                   # 0-16 mandíbula, de la sien derecha al mentón a la sien izquierda
        t = -np.pi / 2 + np.pi * i / 16
        P.append((0.068 * np.sin(t), -0.012 - 0.105 * np.cos(t) ** 1.2, -0.045 + 0.075 * np.cos(t)))
    for i in range(5):                                    # 17-21 ceja derecha (de afuera hacia adentro)
        x = -0.056 + 0.042 * i / 4
        P.append((x, 0.024 + 0.008 * np.sin(np.pi * (i + 0.5) / 5), 0.008 + 0.012 * i / 4))
    for i in range(5):                                    # 22-26 ceja izquierda (de adentro hacia afuera)
        x = 0.014 + 0.042 * i / 4
        P.append((x, 0.024 + 0.008 * np.sin(np.pi * (4.5 - i) / 5), 0.020 - 0.012 * i / 4))
    for i in range(4):                                    # 27-30 puente de la nariz
        P.append((0.0, -0.004 - 0.014 * i, 0.016 + 0.009 * i))
    for i in range(5):                                    # 31-35 base de la nariz
        x = -0.016 + 0.008 * i
        P.append((x, -0.052 + 0.003 * abs(i - 2), 0.030 - 0.004 * abs(i - 2)))
    eye = [(-1, 0), (-0.45, 0.42), (0.45, 0.42), (1, 0), (0.45, -0.36), (-0.45, -0.36)]
    for cx, order in ((-0.032, 1), (0.032, 1)):           # 36-41 ojo derecho, 42-47 ojo izquierdo (empiezan por la izquierda de la imagen)
        for ex, ey in eye:
            P.append((cx + 0.013 * ex, 0.007 * ey, 0.004 - 0.004 * abs(ex)))
    mo = [(-1, 0), (-0.6, 0.35), (-0.2, 0.5), (0, 0.42), (0.2, 0.5), (0.6, 0.35), (1, 0),     # 48-54 labio superior
          (0.6, -0.45), (0.2, -0.6), (0, -0.62), (-0.2, -0.6), (-0.6, -0.45)]              # 55-59 labio inferior
    for mx, my in mo:
        P.append((0.025 * mx, -0.078 + 0.012 * my, 0.022 - 0.01 * abs(mx)))
    mi = [(-0.8, 0), (-0.3, 0.18), (0, 0.18), (0.3, 0.18), (0.8, 0), (0.3, -0.18), (0, -0.18), (-0.3, -0.18)]  # 60-67
    for mx, my in mi:
        P.append((0.025 * mx, -0.078 + 0.012 * my, 0.020 - 0.008 * abs(mx)))
    return np.array(P, np.float32)


FACE = _face_template()


def keypoints3d(pj):
    """[T,77,3] -> [T,134,3] en el orden de SDPose (0-17 cuerpo OpenPose, 18-23 pies, 24-91 cara, 92-112 mano der., 113-133 izq.)
    + normales aproximadas (para saber qué se ve desde la cámara)."""
    names = skel77().bone_order_names
    J = {n: pj[:, i] for i, n in enumerate(names)}
    T = pj.shape[0]
    up_w = np.array([0, 1, 0], np.float32)
    head, he = J["Head"], J["HeadEnd"]
    eyes = (J["LeftEye"] + J["RightEye"]) / 2
    hup = _n(he - J["Neck2"])
    hl = _n(J["LeftEye"] - J["RightEye"])                                   # a la izquierda del personaje
    hl = _n(hl - (hl * hup).sum(-1, keepdims=True) * hup)
    hf = _n(np.cross(hl, hup))                                               # al frente
    # el frente tiene que apuntar de la cabeza hacia los ojos
    flip = ((eyes - head) * hf).sum(-1) < 0
    hf[flip] *= -1
    kp = np.zeros((T, 134, 3), np.float32)
    nrm = np.zeros((T, 134, 3), np.float32)
    hc = eyes - hf * 0.075 + hup * 0.01                                      # centro aprox. del cráneo
    def put(i, p, n=None):
        kp[:, i] = p
        nrm[:, i] = _n(p - hc) if n is None else n
    put(0, eyes + hf * 0.035 - hup * 0.035)                                  # nariz
    put(1, (J["RightArm"] + J["LeftArm"]) / 2, hf)                           # cuello (SDPose: punto medio de los hombros)
    for i, n in zip(range(2, 14), ["RightArm", "RightForeArm", "RightHand", "LeftArm", "LeftForeArm", "LeftHand",
                                   "RightLeg", "RightShin", "RightFoot", "LeftLeg", "LeftShin", "LeftFoot"]):
        put(i, J[n], hf)
    put(14, J["RightEye"])
    put(15, J["LeftEye"])
    put(16, hc - hl * 0.072 - hup * 0.02)                                     # oreja derecha
    put(17, hc + hl * 0.072 - hup * 0.02)                                     # oreja izquierda
    for k, side in ((18, "Left"), (21, "Right")):                            # pies COCO-WholeBody: dedo gordo, dedo chico, talón
        a, tb, te = J[side + "Foot"], J[side + "ToeBase"], J[side + "ToeEnd"]
        ff = _n(te - a)
        lat = _n(np.cross(up_w, ff)) * (1 if side == "Left" else -1)         # hacia AFUERA del pie
        put(k, te - lat * 0.022, up_w + 0 * ff)
        put(k + 1, tb + lat * 0.035 + ff * 0.01, up_w + 0 * ff)
        put(k + 2, a - ff * 0.06 - up_w * 0.065, up_w + 0 * ff)
    R = np.stack([hl, hup, hf], -1)                                           # [T,3,3] columnas = ejes de la cabeza
    face = np.einsum("tij,fj->tfi", R, FACE) + eyes[:, None]
    kp[:, 24:92] = face
    nrm[:, 24:92] = _n(face - hc[:, None])
    for base, side in ((92, "Right"), (113, "Left")):
        hand = [side + "Hand", side + "HandThumb1", side + "HandThumb2", side + "HandThumb3", side + "HandThumbEnd"]
        for f in ("Index", "Middle", "Ring", "Pinky"):
            hand += [side + "Hand" + f + s for s in ("2", "3", "4", "End")]
        for i, n in enumerate(hand):
            put(base + i, J[n], hf)
    return kp, nrm


# ------------------------------------------------------------------ cámara
def heading(pj, t=0):
    names = skel77().bone_order_names
    li, ri = names.index("LeftLeg"), names.index("RightLeg")
    lat = pj[t, li] - pj[t, ri]
    f = np.cross(lat, [0, 1, 0])
    f[1] = 0
    return _n(f.astype(np.float32))


class Camara:
    """Perspectiva suave (a 7 m, como un tele) que mira al personaje desde el frente de su dirección inicial.
    yaw: 0 = de frente, 90 = desde su izquierda, -90 = desde su derecha, 180 = de espaldas. elev: grados hacia abajo."""

    def __init__(self, pj, yaw=0.0, elev=6.0, sigue=None, dist=7.0):
        T = pj.shape[0]
        f0 = heading(pj, 0)
        up = np.array([0, 1, 0], np.float32)
        r0 = _n(np.cross(f0, up))                                             # derecha del personaje
        y = np.radians(yaw)
        hor = f0 * np.cos(y) - r0 * np.sin(y)                                 # dirección del personaje hacia la cámara
        e = np.radians(elev)
        self.dir = _n(hor * np.cos(e) + up * np.sin(e))
        root = pj[:, 0].copy()
        travel = np.linalg.norm((root - root[0])[:, [0, 2]], axis=-1).max()
        self.sigue = travel > 1.2 if sigue is None else sigue
        if self.sigue:                                                        # sigue al personaje (paneo suave)
            k = 21
            pad = np.pad(root, ((k // 2, k // 2), (0, 0)), mode="edge")
            sm = np.stack([np.convolve(pad[:, i], np.ones(k) / k, mode="valid") for i in range(3)], -1)
            tgt = sm
        else:
            tgt = np.repeat(root.mean(0, keepdims=True), T, 0)
        tgt[:, 1] = pj[:, :, 1].min() + 0.9                                    # altura fija (a la cintura)
        self.tgt = tgt.astype(np.float32)
        self.pos = self.tgt + self.dir * dist
        self.fwd = -self.dir
        self.right = _n(np.cross(self.fwd, up))
        self.upc = np.cross(self.right, self.fwd)

    def proyecta(self, P, t):
        """P [..., 3] del cuadro t -> (x, y) normalizados (y hacia abajo) y profundidad."""
        v = P - self.pos[t]
        z = (v * self.fwd).sum(-1)
        x = (v * self.right).sum(-1) / z
        y = -(v * self.upc).sum(-1) / z
        return np.stack([x, y], -1), z


def ajusta(xy_all, W, H, margen=0.08, arriba=None, abajo=None):
    """Escala/centro para que todos los puntos quepan en W x H con márgenes (arriba/abajo opcionales, fracción de H)."""
    arriba = margen if arriba is None else arriba
    abajo = margen if abajo is None else abajo
    lo, hi = xy_all.min(0), xy_all.max(0)
    ext = np.maximum(hi - lo, 1e-3)
    s = min(W * (1 - 2 * margen) / ext[0], H * (1 - arriba - abajo) / ext[1])
    c = (lo + hi) / 2
    c = c + [0, (arriba - abajo) * H / 2 / s]           # corre la figura hacia abajo si arriba hay más margen
    return s, c


def formato(ext_w, ext_h, opciones=((16, 9), (4, 3), (1, 1), (3, 4), (9, 16)), lado=1024):
    """Formato del estudio más cercano a la caja del personaje -> (W, H) con lado mayor = lado, múltiplos de 16."""
    r = ext_w / max(ext_h, 1e-6)
    a, b = min(opciones, key=lambda o: abs(np.log(r / (o[0] / o[1]))))
    if a >= b:
        return lado, int(round(lado * b / a / 16)) * 16
    return int(round(lado * a / b / 16)) * 16, lado


# ------------------------------------------------------------------ dibujo del esqueleto (código de SDPose de ComfyUI)
_KD = {}


def keypoint_draw():
    if "kd" not in _KD:
        p = os.path.join(COMFY, "comfy_extras", "pose", "keypoint_draw.py")
        spec = importlib.util.spec_from_file_location("he_keypoint_draw", p)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        _KD["kd"] = m.KeypointDraw()
    return _KD["kd"]


def visibles(kp, nrm, cam, t):
    """Puntuación 1/0 por punto: la cara, los ojos, la nariz y las orejas solo se ven si miran a la cámara."""
    to_cam = _n(cam.pos[t] - kp[t])
    d = (nrm[t] * to_cam).sum(-1)
    sc = np.ones(134, np.float32)
    head_idx = np.r_[0, 14, 15, 24:92]
    sc[head_idx] = (d[head_idx] > 0.05).astype(np.float32)
    sc[[16, 17]] = (d[[16, 17]] > -0.35).astype(np.float32)
    return sc


def dibuja_esqueleto(kp2d, sc, W, H):
    canvas = np.zeros((H, W, 3), np.uint8)
    return keypoint_draw().draw_wholebody_keypoints(canvas, kp2d, sc, threshold=0.5, draw_body=True, draw_head=True, draw_feet=True,
                                                    draw_face=True, draw_hands=True, stick_width=4, face_point_size=2)


# ------------------------------------------------------------------ maniquí 3D (piel SOMA de Kimodo, render propio con PIL)
def vertices_maniqui(pj, gr):
    import torch
    import kimodo
    # kimodo.viz/__init__ importa viser (solo para la demo web); el módulo de piel no lo necesita: se carga directo
    spec = importlib.util.spec_from_file_location("he_soma_skin", os.path.join(os.path.dirname(kimodo.__file__), "viz", "soma_skin.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    SOMASkin = m.SOMASkin
    sk = skel77()
    skin = SOMASkin(sk)
    with torch.no_grad():
        v = skin.skin(torch.from_numpy(gr).float(), torch.from_numpy(pj).float(), rot_is_global=True)
    return v.numpy().astype(np.float32), skin.faces.numpy()


def dibuja_maniqui(V, F, cam, t, s, c, W, H, ss=2, piso=None):
    from PIL import Image, ImageDraw, ImageFilter
    w2, h2 = W * ss, H * ss
    # fondo: degradado neutro (Animate copia el movimiento; el fondo lo decide el prompt)
    g = np.linspace(58, 30, h2, dtype=np.float32)[:, None, None] * np.array([1.0, 1.04, 1.12], np.float32)
    img = Image.fromarray(np.repeat(g, w2, 1).astype(np.uint8))
    # sombra de contacto en el piso, bajo la pelvis (piso aparte cuando el cuerpo va en el aire: ver inclina)
    floor = V[t][:, 1].min() if piso is None else piso
    ang = np.linspace(0, 2 * np.pi, 48)
    ring = np.stack([np.cos(ang) * 0.42, np.zeros_like(ang), np.sin(ang) * 0.32], -1) + [V[t][:, 0].mean(), floor, V[t][:, 2].mean()]
    rx, _ = cam.proyecta(ring.astype(np.float32), t)
    sh = Image.new("L", (w2, h2), 0)
    ImageDraw.Draw(sh).polygon([tuple(p) for p in ((rx - c) * s * ss + [w2 / 2, h2 / 2])], fill=150)
    sh = sh.filter(ImageFilter.GaussianBlur(10 * ss))
    img = Image.composite(Image.new("RGB", (w2, h2), (14, 15, 18)), img, sh)
    v = V[t]
    xy, z = cam.proyecta(v, t)
    px = (xy - c) * s * ss + [w2 / 2, h2 / 2]
    tri = v[F]
    n = _n(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]))
    cen = tri.mean(1)
    to_cam = _n(cam.pos[t] - cen)
    keep = (n * to_cam).sum(-1) > 0
    F2, n2, tc = F[keep], n[keep], to_cam[keep]
    L = _n(-cam.right * 0.45 + cam.upc * 0.75 + cam.dir * 0.6)
    lam = np.clip((n2 * L).sum(-1), 0, 1)
    rim = (1 - np.clip((n2 * tc).sum(-1), 0, 1)) ** 2.5
    shade = np.clip(0.32 + 0.62 * lam + 0.22 * rim, 0, 1)
    base = np.array([214, 206, 196], np.float32)
    col = (shade[:, None] * base).astype(np.uint8)
    order = np.argsort(-z[F2].mean(1))                                        # pintor: lo lejano primero
    d = ImageDraw.Draw(img)
    P = px[F2[order]].reshape(len(order), -1)
    for poly, cc in zip(P.tolist(), map(tuple, col[order].tolist())):
        d.polygon(poly, fill=cc)
    return np.asarray(img.resize((W, H), Image.LANCZOS))


# ------------------------------------------------------------------ video
def ffmpeg_exe():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import glob
    cand = glob.glob(os.path.join(os.path.dirname(COMFY), "python_embeded", "Lib", "site-packages", "imageio_ffmpeg", "binaries", "ffmpeg*.exe"))
    if cand:
        return cand[0]
    raise SystemExit("No encontré ffmpeg")


def escribe_mp4(path, frames_iter, W, H, fps=FPS):
    p = subprocess.Popen([ffmpeg_exe(), "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps),
                          "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path],
                         stdin=subprocess.PIPE)
    for fr in frames_iter:
        p.stdin.write(np.ascontiguousarray(fr).tobytes())
    p.stdin.close()
    if p.wait() != 0:
        raise SystemExit("ffmpeg falló al escribir " + path)


# ------------------------------------------------------------------ poses clave
def cuadro_golpe(pj):
    """Cuadro del golpe (18-oct): el instante en que el movimiento más rápido de manos/pies (sin traslación ni giro)
    o del cuerpo entero (salir volando) termina, o sea el contacto o la extensión, no la preparación.
    Busca el pico de velocidad y avanza hasta que la velocidad baja a la mitad (máx. 8 cuadros)."""
    T = pj.shape[0]
    if T < 5:
        return T // 2
    names = list(skel77().bone_order_names)
    ext = [names.index(n) for n in ("RightHand", "LeftHand", "RightFoot", "LeftFoot")]
    rel = pj - pj[:, :1]
    f = np.stack([heading(pj, t) for t in range(T)])
    ang = np.arctan2(f[:, 0], f[:, 2])
    c, s_ = np.cos(-ang), np.sin(-ang)
    Ry = np.zeros((T, 3, 3), np.float32)
    Ry[:, 0, 0], Ry[:, 0, 2], Ry[:, 1, 1], Ry[:, 2, 0], Ry[:, 2, 2] = c, s_, 1, -s_, c
    loc = np.einsum("tij,tkj->tki", Ry, rel)[:, ext]
    v = np.zeros(T, np.float32)
    v[1:-1] = np.linalg.norm(loc[2:] - loc[:-2], axis=-1).max(-1) / 2
    vr = np.zeros(T, np.float32)
    vr[1:-1] = np.linalg.norm(pj[2:, 0] - pj[:-2, 0], axis=-1) / 2
    sc = np.maximum(v, 0.6 * vr)
    sc = np.convolve(sc, np.ones(3, np.float32) / 3, mode="same")
    lo, hi = max(1, int(T * 0.04)), min(T - 2, int(T * 0.96))
    # picos fuertes (>= 30 % del máximo; en Kimodo el golpe a veces es más lento que la carrera). Cada uno termina donde
    # la velocidad baja a la mitad. Gana el que termina con mano o pie MÁS ESTIRADO en horizontal (frente/lado):
    # la preparación sube el arma (vertical) y la recuperación recoge todo pegado al cuerpo.
    top = sc[lo:hi + 1].max()
    picos = [t for t in range(lo, hi + 1) if sc[t] >= 0.3 * top and sc[t] >= sc[t - 1] and sc[t] >= sc[t + 1]]
    if not picos:
        picos = [lo + int(np.argmax(sc[lo:hi + 1]))]

    def fin(p):
        for t in range(p + 1, min(hi, p + 8) + 1):
            if sc[t] < 0.5 * sc[p]:
                return t
        return min(hi, p + 3)
    reach = np.linalg.norm(loc[:, :, [0, 2]], axis=-1).max(-1)
    return max((fin(p) for p in picos), key=lambda e: reach[e])


SALTO = re.compile(r"\b(jump|jumps|jumping|leap|leaps|leaping|hop|hops|hopping|vault|vaults)\b", re.I)


def es_salto(npz):
    """True si el texto con que se generó el movimiento (el .json junto al .npz) es un salto."""
    try:
        with open(os.path.splitext(npz)[0] + ".json", encoding="utf-8") as f:
            return any(SALTO.search(p or "") for p in json.load(f).get("prompts", []))
    except Exception:  # noqa: BLE001
        return False


def cuadro_pico(pj, salto=False):
    """Cuadro para 🎮 Juego (27-oct), solo con las articulaciones (sin IA). -> (cuadro, modo)
    - salto (texto) o despegue (los DOS tobillos suben > 8 cm sobre su altura de apoyo a la vez): la pelvis MÁS ALTA.
    - lo demás (baile, choque de manos...): máxima extensión = suma de distancias de manos y pies a la pelvis."""
    T = pj.shape[0]
    if T < 5:
        return T // 2, "medio"
    lo, hi = max(1, int(T * 0.04)), min(T - 2, int(T * 0.96))
    names = list(skel77().bone_order_names)
    ext = [names.index(n) for n in ("RightHand", "LeftHand", "RightFoot", "LeftFoot")]
    pies = pj[:, ext[2:], 1].min(1)                                           # el tobillo más bajo en cada cuadro
    despegue = float((pies - np.percentile(pies, 5)).max()) > 0.08
    if salto or despegue:
        return lo + int(np.argmax(pj[lo:hi + 1, 0, 1])), "pelvis_alta"
    sc = np.linalg.norm(pj[:, ext] - pj[:, :1], axis=-1).sum(-1)
    sc = np.convolve(sc, np.ones(3, np.float32) / 3, mode="same")
    return lo + int(np.argmax(sc[lo:hi + 1])), "extension"


def poses_clave(pj, k=6):
    """k cuadros con poses MUY distintas entre sí (muestreo del punto más lejano), en orden de tiempo.
    La pose se compara sin la traslación ni el giro del cuerpo (lo que importa es la silueta)."""
    T = pj.shape[0]
    rel = pj - pj[:, :1]
    f = np.stack([heading(pj, t) for t in range(T)])
    ang = np.arctan2(f[:, 0], f[:, 2])
    c, s_ = np.cos(-ang), np.sin(-ang)
    Ry = np.zeros((T, 3, 3), np.float32)
    Ry[:, 0, 0], Ry[:, 0, 2], Ry[:, 1, 1], Ry[:, 2, 0], Ry[:, 2, 2] = c, s_, 1, -s_, c
    loc = np.einsum("tij,tkj->tki", Ry, rel)
    loc[:, :, 1] += pj[:, :1, 1]                                               # la altura de la pelvis sí cuenta (saltos, agacharse)
    X = loc.reshape(T, -1)
    d0 = np.linalg.norm(X - X[0], axis=1)
    sel = [int(np.argmax(d0))]
    dist = np.linalg.norm(X - X[sel[0]], axis=1)
    lo, hi = int(T * 0.04), int(T * 0.96)
    while len(sel) < min(k, T):
        cand = dist.copy()
        cand[:lo] = cand[hi:] = -1
        for q in sel:                                                         # separadas al menos 8 cuadros
            cand[max(0, q - 8):q + 9] = -1
        nxt = int(np.argmax(cand))
        if cand[nxt] <= 0:
            break
        sel.append(nxt)
        dist = np.minimum(dist, np.linalg.norm(X - X[nxt], axis=1))
    return sorted(sel)


# ------------------------------------------------------------------ render completo
# acciones de RECIBIR un golpe (19-oct): Kimodo aprendió de captura real y ahí nadie sale volando; solo trastabillea, y el
# maniquí (y la imagen) salen tiesos. Para esas, el cuadro se inclina hacia atrás y se despega del piso (ver inclina).
RECIBE = re.compile(r"\b(is|gets|being)\s+(violently\s+)?(hit|struck|punched|kicked|knocked|shot)\b|\bflies\s+back|\bknocked\s+(back|down)"
                    r"|\bfalls?\s+back", re.I)


def es_recibe(npz):
    """True si el texto con que se generó el movimiento (el .json junto al .npz) es de recibir un golpe."""
    try:
        with open(os.path.splitext(npz)[0] + ".json", encoding="utf-8") as f:
            return any(RECIBE.search(p or "") for p in json.load(f).get("prompts", []))
    except Exception:  # noqa: BLE001
        return False


def inclina(pj, gr, grados=35.0, alto=0.35):
    """Gira todo el cuerpo hacia atrás (sobre su eje lateral, pivote en la pelvis) y lo levanta del piso: 'sale volando'.
    -> (pj, gr, piso) con piso = altura original del piso para la sombra."""
    piso = float(pj[:, :, 1].min())
    f = heading(pj, 0)
    ax = _n(np.cross(f, np.array([0, 1, 0], np.float32)))
    head = skel77().bone_order_names.index("Head")

    def rot(a):
        K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]], np.float32)
        return (np.eye(3) + np.sin(a) * K + (1 - np.cos(a)) * K @ K).astype(np.float32)

    R = rot(np.radians(grados))
    if ((pj[0, head] - pj[0, 0]) @ R.T @ f) > ((pj[0, head] - pj[0, 0]) @ f):   # que la cabeza vaya hacia ATRÁS
        R = rot(-np.radians(grados))
    piv = pj[:, :1]
    pj2 = (pj - piv) @ R.T + piv
    pj2[:, :, 1] += (piso + alto) - pj2[:, :, 1].min(1, keepdims=True)
    return pj2.astype(np.float32), np.einsum("ij,tkjl->tkil", R, gr).astype(np.float32), piso


def render(npz, out, name, yaw=0.0, elev=6.0, k=6, video=True, solo=None, maniqui=False, lado=1024, aspecto=""):
    t0 = time.time()
    pj, gr = cargar(npz)
    T = pj.shape[0]
    piso = None
    kp, nrm = keypoints3d(pj)
    cam = Camara(pj, yaw, elev)
    res = {"cuadros": T, "sigue": bool(cam.sigue), "poses": [], "yaw": yaw}
    os.makedirs(out, exist_ok=True)

    # poses clave: cada una con su propio encuadre ajustado (más resolución para el ControlNet)
    if solo is not None and solo < 0:
        # --frame -1: el cuadro del GOLPE (fin del movimiento más rápido; ver cuadro_golpe)
        # --frame -2: el más lejano a la pose del cuadro 0 (ver poses_clave); en un espadazo suele ser la preparación
        # --frame -3: 🎮 Juego (27-oct): salto/despegue = pelvis más alta; lo demás = máxima extensión (ver cuadro_pico)
        recibe = es_recibe(npz)
        if solo == -3:
            solo, res["modo"] = cuadro_pico(pj, es_salto(npz))
        else:
            # recibir golpe: el cuadro del golpe sale casi parado; el más distinto al inicio es el de cabeza atrás y pie arriba
            solo = cuadro_golpe(pj) if solo == -1 and not recibe else poses_clave(pj, 1)[0]
        res["pico"] = int(solo)
        if recibe and maniqui:
            pj, gr, piso = inclina(pj, gr)
            kp, nrm = keypoints3d(pj)
            cam = Camara(pj, yaw, elev)
            res["vuelo"] = True
    frames = [solo] if solo is not None else poses_clave(pj, k)
    for t in frames:
        t = int(max(0, min(T - 1, t)))
        sc = visibles(kp, nrm, cam, t)
        xy, _ = cam.proyecta(kp[t], t)
        lo, hi = xy.min(0), xy.max(0)
        W, H = formato((hi - lo)[0] * 1.25, (hi - lo)[1] * 1.25)
        s, c = ajusta(xy, W, H, margen=0.1)
        img = dibuja_esqueleto((xy - c) * s + [W / 2, H / 2], sc, W, H)
        p = os.path.join(out, f"{name}_esqueleto_f{t:03d}{'' if not yaw else f'_v{int(round(yaw))}'}.png")
        from PIL import Image
        Image.fromarray(img).save(p)
        res["poses"].append({"frame": t, "png": p, "w": W, "h": H})
        if maniqui:
            # maniquí 3D de ESTE cuadro (pose sin identidad para Qwen 2.1 + LoRA VNCCS PoseStudio, 18-oct): aire arriba para casco/alas
            if "VF" not in res:
                res["VF"] = vertices_maniqui(pj, gr)
            V, F = res["VF"]
            vxy, _ = cam.proyecta(V[t], t)
            if piso is not None:   # que la sombra en el piso también quepa en el cuadro
                pie = np.array([[V[t][:, 0].mean(), piso, V[t][:, 2].mean()]], np.float32)
                vxy = np.concatenate([vxy, cam.proyecta(pie, t)[0]])
            lo2, hi2 = vxy.min(0), vxy.max(0)
            if aspecto:
                a_w, a_h = (int(x) for x in aspecto.split(":"))
                Wm, Hm = (lado, round(lado * a_h / a_w / 16) * 16) if a_w >= a_h else (round(lado * a_w / a_h / 16) * 16, lado)
            else:
                Wm, Hm = formato((hi2 - lo2)[0] * 1.3, (hi2 - lo2)[1] * 1.35, lado=lado)
            sm, cm = ajusta(vxy, Wm, Hm, margen=0.08, arriba=0.16, abajo=0.08)
            pm = os.path.join(out, f"{name}_maniqui_f{t:03d}{'' if not yaw else f'_v{int(round(yaw))}'}.png")
            Image.fromarray(dibuja_maniqui(V, F, cam, t, sm, cm, Wm, Hm, piso=piso)).save(pm)
            res["poses"][-1].update(maniqui=pm, mw=Wm, mh=Hm)
    res.pop("VF", None)
    if not video:
        res["secs_render"] = round(time.time() - t0, 1)
        return res

    # videos: un solo encuadre para todo el clip (cámara fija o paneo suave)
    xy_all = np.concatenate([cam.proyecta(kp[t], t)[0] for t in range(T)])
    if cam.sigue:
        xy_all = np.concatenate([cam.proyecta(kp[t], t)[0] - cam.proyecta(cam.tgt[t], t)[0] for t in range(T)])
    ext = xy_all.max(0) - xy_all.min(0)
    W, H = formato(ext[0] * 1.2, ext[1] * 1.3, opciones=((16, 9), (1, 1), (9, 16)), lado=1024)
    # aire arriba: Recast copia la ESCALA del maniquí y tu personaje puede ser más alto (casco con alas, peinado): en la
    # prueba con un personaje (margen 9 %) el salto le cortaba casco y alas
    s, c = ajusta(xy_all, W, H, margen=0.1, arriba=0.18, abajo=0.07)

    def cent(t):
        return c + (cam.proyecta(cam.tgt[t], t)[0] if cam.sigue else 0)

    p_sk = os.path.join(out, f"{name}_esqueleto.mp4")
    escribe_mp4(p_sk, (dibuja_esqueleto((cam.proyecta(kp[t], t)[0] - cent(t)) * s + [W / 2, H / 2], visibles(kp, nrm, cam, t), W, H)
                       for t in range(T)), W, H)
    t1 = time.time()
    V, F = vertices_maniqui(pj, gr)
    p_mq = os.path.join(out, f"{name}_maniqui.mp4")
    escribe_mp4(p_mq, (dibuja_maniqui(V, F, cam, t, s, cent(t), W, H) for t in range(T)), W, H)
    res.update(esqueleto_mp4=p_sk, maniqui_mp4=p_mq, w=W, h=H, fps=FPS, secs_maniqui=round(time.time() - t1, 1),
               secs_render=round(time.time() - t0, 1))
    log(f"Dibujado: {T} cuadros {W}x{H} en {time.time() - t0:.1f} s (maniquí {time.time() - t1:.1f} s).")
    return res


# ------------------------------------------------------------------ CLI
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["todo", "gen", "render", "cuadro", "estado", "llama"])
    ap.add_argument("--prompt", default="")
    ap.add_argument("--dur", default="5")
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--steps", type=int, default=100)
    ap.add_argument("--cfg", type=float, default=2.0)
    ap.add_argument("--no-post", action="store_true")
    ap.add_argument("--npz", default="")
    ap.add_argument("--out", default=os.path.join(COMFY, "output", "highend", "kimodo"))
    ap.add_argument("--name", default="mov")
    ap.add_argument("--yaw", type=float, default=0.0)
    ap.add_argument("--elev", type=float, default=6.0)
    ap.add_argument("--poses", type=int, default=6)
    ap.add_argument("--frame", type=int, default=0)
    ap.add_argument("--maniqui", action="store_true", help="cuadro: además el maniquí 3D de ese cuadro en PNG")
    ap.add_argument("--lado", type=int, default=1024)
    ap.add_argument("--aspecto", default="", help="cuadro --maniqui: forzar lienzo, p. ej. 16:9")
    a = ap.parse_args()
    res = {}
    if a.cmd == "llama":                 # descargar_llama.bat / install_kimodo.bat: Llama 3 sin token (espejo abierto)
        res.update(bajar_llama())
    if a.cmd == "estado":
        from huggingface_hub import snapshot_download
        try:
            snapshot_download("nvidia/" + MODEL, local_files_only=True)
            res["kimodo"] = True
        except Exception:  # noqa: BLE001
            res["kimodo"] = False
        res["llama"] = llama_instalado()
    if a.cmd in ("todo", "gen"):
        res.update(generar(a))
        a.npz = res["npz"]
    if a.cmd in ("todo", "render"):
        res.update(render(a.npz, a.out, a.name, a.yaw, a.elev, a.poses))
    if a.cmd == "cuadro":
        res.update(render(a.npz, a.out, a.name, a.yaw, a.elev, video=False, solo=a.frame, maniqui=a.maniqui, lado=a.lado, aspecto=a.aspecto))
    if a.cmd in ("todo", "gen"):
        with open(os.path.join(a.out, a.name + ".json"), "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
    print("RESULT " + json.dumps(res, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
