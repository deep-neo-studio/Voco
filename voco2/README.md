# 🎧 Voco 2.0 - Lector Móvil, Biblioteca & Audiolibro con Whispersync

**Voco 2.0** es una aplicación nativa para Android y Web que transforma la experiencia de lectura de libros digitales (.epub, .pdf, .txt). Permite leer cómodamente en móvil, gestionar tu biblioteca y convertir capítulos a audiolibros con voces neuronales de alta calidad, manteniendo una **sincronización bidireccional en tiempo real entre el texto y el audio (Whispersync & Read-Along)**.

---

## ✨ Características Principales

- 📚 **Biblioteca Inteligente**:
  - Estanterías: *Todos*, *Leyendo*, *Con Audiolibro* y *Terminados*.
  - Buscador dinámico por título o autor.
  - Carátulas automáticas extraídas de EPUB o generadas proceduralmente con degradados modernos para PDF y TXT.
  - Indicador de almacenamiento ocupado por los audios y limpieza inteligente de capítulos terminados.

- 📖 **Lector E-Reader**:
  - Compatible con EPUB, PDF y TXT.
  - Temas visuales: **AMOLED Black puro** (ahorro de batería en pantallas OLED), Sepia cálido, Noche Slate y Blanco Papel.
  - Ajustes de tipografía (*Inter*, *Literata*, *JetBrains Mono*), tamaño de letra e interlineado.
  - Índice lateral de capítulos con indicador de audio disponible.

- ⚡ **Sincronización Bimodal (Whispersync & Read-Along)**:
  - **Lectura Acompañada / Karaoke**: El narrador habla y el párrafo activo se resalta y hace auto-scroll en tiempo real.
  - **Salto Táctil**: Toca cualquier párrafo para que el audio salte directamente a ese segundo.
  - **Marcador Bi-direccional**: Si cambias de leer a escuchar, el audio empieza exactamente en tu párrafo actual; si pausas y abres el libro, te sitúa en la frase exacta.

- 🎙️ **Estudio de Audiolibros Modular**:
  - Convierte solo el capítulo que vas a escuchar hoy, una selección o el libro completo.
  - Voces neuronales de Edge TTS con variedad de acentos (México, España, Colombia, Argentina, etc.).
  - Los archivos de audio se guardan en el almacenamiento local para escuchar **100% offline**.

- 🎧 **Reproductor Móvil**:
  - Mini-reproductor flotante inferior persistente.
  - Reproductor a pantalla completa con carátula, selector de velocidad (0.75x - 2.0x) y temporizador de sueño (*Sleep Timer*).
  - Integración nativa con `MediaSession API` de Android para control desde la pantalla de bloqueo y barra de notificaciones.

---

## 🛠️ Estructura del Proyecto

```
voco2/
├── src/
│   ├── index.html                  # Estructura de la aplicación
│   ├── css/
│   │   └── style.css               # Estilos AMOLED y temas
│   └── js/
│       ├── app.js                  # Orquestador principal
│       ├── db.js                   # Base de datos local IndexedDB
│       ├── parsers/                # Parsers para EPUB, PDF y TXT
│       ├── reader/                 # Motor de lectura y Whispersync
│       ├── audio/                  # Reproductor y motor Edge TTS
│       └── library/                # Biblioteca y generador de portadas
├── www/                            # Distribución compilada para Capacitor
├── android/                        # Proyecto nativo Android (Gradle)
├── build.js                        # Compilación ultrarrápida con esbuild
├── capacitor.config.json           # Configuración de Capacitor Android
└── package.json                    # Dependencias del proyecto
```

---

## 🚀 Inicio Rápido

### Modo Desarrollo Web:
```bash
# 1. Compilar los assets
node build.js

# 2. Iniciar servidor local
python3 -m http.server 5173 --directory www
```
Abre `http://localhost:5173` en tu navegador.

### Sincronización con Android:
```bash
# Sincronizar cambios a Android
npm run cap:sync

# Abrir en Android Studio
npm run cap:open
```

### Compilar APK Debug desde terminal:
```bash
cd android
./gradlew assembleDebug
```
El APK se genera en:
`android/app/build/outputs/apk/debug/app-debug.apk`
