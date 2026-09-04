const WebSocket = require('ws');
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const connectionId = generateUUID().replace(/-/g, '');
const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}`;

const ws = new WebSocket(url, { headers: { Origin: "http://localhost" } });
ws.on('open', () => {
    console.log("Connected");
    ws.close();
});
ws.on('error', (e) => console.log("Error:", e.message));
ws.on('unexpected-response', (req, res) => console.log("Unexpected:", res.statusCode));
