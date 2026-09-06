@echo off
setlocal EnableExtensions
cd /d "%~dp0"

set PORT=5173
set URL=http://localhost:%PORT%/

if not exist "node_modules" (
    echo [start] node_modules missing, running npm install...
    call npm.cmd install
    if errorlevel 1 (
        echo [start] npm install failed.
        echo [start] Press any key to close this window.
        pause >nul
        exit /b 1
    )
)

rem If the dev server is already running, just open the browser and stay visible.
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
    echo [start] dev server already running at %URL%
    start "" "%URL%"
    echo [start] Press any key to close this window.
    pause >nul
    exit /b 0
)

echo [start] starting dev server at %URL%
echo [start] keep this window open while using the app; close it to stop the server.

rem Open the browser a few seconds after the server boots.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process '%URL%'"

npm.cmd run dev -- --port %PORT% --strictPort
if errorlevel 1 (
    echo [start] dev server exited with an error, see the log above.
    echo [start] Press any key to close this window.
    pause >nul
    exit /b 1
)

echo [start] dev server stopped.
echo [start] Press any key to close this window.
pause >nul
exit /b 0
