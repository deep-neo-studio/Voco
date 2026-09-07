// reader-view.js - Gestor de la interfaz y renderizado del lector E-Reader
import { db } from '../db.js';
import { SyncEngine } from './sync-engine.js';
import { audioPlayer } from '../audio/audio-player.js';

export class ReaderView {
    constructor() {
        this.currentBook = null;
        this.currentChapter = null;
        this.chapters = [];
        this.syncEngine = null;

        // Elementos DOM
        this.readerScreen = document.getElementById('readerScreen');
        this.readerBody = document.getElementById('readerBody');
        this.readerTitle = document.getElementById('readerTitle');
        this.readerChapterName = document.getElementById('readerChapterName');
        this.readerProgressText = document.getElementById('readerProgressText');
        this.btnPrevChapter = document.getElementById('btnPrevChapter');
        this.btnNextChapter = document.getElementById('btnNextChapter');
        this.btnReaderAudio = document.getElementById('btnReaderAudio');

        this._setupListeners();
    }

    _setupListeners() {
        if (this.btnPrevChapter) {
            this.btnPrevChapter.addEventListener('click', () => this.navigateChapter(-1));
        }
        if (this.btnNextChapter) {
            this.btnNextChapter.addEventListener('click', () => this.navigateChapter(1));
        }

        // Configuración de SyncEngine sobre el contenedor del cuerpo del lector
        if (this.readerBody) {
            this.syncEngine = new SyncEngine(this.readerBody);
        }
    }

    async openBook(book, chapterIndex = 0) {
        this.currentBook = book;
        this.chapters = await db.getChaptersByBook(book.id);

        if (this.chapters.length === 0) {
            alert("Este libro no tiene capítulos registrados");
            return;
        }

        // Revisar si había un marcador guardado
        const bookmark = await db.getBookmark(book.id);
        const targetChapterIndex = (bookmark && bookmark.chapterIndex !== undefined)
            ? bookmark.chapterIndex
            : chapterIndex;

        await this.loadChapter(Math.max(0, Math.min(targetChapterIndex, this.chapters.length - 1)));
        
        // Restaurar marcador visual si existe
        setTimeout(() => {
            if (this.syncEngine) {
                this.syncEngine.restoreLastBookmark();
            }
        }, 150);
    }

    async loadChapter(index) {
        if (index < 0 || index >= this.chapters.length) return;

        const chapter = this.chapters[index];
        this.currentChapter = chapter;

        // Actualizar UI
        if (this.readerTitle) this.readerTitle.textContent = this.currentBook.title;
        if (this.readerChapterName) this.readerChapterName.textContent = chapter.title;
        if (this.readerProgressText) {
            this.readerProgressText.textContent = `Cap. ${index + 1} de ${this.chapters.length}`;
        }

        // Renderizar párrafos
        if (this.readerBody) {
            if (chapter.content && chapter.content.includes('<p')) {
                this.readerBody.innerHTML = chapter.content;
            } else if (chapter.paragraphs && chapter.paragraphs.length > 0) {
                this.readerBody.innerHTML = chapter.paragraphs.map(p => {
                    return `<p class="reader-p" data-p-id="${p.id}">${p.text}</p>`;
                }).join('\n');
            } else {
                this.readerBody.innerHTML = `<p class="reader-p" data-p-id="0">${chapter.content || 'Sin contenido'}</p>`;
            }

            this.readerBody.scrollTo(0, 0);
        }

        // Actualizar SyncEngine
        if (this.syncEngine) {
            this.syncEngine.init(this.currentBook, this.currentChapter);
        }

        // Actualizar botón de audio en el encabezado
        this.updateAudioButtonState();

        // Actualizar estado de navegación
        if (this.btnPrevChapter) this.btnPrevChapter.disabled = (index === 0);
        if (this.btnNextChapter) this.btnNextChapter.disabled = (index === this.chapters.length - 1);

        // Guardar progreso en el libro
        this.currentBook.currentChapterIndex = index;
        this.currentBook.readingProgress = Math.round(((index + 1) / this.chapters.length) * 100);
        this.currentBook.lastReadTimestamp = Date.now();
        await db.saveBook(this.currentBook);
    }

    updateAudioButtonState() {
        if (!this.btnReaderAudio) return;

        if (this.currentChapter && this.currentChapter.hasAudio) {
            this.btnReaderAudio.innerHTML = `<span>🎧</span> Escuchar`;
            this.btnReaderAudio.classList.remove('btn-convert-prompt');
            this.btnReaderAudio.classList.add('btn-audio-ready');
        } else {
            this.btnReaderAudio.innerHTML = `<span>⚡</span> Convertir`;
            this.btnReaderAudio.classList.add('btn-convert-prompt');
            this.btnReaderAudio.classList.remove('btn-audio-ready');
        }
    }

    async navigateChapter(direction) {
        if (!this.currentChapter) return;
        const newIndex = this.currentChapter.index + direction;
        await this.loadChapter(newIndex);
    }

    // --- TEMAS Y AJUSTES TIPOGRÁFICOS ---
    setTheme(theme) {
        // 'amoled' | 'dark' | 'sepia' | 'light'
        document.documentElement.setAttribute('data-theme', theme);
        db.setSetting('theme', theme);
    }

    setFontSize(sizePx) {
        document.documentElement.style.setProperty('--reader-font-size', `${sizePx}px`);
        db.setSetting('fontSize', sizePx);
    }

    setFontFamily(font) {
        document.documentElement.style.setProperty('--reader-font-family', font);
        db.setSetting('fontFamily', font);
    }

    setLineHeight(val) {
        document.documentElement.style.setProperty('--reader-line-height', val);
        db.setSetting('lineHeight', val);
    }
}
