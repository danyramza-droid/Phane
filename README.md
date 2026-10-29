# Phane

**A local, 100 % open‑weights, Higgsfield‑style AI studio built on ComfyUI.**
Image, edit, video, exact pose, text‑to‑motion, recast, storyboards, talking avatars, voice, music, SFX, upscaling and
frame interpolation — 45 engines behind one friendly web UI, running on your own GPU. No credits, no cloud APIs, no partner nodes.

> Built for the ComfyUI "Open Source Higgsfield" challenge (Open Weights Only category).
> 📺 **Demo video:** VIDEO_LINK_PENDING
> UI in English, with a one‑click switch to Spanish (ES/EN, top bar).

## Highlights
- **One page per task** (Image, Edit, Video, Recast, Storyboard, Motion, Game, Avatars, Audio, Camera…), each with
  a ⚡ *Light* engine tuned for 8 GB GPUs and a 🚀 *High End* engine tuned for 24–32 GB GPUs. Phane picks the best engine you have installed.
- **🧍 Exact Pose** — copy the pose of any photo onto your character: SDPose skeleton → Z‑Image Turbo + Fun ControlNet Union →
  a design pass with your character sheet, all in one graph.
- **🕺 Text → 3D motion** — NVIDIA Kimodo turns a sentence into a 3D animation; export an MP4 mannequin (feeds Recast),
  an exact skeleton PNG for any frame (feeds Exact Pose) or a BVH for your game engine.
- **🎮 Game** — one action × your characters × camera angles: Kimodo motion → mannequin from front, ¾, profile or back →
  your character in that exact pose, with the pose pipeline picked per angle. Great for game sprites and turnarounds.
- **Draft → 🎬 Make final** — iterate on fast low‑res drafts, then send the one you like to final (SeedVR2 upscale, frame
  interpolation, MMAudio sound). Long videos are split into chunks automatically so they fit in 8 GB.
- **🧩 Open in ComfyUI** — every finished job can be opened as its exact ComfyUI graph on the canvas: Phane is ComfyUI underneath,
  and you can learn from or tweak any workflow.
- **Phany** — Phane's original mascot: every preview in the app (and the demo video) features her, no third‑party IP.
- **License tags** — every engine shows ✅ Commercial / 🟡 With conditions / 🔴 Personal use only in its menu.
- **Characters** — reference photos + an optional LoRA (trainable in ComfyUI; FLUX.2 Klein fp16 training fix included).
- **Safety rails** — every engine declares its peak system RAM; engines that would exceed your RAM are blocked before they start.
  Time estimates for every job.
- **Graph validator** — `node tests/validate.mjs` checks all 45 engine graphs against a running ComfyUI without using the GPU.

## Requirements
- ComfyUI **v0.41+** (portable or manual install)
- NVIDIA GPU with **8 GB+ VRAM** (developed on an 8 GB Turing card in fp16). 24–32 GB unlocks the High End engines at full speed.
- **32 GB RAM** minimum, **64 GB** recommended for the big video engines.
- Node.js 18+ (only for the test tools)

## Install
```bash
cd ComfyUI/custom_nodes
git clone https://github.com/danyramza-droid/phane
```
Install the node packs it uses, **at the commits Phane was tested with** (close ComfyUI first; from the `ComfyUI_windows_portable` folder):
```bash
python_embeded\python.exe -I ComfyUI\custom_nodes\phane\tools\install_nodes.py          # starter: what the demo needs
python_embeded\python.exe -I ComfyUI\custom_nodes\phane\tools\install_nodes.py --all    # + sound and voices
```
It uses git if you have it (otherwise it downloads the same commit as a .zip) and installs each pack's requirements.
Packs you already have are left alone. Prefer ComfyUI‑Manager? Install the same packs from *Install Custom Nodes*.

