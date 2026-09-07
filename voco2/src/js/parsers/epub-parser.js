// epub-parser.js - Parser completo de EPUB con extracción de portada, metadatos y capítulos
export class EpubParser {
    static async parse(file) {
        if (!window.JSZip) {
            throw new Error("JSZip no está cargado en el entorno");
        }

        const zip = new window.JSZip();
        const zipContent = await zip.loadAsync(file);

        // 1. Encontrar el archivo OPF desde container.xml
        const containerFile = zipContent.file("META-INF/container.xml");
        if (!containerFile) throw new Error("Archivo EPUB inválido (falta container.xml)");

        const containerXml = await containerFile.async("string");
        const domParser = new DOMParser();
        const containerDoc = domParser.parseFromString(containerXml, "text/xml");
        const rootfileEl = containerDoc.querySelector("rootfile");
        if (!rootfileEl) throw new Error("No se encontró rootfile en container.xml");

        const opfPath = rootfileEl.getAttribute("full-path");
        const opfFile = zipContent.file(opfPath);
        if (!opfFile) throw new Error(`No se pudo encontrar el archivo OPF: ${opfPath}`);

        const opfXml = await opfFile.async("string");
        const opfDoc = domParser.parseFromString(opfXml, "text/xml");
        const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/')) : '';

        // 2. Extraer Metadatos (Título, Autor, Idioma)
        const titleEl = opfDoc.querySelector("title") || opfDoc.querySelector("dc\\:title");
        const authorEl = opfDoc.querySelector("creator") || opfDoc.querySelector("dc\\:creator");
        const title = titleEl ? titleEl.textContent.trim() : file.name.replace(/\.epub$/i, '');
        const author = authorEl ? authorEl.textContent.trim() : 'Desconocido';

        // 3. Extraer Portada
        const coverDataUrl = await this.extractCover(zipContent, opfDoc, opfDir);

        // 4. Mapear Manifiesto (id -> href, media-type)
        const manifestItems = {};
        opfDoc.querySelectorAll("manifest > item").forEach(item => {
            manifestItems[item.getAttribute("id")] = {
                href: item.getAttribute("href"),
                type: item.getAttribute("media-type")
            };
        });

        // 5. Extraer Capítulos siguiendo el Spine
        const spineItems = opfDoc.querySelectorAll("spine > itemref");
        const chapters = [];
        let globalChapIndex = 0;

        for (const itemRef of Array.from(spineItems)) {
            const idref = itemRef.getAttribute("idref");
            const item = manifestItems[idref];
            if (!item || !item.href) continue;

            const fullHref = opfDir ? `${opfDir}/${item.href}` : item.href;
            const chapterFile = zipContent.file(fullHref);
            if (!chapterFile) continue;

            const htmlContent = await chapterFile.async("string");
            const parsedChap = this.processChapterHtml(htmlContent, globalChapIndex);

            // Filtrar secciones vacías o puras imágenes de portada sin texto
            if (parsedChap.paragraphs.length > 0 && parsedChap.wordCount > 15) {
                chapters.push(parsedChap);
                globalChapIndex++;
            }
        }

        // Si los capítulos son muy pocos o hubo problemas con el spine, fallback
        if (chapters.length === 0) {
            chapters.push({
                index: 0,
                title: title,
                content: `<p>No se pudieron extraer capítulos del EPUB.</p>`,
                paragraphs: [{ id: 0, text: 'No se pudieron extraer capítulos del EPUB.' }],
                wordCount: 10,
                hasAudio: false,
                audioBlob: null,
                audioTimestamps: null,
                audioDurationSec: 0,
                isConverted: false
            });
        }

        return {
            title,
            author,
            format: 'epub',
            coverUrl: coverDataUrl,
            chapters
        };
    }

