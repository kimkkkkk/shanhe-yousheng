@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel%==0 (
  node server.mjs %*
  exit /b %errorlevel%
)

rem Fallback for the DSH bundled runtime on this machine.
set "DSH_NODE=%LOCALAPPDATA%\dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if exist "%DSH_NODE%" (
  "%DSH_NODE%" server.mjs %*
  exit /b %errorlevel%
)

echo Node.js 20+ not found. Install Node.js or run: python -m http.server 4173
pause
exit /b 1
