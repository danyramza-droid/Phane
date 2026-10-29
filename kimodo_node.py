"""Movimiento por texto: NVIDIA Kimodo (texto -> animación 3D) como nodos de ComfyUI.

Kimodo vive en su PROPIO venv (<PHANE_KIMODO_DIR>\\venv: transformers 5.1 fijo, extensión C++ de limpieza de pies) y se llama
como subproceso con puente/kimodo_puente.py. Ir por la cola de ComfyUI (y no por una ruta aparte) hace que nunca corra al
mismo tiempo que otro trabajo pesado de GPU y que el estudio muestre progreso, tiempos y resultados como cualquier motor.

Nodos:
  PhaneKimodo        prompt (inglés, "A person ...") -> <nombre>_maniqui.mp4 (maniquí 3D, para Recast) + _esqueleto.mp4 +
                       poses clave PNG (para "🧍 Pose a copiar") + .bvh (juego) + .npz; salida STRING con el JSON del resultado
  PhaneKimodoPoses   muestra las poses clave del JSON (va en otro nodo para que el visor abra primero el video)
  PhaneKimodoCuadro  esqueleto PNG exacto de cualquier cuadro de un movimiento ya hecho (sin volver a generar)

Medido en una GPU de 8 GB: 5 s de movimiento en 6 s (100 pasos) con 1.1 GB de VRAM; dibujar maniquí + esqueleto ~4 s por
segundo de animación. El texto lo lee Llama-3-8B (LLM2Vec) en la CPU (~16 GB de RAM) SOLO la primera vez que se usa un prompt
(queda en <PHANE_KIMODO_DIR>\\cache_textos).
"""
import glob
import hashlib
import json
import os
import re
import subprocess

import folder_paths

