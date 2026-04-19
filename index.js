
const express = require("express");
const axios = require("axios");
const line = require("@line/bot-sdk");

const app = express();
app.use(express.json());

// =========================
// 🔐 LINE CONFIG (FIXED)
// =========================
const config = {
  channelAccessToken: process.env.LINE_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET
};

// 👉 CHECK ENV (DEBUG)
console.log("TOKEN:", process.env.LINE_ACCESS_TOKEN);
console.log("SECRET:", process.env.LINE_CHANNEL_SECRET);

// 👉 CREATE CLIENT
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
// 🤖 SIMPLE AI (OPENROUTER EXAMPLE)
// =========================
async function askAI(text) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "openai/gpt-4o-mini",
        messages: [{ role: "user", content: text }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data.choices[0].message.content;

  } catch (err) {
    console.log("AI ERROR:", err.response?.data || err.message);
    return "AI đang lỗi, thử lại sau.";
  }
}

// =========================
// 🔥 HANDLE MESSAGE
// =========================
async function handleMessage(text) {

  // 🚫 BLOCK CHECK
  if (isBlocked(text)) {
    return "⛔ Nội dung bị chặn";
  }

  // 🤖 AI RESPONSE
  return await askAI(text);
}

// =========================
// 🌐 LINE WEBHOOK
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
// 🚀 START SERVER
// =========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 BOT RUNNING ON PORT", PORT);
});