// tts-engine.js - Motor de síntesis Edge TTS con captura de marcas de tiempo para Whispersync
import { EdgeTTS as UniversalEdgeTTS, Communicate, SubMaker } from 'edge-tts-universal/browser';

export class TTSEngine {
    constructor(options = {}) {
        this.voice = options.voice || 'es-MX-JorgeNeural';
        this.rate = options.rate || '+0%';
        this.volume = options.volume || '+0%';
        this.pitch = options.pitch || '+0Hz';
    }

    /**
     * Sintetiza un capítulo y genera el Blob de audio junto con el mapa de marcas temporales por párrafo.
     * @param {Object} chapter - Objeto capítulo con array de paragraphs: [{id, text}]
     * @param {Function} onProgress - Callback con porcentaje (0-100) y estado
     * @returns {Promise<{audioBlob: Blob, timestamps: Array, durationSec: number}>}
     */
    async synthesizeChapter(chapter, onProgress = () => {}) {
        const paragraphs = chapter.paragraphs || [];
        if (paragraphs.length === 0) {
            throw new Error("El capítulo no contiene texto para sintetizar");
        }

        // Combinar el texto del capítulo manteniendo registro de límites de cada párrafo
        const paragraphMeta = [];
        let accumulatedChar = 0;
        let fullText = '';

        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            const pText = p.text.trim();
            if (!pText) continue;

            const startChar = fullText.length;
            fullText += (fullText.length > 0 ? '\n\n' : '') + pText;
            const endChar = fullText.length;

            paragraphMeta.push({
                paragraphId: p.id,
                text: pText,
                startChar: startChar,
                endChar: endChar,
                wordCount: (pText.match(/\b\w+\b/g) || []).length
            });
        }

        onProgress(10, 'Conectando con el motor de voz neuronal...');

        try {
            // Intentar sintetizar con Communicate para obtener marcas de tiempo precisas
            const result = await this._synthesizeWithTimestamps(fullText, paragraphMeta, onProgress);
            return result;
        } catch (streamErr) {
            console.warn("Fallo en streaming con Communicate, usando síntesis directa con marcas proporcionales:", streamErr);
            onProgress(40, 'Generando audio de alta calidad...');
            return await this._synthesizeDirect(fullText, paragraphMeta, onProgress);
        }
    }

    async _synthesizeWithTimestamps(fullText, paragraphMeta, onProgress) {
        const comm = new Communicate(fullText, {
            voice: this.voice,
            rate: this.rate,
            volume: this.volume,
            pitch: this.pitch
        });

        const audioChunks = [];
        const wordBoundaries = [];
        let totalBytes = 0;

        onProgress(25, 'Sintetizando y calculando sincronización de texto...');

        for await (const chunk of comm.stream()) {
            if (chunk.type === 'audio' && chunk.data) {
                audioChunks.push(chunk.data);
                totalBytes += chunk.data.byteLength || chunk.data.length || 0;
            } else if (chunk.type === 'WordBoundary') {
                const startSec = (chunk.offset || 0) / 1e7;
                const endSec = ((chunk.offset || 0) + (chunk.duration || 0)) / 1e7;
                wordBoundaries.push({
                    text: chunk.text,
                    start: startSec,
                    end: endSec
                });
            }
        }

        if (audioChunks.length === 0) {
            throw new Error("No se recibieron datos de audio");
        }

        onProgress(85, 'Procesando archivo de audio y marcas...');
        const audioBlob = new Blob(audioChunks, { type: 'audio/mpeg' });
        const durationSec = await this._getAudioDuration(audioBlob);

        // Mapear marcas de tiempo a cada párrafo
        const timestamps = this._mapWordsToParagraphs(wordBoundaries, paragraphMeta, durationSec);

        onProgress(100, '¡Capítulo convertido y sincronizado!');
        return {
            audioBlob,
            timestamps,
            durationSec
        };
    }

    async _synthesizeDirect(fullText, paragraphMeta, onProgress) {
        const tts = new UniversalEdgeTTS({
            voice: this.voice,
            rate: this.rate,
            volume: this.volume,
            pitch: this.pitch
        });

        onProgress(50, 'Generando voz neuronal...');
        const audioData = await tts.synthesize(fullText);
        if (!audioData || audioData.byteLength === 0) {
            throw new Error("No se recibieron datos de audio del servidor");
        }

        onProgress(85, 'Calculando marcas de sincronización...');
        const audioBlob = new Blob([audioData], { type: 'audio/mpeg' });
        const durationSec = await this._getAudioDuration(audioBlob);

        // Calcular marcas proporcionales para cada párrafo basadas en cantidad de palabras
        const totalWords = paragraphMeta.reduce((sum, p) => sum + p.wordCount, 0) || 1;
        let currentSecond = 0;

        const timestamps = paragraphMeta.map((p, idx) => {
            const pFraction = p.wordCount / totalWords;
            const pDuration = pFraction * durationSec;
            const start = currentSecond;
            const end = currentSecond + pDuration;
            currentSecond = end;

            return {
                paragraphId: p.paragraphId,
                start: Math.round(start * 100) / 100,
                end: Math.round(end * 100) / 100
            };
        });

        onProgress(100, '¡Capítulo convertido!');
        return {
            audioBlob,
            timestamps,
            durationSec
        };
    }

    _mapWordsToParagraphs(wordBoundaries, paragraphMeta, totalDurationSec) {
        if (!wordBoundaries || wordBoundaries.length === 0) {
            // Si no vinieron boundaries, fallback proporcional
            const totalWords = paragraphMeta.reduce((sum, p) => sum + p.wordCount, 0) || 1;
            let currentSecond = 0;
            return paragraphMeta.map((p) => {
                const pFraction = p.wordCount / totalWords;
                const pDuration = pFraction * totalDurationSec;
                const start = currentSecond;
                const end = currentSecond + pDuration;
                currentSecond = end;
                return {
                    paragraphId: p.paragraphId,
                    start: Math.round(start * 100) / 100,
                    end: Math.round(end * 100) / 100
                };
            });
        }

        // Mapear por índice de palabra acumulado
        const timestamps = [];
        let wordIndex = 0;

        for (let i = 0; i < paragraphMeta.length; i++) {
            const p = paragraphMeta[i];
            const pWordsCount = Math.max(1, p.wordCount);
            const startWord = wordBoundaries[wordIndex] || wordBoundaries[wordBoundaries.length - 1];
            const endWordIdx = Math.min(wordBoundaries.length - 1, wordIndex + pWordsCount - 1);
            const endWord = wordBoundaries[endWordIdx] || startWord;

            const startTime = startWord ? startWord.start : (i === 0 ? 0 : timestamps[i - 1].end);
            const endTime = endWord ? endWord.end : totalDurationSec;

            timestamps.push({
                paragraphId: p.paragraphId,
                start: Math.round(startTime * 100) / 100,
                end: Math.max(Math.round(endTime * 100) / 100, Math.round(startTime * 100) / 100 + 0.5)
            });

            wordIndex += pWordsCount;
        }

        return timestamps;
    }

    _getAudioDuration(blob) {
        return new Promise((resolve) => {
            const audio = new Audio();
            const url = URL.createObjectURL(blob);
            audio.src = url;
            audio.addEventListener('loadedmetadata', () => {
                const dur = audio.duration || 0;
                URL.revokeObjectURL(url);
                resolve(dur);
            });
            audio.addEventListener('error', () => {
                URL.revokeObjectURL(url);
                resolve(0);
            });
        });
    }
}
