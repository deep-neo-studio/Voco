#!/usr/bin/env python3
"""
Interfaz Web para el Conversor de Audiolibros
=============================================
Aplicación Flask con interfaz moderna para convertir libros a audiolibros.
Soporta: TXT, PDF, EPUB
"""

import asyncio
import os
import re
import subprocess
import threading
import uuid
from pathlib import Path

from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename

try:
    import edge_tts
except ImportError:
    print("❌ Instala edge-tts: pip install edge-tts")
    exit(1)

app = Flask(__name__)
CORS(app)
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max
app.config['UPLOAD_FOLDER'] = Path(__file__).parent / 'uploads'
app.config['OUTPUT_FOLDER'] = Path(__file__).parent / 'output'

# Crear carpetas necesarias
app.config['UPLOAD_FOLDER'].mkdir(exist_ok=True)
app.config['OUTPUT_FOLDER'].mkdir(exist_ok=True)

# Estado de las conversiones y archivos analizados
conversiones = {}
archivos_analizados = {}

# Voces legacy (defaults para español)
VOCES = {
    "alvaro": {"id": "es-ES-AlvaroNeural", "nombre": "Álvaro", "region": "España", "genero": "Masculino"},
    "alonso": {"id": "es-US-AlonsoNeural", "nombre": "Alonso", "region": "EE.UU.", "genero": "Masculino"},
    "jorge": {"id": "es-MX-JorgeNeural", "nombre": "Jorge", "region": "México", "genero": "Masculino"},
    "dalia": {"id": "es-MX-DaliaNeural", "nombre": "Dalia", "region": "México", "genero": "Femenino"},
}

# --- Cache de voces multi-idioma ---
_voces_cache = None
_idiomas_cache = None

NOMBRES_IDIOMAS = {
    'af': 'Afrikáans', 'sq': 'Albanés', 'am': 'Amárico', 'ar': 'Árabe',
    'az': 'Azerbaiyano', 'bn': 'Bengalí', 'bs': 'Bosnio', 'bg': 'Búlgaro',
    'my': 'Birmano', 'ca': 'Catalán', 'zh': 'Chino', 'hr': 'Croata',
    'cs': 'Checo', 'da': 'Danés', 'nl': 'Neerlandés', 'en': 'Inglés',
    'et': 'Estonio', 'fil': 'Filipino', 'fi': 'Finlandés', 'fr': 'Francés',
    'gl': 'Gallego', 'ka': 'Georgiano', 'de': 'Alemán', 'el': 'Griego',
    'gu': 'Guyaratí', 'he': 'Hebreo', 'hi': 'Hindi', 'hu': 'Húngaro',
    'is': 'Islandés', 'id': 'Indonesio', 'ga': 'Irlandés', 'it': 'Italiano',
    'ja': 'Japonés', 'jv': 'Javanés', 'kn': 'Canarés', 'kk': 'Kazajo',
    'km': 'Jemer', 'ko': 'Coreano', 'lo': 'Laosiano', 'lv': 'Letón',
    'lt': 'Lituano', 'mk': 'Macedonio', 'ms': 'Malayo', 'ml': 'Malabar',
    'mt': 'Maltés', 'mn': 'Mongol', 'ne': 'Nepalí', 'nb': 'Noruego',
    'ps': 'Pastún', 'fa': 'Persa', 'pl': 'Polaco', 'pt': 'Portugués',
    'ro': 'Rumano', 'ru': 'Ruso', 'sr': 'Serbio', 'si': 'Cingalés',
    'sk': 'Eslovaco', 'sl': 'Esloveno', 'so': 'Somalí', 'es': 'Español',
    'su': 'Sundanés', 'sw': 'Suajili', 'sv': 'Sueco', 'ta': 'Tamil',
    'te': 'Telugu', 'th': 'Tailandés', 'tr': 'Turco', 'uk': 'Ucraniano',
    'ur': 'Urdu', 'uz': 'Uzbeko', 'vi': 'Vietnamita', 'cy': 'Galés',
    'zu': 'Zulú', 'iu': 'Inuktitut',
}

