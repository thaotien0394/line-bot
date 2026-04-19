
const express = require("express");
const axios = require("axios");
const line = require("@line/bot-sdk");

const app = express();
app.use(express.json());

// =========================
// 🔐 LINE CONFIG
// =========================
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.Client(config);

// =========================
// 🚫 BLOCKLIST (SILENT)
// =========================
const BLOCKLIST = new Set([
  "KEY","RS","CTKM","MT","HD","BOT",
  "LAPTOP","MÙA NÓNG","PV","8NTTT",
  "TRACHAM","BB","CAMERA"
]);

function normalize(text) {
  return text
    .toString()
    .normalize("NFC")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function isBlocked(text) {
  return BLOCKLIST.has(normalize(text));
}

// =========================
// 🧹 LINE TEXT FIX
// =========================
function cleanText(text) {
  return text
    .toString()
    .normalize("NFC")
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/#{1,6}\s?/g, "")
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .trim();
}

// =========================
// 📦 CACHE (10 phút)
// =========================
const cache = new Map();

function getCache(key) {
  const data = cache.get(key);
  if (!data) return null;
  if (Date.now() - data.time > 600000) return null;
  return data.value;
}

function setCache(key, value) {
  cache.set(key, { value, time: Date.now() });
}

// =========================
// 🌐 TAVILY REALTIME SEARCH
// =========================
async function webSearch(query) {
  try {
    const res = await axios.post("https://api.tavily.com/search", {
      api_key: process.env.TAVILY_KEY,
      query,
      search_depth: "advanced",
      include_answer: true,
      max_results: 3
    });

    return res.data.answer || "";
  } catch {
    return "";
  }
}

// =========================
// 📰 NEWSDATA
// =========================
async function getNews(query) {
  try {
    const res = await axios.get(
      `https://newsdata.io/api/1/news?apikey=${process.env.NEWSDATA_KEY}&q=${query}&language=vi`
    );

    return res.data.results?.slice(0, 3)
      .map(n => `${n.title}`)
      .join("\n") || "";
  } catch {
    return "";
  }
}

// =========================
// 🎨 STABILITY AI (IMAGE)
// =========================
async function generateImage(prompt) {
  try {
    const res = await axios.post(
      "https://api.stability.ai/v1/generation/stable-diffusion-v1-6/text-to-image",
      {
        text_prompts: [{ text: prompt }],
        cfg_scale: 7,
        steps: 30
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.STABILITY_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data;
  } catch {
    return null;
  }
}

// =========================
// ⚡ GROQ (FAST AI)
// =========================
async function groqAI(message) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192",
      messages: [{ role: "user", content: message }]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.GROQ_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.choices[0].message.content;
}

// =========================
// 🧠 OPENROUTER (DEEP AI)
// =========================
async function openrouterAI(message, context) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
AI ULTRA 2026.

QUY TẮC:
- chỉ dùng dữ liệu realtime
- không bịa
- trả lời đúng ngữ cảnh

DATA:
${context}
          `
        },
        { role: "user", content: message }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.choices[0].message.content;
}

// =========================
// 🧠 INTENT ENGINE
// =========================
function detectIntent(text) {
  const t = text.toLowerCase();

  if (t.includes("tin")) return "NEWS";
  if (t.includes("vẽ")) return "IMAGE";
  if (t.includes("so sánh")) return "COMPARE";
  if (t.includes("giá")) return "PRICE";

  return "CHAT";
}

// =========================
// 🤖 AI ROUTER CORE
// =========================
async function AI_ENGINE(message) {

  const cached = getCache(message);
  if (cached) return cached;

  const intent = detectIntent(message);

  // 📰 NEWS MODE
  if (intent === "NEWS") {
    const news = await getNews(message);
    return cleanText(news);
  }

  // 🎨 IMAGE MODE
  if (intent === "IMAGE") {
    await generateImage(message);
    return "🎨 Đã tạo hình ảnh xong";
  }

  // 🌐 REALTIME SEARCH
  const liveData = await webSearch(message);

  let result;

  // ⚡ FAST
  if (message.length < 100) {
    try {
      result = await groqAI(message);
    } catch {
      result = await openrouterAI(message, liveData);
    }
  } else {
    result = await openrouterAI(message, liveData);
  }

  setCache(message, result);

  return cleanText(result);
}

// =========================
// 🚫 SILENT BLOCK HANDLER
// =========================
async function handleMessage(text) {
  if (isBlocked(text)) return null;
  return await AI_ENGINE(text);
}

// =========================
// 🌐 LINE WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  const events = req.body.events;

  for (let event of events) {
    if (event.type !== "message") continue;

    const text = event.message.text;

    const reply = await handleMessage(text);

    if (!reply) continue;

    await client.replyMessage(event.replyToken, {
      type: "text",
      text: cleanText(reply)
    });
  }

  res.sendStatus(200);
});

// =========================
// 🚀 START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 V66 ULTRA AI PLATFORM RUNNING");
});