@echo off
title Plataforma de Retenções Tributárias
echo ==========================================================
echo INICIANDO PLATAFORMA DE RETENÇÕES TRIBUTÁRIAS
echo Órgão Federal - Vitória/ES (IN 1234/2012, IN 2110/22, ISS)
echo ==========================================================

start "Backend Ret-Impostos (Porta 3001)" cmd /k "cd /d %~dp0backend && npm run dev"
timeout /t 3 /nobreak >nul
start "Frontend Ret-Impostos (Porta 5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Aplicação iniciada com sucesso!
echo Backend: http://localhost:3001
echo Frontend: http://localhost:5173
echo.
echo Pressione qualquer tecla para abrir o sistema no navegador...
pause >nul
start http://localhost:5173
