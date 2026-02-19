#!/data/data/com.termux/files/usr/bin/bash

echo "🚀 Iniciando instalación de Voco para Android (Termux)..."

# 1. Actualizar repositorios
echo "📦 Actualizando paquetes..."
pkg update -y && pkg upgrade -y

# 2. Instalar Python y dependencias del sistema
echo "🐍 Instalando Python y herramientas..."
pkg install python build-essential libxml2 libxslt pandoc -y

# 3. Instalar librerías de Python
echo "📚 Instalando librerías pip..."
pip install --upgrade pip
pip install flask flask-cors edge-tts PyPDF2

echo "✅ ¡Instalación completada!"
echo ""
echo "Para iniciar el servidor, ejecuta:"
echo "python app.py"
