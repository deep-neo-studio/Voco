# 🎧 Conversor de Libros a Audiolibros

Convierte archivos de texto (.txt, .pdf) en audiolibros MP3 utilizando las voces neuronales de Microsoft Edge.

## Instalación Rápida

El proyecto ya incluye un entorno virtual con las dependencias instaladas. Solo necesitas:

```bash
# Opcional: Para convertir archivos EPUB
sudo apt install pandoc -y
```

## Uso Básico

Usa el script `convertir.sh` que gestiona automáticamente el entorno virtual:

```bash
# Convertir un PDF
./convertir.sh libro.pdf

# Convertir un TXT
./convertir.sh libro.txt

# Cambiar la voz
./convertir.sh libro.pdf --voz alonso

# Especificar carpeta de salida
./convertir.sh libro.pdf --salida ./mi_audiolibro

# Ver voces disponibles
./convertir.sh --voces
```

## Voces Disponibles

| Nombre  | Identificador          | Región   | Género    |
|---------|------------------------|----------|-----------|
| alvaro  | es-ES-AlvaroNeural     | España   | Masculino |
| alonso  | es-US-AlonsoNeural     | EE.UU.   | Masculino |
| jorge   | es-MX-JorgeNeural      | México   | Masculino |
| dalia   | es-MX-DaliaNeural      | México   | Femenino  |

**Voz por defecto:** `jorge` (México - Masculina)

## División por Capítulos

El script detecta automáticamente capítulos con el formato:
- `CAPÍTULO 1`
- `Capítulo 1`
- `CAPITULO X`

Cada capítulo se guarda como un archivo MP3 separado:
```
libro_audiolibro/
├── libro_capitulo_1.mp3
├── libro_capitulo_2.mp3
├── libro_capitulo_3.mp3
└── ...
```

## Convertir EPUB a TXT

Si tienes un archivo EPUB, conviértelo primero:

```bash
pandoc libro.epub -o libro.txt
```

## Notas

- La API de Edge TTS es gratuita y no requiere autenticación
- El proceso puede tomar varios minutos dependiendo del tamaño del libro
- Los archivos MP3 resultantes son compatibles con cualquier reproductor
# Voco