NOMBRES_REGIONES = {
    'AR': 'Argentina', 'AU': 'Australia', 'AT': 'Austria', 'BD': 'Bangladés',
    'BE': 'Bélgica', 'BO': 'Bolivia', 'BR': 'Brasil', 'CA': 'Canadá',
    'CL': 'Chile', 'CN': 'China', 'CO': 'Colombia', 'CR': 'Costa Rica',
    'CU': 'Cuba', 'DE': 'Alemania', 'DK': 'Dinamarca', 'DO': 'Rep. Dominicana',
    'DZ': 'Argelia', 'EC': 'Ecuador', 'EG': 'Egipto', 'ES': 'España',
    'FR': 'Francia', 'GB': 'Reino Unido', 'GQ': 'Guinea Ecuatorial',
    'GT': 'Guatemala', 'HK': 'Hong Kong', 'HN': 'Honduras', 'IE': 'Irlanda',
    'IN': 'India', 'IQ': 'Irak', 'IT': 'Italia', 'JP': 'Japón',
    'KE': 'Kenia', 'KR': 'Corea del Sur', 'LK': 'Sri Lanka',
    'MX': 'México', 'MY': 'Malasia', 'NG': 'Nigeria', 'NI': 'Nicaragua',
    'NL': 'Países Bajos', 'NZ': 'Nueva Zelanda', 'PA': 'Panamá',
    'PE': 'Perú', 'PH': 'Filipinas', 'PK': 'Pakistán', 'PL': 'Polonia',
    'PR': 'Puerto Rico', 'PT': 'Portugal', 'PY': 'Paraguay', 'RU': 'Rusia',
    'SA': 'Arabia Saudita', 'SG': 'Singapur', 'SV': 'El Salvador',
    'TW': 'Taiwán', 'TZ': 'Tanzania', 'UA': 'Ucrania', 'US': 'Estados Unidos',
    'UY': 'Uruguay', 'VE': 'Venezuela', 'ZA': 'Sudáfrica',
    'CH': 'Suiza', 'SE': 'Suecia', 'BH': 'Bahréin', 'JO': 'Jordania',
    'KW': 'Kuwait', 'LB': 'Líbano', 'LY': 'Libia', 'MA': 'Marruecos',
    'OM': 'Omán', 'QA': 'Catar', 'SY': 'Siria', 'TN': 'Túnez',
    'YE': 'Yemen', 'AE': 'Emiratos Árabes',
}


def _obtener_voces_edge():
    """Obtiene y cachea todas las voces de edge-tts."""
    global _voces_cache, _idiomas_cache
    if _voces_cache is not None:
        return _voces_cache, _idiomas_cache

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        todas = loop.run_until_complete(edge_tts.list_voices())
    finally:
        loop.close()

    # Agrupar por locale
    por_locale = {}
    idiomas = {}

    for v in todas:
        locale = v['Locale']
        parts = locale.split('-')
        lang_code = parts[0]
        region_code = parts[1] if len(parts) >= 2 else ''

        nombre_voz = v['ShortName'].split('-')[-1].replace('Neural', '')
        region_nombre = NOMBRES_REGIONES.get(region_code, region_code)

        if locale not in por_locale:
            por_locale[locale] = []

        por_locale[locale].append({
            'id': v['ShortName'],
            'nombre': nombre_voz,
            'region': region_nombre,
            'genero': 'Masculino' if v['Gender'] == 'Male' else 'Femenino',
            'locale': locale
        })

        if lang_code not in idiomas:
            idiomas[lang_code] = {
                'codigo': lang_code,
                'nombre': NOMBRES_IDIOMAS.get(lang_code, lang_code),
                'locales': []
            }

        if locale not in [l['codigo'] for l in idiomas[lang_code]['locales']]:
            idiomas[lang_code]['locales'].append({
                'codigo': locale,
                'nombre': f"{NOMBRES_IDIOMAS.get(lang_code, lang_code)} ({region_nombre})",
                'voces_count': len(por_locale[locale])
            })
        else:
            for l in idiomas[lang_code]['locales']:
                if l['codigo'] == locale:
                    l['voces_count'] = len(por_locale[locale])

    _voces_cache = por_locale
    _idiomas_cache = idiomas
    return _voces_cache, _idiomas_cache

