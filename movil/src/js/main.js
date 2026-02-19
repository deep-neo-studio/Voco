
import { API } from './api.js';
import { Filesystem, Directory } from '@capacitor/filesystem';

// --- Global State ---
let currentFileId = null;
let currentChapters = [];
let selectedVoiceId = localStorage.getItem('selected_voice_id') || 'es-MX-JorgeNeural';

// --- UI Elements ---
const screens = {
    connection: document.getElementById('connection-screen'),
    app: document.querySelector('.app-container')
};

const inputs = {
    serverUrl: document.getElementById('server-url'),
    connectBtn: document.getElementById('btn-connect'),
    connError: document.getElementById('connection-error')
};

const ui = {
    fileInput: document.getElementById('file-upload'),
    fileName: document.getElementById('file-name'),
    changeFileBtn: document.getElementById('change-file-btn'),
    languageSelect: document.getElementById('language-select'),
    regionSelect: document.getElementById('region-select'),
    voiceGrid: document.querySelector('.voice-grid'),
    convertBtn: document.getElementById('convert-btn'),
    statusText: document.getElementById('status-text'),
    progressBar: document.querySelector('.progress-fill')
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Check previous connection
    const savedUrl = localStorage.getItem('voco_server_url');
    if (savedUrl) inputs.serverUrl.value = savedUrl;

    // 2. Setup Listeners
    inputs.connectBtn.addEventListener('click', tryConnect);
    ui.fileInput.addEventListener('change', handleFileUpload);
    ui.changeFileBtn.addEventListener('click', () => ui.fileInput.click());
    ui.languageSelect.addEventListener('change', loadVoices);
    ui.convertBtn.addEventListener('click', startConversion);
});

async function tryConnect() {
    const url = inputs.serverUrl.value.trim();
    if (!url) return;

    inputs.connectBtn.disabled = true;
    inputs.connectBtn.textContent = "Conectando...";
    inputs.connError.style.display = 'none';

    API.setBaseUrl(url);
    const isAlive = await API.ping();

    if (isAlive) {
        screens.connection.style.display = 'none';
        await loadLanguages();
    } else {
        inputs.connError.textContent = "No se pudo conectar. Verifica que server.py esté corriendo.";
        inputs.connError.style.display = 'block';
    }
    inputs.connectBtn.disabled = false;
    inputs.connectBtn.textContent = "Conectar";
}

// --- Logic ---

async function loadLanguages() {
    try {
        const languages = await API.getLanguages();
        ui.languageSelect.innerHTML = '';

        let defaultLang = 'es';

        languages.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang.codigo;
            opt.textContent = lang.nombre;
            if (lang.codigo === 'es') opt.selected = true;
            ui.languageSelect.appendChild(opt);
        });

        await loadVoices();
    } catch (e) {
        console.error(e);
        alert("Error cargando idiomas");
    }
}

async function loadVoices() {
    ui.voiceGrid.innerHTML = '<div class="spinner"></div>';
    const langCode = ui.languageSelect.value;

    try {
        const voices = await API.getVoices(langCode);
        renderVoiceGrid(voices);
    } catch (e) {
        ui.voiceGrid.innerHTML = '<p>Error cargando voces</p>';
    }
}

function renderVoiceGrid(voices) {
    ui.voiceGrid.innerHTML = '';

    if (voices.length === 0) {
        ui.voiceGrid.innerHTML = '<p>No hay voces disponibles</p>';
        return;
    }

    voices.forEach(v => {
        const div = document.createElement('div');
        const isSelected = v.id === selectedVoiceId;
        div.className = `voice-card ${isSelected ? 'selected' : ''}`;

        div.innerHTML = `
            <div class="voice-header" onclick="selectVoice('${v.id}')">
                <div class="voice-info">
                    <div class="voice-name">${v.nombre}</div>
                    <div class="voice-meta">${v.region} • ${v.genero}</div>
                </div>
                <button class="btn-preview-voice" onclick="event.stopPropagation(); playPreview('${v.id}')">▶️</button>
            </div>
        `;
        ui.voiceGrid.appendChild(div);
    });
}

