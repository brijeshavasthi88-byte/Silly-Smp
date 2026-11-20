@echo off
title Silly SMP Website
cd /d "%~dp0"
start "" http://localhost:3000
node server.js
pause
