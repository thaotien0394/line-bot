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
// 🚫 KEYWORD BLOCK (KHÔNG AI TRẢ LỜI)
// ==========================
const BLOCK_KEYWORDS = [
  "rs", "ctkm", "mt", "hd", "bot", "laptop",
  "mùa nóng", "pv", "camera", "8nttt", "bb", "tracham"
];

// ==========================
// 🧠 GROQ AUTO MODEL LIST
// ==========================
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant"
];

// ==========================
// 🔍 CHECK BLOCK KEYWORD
// ==========================
function isBlocked(text) {
  const t = text.toLowerCase();
  return BLOCK_KEYWORDS.some(k => t.includes(k));
}

// ==========================
// 🧼 CLEAN TEXT
// ==========================
function cleanText(text = "") {
  return text.replace(/[*#_>`~\-]/g, "").trim();
}

// ==========================
// 📩 LINE REPLY
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
// 🤖 GROQ AUTO MODEL (SMART)
// ==========================
async function askGroq(text) {
  for (let model of GROQ_MODELS) {
    try {
      const res = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model,
          messages: [
            {
              role: "system",
              content:
                "Trả lời tiếng Việt rõ ràng, không markdown, dễ hiểu, ngắn gọn"
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

      console.log("✅ GROQ OK MODEL:", model);
      return res.data.choices[0].message.content;

    } catch (err) {
      console.log("❌ GROQ FAIL MODEL:", model);
      console.log("STATUS:", err.response?.status);
      console.log("DATA:", err.response?.data);
    }
  }

  return null;
}

// ==========================
// 🔁 OPENROUTER BACKUP
// ==========================
async function askOpenRouter(text) {
  try {
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
        }
      }
    );

    return res.data.choices[0].message.content;
  } catch (err) {
    console.log("❌ OPENROUTER FAIL:", err.response?.data);
    return null;
  }
}

// ==========================
// 🤖 AI ROUTER (FULL SAFE)
// ==========================
async function askAI(text) {
  let groq = await askGroq(text);

  if (groq) return groq;

  console.log("🔁 SWITCH → OPENROUTER");

  let or = await askOpenRouter(text);

  if (or) return or;

  return "⚠️ Hệ thống AI đang quá tải, vui lòng thử lại sau.";
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
      const replyToken = event.replyToken;

      console.log("USER:", text);

      // ==========================
      // 🚫 BLOCK KEYWORDS → KHÔNG AI
      // ==========================
      if (isBlocked(text)) {
        console.log("🚫 BLOCKED KEYWORD → NO AI RESPONSE");
        continue; // ❌ không trả lời luôn
      }

      // ==========================
      // 🤖 AI MODE
      // ==========================
      let aiText = await askAI(text);

      aiText = cleanText(aiText);

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
  console.log("🚀 AUTO MODEL BOT PRO RUNNING:", PORT);
});