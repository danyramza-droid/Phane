"""Mapa de profundidad con Depth Anything V2 Small (Apache-2.0, ~100 MB, models/depth_anything/Depth-Anything-V2-Small-hf).

Para la pose exacta: el esqueleto 2D no dice qué brazo/pierna va delante, y las poses de perfil salían de frente.
La profundidad entra como 2.º control al Fun ControlNet Union (que también la entiende). Cerca = blanco, lejos = negro.
Las versiones Base/Large son no comerciales: no usarlas.
"""
import os

import torch
import torch.nn.functional as F

import comfy.model_management as mm
import folder_paths

MODEL_DIR = os.path.join(folder_paths.models_dir, "depth_anything", "Depth-Anything-V2-Small-hf")
# 28-oct (#8): también en las rutas "depth_anything:" de extra_model_paths.yaml (modelos en otra carpeta)
for _r in folder_paths.folder_names_and_paths.get("depth_anything", ([], None))[0]:
    if not os.path.isdir(MODEL_DIR) and os.path.isdir(os.path.join(_r, "Depth-Anything-V2-Small-hf")):
        MODEL_DIR = os.path.join(_r, "Depth-Anything-V2-Small-hf")
_cache = {}


def _load():
    if "m" not in _cache:
        from transformers import AutoModelForDepthEstimation
        _cache["m"] = AutoModelForDepthEstimation.from_pretrained(MODEL_DIR).eval()
    return _cache["m"]


class PhaneDepth:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("IMAGE",)}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "run"
    CATEGORY = "phane"

    def run(self, image):
        dev = mm.get_torch_device()
        model = _load().to(dev)
        out = []
        mean = torch.tensor([0.485, 0.456, 0.406], device=dev).view(1, 3, 1, 1)
        std = torch.tensor([0.229, 0.224, 0.225], device=dev).view(1, 3, 1, 1)
        with torch.no_grad():
            for img in image:  # [H,W,C] 0-1
                h, w = img.shape[:2]
                s = 518 / max(h, w)
                th, tw = max(14, round(h * s / 14) * 14), max(14, round(w * s / 14) * 14)
                x = img[..., :3].permute(2, 0, 1).unsqueeze(0).to(dev)
                x = F.interpolate(x, size=(th, tw), mode="bicubic", align_corners=False)
                d = model(pixel_values=(x - mean) / std).predicted_depth.unsqueeze(1)
                d = F.interpolate(d, size=(h, w), mode="bicubic", align_corners=False)[0, 0]
                d = (d - d.min()) / (d.max() - d.min() + 1e-6)
                out.append(d.unsqueeze(-1).repeat(1, 1, 3).float().cpu())
        model.to("cpu")
        mm.soft_empty_cache()
        return (torch.stack(out),)


NODE_CLASS_MAPPINGS = {"PhaneDepth": PhaneDepth}
NODE_DISPLAY_NAME_MAPPINGS = {"PhaneDepth": "Phane · Profundidad (Depth Anything V2 Small)"}
