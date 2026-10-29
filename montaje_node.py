"""Montaje sin IA para tráilers (27-oct): impactos de golpe, tarjeta de título y relleno de Recast "reemplazar". Corren en la CPU.

- PhaneImpactos: en cada segundo de `golpes` mete un flash blanco corto, un zoom de golpe y un temblor de cámara que se apaga
  (como fx.py del remake RPS). Entra y sale un lote IMAGE (cuadros del video), así que va entre VHS_LoadVideoPath y SaveVideo.
- PhaneTitulo: texto grande sobre negro con brillo metálico que aparece, crece un poco y destella. Sale un lote IMAGE.
"""
import math
import random

import numpy as np
import torch
import torch.nn.functional as F


def _segundos(txt):
    out = []
    for p in str(txt or "").replace(";", ",").split(","):
        try:
            out.append(float(p.strip()))
        except ValueError:
            pass
    return out


class PhaneImpactos:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "images": ("IMAGE",),
            "fps": ("FLOAT", {"default": 32.0, "min": 1.0, "max": 120.0}),
            "golpes": ("STRING", {"default": "1.0", "tooltip": "Segundos de cada golpe, separados por coma: 0.8, 1.6, 2.4"}),
            "fuerza": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 3.0, "step": 0.05}),
            "flash": ("BOOLEAN", {"default": True}),
            "seed": ("INT", {"default": 0, "min": 0, "max": 2**31 - 1}),
        }}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "run"
    CATEGORY = "phane"

    def run(self, images, fps, golpes, fuerza, flash, seed):
        n, h, w, _ = images.shape
        out = images.clone()
        rnd = random.Random(seed)
        dur = max(2, int(round(fps * 0.35)))   # cada golpe dura ~0.35 s
        for t in _segundos(golpes):
            f0 = int(round(t * fps))
            ang = rnd.uniform(0, 2 * math.pi)
            for k in range(dur):
                i = f0 + k
                if i < 0 or i >= n:
                    continue
                a = (1 - k / dur) ** 2                       # se apaga rápido
                z = 1 + 0.10 * fuerza * a                    # zoom de golpe
                amp = 0.025 * fuerza * a                     # temblor (fracción del cuadro)
                dx = amp * math.cos(ang + k * 2.3)
                dy = amp * math.sin(ang * 1.7 + k * 2.9)
                theta = torch.tensor([[1 / z, 0, dx], [0, 1 / z, dy]], dtype=torch.float32).unsqueeze(0)
                img = images[i:i + 1].permute(0, 3, 1, 2).float()
                grid = F.affine_grid(theta, img.shape, align_corners=False)
                fr = F.grid_sample(img, grid, mode="bilinear", padding_mode="reflection", align_corners=False)
                fr = fr.permute(0, 2, 3, 1)[0]
                if flash and k < 3:
                    fr = fr + (1 - fr) * (0.55 * fuerza * (1 - k / 3))
                out[i] = fr.clamp(0, 1)
        return (out,)


