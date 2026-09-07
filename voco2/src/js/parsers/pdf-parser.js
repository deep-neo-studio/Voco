// pdf-parser.js - Parser para PDFs con extracción de texto y detección de capítulos
import * as pdfjsLib from '../../../www/static/js/pdf.mjs';

export class PdfParser {
    static async parse(file) {
        const base = (document.baseURI || window.location.href).replace(/\/[^/]*$/, '/');
        pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'static/js/pdf.worker.mjs';

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        const totalPages = pdf.numPages;

        const pagesLines = [];
        for (let i = 1; i <= totalPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const lines = this.extractPageLines(textContent);
            pagesLines.push(lines);
        }

        const cleanedPages = this.cleanHeadersAndFooters(pagesLines);
        const fileName = file.name.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();

        // Detectar capítulos
        const chapters = this.groupPagesIntoChapters(cleanedPages, fileName);

        return {
            title: fileName,
            author: 'Desconocido',
            format: 'pdf',
            totalPages,
            chapters
        };
    }

    static extractPageLines(textContent) {
        if (!textContent || !textContent.items || textContent.items.length === 0) return [];

        const lines = [];
        let currentLine = [];
        let currentY = null;

        for (const item of textContent.items) {
            const str = item.str || '';
            const y = item.transform ? Math.round(item.transform[5]) : null;
            const isNewLine = item.hasEOL || (currentY !== null && y !== null && Math.abs(y - currentY) > 4);

            if (isNewLine) {
                if (str.trim()) currentLine.push(str);
                const lineStr = currentLine.join(' ').replace(/\s+/g, ' ').trim();
                if (lineStr) lines.push(lineStr);
                currentLine = [];
                currentY = y;
            } else {
                if (str.trim()) currentLine.push(str);
                if (currentY === null && y !== null) currentY = y;
            }
        }

        if (currentLine.length > 0) {
            const lineStr = currentLine.join(' ').replace(/\s+/g, ' ').trim();
            if (lineStr) lines.push(lineStr);
        }

        return lines;
    }

    static cleanHeadersAndFooters(pagesLines) {
        if (!pagesLines || pagesLines.length === 0) return [];
        const totalPages = pagesLines.length;

        // Limpieza básica de números de página y encabezados recurrentes
        return pagesLines.map(lines => {
            return lines.filter(l => {
                const norm = l.trim();
                // Ignorar líneas que solo son números de página (ej "12", "- 12 -", "Pág. 12")
                if (/^[-—~]?\s*\d+\s*[-—~]?$/.test(norm)) return false;
                if (/^p[aá]g(?:ina)?\.?\s*\d+$/i.test(norm)) return false;
                return true;
            });
        });
    }

    static groupPagesIntoChapters(pagesLines, defaultTitle) {
        // Agrupa por detección de "Capítulo / Chapter" o cada ~10 páginas
        const chapters = [];
        let curChapTitle = 'Inicio';
        let curChapLines = [];
        let chapterCounter = 1;

        for (let pIdx = 0; pIdx < pagesLines.length; pIdx++) {
            const lines = pagesLines[pIdx];

            for (const line of lines) {
                const isChapterMatch = /^(CAP[IÍ]TULO\s+\d+|CHAPTER\s+\d+|PARTE\s+\d+|\bC\d+\s*[-:])/i.test(line);

                if (isChapterMatch && curChapLines.length > 20) {
                    // Guardar capítulo anterior
                    const fullText = curChapLines.join('\n\n');
                    const paragraphs = this.linesToParagraphs(curChapLines);
                    const words = (fullText.match(/\b\w+\b/g) || []).length;

                    chapters.push({
                        index: chapters.length,
                        title: curChapTitle,
                        content: paragraphs.map(p => `<p class="reader-p" data-p-id="${p.id}">${p.text}</p>`).join('\n'),
                        paragraphs: paragraphs,
                        wordCount: words,
                        hasAudio: false,
                        audioBlob: null,
                        audioTimestamps: null,
                        audioDurationSec: 0,
                        isConverted: false
                    });

                    curChapTitle = line;
                    curChapLines = [];
                } else {
                    curChapLines.push(line);
                }
            }
        }

        // Último capítulo
        if (curChapLines.length > 0) {
            const fullText = curChapLines.join('\n\n');
            const paragraphs = this.linesToParagraphs(curChapLines);
            const words = (fullText.match(/\b\w+\b/g) || []).length;

            chapters.push({
                index: chapters.length,
                title: curChapTitle,
                content: paragraphs.map(p => `<p class="reader-p" data-p-id="${p.id}">${p.text}</p>`).join('\n'),
                paragraphs: paragraphs,
                wordCount: words,
                hasAudio: false,
                audioBlob: null,
                audioTimestamps: null,
                audioDurationSec: 0,
                isConverted: false
            });
        }

        // Si no se detectó ningún capítulo largo, agrupar por bloques de 5 páginas
        if (chapters.length <= 1 && pagesLines.length > 8) {
            chapters.length = 0;
            const PAGES_PER_CHAP = 5;
            for (let i = 0; i < pagesLines.length; i += PAGES_PER_CHAP) {
                const groupLines = pagesLines.slice(i, i + PAGES_PER_CHAP).flat();
                const paragraphs = this.linesToParagraphs(groupLines);
                const fullText = groupLines.join(' ');
                const words = (fullText.match(/\b\w+\b/g) || []).length;

                chapters.push({
                    index: chapters.length,
                    title: `Páginas ${i + 1} - ${Math.min(i + PAGES_PER_CHAP, pagesLines.length)}`,
                    content: paragraphs.map(p => `<p class="reader-p" data-p-id="${p.id}">${p.text}</p>`).join('\n'),
                    paragraphs: paragraphs,
                    wordCount: words,
                    hasAudio: false,
                    audioBlob: null,
                    audioTimestamps: null,
                    audioDurationSec: 0,
                    isConverted: false
                });
            }
        }

        return chapters;
    }

    static linesToParagraphs(lines) {
        const paragraphs = [];
        let pIndex = 0;
        let curBuffer = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
                if (curBuffer.length > 0) {
                    paragraphs.push({ id: pIndex++, text: curBuffer.join(' ') });
                    curBuffer = [];
                }
            } else {
                curBuffer.push(trimmed);
            }
        }
        if (curBuffer.length > 0) {
            paragraphs.push({ id: pIndex++, text: curBuffer.join(' ') });
        }

        return paragraphs;
    }
}
