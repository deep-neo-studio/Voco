
import * as pdfjsLib from 'pdfjs-dist';
// EPUB.js is usually loaded via script tag or npm. We'll assume it's available or imported if using a bundler.
// For this environment we might need to rely on the global ePub object or import it if installed via npm.
import ePub from 'epubjs';

// Worker setup for PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export class FileParser {
    async parseFile(file) {
        const extension = file.name.split('.').pop().toLowerCase();

        if (extension === 'txt') {
            return await this.readText(file);
        } else if (extension === 'pdf') {
            return await this.readPdf(file);
        } else if (extension === 'epub') {
            return await this.readEpub(file);
        } else {
            throw new Error('Formato no soportado. Use TXT, PDF o EPUB.');
        }
    }

    readText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = (e) => reject(e);
            reader.readAsText(file);
        });
    }

    async readPdf(file) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        return fullText;
    }

    async readEpub(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const book = ePub(e.target.result);
                let fullText = '';

                book.loaded.spine.then(async () => {
                    const spine = book.spine;
                    for (const item of spine.spineItems) {
                        // Load each chapter/section
                        // Note: validating this approach as epubjs usually renders to DOM
                        // We need the raw text. We can try to load the document.
                        try {
                            const doc = await item.load(book.load.bind(book));
                            // Extract text from the document (HTML)
                            // This might be XML/HTML document
                            const text = doc.body.textContent || doc.body.innerText;
                            fullText += text + '\n\n';
                        } catch (err) {
                            console.warn("Could not load section", item, err);
                        }
                    }
                    resolve(fullText);
                }).catch(reject);
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }
}
