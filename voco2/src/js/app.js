// app.js - Orquestador principal de Voco 2
import { db } from './db.js';
import { LibraryView } from './library/library-view.js';
import { ReaderView } from './reader/reader-view.js';
import { EpubParser } from './parsers/epub-parser.js';
import { PdfParser } from './parsers/pdf-parser.js';
import { TxtParser } from './parsers/txt-parser.js';
import { CoverGenerator } from './library/cover-generator.js';
import { VoiceManager } from './audio/voice-manager.js';
import { TTSEngine } from './audio/tts-engine.js';
import { audioPlayer } from './audio/audio-player.js';

class VocoApp {
    constructor() {
        this.libraryView = null;
        this.readerView = null;
        this.currentBook = null;
        this.activeVoices = [];
        this.selectedVoice = 'es-MX-JorgeNeural';

        // Modales y pantallas
        this.libraryScreen = document.getElementById('libraryScreen');
        this.readerScreen = document.getElementById('readerScreen');
        this.audioStudioModal = document.getElementById('audioStudioModal');
        this.expandedPlayerModal = document.getElementById('expandedPlayerModal');
        this.settingsModal = document.getElementById('settingsModal');
        this.tocDrawer = document.getElementById('tocDrawer');
        this.miniPlayer = document.getElementById('miniPlayer');

        // Controles globales
        this.btnImport = document.getElementById('btnImport');
        this.fileInput = document.getElementById('fileInput');
        this.btnBackToLibrary = document.getElementById('btnBackToLibrary');
        this.btnOpenSettings = document.getElementById('btnOpenSettings');
        this.btnReaderSettings = document.getElementById('btnReaderSettings');
        this.btnOpenToc = document.getElementById('btnOpenToc');
        this.btnCloseToc = document.getElementById('btnCloseToc');
    }

    async init() {
        console.log("🚀 Iniciando Voco 2...");

        // Inicializar vistas
        this.libraryView = new LibraryView(
            (book) => this.openReader(book),
            (book) => this.openAudioStudio(book),
            (book) => this.startAudiobookPlayback(book)
        );

        this.readerView = new ReaderView();

        // Cargar preferencias
        await this.loadPreferences();

        // Configurar listeners
        this.setupNavigationListeners();
        this.setupImportListeners();
        this.setupMiniPlayerListeners();
        this.setupExpandedPlayerListeners();
        this.setupAudioStudioListeners();
        this.setupSettingsListeners();

        // Cargar catálogo de voces en segundo plano
        this.loadVoiceCatalog();

        // Refrescar biblioteca
        await this.libraryView.refresh();

        console.log("✅ Voco 2 listo");
    }

