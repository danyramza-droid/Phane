# Install the community node packs Phane uses, at the exact commits Phane was tested with.
# Usage (from the ComfyUI_windows_portable folder, with ComfyUI's embedded Python):
#   python_embeded\python.exe -I ComfyUI\custom_nodes\phane\tools\install_nodes.py            # starter: what the demo needs
#   python_embeded\python.exe -I ComfyUI\custom_nodes\phane\tools\install_nodes.py --all      # + sound and voices
#   add --list to only print what would be installed.  Close ComfyUI first (pip cannot replace files it has open).
# A pack that is already there is left as it is (its commit is only reported). Uses git if you have it; otherwise it
# downloads the same commit as a .zip from GitHub. Then it pip-installs each pack's requirements.txt into this Python.
# SeedVR2 (🎬 Upscale to final) is part of ComfyUI itself (comfy_extras/nodes_seedvr.py): ComfyUI v0.41+ has it.
import io, os, shutil, subprocess, sys, urllib.request, zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
CUSTOM = os.environ.get("PHANE_CUSTOM_NODES", os.path.normpath(os.path.join(HERE, "..", "..")))

# (folder, GitHub repo, commit, starter?, used for)
PACKS = [
    ("ComfyUI-GGUF", "city96/ComfyUI-GGUF", "6ea2651e7df66d7585f6ffee804b20e92fb38b8a", True, "GGUF models (Wan 2.2, Z-Image)"),
    ("ComfyUI-KJNodes", "kijai/ComfyUI-KJNodes", "17195fcfa8a05f601b766a0f09c9733284f47416", True, "image/video helpers"),
    ("ComfyUI-VideoHelperSuite", "Kosinkadink/ComfyUI-VideoHelperSuite", "4d907bee61e92c2e65af3bd6383a4e4d356126d1", True, "video load/save"),
    ("ComfyUI-Frame-Interpolation", "Fannovel16/ComfyUI-Frame-Interpolation", "26545cc2dd95bc3d27f056016300673bdeee78f5", True, "RIFE (smooth 32 fps in Video and Recast)"),
    ("ComfyUI-Qwen-TTS", "flybirdxx/ComfyUI-Qwen-TTS", "374c2e05dc705231258237a16258d2f8fae8e32a", False, "voice design (Qwen3-TTS)"),
    ("ComfyUI-MMAudio", "kijai/ComfyUI-MMAudio", "8eaeb72edc3aaf2059b57f2d96a1f6f689f19ae2", False, "sound effects for video"),
    ("ComfyUI-Chatterbox", "wildminder/ComfyUI-Chatterbox", "4597af8f59d4460d441e13533eae24b092e40952", False, "voice (TTS)"),
]


def run(cmd, **kw):
    print("  $", " ".join(cmd))
    return subprocess.call(cmd, **kw)


def head(dst):
    try:
        return subprocess.check_output(["git", "-C", dst, "rev-parse", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def get(folder, repo, commit):
    dst = os.path.join(CUSTOM, folder)
    if os.path.isdir(dst):
        h = head(dst)
        note = "" if h is None else (" (same commit)" if h == commit else f" (commit {h[:7]}, Phane was tested with {commit[:7]})")
        print(f"- {folder}: already installed{note}")
        return dst
    if shutil.which("git"):
        if run(["git", "clone", "--filter=blob:none", f"https://github.com/{repo}.git", dst]) == 0 and \
           run(["git", "-C", dst, "checkout", "-q", commit]) == 0:
            return dst
        print(f"  git failed for {folder}, trying the .zip")
        if os.path.isdir(dst) and not os.listdir(dst):
            os.rmdir(dst)
    if os.path.isdir(dst):
        sys.exit(f"{dst} exists but is not usable: move it away and run this again.")
    url = f"https://codeload.github.com/{repo}/zip/{commit}"
    print("  downloading", url)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "phane-installer"})) as r:
        z = zipfile.ZipFile(io.BytesIO(r.read()))
    top = z.namelist()[0].split("/")[0]
    tmp = dst + ".tmp"
    z.extractall(tmp)
    os.replace(os.path.join(tmp, top), dst)
    os.rmdir(tmp)
    return dst


def main(args):
    packs = [p for p in PACKS if p[3] or "--all" in args]
    print(f"Phane node packs -> {CUSTOM}")
    for folder, repo, commit, starter, what in packs:
        print(f"  {folder} @ {commit[:7]}  [{'starter' if starter else 'optional'}] {what}")
    if "--list" in args:
        return 0
    bad = []
    for folder, repo, commit, _s, _w in packs:
        print(f"\n== {folder}")
        dst = get(folder, repo, commit)
        req = next((os.path.join(dst, n) for n in ("requirements.txt", "requirements-no-cupy.txt") if os.path.isfile(os.path.join(dst, n))), "")  # Frame-Interpolation: no-cupy
        if os.path.isfile(req) and run([sys.executable, "-s", "-m", "pip", "install", "-r", req]) != 0:
            bad.append(folder)
    print("\nDone." if not bad else "\nThese packs installed, but pip failed on their requirements: " + ", ".join(bad) +
          "\n('Access is denied' means ComfyUI is still running: close it and run this again.)")
    print("Restart ComfyUI (with --force-fp16 --disable-fast-disk) and open http://127.0.0.1:8188/phane")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
