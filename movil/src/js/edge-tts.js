
// Removed external uuid dependency to avoid polyfill issues in WebView

function createRequestId() {
    return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export class EdgeTTS {
    constructor() {
        this.ws = null;
        this.voice = 'es-MX-DaliaNeural'; // Default
        this.rate = '+0%';
        this.volume = '+0%';
        this.pitch = '+0Hz';
    }

    async getVoices() {
        try {
            // Use standard fetch
            const response = await fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4');
            if (!response.ok) throw new Error('Failed to fetch voices');
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error fetching Edge voices:', error);
            return [];
        }
    }

    connect() {
        return new Promise((resolve, reject) => {
            const requestId = createRequestId();
            // Ensure token is proper case (though endpoint is case insensitive usually)
            const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${requestId}`;

            console.log('Connecting to Edge TTS...');

            this.ws = new WebSocket(url);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                console.log('Edge TTS Connected');
                resolve();
            };

            this.ws.onerror = (err) => {
                console.error('Edge TTS Connection Error', err);
                reject(new Error("WebSocket Connection Failed."));
            };

            this.ws.onclose = (e) => {
                console.log('Edge TTS Disconnected', e.code, e.reason);
            };
        });
    }

    async synthesize(text, voice, rate = '+0%', onAudioData) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            try {
                await this.connect();
            } catch (e) {
                console.error(e);
                throw new Error("Could not connect to Edge Server. Check Internet.");
            }
        }

        return new Promise((resolve, reject) => {
            const requestId = createRequestId();
            const timestamp = new Date().toString(); // Use standard toString to match browser behavior

            // Standard Config
            const configMsg = `X-Timestamp:${timestamp}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
                JSON.stringify({
                    context: {
                        synthesis: {
                            audio: {
                                metadataoptions: {
                                    sentenceBoundaryEnabled: false,
                                    wordBoundaryEnabled: false
                                },
                                outputFormat: "audio-24khz-48kbitrate-mono-mp3"
                            }
                        }
                    }
                });

            try {
                this.ws.send(configMsg);

                // SSML
                const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
                    `<voice name='${voice}'>` +
                    `<prosody pitch='${this.pitch}' rate='${rate}' volume='${this.volume}'>` +
                    `${text}` +
                    `</prosody></voice></speak>`;

                const ssmlMsg = `X-Timestamp:${timestamp}\r\nX-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;

                this.ws.send(ssmlMsg);
            } catch (sendErr) {
                reject(new Error("Failed to send message to server."));
                return;
            }

            const audioChunks = [];

            this.ws.onmessage = async (event) => {
                if (typeof event.data === 'string') {
                    if (event.data.includes('Path:turn.end')) {
                        this.ws.close();
                        const fullBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                        resolve(fullBlob);
                    }
                } else if (event.data instanceof ArrayBuffer) {
                    const arrayBuffer = event.data;
                    const view = new DataView(arrayBuffer);
                    const headerSize = view.getUint16(0);

                    if (arrayBuffer.byteLength > headerSize + 2) {
                        const audioData = arrayBuffer.slice(headerSize + 2);
                        audioChunks.push(audioData);
                        if (onAudioData) onAudioData(audioData);
                    }
                }
            };

            this.ws.onclose = (e) => {
                if (audioChunks.length > 0) {
                    const fullBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                    resolve(fullBlob);
                } else {
                    reject(new Error(`Connection closed: ${e.code}`));
                }
            };

            this.ws.onerror = (e) => {
                reject(new Error("WS Error during synthesis"));
            };
        });
    }
}
