@echo off
echo =======================================================
echo    Compilador de Voco para Windows (Ejecutable .exe)
echo =======================================================
echo.
echo Este script creara un ejecutable de Voco para tu PC.
echo Asegurate de tener Python instalado (https://www.python.org/downloads/)
echo.
pause

echo Inicializando entorno virtual...
python -m venv venv
call venv\Scripts\activate

echo.
echo Instalando dependencias necesarias...
pip install -r requirements.txt
pip install pyinstaller

echo.
echo Generando ejecutable (esto puede tardar unos minutos)...
pyinstaller --name Voco --add-data "templates;templates" --add-data "static;static" --hidden-import edge_tts --hidden-import PyPDF2 --noconsole --onefile launcher.py

echo.
echo =======================================================
echo Proceso completado. Tu archivo ejecutable 'Voco.exe' 
echo se encuentra adentro de la carpeta 'dist'.
echo =======================================================
pause
