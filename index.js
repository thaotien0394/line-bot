const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================
// 🔐 CONFIG
// ==========================
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ==========================
// 📦 QUEUE SYSTEM
// ==========================
let queue = [];
let running = 0;
let MAX_CONCURRENT = 2;

// ==========================
// 🧠 AUTO SCALE
// ==========================
function autoScale() {
  const q = queue.length;

  if (q > 20) MAX_CONCURRENT = 4;
  else if (q > 10) MAX_CONCURRENT = 3;
  else if (q > 5) MAX_CONCURRENT = 2;
  else MAX_CONCURRENT = 1;
}

// ==========================
// 🧠 DETECT IMAGE INTENT
// ==========================
function isImageRequest(text = "") {
  const t = text.toLowerCase();

  const keywords = [
    "vẽ", "tạo ảnh", "render", "draw",
    "anime", "chibi", "ảnh", "hình"
  ];

  return keywords.some(k => t.includes(k));
}

// ==========================
// 🎨 IMAGE URL (FREE + KHÔNG LỖI)
// ==========================
function generateImageUrl(prompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux`;
}

// ==========================
// 📩 REPLY LINE (1 LẦN)
// ==========================
async function replyLine(token, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken: token,
      messages
    },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ==========================
// 📩 PUSH LINE (CHO ẢNH)
// ==========================
async function pushLine(userId, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    {
      to: userId,
      messages
    },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ==========================
// 📥 ADD QUEUE
// ==========================
function addQueue(job) {
  queue.push(job);
  autoScale();
  processQueue();
}

// ==========================
// ⚙️ PROCESS QUEUE
// ==========================
async function processQueue() {
  if (running >= MAX_CONCURRENT) return;
  if (queue.length === 0) return;

  const job = queue.shift();
  running++;

  try {
    await handleImageJob(job);
  } catch (e) {
    console.log("JOB ERROR:", e.message);
  }

  running--;
  processQueue();
}

// ==========================
// 🎯 HANDLE IMAGE JOB
// ==========================
async function handleImageJob(job) {
  const { prompt, userId } = job;

  const url = generateImageUrl(prompt);

  // 👉 CHỈ GỬI ẢNH (KHÔNG TEXT)
  await pushLine(userId, [
    {
      type: "image",
      originalContentUrl: url,
      previewImageUrl: url
    }
  ]);
}

// ==========================
// 🧠 AI CHAT (FALLBACK TEXT)
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
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
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
// 🧠 FORMAT TEXT
// ==========================
function formatText(text = "") {
  return text
    .replace(/\*/g, "")
    .replace(/##/g, "")
    .trim();
}

// ==========================
// 🔗 WEBHOOK
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

      // ==========================
      // 🎨 IMAGE MODE
      // ==========================
      if (isImageRequest(text)) {
        // ❗ chỉ reply 1 lần (tránh lỗi)
        await replyLine(replyToken, [
          {
            type: "text",
            text: "🎨 Đang tạo ảnh..."
          }
        ]);

        addQueue({
          prompt: text,
          userId
        });

        continue;
      }

      // ==========================
      // 💬 CHAT MODE
      // ==========================
      const ai = await askAI(text);

      await replyLine(replyToken, [
        {
          type: "text",
          text: formatText(ai)
        }
      ]);

    } catch (err) {
      console.log("WEBHOOK ERROR:", err.message);
    }
  }
});

// ==========================
// 🚀 START SERVER
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 V19 FINAL PRO SYSTEM RUNNING");
});