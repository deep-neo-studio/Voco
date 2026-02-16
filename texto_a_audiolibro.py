#!/usr/bin/env python3
"""
Conversor de Libros a Audiolibros usando Microsoft Edge TTS
============================================================
Convierte archivos .txt o .pdf en audiolibros MP3 divididos por capítulos.
"""

import asyncio
import re
import os
import argparse
from pathlib import Path

try:
    import edge_tts
except ImportError:
    print("❌ Error: edge-tts no está instalado.")
    print("   Instálalo con: pip install edge-tts --user")
    exit(1)

# Voces recomendadas (masculinas por defecto)
VOCES = {
    "alvaro": "es-ES-AlvaroNeural",      # España - Masculina
    "alonso": "es-US-AlonsoNeural",      # EE.UU. - Masculina (neutro)
    "dalia": "es-MX-DaliaNeural",        # México - Femenina
    "jorge": "es-MX-JorgeNeural",        # México - Masculina
}

VOZ_DEFECTO = "jorge"


def extraer_texto_pdf(ruta_pdf: str) -> str:
    """Extrae texto de un archivo PDF."""
    try:
        from PyPDF2 import PdfReader
    except ImportError:
        print("❌ Error: PyPDF2 no está instalado.")
        print("   Instálalo con: pip install pypdf2 --user")
        exit(1)
    
    print(f"📄 Leyendo PDF: {ruta_pdf}")
    reader = PdfReader(ruta_pdf)
    texto = ""
    for i, pagina in enumerate(reader.pages):
        texto += pagina.extract_text() or ""
        if (i + 1) % 50 == 0:
            print(f"   Procesadas {i + 1}/{len(reader.pages)} páginas...")
    
    print(f"   ✔ Total: {len(reader.pages)} páginas extraídas")
    return texto


def leer_archivo(ruta: str) -> str:
    """Lee el contenido de un archivo .txt o .pdf."""
    ruta = Path(ruta)
    
    if ruta.suffix.lower() == ".pdf":
        return extraer_texto_pdf(str(ruta))
    elif ruta.suffix.lower() == ".txt":
        print(f"📄 Leyendo TXT: {ruta}")
        with open(ruta, "r", encoding="utf-8") as f:
            return f.read()
    else:
        print(f"❌ Formato no soportado: {ruta.suffix}")
        print("   Usa archivos .txt o .pdf")
        exit(1)


def dividir_por_capitulos(texto: str) -> list[tuple[str, str]]:
    """
    Divide el texto en capítulos.
    Detecta patrones como: CAPÍTULO 1, Capítulo 401, CAPITULO X, etc.
    
    Retorna: Lista de tuplas (nombre_capitulo, contenido)
    """
    # Patrón para detectar capítulos (flexible con acentos y números)
    patron = r'(CAP[ÍI]TULO\s+\d+)'
    
    # Buscar todas las coincidencias
    matches = list(re.finditer(patron, texto, re.IGNORECASE))
    
    if not matches:
        print("⚠️  No se encontraron capítulos. Se procesará como un solo archivo.")
        return [("completo", texto)]
    
    capitulos = []
    
    for i, match in enumerate(matches):
        nombre = match.group(1).strip()
        inicio = match.end()
        
        # El final es el inicio del siguiente capítulo o el final del texto
        if i + 1 < len(matches):
            fin = matches[i + 1].start()
        else:
            fin = len(texto)
        
        contenido = texto[inicio:fin].strip()
        
        # Limpiar el nombre para usarlo como archivo
        nombre_limpio = re.sub(r'[^\w\s]', '', nombre)
        nombre_limpio = nombre_limpio.replace(' ', '_').lower()
        
        capitulos.append((nombre_limpio, contenido))
    
    print(f"📚 Encontrados {len(capitulos)} capítulos")
    return capitulos


def limpiar_texto_para_voz(texto: str) -> str:
    """Limpia el texto para mejor pronunciación."""
    # Eliminar saltos de línea múltiples
    texto = re.sub(r'\n{3,}', '\n\n', texto)
    
    # Reemplazar guiones de diálogo por pausas
    texto = re.sub(r'—', ', ', texto)
    texto = re.sub(r'–', ', ', texto)
    
    # Eliminar caracteres extraños pero mantener puntuación
    texto = re.sub(r'[^\w\s.,;:!?¿¡\'\"()áéíóúüñÁÉÍÓÚÜÑ\-]', ' ', texto)
    
    # Eliminar espacios múltiples
    texto = re.sub(r' +', ' ', texto)
    
    return texto.strip()


