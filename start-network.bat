@echo off
REM Nabd on your Wi-Fi: phones and tablets can reach this computer. Allow it in the Windows Firewall prompt (Private networks).
set HOST=0.0.0.0
cd /d "%~dp0"
if not exist server\node_modules ( echo Installing server... & pushd server & call npm install & popd )
if not exist backoffice\node_modules ( echo Installing back office... & pushd backoffice & call npm install & popd )
if not exist backoffice\dist\index.html ( echo Building... & pushd backoffice & call npm run build & popd )
start "" http://localhost:4000/
cd server
call npm run local
pause
