
// =========================
// 📦 IMPORTS
// =========================
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// =========================
// 🔐 LINE CONFIG
// =========================
const line = require("@line/bot-sdk");

const config = {
  channelSecret: process.env.CHANNEL_SECRET,
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN
};

const client = new line.Client(config);

// =========================
// 🚫 BLOCKLIST
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
// 🌐 1. DUCKDUCKGO (SEARCH REALTIME)
// =========================
async function duckduckgoAI(query) {
  const res = await axios.get(
    `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json`
  );

  return res.data.AbstractText || res.data.RelatedTopics?.[0]?.Text || null;
}

// =========================
// ⚡ 2. GROQ AI (FAST REASONING)
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
// 🧠 3. OPENROUTER AI (FALLBACK DEEP AI)
// =========================
async function openrouterAI(message) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "openai/gpt-4o-mini",
      messages: [{ role: "user", content: message }]
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
// 🤖 AI ROUTER (CHIA NHIỆM VỤ)
// =========================
async function AI_ENGINE(message) {
  try {

    // 1. DUCKDUCKGO → TIN TỨC / DỮ LIỆU MỚI
    if (message.includes("TIN") || message.includes("NEWS") || message.includes("WHAT")) {
      const ddg = await duckduckgoAI(message);
      if (ddg) return "🌐 DuckDuckGo:\n" + ddg;
    }

    // 2. GROQ → LOGIC / CHAT NHANH
    if (message.length < 200) {
      try {
        return await groqAI(message);
      } catch (e) {
        console.log("Groq fail → fallback");
      }
    }

    // 3. OPENROUTER → AI MẠNH (FALLBACK CUỐI)
    return await openrouterAI(message);

  } catch (err) {
    console.log("ALL AI FAILED:", err.message);
    return "⚠️ AI đang quá tải, thử lại sau.";
  }
}

// =========================
// 🔥 MAIN HANDLER
// =========================
async function handleMessage(text) {

  // 🚫 BLOCK
  if (isBlocked(text)) {
    return "⛔ Nội dung bị chặn";
  }

  // 🤖 AI PROCESS
  return await AI_ENGINE(text);
}

// =========================
// 🌐 WEBHOOK LINE
// =========================
app.post("/webhook", async (req, res) => {
  const events = req.body.events;

  for (let event of events) {
    if (event.type !== "message") continue;

    const userText = event.message.text;

    const reply = await handleMessage(userText);

    await client.replyMessage(event.replyToken, {
      type: "text",
      text: reply
    });
  }

  res.sendStatus(200);
});

// =========================
// 🚀 SERVER START
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 V60 BOT RUNNING ON PORT", PORT);
});