async def texto_a_audio(texto: str, archivo_salida: str, voz: str):
    """Convierte texto a audio usando edge-tts."""
    communicate = edge_tts.Communicate(texto, voz)
    await communicate.save(archivo_salida)


async def procesar_capitulo(
    numero: int, 
    nombre: str, 
    contenido: str, 
    carpeta_salida: Path, 
    voz: str,
    total_capitulos: int
):
    """Procesa un capítulo individual."""
    # Limpiar contenido
    contenido_limpio = limpiar_texto_para_voz(contenido)
    
    if len(contenido_limpio) < 50:
        print(f"   ⚠️  Capítulo {numero} muy corto, omitiendo...")
        return False
    
    # Nombre del archivo de salida
    archivo_salida = carpeta_salida / f"capitulo_{numero:03d}_{nombre}.mp3"
    
    print(f"   🎙️  [{numero}/{total_capitulos}] Convirtiendo: {nombre}")
    print(f"       Caracteres: {len(contenido_limpio):,}")
    
    try:
        await texto_a_audio(contenido_limpio, str(archivo_salida), voz)
        print(f"       ✔ Guardado: {archivo_salida.name}")
        return True
    except Exception as e:
        print(f"       ❌ Error: {e}")
        return False


async def convertir_libro(
    ruta_entrada: str, 
    carpeta_salida: str = None, 
    voz: str = VOZ_DEFECTO
):
    """Función principal de conversión."""
    ruta_entrada = Path(ruta_entrada)
    
    if not ruta_entrada.exists():
        print(f"❌ Archivo no encontrado: {ruta_entrada}")
        return
    
    # Configurar carpeta de salida
    if carpeta_salida:
        carpeta_salida = Path(carpeta_salida)
    else:
        carpeta_salida = ruta_entrada.parent / f"{ruta_entrada.stem}_audiolibro"
    
    carpeta_salida.mkdir(parents=True, exist_ok=True)
    print(f"📁 Carpeta de salida: {carpeta_salida}")
    
    # Obtener voz
    voz_id = VOCES.get(voz.lower(), voz)
    print(f"🗣️  Voz seleccionada: {voz_id}")
    
    # Leer y procesar texto
    texto = leer_archivo(str(ruta_entrada))
    capitulos = dividir_por_capitulos(texto)
    
    # Procesar cada capítulo
    print("\n🎵 Iniciando conversión a audio...\n")
    
    exitosos = 0
    for i, (nombre, contenido) in enumerate(capitulos, 1):
        resultado = await procesar_capitulo(
            i, nombre, contenido, carpeta_salida, voz_id, len(capitulos)
        )
        if resultado:
            exitosos += 1
    
    print(f"\n✅ Conversión completada!")
    print(f"   Capítulos procesados: {exitosos}/{len(capitulos)}")
    print(f"   Ubicación: {carpeta_salida}")


def listar_voces():
    """Muestra las voces disponibles."""
    print("\n🗣️  Voces disponibles:\n")
    for nombre, voz_id in VOCES.items():
        marca = "⭐" if nombre == VOZ_DEFECTO else "  "
        print(f"   {marca} {nombre:10} → {voz_id}")
    print(f"\n   ⭐ = voz por defecto")


def main():
    parser = argparse.ArgumentParser(
        description="Convierte libros (.txt/.pdf) a audiolibros MP3",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python texto_a_audiolibro.py libro.pdf
  python texto_a_audiolibro.py libro.txt --voz alonso
  python texto_a_audiolibro.py libro.pdf --salida ./mis_audiolibros
  python texto_a_audiolibro.py --voces
        """
    )
    
    parser.add_argument(
        "archivo", 
        nargs="?",
        help="Archivo de entrada (.txt o .pdf)"
    )
    parser.add_argument(
        "--voz", "-v",
        default=VOZ_DEFECTO,
        help=f"Voz a usar (defecto: {VOZ_DEFECTO})"
    )
    parser.add_argument(
        "--salida", "-o",
        help="Carpeta de salida (defecto: [nombre]_audiolibro/)"
    )
    parser.add_argument(
        "--voces",
        action="store_true",
        help="Listar voces disponibles"
    )
    
    args = parser.parse_args()
    
    if args.voces:
        listar_voces()
        return
    
    if not args.archivo:
        parser.print_help()
        print("\n❌ Error: Debes especificar un archivo de entrada")
        return
    
    print("=" * 60)
    print("🎧 CONVERSOR DE LIBROS A AUDIOLIBROS")
    print("   Usando Microsoft Edge Neural TTS")
    print("=" * 60 + "\n")
    
    asyncio.run(convertir_libro(
        args.archivo,
        args.salida,
        args.voz
    ))


if __name__ == "__main__":
    main()
