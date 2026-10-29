"""Phane: estudio de IA local sobre ComfyUI, con switch de poder (Ligero una GPU de 8 GB / High End 4090-5090).

Rutas:
  /phane                    página principal
  /phane/static/...         JS / CSS / miniaturas
  /phane/api/sistema        RAM, VRAM y disco en vivo (para el medidor y el bloqueo de seguridad)
  /phane/api/modelos        archivos de modelo instalados (para marcar motores disponibles)
  /phane/api/archivos       galería de la carpeta output
  /phane/api/personajes     GET lista / POST guarda la lista de Personajes (estilo Soul ID)
  /phane/api/negros?path=   revisa cuadros negros de un video ya generado
  /phane/api/mostrar        POST {subfolder, filename}: abre el Explorador con el archivo seleccionado
  /phane/api/borrar         POST {subfolder, filename}: manda a la Papelera un archivo de output (y su miniatura / versión con o sin audio)
  /phane/api/audio_qc?path= audio NaN / silencio / sin pista (volumedetect) de un archivo de output
  /phane/api/tiempos        GET / POST tiempos reales por motor (user/high_end/tiempos.json) para estimar
  /phane/api/manifiesto     models.json del paquete (tamaños y URLs para "Descargar este motor")
Nodos: PhaneKimodo / PhaneKimodoPoses / PhaneKimodoCuadro (Movimiento por texto, kimodo_node.py)
"""
import json
import os
import shutil

import psutil
from aiohttp import web

import folder_paths
from server import PromptServer

_DIR = os.path.dirname(os.path.abspath(__file__))
_WEB = os.path.join(_DIR, "web")
_MODELS = folder_paths.models_dir
_USER = os.path.join(folder_paths.get_user_directory(), "phane")
_PERSONAJES = os.path.join(_USER, "personajes.json")
_EXT = {".png": "img", ".jpg": "img", ".jpeg": "img", ".webp": "img", ".mp4": "vid", ".webm": "vid",
        ".mp3": "aud", ".wav": "aud", ".flac": "aud", ".opus": "aud"}
_MODEL_EXT = (".safetensors", ".gguf", ".pth", ".pt", ".ckpt", ".bin")

routes = PromptServer.instance.routes


@routes.get("/phane")     # nombre de la app (26-oct); ruta de la app
async def page(request):
    return web.FileResponse(os.path.join(_WEB, "index.html"), headers={"Cache-Control": "no-store"})


@routes.get("/phane/simple")     # modo simple (pages/simple.js); una sola ruta: build.py no la duplica
async def page_simple(request):
    return web.FileResponse(os.path.join(_WEB, "simple.html"), headers={"Cache-Control": "no-store"})


@routes.get("/phane/static/{path:.*}")
async def static(request):
    rel = request.match_info["path"].replace("\\", "/")
    full = os.path.normpath(os.path.join(_WEB, rel))
    if not full.startswith(os.path.normpath(_WEB)) or not os.path.isfile(full):
        return web.Response(status=404)
    return web.FileResponse(full, headers={"Cache-Control": "no-store"})


@routes.get("/phane/api/outdir")
async def outdir(request):
    """Carpeta de salida absoluta (absOf/inputAbs de core.js). Antes la daba /estudio/outdir del nodo viejo estudio_simple,
    que no va en la copia pública: allá quedaba vacía (28-oct)."""
    return web.json_response({"output": folder_paths.get_output_directory()})


@routes.get("/phane/api/sistema")
async def sistema(request):
    vm = psutil.virtual_memory()
    out = {"ram_total": vm.total / 2**30, "ram_libre": vm.available / 2**30,
           "proceso_ram": psutil.Process().memory_info().rss / 2**30}
    try:
        import torch
        if torch.cuda.is_available():
            free, total = torch.cuda.mem_get_info()
            out.update(vram_total=total / 2**30, vram_libre=free / 2**30, gpu=torch.cuda.get_device_name(0))
    except Exception:
        pass
    try:   # F19 (27-oct): sin la carpeta models/ (modelos en otra ruta) disk_usage tronaba y el medidor daba 500
        du = shutil.disk_usage(_MODELS if os.path.isdir(_MODELS) else folder_paths.get_output_directory())
        out.update(disco_libre=du.free / 2**30, disco_total=du.total / 2**30)
    except OSError:
        pass
    return web.json_response(out)


