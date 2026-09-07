// txt-parser.js - Parser inteligente para archivos de texto plano y novelas web
export class TxtParser {
    static async parse(file) {
        const text = await this.readFileAsText(file);
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        
        // Detección de título y autor a partir del nombre del archivo si es posible
        let title = fileName.replace(/[-_]+/g, ' ').trim();
        let author = 'Desconocido';

        // Intenta dividir por " - " o " by "
        if (title.includes(' - ')) {
            const parts = title.split(' - ');
            title = parts[0].trim();
            author = parts.slice(1).join(' - ').trim();
        }

        const chapters = this.splitIntoChapters(text, title);

        return {
            title,
            author,
            format: 'txt',
            rawText: text,
            chapters
        };
    }

    static readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file, 'utf-8');
        });
    }

    static splitIntoChapters(text, defaultBookTitle) {
        // Expresión regular para detectar títulos de capítulos comunes en novelas y libros
        // Ej: "Capítulo 1: El despertar", "Chapter 42", "C105 - Batalla", "Parte 2", "Prólogo", "Epílogo"
        const chapterPattern = /(?:^|\n{2,})(?:(CAP[IÍ]TULO\s+\d+[^\n]*|CHAPTER\s+\d+[^\n]*|PARTE\s+\d+[^\n]*|SECCI[OÓ]N\s+\d+[^\n]*|\bC\d+\s*[-:][^\n]*|PR[OÓ]LOGO[^\n]*|EP[IÍ]LOGO[^\n]*))/i;

        const lines = text.split('\n');
        const detectedHeaders = [];

        // Escanear líneas para encontrar encabezados de capítulo
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const isHeading = /^(CAP[IÍ]TULO\s+\d+|CHAPTER\s+\d+|PARTE\s+\d+|SECCI[OÓ]N\s+\d+|\bC\d+\s*[-:]|PR[OÓ]LOGO|EP[IÍ]LOGO)/i.test(line);
            if (isHeading && line.length < 120) {
                detectedHeaders.push({ lineIndex: i, title: line });
            }
        }

        let chapters = [];

        if (detectedHeaders.length >= 2) {
            // Dividir según los encabezados detectados
            for (let i = 0; i < detectedHeaders.length; i++) {
                const cur = detectedHeaders[i];
                const next = detectedHeaders[i + 1];

                const startLine = cur.lineIndex;
                const endLine = next ? next.lineIndex : lines.length;

                const chapterLines = lines.slice(startLine + 1, endLine);
                const chapterContent = chapterLines.join('\n').trim();

                const paragraphs = this.extractParagraphs(chapterContent);
                const wordCount = (chapterContent.match(/\b\w+\b/g) || []).length;

                if (paragraphs.length > 0 || chapterContent.length > 0) {
                    chapters.push({
                        index: chapters.length,
                        title: cur.title,
                        content: chapterContent,
                        paragraphs: paragraphs,
                        wordCount: wordCount,
                        hasAudio: false,
                        audioBlob: null,
                        audioTimestamps: null,
                        audioDurationSec: 0,
                        isConverted: false
                    });
                }
            }
        }

        // Si no se detectaron encabezados o hay muy pocos, dividimos por bloques de lectura cómodos (~3000 palabras)
        if (chapters.length === 0) {
            const paragraphs = this.extractParagraphs(text);
            const CHUNK_WORDS = 2500;
            let curChunkParagraphs = [];
            let curWords = 0;

            for (const p of paragraphs) {
                const wordsInP = (p.text.match(/\b\w+\b/g) || []).length;
                curChunkParagraphs.push(p);
                curWords += wordsInP;

                if (curWords >= CHUNK_WORDS) {
                    const chapterText = curChunkParagraphs.map(cp => cp.text).join('\n\n');
                    chapters.push({
                        index: chapters.length,
                        title: `Capítulo ${chapters.length + 1}`,
                        content: chapterText,
                        paragraphs: curChunkParagraphs,
                        wordCount: curWords,
                        hasAudio: false,
                        audioBlob: null,
                        audioTimestamps: null,
                        audioDurationSec: 0,
                        isConverted: false
                    });
                    curChunkParagraphs = [];
                    curWords = 0;
                }
            }

            if (curChunkParagraphs.length > 0) {
                const chapterText = curChunkParagraphs.map(cp => cp.text).join('\n\n');
                chapters.push({
                    index: chapters.length,
                    title: `Capítulo ${chapters.length + 1}`,
                    content: chapterText,
                    paragraphs: curChunkParagraphs,
                    wordCount: curWords,
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

    static extractParagraphs(rawText) {
        // Divide en párrafos por saltos de línea dobles o simples con sangría
        const rawParts = rawText.split(/\n\s*\n/);
        const paragraphs = [];
        let pIndex = 0;

        for (const part of rawParts) {
            const clean = part.replace(/\s+/g, ' ').trim();
            if (clean.length > 0) {
                paragraphs.push({
                    id: pIndex++,
                    text: clean
                });
            }
        }

        return paragraphs;
    }
}