KIMODO_DIR = os.environ.get("PHANE_KIMODO_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "kimodo"))
PY = os.path.join(KIMODO_DIR, "venv", "Scripts", "python.exe")
SCRIPT = os.path.join(KIMODO_DIR, "puente", "kimodo_puente.py")
HF = os.path.join(KIMODO_DIR, "hf_cache")
SUB = "phane/kimodo"
VISTAS = {"frente": 0, "tres_cuartos_izq": 40, "tres_cuartos_der": -40, "lado_izq": 90, "lado_der": -90, "espalda": 180}


def _out_dir():
    d = os.path.join(folder_paths.get_output_directory(), *SUB.split("/"))
    os.makedirs(d, exist_ok=True)
    return d


def archivos_instalados():
    """Entradas 'virtuales' para /phane/api/modelos (los motores declaran estos nombres en `files`)."""
    out = {}
    if not (os.path.isfile(PY) and os.path.isfile(SCRIPT)):
        return out
    k = glob.glob(os.path.join(HF, "models--nvidia--Kimodo-SOMA-RP-v1.2", "snapshots", "*", "model.safetensors"))
    if k:
        out["kimodo/Kimodo-SOMA-RP-v1.2.safetensors"] = round(os.path.getsize(k[0]) / 2**30, 3)
    # Llama 3: el snapshot al que apunta refs/main (oficial de Meta o el espejo abierto NousResearch que baja descargar_llama.bat
    # SIN token en la misma carpeta de meta-llama; ver LLAMA_* en el puente). Si no hay refs/main, cualquier snapshot completo.
    ll = os.path.join(HF, "models--meta-llama--Meta-Llama-3-8B-Instruct")
    snaps = []
    try:
        with open(os.path.join(ll, "refs", "main"), encoding="utf-8") as f:
            snaps.append(os.path.join(ll, "snapshots", f.read().strip()))
    except OSError:
        pass
    snaps += glob.glob(os.path.join(ll, "snapshots", "*"))
    for s in snaps:
        shards = glob.glob(os.path.join(s, "model-0000?-of-00004.safetensors"))
        if len(shards) == 4:
            out["kimodo/Meta-Llama-3-8B-Instruct.safetensors"] = round(sum(os.path.getsize(p) for p in shards) / 2**30, 3)
            break
    return out


def textos_listos(limite=40):
    """Prompts de movimientos ya hechos (campo "prompts" de output/<SUB>/*.json) cuyo texto YA está leído en cache_textos/
    (mismo sha1 que TextoCache del puente): se pueden repetir sin Llama-3-8B. Más recientes primero; sin rutas."""
    cache = os.path.join(KIMODO_DIR, "cache_textos")
    try:
        js = sorted(glob.glob(os.path.join(_out_dir(), "*.json")), key=os.path.getmtime, reverse=True)
    except OSError:
        return []
    out, vistos = [], set()
    for p in js:
        try:
            with open(p, encoding="utf-8") as f:
                prompts = json.load(f).get("prompts") or []
        except (OSError, ValueError, AttributeError):
            continue
        txt = "\n".join(t.strip() for t in prompts if isinstance(t, str) and t.strip())
        if not txt or txt in vistos:
            continue
        vistos.add(txt)
        if all(os.path.isfile(os.path.join(cache, hashlib.sha1(t.strip().encode("utf-8")).hexdigest() + ".npy")) for t in txt.split("\n")):
            out.append(txt)
            if len(out) >= limite:
                break
    # 28-oct (#8): en una instalación nueva no hay output/*.json; la copia trae cache_textos/prompts.json (textos ya leídos)
    try:
        with open(os.path.join(cache, "prompts.json"), encoding="utf-8") as f:
            for txt in json.load(f):
                if len(out) < limite and txt not in vistos and all(os.path.isfile(os.path.join(
                        cache, hashlib.sha1(t.strip().encode("utf-8")).hexdigest() + ".npy")) for t in txt.split("\n")):
                    vistos.add(txt)
                    out.append(txt)
    except (OSError, ValueError, TypeError):
        pass
    return out


def _slug(prompt):
    t = re.sub(r"^\s*(a|an|the)\s+(person|man|woman|warrior|character|zombie|knight)\s+", "", prompt.strip().split("\n")[0], flags=re.I)
    words = [w for w in re.findall(r"[a-z0-9]+", t.lower()) if w not in {"a", "an", "the", "and", "with", "their", "his", "her", "of", "to", "does", "is", "in", "on", "at",
                                                                          "into", "from", "then", "it", "them", "both"}]
    return ("_".join(words[:4]) or "mov")[:28]


def _nombre_libre(prompt):
    d, base = _out_dir(), _slug(prompt)
    n = 1 + max([int(m.group(1)) for f in os.listdir(d) for m in [re.match(re.escape(base) + r"_(\d{5})\.npz$", f)] if m] or [0])
    return f"{base}_{n:05d}"


def _correr(args, etapas):
    """Corre el puente en el venv de Kimodo; avanza la barra de progreso con las líneas que imprime. -> dict RESULT."""
    import comfy.model_management as mm
    import comfy.utils
    if not os.path.isfile(PY):
        raise RuntimeError(f"Kimodo no está instalado en {KIMODO_DIR} (falta el venv).")
    env = {k: v for k, v in os.environ.items() if not k.startswith("PYTHON")}
    env["PYTHONIOENCODING"] = "utf-8"
    env["COMFY_DIR"] = os.path.dirname(folder_paths.get_output_directory())
    pbar = comfy.utils.ProgressBar(100)
    p = subprocess.Popen([PY, "-I", SCRIPT, *args], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env, cwd=KIMODO_DIR,
                         text=True, encoding="utf-8", errors="replace", creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    res, tail = None, []
    try:
        for line in p.stdout:
            line = line.rstrip()
            if mm.processing_interrupted():
                p.kill()
                mm.throw_exception_if_processing_interrupted()
            if line.startswith("RESULT "):
                res = json.loads(line[7:])
                continue
            tail = (tail + [line])[-25:]
            for clave, pct in etapas:
                if clave in line:
                    pbar.update_absolute(pct)
            if line and "it/s]" not in line and "Warning" not in line:
                print("[kimodo]", line)
        p.wait()
    finally:
        if p.poll() is None:
            p.kill()
    if p.returncode != 0 or res is None:
        msg = next((l for l in tail if "FALTA_LLAMA" in l), None) or next((l for l in reversed(tail) if l.strip()), "sin salida")
        raise RuntimeError("Kimodo falló: " + msg.replace("SystemExit: ", ""))
    pbar.update_absolute(100)
    return res


def _ui_file(path, video=False):
    f = {"filename": os.path.basename(path), "subfolder": SUB, "type": "output"}
    if video:
        f["format"] = "video/h264-mp4"
    return f


class PhaneKimodo:
    CATEGORY = "Phane"
    FUNCTION = "run"
    OUTPUT_NODE = True
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("info",)

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "prompt": ("STRING", {"multiline": True, "default": "A person does a cartwheel and lands in a crouch.",
                                  "tooltip": "En inglés, empezando con 'A person ...'. Varias líneas = varias acciones seguidas."}),
            "segundos": ("FLOAT", {"default": 5.0, "min": 1.0, "max": 10.0, "step": 0.5, "tooltip": "Por acción (máx. 10 s cada una)"}),
            "semilla": ("INT", {"default": 42, "min": 0, "max": 2**31 - 1}),
            "vista": (list(VISTAS), {"default": "frente"}),
            "pasos": ("INT", {"default": 100, "min": 20, "max": 200}),
            "limpiar_pies": ("BOOLEAN", {"default": True, "tooltip": "Post-proceso oficial: quita el patinado de pies"}),
            "poses": ("INT", {"default": 6, "min": 1, "max": 12, "tooltip": "Cuántas poses clave sacar como esqueleto PNG"}),
        }}

    def run(self, prompt, segundos, semilla, vista, pasos, limpiar_pies, poses):
        import comfy.model_management as mm
        if not prompt.strip():
            raise RuntimeError("Escribe qué movimiento quieres (en inglés, 'A person ...').")
        mm.unload_all_models()          # Kimodo usa ~1.1 GB de VRAM en otro proceso: que ComfyUI suelte la tarjeta
        mm.soft_empty_cache()
        n = len([l for l in prompt.replace("|", "\n").split("\n") if l.strip()])
        name = _nombre_libre(prompt)
        args = ["todo", "--prompt", prompt, "--dur", str(segundos), "--seed", str(semilla), "--steps", str(pasos),
                "--yaw", str(VISTAS.get(vista, 0)), "--poses", str(poses), "--out", _out_dir(), "--name", name]
        if not limpiar_pies:
            args.append("--no-post")
        res = _correr(args, [("Leyendo", 5), ("Texto listo", 45), ("Movimiento listo", 60), ("Dibujado", 98)])
        res["nombre"], res["vista"], res["acciones"] = name, vista, n
        with open(os.path.join(_out_dir(), name + ".json"), "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False, indent=1)
        ui = {"gifs": [_ui_file(res["maniqui_mp4"], True), _ui_file(res["esqueleto_mp4"], True)]}
        return {"ui": ui, "result": (json.dumps(res, ensure_ascii=False),)}


class PhaneKimodoPoses:
    CATEGORY = "Phane"
    FUNCTION = "run"
    OUTPUT_NODE = True
    RETURN_TYPES = ()

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"info": ("STRING", {"forceInput": True})}}

    def run(self, info):
        res = json.loads(info)
        return {"ui": {"images": [_ui_file(p["png"]) for p in res.get("poses", [])]}}


