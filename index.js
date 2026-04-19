
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
// 🌐 TAVILY REALTIME SEARCH
// =========================
async function webSearch(query) {
  try {
    const res = await axios.post(
      "https://api.tavily.com/search",
      {
        api_key: process.env.TAVILY_KEY,
        query: query,
        search_depth: "advanced",
        include_answer: true,
        max_results: 3
      }
    );

    return (
      res.data.answer ||
      res.data.results?.map(r => r.content).join("\n") ||
      ""
    );
  } catch (err) {
    console.log("Tavily error:", err.message);
    return "";
  }
}

// =========================
// ⚡ GROQ AI (FAST)
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
// 🧠 OPENROUTER AI (DEEP + REALTIME)
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
Bạn là AI realtime 2026.
Chỉ dùng dữ liệu dưới đây, KHÔNG dùng kiến thức cũ:

===== REALTIME DATA =====
${context}
=========================
          `
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
// 🤖 AI ENGINE (V64 ROUTER)
// =========================
async function AI_ENGINE(message) {

  const liveData = await webSearch(message);

  // ⚡ câu ngắn → Groq
  if (message.length < 120) {
    try {
      return await groqAI(message);
    } catch {}
  }

  // 🧠 câu dài / phức → OpenRouter + realtime
  return await openrouterAI(message, liveData);
}

// =========================
// 🔥 HANDLE MESSAGE (SILENT BLOCK)
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

    // 🚫 nếu bị block → im lặng
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
  console.log("🚀 V64 REALTIME AI RUNNING");
});