EXTENSIONES_PERMITIDAS = {'txt', 'pdf', 'epub'}


def archivo_permitido(nombre):
    return '.' in nombre and nombre.rsplit('.', 1)[1].lower() in EXTENSIONES_PERMITIDAS


def extraer_texto_pdf(ruta):
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(ruta)
        return ''.join(p.extract_text() or '' for p in reader.pages)
    except ImportError:
        raise Exception("PyPDF2 no instalado")


def extraer_texto_epub(ruta):
    """Extrae texto de EPUB usando pandoc."""
    try:
        result = subprocess.run(
            ['pandoc', str(ruta), '-t', 'plain', '--wrap=none'],
            capture_output=True,
            text=True,
            timeout=120
        )
        if result.returncode == 0:
            return result.stdout
        else:
            raise Exception(f"Error pandoc: {result.stderr}")
    except FileNotFoundError:
        raise Exception("Pandoc no instalado. Ejecuta: sudo apt install pandoc")
    except subprocess.TimeoutExpired:
        raise Exception("Timeout al procesar EPUB")


def leer_archivo(ruta):
    ruta = Path(ruta)
    ext = ruta.suffix.lower()
    
    if ext == '.pdf':
        return extraer_texto_pdf(str(ruta))
    elif ext == '.epub':
        return extraer_texto_epub(str(ruta))
    else:  # .txt
        with open(ruta, 'r', encoding='utf-8') as f:
            return f.read()


def dividir_por_capitulos(texto, separador_custom=None):
    """Divide texto por capítulos.
    
    Patrones por defecto: CAPÍTULO X, CAPITULO X, Chapter X, Parte X, etc.
    Si se proporciona separador_custom, se usa ese como patrón de división.
    """
    if separador_custom and separador_custom.strip():
        sep = separador_custom.strip()
        # Escapar para regex y capturar el separador
        patron = f'({re.escape(sep)})'
        matches = list(re.finditer(patron, texto))
    else:
        # Patrones predeterminados ampliados
        patron = r'(CAP[IÍ]TULO\s+\d+|CHAPTER\s+\d+|PARTE\s+\d+|SECCI[OÓ]N\s+\d+|Cap[ií]tulo\s+\d+|Chapter\s+\d+|Parte\s+\d+)'
        matches = list(re.finditer(patron, texto, re.IGNORECASE))
    
    if not matches:
        # Si no hay capítulos, dividir en chunks de ~5000 caracteres
        chunks = []
        texto_limpio = texto.strip()
        chunk_size = 5000
        for i in range(0, len(texto_limpio), chunk_size):
            chunk = texto_limpio[i:i+chunk_size]
            chunks.append((f"parte_{(i//chunk_size)+1:03d}", chunk))
        return chunks if chunks else [("completo", texto)]
    
    capitulos = []
    for i, match in enumerate(matches):
        nombre_original = match.group(1).strip()
        inicio = match.end()
        fin = matches[i + 1].start() if i + 1 < len(matches) else len(texto)
        contenido = texto[inicio:fin].strip()
        nombre_limpio = re.sub(r'[^\w\s]', '', nombre_original).replace(' ', '_').lower()
        
        # Extraer número del capítulo para mostrar bonito
        num_match = re.search(r'\d+', nombre_original)
        num_cap = num_match.group() if num_match else str(i+1)
        
        # Título legible
        if separador_custom:
            titulo = f"Parte {i+1}"
        else:
            titulo = f"Capítulo {num_cap}"
        
        capitulos.append({
            'id': i,
            'nombre': nombre_limpio if nombre_limpio else f'parte_{i+1}',
            'titulo': titulo,
            'chars': len(contenido),
            'contenido': contenido
        })
    
    return capitulos


def limpiar_texto(texto):
    texto = re.sub(r'\n{3,}', '\n\n', texto)
    texto = re.sub(r'[—–]', ', ', texto)
    texto = re.sub(r'[^\w\s.,;:!?¿¡\'\"()áéíóúüñÁÉÍÓÚÜÑ\-]', ' ', texto)
    return re.sub(r' +', ' ', texto).strip()


