const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================
// 🔐 ENV
// ==========================
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// ==========================
// 🧠 MEMORY USER
// ==========================
let userMemory = {};

// ==========================
// 📦 QUEUE
// ==========================
let queue = [];
let running = 0;
let MAX = 2;

// ==========================
// ⚡ AUTO SCALE
// ==========================
function autoScale() {
  if (queue.length > 10) MAX = 3;
  else if (queue.length > 5) MAX = 2;
  else MAX = 1;
}

// ==========================
// 🧠 ANALYZE INTENT
// ==========================
function analyzeIntent(text = "") {
  const t = text.toLowerCase().trim();

  let scoreImage = 0;
  let scoreChat = 0;

  const imageSignals = [
    "vẽ", "render", "tạo", "draw", "generate",
    "anime", "chibi", "3d", "ảnh", "hình"
  ];

  const chatSignals = [
    "là gì", "tại sao", "bao nhiêu",
    "cách", "hướng dẫn", "tư vấn", "?"
  ];

  imageSignals.forEach(k => {
    if (t.includes(k)) scoreImage += 2;
  });

  chatSignals.forEach(k => {
    if (t.includes(k)) scoreChat += 2;
  });

  if (t.split(" ").length <= 5) scoreImage += 1;
  if (t.split(" ").length > 8) scoreChat += 1;

  const diff = scoreImage - scoreChat;

  if (diff >= 2) return "IMAGE";
  if (diff <= -2) return "CHAT";

  return "AMBIGUOUS";
}

// ==========================
// 🧠 DECIDE WITH MEMORY
// ==========================
function decideIntent(userId, text) {
  const base = analyzeIntent(text);

  if (base !== "AMBIGUOUS") {
    userMemory[userId] = base;
    return base;
  }

  if (userMemory[userId]) {
    return userMemory[userId];
  }

  if (text.length < 20) return "IMAGE";

  return "ASK";
}

// ==========================
// 🎨 IMAGE URL
// ==========================
function imageUrl(prompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux`;
}

// ==========================
// 📩 LINE API
// ==========================
async function replyLine(token, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken: token, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

async function pushLine(userId, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    { to: userId, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ==========================
// 💬 AI CHAT
// ==========================
async function askAI(text) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat",
        messages: [{ role: "user", content: text }]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return res.data.choices[0].message.content;
  } catch (e) {
    return "⚠️ AI đang bận";
  }
}

// ==========================
// 🧹 FORMAT TEXT
// ==========================
function formatText(text = "") {
  return text
    .replace(/\*/g, "")
    .replace(/##/g, "")
    .trim();
}

// ==========================
// 📦 QUEUE SYSTEM
// ==========================
function addQueue(job) {
  queue.push(job);
  autoScale();
  processQueue();
}

async function processQueue() {
  if (running >= MAX || queue.length === 0) return;

  const job = queue.shift();
  running++;

  try {
    const url = imageUrl(job.prompt);

    await pushLine(job.userId, [
      {
        type: "image",
        originalContentUrl: url,
        previewImageUrl: url
      }
    ]);

  } catch (e) {
    await pushLine(job.userId, [
      { type: "text", text: "⚠️ Lỗi tạo ảnh" }
    ]);
  }

  running--;
  processQueue();
}

// ==========================
// 🚀 WEBHOOK
// ==========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  for (const event of req.body.events || []) {
    try {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      const text = event.message.text;
      const replyToken = event.replyToken;
      const userId = event.source.userId;

      console.log("USER:", text);

      const intent = decideIntent(userId, text);

      console.log("🧠 INTENT:", intent);

      // ==========================
      // 🎨 IMAGE
      // ==========================
      if (intent === "IMAGE") {
        await replyLine(replyToken, [
          { type: "text", text: "🎨 Đang tạo ảnh..." }
        ]);

        addQueue({
          prompt: text,
          userId
        });

        continue;
      }

      // ==========================
      // 💬 CHAT
      // ==========================
      if (intent === "CHAT") {
        const ai = await askAI(text);

        await replyLine(replyToken, [
          { type: "text", text: formatText(ai) }
        ]);

        continue;
      }

      // ==========================
      // ⚠️ ASK (MƠ HỒ)
      // ==========================
      if (intent === "ASK") {
        await replyLine(replyToken, [
          {
            type: "text",
            text: "🤖 Bạn muốn mình tạo ảnh hay giải thích?"
          }
        ]);

        continue;
      }

    } catch (err) {
      console.log("ERROR:", err.message);
    }
  }
});

// ==========================
// 🚀 START SERVER
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 V21 HUMAN AI RUNNING");
});