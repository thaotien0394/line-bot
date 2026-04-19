
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
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isBlocked(text) {
  return BLOCKLIST.has(normalize(text));
}

// =========================
// 📦 SIMPLE CACHE (10 phút)
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
// 🌐 WEB SEARCH (REALTIME)
// =========================
async function webSearch(query) {
  try {
    const res = await axios.get(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
    );

    return (
      res.data.AbstractText ||
      res.data.RelatedTopics?.[0]?.Text ||
      ""
    );
  } catch {
    return "";
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
          content: `Bạn là AI realtime. Chỉ dùng dữ liệu sau:\n${context}`
        },
        {
          role: "user",
          content: message
        }
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
// 🧠 INTENT DETECTION
// =========================
function detectIntent(text) {
  const t = text.toLowerCase();

  if (t.includes("tin") || t.includes("news") || t.includes("hôm nay"))
    return "NEWS";

  if (t.includes("code") || t.includes("bug") || t.includes("error"))
    return "TECH";

  if (t.length < 80)
    return "FAST";

  return "DEEP";
}

// =========================
// 🤖 AI ROUTER
// =========================
async function AI_ENGINE(message) {

  const cached = getCache(message);
  if (cached) return cached;

  const intent = detectIntent(message);

  let reply = "";

  const liveData = await webSearch(message);

  if (intent === "NEWS") {
    reply = "🌐 Realtime:\n" + liveData;
  }

  else if (intent === "FAST") {
    try {
      reply = await groqAI(message);
    } catch {
      reply = await openrouterAI(message, liveData);
    }
  }

  else {
    reply = await openrouterAI(message, liveData);
  }

  setCache(message, reply);

  return reply;
}

// =========================
// 🔥 HANDLE MESSAGE
// =========================
async function handleMessage(text) {

  // 🚫 SILENT BLOCK
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
      text: reply
    });
  }

  res.sendStatus(200);
});

// =========================
// 🚀 START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 V63 AI SUPER SYSTEM RUNNING");
});