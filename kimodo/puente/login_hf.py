"""Small window to paste a Hugging Face (read) token and check access to Llama-3-8B-Instruct.

Used by download_llama.bat (descargar_llama.bat in the dev setup). The user pastes the token in the box and it goes STRAIGHT to huggingface_hub.login(): it is not printed
or stored anywhere else (it ends up in %USERPROFILE%\\.cache\\huggingface\\token, like with `hf auth login`).
Exits 0 if the token is valid AND Meta granted access; 2 if the token works but approval is pending; 1 if cancelled.
"""
import sys
import tkinter as tk
from tkinter import ttk

REPO = "meta-llama/Meta-Llama-3-8B-Instruct"
resultado = {"code": 1}


def probar():
    tok = entrada.get().strip()
    if not tok.startswith("hf_"):
        estado.config(text="That does not look like a token: it must start with hf_ (copy it from huggingface.co/settings/tokens).", foreground="#c0392b")
        return
    estado.config(text="Checking…", foreground="#555")
    raiz.update()
    from huggingface_hub import hf_hub_download, login, whoami
    from huggingface_hub.errors import GatedRepoError
    try:
        quien = whoami(token=tok)["name"]
    except Exception:  # noqa: BLE001
        estado.config(text="Hugging Face rejected that token. Check that you copied all of it.", foreground="#c0392b")
        return
    login(token=tok, add_to_git_credential=False)
    try:
        hf_hub_download(REPO, "config.json")
    except GatedRepoError:
        estado.config(text=f"Token saved (hi, {quien}). But Meta has NOT approved your Llama 3 access yet: check the model page "
                           "and run the Llama download .bat again once it says you have access.", foreground="#b9770e")
        resultado["code"] = 2
        boton.config(text="Close", command=raiz.destroy)
        return
    except Exception as e:  # noqa: BLE001
        estado.config(text=f"Token saved (hi, {quien}), but I could not check access: {type(e).__name__}.", foreground="#b9770e")
        resultado["code"] = 2
        boton.config(text="Close", command=raiz.destroy)
        return
    resultado["code"] = 0
    estado.config(text=f"Done, {quien}! Token saved, with access to Llama 3. Starting the download…", foreground="#1e8449")
    raiz.after(1500, raiz.destroy)


raiz = tk.Tk()
raiz.title("Hugging Face token for Kimodo")
raiz.attributes("-topmost", True)
marco = ttk.Frame(raiz, padding=16)
marco.pack(fill="both", expand=True)
ttk.Label(marco, text="1. Open huggingface.co/settings/tokens and copy your READ token (it starts with hf_).\n"
                      "2. Paste it below (Ctrl+V or right click → Paste) and click «Save».",
          justify="left").pack(anchor="w")
entrada = ttk.Entry(marco, width=60, show="•")
entrada.pack(fill="x", pady=10)
entrada.focus_set()


def pegar_menu(ev):
    m = tk.Menu(raiz, tearoff=0)
    m.add_command(label="Paste", command=lambda: entrada.event_generate("<<Paste>>"))
    m.tk_popup(ev.x_root, ev.y_root)


entrada.bind("<Button-3>", pegar_menu)
ver = tk.BooleanVar(value=False)
ttk.Checkbutton(marco, text="Show", variable=ver, command=lambda: entrada.config(show="" if ver.get() else "•")).pack(anchor="w")
boton = ttk.Button(marco, text="Save", command=probar)
boton.pack(pady=8)
raiz.bind("<Return>", lambda e: probar())
estado = ttk.Label(marco, text="", wraplength=460, justify="left")
estado.pack(anchor="w")
raiz.mainloop()
sys.exit(resultado["code"])
