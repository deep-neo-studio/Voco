import { LocalParser } from './parsers.js';
import { EdgeTTS } from './edge-tts.js';
import { Filesystem, Directory } from '@capacitor/filesystem';

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
let currentFile = null;
let currentFileId = null; // We use filename as ID
let chapters = [];
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
            const langCode = v.Locale.split('-')[0];
            const localeCode = v.Locale;
            const regionName = v.LocaleName; // e.g. "Spanish (Mexico)"

            // Get language name (e.g. "Spanish")
            let langName = regionName.split('(')[0].trim();

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
        voiceGrid.innerHTML = '<div class="voice-loading">Error cargando voces. Verifica tu conexión.</div>';
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
fileInput.addEventListener('change', (e) => { if (e.target.files[0]) handleFile(e.target.files[0]); });

async function handleFile(file) {
    dropZone.innerHTML = '<span class="drop-icon">⏳</span><p class="drop-text">Analizando...</p>';

    try {
        const text = await LocalParser.readFile(file);

        // Simple chapter splitting logic
        chapters = LocalParser.splitChapters(text);

        currentFile = file;
        currentFileId = file.name;
        document.getElementById('fileName').textContent = file.name;

        renderChapters();
        showSection('select');

    } catch (e) {
        console.error(e);
        alert('Error al leer archivo: ' + e.message);
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
            <input type="checkbox" id="cap${c.id}" value="${c.id}" checked>
            <div class="chapter-info">
                <div class="chapter-title">${c.titulo}</div>
                <div class="chapter-chars">${(c.chars / 1000).toFixed(1)}k caracteres</div>
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
        const chapter = chapters.find(c => c.id === id);
        if (!chapter) continue;

        document.getElementById('progressStatus').textContent = `Convirtiendo: ${chapter.titulo}`;
        document.getElementById('progressChapter').textContent = `${processed + 1}/${total}`;

        try {
            // Synthesize
            const audioBlob = await ttsClient.synthesize(chapter.contenido, vozId);

            // Save to device
            const base64 = await blobToBase64(audioBlob);
            const fileName = `${currentFile.name.split('.')[0]} - ${chapter.titulo}.mp3`.replace(/[^a-z0-9 \-\.]/gi, '_');

            // Use Documents folder
            const savedFile = await Filesystem.writeFile({
                path: `Audiolibros/${fileName}`,
                data: base64,
                directory: Directory.Documents,
                recursive: true
            });

            completedFiles.push({
                nombre: fileName,
                uri: savedFile.uri,
                size: audioBlob.size
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
            alert(`Error en capítulo ${chapter.titulo}: ${e.message}`);
            // Continue or break? Continue.
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
    resetDropZone();
    showSection('upload');
    fileInput.value = '';
});
// Reanalyze button logic (needs implementation in parsers.js or script.js)
document.getElementById('btnReanalyze').addEventListener('click', () => {
    const sep = document.getElementById('customDivider').value;
    // ... logic to re-split text ...
    const text = LocalParser.readFile(currentFile); // Wait, we can't read file again easily if we didn't store text.
    // Better store fullText in memory.
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

// Re-analyze Logic
document.getElementById('btnReanalyze').addEventListener('click', async () => {
    if (!currentFile) return;

    const separator = document.getElementById('customDivider').value;
    const btn = document.getElementById('btnReanalyze');
    const hint = document.getElementById('dividerHint');

    btn.disabled = true;
    btn.textContent = '⏳ Analizando...';

    try {
        // Read file again or use cached text? 
        // We need to verify if we can read the file object again. Yes, Blob/File can be read multiple times.
        const text = await LocalParser.readFile(currentFile);

        chapters = LocalParser.splitChapters(text, separator);
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