async def texto_a_audio(texto, archivo, voz):
    communicate = edge_tts.Communicate(texto, voz)
    await communicate.save(archivo)


def procesar_libro(job_id, capitulos_seleccionados, voz_id, carpeta_salida, nombre_libro):
    """Procesa solo los capítulos seleccionados con pausas preventivas."""
    import time
    
    CAPS_ANTES_PAUSA = 15  # Pausar cada 15 capítulos
    DURACION_PAUSA = 90   # Segundos de pausa (1.5 minutos)
    
    try:
        total = len(capitulos_seleccionados)
        conversiones[job_id]['total'] = total
        conversiones[job_id]['estado'] = 'convirtiendo'
        conversiones[job_id]['completados'] = []  # IDs de capítulos ya convertidos
        
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        for idx, cap in enumerate(capitulos_seleccionados, 1):
            conversiones[job_id]['actual'] = idx
            conversiones[job_id]['capitulo'] = cap['titulo']
            
            # Pausa preventiva cada 15 capítulos para evitar rate limiting
            if idx > 1 and (idx - 1) % CAPS_ANTES_PAUSA == 0:
                conversiones[job_id]['estado'] = 'pausando'
                conversiones[job_id]['pausa_restante'] = DURACION_PAUSA
                for seg in range(DURACION_PAUSA, 0, -1):
                    conversiones[job_id]['pausa_restante'] = seg
                    time.sleep(1)
                conversiones[job_id]['estado'] = 'convirtiendo'
            
            contenido_limpio = limpiar_texto(cap['contenido'])
            if len(contenido_limpio) < 50:
                conversiones[job_id]['completados'].append(cap['id'])
                continue
            
            # Nombre: libro_capitulo_X.mp3
            archivo_salida = carpeta_salida / f"{nombre_libro}_{cap['titulo'].lower().replace(' ', '_')}.mp3"
            loop.run_until_complete(texto_a_audio(contenido_limpio, str(archivo_salida), voz_id))
            
            # Marcar como completado
            conversiones[job_id]['completados'].append(cap['id'])
        
        loop.close()
        conversiones[job_id]['estado'] = 'completado'
        conversiones[job_id]['carpeta'] = str(carpeta_salida)
        
    except Exception as e:
        conversiones[job_id]['estado'] = 'error'
        conversiones[job_id]['error'] = str(e)


@app.route('/')
def index():
    return render_template('index.html', voces=VOCES)


@app.route('/idiomas')
def listar_idiomas():
    """Devuelve la lista de idiomas disponibles."""
    _, idiomas = _obtener_voces_edge()
    resultado = []
    for code, info in sorted(idiomas.items(), key=lambda x: x[1]['nombre']):
        resultado.append({
            'codigo': code,
            'nombre': info['nombre'],
            'locales': sorted(info['locales'], key=lambda l: l['nombre'])
        })
    return jsonify(resultado)


@app.route('/voces/<locale>')
def voces_por_locale(locale):
    """Devuelve las voces disponibles para un locale específico."""
    voces, _ = _obtener_voces_edge()
    # Si pasan solo el código de idioma (ej: 'es'), buscar todos los locales
    resultado = []
    for loc_key, loc_voces in voces.items():
        if loc_key == locale or loc_key.startswith(locale + '-'):
            resultado.extend(loc_voces)
    if not resultado:
        return jsonify({'error': f'No se encontraron voces para {locale}'}), 404
    return jsonify(resultado)


@app.route('/analizar', methods=['POST'])
def analizar():
    """Analiza el archivo y devuelve la lista de capítulos."""
    if 'archivo' not in request.files:
        return jsonify({'error': 'No se envió archivo'}), 400
    
    archivo = request.files['archivo']
    if archivo.filename == '':
        return jsonify({'error': 'Archivo vacío'}), 400
    
    if not archivo_permitido(archivo.filename):
        return jsonify({'error': 'Solo archivos .txt, .pdf o .epub'}), 400
    
    # Guardar archivo temporalmente
    file_id = str(uuid.uuid4())[:8]
    nombre_seguro = secure_filename(archivo.filename)
    ruta_archivo = app.config['UPLOAD_FOLDER'] / f"{file_id}_{nombre_seguro}"
    archivo.save(str(ruta_archivo))
    
    try:
        texto = leer_archivo(ruta_archivo)
        capitulos = dividir_por_capitulos(texto)
        
        # Guardar para uso posterior
        archivos_analizados[file_id] = {
            'ruta': str(ruta_archivo),
            'nombre': nombre_seguro,
            'texto': texto,
            'capitulos': capitulos
        }
        
        return _respuesta_capitulos(file_id, nombre_seguro, capitulos)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/re-analizar', methods=['POST'])
