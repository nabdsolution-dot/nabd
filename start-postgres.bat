@echo off
REM Nabd on PostgreSQL. Edit PGPASSWORD below to the password you chose when installing PostgreSQL.
set PGPASSWORD=CHANGE_ME
set PGBIN=C:\Program Files\PostgreSQL\17\bin
cd /d "%~dp0"
if not exist "%PGBIN%\psql.exe" ( echo Edit PGBIN in this file to your PostgreSQL bin folder. & pause & exit /b 1 )
"%PGBIN%\psql.exe" -U postgres -h localhost -tc "select 1 from pg_database where datname='nabd'" | findstr 1 >nul || "%PGBIN%\createdb.exe" -U postgres -h localhost nabd
set DATABASE_URL=postgres://postgres:%PGPASSWORD%@localhost:5432/nabd
if not exist server\node_modules ( pushd server & call npm install & popd )
if not exist backoffice\node_modules ( pushd backoffice & call npm install & popd )
if not exist backoffice\dist\index.html ( pushd backoffice & call npm run build & popd )
start "" http://localhost:4000/
cd server
call npm run local
pause
