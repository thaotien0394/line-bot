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
// 📦 QUEUE IMAGE
// ==========================
let queue = [];
let running = 0;
let MAX = 2;

function autoScale() {
  if (queue.length > 10) MAX = 3;
  else if (queue.length > 5) MAX = 2;
  else MAX = 1;
}

// ==========================
// 🧠 TRUE AI INTENT
// ==========================
async function detectIntentAI(text) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat",
        messages: [
          { role: "system", content: INTENT_PROMPT },
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const content = res.data.choices[0].message.content;

    // parse JSON an toàn
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return "CHAT";

    const json = JSON.parse(match[0]);

    if (json.intent === "IMAGE") return "IMAGE";
    return "CHAT";

  } catch (e) {
    console.log("INTENT AI ERROR:", e.message);
    return "CHAT"; // ❗ fallback an toàn
  }
}

// ==========================
// 🎨 IMAGE
// ==========================
function imageUrl(prompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux`;
}

// ==========================
// 📩 LINE
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
// 💬 CHAT AI
// ==========================
async function askAI(text) {
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat",
        messages: [
          {
            role: "system",
            content: "Trả lời tiếng Việt rõ ràng, có gạch đầu dòng, viết đẹp."
          },
          { role: "user", content: text }
        ]
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
// 🧹 FORMAT
// ==========================
function formatText(text = "") {
  return text
    .replace(/\*/g, "")
    .replace(/##/g, "")
    .trim();
}

// ==========================
// 📦 QUEUE
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

      // 🧠 AI quyết định
      const intent = await detectIntentAI(text);

      console.log("🧠 INTENT AI:", intent);

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
      const ai = await askAI(text);

      await replyLine(replyToken, [
        { type: "text", text: formatText(ai) }
      ]);

    } catch (err) {
      console.log("ERROR:", err.message);
    }
  }
});

// ==========================
// 🚀 START
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 V22 TRUE AI RUNNING");
});