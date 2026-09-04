const WebSocket = require("ws");
const connectionId = "12345678123456781234567812345678";
const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connectionId}`;
const ws1 = new WebSocket(url, { headers: { Origin: "http://localhost" } });
ws1.on("open", () => { console.log("ws1 open"); ws1.close(); });
ws1.on("error", (e) => console.log("ws1 error", e.message));

const ws2 = new WebSocket(url, { headers: { Origin: "capacitor://localhost" } });
ws2.on("open", () => { console.log("ws2 open"); ws2.close(); });
ws2.on("error", (e) => console.log("ws2 error", e.message));
