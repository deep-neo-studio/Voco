
import '../css/style.css';
import { FileParser } from './fileParser.js';
import { ChapterSplitter } from './chapterSplitter.js';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { EdgeTTS } from './edge-tts.js';

// --- State ---
let currentFile = null;
let currentChapters = [];
let selectedChapters = new Set();
let isConverting = false;
let currentLang = 'es';
let allVoices = []; // Native or Cloud voices depending on mode
let edgeVoices = []; // Cache for cloud voices
let filteredVoices = [];
let useCloudTTS = false; // Toggle state

// --- Modules ---
const fileParser = new FileParser();
const splitter = new ChapterSplitter();
const edgeTTS = new EdgeTTS();

// --- Elements ---
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const uploadSection = document.getElementById('uploadSection');
const selectSection = document.getElementById('selectSection');
const progressSection = document.getElementById('progressSection');
const resultsSection = document.getElementById('resultsSection');
const fileNameDisplay = document.getElementById('fileName');
const chapterList = document.getElementById('chapterList');
const btnConvert = document.getElementById('btnConvert');
const voiceGrid = document.getElementById('voiceGrid');
const splashOverlay = document.getElementById('splashOverlay');
const langSelect = document.getElementById('langSelect');
const localeSelect = document.getElementById('localeSelect');

// --- Initialization ---

document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
    loadVoices(); // Initial load (Native)
});

function initEventListeners() {
    // Voice Source Toggle
    const btnNative = document.getElementById('btnSourceNative');
    const btnCloud = document.getElementById('btnSourceCloud');

    if (btnNative && btnCloud) {
        btnNative.addEventListener('click', () => {
            btnNative.classList.add('active');
            btnCloud.classList.remove('active');
            toggleVoiceSource(false);
        });
        btnCloud.addEventListener('click', () => {
            btnCloud.classList.add('active');
            btnNative.classList.remove('active');
            toggleVoiceSource(true);
        });
    }

    // Splash Screen Language Selection
    document.querySelectorAll('.splash-content .lang-option').forEach(option => {
        option.addEventListener('click', () => {
            const lang = option.dataset.uiLang;
            setLanguage(lang);
            splashOverlay.style.display = 'none';
        });
    });

    // Settings Language Selection
    document.querySelectorAll('.settings-group .lang-option').forEach(option => {
        option.addEventListener('click', () => {
            const lang = option.dataset.setLang;
            setLanguage(lang);
            document.querySelectorAll('.settings-group .lang-option').forEach(o => o.style.border = '1px solid #ddd');
            option.style.border = '2px solid var(--primary-color)';
        });
    });

    // File Upload
    dropZone.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelect);

    // Navigation
    document.getElementById('btnChangeFile').addEventListener('click', () => {
        switchSection(uploadSection);
        currentFile = null;
    });

    document.getElementById('btnNewConversion').addEventListener('click', () => {
        switchSection(uploadSection);
        currentFile = null;
        currentChapters = [];
        chapterList.innerHTML = '';
        fileInput.value = '';
    });

    // Chapter Selection
    document.getElementById('btnSelectAll').addEventListener('click', () => {
        document.querySelectorAll('.chapter-checkbox').forEach(cb => cb.checked = true);
        updateSelection();
    });
    document.getElementById('btnSelectNone').addEventListener('click', () => {
        document.querySelectorAll('.chapter-checkbox').forEach(cb => cb.checked = false);
        updateSelection();
    });

    // Conversion
    btnConvert.addEventListener('click', startConversion);

    // Filters
    langSelect.addEventListener('change', filterVoices);
    localeSelect.addEventListener('change', filterVoices);

    // Settings
    document.getElementById('btnSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.add('active');
    });
    document.getElementById('btnCloseSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.remove('active');
    });
    document.getElementById('btnSaveSettings').addEventListener('click', () => {
        document.getElementById('settingsModal').classList.remove('active');
    });
}

// --- Voice Source Logic ---

