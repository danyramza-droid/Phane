"""Arreglos para entrenar LoRAs con TrainLoraNode (comfy_extras/nodes_train.py) en FLUX.2 Klein en una GPU de 8 GB (fp16).

1) Gradientes mal con gradient_checkpointing: nodes_train.patch() envuelve cada bloque en torch.utils.checkpoint
   (use_reentrant=False) y guarda REFERENCIAS a sus entradas para recomputar en el backward. Los bloques de Flux hacen
   `img += ...` / `x += ...` sobre su propia entrada (comfy/ldm/flux/layers.py): al recomputar parten de la entrada ya
   modificada y los gradientes de las LoRAs salen mal sin ningún error. Arreglo: cada bloque trabaja sobre una COPIA de sus
   entradas tensor (unos MB). Verificado en CPU: gradientes idénticos a los de sin checkpoint (error 0.0).
2) Pérdida NaN en fp16 (training_dtype "none" con modelo fp16): con batch 1 los latentes llegan en fp16 y el contador
   `ones_like(x) * 1e-37` de samplers._calc_cond_batch se vuelve 0 → 0/0 = NaN. El CFGGuider normal sube ruido y latentes a
   fp32; el de entrenamiento no. Aquí se suben a fp32 al entrar a fwd_bwd (el modelo sigue calculando en fp16 con autocast).

OJO: ComfyUI carga comfy_extras con un nombre de módulo = ruta completa del archivo (nodes.load_custom_node), NO como
"comfy_extras.nodes_train". Importarlo por nombre crea OTRA copia y los parches no llegan al nodo real. Por eso se parchean
todos los módulos cargados cuyo archivo sea nodes_train.py. Solo afecta el entrenamiento; la generación no usa este camino.
"""
import logging
import os
import sys

import torch

_TAG = "[phane] train_fix"


def _targets():
    mods = []
    for m in list(sys.modules.values()):
        f = getattr(m, "__file__", None) or ""
        if os.path.basename(f) == "nodes_train.py" and os.path.basename(os.path.dirname(f)) == "comfy_extras" \
                and hasattr(m, "TrainLoraNode") and hasattr(m, "patch") and hasattr(m, "TrainSampler"):
            mods.append(m)
    return mods


def _patch_module(nt):
    if getattr(nt, "_he_train_fix", False):
        return False
    original_patch = nt.patch
    said = {"patch": False, "fwd": False}

    def patch(m, offloading=False):
        if not hasattr(m, "forward"):
            return
        if offloading and isinstance(m, (torch.nn.Linear, torch.nn.Conv1d, torch.nn.Conv2d, torch.nn.Conv3d)):
            return original_patch(m, offloading)   # rama de una sola entrada (OffloadCheckpointFunction): no muta
        if not said["patch"]:
            said["patch"] = True
            logging.info("%s: checkpointing con copia de entradas EN USO", _TAG)
        org_forward = m.forward

        def _copy(v):
            return v.clone() if torch.is_tensor(v) else v

        def fwd(args, kwargs):
            return org_forward(*[_copy(a) for a in args], **{k: _copy(v) for k, v in kwargs.items()})

        def checkpointing_fwd(*args, **kwargs):
            return torch.utils.checkpoint.checkpoint(fwd, args, kwargs, use_reentrant=False)

        m.org_forward = org_forward
        m.forward = checkpointing_fwd

    original_fwd_bwd = nt.TrainSampler.fwd_bwd

    def fwd_bwd(self, model_wrap, batch_sigmas, batch_noise, batch_latent, *args, **kwargs):
        if not said["fwd"]:
            said["fwd"] = True
            logging.info("%s: latentes fp32 en fwd_bwd EN USO (dtype entrante %s)", _TAG, batch_latent.dtype)
        return original_fwd_bwd(self, model_wrap, batch_sigmas.float(), batch_noise.float(), batch_latent.float(), *args, **kwargs)

    nt.patch = patch
    nt.TrainSampler.fwd_bwd = fwd_bwd
    nt._he_train_fix = True
    return True


def apply():
    mods = _targets()
    if not mods:   # aún no cargado (orden de arranque distinto): se carga por nombre como último recurso
        try:
            import comfy_extras.nodes_train  # noqa: F401
        except Exception as e:  # noqa: BLE001
            logging.warning("%s: no se encontró nodes_train: %s", _TAG, e)
            return
        mods = _targets()
    n = sum(1 for m in mods if _patch_module(m))
    logging.info("%s activo en %d módulo(s) nodes_train: %s", _TAG, n, ", ".join(getattr(m, "__name__", "?")[-60:] for m in mods))
