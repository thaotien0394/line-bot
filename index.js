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
const CLOUDINARY_URL = process.env.CLOUDINARY_URL || "";
const CLOUDINARY_UPLOAD_PRESET = process.env.CLOUDINARY_UPLOAD_PRESET || "";

/* =========================
   🚀 LOG HELPER (DEBUG FULL)
========================= */
function logError(source, err) {
  console.log("====================");
  console.log("❌ ERROR SOURCE:", source);

  if (err?.response) {
    console.log("STATUS:", err.response.status);
    console.log("DATA:", err.response.data);
  } else {
    console.log("MESSAGE:", err.message);
  }

  console.log("====================");
}

function logInfo(title, data) {
  console.log("🧠", title, data);
}

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
   ⚡ RATE LIMIT
========================= */
const userTime = new Map();
function rateLimit(userId) {
  const now = Date.now();
  const last = userTime.get(userId) || 0;
  if (now - last < 900) return false;
  userTime.set(userId, now);
  return true;
}

/* =========================
   🧠 AI PROVIDERS (AUTO SWITCH)
========================= */
async function openRouter(text, system) {
  try {
    if (!OPENROUTER_KEY) throw new Error("Missing OPENROUTER_KEY");

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
    logError("OPENROUTER", err);
    return null;
  }
}

async function huggingFace(text) {
  try {
    if (!HF_KEY) throw new Error("Missing HF_KEY");

    const res = await axios.post(
      "https://api-inference.huggingface.co/models/HuggingFaceH4/zephyr-7b-beta",
      { inputs: text },
      { headers: { Authorization: `Bearer ${HF_KEY}` }, timeout: 15000 }
    );

    return res.data?.[0]?.generated_text || null;

  } catch (err) {
    logError("HUGGINGFACE", err);
    return null;
  }
}

async function simpleFallback(text) {
  logInfo("FALLBACK_SIMPLE", text);
  return "🤖 Hệ thống đang quá tải, vui lòng thử lại sau";
}

/* =========================
   🧠 AI ROUTER (SMART SWITCH)
========================= */
async function aiRouter(userId, text) {
  const mem = getMemory(userId);

  const system = `AI LOGIC MODE:\n- ngắn gọn\n- đúng trọng tâm\n- suy luận rõ ràng\nHistory: ${JSON.stringify(mem.history.slice(-5))}`;

  logInfo("AI REQUEST", { userId, text });

  let result = await openRouter(text, system);

  if (!result) {
    logInfo("SWITCH TO HF", "OpenRouter failed");
    result = await huggingFace(text);
  }

  if (!result) {
    logInfo("SWITCH TO SIMPLE", "HF failed");
    result = await simpleFallback(text);
  }

  return `🧠 Ý chính:\n➡️ ${result}\n\n💡 Tóm tắt:\n- logic rõ ràng\n- dễ hiểu`;
}

/* =========================
   🌐 SEARCH
========================= */
async function search(query) {
  try {
    if (!SERP_API_KEY) return "No key";

    const res = await axios.get("https://serpapi.com/search", {
      params: { q: query, api_key: SERP_API_KEY }
    });

    return res.data?.organic_results?.[0]?.snippet || "No result";

  } catch (err) {
    logError("SEARCH", err);
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
  } catch (err) {
    logError("NEWS", err);
    return "News error";
  }
}

/* =========================
   🎨 IMAGE (SAFE)
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

    if (!CLOUDINARY_URL) return `data:image/png;base64,${base64}`;

    const form = new FormData();
    form.append("file", `data:image/png;base64,${base64}`);
    if (CLOUDINARY_UPLOAD_PRESET) form.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    const upload = await axios.post(CLOUDINARY_URL, form, {
      headers: form.getHeaders()
    });

    return upload.data?.secure_url || `data:image/png;base64,${base64}`;

  } catch (err) {
    logError("IMAGE", err);
    return null;
  }
}

/* =========================
   ⚙️ HANDLE
========================= */
async function handle(userId, text) {
  if (!rateLimit(userId)) return "⛔ Spam detected";

  const t = text.toLowerCase();

  if (t.includes("vẽ") || t.includes("ảnh")) return { type: "image", data: await image(text) };
  if (t.includes("tin")) return await news();
  if (t.includes("tìm")) return await search(text);

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

    if (typeof result === "object" && result.type === "image") {
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
    logError("WEBHOOK", err);
  }
});

/* =========================
   🚀 START
========================= */
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 V45/V46 DEBUG STABLE AI RUNNING");
});
