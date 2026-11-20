/* ===========================================================
   SILLY SMP – WEBSITE SCRIPT
   Edit the CONFIG below, nothing else needs to change.
   =========================================================== */
const CONFIG = {
  serverIP: "sillylife.progamer.me",     // Java + Bedrock address
  javaPort: "",                          // leave empty if Java uses the default 25565 (or SRV record)
  bedrockPort: "27681",                  // Bedrock port
  gallery: [
    // Add your screenshots to an "images" folder next to index.html, then list them here:
    // { src: "images/spawn.jpg", caption: "Our spawn town" },
    // { src: "images/castle.png", caption: "The big castle build" },
  ],
  discordInvite: "https://discord.gg/rKd2WcQme", // <-- your Discord invite link
  discordServerId: "",                   // optional: Discord server ID (enable Widget in Discord settings) for member count
  apiUrl: "/api/status",                 // served by server.js; change to your hosted URL if the site is hosted elsewhere
  refreshSeconds: 15,
};

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- fill in config values ---------- */
$("#ipText").textContent = CONFIG.serverIP + (CONFIG.javaPort ? ":" + CONFIG.javaPort : "");
$("#bedIp").textContent = CONFIG.serverIP;
$("#bedPort").textContent = CONFIG.bedrockPort;
$$(".js-ip").forEach((el) => (el.textContent = CONFIG.serverIP));
$$(".js-bedport").forEach((el) => (el.textContent = CONFIG.bedrockPort));
$$(".js-discord").forEach((el) => (el.href = CONFIG.discordInvite));
$("#year").textContent = new Date().getFullYear();

/* ---------- logo fallback ---------- */
$$("img[src='logo.png']").forEach((img) => {
  img.addEventListener("error", () => {
    img.style.visibility = "hidden";
  });
});

/* ---------- toast + copy IP ---------- */
const toast = $("#toast");
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}
async function copyText(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
  showToast(msg);
}
$$("[data-copy]").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (btn.dataset.copy === "bedrock") {
      copyText(CONFIG.serverIP, `Bedrock IP copied! Port: ${CONFIG.bedrockPort}`);
    } else {
      const addr = CONFIG.serverIP + (CONFIG.javaPort ? ":" + CONFIG.javaPort : "");
      copyText(addr, "Java IP copied: " + addr);
    }
  })
);

/* ---------- navbar ---------- */
const nav = $("#nav");
const links = $("#links");
const menuBtn = $("#menuBtn");
const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 20);
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();
menuBtn.addEventListener("click", () => {
  const open = links.classList.toggle("open");
  menuBtn.setAttribute("aria-expanded", open);
});
$$("#links a").forEach((a) => a.addEventListener("click", () => links.classList.remove("open")));

/* ---------- scroll reveal ---------- */
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("visible");
        io.unobserve(e.target);
      }
    }),
  { threshold: 0.12 }
);
$$(".reveal").forEach((el, i) => {
  el.style.transitionDelay = (i % 4) * 70 + "ms";
  io.observe(el);
});

/* ---------- animated number ---------- */
function setNumber(el, value) {
  if (typeof value !== "number") {
    el.textContent = value;
    return;
  }
  const start = parseInt(el.textContent) || 0;
  const t0 = performance.now();
  const dur = 700;
  (function tick(now) {
    const p = Math.min((now - t0) / dur, 1);
    el.textContent = Math.round(start + (value - start) * p);
    if (p < 1) requestAnimationFrame(tick);
  })(t0);
}

