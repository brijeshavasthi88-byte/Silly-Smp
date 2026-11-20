/* ===========================================================
   SILLY SMP – WEBSITE + LIVE STATUS SERVER (no npm install needed)
   Run:  node server.js     then open  http://localhost:3000
   It pings your Minecraft server directly (Java + Bedrock), so the
   online/offline state and player counts are exact.
   =========================================================== */
const http = require("http");
const fs = require("fs");
const path = require("path");
const net = require("net");
const dgram = require("dgram");
const dns = require("dns").promises;

const CONFIG = {
  host: "sillylife.progamer.me",
  javaPort: null,          // set a number (e.g. 25565) if you know it; null = auto (SRV record, then 25565)
  bedrockPort: 27681,
  webPort: process.env.PORT || 3000,
  timeout: 4000,           // ms to wait for the Minecraft server
  cacheSeconds: 10,
};

/* ---------------- Java Edition ping ---------------- */
const varint = (n) => {
  const out = [];
  do {
    let t = n & 0x7f;
    n >>>= 7;
    if (n) t |= 0x80;
    out.push(t);
  } while (n);
  return Buffer.from(out);
};
const readVarint = (buf, off) => {
  let r = 0, s = 0, b;
  do {
    b = buf[off++];
    if (b === undefined) return null;
    r |= (b & 0x7f) << s;
    s += 7;
  } while (b & 0x80);
  return { value: r, next: off };
};

async function resolveJava() {
  if (CONFIG.javaPort) return { host: CONFIG.host, port: CONFIG.javaPort };
  try {
    const srv = await dns.resolveSrv("_minecraft._tcp." + CONFIG.host);
    if (srv.length) return { host: srv[0].name, port: srv[0].port };
  } catch {}
  return { host: CONFIG.host, port: 25565 };
}

async function pingJava() {
  const { host, port } = await resolveJava();
  return new Promise((resolve) => {
    const started = Date.now();
    const sock = net.createConnection({ host, port });
    let buf = Buffer.alloc(0);
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(r);
    };
    sock.setTimeout(CONFIG.timeout, () => finish({ online: false }));
    sock.on("error", () => finish({ online: false }));
    sock.on("connect", () => {
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(port);
      const hs = Buffer.concat([
        varint(0), varint(765),
        varint(Buffer.byteLength(CONFIG.host)), Buffer.from(CONFIG.host),
        portBuf, varint(1),
      ]);
      sock.write(Buffer.concat([varint(hs.length), hs]));
      sock.write(Buffer.from([1, 0]));
    });
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      const len = readVarint(buf, 0);
      if (!len || buf.length < len.next + len.value) return;
      try {
        const id = readVarint(buf, len.next);
        const sl = readVarint(buf, id.next);
        const json = JSON.parse(buf.slice(sl.next, sl.next + sl.value).toString("utf8"));
        const motd = typeof json.description === "string" ? json.description : json.description?.text || "";
        finish({
          online: true,
          players: json.players?.online ?? 0,
          max: json.players?.max ?? 0,
          version: json.version?.name || "",
          motd,
          latency: Date.now() - started,
        });
      } catch {
        finish({ online: false });
      }
    });
  });
}

/* ---------------- Bedrock Edition ping (RakNet) ---------------- */
const MAGIC = Buffer.from("00ffff00fefefefefdfdfdfd12345678", "hex");
function pingBedrock() {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    const started = Date.now();
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock.close(); } catch {}
      resolve(r);
    };
    const timer = setTimeout(() => finish({ online: false }), CONFIG.timeout);
    sock.on("error", () => finish({ online: false }));
    sock.on("message", (msg) => {
      try {
        if (msg[0] !== 0x1c) return finish({ online: false });
        const len = msg.readUInt16BE(33);
        const parts = msg.slice(35, 35 + len).toString("utf8").split(";");
        finish({
          online: true,
          players: parseInt(parts[4]) || 0,
          max: parseInt(parts[5]) || 0,
          version: parts[3] || "",
          motd: parts[1] || "",
          latency: Date.now() - started,
        });
      } catch {
        finish({ online: false });
      }
    });
    const time = Buffer.alloc(8);
    time.writeBigInt64BE(BigInt(Date.now()));
    const guid = Buffer.alloc(8, 2);
    const packet = Buffer.concat([Buffer.from([0x01]), time, MAGIC, guid]);
    sock.send(packet, CONFIG.bedrockPort, CONFIG.host, (err) => err && finish({ online: false }));
  });
}

/* ---------------- status cache ---------------- */
let cache = null;
let cacheTime = 0;
async function getStatus() {
  if (cache && Date.now() - cacheTime < CONFIG.cacheSeconds * 1000) return cache;
  const [java, bedrock] = await Promise.all([pingJava(), pingBedrock()]);
  cache = { host: CONFIG.host, bedrockPort: CONFIG.bedrockPort, java, bedrock, checkedAt: new Date().toISOString() };
  cacheTime = Date.now();
  return cache;
}

/* ---------------- web server ---------------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
};
const PUBLIC_FILES = new Set(["index.html", "style.css", "script.js", "logo.png"]);

http.createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);

  if (url === "/api/status") {
    const data = await getStatus();
    res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store" });
    return res.end(JSON.stringify(data));
  }

  const rel = url === "/" ? "index.html" : url.replace(/^\/+/, "");
  const allowed = PUBLIC_FILES.has(rel) || rel.startsWith("images/");
  const file = path.join(__dirname, rel);
  if (!allowed || !file.startsWith(__dirname)) {
    res.writeHead(404);
    return res.end("Not found");
  }
  fs.readFile(file, (err, content) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    res.end(content);
  });
}).listen(CONFIG.webPort, () => {
  console.log(`Silly SMP website running:  http://localhost:${CONFIG.webPort}`);
  console.log(`Live status API:            http://localhost:${CONFIG.webPort}/api/status`);
});