@routes.get("/phane/api/modelos")
async def modelos(request):
    """Rutas relativas a models/ (con '/'), y tamaño en GB, de todos los archivos de modelo instalados."""
    files = {}
    for d, _, names in os.walk(_MODELS):
        for n in names:
            if n.lower().endswith(_MODEL_EXT):
                p = os.path.join(d, n)
                try:
                    size = os.path.getsize(p)
                except OSError:
                    continue
                files[os.path.relpath(p, _MODELS).replace("\\", "/")] = round(size / 2**30, 3)
    # F19 (27-oct): modelos en otras carpetas (extra_model_paths.yaml): clave "<tipo>/<ruta>" con el nombre de tipo de ComfyUI
    # (diffusion_models, text_encoders, vae, loras…), que es como los piden los motores
    raiz = os.path.normcase(os.path.abspath(_MODELS))
    for tipo, (rutas, _ext) in list(getattr(folder_paths, "folder_names_and_paths", {}).items()):
        for r in rutas:
            if tipo == "custom_nodes" or not os.path.isdir(r) or os.path.normcase(os.path.abspath(r)).startswith(raiz):
                continue
            for d, _, names in os.walk(r):
                for n in names:
                    if n.lower().endswith(_MODEL_EXT):
                        rel = os.path.relpath(os.path.join(d, n), r).replace("\\", "/")
                        # 28-oct (#8): ComfyUI guarda la clave "unet:" del yaml como diffusion_models; los motores GGUF piden "unet/…"
                        for k in [tipo + "/" + rel] + (["unet/" + rel] if tipo == "diffusion_models" else []):
                            if k not in files:
                                try:
                                    files[k] = round(os.path.getsize(os.path.join(d, n)) / 2**30, 3)
                                except OSError:
                                    pass
    try:   # Movimiento por texto (Kimodo) vive fuera de models/ (su propio venv): entradas "kimodo/…"
        from . import kimodo_node
        files.update(kimodo_node.archivos_instalados())
    except Exception:  # noqa: BLE001
        pass
    return web.json_response(files)


@routes.get("/phane/api/kimodo_listos")
async def kimodo_listos(request):
    """🕺 Movimiento: prompts ya leídos (cache_textos) que se pueden repetir sin Llama-3-8B (chips si falta Llama)."""
    try:
        from . import kimodo_node
        return web.json_response({"prompts": kimodo_node.textos_listos()})
    except Exception:  # noqa: BLE001
        return web.json_response({"prompts": []})


@routes.get("/phane/api/archivos")
async def archivos(request):
    root = folder_paths.get_output_directory()
    items = []
    for d, _, files in os.walk(root):
        for f in files:
            kind = _EXT.get(os.path.splitext(f)[1].lower())
            if not kind:
                continue
            stem = os.path.splitext(f)[0]
            if kind == "img" and (stem + ".mp4") in files:      # miniatura que guarda VideoHelperSuite
                continue
            if kind == "vid" and (stem + "-audio.mp4") in files:  # versión muda; se muestra la que tiene sonido
                continue
            p = os.path.join(d, f)
            sub = os.path.relpath(d, root).replace("\\", "/")
            items.append({"kind": kind, "filename": f, "subfolder": "" if sub == "." else sub,
                          "type": "output", "t": os.path.getmtime(p), "abs": p})
    items.sort(key=lambda x: -x["t"])
    return web.json_response(items[:400])


def _sembrar_phany():
    """29-oct: primera vez (no hay personajes.json): Phany, la mascota original, como personaje de ejemplo, para que el modo simple,
    los ejemplos y 🎮 Juego funcionen como en el video. Sus fotos vienen en web/sample/phany y se copian a input/personajes/phany."""
    import shutil
    src = os.path.join(_WEB, "sample", "phany")
    data = os.path.join(src, "personajes.json")
    if not os.path.isfile(data):
        return []
    dst = os.path.join(folder_paths.get_input_directory(), "personajes", "phany")
    os.makedirs(dst, exist_ok=True)
    for n in os.listdir(src):
        if n.endswith(".png") and not os.path.exists(os.path.join(dst, n)):
            shutil.copy2(os.path.join(src, n), os.path.join(dst, n))
    with open(data, encoding="utf-8") as f:
        lista = json.load(f)
    os.makedirs(_USER, exist_ok=True)
    with open(_PERSONAJES, "w", encoding="utf-8") as f:
        json.dump(lista, f, ensure_ascii=False, indent=1)
    return lista


