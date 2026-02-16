// Helper for UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export class EdgeTTS {
    constructor() {
        this.ws = null;
        this.voice = 'es-MX-JorgeNeural';
        this.rate = '+0%';
        this.volume = '+0%';
        this.pitch = '+0Hz';
    }

    async connect() {
        return new Promise((resolve, reject) => {
            const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
            const connectionId = generateUUID().replace(/-/g, '');
            const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}`;

            try {
                this.ws = new WebSocket(url);
            } catch (e) {
                reject(e);
                return;
            }

            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                const config = {
                    context: {
                        synthesis: {
                            audio: {
                                metadataoptions: {
                                    sentenceBoundaryEnabled: "false",
                                    wordBoundaryEnabled: "false"
                                },
                                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
                            }
                        }
                    }
                };
                const msg = `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}`;
                this.ws.send(msg);
                console.log("EdgeTTS Connected");
                resolve();
            };

            this.ws.onerror = (e) => {
                console.error("EdgeTTS WebSocket Error:", e);
                reject(e);
            };

            this.ws.onclose = () => {
                console.log("EdgeTTS Closed");
            };
        });
    }

    async synthesize(text, voiceId) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            const requestId = generateUUID().replace(/-/g, '');
            let audioParts = [];

            const handleMessage = (event) => {
                const data = event.data;

                if (typeof data === 'string') {
                    if (data.includes('Path:turn.end')) {
                        // End of turn
                        this.ws.removeEventListener('message', handleMessage);
                        const blob = new Blob(audioParts, { type: 'audio/mpeg' });
                        resolve(blob);
                    }
                } else if (data instanceof ArrayBuffer) {
                    // Binary data
                    const view = new DataView(data);
                    const headSize = view.getUint16(0);
                    // Skip header (2 bytes size + headSize)
                    const audioData = data.slice(2 + headSize);
                    audioParts.push(audioData);
                }
            };

            this.ws.addEventListener('message', handleMessage);

            const ssml = `
                <speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
                    <voice name='${voiceId}'>
                        <prosody pitch='${this.pitch}' rate='${this.rate}' volume='${this.volume}'>
                            ${text}
                        </prosody>
                    </voice>
                </speak>
            `;

            const request = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
            this.ws.send(request);
        });
    }

    close() {
        if (this.ws) this.ws.close();
    }

    static async getVoices() {
        const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
        const url = `https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`;
        try {
            const response = await fetch(url);
            return await response.json();
        } catch (e) {
            console.error("Error fetching voices:", e);
            return [];
        }
    }
}
