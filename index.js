const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

/* =========================
   🔑 API KEYS
========================= */
const OPENROUTER_KEY = process.env.OPENROUTER_KEY;
const HF_KEY = process.env.HF_KEY;
const STABILITY_KEY = process.env.STABILITY_KEY;
const REPLICATE_KEY = process.env.REPLICATE_KEY;
const CHANNEL_TOKEN = process.env.CHANNEL_TOKEN;

/* =========================
   🧠 MEMORY CACHE (IN-MEMORY SIMPLE)
========================= */
const cache = new Map();

/* =========================
   🚫 BLOCKLIST (EXACT MATCH ONLY)
========================= */
const BLOCKED = [
  "RS","CTKM","8NTTT","HD","MT","BOT",
  "LAPTOP","MÙA NÓNG","CAMERA","PV",
  "BB","TRACHAM","KEY"
];

function normalize(text) {
  return (text || "")
    .toUpperCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBlocked(text) {
  const words = normalize(text).split(" ");
  return BLOCKED.some(b => words.includes(b));
}

/* =========================
   🚦 ANTI-SPAM QUEUE
========================= */
const userQueue = new Map();

function rateLimit(userId) {
  const now = Date.now();
  const last = userQueue.get(userId) || 0;

  if (now - last < 2000) {
    return false; // spam
  }

  userQueue.set(userId, now);
  return true;
}

/* =========================
   🤖 OPENROUTER AI (CACHE + RETRY)
========================= */
async function askAI(prompt) {

  if (cache.has(prompt)) {
    return cache.get(prompt);
  }

  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "mistralai/mistral-7b-instruct",
        messages: [
          { role: "system", content: "Bạn là AI công nghệ thông minh, phân tích chính xác." },
          { role: "user", content: prompt }
        ]
      },
      {
        headers: { Authorization: `Bearer ${OPENROUTER_KEY}` },
        timeout: 15000
      }
    );

    const result = res.data.choices?.[0]?.message?.content || "❌ AI lỗi";

    cache.set(prompt, result); // cache result
    return result;

  } catch (e) {
    return "❌ AI đang bận";
  }
}

/* =========================
   🎨 MULTI IMAGE AI LAYER
========================= */
async function hfImage(prompt) {
  try {
    const res = await axios.post(
      "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
      { inputs: prompt },
      {
        headers: { Authorization: `Bearer ${HF_KEY}` },
        responseType: "arraybuffer"
      }
    );

    return Buffer.from(res.data).toString("base64");
  } catch {
    return null;
  }
}

async function stabilityImage(prompt) {
  try {
    const res = await axios.post(
      "https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image",
      {
        text_prompts: [{ text: prompt }],
        cfg_scale: 7,
        height: 1024,
        width: 1024
      },
      {
        headers: {
          Authorization: `Bearer ${STABILITY_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data?.artifacts?.[0]?.base64 || null;
  } catch {
    return null;
  }
}

async function replicateImage(prompt) {
  try {
    const res = await axios.post(
      "https://api.replicate.com/v1/predictions",
      {
        version: "stability-ai/sdxl",
        input: { prompt }
      },
      {
        headers: {
          Authorization: `Token ${REPLICATE_KEY}`
        }
      }
    );

    return res.data?.output?.[0] || null;
  } catch {
    return null;
  }
}

/* =========================
   🎨 IMAGE ROUTER (MULTI LAYER FALLBACK)
========================= */
async function generateImage(prompt) {

  let img = await hfImage(prompt);
  if (img) return img;

  img = await stabilityImage(prompt);
  if (img) return img;

  img = await replicateImage(prompt);
  if (img) return img;

  return null;
}

/* =========================
   🧠 INTENT ENGINE
========================= */
function classifyIntent(text) {
  const t = (text || "").toLowerCase();

  if (t.includes("vẽ") || t.includes("ảnh")) return "IMAGE";
  if (t.includes("so sánh") || t.includes("giá") || t.includes("mua")) return "TECH";

  return "CHAT";
}

/* =========================
   🚀 CORE PROCESSOR
========================= */
async function handleUser(userId, text) {

  if (!text) return "❌ Không có dữ liệu";

  if (!rateLimit(userId)) {
    return "⛔ Bạn gửi quá nhanh, vui lòng chờ 2 giây";
  }

  if (isBlocked(text)) {
    return "❌ Nội dung không được hỗ trợ";
  }

  const intent = classifyIntent(text);

  // 🎨 IMAGE
  if (intent === "IMAGE") {
    const img = await generateImage(text);
    if (!img) return "❌ Không tạo được ảnh";

    return {
      type: "image",
      data: img
    };
  }

  // 🧠 AI TEXT
  return await askAI(text);
}

/* =========================
   🌐 LINE WEBHOOK (ZERO 502 SAFE)
========================= */
app.post("/webhook", async (req, res) => {
  try {

    const event = req.body.events?.[0];
    const text = event?.message?.text;
    const userId = event?.source?.userId;
    const replyToken = event?.replyToken;

    if (!text || !replyToken) {
      return res.sendStatus(200);
    }

    const result = await handleUser(userId, text);

    let message;

    if (typeof result === "object" && result.type === "image") {
      message = {
        type: "image",
        originalContentUrl: `data:image/png;base64,${result.data}`,
        previewImageUrl: `data:image/png;base64,${result.data}`
      };
    } else {
      message = {
        type: "text",
        text: result
      };
    }

    await axios.post(
      "https://api.line.me/v2/bot/message/reply",
      {
        replyToken,
        messages: [message]
      },
      {
        headers: {
          Authorization: `Bearer ${CHANNEL_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.sendStatus(200);

  } catch (e) {
    console.log("WEBHOOK ERROR:", e.message);
    return res.sendStatus(200); // ALWAYS SAFE
  }
});

/* ========================= */
app.listen(3000, () => {
  console.log("🚀 V40 PRODUCTION SYSTEM RUNNING");
});