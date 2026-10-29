# Bakes the lightx2v LoRA (I2V 480p, rank 64) into Wan Animate 2 int8 convrot. CPU only (no GPU needed).
# Result: models/diffusion_models/wan_animate_2_lightx2v_int8_convrot.safetensors (Recast in ~5 min instead of ~20).
# Usage (from the ComfyUI folder):
#   python_embeded\python.exe -I custom_nodes\phane\tools\bake_lightx2v.py [--test] [--models <ComfyUI/models>]
# See tools/README.md.
import os, sys, json, time, zlib
os.environ['CUDA_VISIBLE_DEVICES'] = ''
import torch
from safetensors import safe_open
from safetensors.torch import save_file
from comfy_kitchen.backends.eager.quantization import quantize_int8_convrot_weight, dequantize_int8_convrot_weight

DEFAULT_MODELS = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..', 'models'))
M = sys.argv[sys.argv.index('--models') + 1] if '--models' in sys.argv else os.environ.get('PHANE_MODELS_DIR', DEFAULT_MODELS)
SRC = os.path.join(M, 'diffusion_models', 'wan_animate_2_int8_convrot.safetensors')
LORA = os.path.join(M, 'loras', 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors')
DST = os.path.join(M, 'diffusion_models', 'wan_animate_2_lightx2v_int8_convrot.safetensors')
TEST = '--test' in sys.argv
def seed(k):
    return zlib.crc32(k.encode()) + 1

def to_bf16_sr(x, k):
    # stochastic rounding to bf16 (as ComfyUI does): with round-to-nearest the small LoRA deltas vanish
    g = torch.Generator().manual_seed(seed(k))
    i = x.float().contiguous().view(torch.int32)
    i = (i + torch.randint(0, 1 << 16, i.shape, generator=g, dtype=torch.int32)) & -65536
    return i.view(torch.float32).to(torch.bfloat16)

torch.set_num_threads(max(4, (os.cpu_count() or 8) - 2))

t0 = time.time()
lora = {}
with safe_open(LORA, 'pt') as f:
    for k in f.keys():
        lora[k[len('diffusion_model.'):]] = f.get_tensor(k)
mods = sorted({k[:-len('.lora_down.weight')] for k in lora if k.endswith('.lora_down.weight')})
if TEST:
    mods = ['blocks.0.self_attn.q']

with safe_open(SRC, 'pt') as f:
    meta = f.metadata()
    keys = list(f.keys())
    sd = {k: f.get_tensor(k) for k in (keys if not TEST else [k for k in keys if k.startswith('blocks.0.self_attn.q.')])}
print('loaded', len(sd), f'{time.time()-t0:.0f}s', flush=True)

nq = nf = 0
for i, mod in enumerate(mods):
    down = lora[mod + '.lora_down.weight'].float(); up = lora[mod + '.lora_up.weight'].float()
    delta = up @ down  # no alpha in the file -> scale 1.0 (same as ComfyUI)
    wk = mod + '.weight'
    if (mod + '.comfy_quant') in sd:
        conf = json.loads(bytes(sd[mod + '.comfy_quant'].tolist()).decode())
        assert conf.get('format') == 'int8_tensorwise' and conf.get('convrot'), conf
        gs = int(conf.get('convrot_groupsize', 256))
        w = dequantize_int8_convrot_weight(sd[wk], sd[mod + '.weight_scale'], gs)
        target = w + delta
        # stochastic rounding again: re-quantizing with plain rounding (seed 0) loses most of the delta
        q, s = quantize_int8_convrot_weight(target, gs, stochastic_rounding=seed(wk))
        if TEST:
            back = dequantize_int8_convrot_weight(q, s, gs)
            # re-quantization error vs. the error of not applying the LoRA at all
            print('conf', conf, 'scale', tuple(s.shape), s.dtype, 'q', q.dtype)
            print('|delta|', delta.norm().item(), 'requant error', (back - target).norm().item(),
                  'error without LoRA', (w - target).norm().item())
        sd[wk] = q.contiguous(); sd[mod + '.weight_scale'] = s.to(sd[mod + '.weight_scale'].dtype).reshape(sd[mod + '.weight_scale'].shape).contiguous()
        nq += 1
    else:
        sd[wk] = to_bf16_sr(sd[wk].float() + delta, wk) if sd[wk].dtype == torch.bfloat16 else (sd[wk].float() + delta).to(sd[wk].dtype); nf += 1
    if i % 40 == 0:
        print(f'{i}/{len(mods)} {time.time()-t0:.0f}s', flush=True)

nd = 0
for k, v in lora.items():
    if k.endswith('.diff_b') or k.endswith('.diff'):
        tk = k[:-len('.diff_b')] + '.bias' if k.endswith('.diff_b') else k[:-len('.diff')] + '.weight'
        if tk in sd:
            sd[tk] = to_bf16_sr(sd[tk].float() + v.float(), tk) if sd[tk].dtype == torch.bfloat16 else (sd[tk].float() + v.float()).to(sd[tk].dtype); nd += 1
print('int8 layers', nq, 'bf16 layers', nf, 'diffs', nd, f'{time.time()-t0:.0f}s', flush=True)
if TEST:
    sys.exit(0)
meta = dict(meta or {}); meta['phane_baked'] = 'lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16 @1.0'
save_file(sd, DST + '.tmp', metadata=meta)
os.replace(DST + '.tmp', DST)
print('DONE', DST, f'{time.time()-t0:.0f}s', flush=True)
