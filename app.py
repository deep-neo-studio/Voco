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
import hashlib
import shutil
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
app.config['OUTPUT_FOLDER'] = Path.home() / 'Descargas' / 'Audiolibros'

# Crear carpetas necesarias
app.config['UPLOAD_FOLDER'].mkdir(exist_ok=True)
app.config['OUTPUT_FOLDER'].mkdir(exist_ok=True)

# Caché de audio y configuración de rendimiento
CACHE_DIR = Path(__file__).parent / '.audio_cache'
CACHE_DIR.mkdir(exist_ok=True)
MAX_CONCURRENT = 5      # Conversiones TTS en paralelo
MAX_BLOCK_CHARS = 4000  # Dividir capítulos largos en bloques de este tamaño
MAX_RETRIES = 3         # Reintentos con backoff exponencial

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


def obtener_nombre_seguro(filename):
    """Genera un nombre de archivo seguro soportando caracteres no ASCII y acentos."""
    nombre = secure_filename(filename)
    if not nombre or nombre.startswith('.'):
        stem = Path(filename).stem
        ext = Path(filename).suffix.lower()
        limpio = re.sub(r'[^\w\s\-\.]', '_', stem).strip()
        nombre = f"{limpio}{ext}" if limpio else f"archivo_{uuid.uuid4().hex[:6]}{ext}"
    return nombre


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
            palabras = len(re.findall(r'\b\w+\b', chunk))
            if palabras < 30:
                continue
            chunks.append((f"parte_{(len(chunks))+1:03d}", chunk))
        return chunks if chunks else [("completo", texto)]
    
    capitulos = []
    idx = 0
    for i, match in enumerate(matches):
        nombre_original = match.group(1).strip()
        inicio = match.end()
        fin = matches[i + 1].start() if i + 1 < len(matches) else len(texto)
        contenido = texto[inicio:fin].strip()
        
        # Omitir capítulos vacíos o muy cortos (< 30 palabras: índices, portadas, dedicatorias o títulos sueltos)
        palabras = len(re.findall(r'\b\w+\b', contenido))
        if palabras < 30:
            continue
        
        nombre_limpio = re.sub(r'[^\w\s]', '', nombre_original).replace(' ', '_').lower()
        
        # Extraer número del capítulo para mostrar bonito
        num_match = re.search(r'\d+', nombre_original)
        num_cap = num_match.group() if num_match else str(idx + 1)
        
        # Título legible
        if separador_custom:
            titulo = f"Parte {idx + 1}"
        else:
            titulo = f"Capítulo {num_cap}"
        
        # Estimación de tiempo de audio (locución estándar ~150 palabras por minuto)
        tiempo_estimado_min = round(palabras / 150, 1)
        
        capitulos.append({
            'id': idx,
            'nombre': nombre_limpio if nombre_limpio else f'parte_{idx+1}',
            'titulo': titulo,
            'chars': len(contenido),
            'palabras': palabras,
            'tiempo_estimado_min': tiempo_estimado_min,
            'contenido': contenido
        })
        idx += 1
    
    return capitulos


def limpiar_texto(texto):
    texto = re.sub(r'\n{3,}', '\n\n', texto)
    texto = re.sub(r'[—–]', ', ', texto)
    texto = re.sub(r'[^\w\s.,;:!?¿¡\'\"()áéíóúüñÁÉÍÓÚÜÑ\-]', ' ', texto)
    return re.sub(r' +', ' ', texto).strip()


async def texto_a_audio(texto, archivo, voz):
    communicate = edge_tts.Communicate(texto, voz)
    await communicate.save(archivo)


def _cache_key(texto, voz_id):
    """Genera clave de caché basada en contenido y voz."""
    return hashlib.md5(f"{texto}|{voz_id}".encode()).hexdigest()


