# Download Phane's models into ComfyUI/models, using the URLs in ../models.json.
# Usage (from ComfyUI's folder, with its embedded Python):
#   python_embeded\python.exe -I custom_nodes\phane\tools\download_models.py --quick          # Simple mode: images + video (~85 GB)
#   python_embeded\python.exe -I custom_nodes\phane\tools\download_models.py --starter        # everything the demo uses
#   python_embeded\python.exe -I custom_nodes\phane\tools\download_models.py video.wan image.klein
#   python_embeded\python.exe -I custom_nodes\phane\tools\download_models.py --all
#   add --list to only print what would be downloaded (and the size).
# Files that already exist are skipped; partial downloads resume. Gated repos need HF_TOKEN in the environment.
import json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PHANE = os.path.dirname(HERE)
MODELS = os.environ.get("PHANE_MODELS_DIR", os.path.normpath(os.path.join(PHANE, "..", "..", "models")))


def pick(spec, args):
    if "--all" in args:
        return list(spec["files"])
    if "--starter" in args:
        return list(spec["starter"]["files"])
    if "--quick" in args:
        return list(spec["quick"]["files"])
    ids = [a for a in args if not a.startswith("--")]
    if not ids:
        sys.exit(__doc__ or "Pass --starter, --all or engine ids (see models.json).")
    known = {e["id"]: e for e in spec["engines"]}
    bad = [i for i in ids if i not in known]
    if bad:
        sys.exit("Unknown engine id(s): " + ", ".join(bad))
    return list(dict.fromkeys(f for i in ids for f in known[i]["files"]))


def fetch(url, dst):
    tmp = dst + ".part"
    have = os.path.getsize(tmp) if os.path.exists(tmp) else 0
    req = urllib.request.Request(url, headers={"User-Agent": "phane-downloader"})
    if have:
        req.add_header("Range", f"bytes={have}-")
    tok = os.environ.get("HF_TOKEN")
    if tok and "huggingface.co" in url:
        req.add_header("Authorization", "Bearer " + tok)
    with urllib.request.urlopen(req) as r:
        mode = "ab" if have and r.status == 206 else "wb"
        total = int(r.headers.get("Content-Length") or 0) + (have if mode == "ab" else 0)
        done = have if mode == "ab" else 0
        with open(tmp, mode) as f:
            while chunk := r.read(1 << 22):
                f.write(chunk)
                done += len(chunk)
                if total:
                    print(f"\r  {done / 2**30:6.2f} / {total / 2**30:.2f} GB", end="", flush=True)
    print()
    os.replace(tmp, dst)


def fetch_repo(howto):
    """Files that are a whole Hugging Face repo (howto: "hf download <repo> --local-dir ComfyUI/models/<dir>")."""
    m = re.search(r"hf download (\S+) --local-dir (?:ComfyUI/models/)?(\S+)", howto)
    if not m:
        return False
    from huggingface_hub import snapshot_download   # comes with ComfyUI
    snapshot_download(m.group(1), local_dir=os.path.join(MODELS, m.group(2)), token=os.environ.get("HF_TOKEN") or None)
    return True


def main():
    args = sys.argv[1:]
    spec = json.load(open(os.path.join(PHANE, "models.json"), encoding="utf-8"))
    files = pick(spec, args)
    todo = [f for f in files if not os.path.exists(os.path.join(MODELS, f))]
    gb = sum(spec["files"][f].get("sizeGB") or 0 for f in todo)
    print(f"{len(files)} files, {len(todo)} missing (~{gb:.1f} GB) -> {MODELS}")
    manual, failed = [], False
    for f in todo:
        info = spec["files"][f]
        if not info.get("url"):
            if "--list" not in args and "hf download" in info.get("howto", ""):
                print(f"- {f} (whole repo, ~{info.get('sizeGB') or '?'} GB)", flush=True)
                try:
                    if fetch_repo(info["howto"]):
                        continue
                except Exception as e:
                    print(f"  FAILED: {e}", flush=True)
                    failed = True
            manual.append(f"{f}: {info.get('howto', 'no URL')}")
            continue
        print(f"- {f} ({info.get('sizeGB') or '?'} GB)", flush=True)
        if "--list" in args:
            continue
        dst = os.path.join(MODELS, f)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        try:
            fetch(info["url"], dst)
        except Exception as e:
            print(f"  FAILED: {e}  ({info['url']})", flush=True)
            failed = True
    if manual:
        print("\nThese are not plain downloads:\n  " + "\n  ".join(manual))
    print("DONE WITH ERRORS" if failed else "DONE", flush=True)   # Phane's download button reads this line
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