    static async extractCover(zipContent, opfDoc, opfDir) {
        try {
            let coverHref = null;

            // Intento 1: item con properties="cover-image"
            const coverItemProp = opfDoc.querySelector('manifest > item[properties*="cover-image"]');
            if (coverItemProp) {
                coverHref = coverItemProp.getAttribute("href");
            }

            // Intento 2: meta name="cover" content="id_del_item"
            if (!coverHref) {
                const metaCover = opfDoc.querySelector('metadata > meta[name="cover"]');
                if (metaCover) {
                    const coverId = metaCover.getAttribute("content");
                    const coverItem = opfDoc.querySelector(`manifest > item[id="${coverId}"]`);
                    if (coverItem) coverHref = coverItem.getAttribute("href");
                }
            }

            // Intento 3: buscar item con id="cover" o id="cover-image"
            if (!coverHref) {
                const coverById = opfDoc.querySelector('manifest > item[id="cover"], manifest > item[id="cover-image"], manifest > item[id="cover_image"]');
                if (coverById) coverHref = coverById.getAttribute("href");
            }

            // Intento 4: buscar cualquier archivo de imagen que contenga "cover" en el zip
            if (!coverHref) {
                const imgFiles = Object.keys(zipContent.files).filter(f => /cover.*\.(jpg|jpeg|png|webp)$/i.test(f));
                if (imgFiles.length > 0) {
                    const imgFile = zipContent.file(imgFiles[0]);
                    if (imgFile) {
                        const blob = await imgFile.async("blob");
                        return URL.createObjectURL(blob);
                    }
                }
            }

            if (coverHref) {
                const fullCoverPath = opfDir ? `${opfDir}/${coverHref}` : coverHref;
                const file = zipContent.file(fullCoverPath);
                if (file) {
                    const blob = await file.async("blob");
                    return URL.createObjectURL(blob);
                }
            }
        } catch (e) {
            console.warn("No se pudo extraer portada del EPUB:", e);
        }
        return null;
    }

    static processChapterHtml(htmlString, chapterIndex) {
        const domParser = new DOMParser();
        const doc = domParser.parseFromString(htmlString, "text/html");

        // Remover scripts, estilos y links
        doc.querySelectorAll("script, style, link, noscript").forEach(el => el.remove());

        // Extraer título del capítulo
        let title = '';
        const hTag = doc.querySelector("h1, h2, h3");
        if (hTag && hTag.textContent.trim().length > 0 && hTag.textContent.trim().length < 150) {
            title = hTag.textContent.trim();
        } else {
            const docTitle = doc.querySelector("title");
            if (docTitle && docTitle.textContent.trim().length > 0) {
                title = docTitle.textContent.trim();
            } else {
                title = `Capítulo ${chapterIndex + 1}`;
            }
        }

        // Extraer párrafos y asignarles data-p-id
        const paragraphs = [];
        let pCounter = 0;

        // Buscar elementos de bloque de texto: p, div con texto directo, li, blockquote
        const textNodes = doc.body ? doc.body.querySelectorAll("p, blockquote, li, h1, h2, h3, h4") : [];

        if (textNodes.length > 0) {
            textNodes.forEach(node => {
                const text = node.textContent.replace(/\s+/g, ' ').trim();
                if (text.length > 0) {
                    node.setAttribute("data-p-id", pCounter);
                    node.classList.add("reader-p");
                    paragraphs.push({
                        id: pCounter++,
                        text: text,
                        tag: node.tagName.toLowerCase()
                    });
                }
            });
        } else {
            // Fallback: texto directo en body
            const allText = doc.body ? doc.body.textContent.trim() : '';
            const rawParts = allText.split(/\n\s*\n/);
            for (const part of rawParts) {
                const clean = part.replace(/\s+/g, ' ').trim();
                if (clean.length > 0) {
                    paragraphs.push({
                        id: pCounter++,
                        text: clean,
                        tag: 'p'
                    });
                }
            }
        }

        const totalWords = paragraphs.reduce((sum, p) => sum + (p.text.match(/\b\w+\b/g) || []).length, 0);

        // Generar HTML procesado con ids de párrafo
        let renderedHtml = '';
        if (paragraphs.length > 0) {
            renderedHtml = paragraphs.map(p => {
                if (['h1', 'h2', 'h3'].includes(p.tag)) {
                    return `<${p.tag} class="reader-heading reader-p" data-p-id="${p.id}">${this.escapeHtml(p.text)}</${p.tag}>`;
                }
                return `<p class="reader-p" data-p-id="${p.id}">${this.escapeHtml(p.text)}</p>`;
            }).join('\n');
        }

        return {
            index: chapterIndex,
            title: title,
            content: renderedHtml,
            paragraphs: paragraphs,
            wordCount: totalWords,
            hasAudio: false,
            audioBlob: null,
            audioTimestamps: null,
            audioDurationSec: 0,
            isConverted: false
        };
    }

    static escapeHtml(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}
