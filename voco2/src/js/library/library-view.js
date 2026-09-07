// library-view.js - Gestor y renderizador de la biblioteca de libros y audiolibros
import { db } from '../db.js';
import { CoverGenerator } from './cover-generator.js';

export class LibraryView {
    constructor(onBookSelect, onBookConvert, onBookListen) {
        this.onBookSelect = onBookSelect;
        this.onBookConvert = onBookConvert;
        this.onBookListen = onBookListen;

        this.gridContainer = document.getElementById('booksGrid');
        this.searchInput = document.getElementById('searchBooksInput');
        this.shelfTabs = document.querySelectorAll('.shelf-tab');
        this.storageIndicatorEl = document.getElementById('storageIndicator');

        this.books = [];
        this.currentFilter = 'all'; // 'all' | 'reading' | 'audio-ready' | 'finished'
        this.searchQuery = '';

        this._setupListeners();
    }

    _setupListeners() {
        if (this.searchInput) {
            this.searchInput.addEventListener('input', (e) => {
                this.searchQuery = e.target.value.toLowerCase().trim();
                this.render();
            });
        }

        if (this.shelfTabs) {
            this.shelfTabs.forEach(tab => {
                tab.addEventListener('click', () => {
                    this.shelfTabs.forEach(t => t.classList.remove('active'));
                    tab.classList.add('active');
                    this.currentFilter = tab.getAttribute('data-shelf') || 'all';
                    this.render();
                });
            });
        }
    }

    async refresh() {
        this.books = await db.getAllBooks();
        // Ordenar por última lectura más reciente
        this.books.sort((a, b) => (b.lastReadTimestamp || 0) - (a.lastReadTimestamp || 0));
        this.render();
        this.updateStorageIndicator();
    }

    render() {
        if (!this.gridContainer) return;

        let filtered = this.books;

        // Filtro por estantería
        if (this.currentFilter === 'reading') {
            filtered = filtered.filter(b => (b.readingProgress || 0) > 0 && (b.readingProgress || 0) < 100);
        } else if (this.currentFilter === 'audio-ready') {
            filtered = filtered.filter(b => (b.convertedChapters || 0) > 0);
        } else if (this.currentFilter === 'finished') {
            filtered = filtered.filter(b => (b.readingProgress || 0) >= 100);
        }

        // Filtro por búsqueda
        if (this.searchQuery) {
            filtered = filtered.filter(b => 
                (b.title && b.title.toLowerCase().includes(this.searchQuery)) ||
                (b.author && b.author.toLowerCase().includes(this.searchQuery))
            );
        }

        if (filtered.length === 0) {
            this.gridContainer.innerHTML = `
                <div class="empty-library">
                    <div class="empty-icon">📚</div>
                    <h3>Tu biblioteca está lista</h3>
                    <p>Agrega libros en formato EPUB, PDF o TXT para empezar a leer y convertirlos en audiolibros sincronizados.</p>
                </div>
            `;
            return;
        }

        this.gridContainer.innerHTML = filtered.map(book => this._createBookCardHtml(book)).join('');

        // Vincular eventos de cada tarjeta
        this._bindCardEvents();
    }

    _createBookCardHtml(book) {
        // Asegurar que tenga carátula
        const coverSrc = book.coverUrl || CoverGenerator.generate(book.title, book.author, book.id);
        const formatBadge = (book.format || 'txt').toUpperCase();
        const progress = Math.min(100, Math.max(0, book.readingProgress || 0));
        const hasAudio = (book.convertedChapters || 0) > 0;
        const audioBadge = hasAudio 
            ? `<span class="badge-audio" title="${book.convertedChapters} capítulos con audio">🎧 ${book.convertedChapters}/${book.totalChapters}</span>`
            : '';

        const storageMb = book.audioStorageBytes ? (book.audioStorageBytes / (1024 * 1024)).toFixed(1) : 0;
        const storageBadge = storageMb > 0 ? `<span class="badge-storage">${storageMb} MB</span>` : '';

        return `
            <div class="book-card" data-book-id="${book.id}">
                <div class="book-cover-wrap">
                    <img src="${coverSrc}" alt="${this.escapeHtml(book.title)}" class="book-cover-img" loading="lazy" />
                    <span class="badge-format">${formatBadge}</span>
                    ${audioBadge}
                    ${storageBadge}
                    <div class="card-overlay">
                        <button class="btn-card-action btn-read-card" title="Leer">📖 Leer</button>
                        ${hasAudio ? `<button class="btn-card-action btn-listen-card" title="Escuchar">🎧 Escuchar</button>` : ''}
                        <button class="btn-card-action btn-convert-card" title="Estudio de Audio">⚡ Convertir</button>
                    </div>
                </div>
                <div class="book-info">
                    <h4 class="book-title" title="${this.escapeHtml(book.title)}">${this.escapeHtml(book.title)}</h4>
                    <p class="book-author">${this.escapeHtml(book.author || 'Desconocido')}</p>
                    <div class="progress-bar-wrap">
                        <div class="progress-bar-fill" style="width: ${progress}%;"></div>
                    </div>
                    <div class="book-meta-footer">
                        <span>${progress}% leído</span>
                        <span>${book.totalChapters || 1} caps</span>
                    </div>
                </div>
            </div>
        `;
    }

    _bindCardEvents() {
        this.gridContainer.querySelectorAll('.book-card').forEach(card => {
            const bookId = card.getAttribute('data-book-id');
            const book = this.books.find(b => b.id === bookId);
            if (!book) return;

            // Clic en la tarjeta (abrir lector)
            card.addEventListener('click', (e) => {
                if (e.target.closest('.btn-card-action')) return;
                this.onBookSelect(book);
            });

            // Botón Leer
            const btnRead = card.querySelector('.btn-read-card');
            if (btnRead) {
                btnRead.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.onBookSelect(book);
                });
            }

            // Botón Escuchar
            const btnListen = card.querySelector('.btn-listen-card');
            if (btnListen) {
                btnListen.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.onBookListen(book);
                });
            }

            // Botón Convertir
            const btnConvert = card.querySelector('.btn-convert-card');
            if (btnConvert) {
                btnConvert.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.onBookConvert(book);
                });
            }
        });
    }

    async updateStorageIndicator() {
        if (!this.storageIndicatorEl) return;

        let totalAudioBytes = 0;
        let convertedBooksCount = 0;

        for (const b of this.books) {
            if (b.audioStorageBytes) totalAudioBytes += b.audioStorageBytes;
            if (b.convertedChapters > 0) convertedBooksCount++;
        }

        const mb = (totalAudioBytes / (1024 * 1024)).toFixed(1);
        this.storageIndicatorEl.innerHTML = `
            <span>💾 Audios locales: <strong>${mb} MB</strong> (${convertedBooksCount} libros)</span>
        `;
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