@routes.get("/phane/api/personajes")
async def personajes_get(request):
    try:
        with open(_PERSONAJES, encoding="utf-8") as f:
            return web.json_response(json.load(f))
    except FileNotFoundError:
        try:
            return web.json_response(_sembrar_phany())
        except Exception as e:   # sin permisos o sin la carpeta de ejemplo: lista vacía, como antes
            print("[Phane] no pude crear el personaje de ejemplo:", e)
            return web.json_response([])


@routes.post("/phane/api/personajes")
async def personajes_post(request):
    data = await request.json()
    if not isinstance(data, list):
        return web.json_response({"error": "se esperaba una lista"}, status=400)
    os.makedirs(_USER, exist_ok=True)
    with open(_PERSONAJES, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return web.json_response({"ok": True, "n": len(data)})


def _a_papelera(paths):
    """Manda archivos a la Papelera de Windows (se pueden recuperar). SHFileOperationW con FOF_ALLOWUNDO."""
    import ctypes
    from ctypes import wintypes

    class SHFILEOPSTRUCTW(ctypes.Structure):
        _fields_ = [("hwnd", wintypes.HWND), ("wFunc", wintypes.UINT), ("pFrom", wintypes.LPCWSTR), ("pTo", wintypes.LPCWSTR),
                    ("fFlags", ctypes.c_uint16), ("fAnyOperationsAborted", wintypes.BOOL), ("hNameMappings", ctypes.c_void_p),
                    ("lpszProgressTitle", wintypes.LPCWSTR)]
    # FO_DELETE=3; FOF_ALLOWUNDO 0x40 | FOF_NOCONFIRMATION 0x10 | FOF_SILENT 0x4 | FOF_NOERRORUI 0x400
    op = SHFILEOPSTRUCTW(None, 3, "\0".join(paths) + "\0\0", None, 0x40 | 0x10 | 0x4 | 0x400, False, None, None)
    return ctypes.windll.shell32.SHFileOperationW(ctypes.byref(op))


def _png_refs(path):
    """Lee el chunk de texto 'phane_refs' de un PNG (core.run lo manda en extra_pnginfo). Solo lee hasta IDAT."""
    import struct
    try:
        with open(path, "rb") as f:
            if f.read(8) != b"\x89PNG\r\n\x1a\n":
                return []
            while True:
                hdr = f.read(8)
                if len(hdr) < 8:
                    return []
                n, typ = struct.unpack(">I4s", hdr)
                if typ == b"IDAT" or typ == b"IEND":
                    return []
                data = f.read(n); f.read(4)
                if typ == b"tEXt" and data.startswith(b"phane_refs\x00"):
                    return json.loads(data[11:].decode("latin-1"))
                if typ == b"iTXt" and data.startswith(b"phane_refs\x00\x00"):   # texto no latin-1 (acentos raros): sin comprimir
                    return json.loads(data[13:].split(b"\x00", 2)[2].decode("utf-8"))
    except Exception:
        return []


def _salida_png(full):
    """El PNG con metadatos de una salida: la imagen misma o la miniatura .png de un video."""
    stem, ext = os.path.splitext(full)
    if ext.lower() == ".png":
        return full
    base = stem[:-6] if stem.endswith("-audio") else stem
    return base + ".png"


def _ref_input(ref):
    """'carpeta/foto.png [input]' -> ruta absoluta dentro de input, o None si no es de input (las de output no se tocan)."""
    s = str(ref or "").strip()
    if s.endswith("]"):
        if not s.endswith(" [input]"):
            return None
        s = s[:-8]
    root = os.path.normpath(folder_paths.get_input_directory())
    full = os.path.normpath(os.path.join(root, s))
    return full if full.startswith(root + os.sep) and os.path.isfile(full) else None


def _ref_en_uso(ref, salvo):
    """Motivo si otra cosa usa esta referencia (un Personaje u otra salida); '' si nadie más."""
    name = str(ref).replace(" [input]", "")
    try:
        with open(_PERSONAJES, encoding="utf-8") as f:
            if name in f.read():
                return "la usa un Personaje"
    except OSError:
        pass
    root = folder_paths.get_output_directory()
    for dp, _, fs in os.walk(root):
        for fn in fs:
            if fn.lower().endswith(".png"):
                p = os.path.normpath(os.path.join(dp, fn))
                if p != salvo and any(str(r).replace(" [input]", "") == name for r in _png_refs(p)):
                    return "la usa otro trabajo (" + fn + ")"
    return ""


def _salida(d):
    root = os.path.normpath(folder_paths.get_output_directory())
    full = os.path.normpath(os.path.join(root, d.get("subfolder") or "", d.get("filename") or ""))
    return full if full.startswith(root + os.sep) and os.path.isfile(full) else None


@routes.post("/phane/api/refs_de")
async def refs_de(request):
    """Referencias (ropa, objeto…) que usó una salida, y si se pueden borrar con ella. Solo de input; 'La persona' no cuenta."""
    full = _salida(await request.json())
    if not full:
        return web.json_response({"refs": []})
    png = os.path.normpath(_salida_png(full))
    out = []
    for r in _png_refs(png):
        p = _ref_input(r)
        if p:
            out.append({"ref": r, "filename": os.path.basename(p), "uso": _ref_en_uso(r, png)})
    return web.json_response({"refs": out})


@routes.post("/phane/api/borrar")
async def borrar(request):
    """Borra (a la Papelera) un archivo de la carpeta output. Con un video se lleva su miniatura .png y su gemelo con/sin audio.
    Con refs=[...] también manda a la Papelera esas referencias de input, solo si las usó esta salida y nadie más las usa."""
    d = await request.json()
    full = _salida(d)
    if not full:
        return web.json_response({"error": "no encontrado"}, status=404)
    stem, ext = os.path.splitext(full)
    base = stem[:-6] if stem.endswith("-audio") else stem
    extra = [base + ".png", base + ".mp4", base + "-audio.mp4"] if ext.lower() in (".mp4", ".webm") else []
    paths = [full] + [p for p in extra if p != full and os.path.isfile(p)]
    png = os.path.normpath(_salida_png(full))
    usadas = [str(r) for r in _png_refs(png)]
    for r in d.get("refs") or []:
        p = _ref_input(r)
        if p and str(r) in usadas and not _ref_en_uso(r, png) and p not in paths:
            paths.append(p)
    r = _a_papelera(paths)
    if r != 0 or os.path.exists(full):
        return web.json_response({"error": f"Windows no pudo borrarlo (código {r})"}, status=500)
    return web.json_response({"ok": True, "n": len(paths)})


@routes.post("/phane/api/mostrar")
async def mostrar(request):
    """Abre el Explorador de Windows con el archivo de output seleccionado."""
    import subprocess
    d = await request.json()
    root = os.path.normpath(folder_paths.get_output_directory())
    full = os.path.normpath(os.path.join(root, d.get("subfolder") or "", d.get("filename") or ""))
    if not full.startswith(root + os.sep) or not os.path.isfile(full):
        return web.json_response({"error": "no encontrado"}, status=404)
    subprocess.Popen(["explorer", "/select," + full])
    return web.json_response({"ok": True})


@routes.get("/phane/api/info")
async def info(request):
    """Datos de un video/audio (ruta absoluta dentro de ComfyUI): fps, cuadros, duración, tamaño y si TIENE AUDIO.
    Los motores solo conectan el audio del video cuando has_audio es True (si no, VHS falla con videos mudos)."""
    import re
    import subprocess
    import imageio_ffmpeg
    path = request.query.get("path", "")
    base = os.path.normpath(os.path.dirname(folder_paths.get_output_directory()))
    full = os.path.normpath(path)
    if not full.startswith(base) or not os.path.isfile(full):
        return web.json_response({"error": "no encontrado"}, status=404)
    try:
        r = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-i", full], capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=30)
        txt = r.stderr
        out = {"has_audio": bool(re.search(r"Stream #\d+:\d+.*Audio:", txt))}
        m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", txt)
        if m:
            out["secs"] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
        v = re.search(r"Stream #\d+:\d+.*Video:.*?(\d{2,5})x(\d{2,5}).*?([\d.]+) fps", txt)
        if v:
            out.update(w=int(v.group(1)), h=int(v.group(2)), fps=float(v.group(3)))
            if out.get("secs"):
                out["frames"] = int(round(out["secs"] * out["fps"]))
        return web.json_response(out)
    except Exception as e:  # noqa: BLE001
        return web.json_response({"error": str(e)}, status=500)


@routes.get("/phane/api/negros")
async def negros(request):
    """Cuántos cuadros salieron negros (NaN en fp16) en un video de la carpeta output."""
    path = request.query.get("path", "")
    root = os.path.normpath(folder_paths.get_output_directory())
    full = os.path.normpath(path if os.path.isabs(path) else os.path.join(root, path))
    if not full.startswith(root) or not os.path.isfile(full):
        return web.json_response({"error": "no encontrado"}, status=404)
    try:
        import numpy as np
        import imageio_ffmpeg
        gen = imageio_ffmpeg.read_frames(full, output_params=["-vf", "scale=96:-2"])
        meta = next(gen)
        total = negros_n = 0
        primero = None
        for i, fr in enumerate(gen):
            total += 1
            if np.frombuffer(fr, np.uint8).mean() < 6:
                negros_n += 1
                primero = i if primero is None else primero
        return web.json_response({"cuadros": total, "negros": negros_n, "primer_negro": primero, "fps": meta.get("fps")})
    except Exception as e:  # noqa: BLE001
        return web.json_response({"error": str(e)}, status=500)


@routes.get("/phane/api/audio_qc")
async def audio_qc(request):
    """QC de audio (28-oct, la trampa de ACE-Step en fp16): volumedetect de ffmpeg sobre un audio o video de output.
    nan=True si salió NaN; silencio=True si el pico no pasa de -60 dB; sin_audio=True si el archivo no trae pista de audio."""
    import asyncio
    import math
    import re
    import subprocess
    import imageio_ffmpeg
    path = request.query.get("path", "")
    root = os.path.normpath(folder_paths.get_output_directory())
    full = os.path.normpath(path if os.path.isabs(path) else os.path.join(root, path))
    if not full.startswith(root) or not os.path.isfile(full):
        return web.json_response({"error": "no encontrado"}, status=404)
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-hide_banner", "-nostats", "-i", full, "-vn", "-sn", "-dn",
           "-af", "volumedetect", "-f", "null", "-"]
    try:   # en un hilo: no frenar el servidor (y el WebSocket) mientras ffmpeg lee el archivo
        r = await asyncio.get_running_loop().run_in_executor(None, lambda: subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120))
    except Exception as e:  # noqa: BLE001
        return web.json_response({"error": str(e)}, status=500)
    txt = r.stderr or ""

    def vol(k):
        m = re.search(k + r"_volume:\s*(\S+)\s*dB", txt)
        if not m:
            return None
        try:
            return float(m.group(1))
        except ValueError:
            return float("nan")

    mean, peak = vol("mean"), vol("max")
    if mean is None and peak is None:
        return web.json_response({"sin_audio": True, "nan": False, "silencio": False, "mean": None, "max": None})
    nan = any(v is not None and v != v for v in (mean, peak))
    silencio = not nan and peak is not None and (math.isinf(peak) or peak <= -60)
    fin = lambda v: v if v is not None and math.isfinite(v) else None   # noqa: E731  (NaN/inf no van en JSON)
    return web.json_response({"sin_audio": False, "nan": nan, "silencio": silencio, "mean": fin(mean), "max": fin(peak)})


