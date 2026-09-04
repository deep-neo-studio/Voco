import { LocalParser } from './parsers.js';
import { EdgeTTS } from './edge-tts.js';
import { Filesystem, Directory } from '@capacitor/filesystem';

// Max characters per TTS request (Bing/Edge can reject very long SSML)
const TTS_CHUNK_MAX = 2500;

/** Splits text into chunks at word boundaries, then synthesizes each and merges MP3 blobs. */
async function synthesizeLongText(text, voiceId) {
    const trimmed = text.trim();
    if (!trimmed) return new Blob([], { type: 'audio/mpeg' });
    if (trimmed.length <= TTS_CHUNK_MAX) return await ttsClient.synthesize(trimmed, voiceId);

    const chunks = [];
    let start = 0;
    while (start < trimmed.length) {
        let end = Math.min(start + TTS_CHUNK_MAX, trimmed.length);
        if (end < trimmed.length) {
            const lastSpace = trimmed.lastIndexOf(' ', end);
            if (lastSpace > start) end = lastSpace + 1;
        }
        chunks.push(trimmed.slice(start, end).trim());
        start = end;
    }

    const blobs = [];
    for (const chunk of chunks) {
        if (chunk.length) blobs.push(await ttsClient.synthesize(chunk, voiceId));
    }
    const buffers = await Promise.all(blobs.map(b => b.arrayBuffer()));
    return new Blob(buffers, { type: 'audio/mpeg' });
}

// Helper: Convert Blob to Base64
const blobToBase64 = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
        // remove "data:audio/mpeg;base64," prefix
        const result = reader.result;
        const base64 = result.split(',')[1];
        resolve(base64);
    };
    reader.readAsDataURL(blob);
});

// State
let currentFiles = []; // Array de { file, fullText, name }
let chapters = []; // Array de { globalId, fileIndex, fileName, id, titulo, chars, contenido }
let globalChapterId = 0;
let currentAudio = null;
let allLanguages = [];
let currentVoices = [];
let selectedVoiceId = null;
let ttsClient = new EdgeTTS();

// Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const langSelect = document.getElementById('langSelect');
const localeSelect = document.getElementById('localeSelect');
const voiceGrid = document.getElementById('voiceGrid');
const sections = {
    upload: document.getElementById('uploadSection'),
    select: document.getElementById('selectSection'),
    progress: document.getElementById('progressSection'),
    results: document.getElementById('resultsSection')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', async () => {
    initI18n();
    await loadLanguagesAndVoices();

    // Check permissions?
    // requestPermissions();
});

// --- UI Navigation ---
function showSection(name) {
    Object.values(sections).forEach(s => s.classList.remove('active'));
    sections[name].classList.add('active');

    const steps = ['step1', 'step2', 'step3'];
    const currentIdx = { upload: 0, select: 1, progress: 2, results: 2 }[name];
    steps.forEach((s, i) => {
        const el = document.getElementById(s);
        el.classList.remove('active', 'done');
        if (i < currentIdx) el.classList.add('done');
        else if (i === currentIdx) el.classList.add('active');
    });
}

// --- Logic ---

// 1. Load Voices from Microsoft (Direct)
async function loadLanguagesAndVoices() {
    try {
        const voices = await EdgeTTS.getVoices();
        if (!voices || voices.length === 0) throw new Error("No voices found");

        // Process voices into languages/locales structure similar to Python backend
        const map = {};
        voices.forEach(v => {
            const langCode = v.Locale ? v.Locale.split('-')[0] : 'und';
            const localeCode = v.Locale || 'und';

            let regionName = localeCode;
            if (v.FriendlyName && v.FriendlyName.includes(' - ')) {
                regionName = v.FriendlyName.split(' - ').pop().trim();
            } else if (v.LocaleName) {
                regionName = v.LocaleName;
            }

            let langName = langCode;
            if (regionName.includes('(')) {
                langName = regionName.split('(')[0].trim();
            } else {
                langName = regionName;
            }

            if (!map[langCode]) {
                map[langCode] = { codigo: langCode, nombre: langName, locales: {} };
            }

            if (!map[langCode].locales[localeCode]) {
                map[langCode].locales[localeCode] = {
                    codigo: localeCode,
                    nombre: regionName,
                    voces: []
                };
            }

            map[langCode].locales[localeCode].voces.push({
                id: v.ShortName,
                nombre: v.LocalName || v.ShortName.split('-').pop().replace('Neural', ''),
                region: v.Locale,
                genero: v.Gender
            });
        });

        // Convert map to array
        allLanguages = Object.values(map).map(l => ({
            ...l,
            locales: Object.values(l.locales).map(loc => ({
                ...loc,
                voces_count: loc.voces.length
            }))
        })).sort((a, b) => a.nombre.localeCompare(b.nombre));

        populateLangSelect();

    } catch (e) {
        console.error("Error loading voices", e);
        // Fallback or error UI
        voiceGrid.innerHTML = `<div class="voice-loading" style="color:#ff6b6b">Error cargando voces: ${e.message || "Verifica tu conexión"}</div>`;
    }
}

