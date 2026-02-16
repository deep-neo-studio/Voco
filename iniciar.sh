#!/bin/bash
# Lanzador de la interfaz web

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="$SCRIPT_DIR/venv/bin/python"

if [ ! -f "$VENV_PYTHON" ]; then
    echo "❌ Entorno virtual no encontrado. Creando..."
    python3 -m venv "$SCRIPT_DIR/venv"
    "$SCRIPT_DIR/venv/bin/pip" install edge-tts pypdf2 flask flask-cors -q
    echo "✅ Dependencias instaladas"
fi

echo ""
echo "🎧 Conversor de Audiolibros"
echo "   Abriendo http://localhost:5000"
echo ""

# Abrir navegador automáticamente después de 2 segundos
(sleep 2 && xdg-open http://localhost:5000 2>/dev/null) &

"$VENV_PYTHON" "$SCRIPT_DIR/app.py"
