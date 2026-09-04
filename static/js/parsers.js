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
        const pagesLines = [];

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const lines = this.extractPageLines(textContent);
            pagesLines.push(lines);
        }

        return this.cleanHeadersAndFooters(pagesLines);
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
        if (!pagesLines || pagesLines.length === 0) return '';

        const totalPages = pagesLines.length;
        const pagePrefixRegex = /^(.*?(?:p[aá]g(?:ina)?\.?|page)\s*\d+)(.*)$/i;

        const topFixedCounts = new Map();
        const topTemplateCounts = new Map();
        const bottomFixedCounts = new Map();
        const bottomTemplateCounts = new Map();

        for (const lines of pagesLines) {
            if (!lines || lines.length === 0) continue;

            const topLines = lines.slice(0, 3);
            for (const line of topLines) {
                const norm = line.replace(/\s+/g, ' ').trim();
                topFixedCounts.set(norm, (topFixedCounts.get(norm) || 0) + 1);

                const match = norm.match(pagePrefixRegex);
                const prefix = match ? match[1].trim() : norm;
                const template = prefix.replace(/\d+/g, '#').trim();
                topTemplateCounts.set(template, (topTemplateCounts.get(template) || 0) + 1);
            }

            const bottomLines = lines.slice(-3);
            for (const line of bottomLines) {
                const norm = line.replace(/\s+/g, ' ').trim();
                bottomFixedCounts.set(norm, (bottomFixedCounts.get(norm) || 0) + 1);

                const match = norm.match(pagePrefixRegex);
                const prefix = match ? match[1].trim() : norm;
                const template = prefix.replace(/\d+/g, '#').trim();
                bottomTemplateCounts.set(template, (bottomTemplateCounts.get(template) || 0) + 1);
            }
        }

        const threshold = totalPages >= 5 ? Math.max(3, Math.floor(totalPages * 0.15)) : 2;

        const detectedTopTemplates = new Set();
        for (const [tmpl, count] of topTemplateCounts.entries()) {
            if (count >= threshold && (tmpl.includes('#') || tmpl.length > 5)) {
                detectedTopTemplates.add(tmpl);
            }
        }

        const detectedTopFixed = new Set();
        for (const [fixed, count] of topFixedCounts.entries()) {
            if (count >= threshold && fixed.length > 3) {
                detectedTopFixed.add(fixed);
            }
        }

        const detectedBottomTemplates = new Set();
        for (const [tmpl, count] of bottomTemplateCounts.entries()) {
            if (count >= threshold && (tmpl.includes('#') || tmpl.length > 5)) {
                detectedBottomTemplates.add(tmpl);
            }
        }

        const detectedBottomFixed = new Set();
        for (const [fixed, count] of bottomFixedCounts.entries()) {
            if (count >= threshold && fixed.length > 3) {
                detectedBottomFixed.add(fixed);
            }
        }

        const isolatedNumberRegex = /^[-—~•·|/]?\s*\d{1,5}\s*[-—~•·|/]?$/;
        const isolatedPageRegex = /^(?:p[aá]g(?:ina)?\.?|page)\s*\d+(?:\s*(?:de|\/)\s*\d+)?$/i;
        const compoundMarginRegex = /^(?:[^\n]{2,60}?\s*[-–—|•·/]\s*(?:p[aá]g(?:ina)?\.?|page)\s*\d+(?:\s*(?:de|\/)\s*\d+)?|(?:p[aá]g(?:ina)?\.?|page)\s*\d+(?:\s*(?:de|\/)\s*\d+)?\s*[-–—|•·/]\s*[^\n]{2,60})$/i;

        function matchTemplate(text, templates) {
            const m = text.match(pagePrefixRegex);
            const pref = m ? m[1].trim() : text;
            const tmpl = pref.replace(/\d+/g, '#').trim();
            return { matches: templates.has(tmpl), match: m };
        }

        let totalRemoved = 0;
        const cleanedPages = [];

        for (const lines of pagesLines) {
            if (!lines || lines.length === 0) continue;
            const resLines = [...lines];

            // 1. Limpiar margen superior (TOP)
            let idx = 0;
            while (idx < Math.min(3, resLines.length)) {
                const line = resLines[idx].trim();
                const norm = line.replace(/\s+/g, ' ');

                if (detectedTopFixed.has(norm)) {
                    resLines.splice(idx, 1);
                    totalRemoved++;
                    continue;
                }

                const { matches, match } = matchTemplate(norm, detectedTopTemplates);
                if (matches) {
                    totalRemoved++;
                    if (match && match[2].trim()) {
                        resLines[idx] = match[2].trim();
                        break;
                    } else {
                        resLines.splice(idx, 1);
                        continue;
                    }
                }

                if (isolatedNumberRegex.test(norm) || isolatedPageRegex.test(norm) || compoundMarginRegex.test(norm)) {
                    resLines.splice(idx, 1);
                    totalRemoved++;
                    continue;
                }

                idx++;
            }

            // 2. Limpiar margen inferior (BOTTOM)
            let checkedBottom = 0;
            while (resLines.length > 0 && checkedBottom < 3) {
                const line = resLines[resLines.length - 1].trim();
                const norm = line.replace(/\s+/g, ' ');

                if (detectedBottomFixed.has(norm)) {
                    resLines.pop();
                    totalRemoved++;
                    checkedBottom++;
                    continue;
                }

                const { matches, match } = matchTemplate(norm, detectedBottomTemplates);
                if (matches) {
                    totalRemoved++;
                    if (match && match[2].trim()) {
                        resLines[resLines.length - 1] = match[2].trim();
                        break;
                    } else {
                        resLines.pop();
                        checkedBottom++;
                        continue;
                    }
                }

                if (isolatedNumberRegex.test(norm) || isolatedPageRegex.test(norm) || compoundMarginRegex.test(norm)) {
                    resLines.pop();
                    totalRemoved++;
                    checkedBottom++;
                    continue;
                }

                break;
            }

            if (resLines.length > 0) {
                cleanedPages.push(resLines.join('\n'));
            }
        }

        if (totalRemoved > 0) {
            console.log(`🧹 [PDF Clean] Se removieron ${totalRemoved} encabezados y pies de página repetitivos.`);
        }

        return cleanedPages.join('\n\n');
    }

    static async readEPUB(file) {
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

            const htmlContent = await content.file(href).async("string");
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

        if (parts.length < 3 && !separator) {
            // Fallback to chunking
            const CHUNK_SIZE = 5000;
            for (let i = 0; i < text.length; i += CHUNK_SIZE) {
                const chunk = text.slice(i, i + CHUNK_SIZE);
                const words = (chunk.match(/\b\w+\b/g) || []).length;
                if (words < 30) continue;
                chapters.push({
                    id: i,
                    titulo: `Parte ${Math.floor(i / CHUNK_SIZE) + 1}`,
                    contenido: chunk,
                    chars: Math.min(CHUNK_SIZE, text.length - i),
                    palabras: words,
                    tiempo_estimado_min: Math.round(words / 150 * 10) / 10
                });
            }
            return chapters;
        }

        let currentTitle = "Inicio";
        let currentContent = parts[0];

        if (currentContent.trim()) {
            const words = (currentContent.match(/\b\w+\b/g) || []).length;
            if (words >= 30) {
                chapters.push({
                    id: 0,
                    titulo: currentTitle,
                    contenido: currentContent,
                    chars: currentContent.length,
                    palabras: words,
                    tiempo_estimado_min: Math.round(words / 150 * 10) / 10
                });
            }
        }

        let idCounter = 1;
        for (let i = 1; i < parts.length; i += 2) {
            const title = parts[i];
            const content = parts[i + 1];
            if (content && content.trim()) {
                const words = (content.match(/\b\w+\b/g) || []).length;
                if (words < 30) continue;
                chapters.push({
                    id: idCounter++,
                    titulo: title.trim().substring(0, 50),
                    contenido: content,
                    chars: content.length,
                    palabras: words,
                    tiempo_estimado_min: Math.round(words / 150 * 10) / 10
                });
            }
        }

        return chapters;
    }
}
