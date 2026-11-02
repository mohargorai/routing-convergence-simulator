@echo off
echo ============================================================
echo Starting Interactive Routing Convergence Simulator
echo ============================================================
cd /d "%~dp0"
if exist "venv\Scripts\python.exe" (
    venv\Scripts\python.exe run_server.py
) else (
    py run_server.py
)
pause

