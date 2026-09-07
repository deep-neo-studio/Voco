// db.js - IndexedDB Manager para Voco 2
const DB_NAME = 'Voco2_Library_DB';
const DB_VERSION = 1;

class DB {
    constructor() {
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // 1. Libros
                if (!db.objectStoreNames.contains('books')) {
                    const bookStore = db.createObjectStore('books', { keyPath: 'id' });
                    bookStore.createIndex('shelf', 'shelf', { unique: false });
                    bookStore.createIndex('lastReadTimestamp', 'lastReadTimestamp', { unique: false });
                }

                // 2. Capítulos
                if (!db.objectStoreNames.contains('chapters')) {
                    const chapStore = db.createObjectStore('chapters', { keyPath: 'id' });
                    chapStore.createIndex('bookId', 'bookId', { unique: false });
                    chapStore.createIndex('bookId_index', ['bookId', 'index'], { unique: true });
                }

                // 3. Marcadores y Posición de Lectura/Audio
                if (!db.objectStoreNames.contains('bookmarks')) {
                    db.createObjectStore('bookmarks', { keyPath: 'bookId' });
                }

                // 4. Preferencias del usuario
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                console.error("Error abriendo IndexedDB:", event.target.error);
                reject(event.target.error);
            };
        });
    }

    async getStore(storeName, mode = 'readonly') {
        const db = await this.init();
        const tx = db.transaction(storeName, mode);
        return tx.objectStore(storeName);
    }

    // --- MÉTODOS DE LIBROS ---
    async saveBook(book) {
        const store = await this.getStore('books', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(book);
            req.onsuccess = () => resolve(book);
            req.onerror = () => reject(req.error);
        });
    }

    async getBook(id) {
        const store = await this.getStore('books', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async getAllBooks() {
        const store = await this.getStore('books', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    async deleteBook(id) {
        // Borrar el libro y todos sus capítulos asociados
        await this.deleteChaptersByBook(id);
        const store = await this.getStore('books', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject(req.error);
        });
    }

    // --- MÉTODOS DE CAPÍTULOS ---
    async saveChapter(chapter) {
        const store = await this.getStore('chapters', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(chapter);
            req.onsuccess = () => resolve(chapter);
            req.onerror = () => reject(req.error);
        });
    }

    async saveChaptersBatch(chapters) {
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('chapters', 'readwrite');
            const store = tx.objectStore('chapters');
            for (const ch of chapters) {
                store.put(ch);
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    async getChapter(bookId, index) {
        const id = `${bookId}_ch_${index}`;
        const store = await this.getStore('chapters', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(id);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async getChaptersByBook(bookId) {
        const store = await this.getStore('chapters', 'readonly');
        const index = store.index('bookId');
        return new Promise((resolve, reject) => {
            const req = index.getAll(IDBKeyRange.only(bookId));
            req.onsuccess = () => {
                const results = req.result || [];
                // Ordenar por índice numérico
                results.sort((a, b) => a.index - b.index);
                resolve(results);
            };
            req.onerror = () => reject(req.error);
        });
    }

    async deleteChaptersByBook(bookId) {
        const chapters = await this.getChaptersByBook(bookId);
        const db = await this.init();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('chapters', 'readwrite');
            const store = tx.objectStore('chapters');
            for (const ch of chapters) {
                store.delete(ch.id);
            }
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    async updateChapterAudio(bookId, chapterIndex, audioBlob, timestamps, durationSec) {
        const chapter = await this.getChapter(bookId, chapterIndex);
        if (!chapter) throw new Error("Capítulo no encontrado");

        chapter.hasAudio = true;
        chapter.isConverted = true;
        chapter.audioBlob = audioBlob;
        chapter.audioTimestamps = timestamps;
        chapter.audioDurationSec = durationSec || 0;

        await this.saveChapter(chapter);

        // Actualizar estadísticas del libro
        const book = await this.getBook(bookId);
        if (book) {
            const chapters = await this.getChaptersByBook(bookId);
            const convertedCount = chapters.filter(c => c.hasAudio).length;
            book.convertedChapters = convertedCount;
            let totalBytes = 0;
            for (const c of chapters) {
                if (c.audioBlob) totalBytes += c.audioBlob.size;
            }
            book.audioStorageBytes = totalBytes;
            await this.saveBook(book);
        }

        return chapter;
    }

    async deleteChapterAudio(bookId, chapterIndex) {
        const chapter = await this.getChapter(bookId, chapterIndex);
        if (chapter) {
            chapter.hasAudio = false;
            chapter.isConverted = false;
            chapter.audioBlob = null;
            chapter.audioTimestamps = null;
            chapter.audioDurationSec = 0;
            await this.saveChapter(chapter);

            const book = await this.getBook(bookId);
            if (book) {
                const chapters = await this.getChaptersByBook(bookId);
                const convertedCount = chapters.filter(c => c.hasAudio).length;
                book.convertedChapters = convertedCount;
                let totalBytes = 0;
                for (const c of chapters) {
                    if (c.audioBlob) totalBytes += c.audioBlob.size;
                }
                book.audioStorageBytes = totalBytes;
                await this.saveBook(book);
            }
        }
    }

    // --- MÉTODOS DE MARCADOR & SINCRONIZACIÓN ("WHISPERSYNC") ---
    async saveBookmark(bookmark) {
        bookmark.updatedAt = Date.now();
        const store = await this.getStore('bookmarks', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put(bookmark);
            req.onsuccess = () => resolve(bookmark);
            req.onerror = () => reject(req.error);
        });
    }

    async getBookmark(bookId) {
        const store = await this.getStore('bookmarks', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(bookId);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    // --- CONFIGURACIONES ---
    async setSetting(key, value) {
        const store = await this.getStore('settings', 'readwrite');
        return new Promise((resolve, reject) => {
            const req = store.put({ key, value });
            req.onsuccess = () => resolve(value);
            req.onerror = () => reject(req.error);
        });
    }

    async getSetting(key, defaultValue = null) {
        const store = await this.getStore('settings', 'readonly');
        return new Promise((resolve, reject) => {
            const req = store.get(key);
            req.onsuccess = () => {
                resolve(req.result ? req.result.value : defaultValue);
            };
            req.onerror = () => reject(req.error);
        });
    }
}

export const db = new DB();
