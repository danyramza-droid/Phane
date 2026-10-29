# Phane tools

Small standalone scripts. None of them is needed to run Phane; they help you set it up or share it.

| Script | What it does | Needs |
|---|---|---|
| `download_models.py` | Downloads the model files an engine needs (see `models.json`). `--starter` = only what the demo uses. | Python from ComfyUI |
| `bake_lightx2v.py` | Bakes the lightx2v speed LoRA into Wan Animate 2 (int8) so Recast runs with few steps without loading a LoRA at run time. | Python from ComfyUI, ~35 GB free RAM (the 15.5 GB model + LoRA in memory, twice while saving), **CPU only** |
| `gen_examples.mjs` | Rebuilds `example_workflows/` (the graphs ComfyUI shows under *Browse Templates > phane*) from Phane's engines. | Node 18+, a running ComfyUI |

## bake_lightx2v.py

```
cd ComfyUI_windows_portable
python_embeded\python.exe -I ComfyUI\custom_nodes\phane\tools\bake_lightx2v.py --test   # 1 layer, prints the error numbers
python_embeded\python.exe -I ComfyUI\custom_nodes\phane\tools\bake_lightx2v.py          # full bake (~2 min on a recent desktop CPU)
```

- **Input** (in `ComfyUI/models`): `diffusion_models/wan_animate_2_int8_convrot.safetensors` and
  `loras/lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors`.
- **Output:** `diffusion_models/wan_animate_2_lightx2v_int8_convrot.safetensors` (metadata `phane_baked`).
- Other models folder: `--models D:\path\to\models` or the `PHANE_MODELS_DIR` environment variable.
- It sets `CUDA_VISIBLE_DEVICES=''`, so it never touches the GPU and can run while ComfyUI is generating
  (it does use a lot of RAM).

### Why stochastic rounding

A distill LoRA changes each weight by a tiny amount. If you add it and then round back to int8 (or bf16) with
plain round-to-nearest, most of those tiny deltas round back to the original value and the LoRA effect is
mostly lost: the baked model behaves like the base model and needs the full step count. The script
re-quantizes with **stochastic rounding** (seeded per tensor, so the result is reproducible), the same trick
ComfyUI uses when it applies a LoRA on the fly to fp8/int8 weights. On average every delta survives, and the
baked model behaves like "base + LoRA at 1.0". `--test` prints the re-quantization error next to the
error of not applying the LoRA at all, so you can check that the first is much smaller.

## gen_examples.mjs

```
cd ComfyUI/custom_nodes/phane
node tools/gen_examples.mjs                          # starter-pack engines, server at 127.0.0.1:8188
node tools/gen_examples.mjs --ids video.wan image.klein
node tools/gen_examples.mjs --object-info dump.json  # offline, from a saved /object_info
```

It builds each engine's graph with `web/js/lib/graph.js` (the same graph the web UI queues), then lays it out
in ComfyUI's canvas format using the node definitions from `/object_info`. Seeds are fixed to 42 so the files
stay stable between runs. Nothing is queued and no GPU is used.
