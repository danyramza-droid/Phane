@echo off
rem Starts ComfyUI with the flags Phane needs and opens Phane in your browser once the server is up.
rem (Created by custom_nodes\phane\install_phane.bat; lives next to run_nvidia_gpu.bat.)
cd /d "%~dp0"
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 300;$i++){try{Invoke-WebRequest http://127.0.0.1:8188/ -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process 'http://127.0.0.1:8188/phane/simple'; break}catch{Start-Sleep 2}}"
.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --force-fp16 --disable-fast-disk
echo If ComfyUI did not start, update your NVIDIA drivers. A c10.dll error needs https://aka.ms/vc14/vc_redist.x64.exe
pause