function populateLangSelect() {
    const savedLang = localStorage.getItem('audiolib_lang') || 'es';
    langSelect.innerHTML = allLanguages.map(lang =>
        `<option value="${lang.codigo}" ${lang.codigo === savedLang ? 'selected' : ''}>${lang.nombre}</option>`
    ).join('');
    updateLocales(savedLang);
}

function updateLocales(langCode) {
    const lang = allLanguages.find(l => l.codigo === langCode);
    if (!lang) return;

    const savedLocale = localStorage.getItem('audiolib_locale') || '';

    // Flatten voices for this language if multiple locales? 
    // Or just show locales.

    localeSelect.innerHTML = `<option value="${langCode}">Todas las regiones</option>` +
        lang.locales.map(l =>
            `<option value="${l.codigo}" ${l.codigo === savedLocale ? 'selected' : ''}>${l.nombre} (${l.voces_count})</option>`
        ).join('');

    localeSelect.style.display = '';

    const activeLocale = savedLocale && lang.locales.some(l => l.codigo === savedLocale)
        ? savedLocale : langCode;

    loadVoicesForLocale(activeLocale, lang);
}

function loadVoicesForLocale(locale, langObj) {
    let voices = [];
    if (locale === langObj.codigo) {
        // All voices for this language
        langObj.locales.forEach(l => voices.push(...l.voces));
    } else {
        const loc = langObj.locales.find(l => l.codigo === locale);
        if (loc) voices = loc.voces;
    }

    currentVoices = voices;
    renderVoiceCards(localStorage.getItem('audiolib_voice'));
}

function renderVoiceCards(preselectedId) {
    voiceGrid.innerHTML = currentVoices.map(v => `
        <label class="voice-card ${v.id === preselectedId ? 'selected' : ''}" data-voice-id="${v.id}">
            <input type="radio" name="voz" value="${v.id}" ${v.id === preselectedId ? 'checked' : ''}>
            <div class="voice-header">
                <div>
                    <div class="voice-name">${v.nombre}</div>
                    <div class="voice-meta">${v.region}</div>
                </div>
                <!-- Preview not implemented yet for direct API -->
                <button class="btn-preview" data-voice="${v.id}" type="button">▶</button>
            </div>
            <span class="voice-gender ${v.genero === 'Male' ? 'm' : 'f'}">${v.genero === 'Male' ? 'Masculino' : 'Femenino'}</span>
        </label>
    `).join('');

    if (!preselectedId || !currentVoices.find(v => v.id === preselectedId)) {
        const first = voiceGrid.querySelector('.voice-card');
        if (first) {
            first.classList.add('selected');
            first.querySelector('input').checked = true;
            selectedVoiceId = currentVoices[0]?.id;
        }
    } else {
        selectedVoiceId = preselectedId;
    }

    voiceGrid.querySelectorAll('.voice-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-preview')) return;
            voiceGrid.querySelectorAll('.voice-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            selectedVoiceId = card.dataset.voiceId;
            localStorage.setItem('audiolib_voice', selectedVoiceId);
        });
    });

    // Preview logic
    voiceGrid.querySelectorAll('.btn-preview').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const vozId = btn.dataset.voice;
            await playPreview(vozId, btn);
        });
    });
}

async function playPreview(voiceId, btn) {
    if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
        document.querySelectorAll('.btn-preview').forEach(b => b.textContent = '▶');
    }

    btn.textContent = '⏳';
    try {
        const blob = await ttsClient.synthesize("Hola, esta es una prueba de voz.", voiceId);
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        currentAudio = audio;
        audio.oncanplaythrough = () => {
            btn.textContent = '⏸';
            audio.play();
        };
        audio.onended = () => {
            btn.textContent = '▶';
            currentAudio = null;
        };
        audio.play(); // trigger load
    } catch (e) {
        console.error(e);
        btn.textContent = '❌';
    }
}


