# Phane · architecture

Phane is a ComfyUI custom node pack whose real product is a web app. ComfyUI does all the inference; Phane builds the
workflows, queues them and shows the results. Nothing runs outside ComfyUI's queue except plain file work and Kimodo's
subprocess, which is itself launched from a ComfyUI node so it waits its turn like any other GPU job.

```
Browser (/phane)                         ComfyUI (one process, one GPU queue)
┌──────────────────────────────┐        ┌───────────────────────────────────────────┐
│ pages/*.js  one page per task│        │ /prompt, /queue, /history, /view, WebSocket│
│ kit.js      UI components    │  API   │ __init__.py   /phane/api/* (RAM, models, │
│ core.js     queue, progress, ├───────►│               characters, files, delete)   │
│             estimates, safety│ graphs │ kimodo_node.py → subprocess → kimodo venv  │
│ engines.js  registry of 44   │        │ depth_node.py  small helper node           │
│ graphs/*.js PURE graph builders       │ + community node packs (GGUF, KJNodes…)    │
└──────────────────────────────┘        └───────────────────────────────────────────┘
```

## The engine contract
Every capability is an **engine**: a plain object in `web/js/graphs/*.js`.

```js
{ id: 'video.wan', tool: 'video', tier: 'ligero',            // Light (8 GB) or High End (24–32 GB)
  name: 'Wan 2.2 (Light)', desc: '…',
  files: ['unet/Wan2.2-I2V-A14B-HighNoise-Q4_K_M.gguf', …],   // relative to ComfyUI/models
  ramGB: 34,                                                  // measured peak system RAM
  est: o => 360,                                              // seconds, measured on an una GPU de 8 GB
  build: o => graph,                                          // PURE: options in, ComfyUI API workflow out
  sample: { … }, caps: { … } }                                // test inputs, UI capabilities
```

- `build()` is pure (no DOM, no fetch), so the same code runs in the browser and in Node tests.
- `engines.js` merges all graph files, knows which files are installed (`/phane/api/modelos`) and picks the best
  engine per task for your GPU; the UI only offers engines whose files exist.
- `ramGB` drives the **RAM lock**: a job that would exceed the machine's RAM is blocked before it is queued, because on Windows
  running out of RAM with a big model loaded is a hard crash, not an error.
- `est()` drives the time estimates shown before every job, scaled to the detected GPU.

## Pages
`web/js/pages/*.js` export `{ id, title, icon, order, render(root, ctx), receive?(payload) }`.
`ctx` gives `core` (queue, files, progress), `kit` (prompt box, chips, engine picker, generate button, confirm box),
`engines`, `goto(page, payload)` and `show(file)`. Pages hand results to each other through `receive`, which is how
"🧍 Copy this pose" in the viewer lands in Image, or "🎬 Upscale to final" lands in Enhance.

## The novel pipeline: text → 3D motion → your character
1. **Motion** (`motion.kimodo`): NVIDIA Kimodo turns a sentence into a 3D animation (SOMA skeleton) → BVH for game engines,
   skeleton video and a grey 3D **mannequin** video.
2. **Mannequin frame** (`motion.kimodo_frame`): any frame, from any camera angle, rendered as a clean mannequin image.
   Phane picks the most expressive frame by itself.
3. **Character in that pose**: the mannequin + the character sheet go into a pose engine. The route depends on the angle,
   read from the mannequin's file name: front/¾ → pose LoRA engine; profile → adds the character's side view;
   back → AnyPose (other routes turn the face around). Apache‑only routes: Klein 4B + RefControl, Qwen‑Edit 2511 + AnyPose.
4. **Video**: Recast (Wan Animate 2) drives the character with the mannequin video; **🎬 Upscale to final** runs SeedVR2.
5. **🎮 Game** page chains 1–3 for many actions × characters × angles in one click.

The mannequin is the key idea: diffusion models read a shaded 3D body far more reliably than an OpenPose skeleton,
and Kimodo lets you *direct* the pose with words instead of hunting for a reference photo.

## Characters
`user/phane/personajes.json` (via `/phane/api/personajes`): reference photos (`*diseno*` = full‑body sheet on a plain
background, `*cabeza*` = head), optional LoRA, `desc`, `arma` (held prop) and `vistas` (side/back sheets).
FLUX.2 Klein uses the LoRA when there is one; every other engine uses the photos.

## Tests
- `node tests/validate.mjs` — builds every engine with its `sample` and validates the graph against `/object_info`
  and the installed files. No GPU.
- `node tests/run.mjs <ids>` — real GPU run: time, peak RAM, black frames.

## Repo layout
```
__init__.py, kimodo_node.py, depth_node.py   backend + nodes
web/                                          the app (ES modules, no build step)
kimodo/                                       install_kimodo.bat, Llama download, bridge script
tools/                                        download_models.py, bake_lightx2v.py
models.json                                   engines → files → URL + size, Starter pack
```
