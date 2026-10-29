# Third‑party models and licenses

Phane ships **no model weights**. Every model below is downloaded by the user and keeps its own license.
All of them are **open weights** run locally; Phane uses **no partner nodes and no closed APIs**.
This table is informational, not legal advice — always check the license on the model's official page.
Licenses were checked on each model's Hugging Face page on 2026‑10‑27 (repackaged files, e.g. Comfy‑Org or Kijai, follow the original repo's license).

Legend: ✅ permissive (Apache/MIT/BSD) · 🟡 open weights, custom license with conditions · 🔴 open weights, **non‑commercial**

| Engine(s) | Model | License | |
|---|---|---|---|
| image.zimage, image.pose | Z‑Image Turbo (Tongyi‑MAI) | Apache‑2.0 | ✅ |
| image.pose | Z‑Image‑Turbo Fun ControlNet Union (alibaba‑pai) | Apache‑2.0 | ✅ |
| image.pose | SDPose Wholebody | MIT | ✅ |
| image.pose | Depth Anything V2 **Small** (Base/Large are CC‑BY‑NC — not used) | Apache‑2.0 | ✅ |
| image.pose_anypose | Qwen‑Image‑Edit‑2511 + AnyPose LoRAs | Apache‑2.0 | ✅ |
| image.pose_klein | FLUX.2 Klein **base** 4B + RefControl LoRA | Apache‑2.0 | ✅ |
| image.pose_maniqui | Qwen‑Image 2.1 + VNCCS PoseStudio V2 LoRA (from [MIUProject/VNCCS_v3.0](https://huggingface.co/MIUProject/VNCCS_v3.0)) | base: Qwen Research License (non‑commercial); LoRA: Apache‑2.0 (repo license) | 🔴 |
| image.pose_* | QI2.1 AnyAngle LoRA | Apache‑2.0 | ✅ |
| pose.foto_maniqui | SAM 3D Body (DINOv3) | SAM License | 🟡 |
| image/edit/storyboard.klein | FLUX.2 Klein **4B** + FLUX.2 VAE | Apache‑2.0 | ✅ |
| several | Qwen3 4B, Qwen3‑VL 4B/8B, Qwen2.5‑VL 7B (text encoders / prompt enhancer) | Apache‑2.0 | ✅ |
| *.qwen21, image.pose (design pass), enhance.qwen_pe_* | Qwen‑Image 2.1 (+ Turbo, PE) | Qwen Research License (non‑commercial) | 🔴 |
| storyboard.qwen21 | Next‑Scene LoRA (akhaliq) on Qwen‑Image 2.1 | LoRA Apache‑2.0; base model Qwen Research License | 🔴 |
| edit.qwen2511 | Qwen‑Image‑Edit‑2511 + Lightning LoRA | Apache‑2.0 | ✅ |
| video.wan, video.wan_he | Wan 2.1 / 2.2 I2V + lightx2v LoRAs + umt5 + CLIP‑ViT‑H | Apache‑2.0 / MIT | ✅ |
| video.wan_control | Wan 2.2 Fun A14B Control (alibaba‑pai; GGUF by QuantStack) | Apache‑2.0 | ✅ |
| video.wan, video.wan_he | SVI 2.0 Pro LoRAs (EPFL VITA, Stable Video Infinity) | MIT | ✅ |
| video.wan, video.wan_he (camera presets) | Civitai camera LoRAs: Orbit v2 and Bullet Time (LuisaP), 360 Rotation Redmond (artificialguybr) | Civitai permissions: commercial use of generated images/videos allowed; no formal license | 🟡 |
| video.ltx23 | LTX‑2.3 22B distilled + spatial upscaler | LTX‑2 Community License | 🟡 |
| video.ltx23 | Gemma 3 12B (text encoder) | Gemma Terms of Use | 🟡 |
| video.h3 | MiniMax H3 | MiniMax H3 Community License: not licensed in the US, EU, UK or South Korea (ask MiniMax); >$20M revenue needs permission; outputs may not train other models | 🟡 |
| recast.animate2* | Wan Animate 2 (+ SAM 3.1 for masks, SAM License) | Apache‑2.0 | ✅ (🟡 with SAM 3.1) |
| draw.wanmove | Wan‑Move 14B 480P | Apache‑2.0 | ✅ |
| avatar.infinitetalk | InfiniteTalk (MeiGen) + wav2vec2‑chinese‑base (TencentGameMate) | Apache‑2.0 / MIT | ✅ |
| avatar.humo | HuMo 17B (ByteDance) + Whisper large‑v3 | Apache‑2.0 / MIT | ✅ |
| voice.chatterbox | Chatterbox Multilingual (Resemble AI) | MIT | ✅ |
| voice.qwen3tts | Qwen3‑TTS 12Hz 1.7B VoiceDesign + Qwen3‑TTS Tokenizer 12Hz (Alibaba Qwen) | Apache‑2.0 | ✅ |
| music.acestep | ACE‑Step 1.5 (+ Qwen3 0.6B/4B) | MIT (Apache‑2.0 for the Qwen3 parts) | ✅ |
| sound.mmaudio | MMAudio weights (CC‑BY‑NC‑4.0; code MIT) + Apple DFN5B‑CLIP (Apple research‑only license) | non‑commercial | 🔴 |
| upscale.* | Real‑ESRGAN x2plus · SeedVR2 3B/7B | BSD‑3 · Apache‑2.0 | ✅ |
| fps.* | RIFE 4.9 · FILM | MIT · Apache‑2.0 | ✅ |
| segment.sam3 | SAM 3.1 (Meta; gated on HF) | SAM License | 🟡 |
| bg.birefnet | BiRefNet | MIT | ✅ |
| motion.kimodo* | Kimodo **SOMA** (NVIDIA) | NVIDIA Open Model License | 🟡 |
| motion.kimodo* | Meta‑Llama‑3‑8B‑Instruct (downloaded from the open mirror NousResearch/Meta‑Llama‑3‑8B‑Instruct: same files as meta‑llama/Meta‑Llama‑3‑8B‑Instruct, identical SHA‑256) | Meta Llama 3 Community License — see below | 🟡 |
| Effects page, camera presets | Remade‑AI Wan effect and camera LoRAs (all 69 repos used) | Apache‑2.0 | ✅ |

Each engine in the app shows the same tag (✅ / 🟡 / 🔴) next to its name. An engine takes the most restrictive license of its files.
## Meta Llama 3
Kimodo reads text with LLM2Vec on top of **Meta‑Llama‑3‑8B‑Instruct**. Phane does not ship its weights: `kimodo/download_llama.bat`
(or step 6 of `kimodo/install_kimodo.bat`) downloads them from the open Hugging Face mirror `NousResearch/Meta-Llama-3-8B-Instruct`
(pinned commit `53346005`), whose files are byte‑identical to Meta's `meta-llama/Meta-Llama-3-8B-Instruct` (same SHA‑256 for the
four `.safetensors` and same config/tokenizer files), so no Hugging Face token is needed. The mirror does not change the license:
Llama 3 remains under the **Meta Llama 3 Community License** (https://www.llama.com/llama3/license/) and its Acceptable Use Policy
(https://www.llama.com/llama3/use-policy/). Notable conditions: products with more than 700 million monthly active users need a
separate license from Meta; if you redistribute Llama 3 or a product that includes it, include a copy of the license and display
**"Built with Meta Llama 3"**; Llama 3 outputs may not be used to improve other large language models (except Llama derivatives).

Meta Llama 3 is licensed under the Meta Llama 3 Community License, Copyright © Meta Platforms, Inc. All Rights Reserved.
**Built with Meta Llama 3.**

Not included on purpose (license): FLUX.1 [dev] (non‑commercial), Krea 2 (community license), Juggernaut XI (CC‑BY‑NC‑ND‑4.0), FLUX.2 Klein 9B (non‑commercial) and camera LoRAs whose authors do not allow commercial use of outputs.

## Code dependencies
| Package | License |
|---|---|
| ComfyUI | GPL‑3.0 |
| ComfyUI‑KJNodes, ComfyUI‑VideoHelperSuite | GPL‑3.0 |
| ComfyUI‑GGUF, ComfyUI‑Chatterbox, ComfyUI‑Qwen‑TTS | Apache‑2.0 |
| ComfyUI‑MMAudio, ComfyUI‑Frame‑Interpolation | MIT |
| Kimodo (nv-tlabs/kimodo) | Apache‑2.0 |
