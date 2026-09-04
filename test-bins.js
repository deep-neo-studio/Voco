const WebSocket = require("ws");
const connectionId = "12345678123456781234567812345678";
const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}`;
function testOrigin(origin) {
    const ws = new WebSocket(url, { headers: { Origin: origin } });
    ws.on("open", () => { console.log(origin, "ALLOWED"); ws.close(); });
    ws.on("unexpected-response", (r, res) => console.log(origin, "DENIED", res.statusCode));
}
testOrigin("https://localhost");
testOrigin("https://bing.com");
testOrigin("chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold");
testOrigin("http://localhost");
testOrigin(""); // Empty origin