// 2. Handle File Upload
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) {
        handleFiles(Array.from(e.target.files));
    }
});

async function handleFiles(files) {
    dropZone.innerHTML = '<span class="drop-icon">⏳</span><p class="drop-text">Analizando...</p>';

    try {
        currentFiles = [];
        chapters = [];
        globalChapterId = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const text = await LocalParser.readFile(file);

            currentFiles.push({
                file: file,
                fullText: text,
                name: file.name
            });

            // Simple chapter splitting logic
            const fileChapters = LocalParser.splitChapters(text);

            for (const c of fileChapters) {
                chapters.push({
                    globalId: globalChapterId++,
                    fileIndex: i,
                    fileName: file.name,
                    id: c.id,
                    titulo: c.titulo,
                    chars: c.chars,
                    contenido: c.contenido
                });
            }
        }

        if (currentFiles.length === 1) {
            document.getElementById('fileName').textContent = currentFiles[0].name;
        } else {
            document.getElementById('fileName').textContent = `${currentFiles.length} archivos seleccionados`;
        }

        renderChapters();
        showSection('select');

    } catch (e) {
        console.error(e);
        alert('Error al leer archivos: ' + e.message);
        resetDropZone();
    }
}

function resetDropZone() {
    dropZone.innerHTML = `
        <span class="drop-icon">📚</span>
        <p class="drop-text">Arrastra tu libro aquí</p>
        <p class="drop-hint">o haz clic para seleccionar • TXT, PDF, EPUB</p>
    `;
}

function renderChapters() {
    const list = document.getElementById('chapterList');
    list.innerHTML = chapters.map(c => `
        <div class="chapter-item">
            <input type="checkbox" id="cap${c.globalId}" value="${c.globalId}" checked>
            <div class="chapter-info">
                <div class="chapter-title" style="font-weight: bold;">${c.titulo}</div>
                <div class="chapter-chars" style="font-size: 0.8em; color: gray;">
                    ${c.fileName} • ${(c.chars / 1000).toFixed(1)}k caracteres
                </div>
            </div>
        </div>
    `).join('');

    list.querySelectorAll('input').forEach(cb => {
        cb.addEventListener('change', updateSelectedCount);
    });
    updateSelectedCount();
}

function updateSelectedCount() {
    const checked = document.querySelectorAll('#chapterList input:checked').length;
    document.getElementById('selectedCount').textContent = `${checked} seleccionados`;
    document.getElementById('btnConvert').disabled = checked === 0;
}

// 3. Conversion Loop
document.getElementById('btnConvert').addEventListener('click', async () => {
    const selectedIds = Array.from(document.querySelectorAll('#chapterList input:checked'))
        .map(cb => parseInt(cb.value));

    const vozChecked = document.querySelector('input[name="voz"]:checked');
    const vozId = vozChecked ? vozChecked.value : selectedVoiceId;

    showSection('progress');

    const total = selectedIds.length;
    let processed = 0;
    const completedFiles = [];

    document.getElementById('progressStatus').textContent = 'Iniciando conversión...';

    for (const id of selectedIds) {
        const chapter = chapters.find(c => c.globalId === id);
        if (!chapter) continue;

        const currentFileName = chapter.fileName;
        document.getElementById('progressStatus').textContent = `Convirtiendo: ${currentFileName} / ${chapter.titulo}`;
        document.getElementById('progressChapter').textContent = `${processed + 1}/${total}`;

        try {
            // Synthesize (chunk long text to avoid Bing request limit)
            const audioBlob = await synthesizeLongText(chapter.contenido, vozId);

            // Save to device
            const base64 = await blobToBase64(audioBlob);
            const bookName = currentFileName.split('.').slice(0, -1).join('.') || currentFileName;
            const safeBookName = bookName.replace(/[^a-z0-9 \-\.]/gi, '_').trim();
            const fileName = `${safeBookName} - ${chapter.titulo}.mp3`.replace(/[^a-z0-9 \-\.]/gi, '_');

            // Use Documents folder
            const bookFolderPath = `Audiolibros/${safeBookName}`;
            try {
                await Filesystem.mkdir({
                    path: bookFolderPath,
                    directory: Directory.Documents,
                    recursive: true
                });
            } catch (e) { } // ignore if already exists

            const savedFile = await Filesystem.writeFile({
                path: `${bookFolderPath}/${fileName}`,
                data: base64,
                directory: Directory.Documents
            });

            completedFiles.push({
                nombre: fileName,
                uri: savedFile.uri,
                size: audioBlob.size,
                folder: bookFolderPath
            });

            processed++;
            const pct = Math.round((processed / total) * 100);
            document.getElementById('progressPercent').textContent = pct + '%';
            document.getElementById('progressBar').style.width = pct + '%';

            // Uncheck processed
            const cb = document.getElementById(`cap${id}`);
            if (cb) {
                cb.checked = false;
                cb.parentElement.style.opacity = '0.5';
            }

        } catch (e) {
            console.error("Error converting chapter", id, e);
            let msg = e && e.message ? e.message : (typeof e === 'object' ? JSON.stringify(e) : String(e));
            if (msg === '{}' && e instanceof Event) msg = "Connection error";
            alert(`Error en capítulo ${chapter.titulo}: ${msg}`);
            // Continue with other chapters
        }
    }

    // Finish
    renderResults(completedFiles);
    showSection('results');
});

