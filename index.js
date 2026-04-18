const express = require("express");
const axios = require("axios");
const FormData = require("form-data");

const app = express();
app.use(express.json({ limit: "10mb" }));

/* =========================
   🔐 ENV KEYS
========================= */
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";
const HF_KEY = process.env.HF_KEY || "";
const CHANNEL_TOKEN = process.env.CHANNEL_TOKEN || "";
const SERP_API_KEY = process.env.SERP_API_KEY || "";
const NEWSDATA_KEY = process.env.NEWSDATA_KEY || "";

// Cloudinary (FIX BASE64 → URL)
const CLOUDINARY_URL = process.env.CLOUDINARY_URL || "";
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || "";

/* =========================
   🚀 HEALTH CHECK
========================= */
app.get("/", (req, res) => res.send("V46 IMAGE FIX + STABLE AI RUNNING"));

/* =========================
   🚫 BLOCK LIST
========================= */
const BLOCK_LIST = [
  "KEY","RS","CTKM","MT","HD","BOT","LAPTOP",
  "MÙA NÓNG","PV","8NTTT","TRACHAM","BB","CAMERA"
];

function isBlocked(text) {
  if (!text) return false;
  return BLOCK_LIST.includes(text.trim().toUpperCase());
}

/* =========================
   🧠 MEMORY
========================= */
const memory = new Map();

function getMemory(userId) {
  if (!memory.has(userId)) memory.set(userId, { history: [] });
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
   🧠 OPENROUTER (RETRY)
========================= */
async function callOpenRouter(text, system, retry = 2) {
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
      { headers: { Authorization: `Bearer ${OPENROUTER_KEY}` }, timeout: 12000 }
    );

    return res.data?.choices?.[0]?.message?.content;

  } catch (err) {
    console.log("OPENROUTER ERROR:", err?.response?.data || err.message);

    if (retry > 0) return await callOpenRouter(text, system, retry - 1);

    return null;
  }
}

/* =========================
   🧠 HF FALLBACK
========================= */
async function hfFallback(text) {
  try {
    if (!HF_KEY) return null;

    const res = await axios.post(
      "https://api-inference.huggingface.co/models/google/flan-t5-base",
      { inputs: text },
      { headers: { Authorization: `Bearer ${HF_KEY}` }, timeout: 12000 }
    );

    return res.data?.[0]?.generated_text || null;
  } catch {
    return null;
  }
}

/* =========================
   🧠 AI ROUTER
========================= */
async function aiRouter(userId, text) {
  const mem = getMemory(userId);

  const system = `
AI STABLE LOGIC MODE:
- trả lời ngắn gọn
- ưu tiên ý chính
- có suy luận logic
- hiểu ngữ cảnh
Lịch sử: ${JSON.stringify(mem.history.slice(-5))}
`;

  let result = await callOpenRouter(text, system);

  if (!result) result = await hfFallback(text);

  if (!result) result = "🤖 AI tạm thời gián đoạn";

  return format(result);
}

/* =========================
   ✨ FORMAT
========================= */
function format(text) {
  return `🧠 Ý chính:\n➡️ ${text}\n\n💡 Tóm tắt:\n- Ngắn gọn\n- Dễ hiểu\n- Logic rõ ràng`;
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
   🎨 IMAGE (HF → CLOUDINARY FIX)
========================= */
async function uploadToCloudinary(base64) {
  try {
    if (!CLOUDINARY_URL) return null;

    const form = new FormData();
    form.append("file", `data:image/png;base64,${base64}`);

    if (CLOUDINARY_UPLOAD_PRESET) {
      form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    }

    const res = await axios.post(CLOUDINARY_URL, form, {
      headers: form.getHeaders()
    });

    return res.data?.secure_url || null;

  } catch (err) {
    console.log("CLOUDINARY ERROR:", err.message);
    return null;
  }
}

async function image(prompt) {
  try {
    if (!HF_KEY) return null;

    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      { inputs: prompt },
      { headers: { Authorization: `Bearer ${HF_KEY}` }, responseType: "arraybuffer" }
    );

    const base64 = Buffer.from(res.data).toString("base64");

    // FIX: convert base64 → URL
    const url = await uploadToCloudinary(base64);

    if (url) return url;

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

    if (isBlocked(text)) return;

    const result = await handle(userId, text);

    let msg;

    if (typeof result === "string" && result.startsWith("http")) {
      msg = {
        type: "image",
        originalContentUrl: result,
        previewImageUrl: result
      };
    } else if (typeof result === "object" && result.type === "image") {
      msg = {
        type: "image",
        originalContentUrl: result.data,
        previewImageUrl: result.data
      };
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
    console.log("WEBHOOK ERROR:", err.message);
  }
});

/* =========================
   🚀 START
========================= */
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 V46 IMAGE FIX RUNNING");
});
