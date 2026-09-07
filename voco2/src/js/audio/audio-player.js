// audio-player.js - Reproductor de audiolibros con MediaSession API y sincronización
export class AudioPlayer {
    constructor() {
        this.audio = new Audio();
        this.currentBook = null;
        this.currentChapter = null;
        this.timestamps = [];
        this.isPlaying = false;
        this.activeParagraphId = null;
        this.listeners = new Map();
        this.sleepTimerId = null;
        this.sleepTimerEndTime = null;

        this._setupAudioListeners();
        this._setupMediaSession();
    }

    _setupAudioListeners() {
        this.audio.addEventListener('timeupdate', () => {
            const curTime = this.audio.currentTime;
            const duration = this.audio.duration || 0;

            // Encontrar el párrafo activo según las marcas de tiempo
            const activeP = this._findActiveParagraph(curTime);
            if (activeP !== this.activeParagraphId) {
                this.activeParagraphId = activeP;
                this.emit('paragraphchange', {
                    paragraphId: activeP,
                    currentTime: curTime
                });
            }

            this.emit('timeupdate', {
                currentTime: curTime,
                duration: duration,
                progress: duration > 0 ? (curTime / duration) * 100 : 0
            });
        });

        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            this._updateMediaSessionPlaybackState('playing');
            this.emit('play');
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this._updateMediaSessionPlaybackState('paused');
            this.emit('pause');
        });

        this.audio.addEventListener('ended', () => {
            this.isPlaying = false;
            this._updateMediaSessionPlaybackState('none');
            this.emit('ended');
        });

        this.audio.addEventListener('error', (e) => {
            console.error("Error en reproductor de audio:", e);
            this.isPlaying = false;
            this.emit('error', e);
        });
    }

    _findActiveParagraph(currentTime) {
        if (!this.timestamps || this.timestamps.length === 0) return null;

        // Búsqueda del párrafo cuyo intervalo [start, end] contenga currentTime
        for (let i = 0; i < this.timestamps.length; i++) {
            const item = this.timestamps[i];
            if (currentTime >= item.start && currentTime <= item.end) {
                return item.paragraphId;
            }
        }

        // Si pasa del último
        if (currentTime >= this.timestamps[this.timestamps.length - 1].end) {
            return this.timestamps[this.timestamps.length - 1].paragraphId;
        }

        return this.timestamps[0].paragraphId;
    }

    async loadChapter(book, chapter, autoPlay = false, startParagraphId = null) {
        if (!chapter || !chapter.audioBlob) {
            throw new Error("El capítulo no tiene audio generado");
        }

        this.currentBook = book;
        this.currentChapter = chapter;
        this.timestamps = chapter.audioTimestamps || [];

        // Revocar URL anterior si existe
        if (this.currentAudioUrl) {
            URL.revokeObjectURL(this.currentAudioUrl);
        }

        this.currentAudioUrl = URL.createObjectURL(chapter.audioBlob);
        this.audio.src = this.currentAudioUrl;
        this.audio.load();

        this._updateMediaSessionMetadata();

        if (startParagraphId !== null) {
            const pTime = this.getParagraphStartTime(startParagraphId);
            if (pTime !== null) {
                this.audio.currentTime = pTime;
            }
        }

        if (autoPlay) {
            try {
                await this.audio.play();
            } catch (err) {
                console.warn("Autoplay bloqueado por el navegador:", err);
            }
        }
    }

    play() {
        return this.audio.play();
    }

    pause() {
        this.audio.pause();
    }

    toggle() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    seek(seconds) {
        if (!this.audio.duration) return;
        const newTime = Math.max(0, Math.min(this.audio.duration, seconds));
        this.audio.currentTime = newTime;
    }

    seekRelative(offsetSeconds) {
        this.seek(this.audio.currentTime + offsetSeconds);
    }

    seekToParagraph(paragraphId) {
        const startTime = this.getParagraphStartTime(paragraphId);
        if (startTime !== null) {
            this.seek(startTime);
            return true;
        }
        return false;
    }

    getParagraphStartTime(paragraphId) {
        if (!this.timestamps) return null;
        const match = this.timestamps.find(t => t.paragraphId === paragraphId);
        return match ? match.start : null;
    }

    setPlaybackRate(rate) {
        this.audio.playbackRate = rate;
        this.emit('ratechange', rate);
    }

    // --- SLEEP TIMER ---
    setSleepTimer(minutes) {
        this.clearSleepTimer();
        if (minutes === 'end_of_chapter') {
            const onEnd = () => {
                this.pause();
                this.off('ended', onEnd);
                this.emit('sleeptimertick', { remainingSec: 0, active: false });
            };
            this.on('ended', onEnd);
            this.emit('sleeptimerstart', { mode: 'chapter' });
            return;
        }

        const ms = minutes * 60 * 1000;
        this.sleepTimerEndTime = Date.now() + ms;

        this.sleepTimerId = setTimeout(() => {
            this.pause();
            this.clearSleepTimer();
            this.emit('sleeptimerdone');
        }, ms);

        this.emit('sleeptimerstart', { mode: 'time', minutes });
    }

    clearSleepTimer() {
        if (this.sleepTimerId) {
            clearTimeout(this.sleepTimerId);
            this.sleepTimerId = null;
        }
        this.sleepTimerEndTime = null;
        this.emit('sleeptimercancel');
    }

    // --- MEDIASESSION API (Notificaciones nativas Android & Pantalla de Bloqueo) ---
    _setupMediaSession() {
        if (!('mediaSession' in navigator)) return;

        navigator.mediaSession.setActionHandler('play', () => this.play());
        navigator.mediaSession.setActionHandler('pause', () => this.pause());
        navigator.mediaSession.setActionHandler('seekbackward', () => this.seekRelative(-15));
        navigator.mediaSession.setActionHandler('seekforward', () => this.seekRelative(15));
        navigator.mediaSession.setActionHandler('previoustrack', () => this.emit('requestprevchapter'));
        navigator.mediaSession.setActionHandler('nexttrack', () => this.emit('requestnextchapter'));
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) {
                this.seek(details.seekTime);
            }
        });
    }

    _updateMediaSessionMetadata() {
        if (!('mediaSession' in navigator) || !this.currentBook) return;

        const artwork = [];
        if (this.currentBook.coverUrl) {
            artwork.push({
                src: this.currentBook.coverUrl,
                sizes: '512x512',
                type: 'image/png'
            });
        }

        navigator.mediaSession.metadata = new MediaMetadata({
            title: this.currentChapter ? this.currentChapter.title : 'Capítulo',
            artist: this.currentBook.author || 'Voco Narrator',
            album: this.currentBook.title || 'Audiolibro',
            artwork: artwork
        });
    }

    _updateMediaSessionPlaybackState(state) {
        if (!('mediaSession' in navigator)) return;
        navigator.mediaSession.playbackState = state;
    }

    // --- EVENT EMITTER ---
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const filtered = this.listeners.get(event).filter(cb => cb !== callback);
        this.listeners.set(event, filtered);
    }

    emit(event, data) {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event).forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error(`Error en listener de evento ${event}:`, e);
            }
        });
    }
}

export const audioPlayer = new AudioPlayer();
