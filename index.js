const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// 🔐 ENV
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!CHANNEL_ACCESS_TOKEN || !GEMINI_API_KEY) {
  console.error("❌ Thiếu ENV!");
}

// 🧠 Gọi Gemini (đã fix đúng API + model)
async function askGemini(prompt) {
  try {
    const res = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              {
                text: `Trả lời ngắn gọn, dễ hiểu bằng tiếng Việt:\n${prompt}`,
              },
            ],
          },
        ],
      }
    );

    return res.data.candidates?.[0]?.content?.parts?.[0]?.text || "Không có phản hồi 😢";
  } catch (err) {
    console.error("❌ Gemini error:", err.response?.data || err.message);
    return "AI đang bận 😢";
  }
}

// 📩 Webhook LINE
app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];

  await Promise.all(
    events.map(async (event) => {
      try {
        if (event.type === "message" && event.message.type === "text") {
          const replyToken = event.replyToken;
          const userMessage = event.message.text;

          console.log("📩 User:", userMessage);

          // 🛑 chống spam nhẹ
          await new Promise((r) => setTimeout(r, 800));

          const replyText = await askGemini(userMessage);

          await axios.post(
            "https://api.line.me/v2/bot/message/reply",
            {
              replyToken,
              messages: [
                {
                  type: "text",
                  text: replyText.substring(0, 1000), // tránh quá dài lỗi LINE
                },
              ],
            },
            {
              headers: {
                Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
                "Content-Type": "application/json",
              },
            }
          );
        }
      } catch (err) {
        console.error("❌ LINE error:", err.response?.data || err.message);
      }
    })
  );

  res.sendStatus(200);
});

// 🌐 Route test
app.get("/", (req, res) => {
  res.send("✅ Gemini LINE Bot đang chạy!");
});

// 🚀 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});