async function toggleVoiceSource(isCloud) {
    if (useCloudTTS === isCloud && allVoices.length > 0) return; // Already set

    useCloudTTS = isCloud;
    console.log("Switched to", useCloudTTS ? "Cloud (Edge)" : "Native");

    // Clear current grid
    voiceGrid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding: 20px;"><div class="spinner"></div><p>Loading...</p></div>';

    try {
        if (useCloudTTS) {
            if (edgeVoices.length === 0) {
                edgeVoices = await edgeTTS.getVoices();
            }
            allVoices = edgeVoices;
        } else {
            const result = await TextToSpeech.getSupportedVoices();
            allVoices = result.voices;
        }

        populateFilters();
        filterVoices();
    } catch (e) {
        console.error("Error loading source", e);
        voiceGrid.innerHTML = '<p>Error loading voices</p>';
    }
}


// --- Logic ---

function setLanguage(lang) {
    if (!translations[lang]) return;
    currentLang = lang;

    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.dataset.i18n;
        if (translations[lang][key]) {
            el.textContent = translations[lang][key];
        }
    });

    const dividerInput = document.getElementById('customDivider');
    if (dividerInput) {
        dividerInput.placeholder = lang === 'es' ? 'Ej: Chapter, ***, ---, Parte' : 'Ex: Chapter, ***, ---, Part';
    }

    console.log(`Language set to ${lang}`);
}

function switchSection(section) {
    [uploadSection, selectSection, progressSection, resultsSection].forEach(s => s.classList.remove('active'));
    section.classList.add('active');
}

async function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        currentFile = file;
        fileNameDisplay.textContent = file.name;

        // Show loading
        dropZone.innerHTML = '<p>Loading...</p>';

        const text = await fileParser.parseFile(file);
        // Restore drop zone text
        dropZone.innerHTML = '<div class="icon">📄</div><p data-i18n="drop_text">Arrastra tu libro aquí</p><p class="subtext" data-i18n="drop_hint">o haz clic para seleccionar</p>';
        setLanguage(currentLang); // refresh i18n

        currentChapters = splitter.split(text);

        renderChapters(currentChapters);
        switchSection(selectSection);

    } catch (error) {
        alert("Error al leer archivo: " + error.message);
        console.error(error);
        dropZone.innerHTML = '<div class="icon">📄</div><p>Error</p>';
        setTimeout(() => setLanguage(currentLang), 2000);
    }
}

function renderChapters(chapters) {
    chapterList.innerHTML = '';
    chapters.forEach(chap => {
        const div = document.createElement('div');
        div.className = 'chapter-item';
        div.innerHTML = `
            <label class="chapter-label" style="display: flex; align-items: center; width: 100%; cursor: pointer;">
                <input type="checkbox" class="chapter-checkbox" data-id="${chap.id}" checked style="margin-right: 12px;">
                <div class="chapter-info">
                    <div class="chapter-title">${chap.titulo}</div>
                    <div class="chapter-meta">${chap.chars} ${currentLang === 'es' ? 'caracteres' : 'characters'}</div>
                </div>
            </label>
        `;
        chapterList.appendChild(div);
    });

    document.querySelectorAll('.chapter-checkbox').forEach(cb => {
        cb.addEventListener('change', updateSelection);
    });
    updateSelection();
}

function updateSelection() {
    const checked = document.querySelectorAll('.chapter-checkbox:checked');
    document.getElementById('selectedCount').textContent = `${checked.length} ${currentLang === 'es' ? 'seleccionados' : 'selected'}`;
    btnConvert.disabled = checked.length === 0;
}

async function loadVoices() {
    await toggleVoiceSource(false); // Default Native
}

function populateFilters() {
    let langs = new Set();

    if (useCloudTTS) {
        allVoices.forEach(v => {
            if (v.Locale) langs.add(v.Locale.split('-')[0]);
        });
    } else {
        allVoices.forEach(v => {
            if (v.lang) langs.add(v.lang.split('-')[0]);
        });
    }

    const sortedLangs = [...langs].sort();

    langSelect.innerHTML = `<option value="">${currentLang === 'es' ? 'Todos los idiomas' : 'All languages'}</option>`;
    sortedLangs.forEach(l => {
        const opt = document.createElement('option');
        opt.value = l;
        opt.textContent = l.toUpperCase();
        langSelect.appendChild(opt);
    });

    if (sortedLangs.includes('es')) {
        langSelect.value = 'es';
    }
}

