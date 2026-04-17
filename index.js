const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ==========================
// 🔐 ENV
// ==========================
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GROQ_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// ==========================
// 🚫 BLOCK KEYWORD (NO RESPONSE)
// ==========================
const BLOCK_KEYWORDS = [
  "rs", "ctkm", "mt", "hd", "bot", "laptop",
  "mùa nóng", "pv", "camera", "8nttt", "bb", "tracham"
];

// ==========================
// 🚫 KEY EXCLUSION (NO AI + NO IMAGE + NO REPLY)
// ==========================
function isKeyBlocked(text) {
  const t = text.toLowerCase().trim();
  return t.includes("key");
}

// ==========================
// 🧠 CHECK BLOCK LIST
// ==========================
function isBlocked(text) {
  const t = text.toLowerCase();
  return BLOCK_KEYWORDS.some(k => t.includes(k));
}

// ==========================
// 🧠 IMAGE INTENT DETECT
// ==========================
function isImageIntent(text) {
  const t = text.toLowerCase();

  const strong = ["vẽ", "ảnh", "image", "tạo ảnh", "thiết kế", "draw"];
  if (strong.some(k => t.includes(k))) return true;

  const visual = ["con", "người", "cảnh", "biển", "vũ trụ", "anime", "robot", "thành phố"];
  return visual.some(k => t.includes(k));
}

// ==========================
// 🎨 IMAGE ENGINE
// ==========================
function imageEngine1(prompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
}

function imageEngine2(prompt) {
  return `https://pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux`;
}

function canvaFallback(prompt) {
  return `https://www.canva.com/templates/search/${encodeURIComponent(prompt)}/`;
}

// ==========================
// 🧠 GROQ AI
// ==========================
async function askGroq(text) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "Trả lời tiếng Việt rõ ràng, ngắn gọn, không markdown"
        },
        { role: "user", content: text }
      ],
      temperature: 0.7
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    }
  );

  return res.data.choices[0].message.content;
}

// ==========================
// 🔁 OPENROUTER AI
// ==========================
async function askOpenRouter(text) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "deepseek/deepseek-chat-v3",
      messages: [{ role: "user", content: text }]
    },
    {
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    }
  );

  return res.data.choices[0].message.content;
}

// ==========================
// 🤖 AI ROUTER
// ==========================
async function askAI(text) {
  try {
    const g = await askGroq(text);
    if (g) return g;
  } catch (e) {}

  try {
    const o = await askOpenRouter(text);
    if (o) return o;
  } catch (e2) {}

  return "⚠️ AI đang bận, thử lại sau.";
}

// ==========================
// 🎨 IMAGE SYSTEM
// ==========================
async function generateImageUltra(prompt) {
  try {
    const url1 = imageEngine1(prompt);
    await axios.get(url1, { timeout: 5000 });
    return { type: "image", url: url1 };

  } catch (e) {
    try {
      const url2 = imageEngine2(prompt);
      await axios.get(url2, { timeout: 5000 });
      return { type: "image", url: url2 };

    } catch (e2) {
      return { type: "canva", url: canvaFallback(prompt) };
    }
  }
}

// ==========================
// 📩 LINE
// ==========================
async function replyLine(replyToken, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken, messages },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      }
    }
  );
}

// ==========================
// 🔗 WEBHOOK
// ==========================
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const events = req.body.events || [];

  for (const event of events) {
    try {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      const text = event.message.text;

      console.log("USER:", text);

      // ==========================
      // 🚫 KEY EXCLUSION (CẤP CAO NHẤT)
      // ==========================
      if (isKeyBlocked(text)) {
        console.log("🚫 BLOCK KEY → SILENT");
        continue; // không phản hồi
      }

      // ==========================
      // 🚫 BLOCK LIST
      // ==========================
      if (isBlocked(text)) {
        console.log("🚫 BLOCKED → SILENT");
        continue;
      }

      // ==========================
      // 🎨 IMAGE MODE
      // ==========================
      if (isImageIntent(text)) {
        const result = await generateImageUltra(text);

        const replyToken = event.replyToken;

        if (result.type === "image") {
          await replyLine(replyToken, [
            { type: "text", text: "🎨 Đang tạo ảnh..." },
            {
              type: "image",
              originalContentUrl: result.url,
              previewImageUrl: result.url
            }
          ]);
        } else {
          await replyLine(replyToken, [
            { type: "text", text: "⚠️ Dùng Canva thay thế:" },
            { type: "text", text: result.url }
          ]);
        }

        continue;
      }

      // ==========================
      // 🤖 TEXT AI
      // ==========================
      const replyToken = event.replyToken;
      const aiText = await askAI(text);

      await replyLine(replyToken, [
        { type: "text", text: aiText }
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
  console.log("🚀 ULTRA PRO MAX SYSTEM 2.0 RUNNING:", PORT);
});