/* ---------- live server status (api.mcsrvstat.us) ---------- */
async function queryStatus(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function updateStatusFallback() {
  const dot = $("#statusDot");
  const text = $("#statusText");
  const javaAddr = CONFIG.serverIP + (CONFIG.javaPort ? ":" + CONFIG.javaPort : "");
  const bedAddr = CONFIG.serverIP + ":" + CONFIG.bedrockPort;

  const [java, bed] = await Promise.all([
    queryStatus("https://api.mcsrvstat.us/3/" + encodeURIComponent(javaAddr)),
    queryStatus("https://api.mcsrvstat.us/bedrock/3/" + encodeURIComponent(bedAddr)),
  ]);

  if (!java && !bed) {
    dot.className = "dot offline";
    text.textContent = "Status unavailable";
    return;
  }

  const javaUp = !!java?.online;
  const bedUp = !!bed?.online;

  if (javaUp || bedUp) {
    // On crossplay setups (Geyser) Bedrock players also show on Java, so take the larger number
    const players = Math.max(java?.players?.online ?? 0, bed?.players?.online ?? 0);
    const max = Math.max(java?.players?.max ?? 0, bed?.players?.max ?? 0);
    dot.className = "dot online";
    text.textContent = `Online · ${players} playing now`;
    setNumber($("#statPlayers"), java?.players?.online ?? 0);
    setNumber($("#statMax"), bed?.players?.online ?? 0);
    const ver = (javaUp ? java.version : bed.version) || "Java & Bedrock";
    $("#statVersion").textContent = ver.length > 10 ? ver.split(/[ ,]/).pop() : ver;
    $$(".js-version").forEach((el) => (el.textContent = ver));
  } else {
    dot.className = "dot offline";
    text.textContent = "Server offline";
    $("#statPlayers").textContent = "0";
    $("#statMax").textContent = "–";
  }
  $("#statusText").title = `Java: ${javaUp ? "online" : "offline"} · Bedrock: ${bedUp ? "online" : "offline"}`;
}

/* ---------- exact live status (from server.js) ---------- */
async function updateStatus() {
  const dot = $("#statusDot");
  const text = $("#statusText");
  let d = null;
  try {
    const res = await fetch(CONFIG.apiUrl || "/api/status", { cache: "no-store" });
    if (res.ok) d = await res.json();
  } catch {}

  // Backend not running -> fall back to the public mcsrvstat.us API
  if (!d || !d.java) return updateStatusFallback();

  const j = d.java, b = d.bedrock;
  dot.className = "dot " + (j.online || b.online ? "online" : "offline");
  const part = (name, s) => (s.online ? `${name}: ${s.players}/${s.max}` : `${name}: offline`);
  text.textContent = j.online || b.online ? `Online · ${part("Java", j)} · ${part("Bedrock", b)}` : "Server offline";

  $("#statPlayers").textContent = j.online ? j.players : "0";
  $("#statMax").textContent = b.online ? b.players : "0";
  const ver = (j.online && j.version) || (b.online && b.version) || "";
  $("#statVersion").textContent = ver ? (ver.length > 10 ? ver.split(/[ ,]/).pop() : ver) : "–";
  if (ver) $$(".js-version").forEach((el) => (el.textContent = ver));
  text.title = `Checked ${new Date(d.checkedAt).toLocaleTimeString()}`;
}

/* ---------- gallery ---------- */
const grid = $("#gallery-grid");
const lightbox = $("#lightbox");
const lbImg = $("#lbImg");

function addPhoto(src, caption = "") {
  const fig = document.createElement("figure");
  fig.innerHTML = `<img loading="lazy" alt="${caption || "Silly SMP screenshot"}" />${caption ? `<figcaption>${caption}</figcaption>` : ""}`;
  fig.querySelector("img").src = src;
  fig.addEventListener("click", () => {
    lbImg.src = src;
    lightbox.classList.add("open");
  });
  grid.prepend(fig);
}
CONFIG.gallery.slice().reverse().forEach((p) => addPhoto(p.src, p.caption));

$("#galleryNote").textContent = CONFIG.gallery.length
  ? "Photos added with the button are only visible on your own device. To show a photo to everyone, add it to the images folder and list it in script.js."
  : "No photos yet. Use the button to preview photos, then add them to the images folder and list them in script.js so everyone can see them.";

$("#photoInput").addEventListener("change", (e) => {
  [...e.target.files].forEach((f) => addPhoto(URL.createObjectURL(f), f.name.replace(/\.[^.]+$/, "")));
  e.target.value = "";
  showToast("Photos added (only visible to you)");
});
const closeLb = () => lightbox.classList.remove("open");
lightbox.addEventListener("click", closeLb);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeLb());

/* ---------- Discord member count (optional) ---------- */
async function updateDiscord() {
  const el = $("#statDiscord");
  if (!CONFIG.discordServerId) {
    el.textContent = "Join!";
    return;
  }
  try {
    const res = await fetch(`https://discord.com/api/guilds/${CONFIG.discordServerId}/widget.json`);
    const d = await res.json();
    setNumber(el, d.presence_count ?? 0);
    el.nextElementSibling.textContent = "Online on Discord";
  } catch {
    el.textContent = "Join!";
  }
}

updateStatus();
updateDiscord();
setInterval(updateStatus, CONFIG.refreshSeconds * 1000);

/* ---------- floating Minecraft-style blocks background ---------- */
(function blocks() {
  const canvas = $("#bg-blocks");
  const ctx = canvas.getContext("2d");
  const colors = ["#5dd85a", "#8b5a2b", "#3fb7ff", "#ffd93b", "#ff9f2e", "#9aa4b5"];
  let w, h, items;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    const count = Math.min(26, Math.floor(w / 55));
    items = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      s: 12 + Math.random() * 26,
      v: 0.15 + Math.random() * 0.4,
      r: Math.random() * Math.PI,
      rv: (Math.random() - 0.5) * 0.008,
      c: colors[Math.floor(Math.random() * colors.length)],
    }));
  }
  function draw() {
    ctx.clearRect(0, 0, w, h);
    for (const b of items) {
      b.y -= b.v;
      b.r += b.rv;
      if (b.y < -b.s) { b.y = h + b.s; b.x = Math.random() * w; }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s);
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = "#fff";
      ctx.fillRect(-b.s / 2, -b.s / 2, b.s, b.s / 4);
      ctx.restore();
    }
    requestAnimationFrame(draw);
  }
  window.addEventListener("resize", resize);
  resize();
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) draw();
})();