_TIEMPOS = os.path.join(_USER, "tiempos.json")


@routes.get("/phane/api/tiempos")
async def tiempos_get(request):
    """Tiempos reales por motor (estimaciones que aprenden): {motor: [{r, real, px, s, q, gpu, t}, ...]}."""
    try:
        with open(_TIEMPOS, encoding="utf-8") as f:
            data = json.load(f)
        return web.json_response(data if isinstance(data, dict) else {})
    except (OSError, ValueError):
        return web.json_response({})


@routes.post("/phane/api/tiempos")
async def tiempos_post(request):
    """Agrega una medida {engine, r, real, px, s, q, gpu, t}; se guardan las últimas 30 por motor."""
    d = await request.json()
    eng = str(d.get("engine") or "")[:64] if isinstance(d, dict) else ""
    if not eng:
        return web.json_response({"error": "falta engine"}, status=400)
    try:
        with open(_TIEMPOS, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            data = {}
    except (OSError, ValueError):
        data = {}
    x = {k: d.get(k) for k in ("r", "real", "px", "s", "q", "gpu", "t") if k in d}
    data[eng] = (data.get(eng) or [])[-29:] + [x]
    os.makedirs(_USER, exist_ok=True)
    tmp = _TIEMPOS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=0)
    os.replace(tmp, _TIEMPOS)
    return web.json_response({"ok": True, "n": len(data[eng])})


