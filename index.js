const axios = require("axios");

// ==========================
// 🔐 CONFIG
// ==========================
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY;

// ==========================
// 🧠 AI CHAT (GROQ / OPENROUTER)
// ==========================
async function askAI(text) {
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-70b-versatile",
        messages: [
          { role: "system", content: "Bạn là trợ lý AI thông minh, trả lời tiếng Việt rõ ràng." },
          { role: "user", content: text }
        ]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`
        }
      }
    );

    return res.data.choices[0].message.content;
  } catch (e) {
    // fallback OpenRouter
    const res = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "deepseek/deepseek-chat",
        messages: [{ role: "user", content: text }]
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`
        }
      }
    );

    return res.data.choices[0].message.content;
  }
}

// ==========================
// 🎨 IMAGE ENGINE
// ==========================
async function generateImage(prompt) {
  const res = await axios.post(
    "https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0",
    { inputs: prompt },
    {
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`
      },
      responseType: "arraybuffer",
      timeout: 30000
    }
  );

  return Buffer.from(res.data, "binary");
}

// ==========================
// 🧠 MULTI ACTION PARSER
// ==========================
function parseMultiAction(text) {
  const t = text.toLowerCase();

  let actions = {
    chat: null,
    image: null
  };

  // 🎨 IMAGE DETECT
  const imageKeywords = ["vẽ", "render", "tạo ảnh", "draw", "anime", "chibi"];

  const hasImage = imageKeywords.some(k => t.includes(k));

  if (hasImage) {
    actions.image = text;
  }

  // 💬 CHAT ALWAYS EXTRACT MAIN IDEA
  actions.chat = text;

  return actions;
}

// ==========================
// 🧠 CLEAN TEXT
// ==========================
function formatText(text = "") {
  return text
    .replace(/\*/g, "")
    .replace(/##/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ==========================
// 📩 LINE REPLY
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

// ==========================
// 🚀 HANDLE MULTI ACTION
// ==========================
async function handleMessage(event) {
  const text = event.message?.text;
  const replyToken = event.replyToken;

  if (!text) return;

  const actions = parseMultiAction(text);

  console.log("🧠 ACTIONS:", actions);

  let messages = [];

  // ==========================
  // 💬 CHAT
  // ==========================
  if (actions.chat) {
    try {
      const ai = await askAI(actions.chat);

      messages.push({
        type: "text",
        text: formatText(ai)
      });
    } catch (e) {
      messages.push({
        type: "text",
        text: "⚠️ AI chat lỗi"
      });
    }
  }

  // ==========================
  // 🎨 IMAGE (QUEUE SAFE)
  // ==========================
  if (actions.image) {
    messages.push({
      type: "text",
      text: "🎨 Đang tạo ảnh..."
    });

    // chạy async không block chat
    generateImage(actions.image)
      .then(img => {
        const base64 = img.toString("base64");
        const url = `data:image/png;base64,${base64}`;

        return replyLine(replyToken, [
          {
            type: "image",
            originalContentUrl: url,
            previewImageUrl: url
          }
        ]);
      })
      .catch(() => {
        return replyLine(replyToken, [
          { type: "text", text: "⚠️ Lỗi tạo ảnh" }
        ]);
      });
  }

  // ==========================
  // 📩 REPLY CHAT FIRST
  // ==========================
  if (messages.length > 0) {
    await replyLine(replyToken, messages);
  }
}

// ==========================
// 🔗 WEBHOOK
// ==========================
const express = require("express");
const app = express();
app.use(express.json());

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  for (const event of req.body.events || []) {
    try {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      await handleMessage(event);

    } catch (err) {
      console.log("ERROR:", err.message);
    }
  }
});

// ==========================
// 🚀 START
// ==========================
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 V18 GOD BRAIN RUNNING");
});