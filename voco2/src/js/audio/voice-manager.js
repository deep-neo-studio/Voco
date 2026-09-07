// voice-manager.js - Gestor y catálogo de voces neuronales Edge TTS
import { CapacitorHttp } from '@capacitor/core';

export class VoiceManager {
    static POPULAR_VOICES = [
        { id: 'es-MX-JorgeNeural', name: 'Jorge (México)', lang: 'es-MX', gender: 'Male', flag: '🇲🇽', desc: 'Narración profunda y natural' },
        { id: 'es-MX-DaliaNeural', name: 'Dalia (México)', lang: 'es-MX', gender: 'Female', flag: '🇲🇽', desc: 'Clara, expresiva y cálida' },
        { id: 'es-ES-AlvaroNeural', name: 'Álvaro (España)', lang: 'es-ES', gender: 'Male', flag: '🇪🇸', desc: 'Castellano literario y firme' },
        { id: 'es-ES-ElviraNeural', name: 'Elvira (España)', lang: 'es-ES', gender: 'Female', flag: '🇪🇸', desc: 'Suave, culta y precisa' },
        { id: 'es-CO-GonzaloNeural', name: 'Gonzalo (Colombia)', lang: 'es-CO', gender: 'Male', flag: '🇨🇴', desc: 'Acento neutro y fluido' },
        { id: 'es-AR-TomasNeural', name: 'Tomás (Argentina)', lang: 'es-AR', gender: 'Male', flag: '🇦🇷', desc: 'Rioplatense pausado y envolvente' },
        { id: 'es-US-AlonsoNeural', name: 'Alonso (EE.UU.)', lang: 'es-US', gender: 'Male', flag: '🇺🇸', desc: 'Hispano contemporáneo' },
        { id: 'en-US-GuyNeural', name: 'Guy (Inglés EE.UU.)', lang: 'en-US', gender: 'Male', flag: '🇺🇸', desc: 'Inglés neutro, estilo audiolibro' },
        { id: 'en-US-JennyNeural', name: 'Jenny (Inglés EE.UU.)', lang: 'en-US', gender: 'Female', flag: '🇺🇸', desc: 'Natural y conversacional' }
    ];

    static async getVoices() {
        const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
        const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;

        try {
            const response = await CapacitorHttp.get({
                url: url,
                headers: {
                    'Authority': 'speech.platform.bing.com',
                    'Accept': '*/*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36 Edg/133.0.0.0'
                }
            });

            if (response.status === 200 && response.data) {
                let list = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                if (Array.isArray(list) && list.length > 0) {
                    return list;
                }
            }
        } catch (e) {
            console.warn("Fallo al obtener voces dinámicas de Edge TTS, usando catálogo predeterminado:", e);
        }

        return this.POPULAR_VOICES.map(v => ({
            ShortName: v.id,
            FriendlyName: v.name,
            Locale: v.lang,
            Gender: v.gender,
            Flag: v.flag,
            Description: v.desc
        }));
    }
}