| Node pack | Commit | Used for | |
|---|---|---|---|
| ComfyUI-GGUF | `6ea2651` | GGUF models (Z‑Image, Wan) | starter |
| ComfyUI-KJNodes | `17195fc` | image/video helpers | starter |
| ComfyUI-VideoHelperSuite | `4d907be` | video load/save | starter |
| ComfyUI-Frame-Interpolation | `26545cc` | RIFE (smooth 32 fps in Video and Recast) / FILM | starter |
| ComfyUI-Qwen-TTS | `374c2e0` | voice design (Qwen3‑TTS VoiceDesign) | `--all` |
| ComfyUI-MMAudio | `8eaeb72` | sound effects for video | `--all` |
| ComfyUI-Chatterbox | `4597af8` | voice (TTS) | `--all` |

SeedVR2 (🎬 *Upscale to final*) and SAM 3D Body are built into ComfyUI (v0.41+). Tested on ComfyUI **v0.41.0 and v0.43.0** (portable).

Then restart ComfyUI with:
```bash
python main.py --force-fp16 --disable-fast-disk
```
(Windows portable: add those flags to `run_nvidia_gpu.bat`.)

**Start here: http://127.0.0.1:8188/phane/simple** — type an idea, press one button. The first time you open Phane it adds
**Phany** (the mascot from the demo) as a sample character, so the examples work right away.
When you want every option, switch to **Complete** (top bar, or http://127.0.0.1:8188/phane).

> Don't use `--use-ck-attention` or `--fast fp16_accumulation` with Phane: several engines produce NaNs/black frames with them on fp16 GPUs.

## Models
You don't need all of them, and **you don't need a terminal**: open http://127.0.0.1:8188/phane/simple and, if no models are
installed yet, Phane shows **Set up Phane** with two buttons. It downloads by itself with a progress bar (you can close the tab;
it keeps going and resumes where it stopped). Later, any feature that is missing shows **⬇️ Download now (X GB)**.

| Level | What you get | Size | Button or command |
|---|---|---|---|
| ⚡ **Quick start** | Simple mode: images (with your character) and videos, 🎬 Make final; Image, Edit, Video, Storyboard | ≈ 85 GB | *Quick start*, or `download_models.py --quick` |
| 🎬 **Full** (the demo) | + 🕺 text → 3D motion, 🎮 Game (your character in 4 angles), exact pose, 🎭 Recast | ≈ 175 GB (incl. Kimodo's 16.5 GB) | *Full*, then *Install Kimodo*; or `--starter` + `kimodo/install_kimodo.bat` |
| ➕ **Any other engine** | 🎯 Video guide, 🗣️ Avatars, 🎵 voice and music, LTX, Qwen‑Image… | 4–60 GB each | **⬇️ Download now** on that page, or `download_models.py <engine id>` |

```bash
python_embeded\python.exe -I ComfyUI\custom_nodes\phane\tools\download_models.py --quick --list     # what and how big
python_embeded\python.exe -I ComfyUI\custom_nodes\phane\tools\download_models.py --quick            # download (resumes)
python_embeded\python.exe -I ComfyUI\custom_nodes\phane\tools\download_models.py video.ltx23 image.qwen21   # any engines
```
[`models.json`](models.json) lists every engine, its files (paths relative to `ComfyUI/models`), the download URL and the size of each file.
Existing files are skipped. Gated repos need `HF_TOKEN` set. Voice, sound and music also need their node packs
(`install_nodes.py --all`, or the *Install node packs* button) and a ComfyUI restart. The full Recast engine (`recast.animate2`)
uses a model you build locally (the lightx2v LoRA baked into Wan Animate 2, CPU only): `tools\bake_lightx2v.py`.

⚠️ **Licenses differ per model.** Every engine runs on open weights, but not all of them allow commercial use. Engines with
non‑commercial weights carry a 🔴 tag in the app; turn on **💼 Commercial use only** (top bar) to hide and block them.
- **Qwen‑Image 2.1** (`*.qwen21`, the design pass, the prompt enhancer, `image.pose_maniqui`) is under the
  [Qwen Research License](https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE): **research or evaluation only**, no commercial use
  without a separate license from Qwen. Phane does **not** redistribute these weights: `download_models.py` fetches them from Qwen's own
  Hugging Face repo, and by downloading them you accept that license.
  *Qwen is licensed under the Qwen RESEARCH LICENSE AGREEMENT, Copyright (c) 2026 Hangzhou Tongyi Laboratory Technology Co., Ltd. All Rights Reserved.*
- **MMAudio** is non‑commercial too (🔴).
- The **starter pack** includes `image.pose_maniqui` (Qwen‑Image 2.1 + VNCCS), the best route for 🎮 Game (front and ¾) and the one
  in the demo video, so **the starter is not 100 % commercial‑friendly**. Turn on **💼 Commercial use only** and Game uses
  Qwen‑Edit 2511 + AnyPose (Apache‑2.0) for every angle; if `pose_maniqui` isn't installed, it does that automatically.

Read [THIRD_PARTY_MODELS.md](THIRD_PARTY_MODELS.md) before using outputs commercially. **Built with Qwen** (Qwen‑Image, Qwen‑Image‑Edit, Qwen3, Qwen3‑TTS).

## Kimodo (text → 3D motion)
Kimodo runs in its **own** Python 3.12 venv (pinned `transformers`), called as a subprocess through ComfyUI's queue, so it never
competes with another GPU job.
1. Double‑click `kimodo/install_kimodo.bat` (Python 3.12 + git needed). It creates the venv, installs PyTorch CUDA 13.0 and the
   pinned packages, builds Kimodo from `nv-tlabs/kimodo` and downloads the **SOMA** weights (the SMPL‑X variant is research‑only).
   No C++ compiler? It still works, only foot‑contact cleanup is skipped.
2. Kimodo's text encoder is **Meta‑Llama‑3‑8B‑Instruct** (16 GB). The installer downloads it at the end (step 6/6) — **no Hugging Face
   token or login needed**: it comes from the open mirror [`NousResearch/Meta-Llama-3-8B-Instruct`](https://huggingface.co/NousResearch/Meta-Llama-3-8B-Instruct),
   which has the **same files** as [`meta-llama/Meta-Llama-3-8B-Instruct`](https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct)
   (identical SHA‑256 for the four weight shards), and is stored where Kimodo looks for the official one. If it was interrupted, run
   `kimodo/download_llama.bat` (it resumes). Already have Meta's official copy? It is used as is. Prefer the official repo?
   `kimodo/download_llama.bat official` (needs a token approved by Meta). New prompts are read on the CPU (~16 GB RAM); each prompt
   is cached afterwards, so motions already in `kimodo/cache_textos` work even without Llama.
   Llama 3 is licensed under the [Meta Llama 3 Community License](https://www.llama.com/llama3/license/) (the mirror does not change it):
   by downloading it you accept that license and its Acceptable Use Policy. **Built with Meta Llama 3.**

## Tests
```bash
node tests/validate.mjs            # validate every engine graph (needs ComfyUI running, no GPU)
node tests/run.mjs image.zimage     # real GPU run of one engine: time + peak RAM
```

## How it's built
- `web/js/engines.js` + `web/js/graphs/*.js` — the **engine contract**: each engine is `{ id, tool, tier, files, ramGB, est(o), build(o) }`
  and `build()` returns a ComfyUI API graph made with a tiny graph builder (`web/js/lib/graph.js`). The UI, the RAM guard,
  the missing‑file check and the validator all read the same registry.
- `__init__.py` — `/phane` page + `/phane/api/*` (installed models, live RAM/VRAM/disk, gallery, characters).
- `depth_node.py`, `kimodo_node.py` — custom nodes (Depth Anything V2 Small, Kimodo bridge). `train_fix.py` — fp16 LoRA training fix for FLUX.2 Klein.
- Pure vanilla JS front‑end served by ComfyUI, no build step.

## License
Phane's code is **GPL‑3.0‑or‑later** (same as ComfyUI). Model weights are **not** included and keep their own licenses — see
[THIRD_PARTY_MODELS.md](THIRD_PARTY_MODELS.md). You are responsible for how you use generated content: do not use Phane to
create content that infringes others' rights or depicts real people without consent.