function renderResults(files) {
    document.getElementById('resultsList').innerHTML = files.map(f => `
        <div class="result-item">
            <span class="result-icon">🎵</span>
            <div class="result-info">
                <div class="result-name">${f.nombre}</div>
                <div class="result-size">${(f.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
            <!-- Open File -->
            <button class="btn-download" onclick="alert('Archivo guardado en Documentos/Audiolibros')">📂 Guardado</button>
        </div>
    `).join('');

    document.getElementById('results-header-text').textContent = `¡${files.length} Capítulos Completados!`;
}

document.getElementById('btnNewConversion').addEventListener('click', () => {
    currentFiles = [];
    resetDropZone();
    showSection('upload');
    fileInput.value = '';
});

// Settings & Other UI handlers
langSelect.addEventListener('change', () => {
    const lang = langSelect.value;
    localStorage.setItem('audiolib_lang', lang);
    updateLocales(lang);
});

localeSelect.addEventListener('change', () => {
    const locale = localeSelect.value;
    localStorage.setItem('audiolib_locale', locale);
    const lang = allLanguages.find(l => l.codigo === langSelect.value);
    loadVoicesForLocale(locale, lang);
});


// Listeners for Select All/None
document.getElementById('btnSelectAll').addEventListener('click', () => {
    document.querySelectorAll('#chapterList input').forEach(cb => cb.checked = true);
    updateSelectedCount();
});
document.getElementById('btnSelectNone').addEventListener('click', () => {
    document.querySelectorAll('#chapterList input').forEach(cb => cb.checked = false);
    updateSelectedCount();
});
document.getElementById('btnChangeFile').addEventListener('click', () => {
    currentFiles = [];
    resetDropZone();
    showSection('upload');
    fileInput.value = '';
});

// --- i18n & Utility Logic ---

const UI_TRANSLATIONS = {
    pt: {
        title: 'Conversor de Audiolivros',
        subtitle: 'TXT • PDF • EPUB → MP3',
        step_upload: 'Enviar',
        step_select: 'Selecionar',
        step_convert: 'Converter',
        drop_text: 'Arraste seu livro aqui',
        drop_hint: 'ou clique para selecionar • TXT, PDF, EPUB',
        btn_change: 'Alterar',
        voice_title: '🗣️ Voz do narrador',
        voice_lang: '🌐 Idioma',
        divider_title: '✂️ Separador de capítulos',
        chapters_title: '📖 Capítulos para converter',
        btn_all: '✓ Todos',
        btn_none: '✗ Nenhum',
        btn_convert: '🎙️ Converter selecionados',
        results_done: 'Conversão concluída!',
        btn_new: '📚 Converter outro livro',
        settings_title: '⚙️ Configuração',
        settings_lang: '🌐 Idioma',
        btn_cancel: 'Cancelar',
        btn_save: 'Aceitar',
    },
    fr: {
        title: 'Convertisseur de livres audio',
        subtitle: 'TXT • PDF • EPUB → MP3',
        step_upload: 'Envoyer',
        step_select: 'Sélectionner',
        step_convert: 'Convertir',
        drop_text: 'Glissez votre livre ici',
        drop_hint: 'ou cliquez pour sélectionner • TXT, PDF, EPUB',
        btn_change: 'Changer',
        voice_title: '🗣️ Voix du narrateur',
        voice_lang: '🌐 Langue',
        divider_title: '✂️ Séparateur de chapitres',
        chapters_title: '📖 Chapitres à convertir',
        btn_all: '✓ Tous',
        btn_none: '✗ Aucun',
        btn_convert: '🎙️ Convertir la sélection',
        results_done: 'Conversion terminée !',
        btn_new: '📚 Convertir un autre livre',
        settings_title: '⚙️ Configuration',
        settings_lang: '🌐 Langue',
        btn_cancel: 'Annuler',
        btn_save: 'Accepter',
    },
    en: {
        title: 'Audiobook Converter',
        subtitle: 'TXT • PDF • EPUB → MP3',
        step_upload: 'Upload',
        step_select: 'Select',
        step_convert: 'Convert',
        drop_text: 'Drag your book here',
        drop_hint: 'or click to select • TXT, PDF, EPUB',
        btn_change: 'Change',
        voice_title: '🗣️ Narrator voice',
        voice_lang: '🌐 Language',
        divider_title: '✂️ Chapter separator',
        chapters_title: '📖 Chapters to convert',
        btn_all: '✓ All',
        btn_none: '✗ None',
        btn_convert: '🎙️ Convert selected',
        results_done: 'Conversion complete!',
        btn_new: '📚 Convert another book',
        settings_title: '⚙️ Settings',
        settings_lang: '🌐 Language',
        btn_cancel: 'Cancel',
        btn_save: 'Accept',
    }
};


