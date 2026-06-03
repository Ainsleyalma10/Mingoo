@echo off
REM MingooLive Network Setup Script for Windows
REM This script helps configure MingooLive for local network access

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║     MingooLive Local Network Setup                          ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Get local IP address
echo Finding your local IP address...
echo.

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /C:"IPv4 Address"') do (
    set "ip=%%a"
    set "ip=!ip:~1!"
)

if defined ip (
    echo ✓ Found IP Address: %ip%
) else (
    echo ✗ Could not find IP address
    echo Please run 'ipconfig' manually to find your IPv4 address
    pause
    exit /b 1
)

echo.
echo Your MingooLive will be accessible at:
echo   • Local:   http://localhost:3000
echo   • Network: http://%ip%:3000
echo.

REM Check if .env exists
if exist .env (
    echo ✓ Found .env file
    echo.
    echo Current ALLOWED_ORIGINS:
    for /f "tokens=*" %%a in ('findstr "ALLOWED_ORIGINS" .env') do echo   %%a
    echo.
) else (
    echo ✗ .env file not found
    echo Please create .env file first
    pause
    exit /b 1
)

echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║  Next Steps:                                               ║
echo ║  1. Update .env file with your IP address                 ║
echo ║  2. Add this line to ALLOWED_ORIGINS:                     ║
echo ║     http://%ip%:3000                                       ║
echo ║  3. Save .env file                                        ║
echo ║  4. Restart the server (npm start)                        ║
echo ║  5. Access from other device: http://%ip%:3000            ║
echo ╚════════════════════════════════════════════════════════════╝
echo.

REM Ask if user wants to edit .env
set /p edit="Do you want to edit .env now? (y/n): "
if /i "%edit%"=="y" (
    start notepad .env
    echo Opening .env in Notepad...
    echo Please update ALLOWED_ORIGINS and save
    pause
) else (
    echo.
    echo Remember to update .env manually before restarting the server
    pause
)

echo.
echo Setup complete! 
echo Restart your server with: npm start
echo.
pause
