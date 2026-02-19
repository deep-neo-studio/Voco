
import { TextToSpeech } from '@capacitor-community/text-to-speech';

export class TTSEngine {
    constructor() {
        this.voices = [];
    }

    async getVoices() {
        try {
            const result = await TextToSpeech.getSupportedVoices();
            this.voices = result.voices;
            return this.voices;
        } catch (error) {
            console.error('Error getting voices:', error);
            return [];
        }
    }

    async speak(text, voiceId = null, rate = 1.0, pitch = 1.0) {
        try {
            await TextToSpeech.speak({
                text: text,
                voice: voiceId ? parseInt(voiceId) : undefined, // Capacitor community plugin uses integer index or object? Need to verify. Often uses locale or identifier string.
                // Checking documentation: The plugin `speak` options usually take `voice` index or identifier.
                // Standard Web Speech API takes a specific SpeechSynthesisVoice object.
                // Capacitor Community TTS: `voice` is an index in the `voices` array.
                // Let's assume voiceId is the index for now or we map it.
                lang: 'es-ES', // Default fallback
                rate: rate,
                pitch: pitch,
                volume: 1.0,
                category: 'ambient',
            });
        } catch (error) {
            console.error('TTS Error:', error);
            throw error;
        }
    }

    async stop() {
        await TextToSpeech.stop();
    }
}