@routes.get("/phane/api/manifiesto")
async def manifiesto(request):
    """models.json del paquete (URLs y tamaños para 'Descargar este motor'); {} si esta copia no lo trae."""
    for p in (os.path.join(_DIR, "models.json"), os.path.normpath(os.path.join(_DIR, "..", "phane", "models.json"))):
        try:
            with open(p, encoding="utf-8") as f:
                return web.json_response(json.load(f))
        except (OSError, ValueError):
            continue
    return web.json_response({})


# ---- 29-oct: descargar con un clic (envuelve tools/download_models.py; una descarga a la vez; solo URLs de models.json) ----
_DL = {"proc": None, "args": [], "files": [], "totalGB": 0.0, "log": None, "t0": 0.0, "what": ""}
_DL_LOG = os.path.join(_USER, "descarga.log")


def _dl_spec():
    with open(os.path.join(_DIR, "models.json"), encoding="utf-8") as f:
        return json.load(f)


def _dl_files(spec, ids=None, preset=None):
    if preset in ("quick", "starter"):
        return list(spec[preset]["files"])
    known = {e["id"]: e for e in spec["engines"]}
    return list(dict.fromkeys(f for i in (ids or []) if i in known for f in known[i]["files"]))


def _dl_have_gb(files, spec):
    """GB ya en disco de esos archivos (completos + .part a medias): el avance no depende de leer la salida del script."""
    tot = 0
    for f in files:
        p = os.path.join(folder_paths.models_dir, f)
        if os.path.isfile(p):
            tot += os.path.getsize(p)
        elif os.path.isfile(p + ".part"):
            tot += os.path.getsize(p + ".part")
        elif os.path.isdir(os.path.dirname(p)) and not spec["files"].get(f, {}).get("url"):   # repo entero (Qwen-TTS)
            for r, _, ns in os.walk(os.path.dirname(p)):
                tot += sum(os.path.getsize(os.path.join(r, n)) for n in ns)
    return tot / 2**30


