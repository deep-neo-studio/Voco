import { CapacitorHttp } from '@capacitor/core';
import { EdgeTTS as UniversalEdgeTTS } from 'edge-tts-universal/browser';

export class EdgeTTS {
    constructor() {
        this.voice = 'es-MX-JorgeNeural';
        this.rate = '+0%';
        this.volume = '+0%';
        this.pitch = '+0Hz';
    }

    async connect() {
        return Promise.resolve();
    }

    async synthesize(text, voiceId) {
        return new Promise(async (resolve, reject) => {
            try {
                console.log("Synthesizing with edge-tts-universal (browser mode):", voiceId || this.voice);

                // We use a fresh instance to ensure the latest token
                const tts = new UniversalEdgeTTS({
                    voice: voiceId || this.voice,
                    rate: this.rate,
                    volume: this.volume,
                    pitch: this.pitch
                });

                // Get audio as blob
                const audioData = await tts.synthesize(text);
                if (!audioData || audioData.byteLength === 0) {
                    throw new Error("No audio data received");
                }
                const blob = new Blob([audioData], { type: 'audio/mpeg' });
                resolve(blob);
            } catch (e) {
                console.error("Detailed TTS Rejection:", e);
                reject(e);
            }
        });
    }

    close() {
    }

    static async getVoices() {
        const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
        const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

        try {
            console.log("Fetching voices via CapacitorHttp...");
            const response = await CapacitorHttp.get({
                url: url,
                headers: {
                    'Authority': 'speech.platform.bing.com',
                    'Accept': '*/*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0'
                }
            });

            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}`);
            }

            let data = response.data;
            if (typeof data === 'string') data = JSON.parse(data);
            return data;
        } catch (e) {
            console.error("Error fetching voices:", e);
            return [];
        }
    }
}
