// sync-engine.js - Motor de sincronización bimodal Whispersync y Read-Along
import { db } from '../db.js';
import { audioPlayer } from '../audio/audio-player.js';

export class SyncEngine {
    constructor(readerContainerEl) {
        this.container = readerContainerEl;
        this.currentBook = null;
        this.currentChapter = null;
        this.activeParagraphEl = null;
        this.autoScrollEnabled = true;
        this.readAlongEnabled = true;

        this._setupPlayerSync();
        this._setupTapToSpeak();
    }

    init(book, chapter) {
        this.currentBook = book;
        this.currentChapter = chapter;
        this.activeParagraphEl = null;
    }

    _setupPlayerSync() {
        // Escuchar cambios de párrafo en el audio
        audioPlayer.on('paragraphchange', ({ paragraphId, currentTime }) => {
            if (!this.readAlongEnabled) return;
            this.highlightParagraph(paragraphId, true);

            // Guardar marcador automáticamente mientras se escucha
            if (this.currentBook && this.currentChapter) {
                db.saveBookmark({
                    bookId: this.currentBook.id,
                    chapterIndex: this.currentChapter.index,
                    paragraphId: paragraphId,
                    audioTimeSec: currentTime
                });
            }
        });
    }

    _setupTapToSpeak() {
        // Al tocar un párrafo, permitir saltar el audio directamente a ese punto
        this.container.addEventListener('click', (e) => {
            const pEl = e.target.closest('.reader-p');
            if (!pEl) return;

            const pId = parseInt(pEl.getAttribute('data-p-id'), 10);
            if (isNaN(pId)) return;

            // Si el capítulo actual tiene audio, saltar a ese párrafo
            if (this.currentChapter && this.currentChapter.hasAudio) {
                const jumped = audioPlayer.seekToParagraph(pId);
                if (jumped) {
                    this.highlightParagraph(pId, false);
                    if (!audioPlayer.isPlaying) {
                        audioPlayer.play();
                    }
                }
            } else {
                // Notificar que se tocó un párrafo pero no hay audio aún
                this.highlightParagraph(pId, false);
            }

            // Guardar marcador visual
            if (this.currentBook && this.currentChapter) {
                db.saveBookmark({
                    bookId: this.currentBook.id,
                    chapterIndex: this.currentChapter.index,
                    paragraphId: pId,
                    audioTimeSec: audioPlayer.getParagraphStartTime(pId) || 0
                });
            }
        });
    }

    highlightParagraph(paragraphId, shouldAutoScroll = true) {
        if (paragraphId === null || paragraphId === undefined) return;

        // Quitar resaltado anterior
        if (this.activeParagraphEl) {
            this.activeParagraphEl.classList.remove('read-along-active');
        }

        // Buscar nuevo elemento
        const targetEl = this.container.querySelector(`[data-p-id="${paragraphId}"]`);
        if (!targetEl) return;

        targetEl.classList.add('read-along-active');
        this.activeParagraphEl = targetEl;

        // Auto-scroll suave manteniendo el texto en el tercio superior de la pantalla
        if (shouldAutoScroll && this.autoScrollEnabled) {
            const rect = targetEl.getBoundingClientRect();
            const containerRect = this.container.getBoundingClientRect();
            
            // Si el elemento está fuera de la zona visible o muy abajo
            const targetY = targetEl.offsetTop - (this.container.clientHeight * 0.28);
            this.container.scrollTo({
                top: Math.max(0, targetY),
                behavior: 'smooth'
            });
        }
    }

    async restoreLastBookmark() {
        if (!this.currentBook) return null;
        const bookmark = await db.getBookmark(this.currentBook.id);
        if (bookmark && bookmark.paragraphId !== undefined) {
            this.highlightParagraph(bookmark.paragraphId, true);
            return bookmark;
        }
        return null;
    }

    setAutoScroll(enabled) {
        this.autoScrollEnabled = enabled;
    }

    setReadAlong(enabled) {
        this.readAlongEnabled = enabled;
        if (!enabled && this.activeParagraphEl) {
            this.activeParagraphEl.classList.remove('read-along-active');
        }
    }
}
