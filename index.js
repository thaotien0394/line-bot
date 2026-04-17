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
// 🚫 CHỐNG SPAM (20 USER)
// ==========================
const userCount = new Map();
const MAX_USERS = 20;

function checkUserLimit(userId) {
  if (!userCount.has(userId)) {
    if (userCount.size >= MAX_USERS) return false;
    userCount.set(userId, 1);
  }
  return true;
}

// ==========================
// 🤖 GROQ AI
// ==========================
async function askGroq(text) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192", // ✅ FIX MODEL MỚI
      messages: [
        {
          role: "system",
          content: "Bạn là trợ lý AI tư vấn bán hàng chuyên nghiệp, trả lời ngắn gọn, dễ hiểu."
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
// 🔁 OPENROUTER BACKUP
// ==========================
async function askOpenRouter(text) {
  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "deepseek/deepseek-chat",
      messages: [{ role: "user", content: text }],
      temperature: 0.7
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
// 🤖 AI AUTO (KHÔNG CHẾT)
// ==========================
async function askAI(text) {
  try {
    console.log("👉 Groq");
    return await askGroq(text);
  } catch (e) {
    console.log("❌ Groq lỗi → OpenRouter");

    try {
      return await askOpenRouter(text);
    } catch (e2) {
      console.log("❌ OpenRouter lỗi");
      return "⚠️ AI đang bận, vui lòng thử lại sau ít phút.";
    }
  }
}

// ==========================
// 🎨 AI TẠO ẢNH FREE
// ==========================
function generateImage(prompt) {
  // Pollinations AI (free, không cần key)
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
}

// ==========================
// 📩 GỬI LINE MESSAGE
// ==========================
async function replyLine(replyToken, messages) {
  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken,
      messages
    },
    {
      headers: {
        Authorization: `Bearer ${LINE_TOKEN}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    }
  );
}

// ==========================
// 🔗 WEBHOOK
// ==========================
app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
    try {
      if (event.type !== "message") continue;
      if (event.message.type !== "text") continue;

      const text = event.message.text;
      const replyToken = event.replyToken;
      const userId = event.source?.userId || "unknown";

      console.log("👤 User:", text);

      // 🚫 check limit
      if (!checkUserLimit(userId)) {
        await replyLine(replyToken, [
          {
            type: "text",
            text: "⚠️ Bot đã đạt giới hạn người dùng, vui lòng quay lại sau."
          }
        ]);
        continue;
      }

      // 🤖 AI
      let aiText = await askAI(text);

      // 🎯 tách ảnh
      let imagePrompt = null;

      if (aiText.includes("IMAGE_PROMPT:")) {
        const parts = aiText.split("IMAGE_PROMPT:");
        aiText = parts[0].trim();
        imagePrompt = parts[1].trim();
      }

      const messages = [
        {
          type: "text",
          text: aiText
        }
      ];

      // 🎨 tạo ảnh nếu có prompt
      if (imagePrompt) {
        const imgUrl = generateImage(imagePrompt);

        messages.push({
          type: "image",
          originalContentUrl: imgUrl,
          previewImageUrl: imgUrl
        });
      }

      await replyLine(replyToken, messages);
    } catch (err) {
      console.error("❌ WEBHOOK ERROR:", err.message);
    }
  }

  res.sendStatus(200);
});

// ==========================
// 🚀 START SERVER
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ BOT RUNNING ON PORT " + PORT);
});