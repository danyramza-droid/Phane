@echo off
title Download Llama-3-8B for Kimodo (16 GB)
REM Kimodo's text reader: Meta-Llama-3-8B-Instruct (16 GB; only the .safetensors + config/tokenizer, no extra "original" copy).
REM Default: NO token, NO login. It downloads the open mirror NousResearch/Meta-Llama-3-8B-Instruct, which has the SAME files
REM as meta-llama/Meta-Llama-3-8B-Instruct (identical sha256), and stores it where Kimodo looks for the official one.
REM Llama 3 is licensed under the Meta Llama 3 Community License (see THIRD_PARTY_MODELS.md). Built with Meta Llama 3.
REM Plan B (official, needs a Hugging Face token approved by Meta):  download_llama.bat official
cd /d "%~dp0"
set HF_HUB_CACHE=%~dp0hf_cache
if /i "%~1"=="official" goto official
if /i "%~1"=="oficial" goto official

echo Downloading Llama-3-8B-Instruct (16 GB) from the open mirror. No token needed.
echo It depends on your connection; do not close this window. If it stops, run this file again: it resumes.
venv\Scripts\python.exe -I puente\kimodo_puente.py llama
if errorlevel 1 (
  echo.
  echo Download failed. Check your connection and run this file again ^(it resumes where it stopped^).
  echo Plan B: run "download_llama.bat official" to use the official Meta repo with your Hugging Face token.
  pause
  exit /b 1
)
echo.
echo DONE. You can now use Text-to-Motion in Phane.
pause
exit /b 0

:official
REM FIRST: accept Meta's license at https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct and wait until you are approved.
venv\Scripts\hf.exe auth whoami >nul 2>&1
if not errorlevel 1 goto download
echo A small window opened: paste your Hugging Face token there and click Save.
venv\Scripts\python.exe puente\login_hf.py
if errorlevel 2 (
  echo.
  echo Your token was saved, but Meta has not approved your Llama 3 access yet. Run this file again once you are approved.
  pause
  exit /b 2
)
if errorlevel 1 (
  echo.
  echo No token was saved. Run this file again to retry.
  pause
  exit /b 1
)
:download
echo.
echo Downloading Llama-3-8B-Instruct (16 GB) from the official Meta repo. Do not close this window.
venv\Scripts\hf.exe download meta-llama/Meta-Llama-3-8B-Instruct --include "*.json" "*.safetensors" "tokenizer*"
if errorlevel 1 (
  echo.
  echo Download failed. Most common cause: Meta has not approved your access yet. Check the model page
  echo (https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct) and run this file again once it says you have access.
  echo Or just run download_llama.bat without arguments: it uses the open mirror, no token needed.
) else (
  echo.
  echo DONE. You can now use Text-to-Motion in Phane.
)
pause