def re_analizar():
    """Re-analiza un archivo ya subido con un separador personalizado."""
    data = request.get_json()
    file_id = data.get('file_id')
    separador = data.get('separador', '')
    
    if not file_id or file_id not in archivos_analizados:
        return jsonify({'error': 'Archivo no encontrado. Vuelve a subirlo.'}), 400
    
    info = archivos_analizados[file_id]
    texto = info.get('texto')
    
    if not texto:
        # Re-leer el archivo si no está en cache
        try:
            texto = leer_archivo(info['ruta'])
            info['texto'] = texto
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    capitulos = dividir_por_capitulos(texto, separador_custom=separador if separador else None)
    info['capitulos'] = capitulos
    
    return _respuesta_capitulos(file_id, info['nombre'], capitulos)


def _respuesta_capitulos(file_id, nombre, capitulos):
    """Genera la respuesta JSON para capítulos."""
    caps_info = []
    for cap in capitulos:
        if isinstance(cap, dict):
            caps_info.append({
                'id': cap['id'],
                'titulo': cap['titulo'],
                'chars': cap['chars']
            })
        else:
            caps_info.append({
                'id': 0,
                'titulo': cap[0],
                'chars': len(cap[1])
            })
    
    return jsonify({
        'file_id': file_id,
        'nombre': nombre,
        'capitulos': caps_info,
        'total': len(caps_info)
    })


@app.route('/convertir', methods=['POST'])
def convertir():
    """Inicia conversión de capítulos seleccionados."""
    data = request.get_json()
    
    file_id = data.get('file_id')
    voz = data.get('voz', 'jorge')
    voz_id_directa = data.get('voz_id')  # ShortName directo de edge-tts
    capitulos_ids = data.get('capitulos', [])  # Lista de IDs de capítulos
    
    if file_id not in archivos_analizados:
        return jsonify({'error': 'Archivo no encontrado. Vuelve a subirlo.'}), 400
    
    # Determinar voz: prioridad a voz_id directa
    if voz_id_directa:
        voz_id = voz_id_directa
        voz_nombre = voz_id_directa.split('-')[-1].replace('Neural', '')
    elif voz in VOCES:
        voz_id = VOCES[voz]['id']
        voz_nombre = VOCES[voz]['nombre']
    else:
        voz_id = VOCES['jorge']['id']
        voz_nombre = 'Jorge'
    
    archivo_info = archivos_analizados[file_id]
    
    # Filtrar capítulos seleccionados
    todos_caps = archivo_info['capitulos']
    if capitulos_ids:
        capitulos_seleccionados = [c for c in todos_caps if isinstance(c, dict) and c['id'] in capitulos_ids]
    else:
        capitulos_seleccionados = [c for c in todos_caps if isinstance(c, dict)]
    
    if not capitulos_seleccionados:
        return jsonify({'error': 'No hay capítulos para convertir'}), 400
    
    # Crear job
    job_id = str(uuid.uuid4())[:8]
    nombre_base = Path(archivo_info['nombre']).stem
    carpeta_salida = app.config['OUTPUT_FOLDER'] / f"{job_id}_{nombre_base}"
    carpeta_salida.mkdir(exist_ok=True)
    
    conversiones[job_id] = {
        'estado': 'iniciando',
        'total': len(capitulos_seleccionados),
        'actual': 0,
        'capitulo': '',
        'voz': voz_nombre
    }
    
    thread = threading.Thread(
        target=procesar_libro,
        args=(job_id, capitulos_seleccionados, voz_id, carpeta_salida, nombre_base)
    )
    thread.start()
    
    return jsonify({'job_id': job_id})


