const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔐 ENV
const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GROQ_KEY = process.env.GROQ_API_KEY;
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

// 🔍 CHECK
console.log("GROQ:", GROQ_KEY ? "OK" : "MISSING");
console.log("OPENROUTER:", OPENROUTER_KEY ? "OK" : "MISSING");

// ==========================
// 🤖 GROQ (AI CHÍNH)
// ==========================
async function askGroq(text) {
  const res = await axios.post(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      model: "llama3-70b-8192",
      messages: [
        {
          role: "system",
          content: `
Bạn là nhân viên tư vấn bán hàng chuyên nghiệp.

Luôn:
- Hỏi lại nhu cầu
- Gợi ý sản phẩm
- Nói ngắn gọn dễ hiểu

QUAN TRỌNG:
Luôn thêm dòng cuối:
IMAGE_PROMPT: mô tả sản phẩm bằng tiếng Anh để tạo ảnh đẹp

Ví dụ:
gaming laptop RGB, neon lighting, ultra realistic, 4k
`
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
// 🔁 OPENROUTER (BACKUP)
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
      return "⚠️ AI đang bận, thử lại sau";
    }
  }
}

// ==========================
// 🎨 TẠO ẢNH
// ==========================
function generateImage(prompt) {
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`;
}

// ==========================
// 📩 GỬI LINE
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
      }
    }
  );
}

// ==========================
// 🔗 WEBHOOK
// ==========================
app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      const text = event.message.text;
      const replyToken = event.replyToken;

      console.log("👤 User:", text);

      let aiText = await askAI(text);

      // 🎯 TÁCH IMAGE PROMPT
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

      // 🎨 AUTO ẢNH
      if (imagePrompt) {
        const img = generateImage(imagePrompt);

        messages.push({
          type: "image",
          originalContentUrl: img,
          previewImageUrl: img
        });
      }

      await replyLine(replyToken, messages);
    }
  }

  res.sendStatus(200);
});

// ==========================
// 🚀 START SERVER
// ==========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server chạy port " + PORT);
});