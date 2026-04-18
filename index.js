const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

/* =========================
   🔐 ENV KEYS
========================= */
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";
const HF_KEY = process.env.HF_KEY || "";
const CHANNEL_TOKEN = process.env.CHANNEL_TOKEN || "";
const SERP_API_KEY = process.env.SERP_API_KEY || "";
const NEWSDATA_KEY = process.env.NEWSDATA_KEY || "";
const CLOUDINARY_URL = process.env.CLOUDINARY_URL || "";

/* =========================
   🚫 BLOCK LIST FILTER (NO RESPONSE)
========================= */
const BLOCK_LIST = [
  "KEY",
  "RS",
  "CTKM",
  "MT",
  "HD",
  "BOT",
  "LAPTOP",
  "MÙA NÓNG",
  "PV",
  "8NTTT",
  "TRACHAM",
  "BB",
  "CAMERA"
];

function isBlocked(text) {
  if (!text) return false;
  const t = text.trim().toUpperCase();
  return BLOCK_LIST.includes(t);
}

/* =========================
   🚀 HEALTH
========================= */
app.get("/", (req, res) => res.send("V43 GOD MODE AI RUNNING"));

/* =========================
   🧠 MEMORY (USER PERSONALITY)
========================= */
const memory = new Map();

function getMemory(userId) {
  if (!memory.has(userId)) memory.set(userId, { history: [], style: "normal" });
  return memory.get(userId);
}

function updateMemory(userId, text, reply) {
  const mem = getMemory(userId);
  mem.history.push({ text, reply });
  if (mem.history.length > 20) mem.history.shift();
}

/* =========================
   ⚡ CACHE + RATE LIMIT
========================= */
const cache = new Map();
const userTime = new Map();

function rateLimit(userId) {
  const now = Date.now();
  const last = userTime.get(userId) || 0;
  if (now - last < 900) return false;
  userTime.set(userId, now);
  return true;
}

/* =========================
   🧠 MULTI AI ROUTER
========================= */
async function callOpenRouter(text, system) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          { role: "system", content: system },
          { role: "user", content: text }
        ]
      },
      { headers: { Authorization: `Bearer ${OPENROUTER_KEY}` } }
    );
    return res.data?.choices?.[0]?.message?.content;
  } catch {
    return null;
  }
}

async function aiRouter(userId, text) {
  const mem = getMemory(userId);

  const system = `
Bạn là AI GOD MODE:
- logic mạnh
- realtime
- trả lời ngắn gọn
- ưu tiên ý chính
- nhớ ngữ cảnh user
Lịch sử: ${JSON.stringify(mem.history.slice(-5))}
`;

  let result = await callOpenRouter(text, system);
  if (!result) result = "⚠️ AI fallback failed";

  return format(result);
}

/* =========================
   ✨ FORMAT OUTPUT
========================= */
function format(text) {
  return `🧠 Ý chính:\n➡️ ${text}\n\n💡 Tóm tắt:\n- Ngắn gọn\n- Dễ hiểu\n- Có logic`;
}

/* =========================
   🌐 SEARCH
========================= */
async function search(query) {
  try {
    if (!SERP_API_KEY) return "❌ No search key";
    const res = await axios.get("https://serpapi.com/search", {
      params: { q: query, api_key: SERP_API_KEY }
    });
    return res.data?.organic_results?.[0]?.snippet || "No result";
  } catch {
    return "Search error";
  }
}

/* =========================
   📰 NEWS
========================= */
async function news() {
  try {
    const res = await axios.get(`https://newsdata.io/api/1/news?apikey=${NEWSDATA_KEY}&country=vn`);
    return res.data?.results?.[0]?.title || "No news";
  } catch {
    return "News error";
  }
}

/* =========================
   🎨 IMAGE
========================= */
async function image(prompt) {
  try {
    if (!HF_KEY) return null;

    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      { inputs: prompt },
      { headers: { Authorization: `Bearer ${HF_KEY}` }, responseType: "arraybuffer" }
    );

    const base64 = Buffer.from(res.data).toString("base64");
    return `data:image/png;base64,${base64}`;

  } catch {
    return null;
  }
}

/* =========================
   🧠 INTENT
========================= */
function intent(text) {
  const t = text.toLowerCase();
  if (t.includes("vẽ") || t.includes("ảnh")) return "IMAGE";
  if (t.includes("tin")) return "NEWS";
  if (t.includes("tìm")) return "SEARCH";
  return "CHAT";
}

/* =========================
   ⚙️ HANDLER
========================= */
async function handle(userId, text) {
  if (!rateLimit(userId)) return "⛔ Spam detected";

  const type = intent(text);

  if (type === "IMAGE") return { type: "image", data: await image(text) };
  if (type === "SEARCH") return await search(text);
  if (type === "NEWS") return await news();

  return await aiRouter(userId, text);
}

/* =========================
   🌐 WEBHOOK
========================= */
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const e = req.body?.events?.[0];
    if (!e) return;

    const text = e.message?.text;
    const userId = e.source?.userId;
    const replyToken = e.replyToken;

    if (!text || !replyToken) return;

    /* 🚫 BLOCK FILTER (NO RESPONSE) */
    if (isBlocked(text)) return;

    const result = await handle(userId, text);
    let msg;

    if (typeof result === "object" && result.type === "image") {
      msg = { type: "image", originalContentUrl: result.data, previewImageUrl: result.data };
    } else {
      msg = { type: "text", text: result };
    }

    if (CHANNEL_TOKEN) {
      await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        { replyToken, messages: [msg] },
        { headers: { Authorization: `Bearer ${CHANNEL_TOKEN}` } }
      );
    }

    updateMemory(userId, text, result);

  } catch (err) {
    console.log("ERROR:", err.message);
  }
});

/* =========================
   🚀 START
========================= */
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 V43 GOD MODE RUNNING");
});