window.selectVoice = (id) => {
    selectedVoiceId = id;
    localStorage.setItem('selected_voice_id', id);
    // Re-render to update UI selection
    const cards = document.querySelectorAll('.voice-card');
    cards.forEach(c => c.classList.remove('selected'));
    // Ideally we'd find the specific card, but a full re-render is safer or just toggling classes
    loadVoices(); // Simple refresh
};

window.playPreview = async (voiceId) => {
    const audio = new Audio(`${API.baseUrl}/probar-voz/${voiceId}`);
    audio.play().catch(e => alert("Error reproduciendo audio: " + e.message));
};

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    ui.statusText.textContent = "Subiendo archivo...";
    ui.fileName.textContent = file.name;

    try {
        const res = await API.uploadFile(file);
        currentFileId = res.file_id;
        currentChapters = res.capitulos; // We could render chapters later
        ui.statusText.textContent = `Archivo listo. ${currentChapters.length} capítulos detectados.`;
        ui.convertBtn.disabled = false;

    } catch (err) {
        alert("Error al subir: " + err.message);
        ui.statusText.textContent = "Error al subir.";
        ui.fileName.textContent = "---";
    }
}

async function startConversion() {
    if (!currentFileId) return;

    ui.convertBtn.disabled = true;
    ui.statusText.textContent = "Iniciando conversión remota...";

    try {
        // We select ALL chapters by default for now
        const { job_id } = await API.convert(currentFileId, selectedVoiceId, []);

        monitorJob(job_id);

    } catch (err) {
        alert("Error iniciando: " + err.message);
        ui.convertBtn.disabled = false;
    }
}

async function monitorJob(jobId) {
    const poll = setInterval(async () => {
        try {
            const status = await API.getJobStatus(jobId);

            if (status.estado === 'convirtiendo' || status.estado === 'iniciando') {
                const pct = Math.round((status.actual / status.total) * 100);
                ui.progressBar.style.width = `${pct}%`;
                ui.statusText.textContent = `Convirtiendo: ${pct}% (${status.actual}/${status.total})`;

            } else if (status.estado === 'completado') {
                clearInterval(poll);
                ui.progressBar.style.width = '100%';
                ui.statusText.textContent = "¡Completado! Descargando a tu celular...";
                await downloadResults(jobId);
                ui.convertBtn.disabled = false;

            } else if (status.estado === 'error') {
                clearInterval(poll);
                ui.statusText.textContent = "Error en el servidor: " + status.error;
                ui.convertBtn.disabled = false;
            }

        } catch (e) {
            console.error("Polling error", e);
        }
    }, 1000);
}

async function downloadResults(jobId) {
    try {
        const res = await fetch(`${API.baseUrl}/descargas/${jobId}`);
        const data = await res.json();

        for (const file of data.archivos) {
            ui.statusText.textContent = `Descargando ${file.nombre}...`;

            // Download Blob from Server
            const dlRes = await fetch(API.getDownloadUrl(jobId, file.nombre));
            const blob = await dlRes.blob();

            // Convert to Base64 for Capacitor Filesystem
            const reader = new FileReader();
            reader.readAsDataURL(blob);

            await new Promise((resolve, reject) => {
                reader.onloadend = async () => {
                    const base64Data = reader.result.split(',')[1];
                    try {
                        const fileName = `Audiolibros_Voco/${file.nombre}`;
                        await Filesystem.writeFile({
                            path: fileName,
                            data: base64Data,
                            directory: Directory.Documents,
                            recursive: true
                        });
                        console.log(`Saved ${fileName}`);
                        resolve();
                    } catch (e) {
                        console.error("Save error", e);
                        reject(e);
                    }
                };
                reader.onerror = reject;
            });
        }

        ui.statusText.textContent = "¡Todo guardado en Documentos/Audiolibros_Voco!";
        alert("¡Listo! Archivos guardados en tu carpeta de Documentos.");

    } catch (e) {
        console.error(e);
        alert("Error descargando resultados: " + e.message);
        ui.statusText.textContent = "Error en descarga final.";
    }
}