@routes.post("/phane/api/descargar")
async def descargar(request):
    import subprocess, sys, time
    script = os.path.join(_DIR, "tools", "download_models.py")
    if not os.path.isfile(script):
        return web.json_response({"error": "Esta copia no trae tools/download_models.py"}, status=404)
    if _DL["proc"] and _DL["proc"].poll() is None:
        return web.json_response({"error": "Ya hay una descarga en curso", "what": _DL["what"]}, status=409)
    body = await request.json()
    spec = _dl_spec()
    ids = [i for i in (body.get("ids") or []) if isinstance(i, str)]
    preset = body.get("preset") if body.get("preset") in ("quick", "starter") else None
    files = _dl_files(spec, ids, preset)
    if not files:
        return web.json_response({"error": "Nada que descargar"}, status=400)
    falta = sum(spec["files"].get(f, {}).get("sizeGB") or 0 for f in files if not os.path.exists(os.path.join(folder_paths.models_dir, f)))
    os.makedirs(folder_paths.models_dir, exist_ok=True)
    libre = shutil.disk_usage(folder_paths.models_dir).free / 2**30
    if falta > libre - 2:
        return web.json_response({"error": f"No hay espacio: faltan {falta:.1f} GB y hay {libre:.1f} GB libres en {folder_paths.models_dir}"}, status=400)
    args = ["--" + preset] if preset else ids
    os.makedirs(_USER, exist_ok=True)
    if _DL["log"]:
        _DL["log"].close()
    _DL["log"] = open(_DL_LOG, "w", encoding="utf-8", errors="replace")
    env = dict(os.environ, PHANE_MODELS_DIR=folder_paths.models_dir, PYTHONIOENCODING="utf-8")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    _DL.update(proc=subprocess.Popen([sys.executable, "-I", "-u", script] + args, cwd=_DIR, env=env, stdout=_DL["log"], stderr=subprocess.STDOUT, creationflags=flags),
               args=args, files=files, totalGB=sum(spec["files"].get(f, {}).get("sizeGB") or 0 for f in files), t0=time.time(), what=preset or ", ".join(ids))
    return web.json_response({"ok": True, "faltaGB": round(falta, 1)})