def dividir_en_bloques(texto, max_chars=None):
    """Divide texto largo en bloques cortando en límites de oraciones."""
    if max_chars is None:
        max_chars = MAX_BLOCK_CHARS
    if len(texto) <= max_chars:
        return [texto]

    bloques = []
    inicio = 0
    while inicio < len(texto):
        fin = min(inicio + max_chars, len(texto))
        if fin < len(texto):
            # Buscar límite de oración para cortar limpiamente
            for sep in ['. ', '.\n', '? ', '! ', ';\n', '\n\n', ', ']:
                last_sep = texto.rfind(sep, inicio + (max_chars // 2), fin)
                if last_sep > inicio:
                    fin = last_sep + len(sep)
                    break
        bloques.append(texto[inicio:fin])
        inicio = fin
    return bloques


async def _texto_a_audio_retry(texto, archivo, voz, max_intentos=None):
    """Convierte texto a audio con reintentos y backoff exponencial."""
    if max_intentos is None:
        max_intentos = MAX_RETRIES
    for intento in range(max_intentos):
        try:
            communicate = edge_tts.Communicate(texto, voz)
            await communicate.save(archivo)
            return
        except Exception:
            if intento < max_intentos - 1:
                wait_time = 2 ** (intento + 1)  # 2s, 4s, 8s
                await asyncio.sleep(wait_time)
            else:
                raise


async def _convertir_capitulo(cap, voz_id, carpeta_salida_base, nombre_base, job_id, semaphore):
    """Convierte un capítulo individual con control de concurrencia y caché."""
    async with semaphore:
        nombre_archivo_cap = cap.get('archivo_nombre', nombre_base)
        nombre_libro = Path(nombre_archivo_cap).stem
        nombre_libro_limpio = re.sub(r'[^\w\s\-\.]', '_', nombre_libro).strip()

        conversiones[job_id]['capitulo'] = f"{nombre_libro_limpio} / {cap['titulo']}"

        contenido_limpio = limpiar_texto(cap['contenido'])
        if len(contenido_limpio) < 50:
            conversiones[job_id]['completados'].append(cap['id'])
            conversiones[job_id]['actual'] = len(conversiones[job_id]['completados'])
            return

        # Verificar caché
        cache_key = _cache_key(contenido_limpio, voz_id)
        cache_file = CACHE_DIR / f"{cache_key}.mp3"

        carpeta_destino = carpeta_salida_base / nombre_libro_limpio
        carpeta_destino.mkdir(parents=True, exist_ok=True)

        titulo_limpio = cap['titulo'].lower().replace(' ', '_')
        titulo_limpio = re.sub(r'[^\w\s\-\.]', '_', titulo_limpio)
        archivo_salida = carpeta_destino / f"{nombre_libro_limpio}_{titulo_limpio}.mp3"

        if cache_file.exists():
            # Usar versión cacheada (instantáneo)
            shutil.copy2(str(cache_file), str(archivo_salida))
        else:
            # Dividir en bloques si es muy largo para edge-tts
            bloques = dividir_en_bloques(contenido_limpio)

            if len(bloques) == 1:
                await _texto_a_audio_retry(contenido_limpio, str(archivo_salida), voz_id)
            else:
                # Convertir bloques secuencialmente y concatenar
                temp_files = []
                try:
                    for i, bloque in enumerate(bloques):
                        temp_file = carpeta_destino / f".tmp_{cap['id']}_{i}.mp3"
                        temp_files.append(temp_file)
                        await _texto_a_audio_retry(bloque, str(temp_file), voz_id)

                    # Concatenar MP3 (los frames MP3 son independientes)
                    with open(str(archivo_salida), 'wb') as outfile:
                        for tf in temp_files:
                            with open(str(tf), 'rb') as infile:
                                outfile.write(infile.read())
                finally:
                    for tf in temp_files:
                        try:
                            tf.unlink()
                        except Exception:
                            pass

            # Guardar en caché para futuras conversiones
            try:
                shutil.copy2(str(archivo_salida), str(cache_file))
            except Exception:
                pass

        # Actualizar progreso
        conversiones[job_id]['completados'].append(cap['id'])
        conversiones[job_id]['actual'] = len(conversiones[job_id]['completados'])


def procesar_libro(job_id, capitulos_seleccionados, voz_id, carpeta_salida_base, nombre_base):
    """Procesa capítulos con conversión paralela, reintentos inteligentes y caché."""
    try:
        total = len(capitulos_seleccionados)
        conversiones[job_id]['total'] = total
        conversiones[job_id]['estado'] = 'convirtiendo'
        conversiones[job_id]['completados'] = []

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        async def _procesar_todos():
            semaphore = asyncio.Semaphore(MAX_CONCURRENT)
            tasks = [
                asyncio.create_task(
                    _convertir_capitulo(cap, voz_id, carpeta_salida_base, nombre_base, job_id, semaphore)
                )
                for cap in capitulos_seleccionados
            ]
            # return_exceptions=True para no abortar todo si falla un capítulo
            results = await asyncio.gather(*tasks, return_exceptions=True)
            errores = []
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    errores.append(f"{capitulos_seleccionados[i].get('titulo', i)}: {result}")
            if errores:
                conversiones[job_id]['errores_parciales'] = errores

        loop.run_until_complete(_procesar_todos())
        loop.close()

        conversiones[job_id]['estado'] = 'completado'
        conversiones[job_id]['carpeta'] = str(carpeta_salida_base)

    except Exception as e:
        conversiones[job_id]['estado'] = 'error'
        conversiones[job_id]['error'] = str(e)


@app.route('/ping')
def ping():
    """Endpoint para verificar conexión desde el celular."""
    return jsonify({"status": "ok", "message": "Voco Server Online", "version": "1.0.0"})


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
    """Analiza múltiples archivos o tomos y devuelve la lista de capítulos combinada sin colisiones."""
    archivos = request.files.getlist('archivo')
    if not archivos or all(a.filename == '' for a in archivos):
        return jsonify({'error': 'No se enviaron archivos válidos'}), 400
    
    for archivo in archivos:
        if not archivo_permitido(archivo.filename):
            return jsonify({'error': f'Archivo no permitido: {archivo.filename}. Solo .txt, .pdf o .epub'}), 400
    
    group_id = str(uuid.uuid4())[:8]
    nombres_seguros = []
    capitulos_raw = []
    todos_capitulos = []
    errores_archivos = []

    try:
        archivos_analizados[group_id] = {
            'archivos': [],
            'texto': '',
            'capitulos': []
        }
        
        texto_total = ""

        for archivo in archivos:
            nombre_seguro = obtener_nombre_seguro(archivo.filename)
            nombres_seguros.append(nombre_seguro)
            tomo_stem = Path(archivo.filename).stem
            
            ruta_archivo = app.config['UPLOAD_FOLDER'] / f"{group_id}_{nombre_seguro}"
            archivo.save(str(ruta_archivo))
            
            try:
                texto = leer_archivo(ruta_archivo)
            except Exception as read_err:
                errores_archivos.append(f"{archivo.filename}: {read_err}")
                continue

            texto_total += texto + "\n\n"
            
            capitulos_archivo = dividir_por_capitulos(texto)
            for c in capitulos_archivo:
                if isinstance(c, dict):
                    capitulos_raw.append({
                        'tomo_stem': tomo_stem,
                        'titulo_base': c['titulo'],
                        'original_id': c['id'],
                        'chars': c['chars'],
                        'palabras': c.get('palabras', 0),
                        'tiempo_estimado_min': c.get('tiempo_estimado_min', 0.0),
                        'contenido': c['contenido'],
                        'archivo_nombre': nombre_seguro
                    })
                else: 
                    palabras_c = len(re.findall(r'\b\w+\b', c[1]))
                    capitulos_raw.append({
                        'tomo_stem': tomo_stem,
                        'titulo_base': c[0],
                        'original_id': 0,
                        'chars': len(c[1]),
                        'palabras': palabras_c,
                        'tiempo_estimado_min': round(palabras_c / 150, 1),
                        'contenido': c[1],
                        'archivo_nombre': nombre_seguro
                    })
            
            archivos_analizados[group_id]['archivos'].append({
                'nombre': nombre_seguro,
                'ruta': str(ruta_archivo)
            })

        if not capitulos_raw and errores_archivos:
            return jsonify({'error': f"Error al leer archivos: {'; '.join(errores_archivos)}"}), 500

        # Detectar si hay colisión de títulos entre tomos (ej. ambos tomos contienen 'Capítulo 1')
        titulos_vistos = set()
        hay_duplicados = False
        for c in capitulos_raw:
            if c['titulo_base'] in titulos_vistos:
                hay_duplicados = True
                break
            titulos_vistos.add(c['titulo_base'])

        # Asignar título e ID global
        for i, c in enumerate(capitulos_raw):
            # Si los tomos son secuenciales (Tomo 1: Cap 1-50, Tomo 2: Cap 51-100), mantiene 'Capítulo 51'.
            # Si hay duplicados (Tomo 1: Cap 1, Tomo 2: Cap 1), prefija el tomo: 'Tomo 1 - Capítulo 1'.
            if hay_duplicados and len(nombres_seguros) > 1:
                titulo_final = f"{c['tomo_stem']} - {c['titulo_base']}"
            else:
                titulo_final = c['titulo_base']

            todos_capitulos.append({
                'id': i,
                'original_id': c['original_id'],
                'titulo': titulo_final,
                'chars': c['chars'],
                'palabras': c['palabras'],
                'tiempo_estimado_min': c['tiempo_estimado_min'],
                'contenido': c['contenido'],
                'archivo_nombre': c['archivo_nombre']
            })

        archivos_analizados[group_id]['texto'] = texto_total
        archivos_analizados[group_id]['capitulos'] = todos_capitulos
        
        if len(nombres_seguros) == 1:
            nombre_display = nombres_seguros[0]
        else:
            nombre_display = f"Audiolibro Multi-Tomo ({len(nombres_seguros)} tomos, {len(todos_capitulos)} capítulos)"

        return _respuesta_capitulos(group_id, nombre_display, todos_capitulos)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/re-analizar', methods=['POST'])
def re_analizar():
    """Re-analiza archivos ya subidos con un separador personalizado."""
    data = request.get_json()
    file_id = data.get('file_id')
    separador = data.get('separador', '')
    
    if not file_id or file_id not in archivos_analizados:
        return jsonify({'error': 'Archivo no encontrado. Vuelve a subirlo.'}), 400
    
    info = archivos_analizados[file_id]
    archivos_info = info.get('archivos', [])
    capitulos_raw = []
    todos_capitulos = []
    texto_total = ""

    if archivos_info:
        for a_item in archivos_info:
            ruta_str = a_item.get('ruta')
            nombre_seguro = a_item.get('nombre', 'Libro')
            tomo_stem = Path(nombre_seguro).stem
            try:
                texto = leer_archivo(ruta_str)
                texto_total += texto + "\n\n"
                capitulos_archivo = dividir_por_capitulos(texto, separador_custom=separador if separador else None)
                
                for c in capitulos_archivo:
                    if isinstance(c, dict):
                        capitulos_raw.append({
                            'tomo_stem': tomo_stem,
                            'titulo_base': c['titulo'],
                            'original_id': c['id'],
                            'chars': c['chars'],
                            'palabras': c.get('palabras', 0),
                            'tiempo_estimado_min': c.get('tiempo_estimado_min', 0.0),
                            'contenido': c['contenido'],
                            'archivo_nombre': nombre_seguro
                        })
                    else:
                        palabras_c = len(re.findall(r'\b\w+\b', c[1]))
                        capitulos_raw.append({
                            'tomo_stem': tomo_stem,
                            'titulo_base': c[0],
                            'original_id': 0,
                            'chars': len(c[1]),
                            'palabras': palabras_c,
                            'tiempo_estimado_min': round(palabras_c / 150, 1),
                            'contenido': c[1],
                            'archivo_nombre': nombre_seguro
                        })
            except Exception:
                pass

        titulos_vistos = set()
        hay_duplicados = False
        for c in capitulos_raw:
            if c['titulo_base'] in titulos_vistos:
                hay_duplicados = True
                break
            titulos_vistos.add(c['titulo_base'])

        for i, c in enumerate(capitulos_raw):
            if hay_duplicados and len(archivos_info) > 1:
                titulo_final = f"{c['tomo_stem']} - {c['titulo_base']}"
            else:
                titulo_final = c['titulo_base']

            todos_capitulos.append({
                'id': i,
                'original_id': c['original_id'],
                'titulo': titulo_final,
                'chars': c['chars'],
                'palabras': c['palabras'],
                'tiempo_estimado_min': c['tiempo_estimado_min'],
                'contenido': c['contenido'],
                'archivo_nombre': c['archivo_nombre']
            })

        info['texto'] = texto_total
        info['capitulos'] = todos_capitulos
    else:
        texto = info.get('texto')
        if not texto and info.get('ruta'):
            try:
                texto = leer_archivo(info['ruta'])
                info['texto'] = texto
            except Exception as e:
                return jsonify({'error': str(e)}), 500
        
        capitulos = dividir_por_capitulos(texto, separador_custom=separador if separador else None)
        info['capitulos'] = capitulos
        todos_capitulos = capitulos

    nombre_display = info.get('nombre', 'Audiolibro')
    return _respuesta_capitulos(file_id, nombre_display, todos_capitulos)


def _respuesta_capitulos(file_id, nombre, capitulos):
    """Genera la respuesta JSON para capítulos."""
    caps_info = []
    for cap in capitulos:
        if isinstance(cap, dict):
            palabras = cap.get('palabras', len(re.findall(r'\b\w+\b', cap.get('contenido', ''))))
            tiempo_estimado = cap.get('tiempo_estimado_min', round(palabras / 150, 1))
            caps_info.append({
                'id': cap['id'],
                'titulo': cap['titulo'],
                'chars': cap['chars'],
                'palabras': palabras,
                'tiempo_estimado_min': tiempo_estimado,
                'archivo_nombre': cap.get('archivo_nombre', nombre)
            })
        else:
            palabras_c = len(re.findall(r'\b\w+\b', cap[1]))
            caps_info.append({
                'id': 0,
                'titulo': cap[0],
                'chars': len(cap[1]),
                'palabras': palabras_c,
                'tiempo_estimado_min': round(palabras_c / 150, 1),
                'archivo_nombre': nombre
            })
    
    return jsonify({
        'file_id': file_id,
        'nombre': nombre,
        'capitulos': caps_info,
        'total': len(caps_info)
    })


@app.route('/verificar-capitulos', methods=['POST'])
def verificar_capitulos():
    """Verifica qué capítulos ya tienen MP3 generados en la carpeta de salida."""
    data = request.get_json()
    file_id = data.get('file_id')

    if not file_id or file_id not in archivos_analizados:
        return jsonify({'error': 'Archivo no encontrado'}), 400

    archivo_info = archivos_analizados[file_id]
    todos_caps = archivo_info['capitulos']

    # Determinar nombre base (misma lógica que /convertir)
    if todos_caps and isinstance(todos_caps[0], dict) and 'archivo_nombre' in todos_caps[0]:
        nombre_original = todos_caps[0]['archivo_nombre']
    elif archivo_info.get('archivos'):
        nombre_original = archivo_info['archivos'][0]['nombre']
    else:
        nombre_original = "Audiolibro"

    nombre_base = Path(nombre_original).stem
    carpeta_salida = app.config['OUTPUT_FOLDER'] / nombre_base

    ya_completados = []

    for cap in todos_caps:
        if not isinstance(cap, dict):
            continue

        # Replicar la lógica exacta de _convertir_capitulo para construir la ruta
        nombre_archivo_cap = cap.get('archivo_nombre', nombre_base)
        nombre_libro = Path(nombre_archivo_cap).stem
        nombre_libro_limpio = re.sub(r'[^\w\s\-\.]', '_', nombre_libro).strip()

        carpeta_destino = carpeta_salida / nombre_libro_limpio

        titulo_limpio = cap['titulo'].lower().replace(' ', '_')
        titulo_limpio = re.sub(r'[^\w\s\-\.]', '_', titulo_limpio)
        archivo_esperado = carpeta_destino / f"{nombre_libro_limpio}_{titulo_limpio}.mp3"

        if archivo_esperado.exists() and archivo_esperado.stat().st_size > 0:
            ya_completados.append({
                'id': cap['id'],
                'titulo': cap['titulo'],
                'archivo': str(archivo_esperado.name),
                'size': archivo_esperado.stat().st_size
            })

    return jsonify({
        'file_id': file_id,
        'ya_completados': ya_completados,
        'total_existentes': len(ya_completados),
        'total_capitulos': len(todos_caps),
        'carpeta': str(carpeta_salida)
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
        # Filter by ID (only for dict chapters that have IDs)
        capitulos_seleccionados = []
        for c in todos_caps:
            if isinstance(c, dict) and c['id'] in capitulos_ids:
                capitulos_seleccionados.append(c)
    else:
        # Select all
        capitulos_seleccionados = todos_caps
    
    if not capitulos_seleccionados:
        return jsonify({'error': 'No hay capítulos para convertir'}), 400
    
    # Intentar sacar 'nombre' (ya que ahora se guardan por capítulo)
    # Por defecto sacaremos el nombre base del primer capítulo analizado o un grupo generico
    if capitulos_seleccionados and 'archivo_nombre' in capitulos_seleccionados[0]:
        nombre_original = capitulos_seleccionados[0]['archivo_nombre']
    elif archivo_info.get('archivos'):
        nombre_original = archivo_info['archivos'][0]['nombre']
    else:
        nombre_original = "Audiolibro"
        
    nombre_base = Path(nombre_original).stem
    
    # Crear job
    job_id = str(uuid.uuid4())[:8]
    carpeta_salida = app.config['OUTPUT_FOLDER'] / nombre_base
    carpeta_salida.mkdir(parents=True, exist_ok=True)
    
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
    
    archivos = sorted(Path(carpeta).rglob('*.mp3'))
    # Return path relative to base directory for downloading
    return jsonify({
        'archivos': [{'nombre': str(f.relative_to(Path(carpeta))), 'size': f.stat().st_size} for f in archivos]
    })


@app.route('/descargar/<job_id>/<path:nombre>')
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