function initI18n() {
    const lang = localStorage.getItem('audiolib_ui_lang');
    const splash = document.getElementById('splashOverlay');

    if (!lang) {
        splash.classList.remove('hidden');
    } else {
        splash.classList.add('hidden');
        applyI18n(lang);
    }

    // Splash handlers
    document.querySelectorAll('.splash-content .lang-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const l = opt.dataset.uiLang;
            localStorage.setItem('audiolib_ui_lang', l);
            applyI18n(l);
            splash.classList.add('hidden');
        });
    });

    // Settings Modal Handlers
    document.getElementById('btnSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.add('active');
    });

    document.getElementById('btnCloseSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.remove('active');
    });

    document.getElementById('btnSaveSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.remove('active');
    });

    // Settings Lang Options
    document.querySelectorAll('.settings-group .lang-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const l = opt.dataset.setLang;
            localStorage.setItem('audiolib_ui_lang', l);
            applyI18n(l);
            // visual feedback
            document.querySelectorAll('.settings-group .lang-option').forEach(o => o.style.borderColor = 'var(--border)');
            opt.style.borderColor = 'var(--accent)';
        });
    });
}

function applyI18n(lang) {
    document.documentElement.lang = lang;
    const t = UI_TRANSLATIONS[lang];
    if (!t) return; // Fallback to HTML defaults (Spanish)

    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (t[key]) el.textContent = t[key];
    });
}

// Re-analyze Logic (uses cached currentFullText when available — Android may not re-read File)
document.getElementById('btnReanalyze').addEventListener('click', async () => {
    if (currentFiles.length === 0) return;

    const separator = document.getElementById('customDivider').value;
    const btn = document.getElementById('btnReanalyze');
    const hint = document.getElementById('dividerHint');

    btn.disabled = true;
    btn.textContent = '⏳ Analizando...';

    try {
        chapters = [];
        globalChapterId = 0;

        for (let i = 0; i < currentFiles.length; i++) {
            const fileObj = currentFiles[i];
            const text = fileObj.fullText != null
                ? fileObj.fullText
                : await LocalParser.readFile(fileObj.file);

            if (fileObj.fullText == null) fileObj.fullText = text;

            const fileChapters = LocalParser.splitChapters(text, separator);

            for (const c of fileChapters) {
                chapters.push({
                    globalId: globalChapterId++,
                    fileIndex: i,
                    fileName: fileObj.name,
                    id: c.id,
                    titulo: c.titulo,
                    chars: c.chars,
                    contenido: c.contenido
                });
            }
        }

        renderChapters();

        hint.textContent = separator
            ? `✅ Dividido con "${separator}" → ${chapters.length} partes`
            : `✅ División automática → ${chapters.length} capítulos`;
        hint.style.color = '#51cf66';

    } catch (e) {
        console.error(e);
        hint.textContent = '❌ Error al re-analizar';
        hint.style.color = '#ff6b6b';
    } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Re-analizar';
    }
});

// Preset buttons
document.querySelectorAll('.btn-preset').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById('customDivider').value = btn.dataset.sep;
        document.getElementById('btnReanalyze').click();
    });
});