@app.route('/estado/<job_id>')
def estado(job_id):
    if job_id not in conversiones:
        return jsonify({'error': 'Trabajo no encontrado'}), 404
    return jsonify(conversiones[job_id])


@app.route('/descargas/<job_id>')
def listar_descargas(job_id):
    if job_id not in conversiones:
        return jsonify({'error': 'No encontrado'}), 404
    
    carpeta = conversiones[job_id].get('carpeta')
    if not carpeta:
        return jsonify({'archivos': []})
    
    archivos = sorted(Path(carpeta).glob('*.mp3'))
    return jsonify({
        'archivos': [{'nombre': f.name, 'size': f.stat().st_size} for f in archivos]
    })


@app.route('/descargar/<job_id>/<nombre>')
def descargar(job_id, nombre):
    if job_id not in conversiones:
        return "No encontrado", 404
    carpeta = conversiones[job_id].get('carpeta')
    if not carpeta:
        return "No disponible", 404
    return send_from_directory(carpeta, nombre, as_attachment=True)


# Carpeta para muestras de voz
SAMPLES_FOLDER = Path(__file__).parent / 'samples'
SAMPLES_FOLDER.mkdir(exist_ok=True)

TEXTO_MUESTRA = "Hola, soy tu narrador. Así sonará tu audiolibro con esta voz."
TEXTOS_MUESTRA = {
    'es': "Hola, soy tu narrador. Así sonará tu audiolibro con esta voz.",
    'en': "Hello, I am your narrator. This is how your audiobook will sound with this voice.",
    'fr': "Bonjour, je suis votre narrateur. Voici comment votre livre audio sonnera avec cette voix.",
    'de': "Hallo, ich bin Ihr Erzähler. So wird Ihr Hörbuch mit dieser Stimme klingen.",
    'pt': "Olá, eu sou o seu narrador. É assim que o seu audiolivro vai soar com esta voz.",
    'it': "Ciao, sono il tuo narratore. Ecco come suonerà il tuo audiolibro con questa voce.",
    'ja': "こんにちは、ナレーターです。この声であなたのオーディオブックはこのように聞こえます。",
    'ko': "안녕하세요, 내레이터입니다. 이 목소리로 오디오북이 이렇게 들립니다.",
    'zh': "你好，我是你的叙述者。你的有声书用这个声音听起来就是这样。",
    'ru': "Здравствуйте, я ваш рассказчик. Вот как будет звучать ваша аудиокнига с этим голосом.",
    'ar': "مرحبًا، أنا الراوي الخاص بك. هكذا سيبدو كتابك الصوتي بهذا الصوت.",
}


@app.route('/probar-voz/<voz_key>')
def probar_voz(voz_key):
    """Genera y devuelve un audio de muestra para la voz (acepta key legacy o ShortName)."""
    # Determinar el voz_id real
    if voz_key in VOCES:
        voz_id = VOCES[voz_key]['id']
    else:
        # Asumir que es un ShortName directo (ej: en-US-JennyNeural)
        voz_id = voz_key

    # Nombre seguro para el archivo
    safe_name = voz_id.replace('-', '_').lower()
    archivo_muestra = SAMPLES_FOLDER / f"muestra_{safe_name}.mp3"

    if not archivo_muestra.exists():
        # Detectar idioma para el texto de muestra
        lang_code = voz_id.split('-')[0] if '-' in voz_id else 'es'
        texto = TEXTOS_MUESTRA.get(lang_code, TEXTOS_MUESTRA.get('en', TEXTO_MUESTRA))

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(texto_a_audio(texto, str(archivo_muestra), voz_id))
        except Exception as e:
            return jsonify({'error': f'Error al generar muestra: {str(e)}'}), 500
        finally:
            loop.close()

    return send_from_directory(SAMPLES_FOLDER, archivo_muestra.name)


if __name__ == '__main__':
    print("\n🎧 Conversor de Audiolibros")
    print("   Abre http://localhost:5000 en tu navegador\n")
    app.run(debug=True, port=5000, host='0.0.0.0')
