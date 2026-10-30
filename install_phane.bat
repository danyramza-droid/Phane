@echo off
setlocal
rem Phane one-click setup for the ComfyUI Windows portable build.
rem Double-click this file inside ComfyUI_windows_portable\ComfyUI\custom_nodes\phane
rem It installs the node packs Phane uses (at the tested commits) and puts run_phane.bat next to run_nvidia_gpu.bat.
rem Close ComfyUI before running it.

if defined PHANE_ROOT (set "ROOT=%PHANE_ROOT%") else (set "ROOT=%~dp0..\..\..")
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "PY=%ROOT%\python_embeded\python.exe"

echo.
echo  ==== Phane setup ====
echo  ComfyUI folder: %ROOT%
echo.
if not exist "%PY%" (
  echo  Could not find %PY%
  echo  This file is for the ComfyUI Windows portable build. Put the phane folder in
  echo  ComfyUI_windows_portable\ComfyUI\custom_nodes and run it again.
  echo  Manual install of ComfyUI? Follow the Install section of README.md instead.
  goto :end
)

set "EXTRA="
choice /C YN /N /M " Also install the sound and voice packs (MMAudio, Chatterbox, Qwen3-TTS)? [Y/N] "
if errorlevel 2 (set "EXTRA=") else (set "EXTRA=--all")
if defined PHANE_DRYRUN set "EXTRA=%EXTRA% --list"

echo.
echo  [1/3] Node packs...
"%PY%" -I "%~dp0tools\install_nodes.py" %EXTRA%
if errorlevel 1 (
  echo.
  echo  Some packs had problems ^(see above^). If it says "Access is denied", close ComfyUI and run this again.
  goto :end
)

echo.
echo  [2/3] Phane's own Python packages...
if defined PHANE_DRYRUN (echo  would run: pip install -r requirements.txt) else ("%PY%" -s -m pip install -r "%~dp0requirements.txt")

echo.
echo  [3/3] Launcher...
copy /Y "%~dp0run_phane.bat" "%ROOT%\run_phane.bat" >nul && echo  Created %ROOT%\run_phane.bat

echo.
echo  Kimodo powers text to 3D motion and Game. It installs into its own folder and needs Python 3.12 ^(py launcher^),
echo  git and about 25 GB. You can also do it later from Phane ^(Install Kimodo^) or with kimodo\install_kimodo.bat.
choice /C YN /N /M " Install Kimodo now? [Y/N] "
if errorlevel 2 goto :done
if defined PHANE_DRYRUN (echo  would run: kimodo\install_kimodo.bat) else (call "%~dp0kimodo\install_kimodo.bat")

:done
echo.
echo  ==== Done ====
echo  Start ComfyUI with run_phane.bat ^(in %ROOT%^).
echo  Your browser opens http://127.0.0.1:8188/phane/simple by itself; the first time, press "Set up Phane"
echo  to download the models.
:end
echo.
pause