def _fuente(size):
    from PIL import ImageFont
    for name in ("arialbd.ttf", "Arial Bold.ttf", "DejaVuSans-Bold.ttf", "LiberationSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


class PhaneTitulo:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "texto": ("STRING", {"default": "LUMI"}),
            "width": ("INT", {"default": 1280, "min": 64, "max": 4096, "step": 2}),
            "height": ("INT", {"default": 720, "min": 64, "max": 4096, "step": 2}),
            "segundos": ("FLOAT", {"default": 2.5, "min": 0.2, "max": 20.0, "step": 0.1}),
            "fps": ("FLOAT", {"default": 32.0, "min": 1.0, "max": 120.0}),
            "color": ("STRING", {"default": "#4aa8ff", "tooltip": "Color del metal en hex"}),
        }}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "run"
    CATEGORY = "phane"

    def run(self, texto, width, height, segundos, fps, color):
        from PIL import Image, ImageDraw, ImageFilter
        c = str(color).lstrip("#")
        try:
            base = np.array([int(c[i:i + 2], 16) for i in (0, 2, 4)], dtype=np.float32) / 255
        except ValueError:
            base = np.array([0.29, 0.66, 1.0], dtype=np.float32)
        texto = str(texto or "").strip() or " "
        size = int(height * 0.22)
        font = _fuente(size)
        tmp = ImageDraw.Draw(Image.new("L", (8, 8)))
        while size > 12 and tmp.textlength(texto, font=font) > width * 0.82:
            size = int(size * 0.92)
            font = _fuente(size)
        mask = Image.new("L", (width, height), 0)
        ImageDraw.Draw(mask).text((width / 2, height / 2), texto, font=font, fill=255, anchor="mm")
        m = np.asarray(mask, dtype=np.float32) / 255
        glow = np.asarray(mask.filter(ImageFilter.GaussianBlur(radius=max(2, size // 6))), dtype=np.float32) / 255
        # metal: degradado vertical claro arriba / oscuro abajo dentro de las letras
        ys = np.linspace(0, 1, height, dtype=np.float32)[:, None]
        grad = 1.35 - 0.75 * ys + 0.25 * np.cos(ys * 9)
        n = max(1, int(round(segundos * fps)))
        frames = []
        for i in range(n):
            t = i / max(1, n - 1)
            alpha = min(1.0, t / 0.25)                                  # aparece en el primer cuarto
            s = 0.94 + 0.06 * t                                          # crece un poco
            sweep = np.exp(-((np.linspace(0, 1, width)[None, :] - (t * 1.6 - 0.3)) ** 2) / 0.004)   # destello que cruza
            lum = (grad + 0.9 * sweep).clip(0, 2)
            img = (m * lum)[..., None] * base[None, None, :] + (m * 0.6 * sweep)[..., None]
            img = img + (glow * 0.55)[..., None] * base[None, None, :]
            img = (img * alpha).clip(0, 1).astype(np.float32)
            fr = torch.from_numpy(img).permute(2, 0, 1).unsqueeze(0)
            if s != 1:
                theta = torch.tensor([[1 / s, 0, 0], [0, 1 / s, 0]], dtype=torch.float32).unsqueeze(0)
                fr = F.grid_sample(fr, F.affine_grid(theta, fr.shape, align_corners=False), align_corners=False)
            frames.append(fr.permute(0, 2, 3, 1)[0])
        return (torch.stack(frames).clamp(0, 1),)


class PhaneQuitarOriginal:
    """Recast "reemplazar" (27-oct): borra a la persona ORIGINAL del video y pega encima al personaje generado.

    Antes solo se pegaba el personaje recortado sobre el original: donde la pose no coincidía al 100 % se veía la persona original
    al lado (fantasma). Aquí, por cuadro: hueco = máscara de la persona original (crecida) → se rellena con cv2.inpaint (Telea; sirve
    aunque la cámara se mueva) → encima va el personaje generado con su máscara y borde suave. Animate genera sobre gris liso, así que
    NO se usa su fondo. CPU, ~0.05-0.2 s por cuadro a 480p."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "original": ("IMAGE",),
            "generado": ("IMAGE",),
            "mascara_original": ("MASK",),
            "mascara_generado": ("MASK",),
            "crecer": ("INT", {"default": 10, "min": 0, "max": 64, "tooltip": "px que crece la máscara de la persona original (sombras, pelo, borde)"}),
            "borde": ("INT", {"default": 5, "min": 0, "max": 32, "tooltip": "suavizado del borde del personaje generado (px)"}),
            "radio": ("INT", {"default": 6, "min": 1, "max": 32, "tooltip": "radio del relleno (cv2.inpaint)"}),
        }}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "run"
    CATEGORY = "phane"

    def run(self, original, generado, mascara_original, mascara_generado, crecer, borde, radio):
        import cv2
        n = min(original.shape[0], generado.shape[0])
        h, w = original.shape[1], original.shape[2]

        def m_at(m, i):
            mm = m[min(i, m.shape[0] - 1)] if m.dim() == 3 else m
            a = mm.float().cpu().numpy()
            if a.shape != (h, w):
                a = cv2.resize(a, (w, h), interpolation=cv2.INTER_LINEAR)
            return a

        k_grow = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * crecer + 1, 2 * crecer + 1)) if crecer > 0 else None
        out = []
        for i in range(n):
            org = (original[i].cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
            gen = generado[i].cpu().numpy().astype(np.float32)
            if gen.shape[:2] != (h, w):
                gen = cv2.resize(gen, (w, h), interpolation=cv2.INTER_LINEAR)
            hole = (m_at(mascara_original, i) > 0.5).astype(np.uint8) * 255
            if k_grow is not None:
                hole = cv2.dilate(hole, k_grow)
            fill = cv2.inpaint(org, hole, radio, cv2.INPAINT_TELEA) if hole.any() else org
            a = (m_at(mascara_generado, i) > 0.5).astype(np.float32)
            if borde > 0:
                a = cv2.GaussianBlur(cv2.dilate(a, np.ones((3, 3), np.uint8), iterations=max(1, borde // 3)), (0, 0), borde / 2)
            a = a.clip(0, 1)[..., None]
            out.append(torch.from_numpy(gen * a + (fill.astype(np.float32) / 255) * (1 - a)))
        return (torch.stack(out).clamp(0, 1),)


# 🔊 Audio de los clips al unirlos (28-oct, hueco 6): storyboard.concat solo unía imágenes y la película salía muda.
# Arma una pista con el audio de cada clip en el mismo tiempo que su imagen (mismo from/dur/speed y el mismo fundido).
# Clips sin audio (o con speed fuera de 0.5-2) quedan en silencio.
def _ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        import shutil
        return shutil.which("ffmpeg") or "ffmpeg"


def _dur_video(path):
    import cv2
    cap = cv2.VideoCapture(path)
    n, f = cap.get(cv2.CAP_PROP_FRAME_COUNT), cap.get(cv2.CAP_PROP_FPS) or 0
    cap.release()
    return n / f if f > 0 else 0.0


def _audio_clip(path, desde, dur, speed, sr):
    import subprocess
    cmd = [_ffmpeg(), "-v", "error", "-ss", str(max(0.0, desde))]
    if dur > 0:
        cmd += ["-t", str(dur)]
    cmd += ["-i", path, "-vn", "-ac", "2", "-ar", str(sr)]
    if abs(speed - 1) > 1e-3:
        cmd += ["-af", f"atempo={speed}"]
    cmd += ["-f", "f32le", "-"]
    try:
        raw = subprocess.run(cmd, capture_output=True, timeout=120).stdout
    except Exception:
        raw = b""
    return np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.copy() if len(raw) >= 8 else np.zeros((2, 0), np.float32)


class PhaneAudioClips:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "clips": ("STRING", {"default": "[]", "multiline": True}),
            "fps": ("FLOAT", {"default": 32, "min": 1, "max": 120}),
            "fade": ("INT", {"default": 8, "min": 0, "max": 120}),
        }}

    RETURN_TYPES = ("AUDIO",)
    FUNCTION = "run"
    CATEGORY = "High End/montaje"

    def run(self, clips, fps, fade):
        import json
        sr = 44100
        vids = [v for v in json.loads(clips or "[]") if v and v.get("abs")]
        segs = []
        for v in vids:
            sp = min(8.0, max(0.25, float(v.get("speed") or 1)))
            desde = float(v.get("from") or 0)
            dur = float(v.get("dur") or 0)
            if dur <= 0:
                dur = max(0.0, _dur_video(v["abs"]) - desde)
            rate = fps / sp
            n = max(1, round(dur * rate))            # mismos cuadros que lee storyboard.concat
            largo = int(round(n / fps * sr))
            a = _audio_clip(v["abs"], desde, dur, sp, sr) if 0.5 <= sp <= 2 else np.zeros((2, 0), np.float32)
            seg = np.zeros((2, largo), np.float32)
            k = min(largo, a.shape[1])
            seg[:, :k] = a[:, :k]
            segs.append(seg)
        if not segs:
            return ({"waveform": torch.zeros(1, 2, sr), "sample_rate": sr},)
        ov = int(round(fade / fps * sr))
        total = sum(s.shape[1] for s in segs) - ov * (len(segs) - 1)
        out = np.zeros((2, max(1, total)), np.float32)
        pos = 0
        for i, seg in enumerate(segs):
            seg = seg.copy()
            o = min(ov, seg.shape[1] // 2)
            if o > 0 and i > 0:
                seg[:, :o] *= np.linspace(0, 1, o, dtype=np.float32)
            if o > 0 and i < len(segs) - 1:
                seg[:, -o:] *= np.linspace(1, 0, o, dtype=np.float32)
            fin = min(out.shape[1], pos + seg.shape[1])
            out[:, pos:fin] += seg[:, :fin - pos]
            pos += seg.shape[1] - ov
        return ({"waveform": torch.from_numpy(np.clip(out, -1, 1))[None], "sample_rate": sr},)


NODE_CLASS_MAPPINGS = {"PhaneImpactos": PhaneImpactos, "PhaneTitulo": PhaneTitulo, "PhaneQuitarOriginal": PhaneQuitarOriginal,
                       "PhaneAudioClips": PhaneAudioClips}
NODE_DISPLAY_NAME_MAPPINGS = {"PhaneImpactos": "Phane · Impactos de golpe", "PhaneTitulo": "Phane · Tarjeta de título",
                              "PhaneQuitarOriginal": "Phane · Quitar a la persona original (Recast reemplazar)",
                              "PhaneAudioClips": "Phane · Audio de los clips (unir videos)"}