function filterVoices() {
    const selectedLang = langSelect.value;
    const selectedLocale = localeSelect.value;

    filteredVoices = allVoices.filter(v => {
        const vLang = useCloudTTS ? v.Locale : v.lang;
        const langCode = vLang.split('-')[0];

        if (selectedLang && langCode !== selectedLang) return false;
        if (selectedLocale && vLang !== selectedLocale) return false;
        return true;
    });

    // Populate Locale
    if (selectedLang) {
        const locales = new Set();
        filteredVoices.forEach(v => locales.add(useCloudTTS ? v.Locale : v.lang));
        const sortedLocales = [...locales].sort();

        localeSelect.innerHTML = `<option value="">${currentLang === 'es' ? 'Todas las regiones' : 'All regions'}</option>`;
        sortedLocales.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l;
            opt.textContent = l;
            localeSelect.appendChild(opt);
        });
        localeSelect.style.display = 'block';
        if (sortedLocales.includes(localeSelect.value)) localeSelect.value = localeSelect.value; // Keep selection if valid
        else localeSelect.value = '';
    } else {
        localeSelect.style.display = 'none';
        localeSelect.value = '';
    }

    renderVoiceGrid();
}

let selectedVoiceIndex = null; // Stores index (Native) or ShortName (Cloud)

function renderVoiceGrid() {
    voiceGrid.innerHTML = '';

    if (filteredVoices.length === 0) {
        voiceGrid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; padding: 20px;">${currentLang === 'es' ? 'No hay voces' : 'No voices'}</p>`;
        return;
    }

    filteredVoices.forEach((v, idx) => {
        // Unique ID logic
        // For Native: Use the index in the FULL allVoices array (to pass to capacitor)
        // For Cloud: Use ShortName
        const id = useCloudTTS ? v.ShortName : allVoices.indexOf(v);

        const isSelected = selectedVoiceIndex === id;

        const div = document.createElement('div');
        div.className = `voice-card ${isSelected ? 'selected' : ''}`;

        const name = useCloudTTS ? (v.LocalName || v.ShortName) : (v.name || v.lang);
        const lang = useCloudTTS ? v.Locale : v.lang;
        const gender = useCloudTTS ? v.Gender : '';

        div.innerHTML = `
            <div class="voice-header">
                <div class="voice-info">
                    <div class="voice-name">${name}</div> 
                    <div class="voice-meta">${lang} ${gender ? `• ${gender}` : ''}</div>
                    ${useCloudTTS ? '<span style="font-size:0.7rem; color: #4ade80;">Cloud</span>' : ''}
                </div>
                <button class="btn-preview-voice" title="Preview">▶️</button>
            </div>
        `;

        div.onclick = (e) => {
            if (e.target.classList.contains('btn-preview-voice')) {
                e.stopPropagation();
                previewVoice(v);
                return;
            }
            selectVoice(id, div);
        };
        voiceGrid.appendChild(div);
    });
}

function selectVoice(id, element) {
    document.querySelectorAll('.voice-card').forEach(c => c.classList.remove('selected'));
    element.classList.add('selected');
    selectedVoiceIndex = id;
}

async function previewVoice(voice) {
    const text = currentLang === 'es' ? "Hola, soy una voz de prueba." : "Hello, I am a test voice.";

    if (useCloudTTS) {
        try {
            const blob = await edgeTTS.synthesize(text, voice.ShortName, '+0%');
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.play();
        } catch (err) {
            console.error(err);
            alert("Error: " + err.message);
        }
    } else {
        const idx = allVoices.indexOf(voice);
        try {
            await TextToSpeech.speak({
                text: text,
                voice: idx,
                rate: 1.0,
                lang: voice.lang
            });
        } catch (err) { console.error(err); }
    }
}

