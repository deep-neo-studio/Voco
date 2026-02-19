export class ChapterSplitter {
    constructor() {
        this.defaultPattern = /(CAP[IÍ]TULO\s+\d+|CHAPTER\s+\d+|PARTE\s+\d+|SECCI[OÓ]N\s+\d+|Cap[ií]tulo\s+\d+|Chapter\s+\d+|Parte\s+\d+)/i;
    }

    split(text, customSeparator = null) {
        let matches = [];
        if (customSeparator && customSeparator.trim()) {
            const sep = customSeparator.trim();
            // Escape special regex characters
            const escapedSep = sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pattern = new RegExp(`(${escapedSep})`, 'g');
            matches = [...text.matchAll(pattern)];
        } else {
            matches = [...text.matchAll(new RegExp(this.defaultPattern, 'g'))];
        }

        if (!matches || matches.length === 0) {
            // Fallback: split by chunks
            const chunks = [];
            const cleanText = text.trim();
            const chunkSize = 5000;
            for (let i = 0; i < cleanText.length; i += chunkSize) {
                chunks.push({
                    id: Math.floor(i / chunkSize),
                    titulo: `Parte ${(Math.floor(i / chunkSize) + 1).toString().padStart(3, '0')}`,
                    contenido: cleanText.substring(i, i + chunkSize),
                    chars: Math.min(chunkSize, cleanText.length - i)
                });
            }
            return chunks.length > 0 ? chunks : [{ id: 0, titulo: "Completo", contenido: text, chars: text.length }];
        }

        const chapters = [];
        for (let i = 0; i < matches.length; i++) {
            const match = matches[i];
            const nameOriginal = match[0].trim();
            const start = match.index + match[0].length;
            const end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
            const content = text.substring(start, end).trim();

            chapters.push({
                id: i,
                titulo: nameOriginal,
                contenido: content,
                chars: content.length
            });
        }
        return chapters;
    }
}
