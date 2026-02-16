#!/bin/bash
# Script auxiliar para ejecutar el conversor de audiolibros

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="$SCRIPT_DIR/venv/bin/python"

if [ ! -f "$VENV_PYTHON" ]; then
    echo "❌ Entorno virtual no encontrado. Creando..."
    python3 -m venv "$SCRIPT_DIR/venv"
    "$SCRIPT_DIR/venv/bin/pip" install edge-tts pypdf2 -q
    echo "✅ Dependencias instaladas"
fi

"$VENV_PYTHON" "$SCRIPT_DIR/texto_a_audiolibro.py" "$@"