class PhaneKimodoCuadro:
    CATEGORY = "Phane"
    FUNCTION = "run"
    OUTPUT_NODE = True
    RETURN_TYPES = ()

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "nombre": ("STRING", {"default": "", "tooltip": "Nombre del movimiento (p. ej. cartwheel_lands_crouch_00001)"}),
            "cuadro": ("INT", {"default": 0, "min": -3, "max": 3000, "tooltip": "Cuadro a 30 fps (-1 = el del golpe, -2 = el más distinto al inicio, -3 = salto: pelvis más alta / si no: máxima extensión)"}),
            "vista": (["igual_que_el_video", *VISTAS], {"default": "igual_que_el_video"}),
        }, "optional": {
            # 18-oct: además el MANIQUÍ 3D de ese cuadro (PNG) para la pose con maniquí (Qwen 2.1 + VNCCS / 2511 + AnyPose)
            "maniqui": ("BOOLEAN", {"default": False}),
        }}

    def run(self, nombre, cuadro, vista, maniqui=False):
        if not re.fullmatch(r"[\w-]{1,80}", nombre or ""):
            raise RuntimeError("Nombre de movimiento inválido.")
        d = _out_dir()
        npz = os.path.join(d, nombre + ".npz")
        if not os.path.isfile(npz):
            raise RuntimeError(f"No encontré el movimiento {nombre} en output/{SUB}.")
        yaw = VISTAS.get(vista)
        if yaw is None:
            try:
                with open(os.path.join(d, nombre + ".json"), encoding="utf-8") as f:
                    yaw = float(json.load(f).get("yaw", 0))
            except (OSError, ValueError):
                yaw = 0
        if maniqui and abs(abs(float(yaw)) - 90) < 1:
            yaw = 105 if float(yaw) > 0 else -105   # sobregiro (18-oct): Qwen 2.1 tiende a girar 10-20° hacia la cámara en perfil
        args = ["cuadro", "--npz", npz, "--frame", str(cuadro), "--yaw", str(yaw), "--out", d, "--name", nombre]
        if maniqui:
            args += ["--maniqui", "--lado", "1344"]
        res = _correr(args, [("RESULT", 90)])
        imgs = [_ui_file(p["maniqui"]) for p in res.get("poses", []) if p.get("maniqui")]   # primero el maniquí (lo que muestra el visor)
        imgs += [_ui_file(p["png"]) for p in res.get("poses", [])]
        return {"ui": {"images": imgs}}


NODE_CLASS_MAPPINGS = {"PhaneKimodo": PhaneKimodo, "PhaneKimodoPoses": PhaneKimodoPoses, "PhaneKimodoCuadro": PhaneKimodoCuadro}
NODE_DISPLAY_NAME_MAPPINGS = {"PhaneKimodo": "🕺 Movimiento por texto (Kimodo)", "PhaneKimodoPoses": "🕺 Poses clave (Kimodo)",
                              "PhaneKimodoCuadro": "🕺 Esqueleto de un cuadro (Kimodo)"}
