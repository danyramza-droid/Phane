@echo off
setlocal
title Phane - install Kimodo (text to 3D motion)
REM Kimodo (NVIDIA) lives in its own Python 3.12 venv next to this file; Phane calls it through kimodo\puente\kimodo_puente.py.
REM Steps: 1) venv  2) PyTorch CUDA 13.0  3) pinned packages  4) Kimodo source (commit e1c219c)  5) Kimodo + LLM2Vec weights
REM 6) Llama-3-8B-Instruct (16 GB) from the open mirror NousResearch/Meta-Llama-3-8B-Instruct: same files as Meta's, NO token.
REM    Llama 3 is under the Meta Llama 3 Community License (see THIRD_PARTY_MODELS.md). Built with Meta Llama 3.
REM Needs: NVIDIA GPU, Python 3.12 (py launcher), git, ~25 GB free (venv 6 GB + weights 1.5 GB + Llama 16 GB), ~16 GB RAM for new prompts.
cd /d "%~dp0"

echo [1/6] Python 3.12 venv
if exist venv\Scripts\python.exe goto have_venv
py -3.12 -m venv venv
if errorlevel 1 (
  echo Python 3.12 was not found. Install it from https://www.python.org/downloads/ ^(check "py launcher"^) and run this again.
  pause & exit /b 1
)
:have_venv
set PY=venv\Scripts\python.exe
%PY% -m pip install --upgrade pip setuptools wheel cmake || goto fail

echo [2/6] PyTorch for CUDA 13.0
%PY% -m pip install torch==2.14.0 --index-url https://download.pytorch.org/whl/cu130 || goto fail

echo [3/6] Pinned packages (same versions Phane was tested with)
%PY% -m pip install -r requirements_kimodo.txt || goto fail

echo [4/6] Kimodo source code
if not exist _src\kimodo (
  git clone https://github.com/nv-tlabs/kimodo.git _src\kimodo || goto fail
)
git -C _src\kimodo checkout e1c219c99b4b94ba48be1fb6a1cbc64ecee4c954 || goto fail
REM The foot-cleanup extension (motion_correction) is C++ and needs a compiler (Visual Studio Build Tools or MinGW).
REM If it can't be built, Kimodo still works: Phane just skips foot cleanup.
%PY% -m pip install --no-deps _src\kimodo
if errorlevel 1 (
  echo.
  echo Could not build the C++ foot-cleanup extension. Installing Kimodo without it ^(motion still works^).
  set SKIP_MOTION_CORRECTION_IN_SETUP=1
  %PY% -m pip install --no-deps _src\kimodo || goto fail
)

echo [5/6] Kimodo SOMA weights + LLM2Vec adapters (~1.5 GB)
set HF_HUB_CACHE=%~dp0hf_cache
venv\Scripts\hf.exe download nvidia/Kimodo-SOMA-RP-v1.2 || goto fail
venv\Scripts\hf.exe download McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp || goto fail
venv\Scripts\hf.exe download McGill-NLP/LLM2Vec-Meta-Llama-3-8B-Instruct-mntp-supervised || goto fail

echo [6/6] Llama-3-8B-Instruct, Kimodo's text reader (16 GB, open mirror, no token; resumes if interrupted)
%PY% -I puente\kimodo_puente.py llama
if errorlevel 1 (
  echo.
  echo Kimodo is installed, but the Llama download did not finish. Run download_llama.bat later to resume it
  echo ^(motions already in the text cache still work without it^).
  pause
  exit /b 1
)

echo.
echo Kimodo is installed. Restart ComfyUI and open /phane - Motion.
pause
exit /b 0

:fail
echo.
echo Something failed above. Fix it and run this file again: finished steps are skipped or reused.
pause
exit /b 1