    async loadPreferences() {
        const theme = await db.getSetting('theme', 'amoled');
        const fontSize = await db.getSetting('fontSize', 18);
        const fontFamily = await db.getSetting('fontFamily', 'Inter');
        const lineHeight = await db.getSetting('lineHeight', '1.8');
        this.selectedVoice = await db.getSetting('ttsVoice', 'es-MX-JorgeNeural');

        this.readerView.setTheme(theme);
        this.readerView.setFontSize(fontSize);
        this.readerView.setFontFamily(fontFamily);
        this.readerView.setLineHeight(lineHeight);

        // Actualizar selector de tema en UI si existe
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) themeSelect.value = theme;
        const fontSelect = document.getElementById('fontFamilySelect');
        if (fontSelect) fontSelect.value = fontFamily;
    }

    async loadVoiceCatalog() {
        try {
            this.activeVoices = await VoiceManager.getVoices();
            const voiceSelect = document.getElementById('voiceSelect');
            if (voiceSelect) {
                voiceSelect.innerHTML = this.activeVoices.map(v => {
                    const id = v.ShortName || v.id;
                    const name = v.FriendlyName || v.name;
                    const flag = v.Flag || '🗣️';
                    const isSelected = (id === this.selectedVoice) ? 'selected' : '';
                    return `<option value="${id}" ${isSelected}>${flag} ${name}</option>`;
                }).join('');
            }
        } catch (e) {
            console.warn("Error cargando catálogo de voces:", e);
        }
    }

    // --- NAVEGACIÓN Y PANTALLAS ---
    setupNavigationListeners() {
        if (this.btnBackToLibrary) {
            this.btnBackToLibrary.addEventListener('click', () => {
                this.readerScreen.classList.remove('active');
                this.libraryScreen.classList.add('active');
                this.libraryView.refresh();
            });
        }

        if (this.btnOpenToc) {
            this.btnOpenToc.addEventListener('click', () => this.openTocDrawer());
        }

        if (this.btnCloseToc) {
            this.btnCloseToc.addEventListener('click', () => {
                this.tocDrawer.classList.remove('active');
            });
        }

        // Botón de audio en la barra del lector
        const btnReaderAudio = document.getElementById('btnReaderAudio');
        if (btnReaderAudio) {
            btnReaderAudio.addEventListener('click', () => {
                if (this.readerView.currentChapter && this.readerView.currentChapter.hasAudio) {
                    this.startAudiobookPlayback(this.readerView.currentBook, this.readerView.currentChapter.index);
                } else {
                    this.openAudioStudio(this.readerView.currentBook, this.readerView.currentChapter ? this.readerView.currentChapter.index : 0);
                }
            });
        }
    }

    async openReader(book, chapterIndex = 0) {
        this.currentBook = book;
        this.libraryScreen.classList.remove('active');
        this.readerScreen.classList.add('active');

        await this.readerView.openBook(book, chapterIndex);
    }

    async openTocDrawer() {
        if (!this.readerView.currentBook) return;
        const chapters = await db.getChaptersByBook(this.readerView.currentBook.id);
        const listEl = document.getElementById('tocList');
        if (!listEl) return;

        listEl.innerHTML = chapters.map(ch => {
            const isActive = (this.readerView.currentChapter && this.readerView.currentChapter.index === ch.index) ? 'active' : '';
            const audioBadge = ch.hasAudio ? `<span class="toc-audio-badge">🎧</span>` : '';
            return `
                <li class="toc-item ${isActive}" data-chapter-index="${ch.index}">
                    <span class="toc-title">${this.escapeHtml(ch.title)}</span>
                    ${audioBadge}
                </li>
            `;
        }).join('');

        listEl.querySelectorAll('.toc-item').forEach(item => {
            item.addEventListener('click', async () => {
                const idx = parseInt(item.getAttribute('data-chapter-index'), 10);
                this.tocDrawer.classList.remove('active');
                await this.readerView.loadChapter(idx);
            });
        });

        this.tocDrawer.classList.add('active');
    }

    // --- IMPORTADOR DE LIBROS ---
    setupImportListeners() {
        if (this.btnImport && this.fileInput) {
            this.btnImport.addEventListener('click', () => this.fileInput.click());

            this.fileInput.addEventListener('change', async (e) => {
                const files = e.target.files;
                if (!files || files.length === 0) return;

                for (let i = 0; i < files.length; i++) {
                    await this.importFile(files[i]);
                }

                this.fileInput.value = '';
                await this.libraryView.refresh();
            });
        }

        // Drag and drop en la biblioteca
        window.addEventListener('dragover', (e) => e.preventDefault());
        window.addEventListener('drop', async (e) => {
            e.preventDefault();
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                for (let i = 0; i < e.dataTransfer.files.length; i++) {
                    await this.importFile(e.dataTransfer.files[i]);
                }
                await this.libraryView.refresh();
            }
        });
    }

    async importFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        this.showToast(`Importando "${file.name}"...`);

        try {
            let parsed = null;
            if (ext === 'epub') {
                parsed = await EpubParser.parse(file);
            } else if (ext === 'pdf') {
                parsed = await PdfParser.parse(file);
            } else if (ext === 'txt') {
                parsed = await TxtParser.parse(file);
            } else {
                alert(`Formato .${ext} no soportado. Usa EPUB, PDF o TXT.`);
                return;
            }

            const bookId = 'book_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
            const coverUrl = parsed.coverUrl || CoverGenerator.generate(parsed.title, parsed.author, bookId);

            const newBook = {
                id: bookId,
                title: parsed.title,
                author: parsed.author,
                coverUrl: coverUrl,
                format: ext,
                shelf: 'reading',
                totalChapters: parsed.chapters.length,
                currentChapterIndex: 0,
                readingProgress: 0,
                convertedChapters: 0,
                audioStorageBytes: 0,
                lastReadTimestamp: Date.now(),
                createdAt: Date.now()
            };

            await db.saveBook(newBook);

            // Guardar capítulos vinculados al libro
            const chaptersWithBookId = parsed.chapters.map((ch, idx) => ({
                ...ch,
                id: `${bookId}_ch_${idx}`,
                bookId: bookId,
                index: idx
            }));

            await db.saveChaptersBatch(chaptersWithBookId);
            this.showToast(`¡"${parsed.title}" importado con éxito! (${parsed.chapters.length} caps)`);
        } catch (err) {
            console.error("Error importando libro:", err);
            alert(`Error al procesar el archivo: ${err.message}`);
        }
    }

    // --- REPRODUCTOR Y SINCRONIZACIÓN WHISPERSYNC ---
    async startAudiobookPlayback(book, chapterIndex = null) {
        this.currentBook = book;
        const chapters = await db.getChaptersByBook(book.id);

        let targetChapter = null;
        let startParagraphId = null;

        if (chapterIndex !== null) {
            targetChapter = chapters.find(c => c.index === chapterIndex);
        } else {
            // Revisar marcador previo
            const bookmark = await db.getBookmark(book.id);
            if (bookmark && bookmark.chapterIndex !== undefined) {
                targetChapter = chapters.find(c => c.index === bookmark.chapterIndex);
                startParagraphId = bookmark.paragraphId;
            } else {
                // Primer capítulo que tenga audio
                targetChapter = chapters.find(c => c.hasAudio) || chapters[0];
            }
        }

        if (!targetChapter || !targetChapter.hasAudio) {
            // Ofrecer convertir
            if (confirm(`El capítulo "${targetChapter ? targetChapter.title : 'actual'}" aún no tiene audio. ¿Deseas convertirlo ahora?`)) {
                this.openAudioStudio(book, targetChapter ? targetChapter.index : 0);
            }
            return;
        }

        await audioPlayer.loadChapter(book, targetChapter, true, startParagraphId);
        this.updateMiniPlayerUI(book, targetChapter);
        this.miniPlayer.classList.add('visible');

        // Si el lector está abierto en el mismo libro, sincronizar
        if (this.readerScreen.classList.contains('active') && this.readerView.currentBook && this.readerView.currentBook.id === book.id) {
            if (this.readerView.currentChapter && this.readerView.currentChapter.index !== targetChapter.index) {
                await this.readerView.loadChapter(targetChapter.index);
            }
        }
    }

    setupMiniPlayerListeners() {
        const btnPlayPause = document.getElementById('miniPlayPause');
        const btnMiniExpand = document.getElementById('miniExpand');
        const btnMiniForward = document.getElementById('miniForward');

        if (btnPlayPause) {
            btnPlayPause.addEventListener('click', (e) => {
                e.stopPropagation();
                audioPlayer.toggle();
            });
        }

        if (btnMiniForward) {
            btnMiniForward.addEventListener('click', (e) => {
                e.stopPropagation();
                audioPlayer.seekRelative(15);
            });
        }

        if (btnMiniExpand) {
            btnMiniExpand.addEventListener('click', () => {
                this.openExpandedPlayer();
            });
        }

        // Listener de actualización del reproductor
        audioPlayer.on('play', () => {
            if (btnPlayPause) btnPlayPause.innerHTML = '⏸';
            const expPlay = document.getElementById('expPlayPause');
            if (expPlay) expPlay.innerHTML = '⏸';
        });

        audioPlayer.on('pause', () => {
            if (btnPlayPause) btnPlayPause.innerHTML = '▶';
            const expPlay = document.getElementById('expPlayPause');
            if (expPlay) expPlay.innerHTML = '▶';
        });

        audioPlayer.on('timeupdate', ({ currentTime, duration, progress }) => {
            const miniFill = document.getElementById('miniProgressBar');
            if (miniFill) miniFill.style.width = `${progress}%`;

            const expFill = document.getElementById('expProgressFill');
            if (expFill) expFill.style.width = `${progress}%`;

            const curText = document.getElementById('expTimeCurrent');
            if (curText) curText.textContent = this.formatTime(currentTime);

            const durText = document.getElementById('expTimeTotal');
            if (durText) durText.textContent = this.formatTime(duration);
        });

        audioPlayer.on('ended', async () => {
            // Auto-avanzar al siguiente capítulo si tiene audio
            if (audioPlayer.currentBook && audioPlayer.currentChapter) {
                const nextIdx = audioPlayer.currentChapter.index + 1;
                const chapters = await db.getChaptersByBook(audioPlayer.currentBook.id);
                const nextChap = chapters.find(c => c.index === nextIdx);
                if (nextChap && nextChap.hasAudio) {
                    await this.startAudiobookPlayback(audioPlayer.currentBook, nextIdx);
                }
            }
        });
    }

    updateMiniPlayerUI(book, chapter) {
        const titleEl = document.getElementById('miniBookTitle');
        const chapEl = document.getElementById('miniChapterTitle');
        const coverEl = document.getElementById('miniCover');

        if (titleEl) titleEl.textContent = book.title;
        if (chapEl) chapEl.textContent = chapter.title;
        if (coverEl && book.coverUrl) coverEl.src = book.coverUrl;
    }

    // --- REPRODUCTOR EXPANDIDO ---
    setupExpandedPlayerListeners() {
        const btnClose = document.getElementById('btnCloseExpandedPlayer');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                this.expandedPlayerModal.classList.remove('active');
            });
        }

        const btnPlay = document.getElementById('expPlayPause');
        if (btnPlay) {
            btnPlay.addEventListener('click', () => audioPlayer.toggle());
        }

        const btnRew = document.getElementById('expRewind');
        if (btnRew) {
            btnRew.addEventListener('click', () => audioPlayer.seekRelative(-15));
        }

        const btnFwd = document.getElementById('expForward');
        if (btnFwd) {
            btnFwd.addEventListener('click', () => audioPlayer.seekRelative(15));
        }

        // Scrubber en la barra de progreso
        const track = document.getElementById('expProgressBarWrap');
        if (track) {
            track.addEventListener('click', (e) => {
                const rect = track.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const ratio = Math.max(0, Math.min(1, clickX / rect.width));
                if (audioPlayer.audio.duration) {
                    audioPlayer.seek(ratio * audioPlayer.audio.duration);
                }
            });
        }

        // Selector de velocidad
        const speedBtn = document.getElementById('btnExpSpeed');
        const speeds = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0];
        let speedIdx = 1;
        if (speedBtn) {
            speedBtn.addEventListener('click', () => {
                speedIdx = (speedIdx + 1) % speeds.length;
                const newSpeed = speeds[speedIdx];
                audioPlayer.setPlaybackRate(newSpeed);
                speedBtn.textContent = `${newSpeed}x`;
            });
        }

        // Temporizador de sueño
        const sleepBtn = document.getElementById('btnExpSleep');
        if (sleepBtn) {
            sleepBtn.addEventListener('click', () => {
                const choice = prompt("Temporizador de Sueño (minutos) o escribe 'cap' para fin de capítulo:", "30");
                if (choice) {
                    if (choice.toLowerCase().startsWith('c')) {
                        audioPlayer.setSleepTimer('end_of_chapter');
                        this.showToast("Temporizador: Al terminar el capítulo");
                    } else {
                        const mins = parseInt(choice, 10);
                        if (!isNaN(mins) && mins > 0) {
                            audioPlayer.setSleepTimer(mins);
                            this.showToast(`Temporizador activado por ${mins} min`);
                        }
                    }
                }
            });
        }

        // Botón "Ver en el lector" desde el reproductor expandido (Whispersync)
        const btnGoReader = document.getElementById('btnExpGoToReader');
        if (btnGoReader) {
            btnGoReader.addEventListener('click', () => {
                this.expandedPlayerModal.classList.remove('active');
                if (audioPlayer.currentBook && audioPlayer.currentChapter) {
                    this.openReader(audioPlayer.currentBook, audioPlayer.currentChapter.index);
                }
            });
        }
    }

    openExpandedPlayer() {
        if (!audioPlayer.currentBook || !audioPlayer.currentChapter) return;

        const coverEl = document.getElementById('expCover');
        const titleEl = document.getElementById('expBookTitle');
        const chapEl = document.getElementById('expChapterTitle');
        const authorEl = document.getElementById('expAuthor');

        if (coverEl) coverEl.src = audioPlayer.currentBook.coverUrl;
        if (titleEl) titleEl.textContent = audioPlayer.currentBook.title;
        if (chapEl) chapEl.textContent = audioPlayer.currentChapter.title;
        if (authorEl) authorEl.textContent = audioPlayer.currentBook.author || 'Desconocido';

        this.expandedPlayerModal.classList.add('active');
    }

    // --- ESTUDIO DE CONVERSIÓN DE AUDIO ---
    setupAudioStudioListeners() {
        const btnClose = document.getElementById('btnCloseStudio');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                this.audioStudioModal.classList.remove('active');
            });
        }

        const voiceSelect = document.getElementById('voiceSelect');
        if (voiceSelect) {
            voiceSelect.addEventListener('change', (e) => {
                this.selectedVoice = e.target.value;
                db.setSetting('ttsVoice', this.selectedVoice);
            });
        }

        const btnStartConvert = document.getElementById('btnStartConversion');
        if (btnStartConvert) {
            btnStartConvert.addEventListener('click', () => this.runConversion());
        }
    }

    async openAudioStudio(book, preselectedChapterIdx = 0) {
        this.studioBook = book;
        const chapters = await db.getChaptersByBook(book.id);

        const listEl = document.getElementById('studioChapterList');
        if (listEl) {
            listEl.innerHTML = chapters.map(ch => {
                const checked = (ch.index === preselectedChapterIdx) ? 'checked' : '';
                const hasAudioBadge = ch.hasAudio ? `<span class="badge-converted">✓ Ya convertido</span>` : '';
                return `
                    <label class="studio-chapter-item">
                        <input type="checkbox" name="studio_chap" value="${ch.index}" ${checked} />
                        <span class="chap-title">${this.escapeHtml(ch.title)} (${ch.wordCount || 0} palabras)</span>
                        ${hasAudioBadge}
                    </label>
                `;
            }).join('');
        }

        // Selección masiva
        const btnSelectAll = document.getElementById('btnSelectAllChapters');
        if (btnSelectAll) {
            btnSelectAll.onclick = () => {
                const boxes = listEl.querySelectorAll('input[type="checkbox"]');
                const allChecked = Array.from(boxes).every(b => b.checked);
                boxes.forEach(b => b.checked = !allChecked);
            };
        }

        const bookTitleEl = document.getElementById('studioBookTitle');
        if (bookTitleEl) bookTitleEl.textContent = book.title;

        this.audioStudioModal.classList.add('active');
    }

    async runConversion() {
        const listEl = document.getElementById('studioChapterList');
        const checkedBoxes = listEl.querySelectorAll('input[type="checkbox"]:checked');
        const selectedIndices = Array.from(checkedBoxes).map(b => parseInt(b.value, 10));

        if (selectedIndices.length === 0) {
            alert("Por favor selecciona al menos un capítulo para convertir.");
            return;
        }

        const progressBox = document.getElementById('studioProgressBox');
        const progressBar = document.getElementById('studioProgressBar');
        const progressText = document.getElementById('studioProgressText');
        const btnStart = document.getElementById('btnStartConversion');

        if (progressBox) progressBox.style.display = 'block';
        if (btnStart) btnStart.disabled = true;

        const tts = new TTSEngine({ voice: this.selectedVoice });
        const chapters = await db.getChaptersByBook(this.studioBook.id);

        for (let i = 0; i < selectedIndices.length; i++) {
            const chapIdx = selectedIndices[i];
            const chapter = chapters.find(c => c.index === chapIdx);
            if (!chapter) continue;

            const basePct = Math.round((i / selectedIndices.length) * 100);

            try {
                if (progressText) {
                    progressText.textContent = `[${i + 1}/${selectedIndices.length}] Convirtiendo "${chapter.title}"...`;
                }

                const { audioBlob, timestamps, durationSec } = await tts.synthesizeChapter(
                    chapter,
                    (pct, status) => {
                        const overall = Math.round(basePct + (pct / selectedIndices.length));
                        if (progressBar) progressBar.style.width = `${overall}%`;
                        if (progressText) progressText.textContent = `[${i + 1}/${selectedIndices.length}] ${status}`;
                    }
                );

                // Guardar en la base de datos local
                await db.updateChapterAudio(this.studioBook.id, chapIdx, audioBlob, timestamps, durationSec);
            } catch (err) {
                console.error(`Error convirtiendo capítulo ${chapter.title}:`, err);
                alert(`Error al convertir "${chapter.title}": ${err.message}`);
            }
        }

        if (progressBar) progressBar.style.width = '100%';
        if (progressText) progressText.textContent = '¡Conversión completa!';
        if (btnStart) btnStart.disabled = false;

        this.showToast(`¡${selectedIndices.length} capítulo(s) convertidos a audiolibro!`);
        await this.libraryView.refresh();

        setTimeout(() => {
            this.audioStudioModal.classList.remove('active');
            if (progressBox) progressBox.style.display = 'none';
        }, 1200);
    }

    // --- CONFIGURACIÓN ---
    setupSettingsListeners() {
        if (this.btnOpenSettings) {
            this.btnOpenSettings.addEventListener('click', () => {
                this.settingsModal.classList.add('active');
            });
        }
        if (this.btnReaderSettings) {
            this.btnReaderSettings.addEventListener('click', () => {
                this.settingsModal.classList.add('active');
            });
        }

        const btnClose = document.getElementById('btnCloseSettings');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                this.settingsModal.classList.remove('active');
            });
        }

        // Temas
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            themeSelect.addEventListener('change', (e) => {
                this.readerView.setTheme(e.target.value);
            });
        }

        // Tipografías
        const fontSelect = document.getElementById('fontFamilySelect');
        if (fontSelect) {
            fontSelect.addEventListener('change', (e) => {
                this.readerView.setFontFamily(e.target.value);
            });
        }

        // Tamaño de fuente
        const sizeRange = document.getElementById('fontSizeRange');
        if (sizeRange) {
            sizeRange.addEventListener('input', (e) => {
                this.readerView.setFontSize(e.target.value);
            });
        }

        // Botón para limpiar todos los audios de la base de datos
        const btnClearAllAudio = document.getElementById('btnClearAllAudio');
        if (btnClearAllAudio) {
            btnClearAllAudio.addEventListener('click', async () => {
                if (confirm("¿Estás seguro de eliminar todos los archivos de audio generados para liberar espacio? (Los libros de texto no se borrarán).")) {
                    const books = await db.getAllBooks();
                    for (const b of books) {
                        const chapters = await db.getChaptersByBook(b.id);
                        for (const c of chapters) {
                            if (c.hasAudio) {
                                await db.deleteChapterAudio(b.id, c.index);
                            }
                        }
                    }
                    this.showToast("Caché de audio liberada por completo");
                    await this.libraryView.refresh();
                }
            });
        }
    }

    // --- UTILIDADES ---
    showToast(message) {
        let toast = document.getElementById('vocoToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'vocoToast';
            toast.className = 'voco-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3200);
    }

    formatTime(sec) {
        if (!sec || isNaN(sec)) return '0:00';
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }
}

// Iniciar aplicación al cargar el DOM
window.addEventListener('DOMContentLoaded', () => {
    window.vocoApp = new VocoApp();
    window.vocoApp.init();
});