@routes.get("/phane/api/descargar")
async def descargar_estado(request):
    p = _DL["proc"]
    if not p:
        return web.json_response({"available": os.path.isfile(os.path.join(_DIR, "tools", "download_models.py")), "running": False})
    corre = p.poll() is None
    try:
        with open(_DL_LOG, encoding="utf-8", errors="replace") as f:
            txt = f.read()[-6000:]
    except OSError:
        txt = ""
    lineas = [x for x in txt.replace("\r", "\n").split("\n") if x.strip()]
    return web.json_response({"available": True, "running": corre, "what": _DL["what"], "code": None if corre else p.returncode,
                              "haveGB": round(_dl_have_gb(_DL["files"], _dl_spec()), 2), "totalGB": round(_DL["totalGB"], 1),
                              "tail": lineas[-6:], "manual": [x.strip() for x in lineas if ": " in x and ("install_kimodo" in x or "bake_lightx2v" in x or "download_llama" in x)]})


@routes.post("/phane/api/instalar")
async def instalar(request):
    """Lo que no es una descarga: el instalador de Kimodo (ventana propia) o los packs de nodos (luego reiniciar ComfyUI)."""
    import subprocess, sys
    what = (await request.json()).get("what")
    if what == "kimodo":
        bat = os.path.join(_DIR, "kimodo", "install_kimodo.bat")
        if os.name != "nt" or not os.path.isfile(bat):
            return web.json_response({"error": "El instalador de Kimodo es para Windows: sigue los pasos del README (sección Kimodo)."}, status=400)
        if not shutil.which("py") or not shutil.which("git"):
            return web.json_response({"error": "Kimodo necesita Python 3.12 (con el 'py launcher') y git: https://www.python.org/downloads/ · https://git-scm.com/download/win"}, status=400)
        subprocess.Popen(["cmd", "/c", "start", "Phane - Kimodo", "cmd", "/c", bat], cwd=os.path.dirname(bat))
        return web.json_response({"ok": True, "msg": "Se abrió la ventana del instalador de Kimodo (~10 min + 16 GB). Cuando termine, recarga Phane."})
    if what == "nodos":
        script = os.path.join(_DIR, "tools", "install_nodes.py")
        if not os.path.isfile(script):
            return web.json_response({"error": "Esta copia no trae tools/install_nodes.py"}, status=404)
        subprocess.Popen(["cmd", "/c", "start", "Phane - node packs", "cmd", "/k", sys.executable, "-I", script, "--all"] if os.name == "nt" else [sys.executable, "-I", script, "--all"], cwd=_DIR)
        return web.json_response({"ok": True, "msg": "Instalando los packs de nodos en una ventana aparte. Cuando termine, reinicia ComfyUI."})
    return web.json_response({"error": "¿Qué instalo?"}, status=400)


NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}

# Movimiento por texto (NVIDIA Kimodo, en su propio venv: custom_nodes/phane/kimodo). Ver kimodo_node.py.
try:
    from . import kimodo_node
    NODE_CLASS_MAPPINGS.update(kimodo_node.NODE_CLASS_MAPPINGS)
    NODE_DISPLAY_NAME_MAPPINGS.update(kimodo_node.NODE_DISPLAY_NAME_MAPPINGS)
except Exception as _e:  # noqa: BLE001
    import logging
    logging.warning("[phane] nodos de Kimodo no cargados: %s", _e)

# Profundidad para la pose exacta (Depth Anything V2 Small). Ver depth_node.py.
try:
    from . import depth_node
    NODE_CLASS_MAPPINGS.update(depth_node.NODE_CLASS_MAPPINGS)
    NODE_DISPLAY_NAME_MAPPINGS.update(depth_node.NODE_DISPLAY_NAME_MAPPINGS)
except Exception as _e:  # noqa: BLE001
    import logging
    logging.warning("[phane] nodo de profundidad no cargado: %s", _e)

# Montaje para tráilers (impactos de golpe y tarjeta de título, sin IA). Ver montaje_node.py.
try:
    from . import montaje_node
    NODE_CLASS_MAPPINGS.update(montaje_node.NODE_CLASS_MAPPINGS)
    NODE_DISPLAY_NAME_MAPPINGS.update(montaje_node.NODE_DISPLAY_NAME_MAPPINGS)
except Exception as _e:  # noqa: BLE001
    import logging
    logging.warning("[phane] nodos de montaje no cargados: %s", _e)

# Entrenamiento de LoRAs (TrainLoraNode) en Flux/Klein: gradientes correctos con checkpointing. Ver train_fix.py.
try:
    from . import train_fix
    train_fix.apply()
except Exception as _e:  # noqa: BLE001
    import logging
    logging.warning("[phane] train_fix no se aplicó: %s", _e)
