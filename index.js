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
// 📌 KEYWORD DATABASE (TỪ KHÓA CỐ ĐỊNH)
// ==========================
const KEYWORDS = {
  "xin chào": "Xin chào bạn 👋 Mình có thể giúp gì cho bạn?",
  "giá điện thoại": "Giá điện thoại tùy model, bạn muốn xem hãng nào?",
  "giờ làm việc": "Cửa hàng làm việc từ 8:00 đến 21:00 mỗi ngày.",
  "địa chỉ": "Cửa hàng ở Việt Nam, bạn cần chi nhánh nào?",
  "hỗ trợ": "Mình sẵn sàng hỗ trợ bạn ngay bây giờ."
};

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
// 🤖 GROQ AI
// ==========================
async function askGroq(text) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192",
      messages: [
        {
          role: "system",
          content:
            "Trả lời tiếng Việt rõ ràng, không markdown, dễ hiểu, ngắn gọn."
        },
        { role: "user", content: text }
      ]
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  return res.data.choices[0].message.content;
}

// ==========================
// 🔁 OPENROUTER BACKUP
// ==========================
async function askOpenRouter(text) {
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
}

// ==========================
// 🤖 AI FALLBACK
// ==========================
async function askAI(text) {
  try {
    return await askGroq(text);
  } catch (e) {
    console.log("❌ Groq fail → OpenRouter");
    try {
      return await askOpenRouter(text);
    } catch (e2) {
      return "Hệ thống AI đang bận, vui lòng thử lại sau.";
    }
  }
}

// ==========================
// 🔍 CHECK KEYWORD
// ==========================
function findKeyword(text) {
  const t = text.toLowerCase().trim();

  return KEYWORDS[t] || null;
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
      // 🧠 1. CHECK KEYWORD TRƯỚC
      // ==========================
      const keywordReply = findKeyword(text);

      if (keywordReply) {
        await replyLine(replyToken, [
          {
            type: "text",
            text: keywordReply
          }
        ]);
        continue; // ❌ KHÔNG gọi AI
      }

      // ==========================
      // 🤖 2. KHÔNG CÓ KEYWORD → AI
      // ==========================
      let aiText = await askAI(text);
      aiText = cleanText(aiText);

      await replyLine(replyToken, [
        {
          type: "text",
          text: aiText
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
  console.log("🚀 KEYWORD + AI BOT RUNNING:", PORT);
});