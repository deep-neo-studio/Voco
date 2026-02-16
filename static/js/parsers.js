import * as pdfjsLib from './pdf.mjs';
// We assume JSZip is loaded globally or imported if we use a bundler. 
// For standalone without bundler, we might need to rely on global `JSZip`.

export class LocalParser {
    static async readFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();

        if (ext === 'txt') {
            return await this.readTXT(file);
        } else if (ext === 'pdf') {
            return await this.readPDF(file);
        } else if (ext === 'epub') {
            return await this.readEPUB(file);
        } else {
            throw new Error(`Formato .${ext} no soportado`);
        }
    }

    static async readTXT(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    static async readPDF(file) {
        // Set worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'static/js/pdf.worker.mjs';

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        return fullText;
    }

    static async readEPUB(file) {
        // Requires JSZip. Since we are using a simple script approach, we assume JSZip is available globally or we use a library that handles it.
        // Actually, extracting text from EPUB manually is complex. 
        // Better to use 'epubjs' library or unzip content.opf -> find html files -> extract text.
        // For simplicity and robustness, let's use JSZip to read container.xml -> content.opf -> spine -> htmls

        if (!window.JSZip) throw new Error("JSZip no cargado");

        const zip = new JSZip();
        const content = await zip.loadAsync(file);

        // 1. Find rootfile in META-INF/container.xml
        const container = await content.file("META-INF/container.xml").async("string");
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(container, "text/xml");
        const rootPath = xmlDoc.getElementsByTagName("rootfile")[0].getAttribute("full-path");

        // 2. Read content.opf
        const opf = await content.file(rootPath).async("string");
        const opfDoc = parser.parseFromString(opf, "text/xml");
        const manifest = opfDoc.getElementsByTagName("manifest")[0];
        const spine = opfDoc.getElementsByTagName("spine")[0];

        // Map id -> href
        const idToHref = {};
        Array.from(manifest.getElementsByTagName("item")).forEach(item => {
            idToHref[item.getAttribute("id")] = item.getAttribute("href");
        });

        // 3. Iterate spine
        let fullText = '';
        const opfDir = rootPath.split('/').slice(0, -1).join('/');

        for (let item of Array.from(spine.getElementsByTagName("itemref"))) {
            const id = item.getAttribute("idref");
            let href = idToHref[id];
            if (opfDir) href = opfDir + '/' + href;

            // Decrypt? No, assume standard epub
            const htmlContent = await content.file(href).async("string");

            // Extract text from HTML
            const doc = parser.parseFromString(htmlContent, "text/html");
            fullText += doc.body.textContent + '\n\n';
        }

        return fullText;
    }

    static splitChapters(text, separator) {
        let chapters = [];

        const pattern = separator
            ? new RegExp(`(${separator})`, 'i')
            : /(CAP[IÍ]TULO\s+\d+|CHAPTER\s+\d+|PARTE\s+\d+|SECCI[OÓ]N\s+\d+)/i;

        const parts = text.split(pattern);

        // Reassemble regex splits which usually include the separator
        // If split by regex with capturing group, the separator is included in the array.
        // [pre, sep, post, sep, post...]

        if (parts.length < 3 && !separator) {
            // Fallback to chunking
            const CHUNK_SIZE = 5000;
            for (let i = 0; i < text.length; i += CHUNK_SIZE) {
                chapters.push({
                    id: i,
                    titulo: `Parte ${Math.floor(i / CHUNK_SIZE) + 1}`,
                    contenido: text.slice(i, i + CHUNK_SIZE),
                    chars: Math.min(CHUNK_SIZE, text.length - i)
                });
            }
            return chapters;
        }

        let currentTitle = "Inicio";
        let currentContent = parts[0];

        if (currentContent.trim()) {
            chapters.push({ id: 0, titulo: currentTitle, contenido: currentContent, chars: currentContent.length });
        }

        let idCounter = 1;
        for (let i = 1; i < parts.length; i += 2) {
            const title = parts[i];
            const content = parts[i + 1];
            if (content && content.trim()) {
                chapters.push({
                    id: idCounter++,
                    titulo: title.trim().substring(0, 50),
                    contenido: content,
                    chars: content.length
                });
            }
        }

        return chapters;
    }
}