async function startConversion() {
    if (isConverting) return;

    if (selectedVoiceIndex === null) {
        alert(currentLang === 'es' ? "Selecciona una voz primero" : "Select a voice first");
        return;
    }

    isConverting = true;
    switchSection(progressSection);

    const checkedBoxes = document.querySelectorAll('.chapter-checkbox:checked');
    const total = checkedBoxes.length;
    let completed = 0;

    // Create folder logic (Cloud only)
    let folderName = "";
    if (useCloudTTS) {
        const bookTitle = fileNameDisplay.textContent.replace(/\.[^/.]+$/, "").replace(/[^a-z0-9]/gi, '_');
        folderName = bookTitle;
        // Try creating directory
        try {
            // Document directory might be messy, maybe create subdirectory VocoAudio
            // For now, root of Documents
        } catch (e) { }
    }

    for (const cb of checkedBoxes) {
        const chapterId = parseInt(cb.dataset.id);
        const chapter = currentChapters.find(c => c.id === chapterId);
        const safeTitle = chapter.titulo.replace(/[^a-z0-9]/gi, '_');

        const statusText = (currentLang === 'es' ? 'Convirtiendo: ' : 'Converting: ') + chapter.titulo;
        document.getElementById('progressStatus').textContent = statusText;

        try {
            if (useCloudTTS) {
                // Cloud: Synthesize and Save
                const blob = await edgeTTS.synthesize(chapter.contenido, selectedVoiceIndex); // selectedVoiceIndex is ShortName

                // Converting Blob to Base64 for Filesystem write
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                await new Promise(resolve => {
                    reader.onloadend = async () => {
                        const base64Data = reader.result.split(',')[1];
                        const fileName = `${folderName}/${safeTitle}.mp3`;

                        try {
                            const written = await Filesystem.writeFile({
                                path: fileName,
                                data: base64Data,
                                directory: Directory.Documents,
                                recursive: true
                            });
                            console.log(`Saved ${fileName}`, written.uri);

                            // Optional: Play the last one or first one?
                            // For now just save.
                        } catch (e) {
                            console.error("Save error", e);
                            alert("Error saving file: " + e.message);
                        }
                        resolve();
                    };
                });

            } else {
                // Native: Speak
                await TextToSpeech.speak({
                    text: chapter.contenido,
                    voice: selectedVoiceIndex,
                    rate: 1.0,
                    lang: 'es-ES'
                });
            }

        } catch (err) {
            console.error("Conversion error", err);
        }

        completed++;
        const percent = Math.round((completed / total) * 100);
        document.getElementById('progressBar').style.width = `${percent}%`;
        document.getElementById('progressPercent').textContent = `${percent}%`;
    }

    isConverting = false;
    switchSection(resultsSection);

    // Final Message
    const msg = currentLang === 'es' ?
        (useCloudTTS ? "Archivos guardados en Documentos" : "Lectura finalizada") :
        (useCloudTTS ? "Files saved to Documents" : "Reading finished");

    document.getElementById('results-header-text').textContent = msg;
}

// Global expose
window.setVoiceSource = toggleVoiceSource;

// I18n Data
const translations = {
    es: {
        title: "Conversor de Audiolibros",
        subtitle: "TXT • PDF • EPUB → MP3",
        step_upload: "Subir",
        step_select: "Seleccionar",
        step_convert: "Convertir",
        drop_text: "Arrastra tu libro aquí",
        drop_hint: "o haz clic para seleccionar • TXT, PDF, EPUB",
        btn_change: "Cambiar",
        voice_title: "🗣️ Voz del narrador",
        voice_lang: "🌐 Idioma",
        divider_title: "✂️ Separador de capítulos",
        chapters_title: "📖 Capítulos a convertir",
        btn_all: "✓ Todos",
        btn_none: "✗ Ninguno",
        btn_convert: "🎙️ Convertir seleccionados",
        results_done: "¡Conversión completada!",
        btn_new: "📚 Convertir otro libro",
        settings_title: "⚙️ Configuración",
        settings_lang: "🌐 Idioma",
        btn_cancel: "Cancelar",
        btn_save: "Aceptar"
    },
    en: {
        title: "Audiobook Converter",
        subtitle: "TXT • PDF • EPUB → MP3",
        step_upload: "Upload",
        step_select: "Select",
        step_convert: "Convert",
        drop_text: "Drag your book here",
        drop_hint: "or click to select • TXT, PDF, EPUB",
        btn_change: "Change",
        voice_title: "🗣️ Narrator Voice",
        voice_lang: "🌐 Language",
        divider_title: "✂️ Chapter Splitter",
        chapters_title: "📖 Chapters to convert",
        btn_all: "✓ All",
        btn_none: "✗ None",
        btn_convert: "🎙️ Convert selected",
        results_done: "Conversion complete!",
        btn_new: "📚 Convert another book",
        settings_title: "⚙️ Settings",
        settings_lang: "🌐 Language",
        btn_cancel: "Cancel",
        btn_save: "OK"
    }
};
