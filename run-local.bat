@echo off
chcp 65001 >nul
rem Runs the tool on this PC (needs Python). Close this window to stop the server.
cd /d "%~dp0"
netstat -ano | findstr /R /C:"127.0.0.1:8765 .*LISTENING" >nul
if %errorlevel%==0 (
  echo 서버가 이미 실행 중입니다. 브라우저만 엽니다.
  start "" http://127.0.0.1:8765/
  timeout /t 3 >nul
  exit /b
)
echo 정격하중표 도구 서버를 시작합니다. 이 창을 닫으면 종료됩니다.
start "" cmd /c "timeout /t 1 >nul & start http://127.0.0.1:8765/"
python "%~dp0tools\serve.py" 8765
